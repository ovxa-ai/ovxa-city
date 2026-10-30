/** Pure layout for the universal city: platforms -> districts, agents -> lots. Tested in src/layout.test.ts. */
export interface CityAgent {
  id: string; name: string; platform: string; status: 'ok' | 'busy' | 'error' | 'idle';
  task?: string; health?: 'live' | 'stale' | 'offline'; activity?: number; pending?: number;
  updated_at?: string; first_seen?: string; metrics?: Record<string, number>;
}
export interface FeedItem { at: string; agent: string; name: string; platform: string; kind: 'join' | 'status' | 'handoff' | 'error' | 'message'; text?: string; to?: string; thread?: string }

/** Neutral brand-inspired palette. Names only, no logos. */
export const PLATFORM: Record<string, { label: string; hue: string; top: string; left: string; right: string }> = {};
const def = (k: string, label: string, top: string, left: string, right: string) => (PLATFORM[k] = { label, hue: top, top, left, right });
def('openai', 'OpenAI', '#5ee0b5', '#2fae86', '#1f7f63');
def('grokbot', 'Grok Bot', '#c9cdd8', '#8d93a6', '#626a80');
def('claude', 'Claude · MCP', '#f0a27a', '#d07650', '#a65738');
def('openclaw', 'OpenClaw', '#ff7a7a', '#d9505a', '#a83a48');
def('muse', 'Muse', '#c49bff', '#9c6ef0', '#7650c4');
def('langchain', 'LangChain', '#7fd3ff', '#4aa6dc', '#337eb0');
def('crewai', 'CrewAI', '#ffb35c', '#e08a30', '#b06a22');
def('n8n', 'n8n', '#ff8fb8', '#e0608f', '#b0466e');
def('gemini', 'Gemini', '#8fb0ff', '#5f84e8', '#4563b8');
def('custom', 'Custom', '#e8e2c8', '#b8b090', '#8c8668');
export const plat = (k: string) => PLATFORM[k] ?? PLATFORM.custom;

/** Block coordinates in a spiral around the plaza at (0,0). */
export function spiral(n: number): [number, number][] {
  const out: [number, number][] = [];
  const ring1: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const p of ring1) out.push(p);
  for (let r = 2; out.length < n; r++) for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) if (Math.max(Math.abs(x), Math.abs(y)) === r) out.push([x, y]);
  return out.slice(0, n);
}

export const LOTS = 9; // 3×3 per district
export interface Lot { agent: CityAgent; bx: number; by: number; gx: number; gy: number; height: number }
export interface District { platform: string; bx: number; by: number; agents: CityAgent[]; overflow: number; lots: Lot[] }

/** Building height: base + log of recent activity, capped. Busy agents get a small boost. */
export function heightOf(a: CityAgent) {
  const act = a.activity ?? 1;
  return Math.round(Math.min(34 + Math.log2(1 + act) * 20 + (a.status === 'busy' ? 10 : 0), 150));
}

export function layoutCity(agents: CityAgent[]): District[] {
  const by = new Map<string, CityAgent[]>();
  for (const a of agents) { const k = PLATFORM[a.platform] ? a.platform : 'custom'; (by.get(k) ?? by.set(k, []).get(k)!).push(a); }
  // stable district order: first-seen platform first, so blocks do not jump around when counts change
  const firstSeen = (list: CityAgent[]) => Math.min(...list.map((a) => (a.first_seen ? Date.parse(a.first_seen) : 0)));
  const keys = [...by.keys()].sort((a, b) => firstSeen(by.get(a)!) - firstSeen(by.get(b)!) || a.localeCompare(b));
  const pos = spiral(keys.length);
  return keys.map((k, i) => {
    const list = [...by.get(k)!].sort((a, b) => (a.first_seen ?? '').localeCompare(b.first_seen ?? '') || a.id.localeCompare(b.id));
    const [bx, byy] = pos[i];
    const lots = list.slice(0, LOTS).map((agent, j) => ({ agent, bx, by: byy, gx: j % 3, gy: Math.floor(j / 3), height: heightOf(agent) }));
    return { platform: k, bx, by: byy, agents: list, overflow: Math.max(0, list.length - LOTS), lots };
  });
}

export function healthOf(a: CityAgent, now = Date.now()): 'live' | 'stale' | 'offline' {
  if (a.health) return a.health;
  if (!a.updated_at) return 'offline';
  const age = now - Date.parse(a.updated_at);
  return age > 6 * 3600_000 ? 'offline' : age > 15 * 60_000 ? 'stale' : 'live';
}
