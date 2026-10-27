class_name Fighter
extends RefCounted
## 角色（逻辑层）：状态机、物理、朝向、出招 / 取消、特殊动作（闪身、推挡、爆气、泼墨、擒拿后续、过肩摔、千斤坠……）。
## 对照 JS src/js/fighter.js —— 函数名、字段名、算法一样（方便对照着改）。画面相关的（姿势、骨骼、发带、残影）在 view/fighter_anim.gd。
## 朝向规则（1.9.0）：按着方向不出招 = 跑，马上朝那边；不按左右 / 蹲 / 格挡 / 挡住的硬直：自动面向对手；
## 出招：对手在 ASSIST_R 以内一律朝对手打（aimSide 推演），远了才照按的方向。

const ACTIONABLE := {"idle": true, "run": true, "crouch": true, "block": true}

var sim                   # GameSim（拿 events、combat、freeze 用）
var idx := 0
var style := "trad"
var inp := InputState.new()
var opp: Fighter

# ---- 外观、名字（只是画面 / 界面）----
var look := "ink"
var name := "墨"
var label := ""

# ---- 逻辑字段（联机存档全存，见 save()）----
var maxHp := C.MAX_HP
var x := 0.0
var facing := 1
var alt := 0.0
var vz := 0.0
var vx := 0.0
var kvx := 0.0
var vxCap := C.AIR_DRIFT
var takeoffV := 0.0
var hp := C.MAX_HP
var state := "idle"
var t := 0.0
var move: MoveState = null
var dashEnd := -999.0
var comboDmg := 0.0
var maxComboDmg := 0.0
var freeAt := -999.0
var chain: Array = []
var chainIdle := 99.0
var slowJab := 0.0
var airUsed := false
var lowBlock := false
var stunT := 0.0
var hurtHeavy := false
var grabbed := false
var downPhase := ""
var lieT := 0.0
var landT := 4.0
var riseT := 0.0
var combo := 0
var comboT := 0.0
var comboLive := false
var comboTaken := 0
var rushStamped := false
var clock := 0.0
var serial := 0
var runT := 0.0
var airT := 0.0
var leapJump := false
var carried := false
var carry0 := 0.0
var slam := false
var slipGot := false
var stagger := false
var qi := 0.0
var reel := false
var clashed := false
var noParry := false
var guardOn := -1
var stompFor := -1
var reelBy := -1
var reelKD := false
var rollDir := 0
var heldAt := -999.0
var prevBlock := false
var blockPress := -999.0
var parryOK := false
var prevL := false
var prevR := false
var tapL := -999.0
var tapR := -999.0
var dashT := -999.0
var dashDir := 1
var dashFace := 1
var tumFly := 0.0
var slipEnd := -999.0
var stats := {}

# ---- 只给画面 / 训练场面板 / AI 看的（不存档）----
var lagHp := C.MAX_HP
var info = null               # 训练场面板：这一下的招式、伤害、帧差……
var prevCombo = null
var history: Array = []       # AI 看的快照（一帧一个，最多 40）
var holdPose := false         # 刚挨了一下：这一步姿势先不动（画面）
var spinFlip := false         # 回身肘转身：姿势先转半圈（画面）
var lieKind := 0              # 躺姿换着来（画面）
var gwalk := 0                # 边挡边走往哪边（画面、AI）
var walkPhase := 0.0          # 跑步 / 小碎步的相位（画面）
var carryRot := 0.0           # 被过肩摔时整个人的转角（画面）
var hitFlash := 0.0
var hitShake := 0.0
var heat := 0.0               # 连招的火（画面）
var qiGlow := 0.0

func _init(i: int, look_id: String, x0: float, face: int) -> void:
	idx = i
	setLook(look_id)
	reset(x0, face)

func reset(x0: float, face: int) -> void:
	x = x0; facing = face; alt = 0.0; vz = 0.0; vx = 0.0; kvx = 0.0; vxCap = C.AIR_DRIFT; takeoffV = 0.0
	hp = maxHp; lagHp = maxHp; state = "idle"; t = 0.0; move = null
	dashEnd = -999.0; info = null; comboDmg = 0.0; maxComboDmg = 0.0; prevCombo = null; freeAt = -999.0
	chain = []; chainIdle = 99.0; slowJab = 0.0; airUsed = false; lowBlock = false
	stunT = 0.0; hurtHeavy = false; grabbed = false; downPhase = ""; lieT = C.LIE_GROUND; landT = 4.0; riseT = C.RISE
	combo = 0; comboT = 0.0; comboLive = false; comboTaken = 0; rushStamped = false
	clock = 0.0; serial = 0; walkPhase = 0.0; runT = 0.0; airT = 0.0; leapJump = false
	carried = false; carry0 = 0.0; carryRot = 0.0; slam = false; qiGlow = 0.0; heat = 0.0; hitFlash = 0.0; hitShake = 0.0
	lieKind = 0; gwalk = 0; slipGot = false; stagger = false
	qi = 0.0; reel = false; clashed = false; noParry = false
	guardOn = -1; stompFor = -1; reelBy = -1; reelKD = false; rollDir = 0; heldAt = -999.0
	prevBlock = false; blockPress = -999.0; parryOK = false
	prevL = false; prevR = false; tapL = -999.0; tapR = -999.0; dashT = -999.0; dashDir = face; dashFace = face
	# tumFly、slipEnd 不清（和 JS 一样：reset 不碰这两个，下一回合还留着上一次的值；只影响起身动画的快慢、测试）
	history = []
	stats = {"hits": 0, "maxCombo": 0, "blocks": 0, "specials": 0, "parries": 0, "clashes": 0, "presses": 0, "punishes": 0, "escapes": 0, "supers": 0}
	holdPose = false; spinFlip = false
	inp.clear()

func setLook(id: String) -> void:
	var p := C.lookOf(id)
	if p.is_empty():
		p = C.PALETTE[0]
	look = p.id
	name = p.name

# ---------- 查状态 ----------
func airborne() -> bool:
	return alt > 0.0 or vz > 0.0

func moves() -> Dictionary:
	return Moves.styleOf(style).moves

func actionable() -> bool:
	return ACTIONABLE.has(state)

## 2.7 滚身起滚多远：往前（面朝的方向）96、往后 64
func rollLen(dir: int) -> float:
	return C.ROLL_DIST if dir == facing else C.ROLL_BACK

## 第 r[0] ~ r[1] 帧（含）：按「第 k 帧 = [k, k+1)」比
func inFrames(key: String) -> bool:
	if move == null or state != "attack":
		return false
	var r: PackedFloat64Array = move.def.get(key)
	return r.size() == 2 and move.t >= r[0] and move.t < r[1] + 1.0

func invuln() -> bool:
	return state == "down" or state == "ko" or state == "win" or state == "tumble" or inFrames("inv")

func strikeInv() -> bool:
	return inFrames("sinv")

func airInv() -> bool:
	return inFrames("airInv")

## 霸体：重招前摇里，还能硬吃 tier 这一系的打击（tier = "" 不管哪一系）
func armored(tier: String) -> bool:
	var m := move
	if state != "attack" or m == null or not m.def.has_armor or m.armorLeft <= 0:
		return false
	return m.t >= m.def.armor_from and m.t < m.S + 1.0 and (tier == "" or m.def.armor_vs.has(tier))

func facingTo(other: Fighter) -> bool:
	return (other.x - x) * facing >= -4.0

func isBlocking() -> bool:
	return (state == "block" or state == "blockstun") and not airborne()

func isCrouching() -> bool:
	return state == "crouch" or ((state == "block" or state == "blockstun") and lowBlock)

func blockHeightOK(h: String) -> bool:
	if h == "low":
		return lowBlock
	if h == "high":
		return not lowBlock
	return true

func parryReady() -> bool:
	return not noParry and parryOK and clock - blockPress < C.PARRY_WIN + 1.0

## 保留一位小数（联机两边算出来一样）
func gainQi(n: float) -> void:
	qi = clampf(C.jsround((qi + n) * 10.0) / 10.0, 0.0, C.QI_MAX)

func runSpeed() -> float:
	return minf(C.RUN_MAX, C.RUN_START + runT * C.RUN_ACC)

func snapFace() -> void:
	var d := opp.x - x
	if d != 0.0 and absf(d) < C.FACE_SNAP:
		facing = 1 if d > 0.0 else -1

func dashTurning() -> bool:
	return state == "attack" and move != null and move.name == "dash" and move.t < move.def.lunge[1]

func oppSide() -> int:
	return 1 if opp.x >= x else -1

## 自动面向对手：对手在身后超过 FACE_HYST 才转（两人重叠时不来回抖）
func autoFace() -> void:
	var d := opp.x - x
	if d * facing < -C.FACE_HYST:
		facing = 1 if d > 0.0 else -1

func takePress(acts: Array, peek := false) -> String:
	var b := inp.buf
	var i := 0
	while i < b.size():
		var e: Dictionary = b[i]
		if clock - e.t >= C.BUF_WIN + 1.0:
			b.remove_at(i)
			continue
		if acts.has(e.a):
			if not peek:
				b.remove_at(i)
			return e.a
		i += 1
	return ""

## 两个键在 PAIR_WIN 帧内先后按下 = 同时按（爆气、泼墨用）
func pairPressed(a: String, bk: String) -> bool:
	var buf := inp.buf
	var ia := -1
	var ib := -1
	for i in buf.size():
		if clock - buf[i].t >= C.BUF_WIN + 1.0:
			continue
		if buf[i].a == a and ia < 0:
			ia = i
		elif buf[i].a == bk and ib < 0:
			ib = i
	if ia < 0 or ib < 0 or absf(buf[ia].t - buf[ib].t) >= C.PAIR_WIN + 1.0:
		return false
	buf.remove_at(maxi(ia, ib))
	buf.remove_at(mini(ia, ib))
	return true

## 这一招走到 tt 对应招式表时间轴上的哪一刻（被势破拖慢了前摇、被挡住拉长了收招都按比例换回去）
## tt 不传 = 用 m.t（JS 里 undefined）。注意 tt 可以是负的（attackStep 第一步 k = m.t + DT - 1 < 0），所以用 NAN 当「没传」
func baseTime(tt := NAN) -> float:
	var m := move
	var d := m.def
	if is_nan(tt):
		tt = m.t
	if tt <= m.S:
		return tt * d.S / m.S if m.S != 0.0 else 0.0
	if m.pen != 0.0 and tt > m.S + d.A:
		return d.S + d.A + (tt - m.S - d.A) * d.R / (d.R + m.pen)
	return tt - m.S + d.S

func inActive() -> bool:
	var m := move
	return m != null and not m.def.scripted and m.t >= m.S + 1.0 and m.t < m.S + m.def.A + 1.0

func jabRun() -> int:
	var j := 0
	var i := chain.size() - 1
	while i >= 0 and chain[i] == "jab":
		j += 1
		i -= 1
	return j

## 踩腿：刚蹲挡住一记下段腿（扫堂腿），对方还在那一招里（出完判定了）
func stompReady() -> bool:
	var o := opp
	var om := o.move
	return stompFor >= 0 and o.state == "attack" and om != null and om.serial == stompFor and om.t >= om.S + 1.0

func canCancel(kind: String) -> bool:
	var m := move
	if m == null or m.air or m.def.scripted or m.def.noCancel or m.tumbled:
		return false
	if not (m.hit or m.blocked or m.absorbed):
		return false
	var after := m.t + C.DT - 1.0 - m.S
	if after < 1.0 or after >= m.def.A + 13.0:
		return false
	if kind == "jab" and jabRun() >= C.JAB_CHAIN_MAX:
		return false
	return (Moves.styleOf(style).cancel.get(m.def.kind, []) as Array).has(kind)

# ---------- 出招朝哪边（1.9.4 aimSide）----------
## 把这一招从按下到判定结束这几帧，两个人会走到哪，照 update / separate 的算法一步一步推一遍；
## 朝左、朝右各推一遍：判定那几帧里打得到对手的帧多的那边赢；一样多就看「不出这一招时」判定那一刻对手在我哪边。只用加减乘除。
func aimSide(d: MoveDef) -> int:
	var A := AimSim.new(self, d)
	var a: Array = A.simulate(facing, true)       # [打中的帧数, 不出这一招时判定那一刻对手离我多远]
	var b: Array = A.simulate(-facing, true)
	if a[0] != b[0]:
		return facing if a[0] > b[0] else -facing
	if opp.state == "jumpsquat":
		a = A.simulate(facing, false)
		b = A.simulate(-facing, false)
	return -facing if a[1] * facing < -3.0 * C.FACE_HYST else facing

## 千斤坠出脚那一帧（1.9.4）：按对手这时候在哪重新定朝向，再定往前下踩的斜度
func aimDive(m: MoveState) -> void:
	var o := opp
	var f0 := maxf(1.0, ceilf((alt - o.alt - m.def.vreach) / C.DIVE_VZ))
	var d := o.x + (o.vx * f0 if o.airborne() else 0.0) - x
	if absf(d) >= 3.0:
		facing = 1 if d > 0.0 else -1
	m.has_dvx = true
	m.dvx = clampf((d * facing - C.DIVE_AIM) / f0, 0.0, C.DIVE_VX)

## 闪身（2.0，边挡边冲刺）：从对手身边钻过去，落到他身后（冲多远开头就定好）
func beginSlip() -> void:
	var o := opp
	var f := oppSide()
	facing = f; stunT = 0.0; lowBlock = false; gwalk = 0; runT = 0.0
	startScript("slip")
	move.has_lungePx = true
	move.lungePx = clampf(absf(o.x - x) + C.SLIP_PAST, C.SLIP_MIN, C.SLIP_MAX)
	slipGot = false
	sim.ev.fx("slip", idx)
	sim.ev.snd("whoosh", 0.7)

## 回身肘（2.0.2）：闪身躲过了重拳、钻到对手身后，转过身来朝他背上一肘
func slipElbow() -> void:
	var o := opp
	var f := 1 if o.x >= x else -1
	if f != facing:
		facing = f
		if not sim.ev.quiet:
			spinFlip = true            # 画面：姿势先转半圈（看着还是背对着他，再拧身把肘顶出去）
	beginMove("slipElbow", "")

func startAttack(kind: String, cancel: bool) -> bool:
	var air := airborne()
	if air and (airUsed or kind == "grab"):
		return false
	if not cancel and chainIdle >= C.CHAIN_WIN + 1.0:
		chain = []
		rushStamped = false
	var dir := inp.dir()
	var o := opp
	var runMod := not air and state == "run" and runT >= C.RUN_CHARGE
	var ST := Moves.styleOf(style)
	var MV := ST.moves
	var guess := ST.variant(kind, [] if air else chain, air, "down" if inp.down else ("run" if runMod else ""))
	var toward := aimSide(MV[guess]) if guess != "" else facing
	var dist := absf(o.x - x)
	# 按住「后」+ 拿，对手就在面前 → 面朝对手，抓住直接过肩摔（1.8.0）
	var backThrow: bool = kind == "grab" and not air and not inp.down and dir != 0 and dir == -toward and dist <= MV.grab.reach + 16.0
	var face := toward if (backThrow or dist <= C.ASSIST_R or dir == 0) else dir
	if face != facing:
		if state == "run":
			kvx += facing * runSpeed() * 0.5
			state = "idle"
			runT = 0.0
		elif dashTurning():
			kvx += facing * C.DASH_TURN_KV
		facing = face
	var mod := "down" if inp.down else ("run" if (not air and state == "run" and runT >= C.RUN_CHARGE) else "")
	var nm := ST.variant(kind, [] if air else chain, air, mod)
	if not air and kind == "kick" and inp.down and stompReady():
		nm = "stomp"
	if nm == "":
		return false
	if not beginMove(nm, kind):
		return false
	if backThrow:
		move.pick = "throw"
	return true

## kind = 按的是哪个键（记进连段）；特殊动作传 ""
func beginMove(nm: String, kind: String) -> bool:
	var d: MoveDef = moves()[nm]
	var air := airborne()
	var S := d.S
	var slowed := false
	if kind == "jab" and slowJab > 0.0:
		S += C.SLOW_JAB_ADD
		slowJab = 0.0
		slowed = true
	if state == "run":
		kvx += facing * runSpeed() * 0.5
	var fromDash := state == "attack" and move != null and move.name == "dash"
	var dashIn: bool = not air and not d.scripted and d.kind != "push" and facing == dashFace and (fromDash or clock - dashEnd < C.DASH_IN_WIN + 1.0)
	if dashIn:
		kvx += facing * 5.0
		dashEnd = -999.0
		sim.ev.fx("dashIn", idx)
		sim.ev.tag("冲", idx, 34, idx, "sh", -60, -facing * 30.0)
	slipGot = false
	var m := MoveState.new()
	m.def = d; m.name = nm; m.t = 0.0; m.S = S; m.air = air; m.slowed = slowed
	serial += 1
	m.serial = serial
	m.armorLeft = d.armor_n if d.has_armor else 0
	m.press = kind; m.dashIn = dashIn
	move = m
	stompFor = -1
	state = "attack"
	runT = 0.0
	if d.cost != 0.0:
		qi -= d.cost
	if air:
		airUsed = true
		chain = []
		if d.dive:
			vz = clampf(vz, C.DIVE_HOP, 7.0)
			vx *= 0.3
			vxCap = C.AIR_DRIFT
	elif kind != "":
		chain.append(kind)
		if chain.size() > 8:
			chain.pop_front()
	if d.ender:
		chain = []
	sim.ev.fx("move", idx, -1, {"name": nm})
	sim.ev.snd("whoosh", 0.4 if (d.kind == "jab" or d.kind == "push") else 1.0)
	if nm == "super":
		sim.ev.fx("super", idx)
		sim.ev.tag("墨", idx, 48, idx, "sh", -70, -facing * 20.0)
		sim.ev.snd("stamp")
		sim.ev.snd("burst")
	return true

func startScript(nm: String) -> void:
	var m := MoveState.new()
	m.def = moves()[nm]; m.name = nm; m.t = 0.0; m.S = 0.0; m.hit = true; m.done = true; m.air = false
	serial += 1
	m.serial = serial
	move = m
	state = "attack"
	runT = 0.0
	sim.ev.fx("move", idx, -1, {"name": nm})

## 爆气：挨打的时候（受击硬直里，被擒住不行）按「重+踢」
func tryBurst() -> bool:
	if qi < C.QI_BURST or grabbed or not pairPressed("heavy", "kick"):
		return false
	qi -= C.QI_BURST; stunT = 0.0; reel = false; clashed = false; stagger = false; comboTaken = 0
	facing = 1 if opp.x >= x else -1
	startScript("burst")
	sim.ev.fx("burst", idx)
	sim.ev.snd("burst")
	return true

## 挣脱（1.8.0）：被擒住的头 HOLD_ESC 帧里按「拿」
func tryEscape() -> bool:
	var o := opp
	var m := o.move
	if not grabbed or o.state != "attack" or m == null or m.name != "hold" or clock - heldAt >= C.HOLD_ESC + 1.0:
		return false
	if takePress(["grab"]) == "":
		return false
	sim.combat.escapeGrab(o, self)
	return true

## 借力摔（1.8.0）：卸力成功后按「拿」，抓住失衡的对手顺势过肩摔（挣不脱）
func parryThrow() -> void:
	var o := opp
	o.grabbed = true; o.reel = false; o.move = null; o.stunT = maxf(o.stunT, moves().throwBack.evSlam + 12.0)
	facing = 1 if o.x >= x else -1
	startScript("throwBack")
	move.parryThrow = true
	sim.ev.snd("whoosh", 0.8)

func groundCtl(locked: bool) -> void:
	var dir := inp.dir()
	gwalk = 0
	if locked:
		if state != "win":
			state = "idle"
		runT = 0.0
		return
	if qi >= C.QI_MAX and pairPressed("heavy", "kick"):
		facing = aimSide(moves().super)
		beginMove("super", "")
		return
	if clock - dashT < 4.0:
		dashT = -999.0
		if inp.block and not inp.down and dashDir == oppSide():
			beginSlip()
			return
		facing = dashDir
		dashFace = dashDir
		startScript("dash")
		sim.ev.snd("whoosh", 0.5)
		return
	if takePress(["up"]) != "":
		takeoffV = runSpeed() if state == "run" else 0.0
		state = "jumpsquat"
		t = 0.0
		return
	if state == "block" and inp.block and takePress(["jab"]) != "":
		beginMove("shove", "")
		return
	var k := takePress(["jab", "heavy", "kick", "grab"])
	if k != "" and startAttack(k, false):
		return
	if inp.block:
		autoFace()
		state = "block"
		lowBlock = inp.down
		runT = 0.0
		# 2.0 边挡边走：按着挡 + 方向（不蹲）= 举着手慢慢走（不转身，一直面朝对手）
		if not inp.down and dir != 0:
			x += dir * C.BLOCK_WALK * C.DT
			gwalk = dir * facing
			walkPhase += C.BLOCK_WALK / 44.0 * C.DT
		return
	if inp.down:
		autoFace()
		state = "crouch"
		runT = 0.0
		return
	if dir != 0:
		if dir != facing:
			facing = dir
			runT = 0.0
		runT += C.DT
		var v := runSpeed()
		x += dir * v * C.DT
		state = "run"
		walkPhase += v * 0.26 / 86.0 * C.DT     # 步频跟着速度（RUN_ST / (RUN_X0 - RUN_X1)，画面）
	else:
		runT = 0.0
		state = "idle"

func update(locked: bool) -> void:
	clock += C.DT
	if slowJab > 0.0:
		slowJab = maxf(0.0, slowJab - C.DT)
	if state != "attack":
		chainIdle += C.DT
	if comboT > 0.0:
		comboT = maxf(0.0, comboT - C.DT)
	if state != "hit" and state != "down" and state != "ko":
		comboTaken = 0
	if locked:
		inp.buf.clear()
	# 输入边沿：刚按下格挡（卸力判定窗口）、同一方向双击（冲刺）
	var bl := inp.block
	if bl and not prevBlock:
		parryOK = clock - blockPress >= C.PARRY_LOCK
		blockPress = clock
	prevBlock = bl
	if not inp.keyDash:
		if inp.left and not prevL:
			if clock - tapL < C.DTAP_WIN + 1.0:
				dashT = clock; dashDir = -1; tapL = -999.0
			else:
				tapL = clock
		if inp.right and not prevR:
			if clock - tapR < C.DTAP_WIN + 1.0:
				dashT = clock; dashDir = 1; tapR = -999.0
			else:
				tapR = clock
	if takePress(["dash"]) != "":
		dashT = clock
		var dd := inp.dir()
		dashDir = dd if dd != 0 else facing
		tapL = -999.0
		tapR = -999.0
	prevL = inp.left
	prevR = inp.right

	match state:
		"idle", "run", "crouch", "block":
			groundCtl(locked)
		"parry":
			var o := opp
			var did := false
			if not locked and o.reel and o.state == "hit" and not o.airborne() and absf(o.x - x) <= 116.0 and takePress(["grab"]) != "":
				parryThrow()
				did = true
			if not did and not locked:
				var k := takePress(["jab", "heavy", "kick", "grab"])
				if k != "" and startAttack(k, false):
					did = true
			if not did:
				t += C.DT
				if t >= C.PARRY_POSE:
					state = "idle"
		"jumpsquat":
			x += facing * takeoffV * C.DT
			t += C.DT
			if t >= 3.0:
				var dir := inp.dir()
				var nvx: float
				var running := takeoffV > 0.0 and dir != -facing
				if running:
					nvx = facing * maxf(takeoffV * C.RUN_CARRY, C.JUMP_VX)
				else:
					nvx = dir * C.JUMP_VX
				if dir != 0:
					facing = dir
				vz = C.JUMP_V; alt = 0.01; vx = nvx; vxCap = maxf(C.AIR_DRIFT, absf(nvx))
				state = "air"; airUsed = false; airT = 0.0; takeoffV = 0.0
				leapJump = running
				sim.ev.snd("whoosh", 0.3)
		"air":
			airT += C.DT
			if not locked:
				var dir := inp.dir()
				if dir != 0:
					facing = dir
				if not airUsed:
					var k := takePress(["jab", "heavy", "kick"])
					if k != "":
						startAttack(k, false)
		"tumble":
			t += C.DT
		"land":
			if not locked and landT <= 4.0 and takePress(["up"]) != "":
				takeoffV = 0.0
				state = "jumpsquat"
				t = 0.0
			else:
				t += C.DT
				if t >= landT:
					state = "idle"
		"attack":
			attackStep(locked)
		"hit":
			if not (not locked and tryEscape()) and not (not locked and tryBurst()):
				stunT -= C.DT
				if stunT <= 0.0:
					freeAt = clock
					grabbed = false; reel = false; clashed = false; carried = false; stagger = false
					if airborne():
						state = "air"; airUsed = true; vx = 0.0
					else:
						state = "idle"
		"blockstun":
			lowBlock = inp.down
			autoFace()
			if not locked and inp.block and not inp.down and clock - dashT < 4.0 and dashDir == oppSide():
				dashT = -999.0
				beginSlip()
			elif not locked and stompReady() and takePress(["kick"]) != "":
				beginMove("stomp", "kick")
			elif not locked and qi >= C.GC_COST and takePress(["heavy"]) != "":
				beginMove("jieQuan", "")
			elif not locked and takePress(["jab"]) != "":
				beginMove("shove", "")
			else:
				stunT -= C.DT
				if stunT <= 0.0:
					state = "block" if (inp.block and not locked) else "idle"
		"down":
			if downPhase == "lie":
				t += C.DT
				if t >= lieT:
					downPhase = "getup"
					t = 0.0
					rollDir = inp.dir() if (state == "down" and not locked) else 0
			elif downPhase == "getup":
				if rollDir != 0:
					x += rollDir * rollLen(rollDir) / C.GETUP * C.DT
				t += C.DT
				if t >= C.GETUP:
					state = "rise"
					downPhase = ""
					t = 0.0
					riseT = C.RISE_ROLL if rollDir != 0 else C.RISE
					if rollDir != 0:
						facing = 1 if opp.x >= x else -1
						rollDir = 0
		"rise":
			t += C.DT
			if t >= (riseT if riseT != 0.0 else C.RISE):
				state = "idle"
		_:
			pass
	# 物理
	if carried:
		kvx = 0.0
		x = clampf(x, C.WALL_L, C.WALL_R)
		return
	x += kvx * C.KB_DAMP_C
	kvx *= C.KB_DAMP_R
	if absf(kvx) < 0.05:
		kvx = 0.0
	if airborne():
		var m := move
		var atkAir := state == "attack" and m != null and m.air
		var dive := atkAir and m.def.dive
		var diving := dive and not m.hit and not m.blocked and m.t >= m.S + 1.0
		if diving:
			vz = -C.DIVE_VZ
			vx = facing * (m.dvx if m.has_dvx else C.DIVE_VX)
			alt += vz * C.DT
		else:
			var g := C.GRAV * 0.5 if (dive and m.t < m.S + 1.0) else C.GRAV
			alt += vz * C.DT + g * C.GH
			vz -= g * C.DT
		if state == "tumble":
			x += vx * C.DT
		elif state == "air" or atkAir:
			var dir := 0 if locked else inp.dir()
			var cx := C.DT
			if dive:
				pass
			elif dir != 0:
				var same := dir * vx > 0.0
				if not same:
					vxCap = C.AIR_DRIFT
				var lim := maxf(C.AIR_DRIFT, vxCap) if same else C.AIR_DRIFT
				var v := vx + dir * C.AIR_ACC * C.DT
				if dir * v > lim:
					v = dir * lim
				vx = v
			else:
				vx *= C.AIR_DRAG_R
				vxCap = C.AIR_DRIFT
				cx = C.AIR_DRAG_CP
			x += vx * cx
		if alt <= 0.0:
			alt = 0.0
			vz = 0.0
			onLand()
	x = clampf(x, C.WALL_L, C.WALL_R)

func attackStep(locked: bool) -> void:
	var m := move
	var d := m.def
	# 这一步先查再把 m.t 加 DT。k = m.t + DT - 1：和以前（一帧一帧、先查再加 1）查的时候 m.t 是同一个意思
	var k := m.t + C.DT - 1.0
	if not locked:
		# 重/踢 刚出手几帧内补按另一个 = 同时按：气满放泼墨
		if k < C.PAIR_WIN + 1.0 and not m.air and (m.press == "heavy" or m.press == "kick") and qi >= C.QI_MAX:
			var other := "kick" if m.press == "heavy" else "heavy"
			if takePress([other]) != "":
				beginMove("super", "")
				return
		var kk := takePress(["jab", "heavy", "kick", "grab"], true)
		if kk != "" and canCancel(kk):
			takePress([kk])
			startAttack(kk, true)
			return
	var o := opp
	if d.has_lunge and not m.air:
		# 前冲：贴到对手身上就停，不冲过人（冲刺、闪身除外）。闪身冲多远写在这一招身上（lungePx）
		var la := d.lunge[0]
		var lb := d.lunge[1]
		var px := m.lungePx if m.has_lungePx else d.lunge[2]
		var tb := baseTime(k)
		if tb >= la and tb < lb and (d.scripted or not lungeStop((o.x - x) * facing, o)):
			x += facing * px / (lb - la) * C.DT
	if m.name == "slip":
		# 2.0.2 躲过了重拳：钻到他身后、或者钻完了，就自动回身一肘
		if not locked and slipGot and ((x - o.x) * o.facing <= -C.SLIP_ELBOW_AT or k >= d.lunge[1]):
			slipElbow()
			return
		# 钻空了：第 SLIP_CANCEL 帧起可以直接按招打出去
		if not locked and not slipGot and k >= C.SLIP_CANCEL:
			var kk := takePress(["jab", "heavy", "kick", "grab"])
			if kk != "" and startAttack(kk, false):
				return
	if d.dive and k == m.S and not m.hit and not m.blocked:
		aimDive(m)
	if m.name == "dash":
		if not locked and k >= C.DASH_CANCEL:
			var kk := takePress(["jab", "heavy", "kick", "grab"])
			if kk != "" and startAttack(kk, false):
				return
		if k == 10.0:
			sim.ev.fx("dashEnd", idx)
			sim.ev.snd("land")
	var held := o.grabbed and o.state == "hit"
	# 擒住 / 提膝 / 别腿摔 / 抱腿摔：把对手往怀里带
	if held and (m.name == "hold" or m.name == "knee" or m.name == "trip" or m.name == "tackle"):
		o.x += (x + facing * C.HOLD_GAP - o.x) * Fighter.PULL_K
		o.kvx = 0.0
	if m.name == "hold":
		# 擒住期间按的键决定后续：拳 = 提膝撞，踢 = 别腿摔，重 = 过肩摔；最后一帧按着后 = 过肩摔；都没按 = 推开
		if not locked and m.pick == "" and m.holdKind == "grab":
			var kk := takePress(["jab", "kick", "heavy"])
			if kk != "":
				m.pick = "knee" if kk == "jab" else ("trip" if kk == "kick" else "throw")
		if k >= d.R - 1.0:
			if not held:
				move = null
				state = "idle"
				chainIdle = 0.0
				return
			var backHeld := not locked and (inp.left if facing > 0 else inp.right)
			var pk: String = "tackle" if m.holdKind == "tackle" else (m.pick if m.pick != "" else ("throw" if backHeld else "push"))
			startScript("throwBack" if pk == "throw" else ("grabHit" if pk == "push" else pk))
			return
	if m.name == "grabHit" and k == d.evPush and held:
		sim.combat.grabPush(self, o, d.R - k)
	if m.name == "knee" and held and (k == d.evHit or k == d.evHit2):
		sim.combat.kneeHit(self, o, k == d.evHit2, d.R - k)
	if (m.name == "trip" or m.name == "tackle") and k == d.evSlam and held:
		sim.combat.slamDown(self, o, m.name)
	if m.name == "throwBack":
		if k <= d.evSlam:
			carryStep(maxf(0.0, k) / d.evSlam)
		if k == 2.0 or k == 7.0:
			sim.ev.snd("whoosh", 0.5 if k == 2.0 else 1.0)
		if k == d.evSlam:
			throwOver()
	if (m.name == "legCatch" or m.name == "scoop") and k == d.evSlam:
		sim.ev.shake(7)
		sim.ev.fx("slamFloor", o.idx)
		sim.ev.snd("hit", 0.9)
	if m.name == "burst" and k == d.evWave:
		burstWave()
	if d.dive and (m.hit or m.blocked):
		m.bounce += C.DT
	m.t += C.DT
	if m.t >= m.S + d.A + d.R + m.pen:
		if m.name == "dash":
			dashEnd = clock
		if m.name == "slip":
			slipEnd = clock
		move = null
		chainIdle = 0.0
		if airborne():
			state = "air"
			airUsed = true
		else:
			state = "idle"

## 过肩摔：每步把对手摆到 THROW_PATH 上 —— 被拽近、扛过头顶、甩到身后（u = 0 ~ 1）
func carryStep(u: float) -> void:
	var o := opp
	if o.state != "hit" or not o.grabbed:
		return
	if not o.carried:
		o.carried = true
		o.carry0 = (o.x - x) * facing
		o.kvx = 0.0; o.vz = 0.0; o.vx = 0.0
		o.stunT = maxf(o.stunT, moves().throwBack.evSlam + 8.0)
	# 背后快到墙了：一边摔一边往前挪，给对手留出落地的地方
	var land := x - facing * THROW_LAND
	var need := C.WALL_L - land if land < C.WALL_L else (C.WALL_R - land if land > C.WALL_R else 0.0)
	if need != 0.0:
		x = clampf(x + clampf(need, -6.0 * C.DT, 6.0 * C.DT), C.WALL_L, C.WALL_R)
	var p := throwPath(u, o.carry0)
	o.x = clampf(x + facing * p[0], C.WALL_L, C.WALL_R)
	o.alt = p[1]
	o.carryRot = p[2]

## 过肩摔：把对手从头顶甩到身后（换边），砸在地上
func throwOver() -> void:
	var o := opp
	if o.state != "hit" or not o.grabbed:
		return
	var pt := move.parryThrow
	var dmg := C.PARRY_THROW_DMG if pt else C.THROW_DMG
	o.hp -= dmg
	o.grabbed = false
	o.carried = false
	var nx := x - facing * THROW_LAND
	if nx < C.WALL_L or nx > C.WALL_R:
		nx = clampf(nx, C.WALL_L, C.WALL_R)
		x = clampf(nx + facing * THROW_LAND, C.WALL_L, C.WALL_R)
	o.x = nx
	o.alt = maxf(o.alt, 0.01)
	o.knockDown(-3.0, -facing * 2.0, C.TFH(28), o.hp <= 0.0)
	o.slam = true
	if o.hp <= 0.0:
		o.hp = 0.0
	stats.hits += 1
	stats.specials += 1
	gainQi(dmg * 0.4 * C.QI_PER_HP)
	o.gainQi(dmg * 0.9 * C.QI_PER_HP)
	sim.combat.bumpCombo(self, o)
	sim.combat.noteGrab(self, dmg, "借力摔" if pt else "过肩摔")
	sim.freeze = 7.0
	sim.ev.shake(8)
	sim.ev.fx("slamFloor", o.idx, -1, {"big": true})
	sim.ev.stamp("借力摔" if pt else "过肩摔", 30, idx)
	sim.ev.tag("-" + str(int(dmg)), idx, 18, o.idx, "floor", -120)
	sim.ev.snd("hit", 1.0)

## 爆气的冲击波（2.1）：炸到范围内的对手 —— 打掉 BURST_DMG、把人炸倒
func burstWave() -> void:
	var o := opp
	var dir := 1 if o.x >= x else -1
	sim.freeze = maxf(sim.freeze, 6.0)
	sim.ev.shake(9)
	if absf(o.x - x) > C.BURST_RANGE or o.invuln():
		sim.combat.cev("burst", self, o, {"miss": true, "far": absf(o.x - x) > C.BURST_RANGE})
		return
	# 面朝着格挡：挡住爆气，只吃三成、被推开一点，几乎不硬直
	if o.isBlocking() and o.facingTo(self):
		var chip := maxf(1.0, C.jsround(C.BURST_DMG * C.BLOCK_KEEP))
		o.hp = maxf(1.0, o.hp - chip)
		o.stats.blocks += 1
		o.state = "blockstun"
		o.stunT = C.BURST_BLOCK_STUN
		o.kvx = dir * C.BURST_BLOCK_KB
		info = {"label": "爆气", "dmg": chip, "how": "被挡", "why": "面朝着格挡挡得住爆气", "adv": null, "t": clock}
		sim.ev.tag([["挡住爆气 ", o.idx], ["-" + str(int(chip)), idx]], o.idx, 22, o.idx, "floor", -150)
		sim.combat.cev("burst", self, o, {"blocked": true})
		return
	o.hp -= C.BURST_DMG
	stats.hits += 1
	stats.specials += 1
	gainQi(C.BURST_DMG * 0.4 * C.QI_PER_HP)
	o.gainQi(C.BURST_DMG * 0.9 * C.QI_PER_HP)
	o.reel = false; o.clashed = false; o.stagger = false; o.grabbed = false; o.comboLive = false; o.runT = 0.0
	o.knockDown(4.5, dir * C.BURST_KB, C.BURST_LIE, o.hp <= 0.0)
	if o.hp <= 0.0:
		o.hp = 0.0
	sim.combat.cev("burst", self, o, {"hit": true})
	sim.combat.bumpCombo(self, o)
	info = {"label": "爆气", "dmg": C.BURST_DMG, "how": "炸倒", "why": "挨打时爆气：对方倒地", "adv": null, "down": true, "t": clock}
	sim.ev.fx("burstHit", idx, o.idx)
	sim.ev.tag("-" + str(int(C.BURST_DMG)), idx, 22, o.idx, "head", -40)
	sim.ev.snd("hit", 1.1)

func onLand() -> void:
	kvx += vx * 0.5
	vx = 0.0
	if state == "air":
		state = "land"; t = 0.0; landT = 3.0
		sim.ev.fx("land", idx, -1, {"n": 4})
		sim.ev.snd("land")
	elif state == "tumble":
		state = "land"; t = 0.0; landT = C.TUMBLE_LAND; vx = 0.0; kvx *= 0.3
		sim.ev.fx("land", idx, -1, {"n": 7, "big": true})
		sim.ev.snd("land")
	elif state == "attack" and move != null and move.air:
		var m := move
		var dv := m.def.dive
		# 还没来得及判定就落地：当作这一招没出，落地后马上在地上出（按键重新放回缓冲）
		var early := not dv and not m.hit and not m.blocked and m.t < m.S + 2.0
		if early and m.press != "":
			inp.press(m.press, clock)
		var lt: float
		if dv:
			lt = 2.0 if m.hit else (7.0 if m.blocked else 11.0)
		else:
			lt = 3.0 if (m.hit or early) else 7.0
		landT = C.TA(lt)
		move = null
		state = "land"
		t = 0.0
		chainIdle = 0.0
		sim.ev.fx("land", idx, -1, {"n": 10 if dv else 5, "big": dv})
		if dv:
			sim.ev.shake(4)
		sim.ev.snd("land")
	elif state == "down" or state == "ko":
		if downPhase == "fall":
			downPhase = "lie"
			t = 0.0
			sim.ev.fx("land", idx, -1, {"n": 9, "big": true, "body": true})
			sim.ev.shake(4)
			sim.ev.snd("land")

func knockDown(nvz: float, nkvx: float, lie: float, ko: bool) -> void:
	state = "ko" if ko else "down"
	downPhase = "fall"
	t = 0.0
	vz = nvz
	if alt <= 0.0:
		alt = 0.01
	kvx = nkvx
	vx = 0.0
	lieT = lie
	move = null
	chain = []
	chainIdle = 99.0
	grabbed = false
	carried = false
	slam = false
	rollDir = 0
	stompFor = -1
	gwalk = 0
	lieKind = 0 if lieKind != 0 else 1
	reel = false
	clashed = false
	stagger = false
	runT = 0.0

## AI 看到的对手快照（一帧一个）
func record() -> void:
	var m := move
	var d: MoveDef = m.def if m != null else null
	var s := {
		"atk": m != null and not d.scripted and m.t <= m.S + d.A,
		"kind": d.kind if d else "", "name": m.name if m else "", "serial": m.serial if m else -1,
		"tier": d.tier if d else "", "lead": d.lead if d else "", "height": d.height if d else "", "facing": facing, "x": x,
		"reach": (d.reach + (maxf(0.0, d.lunge[2]) if d.has_lunge else 0.0)) if d else 0.0,
		"remain": maxf(0.0, m.S + d.A - m.t) if m else 0.0,
		"phase": "" if m == null else ("s" if m.t <= m.S else ("a" if m.t <= m.S + d.A else "r")),
		"confirmed": m != null and (m.hit or m.blocked),
		"sLeft": m.S - m.t if m else 0.0, "armored": armored(""),
		"blocking": state == "block" or state == "blockstun", "down": state == "down" or state == "ko",
		"rise": state == "rise", "getup": state == "down" and downPhase == "getup",
		"roll": rollDir if (state == "down" and downPhase == "getup") else 0,
		"slip": m != null and m.name == "slip", "gwalk": gwalk if state == "block" else 0,
		"stagger": state == "hit" and stagger, "stunT": stunT, "open": d != null and d.open, "dive": d != null and d.dive, "clock": clock,
		"rLeft": maxf(0.0, m.S + d.A + d.R + m.pen - m.t) if m else 0.0,
		"landT": landT - t if state == "land" else 0.0,
		"air": airborne(), "alt": alt, "vz": vz, "vx": vx if airborne() else 0.0, "squat": state == "jumpsquat",
		"stun": state == "hit" or state == "blockstun",
		"dash": m != null and m.name == "dash", "run": state == "run" and runT >= C.RUN_CHARGE,
		"held": grabbed, "low": Combat.lowProfile(self), "lowBlock": lowBlock,
	}
	history.append(s)
	if history.size() > 40:
		history.pop_front()

# ---------- 存档 / 读档（联机回滚）：只存影响胜负的逻辑字段 ----------
const SAVE_KEYS := ["style", "maxHp", "x", "facing", "alt", "vz", "vx", "kvx", "vxCap", "takeoffV", "hp", "state", "t",
	"dashEnd", "comboDmg", "maxComboDmg", "freeAt", "chainIdle", "slowJab", "airUsed", "lowBlock", "stunT", "hurtHeavy",
	"grabbed", "downPhase", "lieT", "landT", "riseT", "combo", "comboT", "comboLive", "comboTaken", "rushStamped", "clock", "serial",
	"runT", "airT", "leapJump", "carried", "carry0", "slam", "slipGot", "stagger", "qi", "reel", "clashed", "noParry", "guardOn",
	"stompFor", "reelBy", "reelKD", "rollDir", "heldAt", "prevBlock", "blockPress", "parryOK", "prevL", "prevR", "tapL", "tapR",
	"dashT", "dashDir", "dashFace", "tumFly", "slipEnd"]

func save() -> Dictionary:
	var o := {}
	for k in SAVE_KEYS:
		o[k] = get(k)
	o.chain = chain.duplicate()
	o.stats = stats.duplicate()
	o.move = move.copy() if move != null else null
	o.inp = inp.save()
	return o

func load_from(o: Dictionary) -> void:
	for k in SAVE_KEYS:
		set(k, o[k])
	chain = o.chain.duplicate()
	stats = o.stats.duplicate()
	move = o.move.copy() if o.move != null else null
	inp.load_from(o.inp)

# ---------- 公用小函数 ----------
## 1.9.4 出招不冲过人：前冲冲进对手身子里（gap ≤ 一个身子半宽）就停；对手在空中不挡
static func lungeStop(gap: float, o: Fighter) -> bool:
	return not o.airborne() and gap >= 0.0 and gap <= C.PUSH

static var PULL_K := C.lerpK(0.3)

## 对手正起跳下蹲：马上要跳出去的水平速度
static func takeoffVx(o: Fighter) -> float:
	var dir := o.inp.dir()
	if o.takeoffV > 0.0 and dir != -o.facing:
		return o.facing * maxf(o.takeoffV * C.RUN_CARRY, C.JUMP_VX)
	return dir * C.JUMP_VX

static func catmull(p0: float, p1: float, p2: float, p3: float, tt: float) -> float:
	var t2 := tt * tt
	var t3 := t2 * tt
	return 0.5 * (2.0 * p1 + (p2 - p0) * tt + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (3.0 * p1 - p0 - 3.0 * p2 + p3) * t3)

## 过肩摔时对手的路线：[进度, x（按出手方朝向，正 = 身前；-1e9 = 被抓时的位置）, 离地, 转角（画面）]
const THROW_LAND := 72.0
const THROW_PATH := [[0.0, -1e9, 0.0, 0.0], [0.25, 42.0, 26.0, 30.0], [0.5, 12.0, 92.0, 120.0], [0.75, -34.0, 92.0, 204.0], [1.0, -72.0, 20.0, 266.0]]

static func throwPath(u: float, x0: float) -> Array:
	var K := THROW_PATH
	var n := K.size()
	var X := func(i: int) -> float:
		var v: float = K[clampi(i, 0, n - 1)][1]
		return x0 if v == -1e9 else v
	var i := 0
	while i < n - 2 and u > K[i + 1][0]:
		i += 1
	var tt := clampf((u - K[i][0]) / (K[i + 1][0] - K[i][0]), 0.0, 1.0)
	var px := catmull(X.call(i - 1), X.call(i), X.call(i + 1), X.call(i + 2), tt)
	var palt := catmull(K[maxi(0, i - 1)][2], K[i][2], K[i + 1][2], K[mini(n - 1, i + 2)][2], tt)
	return [px, maxf(0.01, palt), K[i][3] + (K[i + 1][3] - K[i][3]) * tt]


## aimSide 的推演（JS 里是一串闭包，GDScript 的闭包改不了外面的变量，所以写成一个小类）
class AimSim:
	var me: Fighter
	var o: Fighter
	var d: MoveDef
	var air := false
	var S := 0.0
	var n := 0.0
	var has_lg := false
	var lg0 := 0.0
	var lg1 := 0.0
	var lstep := 0.0
	var keepR := 1.0
	var keepC := 0.0
	var runKv := 0.0
	var dashIn := false
	var turnKv := 0.0
	var reachUp := 0.0
	var odir := 0
	var oam: MoveState = null
	var odv: MoveState = null
	var ducks := false
	var meAlt := 0.0
	# 推演的状态
	var sx := 0.0
	var kv := 0.0
	var sv := 0.0
	var ox := 0.0
	var oz := 0.0
	var ovz := 0.0
	var okv := 0.0
	var ov := 0.0
	var oAir := false
	var ocap := 0.0
	var squat := 0.0
	var dt := 0.0
	var dface := 1
	var has_ddvx := false
	var ddvx := 0.0
	var ostop := false
	var mt := 0.0
	var sx0 := 0.0
	var kv0 := 0.0
	var sv0 := 0.0
	var hits := 0
	var side0 := 0.0

	func _init(f: Fighter, dd: MoveDef) -> void:
		me = f
		o = f.opp
		d = dd
		air = f.airborne()
		S = d.S
		n = S + C.FE if d.dive else S + d.A + C.FE
		has_lg = not air and not d.scripted and d.has_lunge
		if has_lg:
			lg0 = d.lunge[0]
			lg1 = d.lunge[1]
			lstep = d.lunge[2] / (lg1 - lg0)
		var hd := f.inp.dir() != 0
		keepR = 1.0 if hd else C.AIR_DRAG_R
		keepC = C.DT if hd else C.AIR_DRAG_CP
		runKv = f.facing * f.runSpeed() * 0.5 if f.state == "run" else 0.0
		dashIn = not air and not d.scripted and d.kind != "push" and ((f.state == "attack" and f.move != null and f.move.name == "dash") or f.clock - f.dashEnd <= C.DASH_IN_WIN)
		turnKv = f.facing * C.DASH_TURN_KV if f.dashTurning() else 0.0
		var om: MoveState = o.move if o.state == "attack" else null
		if air:
			reachUp = INF
		elif d.kind == "grab":
			reachUp = 24.0
		else:
			reachUp = maxf(maxf(d.antiAir if d.antiAir != 0.0 else C.AIR_SAFE, C.DIVE_AA_ALT if (om != null and om.def.dive) else 0.0),
				C.KICK_AA_ALT if (d.tier == "kick" and d.height != "low" and om != null and om.air and om.def.kind == "kick") else 0.0)
		odir = 0 if o.state == "tumble" else o.inp.dir()
		oam = om if (om != null and om.air and not om.hit and not om.blocked) else null
		odv = oam if (oam != null and oam.def.dive) else null
		ducks = not air and d.height == "low"
		meAlt = f.alt if air else 0.0

	func inR(r: PackedFloat64Array, tt: float) -> bool:
		return r.size() == 2 and tt >= r[0] and tt < r[1] + 1.0

	func immune(tt: float) -> bool:
		return inR(d.inv, tt) or inR(d.sinv, tt) or (odv == null and inR(d.airInv, tt))

	func oStep() -> void:
		if ostop:
			return
		if odv != null and oAir and dt == odv.S + C.FE:
			var f0 := maxf(1.0, ceilf((oz - meAlt - odv.def.vreach) / C.DIVE_VZ))
			var ddx := sx - ox
			if absf(ddx) >= 3.0:
				dface = 1 if ddx > 0.0 else -1
			has_ddvx = true
			ddvx = clampf((ddx * dface - C.DIVE_AIM) / f0, 0.0, C.DIVE_VX)
		if oam != null:
			dt += C.DT
		ox += okv * C.KB_DAMP_C
		okv *= C.KB_DAMP_R
		if squat > 0.0:
			ox += o.facing * o.takeoffV * C.DT
			squat -= C.DT
			if squat > 1e-9:
				return
			ov = Fighter.takeoffVx(o)
			ovz = C.JUMP_V
			oz = 0.01
			oAir = true
			ocap = maxf(C.AIR_DRIFT, absf(ov))
		if not oAir:
			return
		var cx := C.DT
		if odv != null:
			var div := dt >= odv.S + 1.0
			if div:
				ovz = -C.DIVE_VZ
				ov = dface * (ddvx if has_ddvx else C.DIVE_VX)
				oz += ovz * C.DT
			else:
				oz += ovz * C.DT + C.GRAV * 0.5 * C.GH
				ovz -= C.GRAV * 0.5 * C.DT
		else:
			oz += ovz * C.DT + C.GRAV * C.GH
			ovz -= C.GRAV * C.DT
			if o.state != "tumble":
				if odir != 0:
					var same := odir * ov > 0.0
					if not same:
						ocap = C.AIR_DRIFT
					var lim := maxf(C.AIR_DRIFT, ocap) if same else C.AIR_DRIFT
					ov += odir * C.AIR_ACC * C.DT
					if odir * ov > lim:
						ov = odir * lim
				else:
					ov *= C.AIR_DRAG_R
					ocap = C.AIR_DRIFT
					cx = C.AIR_DRAG_CP
		ox += ov * cx
		if oz <= 0.0:
			oz = 0.0
			oAir = false
			okv += ov * 0.5
			ov = 0.0
		# 他空中的招打到我了：他就停在那儿
		if oam != null and oAir and dt >= oam.S + 1.0 and (odv != null or dt < oam.S + oam.def.A + 1.0) and not (oam.def.evadeCrouch and ducks) and not immune(mt):
			var fd := (sx - ox) * dface
			var vr := oam.def.vreach if oam.def.vreach != 0.0 else 999.0
			if fd >= -6.0 and fd <= oam.def.reach and oz - meAlt <= vr:
				ostop = true

	func meMove() -> void:
		sx += kv * C.KB_DAMP_C
		kv *= C.KB_DAMP_R
		sx0 += kv0 * C.KB_DAMP_C
		kv0 *= C.KB_DAMP_R
		if air:
			if d.dive:
				sx += sv * C.DT
				sx0 += sv0 * C.DT
			else:
				sv *= keepR
				sv0 *= keepR
				sx += sv * keepC
				sx0 += sv0 * keepC

	func push() -> void:
		var dd := ox - sx
		var ad := absf(dd)
		if air or oAir or ad >= 2.0 * C.PUSH:
			return
		var p := minf((2.0 * C.PUSH - ad) / 2.0, C.SOFT_PUSH * C.DT)
		var s := 1.0 if dd > 0.0 else (-1.0 if dd < 0.0 else (1.0 if me.facing > 0 else -1.0))
		sx -= s * p
		ox += s * p

	## f：朝哪边推演；fly = false：对手正起跳下蹲也当他不跳。返回 [打中的帧数, side0]
	func simulate(f: int, fly: bool) -> Array:
		sx = me.x
		kv = me.kvx + runKv + (f * 5.0 if (dashIn and f == me.dashFace) else 0.0) + (turnKv if f != me.facing else 0.0)
		sv = me.vx * (0.3 if d.dive else 1.0) if air else 0.0
		ox = o.x; oz = o.alt; ovz = o.vz; okv = o.kvx
		ov = o.vx if o.airborne() else 0.0
		oAir = o.airborne()
		ocap = o.vxCap
		squat = maxf(C.DT, 3.0 - o.t) if (fly and o.state == "jumpsquat") else 0.0
		dt = oam.t if oam != null else 0.0
		dface = o.facing
		has_ddvx = odv != null and odv.has_dvx
		ddvx = odv.dvx if has_ddvx else 0.0
		ostop = false
		mt = 0.0
		sx0 = me.x
		kv0 = me.kvx
		sv0 = sv
		meMove()
		if me.idx == 0:
			oStep()
		push()
		hits = 0
		var side := 0.0
		side0 = 0.0
		var t0 := minf(S + 1.0, n)
		var tt := C.DT
		while tt <= n + 1e-9:
			mt = tt
			if me.idx == 1:
				oStep()
			if has_lg and tt - 1.0 >= lg0 and tt - 1.0 < lg1 and not (f * (ox - sx) >= 0.0 and f * (ox - sx) <= C.PUSH and not oAir):
				sx += f * lstep * C.DT
			meMove()
			if me.idx == 0:
				oStep()
			if absf(tt - t0) < 1e-9:
				side = ox - sx
				side0 = ox - sx0
			if tt >= S + 1.0 and f * (ox - sx) >= -6.0 and f * (ox - sx) <= d.reach and oz <= reachUp:
				hits += 1
			push()
			tt += C.DT
		return [hits, side0]
