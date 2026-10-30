import { gsap } from 'gsap';
import './metro.css';
import { plat, PLATFORM, healthOf, type CityAgent, type FeedItem } from './layout';
import { SIM_ROSTER, simTask } from './sim';

const GH = 'https://github.com/ovxa-ai/ovxa-city';
const NS = 'http://www.w3.org/2000/svg';
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const esc = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

type Mode = 'demo' | 'signed-out' | 'live';
let mode: Mode = 'demo';
let agents: CityAgent[] = [];
let feed: FeedItem[] = [];
let handoffs = 0;

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
  fitStage();
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
<div class="m-sky"></div>
<div id="stage" role="img" aria-label="Illustrated isometric city with one neighborhood per AI platform">
  <img src="/metro-day.webp" alt="" draggable="false" fetchpriority="high">
  <svg id="fx" viewBox="0 0 1280 720" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs></svg>
  <div id="pins"></div>
</div>
<div id="m-empty" hidden><b>Your city is ready for its first agent</b><p>Send one request from any platform and it moves into its neighborhood.</p><button class="m-btn primary" data-open-connect>Connect an agent</button></div>
<div class="m-ui">
  <header class="m-top">
    <a class="m-brand" href="${GH}"><span class="m-logo"><svg viewBox="0 0 64 64"><path d="M32 12 50 22v20L32 52 14 42V22z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M32 32 50 22M32 32v20M32 32 14 22" stroke="#fff" stroke-width="4" opacity=".7"/></svg></span><b>OVXA City</b></a>
    <span class="m-chip ${mode === 'live' ? 'live' : ''}">${mode === 'live' ? 'Live' : 'Demo · simulated agents'}</span>
    <nav>${mode === 'signed-out' ? '<button class="m-btn ghost" id="signin">Owner sign in</button>' : ''}<a class="m-btn ghost" href="${GH}">★ Star on GitHub</a><button class="m-btn primary" id="connect">Connect an agent</button></nav>
  </header>
  <section class="m-hero"><h1>Every AI agent.<br><em>One city.</em></h1>
    <p>OpenAI, Grok Bot, Claude, OpenClaw, Muse, LangChain, CrewAI, n8n — one endpoint, one living map. One neighborhood per platform, live status and handoffs.</p>

  </section>
<div class="m-stats"><div><b id="sAg">0</b><span>agents</span></div><div><b id="sPl">0</b><span>platforms</span></div><div><b id="sLv">0</b><span>live now</span></div><div><b id="sHo">0</b><span>handoffs</span></div></div>
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
  addEventListener('resize', fitStage);
  document.querySelector('[data-open-connect]')?.addEventListener('click', () => { paint(); dlg.showModal(); });
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

// ------------------------------------------------------------------ render (illustrated diorama + live overlay)
// Anchor = roof-top of each illustrated neighborhood, in image pixels (1280×720 art).
const IMG_W = 1280, IMG_H = 720;
const SPOT: Record<string, [number, number, number]> = { // x, roof y, ground y
  openai: [412, 96, 244], claude: [631, 46, 190], gemini: [837, 104, 244], muse: [269, 172, 300], custom: [1006, 176, 300],
  grokbot: [238, 316, 440], openclaw: [431, 360, 528], crewai: [647, 398, 575], langchain: [856, 386, 540], n8n: [1019, 316, 438],
};
const TOWNHALL: [number, number] = [644, 186];
const initials = (n: string) => n.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const pills = new Map<string, HTMLElement>();
const seen = new Set<string>();

function stageSetup() {
  for (const k of Object.keys(PLATFORM)) {
    const p = plat(k);
    const el = document.createElement('div');
    el.className = 'pin empty'; el.dataset.p = k;
    el.style.setProperty('--c', p.top);
    el.innerHTML = `<div class="card"><span class="nm"><i></i>${esc(p.label)}</span><span class="av"></span><span class="ct"></span></div><span class="stem"></span>`;
    $('#pins').appendChild(el); pills.set(k, el);
  }
}

const ring = (a: CityAgent) => { const h = healthOf(a); return a.status === 'error' ? 'err' : h === 'offline' ? 'off' : h === 'stale' ? 'stale' : a.status === 'busy' ? 'busy' : 'ok'; };

function draw() {
  if (!pills.size) stageSetup();
  const by = new Map<string, CityAgent[]>();
  for (const a of agents) { const k = PLATFORM[a.platform] ? a.platform : 'custom'; (by.get(k) ?? by.set(k, []).get(k)!).push(a); }
  for (const [k, el] of pills) {
    const list = (by.get(k) ?? []).sort((x, y) => (y.activity ?? 0) - (x.activity ?? 0));
    const live = list.filter((a) => healthOf(a) === 'live').length;
    const wasEmpty = el.classList.contains('empty');
    el.classList.toggle('empty', !list.length);
    el.classList.toggle('hot', list.some((a) => a.status === 'busy' && healthOf(a) === 'live'));
    el.classList.toggle('alert', list.some((a) => a.status === 'error'));
    const av = el.querySelector('.av')!; const MAX = 3;
    const html = list.slice(0, MAX).map((a) => `<b class="a ${ring(a)}" data-id="${esc(a.id)}" tabindex="0">${esc(initials(a.name))}</b>`).join('') + (list.length > MAX ? `<b class="a more">+${list.length - MAX}</b>` : '');
    if (av.innerHTML !== html) {
      av.innerHTML = html;
      av.querySelectorAll<HTMLElement>('.a[data-id]').forEach((n) => {
        const id = n.dataset.id!;
        n.addEventListener('pointerenter', () => tip(id, n)); n.addEventListener('focus', () => tip(id, n));
        n.addEventListener('pointerleave', untip); n.addEventListener('blur', untip);
        if (!seen.has(id)) { seen.add(id); if (!RM && !wasEmpty) gsap.from(n, { scale: 0, duration: 0.6, ease: 'back.out(2.2)' }); }
      });
    }
    el.querySelector('.ct')!.textContent = list.length ? String(live) : ''; el.title = list.length ? `${live} of ${list.length} live` : 'No agents yet';
    if (wasEmpty && list.length && !RM) {
      gsap.fromTo(el, { y: 14, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'expo.out' });
      list.forEach((a) => seen.add(a.id));
      ping(k);
    }
  }
  $('#m-empty').hidden = agents.length > 0 || mode === 'demo';
  relayout();
  stats();
}

const toImg = (k: string): [number, number] => { if (k === 'townhall') return TOWNHALL; const el = pills.get(k); const s = SPOT[k] ?? SPOT.custom; return el?.classList.contains('down') ? [s[0], s[2]] : [s[0], s[1]]; };

// Place labels without overlaps: try above the roof, then below the block, then higher stems.
function relayout() {
  if (!pills.size) return;
  const st = $('#stage'); const k = st.offsetWidth / IMG_W; const placed: DOMRect[] = [];
  const order = [...pills.entries()].filter(([, el]) => getComputedStyle(el).display !== 'none').sort((a, b) => (SPOT[a[0]][1] - SPOT[b[0]][1]));
  for (const [key, el] of order) {
    const [x, ry, gy] = SPOT[key]; const w = el.offsetWidth, h = el.offsetHeight;
    const cands: [boolean, number, number][] = [];
    for (const down of [false, true]) for (const extra of [0, 22, 44, 66]) for (const dx of [0, -0.4, 0.4]) cands.push([down, extra, dx]);
    let pick = cands[0]; let rect = new DOMRect();
    const sx = st.getBoundingClientRect().left; const clampX = (cx: number) => Math.min(Math.max(cx, w / 2 + 8 - sx), innerWidth - sx - w / 2 - 8);
    for (const c of cands) {
      const [down, extra, dx] = c; const top = down ? gy * k + extra : ry * k - h - extra; const cx = clampX(x * k + dx * w);
      const r = new DOMRect(cx - w / 2 - 4, top - 3, w + 8, h + 6);
      if (!placed.some((q) => r.x < q.right && r.right > q.x && r.y < q.bottom && r.bottom > q.y)) { pick = c; rect = r; break; }
      if (c === cands[0]) rect = r;
    }
    if (!rect.width) rect = new DOMRect(x * k - w / 2, ry * k - h, w, h);
    placed.push(rect);
    el.classList.toggle('down', pick[0]);
    const cx = clampX(x * k + pick[2] * w);
    el.style.left = `${cx}px`; el.style.top = `${pick[0] ? gy * k : ry * k}px`;
    el.style.setProperty('--sx', `${x * k - cx}px`);
    el.style.setProperty('--stem', `${14 + pick[1]}px`);
  }
}

function ping(k: string) {
  if (RM) return; const [x, y] = toImg(k);
  const c = svg('ellipse', { cx: x, cy: y + 70, rx: 8, ry: 4, class: 'ping', stroke: plat(k).top }, $('#fx'));
  gsap.to(c, { attr: { rx: 110, ry: 55 }, opacity: 0, duration: 1.6, ease: 'expo.out', onComplete: () => c.remove() });
}

function arc(from: string, to: string, platform: string) {
  if (RM) return;
  const pa = agents.find((a) => a.id === from)?.platform ?? platform;
  const pb = to === 'townhall' ? 'townhall' : agents.find((a) => a.id === to)?.platform; if (!pb) return;
  const a = toImg(PLATFORM[pa] ? pa : 'custom'), b = toImg(pb === 'townhall' ? 'townhall' : PLATFORM[pb] ? pb : 'custom');
  const A: [number, number] = [a[0], a[1] - 8], B: [number, number] = [b[0], b[1] - 8];
  const same = Math.hypot(B[0] - A[0], B[1] - A[1]) < 4;
  const mx = (A[0] + B[0]) / 2, my = Math.min(A[1], B[1]) - (same ? 60 : 40 + Math.hypot(B[0] - A[0], B[1] - A[1]) * 0.22);
  const d = same ? `M${A[0] - 30},${A[1]} Q${A[0]},${my} ${A[0] + 30},${A[1]}` : `M${A[0]},${A[1]} Q${mx},${my} ${B[0]},${B[1]}`;
  const c = plat(platform).top;
  const g = svg('g', {}, $('#fx'));
  const glow = svg('path', { d, class: 'arc-glow', stroke: c }, g) as SVGPathElement;
  const path = svg('path', { d, class: 'arc' }, g) as SVGPathElement;
  const len = path.getTotalLength();
  for (const e of [path, glow]) { e.style.strokeDasharray = `${len}`; e.style.strokeDashoffset = `${len}`; }
  const dot = svg('circle', { r: 5, class: 'arc-dot', fill: c }, g);
  const o = { t: 0 };
  gsap.timeline({ onComplete: () => g.remove() })
    .to([path, glow], { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' })
    .to(o, { t: 1, duration: 1.2, ease: 'power2.inOut', onUpdate: () => { const q = path.getPointAtLength(o.t * len); dot.setAttribute('cx', String(q.x)); dot.setAttribute('cy', String(q.y)); } }, 0)
    .to(g, { opacity: 0, duration: 0.7 }, 1.5);
  const tgt = pills.get(pb);
  if (tgt) gsap.fromTo(tgt.querySelector('.card'), { scale: 1 }, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1, delay: 1.15, ease: 'power2.out' });
}

// ------------------------------------------------------------------ stage fit
function fitStage() {
  const W = innerWidth, H = innerHeight, mob = W < 820;
  const st = $('#stage');
  let w: number, x: number, y: number;
  if (mob) { w = W * 1.18; x = (W - w) / 2; y = 196 + Math.max(0, (H * 0.66 - 196 - w * 0.5625) / 2); }
  else {
    const availW = W - 370; // feed column on the right
    w = Math.min(availW - 30, (H - 70) * (IMG_W / IMG_H));
    x = Math.max(60, 110 + (availW - 110 - w) / 2); y = Math.max(64, (H - w * IMG_H / IMG_W) / 2 + 22);
  }
  st.style.width = `${w}px`; st.style.left = `${x}px`; st.style.top = `${y}px`;
  requestAnimationFrame(relayout);
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
  const a = agents.find((x) => x.id === id); if (!a) return; const p = plat(a.platform); const t = $('#m-tip'); const r = g.getBoundingClientRect(); void id;
  const h = healthOf(a);
  t.innerHTML = `<b>${esc(a.name)}</b><span class="pf" style="--c:${p.top}">${esc(p.label)}</span><p>${esc(a.task || '—')}</p><small>${a.status === 'error' ? 'Error' : h === 'live' ? (a.status === 'busy' ? 'Working' : 'Online') : h === 'stale' ? 'Quiet for 15m+' : 'Offline'} · ${a.activity ?? 0} events / 24h${a.pending ? ` · ${a.pending} waiting at Town Hall` : ''}</small>`;
  t.style.left = `${r.left + r.width / 2}px`; t.style.top = `${r.top - 8}px`;
  gsap.to(t, { opacity: 1, y: 0, duration: 0.2 });
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
