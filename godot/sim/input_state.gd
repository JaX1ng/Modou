class_name InputState
extends RefCounted
## 角色内部的输入（对照 JS input.js 的 Input）：按住的状态 + 带时间戳的按键缓冲。
## 每帧的输入编成一个整数（低 5 位按住，往上 6 位这一帧新按下，再往上一位「这个人用冲刺键」），联机两边只互传这个整数。

var left := false
var right := false
var up := false
var down := false
var block := false
var buf: Array = []      # [{"a": 动作, "t": 按下时的时钟}, …]
var keyDash := false

const HELD_ACTS := ["left", "right", "up", "down", "block"]
const PRESS_ACTS := ["up", "jab", "heavy", "kick", "grab", "dash"]
const DASH_KEY := 1 << 11                 # 5 + 6
const HELD_MASK := 31 | (1 << 11)          # 按住的那几位 + DASH_KEY

static func tap_bit(a: String) -> int:
	return 1 << (5 + PRESS_ACTS.find(a))

static func hold_bit(a: String) -> int:
	return 1 << HELD_ACTS.find(a)

func press(a: String, t: float) -> void:
	buf.append({"a": a, "t": t})
	if buf.size() > 12:
		buf.pop_front()

func clear() -> void:
	buf.clear()
	left = false; right = false; up = false; down = false; block = false

func dir() -> int:
	return (1 if right else 0) - (1 if left else 0)

## 整数 → 角色的输入缓冲（对照 JS applyInput）
func apply(v: int, clock: float) -> void:
	left = (v & 1) != 0
	right = (v & 2) != 0
	up = (v & 4) != 0
	down = (v & 8) != 0
	block = (v & 16) != 0
	for i in PRESS_ACTS.size():
		if v & (1 << (5 + i)):
			press(PRESS_ACTS[i], clock)
	keyDash = (v & DASH_KEY) != 0

func save() -> Dictionary:
	var b := []
	for e in buf:
		b.append({"a": e.a, "t": e.t})
	return {"l": left, "r": right, "u": up, "d": down, "b": block, "buf": b, "k": keyDash}

func load_from(o: Dictionary) -> void:
	left = o.l; right = o.r; up = o.u; down = o.d; block = o.b; keyDash = o.k
	buf = []
	for e in o.buf:
		buf.append({"a": e.a, "t": e.t})
