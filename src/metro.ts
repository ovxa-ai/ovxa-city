import { gsap } from 'gsap';
import './metro.css';
import { layoutCity, plat, PLATFORM, healthOf, type CityAgent, type FeedItem, type District } from './layout';
import { SIM_ROSTER, simTask } from './sim';

const GH = 'https://github.com/ovxa-ai/ovxa-city';
const NS = 'http://www.w3.org/2000/svg';
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const esc = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const P = 6.2, LOT = 1.25, S = 0.46, TW = 40, TH = 20;
const iso = (x: number, y: number): [number, number] => [(x - y) * TW, (x + y) * TH];
const pt = (p: [number, number], dy = 0) => `${p[0].toFixed(1)},${(p[1] - dy).toFixed(1)}`;

type Mode = 'demo' | 'signed-out' | 'live';
let mode: Mode = 'demo';
let agents: CityAgent[] = [];
let feed: FeedItem[] = [];
const drawn = new Map<string, { g: SVGGElement; h: { v: number }; cx: number; cy: number; target: number }>();
let handoffs = 0;
const view = { x: -400, y: -260, w: 800, h: 520 };

function svg<K extends keyof SVGElementTagNameMap>(tag: K, a: Record<string, string | number>, parent?: Element) {
  const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, String(a[k])); parent?.appendChild(e); return e;
}

export async function start() {
  document.documentElement.lang = 'en';
  document.title = 'OVXA City — Every AI agent. One city.';
  mode = await detect();
  $('#app').innerHTML = shell();
  bind();
  if (mode === 'live') { await pull(); setInterval(pull, 10_000); } else simulate();
  gsap.ticker.add(tickCamera);
  if (!RM) gsap.from('.m-ui > *', { y: 12, opacity: 0, duration: 0.9, stagger: 0.07, ease: 'expo.out', delay: 0.2 });
}

async function detect(): Promise<Mode> {
  if (new URLSearchParams(location.search).has('demo')) return 'demo';
  try {
    const r = await fetch('/api/me', { credentials: 'include' });
    if (!(r.headers.get('content-type') || '').includes('json')) return 'demo';
    return (await r.json()).owner ? 'live' : 'signed-out';
  } catch { return 'demo'; }
}

function shell() {
  const legend = Object.entries(PLATFORM).map(([k, p]) => `<li data-p="${k}"><i style="--c:${p.top}"></i>${p.label}</li>`).join('');
  return `
<svg id="city" role="img" aria-label="Isometric city of AI agents"><defs>
  <radialGradient id="bgG" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#18203f"/><stop offset="1" stop-color="#070914"/></radialGradient>
  <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>
  <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
</defs><g id="ground"></g><g id="plates"></g><g id="blds"></g><g id="arcs"></g><g id="labels"></g></svg>
<div class="m-ui">
  <header class="m-top">
    <a class="m-brand" href="${GH}"><span class="m-logo"><svg viewBox="0 0 64 64"><path d="M32 12 50 22v20L32 52 14 42V22z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M32 32 50 22M32 32v20M32 32 14 22" stroke="#fff" stroke-width="4" opacity=".7"/></svg></span><b>OVXA City</b></a>
    <span class="m-chip ${mode === 'live' ? 'live' : ''}">${mode === 'live' ? 'Live' : 'Demo · simulated agents'}</span>
    <nav>${mode === 'signed-out' ? '<button class="m-btn ghost" id="signin">Owner sign in</button>' : ''}<a class="m-btn ghost" href="${GH}">★ Star on GitHub</a><button class="m-btn primary" id="connect">Connect an agent</button></nav>
  </header>
  <section class="m-hero"><h1>Every AI agent.<br><em>One city.</em></h1>
    <p>OpenAI, Grok Bot, Claude, OpenClaw, Muse, LangChain, CrewAI, n8n — one endpoint, one living map. Districts by platform, towers by activity, live handoffs.</p>
    <div class="m-stats"><div><b id="sAg">0</b><span>agents</span></div><div><b id="sPl">0</b><span>platforms</span></div><div><b id="sLv">0</b><span>live now</span></div><div><b id="sHo">0</b><span>handoffs</span></div></div>
  </section>
  <aside class="m-feed" aria-label="Live activity"><h2><span class="dot"></span>Live activity</h2><ol id="feed" aria-live="polite"></ol></aside>
  <ul class="m-legend" aria-label="Platforms">${legend}</ul>
</div>
<div id="m-tip" role="tooltip"></div>
<dialog id="m-connect"><form method="dialog">
  <h2>Connect any agent in one request</h2>
  <p class="sub">One endpoint for every platform. ${mode === 'live' ? 'Generate a join token below.' : 'Deploy your own city, then generate a join token.'}</p>
  <div class="tabs" role="tablist">${['curl', 'JavaScript', 'Python', 'Prompt', 'MCP'].map((t, i) => `<button type="button" role="tab" data-t="${t}" aria-selected="${i === 0}">${t}</button>`).join('')}</div>
  <pre id="code"></pre>
  <div class="row">${mode === 'live' ? '<button type="button" class="m-btn" id="mint">Generate join token</button>' : `<a class="m-btn" href="https://deploy.workers.cloudflare.com/?url=${GH}">Deploy your city</a>`}
  <button type="button" class="m-btn ghost" id="copy">Copy</button><span class="grow"></span><button class="m-btn primary" value="close">Done</button></div>
</form></dialog>
<dialog id="m-login"><form method="dialog" id="m-loginf"><h2>Owner sign in</h2><input type="password" name="pw" placeholder="Password" required autocomplete="current-password"><p class="err" hidden>Wrong password</p><div class="row"><span class="grow"></span><button class="m-btn ghost" value="cancel" formnovalidate>Cancel</button><button class="m-btn primary" value="ok">Sign in</button></div></form></dialog>`;
}

// ------------------------------------------------------------------ connect snippets
let token = '<JOIN_TOKEN>', tab = 'curl';
function snippet(t: string) {
  const o = mode === 'live' ? location.origin : 'https://<your-city>.workers.dev';
  const body = `{"agent":{"id":"my-agent","name":"My Agent","platform":"openai"},"status":"busy","task":"Drafting the weekly report"}`;
  switch (t) {
    case 'curl': return `curl -X POST ${o}/api/v1/agents \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "content-type: application/json" \\\n  -d '${body}'`;
    case 'JavaScript': return `// works in Node 18+, Deno, Bun, Workers, n8n Code nodes\nconst city = (status, task, extra = {}) => fetch("${o}/api/v1/agents", {\n  method: "POST",\n  headers: { authorization: "Bearer ${token}", "content-type": "application/json" },\n  body: JSON.stringify({ agent: { id: "my-agent", name: "My Agent", platform: "openai" }, status, task, ...extra }),\n});\n\nawait city("busy", "Researching competitors");\nawait city("ok", "Done", { handoff: { to: "writer", note: "notes ready" } });`;
    case 'Python': return `import requests  # LangChain, CrewAI, OpenAI Agents SDK, anything\n\ndef city(status, task, **extra):\n    requests.post("${o}/api/v1/agents", timeout=5,\n        headers={"Authorization": "Bearer ${token}"},\n        json={"agent": {"id": "my-agent", "name": "My Agent", "platform": "langchain"},\n              "status": status, "task": task, **extra})\n\ncity("busy", "Summarizing tickets")`;
    case 'Prompt': return `You are now a citizen of my OVXA City. Whenever you start, finish, hand off or get stuck on a task, send one HTTP request:\nPOST ${o}/api/v1/agents\nAuthorization: Bearer ${token}\nContent-Type: application/json\n{"agent":{"id":"<short-id>","name":"<your name>","platform":"<openai|grokbot|claude|openclaw|muse|custom>"},"status":"<busy|ok|error|idle>","task":"<one line, no secrets>"}\nNever include passwords, tokens or personal data. Report now: status "ok", task "Joined the city".`;
    default: return `// Claude Desktop / Cursor / any MCP client — mcp.json\n{\n  "mcpServers": {\n    "ovxa-city": {\n      "url": "${o}/mcp",\n      "headers": { "Authorization": "Bearer ${token}" }\n    }\n  }\n}\n// Tool exposed: city_report { id, name, platform, status, task, handoff_to }`;
  }
}

function bind() {
  const dlg = $<HTMLDialogElement>('#m-connect');
  const paint = () => { $('#code').textContent = snippet(tab); dlg.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String((b as HTMLElement).dataset.t === tab))); };
  $('#connect').addEventListener('click', () => { paint(); dlg.showModal(); });
  dlg.querySelectorAll<HTMLElement>('[role=tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t!; paint(); }));
  $('#copy').addEventListener('click', async () => { await navigator.clipboard?.writeText($('#code').textContent || ''); $('#copy').textContent = 'Copied'; setTimeout(() => ($('#copy').textContent = 'Copy'), 1400); });
  $('#mint')?.addEventListener('click', async () => {
    const r = await fetch('/api/invites', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (r.ok) { token = (await r.json()).token; paint(); $('#mint').textContent = 'Token created — save it now'; }
  });
  const lg = $<HTMLDialogElement>('#m-login');
  $('#signin')?.addEventListener('click', () => lg.showModal());
  $('#m-loginf').addEventListener('submit', async (e) => {
    if (((e as SubmitEvent).submitter as HTMLButtonElement)?.value !== 'ok') return;
    e.preventDefault();
    const pw = (lg.querySelector('input') as HTMLInputElement).value;
    const r = await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (r.ok) location.reload(); else (lg.querySelector('.err') as HTMLElement).hidden = false;
  });
  addEventListener('resize', () => fitCamera(true));
}

// ------------------------------------------------------------------ data
async function pull() {
  try {
    const r = await fetch('/api/city', { credentials: 'include' });
    if (!r.ok) return;
    const s = await r.json();
    const prevFeed = new Set(feed.map((f) => f.at + f.agent + f.kind));
    agents = s.agents; const fresh = (s.feed as FeedItem[]).filter((f) => !prevFeed.has(f.at + f.agent + f.kind));
    feed = s.feed;
    draw();
    for (const f of fresh.reverse()) { pushFeed(f, prevFeed.size > 0); if (f.kind === 'handoff' && f.to && prevFeed.size) arc(f.agent, f.to, f.platform); }
    handoffs = feed.filter((f) => f.kind === 'handoff').length; stats();
  } catch { /* keep last frame */ }
}

// ------------------------------------------------------------------ render
function blockCenter(bx: number, by: number): [number, number] { return [bx * P, by * P]; }
function lotCenter(d: { bx: number; by: number }, gx: number, gy: number): [number, number] { const [x, y] = blockCenter(d.bx, d.by); return [x + (gx - 1) * LOT, y + (gy - 1) * LOT]; }

function plate(cx: number, cy: number, r: number, attrs: Record<string, string | number>, parent: Element) {
  return svg('polygon', { points: [iso(cx - r, cy - r), iso(cx + r, cy - r), iso(cx + r, cy + r), iso(cx - r, cy + r)].map((p) => pt(p)).join(' '), ...attrs }, parent);
}

let plazaDone = false;
const plates = new Map<string, SVGGElement>();
function draw() {
  const ds = layoutCity(agents);
  if (!plazaDone) { plazaDone = true; drawPlaza(); }
  for (const d of ds) drawDistrict(d);
  const live = new Set<string>();
  for (const d of ds) for (const l of d.lots) {
    live.add(l.agent.id);
    const [cx, cy] = lotCenter(d, l.gx, l.gy);
    building(l.agent, cx, cy, l.height);
  }
  for (const [id, b] of drawn) if (id !== '__th' && !live.has(id)) { b.g.remove(); drawn.delete(id); }
  // painter's order
  const sorted = [...drawn.values()].sort((a, b) => a.cx + a.cy - (b.cx + b.cy));
  for (const b of sorted) $('#blds').appendChild(b.g);
  fitCamera(); stats();
}

function drawPlaza() {
  const g = $('#ground');
  const R = 40; plate(0, 0, R, { fill: '#0e1328' }, g);
  for (let k = -6; k <= 7; k++) {
    const i = k * P - P / 2;
    const a = iso(i, -R), b = iso(i, R), c = iso(-R, i), d = iso(R, i);
    svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'road' }, g); svg('line', { x1: c[0], y1: c[1], x2: d[0], y2: d[1], class: 'road' }, g);
  }
  plate(0, 0, 2.1, { fill: '#1d2446', stroke: '#3a4380', 'stroke-width': 1 }, $('#plates'));
  plate(0, 0, 1.4, { fill: '#262f5c' }, $('#plates'));
  const th = svg('g', { class: 'townhall' }, $('#blds'));
  drawBox(th, 0, 0, 0.9, 54, { top: '#f2efff', left: '#b9b3e6', right: '#8a83c4' }, 1);
  const sp = iso(0, 0); svg('circle', { cx: sp[0], cy: sp[1] - 66, r: 4, fill: '#a99bff', class: 'spire' }, th);
  svg('circle', { cx: sp[0], cy: sp[1] - 66, r: 10, fill: '#a99bff', opacity: 0.5, filter: 'url(#glow)' }, th);
  label(0, 0, 'TOWN HALL', '', '#cfc8ff', 92);
  drawn.set('__th', { g: th as SVGGElement, h: { v: 54 }, cx: 0, cy: 0, target: 54 });
}

function label(cx: number, cy: number, title: string, sub: string, color: string, lift = 80) {
  const p = iso(cx, cy);
  const g = svg('g', { class: 'dlabel', transform: `translate(${p[0]},${p[1] - lift})` }, $('#labels'));
  const bg = svg('rect', { class: 'bg', rx: 9, ry: 9 }, g);
  svg('circle', { r: 3.5, fill: color, class: 'cd' }, g);
  const t = svg('text', { class: 't', fill: color, x: 0, y: 0 }, g); t.textContent = title;
  const s = svg('text', { class: 's', x: 0, y: 0 }, g); s.textContent = sub;
  (g as any)._fit = () => {
    const tw = (t as SVGTextElement).getComputedTextLength(), sw = (s as SVGTextElement).getComputedTextLength();
    const w = 14 + 8 + tw + (sw ? 8 + sw : 0) + 12;
    bg.setAttribute('x', String(-w / 2)); bg.setAttribute('y', '-11'); bg.setAttribute('width', String(w)); bg.setAttribute('height', '22');
    const x0 = -w / 2 + 14; g.querySelector('.cd')!.setAttribute('cx', String(x0)); g.querySelector('.cd')!.setAttribute('cy', '0');
    t.setAttribute('x', String(x0 + 8)); t.setAttribute('y', '4.5'); s.setAttribute('x', String(x0 + 8 + tw + 8)); s.setAttribute('y', '4.5');
  };
  (g as any)._fit();
  return g;
}

function drawDistrict(d: District) {
  const p = plat(d.platform);
  const key = d.platform;
  let g = plates.get(key);
  const [cx, cy] = blockCenter(d.bx, d.by);
  if (!g) {
    g = svg('g', { class: 'plate' }, $('#plates')) as SVGGElement;
    plate(cx, cy, 2.3, { fill: p.top, 'fill-opacity': 0.07, stroke: p.top, 'stroke-opacity': 0.35, 'stroke-width': 1 }, g);
    plate(cx, cy, 2.05, { fill: '#121834', 'fill-opacity': 0.85 }, g);
    for (let gx = 0; gx < 3; gx++) for (let gy = 0; gy < 3; gy++) { const [x, y] = lotCenter(d, gx, gy); plate(x, y, 0.55, { fill: p.top, 'fill-opacity': 0.06 }, g); }
    plates.set(key, g);
    const lb = label(cx, cy, p.label.toUpperCase(), '', p.top); lb.id = 'lb-' + key; (lb as any)._lift = 80;
    if (!RM) { gsap.from(g, { opacity: 0, duration: 0.8 }); gsap.from(lb, { opacity: 0, y: '+=8', duration: 0.8, delay: 0.2 }); }
  }
  const sub = $(`#lb-${key} .s`);
  const live = d.agents.filter((a) => healthOf(a) === 'live').length;
  sub.textContent = `${d.agents.length} · ${live} live${d.overflow ? ` · +${d.overflow}` : ''}`;
  const lb = $(`#lb-${key}`) as any; lb._fit();
  const lift = Math.max(...d.lots.map((l) => l.height)) + 46;
  if (lb._lift !== lift) { lb._lift = lift; const c = iso(cx, cy); gsap.to(lb, { attr: { transform: `translate(${c[0]},${c[1] - lift})` }, duration: RM ? 0 : 1.2, ease: 'power3.out' }); }
}

function drawBox(g: Element, cx: number, cy: number, s: number, h: number, c: { top: string; left: string; right: string }, op = 1) {
  const T = iso(cx - s, cy - s), R = iso(cx + s, cy - s), B = iso(cx + s, cy + s), L = iso(cx - s, cy + s);
  const left = svg('polygon', { points: [pt(L), pt(B), pt(B, h), pt(L, h)].join(' '), fill: c.left, opacity: op, class: 'fl' }, g);
  const right = svg('polygon', { points: [pt(B), pt(R), pt(R, h), pt(B, h)].join(' '), fill: c.right, opacity: op, class: 'fr' }, g);
  const roof = svg('polygon', { points: [pt(T, h), pt(R, h), pt(B, h), pt(L, h)].join(' '), fill: c.top, opacity: op, class: 'ft' }, g);
  return (nh: number) => {
    left.setAttribute('points', [pt(L), pt(B), pt(B, nh), pt(L, nh)].join(' '));
    right.setAttribute('points', [pt(B), pt(R), pt(R, nh), pt(B, nh)].join(' '));
    roof.setAttribute('points', [pt(T, nh), pt(R, nh), pt(B, nh), pt(L, nh)].join(' '));
  };
}

const beaconColor = (a: CityAgent) => {
  const h = healthOf(a);
  return a.status === 'error' ? '#ff5d6c' : h === 'offline' ? '#5b6080' : h === 'stale' ? '#f5b94a' : a.status === 'busy' ? '#4dffb0' : '#7fe0ff';
};

function building(a: CityAgent, cx: number, cy: number, height: number) {
  const p = plat(a.platform);
  const health = healthOf(a);
  let b = drawn.get(a.id);
  if (b && (b.cx !== cx || b.cy !== cy)) { b.g.remove(); drawn.delete(a.id); b = undefined; }
  if (!b) {
    const g = svg('g', { class: 'bld', 'data-id': a.id, tabindex: 0 }) as SVGGElement;
    const sh = iso(cx, cy);
    svg('ellipse', { cx: sh[0] + 6, cy: sh[1] + 4, rx: 34, ry: 12, fill: '#000', opacity: 0.25, filter: 'url(#glow)' }, g);
    const body = svg('g', { class: 'body' }, g);
    const set = drawBox(body, cx, cy, S, 0, p);
    const win = svg('g', { class: 'wins' }, g);
    const beacon = svg('g', { class: 'beacon' }, g);
    svg('circle', { r: 9, class: 'halo', filter: 'url(#glow)' }, beacon); svg('circle', { r: 3.2, class: 'core' }, beacon);
    const h = { v: 0 };
    const upd = () => {
      set(h.v); const top = iso(cx, cy); beacon.setAttribute('transform', `translate(${top[0]},${top[1] - h.v - 2})`);
      drawWindows(win, cx, cy, h.v);
    };
    (g as any)._upd = upd; upd();
    b = { g, h, cx, cy, target: 0 }; drawn.set(a.id, b);
    g.addEventListener('pointerenter', () => tip(a.id, g)); g.addEventListener('focus', () => tip(a.id, g));
    g.addEventListener('pointerleave', untip); g.addEventListener('blur', untip);
    if (!RM) {
      const ring = svg('ellipse', { cx: sh[0], cy: sh[1], rx: 10, ry: 5, fill: 'none', stroke: p.top, 'stroke-width': 2 }, $('#arcs'));
      gsap.to(ring, { attr: { rx: 70, ry: 35 }, opacity: 0, duration: 1.4, ease: 'expo.out', onComplete: () => ring.remove() });
    }
  }
  (b.g as any)._agent = a;
  b.g.classList.toggle('busy', a.status === 'busy' && health === 'live');
  b.g.classList.toggle('offline', health === 'offline');
  b.g.classList.toggle('stale', health === 'stale');
  b.g.classList.toggle('err', a.status === 'error');
  b.g.style.setProperty('--b', beaconColor(a));
  if (b.target !== height) {
    b.target = height;
    gsap.to(b.h, { v: height, duration: RM ? 0 : 1.6, ease: 'elastic.out(1,0.75)', onUpdate: (b.g as any)._upd });
  }
}

function drawWindows(g: Element, cx: number, cy: number, h: number) {
  g.innerHTML = '';
  if (h < 18) return;
  const rows = Math.floor((h - 10) / 9);
  for (const side of [0, 1]) for (let r = 0; r < rows; r++) for (const f of [0.3, 0.7]) {
    const a = side ? iso(cx + S, cy - S + f * 2 * S - 0.06) : iso(cx - S + f * 2 * S - 0.06, cy + S);
    const b2 = side ? iso(cx + S, cy - S + f * 2 * S + 0.06) : iso(cx - S + f * 2 * S + 0.06, cy + S);
    const y = 8 + r * 9;
    svg('line', { x1: a[0], y1: a[1] - y, x2: b2[0], y2: b2[1] - y, class: 'w', style: `--d:${((r * 7 + f * 10 + side * 3) % 9) / 3}s` }, g);
  }
}

function roof(id: string): [number, number] | null {
  const b = drawn.get(id); if (!b) return null; const p = iso(b.cx, b.cy); return [p[0], p[1] - b.h.v];
}

function arc(from: string, to: string, platform: string) {
  const a = roof(from), b = roof(to === 'townhall' ? '__th' : to); if (!a || !b || RM) return;
  const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 60 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.25;
  const d = `M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}`;
  const c = plat(platform).top;
  const path = svg('path', { d, class: 'arc', stroke: c }, $('#arcs')) as SVGPathElement;
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`; path.style.strokeDashoffset = `${len}`;
  const dot = svg('circle', { r: 4, fill: '#fff' }, $('#arcs')); const glow = svg('circle', { r: 11, fill: c, opacity: 0.7, filter: 'url(#glow)' }, $('#arcs'));
  const o = { t: 0 };
  gsap.timeline({ onComplete: () => { path.remove(); dot.remove(); glow.remove(); } })
    .to(path, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' })
    .to(o, { t: 1, duration: 1.1, ease: 'power2.inOut', onUpdate: () => { const q = path.getPointAtLength(o.t * len); for (const e of [dot, glow]) { e.setAttribute('cx', String(q.x)); e.setAttribute('cy', String(q.y)); } } }, 0)
    .to([path, dot, glow], { opacity: 0, duration: 0.6 }, 1.3);
  const target = drawn.get(to);
  if (target) gsap.fromTo(target.g.querySelector('.beacon .halo'), { attr: { r: 9 } }, { attr: { r: 22 }, duration: 0.5, yoyo: true, repeat: 1, delay: 1.1 });
}

// ------------------------------------------------------------------ camera
const cam = { x: view.x, y: view.y, w: view.w, h: view.h };
function fitCamera(instant = false) {
  const pts: [number, number][] = [[0, 0]];
  for (const b of drawn.values()) { const [x, y] = iso(b.cx, b.cy); pts.push([x - 100, y - b.target - 90], [x + 100, y + 60]); }
  let x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
  let y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  const W = innerWidth, H = innerHeight, mob = W < 820;
  // leave room for the hero (left) and feed (right) on desktop
  const padL = mob ? 0.05 : 0.30, padR = mob ? 0.05 : 0.30, padT = mob ? 0.34 : 0.12, padB = mob ? 0.22 : 0.12;
  let w = Math.max(x1 - x0, 520), h = Math.max(y1 - y0, 320);
  const sx = w / (1 - padL - padR), sy = h / (1 - padT - padB);
  const scale = Math.max(sx / W, sy / H);
  const vw = W * scale, vh = H * scale;
  const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
  const tx = cxm - vw * (padL + (1 - padL - padR) / 2), ty = cym - vh * (padT + (1 - padT - padB) / 2);
  gsap.to(view, { x: tx, y: ty, w: vw, h: vh, duration: instant || RM ? 0 : 2.2, ease: 'power3.inOut', overwrite: true });
}
function tickCamera() {
  cam.x = view.x; cam.y = view.y; cam.w = view.w; cam.h = view.h;
  $('#city').setAttribute('viewBox', `${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${cam.w.toFixed(1)} ${cam.h.toFixed(1)}`);
}

// ------------------------------------------------------------------ chrome
function stats() {
  const n = (id: string, v: number) => { const e = $(id); if (e.textContent !== String(v)) { e.textContent = String(v); if (!RM) gsap.fromTo(e, { y: 6, opacity: 0.2 }, { y: 0, opacity: 1, duration: 0.4, ease: 'back.out(2)' }); } };
  n('#sAg', agents.length); n('#sPl', new Set(agents.map((a) => a.platform)).size);
  n('#sLv', agents.filter((a) => healthOf(a) === 'live').length); n('#sHo', handoffs);
  const present = new Set(agents.map((a) => a.platform));
  document.querySelectorAll<HTMLElement>('.m-legend li').forEach((li) => li.classList.toggle('on', present.has(li.dataset.p!)));
}

const ago = (iso: string) => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return s < 50 ? 'now' : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };
function pushFeed(f: FeedItem, animate = true) {
  const ol = $('#feed'); const li = document.createElement('li');
  const p = plat(f.platform); const toName = f.to ? agents.find((a) => a.id === f.to)?.name ?? f.to : '';
  const verb = f.kind === 'join' ? 'joined the city' : f.kind === 'handoff' ? `→ <b>${esc(toName)}</b>` : f.kind === 'error' ? 'hit an error' : '';
  li.className = 'k-' + f.kind;
  li.innerHTML = `<i style="--c:${p.top}"></i><div><p><b>${esc(f.name)}</b> <span class="pf">${esc(p.label)}</span> ${verb}</p>${f.text ? `<small>${esc(f.text)}</small>` : ''}</div><time>${ago(f.at)}</time>`;
  ol.prepend(li);
  if (animate && !RM) gsap.from(li, { height: 0, opacity: 0, x: 14, duration: 0.5, ease: 'expo.out', clearProps: 'height' });
  while (ol.children.length > 9) ol.lastElementChild!.remove();
}

function tip(id: string, g: Element) {
  const a = (g as any)._agent as CityAgent; const p = plat(a.platform); const t = $('#m-tip'); const r = g.getBoundingClientRect();
  const h = healthOf(a);
  t.innerHTML = `<b>${esc(a.name)}</b><span class="pf" style="--c:${p.top}">${esc(p.label)}</span><p>${esc(a.task || '—')}</p><small>${a.status === 'error' ? 'Error' : h === 'live' ? (a.status === 'busy' ? 'Working' : 'Online') : h === 'stale' ? 'Quiet for 15m+' : 'Offline'} · ${a.activity ?? 0} events / 24h${a.pending ? ` · ${a.pending} waiting at Town Hall` : ''}</small>`;
  t.style.left = `${r.left + r.width / 2}px`; t.style.top = `${r.top - 8}px`;
  gsap.to(t, { opacity: 1, y: 0, duration: 0.2 }); void id;
}
function untip() { gsap.to('#m-tip', { opacity: 0, duration: 0.15 }); }

// ------------------------------------------------------------------ demo simulation
function simulate() {
  const q = new URLSearchParams(location.search);
  const speed = Number(q.get('speed') || 1);
  const roster = [...SIM_ROSTER];
  let i = 0; const now = () => new Date().toISOString();
  const join = () => {
    const r = roster[i++]; if (!r) return;
    const a: CityAgent = { ...r, status: 'busy', task: simTask(r.platform), activity: 1 + Math.floor(Math.random() * 6), first_seen: now(), updated_at: now(), health: 'live' };
    agents.push(a); draw(); pushFeed({ at: now(), agent: a.id, name: a.name, platform: a.platform, kind: 'join', text: a.task });
  };
  // a calm opening with 3 agents, then the city fills up
  const opening = Number(q.get('start') ?? 3);
  for (let k = 0; k < opening; k++) join();
  const joinT = setInterval(() => { if (i >= roster.length) clearInterval(joinT); else join(); }, 650 / speed);
  setInterval(() => {
    if (agents.length < 2) return;
    const a = agents[Math.floor(Math.random() * agents.length)];
    const roll = Math.random();
    if (roll < 0.45) {
      const others = agents.filter((x) => x !== a); const b = others[Math.floor(Math.random() * others.length)];
      a.status = 'ok'; b.status = 'busy'; b.activity = (b.activity ?? 0) + 3; b.task = simTask(b.platform);
      handoffs++; arc(a.id, b.id, a.platform);
      pushFeed({ at: now(), agent: a.id, name: a.name, platform: a.platform, kind: 'handoff', to: b.id, text: b.task });
    } else if (roll < 0.52 && !agents.some((x) => x.status === 'error')) {
      a.status = 'error'; a.task = 'Rate limited by upstream API — retrying';
      pushFeed({ at: now(), agent: a.id, name: a.name, platform: a.platform, kind: 'error', text: a.task });
      setTimeout(() => { a.status = 'busy'; a.task = simTask(a.platform); draw(); }, 4000 / speed);
    } else if (roll < 0.58) {
      a.health = 'stale';
      setTimeout(() => { a.health = 'live'; draw(); }, 5000 / speed);
    } else {
      a.status = Math.random() < 0.7 ? 'busy' : 'ok'; a.activity = (a.activity ?? 0) + 2; a.task = simTask(a.platform);
      pushFeed({ at: now(), agent: a.id, name: a.name, platform: a.platform, kind: 'status', text: a.task });
    }
    a.updated_at = now(); draw();
  }, 1100 / speed);
}
