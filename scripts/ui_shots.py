from playwright.sync_api import sync_playwright
import sys
U='http://localhost:8799'; out=sys.argv[1] if len(sys.argv)>1 else 'docs'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1600,'height':900},device_scale_factor=1)
    pg.goto(U+'/'); pg.wait_for_timeout(6000)
    a=pg.locator('.pin[data-p=claude] .a[data-id]').first; a.hover(); pg.wait_for_timeout(700)
    pg.screenshot(path=f'{out}/map-icons.png')
    pg.locator('#m-tip [data-talk]').click(); pg.wait_for_timeout(600)
    pg.fill('#ch-in','Hi neighbor! Love your building'); pg.press('#ch-in','Enter'); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{out}/chat-typing.png'); pg.wait_for_timeout(3500)
    pg.screenshot(path=f'{out}/chat-drawer.png')
    pg.click('#ch-x'); pg.wait_for_timeout(400)
    pg.click('#connect'); pg.wait_for_timeout(900); pg.screenshot(path=f'{out}/wizard-1.png')
    pg.locator('.cw-tile[data-w=grokbot]').click(); pg.wait_for_timeout(1500); pg.screenshot(path=f'{out}/wizard-2.png')
    pass
    b.close()
