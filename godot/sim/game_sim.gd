class_name GameSim
extends RefCounted
## 游戏流程（对照 JS src/js/game.js）：两个角色、回合（开场 → 对战 → KO 慢动作 → 回合结算 → 整场结束）、每一步 simTick(inputs)。
## simTick 只吃「两个整数输入」：同样的输入序列一定算出同样的结果（联机回滚、测试都靠这一点）。
## 画面上的东西不在这里：每走一步调 on_visual_step（画面层的动画、特效计时），回滚重算（quiet）时不调。

var ev := SimEvents.new()
var combat: Combat
var p: Array = []                 # [F1, F2]
var brains: Array = [null, null]  # 电脑 / 木桩（有就不用输入）
var mode := "attract"             # attract（菜单背景电脑互打）| pve | pvp | online | train
var phase := "attract"            # attract | intro | fight | ko | roundEnd | over
var diff := "normal"
var frame := 0                    # 走了几步（一步 = DT 帧）
var freeze := 0.0                 # 顿帧还剩几帧
var timeScale := 1.0
var round_n := 1
var wins := [0, 0]
var timer := C.ROUND_FRAMES
var phaseT := 0.0
var paused := false
var winner := -1
var endless := false
var dummyMode := "stand"
var trainQi := false
var reduce_motion := false

## 画面层接的回调
var on_visual_step: Callable      # (frozen: bool) 每一步（不在回滚重算里）
var on_match_over: Callable       # 整场打完
var local_win_fn: Callable        # (winner) -> bool：整场打完放哪段声音（不接就用 localWin）
var online_host := false          # 联机时自己是不是房主（玩家一）

const START_X := [800.0 - 180.0, 800.0 + 180.0]

func _init() -> void:
	combat = Combat.new(self)
	ev.frame_fn = func() -> int: return frame
	var F1 := Fighter.new(0, "ink", START_X[0], 1)
	var F2 := Fighter.new(1, "indigo", START_X[1], -1)
	F1.sim = self
	F2.sim = self
	F1.opp = F2
	F2.opp = F1
	p = [F1, F2]

func resetFighters() -> void:
	p[0].reset(START_X[0], 1)
	p[1].reset(START_X[1], -1)
	freeze = 0.0
	timeScale = 1.0
	if not ev.quiet:
		ev.fx("reset", -1)

func startAttract(b0, b1) -> void:
	mode = "attract"; phase = "attract"; phaseT = 0.0; paused = false; endless = false
	brains = [b0, b1]
	p[0].label = ""; p[1].label = ""; p[1].maxHp = C.MAX_HP
	resetFighters()

## brain0 / brain1：电脑（AI）或木桩；null = 用输入
func startMatch(m: String, brain0, brain1) -> void:
	mode = m
	endless = m == "pvp" or m == "train"
	var train := m == "train"
	p[1].maxHp = C.DUMMY_HP if train else C.MAX_HP
	brains = [brain0, brain1]
	wins = [0, 0]; round_n = 1; paused = false; frame = 0
	ev.online = m == "online"
	ev.clear_log()
	startRound()
	if train:
		phase = "fight"     # 训练场进去直接开始，不要开场字
	ev.fx("matchStart", -1)

func startRound() -> void:
	resetFighters()
	phase = "intro"; phaseT = 0.0; timer = C.ROUND_FRAMES; winner = -1
	ev.fx("roundStart", -1)

func endRound(w: int, reason: String) -> void:
	phase = "ko"; phaseT = 0.0; winner = w
	if reason == "time":
		ev.announce("时间到", "", 80, 110)
	elif w == -1:
		ev.announce("两败俱伤", "", 80, 100)
	else:
		ev.announce("胜负已分", "", 80, 110, w)
		ev.snd("finale")

## 逻辑一步（DT 帧 = 1/240 秒）。电脑 AI、木桩、AI 看的快照一帧一次（每一帧的最后一步）
func simTick(inputs: Array) -> void:
	frame += 1
	var fr := frame % C.SUB == 0
	var a: Fighter = p[0]
	var b: Fighter = p[1]
	var locked := phase != "fight" and phase != "attract"
	for i in 2:
		if brains[i] != null:
			if fr:
				brains[i].tick(locked)
		else:
			p[i].inp.apply(int(inputs[i]) if inputs.size() > i else 0, p[i].clock)
	var frozen := freeze > 0.0
	if frozen:
		freeze = maxf(0.0, freeze - C.DT)
	else:
		a.update(locked)
		b.update(locked)
		# 朝向吸附（1.9.0）：不按左右的时候（站、蹲、挡）自动面向对手；在判定之前做
		for F in p:
			if F.actionable() and not F.inp.left and not F.inp.right:
				F.autoFace()
		combat.resolve(a, b)
		combat.separate(a, b)
		if fr:
			a.record()
			b.record()
	if not ev.quiet:
		for F in p:
			if F.lagHp > F.hp:
				F.lagHp = maxf(F.hp, F.lagHp - (0.05 if (F.state == "hit" or frozen) else 0.6) * F.maxHp / 100.0 * C.DT)
			else:
				F.lagHp = F.hp
		if on_visual_step.is_valid():
			on_visual_step.call(frozen)

	match phase:
		"attract":
			if a.hp <= 0.0 or b.hp <= 0.0:
				phaseT += C.DT
				if phaseT >= 131.0:
					resetFighters()
					phaseT = 0.0
		"intro":
			introBeats(phaseT, roundName() == "决胜局")
			if phaseT == 10.0:
				ev.announce(roundName(), "", 56, 96)
			if phaseT == 68.0:
				ev.announce("战", "", 38, 170)
			phaseT += C.DT
			if phaseT >= 100.0:
				phase = "fight"
				phaseT = 0.0
		"fight":
			if mode == "train":
				trainTick(fr)
			elif a.hp <= 0.0 or b.hp <= 0.0:
				endRound(-1 if (a.hp <= 0.0 and b.hp <= 0.0) else (1 if a.hp <= 0.0 else 0), "ko")
			elif not endless:
				timer -= C.DT
				if timer <= 0.0:
					timer = 0.0
					endRound(-1 if a.hp == b.hp else (0 if a.hp > b.hp else 1), "time")
		"ko":
			timeScale = 0.3 if (phaseT < 40.0 and not reduce_motion) else 1.0
			phaseT += C.DT
			if phaseT >= 120.0:
				timeScale = 1.0
				phase = "roundEnd"
				phaseT = 0.0
				if winner >= 0:
					wins[winner] += 1
					var Wf: Fighter = p[winner]
					if Wf.actionable() or Wf.state == "land":
						Wf.state = "win"
					var done: bool = wins[winner] >= C.WIN_ROUNDS
					ev.announce(Wf.name + " 胜", "" if done else "%d : %d" % [wins[0], wins[1]], 100, 120, winner)
					if done:
						var lw: bool = local_win_fn.call(winner) if local_win_fn.is_valid() else localWin(winner)
						ev.snd("victory", lw)
				else:
					ev.announce("平局", "本回合重打", 100, 120)
		"roundEnd":
			var Wf: Fighter = p[winner] if winner >= 0 else null
			if Wf != null and (Wf.actionable() or Wf.state == "land"):
				Wf.state = "win"
			phaseT += C.DT
			if phaseT >= 110.0:
				if wins[0] >= C.WIN_ROUNDS or wins[1] >= C.WIN_ROUNDS:
					phase = "over"
					phaseT = 0.0
					if on_match_over.is_valid():
						on_match_over.call()
				else:
					if winner >= 0:
						round_n += 1
					startRound()
		"over":
			var Wf: Fighter = p[0 if wins[0] >= C.WIN_ROUNDS else 1]
			if Wf.actionable() or Wf.state == "land":
				Wf.state = "win"

## 一帧（SUB 步）：测试、对照用。按住的方向、格挡这一帧的每一步都按着；新按下的招在这一帧最后一步按下去
func step(inputs: Array) -> void:
	var v := [int(inputs[0]) if inputs.size() > 0 else 0, int(inputs[1]) if inputs.size() > 1 else 0]
	var h := [v[0] & InputState.HELD_MASK, v[1] & InputState.HELD_MASK]
	simTick(v if (frame + 1) % C.SUB == 0 else h)
	while frame % C.SUB != 0:
		simTick(v if (frame + 1) % C.SUB == 0 else h)

## 训练场：木桩掉到三成以下、这一套打完就回满；玩家掉血也回满；可选无限气
func trainTick(_fr: bool) -> void:
	var a: Fighter = p[0]
	var b: Fighter = p[1]
	if b.hp <= b.maxHp * C.DUMMY_REFILL and (b.actionable() or b.hp <= 0.0):
		if b.state == "ko":
			b.state = "idle"
			b.downPhase = ""
		b.hp = b.maxHp
		b.lagHp = b.maxHp
		ev.tag("回满", b.idx, 26, b.idx, "floor", -170)
	if a.hp < a.maxHp and a.actionable():
		a.hp = a.maxHp
		a.lagHp = a.maxHp
	if trainQi:
		a.qi = C.QI_MAX

## 整场是不是「我」赢了（放哪段声音）：人机看玩家一；联机看自己是哪一边（联机那边接上 local_win_fn，房主是玩家一）；双人对战两个人都在这台电脑上，总有人赢
func localWin(w: int) -> bool:
	if mode == "pve":
		return w == 0
	if mode == "online":
		return w == (0 if online_host else 1)
	return true

## 五局三胜：两边都差一局就赢 = 决胜局
func roundName() -> String:
	if wins[0] == C.WIN_ROUNDS - 1 and wins[1] == C.WIN_ROUNDS - 1:
		return "决胜局"
	var nums := "一二三四五六七八九"
	return "第%s回合" % (nums[round_n - 1] if round_n <= 9 else str(round_n))

# ---------- 开场的鼓（帧 → [[字, 力度]…]）：两声战鼓，回合名在第 10 帧随「锵」砸下来；战鼓越敲越密；第 68 帧「战」：「锵」+ 古筝和弦 ----------
static var INTRO_BEATS := {}
const FINAL_BEATS := {18.0: [["锵", 0.8]], 27.0: [["咚", 0.42]], 34.0: [["咚", 0.46]], 40.0: [["咚", 0.5]], 44.0: [["嚓", 0.5]]}

static func _static_init() -> void:
	INTRO_BEATS = {2.0: [["咚", 0.8]], 6.0: [["咚", 0.62]], 10.0: [["锵", 0.9]]}
	for fp in [[24, .4], [31, .44], [37, .48], [42, .52], [46, .56], [50, .6], [53, .64], [56, .68], [58, .72], [60, .76], [62, .8], [64, .84], [66, .88]]:
		var f := float(fp[0])
		if not INTRO_BEATS.has(f):
			INTRO_BEATS[f] = []
		INTRO_BEATS[f].append(["咚", fp[1]])
	INTRO_BEATS[46.0].append(["嗒", 0.6])
	INTRO_BEATS[56.0].append(["嗒", 0.7])
	INTRO_BEATS[60.0].append(["铮", 0.9])
	INTRO_BEATS[68.0] = [["锵", 1.2], ["和", 0.9]]

func introBeats(tt: float, final: bool) -> void:
	if INTRO_BEATS.has(tt):
		for kp in INTRO_BEATS[tt]:
			ev.snd("beat", [kp[0], kp[1]])
	if final and FINAL_BEATS.has(tt):
		for kp in FINAL_BEATS[tt]:
			ev.snd("beat", [kp[0], kp[1]])

# ---------- 存档 / 读档（联机回滚）：两个角色的逻辑字段 + 回合流程 ----------
func saveState() -> Dictionary:
	return {"g": [frame, freeze, phase, phaseT, round_n, timer, winner, timeScale, wins[0], wins[1]], "f": [p[0].save(), p[1].save()]}

func loadState(s: Dictionary) -> void:
	var g: Array = s.g
	frame = g[0]; freeze = g[1]; phase = g[2]; phaseT = g[3]; round_n = g[4]; timer = g[5]; winner = g[6]; timeScale = g[7]
	wins = [g[8], g[9]]
	p[0].load_from(s.f[0])
	p[1].load_from(s.f[1])

## 状态指纹：联机时两边定期比对、测试里查「同样输入 → 同样结果」。按数的二进制算（不经过字符串），两边一定一样
func stateHash() -> int:
	var buf := PackedFloat64Array([round_n, timer, wins[0], wins[1], freeze])
	var strs := phase
	for F in p:
		buf.append_array(PackedFloat64Array([F.hp, F.x, F.alt, F.stunT, F.slowJab, F.qi, F.comboTaken, F.runT, F.facing, F.vx, 1.0 if F.grabbed else 0.0,
			F.rollDir, F.guardOn, F.stompFor, 1.0 if F.slipGot else 0.0, 1.0 if F.stagger else 0.0, F.t, F.move.t if F.move != null else -1.0]))
		strs += "|" + F.state + "|" + (F.move.name + ":" + F.move.pick if F.move != null else "-")
	var bytes := buf.to_byte_array()
	bytes.append_array(strs.to_utf8_buffer())
	var h := 2166136261
	for byte in bytes:
		h = ((h ^ byte) * 16777619) & 0xFFFFFFFF
	return h
