"""Launch assets: docs screenshots, public/og.png, apple-touch-icon and docs/launch-16x9.mp4 + launch-9x16.mp4.
Usage: npm run build && npx wrangler dev --port 8799 & python3 scripts/launch.py [agent-id]"""
from playwright.sync_api import sync_playwright
import subprocess, glob, os, shutil, sys
U = os.environ.get('CITY', 'http://localhost:8799'); AG = sys.argv[1] if len(sys.argv) > 1 else 'atlas-scholar'
URL = 'ovxa-city.bendrori45.workers.dev'
END = """(u) => { const d = document.createElement('div'); d.id = 'endcard';
  d.innerHTML = `<div><svg viewBox="0 0 40 40" width="64" height="64"><rect width="40" height="40" rx="12" fill="#1b1d2e"/><path d="M20 7.5 31.25 13.75v12.5L20 32.5 8.75 26.25v-12.5z" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg><h2>Your agent can live here.</h2><p>${u}</p></div>`;
  Object.assign(d.style, { position: 'fixed', inset: 0, zIndex: 9999, display: 'grid', placeItems: 'center', textAlign: 'center', background: 'rgba(238,234,246,.82)', backdropFilter: 'blur(14px)', opacity: 0, transition: 'opacity .8s', font: '800 clamp(28px,4.4vw,64px)/1.05 Inter,system-ui,sans-serif', color: '#1b1d2e', letterSpacing: '-.03em' });
  document.body.appendChild(d); const p = d.querySelector('p'); Object.assign(p.style, { marginTop: '18px', font: '700 clamp(18px,2.2vw,32px)/1.2 Inter,system-ui,sans-serif', color: '#5b4fd6', letterSpacing: '0' });
  d.querySelector('svg').style.marginBottom = '22px'; requestAnimationFrame(() => (d.style.opacity = 1)); }"""

def rec(name, vw, vh, dpr, out, mobile):
    tmp = f'/tmp/ovlaunch-{name}'; shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=dpr, record_video_dir=tmp, record_video_size={'width': vw * dpr, 'height': vh * dpr})
        pg = ctx.new_page(); pg.goto(U + '/'); pg.wait_for_timeout(5200)
        if not mobile:
            c = pg.locator('.pin[data-p=claude] .card').bounding_box()
            pg.mouse.move(c['x'] + c['width'] / 2, c['y'] + c['height'] / 2, steps=25); pg.wait_for_timeout(1600)
            pg.mouse.move(vw * 0.1, vh * 0.33, steps=20); pg.wait_for_timeout(300)
        pg.click('#connect'); pg.wait_for_timeout(1500); pg.locator('.cw-tile').first.hover(); pg.wait_for_timeout(700)
        pg.keyboard.press('Escape'); pg.goto(U + f'/a/{AG}', wait_until='networkidle'); pg.wait_for_timeout(3000)
        pg.evaluate(END, URL); pg.wait_for_timeout(3200)
        ctx.close(); b.close()
    src = glob.glob(tmp + '/*.webm')[0]
    subprocess.run(['ffmpeg', '-y', '-ss', '0.5', '-i', src, '-t', '15.5', '-vf', f'scale={vw*dpr}:{vh*dpr}:flags=lanczos,fps=30', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], check=True, capture_output=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1600, 'height': 900}, device_scale_factor=2); pg.goto(U + '/'); pg.wait_for_timeout(6500); pg.screenshot(path='docs/public-city.png')
    pg.goto(U + f'/a/{AG}'); pg.wait_for_timeout(2000); pg.screenshot(path='docs/agent-page.png')
    pg.goto(U + f'/og/a/{AG}.png'); open('docs/og-agent.png', 'wb').write(pg.request.get(U + f'/og/a/{AG}.png').body())
    o = b.new_page(viewport={'width': 1200, 'height': 630}); o.goto(U + '/'); o.wait_for_timeout(6500)
    o.add_style_tag(content='.m-feed,.m-stats,.m-top nav,.m-hero p,.m-cta small,#m-toast,.bubble,.m-tip{display:none!important}'); o.wait_for_timeout(300); o.screenshot(path='public/og.png')
    i = b.new_page(viewport={'width': 180, 'height': 180}); i.set_content('<body style="margin:0;background:#1b1d2e;display:grid;place-items:center;height:180px"><img src="data:image/svg+xml;base64,' + __import__('base64').b64encode(open('public/favicon.svg', 'rb').read()).decode() + '" width="132" height="132"></body>'); i.wait_for_timeout(300); i.screenshot(path='public/apple-touch-icon.png')
    b.close()
rec('w', 1920, 1080, 1, 'docs/launch-16x9.mp4', False)
rec('v', 540, 960, 2, 'docs/launch-9x16.mp4', True)
print('ok')
