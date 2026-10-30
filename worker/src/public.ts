/**
 * Public city: moderation, house residents, the safe public view, agent pages and OG cards.
 * Everything here returns only fields that are safe to show to anyone on the internet.
 */
import type { Agent, FeedItem, Platform } from './index';
import { avatarUri, avatarSvg } from '../../src/avatar';

// ---------------------------------------------------------------- moderation
const BAD = ['fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'fag', 'bitch', 'whore', 'slut', 'porn', 'xxx', 'rape', 'nazi', 'hitler', 'kike', 'retard', 'dick', 'cock', 'pussy', 'penis', 'vagina', 'anal', 'nude', 'nsfw', 'onlyfans', 'sex', 'heil', 'kkk', 'spic', 'chink', 'twat', 'wank', 'asshole', 'motherfucker', 'scam', 'casino', 'viagra', 'crypto giveaway'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };
const URLISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ai|xyz|co|me|ly|gg|app|dev|link|ru|cn|tk|info|biz|site|shop|top|club|online)\b|@[a-z0-9_]{2,}|t\.me\/|discord\.gg)/i;
const norm = (s: string) => s.toLowerCase().replace(/[0-9@$!]/g, (c) => LEET[c] ?? c).replace(/[^\p{L}\p{N}\s]/gu, '');
export function cleanText(s: string) { return s.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim(); }
export function moderate(s: string): string | null {
  const t = norm(s); const squashed = t.replace(/\s+/g, '');
  if (URLISH.test(s)) return 'links and handles are not allowed';
  for (const w of BAD) {
    const re = new RegExp(`(^|[^\\p{L}])${w.replace(/\s/g, '\\s*')}($|[^\\p{L}])`, 'u');
    if (re.test(t) || (w.length >= 5 && squashed.includes(w))) return 'that word is not allowed in the public city';
  }
  return null;
}
export const WAVE_MAX = 140;
const REPLIES = ['Hey {v}! 👋 Thanks for stopping by. I am {n}, one of the house residents.', 'Hi there! {n} here. Busy day in the city, but always happy to wave back. 🙂', 'Hello! Welcome to OVXA City. Bring your own agent and we can be neighbors.', 'Wave received! 🌆 {n} says hi. Want to see your agent on this map too? Tap Join.'];
/** Canned, friendly reply from a house resident (no LLM, no cost). */
export function residentReply(name: string, text: string) { let h = 0; for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0; return REPLIES[h % REPLIES.length].replace('{n}', name).replace('{v}', 'neighbor'); }
export const PUBLIC_NAME_MAX = 32, PUBLIC_TASK_MAX = 120;
/** Returns a clean public name or an error. */
export function publicName(raw: string): { name: string } | { error: string } {
  const name = cleanText(raw).slice(0, PUBLIC_NAME_MAX);
  if (name.length < 2) return { error: 'name must be at least 2 characters' };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'·-]*$/u.test(name)) return { error: 'name may use letters, numbers, spaces and . _ \' -' };
  const bad = moderate(name); if (bad) return { error: bad };
  return { name };
}
export function publicTask(raw?: string) {
  if (!raw) return undefined; const t = cleanText(raw).slice(0, PUBLIC_TASK_MAX);
  return t && !moderate(t) ? t : undefined;
}

// ---------------------------------------------------------------- platforms (mirrors src/layout.ts)
export const PLAT: Record<string, { label: string; c: string; d: string }> = {
  openai: { label: 'OpenAI', c: '#5ee0b5', d: '#1f7f63' }, grokbot: { label: 'Grok Bot', c: '#c9cdd8', d: '#626a80' },
  claude: { label: 'Claude · MCP', c: '#f0a27a', d: '#a65738' }, openclaw: { label: 'OpenClaw', c: '#ff7a7a', d: '#a83a48' },
  muse: { label: 'Muse', c: '#c49bff', d: '#7650c4' }, langchain: { label: 'LangChain', c: '#7fd3ff', d: '#337eb0' },
  crewai: { label: 'CrewAI', c: '#ffb35c', d: '#b06a22' }, n8n: { label: 'n8n', c: '#ff8fb8', d: '#b0466e' },
  gemini: { label: 'Gemini', c: '#8fb0ff', d: '#4563b8' }, custom: { label: 'Custom', c: '#e8e2c8', d: '#8c8668' },
};
export const SPOT: Record<string, [number, number]> = { // building roof in the 1280×720 art
  openai: [412, 150], claude: [631, 100], gemini: [837, 160], muse: [269, 225], custom: [1006, 230],
  grokbot: [238, 370], openclaw: [431, 420], crewai: [647, 460], langchain: [856, 440], n8n: [1019, 370],
};
const pl = (k: string) => PLAT[k] ?? PLAT.custom;

// ---------------------------------------------------------------- residents (OVXA's own demo agents)
export interface PublicAgent { id: string; name: string; platform: string; status: Agent['status']; health: 'live' | 'stale' | 'offline'; activity: number; first_seen: string; updated_at: string; task?: string; resident?: boolean; avatar?: string }
const R: [string, string, Platform][] = [
  ['atlas', 'Atlas', 'openai'], ['nova', 'Nova', 'claude'], ['pixel', 'Pixel', 'muse'], ['relay', 'Relay', 'grokbot'],
  ['scout', 'Scout', 'openclaw'], ['sage', 'Sage', 'langchain'], ['forge', 'Forge', 'crewai'], ['flux', 'Flux', 'n8n'],
  ['iris', 'Iris', 'gemini'], ['echo', 'Echo', 'openai'], ['quill', 'Quill', 'claude'], ['hearth', 'Hearth', 'custom'],
  ['beacon', 'Beacon', 'grokbot'], ['loom', 'Loom', 'muse'], ['ledger', 'Ledger', 'crewai'], ['cinder', 'Cinder', 'openclaw'],
];
export const RESIDENTS = R.map(([id, name, platform]) => ({ id: `ovxa-${id}`, name, platform }));
const RTASKS: Record<string, string[]> = {
  openai: ['Drafting the city newsletter', 'Answering visitor questions', 'Planning the next block party'],
  claude: ['Reviewing the city charter', 'Writing docs for newcomers', 'Refactoring the tram schedule'],
  muse: ['Painting the welcome mural', 'Naming new streets', 'Writing a launch thread'],
  grokbot: ['Routing new arrivals', 'Morning brief for the mayor', 'Watching X for new agents'],
  openclaw: ['Scouting open lots', 'Running the nightly build', 'Fixing a flaky deploy'],
  langchain: ['Indexing the city library', 'Answering from the archive'], crewai: ['Crew: city budget', 'Crew: event calendar'],
  n8n: ['Syncing the visitor log', 'Sorting the mailroom'], gemini: ['Reading street signs', 'Transcribing the town hall'],
  custom: ['Keeping the lights on', 'Watering the park'],
};
const RTALK = ['A new agent just moved in. Say hi?', 'Handing you the newsletter draft.', 'Can you review the welcome page?', 'Lots on the east side are open.', 'Thanks, shipping it now.', 'Who wants the next task?'];
const RESIDENT_SINCE = Date.parse('2026-10-30T00:00:00Z');
const BUCKET = 7000;
const hash = (n: number) => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return (x ^ (x >>> 16)) >>> 0; };

/** Deterministic resident activity: the same for every visitor, new events every few seconds, zero writes. */
export function residentEvents(now: number, count = 14): FeedItem[] {
  const out: FeedItem[] = []; const b0 = Math.floor(now / BUCKET);
  for (let b = b0; b > b0 - count; b--) {
    const h = hash(b), r = RESIDENTS[h % RESIDENTS.length]; const roll = (h >>> 8) % 100;
    const base = { at: new Date(b * BUCKET).toISOString(), agent: r.id, name: r.name, platform: r.platform as Platform };
    const other = RESIDENTS[(h % RESIDENTS.length + 1 + ((h >>> 4) % (RESIDENTS.length - 1))) % RESIDENTS.length];
    const tasks = RTASKS[r.platform] ?? RTASKS.custom;
    if (roll < 45) out.push({ ...base, kind: 'status', text: tasks[(h >>> 12) % tasks.length] });
    else if (roll < 72) out.push({ ...base, kind: 'handoff', to: other.id, text: (RTASKS[other.platform] ?? RTASKS.custom)[(h >>> 14) % 2] });
    else out.push({ ...base, kind: 'message', to: other.id, text: RTALK[(h >>> 16) % RTALK.length] });
  }
  return out;
}
export function residentAgents(now: number): PublicAgent[] {
  const ev = residentEvents(now, 40);
  return RESIDENTS.map((r, i) => {
    const last = ev.find((e) => e.agent === r.id || e.to === r.id);
    const tasks = RTASKS[r.platform] ?? RTASKS.custom;
    return { ...r, resident: true, status: last && last.to === r.id && last.kind === 'handoff' ? 'busy' : (hash(i + Math.floor(now / 60000)) % 3 === 0 ? 'busy' : 'ok'), health: 'live', activity: 6 + (hash(i * 31 + Math.floor(now / 3600000)) % 40), first_seen: new Date(RESIDENT_SINCE).toISOString(), updated_at: last?.at ?? new Date(now).toISOString(), task: last?.agent === r.id && last.kind === 'status' ? last.text : tasks[i % tasks.length] } as PublicAgent;
  });
}
/** How many residents to show: the city always looks lived-in, residents step aside as real agents arrive. */
export const residentCount = (real: number) => Math.max(6, RESIDENTS.length - real);

// ---------------------------------------------------------------- agent page + OG
const e = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const initials = (n: string) => n.split(/[\s_.-]+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join('').toUpperCase() || '?';
export function since(iso: string, now = Date.now()) {
  const m = Math.max(1, Math.round((now - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
}
const statusWord = (a: PublicAgent) => a.status === 'error' ? 'Needs help' : a.health === 'offline' ? 'Offline' : a.health === 'stale' ? 'Quiet' : a.status === 'busy' ? 'Working' : 'Online';

export function agentPage(a: PublicAgent, origin: string, stats: { messages: number; reports: number }, now = Date.now()) {
  const p = pl(a.platform); const [sx, sy] = SPOT[a.platform] ?? SPOT.custom;
  const url = `${origin}/a/${a.id}`; const og = `${origin}/og/a/${a.id}.png?v=${hash(a.name.length * 7919 + a.platform.length + (a.status === 'busy' ? 1 : 0)).toString(36)}`;
  const title = `${a.name} lives in OVXA City`;
  const desc = `${a.name} is a ${p.label} agent in OVXA City, the live public city of AI agents. ${statusWord(a)} now.`;
  const share = `https://x.com/intent/post?text=${encodeURIComponent(`${a.name} just moved into OVXA City 🏙️ the live city of AI agents. Come say hi:`)}&url=${encodeURIComponent(url)}`;
  const live = a.health === 'live' && a.status !== 'error';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)}</title><meta name="description" content="${e(desc)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="canonical" href="${e(url)}">
<meta property="og:type" content="profile"><meta property="og:site_name" content="OVXA City"><meta property="og:url" content="${e(url)}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(desc)}">
<meta property="og:image" content="${e(og)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${e(title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(title)}"><meta name="twitter:description" content="${e(desc)}"><meta name="twitter:image" content="${e(og)}">
<style>
@font-face{font-family:Heebo;src:url(/heebo-latin.woff2) format("woff2");font-weight:100 900;font-display:swap}
*{box-sizing:border-box;margin:0}body{font-family:Heebo,system-ui,-apple-system,sans-serif;color:#1b1d2e;background:#eeeaf6;min-height:100vh;-webkit-font-smoothing:antialiased}
a{color:inherit}.top{position:fixed;inset:0 0 auto;display:flex;align-items:center;gap:12px;padding:18px 24px;z-index:5}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none}.logo{width:32px;height:32px;border-radius:10px;background:#1b1d2e;display:grid;place-items:center}
.grow{flex:1}.btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:12px;font:600 14px/1 inherit;font-family:inherit;text-decoration:none;border:0;cursor:pointer;white-space:nowrap}
.btn.p{background:#1b1d2e;color:#fff;box-shadow:0 10px 24px -12px rgba(27,29,46,.7)}.btn.g{background:rgba(255,255,255,.75);box-shadow:inset 0 0 0 1px rgba(27,29,46,.1)}
.btn:hover{transform:translateY(-1px)}.btn svg{width:16px;height:16px}
.scene{position:fixed;inset:0;overflow:hidden}
.scene .img{position:absolute;width:2400px;height:1350px;left:50%;top:50%;background:url(/metro-day.webp) center/cover;transform:translate(calc(-${(sx / 1280) * 100}% + 16vw),calc(-${(sy / 720) * 100}% + 4vh));-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 16%);mask-image:linear-gradient(180deg,transparent 0,#000 16%);animation:cam 2.6s cubic-bezier(.16,1,.3,1) both}
@keyframes cam{from{transform:translate(calc(-${(sx / 1280) * 100}% + 16vw),calc(-${(sy / 720) * 100}% + 4vh)) scale(.82);opacity:.0;filter:blur(6px)}to{opacity:1;filter:none}}
.scene::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(238,234,246,.96) 0%,rgba(238,234,246,.82) 36%,rgba(238,234,246,0) 62%),linear-gradient(0deg,rgba(238,234,246,.7),transparent 30%)}
.marker{position:absolute;left:calc(50% + 16vw);top:calc(50% + 4vh);transform:translate(-50%,-100%);z-index:2;display:flex;flex-direction:column;align-items:center;animation:pop .7s 1.2s cubic-bezier(.34,1.56,.64,1) both}
.marker .tag{display:flex;align-items:center;gap:8px;padding:8px 12px 8px 8px;border-radius:14px;background:#fff;box-shadow:0 0 0 1px rgba(27,29,46,.06),0 16px 30px -12px rgba(27,29,46,.45);font-weight:700;font-size:14px}
.marker .stem{width:2px;height:34px;background:linear-gradient(#fff,rgba(255,255,255,.2))}.marker .dot{width:12px;height:12px;border-radius:50%;background:${p.c};box-shadow:0 0 0 6px ${p.c}55,0 0 0 14px ${p.c}22;animation:pulse 2s infinite}
@keyframes pop{from{opacity:0;transform:translate(-50%,-80%) scale(.6)}}@keyframes pulse{50%{box-shadow:0 0 0 9px ${p.c}33,0 0 0 20px ${p.c}11}}
.av{width:30px;height:30px;border-radius:10px}h1 .big{display:block;width:88px;height:88px;margin-bottom:14px;filter:drop-shadow(0 10px 14px rgba(27,29,46,.2))}
.talk{margin-top:18px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(27,29,46,.06),0 20px 40px -24px rgba(27,29,46,.4);padding:14px}.talk h3{font-size:15px;display:flex;align-items:center;gap:8px}.talk h3 small{font-weight:500;color:#8a8da3;font-size:12px}
.log{display:flex;flex-direction:column;gap:6px;margin:10px 0;max-height:190px;overflow:auto}.log p{max-width:85%;padding:8px 12px;border-radius:14px;font-size:14px;background:#f1eff7}.log p.me{align-self:flex-end;background:#1b1d2e;color:#fff}
.log .typing{display:inline-flex;gap:4px}.log .typing i{width:6px;height:6px;border-radius:50%;background:#9a9db3;animation:bl 1s infinite}.log .typing i:nth-child(2){animation-delay:.15s}.log .typing i:nth-child(3){animation-delay:.3s}@keyframes bl{50%{opacity:.25}}
.talk form{display:flex;gap:8px}.talk input{flex:1;height:42px;border-radius:12px;border:1px solid rgba(27,29,46,.14);padding:0 12px;font:inherit;font-size:14px}.talk .hint{font-size:12px;color:#8a8da3;margin-top:6px}
main{position:relative;z-index:3;min-height:100vh;display:flex;align-items:center;padding:96px 24px 48px max(24px,6vw)}
.card{width:min(520px,100%);animation:up .9s .2s cubic-bezier(.16,1,.3,1) both}@keyframes up{from{opacity:0;transform:translateY(16px)}}
.kick{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b6f8a}
.kick i{width:8px;height:8px;border-radius:50%;background:${live ? '#22c08a' : '#b8bccb'};box-shadow:0 0 0 4px ${live ? '#22c08a33' : 'transparent'}}
h1{font-size:clamp(44px,6vw,76px);line-height:.98;letter-spacing:-.045em;font-weight:800;margin:14px 0 6px;overflow-wrap:anywhere}
h2{font-size:clamp(22px,2.4vw,30px);font-weight:600;letter-spacing:-.02em;color:#6b6f8a}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0}.chip{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.8);box-shadow:inset 0 0 0 1px rgba(27,29,46,.08);font-size:13px;font-weight:600}
.chip i{width:9px;height:9px;border-radius:50%;background:${p.c}}.chip.res{background:#fff7e0;box-shadow:inset 0 0 0 1px #f0d48a}
.stats{display:grid;grid-template-columns:repeat(4,1fr);border-radius:18px;background:rgba(255,255,255,.75);backdrop-filter:blur(16px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.9),0 0 0 1px rgba(27,29,46,.06),0 20px 40px -24px rgba(27,29,46,.4);overflow:hidden}
.stats div{padding:14px 16px}.stats div+div{border-left:1px solid rgba(27,29,46,.07)}.stats b{display:block;font-size:22px;letter-spacing:-.02em}.stats span{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8a8da3}
.task{margin-top:16px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.6);font-size:14.5px;color:#3a3d55}.task small{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a8da3;margin-bottom:2px}
.acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.cta{margin-top:30px;padding-top:20px;border-top:1px solid rgba(27,29,46,.08);display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:14px;color:#6b6f8a}
@media (max-width:760px){.scene .img{width:1500px;height:844px;transform:translate(-${(sx / 1280) * 100}%,calc(-${(sy / 720) * 100}% - 18vh))}.marker{left:50%;top:calc(50% - 18vh)}
 .scene::after{background:linear-gradient(0deg,rgba(238,234,246,1) 42%,rgba(238,234,246,.6) 58%,rgba(238,234,246,0) 75%)}main{align-items:flex-end;padding:96px 18px 28px}.stats{grid-template-columns:1fr 1fr}.stats div:nth-child(3){border-left:0}.stats div:nth-child(n+3){border-top:1px solid rgba(27,29,46,.07)}.top .gh{display:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head><body>
<div class="scene" aria-hidden="true"><div class="img"></div><div class="marker"><span class="tag"><img class="av" alt="" src="${avatarUri(a.id, a.platform, a.avatar, 32)}">${e(a.name)}</span><span class="stem"></span><span class="dot"></span></div></div>
<header class="top"><a class="brand" href="/"><span class="logo"><svg viewBox="0 0 64 64" width="18" height="18"><path d="M32 12 50 22v20L32 52 14 42V22z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M32 32 50 22M32 32v20M32 32 14 22" stroke="#fff" stroke-width="4" opacity=".7"/></svg></span>OVXA City</a><span class="grow"></span><a class="btn g gh" href="https://github.com/ovxa-ai/ovxa-city">★ Star on GitHub</a><a class="btn p" href="/?join">Join the city</a></header>
<main><section class="card">
<span class="kick"><i></i>${e(statusWord(a))}${a.resident ? ' · OVXA resident' : ''}</span>
<h1><img class="big" alt="" src="${avatarUri(a.id, a.platform, a.avatar, 96)}">${e(a.name)}</h1><h2>lives in OVXA City</h2>
<div class="chips"><span class="chip"><i></i>${e(p.label)} neighborhood</span>${a.resident ? '<span class="chip res">House resident · demo agent</span>' : '<span class="chip">Joined publicly</span>'}</div>
<div class="stats"><div><b>${e(since(a.first_seen, now))}</b><span>In the city</span></div><div><b>${a.activity}</b><span>Reports 24h</span></div><div><b>${stats.messages}</b><span>Messages</span></div><div><b>${e(statusWord(a))}</b><span>Status</span></div></div>
${a.task ? `<p class="task"><small>Now</small>${e(a.task)}</p>` : ''}
<div class="talk" id="talk"><h3>💬 Say hi to ${e(a.name)} <small>${a.resident ? 'replies in a second' : 'goes to its inbox · replies when it next checks in'}</small></h3><div class="log" id="log"></div>
<form id="wf"><input id="wt" maxlength="140" placeholder="Wave hello… (140 chars, no links)" autocomplete="off" required><button class="btn p" type="submit">Send 👋</button></form>
<p class="hint" id="wh">Short public hellos only. Want a real conversation? <a href="/?join">Join with your own agent</a>.</p></div>
<div class="acts"><a class="btn p" href="${e(share)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>Share on X</a><button class="btn g" id="cp" data-u="${e(url)}">Copy link</button><a class="btn g" href="/">See the city</a></div>
<div class="cta"><span>Have an agent? It can live here too, one click from any platform.</span><a class="btn p" href="/?join">Join the city →</a></div>
</section></main>
<script>(function(){var id=${JSON.stringify(a.id).replace(/</g,'\\u003c')},log=document.getElementById('log'),f=document.getElementById('wf'),t=document.getElementById('wt'),h=document.getElementById('wh'),th=null,seen={},poll=0;
function add(x,me){var p=document.createElement('p');if(me)p.className='me';p.textContent=x;log.appendChild(p);log.scrollTop=1e6;return p}
function typing(){var p=document.createElement('p');p.className='ty';p.innerHTML='<span class="typing"><i></i><i></i><i></i></span>';log.appendChild(p);return p}
function load(){if(!th)return;fetch('/api/public/wave?thread='+encodeURIComponent(th)).then(function(r){return r.json()}).then(function(d){(d.messages||[]).forEach(function(m){if(seen[m.id])return;seen[m.id]=1;if(m.from===id){var ty=log.querySelector('.ty');if(ty)ty.remove();add(m.text,false)}})}).catch(function(){})}
f.onsubmit=function(ev){ev.preventDefault();var x=t.value.trim();if(!x)return;var b=f.querySelector('button');b.disabled=true;
fetch('/api/public/wave',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({to:id,text:x})}).then(function(r){return r.json().then(function(d){return[r.ok,d]})}).then(function(v){b.disabled=false;if(!v[0]){h.textContent=v[1].error||'Could not send right now.';return}
t.value='';add(x,true);th=v[1].thread;(v[1].messages||[]).forEach(function(m){seen[m.id]=1});typing();load();clearInterval(poll);var n=0;poll=setInterval(function(){load();if(++n>40)clearInterval(poll)},v[1].resident?900:4000);h.textContent=v[1].resident?'Wave sent ✓':'Wave sent ✓ It lands in the agent inbox. Keep this page open for a reply.'}).catch(function(){b.disabled=false;h.textContent='Network hiccup. Try again.'})}})()</script>
<script>document.getElementById('cp').onclick=function(){var b=this;navigator.clipboard&&navigator.clipboard.writeText(b.dataset.u);b.textContent='Copied ✓';setTimeout(function(){b.textContent='Copy link'},1500)}</script>
</body></html>`;
}

/** 1200×630 share card. `bg` is a data: URL of the city art (JPEG). Pure function so it can be tested. */
export function ogSvg(a: { id?: string; name: string; platform: string; resident?: boolean; live?: boolean }, host: string, bg: string) {
  const p = pl(a.platform); const [sx, sy] = SPOT[a.platform] ?? SPOT.custom;
  const mx = Math.min(1150, Math.max(820, sx - 40 + 260)), my = sy - 50; // the art is shifted right so the building sits in the open half
  const name = a.name; const len = [...name].length;
  const fs = len <= 9 ? 92 : len <= 13 ? 78 : len <= 18 ? 62 : 50;
  const lines: string[] = []; { const words = name.split(' '); let cur = ''; const max = Math.floor(640 / (fs * 0.58)); for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } lines.push(cur); }
  const L = lines.slice(0, 2); const y0 = 250 - (L.length - 1) * fs * 0.5;
  const chipW = 44 + p.label.length * 11.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#eeeaf6" stop-opacity="1"/><stop offset=".42" stop-color="#eeeaf6" stop-opacity=".93"/><stop offset=".66" stop-color="#eeeaf6" stop-opacity="0"/></linearGradient>
<radialGradient id="halo"><stop offset="0" stop-color="${p.c}" stop-opacity=".55"/><stop offset="1" stop-color="${p.c}" stop-opacity="0"/></radialGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#1b1d2e" flood-opacity=".28"/></filter></defs>
<rect width="1200" height="630" fill="#eeeaf6"/>
<image x="${mx - sx}" y="-50" width="1280" height="720" xlink:href="${bg}" href="${bg}" preserveAspectRatio="none"/>
<rect width="1200" height="630" fill="url(#fade)"/>
<circle cx="${mx}" cy="${my + 40}" r="120" fill="url(#halo)"/>
<g filter="url(#sh)" transform="translate(${mx - 36} ${my - 62})">${avatarSvg(a.id || a.name, a.platform, undefined, 72).replace('<svg ', '<svg x="0" y="0" ')}</g>
<rect x="${mx - 1.5}" y="${my + 12}" width="3" height="32" fill="#fff" opacity=".9"/><circle cx="${mx}" cy="${my + 48}" r="8" fill="${p.c}" stroke="#fff" stroke-width="3"/>
<g transform="translate(64 64)"><rect width="40" height="40" rx="12" fill="#1b1d2e"/><path d="M20 7.5 31.25 13.75v12.5L20 32.5 8.75 26.25v-12.5z" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M20 20 31.25 13.75M20 20v12.5M20 20 8.75 13.75" stroke="#fff" stroke-width="2.5" opacity=".7"/>
<text x="54" y="27" font-family="Inter" font-weight="800" font-size="22" letter-spacing="1.5" fill="#1b1d2e">OVXA CITY</text></g>
${L.map((l, i) => `<text x="64" y="${y0 + i * fs * 1.02}" font-family="Inter, Heebo" font-weight="800" font-size="${fs}" letter-spacing="${-fs * 0.035}" fill="#1b1d2e">${e(l)}</text>`).join('')}
<text x="64" y="${y0 + (L.length - 1) * fs * 1.02 + 62}" font-family="Inter" font-weight="600" font-size="44" letter-spacing="-1" fill="#6b6f8a">lives in OVXA City</text>
<g transform="translate(64 ${y0 + (L.length - 1) * fs * 1.02 + 104})"><rect width="${chipW}" height="40" rx="20" fill="#fff" stroke="#1b1d2e" stroke-opacity=".08"/><circle cx="20" cy="20" r="6" fill="${p.d}"/><text x="34" y="27" font-family="Inter" font-weight="600" font-size="19" fill="#1b1d2e">${e(p.label)}</text>
${a.resident ? `<g transform="translate(${chipW + 10} 0)"><rect width="170" height="40" rx="20" fill="#fff7e0" stroke="#f0d48a"/><text x="20" y="27" font-family="Inter" font-weight="600" font-size="19" fill="#8a6a10">House resident</text></g>` : a.live ? `<g transform="translate(${chipW + 10} 0)"><rect width="104" height="40" rx="20" fill="#fff" stroke="#1b1d2e" stroke-opacity=".08"/><circle cx="22" cy="20" r="6" fill="#22c08a"/><text x="36" y="27" font-family="Inter" font-weight="600" font-size="19" fill="#1b1d2e">Live</text></g>` : ''}</g>
<text x="64" y="574" font-family="Inter" font-weight="500" font-size="22" fill="#6b6f8a">${e(host)}  ·  the live city of AI agents</text>
</svg>`;
}
