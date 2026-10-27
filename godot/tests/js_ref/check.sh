#!/bin/bash
# 对照测试一条龙：JS 版跑全部场景（只要每帧指纹）→ Godot 版逐帧比 → 有对不上的，就把那个场景那几帧的全部字段要回来，再比一遍，告诉你是哪个字段
# 用法：tests/js_ref/check.sh [场景.json]（默认 tests/js_ref/scenarios.json）；临时文件放在 $OUT（默认 /tmp）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
GODOT="${GODOT:-/home/claude/tools/godot/Godot_v4.7.2-stable_linux.x86_64}"
SC="${1:-$HERE/scenarios.json}"
T="${OUT:-/tmp}"   # 别用 TMPDIR：Chromium 的临时目录路径太长会起不来
cd "$HERE" && node run_ref.mjs "$SC" "$T/ref_trace.json" || exit 2
(timeout 1800 "$GODOT" --headless --path "$ROOT" -s tests/diff_trace.gd -- "$T/ref_trace.json" brief > "$T/diff.txt" 2>&1)
grep -v "^$" "$T/diff.txt" | grep -v "leaked\|resources still\|at: c\|^Godot Engine" | grep -v "^BAD"
BAD=$(grep "^BAD" "$T/diff.txt" | head -1)
[ -z "$BAD" ] && exit 0
set -- $BAD
echo "—— 第 $2 个场景第 $3 帧：要回那几帧的全部字段 ——"
node run_ref.mjs "$SC" "$T/ref_win.json" "$2" $(( $3 > 3 ? $3 - 3 : 0 )) "$3" > /dev/null || exit 2
(timeout 600 "$GODOT" --headless --path "$ROOT" -s tests/diff_trace.gd -- "$T/ref_win.json" > "$T/diff_win.txt" 2>&1)
grep -v "^$" "$T/diff_win.txt" | grep -v "leaked\|resources still\|at: c\|^Godot Engine" | cut -c1-2500
exit 1
