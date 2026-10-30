import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handle, makeSession, verifySession, safeEqual, sanitizeStatus, type Env } from '../src/index';

class MemKV {
  m = new Map<string, string>();
  async get(k: string, t?: string) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }
  async put(k: string, v: string) { this.m.set(k, v); }
  async delete(k: string) { this.m.delete(k); }
}

const BOTS = {
  grok: { name: 'Grok Bot', token: 'tok-grok', webhook: 'https://hooks.example/grok', webhookKey: 'wh-key', role: 'router' },
  code: { name: 'Code', token: 'tok-code', role: 'worker' },
};
let env: Env;
const U = 'https://city.example';
const req = (path: string, init: RequestInit = {}) => new Request(U + path, init);
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  req(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

async function ownerCookie() { return `ovxa_session=${await makeSession(env)}`; }

beforeEach(() => {
  env = { CITY_KV: new MemKV() as unknown as KVNamespace, OWNER_PASSWORD: 'pw', SESSION_SECRET: 'secret', BOTS: JSON.stringify(BOTS) };
  vi.restoreAllMocks();
});

describe('helpers', () => {
  it('safeEqual', () => { expect(safeEqual('abc', 'abc')).toBe(true); expect(safeEqual('abc', 'abd')).toBe(false); expect(safeEqual('a', 'ab')).toBe(false); });
  it('sessions sign and expire', async () => {
    const t = await makeSession(env, 0);
    expect(await verifySession(env, t, 1000)).toBe(true);
    expect(await verifySession(env, t, 1000 * 60 * 60 * 24 * 8)).toBe(false);
    expect(await verifySession(env, t.replace(/.$/, 'x'), 1000)).toBe(false);
    expect(await verifySession({ ...env, SESSION_SECRET: 'other' }, t, 1000)).toBe(false);
  });
  it('sanitizeStatus drops bad items and clamps', () => {
    const s = sanitizeStatus({ status: 'weird', pending: [{ id: 'ok-1', title: 'x'.repeat(500) }, { id: 'bad id!', title: 't' }, { title: 'no id' }] })!;
    expect(s.status).toBe('ok');
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0].title).toHaveLength(140);
  });
});

describe('POST /api/status', () => {
  it('rejects missing / wrong token', async () => {
    expect((await handle(post('/api/status', {}), env)).status).toBe(401);
    expect((await handle(post('/api/status', {}, { authorization: 'Bearer nope' }), env)).status).toBe(401);
  });
  it('stores state for the token owner', async () => {
    const r = await handle(post('/api/status', { status: 'busy', pending: [{ id: 'r1', title: 'Send weekly summary' }] }, { authorization: 'Bearer tok-grok' }), env);
    expect(r.status).toBe(200);
    const s = await (env.CITY_KV as any).get('bot:grok', 'json');
    expect(s.status).toBe('busy');
    expect(s.pending[0].id).toBe('r1');
    expect(s.first_seen).toBeTruthy();
  });
  it('rejects invalid json', async () => {
    const r = await handle(req('/api/status', { method: 'POST', body: '{', headers: { authorization: 'Bearer tok-grok' } }), env);
    expect(r.status).toBe(400);
  });
});

describe('owner auth', () => {
  it('login sets HttpOnly cookie; wrong password fails', async () => {
    expect((await handle(post('/api/login', { password: 'no' }), env)).status).toBe(401);
    const r = await handle(post('/api/login', { password: 'pw' }), env);
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Strict/);
  });
  it('login blocks cross-origin', async () => {
    expect((await handle(post('/api/login', { password: 'pw' }, { origin: 'https://evil.example' }), env)).status).toBe(403);
  });
  it('state requires owner', async () => {
    expect((await handle(req('/api/state'), env)).status).toBe(401);
    const r = await handle(req('/api/state', { headers: { cookie: await ownerCookie() } }), env);
    expect(r.status).toBe(200);
    const body: any = await r.json();
    expect(body.bots.map((b: any) => b.id)).toEqual(['grok', 'code']);
    expect(body.bots[0].status).toBe('idle');
  });
  it('Cloudflare Access email works only when ACCESS_EMAIL is set', async () => {
    const h = { 'cf-access-authenticated-user-email': 'ben@example.com' };
    expect((await handle(req('/api/state', { headers: h }), env)).status).toBe(401);
    env.ACCESS_EMAIL = 'Ben@example.com';
    expect((await handle(req('/api/state', { headers: h }), env)).status).toBe(200);
  });
});

describe('POST /api/decision', () => {
  beforeEach(async () => {
    await handle(post('/api/status', { pending: [{ id: 'r1', title: 'Send weekly summary' }] }, { authorization: 'Bearer tok-grok' }), env);
  });
  it('requires owner', async () => {
    expect((await handle(post('/api/decision', { bot_id: 'grok', request_id: 'r1', decision: 'approve' }), env)).status).toBe(401);
  });
  it('validates body and unknown ids', async () => {
    const c = await ownerCookie();
    expect((await handle(post('/api/decision', { bot_id: 'grok', request_id: 'r1', decision: 'maybe' }, { cookie: c }), env)).status).toBe(400);
    expect((await handle(post('/api/decision', { bot_id: 'nope', request_id: 'r1', decision: 'approve' }, { cookie: c }), env)).status).toBe(404);
    expect((await handle(post('/api/decision', { bot_id: 'grok', request_id: 'zz', decision: 'approve' }, { cookie: c }), env)).status).toBe(404);
  });
  it('forwards {request_id, decision} with the bot webhook key, then clears the item', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    const r = await handle(post('/api/decision', { bot_id: 'grok', request_id: 'r1', decision: 'approve' }, { cookie: await ownerCookie() }), env);
    expect(r.status).toBe(200);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hooks.example/grok');
    expect((init.headers as any).authorization).toBe('Bearer wh-key');
    expect(JSON.parse(init.body as string)).toEqual({ request_id: 'r1', decision: 'approve' });
    const s = await (env.CITY_KV as any).get('bot:grok', 'json');
    expect(s.pending).toHaveLength(0);
    // a later status push must not resurrect the decided item
    await handle(post('/api/status', { pending: [{ id: 'r1', title: 'Send weekly summary' }] }, { authorization: 'Bearer tok-grok' }), env);
    expect((await (env.CITY_KV as any).get('bot:grok', 'json')).pending).toHaveLength(0);
  });
  it('keeps the item when the webhook fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 500 }));
    const r = await handle(post('/api/decision', { bot_id: 'grok', request_id: 'r1', decision: 'decline' }, { cookie: await ownerCookie() }), env);
    expect(r.status).toBe(502);
    expect((await (env.CITY_KV as any).get('bot:grok', 'json')).pending).toHaveLength(1);
  });
  it('blocks cross-origin decisions', async () => {
    const r = await handle(post('/api/decision', { bot_id: 'grok', request_id: 'r1', decision: 'approve' }, { cookie: await ownerCookie(), origin: 'https://evil.example' }), env);
    expect(r.status).toBe(403);
  });
});
