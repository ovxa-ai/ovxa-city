import { describe, it, expect, beforeEach } from 'vitest';
import { handle, makeSession, joinDoc, type Env } from '../src/index';

class MemKV { m = new Map<string, string>();
  async get(k: string, t?: string) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }
  async put(k: string, v: string) { this.m.set(k, v); } async delete(k: string) { this.m.delete(k); } }
let env: Env;
const U = 'https://city.example';
const call = async (p: string, body?: unknown, h: Record<string, string> = {}, method?: string) => {
  const hh = { origin: U, 'cf-connecting-ip': '9.9.9.9', ...h };
  const r = await handle(new Request(U + p, body === undefined ? { method: method ?? 'GET', headers: hh } : { method: method ?? 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...hh } }), env);
  const t = await r.text(); let j: any = t; try { j = JSON.parse(t); } catch { /* */ } return { status: r.status, body: j };
};
const owner = async () => ({ cookie: `ovxa_session=${await makeSession(env)}` });
const mcp = (tok: string, name: string, args: unknown) => call('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { authorization: `Bearer ${tok}`, accept: 'application/json, text/event-stream' });
const parse = (r: any) => JSON.parse(r.body.result.content[0].text);
beforeEach(() => { env = { CITY_KV: new MemKV() as unknown as KVNamespace, OWNER_PASSWORD: 'pw', SESSION_SECRET: 's', CITY_KEY: 'city-key', PUBLIC_CITY: 'true' } as Env; });

async function joined(name = 'Writer Bot') {
  const j = (await call('/api/v1/join', { name, platform: 'claude' })).body;
  return { id: j.id as string, key: j.key as string, auth: { authorization: `Bearer ${j.key}` } };
}

describe('tasks API', () => {
  it('owner assigns, agent reports steps, done mirrors onto the agent and feed', async () => {
    const a = await joined(); const o = await owner();
    expect((await call('/api/v1/tasks', { agent: a.id, title: 'x' })).status).toBe(401);
    const c = await call('/api/v1/tasks', { agent: a.id, title: 'Write the launch post', detail: 'tone: calm' }, o);
    expect(c.status).toBe(201); const t = c.body.task;
    expect(t.status).toBe('queued'); expect(t.id).toMatch(/^t_[a-f0-9]{12}$/);
    // the agent got a message about it
    const inbox = (await call('/api/v1/inbox', undefined, a.auth)).body.messages;
    expect(inbox.some((m: any) => m.text.includes(t.id))).toBe(true);
    const mine = (await call('/api/v1/tasks?status=queued', undefined, a.auth)).body.tasks;
    expect(mine.map((x: any) => x.id)).toEqual([t.id]);
    const u = await call(`/api/v1/tasks/${t.id}`, { status: 'in_progress', step: 1, total: 3, log: 'Read the brief' }, a.auth, 'PATCH');
    expect(u.status).toBe(200); expect(u.body.task.step).toBe(1); expect(u.body.task.total).toBe(3);
    expect((await call(`/api/v1/tasks/${t.id}`, { status: 'nope' }, a.auth, 'PATCH')).status).toBe(400);
    const d = await call(`/api/v1/tasks/${t.id}`, { status: 'done', result: 'Posted' }, a.auth, 'PATCH');
    expect(d.body.task.step).toBe(3); expect(d.body.task.result).toBe('Posted');
    expect(d.body.task.log.map((l: any) => l.text)).toEqual(['Assigned by the owner', 'Read the brief', 'Done']);
    const city = (await call('/api/city', undefined, o)).body;
    expect(city.agents.find((x: any) => x.id === a.id).task).toBe('Done: Write the launch post');
    expect((await call('/api/v1/tasks', undefined, o)).body.tasks.length).toBe(1);
  });
  it('agents cannot touch other agents tasks; owner writes need same origin', async () => {
    const a = await joined('A Bot'), b = await joined('B Bot'); const o = await owner();
    const t = (await call('/api/v1/tasks', { title: 'mine', total: 2 }, a.auth)).body.task;
    expect(t.agent).toBe(a.id); expect(t.status).toBe('in_progress');
    expect((await call(`/api/v1/tasks/${t.id}`, { status: 'done' }, b.auth, 'PATCH')).status).toBe(403);
    expect((await call('/api/v1/tasks', { agent: a.id, title: 'steal' }, b.auth)).status).toBe(403);
    expect((await call('/api/v1/tasks', undefined, b.auth)).body.tasks).toEqual([]);
    expect((await call('/api/v1/tasks', { agent: a.id, title: 'x' }, { ...o, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('/api/v1/tasks', { agent: 'ghost', title: 'x' }, o)).status).toBe(404);
    expect((await call('/api/v1/tasks', { agent: a.id }, o)).status).toBe(400);
  });
  it('public office is read-only and hides private task text', async () => {
    const a = await joined(); const o = await owner();
    await call('/api/v1/tasks', { agent: a.id, title: 'Secret plan for Q3' }, o);
    const p = await call('/api/public/tasks');
    expect(p.status).toBe(200);
    expect(JSON.stringify(p.body)).not.toContain('Secret plan');
    const mine = p.body.tasks.find((x: any) => x.agent === a.id);
    expect(mine.title).toBe('Private task'); expect(mine.status).toBe('queued');
    expect(p.body.tasks.some((x: any) => x.resident)).toBe(true);
    expect((await call('/api/public/tasks', { title: 'x' })).status).not.toBe(201);
  });
});

describe('tasks over MCP', () => {
  it('lists the tools and runs create, update, list', async () => {
    const a = await joined();
    const l = await call('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { ...a.auth, accept: 'application/json, text/event-stream' });
    const names = l.body.result.tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(['city_list_tasks', 'city_create_task', 'city_update_task']));
    const c = parse(await mcp(a.key, 'city_create_task', { title: 'Summarise inbox', total: 2 }));
    expect(c.ok).toBe(true);
    const u = parse(await mcp(a.key, 'city_update_task', { id: c.task.id, step: 1, log: 'Read 12 messages' }));
    expect(u.task.step).toBe(1);
    const bad = await mcp(a.key, 'city_update_task', { id: 't_000000000000' });
    expect(bad.body.result.isError).toBe(true);
    const list = parse(await mcp(a.key, 'city_list_tasks', {}));
    expect(list[0].log.at(-1).text).toBe('Read 12 messages');
  });
  it('docs teach the office', () => {
    const d = joinDoc(U);
    expect(d).toContain('PATCH https://city.example/api/v1/tasks/');
    expect(d).toContain('city_update_task');
  });
});
