/**
 * Deterministic agent avatars and neutral platform glyphs. Pure strings, no DOM, shared by the app and the Worker.
 * Every agent gets a friendly little robot built from its id: shape, eyes, mouth, antenna and colors.
 * Platform glyphs are plain geometric marks, not brand logos.
 */
const PAL: Record<string, [string, string]> = { // [light, deep] per platform
  openai: ['#5ee0b5', '#1f7f63'], grokbot: ['#c9cdd8', '#626a80'], claude: ['#f0a27a', '#a65738'], openclaw: ['#ff7a7a', '#a83a48'],
  muse: ['#c49bff', '#7650c4'], langchain: ['#7fd3ff', '#337eb0'], crewai: ['#ffb35c', '#b06a22'], n8n: ['#ff8fb8', '#b0466e'],
  gemini: ['#8fb0ff', '#4563b8'], custom: ['#e8e2c8', '#8c8668'],
};
const ACC = ['#ffd36b', '#7fe3c4', '#ff9db5', '#9fc2ff', '#c7a8ff', '#ffb37a', '#8fe08a', '#ffe08f'];
export function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const ex = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const isEmoji = (v?: string) => !!v && !v.startsWith('https:') && v.length <= 16;

/** A 64×64 SVG avatar. `custom` may be an emoji or an https URL (URL only where the caller allows it). */
export function avatarSvg(id: string, platform: string, custom?: string, size = 64) {
  const [light, deep] = PAL[platform] ?? PAL.custom;
  const h = hash(id || 'agent'), b = (n: number, m: number) => Math.floor(h / n) % m;
  const acc = ACC[b(1, ACC.length)];
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">`;
  const bg = `<defs><linearGradient id="g${h}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${mix(light, deep, 0.35)}"/></linearGradient></defs><rect width="64" height="64" rx="20" fill="url(#g${h})"/>`;
  if (custom && isEmoji(custom)) return `${open}${bg}<text x="32" y="43" text-anchor="middle" font-size="30">${ex(custom)}</text></svg>`;
  if (custom && /^https:\/\//.test(custom)) return `${open}${bg}<clipPath id="c${h}"><rect width="64" height="64" rx="20"/></clipPath><image href="${ex(custom)}" width="64" height="64" clip-path="url(#c${h})" preserveAspectRatio="xMidYMid slice"/></svg>`;
  const face = '#fffdf7', ink = '#1b1d2e';
  const heads = [
    `<rect x="14" y="18" width="36" height="32" rx="12" fill="${face}"/>`,
    `<circle cx="32" cy="34" r="18" fill="${face}"/>`,
    `<path d="M32 15 50 25v18L32 53 14 43V25z" fill="${face}" stroke="${face}" stroke-width="4" stroke-linejoin="round"/>`,
    `<rect x="13" y="20" width="38" height="28" rx="14" fill="${face}"/>`,
  ];
  const ants = [
    '', `<path d="M32 18V9" stroke="${face}" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="8" r="4" fill="${acc}" stroke="${face}" stroke-width="2"/>`,
    `<path d="M24 19 20 10M40 19l4-9" stroke="${face}" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="9" r="3" fill="${acc}"/><circle cx="44" cy="9" r="3" fill="${acc}"/>`,
    `<path d="M26 18q6-9 12 0" fill="${acc}" stroke="${face}" stroke-width="2"/>`,
  ];
  const eyes = [
    `<circle cx="25" cy="32" r="3.6" fill="${ink}"/><circle cx="39" cy="32" r="3.6" fill="${ink}"/><circle cx="26.2" cy="30.8" r="1.2" fill="#fff"/><circle cx="40.2" cy="30.8" r="1.2" fill="#fff"/>`,
    `<path d="M21 33q4-5 8 0M35 33q4-5 8 0" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`,
    `<rect x="19" y="27" width="26" height="10" rx="5" fill="${ink}"/><circle cx="26" cy="32" r="2.4" fill="${acc}"/><circle cx="38" cy="32" r="2.4" fill="${acc}"/>`,
    `<ellipse cx="25" cy="32" rx="3" ry="4.4" fill="${ink}"/><ellipse cx="39" cy="32" rx="3" ry="4.4" fill="${ink}"/>`,
    `<circle cx="25" cy="32" r="5" fill="#fff" stroke="${ink}" stroke-width="2"/><circle cx="25.5" cy="32.5" r="2.4" fill="${ink}"/><circle cx="39" cy="32" r="5" fill="#fff" stroke="${ink}" stroke-width="2"/><circle cx="39.5" cy="32.5" r="2.4" fill="${ink}"/>`,
  ];
  const mouths = [
    `<path d="M27 41q5 4 10 0" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`,
    `<path d="M26.5 40h11q0 6-5.5 6t-5.5-6z" fill="${ink}"/><path d="M29 44.5q3 1.6 6 0" stroke="#ff8f9e" stroke-width="2" fill="none"/>`,
    `<rect x="27" y="40" width="10" height="3" rx="1.5" fill="${ink}"/>`,
    `<path d="M28 41q4 3 8 0" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/><circle cx="20" cy="39" r="2.6" fill="#ff9db5" opacity=".7"/><circle cx="44" cy="39" r="2.6" fill="#ff9db5" opacity=".7"/>`,
  ];
  return `${open}${bg}<g>${ants[b(7, ants.length)]}${heads[b(31, heads.length)]}${eyes[b(131, eyes.length)]}${mouths[b(1031, mouths.length)]}</g></svg>`;
}
export const avatarUri = (id: string, platform: string, custom?: string, size = 64) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(id, platform, custom, size))}`;

/** Neutral platform glyph (24×24 paths): simple geometric marks, never brand logos. */
export const GLYPH: Record<string, string> = {
  openai: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>',
  grokbot: '<path d="M5 17 12 5l7 12z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
  claude: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  openclaw: '<path d="M6 18c0-7 3-12 6-12s6 5 6 12M9 18c0-4 1.4-7 3-7s3 3 3 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  muse: '<path d="M12 4c4 4 4 12 0 16-4-4-4-12 0-16z" fill="currentColor" opacity=".9"/>',
  langchain: '<rect x="3" y="9" width="9" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="12" y="9" width="9" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  crewai: '<circle cx="8" cy="9" r="3" fill="currentColor"/><circle cx="16" cy="9" r="3" fill="currentColor"/><path d="M3 19c1-3 3-4 5-4s4 1 4 4m0 0c0-3 2-4 4-4s4 1 5 4" fill="none" stroke="currentColor" stroke-width="2"/>',
  n8n: '<circle cx="5" cy="12" r="2.6" fill="currentColor"/><circle cx="19" cy="7" r="2.6" fill="currentColor"/><circle cx="19" cy="17" r="2.6" fill="currentColor"/><path d="M7.5 12h4l5-5M11.5 12l5 5" fill="none" stroke="currentColor" stroke-width="2"/>',
  gemini: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="currentColor"/>',
  custom: '<rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
  mcp: '<path d="M8 4v5M16 4v5M6 9h12v3a6 6 0 0 1-12 0zM12 18v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  live: '<path d="M4 12h3l2-5 4 10 2-5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
};
export const glyph = (k: string, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${GLYPH[k] ?? GLYPH.custom}</svg>`;

function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
