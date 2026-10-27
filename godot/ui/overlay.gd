class_name Overlay
extends Node2D
## 画面最上面一层（按逻辑画面画）：正中的大字（回合名、战、胜负已分、某某 胜……）、画面白一下、对手在画面外的箭头。
## 大字新做的样子（照参考图）：身后一笔浓墨横扫（朱红偏暗），字是米金色、浓墨描边、外面一圈暖光。

const BRUSH := preload("res://assets/fonts/MaShanZheng-Regular.woff2")
const UIF := preload("res://assets/fonts/NotoSansSC-Medium.woff2")
const DT := C.DT

var main: Main

func _draw() -> void:
	if main == null:
		return
	var cam: CameraRig = main.cam
	var VW := cam.VW
	var VH := cam.VH
	var RA: float = main.RA
	# 画面白一下
	if main.fx.flash > 0.01:
		draw_rect(Rect2(0, 0, VW, VH), Color(0.96, 0.95, 0.92, main.fx.flash))
	var sim: GameSim = main.sim
	if sim.mode == "pve" or sim.mode == "online" or sim.mode == "train":
		var me := main.local_idx()
		_offscreen(me, 1 - me)
	for e in main.fx.fx:
		if e.type == "announce":
			_announce(e, VW, VH, RA)
	if sim.mode == "online" and main.net != null:
		_net_status(VW, VH)

func _announce(e: Dictionary, VW: float, VH: float, RA: float) -> void:
	var L: float = e.life + (1.0 - RA) * DT
	var age := maxf(0.0, e.max - L)
	var sc := 1.35 - 0.35 * Pose.ease_fn("out", age / 10.0) if age < 10.0 else 1.0 + (age - 10.0) * 0.0012
	var a := minf(1.0, age / 6.0) * minf(1.0, L / 14.0)
	var size: float = e.size
	var fs := int(size)
	var c := Vector2(VW / 2.0, VH * 0.425)
	draw_set_transform(c, 0.0, Vector2(sc, sc))
	var w := BRUSH.get_string_size(e.text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	# 身后一笔浓墨：两头尖、边上毛，跟着字宽
	var sw := w * 0.5 + size * 0.9
	var sh := size * 0.42
	var stroke_col := Color("#5c140d")
	stroke_col.a = 0.82 * a
	var pts := PackedVector2Array()
	var n := 24
	for i in n + 1:
		var t := float(i) / n
		var x := lerpf(-sw, sw, t)
		var th := sh * pow(sin(PI * t), 0.55) * (1.0 + 0.08 * sin(t * 37.0))
		pts.append(Vector2(x, -th + size * 0.04 * sin(t * 5.0)))
	for i in range(n, -1, -1):
		var t := float(i) / n
		var x := lerpf(-sw, sw, t) + size * 0.06
		var th := sh * pow(sin(PI * t), 0.7) * (1.0 + 0.1 * cos(t * 29.0))
		pts.append(Vector2(x, th * 0.9 + size * 0.04 * sin(t * 5.0)))
	draw_colored_polygon(pts, stroke_col)
	# 字：外面一圈暖光、浓墨描边、米金色的字；赢的人的大字用他的颜色描一圈
	var base := (BRUSH.get_ascent(fs) - BRUSH.get_descent(fs)) * 0.5
	var pos := Vector2(-w * 0.5, base)
	draw_string_outline(BRUSH, pos, e.text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, int(size * 0.34), Color(1.0, 0.72, 0.35, 0.22 * a))
	draw_string_outline(BRUSH, pos, e.text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, int(size * 0.14), Color(0.08, 0.04, 0.03, 0.95 * a))
	var own := Color(e.col)
	if String(e.col) != Pal.INK:
		draw_string_outline(BRUSH, pos, e.text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, int(size * 0.06), Color(Hud._vivid(own), a))
	draw_string(BRUSH, pos, e.text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(0.98, 0.9, 0.7, a))
	if e.sub != "":
		var ss := 30
		var sw2 := BRUSH.get_string_size(e.sub, HORIZONTAL_ALIGNMENT_LEFT, -1, ss).x
		var sp := Vector2(-sw2 * 0.5, size * 0.62 + (BRUSH.get_ascent(ss) - BRUSH.get_descent(ss)) * 0.5)
		draw_string_outline(BRUSH, sp, e.sub, HORIZONTAL_ALIGNMENT_LEFT, -1, ss, 6, Color(0.08, 0.04, 0.03, 0.9 * a))
		draw_string(BRUSH, sp, e.sub, HORIZONTAL_ALIGNMENT_LEFT, -1, ss, Color(0.86, 0.3, 0.18, a))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

## 联机的状态（对照 JS drawNetStatus）：掉线等人回来 / 等待对方… / 最下面一行延迟（不同步了就写红字）
func _net_status(VW: float, VH: float) -> void:
	var n: NetSession = main.net
	if n.reconnecting:
		var y0 := VH * 0.343
		_plate(Rect2(VW / 2.0 - 190.0, y0, 380.0, 80.0))
		_ctext(BRUSH, "对方掉线 · 重连中", Vector2(VW / 2.0, y0 + 30.0), 30, Color("#f3ead6"))
		_ctext(UIF, "连回来就接着打（还等 %d 秒）" % n.reconnect_left(), Vector2(VW / 2.0, y0 + 60.0), 13, Color("#c2b5a0"))
	elif n.stall > 30:
		var y1 := VH * 0.36
		_plate(Rect2(VW / 2.0 - 140.0, y1, 280.0, 60.0))
		_ctext(BRUSH, "等待对方…", Vector2(VW / 2.0, y1 + 30.0), 30, Color("#f3ead6"))
	var t := ""
	if n.desync:
		t = "联机不同步：双方画面可能不一致"
	else:
		var roll := ""
		if n.rb != null and int(n.rb.stats.rollbacks) > 0:
			roll = " · 回滚 %.1f 帧/次" % (float(n.rb.stats.frames) / C.SUB / maxf(1.0, float(n.rb.stats.rollbacks)))
		t = "%s往返 %d 毫秒 · 输入延迟 %s 帧%s" % ["经中继 · " if n.via == "relay" else "", int(round(n.rtt)), str(snappedf(float(n.delay) / C.SUB, 0.01)), roll]
	var col := Color("#e8735a") if n.desync else Color(0.95, 0.92, 0.85, 0.75)
	_ctext(UIF, t, Vector2(VW / 2.0, VH - 22.0), 13, col, 4)

func _plate(r: Rect2) -> void:
	draw_rect(r, Color(Hud.LACQ, 0.85))
	draw_rect(r, Hud.GOLD_D, false, 1.2)

func _ctext(f: Font, s: String, c: Vector2, fs: int, col: Color, outline := 0) -> void:
	var w := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var p := Vector2(c.x - w * 0.5, c.y + (f.get_ascent(fs) - f.get_descent(fs)) * 0.5)
	if outline > 0:
		draw_string_outline(f, p, s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, outline, Color(Hud.LACQ, 0.8))
	draw_string(f, p, s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)

## 对手在画面外：画面边上一个他颜色的箭头 + 名字 + 离多远
func _offscreen(me_i: int, op_i: int) -> void:
	var cam: CameraRig = main.cam
	var me: Fighter = main.sim.p[me_i]
	var op: Fighter = main.sim.p[op_i]
	var sx := cam.VW / 2.0 + (op.x - cam.camX) * cam.camZ
	if sx > -8.0 and sx < cam.VW + 8.0:
		return
	var right := sx >= cam.VW + 8.0
	var x := cam.VW - 26.0 if right else 26.0
	var y := cam.FY - 150.0 * cam.camZ
	var col := Hud._vivid(Hud.col_of(op))
	draw_set_transform(Vector2(x, y), 0.0, Vector2(1.0 if right else -1.0, 1.0))
	draw_circle(Vector2(-8, 0), 30.0, Color(Hud.LACQ, 0.8), true, -1.0, true)
	draw_circle(Vector2(-8, 0), 30.0, Hud.GOLD_D, false, 1.5, true)
	draw_colored_polygon(PackedVector2Array([Vector2(14, 0), Vector2(-8, -15), Vector2(-3, 0), Vector2(-8, 15)]), col)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	var tx := x + (-6.0 if right else 6.0)
	var fs := 20
	var nw := BRUSH.get_string_size(op.name, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string_outline(BRUSH, Vector2(tx - nw * 0.5, y + 50), op.name, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 5, Color(Hud.LACQ, 0.85))
	draw_string(BRUSH, Vector2(tx - nw * 0.5, y + 50), op.name, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
	var d := str(int(C.jsround(absf(op.x - me.x) / 10.0)) * 10)
	var dw := UIF.get_string_size(d, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
	draw_string(UIF, Vector2(tx - dw * 0.5, y + 68), d, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("#efe4cc"))
