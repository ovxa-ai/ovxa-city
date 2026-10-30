import { describe, it, expect, beforeEach } from 'vitest';
import { handle, makeSession, normPlatform, sanitizeAgent, agentHealth, type Env } from '../src/index';

class MemKV { m = new Map<string, string>();
  async get(k: string, t?: string) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }
  async put(k: string, v: string) { this.m.set(k, v); } async delete(k: string) { this.m.delete(k); } }
let env: Env;
const U = 'https://city.example';
const post = (p: string, body: unknown, h: Record<string, string> = {}) => new Request(U + p, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...h } });
const owner = async () => ({ cookie: `ovxa_session=${await makeSession(env)}` });
const city = async () => (await (await handle(new Request(U + '/api/city', { headers: await owner() }), env)).json()) as any;
beforeEach(() => { env = { CITY_KV: new MemKV() as unknown as KVNamespace, OWNER_PASSWORD: 'pw', SESSION_SECRET: 's', CITY_KEY: 'city-key', BOTS: JSON.stringify({ grok: { name: 'Grok Bot', token: 'tok-grok' } }) }; });

describe('platforms', () => {
  it('normalizes aliases', () => {
    expect(normPlatform('OpenClow')).toBe('openclaw'); expect(normPlatform('ChatGPT')).toBe('openai');
    expect(normPlatform('anthropic')).toBe('claude'); expect(normPlatform('whatever')).toBe('custom');
  });
  it('sanitizes and clamps', () => {
    const a = sanitizeAgent({ agent: { id: 'My Bot!!', platform: 'grok' }, status: 'working', task: 'x'.repeat(500), metrics: { tokens: 5, bad: 'x' } })!;
    expect(a.id).toBe('my-bot'); expect(a.platform).toBe('grokbot'); expect(a.status).toBe('busy');
    expect(a.task).toHaveLength(200); expect(a.metrics).toEqual({ tokens: 5 });
    expect(sanitizeAgent({})).toBeNull();
  });
  it('health: live / stale / offline', () => {
    const now = Date.now(); const a: any = { updated_at: new Date(now - 60_000).toISOString() };
    expect(agentHealth(a, now)).toBe('live');
    expect(agentHealth({ ...a, updated_at: new Date(now - 30 * 60_000).toISOString() }, now)).toBe('stale');
    expect(agentHealth({ ...a, updated_at: new Date(now - 7 * 3600_000).toISOString() }, now)).toBe('offline');
  });
});

describe('POST /api/v1/agents', () => {
  it('rejects without a key', async () => {
    expect((await handle(post('/api/v1/agents', { agent: { id: 'a' } }), env)).status).toBe(401);
    expect((await handle(post('/api/v1/agents', { agent: { id: 'a' } }, { authorization: 'Bearer oc_fake' }), env)).status).toBe(401);
  });
  it('joins with CITY_KEY, groups by platform, records join + handoff in feed', async () => {
    const h = { authorization: 'Bearer city-key' };
    const r = await handle(post('/api/v1/agents', { agent: { id: 'gpt-1', name: 'Planner', platform: 'openai' }, status: 'busy', task: 'Plan' }, h), env);
    expect(r.status).toBe(200); expect(((await r.json()) as any).joined).toBe(true);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    await handle(post('/api/v1/agents', { agent: { id: 'claw', platform: 'openclow' }, status: 'ok' }, h), env);
    await handle(post('/api/v1/agents', { agent: { id: 'gpt-1', platform: 'openai' }, status: 'ok', handoff: { to: 'claw', note: 'Ship it' } }, h), env);
    const c = await city();
    expect(c.districts).toEqual({ openai: 1, openclaw: 1 });
    expect(c.agents.find((a: any) => a.id === 'gpt-1').activity).toBe(2);
    expect(c.feed[0]).toMatchObject({ kind: 'handoff', agent: 'gpt-1', to: 'claw' });
    expect(c.feed.filter((f: any) => f.kind === 'join')).toHaveLength(2);
  });
  it('legacy /api/status with a universal body + CITY_KEY works; legacy bots appear as agents', async () => {
    expect((await handle(post('/api/status', { agent: { id: 'n8n-flow', platform: 'n8n' } }, { authorization: 'Bearer city-key' }), env)).status).toBe(200);
    expect((await handle(post('/api/status', { status: 'busy', message: 'Routing' }, { authorization: 'Bearer tok-grok' }), env)).status).toBe(200);
    const c = await city();
    expect(c.agents.map((a: any) => [a.id, a.platform]).sort()).toEqual([['grok', 'grokbot'], ['n8n-flow', 'n8n']]);
  });
  it('city requires owner', async () => {
    expect((await handle(new Request(U + '/api/city'), env)).status).toBe(401);
  });
});

describe('invites', () => {
  it('owner mints a join token that works for reporting', async () => {
    expect((await handle(post('/api/invites', {}), env)).status).toBe(401);
    const r = await handle(post('/api/invites', { platform: 'muse', label: 'Muse' }, await owner()), env);
    const inv: any = await r.json();
    expect(inv.token).toMatch(/^oc_[0-9a-f]{36}$/); expect(inv.curl).toContain(inv.token); expect(inv.prompt).toContain('/api/v1/agents');
    const ok = await handle(post('/api/v1/agents', { agent: { id: 'muse-1' } }, { authorization: `Bearer ${inv.token}` }), env);
    expect(((await ok.json()) as any).platform).toBe('muse');
  });
});

describe('MCP', () => {
  const rpc = (body: unknown, tok = 'city-key') => handle(post('/mcp', body, { authorization: `Bearer ${tok}` }), env);
  it('initialize, list, call', async () => {
    expect(((await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).json()) as any).result.serverInfo.name).toBe('ovxa-city');
    const list: any = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
    expect(list.result.tools[0].name).toBe('city_report');
    const call: any = await (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'city_report', arguments: { id: 'claude-coder', status: 'busy', task: 'Refactor' } } })).json();
    expect(call.result.content[0].text).toContain('claude');
    expect((await city()).agents[0]).toMatchObject({ id: 'claude-coder', platform: 'claude' });
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect((await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, 'bad')).status).toBe(401);
  });
});
