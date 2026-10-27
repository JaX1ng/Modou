"""开机画面、图标：黑漆底上「墨斗」两个毛笔字 + 朱砂方印「拳」（照游戏里菜单的样子）。
用法：python3 tools/make_splash.py 马善政的 ttf（npm 包 @expo-google-fonts/ma-shan-zheng 里那个）"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ttf = sys.argv[1]
LACQ = (28, 18, 14)
GOLD = (216, 180, 106)
GOLD_D = (138, 106, 48)
CIN = (168, 48, 29)
CREAM = (243, 234, 214)


def splash(path, W=1280, H=720):
    im = Image.new("RGB", (W, H), LACQ)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(ttf, 150)
    t = "墨斗"
    bb = d.textbbox((0, 0), t, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    seal = 84
    total = tw + 28 + seal
    x0 = (W - total) // 2
    y0 = (H - th) // 2 - 40 - bb[1]
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.text((x0, y0), t, font=f, fill=(255, 180, 90, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(22))
    im.paste(glow, (0, 0), glow)
    d.text((x0, y0), t, font=f, fill=CREAM, stroke_width=4, stroke_fill=(12, 6, 4))
    sx = x0 + tw + 28
    sy = (H - seal) // 2 - 20
    d.rectangle([sx, sy, sx + seal, sy + seal], fill=CIN)
    d.rectangle([sx + 6, sy + 6, sx + seal - 6, sy + seal - 6], outline=CREAM, width=2)
    fs = ImageFont.truetype(ttf, 62)
    b2 = d.textbbox((0, 0), "拳", font=fs)
    d.text((sx + (seal - (b2[2] - b2[0])) / 2 - b2[0], sy + (seal - (b2[3] - b2[1])) / 2 - b2[1]), "拳", font=fs, fill=(251, 243, 226))
    fsub = ImageFont.truetype(ttf, 34)
    sub = "拳克腿  腿克重  重克拳"
    b3 = d.textbbox((0, 0), sub, font=fsub)
    d.text(((W - (b3[2] - b3[0])) / 2, H / 2 + 90), sub, font=fsub, fill=GOLD)
    d.rectangle([24, 24, W - 25, H - 25], outline=GOLD_D, width=2)
    d.rectangle([32, 32, W - 33, H - 33], outline=(GOLD[0], GOLD[1], GOLD[2]), width=1)
    im.save(path)


def icon(path, N=256):
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = N // 10
    d.rounded_rectangle([4, 4, N - 5, N - 5], radius=r, fill=CIN)
    d.rounded_rectangle([18, 18, N - 19, N - 19], radius=r // 2, outline=CREAM, width=6)
    f = ImageFont.truetype(ttf, int(N * 0.66))
    b = d.textbbox((0, 0), "墨", font=f)
    d.text(((N - (b[2] - b[0])) / 2 - b[0], (N - (b[3] - b[1])) / 2 - b[1]), "墨", font=f, fill=(251, 243, 226))
    im.save(path)


splash("assets/img/splash.png")
icon("assets/img/icon.png")
# Windows 的图标（exe、任务栏）：一个 ico 里放几种大小
Image.open("assets/img/icon.png").save("assets/img/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("ok")
