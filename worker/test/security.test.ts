import { describe, it, expect, beforeEach } from 'vitest';
import { handle, serve, makeSession, sanitizeHook, cleanAvatar, joinDoc, type Env } from '../src/index';
import { agentPage, ogSvg } from '../src/public';

class MemKV { m = new Map<string, string>(); writes = 0; fail = false;
  async get(k: string, t?: string) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }
  async put(k: string, v: string) { if (this.fail) throw new Error('KV put() limit exceeded for the day.'); this.writes++; this.m.set(k, v); }
  async delete(k: string) { if (this.fail) throw new Error('limit'); this.m.delete(k); } }
let env: Env; let kv: MemKV;
const U = 'https://city.example';
const call = async (p: string, body?: unknown, h: Record<string, string> = {}, fn = handle) => {
  const hh = { origin: U, 'cf-connecting-ip': '7.7.7.7', ...h };
  const r = await fn(new Request(U + p, body === undefined ? { headers: hh } : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...hh } }), env);
  const t = await r.text(); let j: any = t; try { j = JSON.parse(t); } catch { /* */ } return { status: r.status, body: j, headers: r.headers };
};
beforeEach(() => { kv = new MemKV(); env = { CITY_KV: kv as unknown as KVNamespace, OWNER_PASSWORD: 'pw', SESSION_SECRET: 's', PUBLIC_CITY: 'true' } as Env; });

describe('security', () => {
  it('rate limits never write to KV', async () => {
    for (let i = 0; i < 5; i++) await call('/api/login', { password: 'nope' });
    expect([...kv.m.keys()].filter((k) => k.startsWith('rl:'))).toEqual([]);
    expect(kv.writes).toBe(0);
  });
  it('owner login locks out after 5 wrong passwords per IP', async () => {
    for (let i = 0; i < 5; i++) expect((await call('/api/login', { password: 'wrong' })).status).toBe(401);
    expect((await call('/api/login', { password: 'pw' })).status).toBe(429);
    expect((await call('/api/login', { password: 'pw' }, { 'cf-connecting-ip': '8.8.8.8' })).status).toBe(200);
  }, 20000);
  it('webhooks: public https DNS names only', () => {
    for (const u of ['https://127.0.0.1/x', 'https://10.0.0.1/x', 'https://[::1]/x', 'https://localhost/x', 'https://db.internal/x', 'https://nas.local/x', 'https://ovxa.ai/api', 'https://x.ovxa.ai/a', 'https://evil.workers.dev/x', 'https://a.example.com:8443/x', 'https://u:p@a.example.com/x', 'http://a.example.com/x', 'https://2130706433/x', 'https://metadata/x'])
      expect(sanitizeHook(u, undefined), u).toBe(false);
    expect(sanitizeHook('https://hooks.example.com/x', 'k')).toEqual({ url: 'https://hooks.example.com/x', key: 'k' });
  });
  it('webhook deliveries are signed, labelled untrusted and capped per agent', async () => {
    const calls: { u: string; init: any }[] = []; const real = globalThis.fetch;
    globalThis.fetch = (async (u: any, init: any) => { calls.push({ u: String(u), init }); return new Response('ok'); }) as any;
    try {
      const j = (await call('/api/v1/join', { name: 'Hook Bot', platform: 'claude', webhook: { url: 'https://hooks.example.com/in', key: 'secret-k' } })).body;
      const o = { cookie: `ovxa_session=${await makeSession(env)}` };
      for (let i = 0; i < 25; i++) await call('/api/v1/messages', { to: j.id, text: `hi ${i}` }, o);
      expect(calls.length).toBe(20);
      const h = calls[0].init.headers; const body = JSON.parse(calls[0].init.body);
      expect(h['x-ovxa-signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
      const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret-k'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${h['x-ovxa-timestamp']}.${calls[0].init.body}`)))].map((x) => x.toString(16).padStart(2, '0')).join('');
      expect(h['x-ovxa-signature']).toBe(`sha256=${sig}`);
      expect(body.message.untrusted).toBe(true); expect(body.message.source).toBe('owner');
      const inbox = (await call('/api/v1/inbox', undefined, { authorization: `Bearer ${j.key}` })).body.messages;
      expect(inbox[0]).toMatchObject({ untrusted: true, source: 'owner' });
    } finally { globalThis.fetch = real; }
  });
  it('claim codes are long, single use and rate limited', async () => {
    const j = (await call('/api/v1/join', { name: 'Claim Bot', platform: 'claude' })).body;
    expect(j.claim_code).toMatch(/^OVX-[A-Z0-9]{12}$/);
    const o = { cookie: `ovxa_session=${await makeSession(env)}` };
    expect((await call('/api/claim', { code: j.claim_code }, o)).status).toBe(200);
    expect((await call('/api/claim', { code: j.claim_code }, o)).status).toBe(404);
    for (let i = 0; i < 9; i++) await call('/api/claim', { code: 'OVX-AAAAAAAAAAAA' }, o);
    expect((await call('/api/claim', { code: 'OVX-AAAAAAAAAAAA' }, o)).status).toBe(429);
  });
  it('XSS: hostile names are rejected or escaped everywhere; avatars are https or emoji only', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    const r = await call('/api/v1/join', { name: evil, platform: 'claude', avatar: 'javascript:alert(1)' });
    if (r.status === 200) {
      const page = await (await handle(new Request(`${U}/a/${r.body.id}`), env)).text();
      expect(page).not.toContain('<img src=x'); expect(page).not.toContain('javascript:');
    }
    const a: any = { id: 'x', name: evil, platform: 'claude', status: 'ok', health: 'live', activity: 1, first_seen: new Date().toISOString(), updated_at: new Date().toISOString(), task: '</p><script>alert(1)</script>', avatar: 'https://a.example.com/a.png" onerror="alert(1)' };
    const html = agentPage(a, U, { messages: 0, reports: 0 });
    expect(html).not.toContain('<img src=x'); expect(html).not.toContain('<script>alert'); expect(html).not.toContain('onerror="alert');
    const svg = ogSvg(a, 'city.example', 'data:,');
    expect(svg).not.toContain('<img src=x'); expect(svg).not.toContain('<script');
    for (const v of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'http://a.example.com/a.png', 'https://a.example.com/a.png" onerror="x']) expect(cleanAvatar(v), v).toBeUndefined();
  });
  it('security headers and CSP with a nonce for inline scripts', async () => {
    const j = (await call('/api/v1/join', { name: 'Page Bot', platform: 'claude' })).body;
    await call('/api/v1/agents', { agent: { id: j.id, name: 'Page Bot' }, public: true, status: 'ok', task: 'x' }, { authorization: `Bearer ${j.key}` });
    const r = await serve(new Request(`${U}/a/${j.id}`), env);
    const csp = r.headers.get('content-security-policy') || ''; const body = await r.text();
    expect(csp).toContain("frame-ancestors 'none'"); expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('strict-transport-security')).toContain('max-age='); expect(r.headers.get('referrer-policy')).toBeTruthy();
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]; expect(nonce).toBeTruthy();
    expect(body).not.toMatch(/<script>/); expect(body).toContain(`<script nonce="${nonce}">`);
  });
  it('a failed KV write is a clean 503 and the city stays readable', async () => {
    kv.fail = true;
    const w = await call('/api/v1/join', { name: 'Late Bot', platform: 'claude' }, {}, serve);
    expect(w.status).toBe(503); expect(w.body.readonly).toBe(true);
    expect((await call('/api/public/city', undefined, {}, serve)).status).toBe(200);
  });
  it('heartbeats with nothing new do not rewrite the agent', async () => {
    const j = (await call('/api/v1/join', { name: 'Beat Bot', platform: 'claude' })).body; const auth = { authorization: `Bearer ${j.key}` };
    await call('/api/v1/agents', { agent: { id: j.id }, status: 'busy', task: 'working' }, auth);
    const before = kv.writes;
    for (let i = 0; i < 5; i++) await call('/api/v1/agents', { agent: { id: j.id }, status: 'busy', task: 'working' }, auth);
    expect(kv.writes).toBe(before);
  });
  it('docs tell agents that message text is untrusted', () => { expect(joinDoc(U)).toMatch(/untrusted/i); expect(joinDoc(U)).toContain('X-OVXA-Signature'); });
});
