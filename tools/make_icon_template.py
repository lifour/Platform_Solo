from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import argparse
import shutil

# Simple programmatic icon generator matching the provided sample.
# - Master canvas default 2048x2048
# - White rounded-square background (inset)
# - Red bottom pill (approx 27% height)
# - Black Chinese title centered above pill: '坛经'
# - White English label on the pill: 'Platform Sutra Pro'

DEFAULT_MASTER = 2048
SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
    'mipmap-anydpi-v26': 432,
}

def try_load_font(preferred, size):
    for p in preferred:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

def draw_master(size, chinese='坛经', label='Platform Sutra Pro', pill_color='#D32F2F'):
    W = H = size
    inset = int(W * 0.06)

    # Background image: white rounded rect + red pill at bottom
    bg = Image.new('RGBA', (W, H), (0,0,0,0))
    draw_bg = ImageDraw.Draw(bg)

    # rounded rect (white)
    radius = int(W * 0.08)
    rect = (inset, inset, W-inset, H-inset)
    draw_rounded_rect(draw_bg, rect, radius, fill=(255,255,255,255))

    # red pill
    pill_h = int(H * 0.27)
    pill_margin = int(W * 0.12)
    pill_box = (pill_margin, H - pill_margin - pill_h, W - pill_margin, H - pill_margin)
    draw_rounded_rect(draw_bg, pill_box, pill_h//2, fill=hex_to_rgb(pill_color)+(255,))

    # Foreground: transparent canvas with Chinese text and white label over pill
    fg = Image.new('RGBA', (W, H), (0,0,0,0))
    draw_fg = ImageDraw.Draw(fg)

    # Fonts: probe common Windows fonts then fallback
    font_choices_cn = [
        r'C:\Windows\Fonts\msyh.ttc',
        r'C:\Windows\Fonts\SIMHEI.TTF',
        r'C:\Windows\Fonts\NotoSansCJKsc-Regular.otf',
    ]
    font_choices_en = [
        r'C:\Windows\Fonts\arial.ttf',
        r'C:\Windows\Fonts\segoeui.ttf',
    ]

    # Heuristic sizes
    cn_size = int(W * 0.36)
    en_size = int(W * 0.066)
    font_cn = try_load_font(font_choices_cn, cn_size)
    font_en = try_load_font(font_choices_en, en_size)

    # Measure chinese and draw centered above pill
    ch_bbox = draw_fg.textbbox((0, 0), chinese, font=font_cn)
    ch_w = ch_bbox[2] - ch_bbox[0]
    ch_h = ch_bbox[3] - ch_bbox[1]
    ch_x = (W - ch_w) // 2
    # place baseline so that bottom of text sits slightly above pill top
    pill_top = pill_box[1]
    ch_y = int(pill_top - ch_h - H*0.04)
    draw_fg.text((ch_x, ch_y), chinese, font=font_cn, fill=(0,0,0,255))

    # Draw English label centered on pill (white)
    lab_bbox = draw_fg.textbbox((0, 0), label, font=font_en)
    lab_w = lab_bbox[2] - lab_bbox[0]
    lab_h = lab_bbox[3] - lab_bbox[1]
    lab_x = (W - lab_w) // 2
    lab_y = pill_box[1] + (pill_h - lab_h)//2
    draw_fg.text((lab_x, lab_y), label, font=font_en, fill=(255,255,255,255))

    return bg, fg

def draw_rounded_rect(draw, box, radius, fill):
    left, top, right, bottom = box
    draw.rounded_rectangle(box, radius=radius, fill=fill)

def hex_to_rgb(hx):
    hx = hx.lstrip('#')
    return tuple(int(hx[i:i+2], 16) for i in (0, 2, 4))

def scale_and_write(bg_master, fg_master, out_root, install=False):
    res_root = os.path.join(out_root)
    os.makedirs(res_root, exist_ok=True)

    for name, px in SIZES.items():
        dst = os.path.join(res_root, name)
        os.makedirs(dst, exist_ok=True)

        bg = bg_master.resize((px, px), Image.LANCZOS)
        fg = fg_master.resize((px, px), Image.LANCZOS)

        bg_path = os.path.join(dst, 'ic_launcher_background.png')
        fg_path = os.path.join(dst, 'ic_launcher_foreground.png')
        bg.save(bg_path, format='PNG')
        fg.save(fg_path, format='PNG')
        print('WROTE', bg_path)
        print('WROTE', fg_path)

        # Create combined legacy only for density folders (not anydpi)
        if name != 'mipmap-anydpi-v26':
            combined = Image.new('RGBA', (px, px), (0,0,0,0))
            combined.paste(bg, (0,0))
            combined.paste(fg, (0,0), fg)
            legacy = os.path.join(dst, 'ic_launcher.png')
            legacy_round = os.path.join(dst, 'ic_launcher_round.png')
            combined.save(legacy, format='PNG')
            combined.save(legacy_round, format='PNG')
            print('WROTE', legacy)
            print('WROTE', legacy_round)

    # write adaptive XML into mipmap-anydpi-v26
    anydpi = os.path.join(res_root, 'mipmap-anydpi-v26')
    os.makedirs(anydpi, exist_ok=True)
    adaptive_xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
'''
    p = os.path.join(anydpi, 'ic_launcher.xml')
    with open(p, 'w', encoding='utf-8') as f:
        f.write(adaptive_xml)
    print('WROTE', p)
    pr = os.path.join(anydpi, 'ic_launcher_round.xml')
    with open(pr, 'w', encoding='utf-8') as f:
        f.write(adaptive_xml)
    print('WROTE', pr)

def install_to_android(out_root):
    # Copy generated outputs into android app res, respecting the anydpi rule
    res_root = os.path.join('android', 'app', 'src', 'main', 'res')
    for name in SIZES.keys():
        src_dir = os.path.join(out_root, name)
        if not os.path.isdir(src_dir):
            continue
        dst_dir = os.path.join(res_root, name)
        os.makedirs(dst_dir, exist_ok=True)
        for fname in os.listdir(src_dir):
            # Skip writing legacy pngs into mipmap-anydpi-v26
            if name == 'mipmap-anydpi-v26' and fname in ('ic_launcher.png', 'ic_launcher_round.png'):
                continue
            shutil.copy2(os.path.join(src_dir, fname), os.path.join(dst_dir, fname))
            print('COPIED', os.path.join(dst_dir, fname))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out-root', default='www/icon-outputs')
    parser.add_argument('--master-size', type=int, default=DEFAULT_MASTER)
    parser.add_argument('--chinese', default='坛经')
    parser.add_argument('--label', default='Platform Sutra Pro')
    parser.add_argument('--pill-color', default='#D32F2F')
    parser.add_argument('--install', action='store_true', help='Copy outputs into android app res')
    args = parser.parse_args()

    bg_master, fg_master = draw_master(args.master_size, chinese=args.chinese, label=args.label, pill_color=args.pill_color)
    os.makedirs(args.out_root, exist_ok=True)
    scale_and_write(bg_master, fg_master, args.out_root)
    if args.install:
        install_to_android(args.out_root)

if __name__ == '__main__':
    main()
