#!/usr/bin/env python3
"""
Refresh one app's images on graysmithlabs.com after a reskin or new release.

    python3 tools/app-assets/build.py <slug> --icon <icon.png> --shots <a.png> <b.png> <c.png> [--version 1.3]
    python3 tools/app-assets/build.py <slug> --og-only [--version 1.3]

Inputs are the app's 1024 icon and three clean screen captures (no captions, no
phone frame), which the screenshot kit writes to store/raw/iphone-*.png.

Writes into assets/apps/<slug>/:
  icon.png          256 x 256, square (the site rounds the corners in CSS)
  shot1..3.jpg      600 x 1304, the app page hero phones
  og.jpg            1200 x 630 share image for X, iMessage and other link previews

Then stamps every reference to those files across the site with ?v=<version>, so
browsers and X fetch the new art instead of a cached copy. The share image is
drawn from apps.json (name, tagline, call to action, phone frame color). Needs
Pillow and Playwright (the same pair the screenshot kit uses).
"""
import argparse, base64, io, json, os, re, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, '..', '..'))
SHOT = (600, 1304)

ap = argparse.ArgumentParser()
ap.add_argument('slug')
ap.add_argument('--icon')
ap.add_argument('--shots', nargs=3)
ap.add_argument('--og-only', action='store_true', help='redraw og.jpg from the icon and shots already on the site')
ap.add_argument('--version', help='cache buster stamped on asset URLs, usually the app version')
args = ap.parse_args()

apps = json.load(open(os.path.join(HERE, 'apps.json')))
if args.slug not in apps:
    sys.exit(f'{args.slug} is missing from tools/app-assets/apps.json; add its name and tagline first')
cfg = apps[args.slug]
out = os.path.join(SITE, 'assets', 'apps', args.slug)
os.makedirs(out, exist_ok=True)


def fit(img, size):
    """Scale to the target width and crop or pad the bottom to the target height."""
    w, h = size
    img = img.convert('RGB')
    img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
    if img.height >= h:
        return img.crop((0, 0, w, h))
    canvas = Image.new('RGB', size, img.getpixel((w // 2, img.height - 1)))
    canvas.paste(img, (0, 0))
    return canvas


if not args.og_only:
    if not (args.icon and args.shots):
        sys.exit('pass --icon and three --shots, or --og-only')
    Image.open(args.icon).convert('RGB').resize((256, 256), Image.LANCZOS).save(os.path.join(out, 'icon.png'), optimize=True)
    for i, path in enumerate(args.shots, 1):
        fit(Image.open(path), SHOT).save(os.path.join(out, f'shot{i}.jpg'), quality=84, optimize=True, progressive=True)
        print(f'wrote assets/apps/{args.slug}/shot{i}.jpg')
    print(f'wrote assets/apps/{args.slug}/icon.png')


def data_uri(path):
    return 'data:image/%s;base64,%s' % ('png' if path.endswith('.png') else 'jpeg', base64.b64encode(open(path, 'rb').read()).decode())


order = cfg.get('order', [1, 2, 3])
phones = [data_uri(os.path.join(out, f'shot{n}.jpg')) for n in order]
bg = cfg.get('background', '#131513')
html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:1200px;height:630px;overflow:hidden;background:{bg};font-family:Inter,"SF Pro Display",system-ui,sans-serif;position:relative}}
.icon{{position:absolute;left:71px;top:88px;width:102px;height:102px;border-radius:23px}}
h1{{position:absolute;left:68px;top:214px;font-size:84px;font-weight:600;letter-spacing:-.02em;color:#eef0e8}}
p{{position:absolute;left:72px;top:313px;width:385px;font-size:25px;line-height:1.45;color:#a6aba7}}
.cta{{position:absolute;left:72px;top:503px;height:43px;padding:0 19px;border-radius:22px;background:#a6c6ae;color:#131513;font-size:19px;font-weight:500;display:flex;align-items:center}}
.lab{{position:absolute;left:73px;top:579px;font-size:15px;font-weight:600;letter-spacing:.06em;color:#a9aeaa}}
.ph{{position:absolute;width:212px;height:461px;border-radius:28px;border:4px solid {cfg['frame']};overflow:hidden;background:#000;box-shadow:0 24px 60px rgba(0,0,0,.45)}}
.ph img{{width:100%;height:100%;object-fit:cover;object-position:top;display:block;border-radius:24px}}
</style></head><body>
<img class="icon" src="{data_uri(os.path.join(out, 'icon.png'))}">
<h1>{cfg['name']}</h1>
<p>{cfg['tagline']}</p>
<div class="cta">{cfg['cta']}</div>
<div class="lab">GRAYSMITH LABS</div>
<div class="ph" style="left:481px;top:101px"><img src="{phones[0]}"></div>
<div class="ph" style="left:713px;top:69px"><img src="{phones[1]}"></div>
<div class="ph" style="left:944px;top:101px"><img src="{phones[2]}"></div>
</body></html>"""

from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width': 1200, 'height': 630})
    page.set_content(html)
    page.wait_for_timeout(300)
    png = page.screenshot()
    browser.close()
Image.open(io.BytesIO(png)).convert('RGB').save(os.path.join(out, 'og.jpg'), quality=86, optimize=True, progressive=True)
print(f'wrote assets/apps/{args.slug}/og.jpg')

if args.version:
    ref = re.compile(r'(assets/apps/%s/(?:icon\.png|og\.jpg|shot[123]\.jpg))(\?v=[\w.]+)?' % re.escape(args.slug))
    touched = []
    for root, dirs, files in os.walk(SITE):
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules')]
        for f in files:
            if not f.endswith(('.html', '.json', '.txt', '.xml')):
                continue
            path = os.path.join(root, f)
            text = open(path, encoding='utf-8').read()
            new = ref.sub(lambda m: f'{m.group(1)}?v={args.version}', text)
            if new != text:
                open(path, 'w', encoding='utf-8').write(new)
                touched.append(os.path.relpath(path, SITE))
    print('stamped ?v=%s in %s' % (args.version, ', '.join(touched) or 'nothing'))
