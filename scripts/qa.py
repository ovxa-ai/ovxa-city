"""QA: screenshots desktop+mobile of public city, wizard (logos + one-click), agent page; collects console errors and failed requests."""
from playwright.sync_api import sync_playwright
import sys, json
U = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8799'; out = sys.argv[2] if len(sys.argv) > 2 else 'docs'
errs = []
def watch(pg, tag):
    pg.on('console', lambda m: m.type == 'error' and errs.append(f'{tag} console: {m.text}'))
    pg.on('pageerror', lambda e: errs.append(f'{tag} pageerror: {e}'))
    pg.on('response', lambda r: r.status >= 400 and errs.append(f'{tag} {r.status} {r.url}'))
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp, dsf in [('desktop', {'width': 1440, 'height': 900}, 2), ('mobile', {'width': 390, 'height': 844}, 3)]:
        pg = b.new_page(viewport=vp, device_scale_factor=dsf, is_mobile=name == 'mobile'); watch(pg, name)
        pg.goto(U + '/'); pg.wait_for_timeout(5000); pg.screenshot(path=f'{out}/qa-{name}-city.png')
        pg.click('#connect'); pg.wait_for_timeout(900); pg.screenshot(path=f'{out}/qa-{name}-wizard.png')
        for k in ['chatgpt', 'claude', 'grok', 'cursor', 'mcp', 'gemini']:
            pg.locator(f'.cw-tile[data-w={k}]').click(); pg.wait_for_timeout(1500)
            hrefs = pg.eval_on_selector_all('#cw-acts a', 'e=>e.map(a=>a.getAttribute("href"))')
            print(name, k, [h[:60] for h in hrefs])
            if k in ('chatgpt', 'cursor'): pg.screenshot(path=f'{out}/qa-{name}-connect-{k}.png')
            pg.click('#cw-back'); pg.wait_for_timeout(300)
        pg.close()
    pg = b.new_page(viewport={'width': 1200, 'height': 800}); watch(pg, 'agentpage')
    pg.goto(U + '/a/ovxa-atlas'); pg.wait_for_timeout(1500); pg.screenshot(path=f'{out}/qa-agent-page.png')
    b.close()
print(json.dumps(errs, indent=1))
