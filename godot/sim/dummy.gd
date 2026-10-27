class_name Dummy
extends RefCounted
## 训练场的木桩（对照 JS ai.js 最后的 Dummy）：不出招，只按设定站 / 蹲 / 挡 / 随机挡 / 跳；永远面朝玩家；不会卸力。
## mode：stand 站着 · crouch 蹲着 · block 站挡 · lowblock 蹲挡 · random 每招随机挡上或挡下 · jump 一直跳

var f: Fighter
var mode := "stand"
var seen := -1
var low := false
var jt := 0

func _init(fighter: Fighter, m: String) -> void:
	f = fighter
	mode = m if m != "" else "stand"

func tick(locked: bool) -> void:
	var o := f.opp
	var H := f.inp
	H.left = false; H.right = false; H.up = false; H.down = false; H.block = false
	f.noParry = true
	if locked:
		return
	if f.actionable() or f.state == "land":
		f.facing = 1 if o.x >= f.x else -1
	match mode:
		"crouch":
			H.down = true
		"block":
			H.block = true
		"lowblock":
			H.block = true
			H.down = true
		"random":
			H.block = true
			if o.move != null and o.state == "attack" and o.move.serial != seen:
				seen = o.move.serial
				low = AiRng.R() < 0.5
			H.down = low
		"jump":
			jt += 1
			if jt >= 45 and f.actionable():
				jt = 0
				f.inp.press("up", f.clock)
