class_name Combat
extends RefCounted
## 命中判定（对照 JS src/js/combat.js）：先同时算出「两边这一步各打不打得中」，再一起结算（没有先手偏向）。
## 交手：两边的招同时到（或对方的招只差 TRADE_LEAD 帧就到）→ 看 clashRelation()：克（×1.3 单方面打中）/ 压（被压的吃全额，压人的吃三成）/ 平（拼招，各吃五成）。
## 单方面打中依次看：卸力 → 格挡（面朝对方、高低对）→ 霸体 → 打中（破招 / 克制 / 连击衰减 / 失衡）。
## 擒拿：挡不住；出腿时被拿 = 接腿摔；被任何正在判定中的打击打断。
## 画面上的东西（特效、飘字、印章、声音、震屏）一律走 sim.ev（事件），这里不碰画面。

const CRASH_NAME := "倒栽葱"

var sim                  # GameSim
var on_cev: Callable     # 战斗事件（训练场用；平时不接）

func _init(s) -> void:
	sim = s

func cev(type: String, A: Fighter, B: Fighter, x := {}) -> void:
	if on_cev.is_valid():
		on_cev.call(type, A, B, x)

static func atWall(F: Fighter) -> bool:
	return F.x <= C.WALL_L + 2.0 or F.x >= C.WALL_R - 2.0

## 顿帧（取到 0.25 帧）
static func stopF(n: float) -> float:
	return C.grid(n * C.HITSTOP)

## 记数值（训练场面板用，不影响胜负）：这一下的招式、伤害、帧差、本套连击伤害
func note(A: Fighter, B: Fighter, dmg: float, how: String) -> void:
	var m := A.move
	var d := m.def
	var left := m.S + d.A + d.R + m.pen - m.t
	var adv = (B.stunT - left) if (B.state == "hit" or B.state == "blockstun") else null
	A.info = {"label": d.label, "lead": d.lead, "tier": d.tier, "height": d.height, "S": m.S, "A": d.A, "R": d.R, "dmg": dmg, "how": how,
		"adv": adv, "down": B.state == "down" or B.state == "ko", "blocked": how == "被挡", "t": A.clock}
	if dmg > 0.0 and how != "被挡":
		A.comboDmg = (0.0 if A.combo <= 1 else A.comboDmg) + dmg
		A.maxComboDmg = maxf(A.maxComboDmg, A.comboDmg)

func noteGrab(A: Fighter, dmg: float, label: String) -> void:
	A.info = {"label": label, "dmg": dmg, "how": "抓住", "adv": null, "t": A.clock}
	A.comboDmg = (0.0 if A.combo <= 1 else A.comboDmg) + dmg
	A.maxComboDmg = maxf(A.maxComboDmg, A.comboDmg)

# ---------- 判定（只看，不改状态） ----------
## 身子压得低：蹲着、蹲挡、正在出下段招（站着的擒拿抓不到）
static func lowProfile(F: Fighter) -> bool:
	return F.isCrouching() or (F.state == "attack" and F.move != null and not F.move.air and F.move.def.height == "low")

static func liveMove(F: Fighter) -> bool:
	return F.state == "attack" and F.move != null and not F.move.def.scripted and not F.move.hit and not F.move.blocked

## 飞踢、千斤坠（空中的腿）
static func airKick(F: Fighter) -> bool:
	return liveMove(F) and F.move.air and F.move.def.kind == "kick"

## 地上的腿（扫堂腿、踩腿贴地，不算）
static func groundKick(F: Fighter) -> bool:
	return liveMove(F) and not F.move.air and F.move.def.tier == "kick" and F.move.def.height != "low"

static func diving(F: Fighter) -> bool:
	return liveMove(F) and F.move.def.dive

static func aaProof(F: Fighter) -> bool:
	return liveMove(F) and F.move.def.aaProof

## 正在钻（slipInv 那几帧）的闪身
static func slipping(F: Fighter) -> bool:
	return F.state == "attack" and F.move != null and F.move.name == "slip" and F.inFrames("slipInv")

## 闪身只躲得过站着打的重系手上招
static func slipDodges(m: MoveState) -> bool:
	return not m.air and m.def.tier == "heavy" and m.def.kind == "heavy" and m.def.height != "low"

func grabIntent(A: Fighter, B: Fighter) -> String:
	var m := A.move
	if A.state != "attack" or m == null or m.def.kind != "grab" or m.done or not A.inActive() or B.invuln():
		return ""
	var dist := (B.x - A.x) * A.facing
	var bm: MoveState = B.move if B.state == "attack" else null
	var kicking := bm != null and bm.def.kind == "kick" and not bm.def.dive and bm.t >= 3.0 and bm.t < bm.S + bm.def.A + 1.0 and B.facingTo(A)
	if m.def.low:
		# 抄腿：接住地上的出腿（扫堂腿也接得住；跳起来的腿抄不到）；抓蹲着的；站着的抓不到
		if kicking and not bm.air and B.alt <= 24.0 and dist >= -6.0 and dist <= maxf(m.def.reach, bm.def.reach) + 6.0:
			return "scoop"
		if dist < -6.0 or dist > m.def.reach or B.alt > 24.0:
			return ""
		return "tackle" if lowProfile(B) else "whiff"
	# 接腿：对方正朝我出腿（不算扫堂腿）
	if kicking and bm.def.height != "low" and dist >= -6.0 and dist <= bm.def.reach + 6.0:
		return "catch"
	if dist < -6.0 or dist > m.def.reach or B.alt > 24.0:
		return ""
	return "duck" if lowProfile(B) else "grab"

## 打击能不能碰到：射程、面朝、高度（空中招往下够不够得着）
static func reaches(A: Fighter, B: Fighter, m: MoveState, extra := 0.0) -> bool:
	var d := m.def
	var dist := (B.x - A.x) * A.facing
	if dist < -6.0 or dist > d.reach + extra:
		return false
	if not m.air and B.airborne():
		var up := maxf(maxf(d.antiAir if d.antiAir != 0.0 else C.AIR_SAFE, C.DIVE_AA_ALT if diving(B) else 0.0),
			C.KICK_AA_ALT if (d.tier == "kick" and d.height != "low" and airKick(B)) else 0.0)
		if B.alt > up:
			return false
	if m.air and A.alt - B.alt > (d.vreach if d.vreach != 0.0 else 999.0):
		return false
	return true

## A 这一招打不打得到 B（无敌帧）：托天掌的对空无敌防不住千斤坠，对空招也打不到千斤坠
static func shielded(A: Fighter, B: Fighter, m: MoveState) -> bool:
	if B.strikeInv():
		return true
	if m.air and not m.def.dive and B.airInv():
		return true
	return m.def.tier == "aa" and aaProof(B)

func strikeIntent(A: Fighter, B: Fighter) -> String:
	var m := A.move
	if A.state != "attack" or m == null or m.done or m.def.kind == "grab" or not A.inActive() or B.invuln():
		return ""
	if not reaches(A, B, m):
		return ""
	if shielded(A, B, m):
		return ""
	if m.def.evadeCrouch and B.isCrouching():
		return "dodge"
	if slipping(B) and slipDodges(m):
		return "slip"
	return "hit"

## 剩下还没冲完的前冲距离
static func lungeLeft(F: Fighter) -> float:
	var d := F.move.def
	if not d.has_lunge or F.move.air:
		return 0.0
	var a := d.lunge[0]
	var b := d.lunge[1]
	var px := d.lunge[2]
	var tb := F.baseTime()
	return maxf(0.0, px) * clampf((b - maxf(tb, a)) / (b - a), 0.0, 1.0)

## B 的招是不是已经出手、lead 帧内就要打到 A（被打中时算交手）
static func committed(B: Fighter, A: Fighter, lead: float) -> bool:
	var m := B.move
	if B.state != "attack" or m == null or m.done or m.def.scripted or m.def.kind == "grab" or m.def.kind == "push":
		return false
	if m.t >= m.S + m.def.A + 1.0 or m.S - m.t > lead:
		return false
	if not reaches(B, A, m, lungeLeft(B) + 6.0):
		return false
	if A.invuln() or shielded(B, A, m):
		return false
	if m.def.evadeCrouch and A.isCrouching():
		return false
	if slipping(A) and slipDodges(m):
		return false
	return true

# ---------- 结算 ----------
func resolve(a: Fighter, b: Fighter) -> void:
	var ga := grabIntent(a, b)
	var gb := grabIntent(b, a)
	var sa := strikeIntent(a, b)
	var sb := strikeIntent(b, a)
	if sa == "dodge":
		dodged(a, b)
		sa = ""
	if sb == "dodge":
		dodged(b, a)
		sb = ""
	if sa == "slip":
		slippedBy(a, b)
		sa = ""
	if sb == "slip":
		slippedBy(b, a)
		sb = ""
	if ga == "duck" or ga == "whiff":
		grabMiss(a, b, ga)
		ga = ""
	if gb == "duck" or gb == "whiff":
		grabMiss(b, a, gb)
		gb = ""
	var holdy := func(g: String) -> bool: return g == "grab" or g == "tackle"
	if holdy.call(ga) and holdy.call(gb):
		tech(a, b)
		ga = ""
		gb = ""
	if ga == "catch" or ga == "scoop":
		sb = ""
	if gb == "catch" or gb == "scoop":
		sa = ""
	if sa != "" and holdy.call(gb):
		gb = ""
	if sb != "" and holdy.call(ga):
		ga = ""
	if sa != "" and sb != "":
		exchange(a, b)
	elif sa != "":
		strikeOn(a, b)
	elif sb != "":
		strikeOn(b, a)
	if ga != "" and a.state == "attack" and a.move != null and a.move.def.kind == "grab" and not a.move.done and not b.invuln():
		doGrab(a, b, ga)
	if gb != "" and b.state == "attack" and b.move != null and b.move.def.kind == "grab" and not b.move.done and not a.invuln():
		doGrab(b, a, gb)
	for pair in [[a, b], [b, a]]:
		var A: Fighter = pair[0]
		var B: Fighter = pair[1]
		if A.comboLive and not (B.state == "hit" or B.state == "down" or B.state == "ko" or B.state == "blockstun"):
			A.comboLive = false
		if B.state == "down" and B.downPhase != "fall":
			A.comboLive = false

## 两边的招同时到：克 / 压 / 平。空中的腿撞上地上的腿 = 空中那个被顶得翻滚回去
func exchange(A: Fighter, B: Fighter) -> void:
	A.holdPose = true
	B.holdPose = true
	if airKick(A) and groundKick(B):
		tumble(A, B)
		return
	if airKick(B) and groundKick(A):
		tumble(B, A)
		return
	var r := Moves.clashRelation(A, B)
	if r == 1.0:
		applyHit(A, B, "beat")
	elif r == -1.0:
		applyHit(B, A, "beat")
	elif r > 0.0:
		overpower(A, B)
	elif r < 0.0:
		overpower(B, A)
	else:
		clash(A, B)

func strikeOn(A: Fighter, B: Fighter) -> void:
	if A.move.def.push:
		if B.armored("push"):
			absorb(A, B)
		else:
			shoveHit(A, B)
		return
	if groundKick(A) and airKick(B):
		tumble(B, A)
		return
	if committed(B, A, C.TRADE_LEAD):
		exchange(A, B)
		return
	if readBeat(B, A):
		evade(A, B)
		return
	applyHit(A, B, "")

## 读招：B 的招主系克制 A 的招，B 已经起势 → A 这一下被化解打空，B 的招照常打出并算克制
func readBeat(B: Fighter, A: Fighter) -> bool:
	var m := B.move
	var ta := A.move.def.tier
	if B.state != "attack" or m == null or m.done or m.def.scripted or m.t < 3.0 or m.t >= m.S + 1.0:
		return false
	if Moves.beats(m.def.tier, ta) <= 0 or (m.def.has_armor and m.def.armor_vs.has(ta)):
		return false
	return committed(B, A, C.BEAT_LEAD)

func evade(A: Fighter, B: Fighter) -> void:
	A.move.done = true
	A.move.evaded = true
	B.move.beatVs = A.move.def.tier
	sim.ev.fx("evade", B.idx, A.idx)
	sim.ev.tag("化解", B.idx, 20, B.idx, "head", -40)
	B.info = {"label": B.move.def.label, "dmg": 0, "how": "化解", "why": Moves.TIER_NAME.get(B.move.def.tier, "") + "克" + Moves.TIER_NAME.get(A.move.def.tier, ""), "adv": null, "t": B.clock}
	cev("evade", A, B, {"name": A.move.name, "by": B.move.name})
	sim.ev.snd("whoosh", 0.6)

func applyHit(A: Fighter, B: Fighter, how: String) -> void:
	var m := A.move
	var d := m.def
	var dir := A.facing
	m.done = true
	B.holdPose = true
	var bm: MoveState = B.move if (B.state == "attack" and B.move != null and not B.move.def.scripted) else null
	var inStartup := bm != null and bm.t < bm.S + 1.0
	var front := B.facingTo(A)
	if B.isBlocking() and front and B.parryReady():
		parry(A, B)
		return
	if B.isBlocking() and front and B.blockHeightOK(d.height):
		guard(A, B)
		return
	if how == "" and B.armored(d.tier):
		absorb(A, B)
		return

	var label := ""
	var mul := C.AIR_BONUS if m.air else 1.0
	var beatVs := ""
	if how == "beat" and bm != null:
		beatVs = bm.def.tier
	elif m.beatVs != "":
		beatVs = m.beatVs
	elif inStartup and Moves.beats(d.tier, bm.def.tier) > 0:
		beatVs = bm.def.tier
	# 迎击：打在全速跑过来、或冲刺收尾的人身上
	var charging := (B.state == "run" and B.runT >= C.RUN_CHARGE) or (B.state == "attack" and B.move != null and B.move.name == "dash")
	# 防守反击：挡后反击、破绽、卸力反击
	var inRecovery := bm != null and bm.t >= bm.S + bm.def.A + 1.0
	var punish_l := ""
	var punish_m := 0.0
	if inRecovery and A.guardOn == bm.serial:
		punish_l = "挡后反击"
		punish_m = C.PUNISH_KD_MUL if bm.def.launch != 0.0 else C.PUNISH_MUL
	elif inRecovery and bm.def.launch != 0.0 and not bm.hit:
		punish_l = "破绽"
		punish_m = C.WHIFF_KD_MUL
	elif B.state == "hit" and B.reel and B.reelBy == A.idx:
		punish_l = "卸力反击"
		punish_m = C.PUNISH_KD_MUL if B.reelKD else C.PARRY_MUL
	var lmul := 1.0
	var caughtSlip := B.state == "attack" and B.move != null and B.move.name == "slip"
	if d.stagger:
		pass                     # 回身肘：不另算加成
	elif beatVs != "":
		label = Moves.TIER_NAME.get(d.tier, "") + "克" + Moves.TIER_NAME.get(beatVs, "")
		lmul = C.BEAT_MUL
	elif inStartup:
		label = "破招"
		lmul = C.COUNTER_MUL
	elif punish_l != "":
		label = punish_l
		lmul = punish_m
		A.stats.punishes += 1
	elif caughtSlip:
		label = "截住闪身"
		lmul = C.SLIP_CAUGHT_MUL
	elif charging:
		label = "迎击"
		lmul = C.COUNTER_MUL
	# 空中交手：空中出招被克制它的招打中 = 倒栽葱；千斤坠被站着的拳打中再 ×1.4
	var wasAir := B.airborne()
	var crash := wasAir and bm != null and bm.air and Moves.beats(d.tier, bm.def.tier) > 0
	var punchDive := crash and bm.def.dive and not m.air and (d.kind == "jab" or d.kind == "heavy") and (d.limb == "fh" or d.limb == "bh" or d.limb == "fe")
	var diveKD := false
	if crash:
		label = CRASH_NAME
		lmul = C.DIVE_PUNCH_MUL if punchDive else maxf(lmul, C.BEAT_MUL)
	elif d.dive and bm != null and bm.def.tier == "aa":
		label = "踩断对空"
		lmul = C.DIVE_AA_MUL
		diveKD = true
	elif d.dive and lowProfile(B):
		label = "踩蹲"
		lmul = C.DIVE_CROUCH_MUL
	mul *= lmul
	if m.dashIn:
		mul *= C.DASH_IN_MUL
	var n := B.comboTaken
	mul *= maxf(C.DMG_FLOOR, 1.0 - C.DMG_DECAY * n)
	var dmg := maxf(1.0, C.jsround(d.dmg * mul))
	var wrongGuard := B.isBlocking() and front
	var backHit := B.isBlocking() and not front
	# 拳打在正在出腿（单脚站着）的人身上 → 失衡倒地
	var offBalance := bm != null and d.tier == "light" and bm.def.tier == "kick" and not bm.air and bm.t >= 4.0 and bm.t < bm.S + bm.def.A + 1.0
	var rising := B.state == "rise"

	B.hp -= dmg
	m.hit = true
	A.stats.hits += 1
	if d.tier == "super":
		A.stats.supers += 1
	bumpCombo(A, B)
	B.comboTaken = n + 1
	A.gainQi(dmg * 0.4 * C.QI_PER_HP)
	B.gainQi(dmg * 0.9 * C.QI_PER_HP)
	B.reel = false; B.clashed = false; B.grabbed = false; B.stagger = false
	if B.hp <= 0.0:
		B.hp = 0.0
		B.knockDown(5.0, dir * (d.kb * 0.6 + 2.0), 40.0, true)
	elif crash:
		var lz := 2.5 if punchDive else (d.launch if d.launch != 0.0 else (d.launchAir if d.launchAir != 0.0 else 4.0))
		B.knockDown(lz, dir * (d.kb * 0.6 + 2.5), C.LIE_CRASH, false)
	elif offBalance:
		B.knockDown(3.5, dir * 2.5, C.LIE_HIT - 4.0, false)
	elif d.launch != 0.0 or (d.launchAir != 0.0 and wasAir) or diveKD:
		var lz := d.launch if d.launch != 0.0 else (d.launchAir if d.launchAir != 0.0 else 3.0)
		B.knockDown(lz, dir * (d.kb * 0.6 + 2.0), d.lie if d.lie != 0.0 else C.LIE_HIT, false)
	elif d.stagger:
		# 回身肘打在背上：他被打得背对着你、往前踉跄（强制背对，这几帧不自动转身），打得中、动不了
		B.state = "hit"; B.stunT = C.STAGGER; B.stagger = true; B.hurtHeavy = true; B.facing = dir
		B.kvx = dir * d.kb
		if wasAir:
			B.vz = maxf(B.vz, 2.5)
			B.vx = 0.0
		B.move = null; B.chain = []; B.chainIdle = 99.0; B.runT = 0.0
	else:
		var bonusStun := C.PUNISH_STUN if (punish_l != "" and label == punish_l) else (C.SLIP_CAUGHT_STUN if label == "截住闪身" else 0.0)
		B.state = "hit"
		B.stunT = maxf(C.STUN_FLOOR, d.stun - C.STUN_DECAY * n) + (C.AIR_STUN if m.air else 0.0) + bonusStun
		B.hurtHeavy = d.heavy or d.kind == "kick"
		B.kvx = dir * d.kb * (1.0 + C.KB_GROW * n)
		if wasAir:
			B.vz = maxf(B.vz, 2.5)
			B.vx = 0.0
		B.move = null; B.chain = []; B.chainIdle = 99.0; B.runT = 0.0
	if d.dive:
		# 千斤坠踩中：顺着这一脚落下来、落在对手面前；没踩倒的话这一下算「腿起手」
		var fall := 0
		var z := A.alt
		var vzz := -C.DIVE_RIDE
		while z > 0.0 and fall < 60:
			z += vzz
			vzz -= C.GRAV
			fall += 1
		A.vz = -C.DIVE_RIDE
		A.vx = -dir * clampf((C.DIVE_LAND_GAP - (B.x - A.x) * dir) / maxf(1.0, float(fall)), 0.8, 4.0)
		if B.state == "hit":
			A.chain = ["kick"]
			A.chainIdle = 0.0
	if crash:
		sim.ev.fx("crash", A.idx, B.idx)
		sim.ev.snd("crash")
	if atWall(B):
		A.kvx = -dir * d.kb * 0.7
	sim.freeze = stopF((d.stop if d.stop != 0.0 else 4.0) + (2.0 if label != "" else 0.0))
	if d.shake != 0.0:
		sim.ev.shake(d.shake)
	sim.ev.fx("hit", A.idx, B.idx, {"fxk": d.fx, "limb": d.limb, "power": d.power, "heavy": d.heavy, "big": d.launch != 0.0 or d.tier == "super"})
	var relLabel: bool = beatVs != "" and label == Moves.TIER_NAME.get(d.tier, "") + "克" + Moves.TIER_NAME.get(beatVs, "")
	if label != "" and not relLabel:
		sim.ev.tag(label + " ×" + _num(lmul), A.idx, 21, B.idx, "head", -36, dir * 10.0)
	if m.dashIn:
		sim.ev.tag("冲势 ×" + _num(C.DASH_IN_MUL), A.idx, 20, A.idx, "head", -60)
	var notes: Array = []
	if label != "":
		notes.append(label)
	if m.dashIn:
		notes.append("冲势")
	note(A, B, dmg, " · ".join(notes) if notes.size() > 0 else "打中")
	cev("hit", A, B, {"name": m.name, "how": A.info.how, "dmg": dmg, "tier": d.tier, "height": d.height, "air": m.air, "crash": crash, "offBalance": offBalance,
		"rising": rising, "back": backHit, "wrong": wrongGuard, "bMove": bm.name if bm != null else "", "bStartup": inStartup, "bState": B.state})
	if backHit:
		A.info.why = "打在背后，挡不住"
	elif wrongGuard:
		A.info.why = "下段：站着挡不住" if d.height == "low" else "上段：蹲着挡不住"
	elif rising:
		A.info.why = "打在起身硬直里：刚站起来，还挡不了"
	elif label == "截住闪身":
		A.info.why = "闪身只躲得过重拳"
	elif d.stagger and B.stagger:
		A.info.why = "闪身躲过重拳，回身一肘打在背上：他背对着你踉跄、动不了，你先动"
	if offBalance:
		sim.ev.tag("失衡", A.idx, 24, B.idx, "head", -62)
	sim.ev.tag("-" + _num(dmg), A.idx, 18, B.idx, "contact", -14, dir * 10.0)
	if d.stamp != "":
		sim.ev.stamp(d.stamp, 30, A.idx)
		A.stats.specials += 1
	elif d.rush and not A.rushStamped:
		A.rushStamped = true
		sim.ev.stamp("连珠快拳", 26, A.idx)
		A.stats.specials += 1
	elif d.tag != "":
		sim.ev.tag(d.tag, A.idx, 18, A.idx, "head", -38, -dir * 10.0)
	sim.ev.snd("hit", d.power if d.power != 0.0 else 0.4)

func guard(A: Fighter, B: Fighter) -> void:
	var m := A.move
	var d := m.def
	var dir := A.facing
	var chip := maxf(1.0, C.jsround(d.dmg * (C.AIR_BONUS if m.air else 1.0) * C.BLOCK_KEEP))
	B.hp = maxf(1.0, B.hp - chip)
	var kd := d.launch != 0.0
	var light := d.tier == "light" or d.kind == "push"
	B.state = "blockstun"
	B.stunT = d.bstun + (C.DASH_IN_BSTUN if m.dashIn else 0.0)
	B.kvx = dir * d.kb * (0.5 if kd else (0.9 if light else 0.6))
	A.kvx = -dir * d.kb * (0.8 if atWall(B) else (0.2 if m.dashIn else (0.15 if kd else (0.4 if light else 0.3))))
	if not m.air and not d.scripted and not light:
		m.pen = C.BLOCK_PEN_KD if kd else C.BLOCK_PEN
	note(A, B, chip, "被挡")
	cev("guard", A, B, {"name": m.name, "height": d.height, "low": B.lowBlock})
	if m.dashIn:
		sim.ev.tag("冲势压制", A.idx, 18, A.idx, "head", -60)
	if d.dive:
		# 千斤坠被站挡住：往后翻着弹开，照翻滚回去的速度飞；招拉到落地才完；挡的人照旧比它早 DIVE_BLOCK_ADV 帧能动
		if A.alt <= 0.0:
			A.alt = 0.01
		A.vz = C.TUMBLE_VZ
		A.vx = -dir * C.TUMBLE_VX
		A.kvx = 0.0
		var fly := tumbleFly(A.alt, C.TUMBLE_VZ)
		m.bFly = fly
		m.pen = C.grid(maxf(0.0, m.t + fly + 2.0 - (m.S + d.A + d.R)))
		B.stunT = maxf(B.stunT, C.grid(fly + C.TA(7) - C.DIVE_BLOCK_ADV))
	m.blocked = true
	B.stats.blocks += 1
	B.guardOn = m.serial
	B.stompFor = m.serial if (d.height == "low" and d.kind == "kick" and not m.air and B.lowBlock) else -1
	B.gainQi(chip * C.QI_PER_HP + 2.0)
	A.gainQi(1.0)
	if A.slowJab <= 0.0:
		sim.ev.tag("势破", B.idx, 20, A.idx, "head", -34)
	A.slowJab = C.SLOW_JAB_FRAMES
	sim.freeze = stopF(3.0)
	sim.ev.fx("guard", A.idx, B.idx, {"low": B.lowBlock})
	sim.ev.tag([["挡 ", B.idx], ["-" + _num(chip), A.idx]], B.idx, 17, B.idx, "head", -22)
	sim.ev.snd("block")

## 卸力：刚按下格挡就被打中。不掉血，对方失衡，自己马上能出招
func parry(A: Fighter, B: Fighter) -> void:
	var dir := A.facing
	var kd := A.move.def.launch != 0.0
	A.move.done = true
	A.state = "hit"; A.stunT = C.PARRY_STUN + (C.TF(6) if kd else 0.0); A.reel = true; A.clashed = false; A.stagger = false; A.hurtHeavy = false; A.grabbed = false
	A.reelBy = B.idx; A.reelKD = kd
	A.move = null; A.chain = []; A.chainIdle = 99.0; A.runT = 0.0; A.comboLive = false
	A.kvx = -dir * 3.0
	if A.airborne():
		A.vz = maxf(A.vz, 3.0)
		A.vx = 0.0
	B.state = "parry"; B.t = 0.0; B.stunT = 0.0; B.parryOK = false; B.kvx = 0.0
	A.info = {"label": "被卸力", "dmg": 0, "how": "失衡", "adv": -C.PARRY_STUN, "t": A.clock}
	B.gainQi(10.0)
	B.stats.parries += 1
	cev("parry", A, B, {"name": A.info.label})
	sim.freeze = stopF(9.0)
	sim.ev.shake(4)
	sim.ev.fx("parry", B.idx, A.idx)
	sim.ev.tag("卸", B.idx, 34, B.idx, "head", -40)
	sim.ev.tag("失衡", B.idx, 20, A.idx, "head", -30)
	sim.ev.snd("parry")

## 霸体：重招前摇里硬吃一记，只掉一半血，招不停
func absorb(A: Fighter, B: Fighter) -> void:
	var m := A.move
	var d := m.def
	var dir := A.facing
	m.done = true
	m.absorbed = true
	var dmg := maxf(1.0, C.jsround(d.dmg * (C.AIR_BONUS if m.air else 1.0) * C.ARMOR_KEEP)) if d.dmg > 0.0 else 0.0
	B.hp -= dmg
	B.move.armorLeft -= 1
	B.gainQi(dmg * C.QI_PER_HP)
	cev("absorb", A, B, {"name": m.name, "by": B.move.name})
	if B.move.def.tier != "super":
		B.move.beatVs = d.tier
	A.info = {"label": d.label, "dmg": 0, "how": "被霸体吃了", "adv": null, "t": A.clock}
	A.kvx = -dir * 1.5
	if B.hp <= 0.0:
		B.hp = 0.0
		B.knockDown(4.0, dir * 3.0, 999.0, true)
	sim.freeze = stopF(4.0)
	sim.ev.fx("absorb", A.idx, B.idx)
	sim.ev.tag("霸体", B.idx, 22, B.idx, "head", -40)
	if dmg != 0.0:
		sim.ev.tag("-" + _num(dmg), A.idx, 16, B.idx, "contact", -14)
	sim.ev.snd("hit", 0.3)

## 震退：拼招、压招共用
func recoil(F: Fighter, dmg: float, stun: float, kb: float) -> void:
	F.move = null; F.chain = []; F.chainIdle = 99.0; F.runT = 0.0; F.comboLive = false; F.grabbed = false; F.reel = false; F.stagger = false; F.hurtHeavy = false
	F.hp -= dmg
	F.state = "hit"; F.stunT = stun; F.clashed = true
	F.kvx = -F.facing * kb
	if F.airborne():
		F.vz = maxf(F.vz, 3.0)
		F.vx = 0.0
	if F.hp <= 0.0:
		F.hp = 0.0
		F.knockDown(4.0, -F.facing * 3.0, 999.0, true)

static func dmgOf(m: MoveState) -> float:
	return m.def.dmg * (C.AIR_BONUS if m.air else 1.0)

## 平（拼招）：两边各吃五成，互相震退
func clash(A: Fighter, B: Fighter) -> void:
	var ma := A.move
	var mb := B.move
	ma.done = true
	mb.done = true
	var dA := maxf(1.0, C.jsround(dmgOf(mb) * C.CLASH_KEEP))
	var dB := maxf(1.0, C.jsround(dmgOf(ma) * C.CLASH_KEEP))
	A.info = {"label": ma.def.label, "dmg": dB, "how": "拼招", "adv": 0, "t": A.clock}
	B.info = {"label": mb.def.label, "dmg": dA, "how": "拼招", "adv": 0, "t": B.clock}
	for pair in [[A, dA], [B, dB]]:
		var F: Fighter = pair[0]
		var dmg: float = pair[1]
		F.gainQi(dmg * 0.9 * C.QI_PER_HP + 3.0)
		F.stats.clashes += 1
		F.comboTaken = 0
		recoil(F, dmg, C.CLASH_STUN, C.CLASH_KB)
		sim.ev.tag("-" + _num(dmg), F.opp.idx, 17, F.idx, "head", -18)
	sim.freeze = stopF(10.0)
	sim.ev.shake(6)
	sim.ev.fx("clash", A.idx, B.idx)
	cev("clash", A, B, {"name": ma.name, "by": mb.name})
	sim.ev.tag("拼", [A.idx, B.idx], 40, -1, "clash", -56)
	sim.ev.snd("clash")

## 压：主系一样、起手克制。两边都打中，被压的 L 吃全额、被打退；压人的 W 只吃三成、小硬直，能接着打
func overpower(Wf: Fighter, L: Fighter) -> void:
	var mw := Wf.move
	var ml := L.move
	var dir := Wf.facing
	mw.done = true
	ml.done = true
	mw.hit = true
	var dL := maxf(1.0, C.jsround(dmgOf(mw)))
	var dW := maxf(1.0, C.jsround(dmgOf(ml) * C.PRESS_KEEP))
	var nameW := mw.def.label
	var nameL := ml.def.label
	var leadW := mw.def.lead
	var leadL := ml.def.lead
	var mwdef := mw.def
	Wf.gainQi(dW * 0.9 * C.QI_PER_HP + 3.0)
	L.gainQi(dL * 0.9 * C.QI_PER_HP)
	Wf.stats.presses += 1
	Wf.stats.hits += 1
	if mwdef.tier == "super":
		Wf.stats.supers += 1
	recoil(Wf, dW, C.PRESS_STUN, 3.0)
	bumpCombo(Wf, L)
	recoil(L, dL, maxf(C.STUN_FLOOR, mwdef.stun), mwdef.kb * 1.2 + 3.0)
	Wf.info = {"label": nameW, "dmg": dL, "how": "压 " + nameL, "adv": L.stunT - C.PRESS_STUN, "t": Wf.clock}
	Wf.comboDmg = dL
	Wf.maxComboDmg = maxf(Wf.maxComboDmg, dL)
	L.info = {"label": nameL, "dmg": dW, "how": "被压", "adv": C.PRESS_STUN - L.stunT, "t": L.clock}
	L.clashed = false
	L.hurtHeavy = true
	L.kvx = dir * (mwdef.kb * 1.2 + 3.0)
	sim.freeze = stopF(10.0)
	sim.ev.shake(6)
	sim.ev.fx("press", Wf.idx, L.idx, {"fxk": mwdef.fx, "limb": mwdef.limb})
	sim.ev.tag("压", Wf.idx, 36, L.idx, "contact", -56)
	cev("press", Wf, L, {"name": mw.name, "by": ml.name})
	Wf.info.why = "起手 %s克%s" % [Moves.TIER_NAME.get(leadW, ""), Moves.TIER_NAME.get(leadL, "")]
	L.info.why = "起手 %s被%s克" % [Moves.TIER_NAME.get(leadL, ""), Moves.TIER_NAME.get(leadW, "")]
	sim.ev.tag("-" + _num(dL), Wf.idx, 18, L.idx, "head", -14)
	sim.ev.tag("-" + _num(dW), L.idx, 15, Wf.idx, "head", -14)
	sim.ev.snd("clash")
	sim.ev.snd("hit", 0.7)

## 翻滚回去（1.9.0 / 2.7）：空中的腿撞上地上的腿 —— 空中那个吃一半伤害、往后翻着飞回去；地上那个人这一腿收招拉长到同时能动
func tumble(A: Fighter, B: Fighter) -> void:
	var ma := A.move
	var mb := B.move
	var away := 1 if A.x >= B.x else -1
	ma.done = true
	mb.done = true
	mb.hit = true
	var dmg := maxf(1.0, C.jsround(mb.def.dmg * C.TUMBLE_KEEP))
	A.hp -= dmg
	B.stats.hits += 1
	A.gainQi(dmg * 0.9 * C.QI_PER_HP)
	B.gainQi(dmg * 0.4 * C.QI_PER_HP + 2.0)
	A.move = null; A.chain = []; A.chainIdle = 99.0; A.comboLive = false; A.comboTaken = 0; A.reel = false; A.clashed = false; A.stagger = false; A.grabbed = false; A.runT = 0.0
	A.facing = -away
	if A.hp <= 0.0:
		A.hp = 0.0
		A.knockDown(4.0, away * 4.0, 999.0, true)
	else:
		A.state = "tumble"; A.t = 0.0; A.vz = C.TUMBLE_VZ; A.vx = away * C.TUMBLE_VX; A.kvx = 0.0; A.airUsed = true
		if A.alt <= 0.0:
			A.alt = 0.01
		A.tumFly = tumbleFly(A.alt, C.TUMBLE_VZ)
		var left := mb.S + mb.def.A + mb.def.R + mb.pen - mb.t
		var want := A.tumFly + C.TUMBLE_LAND
		if want > left:
			mb.pen = mb.pen + C.grid(want - left)
		mb.tumbled = true
	B.kvx = -away * 3.0
	A.info = {"label": ma.def.label, "dmg": 0, "how": "被顶回去", "adv": null, "t": A.clock}
	B.info = {"label": mb.def.label, "dmg": dmg, "how": "顶回去", "adv": null, "t": B.clock}
	sim.freeze = stopF(7.0)
	sim.ev.shake(5)
	sim.ev.fx("tumble", B.idx, A.idx)
	sim.ev.snd("tumble")
	cev("tumble", B, A, {"name": mb.name, "by": ma.name})
	sim.ev.tag("翻", B.idx, 34, A.idx, "head", -34)
	sim.ev.tag("-" + _num(dmg), B.idx, 17, A.idx, "contact", -14)
	sim.ev.snd("clash")
	sim.ev.snd("hit", 0.5)

## 2.7 翻回去要飞多久（帧）：照 update 里的重力一步一步算
static func tumbleFly(alt0: float, vz0: float) -> float:
	var a := alt0
	var v := vz0
	var n := 0
	while a > 0.0 and n < 4000:
		a += v * C.DT + C.GRAV * C.GH
		v -= C.GRAV * C.DT
		n += 1
	return n * C.DT

## 推挡：没伤害，把对方推开并打断
func shoveHit(A: Fighter, B: Fighter) -> void:
	var m := A.move
	var dir := A.facing
	m.done = true
	m.hit = true
	B.holdPose = true
	B.kvx = dir * C.PUSH_KB
	if B.isBlocking() and B.facingTo(A):
		B.state = "blockstun"
		B.stunT = 8.0
	else:
		B.state = "hit"; B.stunT = C.PUSH_STUN; B.reel = true; B.clashed = false; B.stagger = false; B.hurtHeavy = false; B.grabbed = false
		B.move = null; B.chain = []; B.chainIdle = 99.0; B.runT = 0.0
	if B.airborne():
		B.vz = maxf(B.vz, 2.0)
		B.vx = 0.0
	if atWall(B):
		A.kvx = -dir * C.PUSH_KB * 0.6
	sim.freeze = stopF(4.0)
	sim.ev.fx("shove", A.idx, B.idx)
	cev("shove", A, B, {})
	sim.ev.tag("推开", A.idx, 22, B.idx, "head", -30)
	sim.ev.snd("block")

## 擒拿抓空（对方蹲着躲开 / 抄腿抄不到站着的）
func grabMiss(A: Fighter, B: Fighter, why: String) -> void:
	var m := A.move
	if m.missTag:
		return
	m.missTag = true
	if why == "duck":
		sim.ev.tag("蹲身闪过", B.idx, 22, B.idx, "head", -30)
	A.info = {"label": m.def.label, "dmg": 0, "how": "抓空", "why": "站着的擒拿抓不到蹲着的（要蹲 + 拿）" if why == "duck" else "抄腿抓不到站着的", "adv": null, "t": A.clock}
	cev("grabMiss", A, B, {"name": m.name, "why": why})

func dodged(A: Fighter, B: Fighter) -> void:
	var m := A.move
	if not m.dodged:
		m.dodged = true
		sim.ev.tag("闪", B.idx, 26, B.idx, "head", -30)
		cev("dodge", A, B, {"name": m.name})

## 闪身躲过一下（只躲得过重拳）：这一下打空；钻过去的人记一笔 —— 钻到他身后自动回身一肘
func slippedBy(A: Fighter, B: Fighter) -> void:
	var m := A.move
	m.done = true
	m.slipped = true
	B.slipGot = true
	B.move.evaded = true
	sim.ev.fx("slipDodge", B.idx, A.idx)
	cev("slip", A, B, {"name": m.name})
	sim.ev.tag("闪", B.idx, 30, B.idx, "head", -34)
	B.info = {"label": "闪身", "dmg": 0, "how": "闪过", "why": "闪身躲过了重拳，钻到他身后接着回身一肘", "adv": null, "t": B.clock}
	A.info = {"label": m.def.label, "dmg": 0, "how": "被闪过", "why": "对面在闪身：重拳打不中，换短拳、腿、下段、擒拿截它", "adv": null, "t": A.clock}
	sim.ev.snd("whoosh", 0.8)

## 同时擒拿 = 拆（平手）
func tech(a: Fighter, b: Fighter) -> void:
	a.move.done = true
	b.move.done = true
	a.kvx = -a.facing * 6.0
	b.kvx = -b.facing * 6.0
	sim.ev.tag("拆", [a.idx, b.idx], 30, -1, "mid", -150)
	sim.ev.snd("block")
	sim.freeze = stopF(6.0)
	cev("tech", a, b, {})

func doGrab(A: Fighter, B: Fighter, type: String) -> void:
	cev("grab", A, B, {"kind": type, "name": A.move.name, "bMove": B.move.name if (B.state == "attack" and B.move != null) else "", "bState": B.state})
	A.move.done = true
	A.move.hit = true
	var dir := A.facing
	B.reel = false; B.clashed = false; B.stagger = false
	if type == "catch" or type == "scoop":
		# 接腿摔 / 抄腿摔：马上摔倒，挣不脱
		var scoop := type == "scoop"
		var wasSweep := B.move != null and B.move.def.height == "low"
		var airK := not scoop and (B.airborne() or (B.move != null and B.move.air))
		var dmg := C.SCOOP_DMG if scoop else (C.CATCH_AIR_DMG if airK else C.CATCH_DMG)
		B.hp -= dmg
		A.stats.hits += 1
		A.stats.specials += 1
		A.gainQi(dmg * 0.4 * C.QI_PER_HP)
		B.gainQi(dmg * 0.9 * C.QI_PER_HP)
		B.knockDown(3.5 if airK else (4.5 if scoop else 5.0), dir * (1.0 if scoop else 1.6), C.LIE_AIR if airK else C.LIE_GROUND, B.hp <= 0.0)
		A.startScript("scoop" if scoop else "legCatch")
		sim.freeze = stopF(10.0)
		sim.ev.shake(6)
		sim.ev.fx("legCatch", A.idx, B.idx)
		sim.ev.stamp("抄腿摔" if scoop else "接腿摔", 30, A.idx)
		var t2 := ("扫堂腿被抄" if wasSweep else "腿被抄住") if scoop else ("腿被接 · 久倒" if airK else "倒地")
		sim.ev.tag(t2, A.idx, 18, B.idx, "head", -30)
		sim.ev.tag("-" + _num(dmg), A.idx, 18, B.idx, "head", 4, dir * 16.0)
		sim.ev.snd("hit", 0.7)
		bumpCombo(A, B)
		noteGrab(A, dmg, "抄腿摔" if scoop else "接腿摔")
	else:
		# 擒住：对手被揪住，后续看擒住期间按什么（fighter attackStep 'hold'）
		var pk := A.move.pick
		B.state = "hit"; B.stunT = 90.0; B.hurtHeavy = false; B.grabbed = true; B.heldAt = B.clock; B.move = null; B.chain = []; B.chainIdle = 99.0
		B.kvx = 0.0; B.runT = 0.0; B.lowBlock = false; B.comboLive = false
		A.startScript("hold")
		A.move.holdKind = type
		A.move.pick = "tackle" if type == "tackle" else pk
		sim.freeze = stopF(5.0)
		sim.ev.fx("grab", A.idx, B.idx)
		sim.ev.tag("抄腿" if type == "tackle" else "擒住", A.idx, 20, B.idx, "head", -26)
		sim.ev.snd("hit", 0.3)
	if B.hp <= 0.0:
		B.hp = 0.0
		if B.state != "ko":
			B.knockDown(4.0, dir * 3.0, 999.0, true)

## 挣脱：被擒住的人及时按「拿」—— 两边一起被弹开，谁也不吃亏
func escapeGrab(A: Fighter, B: Fighter) -> void:
	var dir := A.facing
	for pair in [[A, -1.0], [B, 1.0]]:
		var F: Fighter = pair[0]
		var s: float = pair[1]
		F.move = null; F.state = "hit"; F.stunT = C.TF(10); F.clashed = true; F.reel = false; F.stagger = false; F.grabbed = false; F.carried = false; F.hurtHeavy = false
		F.chain = []; F.chainIdle = 99.0; F.runT = 0.0; F.comboLive = false; F.kvx = dir * s * 7.0
	B.stats.escapes += 1
	B.info = {"label": "挣脱", "dmg": 0, "how": "挣脱", "adv": 0, "t": B.clock}
	A.info = {"label": "擒拿", "dmg": 0, "how": "被挣脱", "adv": 0, "t": A.clock}
	cev("escape", B, A, {})
	sim.freeze = stopF(6.0)
	sim.ev.fx("escape", B.idx, A.idx)
	sim.ev.tag("挣脱", B.idx, 30, -1, "mid", -160)
	sim.ev.snd("block")

## 被擒住的人身上的一下（推开 / 提膝 / 摔）：扣血、记连击、面板
func grabDamage(A: Fighter, B: Fighter, dmg: float, label: String, big: bool) -> void:
	B.hp -= dmg
	A.stats.hits += 1
	if big:
		A.stats.specials += 1
	A.gainQi(dmg * 0.4 * C.QI_PER_HP)
	B.gainQi(dmg * 0.9 * C.QI_PER_HP)
	bumpCombo(A, B)
	noteGrab(A, dmg, label)
	sim.ev.tag("-" + _num(dmg), A.idx, 18, B.idx, "head", 4, A.facing * 16.0)

## 推开（擒住后什么都不按）：把人推出去，自己先动一点
func grabPush(A: Fighter, B: Fighter, left: float) -> void:
	grabDamage(A, B, A.moves().grab.dmg, "擒拿 · 推开", false)
	B.grabbed = false
	B.stunT = left + C.TA(4)
	B.kvx = A.facing * 8.0
	B.hurtHeavy = false
	sim.freeze = stopF(4.0)
	sim.ev.fx("grabPush", A.idx, B.idx)
	sim.ev.snd("hit", 0.4)
	if B.hp <= 0.0:
		B.hp = 0.0
		B.knockDown(4.0, A.facing * 3.0, 999.0, true)

## 提膝撞：顶两下，第二下放开，对方还在硬直里 —— 你先动 KNEE_ADV 帧
func kneeHit(A: Fighter, B: Fighter, second: bool, left: float) -> void:
	grabDamage(A, B, C.KNEE_DMG[1 if second else 0], "提膝撞", second)
	sim.freeze = stopF(6.0 if second else 4.0)
	sim.ev.shake(4 if second else 2)
	sim.ev.fx("knee", A.idx, B.idx, {"second": second})
	if second:
		B.grabbed = false
		B.stunT = left + C.KNEE_ADV
		B.kvx = A.facing * 5.0
		B.hurtHeavy = true
		sim.ev.stamp("提膝撞", 26, A.idx)
	sim.ev.snd("hit", 0.7 if second else 0.45)
	if B.hp <= 0.0:
		B.hp = 0.0
		B.knockDown(4.0, A.facing * 3.0, 999.0, true)

## 别腿摔 / 抱腿摔：把人摔在面前（倒得近，起身由你压）
func slamDown(A: Fighter, B: Fighter, nm: String) -> void:
	var trip := nm == "trip"
	var dmg := C.TRIP_DMG if trip else C.TACKLE_DMG
	grabDamage(A, B, dmg, "别腿摔" if trip else "抱腿摔", true)
	B.knockDown(-1.5 if trip else -2.5, A.facing * (2.5 if trip else 4.0), C.TFH(36 if trip else 34), B.hp <= 0.0)
	B.slam = true
	if B.hp <= 0.0:
		B.hp = 0.0
	sim.freeze = stopF(8.0)
	sim.ev.shake(7)
	sim.ev.fx("slamFloor", B.idx, -1, {"big": true, "n": 9})
	sim.ev.stamp("别腿摔" if trip else "抱腿摔", 28, A.idx)
	sim.ev.snd("hit", 0.9)

func bumpCombo(A: Fighter, B: Fighter) -> void:
	var inStun := B.state == "hit" or B.state == "down" or B.state == "ko" or B.freeAt == B.clock
	if not (A.comboLive and inStun) and A.combo >= 1:
		A.prevCombo = {"hits": A.combo, "dmg": A.comboDmg}
	A.combo = A.combo + 1 if (A.comboLive and inStun) else 1
	A.comboLive = true
	if A.combo >= 2:
		A.comboT = 90.0
	A.stats.maxCombo = maxi(A.stats.maxCombo, A.combo)
	sim.ev.fx("combo", A.idx, B.idx, {"n": A.combo})

## 推挤：软碰撞。身体重叠时每步最多推开 SOFT_PUSH·DT，跑着能挤过去、换到对面
func separate(a: Fighter, b: Fighter) -> void:
	if a.carried or b.carried:
		return
	var d := b.x - a.x
	var ad := absf(d)
	var mn := C.PUSH * 2.0
	var maxD := C.MAXD_PVP if (sim.mode == "pvp" or sim.mode == "attract") else INF
	if ad > maxD:
		var s := 1.0 if d > 0.0 else -1.0
		var ex := (ad - maxD) / 2.0
		a.x += s * ex
		b.x -= s * ex
		return
	if (a.state == "down" and a.downPhase == "getup" and a.rollDir != 0) or (b.state == "down" and b.downPhase == "getup" and b.rollDir != 0):
		return
	var dashing := func(F: Fighter) -> bool: return F.state == "attack" and F.move != null and (F.move.name == "dash" or F.move.name == "slip")
	if ad >= mn or a.airborne() or b.airborne() or dashing.call(a) or dashing.call(b):
		return
	var pushv := minf((mn - ad) / 2.0, C.SOFT_PUSH * C.DT)
	var s := 1.0 if d > 0.0 else (-1.0 if d < 0.0 else (1.0 if a.facing > 0 else -1.0))
	a.x -= s * pushv
	b.x += s * pushv
	a.x = clampf(a.x, C.WALL_L, C.WALL_R)
	b.x = clampf(b.x, C.WALL_L, C.WALL_R)

## 数字写成 JS 那样（整数不带 .0）
static func _num(v: float) -> String:
	if v == floorf(v):
		return str(int(v))
	return str(v)
