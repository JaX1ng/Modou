class_name Brain
extends RefCounted
## 电脑 AI（对照 JS src/js/ai.js，传统格斗专用）：只看 react 帧之前的对手（他的快照 history）。
## 五档：入门 novice / 简单 easy / 中等 normal / 困难 hard / 终极 hell。随机数用 AiRng（两个电脑共用一串，和 JS 一样）。
## 每一帧（最后一步）想一次：tick(locked)。按方向只用来走、跑、冲刺、边挡边走；出招、格挡、站着都不按方向（游戏自己让人面朝对手）。

# 计划里 'd:xx' = 按住蹲再按 xx（地面：下盘拳 / 扫堂腿 / 托天掌；空中 d:kick = 千斤坠）
const PLANS := {
	"novice": [[["jab"], 3], [["jab", "jab"], 3], [["jab", "heavy"], 2], [["heavy"], 2], [["kick"], 2], [["jab", "kick"], 1.5], [["heavy", "kick"], 1],
		[["kick", "kick"], 0.6], [["grab"], 1], [["d:jab"], 1], [["d:kick"], 0.4], [["jab", "jab", "heavy"], 1]],
	"easy": [[["jab"], 2], [["jab", "jab"], 2], [["jab", "heavy"], 3], [["jab", "jab", "heavy"], 3], [["jab", "kick"], 2], [["jab", "jab", "kick"], 2],
		[["jab", "jab", "jab", "jab"], 1], [["heavy", "kick"], 2], [["heavy", "jab"], 1], [["heavy", "heavy"], 1], [["kick", "jab"], 1], [["kick", "kick"], 1],
		[["grab"], 1], [["d:jab", "d:kick"], 0.6], [["d:kick"], 0.4], [["jab", "d:kick"], 0.4], [["d:jab"], 1], [["d:jab", "jab", "heavy"], 1]],
	"normal": [[["jab", "jab"], 1], [["jab", "heavy"], 3], [["jab", "jab", "heavy"], 4], [["jab", "kick"], 3], [["jab", "jab", "kick"], 3],
		[["heavy", "kick"], 3], [["heavy", "jab", "heavy"], 2], [["heavy", "heavy"], 2], [["heavy", "d:kick"], 0.6], [["kick", "jab", "jab"], 2],
		[["kick", "heavy"], 2], [["kick", "kick"], 2], [["grab"], 2], [["d:jab", "d:kick"], 0.6], [["jab", "d:kick"], 0.5], [["d:jab", "jab", "heavy"], 2], [["d:jab", "jab", "kick"], 1]],
	"hard": [[["jab", "jab", "heavy"], 4], [["jab", "heavy"], 2], [["jab", "jab", "kick"], 2], [["heavy", "kick"], 4], [["kick", "kick"], 3], [["kick", "heavy"], 2],
		[["heavy", "heavy"], 1], [["kick", "jab", "jab"], 1], [["grab"], 2], [["d:jab", "jab", "heavy"], 2], [["d:jab", "d:kick"], 1], [["jab", "jab", "jab", "jab"], 1]],
	"hell": [[["jab", "jab", "heavy"], 5], [["jab", "heavy"], 2], [["jab", "jab", "kick"], 3], [["heavy", "kick"], 3], [["kick", "kick"], 2], [["kick", "heavy"], 2],
		[["grab"], 2], [["d:jab", "jab", "heavy"], 2], [["d:jab", "d:kick"], 1], [["jab", "jab", "jab", "jab"], 1]],
}
## react 反应帧；block 格挡率；lowRead 高低判断对的概率；parry 卸力；push 推挡；burst 爆气；read 读招克制；catch 接腿；duck 蹲躲飞踢；aa 对空；
## step 闪步；low 用下段；sup 放泼墨；tech 挣脱；gc 截拳；stomp 踩腿；scoop 抄腿；roll 滚身起；slip 闪身；gwalk 边挡边退；oki 压起身；
## catchSlip 截闪身；see 看穿；smart 聪明（看穿、预判、主动罚）；airBlock 空中招站着挡；aaPlan 防跳；habit 记习惯；guard 近身先护；
## punishBlock 挡住就罚；inst / instMax 终极「瞬间看穿」
const LEVELS := {
	"novice": {"react": 22, "block": .12, "lowRead": .4, "parry": .02, "push": .04, "burst": .1, "read": .03, "catch": .06, "duck": .3, "aa": .1, "step": .1, "low": .15, "sup": .35,
		"punish": .08, "combo": .35, "aggr": .42, "jump": .45, "grabBlock": .18, "idle": .55, "tech": .05, "gc": .03, "stomp": .12, "scoop": .03, "roll": .15,
		"slip": .02, "gwalk": .1, "oki": .1, "catchSlip": .06, "airBlock": .35, "aaPlan": .2, "habit": .08, "guard": .1, "punishBlock": .12},
	"easy": {"react": 14, "block": .36, "lowRead": .55, "parry": .05, "push": .05, "burst": .25, "read": .06, "catch": .18, "duck": .45, "aa": .12, "step": .18, "low": .18, "sup": .55,
		"punish": .25, "combo": .72, "aggr": .78, "jump": .65, "grabBlock": .32, "idle": .3, "tech": .12, "gc": .08, "stomp": .3, "scoop": .1, "roll": .27,
		"slip": .05, "gwalk": .2, "oki": .3, "catchSlip": .18, "airBlock": .5, "aaPlan": .25, "habit": .45, "guard": .24, "punishBlock": .3},
	"normal": {"react": 9, "block": .58, "lowRead": .8, "parry": .16, "push": .45, "burst": .75, "read": .38, "catch": .45, "duck": .8, "aa": .55, "step": .4, "low": .25, "sup": .9,
		"punish": .7, "combo": .85, "aggr": 1, "jump": 1, "grabBlock": .7, "idle": .15, "tech": .4, "gc": .35, "stomp": .9, "scoop": .4, "roll": .55,
		"slip": .2, "gwalk": .45, "oki": .6, "catchSlip": .55, "airBlock": .9, "aaPlan": .72, "habit": .65, "guard": .46, "punishBlock": .65},
	"hard": {"react": 8, "block": .66, "lowRead": .85, "parry": .25, "push": .45, "burst": .75, "read": .5, "catch": .6, "duck": .8, "aa": .7, "step": .4, "low": .25, "sup": .9,
		"punish": .9, "combo": .95, "aggr": 1, "jump": 1, "grabBlock": .7, "idle": .06, "tech": .4, "gc": .35, "stomp": .9, "scoop": .4, "roll": .55,
		"slip": .2, "gwalk": .45, "oki": .75, "catchSlip": .55, "see": .45, "smart": true, "airBlock": .95, "aaPlan": .82, "habit": .8, "guard": .54, "punishBlock": .86},
	"hell": {"react": 11, "block": .74, "lowRead": .92, "parry": .35, "push": .5, "burst": .9, "read": .6, "catch": .7, "duck": .9, "aa": .85, "step": .45, "low": .3, "sup": 1,
		"punish": .93, "combo": .93, "aggr": 1, "jump": .7, "grabBlock": .8, "idle": .05, "tech": .65, "gc": .5, "stomp": 1, "scoop": .5, "roll": .65,
		"slip": .25, "gwalk": .4, "oki": .9, "catchSlip": .7, "see": .48, "smart": true, "airBlock": 1, "aaPlan": .95, "habit": 1, "guard": .55, "punishBlock": 1,
		"inst": .2, "instMax": .55, "instReact": 1},
}
const LEVEL_NAME := {"novice": "入门", "easy": "简单", "normal": "中等", "hard": "困难", "hell": "终极"}
const LEVEL_IDS := ["novice", "easy", "normal", "hard", "hell"]
## 记对手「中立时先出什么」用的归类
const OPENER := {"jab": "jab", "lowJab": "lowJab", "heavy": "heavy", "shoulder": "heavy", "palm": "palm", "kick": "kick", "sweep": "sweep", "grab": "grab", "lowGrab": "lowGrab",
	"airJab": "air", "airHeavy": "air", "airKick": "air", "dive": "dive", "dash": "dash", "slip": "slip"}
const HABIT_MOVE := {"jab": "jab", "lowJab": "lowJab", "heavy": "heavy", "palm": "palm", "kick": "kick", "sweep": "sweep", "grab": "grab", "lowGrab": "lowGrab"}
## 贴身两边差不多同时出手，谁赚：VS[我的][他的] = 1 我赚 / -1 他赚 / 0 差不多
const VS := {
	"jab": {"jab": 0, "lowJab": 0, "heavy": -1, "kick": 1, "sweep": 1, "grab": 1, "lowGrab": 1, "palm": 1},
	"lowJab": {"jab": 0, "lowJab": 0, "heavy": -1, "kick": 1, "sweep": 1, "grab": 1, "lowGrab": 1, "palm": 1},
	"heavy": {"jab": 1, "lowJab": 1, "heavy": 0, "kick": -1, "sweep": -1, "grab": -1, "lowGrab": -1, "palm": 0},
	"kick": {"jab": -1, "lowJab": -1, "heavy": 1, "kick": 0, "sweep": 0, "grab": -1, "lowGrab": -1, "palm": 1},
	"sweep": {"jab": -1, "lowJab": -1, "heavy": 1, "kick": 0, "sweep": 0, "grab": 1, "lowGrab": -1, "palm": 1},
	"grab": {"jab": -1, "lowJab": -1, "heavy": 1, "kick": 1, "sweep": -1, "grab": 0, "lowGrab": 0, "palm": 1},
	"lowGrab": {"jab": -1, "lowJab": -1, "heavy": 0, "kick": 1, "sweep": 1, "grab": 0, "lowGrab": 0, "palm": 0},
	"palm": {"jab": -1, "lowJab": -1, "heavy": 0, "kick": -1, "sweep": -1, "grab": -1, "lowGrab": 0, "palm": 0},
}

static func R() -> float:
	return AiRng.R()

static func weighted(list: Array):
	var sum := 0.0
	for e in list:
		sum += float(e[1])
	var r := R() * sum
	for e in list:
		r -= float(e[1])
		if r <= 0.0:
			return e[0]
	return list[0][0]

static func kindOf(a: String) -> String:
	return a.substr(2) if a.begins_with("d:") else a

## 闪身躲得过吗：重系的手上招
static func slipable(d: MoveDef) -> bool:
	return d != null and not d.air and d.tier == "heavy" and d.kind == "heavy" and d.height != "low"

static func effR(n: String) -> float:
	var d: MoveDef = Moves.MOVES[n]
	return d.reach + (maxf(0.0, d.lunge[2]) if d.has_lunge else 0.0)

static func bandOf(dist: float) -> int:
	return 0 if dist <= 100.0 else (1 if dist <= 170.0 else 2)

static func OPEN_OF(a: String) -> String:
	return TradStyle.DOWN_OF[a.substr(2)] if a.begins_with("d:") else a

static func M(n: String) -> MoveDef:
	return Moves.MOVES[n]

var f: Fighter
var level := ""
var L := {}
var plans: Array = []
var plan: Array = []
var blockT := 0.0
var duckT := 0.0
var idleT := 0
var desire := 120.0
var desireT := 0
var lastSeen := -1
var airPlan := ""
var jumpDir := 0
var lowBlock := false
var seq: Array = []
var techFor := -1
var guardFor := -1
var holdFor := -1
var rollPick = null
var antiDive := false
var slipSeq: Array = []
var slipFor := -1
var okiFor := -1
var gwalkT := 0
var okiSpot := 0.0
var staggerFor := -1
var smart := false
var todo = null
var memo := {}
var wakeLogged := false
var openSeen := -1
var afterWatch = null
var wasBlocked := false
var pressTurn := -1.0
var punishFor = null
var aa = null
var jumpSeen := false
var blockedSer := -1
var blockedLand := false
var instFor := -1
var guardT := 0
var rush = null
var rushArmed := true
var jw = null
var dw := -1
var dwLeft := 0
var rw := 0
var hzSer := -1
var hzBand := -1
var guardBand := 9
var guardNext := 0.0
var upRolled := false
var upNow := false
var lastHp := -INF
var lastSt := ""
var lastPh := ""
var newDown := false
var hiloFor := -999
var okiRoll = null
var guardParry := false
var jsSeen := false
var appr := 0.0
var _toward := 1

func _init(fighter: Fighter, lv: String) -> void:
	f = fighter
	level = lv if LEVELS.has(lv) else "normal"
	L = LEVELS[level]
	plans = PLANS[level]
	smart = L.get("smart", false)
	memo = {"wake": {"stand": 1.0, "to": 1.0, "away": 1.0}, "open": [{}, {}, {}], "after": {"hit": 1.0, "hold": 1.0, "slip": 0.5, "move": 0.5},
		"jump": {"air": 1.2, "dive": 0.5, "empty": 0.5}, "dash": {"strike": 1.0, "grab": 0.4, "none": 0.5}, "run": {"shoulder": 0.8, "grab": 0.5, "strike": 0.6, "stop": 0.6},
		"hz": [0.04, 0.02, 0.01], "meaty": 0.0}

func Lf(k: String) -> float:
	return float(L.get(k, 0.0))

# 闪身：按着挡、朝对手双击（三帧：按 → 松 → 按）
func slipIn() -> void:
	slipSeq = [1, 0, 1]

func dashAway() -> void:
	seq = [{"back": 1}, {}, {"back": 1}]

func dashIn() -> void:
	seq = [{"fwd": 1}, {}, {"fwd": 1}]

## go(1) 朝对手方向按，go(-1) 背对对手方向按
func _go(d: int) -> void:
	if d == 0:
		return
	if d * _toward > 0:
		f.inp.right = true
	else:
		f.inp.left = true

func _press(a: String) -> void:
	if a.begins_with("d:"):
		f.inp.down = true
		a = a.substr(2)
	f.inp.press(a, f.clock)

func _pair() -> void:
	f.inp.press("heavy", f.clock)
	f.inp.press("kick", f.clock)

func tick(locked: bool) -> void:
	var o := f.opp
	var H := f.inp
	if f.sim.freeze > 0.0 and not locked:
		return
	H.left = false; H.right = false; H.up = false; H.down = false; H.block = false
	if locked or f.state == "win" or f.state == "ko":
		plan = []; blockT = 0; seq = []; todo = null; aa = null
		return
	var hist := o.history
	if hist.size() == 0:
		return
	var react: int = int(L.react)
	var s: Dictionary = hist[maxi(0, hist.size() - 1 - react)]
	var dist := absf(o.x - f.x)
	var toward := 1 if o.x >= f.x else -1
	_toward = toward
	learn(o)
	# 2.6 起身那几帧掉了血 = 被人压起身打中了
	if f.hp < lastHp and (lastSt == "rise" or (lastSt == "down" and lastPh == "getup")):
		memo.meaty += 1.0
	newDown = f.state == "down" and (lastSt != "down" or (lastPh == "getup" and f.downPhase != "getup"))
	lastHp = f.hp; lastSt = f.state; lastPh = f.downPhase
	# 终极：起跳也可能被它 1 帧看穿（每一跳掷一次骰子）
	var upNowNow := o.state == "jumpsquat" or o.airborne()
	if not upNowNow:
		upRolled = false
		upNow = false
	elif not upRolled:
		upRolled = true
		upNow = L.has("inst") and R() < minf(0.95, Lf("inst") + 0.2)
	var sj: Dictionary = hist[hist.size() - 1] if upNow else s
	var lagJ := 0 if upNow else react
	watchJump(sj, dist)

	# 闪身双击（按着挡）：挨打、倒地就作废
	if slipSeq.size() > 0:
		if f.state == "hit" or f.state == "down" or f.state == "rise":
			slipSeq = []
		else:
			H.block = true
			if slipSeq.pop_front():
				_go(1)
			return
	# 多帧操作（闪步双击、跑动）；被打断就作废
	if f.state == "hit" or f.state == "down" or f.state == "blockstun" or f.state == "rise":
		seq = []
	if f.state == "hit" or f.state == "down":
		blockT = 0
		duckT = 0
	if seq.size() > 0:
		var st: Dictionary = seq.pop_front()
		if st.has("back"):
			_go(-1)
		if st.has("fwd"):
			_go(1)
		if st.has("press"):
			f.inp.press(st.press, f.clock)
		return
	# 被擒住：挣脱（每次被抓掷一次骰子）
	if f.state == "hit" and f.grabbed:
		if o.move != null and o.move.name == "hold" and techFor != o.move.serial:
			techFor = o.move.serial
			if R() < Lf("tech"):
				f.inp.press("grab", f.clock)
		return
	# 倒地：起身时滚开
	if f.state == "down":
		aa = null
		if rollPick == null or newDown:
			var mt: float = memo.meaty
			var pr := minf(0.92, Lf("roll") + 0.32 * mt * (Lf("habit") if L.has("habit") and Lf("habit") != 0.0 else 0.5))
			if R() < pr:
				rollPick = -1 if (mt > 0.5 or R() < 0.5) else 1
			else:
				rollPick = 0
			memo.meaty *= 0.9
		if rollPick != 0:
			var d: int = rollPick * toward
			if f.x + d * f.rollLen(d) < C.WALL_L + 20.0 or f.x + d * f.rollLen(d) > C.WALL_R - 20.0:
				d = -d
			if d > 0:
				H.right = true
			else:
				H.left = true
		return
	rollPick = null
	if f.state == "rise":
		return
	# 算好时机的那一下（卸力、闪身）。挨打了、自己在出招就作废
	if todo != null:
		if f.state == "hit" or f.state == "attack" or f.airborne():
			todo = null
		elif f.clock >= todo.at:
			var tdo: Dictionary = todo
			todo = null
			if tdo.act == "slip":
				slipIn()
				H.block = true
				return
			if tdo.act == "parry":
				f.noParry = false
				lowBlock = tdo.low
				blockT = 14
				H.block = true
				H.down = tdo.low
				return
			if tdo.act == "press":
				_press(tdo.key)
				return
		else:
			if todo.act == "slip":
				H.block = true
			return
	# 挨打 / 格挡硬直：爆气、推挡；蹲挡住扫堂腿踩腿、挡住后截拳
	if f.state == "hit" or f.state == "blockstun":
		guardT = 0
		if f.state == "hit" and f.qi >= C.QI_BURST and not f.grabbed and f.comboTaken >= 2 and R() < Lf("burst") * 0.08:
			_pair()
			return
		if f.state == "blockstun":
			var om := o.move
			if om != null and not om.def.scripted:
				blockedSer = om.serial
				blockedLand = om.air
			if om != null and guardFor != om.serial:
				guardFor = om.serial
				if f.stompReady() and R() < Lf("stomp"):
					H.down = true
					f.inp.press("kick", f.clock)
					H.block = true
					return
				if f.qi >= C.GC_COST and R() < Lf("gc"):
					f.inp.press("heavy", f.clock)
					return
			if dist < 110.0 and R() < Lf("push") * 0.1:
				f.inp.press("jab", f.clock)
			if s.atk and s.serial != hiloFor and s.height != "":
				hiloFor = s.serial
				if s.height == "high" and lowBlock and R() < Lf("lowRead"):
					lowBlock = false
				elif s.height == "low" and not lowBlock and R() < Lf("lowRead"):
					lowBlock = true
			H.block = true
			H.down = lowBlock
		return
	if f.state == "attack":
		if f.move.blocked:
			wasBlocked = true
		# 擒住了：挑一种后续（背靠墙多用过肩摔把人换到墙边）
		if f.move.name == "hold" and f.move.holdKind == "grab" and f.move.pick == "" and holdFor != f.move.serial:
			holdFor = f.move.serial
			var cornered := f.x - toward * 120.0 < C.WALL_L or f.x - toward * 120.0 > C.WALL_R
			var k: String = weighted([["heavy", 6], ["jab", 2], ["kick", 1]] if cornered else [["jab", 3], ["kick", 3], ["heavy", 3], ["none", 1]])
			if k != "none":
				f.inp.press(k, f.clock)
			return
		if plan.size() > 0 and f.canCancel(kindOf(plan[0])):
			if R() < Lf("combo"):
				_press(plan.pop_front())
			else:
				plan = []
		return
	if wasBlocked:
		wasBlocked = false
		pressTurn = f.clock
	# 卸力成功：趁对方失衡反打，或者借力摔
	if f.state == "parry":
		if dist <= 110.0 and R() < 0.3:
			f.inp.press("grab", f.clock)
			return
		if dist <= 92.0:
			plan = (AiRng.pick([["jab", "jab", "heavy"], ["jab", "kick"], ["heavy", "kick"], ["heavy", "heavy"]]) as Array).duplicate()
		else:
			plan = ["heavy", "kick"]
		_press(plan.pop_front())
		return
	if f.state == "air" or f.state == "jumpsquat":
		_go(jumpDir)
		if airPlan != "" and f.state == "air" and not f.airUsed:
			# 对手蹲着 / 蹲挡 / 在出托天掌 → 改用千斤坠；对手站着 → 别用千斤坠，换飞踢
			if airPlan == "d:kick" and not s.low and not s.lowBlock and s.tier != "aa" and R() < 0.5:
				airPlan = "kick"
			elif airPlan != "d:kick" and (s.low or s.lowBlock or s.tier == "aa") and R() < Lf("read"):
				airPlan = "d:kick"
			var ok: bool
			if airPlan == "d:kick":
				ok = dist >= 50.0 and dist <= 150.0 and f.vz < 6.0
			else:
				ok = dist <= M(TradStyle.AIR_OF[airPlan]).reach + 8.0 and f.vz < 4.0
			if ok:
				_press(airPlan)
				airPlan = ""
		return
	if f.state == "land":
		return
	# 对付千斤坠：看见对手出千斤坠，站着等它踩下来，进了拳的射程就出短拳迎上去（倒栽葱）
	if antiDive and f.actionable():
		var om := o.move
		if not (o.state == "attack" and om != null and om.def.dive and not om.hit and not om.blocked):
			antiDive = false
		else:
			if diveHit(o, om):
				antiDive = false
				_press("jab")
			elif om.t > om.S and o.alt < 104.0:
				antiDive = false
				f.noParry = true
				lowBlock = false
				blockT = 24
				H.block = true
			return
	# 挡住以后罚：我刚挡住他一下、我能动了、他还在收招 → 挑够得着、来得及、最疼的一套
	if blockedSer >= 0 and f.actionable():
		var ser := blockedSer
		blockedSer = -1
		var om := o.move
		var left := 0.0
		if o.state == "attack" and om != null and om.serial == ser:
			left = om.S + om.def.A + om.def.R + om.pen - om.t
		elif o.state == "land":
			left = o.landT - o.t
		if left > M("jab").S + 1.0 and R() < Lf("punishBlock"):
			var r = bestPunish(dist, left - 1.0)
			if r != null:
				blockT = 0
				aa = null
				plan = (r as Array).duplicate()
				_press(plan.pop_front())
				return
	# 终极：这一招有没有被它「瞬间看穿」（每一招只掷一次骰子）
	if L.has("inst") and o.state == "attack" and o.move != null and not o.move.def.scripted and o.move.serial != instFor and f.actionable():
		instFor = o.move.serial
		if o.facingTo(f) and R() < instChance(o.move, dist) and instCounter(o, dist):
			lastSeen = o.move.serial
			return
	# 终极：冲刺也一样
	if L.has("inst") and o.move != null and o.move.name == "dash" and o.move.serial != instFor and f.actionable():
		instFor = o.move.serial
		if o.facing == (1 if f.x >= o.x else -1) and dist <= 300.0 and R() < instChance(o.move, dist):
			var D: Dictionary = memo.dash
			var top := "duck" if (D.grab > D.strike and D.grab > D.none) else ("jab" if D.none > D.strike else "block")
			rushArmed = false
			rush = {"kind": "dash", "t": 0, "plan": top, "now": true}
	# 防跳：看见他起跳时想好的接法，到时候照着做
	if aa != null and airDefense(sj, dist, lagJ):
		return
	# 格挡中：不按方向。偶尔边挡边往后退（离墙远的时候）
	if blockT > 0.0 and (f.actionable() or f.state == "blockstun"):
		blockT -= 1.0
		H.block = true
		H.down = lowBlock
		if gwalkT > 0 and not lowBlock and f.state == "block":
			gwalkT -= 1
			var bx := f.x - toward * 60.0
			if bx > C.WALL_L + 20.0 and bx < C.WALL_R - 20.0:
				_go(-1)
		return
	if not f.actionable():
		return
	jumpDir = 0
	if duckT > 0.0:
		duckT -= 1.0
		H.down = true
		return

	# 压起身：对手倒地 → 走到他跟前；他起身时算好时机出快招
	if o.state == "down" or o.state == "rise":
		if okiRoll == null:
			okiRoll = R() < Lf("oki")
		if o.state == "down" and o.downPhase != "getup":
			okiSpot = o.x
		if okiRoll:
			var seen: bool = s.roll != 0 or not s.down
			var land: float
			if not seen:
				land = okiSpot
			elif o.downPhase == "getup" and o.rollDir != 0:
				land = o.x + o.rollDir * o.rollLen(o.rollDir) * (1.0 - o.t / C.GETUP)
			else:
				land = o.x
			var gap := absf(land - f.x)
			var tw := 1 if land >= f.x else -1
			var S := M("jab").S
			var left := 0.0 if o.state == "rise" else (C.GETUP - o.t if o.downPhase == "getup" else 99.0)
			if gap <= M("jab").reach - 4.0 and left <= S + 1.0 and (o.state != "rise" or o.t + S + 1.0 < (o.riseT if o.riseT != 0.0 else C.RISE)):
				okiRoll = false
				if R() < 0.25 and gap <= M("grab").reach - 6.0:
					plan = ["grab"]
				elif smart:
					plan = (AiRng.pick([["jab", "jab", "heavy"], ["jab", "jab", "kick"], ["jab", "heavy"]]) as Array).duplicate()
				else:
					plan = (AiRng.pick([["jab", "jab", "heavy"], ["jab", "kick"], ["jab", "jab", "jab", "jab"]]) as Array).duplicate()
				if tw > 0:
					H.right = true
				else:
					H.left = true
				var a: String = plan.pop_front()
				if a.begins_with("d:"):
					H.down = true
				f.inp.press(kindOf(a), f.clock)
				return
			if o.state == "rise":
				okiRoll = false
			elif gap > 74.0:
				if smart and seen and gap > 110.0:
					seq = [{"fwd": 1}, {}, {"fwd": 1}] if tw * toward > 0 else [{"back": 1}, {}, {"back": 1}]
					return
				if tw > 0:
					H.right = true
				else:
					H.left = true
				return
			else:
				return
	else:
		okiRoll = null
	# 对手挨了回身肘、背对着踉跄：接着打
	if s.stagger and staggerFor != o.serial and dist <= 140.0 and R() < Lf("punish"):
		staggerFor = o.serial
		if dist <= 92.0:
			plan = (AiRng.pick([["jab", "jab", "heavy"], ["jab", "kick"], ["heavy", "kick"]]) as Array).duplicate()
		elif dist <= 116.0:
			plan = ["heavy", "kick"]
		else:
			plan = ["kick", "kick"]
		_press(plan.pop_front())
		return
	# 看见对手在闪身（钻过来）：出短拳 / 腿截他
	if s.slip and dist <= 130.0 and R() < Lf("catchSlip") * 0.4:
		_press("jab" if dist <= 96.0 else "kick")
		return

	var oppFacesMe: bool = s.facing == -toward
	var oppUp: bool = sj.air or sj.squat
	# 他朝我走过来有多快（看见的）
	var prev: Dictionary = hist[maxi(0, hist.size() - 3 - react)]
	appr = 0.0 if (s.down or s.air) else (s.x - prev.x) * -toward / 2.0
	# 连招没打中：短时间内继续按完（他跳起来了就算了）
	if plan.size() > 0:
		if not oppUp and f.chainIdle < 6.0 and dist <= Moves.reachOf(plan[0]):
			_press(plan.pop_front())
			return
		if f.chainIdle >= 6.0 or oppUp:
			plan = []
	# 看到对手出招（只管朝着我来的）
	var reachIn: float = 230.0 if s.name == "dive" else s.reach + 26.0 + (absf(s.vx) * (react + 4) if s.air else 0.0)
	if s.atk and s.serial != lastSeen and dist <= reachIn and oppFacesMe:
		lastSeen = s.serial
		var eta: float = s.sLeft - react
		if smart and R() < seeChance(s, dist) and hellCounter(s, dist, eta, false):
			return
		var canCatch: bool = s.kind == "kick" and s.height != "low" and s.name != "dive" and eta >= M("grab").S + 1.0 and dist <= s.reach + 6.0
		if canCatch and R() < Lf("catch"):
			_press("grab")
			return
		if s.name == "sweep" and eta >= M("lowGrab").S + 1.0 and dist <= s.reach + 6.0 and R() < Lf("scoop"):
			_press("d:grab")
			return
		if s.name == "dive":
			aa = null
			if R() < Lf("aa"):
				antiDive = true
				return
			f.noParry = true
			lowBlock = false
			blockT = maxf(10.0, s.remain + 10.0)
			H.block = true
			return
		if s.name == "airKick" and dist >= 110.0 and R() < Lf("aa") * 0.35:
			_press("kick")
			return
		if s.name == "airKick" and R() < Lf("duck"):
			duckT = maxf(12.0, s.remain + 8.0)
			H.down = true
			return
		if s.tier == "air" and eta >= M("palm").S - 6.0 and dist <= 130.0 and R() < Lf("aa"):
			_press("d:heavy")
			return
		if slipable(Moves.MOVES.get(s.name)) and eta >= 1.0 and eta <= 7.0 and R() < Lf("slip"):
			slipIn()
			H.block = true
			return
		if eta >= 2.0 and R() < Lf("read"):
			var ans := ""
			if s.tier == "light":
				ans = "heavy"
			elif s.tier == "heavy":
				ans = "kick" if eta >= 8.0 else ""
			elif s.tier == "kick" and dist <= 96.0 and eta >= 3.0:
				ans = "jab"
			if ans != "" and dist <= Moves.reachOf(ans) + 10.0:
				_press(ans)
				return
		var hb := habitShare(OPENER.get(s.name, ""), dist) * Lf("habit") * 0.5
		if s.kind != "grab" and s.kind != "push" and R() < minf(0.98, (maxf(Lf("block"), Lf("airBlock") * 0.9) if s.air else Lf("block")) + hb):
			var tryParry := eta >= 0.0 and eta <= C.PARRY_WIN - 2.0 and R() < Lf("parry")
			f.noParry = not tryParry
			if s.air:
				lowBlock = R() > Lf("airBlock")
			elif s.height == "low":
				lowBlock = R() < Lf("lowRead")
			elif s.height == "high":
				lowBlock = R() > Lf("lowRead")
			else:
				lowBlock = R() < 0.3
			blockT = maxf(8.0, s.remain + 6.0)
			H.block = true
			H.down = lowBlock
			if not s.air and R() < Lf("gwalk") * 0.3:
				gwalkT = 10 + int(R() * 16)
			return
		if s.kind == "grab" and R() < Lf("block") * 0.6:
			if R() < Lf("step"):
				dashAway()
			return
	# 看见他冲刺 / 跑过来：按他冲完、跑到跟前爱干什么，先挡 / 蹲 / 腿迎 / 等他冲完打他收招
	if watchRush(s, dist, toward, oppFacesMe, oppUp):
		return
	# 难 / 终极：主动
	if smart and hellOffense(s, dist):
		return
	# 记习惯：他在这个距离老出同一招，提前防 / 提前出克它的招
	if habitGuard(s, dist):
		return
	# 对手背对我：趁机打背后（他是跑开了才背对我的话，够不着就别打）
	if not s.down and not s.atk and not oppUp and not oppFacesMe and dist <= 110.0 and R() < Lf("aggr") * 0.2:
		var p := pickPlan(dist)
		var a: String = p[0]
		var n: String = TradStyle.DOWN_OF[kindOf(a)] if a.begins_with("d:") else a
		if dist + maxf(0.0, -appr) * (M(n).S + 1.0) <= effR(n) - 6.0:
			plan = p
			_press(plan.pop_front())
			return
	# 惩罚空招
	if s.phase == "r" and not s.confirmed and not s.air and dist <= 110.0 and R() < Lf("punish") * 0.3:
		plan = ["jab", "heavy"] if dist <= 90.0 else ["heavy"]
		_press(plan.pop_front())
		return
	# 气满：对手收招或硬直时放泼墨
	if f.qi >= C.QI_MAX and dist <= 130.0 and not s.down and not s.air and (s.phase == "r" or s.stun) and R() < Lf("sup") * 0.25:
		_pair()
		return
	# 对手龟缩：站挡就擒拿或下段，蹲挡就抄腿或打上段
	if s.blocking and not s.lowBlock and dist <= 84.0 and R() < Lf("grabBlock") * 0.12:
		_press("grab")
		return
	if s.blocking and s.lowBlock and dist <= 88.0 and R() < Lf("grabBlock") * 0.1:
		_press("d:grab")
		return
	if s.blocking and not s.lowBlock and dist <= 120.0 and R() < Lf("low") * 0.05:
		_press("d:jab" if dist <= 88.0 else "d:kick")
		return
	# 被贴身压着：闪步拉开，或者偶尔闪到对手身后
	if dist < 86.0 and s.atk and R() < Lf("step") * 0.05:
		if R() < 0.3:
			dashIn()
		else:
			dashAway()
		return
	# 近身先护着
	if guardT > 0:
		guardT -= 1
		f.noParry = not guardParry
		H.block = true
		H.down = lowBlock
		return
	var gb := bandOf(dist)
	if not s.down and not s.atk and not s.stun and not oppUp and gb <= 1 and (gb < guardBand or f.clock >= guardNext):
		guardNext = f.clock + 8.0 + int(R() * 6)
		var hz: float = memo.hz[gb]
		var pAtk := 1.0 - pow(1.0 - hz, 10.0)
		var habitK := 0.35 + 0.65 * Lf("habit")
		if R() < minf(0.9, Lf("guard") * 1.5 * pAtk * habitK * (0.6 if gb != 0 else 1.0)):
			var hi := habitShare("lowGrab", dist) * 1.6 + habitShare("air", dist) * 0.6
			lowBlock = R() < clampf(0.25 + 0.55 * Lf("lowRead") - hi * Lf("habit"), 0.08, 0.92)
			guardParry = R() < Lf("parry")
			guardT = 10 + int(R() * 10)
			f.noParry = not guardParry
			H.block = true
			H.down = lowBlock
			guardBand = gb
			return
	guardBand = gb
	if not s.down and not s.atk and dist <= 100.0 and R() < Lf("block") * 0.012:
		f.noParry = true
		blockT = 14 + int(R() * 14)
		lowBlock = R() < 0.4
		if not lowBlock and R() < Lf("gwalk"):
			gwalkT = int(blockT)
		H.block = true
		H.down = lowBlock
		return
	# 他在跳（没想好接法的时候）：别往他底下走、别出地上的招
	if oppUp and not s.down:
		if sj.air and dist <= 170.0 and sj.vz < 2.0 and R() < Lf("airBlock") * 0.08:
			f.noParry = true
			lowBlock = false
			blockT = 12
			H.block = true
			return
		return
	if not s.down:
		if dist > 130.0 and dist < 280.0 and appr > -1.0 and R() < Lf("jump") * 0.01:
			seq = []
			var run := 3 + int(R() * 6)
			for i in run:
				seq.append({"fwd": 1})
			seq.append({"fwd": 1, "press": "up"})
			jumpDir = 1
			airPlan = AiRng.pick(["kick", "kick", "heavy", "jab", "d:kick"])
			return
		if dist > 140.0 and dist < 230.0 and appr > -1.0 and R() < Lf("aggr") * 0.004:
			seq = [{"fwd": 1}, {}, {"fwd": 1}, {}, {}, {}, {}, {"fwd": 1, "press": AiRng.pick(["jab", "heavy", "heavy", "kick"])}]
			return
		if dist > 150.0 and dist < 240.0 and appr > -1.0 and R() < Lf("aggr") * 0.006:
			seq = []
			for i in 10:
				seq.append({"fwd": 1})
			seq.append({"fwd": 1, "press": "heavy"})
			return
		if dist > 98.0 and dist <= 134.0 and appr < 1.0 and appr > -1.5 and R() < Lf("aggr") * 0.045:
			_press("d:kick" if (dist <= 118.0 and R() < Lf("low")) else "kick")
			return
		if smart and appr > 1.5 and not s.run and dist > M("jab").reach - 4.0 and dist <= M("jab").reach + appr * (M("jab").S + 1.0) and R() < Lf("read") * 0.25:
			plan = ["jab", "heavy"]
			_press("jab")
			plan.pop_front()
			return
		if dist <= 92.0 and R() < Lf("aggr") * 0.09:
			plan = pickPlan(dist)
			_press(plan.pop_front())
			return
		if dist <= 82.0 and R() < 0.008 * Lf("aggr"):
			_press("grab")
			return
	desireT -= 1
	if desireT <= 0:
		desireT = 25 + int(R() * 45)
		desire = 150.0 if s.down else float(AiRng.pick([86, 92, 138, 146] if smart else [84, 88, 110, 124, 150, 180]))
		idleT = 8 + int(R() * 20) if R() < Lf("idle") else 0
	if idleT > 0:
		idleT -= 1
		return
	var behind := f.x - toward * 90.0
	var nearWall := behind < C.WALL_L + 10.0 or behind > C.WALL_R - 10.0
	# 没有后退：太近了就闪步拉开（不转身背对对手），太远就跑过去
	if dist > desire + 6.0:
		_go(1)
	elif dist < desire - 40.0 and not nearWall and R() < Lf("step") * 0.01:
		dashAway()

# ---------- 2.1 防跳 ----------
## 看见对手离地：这一跳想好怎么接（每一跳只想一次）
func watchJump(s: Dictionary, dist: float) -> void:
	var up: bool = s.air or s.squat
	if not up:
		jumpSeen = false
		aa = null
		return
	if jumpSeen or not s.air:
		return
	jumpSeen = true
	if s.atk and s.dive:
		return
	var tAir := maxf(2.0, (s.vz + sqrt(maxf(0.0, s.vz * s.vz + 2.0 * C.GRAV * s.alt))) / C.GRAV)
	var landX: float = s.x + s.vx * tAir
	var dLand := absf(landX - f.x)
	if dist > 340.0 or (dLand > 190.0 and dist > 170.0):
		return
	var J: Dictionary = memo.jump
	var tot: float = J.air + J.dive + J.empty
	var pA: float = J.air / tot
	var pD: float = J.dive / tot
	var pE: float = J.empty / tot
	var pa := minf(0.98, Lf("aaPlan") + (maxf(pA, pD) - 0.4) * Lf("habit") * 0.4)
	if R() >= pa:
		return
	var wall := f.x - (1.0 if s.x >= f.x else -1.0) * 110.0
	var cornered := wall < C.WALL_L + 20.0 or wall > C.WALL_R - 20.0
	var hb := Lf("habit")
	var pl = weighted([["palm", Lf("aa") * (0.5 + 1.6 * pA * hb)], ["block", 0.7 + 0.5 * pA * (1.0 - hb)], ["wait", 0.35 + 1.8 * (pD + pE * 0.6) * hb],
		["back", 0.0 if cornered else Lf("step") * 0.6]])
	aa = {"plan": pl, "jitter": C.jsround((R() - 0.5) * Lf("react") * 0.5), "done": false}

## 照想好的接法做。返回 true = 这一帧按了东西（或者就是要站着不动）
func airDefense(s: Dictionary, dist: float, lag: int) -> bool:
	var o := f.opp
	var H := f.inp
	var A: Dictionary = aa
	if not f.actionable():
		return false
	if s.atk and s.dive:
		aa = null
		if R() < Lf("aa"):
			antiDive = true
		else:
			f.noParry = true
			lowBlock = false
			blockT = 30
			H.block = true
		return true
	if A.plan == "palm":
		if A.done:
			return false
		var k: float = lag + M("palm").S + 1.0 + A.jitter
		var px: float = s.x + s.vx * k
		var pd := absf(px - f.x)
		var tLand: float = (s.vz + sqrt(maxf(0.0, s.vz * s.vz + 2.0 * C.GRAV * s.alt))) / C.GRAV if s.air else 99.0
		if pd <= M("palm").reach - 2.0 and (s.vz < 1.0 or tLand <= k + 2.0):
			A.done = true
			_press("d:heavy")
			return true
		return false
	if A.plan == "block":
		if not o.airborne() and o.state != "attack":
			aa = null
			return false
		if dist <= 200.0:
			f.noParry = true
			lowBlock = false
			H.block = true
			H.down = false
			return true
		return false
	if A.plan == "wait":
		if not o.airborne():
			aa = null
			return false
		return false
	if A.plan == "back":
		if not o.airborne():
			aa = null
			return false
		var tw := 1.0 if o.x >= f.x else -1.0
		var behind := f.x - tw * 100.0
		if behind < C.WALL_L + 20.0 or behind > C.WALL_R - 20.0:
			A.plan = "block"
			return airDefense(s, dist, lag)
		if not A.done and dist <= 150.0 and s.vz < 2.0 + C.GRAV:
			A.done = true
			dashAway()
			return true
		if dist <= 240.0:
			f.noParry = true
			lowBlock = false
			H.block = true
			_go(-1)
			return true
		return false
	return false

## 千斤坠踩下来：现在出拳的话，拳出手那几帧它在哪 —— 低到拳打得着、还没踩到我、在拳的射程里，就是现在
func diveHit(o: Fighter, om: MoveState) -> bool:
	var nm := TradStyle.pickVariant("jab", [] if f.chainIdle > C.CHAIN_WIN else f.chain, false, "")
	var J := M(nm)
	var k := J.S + 1.0
	var hover := maxf(0.0, om.S - om.t)
	if hover >= k:
		return false
	var dv := k - hover
	var vxx := o.vx if om.t > om.S else o.facing * C.DIVE_VX
	var a := o.alt - C.DIVE_VZ * dv
	var xx := o.x + vxx * dv
	var d := absf(xx - f.x)
	return a <= C.DIVE_AA_ALT + 4.0 and a >= 58.0 and d <= J.reach + 4.0

## 看见他冲刺过来 / 跑满了冲过来：按他冲完 / 跑到跟前爱干什么接（每一次只想一次）
func watchRush(s: Dictionary, dist: float, _tw: int, oppFacesMe: bool, oppUp: bool) -> bool:
	var H := f.inp
	var Mm: Dictionary = memo
	if rush != null:
		var P: Dictionary = rush
		var om := f.opp.move
		var going: bool
		if P.kind == "dash":
			going = (om != null and om.name == "dash") if P.get("now", false) else s.dash
		else:
			going = s.run
		if not going:
			P.t += 1
		if (not going and P.t > 4) or oppUp:
			rush = null
			return false
		if P.plan == "kick":
			if not going:
				return false
			var oh := f.opp.history
			var ref: Dictionary = oh[maxi(0, oh.size() - 2 - int(L.react))] if oh.size() > 0 else s
			var v := absf(s.x - ref.x)
			if v == 0.0:
				v = C.RUN_MAX
			if dist - v * (M("kick").S + 1.0) <= effR("kick") - 4.0:
				rush = null
				_press("kick")
				return true
			return false
		if P.plan == "jab":
			if dist <= M("jab").reach and (going or P.t <= 2) and not s.air and not s.squat:
				rush = null
				_press("jab")
				return true
			return false
		if P.plan == "duck":
			if dist <= 150.0:
				rush = null
				duckT = 16
				H.down = true
				return true
			return false
		if P.plan == "block":
			if dist <= 210.0:
				rush = null
				f.noParry = not (R() < Lf("parry") * 1.5)
				lowBlock = false
				blockT = 20
				H.block = true
				return true
			return false
		return false
	if not s.dash and not s.run:
		rushArmed = true
	var rushing: bool = (s.dash or s.run) and oppFacesMe and rushArmed
	if not rushing or dist > 300.0:
		return false
	rushArmed = false
	if R() >= minf(0.95, Lf("read") + 0.25):
		return false
	var hb := Lf("habit")
	if s.dash:
		var D: Dictionary = Mm.dash
		var t: float = D.strike + D.grab + D.none
		var pS: float = D.strike / t
		var pG: float = D.grab / t
		var pN: float = D.none / t
		rush = {"kind": "dash", "t": 0, "plan": weighted([["block", 0.8 + 1.4 * pS * hb], ["duck", 1.6 * pG * hb], ["jab", 0.2 + 1.4 * pN * hb]])}
	else:
		var U: Dictionary = Mm.run
		var t: float = U.shoulder + U.grab + U.strike + U.stop
		var pSh: float = U.shoulder / t
		var pG: float = U.grab / t
		var pSt: float = U.stop / t
		rush = {"kind": "run", "t": 0, "plan": weighted([["kick", 0.7 + 1.2 * (pSh + pG + U.strike / t) * hb], ["block", 0.4 + 0.8 * pSh * hb], ["duck", 1.4 * pG * hb], ["wait", 0.3 + 1.4 * pSt * hb]])}
	return watchRush(s, dist, _tw, oppFacesMe, oppUp)

# ---------- 2.1 记习惯 ----------
## 他在这个距离（近 / 中 / 远）先出 k 这一招的比例（出得不够多不算）
func habitShare(k: String, dist: float) -> float:
	if k == "":
		return 0.0
	var m: Dictionary = memo.open[bandOf(dist)]
	var tot := 0.0
	for v in m.values():
		tot += v
	return (m.get(k, 0.0) / tot) if tot >= 4.0 else 0.0

## 挑连招的时候看他在这个距离爱出什么 —— 起手克他习惯招的多用，被他克的少用
func pickPlan(dist: float) -> Array:
	var band: Dictionary = memo.open[bandOf(dist)]
	var tot := 0.0
	for v in band.values():
		tot += v
	var list := []
	for pw in plans:
		var p: Array = pw[0]
		var w: float = pw[1]
		var k := 1.0
		if tot >= 4.0:
			var row = VS.get(OPEN_OF(p[0]))
			if row != null:
				for h in band:
					var v: float = band[h]
					var hm = HABIT_MOVE.get(h)
					if hm == null or not row.has(hm) or v <= 0.0:
						continue
					var r: int = row[hm]
					k *= 1.0 + Lf("habit") * (v / tot) * (1.5 if r > 0 else (-0.75 if r < 0 else 0.0))
		if appr > 1.0 and kindOf(p[0]) == "kick":
			k *= 0.35
		list.append([p, w * maxf(0.08, k)])
	return (weighted(list) as Array).duplicate()

## 他在这个距离老出同一招：有时候不等看见就先防 / 先出克它的招
func habitGuard(s: Dictionary, dist: float) -> bool:
	if s.down or s.stun or s.atk or s.air or s.blocking:
		return false
	var m: Dictionary = memo.open[bandOf(dist)]
	var tot := 0.0
	var top := ""
	for k in m:
		tot += m[k]
		if top == "" or m[k] > m[top]:
			top = k
	var p: float = (m[top] / tot) if (tot >= 5.0 and top != "") else 0.0
	if p < 0.38 or R() >= (p - 0.3) * 0.06 * Lf("habit"):
		return false
	match top:
		"jab", "lowJab":
			if R() < 0.35 and dist <= effR("heavy") - 8.0:
				_press("heavy")
				return true
			return _guard(top == "lowJab" or _lowGuess(), 14 + int(R() * 10))
		"heavy":
			if dist <= effR("kick") - 6.0 and R() < 0.55:
				_press("kick")
				return true
			return _guard(_lowGuess(), 18)
		"kick":
			if dist <= 96.0 and R() < 0.5:
				_press("jab")
				return true
			return _guard(_lowGuess(), 16)
		"sweep":
			if R() < 0.4:
				f.inp.press("up", f.clock)
				return true
			return _guard(true, 18)
		"grab":
			if dist <= effR("jab") - 4.0 and R() < 0.4:
				_press("jab")
				return true
			duckT = 14
			f.inp.down = true
			return true
		"lowGrab":
			if dist <= effR("jab") - 4.0 and R() < 0.4:
				_press("jab")
				return true
			return _guard(false, 14)
		"air":
			aa = null
			jumpSeen = false
			return false
		"dash":
			return _guard(_lowGuess(), 16) if dist <= 220.0 else false
	return false

func _guard(low: bool, n: int) -> bool:
	f.noParry = true
	guardParry = false
	lowBlock = low
	guardT = n
	f.inp.block = true
	f.inp.down = low
	return true

func _lowGuess() -> bool:
	return R() < 0.3 + 0.65 * Lf("lowRead")

# ---------- 2.1 终极：瞬间看穿 ----------
func instChance(m: MoveState, dist: float) -> float:
	var p := habitShare(OPENER.get(m.name, ""), dist)
	return minf(Lf("instMax"), Lf("inst") + 0.6 * maxf(0.0, p - 0.2))

## 看穿了：按他这一招现在走到哪（真的现在，不是 react 帧以前）挑最赚的破法，时机按到帧
func instCounter(o: Fighter, dist: float) -> bool:
	var m := o.move
	var eta := m.S - m.t
	var snap := {"name": m.name, "kind": m.def.kind, "tier": m.def.tier, "height": m.def.height,
		"reach": m.def.reach + (maxf(0.0, m.def.lunge[2]) if m.def.has_lunge else 0.0),
		"remain": maxf(0.0, m.S + m.def.A - m.t), "sLeft": eta, "air": m.air, "dive": m.def.dive, "x": o.x, "vx": o.vx if m.air else 0.0}
	return hellCounter(snap, dist, eta, true)

# ---------- 难 / 终极 ----------
## 这一招看不看得穿：基础 L.see；对手在这个距离上出这一招出得越多（习惯），越容易看穿，最多 0.8
func seeChance(s: Dictionary, dist: float) -> float:
	var m: Dictionary = memo.open[bandOf(dist)]
	var k: String = OPENER.get(s.name, "")
	var tot := 0.0
	for v in m.values():
		tot += v
	var p: float = (m.get(k, 0.0) / tot) if (k != "" and tot >= 6.0) else 0.0
	return minf(0.8, Lf("see") + 0.45 * maxf(0.0, p - 0.25))

## 闪身钻过去最晚什么时候还躲得着
func slipWindow(dist: float) -> int:
	var px := clampf(dist + C.SLIP_PAST, C.SLIP_MIN, C.SLIP_MAX)
	var v := px / M("slip").lunge[1]
	return maxi(0, int(floorf((dist - 12.0) / v)))

## 看穿了：从破解表里挑最赚的破法（差不多赚的随机挑一个），时机算准。exact = 终极（时机按到帧）
func hellCounter(s: Dictionary, dist: float, eta: float, exact: bool) -> bool:
	var d: MoveDef = Moves.MOVES.get(s.name)
	var opts: Array = []
	if d == null or eta < 0.0:
		return false
	# 卸力要「刚按下去」：按下去那一帧离上一次按挡隔够 PARRY_LOCK；现在按着挡的话，得先松开一帧再按
	var pd := maxf(0.0, eta - 3.0)
	var freshBlock := f.clock + pd + 1.0 - f.blockPress >= C.PARRY_LOCK and (pd >= 1.0 or not f.prevBlock)
	if s.name == "dive":
		opts.append([18, "antiDive"])
		opts.append([5, "block"])
	elif d.air:
		var closing: float = s.get("vx", 0.0) * (1.0 if f.x >= s.x else -1.0)
		var pdist := dist - maxf(0.0, closing) * (M("palm").S + 1.0)
		if s.name == "airKick":
			opts.append([12, "duck"])
			if dist >= 105.0 and dist <= 175.0:
				opts.append([9, "kick"])
		if eta >= (1.0 if exact else M("palm").S - 7.0) and pdist <= M("palm").reach + 2.0:
			opts.append([16, "d:heavy"])
		if freshBlock:
			opts.append([10, "parry"])
		opts.append([4, "block"])
	elif d.kind == "grab":
		if d.low:
			opts.append([12, "wait"])
		else:
			opts.append([14, "duck"])
			if eta >= M("jab").S + 2.0 and dist <= effR("jab") - 4.0:
				opts.append([9, "jab"])
	elif d.tier == "super":
		if eta >= M("grab").S + 1.0 and dist <= M("grab").reach:
			opts.append([14, "grab"])
		if freshBlock:
			opts.append([20, "parry"])
		opts.append([6, "block"])
	elif slipable(d):
		var t := mini(3, slipWindow(dist) - 1)
		if t >= 0 and eta >= 3.0 + t:
			opts.append([26, "slip", t])
		if eta >= 8.0 and dist <= effR("kick") - 6.0:
			opts.append([13, "kick"])
		if freshBlock:
			opts.append([22, "parry"])
		opts.append([6, "block"])
	elif d.kind == "kick":
		if d.height == "low":
			if s.name == "sweep" and eta >= M("lowGrab").S + 1.0:
				opts.append([20, "d:grab"])
			opts.append([20, "cblock"])
			if freshBlock:
				opts.append([18, "parry"])
		else:
			if eta >= M("grab").S + 1.0 and dist <= d.reach + 6.0:
				opts.append([18, "grab"])
			if dist <= effR("jab") - 4.0 and eta >= 3.0:
				opts.append([16, "jab"])
			if freshBlock:
				opts.append([16, "parry"])
			opts.append([5, "block"])
	else:
		if d.height == "low":
			opts.append([8, "cblock"])
			if freshBlock:
				opts.append([10, "parry"])
		else:
			if d.tier == "light" and eta >= 2.0 and dist <= effR("heavy") - 6.0:
				opts.append([15, "heavy"])
			if freshBlock:
				opts.append([13, "parry"])
			opts.append([3, "block"])
	if opts.size() == 0:
		return false
	var best := 0.0
	for op in opts:
		best = maxf(best, float(op[0]))
	var near: Array = []
	for op in opts:
		if float(op[0]) >= best * 0.85:
			near.append(op)
	var c: Array = near[int(R() * near.size())]
	var H := f.inp
	var low := d.height == "low"
	aa = null
	match c[1]:
		"slip":
			var w: float = eta - 3.0 - c[2]
			if w > 0.0:
				todo = {"at": f.clock + w, "act": "slip"}
			else:
				slipIn()
			H.block = true
			return true
		"parry":
			if pd > 0.0:
				todo = {"at": f.clock + pd, "act": "parry", "low": low}
				return true
			f.noParry = false
			lowBlock = low
			blockT = 14
			H.block = true
			H.down = low
			return true
		"antiDive":
			antiDive = true
			return true
		"duck":
			duckT = maxf(12.0, s.remain + 8.0)
			H.down = true
			return true
		"wait":
			f.noParry = true
			lowBlock = false
			blockT = maxf(6.0, s.remain + 2.0)
			H.block = true
			return true
		"block", "cblock":
			f.noParry = true
			lowBlock = c[1] == "cblock" or low
			blockT = maxf(8.0, s.remain + 6.0)
			H.block = true
			H.down = lowBlock
			return true
	_press(c[1])
	return true

## 罚：对手还要 left 帧才能动，离 dist 远 —— 挑够得着、来得及、最疼的一套（击倒的优先）
func bestPunish(dist: float, left: float):
	var routes := [["heavy", ["heavy", "kick"], 27], ["jab", ["jab", "jab", "heavy"], 26], ["kick", ["kick", "kick"], 21], ["jab", ["jab", "heavy"], 20], ["d:kick", ["d:kick"], 8]]
	var best = null
	for rt in routes:
		var first: String = rt[0]
		var n := "sweep" if first == "d:kick" else first
		if dist > effR(n) - 6.0 or left < M(n).S + 1.0:
			continue
		if best == null or rt[2] > best[1]:
			best = [rt[1], rt[2]]
	return best[0] if best != null else null

func hellOffense(s: Dictionary, dist: float) -> bool:
	var Mm: Dictionary = memo
	if s.down:
		return false
	# 1) 打空的收招、落地硬直（看到的时候还剩几帧 - 反应）
	var react := float(L.react)
	var left := -1.0
	if s.phase == "r" and not s.confirmed and not s.air:
		left = s.rLeft - react
	elif s.landT > 3.0:
		left = s.landT - react
	var pkey := str(s.serial) + ":" + str(s.landT)
	if left > 0.0 and punishFor != pkey:
		var r = bestPunish(dist, left)
		if r != null:
			punishFor = pkey
			plan = (r as Array).duplicate()
			_press(plan.pop_front())
			return true
		# 终极：隔得远也冲过去罚（冲刺 + 冲势短拳）
		if L.has("inst") and dist <= 230.0 and left >= C.DASH_CANCEL + M("jab").S + 6.0:
			punishFor = pkey
			seq = [{"fwd": 1}, {}, {"fwd": 1}, {}, {}, {}, {}, {"fwd": 1, "press": "jab"}]
			plan = ["jab", "heavy"]
			return true
	if s.atk:
		return false
	# 2) 我刚被他挡住一下、我能动了：看他挡完以后爱干什么
	if pressTurn >= 0.0:
		var fresh := f.clock - pressTurn <= 2.0
		pressTurn = -1.0
		if fresh and dist <= 110.0:
			var a: Dictionary = Mm.after
			var tot: float = a.hit + a.hold + a.slip + a.move
			var ph: float = a.hit / tot
			var pdd: float = a.hold / tot
			var ps: float = a.slip / tot
			var r := R()
			if r < ph * 0.85:
				f.noParry = true
				lowBlock = false
				blockT = 12
				f.inp.block = true
				return true
			if r < ph * 0.85 + pdd * 0.9:
				if dist <= M("grab").reach - 4.0:
					_press("grab")
				else:
					_press("d:jab" if R() < 0.5 else "d:kick")
				return true
			if r < ph * 0.85 + pdd * 0.9 + ps:
				_press("jab")
				return true
	# 3) 预判：他在这个距离上老出同一招，有时候不等看见就先出破法
	if not s.blocking and not s.stun and not s.air:
		var m: Dictionary = Mm.open[bandOf(dist)]
		var tot := 0.0
		var top := ""
		for k in m:
			tot += m[k]
			if top == "" or m[k] > m[top]:
				top = k
		var pTop: float = (m[top] / tot) if (tot >= 8.0 and top != "") else 0.0
		if pTop >= 0.4 and R() < (pTop - 0.3) * 0.03:
			var pre := ""
			match top:
				"kick": pre = "grab" if dist <= M("kick").reach else ""
				"heavy": pre = "slip" if dist <= 120.0 else ""
				"jab": pre = "heavy" if dist <= 100.0 else ""
				"grab": pre = "d:jab"
				"sweep": pre = "up"
				"lowJab": pre = "heavy" if dist <= 100.0 else ""
				"air": pre = "d:heavy" if dist <= 140.0 else ""
				"jump": pre = "d:heavy" if dist <= 150.0 else ""
				"dive": pre = "jab"
			if pre == "slip":
				slipIn()
				f.inp.block = true
				return true
			if pre == "up":
				f.inp.press("up", f.clock)
				return true
			if pre != "":
				_press(pre)
				return true
	# 4) 他在挡：上下段、擒拿换着来
	if s.blocking and dist <= 120.0:
		var p := R()
		if not s.lowBlock:
			if dist <= M("grab").reach - 2.0 and p < 0.05:
				_press("grab")
				return true
			if p < 0.09:
				_press("d:jab" if dist <= 90.0 else "d:kick")
				return true
		else:
			if dist <= M("lowGrab").reach - 2.0 and p < 0.05:
				_press("d:grab")
				return true
			if dist <= 100.0 and p < 0.09:
				plan = ["heavy", "heavy"]
				_press("heavy")
				return true
	return false

## 记住对手的习惯（只记，不改战斗逻辑）。记得准不准（L.habit）：记的数乘这个，旧的慢慢淡掉
func learn(o: Fighter) -> void:
	var Mm: Dictionary = memo
	var w := Lf("habit") if (L.has("habit") and Lf("habit") != 0.0) else 0.5
	# 起身：开始起身那一帧看他滚不滚、往哪滚
	if o.state == "down" and o.downPhase == "getup":
		if not wakeLogged:
			wakeLogged = true
			var k := "stand" if o.rollDir == 0 else ("to" if o.rollDir * (f.x - o.x) > 0.0 else "away")
			Mm.wake[k] += 1.0
	elif o.state != "down":
		wakeLogged = false
	# 中立时先出手：他出了新招、这一招是一串的第一下、我这时候没在挨打 —— 记「在多远出了什么」
	var om: MoveState = o.move if o.state == "attack" else null
	var band: Dictionary = Mm.open[bandOf(absf(o.x - f.x))]
	if om != null and om.serial != openSeen:
		openSeen = om.serial
		var k: String = OPENER.get(om.name, "")
		if k != "" and (o.chain.size() <= 1 or om.air) and f.state != "hit" and f.state != "down" and f.state != "rise":
			for key in band.keys():
				band[key] *= 0.97
			band[k] = band.get(k, 0.0) + w
	# 他起跳（每一跳记一次）
	if o.state == "jumpsquat":
		if not jsSeen:
			jsSeen = true
			band["jump"] = band.get("jump", 0.0) + w
	else:
		jsSeen = false
	# 他在这个距离能出手的时候多常出手
	var started := om != null and om.serial != hzSer and not om.def.scripted
	if om != null:
		hzSer = om.serial
	if hzBand >= 0:
		Mm.hz[hzBand] = Mm.hz[hzBand] * 0.97 + (0.03 if started else 0.0)
	hzBand = bandOf(absf(o.x - f.x)) if (o.actionable() and not o.airborne() and f.state != "hit" and f.state != "down") else -1
	# 跳过来干什么、冲刺完干什么、跑满了跑到跟前干什么
	if o.state == "jumpsquat" and jw == null:
		jw = {"did": ""}
	if jw != null:
		if o.state == "attack" and o.move != null and o.move.air:
			jw.did = "dive" if o.move.def.dive else "air"
		if not o.airborne() and o.state != "jumpsquat" and o.state != "attack":
			_bump(Mm.jump, jw.did if jw.did != "" else "empty", w)
			jw = null
	if om != null and om.name == "dash" and dw != om.serial:
		dw = om.serial
		dwLeft = -1
	elif dw >= 0:
		if om != null and om.name != "dash":
			_bump(Mm.dash, "grab" if om.def.kind == "grab" else "strike", w)
			dw = -1
		elif om == null or om.name != "dash":
			if dwLeft < 0:
				dwLeft = int(C.DASH_IN_WIN) + 2
			dwLeft -= 1
			if dwLeft <= 0 or o.state == "hit" or o.airborne():
				_bump(Mm.dash, "none", w)
				dw = -1
	if o.state == "run" and o.runT >= C.RUN_CHARGE:
		rw = 8
	elif rw > 0:
		if om != null:
			_bump(Mm.run, "shoulder" if om.name == "shoulder" else ("grab" if om.def.kind == "grab" else "strike"), w)
			rw = 0
		else:
			var stop := o.airborne() or o.state == "jumpsquat" or o.state == "hit"
			if not stop:
				rw -= 1
				stop = rw <= 0
			if stop:
				if absf(o.x - f.x) <= 170.0:
					_bump(Mm.run, "stop", w)
				rw = 0
	# 我的招被他挡住：看他硬直一过先干什么（14 帧以内）
	if f.state == "attack" and f.move != null and f.move.blocked and afterWatch == null and o.state == "blockstun":
		afterWatch = {"phase": 0, "t": 0}
	var aw = afterWatch
	if aw != null:
		if om != null:
			Mm.after["slip" if om.name == "slip" else "hit"] += 1.0
			afterWatch = null
		elif aw.phase == 0:
			if o.state != "blockstun":
				aw.phase = 1
		else:
			aw.t += 1
			if aw.t > 14 or o.state == "hit" or o.state == "down":
				Mm.after["hold" if o.state == "block" else "move"] += 1.0
				afterWatch = null

static func _bump(T: Dictionary, k: String, w: float) -> void:
	for key in T.keys():
		T[key] *= 0.95
	T[k] += w
