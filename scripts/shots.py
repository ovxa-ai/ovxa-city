"""Render docs screenshots + hero video. Usage: npx vite preview --port 4173 & python3 scripts/shots.py [video]"""
from playwright.sync_api import sync_playwright
import sys
U='http://localhost:4173/'
with sync_playwright() as p:
    b=p.chromium.launch()
    def page(w,h,s=1,q=''):
        pg=b.new_page(viewport={'width':w,'height':h},device_scale_factor=s)
        pg.on('pageerror',lambda e:print('ERR',e))
        pg.add_init_script("localStorage.setItem('ovxa.night','0')")
        pg.goto(U+q);pg.wait_for_timeout(3800);return pg
    pg=page(1440,900);pg.screenshot(path='docs/desktop.png')
    bb=pg.locator('.hs[data-k=chief]').bounding_box();pg.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2);pg.wait_for_timeout(500);pg.screenshot(path='/tmp/o_hover.png')
    pg.mouse.move(5,500);pg.click('.seg [data-m=night]');pg.click('.ap >> nth=0');pg.wait_for_timeout(1300);pg.screenshot(path='docs/night.png')
    pg=page(1440,900,1,'?lang=he');pg.screenshot(path='docs/desktop-he.png')
    pg=page(390,844,2);pg.screenshot(path='docs/mobile.png')
    pg.click('#grab');pg.wait_for_timeout(700);pg.screenshot(path='/tmp/o_mob_open.png')
    pg=page(1200,630,1);pg.screenshot(path='/tmp/og_raw.png')
    if len(sys.argv)>1:
        ctx=b.new_context(viewport={'width':1280,'height':800},record_video_dir='/tmp/ovid',record_video_size={'width':1280,'height':800})
        ctx.add_init_script("localStorage.setItem('ovxa.night','0')")
        pg=ctx.new_page();pg.goto(U);pg.wait_for_timeout(4500)
        pg.click('.ap >> nth=0');pg.wait_for_timeout(1800);pg.click('.seg [data-m=night]');pg.wait_for_timeout(2500)
        v=pg.video.path();ctx.close();print('VIDEO',v)
    b.close()
