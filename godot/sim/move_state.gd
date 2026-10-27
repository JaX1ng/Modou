class_name MoveState
extends RefCounted
## 正在出的这一招（对照 JS 里 Fighter.move 那个对象）。存档（联机回滚）时整个拷一份。

var def: MoveDef
var name := ""
var t := 0.0              # 这一招走了多少帧（每步 +DT）
var S := 0.0              # 这一次的前摇（势破会加长）
var hit := false
var blocked := false
var done := false
var air := false
var slowed := false
var serial := 0
var armorLeft := 0
var press := ""           # 按的是哪个键（"" = 特殊动作）
var dashIn := false
var pen := 0.0            # 被挡住、被顶回去多出来的收招
var has_dvx := false      # 千斤坠出脚时定的斜度
var dvx := 0.0
var bounce := 0.0         # 千斤坠踩中 / 被挡后翻跟头的进度（画面）
var bFly := 0.0
var pick := ""            # 擒住后的后续
var holdKind := ""
var has_lungePx := false  # 闪身冲多远
var lungePx := 0.0
var parryThrow := false
var absorbed := false
var tumbled := false
var evaded := false
var beatVs := ""
var slipped := false
var missTag := false
var dodged := false

func copy() -> MoveState:
	var m := MoveState.new()
	m.def = def; m.name = name; m.t = t; m.S = S; m.hit = hit; m.blocked = blocked; m.done = done; m.air = air
	m.slowed = slowed; m.serial = serial; m.armorLeft = armorLeft; m.press = press; m.dashIn = dashIn; m.pen = pen
	m.has_dvx = has_dvx; m.dvx = dvx; m.bounce = bounce; m.bFly = bFly; m.pick = pick; m.holdKind = holdKind
	m.has_lungePx = has_lungePx; m.lungePx = lungePx; m.parryThrow = parryThrow; m.absorbed = absorbed; m.tumbled = tumbled
	m.evaded = evaded; m.beatVs = beatVs; m.slipped = slipped; m.missTag = missTag; m.dodged = dodged
	return m
