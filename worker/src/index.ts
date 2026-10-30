/**
 * OVXA City Worker — tiny API in front of Cloudflare KV.
 *
 *   POST /api/status    bot -> city   (Authorization: Bearer <bot token>)
 *   GET  /api/state     page polls    (owner session)
 *   POST /api/decision  owner -> bot  (owner session; forwarded to the bot's webhook)
 *   POST /api/login | /api/logout | GET /api/me
 *
 * Secrets (never committed; `wrangler secret put ...`):
 *   OWNER_PASSWORD   password for the owner session
 *   SESSION_SECRET   random string used to sign session cookies
 *   BOTS             JSON: { "<botId>": { "name": "...", "token": "...", "webhook": "https://...", "webhookKey": "...", "role": "chief|router|worker" } }
 * Optional vars:
 *   ACCESS_EMAIL     if set AND the route is protected by Cloudflare Access, a matching
 *                    Cf-Access-Authenticated-User-Email header counts as an owner session.
 */
export interface Env {
  CITY_KV: KVNamespace;
  OWNER_PASSWORD?: string;
  SESSION_SECRET?: string;
  BOTS?: string;
  ACCESS_EMAIL?: string;
  ASSETS?: { fetch: (r: Request) => Promise<Response> };
}

export interface BotConfig { name: string; token: string; webhook?: string; webhookKey?: string; role?: string }
export interface PendingItem { id: string; title: string; detail?: string; kind?: string; created_at?: string }
export interface BotState {
  id: string; name: string; role: string;
  status: 'ok' | 'busy' | 'error' | 'idle';
  message?: string; pending: PendingItem[];
  updated_at: string; first_seen: string;
}

const SESSION_COOKIE = 'ovxa_session';
const SESSION_TTL = 60 * 60 * 24 * 7;
const enc = new TextEncoder();

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export function parseBots(env: Env): Record<string, BotConfig> {
  if (!env.BOTS) return {};
  try {
    const v = JSON.parse(env.BOTS);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function makeSession(env: Env, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_TTL;
  return `${exp}.${await hmac(env.SESSION_SECRET!, `owner.${exp}`)}`;
}

export async function verifySession(env: Env, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token || !env.SESSION_SECRET) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) * 1000 < now) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, `owner.${exp}`));
}

function cookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
}

export async function isOwner(req: Request, env: Env): Promise<boolean> {
  const email = req.headers.get('cf-access-authenticated-user-email');
  if (env.ACCESS_EMAIL && email && email.toLowerCase() === env.ACCESS_EMAIL.toLowerCase()) return true;
  return verifySession(env, cookie(req, SESSION_COOKIE));
}

/** Reject cross-site state-changing requests (defence in depth on top of SameSite=Strict). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients
  return origin === new URL(req.url).origin;
}

function botFromBearer(req: Request, bots: Record<string, BotConfig>): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  for (const [id, b] of Object.entries(bots)) if (b.token && safeEqual(m[1].trim(), b.token)) return id;
  return null;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

export function sanitizeStatus(body: any): Pick<BotState, 'status' | 'message' | 'pending'> | null {
  if (!body || typeof body !== 'object') return null;
  const status = ['ok', 'busy', 'error', 'idle'].includes(body.status) ? body.status : 'ok';
  const pendingRaw = Array.isArray(body.pending) ? body.pending.slice(0, 25) : [];
  const pending: PendingItem[] = [];
  for (const p of pendingRaw) {
    const id = str(p?.id, 80), title = str(p?.title, 140);
    if (!id || !title || !/^[\w.:-]+$/.test(id)) continue;
    pending.push({ id, title, detail: str(p.detail, 400), kind: str(p.kind, 40), created_at: str(p.created_at, 40) });
  }
  return { status, message: str(body.message, 200), pending };
}

async function readJson(req: Request): Promise<any> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 32_000) throw new Error('too large');
  const text = await req.text();
  if (text.length > 32_000) throw new Error('too large');
  return JSON.parse(text);
}

async function getBotState(env: Env, id: string): Promise<BotState | null> {
  return (await env.CITY_KV.get(`bot:${id}`, 'json')) as BotState | null;
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const bots = parseBots(env);

  if (!path.startsWith('/api/')) {
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
  }

  // ---- bot -> city
  if (path === '/api/status' && req.method === 'POST') {
    const id = botFromBearer(req, bots);
    if (!id) return json({ error: 'unauthorized' }, 401);
    let body: any;
    try { body = await readJson(req); } catch { return json({ error: 'invalid json' }, 400); }
    const clean = sanitizeStatus(body);
    if (!clean) return json({ error: 'invalid body' }, 400);
    const prev = await getBotState(env, id);
    const now = new Date().toISOString();
    // never resurrect items the owner already decided on
    const decided = new Set<string>(((await env.CITY_KV.get(`decided:${id}`, 'json')) as string[] | null) ?? []);
    const state: BotState = {
      id, name: bots[id].name || id, role: bots[id].role || 'worker', ...clean,
      pending: clean.pending.filter((p) => !decided.has(p.id)),
      updated_at: now, first_seen: prev?.first_seen ?? now,
    };
    await env.CITY_KV.put(`bot:${id}`, JSON.stringify(state));
    return json({ ok: true, pending: state.pending.length });
  }

  // ---- owner session
  if (path === '/api/login' && req.method === 'POST') {
    if (!env.OWNER_PASSWORD || !env.SESSION_SECRET) return json({ error: 'owner login not configured' }, 501);
    if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
    let body: any;
    try { body = await readJson(req); } catch { return json({ error: 'invalid json' }, 400); }
    if (typeof body?.password !== 'string' || !safeEqual(body.password, env.OWNER_PASSWORD)) {
      return json({ error: 'wrong password' }, 401);
    }
    const token = await makeSession(env);
    return json({ ok: true }, 200, {
      'set-cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`,
    });
  }
  if (path === '/api/logout' && req.method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }
  if (path === '/api/me' && req.method === 'GET') {
    return json({ owner: await isOwner(req, env) });
  }

  if (path === '/api/state' && req.method === 'GET') {
    if (!(await isOwner(req, env))) return json({ error: 'unauthorized' }, 401);
    const out: BotState[] = [];
    for (const [id, b] of Object.entries(bots)) {
      const s = await getBotState(env, id);
      out.push(s ?? { id, name: b.name || id, role: b.role || 'worker', status: 'idle', pending: [], updated_at: '', first_seen: '' });
    }
    const log = ((await env.CITY_KV.get('log', 'json')) as unknown[] | null) ?? [];
    return json({ bots: out, log, generated_at: new Date().toISOString() });
  }

  if (path === '/api/decision' && req.method === 'POST') {
    if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
    if (!(await isOwner(req, env))) return json({ error: 'unauthorized' }, 401);
    let body: any;
    try { body = await readJson(req); } catch { return json({ error: 'invalid json' }, 400); }
    const botId = str(body?.bot_id, 80), requestId = str(body?.request_id, 80);
    const decision = body?.decision;
    if (!botId || !requestId || !['approve', 'decline'].includes(decision)) return json({ error: 'invalid body' }, 400);
    const bot = bots[botId];
    if (!bot) return json({ error: 'unknown bot' }, 404);
    const state = await getBotState(env, botId);
    const item = state?.pending.find((p) => p.id === requestId);
    if (!state || !item) return json({ error: 'unknown request' }, 404);
    if (!bot.webhook) return json({ error: 'bot has no webhook configured' }, 501);

    let res: Response;
    try {
      res = await fetch(bot.webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(bot.webhookKey ? { authorization: `Bearer ${bot.webhookKey}` } : {}) },
        body: JSON.stringify({ request_id: requestId, decision }),
      });
    } catch {
      return json({ error: 'webhook unreachable' }, 502);
    }
    if (!res.ok) return json({ error: 'webhook rejected', status: res.status }, 502);

    state.pending = state.pending.filter((p) => p.id !== requestId);
    await env.CITY_KV.put(`bot:${botId}`, JSON.stringify(state));
    const decided = (((await env.CITY_KV.get(`decided:${botId}`, 'json')) as string[] | null) ?? []).concat(requestId).slice(-200);
    await env.CITY_KV.put(`decided:${botId}`, JSON.stringify(decided));
    const log = (((await env.CITY_KV.get('log', 'json')) as unknown[] | null) ?? []);
    log.unshift({ bot_id: botId, request_id: requestId, title: item.title, decision, at: new Date().toISOString() });
    await env.CITY_KV.put('log', JSON.stringify(log.slice(0, 50)));
    return json({ ok: true, forwarded: true });
  }

  return json({ error: 'not found' }, 404);
}

export default { fetch: handle };
