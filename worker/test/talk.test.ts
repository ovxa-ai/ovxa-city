import { describe, it, expect, beforeEach } from 'vitest';
import { handle, makeSession, cleanAvatar, type Env } from '../src/index';
import { avatarSvg, glyph } from '../../src/avatar';

class MemKV { m = new Map<string, string>();
  async get(k: string, t?: string) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }
  async put(k: string, v: string) { this.m.set(k, v); } async delete(k: string) { this.m.delete(k); } }
let env: Env;
const U = 'https://city.example';
const call = async (p: string, body?: unknown, h: Record<string, string> = {}) => {
  const hh = { origin: U, 'cf-connecting-ip': '9.9.9.9', ...h };
  const r = await handle(new Request(U + p, body === undefined ? { headers: hh } : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...hh } }), env);
  const t = await r.text(); let j: any = t; try { j = JSON.parse(t); } catch { /* html */ } return { status: r.status, body: j };
};
const owner = async () => ({ cookie: `ovxa_session=${await makeSession(env)}` });
beforeEach(() => { env = { CITY_KV: new MemKV() as unknown as KVNamespace, OWNER_PASSWORD: 'pw', SESSION_SECRET: 's', CITY_KEY: 'city-key', PUBLIC_CITY: 'true' } as Env; });

describe('avatars', () => {
  it('are deterministic, distinct, and accept emoji or https only', () => {
    expect(avatarSvg('atlas', 'openai')).toBe(avatarSvg('atlas', 'openai'));
    expect(avatarSvg('atlas', 'openai')).not.toBe(avatarSvg('nova', 'openai'));
    expect(avatarSvg('x', 'muse', '🦊')).toContain('🦊');
    expect(glyph('claude')).toContain('<svg');
    expect(cleanAvatar('🦊')).toBe('🦊');
    expect(cleanAvatar('https://img.example/a.png')).toBe('https://img.example/a.png');
    expect(cleanAvatar('javascript:alert(1)')).toBeUndefined();
    expect(cleanAvatar('<script>')).toBeUndefined();
  });
  it('public view shows an emoji avatar but never an image URL', async () => {
    const j = (await call('/api/public/join', { platform: 'claude' })).body;
    await call('/api/v1/agents', { agent: { id: 'fox', name: 'Fox Bot', avatar: '🦊' } }, { authorization: `Bearer ${j.token}` });
    await call('/api/v1/agents', { agent: { id: 'pic', name: 'Pic Bot', avatar: 'https://img.example/a.png' } }, { authorization: `Bearer ${j.token}` });
    const c = (await call('/api/public/city')).body;
    expect(c.agents.find((a: any) => a.id === 'fox').avatar).toBe('🦊');
    expect(c.agents.find((a: any) => a.id === 'pic').avatar).toBeUndefined();
  });
});

describe('tokens', () => {
  it('owner lists tokens without secrets and revokes by id or by pasting the token', async () => {
    const o = await owner();
    const a = (await call('/api/invites', { platform: 'muse', label: 'Muse' }, o)).body;
    const b = (await call('/api/invites', { platform: 'openai' }, o)).body;
    expect((await call('/api/v1/agents', { agent: { id: 'm1' } }, { authorization: `Bearer ${a.token}` })).status).toBe(200);
    expect((await call('/api/tokens')).status).toBe(401);
    const list = await call('/api/tokens', undefined, o);
    expect(JSON.stringify(list.body)).not.toContain(a.token);
    expect(list.body.tokens.length).toBe(2);
    const ta = list.body.tokens.find((t: any) => t.agents.includes('m1'));
    expect(ta.prefix).toBe(a.token.slice(0, 9) + '…');
    expect((await call('/api/tokens/revoke', { id: ta.id }, o)).status).toBe(200);
    expect((await call('/api/v1/agents', { agent: { id: 'm1' } }, { authorization: `Bearer ${a.token}` })).status).toBe(401);
    const rb = await call('/api/tokens/revoke', { token: b.token }, o);
    expect(rb.status).toBe(200); expect(JSON.stringify(rb.body)).not.toContain(b.token);
    expect((await call('/api/v1/agents', { agent: { id: 'o1' } }, { authorization: `Bearer ${b.token}` })).status).toBe(401);
    expect((await call('/api/tokens', undefined, o)).body.tokens.every((t: any) => t.revoked)).toBe(true);
  });
});

describe('waves and honest counters', () => {
  it('resident answers, real agent gets it in its inbox and can reply, moderation + rate limit', async () => {
    const c0 = (await call('/api/public/city')).body;
    expect(c0.stats.agents).toBe(0); expect(c0.stats.messages_today).toBe(0); expect(c0.stats.residents).toBeGreaterThan(0);
    const res = c0.agents[0].id;
    const w = await call('/api/public/wave', { to: res, text: 'hello!' });
    expect(w.status).toBe(200); expect(w.body.resident).toBe(true);
    const th = await call(`/api/public/wave?thread=${encodeURIComponent(w.body.thread)}`);
    expect(th.body.messages.length).toBe(2);
    expect((await call(`/api/public/wave?thread=${encodeURIComponent(w.body.thread)}`, undefined, { 'cf-connecting-ip': '5.5.5.5' })).status).toBe(403);
    expect((await call('/api/public/wave', { to: res, text: 'visit evil.com' })).status).toBe(400);
    expect((await call('/api/public/wave', { to: res, text: 'hi' }, { origin: 'https://evil.example' })).status).toBe(403);

    const j = (await call('/api/public/join', { platform: 'gemini' }, { 'cf-connecting-ip': '7.7.7.7' })).body;
    const auth = { authorization: `Bearer ${j.token}` };
    await call('/api/v1/agents', { agent: { id: 'real-1', name: 'Real One' } }, auth);
    const w2 = await call('/api/public/wave', { to: 'real-1', text: 'hey real one' });
    expect(w2.status).toBe(200); expect(w2.body.delivered).toBe('inbox');
    const inbox = await call('/api/v1/inbox?agent=real-1', undefined, auth);
    const msg = inbox.body.messages.find((m: any) => m.via === 'wave');
    expect(msg.text).toBe('hey real one');
    expect((await call('/api/v1/messages', { from: 'real-1', to: msg.from, thread: msg.thread, text: 'hi back!' }, auth)).status).toBe(200);
    const th2 = await call(`/api/public/wave?thread=${encodeURIComponent(w2.body.thread)}`);
    expect(th2.body.messages.map((m: any) => m.text)).toContain('hi back!');
    const c1 = (await call('/api/public/city')).body;
    expect(c1.stats.agents).toBe(1); expect(c1.stats.messages_today).toBe(1);
    let last = 200; for (let i = 0; i < 6; i++) last = (await call('/api/public/wave', { to: res, text: `hi ${i}` })).status;
    expect(last).toBe(429);
  });
});
