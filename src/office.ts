// The office inside a district building: one desk per agent, a live Crew session screen, a task board,
// a crew sidebar with per-agent progress, speech bubbles and an activity feed. Backed by /api/v1/tasks
// (owner), /api/public/tasks (public, read-only) or a local simulation (demo).
import { gsap } from 'gsap';
import './office.css';
import { plat, healthOf, type CityAgent, type FeedItem } from './layout';
import { avatarUri, glyph } from './avatar';

export type TaskStatus = 'queued' | 'in_progress' | 'need_you' | 'done' | 'failed';
export interface Task { id: string; agent: string; title: string; detail?: string; status: TaskStatus; step: number; total: number; log: { at: string; text: string }[]; result?: string; by?: string; created_at: string; updated_at: string; resident?: boolean; private?: boolean }
export interface OfficeCtx { mode: 'demo' | 'signed-out' | 'live' | 'public'; agents: () => CityAgent[]; feed: () => FeedItem[]; chat: (id: string) => void; toast: (html: string) => void }

const NS = 'http://www.w3.org/2000/svg';
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const W = 1240, H = 680, TW = 80, TH = 40, OX = 600, OY = 210, RX = 11, RY = 9, WALL = 175;
const iso = (x: number, y: number, z = 0): [number, number] => [OX + (x - y) * (TW / 2), OY + (x + y) * (TH / 2) - z];
const pts = (p: [number, number][]) => p.map((q) => q.map((n) => n.toFixed(1)).join(',')).join(' ');
/** the part of the 1240×680 world the room actually covers */
const BX = [230, 1070], BY = [20, 610];
const DESKS: [number, number][] = [[1.6, 2.4], [4.4, 2.4], [7.2, 2.4], [1.6, 4.9], [4.4, 4.9], [7.2, 4.9], [1.6, 7.4], [4.4, 7.4], [7.2, 7.4]];
export const STATUS_LABEL: Record<TaskStatus, string> = { queued: 'Queued', in_progress: 'In progress', need_you: 'Needs you', done: 'Done', failed: 'Failed' };
const ago = (iso: string) => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return s < 50 ? 'now' : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

let ctx: OfficeCtx; let k = ''; let tasks: Task[] = []; let poll = 0; let sel = ''; let zoom = 1; let pan = [0, 0]; let fit = 1;
let lastBubble = new Map<string, string>(); let root: HTMLElement | null = null; let night = localStorage.getItem('office:night') === '1';

/** Agent state for the office, from its tasks and its last report. */
export function crewState(a: CityAgent, ts: Task[]): 'working' | 'need' | 'idle' | 'off' {
  if (a.status === 'error' || ts.some((t) => t.status === 'need_you' || t.status === 'failed' && Date.now() - Date.parse(t.updated_at) < 3600_000)) return 'need';
  if (healthOf(a) === 'offline') return 'off';
  if (ts.some((t) => t.status === 'in_progress') || a.status === 'busy') return 'working';
  return 'idle';
}
/** Deterministic demo tasks (same rhythm as the server's residents). */
export function simTasks(rs: CityAgent[], now = Date.now()): Task[] {
  const SLOT = 30_000; const steps = ['Reading the brief', 'Gathering sources', 'Drafting', 'Polishing the result', 'Delivered'];
  return rs.map((r, i) => {
    const n = Math.floor((now + i * 11_000) / SLOT); const ph = n % 6; const t0 = (n - ph) * SLOT - i * 11_000;
    const status: TaskStatus = ph >= 4 ? (ph === 4 ? 'done' : 'queued') : 'in_progress'; const step = status === 'queued' ? 0 : status === 'done' ? 5 : ph + 1;
    return { id: `d-${r.id}-${n - ph}`, agent: r.id, title: r.task || 'Helping the crew', status, step, total: 5, log: status === 'queued' ? [] : steps.slice(0, status === 'done' ? 5 : step).map((text, j) => ({ at: new Date(t0 + j * SLOT).toISOString(), text })), created_at: new Date(t0).toISOString(), updated_at: new Date(now).toISOString(), resident: true, ...(status === 'done' ? { result: 'Finished' } : {}) };
  });
}

const crew = () => ctx.agents().filter((a) => (plat(a.platform) === plat(k))).sort((x, y) => (y.activity ?? 0) - (x.activity ?? 0) || x.name.localeCompare(y.name));
const tasksOf = (id: string) => tasks.filter((t) => t.agent === id);
const current = (id: string) => { const ts = tasksOf(id); return ts.find((t) => t.status === 'need_you') ?? ts.find((t) => t.status === 'in_progress') ?? ts.find((t) => t.status === 'queued') ?? ts.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]; };
const canWrite = () => ctx.mode === 'live';

export function openOffice(platform: string, c: OfficeCtx) {
  ctx = c; k = platform; sel = ''; lastBubble = new Map();
  const p = plat(k);
  root?.remove();
  root = document.createElement('section');
  root.id = 'office'; root.className = `office${night ? ' night' : ''}`; root.setAttribute('aria-label', `${p.label} office`);
  root.style.setProperty('--c', p.top);
  root.innerHTML = `<header class="of-bar">
    <button type="button" class="of-ic" id="of-back" aria-label="Back to the city" title="Back to the city">←</button>
    <span class="of-logo">${glyph(k, 20, true)}</span>
    <div class="of-t"><b>${esc(p.label)} HQ</b><small id="of-sub"></small></div>
    <span class="of-chip ${ctx.mode === 'live' || ctx.mode === 'public' ? 'live' : ''}">${ctx.mode === 'public' ? '<i></i>Live · public · read-only' : ctx.mode === 'live' ? '<i></i>Live · your crew' : 'Demo · simulated'}</span>
    <span class="grow"></span>
    <button type="button" class="of-btn" id="of-tasks"><b id="of-tc">0</b> Tasks</button>
    ${canWrite() ? '<button type="button" class="of-btn primary" id="of-new">+ Assign task</button>' : ''}
    <span class="of-grp"><button type="button" class="of-ic" id="of-zo" aria-label="Zoom out">−</button><button type="button" class="of-ic" id="of-zf" aria-label="Fit">⤢</button><button type="button" class="of-ic" id="of-zi" aria-label="Zoom in">+</button></span>
    <button type="button" class="of-ic" id="of-dn" aria-label="Toggle day and night" title="Day / night">${night ? '☀' : '☾'}</button>
  </header>
  <div class="of-main">
    <div class="of-stage" id="of-stage"><div class="of-world" id="of-world"><svg id="of-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"></svg>
      <div class="of-screen" id="of-screen"></div><button type="button" class="of-board" id="of-board" aria-label="Open the task board"></button><div id="of-people"></div></div>
      <aside class="of-feed" aria-label="Office activity"><h3><i></i>Live activity</h3><ol id="of-feed"></ol></aside>
    </div>
    <aside class="of-side" id="of-side"></aside>
  </div>
  <dialog id="of-dlg"></dialog>`;
  document.body.appendChild(root); document.body.classList.add('in-office');
  drawRoom();
  $('#of-back', root).addEventListener('click', closeOffice);
  $('#of-tasks', root).addEventListener('click', () => board());
  $('#of-board', root).addEventListener('click', () => board());
  $('#of-new', root)?.addEventListener('click', () => assign());
  $('#of-dn', root).addEventListener('click', () => { night = !night; localStorage.setItem('office:night', night ? '1' : '0'); root!.classList.toggle('night', night); $('#of-dn', root!).textContent = night ? '☀' : '☾'; });
  $('#of-zi', root).addEventListener('click', () => setZoom(zoom * 1.25));
  $('#of-zo', root).addEventListener('click', () => setZoom(zoom / 1.25));
  $('#of-zf', root).addEventListener('click', () => { pan = [0, 0]; setZoom(1); });
  bindPan();
  addEventListener('keydown', onKey); addEventListener('resize', onResize);
  if (location.hash !== `#office=${k}`) history.replaceState(null, '', `${location.pathname}${location.search}#office=${k}`);
  zoom = 1; pan = [0, 0]; onResize();
  if (!RM) gsap.from(root, { opacity: 0, scale: 1.02, duration: 0.45, ease: 'expo.out' });
  refresh(); clearInterval(poll); poll = window.setInterval(refresh, ctx.mode === 'demo' || ctx.mode === 'signed-out' ? 2500 : 4000);
}

export function closeOffice() {
  clearInterval(poll); removeEventListener('keydown', onKey); removeEventListener('resize', onResize);
  const r = root; root = null; document.body.classList.remove('in-office');
  if (location.hash.startsWith('#office')) history.replaceState(null, '', location.pathname + location.search);
  if (r) { if (RM) r.remove(); else gsap.to(r, { opacity: 0, duration: 0.25, onComplete: () => r.remove() }); }
}
export const officeOpen = () => !!root;
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !document.querySelector('dialog[open]') && !document.querySelector('#m-chat:not([hidden])')) { if (sel) select(''); else closeOffice(); } }

async function refresh() {
  if (!root) return;
  try {
    if (ctx.mode === 'live') { const r = await fetch('/api/v1/tasks', { credentials: 'include' }); if (r.ok) tasks = (await r.json()).tasks; }
    else if (ctx.mode === 'public') { const r = await fetch('/api/public/tasks'); if (r.ok) tasks = (await r.json()).tasks; }
    else tasks = simTasks(crew());
  } catch { /* keep the last view */ }
  if (root) render();
}

// ---------------------------------------------------------------- scene
function el<K extends keyof SVGElementTagNameMap>(tag: K, a: Record<string, string | number>, parent: Element) { const e = document.createElementNS(NS, tag); for (const n in a) e.setAttribute(n, String(a[n])); parent.appendChild(e); return e; }
/** An iso box: x,y footprint origin; w along x, d along y; z base, h height. Faces get classes for theming. */
function box(g: Element, x: number, y: number, w: number, d: number, z: number, h: number, cls: string) {
  const t = z + h;
  el('polygon', { points: pts([iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, t), iso(x, y + d, t)]), class: `${cls} l` }, g);
  el('polygon', { points: pts([iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, t), iso(x + w, y, t)]), class: `${cls} r` }, g);
  el('polygon', { points: pts([iso(x, y, t), iso(x + w, y, t), iso(x + w, y + d, t), iso(x, y + d, t)]), class: `${cls} t` }, g);
}
function plant(g: Element, x: number, y: number, s = 1) {
  box(g, x, y, 0.5, 0.5, 0, 22 * s, 'pot');
  const [cx, cy] = iso(x + 0.25, y + 0.25, 22 * s);
  for (const [dx, dy, r] of [[0, -18, 15], [-11, -8, 12], [11, -9, 12], [0, -30, 10]]) el('circle', { cx: cx + dx * s, cy: cy + dy * s, r: r * s, class: 'leaf' }, g);
}
function drawRoom() {
  const s = $('#of-svg', root!) as unknown as SVGSVGElement; s.innerHTML = '';
  const defs = el('defs', {}, s);
  defs.innerHTML = `<linearGradient id="ofl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fl1"/><stop offset="1" class="fl2"/></linearGradient><pattern id="ofg" width="${TW}" height="${TH}" patternUnits="userSpaceOnUse" patternTransform="translate(${OX},${OY})"><path d="M0 ${TH / 2}L${TW / 2} 0L${TW} ${TH / 2}L${TW / 2} ${TH}Z" class="grid"/></pattern>`;
  const g = el('g', {}, s);
  el('ellipse', { cx: iso(RX / 2, RY / 2)[0], cy: iso(RX / 2, RY / 2)[1] + 40, rx: 560, ry: 230, class: 'shadow' }, g);
  // slab, floor, rug
  const F = [iso(0, 0), iso(RX, 0), iso(RX, RY), iso(0, RY)];
  el('polygon', { points: pts([iso(0, RY), iso(RX, RY), iso(RX, RY, -18), iso(0, RY, -18)]), class: 'slab l' }, g);
  el('polygon', { points: pts([iso(RX, 0), iso(RX, RY), iso(RX, RY, -18), iso(RX, 0, -18)]), class: 'slab r' }, g);
  el('polygon', { points: pts(F), class: 'floor' }, g);
  el('polygon', { points: pts(F), fill: 'url(#ofg)' }, g);
  el('polygon', { points: pts([iso(1, 1.6), iso(9.4, 1.6), iso(9.4, 8.6), iso(1, 8.6)]), class: 'rug' }, g);
  // walls with windows
  el('polygon', { points: pts([iso(0, 0), iso(RX, 0), iso(RX, 0, WALL), iso(0, 0, WALL)]), class: 'wall r' }, g);
  el('polygon', { points: pts([iso(0, 0), iso(0, RY), iso(0, RY, WALL), iso(0, 0, WALL)]), class: 'wall l' }, g);
  el('polygon', { points: pts([iso(0, 0, WALL), iso(RX, 0, WALL), iso(RX, -0.25, WALL), iso(-0.25, -0.25, WALL), iso(-0.25, RY, WALL), iso(0, RY, WALL)]), class: 'cap' }, g);
  for (const x0 of [7.6, 9.4]) el('polygon', { points: pts([iso(x0, 0, 60), iso(x0 + 1.3, 0, 60), iso(x0 + 1.3, 0, 150), iso(x0, 0, 150)]), class: 'win' }, g);
  for (const y0 of [6.2]) el('polygon', { points: pts([iso(0, y0, 60), iso(0, y0 + 2, 60), iso(0, y0 + 2, 150), iso(0, y0, 150)]), class: 'win' }, g);
  el('polygon', { points: pts([iso(0, RY - 0.1, 0), iso(0, RY - 0.1, 0)]), class: 'skirt' }, g);
  // coffee bar + plants + lounge
  box(g, 9.5, 2.0, 1.2, 3.2, 0, 34, 'bar');
  box(g, 9.65, 2.3, 0.5, 0.5, 34, 22, 'machine');
  for (const yy of [3.3, 4.1]) el('ellipse', { cx: iso(9.95, yy, 36)[0], cy: iso(9.95, yy, 36)[1], rx: 6, ry: 3, class: 'cup' }, g);
  box(g, 9.3, 6.4, 1.4, 1.9, 0, 16, 'sofa'); box(g, 10.3, 6.4, 0.4, 1.9, 16, 16, 'sofa');
  plant(g, 0.3, 0.3, 1.2); plant(g, 10.4, 0.4, 1.1); plant(g, 0.3, 8.3, 1); plant(g, 8.7, 8.2, 0.9);
  // desks
  const dg = el('g', { id: 'of-desks' }, g);
  DESKS.forEach(([x, y], i) => {
    const d = el('g', { class: 'desk', 'data-i': i }, dg);
    box(d, x, y, 1.9, 0.9, 0, 30, 'top');
    box(d, x + 0.35, y + 0.08, 0.16, 0.12, 30, 4, 'stand'); box(d, x + 1.25, y + 0.08, 0.16, 0.12, 30, 4, 'stand');
    box(d, x + 0.15, y + 0.12, 0.62, 0.06, 34, 30, 'mon m1'); box(d, x + 1.0, y + 0.12, 0.62, 0.06, 34, 30, 'mon m2');
    box(d, x + 0.7, y + 0.5, 0.5, 0.18, 30, 2, 'kb');
    box(d, x + 0.75, y + 1.15, 0.5, 0.5, 0, 20, 'chair');
  });
  // wall screen and board positions (HTML, skewed to the wall planes)
  const sc = $('#of-screen', root!); const [sx, sy] = iso(1.2, 0, 160); Object.assign(sc.style, { left: `${sx}px`, top: `${sy}px`, width: `${5.6 * TW / 2}px`, height: '112px' });
  const bd = $('#of-board', root!); const [bx, by] = iso(0, 4.6, 150); Object.assign(bd.style, { left: `${bx}px`, top: `${by}px`, width: `${3.6 * TW / 2}px`, height: '100px' });
}

function render() {
  const list = crew(); const p = plat(k);
  const st = new Map(list.map((a) => [a.id, crewState(a, tasksOf(a.id))]));
  const count = (s: string) => [...st.values()].filter((v) => v === s).length;
  const mine = tasks.filter((t) => list.some((a) => a.id === t.agent));
  const q = mine.filter((t) => t.status === 'queued').length, ip = mine.filter((t) => t.status === 'in_progress' || t.status === 'need_you').length, dn = mine.filter((t) => t.status === 'done').length;
  $('#of-tc', root!).textContent = String(q + ip);
  $('#of-sub', root!).textContent = `${list.length} agent${list.length === 1 ? '' : 's'} · ${count('working')} working${list.length > DESKS.length ? ` · ${list.length - DESKS.length} remote` : ''}`;
  // Crew session screen
  const buckets = new Array(14).fill(0); const now = Date.now(), span = 14 * 60_000 * (ctx.mode === 'demo' || ctx.mode === 'signed-out' ? 1 : 5);
  for (const t of mine) for (const l of t.log) { const i = Math.floor((now - Date.parse(l.at)) / (span / 14)); if (i >= 0 && i < 14) buckets[13 - i]++; }
  for (const f of ctx.feed()) if (list.some((a) => a.id === f.agent)) { const i = Math.floor((now - Date.parse(f.at)) / (span / 14)); if (i >= 0 && i < 14) buckets[13 - i]++; }
  const mx = Math.max(1, ...buckets);
  $('#of-screen', root!).innerHTML = `<div class="scr"><b>Crew session</b><span class="lv"><i></i>live</span></div><div class="cnt"><span><b>${count('working')}</b>Working</span><span class="nd"><b>${count('need')}</b>Need you</span><span><b>${count('idle') + count('off')}</b>Idle</span><span><b>${Math.max(0, DESKS.length - list.length)}</b>Free desks</span></div><div class="bars">${buckets.map((v) => `<i style="height:${Math.round(8 + (v / mx) * 92)}%"></i>`).join('')}</div>`;
  $('#of-board', root!).innerHTML = `<b>Task board</b><small>${q} queued · ${ip} in progress · ${dn} done</small><span class="notes">${mine.filter((t) => t.status !== 'done').slice(0, 4).map((t) => `<i class="${t.status}"></i>`).join('')}</span>`;
  // desks: lights and monitors
  root!.querySelectorAll<SVGGElement>('#of-desks .desk').forEach((d, i) => { const a = list[i]; d.setAttribute('class', `desk ${a ? st.get(a.id) : 'free'}`); });
  // people
  const people = $('#of-people', root!); const seen = new Set<string>();
  list.slice(0, DESKS.length).forEach((a, i) => {
    seen.add(a.id); const [x, y] = DESKS[i]; const [px, py] = iso(x + 1.0, y + 1.4, 24);
    let n = people.querySelector<HTMLElement>(`[data-id="${CSS.escape(a.id)}"]`);
    if (!n) {
      const nb = document.createElement('button'); nb.type = 'button'; n = nb; n.className = 'of-p'; n.dataset.id = a.id;
      n.innerHTML = `<span class="bub" hidden></span><span class="body"></span><img alt="" draggable="false"><span class="dot"></span><span class="nm"></span>`;
      n.addEventListener('click', () => select(a.id)); people.appendChild(n);
      if (!RM) gsap.from(n, { y: -30, opacity: 0, duration: 0.6, ease: 'back.out(2)', delay: i * 0.04 });
    }
    Object.assign(n.style, { left: `${px}px`, top: `${py}px`, zIndex: String(Math.round(10 + (x + y) * 4)) });
    n.style.setProperty('--b', plat(a.platform).top);
    const s = st.get(a.id)!; n.className = `of-p ${s}${sel === a.id ? ' sel' : ''}`;
    const img = n.querySelector('img')!; const src = avatarUri(a.id, a.platform, a.avatar, 64); if (img.getAttribute('src') !== src) img.src = src;
    n.querySelector('.nm')!.textContent = a.name; n.setAttribute('aria-label', `${a.name}, ${s}`);
    const t = current(a.id); const line = t ? (t.log.at(-1)?.text && t.status !== 'queued' ? t.log.at(-1)!.text : t.title) : a.task || '';
    const key = `${t?.id}|${line}|${t?.status}`;
    if (line && lastBubble.get(a.id) !== key && !(t?.private && t.status === 'queued' && !t.log.length)) {
      const first = !lastBubble.has(a.id); lastBubble.set(a.id, key);
      const b = n.querySelector<HTMLElement>('.bub')!; b.textContent = t?.private ? (t.status === 'done' ? 'Done ✓' : `Step ${t.step} of ${t.total}`) : line; b.hidden = false;
      if (!RM && !first) gsap.fromTo(b, { y: 6, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' });
    }
  });
  people.querySelectorAll<HTMLElement>('.of-p').forEach((n) => { if (!seen.has(n.dataset.id!)) n.remove(); });
  // feed
  const items = [
    ...mine.flatMap((t) => t.log.map((l) => ({ at: l.at, agent: t.agent, text: t.private ? STATUS_LABEL[t.status] : l.text }))),
    ...ctx.feed().filter((f) => list.some((a) => a.id === f.agent) && f.kind !== 'message').map((f) => ({ at: f.at, agent: f.agent, text: f.kind === 'join' ? 'joined the office' : f.kind === 'handoff' ? `handed off${f.text ? `: ${f.text}` : ''}` : f.text || 'checked in' })),
  ].sort((a, b) => b.at.localeCompare(a.at)).filter((x, i, arr) => i === 0 || x.text !== arr[i - 1].text || x.agent !== arr[i - 1].agent).slice(0, 7);
  const fhtml = items.length ? items.map((f) => { const a = list.find((x) => x.id === f.agent)!; return `<li><img alt="" src="${avatarUri(a.id, a.platform, a.avatar, 32)}"><p><b>${esc(a.name)}</b> ${esc(f.text)}</p><time>${ago(f.at)}</time></li>`; }).join('') : '<li class="empty">Quiet for now. Activity shows up here live.</li>';
  const fe = $('#of-feed', root!); if (fe.innerHTML !== fhtml) fe.innerHTML = fhtml;
  side(list, st);
  if ($<HTMLDialogElement>('#of-dlg', root!).open && $('#of-dlg', root!).dataset.v === 'board') board(true);
}

// ---------------------------------------------------------------- sidebar: crew list or one agent
function side(list: CityAgent[], st: Map<string, string>) {
  const s = $('#of-side', root!);
  const a = list.find((x) => x.id === sel);
  let html: string;
  if (!a) {
    html = `<h3>Crew <span>${list.length}</span></h3>${list.length ? '' : `<p class="empty">No agents in this building yet.${ctx.mode !== 'public' ? '' : ' Join the city to take a desk.'}</p>`}<ul class="crew">${list.map((x) => {
      const t = current(x.id); const s2 = st.get(x.id)!;
      const line = t ? (t.private ? `${STATUS_LABEL[t.status]} · step ${t.step}/${t.total}` : t.status === 'queued' ? `Queued: ${t.title}` : t.log.at(-1)?.text || t.title) : x.task || (s2 === 'off' ? 'Offline' : 'Idle');
      return `<li><button type="button" data-id="${esc(x.id)}"><img alt="" src="${avatarUri(x.id, x.platform, x.avatar, 40)}"><span class="tx"><b>${esc(x.name)}${x.resident ? ' <em>resident</em>' : ''}</b><small>${esc(line)}</small></span><i class="dot ${s2}" title="${s2}"></i></button></li>`;
    }).join('')}</ul>`;
  } else {
    const ts = tasksOf(a.id).sort((x, y) => y.updated_at.localeCompare(x.updated_at)); const t = current(a.id); const s2 = st.get(a.id)!;
    const pct = t ? Math.round((t.status === 'done' ? 1 : t.step / Math.max(1, t.total)) * 100) : 0;
    html = `<button type="button" class="of-backlink" id="of-crew">← Crew</button>
    <div class="ag"><img alt="" src="${avatarUri(a.id, a.platform, a.avatar, 64)}"><div><b>${esc(a.name)}</b><small>${esc(plat(a.platform).label)} · <i class="dot ${s2}"></i>${{ working: 'Working', need: 'Needs you', idle: 'Idle', off: 'Offline' }[s2]}</small></div></div>
    ${t ? `<div class="cur ${t.status}"><small>Current task · ${STATUS_LABEL[t.status]}</small><b>${esc(t.title)}</b>${t.detail ? `<p>${esc(t.detail)}</p>` : ''}
      <div class="prog"><span>Step ${t.status === 'done' ? t.total : t.step} of ${t.total}</span><span>${pct}%</span></div><div class="pbar"><i style="width:${pct}%"></i></div>
      ${t.log.length ? `<ol class="log">${t.log.slice().reverse().map((l) => `<li><time>${hhmm(l.at)}</time>${esc(l.text)}</li>`).join('')}</ol>` : t.private ? '<p class="mute">Task details are private to this agent’s owner.</p>' : ''}
      ${t.result ? `<div class="res"><small>Result</small>${esc(t.result)}</div>` : ''}
      ${canWrite() && t.status !== 'done' ? `<div class="row"><button type="button" class="of-btn sm" data-done="${t.id}">Mark done</button>${t.status !== 'failed' ? `<button type="button" class="of-btn sm ghost" data-cancel="${t.id}">Cancel task</button>` : ''}</div>` : ''}</div>` : `<p class="empty">No tasks yet.${canWrite() ? ' Assign one below.' : ''}</p>`}
    ${ts.length > 1 ? `<h4>Other tasks</h4><ul class="tl">${ts.filter((x) => x !== t).slice(0, 8).map((x) => `<li><i class="dot ${x.status}"></i><span>${esc(x.title)}</span><time>${ago(x.updated_at)}</time></li>`).join('')}</ul>` : ''}
    <div class="row acts">${canWrite() ? `<button type="button" class="of-btn primary sm" id="of-as">+ Assign task</button>` : ''}<button type="button" class="of-btn sm" id="of-msg">${ctx.mode === 'public' ? 'Wave hello' : 'Message'}</button>${ctx.mode === 'public' && !a.resident ? `<a class="of-btn sm ghost" href="/a/${encodeURIComponent(a.id)}">Page ↗</a>` : ''}</div>`;
  }
  if (s.dataset.html === html) return;
  s.dataset.html = html; s.innerHTML = html;
  s.querySelectorAll<HTMLElement>('.crew button').forEach((b) => b.addEventListener('click', () => select(b.dataset.id!)));
  $('#of-crew', s)?.addEventListener('click', () => select(''));
  $('#of-as', s)?.addEventListener('click', () => assign(sel));
  $('#of-msg', s)?.addEventListener('click', () => ctx.chat(sel));
  s.querySelector<HTMLElement>('[data-done]')?.addEventListener('click', (e) => patch((e.currentTarget as HTMLElement).dataset.done!, { status: 'done', log: 'Marked done by the owner' }));
  s.querySelector<HTMLElement>('[data-cancel]')?.addEventListener('click', (e) => patch((e.currentTarget as HTMLElement).dataset.cancel!, { status: 'failed', log: 'Cancelled by the owner' }));
}
function select(id: string) {
  sel = id; render();
  const n = id ? root!.querySelector<HTMLElement>(`.of-p[data-id="${CSS.escape(id)}"]`) : null;
  if (n && !RM) gsap.fromTo(n.querySelector('img'), { scale: 1.25 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
  if (id && innerWidth <= 820) $('#of-side', root!).scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
}
async function patch(id: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/v1/tasks/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { ctx.toast('Could not update the task'); return; }
  ctx.toast(body.status === 'done' ? 'Task marked done' : 'Task cancelled'); refresh();
}

// ---------------------------------------------------------------- dialogs: task board, assign
function board(again = false) {
  const d = $<HTMLDialogElement>('#of-dlg', root!); d.dataset.v = 'board';
  const list = crew(); const mine = tasks.filter((t) => list.some((a) => a.id === t.agent));
  const cols: [string, TaskStatus[]][] = [['Queued', ['queued']], ['In progress', ['in_progress', 'need_you']], ['Done', ['done', 'failed']]];
  const html = `<form method="dialog"><header><h2>Task board <small>${esc(plat(k).label)} HQ</small></h2><span class="grow"></span>${canWrite() ? '<button type="button" class="of-btn primary sm" id="of-bn">+ Assign task</button>' : ''}<button class="of-ic" value="x" aria-label="Close">×</button></header>
  ${ctx.mode === 'public' ? '<p class="mute">Read-only public view. Task text stays private unless the agent shares it; residents are demo agents.</p>' : ctx.mode === 'live' ? '' : '<p class="mute">Demo tasks. Sign in as the owner to assign real tasks to your agents.</p>'}
  <div class="cols">${cols.map(([n, ss]) => { const ts = mine.filter((t) => ss.includes(t.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); return `<section><h3>${n} <span>${ts.length}</span></h3>${ts.slice(0, 30).map((t) => { const a = list.find((x) => x.id === t.agent)!; return `<button type="button" class="card ${t.status}" data-a="${esc(a.id)}"><b>${esc(t.title)}</b><span class="who"><img alt="" src="${avatarUri(a.id, a.platform, a.avatar, 24)}">${esc(a.name)}<em>${t.status === 'need_you' ? 'Needs you' : t.status === 'failed' ? 'Failed' : t.status === 'in_progress' ? `${t.step}/${t.total}` : ago(t.updated_at)}</em></span>${t.status === 'in_progress' || t.status === 'need_you' ? `<span class="pbar"><i style="width:${Math.round((t.step / Math.max(1, t.total)) * 100)}%"></i></span>` : ''}</button>`; }).join('') || '<p class="empty">Nothing here</p>'}</section>`; }).join('')}</div></form>`;
  if (again && d.dataset.html === html) return;
  d.dataset.html = html; d.innerHTML = html;
  d.querySelectorAll<HTMLElement>('.card').forEach((c) => c.addEventListener('click', () => { d.close(); select(c.dataset.a!); }));
  $('#of-bn', d)?.addEventListener('click', () => assign());
  if (!d.open) d.showModal();
}
function assign(agent = '') {
  const d = $<HTMLDialogElement>('#of-dlg', root!); d.dataset.v = 'assign'; d.dataset.html = '';
  const all = ctx.agents().filter((a) => !a.resident); const here = crew().filter((a) => !a.resident);
  const opts = [...here, ...all.filter((a) => !here.includes(a))];
  d.innerHTML = `<form id="of-af"><header><h2>Assign a task</h2><span class="grow"></span><button type="button" class="of-ic" id="of-ax" aria-label="Close">×</button></header>
  ${opts.length ? `<label>Agent<select name="agent" required>${opts.map((a) => `<option value="${esc(a.id)}"${a.id === (agent || here[0]?.id) ? ' selected' : ''}>${esc(a.name)} · ${esc(plat(a.platform).label)}</option>`).join('')}</select></label>
  <label>Task<input name="title" required maxlength="160" placeholder="e.g. Summarise this week’s support tickets" autocomplete="off"></label>
  <label>Details <small>optional</small><textarea name="detail" maxlength="2000" rows="3" placeholder="Context, links, what done looks like"></textarea></label>
  <p class="mute">The agent gets it in its inbox (and webhook, if it has one) and reports each step back here.</p>
  <div class="row"><span class="grow"></span><button type="button" class="of-btn ghost" id="of-ac">Cancel</button><button class="of-btn primary" id="of-ago">Assign</button></div>` : '<p class="empty">Connect an agent first, then assign it work here.</p>'}</form>`;
  const close = () => d.close();
  $('#of-ax', d).addEventListener('click', close); $('#of-ac', d)?.addEventListener('click', close);
  $('#of-af', d).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target as HTMLFormElement); const b = $<HTMLButtonElement>('#of-ago', d); b.disabled = true;
    const r = await fetch('/api/v1/tasks', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: f.get('agent'), title: f.get('title'), detail: f.get('detail') || undefined }) }).catch(() => null);
    b.disabled = false;
    if (!r || !r.ok) { const j = await r?.json().catch(() => null); ctx.toast(esc(j?.error || 'Could not assign the task')); return; }
    const j = await r.json(); tasks = [j.task, ...tasks]; close(); ctx.toast(`Task assigned to ${esc(opts.find((a) => a.id === j.task.agent)?.name || j.task.agent)}`);
    if (plat(opts.find((a) => a.id === j.task.agent)?.platform || k) === plat(k)) select(j.task.agent); else render();
  });
  if (!d.open) d.showModal();
  setTimeout(() => d.querySelector<HTMLInputElement>('input[name=title]')?.focus(), 30);
}

// ---------------------------------------------------------------- zoom / pan
function onResize() { if (!root) return; const st = $('#of-stage', root); const r = st.getBoundingClientRect(); fit = Math.min(r.width / (BX[1] - BX[0]), (r.height - (r.width <= 820 ? 120 : 0)) / (BY[1] - BY[0])) * 0.96; apply(); }
function setZoom(z: number) { zoom = Math.min(3, Math.max(0.6, z)); apply(true); }
function apply(anim = false) {
  const w = $('#of-world', root!); const s = fit * zoom;
  const st = $('#of-stage', root!).getBoundingClientRect();
  const x = (st.width - (BX[0] + BX[1]) * s) / 2 + pan[0], y = (st.height - (st.width <= 820 ? 120 : 0) - (BY[0] + BY[1]) * s) / 2 + pan[1];
  if (anim && !RM) gsap.to(w, { x, y, scale: s, duration: 0.35, ease: 'expo.out', transformOrigin: '0 0' }); else gsap.set(w, { x, y, scale: s, transformOrigin: '0 0' });
}
function bindPan() {
  const st = $('#of-stage', root!); let start: [number, number, number, number] | null = null;
  st.addEventListener('pointerdown', (e) => { if ((e.target as Element).closest('button, .of-feed') || zoom <= 1) return; start = [e.clientX, e.clientY, pan[0], pan[1]]; st.setPointerCapture(e.pointerId); st.classList.add('drag'); });
  st.addEventListener('pointermove', (e) => { if (!start) return; pan = [start[2] + e.clientX - start[0], start[3] + e.clientY - start[1]]; apply(); });
  const end = () => { start = null; st.classList.remove('drag'); };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  st.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });
}
