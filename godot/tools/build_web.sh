#!/bin/bash
# 导出网页版到仓库根目录的 godot-web/（GitHub Pages：jax1ng.github.io/Modou/godot-web/）
# 用法：tools/build_web.sh（在 godot/ 里跑）
set -e
cd "$(dirname "$0")/.."
GODOT="${GODOT:-/home/claude/tools/godot/Godot_v4.7.2-stable_linux.x86_64}"
OUT=../godot-web
rm -rf "$OUT"
mkdir -p "$OUT"
"$GODOT" --headless --path . --export-release "Web" "$OUT/index.html"
cp web/trystero.js web/net_bridge.js "$OUT/"
ls -la "$OUT"
