// Rate limits, buffered counters and a KV guard: none of these spend KV writes.
// Works on the free plan (isolate memory + per-colo Cache API) and gets a global
// hard limit when the Cloudflare Rate Limiting bindings (RL, RL_AUTH) are present.

export interface RateBinding { limit(o: { key: string }): Promise<{ success: boolean }> }
type KV = KVNamespace;
type Ctx = { waitUntil(p: Promise<unknown>): void } | undefined;

export const RAW = Symbol('raw');
export const rawOf = (kv: object): object => (kv as any)[RAW] ?? kv;
const mem = new WeakMap<object, Map<string, { n: number; exp: number }>>();
const store = (s: object) => { const scope = rawOf(s); let m = mem.get(scope); if (!m) { m = new Map(); mem.set(scope, m); } return m; };
const cacheOf = (): Cache | undefined => (typeof caches !== 'undefined' ? ((caches as any).default as Cache | undefined) : undefined);
const ckey = (k: string) => `https://rl.ovxa.invalid/${encodeURIComponent(k)}`;

/** True when `who` is still under `max` hits in the current `windowSec` window. */
export async function hit(scope: object, binding: RateBinding | undefined, who: string, max: number, windowSec = 60, ctx?: Ctx): Promise<boolean> {
  if (binding) { try { if (!(await binding.limit({ key: who })).success) return false; } catch { /* binding unavailable: fall through */ } }
  const now = Date.now(), bucket = Math.floor(now / (windowSec * 1000)), k = `${who}:${bucket}`;
  const m = store(scope);
  if (m.size > 5000) for (const [kk, v] of m) if (v.exp < now) m.delete(kk);
  let n = m.get(k)?.n ?? 0;
  const cache = cacheOf();
  if (cache) { try { const r = await cache.match(ckey(k)); if (r) n = Math.max(n, Number(await r.text()) || 0); } catch { /* ignore */ } }
  if (n >= max) return false;
  n++; m.set(k, { n, exp: now + windowSec * 1000 });
  if (cache) { const p = cache.put(ckey(k), new Response(String(n), { headers: { 'cache-control': `max-age=${windowSec + 5}` } })).catch(() => {}); ctx ? ctx.waitUntil(p) : await p; }
  return true;
}

/** Read the current count without adding to it. */
export async function peek(scope: object, who: string, windowSec: number): Promise<number> {
  const k = `${who}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  let n = store(scope).get(k)?.n ?? 0;
  const cache = cacheOf();
  if (cache) { try { const r = await cache.match(ckey(k)); if (r) n = Math.max(n, Number(await r.text()) || 0); } catch { /* ignore */ } }
  return n;
}

// ---- buffered counters: add in memory, flush to KV at most once a minute per key per isolate
const pending = new WeakMap<object, Map<string, { add: number; last: number; ttl?: number }>>();
export const FLUSH_MS = 60_000;
export async function bump(kv: KV, key: string, ttl?: number, ctx?: Ctx, force = false) {
  const r = rawOf(kv); let m = pending.get(r); if (!m) { m = new Map(); pending.set(r, m); }
  const e = m.get(key) ?? { add: 0, last: 0, ttl }; e.add++; m.set(key, e);
  if (!force && Date.now() - e.last < FLUSH_MS) return;
  const add = e.add; e.add = 0; e.last = Date.now();
  const p = (async () => { const cur = Number((await kv.get(key)) || 0); await kv.put(key, String(cur + add), ttl ? { expirationTtl: ttl } : undefined); })().catch(() => { e.add += add; });
  ctx ? ctx.waitUntil(p) : await p;
}
/** Counter value including what this isolate has not flushed yet. */
export async function count(kv: KV, key: string) { return Number((await kv.get(key)) || 0) + (pending.get(rawOf(kv))?.get(key)?.add ?? 0); }

// ---- KV guard: a failed write (quota, outage) becomes a clean 503 instead of a crash; reads keep working
export class KvFull extends Error { constructor() { super('kv write failed'); } }
export function guardKV(kv: KV): KV {
  return new Proxy(kv as any, {
    get(t, p) {
      if (p === RAW) return t;
      const v = t[p];
      if (p === 'put' || p === 'delete') return async (...a: unknown[]) => { try { return await v.apply(t, a); } catch (e) { console.error('kv write failed', (e as Error)?.message); throw new KvFull(); } };
      return typeof v === 'function' ? v.bind(t) : v;
    },
  }) as KV;
}
