#!/usr/bin/env python3
"""把 index.html + css + js 打包成一个 html 文件，不需要装任何第三方库。

  python build.py              -> dist/modou.html     单文件，字体也嵌在里面：双击就能玩、离线能用；联机、发给朋友都用这个
                                  dist/index.html     网页版（GitHub Pages，复制到仓库根目录）：同一份，字体指向仓库里的 src/fonts/
  python build.py --artifact   -> dist/artifact.html 发布到 claude.ai 用（去掉 html/head/body 外壳，字体嵌在里面）
  python build.py --desktop    -> desktop/app/       桌面版（Steam）用：同一份游戏，字体打包进去离线可用（思源黑体多带 GB2312 一级常用字）
  python build.py --fonts      -> fonts/*.woff2      重新裁字体：游戏里加了新字就跑一遍（打包时会查缺字，装了工具会自动重裁）
  --desktop、--fonts 需要 pip install fonttools brotli，并且先在 desktop 目录 npm install（字体包在那里）

2.4：不再向 Google Fonts 要字体（上不了谷歌的人以前会卡在白屏、字体也不对）。字体文件在 fonts/，css/fonts.css 指过去。
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


FONT_DIR = ROOT / "fonts"


def font_css(mode):
    """css/fonts.css 里的字体地址换成：embed 嵌进去（data:）/ pages 仓库里的 src/fonts/ / desktop 软件版自己的 fonts/"""
    import base64

    def url(m):
        name = m.group(1)
        if mode == "embed":
            data = (FONT_DIR / name).read_bytes()
            return "url(data:font/woff2;base64," + base64.b64encode(data).decode("ascii") + ")"
        return "url(" + ("src/fonts/" if mode == "pages" else "fonts/") + name + ")"
    return re.sub(r"url\(\.\./fonts/([^)]+)\)", url, read("css/fonts.css"))


def bundle(fonts="embed"):
    html = read("index.html")
    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">',
                  lambda m: "<style>\n" + (font_css(fonts) if m.group(1) == "css/fonts.css" else read(m.group(1))) + "</style>", html)
    html = re.sub(r'<script src="(js/[^"]+)"></script>',
                  lambda m: "<script>\n" + read(m.group(1)) + "</script>", html)
    if "fonts.googleapis.com" in html or "fonts.gstatic.com" in html:
        fail("index.html 里又有 Google Fonts 的链接了 —— 字体要用 css/fonts.css（打包在 fonts/ 里）")
    return html


def main():
    if "--desktop" in sys.argv:
        build_desktop()
        return
    if "--fonts" in sys.argv:
        build_fonts()
        return
    check_fonts()
    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    if "--artifact" in sys.argv:
        html = bundle("embed")
        head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
        body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
        head = re.sub(r"<meta charset[^>]*>\s*", "", head)
        head = re.sub(r'<meta name="viewport"[^>]*>\s*', "", head)
        target = out / "artifact.html"
        target.write_text(head.strip() + "\n" + body.strip() + "\n", encoding="utf-8")
        print(f"已生成 {target.relative_to(ROOT)}（{target.stat().st_size // 1024} KB）")
        return
    for name, mode in (("modou.html", "embed"), ("index.html", "pages")):
        target = out / name
        target.write_text(bundle(mode), encoding="utf-8")
        print(f"已生成 {target.relative_to(ROOT)}（{target.stat().st_size // 1024} KB）" +
              ("：单文件，字体嵌在里面" if mode == "embed" else "：网页版，复制成仓库根目录的 index.html（字体用仓库里的 src/fonts/）"))


# ---------------------------------------------------------------------------
# 字体（2.4 起网页版也打包，见 css/fonts.css）和桌面版：python build.py --fonts / --desktop
#   --fonts：用 fontTools 把字体裁成只含游戏里用到的字（woff2），放进 fonts/（网页版、单文件用），附 OFL 许可证
#   --desktop：1. 打包出和网页版一样的 html，字体指向 desktop/app/fonts/
#              2. 字体另裁一份放进 desktop/app/fonts/（思源黑体多带 GB2312 一级常用字：随手打的房间码也显示得了）
#              3. 把 js/config.js 里的 VERSION 写进 desktop/package.json（和 package-lock.json）
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
def fail(msg):
    sys.exit("\n[build.py --desktop] " + msg)


def app_version():
    m = re.search(r"""^\s*const\s+VERSION\s*=\s*['"]([^'"]+)['"]""", read("js/config.js"), re.M)
    if not m:
        fail("js/config.js 里找不到 const VERSION = '…'")
    return m.group(1)


def used_chars():
    """游戏里（index.html 和它引用的 css、js）出现过的所有字（连 \\uXXXX、&#…; 这类转义写法也算上）。
    测试、动作台、平衡报告这些开发用的页面不算（字体只给游戏用）。"""
    import html as htmllib
    cps = set()
    page = read("index.html")
    texts = [htmllib.unescape(page)]
    escapes = []
    for rel in re.findall(r'<link rel="stylesheet" href="(css/[^"]+)">', page):
        t = read(rel)
        texts.append(t)
        escapes += re.findall(r"\\([0-9a-fA-F]{1,6})\s?", t)
    for rel in re.findall(r'<script src="(js/[^"]+)"></script>', page):
        t = read(rel)
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


def css_faces():
    """css/fonts.css 里写了哪些 (字体, 字重, 文件名)。"""
    faces = set()
    for m in re.finditer(r"@font-face\{([^}]*)\}", read("css/fonts.css")):
        body = m.group(1)
        fam = re.search(r'font-family:"([^"]+)"', body).group(1)
        wt = int(re.search(r"font-weight:(\d+)", body).group(1))
        name = re.search(r"url\(\.\./fonts/([^)]+)\)", body).group(1)
        faces.add((fam, wt, name))
    return faces


def check_faces():
    have = {(f, w, o) for f, w, _p, _t, o, _c in FONT_FACES}
    if css_faces() != have:
        fail("css/fonts.css 的 @font-face 和 build.py 的 FONT_FACES 对不上：\n"
             f"    fonts.css：{sorted(css_faces())}\n    FONT_FACES：{sorted(have)}\n"
             "改一下其中一边（加字重就两边各加一行，对应 npm 包里的 TTF）。")


def need_font_tools():
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


def write_licenses(folder):
    for pkg, out, copyright_line in FONT_LICENSES:
        lic = FONT_PKGS / pkg / "LICENSE_FONT"
        if lic.exists():
            text = lic.read_bytes().decode("utf-8")
        else:
            body = (DESKTOP / "build" / "OFL-1.1.txt").read_bytes().decode("utf-8")
            text = copyright_line + "\n\n" + body
        (folder / out).write_bytes(text.encode("utf-8"))


def build_fonts():
    """fonts/：网页版、单文件用的字体 —— 游戏里用到的字 + ASCII、常用标点（不加常用字库，文件小）。"""
    check_faces()
    need_font_tools()
    FONT_DIR.mkdir(exist_ok=True)
    chars = base_chars() | used_chars()
    total = 0
    for family, weight, pkg, ttf, out, _common in FONT_FACES:
        n = subset_font(FONT_PKGS / pkg / ttf, FONT_DIR / out, chars)
        size = (FONT_DIR / out).stat().st_size
        total += size
        print(f"  fonts/{out:<28} {family} {weight}：{n} 字，{size / 1024:.0f} KB")
    write_licenses(FONT_DIR)
    # 裁的时候要了哪些字（打包时拿来查缺字；字体本身没有的字 —— 箭头、注释里的生僻字 —— 不会每次都当成缺的重裁）
    (FONT_DIR / "chars.txt").write_text("".join(chr(c) for c in sorted(chars)), encoding="utf-8")
    print(f"已生成 fonts/（{total / 1024:.0f} KB，含 OFL 许可证）：游戏里用到 {len(chars)} 个字符")


def check_fonts():
    """打包前看一眼 fonts/ 里的字够不够（游戏里加了新字）：不够又装了工具就自动重裁，没装就提醒。"""
    check_faces()
    if not all((FONT_DIR / o).exists() for *_x, o, _c in FONT_FACES):
        print("fonts/ 里没有字体，现裁一份")
        build_fonts()
        return
    have = (FONT_DIR / "chars.txt").read_text(encoding="utf-8") if (FONT_DIR / "chars.txt").exists() else ""
    lack = used_chars() - {ord(c) for c in have}
    if not lack:
        return
    sample = "".join(sorted(chr(c) for c in lack))[:40]
    try:
        need_font_tools()
    except SystemExit:
        print(f"！fonts/ 里缺 {len(lack)} 个字（{sample}…）：装好 fonttools、在 desktop 目录 npm install 以后运行 python build.py --fonts")
        return
    print(f"fonts/ 里缺 {len(lack)} 个字（{sample}），重新裁一遍")
    build_fonts()


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
    check_faces()
    need_font_tools()

    ver = app_version()
    html = bundle("desktop")

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

    write_licenses(fonts)

    changed = stamp_version(ver)
    page = (app / "index.html").stat().st_size
    print(f"已生成 desktop/app/index.html（{page // 1024} KB）+ fonts/（{total / 1024 / 1024:.2f} MB，含 OFL 许可证）")
    if changed:
        print(f"版本号 {ver} 已写进 desktop/" + "、".join(changed))
    print(f"用时 {time.time() - t0:.0f} 秒。接下来：cd desktop && npm start（试玩）或 npm run dist:win（打包）")


if __name__ == "__main__":
    main()
