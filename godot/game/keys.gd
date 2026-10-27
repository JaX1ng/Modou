class_name Keys
extends RefCounted
## 键位（对照 JS input.js 的 Keys）：三套 —— 单人（人机 / 联机 / 训练场）、双人对战的玩家一、玩家二。每个动作两格。
## 键用 JS 那种名字（KeyA、ShiftLeft、ArrowLeft、Numpad1、Mouse2……），存在 user://keys.json。
## 冲刺怎么按（每套各选各的）：tap 双击方向（默认）/ key 冲刺键 / both 两种都用。
## 双人对战时两人都绑了的键归玩家二。

const ACTIONS := [["left", "左"], ["right", "右"], ["up", "跳"], ["down", "蹲"], ["jab", "短拳"], ["heavy", "重拳"], ["kick", "腿踢"], ["block", "格挡"], ["grab", "擒拿"], ["dash", "冲刺"]]
const DASH_MODES := ["tap", "key", "both"]
const MAP_P1 := {"KeyA": "left", "KeyD": "right", "KeyW": "up", "KeyS": "down", "KeyF": "jab", "KeyG": "heavy", "KeyH": "kick", "KeyR": "block", "KeyT": "grab", "ShiftLeft": "dash"}
const MAP_P2 := {"ArrowLeft": "left", "ArrowRight": "right", "ArrowUp": "up", "ArrowDown": "down", "Comma": "jab", "Period": "heavy", "Slash": "kick", "KeyL": "block", "Semicolon": "grab", "ShiftRight": "dash"}
const MAP_P2X := {"Numpad1": "jab", "Numpad2": "heavy", "Numpad3": "kick", "Numpad4": "block", "Numpad5": "grab", "Numpad0": "dash"}
const NO_BIND := ["Escape", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight", "ContextMenu"]
const STORE := "user://keys.json"
const MOUSE_NAME := ["鼠标左键", "鼠标中键", "鼠标右键", "鼠标侧键·后", "鼠标侧键·前"]

static var solo := {}
static var p1 := {}
static var p2 := {}
static var map := {}
static var map1 := {}
static var map2 := {}

static func act_name(a: String) -> String:
	for e in ACTIONS:
		if e[0] == a:
			return e[1]
	return a

static func _code_of(m: Dictionary, a: String):
	for k in m:
		if m[k] == a:
			return k
	return null

static func defaults(second := false) -> Dictionary:
	var o := {}
	for e in ACTIONS:
		var a: String = e[0]
		o[a] = [_code_of(MAP_P2, a), _code_of(MAP_P2X, a)] if second else [_code_of(MAP_P1, a), null]
	o.dashMode = "tap"
	return o

## 一套键位：每个动作两格 + dashMode。旧的存档没有冲刺这一行：补上默认的
static func clone_keys(k: Dictionary, def = null) -> Dictionary:
	var o := {}
	for e in ACTIONS:
		var a: String = e[0]
		var v = k.get(a)
		if v == null and a == "dash" and def != null:
			v = def.dash
		if not (v is Array):
			v = [null, null]
		var two := [v[0] if v.size() > 0 else null, v[1] if v.size() > 1 else null]
		for i in 2:
			if two[i] != null and not (two[i] is String):
				two[i] = null
		o[a] = two
	o.dashMode = k.get("dashMode", "tap") if DASH_MODES.has(k.get("dashMode", "")) else "tap"
	return o

## 这套键位里真正在用的动作（选了「双击」，冲刺键那一行不用）
static func live_acts(k: Dictionary) -> Array:
	var o := []
	for e in ACTIONS:
		if e[0] != "dash" or k.dashMode != "tap":
			o.append(e[0])
	return o

## 冲突：同一个键给了两个动作；缺键：某个动作一个键都没有
static func problems(k: Dictionary) -> Dictionary:
	var used := {}
	for a in live_acts(k):
		for c in k[a]:
			if c != null:
				if not used.has(c):
					used[c] = []
				used[c].append(a)
	var out := {"dup": [], "missing": [], "dupCodes": {}}
	for c in used:
		if used[c].size() > 1:
			out.dup.append([c, used[c]])
			out.dupCodes[c] = true
	for a in live_acts(k):
		if k[a][0] == null and k[a][1] == null:
			out.missing.append(a)
	return out

static func key_map(k: Dictionary) -> Dictionary:
	var m := {}
	for a in live_acts(k):
		for c in k[a]:
			if c != null:
				m[c] = a
	return m

## 两个玩家都绑了的键（双人对战时归玩家二）
static func shared(k1: Dictionary, k2: Dictionary) -> Dictionary:
	var m2 := key_map(k2)
	var o := {}
	for c in key_map(k1):
		if m2.has(c):
			o[c] = true
	return o

static func load_keys() -> void:
	var data := {}
	if FileAccess.file_exists(STORE):
		var v = JSON.parse_string(FileAccess.get_file_as_string(STORE))
		if v is Dictionary:
			data = v
	var read := func(key: String, def: Dictionary):
		var v = data.get(key)
		if v is Dictionary:
			var k := clone_keys(v, def)
			if problems(k).dup.is_empty():
				return k
		return null
	var s = read.call("solo", defaults())
	solo = s if s != null else clone_keys(defaults())
	var a = read.call("p1", defaults())
	p1 = a if a != null else clone_keys(solo)
	var b = read.call("p2", defaults(true))
	p2 = b if b != null else clone_keys(defaults(true))
	rebuild()

static func rebuild() -> void:
	map = key_map(solo)
	map1 = key_map(p1)
	map2 = key_map(p2)

static func save_keys(s: Dictionary, a: Dictionary, b: Dictionary) -> void:
	solo = clone_keys(s)
	p1 = clone_keys(a)
	p2 = clone_keys(b)
	rebuild()
	var f := FileAccess.open(STORE, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({"solo": solo, "p1": p1, "p2": p2}))

## 这一局里这个键是谁的什么动作：[0 或 1, 动作]，没有就 []
static func route(code: String, mode: String) -> Array:
	if mode == "pvp":
		if map2.has(code):
			return [1, map2[code]]
		if map1.has(code):
			return [0, map1[code]]
		return []
	if map.has(code):
		return [0, map[code]]
	return []

## 这一局第 i 个玩家用的那套键位是不是「只用冲刺键」（双击方向不冲）
static func key_dash(i: int, mode: String) -> bool:
	var k: Dictionary = (p2 if i == 1 else p1) if mode == "pvp" else solo
	return k.dashMode == "key"

static func bound(code: String) -> bool:
	return map.has(code) or map1.has(code) or map2.has(code)

## 键的显示名
static func key_name(c) -> String:
	if c == null or c == "":
		return "—"
	var s: String = c
	if s.begins_with("Mouse"):
		var i := int(s.substr(5))
		return MOUSE_NAME[i] if i >= 0 and i < MOUSE_NAME.size() else "鼠标键" + str(i)
	if s.begins_with("Key") and s.length() == 4:
		return s.substr(3)
	if s.begins_with("Digit"):
		return s.substr(5)
	if s.begins_with("Numpad") and s.length() == 7 and s[6].is_valid_int():
		return "小键盘" + s.substr(6)
	var N := {"ArrowLeft": "←", "ArrowRight": "→", "ArrowUp": "↑", "ArrowDown": "↓", "Space": "空格", "Enter": "回车", "Tab": "Tab", "Backspace": "退格", "CapsLock": "Caps",
		"ShiftLeft": "左 Shift", "ShiftRight": "右 Shift", "Comma": ",", "Period": ".", "Slash": "/", "Semicolon": ";", "Quote": "'", "BracketLeft": "[", "BracketRight": "]",
		"Backslash": "\\", "Minus": "-", "Equal": "=", "Backquote": "`", "NumpadAdd": "小键盘+", "NumpadSubtract": "小键盘-", "NumpadMultiply": "小键盘*", "NumpadDivide": "小键盘/",
		"NumpadEnter": "小键盘回车", "NumpadDecimal": "小键盘.", "Insert": "Ins", "Delete": "Del", "Home": "Home", "End": "End", "PageUp": "PgUp", "PageDown": "PgDn"}
	return N.get(s, s)

## Godot 的按键 → JS 那种名字（按物理位置，不受输入法、键盘布局影响）
static func code_of(e: InputEvent) -> String:
	if e is InputEventMouseButton:
		var mb: InputEventMouseButton = e
		match mb.button_index:
			MOUSE_BUTTON_LEFT: return "Mouse0"
			MOUSE_BUTTON_MIDDLE: return "Mouse1"
			MOUSE_BUTTON_RIGHT: return "Mouse2"
			MOUSE_BUTTON_XBUTTON1: return "Mouse3"
			MOUSE_BUTTON_XBUTTON2: return "Mouse4"
		return ""
	if not (e is InputEventKey):
		return ""
	var k: InputEventKey = e
	var pk := k.physical_keycode
	if pk == KEY_NONE:
		pk = k.keycode
	var right := k.location == KEY_LOCATION_RIGHT
	if pk >= KEY_A and pk <= KEY_Z:
		return "Key" + char(pk)
	if pk >= KEY_0 and pk <= KEY_9:
		return "Digit" + char(pk)
	if pk >= KEY_KP_0 and pk <= KEY_KP_9:
		return "Numpad" + str(pk - KEY_KP_0)
	if pk >= KEY_F1 and pk <= KEY_F12:
		return "F" + str(pk - KEY_F1 + 1)
	match pk:
		KEY_SHIFT: return "ShiftRight" if right else "ShiftLeft"
		KEY_CTRL: return "ControlRight" if right else "ControlLeft"
		KEY_ALT: return "AltRight" if right else "AltLeft"
		KEY_META: return "MetaRight" if right else "MetaLeft"
		KEY_LEFT: return "ArrowLeft"
		KEY_RIGHT: return "ArrowRight"
		KEY_UP: return "ArrowUp"
		KEY_DOWN: return "ArrowDown"
		KEY_SPACE: return "Space"
		KEY_ENTER: return "Enter"
		KEY_KP_ENTER: return "NumpadEnter"
		KEY_TAB: return "Tab"
		KEY_BACKSPACE: return "Backspace"
		KEY_ESCAPE: return "Escape"
		KEY_CAPSLOCK: return "CapsLock"
		KEY_COMMA: return "Comma"
		KEY_PERIOD: return "Period"
		KEY_SLASH: return "Slash"
		KEY_SEMICOLON: return "Semicolon"
		KEY_APOSTROPHE: return "Quote"
		KEY_BRACKETLEFT: return "BracketLeft"
		KEY_BRACKETRIGHT: return "BracketRight"
		KEY_BACKSLASH: return "Backslash"
		KEY_MINUS: return "Minus"
		KEY_EQUAL: return "Equal"
		KEY_QUOTELEFT: return "Backquote"
		KEY_KP_ADD: return "NumpadAdd"
		KEY_KP_SUBTRACT: return "NumpadSubtract"
		KEY_KP_MULTIPLY: return "NumpadMultiply"
		KEY_KP_DIVIDE: return "NumpadDivide"
		KEY_KP_PERIOD: return "NumpadDecimal"
		KEY_INSERT: return "Insert"
		KEY_DELETE: return "Delete"
		KEY_HOME: return "Home"
		KEY_END: return "End"
		KEY_PAGEUP: return "PageUp"
		KEY_PAGEDOWN: return "PageDown"
		KEY_MENU: return "ContextMenu"
	return OS.get_keycode_string(pk)


## 一个玩家的手柄（对照 JS Pad）：按住的方向 / 格挡 + 这一步新按下的招
class Pad:
	var held := {"left": false, "right": false, "up": false, "down": false, "block": false}
	var pending: Array = []
	var key_dash: Callable          # () -> bool：这一局用的那套键位选了「冲刺键」
	func down(a: String, repeat: bool) -> void:
		if held.has(a):
			held[a] = true
		if InputState.PRESS_ACTS.has(a) and not repeat:
			pending.append(a)
	func up(a: String) -> void:
		if held.has(a):
			held[a] = false
	func sample() -> int:
		var v := 0
		for i in InputState.HELD_ACTS.size():
			if held[InputState.HELD_ACTS[i]]:
				v |= 1 << i
		for a in pending:
			v |= 1 << (5 + InputState.PRESS_ACTS.find(a))
		pending.clear()
		if key_dash.is_valid() and key_dash.call():
			v |= InputState.DASH_KEY
		return v
	func clear() -> void:
		pending.clear()
		for k in held:
			held[k] = false
