/** Dynamic 1200×630 OG cards, rendered inside the Worker with resvg (WASM). Loaded lazily so tests never touch WASM. */
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import inter800 from '../assets/inter-800.ttf';
import inter600 from '../assets/inter-600.ttf';
import inter500 from '../assets/inter-500.ttf';
import heebo800 from '../assets/heebo-800.ttf';
import type { Env } from './index';
import { ogSvg } from './public';

let ready: Promise<void> | null = null;
let bg: string | null = null;

function b64(buf: ArrayBuffer) {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function renderOg(a: { name: string; platform: string; resident?: boolean; live?: boolean }, host: string, env: Env, origin: string): Promise<Uint8Array> {
  ready ??= initWasm(wasm as WebAssembly.Module);
  await ready;
  if (!bg && env.ASSETS) {
    const r = await env.ASSETS.fetch(new Request(`${origin}/og-bg.jpg`));
    if (r.ok) bg = `data:image/jpeg;base64,${b64(await r.arrayBuffer())}`;
  }
  const svg = ogSvg(a, host, bg ?? 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { fontBuffers: [inter800, inter600, inter500, heebo800].map((f) => new Uint8Array(f as ArrayBuffer)), defaultFontFamily: 'Inter', sansSerifFamily: 'Inter', loadSystemFonts: false } as any,
  });
  const png = r.render().asPng();
  r.free();
  return png;
}
