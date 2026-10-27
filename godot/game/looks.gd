class_name Looks
extends RefCounted
## 人物颜色（对照 JS game.js 的 Looks）：人机（自己的颜色、电脑的颜色：随机或指定一个）、双人（两边各一个）。
## 存在这台电脑上（user://looks.json）。联机的颜色两边商量（NetSession.looks），不在这里。
## 3.0：默认玩家一「墨」（白袍侠）、电脑 / 玩家二「赭」（土黄僧袍）—— 照参考图那两位。

const PATH := "user://looks.json"

static var solo := {"me": "ink", "cpu": "ochre"}
static var pvp := ["ink", "ochre"]
static var _loaded := false

static func load_looks() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(PATH):
		return
	var f := FileAccess.open(PATH, FileAccess.READ)
	if f == null:
		return
	var d = JSON.parse_string(f.get_as_text())
	if typeof(d) != TYPE_DICTIONARY:
		return
	var s = d.get("solo")
	if typeof(s) == TYPE_DICTIONARY:
		if not C.lookOf(str(s.get("me", ""))).is_empty():
			solo.me = str(s.me)
		var c := str(s.get("cpu", ""))
		if c == "random" or not C.lookOf(c).is_empty():
			solo.cpu = c
	var p = d.get("pvp")
	if typeof(p) == TYPE_ARRAY and p.size() == 2 and not C.lookOf(str(p[0])).is_empty() and not C.lookOf(str(p[1])).is_empty() and str(p[0]) != str(p[1]):
		pvp = [str(p[0]), str(p[1])]
	if solo.cpu == solo.me:
		solo.cpu = "random"

static func save() -> void:
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({"solo": solo, "pvp": pvp}))

## 电脑穿什么颜色：指定了（又不和玩家撞）就用那个，不然从剩下的里随机挑一个
static func cpu_look() -> String:
	var me: String = solo.me
	var c: String = solo.cpu
	if c != "random" and c != me and not C.lookOf(c).is_empty():
		return c
	var rest := []
	for p in C.PALETTE:
		if p.id != me:
			rest.append(p.id)
	return rest[randi() % rest.size()]

## 自己换颜色（人机）：电脑要是正好是这个颜色，电脑改回随机
static func set_me(id: String) -> void:
	solo.me = id
	if solo.cpu == id:
		solo.cpu = "random"
	save()

## 这个模式两边穿什么：[玩家一, 玩家二]。online 用 net_looks（{h, g}）
static func for_mode(mode: String, net_looks: Dictionary = {}) -> Array:
	if mode == "pvp":
		return [pvp[0], pvp[1]]
	if mode == "online" and not net_looks.is_empty():
		return [net_looks.h, net_looks.g]
	return [solo.me, cpu_look()]
