from PIL import Image, ImageOps, ImageFilter
import os, sys

# prefer www/icon.png, but fall back to www/img/dt.jpeg if present (user may keep source there)
src_candidates = ['www/icon.png', 'www/img/dt.jpeg', 'www/img/dt.jpg']
src = None
for c in src_candidates:
    if os.path.exists(c):
        src = c
        break
if not src:
    print('ERROR: source not found. Checked:', src_candidates)
    sys.exit(2)

# Target sizes per density in px
sizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
    'mipmap-anydpi-v26': 432,
}

res_root = 'android/app/src/main/res'
img = Image.open(src).convert('RGBA')

def average_color(pil_img):
    # compute a simple average color from center region
    w, h = pil_img.size
    box = (w//4, h//4, 3*w//4, 3*h//4)
    region = pil_img.crop(box).convert('RGB')
    pixels = list(region.getdata())
    r = sum(p[0] for p in pixels)//len(pixels)
    g = sum(p[1] for p in pixels)//len(pixels)
    b = sum(p[2] for p in pixels)//len(pixels)
    return (r, g, b)

avg_col = average_color(img)

for name, size in sizes.items():
    dst = os.path.join(res_root, name)
    os.makedirs(dst, exist_ok=True)

    # Create foreground: slightly pad and autocontrast to make subject clearer
    pad = max(2, size // 12)
    fg_size = size - pad * 2
    fg = img.resize((fg_size, fg_size), Image.LANCZOS)
    # autocontrast doesn't support RGBA, convert to RGB then restore alpha
    alpha = fg.split()[-1]
    fg_rgb = fg.convert('RGB')
    fg_rgb = ImageOps.autocontrast(fg_rgb, cutoff=1)
    fg = fg_rgb.convert('RGBA')
    fg.putalpha(alpha)
    # add transparent padding to reach final size
    out_fg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out_fg.paste(fg, (pad, pad), fg)

    # Create background: solid color based on average color, optionally blurred variant for large size
    bg = Image.new('RGBA', (size, size), avg_col + (255,))
    if name == 'mipmap-anydpi-v26':
        # slightly blur background for adaptive look
        bg = bg.filter(ImageFilter.GaussianBlur(radius=max(1, size//160)))

    # Save foreground and background
    fg_path = os.path.join(dst, 'ic_launcher_foreground.png')
    bg_path = os.path.join(dst, 'ic_launcher_background.png')
    out_fg.save(fg_path, format='PNG')
    bg.save(bg_path, format='PNG')
    print('WROTE', fg_path)
    print('WROTE', bg_path)

    # Create legacy combined icon (background + foreground) for older devices
    combined = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    combined.paste(bg, (0, 0))
    combined.paste(out_fg, (0, 0), out_fg)
    # Do not write legacy ic_launcher.png into mipmap-anydpi-v26 to avoid conflict with adaptive XML
    if name != 'mipmap-anydpi-v26':
        legacy_path = os.path.join(dst, 'ic_launcher.png')
        legacy_round_path = os.path.join(dst, 'ic_launcher_round.png')
        combined.save(legacy_path, format='PNG')
        combined.save(legacy_round_path, format='PNG')
        print('WROTE', legacy_path)
        print('WROTE', legacy_round_path)

    # ic_launcher.xml (adaptive) will be written only into mipmap-anydpi-v26 below

# Write adaptive icon XML into mipmap-anydpi-v26
anydpi = os.path.join(res_root, 'mipmap-anydpi-v26')
os.makedirs(anydpi, exist_ok=True)

adaptive_xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
'''

adaptive_round_xml = adaptive_xml

with open(os.path.join(anydpi, 'ic_launcher.xml'), 'w', encoding='utf-8') as f:
    f.write(adaptive_xml)
    print('WROTE', os.path.join(anydpi, 'ic_launcher.xml'))

with open(os.path.join(anydpi, 'ic_launcher_round.xml'), 'w', encoding='utf-8') as f:
    f.write(adaptive_round_xml)
    print('WROTE', os.path.join(anydpi, 'ic_launcher_round.xml'))

print('DONE')
