import { t, lang } from './i18n';
import type { Placed, Bot } from './data';
import { TOWN_HALL, LOT } from './data';

const REPO = 'github.com/ovxa-ai';

function rr(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath(); x.roundRect(X, Y, w, h, r);
}

/** Render a 1600×900 PNG: the city, one pill per bot, title, and a subtle OVXA watermark. No request contents. */
export async function renderShare(opts: { night: boolean; placed: Placed[]; lot: Bot[] }): Promise<Blob> {
  await document.fonts.ready;
  const W = 1600, H = 900, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;
  const img = new Image(); img.src = opts.night ? '/city-night.webp' : '/city-day.webp';
  await img.decode();
  // background matched to the illustration's sky
  const g = x.createLinearGradient(0, 0, 0, H);
  if (opts.night) { g.addColorStop(0, '#020829'); g.addColorStop(1, '#0a1a44'); } else { g.addColorStop(0, '#c3c8df'); g.addColorStop(1, '#ecdfe4'); }
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const sw = W * 0.98, sh = sw * 9 / 16, ox = (W - sw) / 2, oy = H - sh + 10;
  x.drawImage(img, ox, oy, sw, sh);
  const S = sw / 1024;
  const ink = opts.night ? '#eceaff' : '#24223a', mute = opts.night ? 'rgba(236,234,255,.65)' : 'rgba(36,34,58,.6)';
  const font = (w: number, s: number) => `${w} ${s}px Heebo, system-ui, sans-serif`;
  const pill = (label: string, cx: number, cy: number, dot: string) => {
    x.font = font(600, 22); const tw = x.measureText(label).width, pw = tw + 46, ph = 40;
    const px = Math.min(Math.max(cx - pw / 2, 16), W - pw - 16), py = cy - ph;
    x.save(); x.shadowColor = 'rgba(30,20,80,.25)'; x.shadowBlur = 18; x.shadowOffsetY = 6;
    x.fillStyle = opts.night ? 'rgba(20,24,56,.86)' : 'rgba(255,255,255,.9)'; rr(x, px, py, pw, ph, 20); x.fill(); x.restore();
    x.fillStyle = dot; x.beginPath(); x.arc(lang === 'he' ? px + pw - 20 : px + 20, py + ph / 2, 5, 0, 7); x.fill();
    x.fillStyle = ink; x.textBaseline = 'middle'; x.direction = lang === 'he' ? 'rtl' : 'ltr';
    x.textAlign = 'center'; x.fillText(label, px + pw / 2 + (lang === 'he' ? -6 : 6), py + ph / 2 + 1);
  };
  for (const p of opts.placed) pill(p.bot.name, ox + p.slot.x * S, oy + (p.slot.top - 6) * S, p.slot.color);
  pill(t('townHall'), ox + TOWN_HALL.x * S, oy + (TOWN_HALL.top + 10) * S, TOWN_HALL.color);
  if (opts.lot.length) pill(`${t('construction')}: ${opts.lot[0].name}`, ox + (LOT.x + 10) * S, oy + (LOT.top - 4) * S, LOT.color);

  // title
  x.direction = lang === 'he' ? 'rtl' : 'ltr'; x.textAlign = lang === 'he' ? 'right' : 'left'; x.textBaseline = 'alphabetic';
  const tx = lang === 'he' ? W - 56 : 56;
  x.fillStyle = ink; x.font = font(800, 52); x.fillText(t('shareTitle'), tx, 92);
  x.fillStyle = mute; x.font = font(500, 24);
  x.fillText(`${opts.placed.length + opts.lot.length} ${t('bots')} · ${t('brandSub')}`, tx, 130);
  // watermark
  x.direction = 'ltr'; x.textAlign = 'right'; x.font = font(600, 18); x.fillStyle = mute;
  x.fillText(`${t('builtWith')} · ${REPO}`, W - 28, H - 24);
  return new Promise((res) => cv.toBlob((b) => res(b!), 'image/png'));
}

export async function share(blob: Blob) {
  const file = new File([blob], 'my-ovxa-city.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: t('shareTitle'), text: `${t('shareTitle')} — https://${REPO}` }); return; } catch { /* fall through to download */ }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
