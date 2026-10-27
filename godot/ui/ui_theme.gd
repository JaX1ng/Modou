class_name UiTheme
extends RefCounted
## 界面的样子（照参考图：黑漆木的面板、两道金边、朱砂漆的主按钮、米白的毛笔字）。
## 按钮分几种（theme_type_variation）：
##   Primary  朱砂漆大按钮（人机对战、继续、开始对战、确认……）
##   Ghost    黑漆大按钮（双人对战、重开……）
##   Small    小按钮（键位设置、人物颜色、工具条……）
##   Seg      一排里选一个的小格子（难度、木桩动作、冲刺怎么按）：按下去 = 选中（朱砂）
##   KeyCell  键位表里的格子

const BRUSH := preload("res://assets/fonts/MaShanZheng-Regular.woff2")
const UIF := preload("res://assets/fonts/NotoSansSC-Medium.woff2")

const LACQ := Color("#1c120e")
const LACQ2 := Color("#2c1c15")
const LACQ3 := Color("#3d271d")
const GOLD := Color("#d8b46a")
const GOLD_D := Color("#8a6a30")
const CIN := Color("#a8301d")
const CIN_L := Color("#c4422a")
const CIN_D := Color("#7a2113")
const CREAM := Color("#f3ead6")
const MUTED := Color("#c2b5a0")
const DIM := Color("#8d8273")
const BAD := Color("#e8735a")
const OK := Color("#9fcf8a")
const WARN := Color("#e9c46a")

static func box(bg: Color, border: Color, bw := 1, radius := 3, pad := Vector4(14, 8, 14, 8)) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(bw)
	s.set_corner_radius_all(radius)
	s.content_margin_left = pad.x
	s.content_margin_top = pad.y
	s.content_margin_right = pad.z
	s.content_margin_bottom = pad.w
	s.anti_aliasing = true
	return s

## 面板：黑漆、外面一道暗金、里面一道亮金细线（StyleBoxFlat 只有一道边：里面那道由 LacquerPanel 画）
static func panel_box() -> StyleBoxFlat:
	var s := box(Color(LACQ, 0.93), GOLD_D, 2, 4, Vector4(34, 26, 34, 26))
	s.shadow_color = Color(0, 0, 0, 0.45)
	s.shadow_size = 18
	s.shadow_offset = Vector2(0, 6)
	return s

static func build() -> Theme:
	# 毛笔字里没有的符号（· ∞ ◀ ▶ 这些）借界面字的（网页版没有系统字体可以借）
	var bf: Font = BRUSH
	if bf.fallbacks.is_empty():
		bf.fallbacks = [UIF]
	var t := Theme.new()
	t.default_font = UIF
	t.default_font_size = 15
	# 字
	t.set_color("font_color", "Label", CREAM)
	t.set_font("font", "Label", UIF)
	t.set_font_size("font_size", "Label", 15)
	# 面板
	t.set_stylebox("panel", "PanelContainer", panel_box())
	t.set_stylebox("panel", "Panel", panel_box())
	# 大按钮：黑漆（Ghost）、朱砂（Primary）
	_button(t, "Button", LACQ2, GOLD_D, CREAM, UIF, 15, Vector4(14, 6, 14, 6))
	_button(t, "Ghost", LACQ2, GOLD_D, CREAM, BRUSH, 24, Vector4(22, 6, 22, 8))
	_button(t, "Primary", CIN, GOLD, Color("#fbf3e2"), BRUSH, 26, Vector4(26, 6, 26, 8))
	_button(t, "Small", Color(LACQ2, 0.92), Color(GOLD_D, 0.9), CREAM, UIF, 14, Vector4(12, 5, 12, 5))
	_button(t, "Seg", Color(LACQ2, 0.92), Color(GOLD_D, 0.9), CREAM, BRUSH, 20, Vector4(12, 4, 12, 6))
	_button(t, "SegSmall", Color(LACQ2, 0.92), Color(GOLD_D, 0.9), CREAM, UIF, 14, Vector4(10, 5, 10, 5))
	_button(t, "KeyCell", Color(LACQ3, 0.9), Color(GOLD_D, 0.7), CREAM, UIF, 14, Vector4(8, 4, 8, 4))
	for v in ["Ghost", "Primary", "Small", "Seg", "SegSmall", "KeyCell"]:
		t.set_type_variation(v, "Button")
	# 一排里选中的那一格（toggle 按下去）：朱砂
	for v in ["Seg", "SegSmall"]:
		t.set_stylebox("pressed", v, box(CIN, GOLD, 1, 3, Vector4(12, 4, 12, 6) if v == "Seg" else Vector4(10, 5, 10, 5)))
		t.set_color("font_pressed_color", v, Color("#fbf3e2"))
	# 输入框
	var le := box(Color("#120b08", 0.95), GOLD_D, 1, 3, Vector4(10, 7, 10, 7))
	t.set_stylebox("normal", "LineEdit", le)
	t.set_stylebox("focus", "LineEdit", box(Color(0, 0, 0, 0), GOLD, 1, 3, Vector4(10, 7, 10, 7)))
	t.set_stylebox("read_only", "LineEdit", box(Color("#120b08", 0.7), Color(GOLD_D, 0.6), 1, 3, Vector4(10, 7, 10, 7)))
	t.set_color("font_color", "LineEdit", CREAM)
	t.set_color("font_placeholder_color", "LineEdit", DIM)
	t.set_color("caret_color", "LineEdit", GOLD)
	t.set_color("selection_color", "LineEdit", Color(CIN, 0.6))
	t.set_font_size("font_size", "LineEdit", 16)
	t.set_stylebox("normal", "TextEdit", le)
	t.set_stylebox("focus", "TextEdit", box(Color(0, 0, 0, 0), GOLD, 1, 3, Vector4(10, 7, 10, 7)))
	t.set_stylebox("read_only", "TextEdit", box(Color("#120b08", 0.7), Color(GOLD_D, 0.6), 1, 3, Vector4(10, 7, 10, 7)))
	t.set_color("font_color", "TextEdit", CREAM)
	t.set_color("font_readonly_color", "TextEdit", MUTED)
	t.set_color("font_placeholder_color", "TextEdit", DIM)
	t.set_color("caret_color", "TextEdit", GOLD)
	t.set_color("selection_color", "TextEdit", Color(CIN, 0.6))
	t.set_font_size("font_size", "TextEdit", 13)
	# 滑条（音量）
	var track := box(Color("#120b08"), GOLD_D, 1, 3, Vector4(0, 3, 0, 3))
	t.set_stylebox("slider", "HSlider", track)
	var fill := box(CIN, CIN, 0, 3, Vector4(0, 3, 0, 3))
	t.set_stylebox("grabber_area", "HSlider", fill)
	t.set_stylebox("grabber_area_highlight", "HSlider", box(CIN_L, CIN_L, 0, 3, Vector4(0, 3, 0, 3)))
	t.set_icon("grabber", "HSlider", _knob(GOLD))
	t.set_icon("grabber_highlight", "HSlider", _knob(Color("#f0d48f")))
	# 滚动条
	t.set_stylebox("scroll", "VScrollBar", box(Color(0, 0, 0, 0.25), Color(0, 0, 0, 0), 0, 3, Vector4(4, 0, 4, 0)))
	t.set_stylebox("grabber", "VScrollBar", box(Color(GOLD_D, 0.8), Color(0, 0, 0, 0), 0, 3, Vector4(4, 0, 4, 0)))
	t.set_stylebox("grabber_highlight", "VScrollBar", box(GOLD, Color(0, 0, 0, 0), 0, 3, Vector4(4, 0, 4, 0)))
	t.set_stylebox("grabber_pressed", "VScrollBar", box(GOLD, Color(0, 0, 0, 0), 0, 3, Vector4(4, 0, 4, 0)))
	# 提示框
	t.set_stylebox("panel", "TooltipPanel", box(Color(LACQ, 0.96), GOLD_D, 1, 3, Vector4(8, 5, 8, 5)))
	t.set_color("font_color", "TooltipLabel", CREAM)
	return t

static func _button(t: Theme, type: String, bg: Color, border: Color, fg: Color, font: Font, size: int, pad: Vector4) -> void:
	t.set_stylebox("normal", type, box(bg, border, 1, 3, pad))
	t.set_stylebox("hover", type, box(bg.lightened(0.12), border.lightened(0.25), 1, 3, pad))
	t.set_stylebox("pressed", type, box(bg.darkened(0.25), border, 1, 3, pad))
	t.set_stylebox("hover_pressed", type, box(bg.darkened(0.15), border.lightened(0.25), 1, 3, pad))
	t.set_stylebox("disabled", type, box(Color(bg, 0.45), Color(border, 0.4), 1, 3, pad))
	var f := box(Color(0, 0, 0, 0), GOLD, 2, 4, pad)
	f.expand_margin_left = 2
	f.expand_margin_right = 2
	f.expand_margin_top = 2
	f.expand_margin_bottom = 2
	t.set_stylebox("focus", type, f)
	t.set_color("font_color", type, fg)
	t.set_color("font_hover_color", type, fg.lightened(0.1))
	t.set_color("font_pressed_color", type, fg)
	t.set_color("font_hover_pressed_color", type, fg)
	t.set_color("font_focus_color", type, fg)
	t.set_color("font_disabled_color", type, Color(fg, 0.35))
	t.set_font("font", type, font)
	t.set_font_size("font_size", type, size)

static func _knob(c: Color) -> ImageTexture:
	var n := 18
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var d := Vector2(x + 0.5 - n / 2.0, y + 0.5 - n / 2.0).length()
			var a := clampf(n / 2.0 - 1.0 - d, 0.0, 1.0)
			var col := c if d < n / 2.0 - 3.5 else c.darkened(0.45)
			img.set_pixel(x, y, Color(col, a))
	return ImageTexture.create_from_image(img)
