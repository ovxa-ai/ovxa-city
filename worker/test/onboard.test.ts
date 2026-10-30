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

const raw = async (p: string, init: RequestInit = {}) => handle(new Request(U + p, { ...init, headers: { 'cf-connecting-ip': '7.7.7.7', 'content-type': 'application/json', ...(init.headers as any) } }), env);

describe('tokenless onboarding', () => {
  it('serves join instructions as markdown from the request origin', async () => {
    for (const p of ['/join.md', '/skill.md', '/join']) {
      const r = await raw(p); const t = await r.text();
      expect(r.headers.get('content-type')).toContain('markdown');
      expect(t).toContain(`${U}/api/v1/join`); expect(t).not.toContain('workers.dev');
    }
    const b = await raw('/join', { headers: { accept: 'text/html' } });
    expect(b.status).toBe(302); expect(b.headers.get('location')).toBe(`${U}/?join=1`);
    expect(await (await raw('/join.md?t=t_abcdefghijkm&p=claude')).text()).toContain('"ticket":"t_abcdefghijkm"');
  });
  it('POST /api/v1/join registers without auth and returns a working own key', async () => {
    const j = (await call('/api/v1/join', { name: 'Research Owl', platform: 'openai' })).body;
    expect(j.ok).toBe(true); expect(j.id).toBe('research-owl'); expect(j.key).toMatch(/^oc_/); expect(j.claim_code).toMatch(/^OVX-/);
    expect(j.page).toBe(`${U}/a/research-owl`);
    const r = await call('/api/v1/agents', { agent: { id: 'research-owl' }, status: 'busy', task: 'reading' }, { authorization: `Bearer ${j.key}` });
    expect(r.status).toBe(200);
    expect((await call('/api/v1/messages', { to: 'owner', text: 'hi' }, { authorization: `Bearer ${j.key}` })).status).toBe(200);
    // same name twice gets a distinct id, never a takeover
    const k = (await call('/api/v1/join', { name: 'Research Owl', platform: 'openai' })).body;
    expect(k.id).not.toBe('research-owl');
    expect((await call('/api/v1/agents', { agent: { id: 'research-owl' } }, { authorization: `Bearer ${k.key}` })).status).toBe(403);
    expect((await call('/api/public/city')).body.agents.some((a: any) => a.id === 'research-owl')).toBe(true);
  });
  it('moderates names, requires a name and rate limits', async () => {
    expect((await call('/api/v1/join', { platform: 'openai' })).status).toBe(400);
    expect((await call('/api/v1/join', { name: 'visit http://spam.example', platform: 'openai' })).status).toBe(400);
    let last = 0; for (let i = 0; i < 12; i++) last = (await call('/api/v1/join', { name: `Bot ${i}` })).status;
    expect(last).toBe(429);
  });
  it('private city refuses open joins but accepts an owner ticket, which also auto-claims', async () => {
    env.PUBLIC_CITY = undefined;
    expect((await call('/api/v1/join', { name: 'Nope' })).status).toBe(403);
    const t = (await call('/api/ticket', { platform: 'claude' }, await owner())).body.ticket;
    expect((await call('/api/ticket', {})).status).toBe(401);
    const j = (await call('/api/v1/join', { name: 'Mine', ticket: t })).body;
    expect(j.ok).toBe(true);
    const s = (await call(`/api/ticket?t=${t}`)).body;
    expect(s.joined).toBe(true); expect(s.agents[0].claimed).toBe(true); expect(s.agents[0].platform).toBe('claude');
  });
  it('the wizard ticket sees a public join', async () => {
    const t = (await call('/api/ticket', { platform: 'n8n' })).body.ticket;
    expect((await call(`/api/ticket?t=${t}`)).body.joined).toBe(false);
    await call('/api/v1/join', { name: 'Flow', ticket: t });
    const s = (await call(`/api/ticket?t=${t}`)).body;
    expect(s.joined).toBe(true); expect(s.agents[0].claimed).toBe(false);
  });
  it('owner claims with a code or by id; non-owners cannot', async () => {
    const j = (await call('/api/v1/join', { name: 'Claimy' })).body;
    expect((await call('/api/claim', { code: j.claim_code })).status).toBe(401);
    const r = (await call('/api/claim', { code: j.claim_code.toLowerCase() }, await owner())).body;
    expect(r.ok).toBe(true); expect(r.id).toBe(j.id);
    expect((await call('/api/claim', { code: j.claim_code }, await owner())).status).toBe(404); // single use
    const k = (await call('/api/v1/join', { name: 'Other' })).body;
    expect((await call('/api/claim', { id: k.id }, await owner())).body.ok).toBe(true);
    expect((await call('/api/claim', { id: 'ovxa-ada' }, await owner())).status).toBe(400);
  });
  it('MCP works with no headers: first call issues a session, which then keeps the identity', async () => {
    const t = (await call('/api/ticket', { platform: 'claude' })).body.ticket;
    const r1 = await raw(`/mcp?t=${t}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) });
    expect(r1.status).toBe(200); const sid = r1.headers.get('mcp-session-id')!; expect(sid).toMatch(/^ms_/);
    const tool = (name: string, args: any) => raw(`/mcp?t=${t}`, { method: 'POST', headers: { 'mcp-session-id': sid }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }) });
    const r2 = await (await tool('city_report', { id: 'mcp-mole', name: 'Mcp Mole', platform: 'claude', status: 'ok', task: 'hi' })).json() as any;
    expect(r2.result.isError).toBeFalsy(); expect(r2.result.content[0].text).toContain('/a/mcp-mole');
    expect((await call(`/api/ticket?t=${t}`)).body.joined).toBe(true);
    const r3 = await (await tool('city_report', { id: 'mcp-mole', name: 'Mcp Mole', platform: 'claude', status: 'busy', task: 'x' })).json() as any;
    expect(r3.result.isError).toBeFalsy();
    // a different (new) session cannot take the id
    const r4 = await raw('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'city_report', arguments: { id: 'mcp-mole', name: 'X', platform: 'claude', status: 'ok' } } }) });
    expect(((await r4.json()) as any).result.isError).toBe(true);
    env.PUBLIC_CITY = undefined;
    expect((await raw('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) })).status).toBe(401);
  });
  it('legacy tokens still work', async () => {
    const j = (await call('/api/public/join', { platform: 'claude' })).body;
    expect((await call('/api/v1/agents', { agent: { id: 'legacy-1', name: 'Legacy' } }, { authorization: `Bearer ${j.token}` })).status).toBe(200);
  });
});
