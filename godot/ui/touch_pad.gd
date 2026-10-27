class_name TouchPad
extends Control
## 触屏按钮（对照 JS #touch）：左边方向（跳、左、蹲、右），右边六个招（挡 拿 冲 / 拳 重 踢），按的是玩家一（pads[0]）。
## 有触屏的设备、或者第一次摸屏幕以后才显示；菜单、暂停这些开着时不显示。多指同时按：每根手指记着按在哪个钮上。

const BRUSH := UiTheme.BRUSH
const R_DIR := 40.0
const R_ACT := 42.0

var ui: Ui
var on := false
var _held := {}        # 手指编号 → 动作
var _btns: Array = []  # [动作, 字, 中心（相对左下 / 右下）, 半径, 哪一边]

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	on = DisplayServer.is_touchscreen_available()
	_btns = [
		["up", "跳", Vector2(160, -230), R_DIR, 0], ["left", "◀", Vector2(80, -150), R_DIR, 0],
		["right", "▶", Vector2(240, -150), R_DIR, 0], ["down", "蹲", Vector2(160, -70), R_DIR, 0],
		["block", "挡", Vector2(-300, -235), R_ACT, 1], ["grab", "拿", Vector2(-200, -235), R_ACT, 1], ["dash", "冲", Vector2(-100, -235), R_ACT, 1],
		["jab", "拳", Vector2(-300, -140), R_ACT, 1], ["heavy", "重", Vector2(-200, -140), R_ACT, 1], ["kick", "踢", Vector2(-100, -140), R_ACT, 1],
	]
	sync()

func sync() -> void:
	visible = on and ui != null and ui.cur == "" and ui.main.sim.mode != "attract"
	if not visible:
		_release_all()
	queue_redraw()

func _center(b: Array) -> Vector2:
	var s := size
	return Vector2(b[2].x if b[4] == 0 else s.x + b[2].x, s.y + b[2].y)

func _hit(p: Vector2) -> String:
	for b in _btns:
		if p.distance_to(_center(b)) <= float(b[3]) * 1.12:
			return b[0]
	return ""

func _input(e: InputEvent) -> void:
	if e is InputEventScreenTouch and e.pressed and not on:
		on = true
		sync()
	if not visible:
		return
	if e is InputEventScreenTouch:
		var p: Vector2 = get_global_transform_with_canvas().affine_inverse() * e.position
		if e.pressed:
			var a := _hit(p)
			if a != "":
				_held[e.index] = a
				ui.main.pads[0].down(a, false)
				get_viewport().set_input_as_handled()
				queue_redraw()
		elif _held.has(e.index):
			ui.main.pads[0].up(_held[e.index])
			_held.erase(e.index)
			get_viewport().set_input_as_handled()
			queue_redraw()
	elif e is InputEventScreenDrag and _held.has(e.index):
		# 手指滑到别的钮上：换成那个（方向键左右滑很常见）
		var p2: Vector2 = get_global_transform_with_canvas().affine_inverse() * e.position
		var a2 := _hit(p2)
		if a2 != "" and a2 != _held[e.index]:
			ui.main.pads[0].up(_held[e.index])
			_held[e.index] = a2
			ui.main.pads[0].down(a2, false)
			queue_redraw()
		get_viewport().set_input_as_handled()

func _release_all() -> void:
	if ui == null:
		return
	for k in _held:
		ui.main.pads[0].up(_held[k])
	_held.clear()

func _draw() -> void:
	var pressed := {}
	for k in _held:
		pressed[_held[k]] = true
	for b in _btns:
		var c := _center(b)
		var r: float = b[3]
		var p: bool = pressed.has(b[0])
		draw_circle(c, r, Color(UiTheme.CIN, 0.75) if p else Color(UiTheme.LACQ, 0.55), true, -1.0, true)
		draw_circle(c, r, Color(UiTheme.GOLD, 0.8) if p else Color(UiTheme.GOLD_D, 0.75), false, 1.6, true)
		var fs := 26
		var t: String = b[1]
		var w := BRUSH.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string(BRUSH, Vector2(c.x - w / 2.0, c.y + (BRUSH.get_ascent(fs) - BRUSH.get_descent(fs)) * 0.5), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(UiTheme.CREAM, 0.95))
