import { describe, it, expect, beforeEach } from 'vitest';
import { handle, makeSession, type Env } from '../src/index';
import { moderate, publicName, residentEvents, residentCount, ogSvg } from '../src/public';

class MemKV { m = new Map<string, string>();
  async get(k: string, t?: string) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }
  async put(k: string, v: string) { this.m.set(k, v); } async delete(k: string) { this.m.delete(k); } }
let env: Env;
const U = 'https://city.example';
const H = { origin: U, 'cf-connecting-ip': '1.2.3.4' };
const req = (p: string, body?: unknown, h: Record<string, string> = {}) => new Request(U + p, body === undefined ? { headers: { ...H, ...h } } : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...H, ...h } });
const call = async (p: string, body?: unknown, h: Record<string, string> = {}) => { const r = await handle(req(p, body, h), env); const t = await r.text(); let j: any = t; try { j = JSON.parse(t); } catch { /* html */ } return { status: r.status, body: j, type: r.headers.get('content-type') || '' }; };
const join = async (platform = 'claude') => (await call('/api/public/join', { platform })).body;
const report = (tok: string, id: string, extra: Record<string, unknown> = {}) => call('/api/v1/agents', { agent: { id, name: extra.name ?? id }, status: 'ok', task: 'secret task text', ...extra }, { authorization: `Bearer ${tok}` });

beforeEach(() => { env = { CITY_KV: new MemKV() as unknown as KVNamespace, OWNER_PASSWORD: 'pw', SESSION_SECRET: 's', CITY_KEY: 'city-key', PUBLIC_CITY: 'true' } as Env; });

describe('moderation', () => {
  it('rejects urls, profanity (incl. leetspeak) and bad lengths', () => {
    expect(publicName('Research Buddy')).toEqual({ name: 'Research Buddy' });
    expect(publicName('x')).toHaveProperty('error');
    expect((publicName('a'.repeat(40)) as any).name.length).toBe(32);
    expect(publicName('visit evil.com')).toHaveProperty('error');
    expect(publicName('https://x.y')).toHaveProperty('error');
    expect(publicName('sh1t bot')).toHaveProperty('error');
    expect(moderate('hello world')).toBeFalsy();
  });
});

describe('public city', () => {
  it('is empty-proof: residents + stats, no task text', async () => {
    const r = await call('/api/public/city');
    expect(r.status).toBe(200);
    expect(r.body.agents.length).toBeGreaterThanOrEqual(6);
    expect(r.body.agents.every((a: any) => a.resident)).toBe(true);
    expect(r.body.stats).toMatchObject({ joined: 0 });
    expect(r.body.stats.residents).toBe(residentCount(0));
    expect(residentEvents(1e12)).toEqual(residentEvents(1e12));
  });
  it('join -> report -> visible publicly with safe fields only, page + share links', async () => {
    const j = await join('claude');
    expect(j.token).toBeTruthy(); expect(j.prompt).toContain('public');
    expect((await call(`/api/public/join/status?id=${j.id}`)).body.joined).toBe(false);
    expect((await report(j.token, 'research-buddy', { name: 'Research Buddy', webhook: { url: 'https://hook.test/x', key: 'K' } })).status).toBe(200);
    const st = (await call(`/api/public/join/status?id=${j.id}`)).body;
    expect(st.joined).toBe(true); expect(st.agents[0].page).toContain('/a/research-buddy');
    const c = await call('/api/public/city');
    const raw = JSON.stringify(c.body);
    expect(c.body.agents.find((a: any) => a.id === 'research-buddy')).toMatchObject({ name: 'Research Buddy', platform: 'claude' });
    expect(raw).not.toContain('secret task text'); expect(raw).not.toContain('hook.test');
    expect(c.body.stats.joined).toBe(1);
    const page = await call('/a/research-buddy');
    expect(page.status).toBe(200); expect(page.type).toContain('html');
    expect(page.body).toContain('Research Buddy'); expect(page.body).toContain('og:image'); expect(page.body).toContain('x.com/intent/post');
    expect(page.body).not.toContain('secret task text');
    expect((await call('/a/nobody-here')).status).toBe(404);
  });
  it('enforces moderation, reserved ids and per-token limits', async () => {
    const j = await join();
    expect((await report(j.token, 'ovxa-atlas')).status).toBe(400);
    expect((await report(j.token, 'spam', { name: 'buy at spam.io' })).status).toBe(400);
    for (const id of ['a1', 'a2', 'a3']) expect((await report(j.token, id)).status).toBe(200);
    expect((await report(j.token, 'a4')).status).toBeGreaterThanOrEqual(400);
  });
  it('owner can hide a public agent', async () => {
    const j = await join(); await report(j.token, 'shy-bot');
    const cookie = `ovxa_session=${await makeSession(env)}`;
    expect((await call('/api/agents/hide', { id: 'shy-bot', hidden: true }, { cookie })).status).toBe(200);
    expect((await call('/api/agents/hide', { id: 'shy-bot', hidden: true })).status).toBe(401);
    expect(JSON.stringify((await call('/api/public/city')).body)).not.toContain('shy-bot');
    expect((await call('/a/shy-bot')).status).toBe(404);
  });
  it('public agents can only message public agents and texts stay private', async () => {
    const cookie = `ovxa_session=${await makeSession(env)}`;
    const priv = (await call('/api/invites', { platform: 'openai' }, { cookie })).body;
    await report(priv.token, 'private-bot');
    const a = await join(), b = await join();
    await report(a.token, 'pub-a'); await report(b.token, 'pub-b');
    expect((await call('/api/v1/messages', { to: 'private-bot', text: 'hi' }, { authorization: `Bearer ${a.token}` })).status).toBeGreaterThanOrEqual(400);
    expect((await call('/api/v1/messages', { to: 'pub-b', text: 'top secret plan' }, { authorization: `Bearer ${a.token}` })).status).toBe(200);
    const list = JSON.stringify((await call('/api/v1/agents', undefined, { authorization: `Bearer ${a.token}` })).body);
    expect(list).not.toContain('private-bot');
    const pub = await call('/api/public/city');
    expect(JSON.stringify(pub.body)).not.toContain('top secret plan');
    expect(JSON.stringify(pub.body)).not.toContain('private-bot');
    expect(pub.body.stats.messages_today).toBeGreaterThanOrEqual(1);
  });
  it('og svg carries the name and host', () => {
    const s = ogSvg({ name: 'Nova & <Co>', platform: 'grok' }, 'city.example', 'data:x');
    expect(s).toContain('Nova &#38; &#60;Co&#62;'); expect(s).toContain('city.example'); expect(s).toContain('1200');
  });
  it('can be switched off for self-hosters', async () => {
    env.PUBLIC_CITY = 'false';
    expect((await call('/api/public/city')).status).toBe(404);
  });
});
