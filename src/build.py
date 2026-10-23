#!/usr/bin/env python3
"""把 index.html + css + js 打包成一个 html 文件，不需要装任何第三方库。

  python build.py              -> dist/modou.html     双击就能玩，联机、发给朋友都用这个
  python build.py --artifact   -> dist/artifact.html 发布到 claude.ai 用（去掉 html/head/body 外壳）
  python build.py --desktop    -> desktop/app/       桌面版（Steam）用：同一份游戏，字体打包进去离线可用
                                  需要 pip install fonttools brotli，并且先在 desktop 目录 npm install
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def bundle():
    html = read("index.html")
    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">',
                  lambda m: "<style>\n" + read(m.group(1)) + "</style>", html)
    html = re.sub(r'<script src="(js/[^"]+)"></script>',
                  lambda m: "<script>\n" + read(m.group(1)) + "</script>", html)
    return html


def main():
    if "--desktop" in sys.argv:
        build_desktop()
        return
    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    html = bundle()
    if "--artifact" in sys.argv:
        head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
        body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
        head = re.sub(r"<meta charset[^>]*>\s*", "", head)
        head = re.sub(r'<meta name="viewport"[^>]*>\s*', "", head)
        target = out / "artifact.html"
        target.write_text(head.strip() + "\n" + body.strip() + "\n", encoding="utf-8")
    else:
        target = out / "modou.html"
        target.write_text(html, encoding="utf-8")
    print(f"已生成 {target.relative_to(ROOT)}（{target.stat().st_size // 1024} KB）")


# ---------------------------------------------------------------------------
# 桌面版：python build.py --desktop
#   1. 打包出和网页版一样的 html，只把 <head> 里三个 Google Fonts 的 <link> 换成本地 @font-face
#   2. 用 fontTools 把字体裁成只含用到的字（woff2），放进 desktop/app/fonts/，附 OFL 许可证
#   3. 把 js/config.js 里的 VERSION 写进 desktop/package.json（和 package-lock.json）
# ---------------------------------------------------------------------------
DESKTOP = ROOT / "desktop"
FONT_PKGS = DESKTOP / "node_modules" / "@expo-google-fonts"

# (CSS 里的字体名, 字重, npm 包, 包里的 TTF, 输出文件名, 是否加常用字（GB2312 一级 3755 字）)
FONT_FACES = [
    ("Ma Shan Zheng", 400, "ma-shan-zheng", "400Regular/MaShanZheng_400Regular.ttf", "MaShanZheng-Regular.woff2", False),
    ("Noto Sans SC", 400, "noto-sans-sc", "400Regular/NotoSansSC_400Regular.ttf", "NotoSansSC-Regular.woff2", True),
    ("Noto Sans SC", 500, "noto-sans-sc", "500Medium/NotoSansSC_500Medium.ttf", "NotoSansSC-Medium.woff2", True),
    ("Noto Sans SC", 700, "noto-sans-sc", "700Bold/NotoSansSC_700Bold.ttf", "NotoSansSC-Bold.woff2", True),
]
# 字体许可证（包里有 LICENSE_FONT 就原样复制；没有就用 desktop/build/OFL-1.1.txt + 这里的版权行）
FONT_LICENSES = [
    ("ma-shan-zheng", "OFL-MaShanZheng.txt",
     "Copyright 2018 The Ma Shan Zheng Project Authors (https://github.com/googlefonts/mashanzheng)"),
    ("noto-sans-sc", "OFL-NotoSansSC.txt",
     "Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'"),
]
# index.html <head> 里要换掉的三个 Google Fonts 标签（每个必须正好出现一次）
GOOGLE_FONT_TAGS = [
    r'[ \t]*<link rel="preconnect" href="https://fonts\.googleapis\.com"[^>]*>\n?',
    r'[ \t]*<link rel="preconnect" href="https://fonts\.gstatic\.com"[^>]*>\n?',
    r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/css2\?[^"]*">',
]


def fail(msg):
    sys.exit("\n[build.py --desktop] " + msg)


def app_version():
    m = re.search(r"""^\s*const\s+VERSION\s*=\s*['"]([^'"]+)['"]""", read("js/config.js"), re.M)
    if not m:
        fail("js/config.js 里找不到 const VERSION = '…'")
    return m.group(1)


def used_chars():
    """index.html、css、js 里出现过的所有字（连 \\uXXXX、&#…; 这类转义写法也算上）。"""
    import html as htmllib
    cps = set()
    texts = [htmllib.unescape(read("index.html"))]
    escapes = []
    for p in sorted((ROOT / "css").glob("*.css")):
        t = p.read_text(encoding="utf-8")
        texts.append(t)
        escapes += re.findall(r"\\([0-9a-fA-F]{1,6})\s?", t)
    for p in sorted((ROOT / "js").rglob("*.js")):
        t = p.read_text(encoding="utf-8")
        texts.append(t)
        escapes += re.findall(r"\\u([0-9a-fA-F]{4})", t) + re.findall(r"\\u\{([0-9a-fA-F]{1,6})\}", t)
    for t in texts:
        cps.update(ord(c) for c in t)
    cps.update(int(h, 16) for h in escapes)
    return {c for c in cps if 0x20 <= c <= 0x10FFFF and not 0xD800 <= c <= 0xDFFF}


def base_chars():
    """两种字体都加：可打印 ASCII、常用标点符号、中文标点、全角字符。"""
    s = set(range(0x20, 0x7F))                     # ASCII
    s |= {ord(c) for c in "·×÷°±¥©®™"}
    s |= set(range(0x2010, 0x2028))                # ‐ – — ‘ ’ “ ” • … 等
    s |= set(range(0x2030, 0x203C))                # ‰ ′ ″ ※ 等
    s |= set(range(0x3000, 0x3040))                # 中文标点：、。「」『』【】《》〜 等
    s |= set(range(0xFF01, 0xFF66))                # 全角 ！（），：；？～ 等
    s |= set(range(0xFFE0, 0xFFE7))                # ￥ ￡ 等
    return s


def common_hanzi():
    """常用汉字：GB2312 一级字库 3755 字（覆盖现代汉语常用字表），只加给 Noto Sans SC，让随手打的房间码也能显示。"""
    s = set()
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                s.add(ord(bytes([hi, lo]).decode("gb2312")))
            except UnicodeDecodeError:
                pass
    return s


def subset_font(src, dst, unicodes):
    from fontTools import subset
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.name_IDs = ["*"]            # 保留版权、许可证信息
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=sorted(unicodes))
    sub.subset(font)
    subset.save_font(font, str(dst), opts)
    return len(font.getBestCmap() or {})


def font_face_css():
    rules = []
    for family, weight, _pkg, _ttf, out, _common in FONT_FACES:
        rules.append(f'@font-face{{font-family:"{family}";font-style:normal;font-weight:{weight};'
                     f'font-display:swap;src:url(fonts/{out}) format("woff2")}}')
    return "<style>\n" + "\n".join(rules) + "\n</style>"


def google_font_faces(head):
    """index.html 向 Google Fonts 要了哪些 (字体, 字重)。"""
    import html as htmllib
    from urllib.parse import parse_qs, urlsplit
    m = re.search(r'href="(https://fonts\.googleapis\.com/css2\?[^"]*)"', head)
    faces = set()
    for fam in parse_qs(urlsplit(htmllib.unescape(m.group(1))).query).get("family", []) if m else []:
        name, _, axes = fam.partition(":")
        if axes.split("@")[0].endswith("wght") and "@" in axes:
            weights = [int(t.split(",")[-1]) for t in axes.split("@", 1)[1].split(";")]
        else:
            weights = [400]
        faces.update((name.strip(), w) for w in weights)
    return faces


def replace_google_fonts(html):
    head, sep, rest = html.partition("</head>")
    if not sep:
        fail("index.html 里没有 </head>")
    wanted = google_font_faces(head)
    have = {(f, w) for f, w, *_ in FONT_FACES}
    if wanted != have:
        fail("index.html 要的 Google 字体和 build.py 的 FONT_FACES 对不上：\n"
             f"    index.html 要：{sorted(wanted)}\n    FONT_FACES 有：{sorted(have)}\n"
             "改一下 build.py 里的 FONT_FACES（加字重就加一行，对应 npm 包里的 TTF）。")
    for i, pat in enumerate(GOOGLE_FONT_TAGS):
        n = len(re.findall(pat, head))
        if n != 1:
            fail(f"index.html <head> 里的 Google Fonts 标签变了（第 {i + 1} 个找到 {n} 次）。"
                 "改一下 build.py 里的 GOOGLE_FONT_TAGS。")
        repl = font_face_css() if i == len(GOOGLE_FONT_TAGS) - 1 else ""
        head = re.sub(pat, lambda m: repl, head)
    if "fonts.googleapis.com" in head or "fonts.gstatic.com" in head:
        fail("index.html <head> 里还剩 Google Fonts 的链接，build.py 的 GOOGLE_FONT_TAGS 要跟着改")
    return head + sep + rest


def stamp_version(ver):
    """把版本号写进 desktop/package.json 和 package-lock.json（按字节改，不动换行和格式）。"""
    import json
    changed = []
    for name, count in (("package.json", 1), ("package-lock.json", 2)):
        p = DESKTOP / name
        if not p.exists():
            if name == "package.json":
                fail("找不到 desktop/package.json")
            continue
        text = p.read_bytes().decode("utf-8")
        new = re.sub(r'("version"\s*:\s*")[^"]*(")', lambda m: m.group(1) + ver + m.group(2), text, count=count)
        data = json.loads(new)
        ok = data.get("version") == ver
        if name == "package-lock.json":
            ok = ok and data.get("packages", {}).get("", {}).get("version") == ver
        if not ok:
            fail(f"desktop/{name} 的版本号没改对，手动看一下")
        if new != text:
            p.write_bytes(new.encode("utf-8"))
            changed.append(name)
    return changed


def build_desktop():
    import shutil
    import time
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass
    t0 = time.time()
    try:
        import fontTools  # noqa: F401
        import brotli  # noqa: F401
    except ImportError:
        fail("缺 Python 库 fontTools / brotli（裁字体、压 woff2 要用）。先运行：\n"
             "    pip install fonttools brotli")
    missing = [f"desktop/node_modules/@expo-google-fonts/{pkg}/{ttf}"
               for _f, _w, pkg, ttf, _o, _c in FONT_FACES if not (FONT_PKGS / pkg / ttf).exists()]
    if missing:
        fail("找不到字体文件：\n    " + "\n    ".join(missing) +
             "\n先在 desktop 目录运行 npm install（CI 里是 npm ci），字体包在 devDependencies 里。")

    ver = app_version()
    html = replace_google_fonts(bundle())

    app = DESKTOP / "app"
    if app.exists():
        try:
            shutil.rmtree(app)
        except OSError as e:
            fail(f"desktop/app 删不掉（桌面版是不是还开着？先关掉再试）：{e}")
    fonts = app / "fonts"
    fonts.mkdir(parents=True)
    (app / "index.html").write_bytes(html.encode("utf-8"))

    used = used_chars()
    base = base_chars() | used
    with_common = base | common_hanzi()
    print(f"桌面版 {ver}：源码里用到 {len(used)} 个字符；Noto Sans SC 另加 GB2312 一级常用字")
    total = 0
    for family, weight, pkg, ttf, out, common in FONT_FACES:
        n = subset_font(FONT_PKGS / pkg / ttf, fonts / out, with_common if common else base)
        size = (fonts / out).stat().st_size
        total += size
        print(f"  fonts/{out:<28} {family} {weight}：{n} 字，{size / 1024:.0f} KB")

    for pkg, out, copyright_line in FONT_LICENSES:
        lic = FONT_PKGS / pkg / "LICENSE_FONT"
        if lic.exists():
            text = lic.read_bytes().decode("utf-8")
        else:
            body = (DESKTOP / "build" / "OFL-1.1.txt").read_bytes().decode("utf-8")
            text = copyright_line + "\n\n" + body
        (fonts / out).write_bytes(text.encode("utf-8"))

    changed = stamp_version(ver)
    page = (app / "index.html").stat().st_size
    print(f"已生成 desktop/app/index.html（{page // 1024} KB）+ fonts/（{total / 1024 / 1024:.2f} MB，含 OFL 许可证）")
    if changed:
        print(f"版本号 {ver} 已写进 desktop/" + "、".join(changed))
    print(f"用时 {time.time() - t0:.0f} 秒。接下来：cd desktop && npm start（试玩）或 npm run dist:win（打包）")


if __name__ == "__main__":
    main()
