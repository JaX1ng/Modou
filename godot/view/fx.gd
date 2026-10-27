class_name Fx
extends RefCounted
## 特效（对照 JS fx.js）：火花、冲击星、墨点、扬尘、扫痕、集中线、地裂、断开的环、墨花、飘字、印章、大字 + 身上的气（火苗、火星）。
## 逻辑层发事件（SimEvents），这里照 JS 当时调的那些特效函数一个一个放；画在 FxDraw（画面平面上，和 2D 版一样的算法）。
## 全是画面：用自己的随机数（不碰 AiRng），回滚重算时不放（事件在 SimEvents 里攒着，算完只补放新多出来的）。

const DT := C.DT
const FLOOR := C.FLOOR

var fx: Array = []          # 特效：{type, x, y, life, max, …}
var qi: Array = []          # 气：{k flame / ember, f 谁的, col, x, y, vx, vy, r, a, life, …}
var splats: Array = []      # 地上的墨渍
var flash := 0.0            # 画面白一下
var punch := 0.0            # 镜头往里推一下
var shake := 0.0            # 震屏
var reduce_motion := false
var anims: Array = []       # [FighterAnim, FighterAnim]
var on_sound: Callable      # (种类, 参数)

var _s := 0x2545f491
static var K := {}

static func _static_init() -> void:
	K = {"drop": C.rootDT(0.985), "spark": C.rootDT(0.86), "dust": C.rootDT(0.94), "grow": C.rootDT(1.025), "qv": C.rootDT(0.985), "qr": C.rootDT(0.985),
		"shake": C.rootDT(0.86), "flash": C.rootDT(0.84), "punch": C.rootDT(0.8)}

func vrnd() -> float:
	_s = (_s * 1664525 + 1013904223) & 0xFFFFFFFF
	return _s / 4294967296.0

func rnd(a: float, b: float) -> float:
	return a + (b - a) * vrnd()

func vpick(arr: Array):
	return arr[int(vrnd() * arr.size())]

func clear() -> void:
	fx.clear()
	qi.clear()
	splats.clear()
	shake = 0.0
	flash = 0.0
	punch = 0.0

# ---------- 一个人（特效里用到的）：位置、朝向、骨骼、颜色 ----------
class Who:
	var idx := -1
	var x := 0.0
	var facing := 1
	var alt := 0.0
	var J := {}
	var pal := {}
	var color := ""
	var anim: FighterAnim

func who(i: int, p = null) -> Who:
	var w := Who.new()
	if i < 0 or i >= anims.size():
		w.pal = Pal.of(Pal.INK)
		w.color = Pal.INK
		return w
	var a: FighterAnim = anims[i]
	w.idx = i
	w.anim = a
	w.J = a.J
	var c: String = C.lookOf(a.F.look).get("color", Pal.INK)
	w.color = c
	w.pal = Pal.of(c)
	if p != null:
		w.x = p[i][0]
		w.facing = int(p[i][1])
		w.alt = p[i][2]
	else:
		w.x = a.F.x
		w.facing = a.F.facing
		w.alt = a.F.alt
	return w

## 打中的地方（和 JS contactPoint 一样）：出招的那只拳 / 脚的高度，夹在对方头和脚之间；x 在对方身前 12
func contact(A: Who, B: Who) -> Vector2:
	var lim := ""
	var m := A.anim.F.move if A.anim != null else null
	if m != null:
		lim = m.def.limb
	var e: Array = A.J.get(lim, A.J.get("fh", [A.x, FLOOR - 90])) if lim != "" else A.J.get("fh", [A.x, FLOOR - 90])
	var topY: float = B.J.head[1] - 8.0 if B.J.has("head") else FLOOR - 150.0
	var botY := FLOOR - 12.0 - B.alt
	return Vector2(B.x - A.facing * 12.0, clampf(e[1], topY, maxf(topY + 10.0, botY)))

# ---------- 基本特效 ----------
func add(o: Dictionary) -> Dictionary:
	if not o.has("max"):
		o.max = o.life
	fx.append(o)
	return o

func flash_to(v: float) -> void:
	flash = maxf(flash, v)

func drops(n: int, x: float, y: float, dir: float, spd: float, cols: Array, spread := 0.9, up := 0.35) -> void:
	for i in n:
		var a := (vrnd() - 0.5) * 2.0 * spread - up
		var s := spd * rnd(0.35, 1.15)
		add({"type": "drop", "x": x, "y": y, "vx": cos(a) * s * dir, "vy": sin(a) * s - rnd(0.0, 1.5), "r": rnd(1.2, 3.6), "color": vpick(cols), "life": 90.0})

func ink_drops(n: int, x: float, y: float, dir: float, spd: float, color: String, spread := 0.8, up := 0.3) -> void:
	drops(n, x, y, dir, spd, [color], spread, up)

func dust(x: float, y: float, n: int, big := false) -> void:
	for i in n:
		add({"type": "dust", "x": x + rnd(-14, 14), "y": y - rnd(0, 6), "vx": rnd(-1.6, 1.6) * (1.6 if big else 1.0), "vy": rnd(-1.4, -0.2),
			"r": rnd(5, 10) * (1.5 if big else 1.0), "life": float(int(rnd(26, 40)))})

func burst(x: float, y: float, dir: float, n: int, len: float, w: float, color: String) -> void:
	for i in n:
		var base := 0.0 if dir > 0.0 else PI
		add({"type": "line", "x": x, "y": y, "ang": base + rnd(-1.3, 1.3), "len": len * rnd(0.6, 1.2), "w": w, "color": color, "life": 11.0})

func ring(x: float, y: float, r0: float, r1: float, w: float, color: String, life := 16.0, sy := 1.0) -> void:
	add({"type": "ring", "x": x, "y": y, "r0": r0, "r1": r1, "w": w, "color": color, "life": life, "sy": sy})

func streak(x1: float, y1: float, x2: float, y2: float, w: float, color: String, life := 14.0) -> void:
	add({"type": "streak", "x": x1, "y": y1, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "w": w, "color": color, "life": life})

func sparks(x: float, y: float, dir: float, n: int, spd: float, color: String, spread := 0.9, up := 0.25, life := 16.0) -> void:
	var base := 0.0 if dir > 0.0 else PI
	for i in n:
		var a := base + rnd(-spread, spread) - up * dir
		var s := spd * rnd(0.45, 1.25)
		add({"type": "spark", "x": x, "y": y, "vx": cos(a) * s, "vy": sin(a) * s, "w": rnd(2.2, 4), "color": color, "life": float(int(life * rnd(0.6, 1.2))), "g": 0.16})

## 冲击星：从打中的地方炸出几根尖刺（多数朝打的方向），中间一团纸白的闪光
func impact(x: float, y: float, dir: float, size: float, color: String, n := 7, spread := 1.0, life := 8.0) -> void:
	var base := 0.0 if dir > 0.0 else PI
	var spikes := []
	for i in n:
		var back := i >= n - 2
		spikes.append({"a": (base + PI if back else base) + rnd(-spread, spread) * (0.5 if back else 1.0), "len": rnd(0.55, 1.15) * (0.55 if back else 1.0), "w": rnd(0.12, 0.2)})
	var core := []
	for i in 9:
		core.append(rnd(0.55, 1))
	add({"type": "star", "x": x, "y": y, "size": size, "color": color, "spikes": spikes, "core": core, "rot": rnd(0, 6.3), "life": life})

func swipe(x: float, y: float, r: float, mid: float, span: float, w: float, color: String, life := 14.0) -> void:
	add({"type": "swipe", "x": x, "y": y, "r": r, "a0": mid - span / 2.0, "a1": mid + span / 2.0, "w": w, "color": color, "life": life})

func focus_lines(x: float, y: float, n: int, r0: float, r1: float, color: String, life := 9.0) -> void:
	var ls := []
	for i in n:
		ls.append({"a": rnd(0, TAU), "r": rnd(r0, r1), "w": rnd(1.2, 3)})
	add({"type": "focus", "x": x, "y": y, "ls": ls, "r0": r0, "life": life, "color": color})

func cracks(x: float, n: int, len: float, color: String) -> void:
	var ls := []
	for i in n:
		var s := 1.0 if i % 2 != 0 else -1.0
		var pts := [[x + s * rnd(4, 10), FLOOR]]
		var px: float = pts[0][0]
		for k in 4:
			px += s * len * rnd(0.18, 0.32)
			pts.append([px, FLOOR + rnd(-3, 4)])
		ls.append(pts)
	add({"type": "crack", "x": x, "y": FLOOR, "ls": ls, "color": color, "life": 26.0})

## 飘字：own 一个人 / 两个人各半；text 也可以分段 [[字, 人], …]（每段各自的颜色）。往上躲开刚出来的字
func tag(x: float, y: float, text, own, size := 20.0) -> void:
	var parts = null
	var s := ""
	if text is Array:
		parts = []
		for p in text:
			parts.append([str(p[0]), _col(p[1])])
			s += str(p[0])
	else:
		s = str(text)
	var cols := []
	if own is Array:
		var a := who(int(own[0]))
		var b := who(int(own[1]))
		var A2: Who = a if a.anim == null or b.anim == null or a.anim.F.x <= b.anim.F.x else b
		var B2: Who = b if A2 == a else a
		cols = [A2.color, B2.color]
	else:
		cols = [_col(own)]
	for k in 6:
		var hit := false
		for e in fx:
			if e.type == "tag" and e.max - e.life < 22.0 and absf(e.x - x) < 70.0 and absf(e.y - y) < size:
				hit = true
				break
		if not hit:
			break
		y -= size + 2.0
	add({"type": "tag", "x": x, "y": y, "text": s, "parts": parts, "cols": cols, "size": size, "life": 46.0})

func _col(o) -> String:
	if o is String:
		return o
	if o is int or o is float:
		return who(int(o)).color if int(o) >= 0 else Pal.INK
	return Pal.INK

## 印章（招式名）
func stamp(x: float, y: float, text: String, size: float, own: int) -> void:
	var specks := []
	for i in 9:
		specks.append([rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(0.6, 1.8)])
	add({"type": "stamp", "x": x, "y": y, "text": text, "size": size, "rot": rnd(-0.14, 0.14), "life": 70.0, "specks": specks,
		"col": who(own).color if own >= 0 else Pal.CIN})

## 画面正中的大字
func announce(text: String, sub: String, life: float, size: float, own := -1) -> void:
	add({"type": "announce", "x": 0.0, "y": 0.0, "text": text, "sub": sub, "life": life, "size": size, "col": who(own).color if own >= 0 else Pal.INK})

# ---------- 每一步 ----------
func step() -> void:
	for i in range(fx.size() - 1, -1, -1):
		var e: Dictionary = fx[i]
		e.life -= DT
		e.px = e.x
		e.py = e.y
		match e.type:
			"drop":
				e.vy += 0.36 * DT
				e.x += e.vx * DT
				e.y += e.vy * DT
				e.vx *= K.drop
				if e.y >= FLOOR + 2.0:
					splats.append({"x": e.x, "rx": e.r * rnd(1.6, 2.6), "life": 200.0, "max": 200.0, "color": e.color})
					e.life = 0.0
			"spark":
				e.x += e.vx * DT
				e.y += e.vy * DT
				e.vx *= K.spark
				e.vy = e.vy * K.spark + e.g * DT
				if e.y > FLOOR:
					e.y = FLOOR
					e.vy *= -0.3
			"dust":
				e.x += e.vx * DT
				e.y += e.vy * DT
				e.vx *= K.dust
				e.vy *= K.dust
				e.r *= K.grow
			"tag":
				e.y -= 0.7 * DT
		if e.life <= 0.0:
			fx.remove_at(i)
	for i in range(splats.size() - 1, -1, -1):
		splats[i].life -= DT
		if splats[i].life <= 0.0:
			splats.remove_at(i)
	if splats.size() > 160:
		splats = splats.slice(splats.size() - 160)
	_update_qi()
	shake *= K.shake
	flash *= K.flash
	punch *= K.punch

# ---------- 打中的特效（对照 JS hitFx） ----------
const HIT_PUNCH := {"heavy": 0.03, "beng": 0.05, "upper": 0.04, "whirl": 0.04, "hammer": 0.04, "shoulder": 0.05, "backKick": 0.04, "hammerFist": 0.04,
	"twinKick": 0.035, "dive": 0.04, "stomp": 0.04, "splash": 0.07, "rushEnd": 0.03, "slipElbow": 0.04}

func hit_fx(kind: String, c: Vector2, A: Who, B: Who) -> void:
	var dir := float(A.facing)
	var x := c.x
	var y := c.y
	var P := A.pal
	var ink: String = P.ink
	var fxc: String = P.fx
	var qic: String = P.qi
	var front := 0.0 if dir > 0.0 else PI
	var big: float = HIT_PUNCH.get(kind, 0.0)
	if B.anim != null:
		B.anim.hitFlash = 3.0
		B.anim.hitShake = 7.0
	if big != 0.0:
		punch = maxf(punch, big)
	var AJ := A.J
	match kind:
		"jab":
			impact(x, y, dir, 26, ink, 5, 0.7, 7); sparks(x, y, dir, 5, 6, fxc, 0.7); ink_drops(2, x, y, dir, 4, ink)
		"jab2":
			impact(x, y, dir, 32, ink, 6, 0.75, 8); sparks(x, y, dir, 7, 7, fxc, 0.75); ink_drops(3, x, y, dir, 5, ink)
		"hook":
			swipe(x - dir * 22, y + 6, 34, front - dir * 0.6, 1.9, 7, qic, 14)
			impact(x, y, dir, 30, ink, 6, 0.9); sparks(x, y, dir, 7, 6.5, fxc, 0.9, 0.4)
		"rush":
			impact(x + rnd(-6, 6), y + rnd(-8, 8), dir, 26, ink, 5, 0.7, 6); sparks(x, y, dir, 4, 6, fxc, 0.6)
			for i in 3:
				var yy: float = AJ.sh[1] + rnd(-10, 14)
				streak(A.x - dir * rnd(40, 70), yy, A.x - dir * 6, yy, 2, qic, 10)
		"heavy":
			impact(x, y, dir, 48, ink, 8, 0.9, 10); sparks(x, y, dir, 12, 9, fxc, 0.8); ink_drops(4, x, y, dir, 7, ink); focus_lines(x, y, 10, 70, 120, fxc, 7)
		"beng":
			impact(x, y, dir, 62, ink, 9, 0.6, 11); streak(x - dir * 70, y, x + dir * 150, y, 9, qic, 16)
			sparks(x, y, dir, 16, 11, fxc, 0.5, 0.1, 18); ink_drops(5, x, y, dir, 8, ink, 0.5, 0.1); focus_lines(x, y, 14, 80, 140, fxc, 8); flash_to(0.22)
		"upper":
			swipe(x - dir * 26, y - 6, 52, front, 2.8, 9, qic, 16); impact(x, y, dir, 44, ink, 7, 0.8)
			sparks(x, y, dir, 12, 9, fxc, 0.5, 1.1); ink_drops(4, x, y, dir, 7, ink, 0.5, 1.1); flash_to(0.18)
		"kick":
			impact(x, y, dir, 40, ink, 7, 0.9); sparks(x, y, dir, 9, 8, fxc, 0.8); ink_drops(3, x, y, dir, 6.5, ink)
			swipe(A.x + dir * 30, y + 26, 60, front - dir * 0.35, 1.1, 5, qic, 12)
		"whip":
			swipe(A.x + dir * 34, y + 30, 74, front - dir * 0.6, 1.9, 9, qic, 16)
			impact(x, y, dir, 40, ink, 7, 0.9); sparks(x, y, dir, 10, 8, fxc, 0.8)
		"whirl":
			add({"type": "swirl", "x": A.x, "y": AJ.hip[1] - 8.0, "r": 88.0, "color": qic, "life": 22.0, "dir": dir})
			impact(x, y, dir, 50, ink, 8, 0.9); sparks(x, y, dir, 14, 10, fxc, 1.0); ink_drops(4, x, y, dir, 8, ink); flash_to(0.18)
		"hammer":
			impact(x, y, dir, 46, ink, 8, 1.2); cracks(B.x, 4, 70, ink); sparks(x, y, dir, 12, 8, fxc, 1.4, -0.2); dust(B.x, FLOOR, 6, true); flash_to(0.16)
		"airKick":
			for i in 4:
				var o := rnd(-18, 18)
				streak(A.x - dir * rnd(60, 110), AJ.hip[1] + o - 26.0, A.x - dir * 8, AJ.hip[1] + o, 2.4, qic, 12)
			impact(x, y, dir, 40, ink, 7, 0.9); sparks(x, y, dir, 11, 8, fxc, 0.9, -0.1)
		"rushEnd":
			impact(x, y, dir, 48, ink, 8, 0.6); streak(x - dir * 40, y, x + dir * 110, y, 6, qic, 12); sparks(x, y, dir, 12, 10, fxc, 0.5, 0.15)
		"low":
			impact(x, y, dir, 24, ink, 5, 0.6); sparks(x, y, dir, 5, 5, fxc, 0.6, -0.1); dust(B.x, FLOOR, 2)
		"sweep":
			swipe(A.x, FLOOR - 4, 100, front - dir * 0.45, 1.0, 8, qic, 16); dust(B.x, FLOOR, 7, true)
			impact(x, y, dir, 32, ink, 6, 0.8); sparks(x, FLOOR - 10, dir, 8, 7, fxc, 0.6, 0.6)
		"palm":
			impact(x, y, dir, 44, ink, 8, 1.4)
			for i in 4:
				streak(x + rnd(-14, 14), y + 30, x + rnd(-24, 24), y - rnd(70, 110), 3, qic, 14)
			sparks(x, y, dir, 12, 9, fxc, 0.4, 1.3); flash_to(0.14)
		"shoulder":
			impact(x, y, dir, 64, ink, 9, 0.8, 11); focus_lines(x, y, 14, 80, 150, fxc, 8)
			for i in 4:
				var yy := y + rnd(-30, 30)
				streak(A.x - dir * rnd(60, 120), yy, A.x, yy, 3, qic, 12)
			sparks(x, y, dir, 16, 10, fxc, 0.7, 0.3); dust(A.x, FLOOR, 6, true); flash_to(0.2)
		"backKick":
			impact(x, y, dir, 54, ink, 8, 0.6, 10); sparks(x, y, dir, 14, 10, fxc, 0.5, 0.2); focus_lines(x, y, 10, 70, 120, fxc, 7); flash_to(0.12)
		"elbow":
			impact(x, y, dir, 34, ink, 6, 0.8); sparks(x, y, dir, 9, 7, fxc, 0.6, 0.2)
		"slipElbow":
			swipe(A.x, AJ.sh[1] + 4.0, 40, front + dir * 0.3, 2.4, 7, qic, 14)
			impact(x, y, dir, 46, ink, 8, 0.7, 10); sparks(x, y, dir, 12, 9, fxc, 0.6, 0.2); focus_lines(x, y, 10, 70, 120, fxc, 7); flash_to(0.12)
		"chop":
			swipe(x - dir * 18, y - 30, 56, front + dir * 0.9, 1.6, 9, qic, 16)
			for i in 3:
				streak(x + rnd(-10, 10), y - 70, x + rnd(-6, 6), y + 10, 3, qic, 12)
			impact(x, y, dir, 40, ink, 7, 1.0); sparks(x, y, dir, 10, 8, fxc, 0.8, -0.6)
		"hammerFist":
			cracks(B.x, 4, 64, ink); swipe(x - dir * 10, y - 26, 50, front + dir * 0.8, 1.4, 8, qic, 16)
			impact(x, y, dir, 44, ink, 8, 1.2); sparks(x, y, dir, 12, 8, fxc, 1.2, -0.3); dust(B.x, FLOOR, 7, true); flash_to(0.16)
		"twinKick":
			swipe(A.x + dir * 20, y + 10, 70, front - dir * 1.1, 1.8, 9, qic, 16); swipe(A.x + dir * 20, y + 26, 52, front - dir * 0.9, 1.4, 4, fxc, 12)
			impact(x, y, dir, 42, ink, 7, 0.9); sparks(x, y, dir, 12, 9, fxc, 0.6, 1.0); flash_to(0.12)
		"airSwing":
			swipe(AJ.sh[0], AJ.sh[1], 54, front + dir * 0.5, 2.2, 7, qic, 14)
			impact(x, y, dir, 30, ink, 6, 0.9); sparks(x, y, dir, 8, 7, fxc, 0.7, -0.2)
		"dive":
			cracks(B.x, 3, 60, ink); impact(x, y, dir, 46, ink, 8, 1.3)
			for i in 4:
				streak(A.x + rnd(-16, 16), AJ.hip[1] - rnd(60, 110), A.x + rnd(-8, 8), AJ.hip[1] - 10.0, 2.6, qic, 12)
			sparks(x, y, dir, 12, 8, fxc, 1.4, -0.4); dust(B.x, FLOOR, 8, true); flash_to(0.14)
		"stomp":
			cracks(B.x, 5, 80, ink); impact(x, FLOOR - 12, dir, 40, ink, 7, 1.4)
			for i in 3:
				streak(AJ.ff[0] + rnd(-8, 8), AJ.ff[1] - rnd(50, 80), AJ.ff[0] + rnd(-4, 4), AJ.ff[1] - 6.0, 3, qic, 12)
			sparks(x, FLOOR - 8, dir, 12, 8, fxc, 1.3, 0.3); dust(B.x, FLOOR, 9, true); flash_to(0.12)
		"splash":
			impact(x, y, dir, 90, ink, 11, 1.0, 14); focus_lines(x, y, 22, 110, 220, fxc, 10)
			streak(x - dir * 120, y, x + dir * 220, y, 14, qic, 20)
			sparks(x, y, dir, 26, 13, fxc, 1.0, 0.4, 22); ink_drops(12, x, y, dir, 11, ink, 1.0, 0.4); dust(B.x, FLOOR, 10, true); flash_to(0.4)
		_:
			impact(x, y, dir, 28, ink, 6, 0.8); sparks(x, y, dir, 6, 6, fxc, 0.8)

## 拼招 / 压招：两边的冲击星对撞、各自颜色的火花往对面迸（wA / wB 两边特效的分量）
func clash_fx(x: float, y: float, A: Who, B: Who, wA := 1.0, wB := 1.0) -> void:
	for t in [[A, B, wA], [B, A, wB]]:
		var F: Who = t[0]
		var O: Who = t[1]
		var w: float = t[2]
		if w <= 0.0:
			continue
		var d := 1.0 if O.x >= F.x else -1.0
		impact(x, y, d, 58 * (0.55 + 0.45 * w), F.pal.ink, maxi(3, int(C.jsround(6 * w))), 1.2, 10)
		sparks(x, y, d, maxi(2, int(C.jsround(10 * w))), 9, F.pal.fx, 1.2, 0.5)
		focus_lines(x, y, maxi(2, int(C.jsround(6 * w))), 70, 130, F.pal.fx, 8)
	flash_to(0.3)

func parry_fx(B: Who, c: Vector2) -> void:
	var base := 0.0 if B.facing > 0 else PI
	swipe(B.x + B.facing * 22, c.y, 38, base, 3.0, 9, B.pal.fx, 18)
	impact(c.x, c.y, -B.facing, 40, B.pal.ink, 8, 1.4, 10)
	sparks(c.x, c.y, -B.facing, 12, 9, B.pal.fx, 1.2, 0.3)
	flash_to(0.4)

func shove_fx(A: Who, B: Who) -> void:
	var y: float = A.J.sh[1]
	var dir := float(A.facing)
	impact(B.x - dir * 14, y, dir, 34, A.pal.ink, 6, 0.8)
	for i in 3:
		var yy := y + rnd(-14, 14)
		streak(A.x + dir * 20, yy, B.x + dir * 30, yy, 3, A.pal.qi, 10)

func burst_fx(F: Who) -> void:
	var y: float = F.J.hip[1] - 20.0 if F.J.has("hip") else FLOOR - 80.0
	ring(F.x, y, 10, 190, 9, F.pal.qi, 24)
	focus_lines(F.x, y, 18, 120, 220, F.pal.qi, 10)
	for d in [1.0, -1.0]:
		sparks(F.x, y, d, 12, 11, F.pal.qi, 1.6, 0.3, 20)
	qi_ring(F, 18, 1.35)
	dust(F.x, FLOOR, 10, true)
	flash_to(0.35)

func burst_hit_fx(A: Who, B: Who) -> void:
	var dir := 1.0 if B.x >= A.x else -1.0
	var y: float = B.J.sh[1] + 10.0 if B.J.has("sh") else FLOOR - 80.0
	var x := B.x - dir * 6.0
	if B.anim != null:
		B.anim.hitFlash = 3.0
		B.anim.hitShake = 8.0
	punch = maxf(punch, 0.05)
	impact(x, y, dir, 64, A.pal.ink, 9, 1.1, 11); sparks(x, y, dir, 16, 11, A.pal.fx, 1.0, 0.5, 20)
	ink_drops(6, x, y, dir, 9, A.pal.ink, 1.0, 0.5); focus_lines(x, y, 12, 80, 150, A.pal.fx, 8)
	dust(B.x, FLOOR, 8, true); flash_to(0.3)

func super_fx(F: Who) -> void:
	var y: float = F.J.sh[1] if F.J.has("sh") else FLOOR - 90.0
	focus_lines(F.x, y, 24, 60, 200, F.pal.qi, 16)
	qi_ring(F, 14, 1.1)
	flash_to(0.25)

## 泼墨蓄力：墨往掌心收；出掌那一下掌前面炸开墨花。k = 这一招第几帧（和 JS attackStep 的 k 一样）
func super_step(F: Who, m: MoveState, k: float) -> void:
	if not F.J.has("bh"):
		return
	var h: Array = F.J.get(m.def.limb, F.J.bh)
	if k >= 1.0 and k < m.S - 1.0 and fmod(k, 3.0) == 0.0:
		focus_lines(h[0], h[1], 8, 16, 64 + k * 3.0, F.pal.qi, 8)
		ring(h[0], h[1], 40, 7, 3.2, F.pal.qi, 10)
	if k == m.S:
		var dir := float(F.facing)
		var x: float = h[0] + dir * 12.0
		var y: float = h[1]
		var petals := []
		for i in 9:
			petals.append({"a": rnd(-0.8, 0.8), "len": rnd(0.55, 1.1), "w": rnd(0.15, 0.26), "cur": rnd(-0.25, 0.25)})
		add({"type": "bloom", "x": x, "y": y, "dir": dir, "size": 78.0, "color": F.pal.ink, "color2": F.pal.qi, "petals": petals, "rot": rnd(0, 6.3), "life": 22.0})
		ring(x, y, 10, 54, 4, F.pal.qi, 14)
		streak(h[0] - dir * 70, y + 2, x + dir * 40, y, 7, F.pal.qi, 12)
		ink_drops(12, x, y, dir, 11, F.pal.ink, 0.7, 0.15)
		flash_to(0.2)

func crash_fx(B: Who, dir: float, A: Who) -> void:
	var P := A.pal
	for i in 5:
		streak(B.x + rnd(-16, 16), B.J.hip[1] - rnd(50, 90), B.x + dir * rnd(4, 16), B.J.hip[1] + 26.0, 3, P.qi, 16)
	sparks(B.x, B.J.hip[1] - 20.0, dir, 10, 7, P.fx, 1.2, -0.9, 20)

func tumble_fx(A: Who, B: Who, c: Vector2) -> void:
	var a := A.pal
	var b := B.pal
	impact(c.x, c.y, -A.facing, 46, b.ink, 7, 1.0, 9); impact(c.x, c.y, A.facing, 30, a.ink, 5, 0.8, 8)
	sparks(c.x, c.y, -A.facing, 10, 9, b.fx, 1.0, 0.6); sparks(c.x, c.y, A.facing, 6, 6, a.fx, 0.8, 0.4)
	_swipe_arc(A.x, A.J.hip[1] - 10.0, 46, PI if A.facing > 0 else 0.0, 3.6, 6, a.qi, 18)

func _swipe_arc(x: float, y: float, r: float, mid: float, span: float, w: float, col: String, life: float) -> void:
	swipe(x, y, r, mid, span, w, col, life)

func dash_lines(F: Who) -> void:
	var y0: float = F.J.hip[1] if F.J.has("hip") else FLOOR - 60.0
	for i in 2:
		var y := y0 + rnd(-46, 12)
		streak(F.x - F.facing * rnd(20, 40), y, F.x - F.facing * rnd(90, 150), y, rnd(1.6, 3), F.pal.qi, 10)

func slip_fx(F: Who) -> void:
	var y: float = F.J.hip[1] if F.J.has("hip") else FLOOR - 60.0
	swipe(F.x + F.facing * 10, y - 6, 40, 0.0 if F.facing > 0 else PI, 1.6, 5, F.pal.qi, 12)
	dust(F.x - F.facing * 12, FLOOR, 4)

func slip_lines(F: Who) -> void:
	var y0: float = F.J.hip[1] if F.J.has("hip") else FLOOR - 60.0
	for i in 2:
		var y := y0 + rnd(-40, 10)
		streak(F.x - F.facing * rnd(16, 30), y, F.x - F.facing * rnd(80, 130), y, rnd(1.4, 2.6), F.pal.qi, 9)

func slip_dodge_fx(B: Who, A: Who) -> void:
	var y: float = B.J.head[1] + 6.0 if B.J.has("head") else FLOOR - 120.0
	var dir := float(A.facing)
	swipe(B.x, y, 30, PI if dir > 0.0 else 0.0, 2.2, 4, B.pal.fx, 12)
	sparks(B.x, y, dir, 5, 5, B.pal.fx, 1.4, 0.6, 12)
	for i in 3:
		var yy := y + rnd(-12, 12)
		streak(B.x - dir * 50, yy, B.x + dir * 30, yy, 1.6, A.pal.qi, 8)

func dash_in_fx(F: Who) -> void:
	var y: float = F.J.sh[1] if F.J.has("sh") else FLOOR - 90.0
	for i in 5:
		var yy := y + rnd(-30, 50)
		streak(F.x - F.facing * 10, yy, F.x - F.facing * rnd(120, 190), yy, rnd(2.5, 4.5), F.pal.qi, 14)
	sparks(F.x - F.facing * 10, FLOOR - 4, -F.facing, 6, 6, F.pal.qi, 0.5, 0.5)
	dust(F.x - F.facing * 16, FLOOR, 5, true)

## 连招打中的气浪：3 连起每打中一下身上炸开一圈，越连越大
func combo_fx(F: Who, n: int) -> void:
	if n < 3 or not F.J.has("hip"):
		return
	var y: float = F.J.hip[1] - 28.0
	var k := minf(1.0, (n - 3) / 3.0)
	ring(F.x, y, 14, 52 + 98 * k, 3 + 9 * k, F.pal.qi, 14 + 10 * k, 0.85)
	if n >= 4:
		ring(F.x, FLOOR - 2, 10, 50 + 70 * k, 3 + 5 * k, F.pal.qi, 18, 0.22)
	if n >= 5:
		for d in [1.0, -1.0]:
			sparks(F.x, y, d, 4 + n, 8 + n, F.pal.qi, 1.6, 0.7, 20)
		flash_to(0.06 + 0.03 * mini(4, n - 5))
	if n == 5 or n == 7:
		qi_ring(F, 18 if n == 7 else 13, 1.25 if n == 7 else 1.0)

# ---------- 气（火苗、火星） ----------
const QI_BONES := [["hip", "neck"], ["hip", "neck"], ["neck", "head"], ["sh", "fe"], ["fe", "fh"], ["sh", "be"], ["be", "bh"], ["hip", "fk"], ["fk", "ff"], ["hip", "bk"], ["bk", "bf"]]
const QI_LIMBS := [["fe", "fh"], ["be", "bh"], ["fk", "ff"], ["bk", "bf"]]
const QI_BACK := [["hip", "neck"], ["hip", "neck"], ["sh", "neck"]]

static func combo_heat(n: int) -> float:
	return minf(1.4, 0.4 + 0.25 * (n - 3)) if n >= 3 else 0.0

func add_qi(o: Dictionary) -> void:
	o.max = o.life
	if not o.has("v"):
		o.v = int(vrnd() * 4)
	qi.append(o)

func flame(F: Who, col: String, x: float, y: float, vx: float, vy: float, r: float, a: float, life: float, o := {}) -> void:
	var d := {"k": "flame", "f": F.idx, "col": col, "x": x, "y": y, "vx": vx, "vy": vy, "r": r, "a": a, "life": float(int(life)), "ph": rnd(0, 6.3), "buoy": 0.03, "drag": 0.97}
	d.merge(o, true)
	add_qi(d)

func qi_ring(F: Who, n: int, k: float) -> void:
	if reduce_motion or not F.J.has("hip"):
		return
	var cx := F.x
	var cy: float = (F.J.hip[1] + F.J.neck[1]) / 2.0
	for i in n:
		var a := float(i) / n * TAU + rnd(-0.15, 0.15)
		var s := rnd(3.2, 4.8) * k
		var r0 := rnd(14, 22)
		flame(F, F.pal.qi, cx + cos(a) * r0, cy + sin(a) * r0 * 0.9, cos(a) * s, sin(a) * s * 0.9 - 0.6, rnd(7, 11) * k, rnd(0.42, 0.6), rnd(20, 30),
			{"buoy": 0.12, "drag": 0.88, "hot": vrnd() < 0.5, "fr": sin(a) > 0.2 and vrnd() < 0.35})
	for i in 8:
		var a := rnd(0, TAU)
		var s := rnd(3, 6) * k
		add_qi({"k": "ember", "f": F.idx, "col": F.pal.fx, "x": cx, "y": cy, "vx": cos(a) * s, "vy": sin(a) * s - 1.0, "r": rnd(1.4, 2.6), "a": 1.0,
			"life": float(int(rnd(16, 28))), "ph": rnd(0, 6.3), "drag": 0.92})

## 这一个人身上的气（每一步，FighterAnim.animate 里调）
func emit_qi(a: FighterAnim) -> void:
	var F := a.F
	var W := who(F.idx)
	var tgt := combo_heat(F.combo) if F.comboLive else 0.0
	var h0 := a.heat
	a.heat = h0 + (tgt - h0) * FighterAnim.lk(0.3 if tgt > h0 else 0.08)
	if a.heat < 0.02 and tgt == 0.0:
		a.heat = 0.0
	# 身上的光
	var m := F.move if F.state == "attack" else null
	var qa := 0.0
	var glow := 0.0
	if m != null and (m.def.cost != 0.0 or m.name == "burst"):
		qa = 1.0
		glow = 1.0
	if F.state == "parry":
		qa = maxf(qa, 0.5)
		glow = maxf(glow, 0.4)
	var hh := a.heat
	if hh > 0.5:
		glow = maxf(glow, minf(1.45, (hh - 0.5) * 1.6))
	a.qiGlow += (glow - a.qiGlow) * FighterAnim.lk(0.2)
	# 火往哪边冒：动得快就往身后斜着拖
	var vx: float = 0.0 if a.qx == null else (F.x - float(a.qx)) / DT
	a.qx = F.x
	var sp := absf(vx) + (absf(F.vx) * 0.5 if F.airborne() else 0.0)
	a.qlean += (clampf((sp - 1.2) / 5.0, 0.0, 1.0) - a.qlean) * FighterAnim.lk(0.25)
	var bk := (-1.0 if vx > 0.0 else 1.0) if absf(vx) > 0.6 else -float(F.facing)
	if reduce_motion or a.J.is_empty():
		return
	var J := a.J
	var L := a.qlean
	var spot := func(bones: Array) -> Array:
		var pr: Array = bones[int(vrnd() * bones.size())]
		var u := vrnd()
		var p0: Array = J[pr[0]]
		var p1: Array = J[pr[1]]
		return [p0[0] + (p1[0] - p0[0]) * u + rnd(-7, 7), p0[1] + (p1[1] - p0[1]) * u + rnd(-7, 7)]
	var lick := func(x: float, y: float, up: float, r: float, al: float, life: float, extra: Dictionary) -> void:
		var fvx := bk * (rnd(0.1, 0.8) + L * rnd(2.2, 3.6)) + rnd(-0.3, 0.3)
		var fvy := -up * (1.0 - 0.55 * L)
		var ex := {"buoy": 0.02 + 0.06 * L, "drag": 0.975 - 0.02 * L}
		ex.merge(extra, true)
		flame(W, W.pal.qi, x, y, fvx, fvy, r * (1.0 + 0.15 * L), al, life * (1.0 - 0.25 * L), ex)
	# 招式的气（泼墨、爆气、截拳、卸力）
	var n := qa * (2.0 + 2.6 * qa) * DT
	while n > 0.0 and qa > 0.02:
		if n < 1.0 and vrnd() > n:
			break
		n -= 1.0
		var pt: Array = spot.call(QI_BONES)
		if vrnd() < 0.84:
			lick.call(pt[0], pt[1], rnd(1.2, 2.6) * (0.8 + qa * 0.4), rnd(4, 8) * (0.7 + qa * 0.6), rnd(0.22, 0.36) * (0.5 + qa * 0.6), rnd(16, 28), {})
		else:
			add_qi({"k": "ember", "f": F.idx, "col": W.pal.fx, "x": pt[0], "y": pt[1], "vx": bk * rnd(0, 0.8) + rnd(-0.4, 0.4), "vy": -rnd(1.4, 3), "r": rnd(1.2, 2.2), "a": 0.9,
				"life": float(int(rnd(14, 26))), "ph": rnd(0, 6.3)})
	# 连招的火：3 连才起，只在拳脚上冒；4 连起整个人冒火
	if hh > 0.05:
		var big := hh > 0.6
		var hm := minf(1.0, hh)
		var k := hh * (1.6 + 2.6 * hh) * DT
		while k > 0.0:
			if k < 1.0 and vrnd() > k:
				break
			k -= 1.0
			var pt: Array = spot.call(QI_LIMBS if hh < 0.5 else QI_BONES)
			if vrnd() < 0.86:
				lick.call(pt[0], pt[1], rnd(1.5, 3.2) * (0.8 + 0.55 * hh), rnd(5.5, 8.5) * (0.8 + 0.55 * hh), rnd(0.46, 0.64) * (0.65 + 0.35 * hm), rnd(16, 28),
					{"hot": big and vrnd() < 0.55, "fr": big and vrnd() < 0.08})
			else:
				add_qi({"k": "ember", "f": F.idx, "col": W.pal.fx, "x": pt[0], "y": pt[1], "vx": bk * (rnd(0, 1) + L * 3.0) + rnd(-0.5, 0.5), "vy": -rnd(1.6, 3.6) * (0.8 + 0.45 * hh),
					"r": rnd(1, 1.8) * (0.8 + 0.4 * hh), "a": 1.0, "life": float(int(rnd(14, 26))), "ph": rnd(0, 6.3)})
		# 5 连起：背上往身后斜着往上喷大火舌
		if hh > 0.8:
			var pp := (hh - 0.7) * 2.2 * DT
			while pp > 0.0:
				if pp < 1.0 and vrnd() > pp:
					break
				pp -= 1.0
				var pt: Array = spot.call(QI_BACK)
				var s2 := rnd(1.6, 2.8) * (0.8 + 0.3 * hh)
				var ang := (0.5 + 0.45 * L + rnd(-0.18, 0.18)) * PI / 2.0
				flame(W, W.pal.qi, pt[0] + bk * 6.0, pt[1] + rnd(0, 8), bk * sin(ang) * s2, -cos(ang) * s2, rnd(13, 20) * (0.55 + 0.45 * hh), rnd(0.2, 0.3) * hm, rnd(22, 34),
					{"hot": vrnd() < 0.4, "buoy": 0.05, "drag": 0.98, "len": 1.25})

func _update_qi() -> void:
	for i in range(qi.size() - 1, -1, -1):
		var p: Dictionary = qi[i]
		p.px = p.x
		p.py = p.y
		p.ph += 0.22 * DT
		if not p.has("dr"):
			p.dr = C.rootDT(p.get("drag", 1.0))
		p.vx *= p.dr
		p.vy = p.vy * K.qv - p.get("buoy", 0.0) * DT
		p.x += (p.vx + sin(p.ph) * 0.4) * DT
		p.y += p.vy * DT
		if p.k == "flame":
			p.r *= K.qr
		p.life -= DT
		if p.life <= 0.0:
			qi.remove_at(i)
	if qi.size() > 1000:
		qi = qi.slice(qi.size() - 1000)

# ---------- 逻辑层的事件 → 特效（每一步、在骨骼更新以前调：和 JS 当场放特效时看到的骨骼一样） ----------
func handle(e: Dictionary) -> void:
	var p = e.get("p", null)
	match e.type:
		"shake":
			shake = maxf(shake, float(e.v))
		"tag":
			_tag_event(e, p)
		"stamp":
			var A := who(int(e.own), p)
			if A.J.has("head"):
				stamp(A.J.head[0] + A.facing * float(e.dx), A.J.head[1] - 46.0, e.text, e.size, int(e.own))
		"announce":
			announce(e.text, e.sub, e.life, e.size, int(e.own))
		"fx":
			_fx_event(e, p)

func _tag_event(e: Dictionary, p) -> void:
	var at: String = e.at
	var dx: float = e.get("dx", 0.0)
	var dy: float = e.dy
	var w: int = int(e.who)
	var x := float(e.get("x", 0.0))
	var y := FLOOR
	match at:
		"head", "sh", "floor":
			var W := who(w, p)
			x = W.x + dx
			if at == "floor":
				y = FLOOR + dy
			elif W.J.has(at if at == "sh" else "head"):
				y = W.J[at if at == "sh" else "head"][1] + dy
			else:
				y = FLOOR - 150.0 + dy
		"contact":
			var A := who(int(e.own) if e.own is int or e.own is float else 0, p)
			var B := who(w, p)
			var c := contact(A, B)
			x = c.x + dx
			y = c.y + dy
		"mid", "clash":
			var a := who(0, p)
			var b := who(1, p)
			x = (a.x + b.x) / 2.0 + dx
			if at == "mid":
				y = FLOOR + dy
			else:
				y = (contact(a, b).y + contact(b, a).y) / 2.0 + dy
	tag(x, y, e.text, e.own, e.size)

func _fx_event(e: Dictionary, p) -> void:
	var kind: String = e.kind
	var ai := int(e.a)
	var bi := int(e.get("b", -1))
	var A: Who = who(ai, p) if ai >= 0 else null
	var B: Who = who(bi, p) if bi >= 0 else null
	match kind:
		"hit":           # a 打 b
			hit_fx(str(e.get("fxk", "")), contact(A, B), A, B)
		"crash":         # a 把 b 从空中打下来（倒栽葱）
			crash_fx(B, float(A.facing), A)
		"evade":         # a 化解了 b 这一下
			sparks(A.x + A.facing * 16, A.J.sh[1], A.facing, 6, 6, A.pal.fx, 1.0, 0.3)
		"guard":         # a 打、b 挡住
			var c := contact(A, B)
			var sx := B.x + B.facing * 20.0
			swipe(sx, c.y, 32, 0.0 if B.facing > 0 else PI, 2.4, 6, B.pal.qi, 14)
			sparks(sx + B.facing * 6, c.y, B.facing, 7, 6, B.pal.fx, 0.9, 0.4, 12)
		"parry":         # a 卸了 b 的力
			parry_fx(A, contact(B, A))
		"absorb":        # a 打、b 霸体吃了
			var c := contact(A, B)
			impact(c.x, c.y, -A.facing, 30, B.pal.ink, 6, 1.0)
			sparks(c.x, c.y, -A.facing, 6, 6, B.pal.fx, 0.8)
		"clash":         # 拼招
			var mx := (A.x + B.x) / 2.0
			var my := (contact(A, B).y + contact(B, A).y) / 2.0
			clash_fx(mx, my, A, B)
		"press":         # a 压了 b
			var c := contact(A, B)
			clash_fx(c.x, c.y, A, B, 1.0, 0.35)
			hit_fx(str(e.get("fxk", "")), c, A, B)
		"tumble":        # a 的腿把 b 顶回去翻个跟头
			tumble_fx(B, A, contact(A, B))
		"shove":
			shove_fx(A, B)
		"slipDodge":     # a 闪身躲过 b 这一拳
			slip_dodge_fx(A, B)
		"legCatch":      # a 接住 / 抄住 b 的腿
			var foot: Array = B.J.ff
			var dir := float(A.facing)
			dust(foot[0], foot[1], 5)
			impact(foot[0], foot[1], dir, 36, A.pal.ink, 6, 1.0)
			sparks(foot[0], foot[1], dir, 8, 7, A.pal.fx, 1.0, 0.4)
		"grab":          # a 擒住 b
			dust(B.x, FLOOR, 3)
			burst(B.x - A.facing * 10, FLOOR - 70, A.facing, 6, 24, 3, A.pal.fx)
		"escape":        # a 挣脱了 b
			var mx := (A.x + B.x) / 2.0
			impact(mx, FLOOR - 80, 1.0 if B.x >= mx else -1.0, 36, A.pal.ink, 5, 1.3)
			impact(mx, FLOOR - 80, 1.0 if A.x >= mx else -1.0, 36, B.pal.ink, 5, 1.3)
		"grabPush":
			dust(B.x, FLOOR, 3)
			burst(B.x, FLOOR - 70, A.facing, 6, 24, 3, A.pal.fx)
		"knee":
			var k: Array = A.J.ff
			var sec: bool = e.get("second", false)
			impact(k[0], k[1] - 10, A.facing, 36 if sec else 28, A.pal.ink, 6, 1.0)
			sparks(k[0], k[1] - 10, A.facing, 6, 6, A.pal.fx, 0.9, 0.5)
		"slamFloor":
			dust(A.x, FLOOR, int(e.get("n", 8)), e.get("big", false))
		"combo":
			combo_fx(A, int(e.get("n", 0)))
		"slip":
			slip_fx(A)
		"dashIn":
			dash_in_fx(A)
		"move":
			if A.anim != null:
				A.anim.trail.clear()
		"super":
			super_fx(A)
		"burst":
			burst_fx(A)
		"dashEnd":
			dust(A.x + A.facing * 24, FLOOR, 6)
		"burstHit":
			burst_hit_fx(A, B)
		"land":
			dust(A.x, FLOOR, int(e.get("n", 4)), e.get("big", false))
		"reset", "matchStart", "roundStart":
			if kind == "reset":
				clear()

## 招式里每一步的小特效（JS 写在 attackStep 里，Godot 的逻辑层不管画面）：这一步刚走完、骨骼还没更新时调
func per_step(i: int) -> void:
	var a: FighterAnim = anims[i]
	var F := a.F
	var m := F.move
	if F.state != "attack" or m == null:
		return
	var k := m.t - 1.0           # 和 JS attackStep 里的 k 一样（这一步开头的 m.t + DT - 1）
	var W := who(i)
	match m.name:
		"dash":
			if k == 0.0:
				dust(W.x - W.facing * 20, FLOOR, 5)
				burst(W.x - W.facing * 30, FLOOR - 40, -W.facing, 4, 30, 2.5, W.pal.qi)
			if k > 0.0 and k < 10.0 and fmod(k, 2.0) == 0.0:
				dash_lines(W)
		"slip":
			if k > 0.0 and m.def.has_lunge and k < m.def.lunge[1] and fmod(k, 2.0) == 0.0:
				slip_lines(W)
		"super":
			super_step(W, m, k)
