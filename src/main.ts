import { gsap } from 'gsap';
import './style.css';
import { t, lang, setLang, ago } from './i18n';
import { place, demoBots, TOWN_HALL, LOT, type Bot, type Placed, type Slot, type Pending } from './data';
import * as api from './api';
import { mountCars } from './cars';
import { renderShare, share } from './share';
import WINDOWS from './windows.json';

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GH = 'https://github.com/ovxa-ai/ovxa-city';
const NS = 'http://www.w3.org/2000/svg';
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let mode: api.Mode = 'demo';
let bots: Bot[] = [];
let night = localStorage.getItem('ovxa.night') === '1' || (localStorage.getItem('ovxa.night') == null && new Date().getHours() >= 20);
let layout: ReturnType<typeof place>;
let stats = { a: 0, d: 0 };
const log: { title: string; ok: boolean }[] = [];
let sheetOpen = false;
let first = true;
let tick: ((t: number, dt: number) => void) | null = null;
let resizeBound = false;

setLang(lang);
boot();

async function boot() {
  mode = await api.detect();
  if (mode === 'live') { const s = await api.state(); bots = s?.bots ?? []; } else bots = demoBots(lang);
  render();
  if (mode === 'live') setInterval(async () => { const s = await api.state(); if (s) { bots = s.bots; refreshData(); } }, 20000);
}

function shell() {
  const demo = mode !== 'live';
  return `
<header class="top">
  <a class="brand" href="${GH}" aria-label="OVXA City on GitHub"><span class="logo" aria-hidden="true">
    <svg viewBox="0 0 64 64"><path d="M32 12 50 22v20L32 52 14 42V22z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M32 32 50 22M32 32v20M32 32 14 22" stroke="#fff" stroke-width="4" opacity=".7"/></svg></span>
    <span><b>OVXA City</b><small>${t('brandSub')}</small></span></a>
  <div class="ctrls">
    <span class="chip ${demo ? 'demo' : 'live'}" role="status">${demo ? t('demo') : t('live')}</span>
    <div class="seg" role="group" aria-label="${t('day')} / ${t('night')}"><span class="pill" aria-hidden="true"></span>
      <button data-m="day" aria-pressed="${!night}">${t('day')}</button><button data-m="night" aria-pressed="${night}">${t('night')}</button></div>
    <button class="btn ghost" id="lang" lang="${lang === 'he' ? 'en' : 'he'}">${t('language')}</button>
    <button class="btn" id="share"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3m0 0L6 7m4-4 4 4M4 11v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${t('share')}</span></button>
    ${mode === 'signed-out' ? `<button class="btn ghost" id="signin">${t('signIn')}</button>` : ''}
    ${mode === 'live' ? `<button class="btn ghost" id="signout">${t('signOut')}</button>` : ''}
  </div>
</header>
${demo ? `<section class="hero" aria-labelledby="hero-t"><h1 id="hero-t">${t('heroTitle')}</h1><p>${t('heroBody')}</p>
  <div class="cta"><a class="btn primary" href="${GH}#5-minute-setup">${t('heroCta')}</a><a class="btn ghost" href="${GH}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2.5 2.3 4.7 5.2.7-3.8 3.7.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 7.9l5.2-.7z" fill="currentColor"/></svg>${t('heroStar')}</a></div></section>` : ''}
<div id="stage" tabindex="-1"><div id="scene">
  <img id="imgD" src="/city-day.webp" alt="" width="1280" height="720" decoding="async">
  <img id="imgN" src="/city-night.webp" alt="" width="1280" height="720" decoding="async" loading="lazy">
  <svg id="fx" viewBox="0 0 1024 576" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <radialGradient id="glow"><stop offset="0" stop-color="#fff3c4" stop-opacity=".95"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
      <radialGradient id="glowG"><stop offset="0" stop-color="#b6ffcf" stop-opacity=".9"/><stop offset="1" stop-color="#4cff9a" stop-opacity="0"/></radialGradient>
      <radialGradient id="headlight"><stop offset="0" stop-color="#fff7d6" stop-opacity=".8"/><stop offset="1" stop-color="#fff7d6" stop-opacity="0"/></radialGradient>
      <radialGradient id="red"><stop offset="0" stop-color="#ff5050"/><stop offset=".35" stop-color="#ff5050" stop-opacity=".6"/><stop offset="1" stop-color="#ff5050" stop-opacity="0"/></radialGradient>
      <radialGradient id="sel"><stop offset="0" stop-color="#8f7bff" stop-opacity=".5"/><stop offset="1" stop-color="#8f7bff" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse id="selG" rx="80" ry="30" fill="url(#sel)" opacity="0"/>
    <g id="wins"></g><g id="cars"></g><g id="build"></g>
    <circle id="spire" cx="515" cy="17" r="8" fill="url(#red)"/>
    <circle id="craneL" cx="${LOT.mast.x}" cy="${LOT.mast.y}" r="7" fill="url(#red)"/>
    <g id="pins"></g><g id="couriers"></g>
  </svg>
  <div id="hs"></div>
</div></div>
<div id="tip" role="tooltip"><b></b><span></span></div>
<p class="swipe" aria-hidden="true">${t('swipe')}</p>
<aside id="queue" class="${sheetOpen ? 'open' : ''}" aria-labelledby="q-t">
  <button class="grab" id="grab" aria-expanded="${sheetOpen}" aria-controls="qbody"><span></span></button>
  <div class="qh"><div class="row"><h2 id="q-t"><span class="th-ic" aria-hidden="true"></span>${t('townHall')} · ${t('queueTitle')}</h2><span class="cnt" id="cnt" aria-live="polite">0</span></div>
    <p>${t('queueSub')}</p>${demo ? `<span class="tag" title="${esc(t('demoNote'))}">${t('demo')}</span>` : ''}</div>
  <div id="qbody"><ul id="list" role="list"></ul>
  <div class="qf"><div class="stats"><span>${t('approved')} <b id="sA">${stats.a}</b></span><span>${t('declined')} <b id="sD">${stats.d}</b></span></div><div id="log" aria-live="polite"></div></div></div>
</aside>
<div id="toast" role="status" aria-live="polite"></div>
<dialog id="login"><form method="dialog" id="loginForm"><h2>${t('signIn')}</h2>
  <label>${t('password')}<input type="password" name="pw" autocomplete="current-password" required></label>
  <p class="err" id="loginErr" hidden>${t('wrongPw')}</p>
  <div class="row"><button class="btn ghost" value="cancel" formnovalidate>${t('cancel')}</button><button class="btn primary" value="ok">${t('signInBtn')}</button></div></form></dialog>`;
}

function render() {
  const app = $('#app');
  app.innerHTML = shell();
  document.body.classList.toggle('night', night);
  document.body.classList.toggle('is-demo', mode !== 'live');
  gsap.set('#imgN,#nightbg', { opacity: night ? 1 : 0 }); gsap.set('#imgD', { opacity: night ? 0 : 1 });
  fit(); if (!resizeBound) { resizeBound = true; addEventListener('resize', fit); }
  drawWindows(); refreshData(); bindChrome();
  const cars = mountCars($<SVGGElement>('#cars'));
  cars.draw();
  if (tick) gsap.ticker.remove(tick);
  tick = (_: number, dt: number) => { if (!RM) cars.step(Math.min(dt, 60) / 1000); };
  gsap.ticker.add(tick);
  if (!RM) {
    gsap.to('#spire', { opacity: 0.15, duration: 0.9, repeat: -1, yoyo: true, ease: 'steps(1)' });
    gsap.to('#craneL', { opacity: 0.15, duration: 0.9, repeat: -1, yoyo: true, ease: 'steps(1)', delay: 0.45 });
  }
  setNight(night, true);
  if (first) { first = false; intro(); }
}

function fit() {
  const scene = $('#scene'), stage = $('#stage');
  const W = innerWidth, H = innerHeight, mob = W < 760, rtl = lang === 'he';
  let w: number, h: number, x: number, y: number;
  if (mob) {
    // island ≈ 1.75× the viewport width: big enough to read, pan to explore
    w = Math.max(W * 1.95, 640); h = w * 9 / 16;
    const top = 64 + (mode !== 'live' ? 128 : 0), avail = H - top - 96;
    if (h > avail) { h = Math.max(avail, 300); w = h * 16 / 9; }
    x = 0; y = top + Math.max(0, (avail - h) / 2);
    stage.classList.add('pan');
    scene.style.cssText = `width:${w}px;height:${h}px;left:0;top:${y}px`;
    requestAnimationFrame(() => { stage.scrollLeft = rtl ? -(w - W) * 0.5 : (w - W) * 0.52; });
    return;
  }
  stage.classList.remove('pan');
  const card = 392, aw = W - card - 24, ah = H - 64;
  w = Math.min(aw * 1.1, ah * 16 / 9 * 1.1); h = w * 9 / 16;
  x = (rtl ? card + 0 : 0) + (aw - w) / 2 + (rtl ? 0 : 12); y = 64 + (ah - h) / 2 + 8;
  scene.style.cssText = `width:${w}px;height:${h}px;left:${x}px;top:${y}px`;
}

// ------------------------------------------------------------------ scene data
function slotOf(botId: string): Slot | null { return layout.placed.find((p) => p.bot.id === botId)?.slot ?? (layout.lot.some((b) => b.id === botId) ? { id: 'lot', ...LOT } : null); }

function refreshData() {
  layout = place(bots);
  drawHotspots(); drawPins(); drawConstruction(); drawQueue();
}

function drawHotspots() {
  const root = $('#hs'); root.innerHTML = '';
  const add = (key: string, s: { x: number; top: number; w: number; h: number }, name: string, role: string, onClick?: () => void) => {
    const b = document.createElement('button'); b.className = 'hs'; b.dataset.k = key;
    b.setAttribute('aria-label', `${name}. ${role}`);
    Object.assign(b.style, { left: `${(s.x - s.w / 2) / 10.24}%`, top: `${s.top / 5.76}%`, width: `${s.w / 10.24}%`, height: `${s.h / 5.76}%` });
    const on = () => showTip(s, name, role, key); const off = () => hideTip(key);
    b.addEventListener('pointerenter', on); b.addEventListener('focus', on); b.addEventListener('pointerleave', off); b.addEventListener('blur', off);
    b.addEventListener('click', () => { on(); onClick?.(); });
    root.appendChild(b);
  };
  const th = { x: TOWN_HALL.x, top: TOWN_HALL.top, w: TOWN_HALL.w, h: TOWN_HALL.h };
  add('th', th, t('townHall'), t('townHallRole'), () => { sheetOpen = true; syncSheet(); $('#queue').focus?.(); });
  for (const p of layout.placed) {
    const n = p.bot.pending.length;
    add(p.bot.id, p.slot, p.bot.name, `${t(('role_' + (p.bot.role in { chief: 1, router: 1 } ? p.bot.role : 'worker')) as 'role_worker')} · ${t(('status_' + p.bot.status) as 'status_ok')}${n ? ` · ${n} ${t('pending')}` : ''}`,
      () => flashItems(p.bot.id));
  }
  for (const v of layout.vacant) add('v-' + v.id, v, t('vacant'), t('vacantRole'));
  add('lot', LOT, layout.lot.length ? `${t('construction')}` : t('vacant'),
    layout.lot.length ? `${t('constructionRole')} ${layout.lot.map((b) => b.name).join(', ')}` : t('vacantRole'));
}

function showTip(s: { x: number; top: number; h: number }, name: string, role: string, key: string) {
  const tip = $('#tip'), sr = $('#scene').getBoundingClientRect();
  tip.querySelector('b')!.textContent = name; tip.querySelector('span')!.textContent = role;
  const tw = tip.offsetWidth || 200;
  let L = sr.left + (s.x / 1024) * sr.width; const T = sr.top + (s.top / 576) * sr.height - 30;
  L = Math.min(Math.max(L, 12 + tw / 2), innerWidth - 12 - tw / 2);
  gsap.killTweensOf(tip);
  gsap.fromTo(tip, { opacity: 0, y: 6, left: L, top: Math.max(T, 70) }, { opacity: 1, y: 0, duration: RM ? 0 : 0.2, ease: 'power2.out', delay: RM ? 0 : 0.05 });
  const sel = $<SVGEllipseElement>('#selG'); sel.setAttribute('cx', String(s.x)); sel.setAttribute('cy', String(s.top + s.h * 0.95));
  gsap.to(sel, { opacity: 1, duration: 0.3 });
  gsap.to(`#pin-${key} .pi`, { scale: 1.15, transformOrigin: '50% 100%', duration: 0.25, ease: 'back.out(3)' });
}
function hideTip(key: string) {
  gsap.to('#tip', { opacity: 0, duration: 0.15 }); gsap.to('#selG', { opacity: 0, duration: 0.3 });
  gsap.to(`#pin-${key} .pi`, { scale: 1, duration: 0.2 });
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); parent?.appendChild(e); return e;
}

function drawPins() {
  const g = $('#pins');
  const want = new Map<string, { s: Slot; n: number }>();
  for (const p of layout.placed) if (p.bot.pending.length) want.set(p.bot.id, { s: p.slot, n: p.bot.pending.length });
  for (const b of layout.lot) if (b.pending.length) want.set(b.id, { s: { id: 'lot', ...LOT }, n: b.pending.length });
  g.querySelectorAll<SVGGElement>(':scope > g').forEach((el) => {
    const id = el.id.slice(4); if (!want.has(id)) { el.id = ''; gsap.to(el.querySelector('.pi'), { scale: 0.6, opacity: 0, transformOrigin: '50% 100%', duration: 0.25, ease: 'power2.in', onComplete: () => el.remove() }); }
  });
  for (const [id, { s, n }] of want) {
    let el = document.getElementById('pin-' + id) as SVGGElement | null;
    if (!el) {
      el = svg('g', { id: 'pin-' + id, transform: `translate(${s.x},${s.top - 8})` }, g);
      const pi = svg('g', { class: 'pi' }, el);
      svg('path', { d: 'M0 0 C-2 -4 -9 -7 -9 -13 A9 9 0 1 1 9 -13 C9 -7 2 -4 0 0Z', fill: s.color, stroke: '#fff', 'stroke-width': 1.6 }, pi);
      svg('text', { x: 0, y: -12.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'pinN' }, pi);
    }
    const tx = el.querySelector('text')!; if (tx.textContent !== String(n)) { tx.textContent = String(n); if (!first) gsap.fromTo(el.querySelector('.pi'), { scale: 0.85 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', transformOrigin: '50% 100%' }); }
  }
}

function drawConstruction() {
  const g = $('#build'); g.innerHTML = '';
  const active = layout.lot.length > 0;
  $('#craneL').style.display = active ? '' : 'none';
  if (!active || RM) return;
  // dust puffs on the slab + a beacon ring around the lot
  for (let i = 0; i < 6; i++) {
    const c = svg('circle', { cx: 880 + (i % 3) * 16, cy: 330 + (i % 2) * 8, r: 3, fill: '#e9d6b0', opacity: 0 }, g);
    gsap.to(c, { attr: { r: 9, cy: `-=${10 + i * 2}` }, opacity: 0.55, duration: 1.6, repeat: -1, delay: i * 0.4, ease: 'sine.out', yoyo: false, keyframes: [{ opacity: 0.5, duration: 0.4 }, { opacity: 0, duration: 1.2 }] });
  }
  const ring = svg('ellipse', { cx: 865, cy: 335, rx: 30, ry: 12, fill: 'none', stroke: '#f2b84b', 'stroke-width': 1.5, opacity: 0.8 }, g);
  gsap.to(ring, { attr: { rx: 70, ry: 28 }, opacity: 0, duration: 2.2, repeat: -1, ease: 'power2.out' });
}

function drawWindows() {
  const g = $('#wins');
  for (const [, x, y, kind] of WINDOWS as [string, number, number, string][]) {
    svg('circle', { cx: x, cy: y, r: kind === 'g' ? 5 : 4.5, fill: kind === 'g' ? 'url(#glowG)' : 'url(#glow)', class: 'w', opacity: 0 }, g);
  }
}

// ------------------------------------------------------------------ queue
interface QItem { bot: Bot; p: Pending; color: string }
function items(): QItem[] {
  const out: QItem[] = [];
  for (const b of bots) for (const p of b.pending) out.push({ bot: b, p, color: slotOf(b.id)?.color ?? '#999' });
  return out.sort((a, b) => (b.p.created_at ?? '').localeCompare(a.p.created_at ?? ''));
}

function drawQueue() {
  const list = $('#list'); const all = items();
  $('#cnt').textContent = String(all.length);
  list.innerHTML = all.length ? '' : `<li class="empty">${t('empty')}</li>`;
  for (const it of all) {
    const li = document.createElement('li'); li.className = 'it'; li.dataset.b = it.bot.id; li.dataset.r = it.p.id;
    li.innerHTML = `<div class="who"><span class="dot" style="background:${it.color}"></span><span class="nm">${esc(it.bot.name)}</span><time>${ago(it.p.created_at)}</time></div>
      <h3>${esc(it.p.title)}</h3>${it.p.detail ? `<p class="det">${esc(it.p.detail)}</p>` : ''}
      <div class="acts"><button class="ap" aria-label="${t('approve')}: ${esc(it.p.title)}">${t('approve')}</button><button class="dc" aria-label="${t('decline')}: ${esc(it.p.title)}">${t('decline')}</button></div>`;
    li.querySelector('.ap')!.addEventListener('click', () => act(li, it, true));
    li.querySelector('.dc')!.addEventListener('click', () => act(li, it, false));
    list.appendChild(li);
  }
  syncSheet();
}

function pop(el: HTMLElement, v: number | string) {
  el.textContent = String(v);
  if (!RM) gsap.fromTo(el, { y: 5, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2.5)' });
}

async function act(li: HTMLElement, it: QItem, ok: boolean) {
  li.querySelectorAll('button').forEach((b) => (b.disabled = true));
  li.classList.add('busy');
  if (mode === 'live') {
    const res = await api.decide(it.bot.id, it.p.id, ok ? 'approve' : 'decline');
    if (!res) { li.classList.remove('busy'); li.querySelectorAll('button').forEach((b) => (b.disabled = false)); toast(t('failed')); return; }
  }
  it.bot.pending = it.bot.pending.filter((p) => p.id !== it.p.id);
  const d = RM ? 0 : 1;
  gsap.timeline()
    .to(li, { x: (ok ? 1 : -1) * (lang === 'he' ? -24 : 24), opacity: 0, duration: 0.26 * d, ease: 'power2.in' })
    .to(li, { height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, duration: 0.3 * d, ease: 'power3.inOut', onComplete: () => { li.remove(); if (!items().length) $('#list').innerHTML = `<li class="empty">${t('empty')}</li>`; } });
  pop($('#cnt'), items().length);
  ok ? pop($('#sA'), ++stats.a) : pop($('#sD'), ++stats.d);
  log.unshift({ title: it.p.title, ok });
  const l = $('#log'); const row = document.createElement('div');
  row.innerHTML = `<span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✕'}</span> ${esc(it.p.title)}`; l.prepend(row);
  if (!RM) gsap.from(row, { opacity: 0, y: -4, duration: 0.3 });
  while (l.children.length > 2) l.lastElementChild!.remove();
  drawPins(); drawHotspots();
  if (ok) courier(it.bot.id);
  if (mode === 'live') toast(`${t('sentToBot')} ${it.bot.name}`);
}

function courier(botId: string) {
  const s = slotOf(botId); if (!s) return;
  const g = svg('g', {}, $('#couriers'));
  svg('circle', { r: 10, fill: 'url(#glow)' }, g); svg('circle', { r: 3.2, fill: '#7b68e0', stroke: '#fff', 'stroke-width': 1.3 }, g);
  const x0 = TOWN_HALL.door.x, y0 = TOWN_HALL.door.y, x1 = s.x, y1 = s.top + s.h * 0.9, o = { t: 0 };
  gsap.to(o, {
    t: 1, duration: RM ? 0.01 : 1.4, ease: 'power2.inOut',
    onUpdate: () => g.setAttribute('transform', `translate(${x0 + (x1 - x0) * o.t},${y0 + (y1 - y0) * o.t - Math.sin(o.t * Math.PI) * 80})`),
    onComplete: () => {
      g.remove(); if (RM) return;
      const r = svg('ellipse', { cx: x1, cy: y1, rx: 4, ry: 2, fill: 'none', stroke: '#8f7bff', 'stroke-width': 2 }, $('#couriers'));
      gsap.to(r, { attr: { rx: 50, ry: 20 }, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => r.remove() });
    },
  });
}

function flashItems(botId: string) {
  const els = document.querySelectorAll(`.it[data-b="${botId}"]`);
  if (!els.length) return; sheetOpen = true; syncSheet();
  els[0].scrollIntoView({ block: 'nearest', behavior: RM ? 'auto' : 'smooth' });
  gsap.fromTo(els, { backgroundColor: 'rgba(143,123,255,.28)' }, { backgroundColor: 'rgba(143,123,255,0)', duration: 1.4, clearProps: 'backgroundColor' });
}

function syncSheet() {
  const q = $('#queue'); q.classList.toggle('open', sheetOpen);
  $('#grab')?.setAttribute('aria-expanded', String(sheetOpen));
}

// ------------------------------------------------------------------ chrome
function bindChrome() {
  const seg = $('.seg');
  seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setNight(b.dataset.m === 'night')));
  $('#lang').addEventListener('click', () => {
    setLang(lang === 'he' ? 'en' : 'he');
    if (mode !== 'live') bots = demoBots(lang).map((b) => ({ ...b, pending: b.pending.filter((p) => bots.find((x) => x.id === b.id)?.pending.some((q) => q.id === p.id)) }));
    gsap.globalTimeline.clear(); render();
  });
  $('#share').addEventListener('click', async () => { const blob = await renderShare({ night, placed: layout.placed, lot: layout.lot }); await share(blob); });
  $('#grab').addEventListener('click', () => { sheetOpen = !sheetOpen; syncSheet(); });
  $('#signout')?.addEventListener('click', async () => { await api.logout(); location.reload(); });
  const dlg = $<HTMLDialogElement>('#login');
  $('#signin')?.addEventListener('click', () => dlg.showModal());
  $<HTMLFormElement>('#loginForm').addEventListener('submit', async (e) => {
    const sub = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    if (sub?.value !== 'ok') return;
    e.preventDefault();
    const pw = (dlg.querySelector('input') as HTMLInputElement).value;
    if (await api.login(pw)) location.reload(); else $('#loginErr').hidden = false;
  });
}

function setNight(n: boolean, instant = false) {
  night = n; localStorage.setItem('ovxa.night', n ? '1' : '0');
  document.body.classList.toggle('night', n);
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.m === (n ? 'night' : 'day'))));
  const on = $(`.seg [data-m="${n ? 'night' : 'day'}"]`);
  const d = instant || RM ? 0 : 1.1;
  requestAnimationFrame(() => gsap.to('.seg .pill', { left: on.offsetLeft, width: on.offsetWidth, duration: instant ? 0 : 0.35, ease: 'power3.out' }));
  gsap.to('#imgN,#nightbg', { opacity: n ? 1 : 0, duration: d, ease: 'power2.inOut' });
  gsap.to('#imgD', { opacity: n ? 0 : 1, duration: d, ease: 'power2.inOut' });
  gsap.to('.carlight', { opacity: n ? 1 : 0, duration: d });
  const wins = gsap.utils.toArray<SVGElement>('.w');
  gsap.killTweensOf(wins);
  if (n) {
    gsap.to(wins, { opacity: () => 0.55 + Math.random() * 0.35, duration: d, stagger: { each: RM || instant ? 0 : 0.015, from: 'random' } });
    if (!RM) wins.filter((_, i) => i % 7 === 3).forEach((w, i) => gsap.to(w, { opacity: 0.15, duration: 0.6, delay: 3 + i * 1.7, repeat: -1, repeatDelay: 6 + (i % 4) * 2, yoyo: true, ease: 'sine.inOut' }));
  } else gsap.to(wins, { opacity: 0, duration: d });
}

let toastT: number | undefined;
function toast(msg: string) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = window.setTimeout(() => el.classList.remove('on'), 3200);
}

function intro() {
  if (RM) return;
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from('#scene', { scale: 1.14, y: 36, opacity: 0, filter: 'blur(10px)', duration: 1.8, clearProps: 'filter,scale' })
    .from('header.top', { y: -10, opacity: 0, duration: 0.8 }, 0.4)
    .from('.hero > *', { y: 14, opacity: 0, duration: 0.9, stagger: 0.08 }, 0.55)
    .from('#queue', { y: 20, opacity: 0, duration: 1 }, 0.7)
    .fromTo('.it', { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.06, clearProps: 'opacity,transform' }, 0.95)
    .from('#pins .pi', { scale: 0.6, opacity: 0, transformOrigin: '50% 100%', duration: 0.6, ease: 'back.out(3)', stagger: 0.08 }, 1.3)
    .add(() => { gsap.to('#scene', { y: '-=6', duration: 3.4, yoyo: true, repeat: -1, ease: 'sine.inOut' }); });
}

export type { Placed };
