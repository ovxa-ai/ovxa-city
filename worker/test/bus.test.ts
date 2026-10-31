import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { handle, makeSession, sanitizeHook, threadId, type Env } from '../src/index';

class MemKV { m = new Map<string, string>();
  async get(k: string, t?: string) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }
  async put(k: string, v: string) { this.m.set(k, v); } async delete(k: string) { this.m.delete(k); } }
let env: Env;
const U = 'https://city.example';
const req = (p: string, body?: unknown, h: Record<string, string> = {}) => new Request(U + p, body === undefined ? { headers: h } : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...h } });
const call = async (p: string, body?: unknown, h: Record<string, string> = {}) => { const r = await handle(req(p, body, h), env); return { status: r.status, body: (await r.json()) as any }; };
const owner = async () => ({ cookie: `ovxa_session=${await makeSession(env)}` });
const invite = async (platform = 'openai') => (await call('/api/invites', { platform }, await owner())).body;
const report = (tok: string, id: string, extra: Record<string, unknown> = {}) => call('/api/v1/agents', { agent: { id, name: id.toUpperCase() }, status: 'ok', task: 'hi', ...extra }, { authorization: `Bearer ${tok}` });

beforeEach(() => { env = { CITY_KV: new MemKV() as unknown as KVNamespace, OWNER_PASSWORD: 'pw', SESSION_SECRET: 's', CITY_KEY: 'city-key' }; });
afterEach(() => vi.unstubAllGlobals());

describe('one-click connect', () => {
  it('invite status flips to joined after the first report', async () => {
    const inv = await invite('claude');
    expect(inv.id).toMatch(/^[a-f0-9]{64}$/);
    expect((await call(`/api/invites/status?id=${inv.id}`, undefined, await owner())).body.joined).toBe(false);
    await report(inv.token, 'helper');
    const st = (await call(`/api/invites/status?id=${inv.id}`, undefined, await owner())).body;
    expect(st.joined).toBe(true); expect(st.agents[0]).toMatchObject({ id: 'helper', platform: 'claude' });
    expect((await call(`/api/invites/status?id=${inv.id}`)).status).toBe(401);
  });
  it('an agent id cannot be hijacked by another token', async () => {
    const a = await invite(), b = await invite();
    expect((await report(a.token, 'alpha')).status).toBe(200);
    expect((await report(b.token, 'alpha')).status).toBe(403);
  });
  it('webhooks must be https and are never returned', async () => {
    expect(sanitizeHook('http://x.test', undefined)).toBe(false);
    expect(sanitizeHook({ url: 'https://x.test/h', key: 'k' }, undefined)).toEqual({ url: 'https://x.test/h', key: 'k' });
    const a = await invite();
    expect((await report(a.token, 'w', { webhook: 'http://insecure.test' })).status).toBe(400);
    const r = await report(a.token, 'w', { webhook: { url: 'https://hook.test/x', key: 'SECRET123' } });
    expect(r.body.webhook).toBe('registered');
    const all = JSON.stringify((await call('/api/city', undefined, await owner())).body) + JSON.stringify((await call('/api/v1/agents', undefined, { authorization: `Bearer ${a.token}` })).body);
    expect(all).not.toContain('SECRET123'); expect(all).not.toContain('hook.test');
  });
});

describe('message bus', () => {
  it('agent -> agent with inbox, thread, feed and token-scoped reads', async () => {
    const a = await invite(), b = await invite('langchain');
    await report(a.token, 'planner'); await report(b.token, 'writer');
    const s = await call('/api/v1/messages', { to: 'writer', text: 'Draft the intro?' }, { authorization: `Bearer ${a.token}` });
    expect(s.status).toBe(200); expect(s.body).toMatchObject({ thread: threadId('planner', 'writer'), delivered: 'inbox' });
    const inbox = await call('/api/v1/inbox', undefined, { authorization: `Bearer ${b.token}` });
    expect(inbox.body.messages).toHaveLength(1); expect(inbox.body.messages[0]).toMatchObject({ from: 'planner', text: 'Draft the intro?' });
    expect((await call('/api/v1/inbox?agent=writer', undefined, { authorization: `Bearer ${a.token}` })).status).toBe(403);
    expect((await call('/api/v1/messages', { from: 'writer', to: 'planner', text: 'spoof' }, { authorization: `Bearer ${a.token}` })).status).toBe(403);
    const th = await call(`/api/threads/${encodeURIComponent(s.body.thread)}`, undefined, await owner());
    expect(th.body.messages).toHaveLength(1);
    const c = (await call('/api/city', undefined, await owner())).body;
    expect(c.feed[0]).toMatchObject({ kind: 'message', agent: 'planner', to: 'writer' });
  });
  it('validates recipients, size and auth; rate limits', async () => {
    const a = await invite(); await report(a.token, 'solo');
    const h = { authorization: `Bearer ${a.token}` };
    expect((await call('/api/v1/messages', { to: 'nobody', text: 'x' }, h)).status).toBe(404);
    expect((await call('/api/v1/messages', { to: 'owner', text: 'x'.repeat(2001) }, h)).status).toBe(413);
    expect((await call('/api/v1/messages', { to: 'owner', text: 'x' })).status).toBe(401);
    for (let i = 0; i < 30; i++) expect((await call('/api/v1/messages', { to: 'owner', text: `m${i}` }, h)).status).toBe(200);
    expect((await call('/api/v1/messages', { to: 'owner', text: 'one more' }, h)).status).toBe(429);
  });
  it('owner -> agent pushes to the registered webhook with its bearer key', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', async (u: string, init: any) => { calls.push({ u, init }); return new Response('ok'); });
    const a = await invite('grokbot'); await report(a.token, 'grok', { webhook: 'https://routine.test/hook', webhook_key: 'rk' });
    const r = await call('/api/v1/messages', { to: 'grok', text: 'Summarize my day' }, await owner());
    expect(r.body.delivered).toBe('webhook');
    expect(calls[0].u).toBe('https://routine.test/hook'); expect(calls[0].init.headers.authorization).toBe('Bearer rk');
    const payload = JSON.parse(calls[0].init.body);
    expect(payload.message).toMatchObject({ from: 'owner', to: 'grok' }); expect(payload.reply.url).toBe(U + '/api/v1/messages');
    expect(JSON.stringify(payload)).not.toContain(a.token);
    // the bot replies with its token
    expect((await call('/api/v1/messages', { to: 'owner', text: 'Done', thread: payload.message.thread }, { authorization: `Bearer ${a.token}` })).status).toBe(200);
    expect((await call(`/api/threads/${encodeURIComponent(payload.message.thread)}`, undefined, await owner())).body.messages).toHaveLength(2);
  });
  it('rejects cross-origin owner sends', async () => {
    expect((await call('/api/v1/messages', { to: 'owner', text: 'x' }, { ...(await owner()), origin: 'https://evil.test' })).status).toBe(403);
  });
});

describe('live agents', () => {
  it('needs the provider key on the server', async () => {
    const r = await call('/api/live-agents', { provider: 'openai', name: 'Ava' }, await owner());
    expect(r.status).toBe(501); expect(r.body.error).toContain('OPENAI_API_KEY');
    expect((await call('/api/config', undefined, await owner())).body.live).toEqual({ openai: false, anthropic: false });
  });
  it('replies server-side; the key never reaches the client', async () => {
    env.ANTHROPIC_API_KEY = 'sk-ant-SECRET';
    vi.stubGlobal('fetch', async (u: string, init: any) => {
      expect(u).toBe('https://api.anthropic.com/v1/messages'); expect(init.headers['x-api-key']).toBe('sk-ant-SECRET');
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Hello Ben!' }] }));
    });
    const c = await call('/api/live-agents', { provider: 'anthropic', name: 'Clara' }, await owner());
    expect(c.body).toMatchObject({ ok: true, id: 'clara' });
    const s = await call('/api/v1/messages', { to: 'clara', text: 'hi' }, await owner());
    expect(s.body.delivered).toBe('live');
    const th = (await call(`/api/threads/${encodeURIComponent(s.body.thread)}`, undefined, await owner())).body;
    expect(th.messages.map((m: any) => m.text)).toEqual(['hi', 'Hello Ben!']);
    const everything = JSON.stringify(th) + JSON.stringify((await call('/api/city', undefined, await owner())).body) + JSON.stringify((await call('/api/config', undefined, await owner())).body);
    expect(everything).not.toContain('sk-ant');
  });
});

describe('MCP bus tools', () => {
  it('lists, sends and reads', async () => {
    const a = await invite('claude'), b = await invite();
    await report(a.token, 'cursor-agent'); await report(b.token, 'gpt');
    const rpc = (tok: string, method: string, params: unknown) => call('/mcp', { jsonrpc: '2.0', id: 1, method, params }, { authorization: `Bearer ${tok}` });
    const names = (await rpc(a.token, 'tools/list', {})).body.result.tools.map((t: any) => t.name);
    expect(names).toEqual(['city_report', 'city_send_message', 'city_read_inbox', 'city_list_agents', 'city_list_tasks', 'city_create_task', 'city_update_task']);
    expect((await rpc(a.token, 'tools/call', { name: 'city_list_agents', arguments: {} })).body.result.content[0].text).toContain('gpt');
    expect((await rpc(a.token, 'tools/call', { name: 'city_send_message', arguments: { to: 'gpt', text: 'ping' } })).body.result.isError).toBe(false);
    expect((await rpc(b.token, 'tools/call', { name: 'city_read_inbox', arguments: {} })).body.result.content[0].text).toContain('ping');
  });
});
