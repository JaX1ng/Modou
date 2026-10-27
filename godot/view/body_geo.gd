class_name BodyGeo
extends RefCounted
## 人物在画面平面上的外形（对照 JS body.js 的外形部分）：骨骼 J（fk 算出来的画面坐标）→ 一块一块的外形（一圈点）。
## 3D 模型不用这些画，但「出招时拳脚停在对方身上」（FighterAnim.fitContact）、量拳脚碰没碰到对方要用 —— 和 JS 版一模一样地量。
## 点都是 [x, y]（画面坐标，y 往下）。

const D2R := PI / 180.0

static func cmr(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
	var t2 := t * t
	var t3 := t2 * t
	return 0.5 * (2.0 * p1 + (p2 - p0) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (3.0 * p1 - p0 - 3.0 * p2 + p3) * t3)

## 轮廓表在 t 处的值（第 k 列），控制点之间用平滑曲线连
static func profAt(P: Array, t: float, k: int) -> float:
	if t <= P[0][0]:
		return P[0][k]
	var n := P.size()
	for i in range(1, n):
		if t <= P[i][0]:
			var a: Array = P[maxi(0, i - 2)]
			var b: Array = P[i - 1]
			var c: Array = P[i]
			var d: Array = P[mini(n - 1, i + 1)]
			return cmr(a[k], b[k], c[k], d[k], (t - b[0]) / (c[0] - b[0]))
	return P[n - 1][k]

## 一节肢体（A → B）的外形：一圈点。key = 哪一节的轮廓表（ua / fa / th / sh / neck）；as_ = 前侧在哪边（+1：法线 n = (-uy, ux) 那边是前侧；-1 反过来；中间按比例混）
## g = 整圈往外胖多少；ext（大腿用）：根头不画圆头，两条边顺着骨头往回直直地伸 ext
static func limbShape(A: Array, B: Array, bd: BodyDef, key: String, as_: float, g: float, ext := 0.0) -> Array:
	var dx: float = B[0] - A[0]
	var dy: float = B[1] - A[1]
	var L := sqrt(dx * dx + dy * dy)
	if L == 0.0:
		L = 1e-3
	var ux := dx / L
	var uy := dy / L
	var nx := -uy
	var ny := ux
	var wa := (clampf(as_, -1.0, 1.0) + 1.0) / 2.0
	var N := 8
	var left := []
	var right := []
	var wl0 := 0.0
	var wr0 := 0.0
	var wl1 := 0.0
	var wr1 := 0.0
	for i in N + 1:
		var t := float(i) / N
		var f := bd.profv(key, t, 1)
		var b := bd.profv(key, t, 2)
		var wl := maxf(0.6, b + (f - b) * wa + g)
		var wr := maxf(0.6, f + (b - f) * wa + g)
		var cx: float = A[0] + dx * t
		var cy: float = A[1] + dy * t
		left.append([cx + nx * wl, cy + ny * wl])
		right.append([cx - nx * wr, cy - ny * wr])
		if i == 0:
			wl0 = wl
			wr0 = wr
		if i == N:
			wl1 = wl
			wr1 = wr
	var pts := left.duplicate()
	var an := atan2(ny, nx)
	# 梢头：从左边绕到右边（经过 +u）
	_cap(pts, B[0] + nx * (wl1 - wr1) / 2.0, B[1] + ny * (wl1 - wr1) / 2.0, (wl1 + wr1) / 2.0, an, an - PI)
	for i in range(N, -1, -1):
		pts.append(right[i])
	if ext > 0.0:
		var e := ext + g
		var e1 := maxf(0.0, e - 1.5)
		pts.append([A[0] - ux * e1 - nx * wr0, A[1] - uy * e1 - ny * wr0])
		pts.append([A[0] - ux * e - nx * wr0, A[1] - uy * e - ny * wr0])
		pts.append([A[0] - ux * e + nx * wl0, A[1] - uy * e + ny * wl0])
		pts.append([A[0] - ux * e1 + nx * wl0, A[1] - uy * e1 + ny * wl0])
	else:
		# 根头：从右边绕回左边（经过 -u）
		_cap(pts, A[0] + nx * (wl0 - wr0) / 2.0, A[1] + ny * (wl0 - wr0) / 2.0, (wl0 + wr0) / 2.0, an + PI, an)
	return pts

static func _cap(pts: Array, cx: float, cy: float, r: float, a0: float, a1: float) -> void:
	for i in range(1, 10):
		var a := a0 + (a1 - a0) * i / 10.0
		pts.append([cx + cos(a) * r, cy + sin(a) * r])

## 拳头：顺着小臂方向的圆角方块（中心 H，方向 u）
static func fistShape(bd: BodyDef, H: Array, ux: float, uy: float, g: float) -> Array:
	var hl := maxf(1.0, bd.fist.len / 2.0 + g)
	var hh := maxf(1.0, bd.fist.h / 2.0 + g)
	var r := clampf(bd.fist.r + g, 0.5, hh - 0.2)
	var nx := -uy
	var ny := ux
	var pts := []
	for c in [[1.0, 1.0, 0.0], [-1.0, 1.0, PI / 2.0], [-1.0, -1.0, PI], [1.0, -1.0, PI * 1.5]]:
		var cx: float = c[0] * (hl - r)
		var cy: float = c[1] * (hh - r)
		for i in 5:
			var a: float = c[2] + PI / 2.0 * i / 4.0
			var lx := cx + cos(a) * r
			var ly := cy + sin(a) * r
			pts.append([H[0] + ux * lx + nx * ly, H[1] + uy * lx + ny * ly])
	return pts

## 鞋：K 脚踝，(dx, dy) 脚尖方向，(sx, sy) 朝鞋底的方向；k = 侧面看脚有多长（脚尖朝镜头 / 背着镜头时变短）
static func footShape(bd: BodyDef, K: Array, dx: float, dy: float, sx: float, sy: float, g: float, k := 1.0) -> Array:
	var P := bd.foot_pts()
	var Nn := bd.foot_nrm()
	var out := []
	for i in P.size():
		var X: float = P[i][0] * k + Nn[i][0] * g
		var Y: float = P[i][1] + Nn[i][1] * g
		out.append([K[0] + dx * X + sx * Y, K[1] + dy * X + sy * Y])
	return out

## 躯干的外形：沿脊柱（髋 H → 脖子根 N）长出来
class TorsoS:
	var bd: BodyDef
	var H: Array
	var dx := 0.0
	var dy := 0.0
	var fx := 0.0
	var fy := 0.0
	var ss := 0.0
	var cs := 0.0
	var g := 0.0
	var pts: Array = []
	var bottom: Array = []
	## 这里多宽：k = 1 胸腹、2 后背
	func half(t: float, k: int) -> float:
		return maxf(0.6, bd.profv("torso", t, k) * cs + bd.profv("torso", t, 3) * ss + g)
	## 脊柱上 t 处、往前 w 的那个点
	func at(t: float, w: float) -> Array:
		return [H[0] + dx * t + fx * w, H[1] + dy * t + fy * w]

static func torsoShape(bd: BodyDef, H: Array, N: Array, fx: float, fy: float, spin: float, g: float) -> TorsoS:
	var T := TorsoS.new()
	T.bd = bd
	T.H = H
	T.dx = N[0] - H[0]
	T.dy = N[1] - H[1]
	T.fx = fx
	T.fy = fy
	T.ss = absf(sin(spin))
	T.cs = absf(cos(spin))
	T.g = g
	var sl := sqrt(T.dx * T.dx + T.dy * T.dy)
	if sl == 0.0:
		sl = 1.0
	var P := bd.p_torso
	var t0: float = P[0][0]
	var eg := g / sl
	var ts := []
	for i in 15:
		ts.append(t0 + (1.0 - t0) * i / 14.0)
	var pts := []
	for t in ts:
		pts.append(T.at(t, T.half(t, 1)))
	# 顶上（斜方肌 → 脖子根），往上拱一点
	pts.append(T.at(1.035 + eg, T.half(1.0, 1) * 0.35))
	pts.append(T.at(1.045 + eg, -T.half(1.0, 2) * 0.3))
	for i in range(ts.size() - 1, -1, -1):
		pts.append(T.at(ts[i], -T.half(ts[i], 2)))
	var b := T.half(t0, 2)
	var f := T.half(t0, 1)
	T.bottom = [T.at(t0 - 0.03 - eg, -b * 0.7), T.at(t0 - 0.05 - eg, -b * 0.2), T.at(t0 - 0.05 - eg, f * 0.3), T.at(t0 - 0.03 - eg, f * 0.75)]
	pts.append_array(T.bottom)
	T.pts = pts
	return T

## 外包（凸包）
static func convexHull(P: Array) -> Array:
	var pts := P.duplicate()
	pts.sort_custom(func(a, b): return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1]))
	if pts.size() < 3:
		return pts
	var lo := []
	var up := []
	for p in pts:
		while lo.size() >= 2 and _cr(lo[lo.size() - 2], lo[lo.size() - 1], p) <= 0.0:
			lo.pop_back()
		lo.append(p)
	for i in range(pts.size() - 1, -1, -1):
		var p: Array = pts[i]
		while up.size() >= 2 and _cr(up[up.size() - 2], up[up.size() - 1], p) <= 0.0:
			up.pop_back()
		up.append(p)
	lo.pop_back()
	up.pop_back()
	return lo + up

static func _cr(o: Array, a: Array, b: Array) -> float:
	return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

## 裆（腰带底下那一块）：躯干腰带以下那截 + 两个大腿根 + 两条大腿往下 seat_reach 那一段，取外包
static func seatShape(bd: BodyDef, tor: TorsoS, legs: Array, g: float) -> Array:
	var P := []
	var tb := bd.belt_at - bd.belt_h / 2.0 / bd.torso
	for t in [tb, tb * 0.5, 0.0]:
		P.append(tor.at(t, tor.half(t, 1)))
		P.append(tor.at(t, -tor.half(t, 2)))
	P.append_array(tor.bottom)
	var r0 := maxf(0.6, (bd.p_th[0][1] + bd.p_th[0][2]) / 2.0 + g)
	for leg in legs:
		var R: Array = leg[0]
		var M: Array = leg[1]
		var E: Array = leg[2]
		var ux: float = M[0] - R[0]
		var uy: float = M[1] - R[1]
		var ul := sqrt(ux * ux + uy * uy)
		if ul < 6.0:
			ux = E[0] - R[0]
			uy = E[1] - R[1]
			ul = sqrt(ux * ux + uy * uy)
		if ul < 1e-3:
			ux = 0.0
			uy = 1.0
			ul = 1.0
		ux /= ul
		uy /= ul
		var nx := -uy
		var ny := ux
		var L := bd.th
		var d1 := minf(bd.seat_reach, ul)
		for i in 20:
			var a := float(i) / 20.0 * PI * 2.0
			P.append([R[0] + cos(a) * r0, R[1] + sin(a) * r0])
		for d in [d1 * 0.5, d1]:
			var w := maxf(0.6, (bd.profv("th", d / L, 1) + bd.profv("th", d / L, 2)) / 2.0 + g)
			P.append([R[0] + ux * d + nx * w, R[1] + uy * d + ny * w])
			P.append([R[0] + ux * d - nx * w, R[1] + uy * d - ny * w])
	return convexHull(P)

## 骨骼 → 一块一块（按画的先后排好）：[{k 名字, pts 外形, far 远侧, layer 哪一层, fist/foot/head/seat}]
## only（可选，{名字: true}）：只要这几块。块的名字：aFU / aFL / aFH 前手大臂 / 小臂 / 拳，aB* 后手；FU / FL / FF 前腿，B* 后腿；torso、neck、seat、head
## 返回 {parts, f, fx, fy, tor}
static func bodyParts(bd: BodyDef, J: Dictionary, g := 0.0, only = null) -> Dictionary:
	var f: float = float(J.facing) * (-1.0 if J.turned else 1.0)
	var sx: float = J.neck[0] - J.hip[0]
	var sy: float = J.neck[1] - J.hip[1]
	var sl := sqrt(sx * sx + sy * sy)
	if sl == 0.0:
		sl = 1.0
	var fx := f * (-sy / sl)
	var fy := f * (sx / sl)
	var parts := []
	var need := func(k: String) -> bool: return only == null or only.has(k)
	var tor: TorsoS = null
	if need.call("torso") or need.call("neck") or need.call("seat"):
		tor = torsoShape(bd, J.hip, J.neck, fx, fy, float(J.get("spin", 0.0)), g)
	var nk = null
	if need.call("neck"):
		nk = limbShape(J.neck, J.neckTop, bd, "neck", 1.0, g)
	var hr := bd.head + g
	var head := []
	if need.call("head"):
		for i in 28:
			var a := float(i) / 28.0 * PI * 2.0
			head.append([J.head[0] + cos(a) * hr, J.head[1] + sin(a) * hr])
	var t: bool = J.turned
	var farArm := ["B", J.shB, J.be, J.bh, J.hBe] if t else ["F", J.shF, J.fe, J.fh, J.hFe]
	var nearArm := ["F", J.shF, J.fe, J.fh, J.hFe] if t else ["B", J.shB, J.be, J.bh, J.hBe]
	var farLeg := ["F", J.hipF, J.fk, J.ff, J.hFk] if t else ["B", J.hipB, J.bk, J.bf, J.hBk]
	var nearLeg := ["B", J.hipB, J.bk, J.bf, J.hBk] if t else ["F", J.hipF, J.fk, J.ff, J.hFk]
	_limb(bd, J, parts, need, f, "a" + farArm[0], farArm[1], farArm[2], farArm[3], farArm[4], true, true, "farArm", g)
	_limb(bd, J, parts, need, f, farLeg[0], farLeg[1], farLeg[2], farLeg[3], farLeg[4], false, true, "farLeg", g)
	if need.call("torso"):
		parts.append({"k": "torso", "pts": tor.pts, "layer": "torso"})
	if nk != null:
		parts.append({"k": "neck", "pts": nk, "layer": "torso"})
	if need.call("seat") and tor != null:
		parts.append({"k": "seat", "pts": seatShape(bd, tor, [[J.hipF, J.fk, J.ff], [J.hipB, J.bk, J.bf]], g), "layer": "torso", "seat": true})
	_limb(bd, J, parts, need, f, nearLeg[0], nearLeg[1], nearLeg[2], nearLeg[3], nearLeg[4], false, false, "nearLeg", g)
	if head.size() > 0:
		parts.append({"k": "head", "pts": head, "layer": "head", "head": true})
	_limb(bd, J, parts, need, f, "a" + nearArm[0], nearArm[1], nearArm[2], nearArm[3], nearArm[4], true, false, "nearArm", g)
	return {"parts": parts, "f": f, "fx": fx, "fy": fy, "tor": tor}

## 「前侧」在哪边：胳膊 —— 小臂折向的那一侧（大臂）/ 朝大臂的那一侧（小臂）；腿 —— 膝盖顶出去的那一侧。伸直了看不出来，就按 hint 定
static func _side(A2: Array, B2: Array, toward: Array, sign_: float, hint: Array, arm: bool) -> float:
	var dx: float = B2[0] - A2[0]
	var dy: float = B2[1] - A2[1]
	var L := sqrt(dx * dx + dy * dy)
	if L == 0.0:
		L = 1e-3
	var nx := -dy / L
	var ny := dx / L
	var tx: float = toward[0] - B2[0]
	var ty: float = toward[1] - B2[1]
	var tl := sqrt(tx * tx + ty * ty)
	if tl == 0.0:
		tl = 1e-3
	var v := sign_ * (nx * tx + ny * ty) / tl / 0.14
	var hs := 1.0 if (nx * hint[0] + ny * hint[1]) >= 0.0 else -1.0
	var h := -hs if arm else hs
	return signf(v) if absf(v) >= 1.0 else v + (1.0 - absf(v)) * h

static func _limb(bd: BodyDef, J: Dictionary, parts: Array, need: Callable, f: float, key: String, R: Array, M: Array, E: Array, hint: Array,
		arm: bool, far: bool, layer: String, g: float) -> void:
	var nU: bool = need.call(key + "U")
	var nL: bool = need.call(key + "L")
	var nE: bool = need.call(key + ("H" if arm else "F"))
	if not nU and not nL and not nE:
		return
	var aUp := _side(R, M, E, 1.0 if arm else -1.0, hint, arm)
	var aLo := _side(M, E, R, 1.0 if arm else -1.0, hint, arm)
	if arm:
		var ex: float = E[0] - M[0]
		var ey: float = E[1] - M[1]
		var el := sqrt(ex * ex + ey * ey)
		if el == 0.0:
			el = 1e-3
		var ux := ex / el
		var uy := ey / el
		var W := [E[0] - ux * bd.wrist, E[1] - uy * bd.wrist]
		if nU:
			parts.append({"k": key + "U", "pts": limbShape(R, M, bd, "ua", aUp, g), "far": far, "layer": layer})
		if nL:
			parts.append({"k": key + "L", "pts": limbShape(M, W, bd, "fa", aLo, g), "far": far, "layer": layer})
		if nE:
			parts.append({"k": key + "H", "pts": fistShape(bd, E, ux, uy, g), "far": far, "layer": layer, "fist": true})
	else:
		var fd := footDir(bd, J, key, M, E, f)
		if nU:
			parts.append({"k": key + "U", "pts": limbShape(R, M, bd, "th", aUp, g), "far": far, "layer": layer})
		if nL:
			parts.append({"k": key + "L", "pts": limbShape(M, E, bd, "sh", aLo, g), "far": far, "layer": layer})
		if nE:
			parts.append({"k": key + "F", "pts": footShape(bd, E, fd[0], fd[1], fd[2], fd[3], g, minf(1.0, fd[4])), "far": far, "layer": layer, "foot": true})

## 脚尖朝哪：[dx, dy 脚尖方向（画面上）, sx, sy 朝鞋底的方向, k 侧面看脚有多长]。
## 站在地上（身子直着、脚踝贴近地面）脚底放平；离了地按小腿的方向（脚尖微微绷着）；膝盖往侧面摆、转身时脚尖朝镜头 / 背着镜头，侧面看就短了
static func footDir(bd: BodyDef, J: Dictionary, key: String, M: Array, E: Array, f: float) -> Array:
	var kd: float = J.fkd if key == "F" else J.bkd
	var sg := f * (-1.0 if kd < 0.0 else 1.0)
	var lx: float = E[0] - M[0]
	var ly: float = E[1] - M[1]
	var ll := sqrt(lx * lx + ly * ly)
	if ll == 0.0:
		ll = 1e-3
	var up2 := 1.0 if cos(float(J.rot)) > 0.7 else 0.0
	var gr := up2 * clampf(1.0 - (C.FLOOR - bd.ankle - float(E[1])) / 7.0, 0.0, 1.0)
	var pa := (90.0 - 22.0 * (1.0 - gr)) * D2R * -sg
	var ca := cos(pa)
	var sa := sin(pa)
	var dx := (lx * ca - ly * sa) / ll
	var dy := (lx * sa + ly * ca) / ll
	dx += (sg - dx) * gr
	dy += (0.0 - dy) * gr
	var dl := sqrt(dx * dx + dy * dy)
	if dl == 0.0:
		dl = 1.0
	dx /= dl
	dy /= dl
	var tilt: float = J.fft if key == "F" else J.bft
	if tilt != 0.0:
		var a := -sg * tilt * D2R
		var c := cos(a)
		var s2 := sin(a)
		var x2 := dx * c - dy * s2
		dy = dx * s2 + dy * c
		dx = x2
	var yaw: float = (float(J.fyaw) if key == "F" else float(J.byaw)) * D2R
	var sp: float = J.get("spin", 0.0)
	var zs := 1.0 if key == "F" else -1.0
	var kk := maxf(float(bd.foot.w) / (bd.foot.heel + bd.foot.toe), absf(cos(yaw) * cos(sp) - zs * sin(yaw) * sin(sp)))
	return [dx, dy, -sg * dy, sg * dx, kk]

## 出招的那只拳 / 脚 / 肘 / 肩是哪几块
const STRIKE_SET := {"fh": ["aFH"], "bh": ["aBH"], "ff": ["FF", "FL"], "bf": ["BF", "BL"], "fe": ["aFL", "aFU"], "be": ["aBL", "aBU"], "sh": ["aFU", "aBU", "torso"]}

static func strikeParts(bd: BodyDef, J: Dictionary, limb: String, parts = null) -> Array:
	if parts == null:
		var only := {}
		for k in STRIKE_SET.get(limb, []):
			only[k] = true
		parts = bodyParts(bd, J, 0.0, only).parts
	var by := func(k: String) -> Array:
		var o := []
		for p in parts:
			if p.k == k:
				o.append(p.pts)
		return o
	match limb:
		"fh": return by.call("aFH")
		"bh": return by.call("aBH")
		"ff": return by.call("FF") + by.call("FL")
		"bf": return by.call("BF") + by.call("BL")
		"fe": return by.call("aFL") + by.call("aFU")
		"be": return by.call("aBL") + by.call("aBU")
		"sh": return by.call("aFU") + by.call("aBU") + by.call("torso")
	return []

static func pointInPoly(x: float, y: float, pts: Array) -> bool:
	var c := false
	var n := pts.size()
	var j := n - 1
	for i in n:
		var a: Array = pts[i]
		var b: Array = pts[j]
		if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
			c = not c
		j = i
	return c

static func distToPoly(x: float, y: float, pts: Array) -> float:
	var m := 1e9
	var n := pts.size()
	var j := n - 1
	for i in n:
		var a: Array = pts[j]
		var b: Array = pts[i]
		var dx: float = b[0] - a[0]
		var dy: float = b[1] - a[1]
		var L := dx * dx + dy * dy
		if L == 0.0:
			L = 1e-6
		var t := clampf(((x - a[0]) * dx + (y - a[1]) * dy) / L, 0.0, 1.0)
		var ex: float = a[0] + dx * t - x
		var ey: float = a[1] + dy * t - y
		m = minf(m, sqrt(ex * ex + ey * ey))
		j = i
	return m

## 这些点离对手身子最近还差多少（正 = 还差这么多才碰到；负 = 已经扎进去这么深）
static func bodyGap(bd: BodyDef, polys: Array, J2: Dictionary) -> float:
	var tgt := []
	for p in bodyParts(bd, J2, 0.0).parts:
		tgt.append(p.pts)
	var best := 1e9
	for poly in polys:
		for q in poly:
			var x: float = q[0]
			var y: float = q[1]
			var inside := 0.0
			var out := 1e9
			for Q in tgt:
				var d := distToPoly(x, y, Q)
				if pointInPoly(x, y, Q):
					inside = maxf(inside, d)
				else:
					out = minf(out, d)
			var gg := -inside if inside > 0.0 else out
			if gg < best:
				best = gg
	return best

## 对方的外形（量 bodyPen 用）：每一块的点（xs、ys 分开放，量得快）+ 上下范围。noArms：对方的胳膊不算
static func bodyTargets(bd: BodyDef, J2: Dictionary, noArms: bool, parts = null) -> Array:
	if parts == null:
		parts = bodyParts(bd, J2, 0.0).parts
	var out := []
	for p in parts:
		if noArms and String(p.k).begins_with("a"):
			continue
		var y0 := 1e9
		var y1 := -1e9
		var xs := PackedFloat64Array()
		var ys := PackedFloat64Array()
		for q in p.pts:
			var qy: float = q[1]
			if qy < y0:
				y0 = qy
			if qy > y1:
				y1 = qy
			xs.append(q[0])
			ys.append(qy)
		out.append({"pts": p.pts, "xs": xs, "ys": ys, "y0": y0, "y1": y1, "mu": 0.0, "dir": 0.0})
	return out

static func bodyPen(bd: BodyDef, polys: Array, J2: Dictionary, dir: float, noArms: bool) -> float:
	return bodyPenT(polys, bodyTargets(bd, J2, noArms), dir)

## 打进去多深：polys 往 dir（1 往右 / -1 往左）打，最靠前的那一点过了对方身子迎面那一层多远（还没碰到 = 负的）。
## 按横着的一条条线量（这个高度上对方身子最靠近打过来那一边的边）。和 JS 算出来一样；先用每一块的最前沿估个上限，够不着的点、块直接跳过
static func bodyPenT(polys: Array, tgt: Array, dir: float) -> float:
	for T in tgt:
		if T.dir != dir:
			var mu := 1e9
			for x in T.xs:
				mu = minf(mu, x * dir)
			T.mu = mu
			T.dir = dir
	var best := -1e9
	for poly in polys:
		for pt in poly:
			var y: float = pt[1]
			var xd: float = pt[0] * dir
			var lowest := 1e9
			for T in tgt:
				if y >= T.y0 and y <= T.y1 and T.mu < lowest:
					lowest = T.mu
			if lowest >= 1e9 or xd - lowest <= best:
				continue
			var near := 1e9
			for T in tgt:
				if y < T.y0 or y > T.y1 or T.mu >= near:
					continue
				var xs: PackedFloat64Array = T.xs
				var ys: PackedFloat64Array = T.ys
				var n := xs.size()
				var j := n - 1
				for i in n:
					var ay := ys[j]
					var cy := ys[i]
					if (ay > y) != (cy > y):
						var ax := xs[j]
						var u := (ax + (xs[i] - ax) * (y - ay) / (cy - ay)) * dir
						if u < near:
							near = u
					j = i
			if near < 1e9 and xd - near > best:
				best = xd - near
	return best

static func signedArea(pts: Array) -> float:
	var s := 0.0
	var n := pts.size()
	var j := n - 1
	for i in n:
		s += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1])
		j = i
	return s
