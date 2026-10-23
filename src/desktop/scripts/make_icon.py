#!/usr/bin/env python3
"""生成桌面版图标：朱红圆角印章 + 纸色「墨」字（马善政楷书）+ 细内框。

  cd desktop && npm install                 # 字体从 node_modules 里拿
  python scripts/make_icon.py               # -> build/icon.png（1024）+ build/icon.ico（16~256）

图标已经提交在 build/ 里，只有想改样子时才需要重新跑。需要 Pillow（pip install pillow）。
"""
import io
import pathlib
import struct
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("缺 Pillow：先运行  pip install pillow")

HERE = pathlib.Path(__file__).resolve().parent.parent          # desktop/
FONT = HERE / "node_modules/@expo-google-fonts/ma-shan-zheng/400Regular/MaShanZheng_400Regular.ttf"
OUT = HERE / "build"

CINNABAR = (0xB8, 0x32, 0x1D, 255)
PAPER = (0xEB, 0xEA, 0xE2, 255)
CHAR = "墨"
SS = 4                                                          # 先画 4 倍大再缩小，边缘更顺


def seal(size):
    """画一个 size×size 的印章。小尺寸（≤32）去掉内框、字放大，不然糊成一团。"""
    small = size <= 32
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    margin = round(S * (0.02 if small else 0.055))             # 印章离画布边
    box = (margin, margin, S - margin - 1, S - margin - 1)
    body = S - 2 * margin
    d.rounded_rectangle(box, radius=round(body * 0.12), fill=CINNABAR)

    if not small:                                               # 细内框
        inset = round(body * 0.065)
        width = max(SS, round(body * 0.016))
        ib = (box[0] + inset, box[1] + inset, box[2] - inset, box[3] - inset)
        d.rounded_rectangle(ib, radius=round(body * 0.06), outline=PAPER, width=width)
        target = body * 0.72                                    # 字的墨迹最大边占印面的比例
    else:
        target = body * 0.84

    # 按字形实际墨迹（不是字框）居中、定大小
    probe = ImageFont.truetype(str(FONT), 1000)
    l, t, r, b = probe.getbbox(CHAR)
    scale = target / max(r - l, b - t)
    font = ImageFont.truetype(str(FONT), max(1, round(1000 * scale)))
    l, t, r, b = font.getbbox(CHAR)
    cx, cy = S / 2, S / 2 + body * 0.005
    d.text((cx - (l + r) / 2, cy - (t + b) / 2), CHAR, font=font, fill=PAPER)

    return img.resize((size, size), Image.LANCZOS)


def ico_bmp(img):
    """32 位 BMP 形式的图标图像（BITMAPINFOHEADER + BGRA 自下而上 + AND 掩码）。"""
    w, h = img.size
    px = img.load()
    rows = []
    for y in range(h - 1, -1, -1):
        rows.append(b"".join(struct.pack("BBBB", px[x, y][2], px[x, y][1], px[x, y][0], px[x, y][3]) for x in range(w)))
    mask_stride = ((w + 31) // 32) * 4
    mask = bytearray()
    for y in range(h - 1, -1, -1):
        row = bytearray(mask_stride)
        for x in range(w):
            if px[x, y][3] == 0:
                row[x // 8] |= 0x80 >> (x % 8)
        mask += row
    header = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, w * h * 4 + len(mask), 0, 0, 0, 0)
    return header + b"".join(rows) + bytes(mask)


def write_ico(path, images):
    """多尺寸 .ico：256 用 PNG 压缩，其余用 BMP（兼容性最好）。"""
    blobs = []
    for img in images:
        if img.size[0] >= 256:
            buf = io.BytesIO()
            img.save(buf, "PNG", optimize=True)
            blobs.append(buf.getvalue())
        else:
            blobs.append(ico_bmp(img))
    out = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    for img, blob in zip(images, blobs):
        w, h = img.size
        out += struct.pack("<BBBBHHII", w % 256, h % 256, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    path.write_bytes(out + b"".join(blobs))


def main():
    if not FONT.exists():
        sys.exit(f"找不到马善政字体：{FONT}\n先在 desktop 目录运行  npm install")
    OUT.mkdir(exist_ok=True)
    big = seal(1024)
    big.save(OUT / "icon.png", optimize=True)
    sizes = [16, 24, 32, 48, 64, 128, 256]
    write_ico(OUT / "icon.ico", [seal(s) for s in sizes])
    for name in ("icon.png", "icon.ico"):
        print(f"已生成 build/{name}（{(OUT / name).stat().st_size // 1024} KB）")


if __name__ == "__main__":
    main()
