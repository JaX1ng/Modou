class_name Hud
extends Node2D
## 对战时上面那一条（对照 JS render.js 的 hpBar / drawHud / drawTrainPanel，内容一样，样子照参考图新做：黑漆底、金边、朱砂）：
## 两边：名字是一方印（人物颜色的印泥、米白的字），血条（填的是这个人袍子的颜色 —— 白袍侠是米白、僧是土黄；掉的那一截先朱红、后慢慢退），
##       气条（两格：半格可爆气、满格可泼墨），身份（玩家、电脑 · 困难…），回合胜点（小朱印），连击；
## 中间：计时（铜纹章那样的圆盘，外圈一道朱砂走时间）、回合名。训练场：中间一块黑漆面板写这一招的帧数、帧差、伤害（JS 的训练面板）。
## 这个节点按逻辑画面画（宽 VW、高 VH），整体缩放到屏幕。

const BRUSH := preload("res://assets/fonts/MaShanZheng-Regular.woff2")
const UIF := preload("res://assets/fonts/NotoSansSC-Medium.woff2")
const GOLD := Color("#d8b46a")
const GOLD_D := Color("#8a6a30")
const LACQ := Color("#1d1210")
const LACQ2 := Color("#3a1d14")
const CIN := Color("#b8321d")
const CREAM := Color("#f3ead6")
const MUTED := Color("#bfb3a0")

const BAR_X := 74.0      # 血条从哪儿起（离画面边）
const BAR_LEN := 452.0
const BAR_Y := 22.0
const BAR_H := 20.0

var sim: GameSim
var cam: CameraRig
var anims: Array = []
var views: Array = []
var box := Rect2()       # 训练场面板在画面上的位置（印章躲开它）；没有面板时是空的

static func col_of(F: Fighter) -> Color:
	return Color(C.lookOf(F.look).get("color", "#17181a"))

func _draw() -> void:
	box = Rect2()
	if sim == null or sim.mode == "attract":
		return
	var VW := cam.VW
	_bar(sim.p[0], -1, VW)
	_bar(sim.p[1], 1, VW)
	_timer(VW)
	if sim.mode == "train":
		_train_panel(VW)

## 文字（中心 / 左 / 右对齐），描边。返回字多宽
func text(font: Font, s: String, p: Vector2, size: float, col: Color, align := 0, outline := 0.0, ocol := LACQ) -> float:
	var fs := int(size)
	var w := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var x := p.x - w * 0.5 if align == 0 else (p.x if align < 0 else p.x - w)
	var base := p.y + (font.get_ascent(fs) - font.get_descent(fs)) * 0.5
	if outline > 0.0:
		draw_string_outline(font, Vector2(x, base), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, int(outline), ocol)
	draw_string(font, Vector2(x, base), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
	return w

## 血条填什么颜色：这个人袍子的颜色（画面上一眼对得上是谁）
func _robe_col(F: Fighter) -> Color:
	if F.idx < views.size() and views[F.idx].outfit != null:
		return views[F.idx].outfit.robe
	return _vivid(col_of(F))

func _bar(F: Fighter, side: int, VW: float) -> void:
	var dir := 1.0 if side < 0 else -1.0
	var x0 := BAR_X if side < 0 else VW - BAR_X
	var len := BAR_LEN
	var y := BAR_Y
	var h := BAR_H
	var col := col_of(F)
	var P := Pal.of(C.lookOf(F.look).get("color", "#17181a"))
	# 名字：一方印（人物颜色的印泥，金边，米白的毛笔字）
	var sx := x0 - dir * 38.0
	var sy := 38.0
	_name_seal(Vector2(sx, sy), F.name, col)
	# 底板：黑漆，斜着的一条（往中间收），金边
	var back := PackedVector2Array([Vector2(x0 - dir * 6, y - 6), Vector2(x0 + dir * (len + 8), y - 6), Vector2(x0 + dir * (len - 8), y + h + 6), Vector2(x0 - dir * 6, y + h + 6)])
	draw_colored_polygon(back, Color(LACQ, 0.88))
	draw_polyline(_closed(back), Color(GOLD_D, 0.95), 1.2, true)
	var pts := _bar_poly(x0, y, h, dir, len, len)
	draw_colored_polygon(pts, Color("#2b1a15"))
	# 掉的那一截（朱砂，慢慢退）
	var lw := len * clampf(F.lagHp / F.maxHp, 0.0, 1.0)
	var w := len * clampf(maxf(0.0, F.hp) / F.maxHp, 0.0, 1.0)
	if lw > 0.5:
		draw_colored_polygon(_bar_poly(x0, y, h, dir, lw, len), Color(CIN, 0.9))
	# 血：袍子的颜色，上亮下暗一点（漆面），上沿一道高光
	if w > 0.5:
		var fc := _robe_col(F)
		var poly := _bar_poly(x0, y, h, dir, w, len)
		var cols := PackedColorArray()
		for p in poly:
			var t := (p.y - y) / h
			cols.append(fc.lightened(0.18).lerp(fc.darkened(0.28), t))
		draw_polygon(poly, cols)
		draw_colored_polygon(_bar_poly(x0, y + 2.0, 3.0, dir, w, len, true), Color(1, 1, 1, 0.3))
	# 刻度：四分之一一道细金线
	for i in range(1, 4):
		var tx := x0 + dir * len * i / 4.0
		draw_line(Vector2(tx, y + 1), Vector2(tx - dir * 2.0, y + h - 1), Color(LACQ, 0.45), 1.0, true)
	draw_polyline(_closed(pts), GOLD, 1.8, true)
	# 气：两格（半格可爆气、满格可泼墨），满了一闪一闪
	var ql := 250.0
	var qy := 51.0
	var qh := 7.0
	var qx := x0 + 4.0 if dir > 0.0 else x0 - 4.0 - ql
	var qw := ql * clampf(F.qi / C.QI_MAX, 0.0, 1.0)
	var full := F.qi >= C.QI_MAX
	var half := F.qi >= C.QI_BURST
	draw_rect(Rect2(qx - 2, qy - 2, ql + 4, qh + 4), Color(LACQ, 0.85))
	var qc := Color(P.fx) if full else Color(P.qi)
	qc = _vivid(qc).lightened(0.1)
	qc.a = 0.7 + 0.3 * sin(F.clock * 0.3) if full else 0.95
	draw_rect(Rect2(qx if dir > 0.0 else qx + ql - qw, qy, qw, qh), qc)
	draw_rect(Rect2(qx, qy, ql, qh), Color(GOLD_D, 0.9), false, 1.0)
	draw_rect(Rect2(qx + ql / 2.0 - 1.0, qy - 3.0, 2.0, qh + 6.0), GOLD)
	var lbl := "气满 · 可泼墨" if full else ("气 · 可爆气" if half else "气")
	text(BRUSH, lbl, Vector2(qx + ql + 9.0 if dir > 0.0 else qx - 9.0, qy + 3.5), 15.0, (GOLD.lightened(0.15) if half else MUTED), -1 if dir > 0.0 else 1, 4.0, Color(LACQ, 0.85))
	# 身份
	text(UIF, F.label, Vector2(x0 + dir * 2.0, 74.0), 13.0, CREAM, -1 if dir > 0.0 else 1, 4.0, Color(LACQ, 0.85))
	# 回合胜点：小朱印（赢了一局盖一个），训练场没有
	if sim.mode != "train":
		for i in C.WIN_ROUNDS:
			var cx := x0 + dir * (len - 12.0 - i * 21.0)
			var cy := 68.0
			if sim.wins[F.idx] > i:
				_rough_square(Vector2(cx, cy), 7.5, CIN)
				draw_rect(Rect2(cx - 4.5, cy - 4.5, 9, 9), Color(CREAM, 0.9), false, 1.0)
			else:
				draw_rect(Rect2(cx - 7, cy - 7, 14, 14), Color(LACQ, 0.6))
				draw_rect(Rect2(cx - 7, cy - 7, 14, 14), Color(GOLD_D, 0.9), false, 1.2)
	# 连击：大的毛笔数字（金）+「连击」（这个人的颜色）
	if F.combo >= 2 and F.comboT > 0.0:
		var a := minf(1.0, F.comboT / 20.0)
		var num := str(F.combo)
		var nw := BRUSH.get_string_size(num, HORIZONTAL_ALIGNMENT_LEFT, -1, 50).x
		var lw2 := BRUSH.get_string_size("连击", HORIZONTAL_ALIGNMENT_LEFT, -1, 24).x
		var left := x0 + 2.0 if dir > 0.0 else x0 - 2.0 - lw2 - 8.0 - nw
		var c2 := _vivid(col).lightened(0.15)
		c2.a = a
		text(BRUSH, num, Vector2(left, 122.0), 50.0, Color(GOLD.lightened(0.25), a), -1, 9.0, Color(LACQ, 0.9 * a))
		text(BRUSH, "连击", Vector2(left + nw + 8.0, 127.0), 24.0, c2, -1, 6.0, Color(LACQ, 0.9 * a))

## 血条的形状：上沿 len 长，下沿两头各收一点（斜的）；w = 填到多长
func _bar_poly(x0: float, y: float, h: float, dir: float, w: float, len: float, flat := false) -> PackedVector2Array:
	var top_end := x0 + dir * minf(w, len)
	if flat:
		return PackedVector2Array([Vector2(x0, y), Vector2(top_end, y), Vector2(top_end, y + h), Vector2(x0, y + h)])
	var bot_end := x0 + dir * minf(w, len - 12.0)
	return PackedVector2Array([Vector2(x0, y), Vector2(top_end, y), Vector2(bot_end, y + h), Vector2(x0, y + h)])

## 名字印：人物颜色的方印，金边，字米白（颜色太深的印泥上加一圈金，不然在黑漆上看不出来）
func _name_seal(c: Vector2, name: String, col: Color) -> void:
	var s := 21.0
	var ink := col if col.get_luminance() > 0.08 else Color("#26211f")
	draw_rect(Rect2(c.x - s - 3, c.y - s - 3, 2 * s + 6, 2 * s + 6), Color(LACQ, 0.85))
	_rough_square(c, s, ink)
	draw_rect(Rect2(c.x - s + 3, c.y - s + 3, 2 * s - 6, 2 * s - 6), Color(CREAM, 0.75), false, 1.2)
	draw_rect(Rect2(c.x - s - 3, c.y - s - 3, 2 * s + 6, 2 * s + 6), GOLD_D, false, 1.4)
	text(BRUSH, name, c + Vector2(0, 1), 31.0, Color("#f6efe0"), 0)

## 边上有一点毛的方块（印）
func _rough_square(c: Vector2, s: float, col: Color) -> void:
	var pts := PackedVector2Array()
	var n := 7
	var corners := [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]
	for k in 4:
		var a: Vector2 = corners[k]
		var b: Vector2 = corners[(k + 1) % 4]
		for i in n:
			var t := float(i) / n
			var p := a.lerp(b, t) * s
			var nrm := Vector2(-(b - a).y, (b - a).x).normalized()
			p -= nrm * (0.6 * sin(float(k * 13 + i) * 2.7))
			pts.append(c + p)
	draw_colored_polygon(pts, col)

static func _closed(p: PackedVector2Array) -> PackedVector2Array:
	var q := p.duplicate()
	q.append(p[0])
	return q

## 太深的颜色（墨、靛、黛）在黑漆底上看不清：提亮
static func _vivid(c: Color) -> Color:
	if c.get_luminance() < 0.18:
		return c.lightened(0.42) if c.s < 0.2 else Color.from_hsv(c.h, minf(1.0, c.s * 1.1), clampf(c.v * 1.9 + 0.12, 0.0, 0.92))
	return c

func _timer(VW: float) -> void:
	var c := Vector2(VW / 2.0, 42.0)
	# 铜纹章：外面一圈金、里面黑漆、一圈回纹
	draw_circle(c, 37.0, Color(LACQ, 0.92), true, -1.0, true)
	draw_circle(c, 35.5, GOLD_D, false, 2.0, true)
	draw_circle(c, 29.5, Color(GOLD, 0.8), false, 1.2, true)
	for i in 24:
		var a := TAU * i / 24.0
		var p0 := c + Vector2(cos(a), sin(a)) * 31.5
		var p1 := c + Vector2(cos(a), sin(a)) * 34.0
		draw_line(p0, p1, Color(GOLD_D, 0.9), 1.2, true)
	var frac := 1.0 if sim.endless else sim.timer / C.ROUND_FRAMES
	draw_arc(c, 39.5, -PI / 2.0, -PI / 2.0 + TAU * frac, 64, CIN, 3.0, true)
	if sim.endless:
		text(UIF, "∞", c + Vector2(0, -2), 32.0, CREAM, 0)
	else:
		var sec := str(ceili(sim.timer / 60.0))
		text(BRUSH, sec, c + Vector2(0, 2), 27.0 if sec.length() > 2 else 34.0, CREAM, 0, 4.0, Color(LACQ, 0.9))
	if sim.mode != "train":
		text(BRUSH, sim.roundName(), Vector2(VW / 2.0, 98.0), 19.0, GOLD.lightened(0.15), 0, 5.0, Color(LACQ, 0.85))

# ---------- 训练场面板（对照 JS drawTrainPanel；破招练习没做，那一行换成别的提示） ----------
func _train_panel(VW: float) -> void:
	var P: Fighter = sim.p[0]
	var D: Fighter = sim.p[1]
	var I = P.info
	var w := minf(760.0, VW - 40.0)
	var x := VW / 2.0 - w / 2.0
	var y := 84.0
	var pad := 18.0
	var h := 126.0
	var tx := x + pad + 68.0
	var right := x + w - pad
	box = Rect2(x, y, w, h)
	# 黑漆面板、金边
	draw_rect(Rect2(x + 3, y + 5, w, h), Color(0, 0, 0, 0.25))
	draw_rect(Rect2(x, y, w, h), Color(LACQ, 0.86))
	draw_rect(Rect2(x + 0.5, y + 0.5, w - 1, h - 1), Color(GOLD_D, 0.95), false, 1.2)
	draw_rect(Rect2(x + 4.5, y + 4.5, w - 9, h - 9), Color(GOLD_D, 0.4), false, 1.0)
	# 左上朱印小签「训练」
	_rough_square_rect(Rect2(x + pad, y + 13, 56, 32), CIN)
	text(BRUSH, "训练", Vector2(x + pad + 28, y + 30), 22.0, CREAM, 0)
	# 右上：木桩的血
	var hpT := "木桩 %d / %d · 三成以下回满" % [maxi(0, int(C.jsround(D.hp))), int(D.maxHp)]
	var hpw := text(UIF, hpT, Vector2(right, y + 26), 12.0, MUTED, 1)
	var tw := right - hpw - 18.0 - tx
	# 第一行：这一招 + 系 + 帧数（还没打中过就写「随便打」）
	var name: String = I.label if I != null else "随便打"
	var sub := ""
	if I == null:
		sub = "打中木桩，这里写这一招的帧数、帧差、伤害"
	else:
		var parts := []
		if I.get("tier", null) != null and str(I.get("tier", "")) != "":
			parts.append("%s·%s" % [Moves.TIER_NAME.get(I.get("lead", ""), ""), Moves.TIER_NAME.get(I.tier, "")])
		if I.get("S", null) != null:
			parts.append("前摇 %s · 判定 %s · 后摇 %s" % [_num(I.S), _num(I.A), _num(I.R)])
		sub = "　".join(parts)
	var nm := _fit(BRUSH, name, tw, [26, 22])
	var nmw := text(BRUSH, nm[0], Vector2(tx, y + 27), nm[1], CREAM, -1)
	if sub != "" and tw - nmw - 14.0 > 40.0:
		var sf := _fit(UIF, sub, tw - nmw - 14.0, [13, 12])
		text(UIF, sf[0], Vector2(tx + nmw + 14.0, y + 28), sf[1], MUTED, -1)
	# 下面三行：左边小字是哪一项，右边是数
	var r1 := y + 62.0
	var r2 := y + 84.0
	var r3 := y + 106.0
	if I == null:
		_row("提示", r1, x, pad)
		_val("下面能换木桩的动作（站、蹲、挡、乱挡、一直跳），还能开无限气", r1, tx, right, CREAM)
		_row("复位", r2, x, pad)
		_val("两个人回到场地中间、血和气回满：点下面的「复位」", r2, tx, right, GOLD.lightened(0.1))
	else:
		_row("这下", r1, x, pad)
		var dmg := int(I.get("dmg", 0))
		var how: String = str(I.get("how", ""))
		var hw := _val("%s%s" % [how, ("  -%d" % dmg) if dmg > 0 else ""], r1, tx, right, Color("#8fb3e8") if how == "被挡" else CREAM)
		var why: String = str(I.get("why", "")) if I.get("why", null) != null else ""
		if why != "" and right - (tx + hw + 16.0) > 40.0:
			_val(why, r1, tx + hw + 16.0, right, MUTED)
		_row("帧差", r2, x, pad)
		var adv_s := "—"
		var adv = I.get("adv", null)
		if I.get("down", false):
			adv_s = "击倒"
		elif adv != null:
			var av := int(adv)
			adv_s = ("+" if av > 0 else "") + str(av) + " 帧" + ("（你先动）" if av > 0 else ("（对方先动）" if av < 0 else "（一起动）"))
		var good: bool = I.get("down", false) or (adv != null and int(adv) > 0)
		_val(adv_s, r2, tx, right, Color("#e8735a") if good else CREAM)
	_row("连击", r3, x, pad)
	var pc := ""
	if P.prevCombo != null and int(P.prevCombo.hits) >= 2:
		pc = "　上一套 %d 下 · %s" % [int(P.prevCombo.hits), _num(P.prevCombo.dmg)]
	_val("这一套 %d 下 · %s%s　最高 %s" % [P.combo, _num(P.comboDmg), pc, _num(P.maxComboDmg)], r3, tx, right, CREAM)

func _row(k: String, yy: float, x: float, pad: float) -> void:
	text(UIF, k, Vector2(x + pad + 56.0, yy), 13.0, MUTED, 1)

func _val(v: String, yy: float, x0: float, right: float, col: Color) -> float:
	var f := _fit(UIF, v, right - x0, [15, 14, 13])
	return text(UIF, f[0], Vector2(x0, yy), f[1], col, -1)

## 一行字放不下：先按 sizes 从大到小缩字号，最小号还放不下就截短加「…」（JS fitLine）。返回 [字, 字号]
func _fit(font: Font, s: String, maxw: float, sizes: Array) -> Array:
	for sz in sizes:
		if font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x <= maxw:
			return [s, float(sz)]
	var last: int = sizes[sizes.size() - 1]
	var t := s
	while t.length() > 1 and font.get_string_size(t + "…", HORIZONTAL_ALIGNMENT_LEFT, -1, last).x > maxw:
		t = t.substr(0, t.length() - 1)
	return [t + "…", float(last)]

static func _num(v) -> String:
	var f := float(v)
	if f == floorf(f):
		return str(int(f))
	return str(snappedf(f, 0.1))

func _rough_square_rect(r: Rect2, col: Color) -> void:
	var pts := PackedVector2Array()
	var corners := [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]
	for k in 4:
		var a: Vector2 = corners[k]
		var b: Vector2 = corners[(k + 1) % 4]
		for i in 6:
			var t := float(i) / 6
			var p := a.lerp(b, t)
			var nrm := Vector2(-(b - a).y, (b - a).x).normalized()
			pts.append(p - nrm * (0.7 * sin(float(k * 11 + i) * 2.3)))
	draw_colored_polygon(pts, col)
