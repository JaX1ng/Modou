class_name FxDraw
extends Node2D
## 画特效（对照 JS render.js 的 drawFx / drawQi / drawStamps / drawFighter 里画在身后的那些）。
## 这个节点的变换 = 场地坐标 → 屏幕像素（每帧照镜头设，和 2D 版的 ctx 变换一样），所以下面都按场地坐标画，算法照搬。
## 三层：back 画在人身后（墨渍、脚下的火光、身后的火苗、残影、拳脚轨迹、身上的光），front 画在人前面（火星、特效、飘字），
## stamps 只画印章（放在血条、训练面板上面那一层：训练场里印章落在面板上就往下挪，JS 2.3 那样）。
## 飘字、印章、数字是新做的样子（照参考图：浓墨描边、金边、朱砂印）。

const BRUSH := preload("res://assets/fonts/MaShanZheng-Regular.woff2")
const DT := C.DT
const FLOOR := C.FLOOR
const DUST := Color("#8d8a7e")
const PAPER := Color("#ebeae2")
const SEAL_K := 0.86

var layer := "front"          # back / front / stamps
var fxs: Fx
var hud: Hud                   # 训练场面板在哪（印章躲开它）
var anims: Array = []
var cam: CameraRig
var RA := 1.0
var frame := 0
var mode := ""
var reduce_motion := false

static var _flames := {}      # 火苗的小图（白的，画的时候着色）：[形状][body / rim / core / coreHot]

func _ready() -> void:
	if _flames.is_empty():
		_make_flames()

func RL(e: Dictionary) -> float:
	return e.life + (1.0 - RA) * DT

func RX(e: Dictionary) -> float:
	return lerpf(e.px, e.x, RA) if e.has("px") else e.x

func RY(e: Dictionary) -> float:
	return lerpf(e.py, e.y, RA) if e.has("py") else e.y

static func ca(c: String, a: float) -> Color:
	var v := Color(c)
	v.a = clampf(a, 0.0, 1.0)
	return v

## 浅一点的同色（火花的芯）：和纸色按六成混
static func tint(c: String) -> Color:
	var v := Color(c)
	return Color(v.r + (250.0 / 255.0 - v.r) * 0.6, v.g + (250.0 / 255.0 - v.g) * 0.6, v.b + (250.0 / 255.0 - v.b) * 0.6)

## 粗线带圆头
func stroke(a: Vector2, b: Vector2, w: float, col: Color) -> void:
	if col.a <= 0.003:
		return
	draw_line(a, b, col, maxf(w, 0.5), true)
	if w > 2.2:
		draw_circle(a, w * 0.5, col, true, -1.0, true)
		draw_circle(b, w * 0.5, col, true, -1.0, true)

func ellipse_pts(c: Vector2, rx: float, ry: float, a0 := 0.0, a1 := TAU, n := 28) -> PackedVector2Array:
	var p := PackedVector2Array()
	for i in n + 1:
		var a := a0 + (a1 - a0) * i / n
		p.append(c + Vector2(cos(a) * rx, sin(a) * ry))
	return p

func fill_poly(pts: PackedVector2Array, col: Color) -> void:
	if pts.size() < 3 or col.a <= 0.003:
		return
	var tri := Geometry2D.triangulate_polygon(pts)
	if tri.is_empty():
		var hull := Geometry2D.convex_hull(pts)
		if hull.size() >= 3:
			draw_colored_polygon(hull, col)
		return
	draw_colored_polygon(pts, col)

func _draw() -> void:
	if fxs == null:
		return
	_splits.clear()
	if layer == "back":
		_draw_back()
	elif layer == "stamps":
		_draw_stamps()
	else:
		_ensure_split()
		_draw_front()
		_mask.queue_redraw()
		_stext.queue_redraw()

# ---------- 身后 ----------
func _draw_back() -> void:
	# 地上的墨渍
	for s in fxs.splats:
		var a := 0.55 * minf(1.0, RL(s) / 60.0)
		fill_poly(ellipse_pts(Vector2(s.x, FLOOR + 1.5), s.rx, s.rx * 0.32, 0.0, TAU, 16), ca(s.color, a))
	for a: FighterAnim in anims:
		if a.J.is_empty():
			continue
		var F := a.F
		var P := Pal.of(C.lookOf(F.look).get("color", Pal.INK))
		# 脚下的影子（JS drawFighter 开头那个）：跳得越高越小，躺下的长一点；挨打抖的时候跟着抖
		var vx := a.view_x(RA) + _shake_dx(a)
		var sw := 38.0 * (1.0 - minf(a.view_alt(RA), 200.0) / 320.0)
		var down := F.state == "down" or F.state == "ko"
		fill_poly(ellipse_pts(Vector2(vx + F.facing * a.disp.dx * 0.5, FLOOR + 3.0), 58.0 if down else sw, 5.5, 0.0, TAU, 28), Color(0.06, 0.05, 0.05, 0.3))
		# 连招烧旺了：脚下烧红一片，一明一暗
		if a.heat > 0.5 and not reduce_motion:
			var k := minf(1.0, (a.heat - 0.5) / 0.8)
			var R := 48.0 + 58.0 * k
			var al := (0.24 + 0.4 * k) * (0.85 + 0.15 * sin(F.clock * 0.5))
			for i in 5:
				var u := float(i) / 5.0
				fill_poly(ellipse_pts(Vector2(F.x, FLOOR + 2.0), R * (1.0 - u * 0.8), R * 0.2 * (1.0 - u * 0.8), 0.0, TAU, 24), ca(P.qi, al * 0.25))
		# 身后的火苗
		_draw_qi(a, false, P)
		# 残影：自己的气的颜色，淡的
		for g in a.ghosts:
			_silhouette(g.J, ca(P.qi, (0.16 if g.get("dash", false) else 0.26) * RL(g) / 12.0), 0.0, a.bd)
		# 拳脚轨迹：短拳细细一道墨，重招一道粗的淡色
		var tr: Array = a.trail
		var m := F.move
		if tr.size() > 1:
			var heavy := m != null and m.def.heavy
			var special := m != null and (heavy or m.def.stamp != "" or m.def.rush or m.def.tag != "")
			var pts := []
			for e in tr:
				pts.append(e)
			if RA < 1.0 and int(tr[tr.size() - 1].f) == frame:
				var a0: Dictionary = tr[tr.size() - 2]
				var b0: Dictionary = tr[tr.size() - 1]
				pts[pts.size() - 1] = {"x": lerpf(a0.x, b0.x, RA), "y": lerpf(a0.y, b0.y, RA), "life": b0.life}
			for i in range(1, pts.size()):
				var u := float(i) / pts.size()
				var al := (0.62 if heavy else 0.5) * u * (RL(pts[i]) / 9.0)
				var col: String = P.qi if special else P.ink
				stroke(Vector2(pts[i - 1].x, pts[i - 1].y), Vector2(pts[i].x, pts[i].y), 1.0 + u * (12.0 if heavy else (9.0 if special else 6.0)), ca(col, al))
		# 运气时身上一层半透明的光（连招、泼墨、爆气、截拳、卸力）
		if a.qiGlow > 0.04 and not reduce_motion:
			var hk := minf(1.0, a.heat)
			var pulse := 0.8 + 0.2 * sin(F.clock * 0.45)
			var g0 := a.qiGlow * pulse * 0.85
			for i in 4:
				var u := float(i) / 3.0
				_silhouette(a.J, ca(P.qi, minf(1.0, g0) * 0.22 * (1.0 - u * 0.5)), 3.0 + (8.0 + 8.0 * hk) * u, a.bd)

## 挨打时左右抖（JS drawFighter：打中停顿里左右抖几下，最多 3 像素）
func _shake_dx(a: FighterAnim) -> float:
	if a.hitShake <= 0.0 or reduce_motion:
		return 0.0
	return (1.0 if int(ceilf(a.hitShake)) % 2 == 1 else -1.0) * minf(3.0, a.hitShake * 0.5)

## 整个人的剪影（残影、身上的光）：一块一块合成一整块再画（重叠的地方不会更深）
func _silhouette(J: Dictionary, col: Color, grow: float, bd: BodyDef) -> void:
	if col.a <= 0.004 or J.is_empty():
		return
	var parts: Array = BodyGeo.bodyParts(bd, J, grow).parts
	var polys := []
	for p in parts:
		var q := PackedVector2Array()
		for pt in p.pts:
			q.append(Vector2(pt[0], pt[1]))
		polys.append(q)
	# 并成几块（Geometry2D 合并：重叠的部分只算一次）
	var merged: Array = [polys[0]]
	for i in range(1, polys.size()):
		var nxt := []
		var cur: PackedVector2Array = polys[i]
		for m in merged:
			var r := Geometry2D.merge_polygons(m, cur)
			if r.size() == 1:
				cur = r[0]
			else:
				nxt.append(m)
		nxt.append(cur)
		merged = nxt
	for m in merged:
		if not Geometry2D.is_polygon_clockwise(m) or true:
			fill_poly(m, col)

# ---------- 人前面 ----------
func _draw_front() -> void:
	for a: FighterAnim in anims:
		if a.J.is_empty():
			continue
		var F := a.F
		var P := Pal.of(C.lookOf(F.look).get("color", Pal.INK))
		_draw_qi(a, true, P)
		# 势破：头上一个「势」字，一圈慢慢走完（是对面挡出来的：对面的颜色）
		if F.slowJab > 0.0 and F.state != "down" and F.state != "ko":
			var frac := F.slowJab / C.SLOW_JAB_FRAMES
			var oc: String = C.lookOf(F.opp.look).get("color", Pal.CIN) if F.opp != null else Pal.CIN
			var hx: float = a.J.head[0]
			var hy: float = a.J.head[1]
			draw_arc(Vector2(hx, hy - 30), 9.0, -PI / 2.0, -PI / 2.0 + TAU * frac, 24, ca(oc, 0.85), 2.4, true)
			_text("势", Vector2(hx, hy - 29), 13.0, ca(oc, 1.0), Color(0, 0, 0, 0), 0.0)
	for e in fxs.fx:
		_draw_fx(e)

func _draw_fx(e: Dictionary) -> void:
	var L := RL(e)
	var u := clampf(1.0 - L / e.max, 0.0, 1.0)
	var x := RX(e)
	var y := RY(e)
	match e.type:
		"drop":
			var a := minf(1.0, L / 20.0)
			var sp := sqrt(e.vx * e.vx + e.vy * e.vy)
			var ang := atan2(e.vy, e.vx)
			var Lt: float = e.r + minf(16.0, sp * 1.8)
			var pts := PackedVector2Array([Vector2(x - cos(ang) * Lt, y - sin(ang) * Lt)])
			for i in 9:
				var aa := ang - PI / 2.0 + PI * i / 8.0
				pts.append(Vector2(x + cos(aa) * e.r, y + sin(aa) * e.r))
			fill_poly(pts, ca(e.color, a))
		"spark":
			var a := minf(1.0, L / 6.0)
			var sp := sqrt(e.vx * e.vx + e.vy * e.vy)
			if sp == 0.0:
				sp = 1.0
			var Lt := minf(36.0, sp * 3.2 + 4.0)
			var ux: float = e.vx / sp
			var uy: float = e.vy / sp
			stroke(Vector2(x - ux * Lt, y - uy * Lt), Vector2(x, y), e.w * (0.45 + 0.55 * a), ca(e.color, a))
			var tc := tint(e.color)
			tc.a = a
			stroke(Vector2(x - ux * Lt * 0.45, y - uy * Lt * 0.45), Vector2(x, y), e.w * 0.38, tc)
		"star":
			var g := Pose.ease_fn("out", minf(1.0, u * 2.4))
			var r0: float = e.size * 0.1
			var col := ca(e.color, 1.0 - u * u)
			for s in e.spikes:
				var Ls: float = e.size * s.len * (0.3 + 0.7 * g)
				var w: float = e.size * s.w * (1.0 - u * 0.75)
				var cc := cos(s.a)
				var sa := sin(s.a)
				draw_colored_polygon(PackedVector2Array([Vector2(x + cc * r0 - sa * w, y + sa * r0 + cc * w), Vector2(x + cc * Ls, y + sa * Ls),
					Vector2(x + cc * r0 + sa * w, y + sa * r0 - cc * w)]), col)
			if u < 0.5:
				var R: float = e.size * 0.36 * (0.55 + g * 0.6)
				var n: int = e.core.size()
				var pts := PackedVector2Array()
				for i in n:
					var aa: float = e.rot + float(i) / n * TAU
					var r: float = R * (e.core[i] * 0.5 if i % 2 != 0 else e.core[i])
					pts.append(Vector2(x + cos(aa) * r, y + sin(aa) * r))
				fill_poly(pts, Color(0.984, 0.98, 0.953, 1.0 - u * 2.0))
				pts.append(pts[0])
				draw_polyline(pts, ca(e.color, 1.0 - u * 2.0), 1.8, true)
		"swipe":
			var n := 20
			var span: float = (e.a1 - e.a0) * minf(1.0, u * 3.4)
			var wk: float = e.w * (1.0 - u * 0.5)
			var pts := PackedVector2Array()
			for i in n + 1:
				var aa: float = e.a0 + span * i / n
				pts.append(Vector2(x + cos(aa) * e.r, y + sin(aa) * e.r))
			for i in range(n, -1, -1):
				var t := float(i) / n
				var aa: float = e.a0 + span * t
				var r: float = e.r - wk * sin(PI * t)
				pts.append(Vector2(x + cos(aa) * r, y + sin(aa) * r))
			fill_poly(pts, ca(e.color, (1.0 - u) * 0.92))
		"focus":
			var col := ca(e.color, (1.0 - u) * 0.75)
			for l in e.ls:
				var r1: float = l.r * (1.0 + u * 0.2)
				var r0: float = e.r0 * 0.5 + (l.r - e.r0 * 0.5) * (0.1 + u * 0.45)
				var cc := cos(l.a)
				var sa := sin(l.a)
				draw_colored_polygon(PackedVector2Array([Vector2(x + cc * r1 - sa * l.w, y + sa * r1 + cc * l.w), Vector2(x + cc * r0, y + sa * r0),
					Vector2(x + cc * r1 + sa * l.w, y + sa * r1 - cc * l.w)]), col)
		"crack":
			var col := ca(e.color, minf(1.0, L / 10.0) * 0.8)
			var g := minf(1.0, u * 5.0)
			for pts in e.ls:
				var m := 1 + int(floorf((pts.size() - 1) * g))
				var poly := PackedVector2Array()
				for i in mini(m + 1, pts.size()):
					poly.append(Vector2(pts[i][0], pts[i][1]))
				if poly.size() > 1:
					draw_polyline(poly, col, 2.2, true)
		"line":
			var r1: float = e.len * (0.15 + u * 0.55)
			var r2: float = e.len * (0.5 + u * 0.5)
			stroke(Vector2(x + cos(e.ang) * r1, y + sin(e.ang) * r1), Vector2(x + cos(e.ang) * r2, y + sin(e.ang) * r2), e.w * (1.0 - u) + 0.4, ca(e.color, 1.0 - u))
		"ring":
			var r: float = e.r0 + (e.r1 - e.r0) * Pose.ease_fn("out", u)
			var rot := fmod(e.x * 0.37 + e.y * 0.11, 6.28)
			var gap := 0.18 + u * 0.5
			var col := ca(e.color, 1.0 - u)
			for k in 4:
				var a0 := rot + k * PI / 2.0 + gap
				var a1 := rot + (k + 1) * PI / 2.0 - gap
				if a1 > a0:
					draw_polyline(ellipse_pts(Vector2(x, y), r, r * e.sy, a0, a1, 10), col, e.w * (1.0 - u) + 0.5, true)
		"streak":
			var g := Pose.ease_fn("out", minf(1.0, u * 2.5))
			stroke(Vector2(e.x1, e.y1), Vector2(e.x1 + (e.x2 - e.x1) * g, e.y1 + (e.y2 - e.y1) * g), e.w * (1.0 - u * 0.7), ca(e.color, 1.0 - u))
		"bloom":
			var g := Pose.ease_fn("out", minf(1.0, u * 3.0))
			var base := 0.0 if e.dir > 0.0 else PI
			fill_poly(ellipse_pts(Vector2(x, y), e.size * 0.42 * (0.4 + g * 0.8), e.size * 0.42 * (0.4 + g * 0.8), 0.0, TAU, 20), ca(e.color2, (1.0 - u) * 0.5))
			var col := ca(e.color, (1.0 - u * u) * 0.95)
			for p in e.petals:
				var aa: float = base + p.a * e.dir
				var L2: float = e.size * p.len * (0.25 + 0.75 * g)
				var w: float = e.size * p.w * (1.0 - u * 0.6)
				var cc := cos(aa)
				var sa := sin(aa)
				var bx := cos(aa + p.cur * e.dir)
				var by := sin(aa + p.cur * e.dir)
				var mx := x + cc * L2 * 0.45
				var my := y + sa * L2 * 0.45
				var pts := PackedVector2Array([Vector2(x, y)])
				for t in range(1, 9):
					pts.append(_quad(Vector2(x, y), Vector2(mx - sa * w, my + cc * w), Vector2(x + bx * L2, y + by * L2), t / 8.0))
				for t in range(1, 8):
					pts.append(_quad(Vector2(x + bx * L2, y + by * L2), Vector2(mx + sa * w, my - cc * w), Vector2(x, y), t / 8.0))
				fill_poly(pts, col)
			fill_poly(ellipse_pts(Vector2(x, y), e.size * 0.13 * (1.0 - u * 0.5), e.size * 0.13 * (1.0 - u * 0.5), 0.0, TAU, 14), col)
		"swirl":
			for k in 3:
				var st: float = -u * 6.0 * e.dir + k * 2.1
				var col := ca(e.color, (1.0 - u) * (0.8 - k * 0.2))
				var pts := ellipse_pts(Vector2(x, y), e.r * (0.8 + u * 0.3), e.r * 0.42 * (0.8 + u * 0.3), st, st + 1.8, 14)
				draw_polyline(pts, col, (8.0 - k * 2.0) * (1.0 - u) + 0.6, true)
		"dust":
			var col := DUST
			col.a = 0.22 * (L / e.max)
			draw_circle(Vector2(x, y), e.r, col, true, -1.0, true)
		"tag":
			_draw_tag(e, x, y, minf(1.0, L / 14.0))

static func _quad(a: Vector2, c: Vector2, b: Vector2, t: float) -> Vector2:
	var s := 1.0 - t
	return a * s * s + c * 2.0 * s * t + b * t * t

# ---------- 字 ----------
## 一行字（毛笔字），中心在 p。outline > 0 先描边
func _text(s: String, p: Vector2, size: float, fill: Color, line: Color, outline: float) -> void:
	var fs := int(maxf(4.0, size))
	var w := BRUSH.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var base := p.y + (BRUSH.get_ascent(fs) - BRUSH.get_descent(fs)) * 0.5
	var pos := Vector2(p.x - w * 0.5, base)
	if outline > 0.0 and line.a > 0.0:
		draw_string_outline(BRUSH, pos, s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, int(outline), line)
	draw_string(BRUSH, pos, s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, fill)

## 飘字（新样子，照参考图：毛笔字、浓墨描边、外面一圈暖色的晕；字是归属那个人的颜色（提亮），掉血的数字是金白色）
func _draw_tag(e: Dictionary, x: float, y: float, a: float) -> void:
	var size: float = e.size
	var fs := int(size)
	var dmg := String(e.text).begins_with("-") and String(e.text).substr(1).is_valid_int()
	if dmg:
		size *= 1.18
		fs = int(size)
	var glow := Color(0.16, 0.07, 0.03, 0.32 * a)
	var ink := Color(0.09, 0.05, 0.03, 0.92 * a)
	var parts = e.get("parts")
	if parts != null:
		var ws := []
		var total := 0.0
		for p in parts:
			var w := BRUSH.get_string_size(p[0], HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			ws.append(w)
			total += w
		var px := x - total * 0.5
		var base := y + (BRUSH.get_ascent(fs) - BRUSH.get_descent(fs)) * 0.5
		for i in parts.size():
			var p = parts[i]
			draw_string_outline(BRUSH, Vector2(px, base), p[0], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, int(size * 0.42), glow)
			draw_string_outline(BRUSH, Vector2(px, base), p[0], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, int(size * 0.2), ink)
			var fc := _bright(p[1])
			fc.a = a
			draw_string(BRUSH, Vector2(px, base), p[0], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, fc)
			px += ws[i]
		return
	var cols: Array = e.cols
	if dmg:
		# 掉血：金色的毛笔数字（描粗一点）、浓墨描边、外面一圈暖光
		var P := Vector2(x, y)
		_text(e.text, P, size, Color(0, 0, 0, 0), Color(1.0, 0.52, 0.16, 0.3 * a), size * 0.6)
		_text(e.text, P, size, Color(0, 0, 0, 0), Color(0.08, 0.04, 0.02, 0.95 * a), size * 0.28)
		var gold := Color(1.0, 0.8, 0.38, a)
		for o: Vector2 in [Vector2(-0.6, 0.0), Vector2(0.6, 0.0), Vector2(0.0, 0.5)]:
			_text(e.text, P + o, size, gold, Color(0, 0, 0, 0), 0.0)
		_text(e.text, P + Vector2(0.0, -0.4), size, Color(1.0, 0.95, 0.8, a), Color(0, 0, 0, 0), 0.0)
		return
	_text(e.text, Vector2(x, y), size, Color(0, 0, 0, 0), glow, size * 0.42)
	_text(e.text, Vector2(x, y), size, Color(0, 0, 0, 0), ink, size * 0.2)
	if cols.size() > 1:
		# 两人各半：左半边左边那个人的颜色（用两个颜色叠一下：左边那个人的颜色，右半边盖一层右边那个人的）
		var c0 := _bright(cols[0])
		c0.a = a
		_text(e.text, Vector2(x, y), size, c0, Color(0, 0, 0, 0), 0.0)
		var c1 := _bright(cols[1])
		c1.a = a
		_half_text(e.text, Vector2(x, y), size, c1, x, x)
	else:
		var c := _bright(cols[0])
		c.a = a
		_text(e.text, Vector2(x, y), size, c, Color(0, 0, 0, 0), 0.0)

## 两人各半的字（拼、拆）：右半边换右边那个人的颜色 —— 记下来，由 _split_mask（只露右半边）里的 _split_text 画
var _splits: Array = []

func _half_text(s: String, p: Vector2, size: float, col: Color, x0: float, x1: float) -> void:
	_splits.append({"s": s, "p": p, "size": size, "col": col, "x0": x0})

class SplitMask extends Node2D:
	var owner_draw: FxDraw
	func _draw() -> void:
		for t in owner_draw._splits:
			draw_rect(Rect2(t.x0, t.p.y - t.size * 1.2, t.size * 4.0, t.size * 2.4), Color.WHITE)

class SplitText extends Node2D:
	var owner_draw: FxDraw
	func _draw() -> void:
		for t in owner_draw._splits:
			owner_draw._text_on(self, t.s, t.p, t.size, t.col)

func _text_on(ci: CanvasItem, s: String, p: Vector2, size: float, fill: Color) -> void:
	var fs := int(maxf(4.0, size))
	var w := BRUSH.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var base := p.y + (BRUSH.get_ascent(fs) - BRUSH.get_descent(fs)) * 0.5
	ci.draw_string(BRUSH, Vector2(p.x - w * 0.5, base), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, fill)

var _mask: SplitMask
var _stext: SplitText

func _ensure_split() -> void:
	if _mask != null:
		return
	_mask = SplitMask.new()
	_mask.owner_draw = self
	_mask.clip_children = CanvasItem.CLIP_CHILDREN_ONLY
	add_child(_mask)
	_stext = SplitText.new()
	_stext.owner_draw = self
	_mask.add_child(_stext)

## 归属人的颜色在画面上要亮一点（深色的墨、靛在黄昏的背景上看不清）
static func _bright(c: String) -> Color:
	var v := Color(c)
	# 墨（黑、灰）：用米白（白袍侠那身的颜色），浓墨描边下看得清
	if v.get_luminance() < 0.12 and v.s < 0.25:
		return Color("#f1e8d4")
	if v.get_luminance() < 0.32:
		var p := Pal.of(c)
		var q := Color(p.fx)
		return q.lightened(0.25) if q.get_luminance() < 0.3 else q
	return v

# ---------- 印章 ----------
func _draw_stamps() -> void:
	for e in fxs.fx:
		if e.type != "stamp":
			continue
		var L := RL(e)
		var age: float = e.max - L
		var sc := 1.7 - 0.7 * Pose.ease_fn("out", maxf(0.0, age) / 6.0) if age < 6.0 else 1.0
		var a := clampf(age / 4.0, 0.0, 1.0) * minf(1.0, L / 18.0)
		var zz := cam.zz() if cam != null else C.ZOOM
		var x: float = e.x
		if cam != null:
			x = clampf(x, cam.camX - cam.VW / (2.0 * zz) + 50.0, cam.camX + cam.VW / (2.0 * zz) - 50.0)
		var top := cam.to_stage(0, 120).y if cam != null else 0.0
		var y := maxf(top, float(e.y))
		# 训练场：印章落在上面那块面板上，就往下挪到面板下沿外面（挪下去要压到谁的头就少挪一点）。挪多少只在盖下去那一下算一次
		var box := hud.box if (hud != null and mode == "train") else Rect2()
		if box.size.x > 0.0 and cam != null:
			if not e.has("ty"):
				var k: float = e.size * SEAL_K
				var n: int = e.text.length()
				var cols := 2 if n >= 4 else 1
				var rows := ceili(n / 2.0) if n >= 4 else n
				var hw := (cols + 0.36) * k / 2.0 + 6.0
				var hh := (rows + 0.36) * k / 2.0 + 6.0
				var vx := cam.VW / 2.0 + (x - cam.camX) * zz
				if vx + hw * zz > box.position.x and vx - hw * zz < box.end.x:
					var want := cam.to_stage(0, box.end.y + 4.0).y + hh
					for an: FighterAnim in anims:
						if not an.J.is_empty() and absf(float(an.J.head[0]) - x) < hw + 16.0:
							want = minf(want, float(an.J.head[1]) - 16.0 - hh)
					y = maxf(y, want)
				e.ty = y
			y = e.ty
		_seal(x, y, e.text, e.size, e.rot, a, sc, e.specks, e.col)

## 印章（新样子）：一方印 —— 底是出招那个人的颜色（压暗一点，像印泥）、边上毛毛的；里面一道细边；字是米白的阳刻毛笔字；四周一点墨晕
func _seal(x: float, y: float, text: String, size: float, rot: float, alpha: float, sc: float, specks: Array, col: String) -> void:
	size *= SEAL_K
	var n := text.length()
	var cols := 2 if n >= 4 else 1
	var rows := ceili(n / 2.0) if n >= 4 else n
	var w := cols * size + size * 0.42
	var h := rows * size + size * 0.42
	var base := Color(col)
	# 印泥：深色的保持，浅的、艳的压暗一点，偏一点暖
	var ink := base.darkened(0.12).lerp(Color("#5a1208"), 0.18 if base.get_luminance() > 0.12 else 0.0)
	ink.a = alpha * 0.96
	draw_set_transform(Vector2(x, y), rot, Vector2(sc, sc))
	# 外面一圈淡墨晕（像印在宣纸上洇开一点）
	var halo := Color(0.12, 0.05, 0.03, alpha * 0.22)
	_rough_rect(Vector2.ZERO, w * 0.5 + size * 0.1, h * 0.5 + size * 0.1, size * 0.16, halo, 7)
	_rough_rect(Vector2.ZERO, w * 0.5, h * 0.5, size * 0.12, ink, 13)
	# 里面一道细边（米白）
	var line := Color(0.95, 0.92, 0.84, alpha * 0.9)
	var ix := w * 0.5 - size * 0.12
	var iy := h * 0.5 - size * 0.12
	draw_polyline(PackedVector2Array([Vector2(-ix, -iy), Vector2(ix, -iy), Vector2(ix, iy), Vector2(-ix, iy), Vector2(-ix, -iy)]), line, size * 0.06, true)
	# 字：竖着排，从右往左
	var fs := int(size * 0.9)
	var tc := Color(0.97, 0.94, 0.86, alpha)
	for i in n:
		var c := i / rows
		var r := i % rows
		var cx := ((cols - 1) / 2.0 - c) * size
		var cy := (r - (rows - 1) / 2.0) * size
		var ch := text[i]
		var gw := BRUSH.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var bl := cy + size * 0.05 + (BRUSH.get_ascent(fs) - BRUSH.get_descent(fs)) * 0.5
		draw_string(BRUSH, Vector2(cx - gw * 0.5, bl), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, tc)
	# 斑驳：印泥没印上的几个小白点
	for s in specks:
		draw_circle(Vector2(s[0] * w, s[1] * h), s[2], Color(0.95, 0.92, 0.84, alpha * 0.85), true, -1.0, true)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

## 边上毛毛的圆角方块（印的边）
func _rough_rect(c: Vector2, hx: float, hy: float, r: float, col: Color, seed_v: int) -> void:
	var pts := PackedVector2Array()
	var corners := [[1.0, 1.0, 0.0], [-1.0, 1.0, PI / 2.0], [-1.0, -1.0, PI], [1.0, -1.0, PI * 1.5]]
	var k := 0
	for cc in corners:
		var cx: float = c.x + cc[0] * (hx - r)
		var cy: float = c.y + cc[1] * (hy - r)
		for i in 5:
			var a: float = cc[2] + PI / 2.0 * i / 4.0
			var j := 1.0 + 0.06 * sin(float(seed_v * 7 + k) * 2.39)
			k += 1
			pts.append(Vector2(cx + cos(a) * r * j, cy + sin(a) * r * j))
		# 边上加几个毛刺
		var nx: float = c.x + (cc[0] * (hx - r) if int(cc[2] / (PI / 2.0)) % 2 == 0 else -cc[0] * (hx - r))
		var ny: float = cy
		pts.append(Vector2(lerpf(cx, nx, 0.5) + sin(seed_v + k) * 0.8, ny + cc[1] * r * (1.0 + 0.05 * cos(seed_v * 3 + k))))
	fill_poly(pts, col)

# ---------- 气 ----------
func _draw_qi(a: FighterAnim, front: bool, P: Dictionary) -> void:
	for p in fxs.qi:
		if int(p.f) != a.F.idx:
			continue
		var is_back: bool = p.k == "flame" and not p.get("fr", false)
		if is_back == front:
			continue
		var u := clampf(1.0 - RL(p) / p.max, 0.0, 1.0)
		var col: String = p.get("col", P.qi)
		var x := RX(p)
		var y := RY(p)
		if p.k == "flame":
			var al := minf(1.0, p.a * minf(1.0, u * 5.0) * (1.0 - u) * 2.4) * (0.3 if p.get("fr", false) else 1.0)
			var sp := sqrt(p.vx * p.vx + p.vy * p.vy)
			var ang := atan2(p.vy, p.vx) + PI / 2.0 if sp > 0.05 else 0.0
			var r: float = p.r
			var lenk: float = p.get("len", 1.0) * (1.0 + minf(0.5, sp * 0.08))
			draw_set_transform(Vector2(x, y), clampf(ang, -2.2, 2.2) + sin(p.ph) * 0.14, Vector2.ONE)
			var c: String = P.core if p.get("fr", false) else col
			_flame(Rect2(-r, -r * 2.6 * lenk, r * 2.0, r * 3.4 * lenk), c, p.get("hot", false), int(p.get("v", 0)), al)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		else:
			var al: float = p.a * (1.0 - u) * (0.55 + 0.45 * sin(p.ph * 3.0))
			var sp := sqrt(p.vx * p.vx + p.vy * p.vy)
			if sp == 0.0:
				sp = 1.0
			var Lt := minf(9.0, sp * 2.2 + 2.0)
			stroke(Vector2(x - p.vx / sp * Lt, y - p.vy / sp * Lt), Vector2(x, y), p.r * 1.6, ca(col, al))

func _flame(r: Rect2, col: String, hot: bool, v: int, al: float) -> void:
	var f: Array = _flames[v % 4]
	var c := Color(col)
	draw_texture_rect(f[0], r, false, Color(c.r, c.g, c.b, al))
	draw_texture_rect(f[1], r, false, Color(c.r * 0.72, c.g * 0.72, c.b * 0.72, al))
	var k := 0.75 if hot else 0.5
	var core := Color(c.r + (250.0 / 255.0 - c.r) * k, c.g + (250.0 / 255.0 - c.g) * k, c.b + (250.0 / 255.0 - c.b) * k, al)
	draw_texture_rect(f[3] if hot else f[2], r, false, core)

## 火舌的小图（和 JS flameSprite 一样的形状：四种，带小火叉；白的，画的时候着色）：[主体, 边线, 芯, 旺火的芯]
static func _make_flames() -> void:
	var SH := [
		{"w": 13.0, "tip": [3.0, 2.0], "forks": [[-1.0, 0.42, 20.0]], "bend": 0.0},
		{"w": 14.0, "tip": [0.0, 5.0], "forks": [[-1.0, 0.48, 18.0], [1.0, 0.38, 15.0]], "bend": 0.0},
		{"w": 10.0, "tip": [-4.0, 1.0], "forks": [], "bend": 4.0},
		{"w": 15.0, "tip": [5.0, 7.0], "forks": [[1.0, 0.52, 22.0], [-1.0, 0.3, 12.0]], "bend": 0.0},
	]
	for S in SH:
		var w: float = S.w
		var tx: float = 16.0 + S.tip[0]
		var ty: float = S.tip[1]
		var b: float = S.bend
		var body := PackedVector2Array()
		body.append_array(_bez3(Vector2(16, 62), Vector2(16 - w, 60), Vector2(16 - w * 1.05 + b, 38), Vector2(16 - w * 0.35 + b, ty + 22)))
		body.append_array(_bez2(Vector2(16 - w * 0.35 + b, ty + 22), Vector2(tx - 3 - b, ty + 9), Vector2(tx, ty)))
		body.append_array(_bez2(Vector2(tx, ty), Vector2(tx + 1 - b, ty + 12), Vector2(16 + w * 0.4 + b, ty + 24)))
		body.append_array(_bez3(Vector2(16 + w * 0.4 + b, ty + 24), Vector2(16 + w * 1.08 + b, 40), Vector2(16 + w, 60), Vector2(16, 62)))
		var forks := []
		for fk in S.forks:
			var side: float = fk[0]
			var by: float = 62.0 - fk[1] * 50.0
			var bx: float = 16.0 + side * w * 0.55
			var tipx: float = bx + side * 7.0
			var tipy: float = by - fk[2]
			var q := PackedVector2Array()
			q.append_array(_bez2(Vector2(bx - side * 4, by + 6), Vector2(bx + side * 6, by - fk[2] * 0.35), Vector2(tipx, tipy)))
			q.append_array(_bez2(Vector2(tipx, tipy), Vector2(bx + side * 1, by - fk[2] * 0.3), Vector2(bx - side * 5, by - 2)))
			forks.append([q, tipy])
		var core := PackedVector2Array()
		core.append_array(_bez3(Vector2(16, 61), Vector2(10, 56), Vector2(10.5 + b * 0.5, 42), Vector2(16 + S.tip[0] * 0.4, 24)))
		core.append_array(_bez3(Vector2(16 + S.tip[0] * 0.4, 24), Vector2(21.5 + b * 0.5, 42), Vector2(22, 56), Vector2(16, 61)))
		var core_c := PackedVector2Array()
		core_c.append_array(_bez3(Vector2(16, 61), Vector2(10, 56), Vector2(10.5 + b * 0.5, 42), Vector2(16 + S.tip[0] * 0.4, 32)))
		core_c.append_array(_bez3(Vector2(16 + S.tip[0] * 0.4, 32), Vector2(21.5 + b * 0.5, 42), Vector2(22, 56), Vector2(16, 61)))
		var i_body := Image.create(32, 64, false, Image.FORMAT_RGBA8)
		var i_rim := Image.create(32, 64, false, Image.FORMAT_RGBA8)
		var i_core := Image.create(32, 64, false, Image.FORMAT_RGBA8)
		var i_hot := Image.create(32, 64, false, Image.FORMAT_RGBA8)
		for py in 64:
			for px in 32:
				var p := Vector2(px + 0.5, py + 0.5)
				var a := 0.0
				if Geometry2D.is_point_in_polygon(p, body):
					a = _grad(p.y, ty, 0.9)
				for f in forks:
					if Geometry2D.is_point_in_polygon(p, f[0]):
						a = maxf(a, _grad(p.y, f[1], 0.7))
				i_body.set_pixel(px, py, Color(1, 1, 1, a))
				# 边线：离主体边界 0.7 像素以内
				var d := 99.0
				for k in body.size():
					var a0: Vector2 = body[k]
					var b0: Vector2 = body[(k + 1) % body.size()]
					d = minf(d, Geometry2D.get_closest_point_to_segment(p, a0, b0).distance_to(p))
				var rim_a := 0.0
				if d < 0.9:
					var t := clampf((64.0 - p.y) / (64.0 - ty), 0.0, 1.0)
					rim_a = (0.55 - 0.3 * minf(1.0, t / 0.7)) if t < 0.7 else 0.25 * (1.0 - (t - 0.7) / 0.3)
				i_rim.set_pixel(px, py, Color(1, 1, 1, rim_a * (1.0 - d / 0.9)))
				var cc := 0.0
				if Geometry2D.is_point_in_polygon(p, core_c):
					cc = 0.7 * clampf((p.y - 32.0) / (64.0 - 32.0), 0.0, 1.0)
				i_core.set_pixel(px, py, Color(1, 1, 1, cc))
				var ch := 0.0
				if Geometry2D.is_point_in_polygon(p, core):
					ch = 0.95 * clampf((p.y - 24.0) / (64.0 - 24.0), 0.0, 1.0)
				i_hot.set_pixel(px, py, Color(1, 1, 1, ch))
		_flames[_flames.size()] = [ImageTexture.create_from_image(i_body), ImageTexture.create_from_image(i_rim), ImageTexture.create_from_image(i_core), ImageTexture.create_from_image(i_hot)]

## 从下往上的渐变：底下 a、中间 0.72a、到 top 透明
static func _grad(y: float, top: float, a: float) -> float:
	var t := clampf((64.0 - y) / maxf(1.0, 64.0 - top), 0.0, 1.0)
	return a * (1.0 - 0.28 * t / 0.5) if t < 0.5 else a * 0.72 * (1.0 - (t - 0.5) / 0.5)

static func _bez3(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, n := 10) -> PackedVector2Array:
	var o := PackedVector2Array()
	for i in n:
		var t := float(i) / n
		var s := 1.0 - t
		o.append(p0 * s * s * s + p1 * 3.0 * s * s * t + p2 * 3.0 * s * t * t + p3 * t * t * t)
	return o

static func _bez2(p0: Vector2, p1: Vector2, p2: Vector2, n := 8) -> PackedVector2Array:
	var o := PackedVector2Array()
	for i in n:
		var t := float(i) / n
		var s := 1.0 - t
		o.append(p0 * s * s + p1 * 2.0 * s * t + p2 * t * t)
	return o
