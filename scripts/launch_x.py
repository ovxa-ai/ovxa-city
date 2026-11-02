"""Record docs/launch-x.mp4 (1080p H.264 <15s), docs/hero.gif and public/og.png: city -> building -> office with a task
progressing -> one-click connect. Usage: npm run build && npx wrangler dev --port 8799 & python3 scripts/launch_x.py <owner_pw>"""
from playwright.sync_api import sync_playwright
import sys, json, glob, shutil, subprocess, threading, time, urllib.request
U = 'http://localhost:8799'; PW = sys.argv[1]; W, H = 1920, 1080; TMP = '/tmp/ovx-launch'
def api(m, path, body=None, key=None):
    rq = urllib.request.Request(U + path, method=m, data=json.dumps(body).encode() if body is not None else None, headers={'content-type': 'application/json', **({'authorization': f'Bearer {key}'} if key else {})})
    return json.load(urllib.request.urlopen(rq))
j = api('POST', '/api/v1/join', {'name': 'Ava', 'platform': 'claude'}); key = j['key']; aid = j['agent']['id'] if 'agent' in j else j['id']
shutil.rmtree(TMP, ignore_errors=True)
# Recording runs as a public visitor (no owner UI). Displayed URLs are rewritten to the public host and join tickets/ids hidden.
SCRUB = """(() => { const fix = s => s.replace(/https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?/g, 'https://ovxa.ai')
  .replace(/\\/mcp\\?t=[^\\s"'&]+(&p=[a-z]+)?/g, '/mcp').replace(/\\b(t|oc|tk)_[A-Za-z0-9]{6,}/g, '').replace(/OVX-[A-Z0-9]{6,}/g, 'OVX-••••');
  const run = r => { const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    r.querySelectorAll && r.querySelectorAll('input,textarea').forEach(i => { const v = fix(i.value); if (v !== i.value) i.value = v; }); };
  new MutationObserver(() => run(document.body)).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  document.addEventListener('DOMContentLoaded', () => run(document.body)); })()"""
with sync_playwright() as p:
    b = p.chromium.launch(args=['--force-device-scale-factor=1'])
    c0 = b.new_context(viewport={'width': W, 'height': H}); pg = c0.new_page(); pg.goto(U + '/?mine'); pg.wait_for_timeout(2500)
    if pg.locator('#signin').count(): pg.click('#signin'); pg.fill('input[name=pw]', PW); pg.click('#m-loginf button[value=ok]'); pg.wait_for_timeout(2000)
    pg.goto(U + '/?mine#office=claude'); pg.wait_for_timeout(3000)
    pg.locator(f'.of-side .crew button[data-id="{aid}"]').click(); pg.wait_for_timeout(400)
    pg.click('#of-as'); pg.fill('input[name=title]', 'Draft the launch announcement'); pg.fill('textarea[name=detail]', 'Two paragraphs, friendly'); pg.click('#of-ago'); pg.wait_for_timeout(1200)
    t = api('GET', '/api/v1/tasks?status=queued', key=key)['tasks'][0]
    api('PATCH', f"/api/v1/tasks/{t['id']}", {'status': 'in_progress', 'step': 1, 'total': 4, 'log': 'Read the brief'}, key=key)
    state = c0.storage_state(); c0.close()
    ctx = b.new_context(viewport={'width': W, 'height': H}, record_video_dir=TMP, record_video_size={'width': W, 'height': H})
    ctx.add_init_script(SCRUB); ctx.route('**/api/public/tasks*', lambda r: r.continue_(url=r.request.url.split('?')[0] + f'?fresh={time.time()}')); pg = ctx.new_page(); t0 = time.time(); pg.goto(U + '/'); pg.wait_for_timeout(3500)
    mark = time.time() - t0
    for _ in range(6): pg.mouse.move(W / 2, H / 2); pg.mouse.wheel(0, -120); pg.wait_for_timeout(120)
    bx = pg.locator('.pin[data-p=claude] .card').bounding_box()
    pg.mouse.move(bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 2, steps=25); pg.wait_for_timeout(500)
    pg.locator('.pin[data-p=claude] .card .nm').click(); pg.wait_for_timeout(1800)
    pg.locator(f'.of-side .crew button[data-id="{aid}"]').click(); pg.wait_for_timeout(900)
    def steps():
        for i, line in [(2, 'Outlined three angles'), (3, 'Wrote the draft')]:
            api('PATCH', f"/api/v1/tasks/{t['id']}", {'status': 'in_progress', 'step': i, 'total': 4, 'log': line}, key=key); time.sleep(1.6)
        api('PATCH', f"/api/v1/tasks/{t['id']}", {'status': 'done', 'result': 'Draft ready in the shared doc'}, key=key)
    th = threading.Thread(target=steps); th.start(); pg.wait_for_timeout(5200); th.join()
    pg.screenshot(path='/tmp/ovx-office.png')
    pg.click('#of-back'); pg.wait_for_timeout(700)
    pg.click('#connect'); pg.wait_for_timeout(900)
    pg.hover('.cw-tile[data-w=mcp]'); pg.wait_for_timeout(300); pg.click('.cw-tile[data-w=mcp]'); pg.wait_for_timeout(1600)
    pg.screenshot(path='/tmp/ovx-connect.png'); pg.wait_for_timeout(600)
    ctx.close(); b.close()
src = glob.glob(TMP + '/*.webm')[0]
run = lambda *a: subprocess.run(['ffmpeg', '-y', *a], check=True, capture_output=True)
run('-ss', f'{mark - 0.3:.2f}', '-i', src, '-t', '14.5', '-vf', 'fps=30', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', 'docs/launch-x.mp4')
run('-i', 'docs/launch-x.mp4', '-vf', 'fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', 'docs/hero.gif')
run('-i', '/tmp/ovx-office.png', '-vf', 'scale=1200:-1,crop=1200:630:0:(ih-630)/2', 'public/og.png')
print('ok', aid)
