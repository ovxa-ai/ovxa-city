"""Record docs/hero-multi.mp4 + .gif. Usage: npm run build && npx vite preview --port 4173 & python3 scripts/video.py"""
from playwright.sync_api import sync_playwright
import subprocess, glob, os, shutil
U = 'http://localhost:4173/?demo&start=0&speed=1.5'
W, H = 1600, 900
shutil.rmtree('/tmp/ovid2', ignore_errors=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--force-device-scale-factor=1'])
    ctx = b.new_context(viewport={'width': W, 'height': H}, record_video_dir='/tmp/ovid2', record_video_size={'width': W, 'height': H})
    pg = ctx.new_page(); pg.goto(U)
    pg.wait_for_timeout(15500)
    bl = pg.locator('.bld').nth(4).bounding_box()
    pg.mouse.move(bl['x'] + bl['width'] / 2, bl['y'] + bl['height'] / 2, steps=25); pg.wait_for_timeout(2600)
    pg.mouse.move(W - 10, H - 10, steps=10); pg.wait_for_timeout(2500)
    pg.click('#connect'); pg.wait_for_timeout(1700)
    pg.click('[data-t=Python]'); pg.wait_for_timeout(1300); pg.click('[data-t=MCP]'); pg.wait_for_timeout(1600)
    pg.click('[value=close]'); pg.wait_for_timeout(2200)
    ctx.close(); b.close()
src = glob.glob('/tmp/ovid2/*.webm')[0]
os.makedirs('docs', exist_ok=True)
subprocess.run(['ffmpeg', '-y', '-ss', '0.4', '-i', src, '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'docs/hero-multi.mp4'], check=True, capture_output=True)
subprocess.run(['ffmpeg', '-y', '-i', 'docs/hero-multi.mp4', '-vf', 'fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', 'docs/hero-multi.gif'], check=True, capture_output=True)
print('ok')
