"""QA for the office inside a building: public (read-only) on desktop + mobile, and optionally the owner flow
(assign a task in the UI, agent reports steps over the API, UI shows progress). Usage:
  python3 scripts/qa_office.py <base> <outdir> [owner_password]"""
from playwright.sync_api import sync_playwright
import sys, json, urllib.request
U = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8799'; out = sys.argv[2] if len(sys.argv) > 2 else 'docs'; PW = sys.argv[3] if len(sys.argv) > 3 else ''
errs = []; notes = []
def watch(pg, tag):
    pg.on('console', lambda m: m.type == 'error' and errs.append(f'{tag} console: {m.text}'))
    pg.on('pageerror', lambda e: errs.append(f'{tag} pageerror: {e}'))
    pg.on('response', lambda r: r.status >= 400 and errs.append(f'{tag} {r.status} {r.url}'))
def api(method, path, body=None, key=None):
    rq = urllib.request.Request(U + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={'content-type': 'application/json', **({'authorization': f'Bearer {key}'} if key else {})})
    return json.load(urllib.request.urlopen(rq))
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp, dsf in [('desktop', {'width': 1440, 'height': 900}, 2), ('mobile', {'width': 390, 'height': 844}, 3)]:
        pg = b.new_page(viewport=vp, device_scale_factor=dsf, is_mobile=name == 'mobile'); watch(pg, name)
        pg.goto(U + '/'); pg.wait_for_timeout(4000)
        k = pg.eval_on_selector('.pin:not(.empty)', 'e=>e.dataset.p')
        pg.locator(f'.pin[data-p={k}] .card .nm').click(); pg.wait_for_timeout(2500)
        assert pg.locator('#office').is_visible(); notes.append(f'{name}: office {k} opened, hash={pg.evaluate("location.hash")}')
        n = pg.locator('.of-p').count(); notes.append(f'{name}: {n} seated agents, screen="{pg.inner_text("#of-screen")[:80]!r}", board="{pg.inner_text("#of-board")[:60]!r}"')
        assert n > 0
        pg.screenshot(path=f'{out}/qa-{name}-office.png')
        pg.locator('.of-side .crew button').first.click(); pg.wait_for_timeout(800)
        notes.append(f'{name}: agent panel: {pg.inner_text(".of-side")[:160]!r}')
        pg.screenshot(path=f'{out}/qa-{name}-office-agent.png', full_page=name == 'mobile')
        pg.click('#of-board' if name == 'desktop' else '#of-tasks'); pg.wait_for_timeout(700)
        assert pg.locator('#of-dlg[open]').count() == 1; pg.screenshot(path=f'{out}/qa-{name}-office-board.png')
        assert pg.locator('#of-bn').count() == 0  # public is read-only
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.click('#of-dn'); pg.click('#of-zi'); pg.wait_for_timeout(900); pg.screenshot(path=f'{out}/qa-{name}-office-night.png')
        pg.click('#of-dn'); pg.click('#of-zf'); pg.click('#of-back'); pg.wait_for_timeout(600)
        assert pg.locator('#office').count() == 0
        pg.goto(U + f'/#office={k}'); pg.wait_for_timeout(3000); assert pg.locator('#office').is_visible(); notes.append(f'{name}: deep link ok')
        pg.close()
    if PW:
        j = api('POST', '/api/v1/join', {'name': 'QA Writer', 'platform': 'claude'})
        pg = b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=2); watch(pg, 'owner')
        pg.goto(U + '/?mine'); pg.wait_for_timeout(2500)
        if pg.locator('#signin').count(): pg.click('#signin'); pg.fill('input[name=pw]', PW); pg.click('#m-loginf button[value=ok]'); pg.wait_for_timeout(2500)
        pg.goto(U + '/?mine#office=claude'); pg.wait_for_timeout(3500)
        pg.locator(f'.of-side .crew button[data-id="{j["agent"]["id"] if "agent" in j else j["id"]}"]').click(); pg.wait_for_timeout(500)
        pg.click('#of-as'); pg.fill('input[name=title]', 'Draft the launch announcement'); pg.fill('textarea[name=detail]', 'Two paragraphs, friendly'); pg.click('#of-ago'); pg.wait_for_timeout(1500)
        t = api('GET', '/api/v1/tasks?status=queued', key=j['key'])['tasks'][0]
        for i, line in enumerate(['Read the brief', 'Outlined three angles', 'Wrote the draft'], 1):
            api('PATCH', f"/api/v1/tasks/{t['id']}", {'status': 'in_progress', 'step': i, 'total': 4, 'log': line}, key=j['key'])
        pg.wait_for_timeout(5000); txt = pg.inner_text('.of-side'); notes.append(f'owner panel: {txt[:220]!r}')
        assert 'Step 3 of 4' in txt and 'Wrote the draft' in txt
        pg.screenshot(path=f'{out}/qa-owner-office-progress.png')
        api('PATCH', f"/api/v1/tasks/{t['id']}", {'status': 'done', 'result': 'Draft ready in the shared doc'}, key=j['key']); pg.wait_for_timeout(5000)
        assert 'Draft ready' in pg.inner_text('.of-side'); pg.click('#of-tasks'); pg.wait_for_timeout(700); pg.screenshot(path=f'{out}/qa-owner-office-board.png')
        notes.append('owner flow: assign in UI -> agent PATCH steps -> live progress -> done: ok')
    b.close()
print('\n'.join(notes)); print('ERRORS', json.dumps(errs, indent=1))
