class_name FightStyle
extends RefCounted
## 拳派（对照 JS moves.js 的 STYLES）。一个拳派 = 一整套：招式表 moves、交手关系 relation、取消规则 cancel、连招变招 variant。
## 以后加新拳派（新角色、新技能）：新建一个 FightStyle 的子类（照 styles/trad.gd 的写法），在 Moves.STYLES 里登记；
## 跨派谁克谁在 Moves.MATCHUPS 里专门写（没写就报错，不会悄悄套用某一派自己的规矩）。

var id := ""
var name := ""
var moves := {}         # 招名 → MoveDef
var cancel := {}        # 这一招的种类 → 收招里能接哪几类

## 两招交手：1 克，0.5 压，0 平，-0.5 被压，-1 被克
func relation(_da: MoveDef, _db: MoveDef) -> float:
	return 0.0

## 连招变招：按的是哪个键（kind）、这一串前面按过什么（chain）、在不在空中、mod（'down' 按着蹲 / 'run' 跑起来了）→ 招名（"" = 出不了）
func variant(_kind: String, _chain: Array, _air: bool, _mod: String) -> String:
	return ""
