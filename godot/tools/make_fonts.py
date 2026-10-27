"""字体：把马善政（毛笔字）、思源黑体 Medium（界面字）裁成只含游戏里用到的字（woff2），放进 assets/fonts/。
网页版没有系统字体可以借，缺的字会变成方块 —— 所以 Godot 脚本里出现过的字（连注释里的）都要在里面。
思源黑体另加 GB2312 一级常用字（3755 字）：随手打的中文房间码也显示得了。
加了新字以后跑一遍：
  npm pack @expo-google-fonts/ma-shan-zheng@0.4.3 @expo-google-fonts/noto-sans-sc@0.4.4（解开到某个目录）
  python3 tools/make_fonts.py 那个目录
（需要 pip install fonttools brotli）"""
import pathlib
import sys

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "fonts"
PKG = pathlib.Path(sys.argv[1])
FACES = [
    ("expo-google-fonts-ma-shan-zheng-0.4.3/package/400Regular/MaShanZheng_400Regular.ttf", "MaShanZheng-Regular.woff2", False),
    ("expo-google-fonts-noto-sans-sc-0.4.4/package/500Medium/NotoSansSC_500Medium.ttf", "NotoSansSC-Medium.woff2", True),
]


def used_chars():
    cps = set()
    for p in ROOT.rglob("*.gd"):
        rel = p.relative_to(ROOT).as_posix()
        if rel.startswith((".godot/", "tests/", "tools/")):
            continue
        cps.update(ord(c) for c in p.read_text(encoding="utf-8"))
    return {c for c in cps if c >= 0x20}


def base_chars():
    s = set(range(0x20, 0x7F))
    s |= {ord(c) for c in "·×÷°±¥©®™←→↑↓◀▶∞"}
    s |= set(range(0x2010, 0x2028))
    s |= set(range(0x2030, 0x203C))
    s |= set(range(0x3000, 0x3040))
    s |= set(range(0xFF01, 0xFF66))
    s |= set(range(0xFFE0, 0xFFE7))
    return s


def common_hanzi():
    s = set()
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                s.add(ord(bytes([hi, lo]).decode("gb2312")))
            except UnicodeDecodeError:
                pass
    return s


def subset_font(src, dst, unicodes):
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=sorted(unicodes))
    sub.subset(font)
    subset.save_font(font, str(dst), opts)
    return len(font.getBestCmap() or {})


chars = base_chars() | used_chars()
for ttf, out, common in FACES:
    want = chars | (common_hanzi() if common else set())
    n = subset_font(PKG / ttf, OUT / out, want)
    print(f"{out}: {n} 字，{(OUT / out).stat().st_size / 1024:.0f} KB")
(OUT / "chars.txt").write_text("".join(chr(c) for c in sorted(chars)), encoding="utf-8")
print("游戏里用到", len(chars), "个字符")
