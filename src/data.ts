/** Scene geometry is in the 1024×576 coordinate space of the base illustration. */
export interface Slot { id: string; x: number; top: number; w: number; h: number; color: string }
export const SLOTS: Record<string, Slot> = {
  hq:     { id: 'hq',     x: 515, top: 20,  w: 110, h: 270, color: '#8a6fd6' },
  router: { id: 'router', x: 405, top: 95,  w: 90,  h: 160, color: '#5b8ee0' },
  w1:     { id: 'w1',     x: 650, top: 112, w: 110, h: 160, color: '#3fb3a3' },
  w2:     { id: 'w2',     x: 763, top: 168, w: 115, h: 140, color: '#4caf6a' },
  w3:     { id: 'w3',     x: 305, top: 135, w: 120, h: 150, color: '#e07a8a' },
};
export const TOWN_HALL = { x: 185, top: 170, w: 130, h: 180, color: '#c9b48a', door: { x: 232, y: 330 } };
export const LOT = { x: 850, top: 238, w: 190, h: 150, color: '#d9a441', mast: { x: 860, y: 238 } };
export const WORKER_SLOTS = ['w1', 'w2', 'w3'];

export interface Pending { id: string; title: string; detail?: string; kind?: string; created_at?: string }
export interface Bot {
  id: string; name: string; role: string; status: 'ok' | 'busy' | 'error' | 'idle';
  message?: string; pending: Pending[]; updated_at: string; first_seen: string;
}
export interface Placed { bot: Bot; slot: Slot }

const NEW_MS = 48 * 3600 * 1000;
/** Map N bots onto the island. Chief → HQ, router → blue tower, others fill worker slots.
 *  Bots seen for the first time in the last 48h, and any overflow, go to the construction lot. */
export function place(bots: Bot[], now = Date.now()) {
  const placed: Placed[] = []; const lot: Bot[] = [];
  const free = ['hq', 'router', ...WORKER_SLOTS];
  const take = (id: string) => { const i = free.indexOf(id); if (i < 0) return null; free.splice(i, 1); return SLOTS[id]; };
  const isNew = (b: Bot) => !!b.first_seen && now - new Date(b.first_seen).getTime() < NEW_MS;
  const ordered = [...bots].sort((a, b) => rank(a.role) - rank(b.role));
  for (const b of ordered) {
    if (isNew(b) && b.role !== 'chief' && b.role !== 'router') { lot.push(b); continue; }
    const s = (b.role === 'chief' && take('hq')) || (b.role === 'router' && take('router')) ||
      take(free.find((f) => WORKER_SLOTS.includes(f)) ?? free[0] ?? '');
    s ? placed.push({ bot: b, slot: s }) : lot.push(b);
  }
  return { placed, lot, vacant: free.map((f) => SLOTS[f]) };
}
const rank = (r: string) => (r === 'chief' ? 0 : r === 'router' ? 1 : 2);

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60000).toISOString();
export function demoBots(lang: 'en' | 'he'): Bot[] {
  const H = lang === 'he';
  return [
    { id: 'chief', name: H ? 'ראש המטה' : 'Chief of Staff', role: 'chief', status: 'ok', pending: [], updated_at: iso(1), first_seen: iso(9000) },
    { id: 'grok', name: 'Grok Bot', role: 'router', status: 'busy', updated_at: iso(1), first_seen: iso(9000),
      pending: [{ id: 'd1', title: H ? 'לשלוח סיכום שבועי לצוות (טיוטה)' : 'Send the weekly summary to the team (draft)', created_at: iso(2) }] },
    { id: 'ops', name: H ? 'תפעול' : 'Ops', role: 'worker', status: 'ok', updated_at: iso(3), first_seen: iso(9000),
      pending: [{ id: 'd2', title: H ? 'לקבוע פגישת היכרות ביומן' : 'Book an intro call on the calendar', created_at: iso(18) }] },
    { id: 'code', name: H ? 'קוד' : 'Code', role: 'worker', status: 'busy', updated_at: iso(1), first_seen: iso(9000),
      pending: [{ id: 'd3', title: H ? 'למזג שינוי לענף הראשי' : 'Merge a change into main', created_at: iso(11) }] },
    { id: 'growth', name: H ? 'צמיחה' : 'Growth', role: 'worker', status: 'ok', updated_at: iso(5), first_seen: iso(9000),
      pending: [{ id: 'd4', title: H ? 'לפרסם פוסט דוגמה בבלוג' : 'Publish a sample blog post', created_at: iso(6) }] },
    { id: 'research', name: H ? 'מחקר' : 'Research', role: 'worker', status: 'idle', updated_at: '', first_seen: iso(30), pending: [] },
  ];
}
