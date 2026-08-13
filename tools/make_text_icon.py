from PIL import Image, ImageDraw, ImageFont
import os
import argparse
import sys

DENSITIES = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192,
}


def ensure_dir(p):
    os.makedirs(p, exist_ok=True)


def pick_font(size):
    # Try common Windows fonts, fall back to default
    candidates = [
        'C:\\Windows\\Fonts\\msyh.ttc',
        'C:\\Windows\\Fonts\\msyh.ttf',
        'C:\\Windows\\Fonts\\simsun.ttc',
        'C:\\Windows\\Fonts\\arial.ttf',
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            continue
    return ImageFont.load_default()


def make_icon(text, size, out_bg, out_fg):
    # Background: solid color with rounded corners (or circle)
    bg = Image.new('RGBA', (size, size), (40, 45, 50, 255))
    draw = ImageDraw.Draw(bg)

    # Draw subtle rounded background: draw circle occupying full
    margin = int(size * 0.05)
    draw.ellipse([margin, margin, size - margin, size - margin], fill=(60, 120, 210, 255))

    # Foreground: transparent canvas with centered text
    fg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    df = ImageDraw.Draw(fg)

    # Font size scaled to image
    font = pick_font(int(size * 0.6))

    # Center text
    bbox = df.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (size - w) // 2 - bbox[0]
    y = (size - h) // 2 - bbox[1]
    df.text((x, y), text, font=font, fill=(255, 255, 255, 255))

    # Save
    bg.save(out_bg, format='PNG')
    fg.save(out_fg, format='PNG')


def write_adaptive_xml(outdir):
    ensure_dir(outdir)
    xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
'''
    with open(os.path.join(outdir, 'ic_launcher.xml'), 'w', encoding='utf-8') as f:
        f.write(xml)
    with open(os.path.join(outdir, 'ic_launcher_round.xml'), 'w', encoding='utf-8') as f:
        f.write(xml)


def generate_all(text, out_root, install=False):
    out_root = os.path.abspath(out_root)
    base_out = os.path.join(out_root)
    ensure_dir(base_out)

    for dens, size in DENSITIES.items():
        ddir = os.path.join(base_out, f'mipmap-{dens}')
        ensure_dir(ddir)
        bg_path = os.path.join(ddir, 'ic_launcher_background.png')
        fg_path = os.path.join(ddir, 'ic_launcher_foreground.png')
        round_path = os.path.join(ddir, 'ic_launcher_round.png')
        full_path = os.path.join(ddir, 'ic_launcher.png')

        make_icon(text, size, bg_path, fg_path)
        # For round and legacy launcher we can flatten fg over bg
        bg = Image.open(bg_path).convert('RGBA')
        fg = Image.open(fg_path).convert('RGBA')
        merged = Image.alpha_composite(bg, fg)
        merged.save(round_path)
        merged.save(full_path)

    # adaptive xml in mipmap-anydpi-v26
    anydpi = os.path.join(base_out, 'mipmap-anydpi-v26')
    write_adaptive_xml(anydpi)

    print('WROTE icons to', base_out)

    if install:
        # copy into android project if exists
        android_res = os.path.join(os.getcwd(), 'android', 'app', 'src', 'main', 'res')
        if not os.path.isdir(android_res):
            print('Android res not found at', android_res)
            return
        for folder in os.listdir(base_out):
            src = os.path.join(base_out, folder)
            dst = os.path.join(android_res, folder)
            ensure_dir(dst)
            for f in os.listdir(src):
                srcf = os.path.join(src, f)
                dstf = os.path.join(dst, f)
                open(dstf, 'wb').write(open(srcf, 'rb').read())
        print('COPIED icons into', android_res)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--text', default='坛经', help='Text to render in the icon')
    p.add_argument('--out-root', default='www/icon-outputs', help='Output root directory')
    p.add_argument('--install', action='store_true', help='Copy generated icons into android res')
    args = p.parse_args()

    generate_all(args.text, args.out_root, install=args.install)


if __name__ == '__main__':
    main()
