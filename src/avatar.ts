/**
 * Deterministic agent avatars and neutral platform glyphs. Pure strings, no DOM, shared by the app and the Worker.
 * Every agent gets a soft-3D squircle badge: platform hue, per-agent tone and monogram from its id.
 * Known platforms show their official brand mark (src/logos.ts); unknown ones fall back to a neutral glyph.
 */
import { LOGO } from './logos';
// Platform families: base hue / saturation, tuned to the soft daylight palette of the diorama.
const FAM: Record<string, [number, number]> = {
  openai: [158, 46], grokbot: [228, 14], claude: [20, 62], openclaw: [356, 58], muse: [268, 50],
  langchain: [200, 58], crewai: [32, 70], n8n: [334, 54], gemini: [222, 62], custom: [44, 30],
};
export function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const ex = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const isEmoji = (v?: string) => !!v && !v.startsWith('https:') && v.length <= 16;
const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)},${Math.round(s)}%,${Math.round(l)}%)`;
/** iOS-style continuous-corner squircle in a 64 box, inset by `i`. */
const sq = (i: number) => { const a = i, b = 64 - i, k = (b - a) * 0.3; return `M${a + k} ${a}H${b - k}C${b - k * 0.18} ${a} ${b} ${a + k * 0.18} ${b} ${a + k}V${b - k}C${b} ${b - k * 0.18} ${b - k * 0.18} ${b} ${b - k} ${b}H${a + k}C${a + k * 0.18} ${b} ${a} ${b - k * 0.18} ${a} ${b - k}V${a + k}C${a} ${a + k * 0.18} ${a + k * 0.18} ${a} ${a + k} ${a}Z`; };
export const monogram = (id: string) => ((id || 'a').replace(/^(ovxa|oc|agent)[-_.]/, '').match(/[a-z0-9]/i)?.[0] ?? 'A').toUpperCase();

/**
 * Agent badge: soft-3D squircle (platform hue, per-agent tone from the id), top light, inner rim,
 * white monogram, and from 24px up a small white chip with the platform glyph.
 * `custom` may be an emoji or an https URL (URL only where the caller allows it).
 */
export function avatarSvg(id: string, platform: string, custom?: string, size = 64) {
  const [H, S] = FAM[platform] ?? FAM.custom;
  const h = hash(id || 'agent');
  const hue = H + ((h % 21) - 10), sat = S + ((h >>> 9) % 11) - 5, d = ((h >>> 5) % 7) - 3; // per-agent tone
  const top = hsl(hue - 8, sat * 0.85, 92 + d * 0.6), bot = hsl(hue + 6, sat, 79 + d), slab = hsl(hue + 8, sat * 0.9, 64 + d), ink = hsl(hue + 6, Math.min(sat + 12, 80), 30 + d);
  const u = `a${h.toString(36)}${size}`;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">`;
  const defs = `<defs><linearGradient id="${u}g" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`
    + `<linearGradient id="${u}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
  // soft-3D tile: a slab edge below (like the diorama's ground), a pastel top face, a crisp top-light rim
  const tile = (inner: string) => `<path d="${sq(3)}" transform="translate(0 3)" fill="${slab}"/><path d="${sq(3)}" fill="url(#${u}g)"/>${inner}<path d="${sq(3.6)}" fill="none" stroke="url(#${u}r)" stroke-width="1.2"/><path d="${sq(3)}" fill="none" stroke="${ink}" stroke-opacity=".10"/>`;
  if (custom && isEmoji(custom)) return `${open}${defs}${tile(`<text x="32" y="41.5" text-anchor="middle" font-size="28">${ex(custom)}</text>`)}</svg>`;
  if (custom && /^https:\/\//.test(custom)) return `${open}${defs}<clipPath id="${u}c"><path d="${sq(3)}"/></clipPath>${tile(`<image href="${ex(custom)}" width="64" height="64" clip-path="url(#${u}c)" preserveAspectRatio="xMidYMid slice"/>`)}</svg>`;
  const chip = size >= 56;
  const font = `font-family="Inter, 'SF Pro Display', -apple-system, 'Segoe UI', Roboto, sans-serif" font-weight="650" letter-spacing="-.4"`;
  const letter = `<text x="${chip ? 29 : 32}" y="${chip ? 40.5 : 42}" text-anchor="middle" ${font} font-size="${chip ? 26 : 30}" fill="${ink}">${monogram(id)}</text>`;
  const badge = chip ? `<circle cx="47" cy="47.5" r="9.5" fill="${slab}"/><circle cx="47" cy="46.5" r="9.5" fill="#fff"/><g transform="translate(40.4 39.9) scale(.55)" color="${BRAND[platform] ?? ink}">${GLYPH[platform] ?? GLYPH.custom}</g>` : '';
  // Small badges can't fit the chip: show the platform's logo itself when we have one.
  if (!chip && LOGO[platform]) return `${open}${defs}${tile(`<g transform="translate(17 15) scale(1.25)" color="${BRAND[platform] ?? ink}">${LOGO[platform]}</g>`)}</svg>`;
  return `${open}${defs}${tile(letter)}${badge}</svg>`;
}
export const avatarUri = (id: string, platform: string, custom?: string, size = 64) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(id, platform, custom, size))}`;

/** Official brand colour per platform, used for the logo mark. */
export const BRAND: Record<string, string> = {
  openai: '#0d0d0d', grokbot: '#0d0d0d', grok: '#0d0d0d', xai: '#0d0d0d', claude: '#d97757', anthropic: '#191919', cursor: '#0d0d0d',
  gemini: '#3186ff', openclaw: '#e5484d', muse: '#6d4aff', langchain: '#1c3c3c', crewai: '#ff5a50', n8n: '#ea4b71', mcp: '#0d0d0d', copilot: '#0d0d0d', windsurf: '#0b100f',
};
/** 24×24 marks: brand logos where known, neutral geometric glyphs otherwise. */
export const GLYPH: Record<string, string> = {
  openai: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>',
  grokbot: '<path d="M5 17 12 5l7 12z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
  claude: '<path d="M8 4v5M16 4v5M6 9h12v3a6 6 0 0 1-12 0zM12 18v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  openclaw: '<path d="M6 18c0-7 3-12 6-12s6 5 6 12M9 18c0-4 1.4-7 3-7s3 3 3 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  muse: '<path d="M12 4c4 4 4 12 0 16-4-4-4-12 0-16z" fill="currentColor" opacity=".9"/>',
  langchain: '<rect x="3" y="9" width="9" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="12" y="9" width="9" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  crewai: '<circle cx="8" cy="9" r="3" fill="currentColor"/><circle cx="16" cy="9" r="3" fill="currentColor"/><path d="M3 19c1-3 3-4 5-4s4 1 4 4m0 0c0-3 2-4 4-4s4 1 5 4" fill="none" stroke="currentColor" stroke-width="2"/>',
  n8n: '<circle cx="5" cy="12" r="2.6" fill="currentColor"/><circle cx="19" cy="7" r="2.6" fill="currentColor"/><circle cx="19" cy="17" r="2.6" fill="currentColor"/><path d="M7.5 12h4l5-5M11.5 12l5 5" fill="none" stroke="currentColor" stroke-width="2"/>',
  gemini: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
  custom: '<rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
  mcp: '<path d="M8 4v5M16 4v5M6 9h12v3a6 6 0 0 1-12 0zM12 18v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  live: '<path d="M4 12h3l2-5 4 10 2-5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
};
Object.assign(GLYPH, LOGO);
/** Inline logo. `brand` paints it in the platform's official colour. */
export const glyph = (k: string, size = 16, brand = false) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"${brand && BRAND[k] ? ` style="color:${BRAND[k]}"` : ''}>${GLYPH[k] ?? GLYPH.custom}</svg>`;

