class_name TradStyle
extends FightStyle
## 拳派「传统格斗」（trad）：对照 JS moves.js 的 MOVES / TIER_WIN / relation / CANCEL / pickVariant，数值一个不改。
## 招式表写的是基准帧数（S 前摇 / A 判定 / R 后摇），MoveDef.build() 换算。reach = 两人中心距（像素）。
## keys 关键帧按阶段写：0 起手 → 1 出手 → 2 判定结束 → 3 收招完；script 动作写 0~1（整段进度）。

static func J_(b: Dictionary, o: Dictionary) -> Dictionary:
	return b.merged(o, true)

# 常用姿势片段（短拳、后手直拳、重拳、腿踢、下蹲）
const P_JAB := {"tor": 14, "head": 4, "dx": 10, "hy": 69, "tw": 46, "fh": [58, -2], "bh": [7, -7], "ff": [38, 0], "bf": [-30, 0]}
const P_CROSS := {"tor": 18, "head": 4, "dx": 12, "hy": 68, "tw": -40, "bh": [62, -2], "fh": [9, -7], "ff": [36, 0], "bf": [-34, 0]}
const P_HEAVY := {"tor": 22, "head": 2, "dx": 21, "hy": 66, "tw": -48, "bh": [70, -3], "fh": [8, -6], "ff": [44, 0], "bf": [-40, 2]}
const P_KICK := {"tor": -33, "head": 11, "dx": 26.5, "hy": 75, "tw": 10, "ff": [100, 66], "bf": [-28, 0], "fh": [18, -12], "bh": [6, -6]}
const P_LOW := {"hy": 50, "tor": 28, "head": -6, "tw": 18, "ff": [28, 0], "bf": [-26, 0], "fh": [24, 2], "bh": [8, -3]}

# 克制：拳 > 腿 > 重 > 拳；腿 > 对空 > 空中；必杀 > 一切；打击 > 擒拿
const TIER_WIN := {
	"light": ["kick", "grab", "dive"],
	"heavy": ["light", "grab", "dive"],
	"kick": ["heavy", "aa", "grab"],
	"aa": ["air", "grab"],
	"air": ["light", "heavy", "kick", "grab"],
	"dive": ["aa", "grab"],
	"super": ["light", "heavy", "kick", "aa", "air", "dive", "grab"],
}
const CANCEL := {"jab": ["jab", "heavy", "kick", "grab"], "heavy": ["jab", "heavy", "kick"], "kick": ["jab", "heavy", "kick"], "grab": [], "push": []}
const AIR_OF := {"jab": "airJab", "heavy": "airHeavy", "kick": "airKick"}
const DOWN_OF := {"jab": "lowJab", "heavy": "palm", "kick": "sweep", "grab": "lowGrab"}

func _init() -> void:
	id = "trad"
	name = "传统格斗"
	cancel = CANCEL
	moves = build_moves()

static func beats(x: String, y: String) -> int:
	if x == y:
		return 0
	if TIER_WIN.has(x) and (TIER_WIN[x] as Array).has(y):
		return 1
	if TIER_WIN.has(y) and (TIER_WIN[y] as Array).has(x):
		return -1
	return 0

func relation(da: MoveDef, db: MoveDef) -> float:
	var r := beats(da.tier, db.tier)
	if r != 0:
		return float(r)
	return beats(da.lead, db.lead) * 0.5

## 连招变招：拳拳→后手直拳 拳拳拳→摆拳 拳×4、5→连珠快拳 拳×6→寸劲；拳重→崩拳 拳踢→鞭腿 拳拳重→冲天炮 拳拳踢→转身蹬；
## 重拳→顶肘 重重→劈挂掌 重踢→旋风腿；踢拳→落步冲拳 踢重→盖步砸拳 踢踢→二起脚
func variant(kind: String, chain: Array, air: bool, mod: String) -> String:
	return pickVariant(kind, chain, air, mod)

static func pickVariant(kind: String, chain: Array, air: bool, mod: String) -> String:
	if air:
		if mod == "down" and kind == "kick":
			return "dive"
		return AIR_OF.get(kind, "")
	if mod == "down":
		return DOWN_OF.get(kind, "")
	var jabs := 0
	var i := chain.size() - 1
	while i >= 0 and chain[i] == "jab":
		jabs += 1
		i -= 1
	var last: String = chain[chain.size() - 1] if chain.size() > 0 else ""
	if kind == "jab":
		if last == "heavy":
			return "elbow"
		if last == "kick":
			return "stepPunch"
		if jabs == 0:
			return "jab"
		if jabs == 1:
			return "jab2"
		if jabs == 2:
			return "jab3"
		if jabs >= C.JAB_CHAIN_MAX - 1:
			return "rushEnd"
		return "rushR" if jabs % 2 == 1 else "rushL"
	if kind == "heavy":
		if jabs >= 2:
			return "upper"
		if jabs == 1:
			return "beng"
		if last == "heavy":
			return "chop"
		if last == "kick":
			return "hammer"
		return "shoulder" if mod == "run" else "heavy"
	if kind == "kick":
		if last == "heavy":
			return "whirl"
		if last == "kick":
			return "twinKick"
		if jabs >= 2:
			return "backKick"
		return "whip" if jabs == 1 else "kick"
	return "grab"

static func build_moves() -> Dictionary:
	var JT := Pose.P_JTOP
	var JD := Pose.P_JDN
	var raw := {
		# ---- 拳系（light）：快，近身抢先；被重拳霸体吃掉，但能打断腿 ----
		"jab": {"kind": "jab", "label": "短拳", "open": true, "S": 4, "A": 3, "R": 7, "dmg": 6, "reach": 92, "stun": 13, "bstun": 7, "kb": 2.2, "stop": 4, "power": 0.3,
			"limb": "fh", "fx": "jab", "lunge": [1, 4, 5],
			"keys": [[0, {}], [1, P_JAB, "back"], [2, P_JAB], [2.45, J_(P_JAB, {"tor": 10, "dx": 6, "tw": 32, "fh": [38, -3], "ff": [34, 0]})], [3, {}]]},
		"jab2": {"kind": "jab", "label": "后手直拳", "tag": "后手直拳", "S": 4, "A": 3, "R": 7, "dmg": 7, "reach": 94, "stun": 13, "bstun": 7, "kb": 2.4, "stop": 4, "power": 0.35,
			"limb": "bh", "fx": "jab2", "lunge": [1, 4, 6],
			"keys": [[0, {}], [0.4, {"tw": 30, "fh": [22, -4], "tor": 4}], [1, P_CROSS, "back"], [2, P_CROSS], [2.45, J_(P_CROSS, {"tor": 12, "dx": 8, "tw": -24, "bh": [38, -3]})], [3, {}]]},
		"jab3": {"kind": "jab", "label": "摆拳", "tag": "摆拳", "S": 5, "A": 3, "R": 8, "dmg": 8, "reach": 90, "stun": 14, "bstun": 8, "kb": 2.8, "stop": 5, "power": 0.4,
			"limb": "fh", "fx": "hook", "lunge": [1, 5, 5],
			"keys": [[0, {}], [0.5, {"fh": [4, -8], "fe": -1, "tor": 0, "dx": -3, "head": 4, "tw": 0}],
				[1, {"fh": [46, -14], "fe": -1, "tor": 24, "dx": 10, "head": -4, "tw": 54, "hy": 68, "ff": [36, 0], "bf": [-30, 0], "bh": [7, -7]}, "back"],
				[2, {"fh": [48, -11], "fe": -1, "tor": 28, "dx": 10, "head": -4, "tw": 58, "hy": 68, "ff": [36, 0], "bf": [-30, 0], "bh": [7, -7]}], [3, {}]]},
		"rushL": {"kind": "jab", "label": "连珠快拳", "S": 3, "A": 3, "R": 6, "dmg": 5, "reach": 94, "stun": 13, "bstun": 7, "kb": 2.4, "stop": 3, "power": 0.3,
			"limb": "fh", "fx": "rush", "ghost": true, "lunge": [1, 3, 13], "rush": true,
			"keys": [[0, {"tor": 14}], [1, J_(P_JAB, {"tor": 20, "dx": 12, "fh": [60, 0]}), "back"], [2, J_(P_JAB, {"tor": 20, "dx": 12, "fh": [60, 0]})], [3, {"tor": 14}]]},
		"rushR": {"kind": "jab", "label": "连珠快拳", "S": 3, "A": 3, "R": 6, "dmg": 5, "reach": 94, "stun": 13, "bstun": 7, "kb": 2.4, "stop": 3, "power": 0.3,
			"limb": "bh", "fx": "rush", "ghost": true, "lunge": [1, 3, 13], "rush": true,
			"keys": [[0, {"tor": 14}], [1, J_(P_CROSS, {"tor": 22, "dx": 12}), "back"], [2, J_(P_CROSS, {"tor": 22, "dx": 12})], [3, {"tor": 14}]]},
		"rushEnd": {"kind": "jab", "label": "寸劲", "tag": "寸劲", "S": 5, "A": 3, "R": 12, "dmg": 10, "reach": 96, "stun": 16, "bstun": 10, "kb": 9, "stop": 7, "shake": 4, "power": 0.7,
			"limb": "fh", "fx": "rushEnd", "ghost": true, "lunge": [1, 5, 8], "ender": true, "noCancel": true,
			"keys": [[0, {"tor": 6, "dx": -6, "fh": [10, -4], "tw": 0}], [1, {"tor": 30, "dx": 24, "hy": 64, "head": -4, "tw": 50, "fh": [62, 0], "bh": [-4, 4], "ff": [48, 0], "bf": [-36, 0]}, "back"],
				[2, {"tor": 30, "dx": 24, "hy": 64, "head": -4, "tw": 50, "fh": [62, 0], "bh": [-4, 4], "ff": [48, 0], "bf": [-36, 0]}], [3, {}]]},
		"lowJab": {"kind": "jab", "label": "下盘拳", "open": true, "S": 5, "A": 3, "R": 8, "dmg": 5, "reach": 88, "stun": 12, "bstun": 7, "kb": 2, "stop": 4, "power": 0.3, "height": "low",
			"limb": "fh", "fx": "low", "lunge": [1, 5, 4],
			"keys": [[0, J_(P_LOW, {"fh": [24, -6]})], [1, J_(P_LOW, {"tor": 36, "dx": 10, "hy": 44, "tw": 40, "fh": [52, 30], "bh": [7, -5]}), "back"],
				[2, J_(P_LOW, {"tor": 36, "dx": 10, "hy": 44, "tw": 40, "fh": [52, 30], "bh": [7, -5]})], [3, J_(P_LOW, {"fh": [24, -6]})]]},
		"elbow": {"kind": "jab", "label": "顶肘", "tag": "顶肘", "lead": "heavy", "S": 4, "A": 3, "R": 9, "dmg": 9, "reach": 84, "stun": 14, "bstun": 8, "kb": 4, "stop": 5, "shake": 2, "power": 0.5,
			"limb": "fe", "fx": "elbow", "lunge": [1, 4, 10],
			"keys": [[0, {"tor": 14}], [0.5, {"tor": 2, "dx": -4, "tw": -10, "fh": [8, -12]}],
				[1, {"tor": 26, "dx": 24, "hy": 64, "head": -6, "tw": 60, "fh": [14, -5], "bh": [6, -6], "ff": [46, 0], "bf": [-32, 0]}, "back"],
				[2, {"tor": 26, "dx": 24, "hy": 64, "head": -6, "tw": 60, "fh": [14, -5], "bh": [6, -6], "ff": [46, 0], "bf": [-32, 0]}], [3, {}]]},
		"stepPunch": {"kind": "jab", "label": "落步冲拳", "tag": "落步冲拳", "lead": "kick", "S": 5, "A": 3, "R": 9, "dmg": 8, "reach": 100, "stun": 14, "bstun": 8, "kb": 3.5, "stop": 5, "power": 0.5,
			"limb": "bh", "fx": "jab2", "lunge": [1, 5, 24],
			"keys": [[0, {"tor": -4, "ff": [32, 30]}], [1, {"tor": 22, "dx": 26, "hy": 64, "head": -4, "tw": -46, "bh": [64, -2], "fh": [8, -7], "ff": [52, 0], "bf": [-38, 0]}, "back"],
				[2, {"tor": 22, "dx": 26, "hy": 64, "head": -4, "tw": -46, "bh": [64, -2], "fh": [8, -7], "ff": [52, 0], "bf": [-38, 0]}], [3, {}]]},

		# ---- 重系（heavy）：前摇里带霸体，能硬吃一记短拳；怕腿 ----
		"heavy": {"kind": "heavy", "label": "重拳", "open": true, "S": 11, "A": 4, "R": 13, "dmg": 13, "reach": 106, "stun": 18, "bstun": 11, "kb": 5.5, "stop": 8, "shake": 5, "power": 0.8, "heavy": true,
			"limb": "bh", "fx": "heavy", "lunge": [6, 11, 14], "armor": {"n": 1, "from": 2, "vs": ["light"]},
			"keys": [[0, {}], [0.3, {"tor": 2, "dx": -6, "hy": 68, "head": 4, "tw": 34, "fh": [32, -4], "bh": [-4, -8], "ff": [30, 0], "bf": [-36, 0]}, "out"],
				[0.9, {"tor": -6, "dx": -10, "hy": 67, "head": 6, "tw": 48, "fh": [36, -6], "bh": [-12, -10], "ff": [30, 0], "bf": [-40, 0]}],
				[1, P_HEAVY, "back"], [2, P_HEAVY], [2.5, J_(P_HEAVY, {"tor": 16, "dx": 14, "tw": -30, "bh": [44, -2]})], [3, {}]]},
		"beng": {"kind": "heavy", "label": "崩拳", "stamp": "崩拳", "lead": "light", "S": 9, "A": 4, "R": 13, "dmg": 19, "reach": 112, "stun": 19, "bstun": 12, "kb": 7, "stop": 10, "shake": 7, "power": 1, "heavy": true,
			"limb": "fh", "fx": "beng", "ghost": true, "lunge": [4, 9, 18],
			"keys": [[0, {}], [0.5, {"fh": [2, 4], "tor": 2, "hy": 64, "dx": -6, "tw": -10, "bh": [6, -6]}],
				[1, {"fh": [64, 4], "tor": 24, "dx": 30, "hy": 62, "tw": 50, "ff": [50, 0], "bf": [-14, 0], "head": -2, "bh": [-2, 8]}, "back"],
				[2, {"fh": [64, 4], "tor": 24, "dx": 30, "hy": 62, "tw": 50, "ff": [50, 0], "bf": [-14, 0], "head": -2, "bh": [-2, 8]}], [3, {}]]},
		"chop": {"kind": "heavy", "label": "劈挂掌", "stamp": "劈挂", "lead": "heavy", "height": "high", "S": 9, "A": 4, "R": 14, "dmg": 17, "reach": 104, "stun": 18, "bstun": 12, "kb": 6, "stop": 9, "shake": 6, "power": 0.9, "heavy": true,
			"limb": "bh", "fx": "chop", "ghost": true, "lunge": [4, 9, 12], "ender": true, "noCancel": true,
			"keys": [[0, {"tor": 12}], [0.6, {"tor": -16, "head": -8, "dx": -6, "hy": 72, "tw": 40, "bh": [-6, -60], "be": -1, "fh": [26, -8], "ff": [30, 0], "bf": [-32, 0]}],
				[1, {"tor": 40, "dx": 22, "hy": 60, "head": -2, "tw": -40, "bh": [56, 22], "fh": [-6, -2], "ff": [48, 0], "bf": [-36, 0]}, "out"],
				[2, {"tor": 42, "dx": 22, "hy": 60, "head": -2, "tw": -42, "bh": [54, 28], "fh": [-6, -2], "ff": [48, 0], "bf": [-36, 0]}], [3, {}]]},
		"hammer": {"kind": "heavy", "label": "盖步砸拳", "stamp": "盖步砸拳", "lead": "kick", "S": 9, "A": 5, "R": 15, "dmg": 20, "reach": 108, "stun": 20, "bstun": 12, "kb": 7, "stop": 10, "shake": 7, "power": 1, "heavy": true,
			"limb": "bh", "fx": "hammerFist", "ghost": true, "lunge": [2, 9, 26], "launch": 5, "ender": true, "noCancel": true,
			"keys": [[0, {"tor": 0}], [0.6, {"spin": 30, "tor": -10, "head": -12, "hy": 72, "tw": 30, "bh": [-20, -58], "be": -1, "fh": [18, -26], "ff": [12, 0], "bf": [-38, 0]}],
				[1, {"spin": 10, "tor": 48, "dx": 26, "hy": 56, "head": 4, "tw": -36, "bh": [50, 36], "fh": [-6, -4], "ff": [50, 0], "bf": [-32, 0]}, "out"],
				[2, {"spin": 10, "tor": 48, "dx": 26, "hy": 56, "head": 4, "tw": -36, "bh": [50, 36], "fh": [-6, -4], "ff": [50, 0], "bf": [-32, 0]}], [3, {"spin": 0}]]},
		"upper": {"kind": "heavy", "label": "冲天炮", "stamp": "冲天炮", "tier": "aa", "lead": "light", "S": 8, "A": 4, "R": 16, "dmg": 22, "reach": 98, "stun": 19, "bstun": 12, "kb": 3, "stop": 10, "shake": 7, "power": 1, "heavy": true,
			"limb": "bh", "fx": "upper", "ghost": true, "lunge": [4, 8, 9], "launch": 9, "noCancel": true, "ender": true, "antiAir": 120,
			"keys": [[0, {}], [0.5, {"bh": [14, 30], "hy": 50, "tor": 26, "fh": [16, -10], "dx": 4, "tw": 34}],
				[1, {"bh": [60, -30], "hy": 78, "tor": 6, "dx": 29, "bf": [-20, 10], "head": -10, "fh": [10, -8], "air": 6, "tw": -44, "ff": [42, 0]}, "out"],
				[2, {"bh": [30, -62], "hy": 82, "tor": -10, "dx": 22, "bf": [-14, 14], "head": -18, "fh": [8, -8], "air": 8, "tw": -40, "ff": [38, 0]}], [3, {}]]},
		"palm": {"kind": "heavy", "label": "托天掌", "stamp": "托天掌", "tier": "aa", "lead": "heavy", "open": true, "S": 7, "A": 5, "R": 15, "dmg": 11, "reach": 96, "stun": 15, "bstun": 10, "kb": 3, "stop": 8, "shake": 4, "power": 0.8,
			"limb": "fh", "fx": "palm", "ghost": true, "lunge": [2, 7, 6], "launchAir": 9, "antiAir": 160, "airInv": [1, 12], "ender": true, "noCancel": true,
			"keys": [[0, J_(P_LOW, {"fh": [20, 10], "bh": [10, 14]})], [0.5, J_(P_LOW, {"hy": 40, "fh": [24, 22], "bh": [14, 24], "tor": 34})],
				[1, {"hy": 76, "tor": 8, "head": -12, "fh": [54, -34], "bh": [48, -30], "ff": [42, 0], "bf": [-24, 6], "air": 4, "dx": 28, "tw": 14}, "out"],
				[2, {"hy": 80, "tor": -6, "head": -20, "fh": [34, -60], "bh": [24, -56], "ff": [36, 0], "bf": [-20, 8], "air": 6, "dx": 18, "tw": 10}], [3, {}]]},
		"shoulder": {"kind": "heavy", "label": "铁山靠", "stamp": "铁山靠", "lead": "heavy", "open": true, "S": 10, "A": 5, "R": 16, "dmg": 14, "reach": 96, "stun": 19, "bstun": 13, "kb": 11, "stop": 10, "shake": 8, "power": 1, "heavy": true,
			"limb": "sh", "fx": "shoulder", "ghost": true, "lunge": [2, 11, 44], "armor": {"n": 2, "from": 2, "vs": ["light"]}, "ender": true, "noCancel": true,
			"keys": [[0, {"tor": 12, "hy": 66}], [0.5, {"tor": 2, "dx": -8, "hy": 62, "head": -2, "tw": 30, "fh": [12, 28], "bh": [-8, 30], "ff": [26, 0], "bf": [-40, 0]}],
				[1, {"tor": 20, "dx": 40, "hy": 60, "head": -40, "tw": 80, "spin": 14, "fh": [8, 44], "bh": [-20, 34], "ff": [14, 0], "bf": [-46, 0]}, "out"],
				[2, {"tor": 20, "dx": 40, "hy": 60, "head": -40, "tw": 80, "spin": 14, "fh": [8, 44], "bh": [-20, 34], "ff": [14, 0], "bf": [-46, 0]}], [3, {}]]},

		# ---- 腿系（kick）：射程远，能打重拳；怕近身短拳，出腿时被拳打中会失衡倒地 ----
		"kick": {"kind": "kick", "label": "腿踢", "open": true, "S": 13, "A": 5, "R": 14, "dmg": 11, "reach": 126, "stun": 16, "bstun": 10, "kb": 4, "stop": 7, "shake": 4, "power": 0.75,
			"limb": "ff", "fx": "kick", "lunge": [6, 13, 12],
			"keys": [[0, {}], [0.55, {"ff": [30, 62], "tor": -8, "bf": [-27, 0], "fh": [22, -12], "bh": [6, -7], "head": 3, "hy": 74, "dx": 3, "tw": 10}],
				[1, P_KICK, "back"], [2, P_KICK], [2.4, {"ff": [36, 44], "tor": -14, "dx": 13, "hy": 74, "bf": [-27, 0]}], [3, {}]]},
		"whip": {"kind": "kick", "label": "鞭腿", "stamp": "鞭腿", "lead": "light", "S": 10, "A": 5, "R": 14, "dmg": 16, "reach": 122, "stun": 17, "bstun": 10, "kb": 6.5, "stop": 8, "shake": 5, "power": 0.85,
			"limb": "bf", "fx": "whip", "lunge": [5, 10, 10],
			"keys": [[0, {}], [0.5, {"bf": [10, 56], "tor": -10, "ff": [22, 0], "fh": [20, -14], "bh": [6, -6], "spin": 20, "hy": 74, "tw": 0}],
				[1, {"bf": [94, 96], "tor": -40, "dx": 22, "ff": [8, 0], "fh": [-4, -22], "bh": [2, -10], "head": 16, "spin": 30, "hy": 76, "tw": -10}, "back"],
				[2, {"bf": [94, 96], "tor": -40, "dx": 22, "ff": [8, 0], "fh": [-4, -22], "bh": [2, -10], "head": 16, "spin": 30, "hy": 76, "tw": -10}],
				[2.4, {"bf": [24, 48], "tor": -12, "dx": 12, "spin": 10, "hy": 72}], [3, {}]]},
		"twinKick": {"kind": "kick", "label": "二起脚", "stamp": "二起脚", "lead": "kick", "S": 8, "A": 5, "R": 16, "dmg": 15, "reach": 116, "stun": 18, "bstun": 11, "kb": 6, "stop": 9, "shake": 6, "power": 0.9,
			"limb": "bf", "fx": "twinKick", "ghost": true, "lunge": [2, 8, 22], "launch": 6, "ender": true, "noCancel": true,
			"keys": [[0, {"ff": [30, 30], "tor": 4}], [0.5, {"air": 24, "tor": 6, "head": 2, "ff": [30, 42], "bf": [-24, 16], "fh": [24, -36], "bh": [-14, -26], "hy": 66, "tw": 16}],
				[1, {"air": 34, "tor": -12, "head": 8, "dx": 25, "ff": [30, 26], "bf": [92, 112], "fh": [44, -2], "bh": [-30, -8], "hy": 66, "tw": -10}, "back"],
				[2, {"air": 30, "tor": -12, "head": 8, "dx": 25, "ff": [30, 26], "bf": [92, 112], "fh": [44, -2], "bh": [-30, -8], "hy": 66, "tw": -10}],
				[2.5, {"air": 6, "tor": 6, "ff": [32, 10], "bf": [-20, 12], "hy": 68}], [3, {}]]},
		"backKick": {"kind": "kick", "label": "转身蹬", "stamp": "转身蹬", "lead": "light", "S": 8, "A": 5, "R": 16, "dmg": 17, "reach": 116, "stun": 19, "bstun": 11, "kb": 11, "stop": 9, "shake": 6, "power": 0.9,
			"limb": "bf", "fx": "backKick", "ghost": true, "lunge": [2, 8, 12], "ender": true, "noCancel": true,
			"keys": [[0, {}], [0.5, {"spin": 130, "tor": 22, "head": 8, "bf": [-30, 36], "ff": [10, 0], "fh": [16, -10], "bh": [8, -8], "hy": 70, "tw": 0}],
				[1, {"spin": 180, "tor": 46, "head": 14, "dx": 16, "bf": [-104, 62], "ff": [8, 0], "fh": [20, 8], "bh": [10, 14], "hy": 72, "tw": 0}, "back"],
				[2, {"spin": 180, "tor": 46, "head": 14, "dx": 16, "bf": [-104, 62], "ff": [8, 0], "fh": [20, 8], "bh": [10, 14], "hy": 72, "tw": 0}],
				[2.5, {"spin": 270, "tor": 20, "bf": [-22, 22], "hy": 70}], [3, {"spin": 360}]]},
		"whirl": {"kind": "kick", "label": "旋风腿", "stamp": "旋风腿", "lead": "heavy", "S": 12, "A": 6, "R": 16, "dmg": 21, "reach": 126, "stun": 19, "bstun": 13, "kb": 6, "stop": 10, "shake": 8, "power": 1, "heavy": true,
			"limb": "ff", "fx": "whirl", "ghost": true, "lunge": [4, 12, 16], "launch": 7, "ender": true, "noCancel": true,
			"keys": [[0, {}], [0.4, {"spin": 90, "tor": -4, "ff": [14, 38], "air": 8, "fh": [-8, -36], "bh": [-16, -28], "hy": 70, "tw": 0}],
				[0.75, {"spin": 220, "ff": [66, 70], "tor": -22, "air": 22, "fh": [-6, -26], "bh": [-20, -6], "hy": 70}],
				[1, {"spin": 350, "ff": [100, 80], "tor": -36, "dx": 28, "air": 22, "fh": [-8, -26], "bh": [-24, 2], "hy": 70}, "out"],
				[2, {"spin": 360, "ff": [96, 72], "tor": -32, "dx": 28, "air": 10, "fh": [-8, -26], "bh": [-24, 2], "hy": 70}],
				[2.5, {"spin": 360, "ff": [36, 36], "tor": -8, "dx": 14, "hy": 70}], [3, {"spin": 360}]]},
		"sweep": {"kind": "kick", "label": "扫堂腿", "stamp": "扫堂腿", "height": "low", "S": 10, "A": 4, "R": 20, "dmg": 9, "reach": 112, "stun": 16, "bstun": 9, "kb": 4, "stop": 7, "shake": 4, "power": 0.7,
			"limb": "ff", "fx": "sweep", "lunge": [3, 10, 10], "launch": 3, "lie": 23, "ender": true, "noCancel": true,
			"keys": [[0, J_(P_LOW, {})],
				[0.45, {"hy": 34, "tor": 14, "head": -2, "dx": -4, "tw": 18, "bo": 80, "ff": [22, 4], "bf": [-4, 0], "fh": [22, -2], "bh": [8, -8]}],
				[1, {"hy": 35, "tor": 10, "head": -4, "dx": 4, "tw": 22, "bo": 85, "ft": 40, "ff": [72, 0], "bf": [-4, 0], "fh": [24, -2], "bh": [8, -8]}, "out"],
				[2, {"hy": 35, "tor": 10, "head": -4, "dx": 4, "tw": 22, "bo": 85, "ft": 46, "ff": [76, 0], "bf": [-4, 0], "fh": [24, -2], "bh": [8, -8]}],
				[2.5, {"hy": 38, "tor": 16, "head": -4, "dx": 0, "tw": 18, "bo": 50, "ff": [40, 2], "bf": [-12, 0], "fh": [24, 0], "bh": [8, -6]}], [3, J_(P_LOW, {})]]},

		# ---- 空中（上段：蹲着挡不住；飞踢可以蹲下躲） ----
		"airJab": {"kind": "jab", "label": "挥拳", "tier": "air", "lead": "light", "height": "high", "open": true, "S": 4, "A": 12, "R": 6, "dmg": 7, "reach": 98, "vreach": C.AIR_VREACH, "stun": 15, "bstun": 9, "kb": 2.6, "stop": 5, "power": 0.45,
			"limb": "fh", "fx": "airSwing", "air": true,
			"keys": [[0, JT], [0.55, J_(JT, {"rot": 4, "tor": -10, "head": -6, "fh": [-20, -50], "fe": -1, "bh": [8, -8], "ff": [20, 48], "bf": [-4, 42], "tw": 20})],
				[1, {"rot": 22, "tor": 30, "head": -8, "dx": 5.5, "fh": [60, 12], "bh": [6, -6], "ff": [18, 42], "bf": [-34, 26], "tw": 50}, "back"],
				[2, {"rot": 24, "tor": 32, "head": -8, "dx": 5.5, "fh": [58, 16], "bh": [6, -6], "ff": [18, 42], "bf": [-34, 26], "tw": 50}], [3, JD]]},
		"airHeavy": {"kind": "heavy", "label": "泰山压顶", "stamp": "泰山压顶", "tier": "air", "lead": "heavy", "height": "high", "open": true, "S": 10, "A": 11, "R": 10, "dmg": 12, "reach": 104, "vreach": C.AIR_VREACH, "stun": 19, "bstun": 12, "kb": 5, "stop": 9, "shake": 6, "power": 1, "heavy": true,
			"limb": "fh", "fx": "hammer", "air": true,
			"keys": [[0, JT], [0.7, {"rot": -8, "tor": -28, "head": -12, "fh": [-12, -60], "bh": [-22, -54], "fe": -1, "be": -1, "ff": [18, 56], "bf": [2, 50], "tw": 0}],
				[1, {"rot": 26, "tor": 50, "head": 18, "dx": 15, "fh": [56, 42], "bh": [50, 46], "ff": [22, 24], "bf": [-24, 36], "tw": 0}, "out"],
				[2, {"rot": 28, "tor": 52, "head": 18, "dx": 15, "fh": [54, 46], "bh": [48, 50], "ff": [22, 24], "bf": [-24, 36], "tw": 0}], [3, JD]]},
		"airKick": {"kind": "kick", "label": "飞踢", "stamp": "飞踢", "tier": "air", "lead": "kick", "height": "high", "open": true, "S": 9, "A": 13, "R": 9, "dmg": 11, "reach": 124, "vreach": C.AIR_VREACH, "stun": 18, "bstun": 11, "kb": 6, "stop": 8, "shake": 5, "power": 0.9,
			"limb": "ff", "fx": "airKick", "air": true, "ghost": true, "evadeCrouch": true,
			"keys": [[0, JT], [0.6, {"rot": -6, "tor": 12, "head": -6, "ff": [10, 62], "bf": [-6, 48], "fh": [24, -30], "bh": [6, -8], "tw": 10}],
				[1, {"rot": 14, "tor": -38, "head": 14, "dx": 19, "ff": [106, 24], "bf": [-12, 52], "fh": [-10, -24], "bh": [2, -10], "tw": 10}, "back"],
				[2, {"rot": 14, "tor": -38, "head": 14, "dx": 19, "ff": [106, 24], "bf": [-12, 52], "fh": [-10, -24], "bh": [2, -10], "tw": 10}], [3, JD]]},
		"dive": {"kind": "kick", "label": "千斤坠", "stamp": "千斤坠", "tier": "dive", "lead": "kick", "height": "high", "S": 15, "A": 40, "R": 8, "dmg": 10, "reach": 84, "vreach": 64, "stun": 19, "bstun": 10, "kb": 2, "stop": 8, "shake": 6, "power": 0.9,
			"limb": "ff", "fx": "dive", "air": true, "ghost": true, "dive": true, "aaProof": true,
			"keys": [[0, JT], [0.7, {"rot": -8, "tor": 8, "head": 4, "ff": [22, 60], "bf": [-10, 46], "fh": [16, -46], "bh": [-24, -36], "tw": 0}],
				[1, {"rot": -42, "tor": 2, "head": 12, "ff": [16, -16], "bf": [-22, 36], "fh": [-26, -30], "bh": [-36, -12], "tw": 0}, "out"],
				[2, {"rot": -42, "tor": 2, "head": 12, "ff": [16, -16], "bf": [-22, 36], "fh": [-26, -30], "bh": [-36, -12], "tw": 0}], [3, JD]]},

		# ---- 擒拿（挡不住；出腿时被拿 = 接腿摔；被任何正在判定中的打击打断） ----
		"grab": {"kind": "grab", "label": "擒拿", "open": true, "S": 6, "A": 4, "R": 15, "dmg": 6, "reach": 84, "power": 0.4,
			"limb": "fh", "lunge": [2, 6, 8],
			"keys": [[0, {}], [0.4, {"fh": [12, 2], "bh": [8, 4], "tor": 4, "dx": -4, "hy": 70, "tw": 0}],
				[1, {"fh": [54, 16], "bh": [50, 20], "tor": 30, "dx": 18, "hy": 64, "ff": [42, 0], "bf": [-26, 0], "head": -8, "tw": 0}, "out"],
				[2, {"fh": [54, 16], "bh": [50, 20], "tor": 30, "dx": 18, "hy": 64, "ff": [42, 0], "bf": [-26, 0], "head": -8, "tw": 0}], [3, {}]]},
		"grabHit": {"kind": "script", "label": "推开", "S": 0, "A": 0, "R": 16, "script": true, "evPush": 4,
			"keys": [[0, {"fh": [32, 8], "bh": [26, 12], "tor": 10, "dx": 4, "hy": 66, "tw": 0}],
				[0.25, {"fh": [66, -4], "bh": [60, 0], "tor": 32, "dx": 22, "hy": 64, "ff": [44, 0], "bf": [-18, 0], "tw": 0}, "back"],
				[0.5, {"fh": [66, -4], "bh": [60, 0], "tor": 32, "dx": 22, "hy": 64, "ff": [44, 0], "bf": [-18, 0], "tw": 0}], [1, {}]]},
		"throwBack": {"kind": "script", "label": "过肩摔", "S": 0, "A": 0, "R": 30, "script": true, "evSlam": 14,
			"keys": [[0, {"fh": [34, 4], "bh": [28, 8], "tor": 20, "hy": 62, "head": -6, "ff": [34, 0], "bf": [-32, 0], "tw": 0}],
				[0.13, {"fh": [16, 2], "bh": [8, 6], "tor": 10, "hy": 52, "dx": 2, "head": -4, "ff": [36, 0], "bf": [-34, 0], "tw": 0}],
				[0.3, {"fh": [4, -56], "bh": [-6, -52], "fe": -1, "be": -1, "tor": -14, "head": -18, "hy": 74, "dx": -4, "ff": [32, 0], "bf": [-36, 0], "tw": 0}],
				[0.47, {"fh": [-44, 24], "bh": [-50, 28], "tor": -38, "head": -20, "hy": 58, "dx": -10, "ff": [40, 0], "bf": [-28, 0], "tw": 0}, "out"],
				[0.62, {"fh": [-40, 28], "bh": [-46, 32], "tor": -32, "head": -16, "hy": 56, "dx": -8, "ff": [40, 0], "bf": [-28, 0], "tw": 0}], [1, {}]]},
		"legCatch": {"kind": "script", "label": "接腿摔", "S": 0, "A": 0, "R": 26, "script": true, "evSlam": 13,
			"keys": [[0, {"fh": [50, 30], "bh": [44, 34], "tor": 24, "dx": 14, "hy": 66, "tw": 0}],
				[0.25, {"fh": [30, 4], "bh": [22, 8], "tor": -12, "dx": -2, "hy": 74, "head": -12, "tw": 0}],
				[0.5, {"fh": [36, 48], "bh": [26, 52], "tor": 46, "dx": 12, "hy": 54, "head": 10, "tw": 0}, "out"],
				[0.7, {"fh": [36, 48], "bh": [26, 52], "tor": 46, "dx": 12, "hy": 54, "head": 10, "tw": 0}], [1, {}]]},
		"lowGrab": {"kind": "grab", "label": "抄腿", "low": true, "height": "low", "open": true, "S": 8, "A": 4, "R": 16, "dmg": 0, "reach": 88, "power": 0.5,
			"limb": "fh", "lunge": [2, 8, 14],
			"keys": [[0, J_(P_LOW, {"fh": [20, 8], "bh": [10, 12]})], [0.5, J_(P_LOW, {"hy": 40, "tor": 22, "fh": [8, 10], "bh": [-4, 14], "dx": -4})],
				[1, {"hy": 36, "tor": 54, "dx": 20, "head": -14, "fh": [60, 50], "bh": [54, 54], "ff": [46, 0], "bf": [-36, 0], "tw": 0}, "out"],
				[2, {"hy": 36, "tor": 54, "dx": 20, "head": -14, "fh": [60, 50], "bh": [54, 54], "ff": [46, 0], "bf": [-36, 0], "tw": 0}], [3, J_(P_LOW, {})]]},
		"hold": {"kind": "script", "label": "擒住", "S": 0, "A": 0, "R": 10, "script": true,
			"keys": [[0, {"fh": [50, 18], "bh": [44, 22], "tor": 28, "dx": 14, "hy": 64, "ff": [38, 0], "bf": [-24, 0], "tw": 0}],
				[0.5, {"fh": [34, 10], "bh": [28, 14], "tor": 14, "dx": 6, "hy": 66, "head": 2, "ff": [34, 0], "bf": [-28, 0], "tw": 0}],
				[1, {"fh": [30, 8], "bh": [24, 12], "tor": 10, "dx": 4, "hy": 66, "head": 4, "ff": [34, 0], "bf": [-30, 0], "tw": 0}]]},
		"knee": {"kind": "script", "label": "提膝撞", "S": 0, "A": 0, "R": 22, "script": true, "evHit": 5, "evHit2": 13,
			"keys": [[0, {"fh": [30, 8], "bh": [24, 12], "tor": 10, "dx": 4, "hy": 66, "tw": 0}],
				[0.2, {"fh": [26, 14], "bh": [20, 18], "tor": -10, "dx": 8, "hy": 72, "head": 8, "ff": [36, 62], "bf": [-20, 0], "tw": 0}, "out"],
				[0.36, {"fh": [30, 8], "bh": [24, 12], "tor": 8, "dx": 4, "hy": 66, "ff": [26, 4], "bf": [-26, 0], "tw": 0}],
				[0.56, {"fh": [26, 14], "bh": [20, 18], "tor": -12, "dx": 10, "hy": 72, "head": 8, "ff": [38, 66], "bf": [-20, 0], "tw": 0}, "out"],
				[0.75, {"fh": [44, -4], "bh": [38, 0], "tor": 18, "dx": 10, "hy": 64, "ff": [32, 0], "bf": [-32, 0], "tw": 0}], [1, {}]]},
		"trip": {"kind": "script", "label": "别腿摔", "S": 0, "A": 0, "R": 24, "script": true, "evSlam": 9,
			"keys": [[0, {"fh": [30, 8], "bh": [24, 12], "tor": 10, "dx": 4, "hy": 66, "tw": 0}],
				[0.25, {"fh": [40, -6], "bh": [34, -2], "tor": 24, "dx": 16, "hy": 64, "ff": [60, 8], "bf": [-24, 0], "head": -8, "tw": 0}],
				[0.4, {"fh": [56, 26], "bh": [50, 30], "tor": 46, "dx": 22, "hy": 56, "ff": [64, 0], "bf": [-32, 0], "head": 4, "tw": 0}, "out"],
				[0.6, {"fh": [52, 34], "bh": [46, 38], "tor": 44, "dx": 20, "hy": 56, "ff": [58, 0], "bf": [-34, 0], "tw": 0}], [1, {}]]},
		"tackle": {"kind": "script", "label": "抱腿摔", "S": 0, "A": 0, "R": 26, "script": true, "evSlam": 10,
			"keys": [[0, {"hy": 36, "tor": 54, "dx": 20, "head": -14, "fh": [56, 50], "bh": [50, 54], "ff": [46, 0], "bf": [-36, 0], "tw": 0}],
				[0.3, {"hy": 48, "tor": 38, "dx": 30, "head": -8, "fh": [44, 20], "bh": [38, 24], "ff": [58, 0], "bf": [-42, 0], "tw": 0}],
				[0.45, {"hy": 58, "tor": 28, "dx": 34, "head": -4, "fh": [50, -16], "bh": [44, -12], "ff": [60, 0], "bf": [-38, 0], "tw": 0}, "out"],
				[0.65, {"hy": 56, "tor": 32, "dx": 30, "fh": [48, 4], "bh": [42, 8], "ff": [56, 0], "bf": [-38, 0], "tw": 0}], [1, {}]]},
		"scoop": {"kind": "script", "label": "抄腿摔", "S": 0, "A": 0, "R": 26, "script": true, "evSlam": 12,
			"keys": [[0, {"hy": 38, "tor": 48, "dx": 18, "head": -12, "fh": [58, 48], "bh": [52, 52], "ff": [46, 0], "bf": [-36, 0], "tw": 0}],
				[0.3, {"hy": 62, "tor": 10, "dx": 10, "head": -14, "fh": [46, -10], "bh": [40, -6], "ff": [42, 0], "bf": [-32, 0], "tw": 0}],
				[0.5, {"hy": 70, "tor": -16, "dx": 4, "head": -20, "fh": [30, -54], "bh": [24, -50], "ff": [36, 0], "bf": [-32, 0], "tw": 0}, "out"],
				[0.7, {"hy": 66, "tor": 6, "dx": 6, "fh": [40, -20], "bh": [34, -16], "ff": [36, 0], "bf": [-32, 0], "tw": 0}], [1, {}]]},

		# ---- 防守反击 ----
		"shove": {"kind": "push", "label": "推挡", "tier": "push", "S": 2, "A": 4, "R": 12, "dmg": 0, "reach": 108, "stun": 9, "bstun": 0, "kb": C.PUSH_KB, "stop": 4, "power": 0.3,
			"limb": "fh", "fx": "shove", "push": true, "sinv": [0, 6], "noCancel": true,
			"keys": [[0, {"fh": [17, -17], "bh": [13, -13], "tor": 2, "head": 8, "dx": -3, "hy": 70, "tw": 8}],
				[1, {"fh": [64, -12], "bh": [60, -6], "tor": 28, "dx": 37, "hy": 64, "head": -4, "ff": [50, 0], "bf": [-32, 0], "tw": 10}, "back"],
				[2, {"fh": [64, -12], "bh": [60, -6], "tor": 28, "dx": 37, "hy": 64, "head": -4, "ff": [50, 0], "bf": [-32, 0], "tw": 10}], [3, {}]]},
		"jieQuan": {"kind": "heavy", "label": "截拳", "stamp": "截拳", "tier": "heavy", "lead": "heavy", "S": 5, "A": 4, "R": 16, "dmg": 11, "reach": 104, "stun": 18, "bstun": 10, "kb": 9, "stop": 9, "shake": 5, "power": 0.9, "heavy": true,
			"limb": "fh", "fx": "beng", "ghost": true, "lunge": [0, 5, 18], "sinv": [0, 6], "cost": C.GC_COST, "ender": true, "noCancel": true,
			"keys": [[0, {"hy": 70, "tor": 2, "head": 8, "dx": -3, "tw": 8, "fh": [17, -17], "bh": [13, -13], "ff": [24, 0], "bf": [-33, 0]}],
				[0.5, {"hy": 68, "tor": 8, "head": 4, "dx": -2, "tw": 24, "fh": [26, -10], "bh": [9, -8], "ff": [28, 0], "bf": [-33, 0]}],
				[1, {"hy": 64, "tor": 24, "head": -4, "dx": 17, "tw": 50, "fh": [64, -4], "bh": [6, -6], "ff": [46, 0], "bf": [-36, 0]}, "back"],
				[2, {"hy": 64, "tor": 24, "head": -4, "dx": 17, "tw": 50, "fh": [64, -4], "bh": [6, -6], "ff": [46, 0], "bf": [-36, 0]}], [3, {}]]},
		"stomp": {"kind": "kick", "label": "踩腿", "stamp": "踩腿", "height": "low", "S": 4, "A": 4, "R": 14, "dmg": 12, "reach": 122, "stun": 16, "bstun": 9, "kb": 4, "stop": 9, "shake": 6, "power": 0.9,
			"limb": "ff", "fx": "stomp", "lunge": [1, 4, 24], "launch": 4, "lie": 27, "ender": true, "noCancel": true,
			"keys": [[0, J_(P_LOW, {"ff": [30, 0]})], [0.6, {"hy": 72, "tor": -8, "head": 6, "dx": 4, "ff": [30, 66], "bf": [-22, 0], "fh": [26, -14], "bh": [6, -8], "tw": 10}],
				[1, {"hy": 62, "tor": 22, "head": -10, "dx": 22, "ff": [76, 4], "bf": [-26, 0], "fh": [22, -6], "bh": [6, -6], "tw": 10}, "out"],
				[2, {"hy": 62, "tor": 22, "head": -10, "dx": 22, "ff": [76, 2], "bf": [-26, 0], "fh": [22, -6], "bh": [6, -6], "tw": 10}], [3, {}]]},
		"dash": {"kind": "script", "label": "冲刺", "S": 0, "A": 0, "R": 16, "script": true, "lunge": [0, 10, 96], "inv": [0, 8],
			"keys": [[0, {"hy": 62, "tor": 22, "head": -6, "ff": [32, 0], "bf": [-28, 0], "fh": [18, -6], "bh": [8, -6], "tw": 10}],
				[0.12, {"hy": 56, "tor": 34, "head": -14, "dx": 8, "ff": [50, 8], "bf": [-62, 14], "fh": [14, 2], "bh": [-30, 6], "tw": 10}, "out"],
				[0.45, {"hy": 54, "tor": 32, "head": -12, "dx": 10, "ff": [52, 2], "bf": [-62, 6], "fh": [16, 0], "bh": [-30, 4], "tw": 10}],
				[0.7, {"hy": 60, "tor": 16, "head": -6, "dx": 4, "ff": [44, 0], "bf": [-46, 0], "fh": [26, -14], "bh": [10, -8], "tw": 16}], [1, {}]]},
		"slip": {"kind": "script", "label": "闪身", "S": 0, "A": 0, "R": 22, "script": true, "lunge": [0, 11, 110], "slipInv": [0, 11],
			"keys": [[0, {"hy": 58, "tor": 24, "head": 4, "dx": -2, "fh": [14, -22], "bh": [18, -12], "fe": -1, "ff": [30, 0], "bf": [-32, 0], "tw": 8}],
				[0.14, {"hy": 46, "tor": 42, "head": -4, "dx": 12, "fh": [18, -20], "bh": [20, -8], "fe": -1, "ff": [52, 6], "bf": [-54, 12], "tw": 8}, "out"],
				[0.48, {"hy": 46, "tor": 40, "head": -4, "dx": 12, "fh": [18, -20], "bh": [20, -8], "fe": -1, "ff": [48, 2], "bf": [-56, 8], "tw": 8}],
				[0.72, {"hy": 64, "tor": 12, "head": 6, "dx": 2, "fh": [14, -22], "bh": [16, -12], "fe": -1, "ff": [28, 0], "bf": [-32, 0], "tw": 8}], [1, {}]]},
		"slipElbow": {"kind": "heavy", "label": "回身肘", "stamp": "回身肘", "tier": "heavy", "lead": "heavy", "S": 5, "A": 3, "R": 12, "dmg": 10, "reach": 86, "stun": 18, "bstun": 10, "kb": C.STAGGER_KB,
			"stop": 8, "shake": 4, "power": 0.8, "limb": "fe", "fx": "slipElbow", "ghost": true, "lunge": [0, 5, 18], "stagger": true, "ender": true, "noCancel": true,
			"keys": [[0, {"spin": 165, "tor": 24, "hy": 58, "head": 2, "fh": [14, -18], "bh": [16, -12], "fe": -1, "ff": [30, 0], "bf": [-32, 0], "tw": 0}],
				[0.55, {"spin": 95, "tor": 6, "hy": 66, "head": -4, "dx": -4, "fh": [-8, -8], "bh": [8, -10], "ff": [24, 0], "bf": [-36, 0], "tw": -20}],
				[1, {"spin": 8, "tor": 26, "dx": 24, "hy": 64, "head": -6, "fh": [14, -5], "bh": [6, -6], "ff": [46, 0], "bf": [-32, 0], "tw": 60}, "back"],
				[2, {"spin": 4, "tor": 26, "dx": 24, "hy": 64, "head": -6, "fh": [14, -5], "bh": [6, -6], "ff": [46, 0], "bf": [-32, 0], "tw": 60}], [3, {}]]},
		"burst": {"kind": "script", "label": "爆气", "S": 0, "A": 0, "R": 22, "script": true, "inv": [0, 18], "evWave": 3,
			"keys": [[0, {"tor": 28, "hy": 54, "head": 10, "fh": [8, 12], "bh": [4, 14], "tw": 0}],
				[0.14, {"tor": -18, "head": -22, "hy": 78, "fh": [42, -54], "bh": [-40, -52], "fe": -1, "be": -1, "ff": [42, 0], "bf": [-42, 0], "air": 6, "tw": 0}, "out"],
				[0.5, {"tor": -14, "head": -18, "hy": 76, "fh": [40, -48], "bh": [-38, -46], "fe": -1, "be": -1, "ff": [42, 0], "bf": [-42, 0], "air": 2, "tw": 0}], [1, {}]]},
		"super": {"kind": "heavy", "label": "泼墨", "stamp": "泼墨", "tier": "super", "S": 10, "A": 6, "R": 22, "dmg": 50, "reach": 136, "stun": 24, "bstun": 15, "kb": 8, "stop": 16, "shake": 12, "power": 1.2, "heavy": true,
			"limb": "bh", "fx": "splash", "ghost": true, "lunge": [6, 10, 34], "armor": {"n": 99, "from": 0, "vs": ["light", "heavy", "kick", "aa", "air", "dive", "push"]},
			"launch": 8, "ender": true, "noCancel": true, "cost": C.QI_MAX, "antiAir": 40,
			"keys": [[0, {}], [0.2, {"tor": 2, "dx": -4, "hy": 64, "head": 4, "tw": 24, "bh": [-12, 22], "fh": [28, -8], "ff": [28, 0], "bf": [-38, 0]}, "out"],
				[0.75, {"tor": -6, "dx": -8, "hy": 60, "head": 6, "tw": 36, "bh": [-22, 28], "fh": [32, -10], "ff": [30, 0], "bf": [-42, 0]}],
				[1, {"tor": 28, "dx": 46, "hy": 58, "head": -6, "tw": -50, "bh": [78, -2], "fh": [4, -4], "ff": [62, 0], "bf": [-44, 0]}, "back"],
				[2, {"tor": 28, "dx": 46, "hy": 58, "head": -6, "tw": -50, "bh": [78, -2], "fh": [4, -4], "ff": [62, 0], "bf": [-44, 0]}], [3, {}]]},
	}
	var out := {}
	for k in raw:
		out[k] = MoveDef.build(k, raw[k])
	return out
