class_name Swatch
extends Button
## 人物颜色的一格（对照 JS swatch）：一方印（这个颜色的印泥、米白的名字），选中的金框亮着；对方 / 你占着的变暗点不了，底下写谁占着。
## id = "random"：随机（虚线框、问号）。

const BRUSH := preload("res://assets/fonts/MaShanZheng-Regular.woff2")
const UIF := preload("res://assets/fonts/NotoSansSC-Medium.woff2")

var look_id := ""
var on := false
var taken := ""

func _init(id: String) -> void:
	look_id = id
	flat = true
	custom_minimum_size = Vector2(62, 74)
	focus_mode = Control.FOCUS_ALL
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var lk := C.lookOf(id)
	tooltip_text = "随机" if id == "random" else str(lk.get("name", id))

func set_state(is_on: bool, taken_by: String) -> void:
	on = is_on
	taken = taken_by
	disabled = taken != ""
	tooltip_text = ("随机" if look_id == "random" else str(C.lookOf(look_id).get("name", look_id))) + ("（%s）" % taken if taken != "" else "")
	queue_redraw()

func _draw() -> void:
	var w := size.x
	var s := 21.0
	var c := Vector2(w / 2.0, 6.0 + s)
	var hov := is_hovered() and not disabled
	var a := 0.4 if disabled else 1.0
	if on:
		draw_rect(Rect2(c.x - s - 6, c.y - s - 6, 2 * s + 12, 2 * s + 12), Color(UiTheme.CIN, 0.35))
		draw_rect(Rect2(c.x - s - 6, c.y - s - 6, 2 * s + 12, 2 * s + 12), UiTheme.GOLD, false, 2.0)
	elif hov or has_focus():
		draw_rect(Rect2(c.x - s - 5, c.y - s - 5, 2 * s + 10, 2 * s + 10), Color(UiTheme.GOLD, 0.7), false, 1.2)
	if look_id == "random":
		var r := Rect2(c.x - s, c.y - s, 2 * s, 2 * s)
		_dashed(r, Color(UiTheme.MUTED, a))
		_center_text(BRUSH, "?", c + Vector2(0, 1), 30, Color(UiTheme.MUTED, a))
		_center_text(UIF, "随机", Vector2(c.x, c.y + s + 14), 12, Color(UiTheme.MUTED, a))
		return
	var lk := C.lookOf(look_id)
	var col := Color(lk.get("color", "#17181a"))
	var ink := col if col.get_luminance() > 0.08 else Color("#26211f")
	ink.a = a
	draw_rect(Rect2(c.x - s - 2, c.y - s - 2, 2 * s + 4, 2 * s + 4), Color(UiTheme.GOLD_D, a), false, 1.2)
	draw_rect(Rect2(c.x - s, c.y - s, 2 * s, 2 * s), ink)
	draw_rect(Rect2(c.x - s + 3, c.y - s + 3, 2 * s - 6, 2 * s - 6), Color(UiTheme.CREAM, 0.7 * a), false, 1.0)
	_center_text(BRUSH, str(lk.get("name", "")), c + Vector2(0, 1), 28, Color(0.97, 0.94, 0.86, a))
	if taken != "":
		_center_text(UIF, taken, Vector2(c.x, c.y + s + 14), 12, Color(UiTheme.MUTED, 0.9))

func _center_text(f: Font, t: String, p: Vector2, fs: int, col: Color) -> void:
	var tw := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var base := p.y + (f.get_ascent(fs) - f.get_descent(fs)) * 0.5
	draw_string(f, Vector2(p.x - tw / 2.0, base), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)

func _dashed(r: Rect2, col: Color) -> void:
	var pts := [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y), r.position]
	for i in 4:
		draw_dashed_line(pts[i], pts[i + 1], col, 1.5, 4.0)
