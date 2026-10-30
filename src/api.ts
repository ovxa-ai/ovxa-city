import type { Bot } from './data';
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
export type Mode = 'demo' | 'signed-out' | 'live';
async function j(path: string, init?: RequestInit) {
  const r = await fetch(BASE + path, { credentials: 'include', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('no-backend');
  return { ok: r.ok, status: r.status, body: await r.json() };
}
export async function detect(): Promise<Mode> {
  if (new URLSearchParams(location.search).has('demo')) return 'demo';
  try { const r = await j('/api/me'); return r.body?.owner ? 'live' : 'signed-out'; } catch { return 'demo'; }
}
export async function state(): Promise<{ bots: Bot[]; log: any[] } | null> {
  try { const r = await j('/api/state'); return r.ok ? r.body : null; } catch { return null; }
}
export async function login(password: string) { try { return (await j('/api/login', { method: 'POST', body: JSON.stringify({ password }) })).ok; } catch { return false; } }
export async function logout() { try { await j('/api/logout', { method: 'POST' }); } catch { /* ignore */ } }
export async function decide(bot_id: string, request_id: string, decision: 'approve' | 'decline') {
  try { return (await j('/api/decision', { method: 'POST', body: JSON.stringify({ bot_id, request_id, decision }) })).ok; } catch { return false; }
}
