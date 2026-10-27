#!/bin/bash
# 打 Windows 版（一个 exe，游戏数据嵌在里面；桌面版用 Forward+ 渲染）：godot/build/Modou-版本-windows.zip
# 1. 官方模板没有就只取 windows_release_x86_64.exe 那一个文件（tools/fetch_template.py）
# 2. 模板换上墨斗的图标、版本信息（tools/patch_win_template.mjs，要 node；resedit 装在临时目录）
# 3. 照 export_presets.cfg 的「Windows」导出，打成 zip
# 用法：tools/build_windows.sh（在 godot/ 里跑）
set -e
cd "$(dirname "$0")/.."
GODOT="${GODOT:-/home/claude/tools/godot/Godot_v4.7.2-stable_linux.x86_64}"
VER=$(grep -oP 'config/version="\K[^"]+' project.godot)
TPL_DIR="$HOME/.local/share/godot/export_templates/4.7.2.stable"
TPZ="https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz"
mkdir -p "$TPL_DIR" build/tpl build/windows
[ -f build/.gdignore ] || echo "" > build/.gdignore
if [ ! -f "$TPL_DIR/windows_release_x86_64.exe" ]; then
  python3 tools/fetch_template.py "$TPZ" "$TPL_DIR" templates/windows_release_x86_64.exe
fi
TMP=$(mktemp -d)
cp tools/patch_win_template.mjs "$TMP/"
(cd "$TMP" && npm install --silent resedit@2 pe-library@1 >/dev/null && node patch_win_template.mjs "$TPL_DIR/windows_release_x86_64.exe" "$OLDPWD/assets/img/icon.ico" "$VER" "$OLDPWD/build/tpl/modou_windows_release.exe")
rm -rf "$TMP"
rm -f build/windows/Modou.exe
"$GODOT" --headless --path . --export-release "Windows" build/windows/Modou.exe
ZIP="build/Modou-$VER-windows.zip"
rm -f "$ZIP"
python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED,compresslevel=9); z.write('build/windows/Modou.exe','Modou/Modou.exe'); z.close()" "$ZIP"
ls -la "$ZIP"
