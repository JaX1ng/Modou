class_name Moves
extends RefCounted
## 拳派登记处 + 招式相关的公用小函数（对照 JS moves.js 最后一段）。
## 现在只有一派「传统格斗」（trad）。电脑 AI、训练场面板直接读 Moves.MOVES（传统格斗专用）。

const STYLE_DEFAULT := "trad"
const TIER_NAME := {"light": "拳", "heavy": "重", "kick": "腿", "aa": "对空", "air": "空", "dive": "坠", "super": "必杀", "grab": "拿", "push": "推"}

static var STYLES := {}       # id → FightStyle
static var MOVES := {}        # 传统格斗的招式表（招名 → MoveDef）
## 跨派的规矩（以后加）：'trad|taiji' → Callable(dA: MoveDef, dB: MoveDef) -> float
static var MATCHUPS := {}

static func _static_init() -> void:
	var trad := TradStyle.new()
	STYLES[trad.id] = trad
	MOVES = trad.moves

static func styleOf(style_id: String) -> FightStyle:
	return STYLES.get(style_id if style_id != "" else STYLE_DEFAULT, STYLES[STYLE_DEFAULT])

## 两个人的招撞在一起谁克谁（combat 交手）：同一派照这一派的 relation；不同派查 MATCHUPS（反过来写的那一对取负号）
static func clashRelation(A, B) -> float:
	var a: String = A.style
	var b: String = B.style
	if a == b:
		return (STYLES[a] as FightStyle).relation(A.move.def, B.move.def)
	if MATCHUPS.has(a + "|" + b):
		return MATCHUPS[a + "|" + b].call(A.move.def, B.move.def)
	if MATCHUPS.has(b + "|" + a):
		return -MATCHUPS[b + "|" + a].call(B.move.def, A.move.def)
	push_error("拳派「%s」和「%s」之间谁克谁还没算（MATCHUPS 里没写 %s|%s）" % [STYLES[a].name, STYLES[b].name, a, b])
	return 0.0

## 主系克制（传统格斗的表；combat 里「破招、倒栽葱、化解」这些反应用）
static func beats(x: String, y: String) -> int:
	return TradStyle.beats(x, y)

## AI 用：按某个键大约够多远
static func reachOf(k: String) -> float:
	match k:
		"jab": return 96.0
		"heavy": return 112.0
		"kick": return 128.0
		"grab": return 84.0
		"d:jab": return 92.0
		"d:kick": return 120.0
		"d:heavy": return 100.0
		"d:grab": return 96.0
	return 90.0
