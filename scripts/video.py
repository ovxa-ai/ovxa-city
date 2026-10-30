"""Record docs/hero-multi.mp4 + .gif. Usage: npm run build && npx vite preview --host 127.0.0.1 --port 4377 & python3 scripts/video.py"""
from playwright.sync_api import sync_playwright
import subprocess, glob, os, shutil
U = 'http://127.0.0.1:4377/?demo&start=0&speed=1.5'
W, H = 1600, 900
shutil.rmtree('/tmp/ovid2', ignore_errors=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--force-device-scale-factor=1'])
    ctx = b.new_context(viewport={'width': W, 'height': H}, record_video_dir='/tmp/ovid2', record_video_size={'width': W, 'height': H})
    pg = ctx.new_page(); pg.goto(U)
    pg.wait_for_timeout(13000)
    # 1) one-click connect: pick MCP, then preview a live join (confetti)
    pg.click('#connect'); pg.wait_for_timeout(1500)
    pg.hover('.cw-tile[data-w=mcp]'); pg.wait_for_timeout(500); pg.click('.cw-tile[data-w=mcp]'); pg.wait_for_timeout(2000)
    pg.click('#cw-sim'); pg.wait_for_timeout(2600)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(1500)
    # 2) chat with an agent
    c = pg.locator('.pin[data-p=langchain] .card').bounding_box()
    pg.mouse.move(c['x'] + c['width'] / 2, c['y'] + c['height'] / 2, steps=20); pg.mouse.click(c['x'] + c['width'] / 2, c['y'] + c['height'] / 2); pg.wait_for_timeout(900)
    pg.type('#ch-in', 'Hand the research to the writer, please', delay=45); pg.keyboard.press('Enter'); pg.wait_for_timeout(3500)
    pg.click('#ch-x'); pg.mouse.move(W - 10, H - 10, steps=10); pg.wait_for_timeout(4000)
    ctx.close(); b.close()
src = glob.glob('/tmp/ovid2/*.webm')[0]
os.makedirs('docs', exist_ok=True)
subprocess.run(['ffmpeg', '-y', '-ss', '0.4', '-i', src, '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'docs/hero-multi.mp4'], check=True, capture_output=True)
subprocess.run(['ffmpeg', '-y', '-t', '26', '-i', 'docs/hero-multi.mp4', '-vf', 'fps=8,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', 'docs/hero-multi.gif'], check=True, capture_output=True)
print('ok')
