class_name Ui
extends Node
## 界面（对照 JS ui.js + index.html）：主菜单、暂停、结算、键位设置、人物颜色、设置、双人选色、联机面板、训练场工具条、
## 右下角的小工具（暂停 / 声音 / 全屏）、小提示条、触屏按钮。教程、破招练习、场景选择先不做（这一版只有一个场景）。
## 样子照参考图（黑漆面板、金边、朱砂按钮，见 UiTheme）；按逻辑画面（project 设置的 1280×720，按窗口拉伸）摆。
## 和 Main 的接口：main.ui = 这个；Main 问 wants_input(e)（界面要不要吃掉这个键）、blocks_sim()（要不要停住逻辑）、play_sound(k, p)。

const BRUSH := UiTheme.BRUSH
const UIF := UiTheme.UIF
const SETTINGS := "user://settings.json"
const WHO_NAME := ["单人", "双人·玩家一", "双人·玩家二"]
const WHO_HINT := ["单人：人机、联机、训练场用这一套。随便改（方向键、小键盘都行），不影响双人对战。",
	"双人对战·玩家一。两人都绑了的键归玩家二。", "双人对战·玩家二。"]
const DUMMY_MODES := [["stand", "站着"], ["crouch", "蹲着"], ["block", "站挡"], ["lowblock", "蹲挡"], ["random", "乱挡"], ["jump", "一直跳"]]
const DISP_HINT := {"fullscreen": "全屏：系统的全屏，盖住整块屏幕和任务栏。", "borderless": "全屏窗口：没边框的窗口铺满屏幕，切出去（Alt+Tab）不最小化、不闪。", "window": "窗口：普通窗口，能拖、能改大小。"}

var main: Main
var sound: SoundBank
var layer: CanvasLayer
var root: Control
var theme_res: Theme
var screens := {}            # 名字 → 盖在画面上的那一层
var cur := ""                # 现在开着哪一层（"" = 没有，在打）
var diff := "normal"
var sound_on := true
var vol := 50
var disp := "window"

# 小工具、工具条、提示条
var tools: HBoxContainer
var btn_pause: Button
var btn_sound: Button
var btn_full: Button
var trainbar: PanelContainer
var dummy_btns := {}
var btn_qi: Button
var toast_box: PanelContainer
var toast_lbl: Label
var _toast_t := 0.0
var touch: TouchPad

# 主菜单
var diff_btns := {}
var menu_msg: Label
# 暂停
var btn_pause_full: Button
# 结算
var res_title: Label
var res_grid: GridContainer
var btn_again: Button
var res_wait: Label
var _over_at := -1.0
# 设置
var set_back := "menu"
var vol_slider: HSlider
var vol_val: Label
var disp_btns := {}
var disp_hint: Label
# 人物颜色
var solo_me: HFlowContainer
var solo_cpu: HFlowContainer
# 双人选色
var pvp_draft := ["ink", "ochre"]
var pvp_rows: Array = []
# 键位
var key_draft: Array = []
var key_who := 0
var key_wait = null          # [动作, 第几格] 正在等按键
var key_back := "menu"
var who_btns: Array = []
var dash_btns := {}
var who_hint: Label
var dash_hint: Label
var key_grid: GridContainer
var key_msg: Label
var key_info: Label
var btn_keys_save: Button
var _key_cells := {}
# 联机
var net_ui: NetPanel

func _ready() -> void:
	theme_res = UiTheme.build()
	sound = SoundBank.new()
	add_child(sound)
	layer = CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	root = Control.new()
	root.name = "UiRoot"
	root.theme = theme_res
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)
	_load_settings()
	_build_tools()
	_build_trainbar()
	_build_toast()
	_build_menu()
	_build_pause()
	_build_result()
	_build_settings()
	_build_looks()
	_build_pvp()
	_build_keys()
	net_ui = NetPanel.new()
	net_ui.ui = self
	net_ui.build()
	touch = TouchPad.new()
	touch.ui = self
	root.add_child(touch)
	main.sim.on_match_over = _on_match_over
	show_overlay("menu")
	_sync_tools()

func _process(dt: float) -> void:
	if _toast_t > 0.0:
		_toast_t -= dt
		if _toast_t <= 0.0:
			toast_box.hide()
	if _over_at >= 0.0 and Time.get_ticks_msec() / 1000.0 >= _over_at:
		_over_at = -1.0
		if main.sim.phase == "over":
			show_overlay("result")
	net_ui.process(dt)

# ---------- 设置存档 ----------
func _load_settings() -> void:
	if FileAccess.file_exists(SETTINGS):
		var d = JSON.parse_string(FileAccess.get_file_as_string(SETTINGS))
		if d is Dictionary:
			vol = clampi(int(d.get("vol", 50)), 0, 100)
			sound_on = bool(d.get("sound", true))
			var dd := str(d.get("diff", "normal"))
			diff = dd if Brain.LEVELS.has(dd) else "normal"
			var dm := str(d.get("disp", "window"))
			disp = dm if DISP_HINT.has(dm) else "window"
	sound.set_volume(vol)
	sound.enabled = sound_on

func _save_settings() -> void:
	var f := FileAccess.open(SETTINGS, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({"vol": vol, "sound": sound_on, "diff": diff, "disp": disp}))

# ---------- 小零件 ----------
func btn(text: String, variation: String, cb: Callable, parent: Node = null, snd := true) -> Button:
	var b := Button.new()
	b.text = text
	b.theme_type_variation = variation
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if variation == "Primary":
		b.custom_minimum_size = Vector2(150, 50)
	elif variation == "Ghost":
		b.custom_minimum_size = Vector2(124, 46)
	var on_press := func() -> void:
		if snd:
			sound.ui_press()
		cb.call()
	b.pressed.connect(on_press)
	if parent != null:
		parent.add_child(b)
	return b

func label(text: String, size := 15, col := UiTheme.CREAM, font: Font = null, wrap := false, align := HORIZONTAL_ALIGNMENT_CENTER) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	if font != null:
		l.add_theme_font_override("font", font)
	l.horizontal_alignment = align
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_ARBITRARY
	return l

func row(parent: Node, sep := 10, center := true) -> HBoxContainer:
	var r := HBoxContainer.new()
	r.add_theme_constant_override("separation", sep)
	if center:
		r.alignment = BoxContainer.ALIGNMENT_CENTER
	parent.add_child(r)
	return r

## 一层盖在画面上的（dim：底下压暗一点）：正中一块黑漆面板，返回面板里那一竖排
func overlay(name: String, dim: bool, width := 0.0, scroll := false, top := false) -> VBoxContainer:
	var o := Control.new()
	o.name = name
	o.set_anchors_preset(Control.PRESET_FULL_RECT)
	o.mouse_filter = Control.MOUSE_FILTER_STOP
	o.hide()
	root.add_child(o)
	if dim:
		var bg := ColorRect.new()
		bg.color = Color(0.05, 0.03, 0.02, 0.55)
		bg.set_anchors_preset(Control.PRESET_FULL_RECT)
		bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
		o.add_child(bg)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	if top:
		# 菜单放在上半截：底下菜单背景里两个人打，露出来
		cc.anchor_bottom = 0.0
		cc.offset_bottom = 430.0
	cc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	o.add_child(cc)
	var p := LacquerPanel.new()
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	cc.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	if width > 0.0:
		v.custom_minimum_size.x = width
	if scroll:
		var sc := ScrollContainer.new()
		sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		sc.custom_minimum_size = Vector2(width + 22.0, 0)
		p.add_child(sc)
		var mc := MarginContainer.new()
		mc.add_theme_constant_override("margin_right", 18)
		mc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sc.add_child(mc)
		mc.add_child(v)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		p.scroller = sc
	else:
		p.add_child(v)
	screens[name] = o
	return v

func big(text: String, parent: Node, size := 46) -> Label:
	var l := label(text, size, UiTheme.CREAM, BRUSH)
	l.add_theme_color_override("font_outline_color", Color(0.05, 0.02, 0.01, 0.9))
	l.add_theme_constant_override("outline_size", 6)
	parent.add_child(l)
	return l

func hint(text: String, parent: Node, col := UiTheme.MUTED, size := 13) -> Label:
	var l := label(text, size, col, UIF, true)
	parent.add_child(l)
	return l

func step_label(text: String, parent: Node) -> Label:
	var l := label(text, 18, UiTheme.GOLD, BRUSH)
	parent.add_child(l)
	return l

# ---------- 哪一层开着 ----------
func show_overlay(name: String) -> void:
	for k in screens:
		screens[k].visible = k == name
	cur = name
	for p in main.pads:
		p.clear()
	_sync_tools()
	if name == "":
		get_viewport().gui_release_focus()
		return
	# 第一个大按钮拿到焦点（键盘能直接操作）
	var first := _first_button(screens[name])
	if first != null:
		first.call_deferred("grab_focus")

func _first_button(n: Node) -> Button:
	for c in n.get_children():
		if c is Button and c.visible and not c.disabled and (c.theme_type_variation == "Primary"):
			return c
		var r := _first_button(c)
		if r != null:
			return r
	return null

## 界面要不要吃掉这个键（Main 在把键交给游戏前问）：开着任何一层、正在等按键，游戏都不收
func wants_input(_e: InputEvent) -> bool:
	return cur != "" or key_wait != null

## 逻辑要不要停（暂停）
func blocks_sim() -> bool:
	return main.paused

func play_sound(k: String, p) -> void:
	if main.sim.mode == "attract":
		return
	sound.play(k, p)

# ---------- 右下角小工具 ----------
func _build_tools() -> void:
	tools = HBoxContainer.new()
	tools.add_theme_constant_override("separation", 6)
	tools.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	tools.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	tools.grow_vertical = Control.GROW_DIRECTION_BEGIN
	tools.position = Vector2(-10, -10)
	tools.modulate = Color(1, 1, 1, 0.88)
	root.add_child(tools)
	btn_pause = btn("暂停 Esc", "Small", func() -> void: set_paused(not main.paused), tools, false)
	btn_sound = btn("声音：开", "Small", func() -> void: set_sound(not sound_on), tools, false)
	btn_full = btn("全屏", "Small", toggle_full, tools, false)
	for b in [btn_pause, btn_sound, btn_full]:
		b.focus_mode = Control.FOCUS_NONE
	set_sound(sound_on, false)
	tools.anchor_left = 1.0
	tools.anchor_top = 1.0
	tools.anchor_right = 1.0
	tools.anchor_bottom = 1.0
	tools.offset_right = -10
	tools.offset_bottom = -10

func _sync_tools() -> void:
	if btn_pause == null:
		return
	var m := main.sim.mode
	btn_pause.disabled = m == "attract" or m == "online" or main.sim.phase == "over"
	btn_full.text = "退出全屏" if _is_full() else "全屏"
	if btn_pause_full != null:
		btn_pause_full.visible = _is_full()
	trainbar.visible = m == "train" and cur == ""
	if touch != null:
		touch.sync()

func set_sound(on: bool, save := true) -> void:
	sound_on = on
	sound.enabled = on
	btn_sound.text = "声音：开" if on else "声音：关"
	if save:
		_save_settings()

func _is_full() -> bool:
	var m := DisplayServer.window_get_mode()
	return m == DisplayServer.WINDOW_MODE_FULLSCREEN or m == DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN

func toggle_full() -> void:
	if _is_full():
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN if disp == "fullscreen" else DisplayServer.WINDOW_MODE_FULLSCREEN)
		if OS.has_feature("web"):
			toast("全屏中 · Esc 暂停 · 想退出全屏点右下角「退出全屏」", 4000)
	await get_tree().process_frame
	_sync_tools()

# ---------- 小提示条（画面上面，几秒后自己消失） ----------
func _build_toast() -> void:
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_TOP_WIDE)
	cc.offset_top = 132
	cc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(cc)
	toast_box = PanelContainer.new()
	toast_box.add_theme_stylebox_override("panel", UiTheme.box(Color(UiTheme.LACQ, 0.92), UiTheme.GOLD_D, 1, 3, Vector4(16, 8, 16, 8)))
	toast_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast_box.hide()
	cc.add_child(toast_box)
	toast_lbl = label("", 14, UiTheme.CREAM, UIF)
	toast_box.add_child(toast_lbl)

func toast(msg: String, ms := 3800) -> void:
	toast_lbl.text = msg
	toast_box.show()
	_toast_t = ms / 1000.0

# ---------- 训练场工具条 ----------
func _build_trainbar() -> void:
	trainbar = PanelContainer.new()
	trainbar.add_theme_stylebox_override("panel", UiTheme.box(Color(UiTheme.LACQ, 0.86), UiTheme.GOLD_D, 1, 4, Vector4(12, 7, 12, 7)))
	trainbar.anchor_left = 0.5
	trainbar.anchor_right = 0.5
	trainbar.anchor_top = 1.0
	trainbar.anchor_bottom = 1.0
	trainbar.grow_horizontal = Control.GROW_DIRECTION_BOTH
	trainbar.grow_vertical = Control.GROW_DIRECTION_BEGIN
	trainbar.offset_bottom = -52
	trainbar.hide()
	root.add_child(trainbar)
	var r := HBoxContainer.new()
	r.add_theme_constant_override("separation", 6)
	trainbar.add_child(r)
	r.add_child(label("木桩", 18, UiTheme.GOLD, BRUSH))
	for dm in DUMMY_MODES:
		var id: String = dm[0]
		var b := btn(dm[1], "SegSmall", func() -> void: set_dummy(id), r, false)
		b.toggle_mode = true
		b.focus_mode = Control.FOCUS_NONE
		dummy_btns[id] = b
	var sep := VSeparator.new()
	r.add_child(sep)
	btn_qi = btn("无限气：关", "Small", _toggle_qi, r, false)
	btn_qi.focus_mode = Control.FOCUS_NONE
	var br := btn("复位", "Small", _train_reset, r, false)
	br.focus_mode = Control.FOCUS_NONE
	set_dummy(main.sim.dummyMode)

func _toggle_qi() -> void:
	main.sim.trainQi = not main.sim.trainQi
	btn_qi.text = "无限气：开" if main.sim.trainQi else "无限气：关"

func _train_reset() -> void:
	if main.sim.mode == "train":
		main.sim.resetFighters()
		main.sim.phase = "fight"

func set_dummy(m: String) -> void:
	main.sim.dummyMode = m
	if main.sim.mode == "train" and main.sim.brains[1] is Dummy:
		main.sim.brains[1].mode = m
	for k in dummy_btns:
		dummy_btns[k].set_pressed_no_signal(k == m)

# ---------- 主菜单 ----------
func _build_menu() -> void:
	var v := overlay("menu", false, 620.0, false, true)
	var t := TitleMark.new()
	v.add_child(t)
	var sub := label("拳克腿 · 腿克重 · 重克拳", 17, UiTheme.MUTED, BRUSH)
	v.add_child(sub)
	var r1 := row(v, 12)
	btn("人机对战", "Primary", func() -> void: start("pve"), r1)
	var seg := HBoxContainer.new()
	seg.add_theme_constant_override("separation", 4)
	r1.add_child(seg)
	for id in Brain.LEVEL_IDS:
		var lid: String = id
		var b := btn(Brain.LEVEL_NAME[id], "Seg", func() -> void: set_diff(lid), seg)
		b.toggle_mode = true
		b.custom_minimum_size = Vector2(52, 50)
		diff_btns[id] = b
	set_diff(diff, false)
	var r2 := row(v, 12)
	btn("双人对战", "Ghost", open_pvp, r2)
	btn("联机对战", "Ghost", func() -> void: net_ui.open(""), r2)
	btn("训练场", "Ghost", func() -> void: start("train"), r2)
	var r3 := row(v, 8)
	btn("键位设置", "Small", func() -> void: open_keys("menu"), r3)
	btn("人物颜色", "Small", open_looks, r3)
	btn("设置", "Small", func() -> void: open_settings("menu"), r3)
	if not OS.has_feature("web"):
		btn("退出游戏", "Small", func() -> void: get_tree().quit(), r3)
	menu_msg = hint("", v, UiTheme.BAD, 14)
	menu_msg.hide()

func set_diff(d: String, save := true) -> void:
	diff = d
	for k in diff_btns:
		diff_btns[k].set_pressed_no_signal(k == d)
	if save:
		_save_settings()

func start(mode: String) -> void:
	main.start_match(mode, diff, main.sim.dummyMode)
	on_match_start()

func on_match_start() -> void:
	show_overlay("")
	btn_qi.text = "无限气：开" if main.sim.trainQi else "无限气：关"
	set_dummy(main.sim.dummyMode)
	_sync_tools()

## 回菜单（msg：出事了才写一行，比如对方断开）
func to_menu(msg := "") -> void:
	main.paused = false
	menu_msg.text = msg
	menu_msg.visible = msg != ""
	main.start_attract()
	show_overlay("menu")

func restart() -> void:
	main.paused = false
	if main.sim.mode == "online":
		net_ui.restart()
	else:
		start(main.sim.mode)

# ---------- 暂停 ----------
func _build_pause() -> void:
	var v := overlay("pause", true)
	big("暂停", v, 52)
	var r := row(v, 10)
	btn("继续", "Primary", func() -> void: set_paused(false), r)
	btn("重开", "Ghost", restart, r)
	btn("键位", "Ghost", func() -> void: open_keys("pause"), r)
	btn("设置", "Ghost", func() -> void: open_settings("pause"), r)
	btn("回菜单", "Ghost", func() -> void: to_menu(), r)
	var r2 := row(v, 8)
	btn_pause_full = btn("退出全屏", "Small", toggle_full, r2)

func set_paused(p: bool) -> void:
	var m := main.sim.mode
	if m == "attract" or m == "online" or main.sim.phase == "over":
		return
	main.paused = p
	show_overlay("pause" if p else "")

# ---------- 结算 ----------
func _build_result() -> void:
	var v := overlay("result", true, 560.0)
	res_title = big("墨 胜", v, 56)
	res_grid = GridContainer.new()
	res_grid.columns = 3
	res_grid.add_theme_constant_override("h_separation", 26)
	res_grid.add_theme_constant_override("v_separation", 10)
	var cc := CenterContainer.new()
	cc.add_child(res_grid)
	v.add_child(cc)
	var r := row(v, 10)
	btn_again = btn("再战一局", "Primary", restart, r)
	res_wait = label("等房主开下一局…", 14, UiTheme.MUTED, UIF)
	r.add_child(res_wait)
	btn("回菜单", "Ghost", _result_menu, r)

func _result_menu() -> void:
	if main.sim.mode == "online":
		net_ui.leave()
	to_menu()

func _on_match_over() -> void:
	var s := main.sim
	var wi := 0 if s.wins[0] >= C.WIN_ROUNDS else 1
	var Wf: Fighter = s.p[wi]
	var title := "%s 胜" % Wf.name
	if s.mode == "online":
		title = "你赢了" if (wi == 0) == s.online_host else "你输了"
	res_title.text = title
	for c in res_grid.get_children():
		c.queue_free()
	var st0: Dictionary = s.p[0].stats
	var st1: Dictionary = s.p[1].stats
	var nm := "%s/%s" % [s.p[0].name, s.p[1].name]
	var items := [["%d : %d" % [s.wins[0], s.wins[1]], "比分"], ["%d / %d" % [st0.maxCombo, st1.maxCombo], "最高连击 " + nm],
		["%d / %d" % [st0.specials, st1.specials], "招式命中 " + nm], ["%d / %d" % [st0.blocks, st1.blocks], "格挡 " + nm],
		["%d / %d" % [st0.parries, st1.parries], "卸力 " + nm], ["%d" % st0.clashes, "拼招"],
		["%d / %d" % [st0.presses, st1.presses], "压制 " + nm], ["%d / %d" % [st0.punishes, st1.punishes], "防守反击 " + nm],
		["%d / %d" % [st0.escapes, st1.escapes], "挣脱 " + nm]]
	for it in items:
		var cell := VBoxContainer.new()
		cell.add_theme_constant_override("separation", 0)
		cell.custom_minimum_size.x = 150
		var a := label(it[0], 26, UiTheme.GOLD, BRUSH)
		cell.add_child(a)
		cell.add_child(label(it[1], 12, UiTheme.MUTED, UIF))
		res_grid.add_child(cell)
	var guest := s.mode == "online" and not s.online_host
	btn_again.visible = not guest
	res_wait.visible = guest
	_sync_tools()
	_over_at = Time.get_ticks_msec() / 1000.0 + 0.9

# ---------- 设置（音量、画面） ----------
func _build_settings() -> void:
	var v := overlay("settings", true, 520.0)
	big("设置", v, 40)
	step_label("音量", v)
	var r := row(v, 10)
	btn("−", "Small", func() -> void: set_vol(vol - 10, true), r, false).custom_minimum_size = Vector2(40, 34)
	vol_slider = HSlider.new()
	vol_slider.min_value = 0
	vol_slider.max_value = 100
	vol_slider.step = 5
	vol_slider.custom_minimum_size = Vector2(260, 24)
	vol_slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	vol_slider.value_changed.connect(func(x: float) -> void: set_vol(int(x), false))
	vol_slider.drag_ended.connect(func(_c: bool) -> void: sound.preview())
	r.add_child(vol_slider)
	btn("＋", "Small", func() -> void: set_vol(vol + 10, true), r, false).custom_minimum_size = Vector2(40, 34)
	vol_val = label(str(vol), 22, UiTheme.GOLD, BRUSH)
	vol_val.custom_minimum_size.x = 40
	r.add_child(vol_val)
	hint("中间（50）是默认；拉到 0 就没声。调的时候响一声给你听。记在这台电脑上。", v)
	if not OS.has_feature("web"):
		step_label("画面", v)
		var r2 := row(v, 4)
		for m in [["fullscreen", "全屏"], ["borderless", "全屏窗口"], ["window", "窗口"]]:
			var id: String = m[0]
			var b := btn(m[1], "SegSmall", func() -> void: set_disp(id), r2)
			b.toggle_mode = true
			disp_btns[id] = b
		disp_hint = hint("", v)
	var r3 := row(v, 10)
	btn("确认", "Primary", close_settings, r3)
	vol_slider.set_value_no_signal(vol)

func set_vol(v: int, hear: bool) -> void:
	vol = clampi(v, 0, 100)
	vol_slider.set_value_no_signal(vol)
	vol_val.text = str(vol)
	sound.set_volume(vol)
	_save_settings()
	if hear:
		sound.preview()

func open_settings(from: String) -> void:
	set_back = from
	vol_slider.set_value_no_signal(vol)
	vol_val.text = str(vol)
	_show_disp()
	show_overlay("settings")

func close_settings() -> void:
	show_overlay("pause" if set_back == "pause" else "menu")

func set_disp(m: String) -> void:
	disp = m
	match m:
		"fullscreen":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN)
		"borderless":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		_:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	_save_settings()
	_show_disp()
	_sync_tools()

func _show_disp() -> void:
	if disp_hint == null:
		return
	for k in disp_btns:
		disp_btns[k].set_pressed_no_signal(k == disp)
	disp_hint.text = DISP_HINT.get(disp, "") + "按 F11 / Alt+Enter 在窗口和全屏之间切。"

# ---------- 人物颜色（人机、训练场、联机用） ----------
func _build_looks() -> void:
	var v := overlay("looks", true, 640.0)
	big("人物颜色", v, 40)
	hint("人机、训练场、联机时用（双人对战开打前两边另选）。点一下就记住，存在这台电脑上。", v)
	step_label("你的颜色", v)
	solo_me = _swatch_row(v, false, _pick_me)
	step_label("电脑的颜色（选「随机」每局换一个，不会和你撞色）", v)
	solo_cpu = _swatch_row(v, true, _pick_cpu)
	var r := row(v)
	btn("确认", "Primary", func() -> void: show_overlay("menu"), r)

func _pick_me(id: String) -> void:
	Looks.set_me(id)
	_render_looks()
	_preview_solo()

func _pick_cpu(id: String) -> void:
	Looks.solo.cpu = id
	Looks.save()
	_render_looks()
	if main.sim.mode == "attract":
		main.set_looks(main.sim.p[0].look, Looks.cpu_look() if id == "random" else id)

func _swatch_row(parent: Node, with_random: bool, cb: Callable) -> HFlowContainer:
	var f := HFlowContainer.new()
	f.alignment = FlowContainer.ALIGNMENT_CENTER
	f.add_theme_constant_override("h_separation", 6)
	f.add_theme_constant_override("v_separation", 6)
	parent.add_child(f)
	var ids := []
	if with_random:
		ids.append("random")
	for p in C.PALETTE:
		ids.append(p.id)
	for id in ids:
		var s := Swatch.new(id)
		var sid: String = id
		var on_pick := func() -> void:
			sound.ui_press()
			cb.call(sid)
		s.pressed.connect(on_pick)
		f.add_child(s)
	return f

func open_looks() -> void:
	_render_looks()
	_preview_solo()
	show_overlay("looks")

func _render_looks() -> void:
	var me: String = Looks.solo.me
	for s: Swatch in solo_me.get_children():
		s.set_state(s.look_id == me, "")
	for s: Swatch in solo_cpu.get_children():
		s.set_state(s.look_id == Looks.solo.cpu, "你" if s.look_id == me else "")

func _preview_solo() -> void:
	if main.sim.mode != "attract":
		return
	var me: String = Looks.solo.me
	var c: String = Looks.solo.cpu
	var cpu: String = c
	if c == "random":
		cpu = main.sim.p[1].look if main.sim.p[1].look != me else Looks.cpu_look()
	main.set_looks(me, cpu)

# ---------- 双人选色 ----------
func _build_pvp() -> void:
	var v := overlay("pvp", true, 640.0)
	big("双人选色", v, 40)
	hint("玩家一按 A D、玩家二按 ← → 换颜色，也可以直接点。两边不能选一样的。", v)
	for i in 2:
		var ii := i
		step_label("玩家一" if i == 0 else "玩家二", v)
		pvp_rows.append(_swatch_row(v, false, func(id: String) -> void: _pick_pvp(ii, id)))
	var r := row(v, 10)
	btn("开始对战", "Primary", _start_pvp, r)
	btn("返回", "Ghost", close_pvp, r)

func _pick_pvp(i: int, id: String) -> void:
	pvp_draft[i] = id
	_render_pvp()

func _start_pvp() -> void:
	Looks.pvp = pvp_draft.duplicate()
	Looks.save()
	start("pvp")

func open_pvp() -> void:
	pvp_draft = Looks.pvp.duplicate()
	_render_pvp()
	show_overlay("pvp")

func _render_pvp() -> void:
	for i in 2:
		for s: Swatch in pvp_rows[i].get_children():
			s.set_state(s.look_id == pvp_draft[i], ("玩家一" if i == 1 else "玩家二") if s.look_id == pvp_draft[1 - i] else "")
	if main.sim.mode == "attract":
		main.set_looks(pvp_draft[0], pvp_draft[1])

func _cycle_pvp(i: int, d: int) -> void:
	var n := C.PALETTE.size()
	var k := 0
	for j in n:
		if C.PALETTE[j].id == pvp_draft[i]:
			k = j
	while true:
		k = (k + d + n) % n
		if C.PALETTE[k].id != pvp_draft[1 - i]:
			break
	pvp_draft[i] = C.PALETTE[k].id
	_render_pvp()

func close_pvp() -> void:
	show_overlay("menu")
	main.apply_looks("attract")

# ---------- 键位设置（三套：单人 / 双人·玩家一 / 双人·玩家二） ----------
func _build_keys() -> void:
	var v := overlay("keys", true, 860.0, true)
	big("键位设置", v, 40)
	var seg := row(v, 4)
	for w in 3:
		var ww := w
		var b := btn(WHO_NAME[w], "SegSmall", func() -> void: set_key_who(ww), seg)
		b.toggle_mode = true
		who_btns.append(b)
	who_hint = hint("", v)
	hint("点一个格子，再按想用的键，或者按鼠标按键（右键、中键、侧键在哪按都行；左键要再点一下这一格）。按 Esc 取消，按退格清空这一格。设置存在这台电脑上。", v)
	var dr := row(v, 8)
	dr.add_child(label("冲刺怎么按", 18, UiTheme.GOLD, BRUSH))
	for m in [["tap", "双击左 / 右"], ["key", "按冲刺键"], ["both", "两种都用"]]:
		var id: String = m[0]
		var b := btn(m[1], "SegSmall", func() -> void: _set_dash(id), dr)
		b.toggle_mode = true
		dash_btns[id] = b
	dash_hint = hint("", v)
	# 键位表：两栏（左边五个动作、右边五个），一屏放得下
	key_grid = GridContainer.new()
	key_grid.columns = 7
	key_grid.add_theme_constant_override("h_separation", 8)
	key_grid.add_theme_constant_override("v_separation", 5)
	var cc := CenterContainer.new()
	cc.add_child(key_grid)
	v.add_child(cc)
	for h in ["动作", "键位一", "键位二", "", "动作", "键位一", "键位二"]:
		key_grid.add_child(label(h, 13, UiTheme.MUTED, UIF))
	var half := ceili(Keys.ACTIONS.size() / 2.0)
	for rI in half:
		for col in 2:
			if col == 1:
				var gap := Control.new()
				gap.custom_minimum_size.x = 18
				key_grid.add_child(gap)
			var idx := rI + col * half
			if idx >= Keys.ACTIONS.size():
				for k in 3:
					key_grid.add_child(Control.new())
				continue
			var e: Array = Keys.ACTIONS[idx]
			var a: String = e[0]
			var nm := label(e[1], 18, UiTheme.CREAM, BRUSH)
			nm.custom_minimum_size.x = 64
			key_grid.add_child(nm)
			for i in 2:
				var ii := i
				var cell := btn("", "KeyCell", func() -> void: _click_cell(a, ii), key_grid)
				cell.custom_minimum_size = Vector2(150, 32)
				cell.gui_input.connect(func(ev: InputEvent) -> void: _cell_mouse(ev, a, ii))
				_key_cells[a + str(i)] = cell
	key_msg = hint("", v, UiTheme.BAD, 14)
	key_info = hint("", v, UiTheme.WARN, 13)
	var r := row(v, 10)
	btn_keys_save = btn("保存", "Primary", _save_keys, r)
	btn("恢复默认", "Ghost", _reset_keys, r)
	btn("取消", "Ghost", close_keys, r)

func _set_dash(id: String) -> void:
	key_draft[key_who].dashMode = id
	key_wait = null
	_render_keys()

func _reset_keys() -> void:
	key_draft[key_who] = Keys.clone_keys(Keys.defaults(key_who == 2))
	key_wait = null
	_render_keys()

func open_keys(from: String) -> void:
	key_draft = [Keys.clone_keys(Keys.solo), Keys.clone_keys(Keys.p1), Keys.clone_keys(Keys.p2)]
	key_wait = null
	key_back = from
	set_key_who((key_who if key_who > 0 else 1) if (main.sim.mode == "pvp" and from == "pause") else 0)
	show_overlay("keys")

func set_key_who(w: int) -> void:
	key_who = w
	key_wait = null
	for i in 3:
		who_btns[i].set_pressed_no_signal(i == w)
	who_hint.text = WHO_HINT[w]
	_render_keys()

func close_keys() -> void:
	key_wait = null
	show_overlay("pause" if key_back == "pause" else "menu")

func _render_keys() -> void:
	var k: Dictionary = key_draft[key_who]
	var pr := Keys.problems(k)
	var sh := Keys.shared(key_draft[1], key_draft[2]) if key_who > 0 else {}
	var dm: String = k.dashMode
	var tap := dm == "tap"
	for id in dash_btns:
		dash_btns[id].set_pressed_no_signal(id == dm)
	var L := Keys.key_name(k.left[0] if k.left[0] != null else k.left[1])
	var R := Keys.key_name(k.right[0] if k.right[0] != null else k.right[1])
	if tap:
		dash_hint.text = "双击左 / 右（%s%s / %s%s）往那边冲；按着挡朝对手双击 = 闪身。冲刺键那一行不用。" % [L, L, R, R]
	elif dm == "key":
		dash_hint.text = "按冲刺键往按着的方向冲（不按方向就往前；按着挡按 = 闪身）。双击方向不再冲刺。"
	else:
		dash_hint.text = "两种都能冲：双击左 / 右（%s%s / %s%s），或者按冲刺键（往按着的方向冲，不按方向就往前）；按着挡时这么按 = 闪身。" % [L, L, R, R]
	for e in Keys.ACTIONS:
		var a: String = e[0]
		var off := a == "dash" and tap
		for i in 2:
			var cell: Button = _key_cells[a + str(i)]
			var c = k[a][i]
			var waiting: bool = key_wait != null and key_wait[0] == a and key_wait[1] == i
			cell.disabled = off
			cell.tooltip_text = "选了「双击」，冲刺键不用" if off else ""
			cell.text = "按一个键…" if waiting else Keys.key_name(c)
			var col := UiTheme.CREAM
			var bg := Color(UiTheme.LACQ3, 0.9)
			if waiting:
				bg = UiTheme.CIN
			elif not off and c == null:
				col = UiTheme.DIM
			elif not off and pr.dupCodes.has(c):
				bg = Color("#6e1f14")
				col = Color("#ffd2c4")
			elif not off and sh.has(c):
				bg = Color("#5b4a17")
				col = Color("#ffe9a8")
			cell.add_theme_color_override("font_color", col)
			cell.add_theme_stylebox_override("normal", UiTheme.box(bg, Color(UiTheme.GOLD_D, 0.7), 1, 3, Vector4(8, 4, 8, 4)))
	var msg := []
	for d in pr.dup:
		var names := []
		for a in d[1]:
			var nm := "「%s」" % Keys.act_name(a)
			if not names.has(nm):
				names.append(nm)
		if names.size() > 1:
			msg.append("键位冲突：%s 同时是%s的键" % [Keys.key_name(d[0]), "和".join(names)])
		else:
			msg.append("%s两格都是 %s" % [names[0], Keys.key_name(d[0])])
	for a in pr.missing:
		msg.append("「%s」还没有键" % Keys.act_name(a))
	for w in 3:
		var o := Keys.problems(key_draft[w])
		if w != key_who and (not o.dup.is_empty() or not o.missing.is_empty()):
			msg.append("「%s」那套还有没改好的" % WHO_NAME[w])
	key_msg.text = ("；".join(msg) + "。改好才能保存。") if not msg.is_empty() else ""
	key_msg.visible = not msg.is_empty()
	btn_keys_save.disabled = not msg.is_empty()
	var info := []
	if not sh.is_empty():
		var nms := []
		for c in sh:
			nms.append(Keys.key_name(c))
		info.append("黄色的键两个人都绑了：%s。双人对战时归玩家二%s。" % ["、".join(nms), "，玩家一的这个键不起作用" if key_who == 1 else ""])
	var uses_p := false
	for d in key_draft:
		for e in Keys.ACTIONS:
			if d[e[0]].has("KeyP"):
				uses_p = true
	if uses_p:
		info.append("P 原来也是暂停键；绑到动作上以后，暂停只用 Esc。")
	key_info.text = " ".join(info)
	key_info.visible = not info.is_empty()

func _click_cell(a: String, i: int) -> void:
	# 已经在等这一格：左键再点一下 = 绑鼠标左键
	if key_wait != null and key_wait[0] == a and key_wait[1] == i:
		_bind("Mouse0")
		return
	key_wait = [a, i]
	_render_keys()

## 正在等按键时，鼠标右键 / 中键 / 侧键在格子上按下去也算
func _cell_mouse(ev: InputEvent, _a: String, _i: int) -> void:
	if key_wait == null or not (ev is InputEventMouseButton) or not ev.pressed:
		return
	if ev.button_index in [MOUSE_BUTTON_RIGHT, MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_XBUTTON1, MOUSE_BUTTON_XBUTTON2]:
		_bind(Keys.code_of(ev))
		get_viewport().set_input_as_handled()

func _bind(code: String) -> void:
	if key_wait == null:
		return
	var a: String = key_wait[0]
	var i: int = key_wait[1]
	key_draft[key_who][a][i] = code
	key_wait = null
	_render_keys()

func _capture_key(e: InputEvent) -> void:
	var code := Keys.code_of(e)
	if code == "":
		return
	if e is InputEventMouseButton:
		# 右键、中键、侧键在哪按都行；左键要点「正在等的那一格」（点在格子上会走 _click_cell）
		if e.button_index == MOUSE_BUTTON_LEFT:
			return
		_bind(code)
		get_viewport().set_input_as_handled()
		return
	get_viewport().set_input_as_handled()
	if code == "Escape":
		key_wait = null
		_render_keys()
		return
	if code == "Backspace" or code == "Delete":
		var a: String = key_wait[0]
		key_draft[key_who][a][key_wait[1]] = null
		key_wait = null
		_render_keys()
		return
	if Keys.NO_BIND.has(code):
		key_msg.text = "Ctrl、Alt、Win 这类键不能用，换一个。"
		key_msg.show()
		return
	_bind(code)

func _save_keys() -> void:
	for d in key_draft:
		if not Keys.problems(d).dup.is_empty():
			return
	Keys.save_keys(key_draft[0], key_draft[1], key_draft[2])
	close_keys()

# ---------- 键盘：Esc 暂停 / 关面板，键位面板等按键 ----------
func _input(e: InputEvent) -> void:
	if key_wait != null:
		if (e is InputEventKey and e.pressed and not e.echo) or (e is InputEventMouseButton and e.pressed):
			_capture_key(e)
		elif e is InputEventKey:
			get_viewport().set_input_as_handled()
		return
	if not (e is InputEventKey) or not e.pressed:
		return
	var k: InputEventKey = e
	var code := Keys.code_of(k)
	var focus := get_viewport().gui_get_focus_owner()
	var typing := focus is LineEdit or focus is TextEdit
	match cur:
		"keys", "looks", "settings":
			if code == "Escape" and not k.echo:
				get_viewport().set_input_as_handled()
				if cur == "keys":
					close_keys()
				elif cur == "looks":
					show_overlay("menu")
				else:
					close_settings()
			return
		"pvp":
			var m := {"KeyA": [0, -1], "KeyD": [0, 1], "ArrowLeft": [1, -1], "ArrowRight": [1, 1]}
			if m.has(code):
				get_viewport().set_input_as_handled()
				_cycle_pvp(m[code][0], m[code][1])
			elif code == "Escape":
				get_viewport().set_input_as_handled()
				close_pvp()
			return
		"online":
			if code == "Escape" and not k.echo and not typing:
				get_viewport().set_input_as_handled()
				net_ui.back()
			return
	if typing:
		return
	if code == "Escape" or (code == "KeyP" and Keys.route("KeyP", main.sim.mode).is_empty()):
		if k.echo:
			return
		get_viewport().set_input_as_handled()
		if cur == "pause":
			set_paused(false)
		elif cur == "":
			var m2 := main.sim.mode
			if m2 != "attract" and m2 != "online" and main.sim.phase != "over":
				set_paused(true)
	elif k.keycode == KEY_F11 or (k.keycode == KEY_ENTER and k.alt_pressed):
		get_viewport().set_input_as_handled()
		toggle_full()

func _notification(what: int) -> void:
	# 切出去（换标签页、切到别的窗口）：对局里自动暂停
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		if main != null and main.sim.phase == "fight" and not main.paused and cur == "":
			set_paused(true)


## 黑漆面板：StyleBox 那道暗金边里面再画一道亮金细线；内容太高时自己变成能滚的（scroller）
class LacquerPanel extends PanelContainer:
	var scroller: ScrollContainer
	func _draw() -> void:
		var r := Rect2(Vector2(6, 6), size - Vector2(12, 12))
		draw_rect(r, Color(UiTheme.GOLD, 0.55), false, 1.0)
	func _process(_dt: float) -> void:
		if scroller == null or scroller.get_child_count() == 0:
			return
		var inner: Control = scroller.get_child(0)
		var vh := get_viewport_rect().size.y
		var want := minf(inner.get_combined_minimum_size().y, vh - 120.0)
		if absf(scroller.custom_minimum_size.y - want) > 0.5:
			scroller.custom_minimum_size.y = want


## 菜单上的大字「墨斗」+ 朱砂方印「拳」
class TitleMark extends Control:
	func _init() -> void:
		custom_minimum_size = Vector2(300, 92)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var f: Font = UiTheme.BRUSH
		var fs := 76
		var t := "墨斗"
		var w := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var seal := 40.0
		var total := w + 14.0 + seal
		var x0 := (size.x - total) / 2.0
		var base := size.y / 2.0 + (f.get_ascent(fs) - f.get_descent(fs)) * 0.5
		draw_string_outline(f, Vector2(x0, base), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 26, Color(1.0, 0.7, 0.35, 0.16))
		draw_string_outline(f, Vector2(x0, base), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 10, Color(0.05, 0.02, 0.01, 0.95))
		draw_string(f, Vector2(x0, base), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UiTheme.CREAM)
		var c := Vector2(x0 + w + 14.0 + seal / 2.0, size.y / 2.0 + 8.0)
		draw_rect(Rect2(c.x - seal / 2.0, c.y - seal / 2.0, seal, seal), UiTheme.CIN)
		draw_rect(Rect2(c.x - seal / 2.0 + 3, c.y - seal / 2.0 + 3, seal - 6, seal - 6), Color(UiTheme.CREAM, 0.8), false, 1.2)
		var g := "拳"
		var gs := 30
		var gw := f.get_string_size(g, HORIZONTAL_ALIGNMENT_LEFT, -1, gs).x
		draw_string(f, Vector2(c.x - gw / 2.0, c.y + (f.get_ascent(gs) - f.get_descent(gs)) * 0.5), g, HORIZONTAL_ALIGNMENT_LEFT, -1, gs, Color("#fbf3e2"))
