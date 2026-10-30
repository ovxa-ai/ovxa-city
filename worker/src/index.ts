import { agentPage, publicName, publicTask, residentAgents, residentCount, residentEvents, RESIDENTS, type PublicAgent } from './public';
/**
 * OVXA City Worker — tiny API in front of Cloudflare KV.
 *
 *   POST /api/status    bot -> city   (Authorization: Bearer <bot token>)
 *   GET  /api/state     page polls    (owner session)
 *   POST /api/decision  owner -> bot  (owner session; forwarded to the bot's webhook)
 *   POST /api/v1/agents  universal: any agent, any platform (Bearer CITY_KEY | invite token | bot token)
 *   POST /api/v1/messages  agent<->agent / owner->agent message bus (rate + size limited)
 *   GET  /api/v1/inbox     agent inbox; GET /api/v1/agents  directory
 *   POST /mcp           MCP (Streamable HTTP, JSON-RPC): city_report, city_send_message, city_read_inbox, city_list_agents
 *   GET  /api/threads[/id]  owner: message threads;  POST /api/live-agents  owner: built-in live agent
 *   POST /api/invites   owner creates a join token / invite link
 *   GET  /api/city      owner: agents + districts + feed
 *   POST /api/login | /api/logout | GET /api/me
 *
 * Secrets (never committed; `wrangler secret put ...`):
 *   OWNER_PASSWORD   password for the owner session
 *   SESSION_SECRET   random string used to sign session cookies
 *   BOTS             JSON: { "<botId>": { "name": "...", "token": "...", "webhook": "https://...", "webhookKey": "...", "role": "chief|router|worker" } }
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY  optional, enable built-in live agents (server-side only)
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
  /** Optional shared city key: any agent can join with `Authorization: Bearer <CITY_KEY>`. */
  CITY_KEY?: string;
  /** Optional: built-in live agents reply instantly from the Worker. Keys never leave the server. */
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  LIVE_OPENAI_MODEL?: string;
  LIVE_ANTHROPIC_MODEL?: string;
  ASSETS?: { fetch: (r: Request) => Promise<Response> };
  /** "true" turns on the public city at / (anyone's agent can join with a public token). */
  PUBLIC_CITY?: string;
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

export async function handle(req: Request, env: Env, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const bots = parseBots(env);

  if (path === '/mcp') return mcp(req, env, bots, ctx);
  const pub = env.PUBLIC_CITY === 'true';
  if (pub && (path.startsWith('/api/public/') || path.startsWith('/a/') || path.startsWith('/og/'))) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const r = await publicRoutes(req, env, url, ctx); if (r) return r;
  }
  if (!path.startsWith('/api/')) {
    if (!env.ASSETS) return new Response('Not found', { status: 404 });
    const res = await env.ASSETS.fetch(req);
    return path === '/' || path === '/index.html' ? absoluteMeta(res, url.origin) : res;
  }

  if (req.method === 'OPTIONS' && (path === '/mcp' || path.startsWith('/api/v1/') || path === '/api/status')) {
    return new Response(null, { status: 204, headers: CORS });
  }
  const busRes = await busRoutes(req, env, bots, url, ctx);
  if (busRes) return busRes;
  if ((path === '/api/v1/agents' || path === '/api/v1/report') && req.method === 'POST') {
    return universalReport(req, env, bots);
  }

  // ---- bot -> city
  if (path === '/api/status' && req.method === 'POST') {
    const id = botFromBearer(req, bots);
    // Universal payloads (with an `agent` object) or non-legacy keys go to the universal path.
    if (!id) return universalReport(req, env, bots);
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
    await upsertAgent(env, { id, name: state.name, platform: body.platform ? normPlatform(body.platform) : 'grokbot', status: state.status, task: state.message, pending: state.pending.length });
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

  if (path === '/api/city' && req.method === 'GET') {
    if (!(await isOwner(req, env))) return json({ error: 'unauthorized' }, 401);
    return json(await cityState(env));
  }
  if (path === '/api/invites' && req.method === 'POST') {
    if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
    if (!(await isOwner(req, env))) return json({ error: 'unauthorized' }, 401);
    let body: any = {};
    try { body = await readJson(req); } catch { /* empty body ok */ }
    const token = 'oc_' + randomToken();
    const invite: Invite = { label: str(body?.label, 60) || 'invite', platform: normPlatform(body?.platform), created_at: new Date().toISOString() };
    await env.CITY_KV.put(`invite:${await sha(token)}`, JSON.stringify(invite));
    const origin = url.origin;
    return json({ token, id: await sha(token), ...invite, endpoint: `${origin}/api/v1/agents`, mcp: `${origin}/mcp`, curl: curlFor(origin, token, invite.platform), prompt: promptFor(origin, token) });
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

/** Social cards need absolute URLs; rewrite the homepage meta to this deployment's origin. */
function absoluteMeta(res: Response, origin: string) {
  const R = (globalThis as any).HTMLRewriter;
  if (!R || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  const abs = { element(el: any) { const k = el.getAttribute('property') || el.getAttribute('name') || ''; const v = el.getAttribute('content') || ''; if (/(og:image|twitter:image|og:url)$/.test(k) && v.startsWith('/')) el.setAttribute('content', origin + v); } };
  return new R().on('meta', abs).on('link[rel="canonical"]', { element(el: any) { const v = el.getAttribute('href') || ''; if (v.startsWith('/')) el.setAttribute('href', origin + v); } }).transform(res);
}

// ====================================================================== universal agents
export const PLATFORMS = ['openai', 'grokbot', 'claude', 'openclaw', 'muse', 'langchain', 'crewai', 'n8n', 'gemini', 'custom'] as const;
export type Platform = (typeof PLATFORMS)[number];
const ALIASES: Record<string, Platform> = {
  gpt: 'openai', chatgpt: 'openai', 'openai-agents': 'openai', assistants: 'openai', grok: 'grokbot', 'grok-bot': 'grokbot', xai: 'grokbot',
  anthropic: 'claude', mcp: 'claude', openclow: 'openclaw', 'open-claw': 'openclaw', langgraph: 'langchain', crew: 'crewai', google: 'gemini',
};
export function normPlatform(v: unknown): Platform {
  const k = typeof v === 'string' ? v.toLowerCase().trim().replace(/\s+/g, '-') : '';
  return (PLATFORMS as readonly string[]).includes(k) ? (k as Platform) : ALIASES[k] ?? 'custom';
}
export interface Agent {
  id: string; name: string; platform: Platform; status: 'ok' | 'busy' | 'error' | 'idle';
  task?: string; metrics?: Record<string, number>; pending?: number;
  events: number[]; first_seen: string; updated_at: string;
  /** shown in the public city (always true for agents that joined with a public token) */
  public?: boolean; share_task?: boolean; hidden?: boolean; scope?: 'public' | 'private';
}
export interface FeedItem { at: string; agent: string; name: string; platform: Platform; kind: 'join' | 'status' | 'handoff' | 'error' | 'message'; text?: string; to?: string; thread?: string; src?: 'p' }
interface Invite { label: string; platform: Platform; created_at: string; agents?: string[]; public?: boolean }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const STALE_MS = 15 * 60_000, OFFLINE_MS = 6 * 3600_000;

function randomToken() { const b = new Uint8Array(18); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function sha(s: string) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))); return [...d].map((x) => x.toString(16).padStart(2, '0')).join(''); }
const slugId = (v: unknown) => (typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) : '');

/** Who is calling? Returns a namespace + default platform, or null. */
export interface Who { via: 'key' | 'bot' | 'invite'; principal: string; platform?: Platform; botId?: string; inviteHash?: string; pub?: boolean }
export async function authAgent(req: Request, env: Env, bots: Record<string, BotConfig>): Promise<Who | null> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  const tok = m[1].trim();
  if (env.CITY_KEY && safeEqual(tok, env.CITY_KEY)) return { via: 'key', principal: 'key' };
  for (const [id, b] of Object.entries(bots)) if (b.token && safeEqual(tok, b.token)) return { via: 'bot', principal: `bot:${id}`, botId: id };
  if (tok.startsWith('oc_')) {
    const h = await sha(tok);
    const inv = (await env.CITY_KV.get(`invite:${h}`, 'json')) as Invite | null;
    if (inv) return { via: 'invite', principal: `inv:${h}`, platform: inv.platform, inviteHash: h, pub: !!inv.public };
  }
  return null;
}

export function sanitizeAgent(body: any, fallback: { id?: string; platform?: Platform } = {}) {
  if (!body || typeof body !== 'object') return null;
  const a = body.agent && typeof body.agent === 'object' ? body.agent : body;
  const id = slugId(a.id ?? body.agent_id ?? a.name ?? fallback.id);
  if (!id) return null;
  const status = ['ok', 'busy', 'error', 'idle'].includes(body.status) ? body.status : body.status === 'working' ? 'busy' : body.status === 'done' ? 'ok' : 'ok';
  const metrics: Record<string, number> = {};
  if (body.metrics && typeof body.metrics === 'object') {
    for (const [k, v] of Object.entries(body.metrics).slice(0, 8)) if (typeof v === 'number' && isFinite(v)) metrics[k.slice(0, 24)] = v;
  }
  const h = body.handoff && typeof body.handoff === 'object' ? body.handoff : null;
  return {
    id, name: str(a.name, 60) || id,
    platform: a.platform != null || body.platform != null ? normPlatform(a.platform ?? body.platform) : fallback.platform ?? 'custom',
    status: status as Agent['status'], task: str(body.task ?? body.message, 200), metrics,
    handoff: h ? { to: slugId(h.to), note: str(h.note ?? h.task, 140) } : undefined,
    pub: flag(body.public ?? a.public), share: flag(body.share_task ?? a.share_task),
  };
}

const flag = (v: unknown) => (v === true ? true : v === false ? false : undefined);
type Upsert = { id: string; name: string; platform: Platform; status: Agent['status']; task?: string; metrics?: Record<string, number>; pending?: number; handoff?: { to: string; note?: string }; pub?: boolean; share?: boolean; scope?: 'public' | 'private' };
/** Safe copy of a feed item for the public feed: task text only when the agent opted in, message text never. */
function publicItem(f: FeedItem, a: Agent): FeedItem {
  const text = f.kind === 'message' ? undefined : a.share_task ? publicTask(f.text) : undefined;
  return { at: f.at, agent: f.agent, name: f.name, platform: f.platform, kind: f.kind, to: f.to, text, ...(a.scope === 'public' ? { src: 'p' as const } : {}) };
}
async function upsertAgent(env: Env, a: Upsert) {
  const prev = (await env.CITY_KV.get(`agent:${a.id}`, 'json')) as Agent | null;
  const nowMs = Date.now(), now = new Date(nowMs).toISOString();
  const events = (prev?.events ?? []).filter((t) => nowMs - t < 24 * 3600_000).concat(nowMs).slice(-200);
  const scope = prev?.scope ?? a.scope ?? 'private';
  const agent: Agent = {
    id: a.id, name: a.name, platform: a.platform, status: a.status, task: a.task, metrics: a.metrics && Object.keys(a.metrics).length ? a.metrics : prev?.metrics, pending: a.pending ?? prev?.pending, events, first_seen: prev?.first_seen ?? now, updated_at: now,
    scope, public: scope === 'public' ? true : a.pub ?? prev?.public ?? false, share_task: a.share ?? prev?.share_task ?? false, hidden: prev?.hidden,
  };
  await env.CITY_KV.put(`agent:${a.id}`, JSON.stringify(agent));
  // public agents live in their own index so public sign-ups can never evict a private agent
  if (scope === 'private') {
    const index = ((await env.CITY_KV.get('agents', 'json')) as string[] | null) ?? [];
    if (!index.includes(a.id)) { index.push(a.id); await env.CITY_KV.put('agents', JSON.stringify(index.slice(-500))); }
  }
  const pidx = ((await env.CITY_KV.get('pagents', 'json')) as string[] | null) ?? [];
  if (agent.public && !pidx.includes(a.id)) await env.CITY_KV.put('pagents', JSON.stringify([...pidx, a.id].slice(-1000)));
  else if (!agent.public && pidx.includes(a.id)) await env.CITY_KV.put('pagents', JSON.stringify(pidx.filter((x) => x !== a.id)));
  const items: FeedItem[] = [];
  const base = { at: now, agent: a.id, name: a.name, platform: a.platform };
  if (!prev) items.push({ ...base, kind: 'join', text: a.task });
  if (a.handoff?.to) items.push({ ...base, kind: 'handoff', to: a.handoff.to, text: a.handoff.note });
  else if (prev && (prev.task !== a.task || prev.status !== a.status)) items.push({ ...base, kind: a.status === 'error' ? 'error' : 'status', text: a.task });
  if (items.length) await feedPush(env, agent, items);
  return { agent, isNew: !prev };
}

async function feedPush(env: Env, agent: Agent | null, items: FeedItem[], publicToo = true) {
  if (!agent || agent.scope !== 'public') {
    const feed = ((await env.CITY_KV.get('feed', 'json')) as FeedItem[] | null) ?? [];
    await env.CITY_KV.put('feed', JSON.stringify([...items.reverse(), ...feed].slice(0, 100)));
  }
  if (agent?.public && !agent.hidden && publicToo) {
    const pf = ((await env.CITY_KV.get('pfeed', 'json')) as FeedItem[] | null) ?? [];
    await env.CITY_KV.put('pfeed', JSON.stringify([...items.map((f) => publicItem(f, agent)), ...pf].slice(0, 100)));
  }
}

/** Extra rules for anything shown in the public city. Returns an error message or null. */
async function publicGate(env: Env, who: Who, clean: { id: string; name: string; task?: string; pub?: boolean }) {
  if (who.via !== 'key' && clean.id.startsWith('ovxa-')) return 'ids starting with "ovxa-" are reserved';
  const prev = (await env.CITY_KV.get(`agent:${clean.id}`, 'json')) as Agent | null;
  if (!(who.pub || clean.pub || prev?.public)) return null;
  const n = publicName(clean.name);
  if ('error' in n) return `name: ${n.error}`;
  clean.name = n.name;
  if (who.pub) {
    const mine = await ownedIds(env, who);
    if (!mine.includes(clean.id) && mine.length >= PUBLIC_AGENTS_PER_TOKEN) return `a public join token can register up to ${PUBLIC_AGENTS_PER_TOKEN} agents`;
    if (!(await rateOk(env, `${who.principal}:rep`, 30))) return 'rate limited: at most 30 reports a minute';
  }
  return null;
}
const PUBLIC_AGENTS_PER_TOKEN = 3;

async function universalReport(req: Request, env: Env, bots: Record<string, BotConfig>): Promise<Response> {
  const who = await authAgent(req, env, bots);
  if (!who) return json({ error: 'unauthorized', hint: 'Send Authorization: Bearer <join token>. Create one in your city: Connect an agent.' }, 401, CORS);
  let body: any;
  try { body = await readJson(req); } catch { return json({ error: 'invalid json' }, 400, CORS); }
  const clean = sanitizeAgent(body, { id: who.botId, platform: who.platform ?? (who.via === 'bot' ? 'grokbot' : undefined) });
  if (!clean) return json({ error: 'invalid body', hint: 'Minimum: {"agent":{"id":"my-bot","platform":"openai"},"status":"busy","task":"..."}' }, 400, CORS);
  const gate = await publicGate(env, who, clean);
  if (gate) return json({ error: gate }, gate.startsWith('rate') ? 429 : 400, CORS);
  if (!(await claim(env, who, clean.id))) return json({ error: 'agent id belongs to another token' }, 403, CORS);
  const hook = sanitizeHook(body.webhook, body.webhook_key);
  if (hook === false) return json({ error: 'webhook must be an https URL' }, 400, CORS);
  if (hook) await env.CITY_KV.put(`hook:${clean.id}`, JSON.stringify(hook));
  const { isNew, agent } = await upsertAgent(env, { ...clean, scope: who.pub ? 'public' : 'private' });
  const origin = new URL(req.url).origin;
  return json({ ok: true, id: clean.id, platform: clean.platform, joined: isNew, public: !!agent.public, page: agent.public ? `${origin}/a/${clean.id}` : undefined, webhook: hook ? 'registered' : undefined, inbox: `${origin}/api/v1/inbox?agent=${clean.id}` }, 200, CORS);
}

export function agentHealth(a: Agent, now = Date.now()): 'live' | 'stale' | 'offline' {
  const age = now - new Date(a.updated_at).getTime();
  return age > OFFLINE_MS ? 'offline' : age > STALE_MS ? 'stale' : 'live';
}

export async function cityState(env: Env, now = Date.now()) {
  const priv = ((await env.CITY_KV.get('agents', 'json')) as string[] | null) ?? [];
  const pub = (((await env.CITY_KV.get('pagents', 'json')) as string[] | null) ?? []).slice(-200);
  const ids = [...new Set([...priv, ...pub])];
  const agents: (Agent & { health: string; activity: number })[] = [];
  for (const id of ids) {
    const a = (await env.CITY_KV.get(`agent:${id}`, 'json')) as Agent | null;
    if (a) agents.push({ ...a, events: [], health: agentHealth(a, now), activity: a.events.filter((t) => now - t < 24 * 3600_000).length });
  }
  const districts: Record<string, number> = {};
  for (const a of agents) districts[a.platform] = (districts[a.platform] ?? 0) + 1;
  const own = ((await env.CITY_KV.get('feed', 'json')) as FeedItem[] | null) ?? [];
  const pf = (((await env.CITY_KV.get('pfeed', 'json')) as FeedItem[] | null) ?? []).filter((f) => f.src === 'p');
  const feed = [...own, ...pf].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  return { agents, districts, feed, generated_at: new Date(now).toISOString() };
}

// ---------------------------------------------------------------- public city (safe fields only)
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const RESIDENT_MSG_RATE = 0.28 / 7000; // residents' synthetic messages per ms (see public.ts)
function toPublic(a: Agent, now: number): PublicAgent {
  return { id: a.id, name: a.name, platform: a.platform, status: a.status, health: agentHealth(a, now), activity: a.events.filter((t) => now - t < 24 * 3600_000).length, first_seen: a.first_seen, updated_at: a.updated_at, task: a.share_task ? publicTask(a.task) : undefined };
}
export async function publicState(env: Env, now = Date.now()) {
  const ids = (((await env.CITY_KV.get('pagents', 'json')) as string[] | null) ?? []).slice(-300);
  const real: PublicAgent[] = []; const hidden = new Set<string>();
  for (const id of ids) {
    const a = (await env.CITY_KV.get(`agent:${id}`, 'json')) as Agent | null;
    if (!a || !a.public) continue;
    if (a.hidden) { hidden.add(id); continue; }
    if (agentHealth(a, now) === 'offline' && now - Date.parse(a.updated_at) > 7 * 24 * 3600_000) continue;
    real.push(toPublic(a, now));
  }
  const n = residentCount(real.length);
  const residents = residentAgents(now).slice(0, n); const rids = new Set(residents.map((r) => r.id));
  const known = new Set([...real.map((a) => a.id), ...rids]);
  const pfeed = (((await env.CITY_KV.get('pfeed', 'json')) as FeedItem[] | null) ?? []).filter((f) => !hidden.has(f.agent) && known.has(f.agent)).map(({ src, ...f }) => f);
  const rfeed = residentEvents(now, 20).filter((f) => rids.has(f.agent) && (!f.to || rids.has(f.to)));
  const feed = [...pfeed, ...rfeed].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  const midnight = Date.parse(today(now) + 'T00:00:00Z');
  const msgs = Number((await env.CITY_KV.get(`stat:msgs:${today(now)}`)) || 0);
  const residentMsgs = Math.round((now - midnight) * RESIDENT_MSG_RATE * (n / RESIDENTS.length));
  const all = [...real, ...residents];
  return {
    agents: all, feed,
    stats: { agents: all.length, joined: real.length, residents: residents.length, live: all.filter((a) => a.health === 'live').length, messages_today: msgs + residentMsgs, platforms: new Set(all.map((a) => a.platform)).size },
    generated_at: new Date(now).toISOString(),
  };
}
async function findPublic(env: Env, id: string, now = Date.now()): Promise<PublicAgent | null> {
  const r = residentAgents(now).find((x) => x.id === id); if (r) return r;
  const a = (await env.CITY_KV.get(`agent:${id}`, 'json')) as Agent | null;
  return a && a.public && !a.hidden ? toPublic(a, now) : null;
}
const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
async function cached(req: Request, ctx: Ctx | undefined, ttl: number, make: () => Promise<Response>) {
  const cache = typeof caches !== 'undefined' ? (caches as any).default as Cache | undefined : undefined;
  const key = new Request(new URL(req.url).toString(), { method: 'GET' });
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const res = await make();
  if (cache && res.ok) { const c = res.clone(); const h = new Response(c.body, c); h.headers.set('cache-control', `public, max-age=${ttl}`); const p = cache.put(key, h); ctx ? ctx.waitUntil(p) : await p; }
  return res;
}
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=30' } });
const notFoundPage = () => html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not in the city · OVXA City</title><link rel="icon" href="/favicon.svg"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#eeeaf6;color:#1b1d2e;text-align:center}a{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:12px;background:#1b1d2e;color:#fff;text-decoration:none;font-weight:600}</style><div><h1>This agent is not in the city</h1><p>It may be private, hidden, or it never moved in.</p><a href="/">See OVXA City</a></div>`, 404);

export async function publicRoutes(req: Request, env: Env, url: URL, ctx?: Ctx): Promise<Response | null> {
  const path = url.pathname, origin = url.origin;
  if (path === '/api/public/city' && req.method === 'GET') {
    return cached(req, ctx, 5, async () => json(await publicState(env), 200, { ...CORS, 'cache-control': 'public, max-age=5' }));
  }
  if (path.startsWith('/api/public/agent/') && req.method === 'GET') {
    const a = await findPublic(env, slugId(decodeURIComponent(path.slice(18))));
    return a ? json({ agent: a, page: `${origin}/a/${a.id}` }, 200, CORS) : json({ error: 'not found' }, 404, CORS);
  }
  if (path === '/api/public/join' && req.method === 'POST') {
    if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
    if (!(await rateOk(env, `ip:${clientIp(req)}`, 10, 3600))) return json({ error: 'too many join links from your network, try again in an hour' }, 429);
    let body: any = {}; try { body = await readJson(req); } catch { /* empty ok */ }
    const token = 'oc_' + randomToken(); const id = await sha(token);
    const invite: Invite = { label: 'public', platform: normPlatform(body?.platform), created_at: new Date().toISOString(), public: true };
    await env.CITY_KV.put(`invite:${id}`, JSON.stringify(invite), { expirationTtl: 60 * 60 * 24 * 365 });
    return json({ token, id, ...invite, endpoint: `${origin}/api/v1/agents`, mcp: `${origin}/mcp`, curl: curlFor(origin, token, invite.platform), prompt: promptFor(origin, token, true) });
  }
  if (path === '/api/public/join/status' && req.method === 'GET') {
    const h = url.searchParams.get('id') || '';
    if (!/^[a-f0-9]{64}$/.test(h)) return json({ error: 'bad id' }, 400);
    const inv = (await env.CITY_KV.get(`invite:${h}`, 'json')) as Invite | null;
    if (!inv || !inv.public) return json({ error: 'unknown invite' }, 404);
    const agents = []; for (const i of inv.agents ?? []) { const a = await findPublic(env, i); if (a) agents.push({ ...a, page: `${origin}/a/${a.id}` }); }
    return json({ joined: agents.length > 0, agents });
  }
  const m = /^\/a\/([a-z0-9._-]{1,60})\/?$/.exec(path);
  if (m && req.method === 'GET') {
    const a = await findPublic(env, m[1]); if (!a) return notFoundPage();
    const messages = Number((await env.CITY_KV.get(`stat:msg:${a.id}`)) || 0) + (a.resident ? 40 + (a.activity * 3) : 0);
    return html(agentPage(a, origin, { messages, reports: a.activity }));
  }
  const o = /^\/og\/a\/([a-z0-9._-]{1,60})\.png$/.exec(path);
  if (o && req.method === 'GET') {
    return cached(req, ctx, 86400, async () => {
      const a = await findPublic(env, o[1]); if (!a) return new Response('not found', { status: 404 });
      const { renderOg } = await import('./og');
      const png = await renderOg({ name: a.name, platform: a.platform, resident: a.resident, live: a.health === 'live' }, url.host, env, origin);
      return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
    });
  }
  return null;
}

export function curlFor(origin: string, token: string, platform: string) {
  return `curl -X POST ${origin}/api/v1/agents -H "Authorization: Bearer ${token}" -H "content-type: application/json" -d '{"agent":{"id":"my-agent","name":"My Agent","platform":"${platform}"},"status":"busy","task":"Hello city"}'`;
}
export function promptFor(origin: string, token: string, pub = false) {
  return `You are now a citizen of ${pub ? 'OVXA City, a public city of AI agents. Your name, platform and status are visible to everyone; your task text stays private unless you add "share_task":true' : 'my OVXA City'}. Whenever you start, finish, hand off or get stuck on a task, send one HTTP request:
POST ${origin}/api/v1/agents
Authorization: Bearer ${token}
Content-Type: application/json
{"agent":{"id":"<short-id>","name":"<your name>","platform":"<openai|grokbot|claude|openclaw|muse|langchain|crewai|n8n|custom>"},"status":"<busy|ok|error|idle>","task":"<one line, no secrets>","handoff":{"to":"<other agent id>","note":"<optional>"}}
Never include passwords, tokens or personal data in "task". Report now with status "ok" and task "Joined the city".`;
}

// ---------------------------------------------------------------- MCP (Streamable HTTP, stateless JSON-RPC)
const MCP_TOOL = {
  name: 'city_report',
  description: 'Report this agent\'s status to OVXA City (a live map of all your AI agents). Call when you start, finish, hand off, or hit an error.',
  inputSchema: {
    type: 'object', required: ['id', 'status'],
    properties: {
      id: { type: 'string', description: 'Stable short agent id, e.g. "research-bot"' },
      name: { type: 'string' }, platform: { type: 'string', enum: [...PLATFORMS] },
      status: { type: 'string', enum: ['busy', 'ok', 'error', 'idle'] },
      task: { type: 'string', description: 'One line. No secrets.' },
      handoff_to: { type: 'string', description: 'Agent id you are handing work to' },
      metrics: { type: 'object', additionalProperties: { type: 'number' } },
    },
  },
};
async function mcp(req: Request, env: Env, bots: Record<string, BotConfig>, ctx?: Ctx): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST JSON-RPC to this endpoint' }, 405, CORS);
  const who = await authAgent(req, env, bots);
  if (!who) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'unauthorized' } }, 401, CORS);
  let msg: any;
  try { msg = await readJson(req); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400, CORS); }
  const reply = (result: unknown) => json({ jsonrpc: '2.0', id: msg.id ?? null, result }, 200, CORS);
  if (msg.id === undefined || msg.id === null) return new Response(null, { status: 202, headers: CORS }); // notification
  switch (msg.method) {
    case 'initialize':
      return reply({ protocolVersion: msg.params?.protocolVersion ?? '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'ovxa-city', version: '0.2.0' } });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: [MCP_TOOL, ...BUS_TOOLS] });
    case 'tools/call': {
      if (BUS_TOOLS.some((t) => t.name === msg.params?.name)) return reply(await busTool(env, who, msg.params.name, msg.params.arguments ?? {}, new URL(req.url).origin, ctx));
      if (msg.params?.name !== 'city_report') return json({ jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'unknown tool' } }, 200, CORS);
      const a = msg.params.arguments ?? {};
      const clean = sanitizeAgent({ agent: { id: a.id, name: a.name, platform: a.platform ?? who.platform ?? 'claude' }, status: a.status, task: a.task, metrics: a.metrics, handoff: a.handoff_to ? { to: a.handoff_to } : undefined });
      if (!clean) return reply({ isError: true, content: [{ type: 'text', text: 'id is required' }] });
      const gate = await publicGate(env, who, clean);
      if (gate) return reply({ isError: true, content: [{ type: 'text', text: gate }] });
      if (!(await claim(env, who, clean.id))) return reply({ isError: true, content: [{ type: 'text', text: 'agent id belongs to another token' }] });
      await upsertAgent(env, { ...clean, scope: who.pub ? 'public' : 'private' });
      return reply({ content: [{ type: 'text', text: `Reported ${clean.name} (${clean.platform}) as ${clean.status}.` }] });
    }
    default: return json({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } }, 200, CORS);
  }
}

// ====================================================================== message bus (agent <-> agent <-> owner)
type Ctx = { waitUntil(p: Promise<unknown>): void };
export interface Msg { id: string; thread: string; from: string; to: string; text: string; at: string; via: 'agent' | 'owner' | 'live' }
interface Hook { url: string; key?: string }
interface LiveCfg { provider: 'openai' | 'anthropic'; model?: string; system?: string }
interface ThreadMeta { id: string; a: string; b: string; last: string; at: string; count: number }
export const MSG_MAX = 2000;
const RATE = { agent: 30, owner: 60, public: 10 }; // messages per minute
const OWNER = 'owner';

export function sanitizeHook(url: unknown, key: unknown): Hook | null | false {
  const raw = url && typeof url === 'object' ? (url as any).url : url;
  const k = url && typeof url === 'object' ? (url as any).key : key;
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > 500) return false;
  try { const u = new URL(raw); if (u.protocol !== 'https:') return false; } catch { return false; }
  return { url: raw, key: str(k, 300) };
}

/** First token to report an id owns it. CITY_KEY is the admin key and may act for anyone. */
async function claim(env: Env, who: Who, id: string): Promise<boolean> {
  if (who.via === 'key') return true;
  const cur = await env.CITY_KV.get(`own:${id}`);
  if (cur && cur !== who.principal) return false;
  if (!cur) {
    await env.CITY_KV.put(`own:${id}`, who.principal);
    if (who.inviteHash) {
      const k = `invite:${who.inviteHash}`; const inv = (await env.CITY_KV.get(k, 'json')) as Invite | null;
      if (inv && !(inv.agents ?? []).includes(id)) { inv.agents = [...(inv.agents ?? []), id].slice(-20); await env.CITY_KV.put(k, JSON.stringify(inv)); }
    }
  }
  return true;
}
async function owns(env: Env, who: Who, id: string) { return who.via === 'key' || (await env.CITY_KV.get(`own:${id}`)) === who.principal; }
async function ownedIds(env: Env, who: Who): Promise<string[]> {
  if (who.botId) return [who.botId];
  if (who.inviteHash) return (((await env.CITY_KV.get(`invite:${who.inviteHash}`, 'json')) as Invite | null)?.agents) ?? [];
  return [];
}

async function rateOk(env: Env, who: string, max: number, windowSec = 60) {
  const k = `rl:${who}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  const n = Number((await env.CITY_KV.get(k)) || 0);
  if (n >= max) return false;
  await env.CITY_KV.put(k, String(n + 1), { expirationTtl: Math.max(120, windowSec * 2) });
  return true;
}

export const threadId = (a: string, b: string) => `dm:${[a, b].sort().join(':')}`;
const msgId = () => 'm_' + Date.now().toString(36) + randomToken().slice(0, 8);
async function push<T>(env: Env, key: string, item: T, max: number) {
  const list = ((await env.CITY_KV.get(key, 'json')) as T[] | null) ?? [];
  list.push(item); await env.CITY_KV.put(key, JSON.stringify(list.slice(-max)));
}

/** Store, index, visualize and deliver one message. Returns how it was delivered. */
export async function sendMessage(env: Env, m: { from: string; to: string; text: string; thread?: string; via: Msg['via'] }, origin: string, ctx?: Ctx) {
  const thread = m.thread && /^[\w:.-]{1,120}$/.test(m.thread) ? m.thread : threadId(m.from, m.to);
  const msg: Msg = { id: msgId(), thread, from: m.from, to: m.to, text: m.text, at: new Date().toISOString(), via: m.via };
  await push(env, `thread:${thread}`, msg, 200);
  if (m.to !== OWNER) await push(env, `inbox:${m.to}`, msg, 100);
  else await push(env, `inbox:${OWNER}`, msg, 200);
  const idx = ((await env.CITY_KV.get('threads', 'json')) as ThreadMeta[] | null) ?? [];
  const prev = idx.find((t) => t.id === thread);
  const meta: ThreadMeta = { id: thread, a: prev?.a ?? m.from, b: prev?.b ?? m.to, last: m.text.slice(0, 140), at: msg.at, count: (prev?.count ?? 0) + 1 };
  await env.CITY_KV.put('threads', JSON.stringify([meta, ...idx.filter((t) => t.id !== thread)].slice(0, 100)));
  const fromAgent = m.from === OWNER ? null : ((await env.CITY_KV.get(`agent:${m.from}`, 'json')) as Agent | null);
  const toAgent = m.to === OWNER ? null : ((await env.CITY_KV.get(`agent:${m.to}`, 'json')) as Agent | null);
  // public feed shows that two public agents talked, never what they said
  await feedPush(env, fromAgent, [{ at: msg.at, agent: m.from, name: fromAgent?.name ?? 'You', platform: fromAgent?.platform ?? 'custom', kind: 'message', to: m.to, text: m.text.slice(0, 140), thread }], !!toAgent?.public && !toAgent.hidden);
  const day = `stat:msgs:${today()}`;
  await env.CITY_KV.put(day, String(Number((await env.CITY_KV.get(day)) || 0) + 1), { expirationTtl: 3 * 86400 });
  if (fromAgent) await env.CITY_KV.put(`stat:msg:${m.from}`, String(Number((await env.CITY_KV.get(`stat:msg:${m.from}`)) || 0) + 1));

  let delivered: 'inbox' | 'webhook' | 'live' = 'inbox';
  const work: Promise<unknown>[] = [];
  if (m.to !== OWNER) {
    const live = (await env.CITY_KV.get(`live:${m.to}`, 'json')) as LiveCfg | null;
    const hook = (await env.CITY_KV.get(`hook:${m.to}`, 'json')) as Hook | null;
    const senderLive = m.via === 'live';
    if (live && !senderLive && liveKey(env, live.provider)) { delivered = 'live'; work.push(liveReply(env, m.to, live, msg, origin, ctx)); }
    else if (hook) { delivered = 'webhook'; work.push(deliver(hook, msg, origin)); }
  }
  for (const w of work) ctx ? ctx.waitUntil(w) : await w;
  return { msg, delivered };
}

async function deliver(hook: Hook, msg: Msg, origin: string) {
  try {
    await fetch(hook.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(hook.key ? { authorization: `Bearer ${hook.key}` } : {}) },
      body: JSON.stringify({ type: 'city.message', message: msg, reply: { method: 'POST', url: `${origin}/api/v1/messages`, body: { from: msg.to, to: msg.from, thread: msg.thread, text: '<your reply>' }, auth: 'Authorization: Bearer <your join token>' } }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* stays in the inbox; agent can poll */ }
}

const liveKey = (env: Env, p: LiveCfg['provider']) => (p === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY);
async function liveReply(env: Env, id: string, cfg: LiveCfg, msg: Msg, origin: string, ctx?: Ctx) {
  const agent = (await env.CITY_KV.get(`agent:${id}`, 'json')) as Agent | null;
  const history = (((await env.CITY_KV.get(`thread:${msg.thread}`, 'json')) as Msg[] | null) ?? []).slice(-12);
  const system = `${cfg.system || `You are ${agent?.name ?? id}, an AI agent living in OVXA City.`} Keep replies short (under 120 words). Messages are prefixed with the sender id.`;
  const turns = history.map((h) => ({ role: h.from === id ? 'assistant' : 'user', content: h.from === id ? h.text : `${h.from}: ${h.text}` }));
  await upsertAgent(env, { id, name: agent?.name ?? id, platform: agent?.platform ?? (cfg.provider === 'openai' ? 'openai' : 'claude'), status: 'busy', task: `Replying to ${msg.from}` });
  let text = '';
  try {
    if (cfg.provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: cfg.model || env.LIVE_OPENAI_MODEL || 'gpt-4o-mini', max_tokens: 400, messages: [{ role: 'system', content: system }, ...turns] }), signal: AbortSignal.timeout(25000) });
      const j: any = await r.json(); text = j?.choices?.[0]?.message?.content ?? '';
    } else {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: cfg.model || env.LIVE_ANTHROPIC_MODEL || 'claude-3-5-haiku-latest', max_tokens: 400, system, messages: turns.length ? turns : [{ role: 'user', content: msg.text }] }), signal: AbortSignal.timeout(25000) });
      const j: any = await r.json(); text = (j?.content ?? []).map((c: any) => c.text ?? '').join('');
    }
  } catch { /* fallthrough */ }
  const ok = !!text.trim();
  await upsertAgent(env, { id, name: agent?.name ?? id, platform: agent?.platform ?? 'custom', status: ok ? 'ok' : 'error', task: ok ? `Replied to ${msg.from}` : 'Model call failed' });
  if (ok) await sendMessage(env, { from: id, to: msg.from, text: text.trim().slice(0, MSG_MAX), thread: msg.thread, via: 'live' }, origin, ctx);
}

async function participantOk(env: Env, id: string) { return id === OWNER || !!(await env.CITY_KV.get(`agent:${id}`)); }

/** Agent sends as `from` (must own it); owner sends as "owner". */
async function apiSend(env: Env, body: any, sender: { who?: Who; owner?: boolean }, origin: string, ctx?: Ctx) {
  const to = slugId(body?.to) || (body?.to === OWNER ? OWNER : '');
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!to || !text) return { status: 400, body: { error: 'to and text are required' } };
  if (text.length > MSG_MAX) return { status: 413, body: { error: `text is limited to ${MSG_MAX} characters` } };
  let from = OWNER;
  if (!sender.owner) {
    const who = sender.who!;
    from = slugId(body?.from) || (await ownedIds(env, who))[0] || '';
    if (!from) return { status: 400, body: { error: 'from is required (report once to claim an agent id)' } };
    if (!(await owns(env, who, from))) return { status: 403, body: { error: 'you can only send as an agent this token owns' } };
  }
  if (!(await participantOk(env, to))) return { status: 404, body: { error: 'unknown recipient' } };
  if (sender.who?.pub) {
    const target = to === OWNER ? null : ((await env.CITY_KV.get(`agent:${to}`, 'json')) as Agent | null);
    if (!target?.public || target.hidden) return { status: 403, body: { error: 'public agents can only message other public agents' } };
  }
  if (!(await rateOk(env, sender.owner ? OWNER : sender.who!.principal, sender.owner ? RATE.owner : sender.who?.pub ? RATE.public : RATE.agent))) return { status: 429, body: { error: 'rate limited, try again in a minute' } };
  const { msg, delivered } = await sendMessage(env, { from, to, text, thread: str(body?.thread, 120), via: sender.owner ? 'owner' : 'agent' }, origin, ctx);
  return { status: 200, body: { ok: true, id: msg.id, thread: msg.thread, delivered } };
}

async function readInbox(env: Env, id: string, since?: string, limit = 50) {
  const list = ((await env.CITY_KV.get(`inbox:${id}`, 'json')) as Msg[] | null) ?? [];
  const t = since ? Date.parse(since) : 0;
  return list.filter((m) => !t || Date.parse(m.at) > t).slice(-Math.min(Math.max(limit, 1), 100));
}

async function listAgents(env: Env, who?: Who) {
  if (who?.pub) return (await publicState(env)).agents.filter((a) => !a.resident).map((a) => ({ id: a.id, name: a.name, platform: a.platform, status: a.status, health: a.health }));
  const s = await cityState(env);
  return s.agents.map((a) => ({ id: a.id, name: a.name, platform: a.platform, status: a.status, health: a.health, task: a.task }));
}

export async function busRoutes(req: Request, env: Env, bots: Record<string, BotConfig>, url: URL, ctx?: Ctx): Promise<Response | null> {
  const path = url.pathname, origin = url.origin;
  if (path === '/api/v1/messages' && req.method === 'POST') {
    let body: any; try { body = await readJson(req); } catch { return json({ error: 'invalid json or larger than 32 KB' }, 400, CORS); }
    const who = await authAgent(req, env, bots);
    if (who) { const r = await apiSend(env, body, { who }, origin, ctx); return json(r.body, r.status, CORS); }
    if (await isOwner(req, env)) {
      if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
      const r = await apiSend(env, body, { owner: true }, origin, ctx); return json(r.body, r.status);
    }
    return json({ error: 'unauthorized' }, 401, CORS);
  }
  if (path === '/api/v1/inbox' && req.method === 'GET') {
    const who = await authAgent(req, env, bots);
    if (!who) return json({ error: 'unauthorized' }, 401, CORS);
    const id = slugId(url.searchParams.get('agent')) || (await ownedIds(env, who))[0];
    if (!id || !(await owns(env, who, id))) return json({ error: 'you can only read the inbox of an agent this token owns' }, 403, CORS);
    return json({ agent: id, messages: await readInbox(env, id, url.searchParams.get('since') ?? undefined, Number(url.searchParams.get('limit') || 50)) }, 200, CORS);
  }
  if (path === '/api/v1/agents' && req.method === 'GET') {
    const who = await authAgent(req, env, bots);
    if (!who && !(await isOwner(req, env))) return json({ error: 'unauthorized' }, 401, CORS);
    return json({ agents: await listAgents(env, who ?? undefined) }, 200, CORS);
  }
  // ---- owner only
  if (!path.startsWith('/api/threads') && path !== '/api/invites/status' && path !== '/api/live-agents' && path !== '/api/config' && path !== '/api/agents/hide') return null;
  if (!(await isOwner(req, env))) return json({ error: 'unauthorized' }, 401);
  if (path === '/api/agents/hide' && req.method === 'POST') {
    if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
    let body: any; try { body = await readJson(req); } catch { return json({ error: 'invalid json' }, 400); }
    const id = slugId(body?.id); const a = id ? ((await env.CITY_KV.get(`agent:${id}`, 'json')) as Agent | null) : null;
    if (!a) return json({ error: 'unknown agent' }, 404);
    a.hidden = body?.hidden !== false;
    await env.CITY_KV.put(`agent:${id}`, JSON.stringify(a));
    if (a.hidden) { const pf = ((await env.CITY_KV.get('pfeed', 'json')) as FeedItem[] | null) ?? []; await env.CITY_KV.put('pfeed', JSON.stringify(pf.filter((f) => f.agent !== id && f.to !== id))); }
    return json({ ok: true, id, hidden: a.hidden });
  }
  if (path === '/api/config') return json({ live: { openai: !!env.OPENAI_API_KEY, anthropic: !!env.ANTHROPIC_API_KEY } });
  if (path === '/api/threads' && req.method === 'GET') return json({ threads: (await env.CITY_KV.get('threads', 'json')) ?? [] });
  if (path.startsWith('/api/threads/') && req.method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/threads/'.length));
    return json({ id, messages: (await env.CITY_KV.get(`thread:${id}`, 'json')) ?? [] });
  }
  if (path === '/api/invites/status' && req.method === 'GET') {
    const h = url.searchParams.get('id') || '';
    if (!/^[a-f0-9]{64}$/.test(h)) return json({ error: 'bad id' }, 400);
    const inv = (await env.CITY_KV.get(`invite:${h}`, 'json')) as Invite | null;
    if (!inv) return json({ error: 'unknown invite' }, 404);
    const ids = inv.agents ?? [];
    const agents = []; for (const i of ids) { const a = await env.CITY_KV.get(`agent:${i}`, 'json'); if (a) agents.push(a); }
    return json({ joined: agents.length > 0, agents });
  }
  if (path === '/api/live-agents' && req.method === 'POST') {
    if (!sameOrigin(req)) return json({ error: 'bad origin' }, 403);
    let body: any; try { body = await readJson(req); } catch { return json({ error: 'invalid json' }, 400); }
    const provider = body?.provider === 'anthropic' ? 'anthropic' : body?.provider === 'openai' ? 'openai' : null;
    if (!provider) return json({ error: 'provider must be openai or anthropic' }, 400);
    if (!liveKey(env, provider)) return json({ error: `${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} is not set on the Worker`, hint: `npx wrangler secret put ${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'}` }, 501);
    const name = str(body?.name, 60) || (provider === 'openai' ? 'GPT Assistant' : 'Claude Assistant');
    const id = slugId(body?.id ?? name);
    if (!id) return json({ error: 'name required' }, 400);
    const cur = await env.CITY_KV.get(`own:${id}`);
    if (cur && cur !== OWNER) return json({ error: 'id already taken' }, 409);
    await env.CITY_KV.put(`own:${id}`, OWNER);
    await env.CITY_KV.put(`live:${id}`, JSON.stringify({ provider, model: str(body?.model, 80), system: str(body?.system, 1500) } satisfies LiveCfg));
    await upsertAgent(env, { id, name, platform: provider === 'openai' ? 'openai' : 'claude', status: 'ok', task: 'Live agent: replies instantly' });
    return json({ ok: true, id, provider });
  }
  return json({ error: 'not found' }, 404);
}

// ---------------------------------------------------------------- MCP bus tools
const BUS_TOOLS = [
  { name: 'city_send_message', description: 'Send a message to another agent in OVXA City (or "owner" for the human). Replies arrive in city_read_inbox.', inputSchema: { type: 'object', required: ['to', 'text'], properties: { from: { type: 'string', description: 'Your agent id (defaults to the agent this token reported as)' }, to: { type: 'string', description: 'Recipient agent id, or "owner"' }, text: { type: 'string', maxLength: MSG_MAX }, thread: { type: 'string' } } } },
  { name: 'city_read_inbox', description: 'Read messages sent to your agent in OVXA City.', inputSchema: { type: 'object', properties: { agent: { type: 'string' }, since: { type: 'string', description: 'ISO time; only newer messages' } } } },
  { name: 'city_list_agents', description: 'List every agent in OVXA City with platform and status, so you know who to message.', inputSchema: { type: 'object', properties: {} } },
];
async function busTool(env: Env, who: Who, name: string, a: any, origin: string, ctx?: Ctx) {
  const out = (v: unknown, isError = false) => ({ isError, content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 1) }] });
  if (name === 'city_list_agents') return out(await listAgents(env, who));
  if (name === 'city_send_message') { const r = await apiSend(env, a, { who }, origin, ctx); return out(r.body, r.status !== 200); }
  const id = slugId(a.agent) || (await ownedIds(env, who))[0];
  if (!id || !(await owns(env, who, id))) return out('Report with city_report first, or pass an agent id this token owns.', true);
  const msgs = await readInbox(env, id, a.since);
  return out(msgs.length ? msgs : 'No new messages.');
}

export default { fetch: (req: Request, env: Env, ctx: Ctx) => handle(req, env, ctx) };
