class_name ModelBuilder
extends RefCounted
## 人物模型（简易版）：照 BodyDef 的骨头长短、轮廓表，沿着每根骨头长出一节一节（截面前后不对称：胳膊里侧、小腿肚……和 2D 版一样），
## 再穿上一身（Outfit：袍子、腰带、裤子、靴 / 裹腿、头发、头带、念珠）。蒙皮到 Rig 的骨骼上（关节附近两根骨头各管一半，弯起来不裂）。
## 每个顶点的颜色通道记着：r = 区域编号 / 15（着色器按编号取颜色）、g = 明暗（缝里、底下暗一点）、b = 花纹、a = 1。
## 模型只在开局做一次（换颜色只换着色器的颜色表，不重做）。

const S := Rig.S
## 做模型时的姿势：站直、手垂在身边稍微往前、腿直着
const REST := {"rot": 0, "spin": 0, "tor": 0, "head": 0, "hy": 80.5, "dx": 0, "air": 0, "tw": 0, "fe": 1, "be": 1, "fn": 1, "bn": 1,
	"ft": 0, "bt": 0, "fo": 0, "bo": 0, "fh": [6, 44], "bh": [6, 44], "ff": [2.2, 0], "bf": [-2.2, 0]}

var bd: BodyDef
var of: Outfit
var rest: Array = []           # 每根骨头做模型时的位置朝向（人物坐标）
var J3 := {}                   # 做模型时的关节（人物坐标，米）

var V := PackedVector3Array()
var N := PackedVector3Array()
var CO := PackedColorArray()
var BI := PackedInt32Array()
var BW := PackedFloat32Array()
var IX := PackedInt32Array()

func _init(body: BodyDef, outfit: Outfit) -> void:
	bd = body
	of = outfit
	var f := Fighter.new(0, "ink", 0.0, 1)
	var a := FighterAnim.new(f, bd)
	a.disp.apply_dict(REST)
	a.J = {}
	a.fk()
	for k in a.P3:
		J3[k] = Rig.pt(a.P3, k, a.hipY)
	rest = Rig.frames(a.P3, a.ang, a.hipY, Rig.toe_dirs(bd, a.J, a.P3, a.hipY))

# ---------- 底层：加点、加三角形 ----------
## bw：[[骨头, 权重], …]（最多 4 个，自动归一）
func vert(p: Vector3, n: Vector3, region: int, bw: Array, shade := 1.0, pat := 0.0) -> int:
	V.append(p)
	N.append(n.normalized() if n.length_squared() > 1e-12 else Vector3.UP)
	CO.append(Color((region + 0.5) / 16.0, clampf(shade, 0.0, 1.0), pat, 1.0))
	var tot := 0.0
	for e in bw:
		tot += e[1]
	for i in 4:
		if i < bw.size():
			BI.append(bw[i][0])
			BW.append(bw[i][1] / tot if tot > 0.0 else 0.0)
		else:
			BI.append(0)
			BW.append(0.0)
	return V.size() - 1

## 三角形：按顶点法线自动定正反面（Godot 顺时针是正面，正面朝法线那边），拼的时候不用管绕向
func tri(a: int, b: int, c: int) -> void:
	var n := (V[b] - V[a]).cross(V[c] - V[a])
	IX.append(a)
	if n.dot(N[a] + N[b] + N[c]) > 0.0:
		IX.append(c)
		IX.append(b)
	else:
		IX.append(b)
		IX.append(c)

## 一圈一圈的点连成管子：rings[i] 是第 i 圈的点编号（每圈一样多，首尾相接）
func stitch(rings: Array, closed := true) -> void:
	for i in rings.size() - 1:
		var a: Array = rings[i]
		var b: Array = rings[i + 1]
		var n := a.size()
		var m := n if closed else n - 1
		for j in m:
			var j2 := (j + 1) % n
			tri(a[j], b[j], b[j2])
			tri(a[j], b[j2], a[j2])

## 一圈收到一个点（管子的头）
func fan(ring: Array, tip: int, flip := false) -> void:
	var n := ring.size()
	for j in n:
		var j2 := (j + 1) % n
		if flip:
			tri(ring[j], tip, ring[j2])
		else:
			tri(ring[j], ring[j2], tip)

func mesh() -> ArrayMesh:
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = V
	arr[Mesh.ARRAY_NORMAL] = N
	arr[Mesh.ARRAY_COLOR] = CO
	arr[Mesh.ARRAY_BONES] = BI
	arr[Mesh.ARRAY_WEIGHTS] = BW
	arr[Mesh.ARRAY_INDEX] = IX
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m

## 蒙皮用的绑定（每根骨头做模型时的位置的逆）
func skin() -> Skin:
	var s := Skin.new()
	for i in Rig.BONES.size():
		s.add_named_bind(Rig.BONES[i], rest[i].affine_inverse())
	return s

# ---------- 管子 ----------
## 沿一根骨头（frame：骨头的位置朝向，Y 顺着骨头）长一节管子。
##   L：骨头长（米）；t0 ~ t1：从骨头的哪儿长到哪儿（比例，可以超出 0~1）；front：截面「前侧」在骨头坐标里的方向（单位向量，垂直于 Y）
##   prof(t) -> [前侧半宽, 后侧半宽, 左右半宽]（米）；look(t, θ) -> [区域, 明暗, 花纹]；wt(t) -> [[骨头, 权重], …]
##   cap0 / cap1：两头收圆
func tube(frame: Transform3D, L: float, t0: float, t1: float, front: Vector3, prof: Callable, look: Callable, wt: Callable,
		nr := 8, ns := 14, cap0 := true, cap1 := true) -> void:
	var B := frame.basis
	var Y := B.y
	var F := (B * front).normalized()
	var Z := Y.cross(F).normalized()       # 和前侧、骨头都垂直的那一边
	var rings := []
	for i in nr + 1:
		var t := t0 + (t1 - t0) * float(i) / nr
		rings.append(_ring(frame.origin + Y * (t * L), F, Z, Y, prof.call(t), look, wt, t, ns, 0.0))
	stitch(rings)
	if cap0:
		_cap(rings[0], frame.origin + Y * (t0 * L), F, Z, -Y, prof.call(t0), look, wt, t0, ns)
	if cap1:
		_cap(rings[rings.size() - 1], frame.origin + Y * (t1 * L), F, Z, Y, prof.call(t1), look, wt, t1, ns)

func _ring(c: Vector3, F: Vector3, Z: Vector3, Y: Vector3, w: Array, look: Callable, wt: Callable, t: float, ns: int, ny: float) -> Array:
	var ring := []
	var bw: Array = wt.call(t)
	for j in ns:
		var th := TAU * j / ns
		var cs := cos(th)
		var sn := sin(th)
		var wx: float = w[0] if cs >= 0.0 else w[1]
		var p: Vector3 = c + F * (wx * cs) + Z * (float(w[2]) * sn)
		var n: Vector3 = F * (cs / maxf(wx, 1e-4)) + Z * (sn / maxf(float(w[2]), 1e-4)) + Y * ny
		var lk: Array = look.call(t, th)
		ring.append(vert(p, n, lk[0], bw, lk[1], lk[2]))
	return ring

## 管子的圆头：从这一圈往外（out 方向）收成半个椭球
func _cap(ring: Array, c: Vector3, F: Vector3, Z: Vector3, out: Vector3, w: Array, look: Callable, wt: Callable, t: float, ns: int) -> void:
	var rc: float = (minf(w[0], w[1]) + w[2]) * 0.5
	var prev := ring
	var steps := 3
	for k in range(1, steps):
		var ph := PI / 2.0 * k / steps
		var sc := cos(ph)
		var cc := c + out * (sin(ph) * rc)
		var r := []
		var bw: Array = wt.call(t)
		for j in ns:
			var th := TAU * j / ns
			var cs := cos(th)
			var sn := sin(th)
			var wx: float = w[0] if cs >= 0.0 else w[1]
			var p: Vector3 = cc + (F * (wx * cs) + Z * (float(w[2]) * sn)) * sc
			var n: Vector3 = (F * (cs / maxf(wx, 1e-4)) + Z * (sn / maxf(float(w[2]), 1e-4))) * sc + out * (sin(ph) / maxf(rc, 1e-4))
			var lk: Array = look.call(t, th)
			r.append(vert(p, n, lk[0], bw, lk[1], lk[2]))
		if out.dot(F.cross(Z)) >= 0.0:
			stitch([prev, r])
		else:
			stitch([r, prev])
		prev = r
	var lk0: Array = look.call(t, 0.0)
	var tip := vert(c + out * rc, out, lk0[0], wt.call(t), lk0[1], lk0[2])
	fan(prev, tip, out.dot(F.cross(Z)) < 0.0)

## 椭球（头、髋、念珠……）：中心 c，三个半轴（basis 的三列方向 × 半径）
func ellipsoid(c: Vector3, ax: Basis, rx: float, ry: float, rz: float, region: int, bw: Array, shade := 1.0, nlat := 8, nlon := 14,
		keep: Callable = Callable()) -> void:
	var rows := []
	for i in range(1, nlat):
		var v := PI * i / nlat
		var row := []
		for j in nlon:
			var u := TAU * j / nlon
			var d := Vector3(sin(v) * cos(u), cos(v), sin(v) * sin(u))
			var p := c + ax.x * (d.x * rx) + ax.y * (d.y * ry) + ax.z * (d.z * rz)
			var n := ax.x * (d.x / rx) + ax.y * (d.y / ry) + ax.z * (d.z / rz)
			var reg := region
			var sh := shade
			if keep.is_valid():
				var o: Array = keep.call(d)
				reg = o[0]
				sh = o[1]
			row.append(vert(p, n, reg, bw, sh))
		rows.append(row)
	# 上下两个顶点
	var top_reg := region
	var bot_reg := region
	if keep.is_valid():
		top_reg = keep.call(Vector3(0, 1, 0))[0]
		bot_reg = keep.call(Vector3(0, -1, 0))[0]
	var top := vert(c + ax.y * ry, ax.y, top_reg, bw, shade)
	var bot := vert(c - ax.y * ry, -ax.y, bot_reg, bw, shade)
	# 外法线朝外：按 (x, y, z) 的顺序，上面一圈 → 下面一圈
	for i in rows.size() - 1:
		var a: Array = rows[i]
		var b: Array = rows[i + 1]
		for j in nlon:
			var j2 := (j + 1) % nlon
			tri(a[j], a[j2], b[j2])
			tri(a[j], b[j2], b[j])
	var r0: Array = rows[0]
	var r1: Array = rows[rows.size() - 1]
	for j in nlon:
		var j2 := (j + 1) % nlon
		tri(top, r0[j2], r0[j])
		tri(bot, r1[j], r1[j2])

# ---------- 权重 ----------
## 关节附近两根骨头各管一半：t < a 往上一根骨头那边混，t > 1 - b 往下一根混
static func blend(me: int, parent: int, child: int, a := 0.18, b := 0.18) -> Callable:
	return func(t: float) -> Array:
		var o := [[me, 1.0]]
		if parent >= 0 and t < a:
			var u := clampf(t / a, 0.0, 1.0)
			var w := 0.5 * (1.0 - u * u * (3.0 - 2.0 * u))
			o = [[me, 1.0 - w], [parent, w]]
		elif child >= 0 and t > 1.0 - b:
			var u := clampf((t - (1.0 - b)) / b, 0.0, 1.0)
			var w := 0.5 * u * u * (3.0 - 2.0 * u)
			o = [[me, 1.0 - w], [child, w]]
		return o

static func solid(region: int, shade := 1.0) -> Callable:
	return func(_t: float, _th: float) -> Array: return [region, shade, 0.0]

## 轮廓表 → 截面（米）：前侧、后侧、左右（左右 = 前后平均 × k）
func profile(key: String, mul := 1.0, add := 0.0, lat := 0.95) -> Callable:
	return func(t: float) -> Array:
		var tt := clampf(t, 0.0, 1.0)
		var f := (bd.profv(key, tt, 1) * mul + add) * S
		var b := (bd.profv(key, tt, 2) * mul + add) * S
		return [f, b, (f + b) * 0.5 * lat]

# ---------- 整个人 ----------
func build() -> void:
	_torso()
	_neck_head()
	_arms()
	_legs()
	_robe_skirt()
	_sash()
	if of.kind == "seng":
		_beads()

func _bone_len(i: int, a: String, b: String) -> float:
	return (J3[b] - J3[a]).length()

# 躯干：沿脊柱，截面前（胸腹）后（背）不对称；左右宽用「正面对着镜头」那一列，往上收窄一点（3D 里肩关节在躯干边上）
func _torso() -> void:
	var fr: Transform3D = rest[Rig.SPINE]
	var L := bd.torso * S
	var prof := func(t: float) -> Array:
		var f := bd.profv("torso", t, 1)
		var b := bd.profv("torso", t, 2)
		var w := bd.profv("torso", t, 3)
		var k := lerpf(1.0, 0.74, clampf(t / 0.4, 0.0, 1.0))
		# 袍子：比身子胖一点
		return [(f + 1.2) * S, (b + 1.0) * S, (w * k + 1.0) * S]
	var look := func(t: float, th: float) -> Array:
		# 交领（右衽）：胸前一道斜的镶边，从左肩（远侧）斜到右腰（近侧）；领口里露一道里衣
		var cs := cos(th)
		var sn := sin(th)
		if cs > 0.15:
			var zz := sn                         # 左右（-1 远侧 ~ 1 近侧）
			var line := lerpf(-0.55, 0.62, clampf((0.95 - t) / 0.75, 0.0, 1.0))
			var d := zz - line
			if t > 0.2 and absf(d) < 0.14:
				return [Outfit.R.TRIM, 1.0, 0.0]
			if t > 0.55 and d > 0.14 and d < 0.3 and zz < 0.5:
				return [Outfit.R.INNER, 1.0, 0.0]
		return [Outfit.R.ROBE, 0.92 + 0.08 * clampf(t, 0.0, 1.0), of.pattern]
	var wt := func(t: float) -> Array:
		if t < 0.12:
			var u := clampf((t + 0.1) / 0.22, 0.0, 1.0)
			return [[Rig.HIPS, 1.0 - u], [Rig.SPINE, u]]
		if t < 0.5:
			var u := clampf((t - 0.3) / 0.2, 0.0, 1.0)
			return [[Rig.SPINE, 1.0 - u * 0.5], [Rig.CHEST, u * 0.5]]
		if t < 0.8:
			var u := clampf((t - 0.5) / 0.3, 0.0, 1.0)
			return [[Rig.CHEST, 1.0 - u], [Rig.UPPER_CHEST, u]]
		var u2 := clampf((t - 0.9) / 0.15, 0.0, 1.0)
		return [[Rig.UPPER_CHEST, 1.0 - u2 * 0.4], [Rig.NECK, u2 * 0.4]]
	tube(fr, L, -0.14, 1.02, Vector3(1, 0, 0), prof, look, wt, 14, 18, true, true)

func _neck_head() -> void:
	# 脖子
	var nf: Transform3D = rest[Rig.NECK]
	var nl := bd.neck * S
	tube(nf, nl, -0.6, 1.3, Vector3(1, 0, 0), profile("neck", 1.0, 0.0, 1.0), solid(Outfit.R.SKIN), blend(Rig.NECK, Rig.UPPER_CHEST, Rig.HEAD, 0.4, 0.3), 4, 12)
	# 头：椭球，中心在脖子顶往上 0.84 个半径、往前 0.1 个半径（和 2D 版一样）
	var hf: Transform3D = rest[Rig.HEAD]
	var R := bd.head * S
	var c := hf.origin + hf.basis.y * (0.84 * R) + hf.basis.x * (0.1 * R)
	var hb := [[Rig.HEAD, 1.0]]
	var ax := hf.basis
	var bald := of.kind == "seng"
	# 头发（侠）：后脑勺、头顶、耳朵上面包住，额头一道发际线、鬓角往下一点；光头（僧）没有
	var keep := func(d: Vector3) -> Array:
		if not bald and d.y > _hairline(d.x):
			return [Outfit.R.HAIR, 1.0]
		return [Outfit.R.SKIN, 1.0 if d.y > -0.45 else 0.9]
	ellipsoid(c, ax, R * 0.97, R * 1.06, R * 0.86, Outfit.R.SKIN, hb, 1.0, 14, 24, keep)
	# 下巴：脸前下方一点点，脸不那么圆
	ellipsoid(c + ax.x * (R * 0.42) + ax.y * (R * -0.62), ax, R * 0.5, R * 0.42, R * 0.62, Outfit.R.SKIN, hb, 0.94, 6, 12)
	# 眼睛（细长）、剑眉：脸在 +X 那边，侧面看得见，往两边放一点（参考图那种侧脸）
	for s: float in [-1.0, 1.0]:
		var dir := Vector3(0.8, 0.05, s * 0.56).normalized()
		var surf := Vector3(dir.x * R * 0.97, dir.y * R * 1.06, dir.z * R * 0.86)
		var eb := Basis.looking_at(ax * dir, ax.y)       # 眼睛的扁的那一面朝外
		var e: Vector3 = c + ax * surf
		ellipsoid(e, eb, R * 0.17, R * 0.065, R * 0.06, Outfit.R.EYE, hb, 1.0, 4, 10)
		var br: Vector3 = c + ax * (surf * 1.01) + ax.y * (R * 0.22)
		ellipsoid(br, eb.rotated(eb.z, s * 0.18), R * 0.24, R * 0.05, R * 0.06, Outfit.R.HAIR if not bald else Outfit.R.EYE, hb, 1.0, 4, 8)
	# 鼻子
	ellipsoid(c + ax.x * (R * 0.96) + ax.y * (R * -0.16), ax, R * 0.13, R * 0.2, R * 0.1, Outfit.R.SKIN, hb, 0.96, 4, 8)
	# 耳朵
	var ear_k := 1.25 if bald else 1.0
	for s: float in [-1.0, 1.0]:
		ellipsoid(c + ax.z * (s * R * 0.84) + ax.y * (R * -0.1) + ax.x * (R * -0.08), ax, R * 0.11 * ear_k, R * 0.2 * ear_k, R * 0.06, Outfit.R.SKIN, hb, 0.88, 4, 8)
	if bald:
		# 戒疤：头顶六个点
		for i in 6:
			var gx := -0.25 + 0.25 * (i % 3)
			var gz := -0.13 + 0.26 * (i / 3)
			var d := Vector3(gx, 1.0, gz).normalized()
			ellipsoid(c + ax.x * (d.x * R * 0.97) + ax.y * (d.y * R * 1.06) + ax.z * (d.z * R * 0.86), ax, R * 0.06, R * 0.03, R * 0.06, Outfit.R.MOUTH, hb, 1.0, 3, 6)
		return
	# 发髻：头顶偏后一个圆髻 + 一道发带箍着；后脑勺打个结（发带从那儿飘出去，2D 版的头带结）
	var bun := c + ax.y * (R * 1.1) + ax.x * (R * -0.3)
	ellipsoid(bun, ax, R * 0.34, R * 0.3, R * 0.34, Outfit.R.HAIR, hb, 1.0, 6, 12)
	ellipsoid(bun + ax.y * (R * -0.18), ax, R * 0.3, R * 0.09, R * 0.3, Outfit.R.BAND, hb, 1.0, 4, 10)
	ellipsoid(c + ax.x * (-R * 0.95) + ax.y * (R * 0.22), ax, R * 0.16, R * 0.14, R * 0.2, Outfit.R.BAND, hb, 0.9, 4, 8)
	# 披在背后的长发：从后脑勺垂到背上，上面跟着头、下面跟着上背
	var p0 := c + ax.x * (-R * 0.7) + ax.y * (R * 0.1)
	var p1 := c + ax.x * (-R * 1.25) + ax.y * (-R * 2.3)
	var hy := (p1 - p0).normalized()
	var hx := (ax.x - hy * ax.x.dot(hy)).normalized()
	var hframe := Transform3D(Basis(hx, hy, hx.cross(hy)), p0)
	var hp := func(t: float) -> Array:
		var w := R * lerpf(0.62, 0.16, clampf(t, 0.0, 1.0))
		return [w * 0.45, w * 0.45, w]
	var hw := func(t: float) -> Array:
		var u := clampf(t, 0.0, 1.0)
		return [[Rig.HEAD, 1.0 - 0.75 * u], [Rig.UPPER_CHEST, 0.75 * u]]
	tube(hframe, (p1 - p0).length(), 0.0, 1.0, Vector3(1, 0, 0), hp, solid(Outfit.R.HAIR), hw, 6, 10, true, true)

## 头发的边：头上某个方向（单位向量，x 朝脸、y 朝上）y 高过这条线就是头发 —— 后脑勺一直到脖子，前面到额头
static func _hairline(x: float) -> float:
	var pts := [[-1.0, -0.72], [-0.25, -0.62], [0.05, -0.12], [0.32, 0.3], [1.0, 0.42]]
	if x <= pts[0][0]:
		return pts[0][1]
	for i in pts.size() - 1:
		var a: Array = pts[i]
		var b: Array = pts[i + 1]
		if x <= b[0]:
			return lerpf(a[1], b[1], (x - a[0]) / (b[0] - a[0]))
	return pts[pts.size() - 1][1]

func _arms() -> void:
	for side in [["L", Rig.L_SHOULDER, Rig.L_UPPER_ARM, Rig.L_LOWER_ARM, Rig.L_HAND, "shF", "fe", "fh"],
			["R", Rig.R_SHOULDER, Rig.R_UPPER_ARM, Rig.R_LOWER_ARM, Rig.R_HAND, "shB", "be", "bh"]]:
		var ua: Transform3D = rest[side[2]]
		var la: Transform3D = rest[side[3]]
		var hd: Transform3D = rest[side[4]]
		var lu := bd.ua * S
		var ll := bd.fa * S
		# 「前侧」（胳膊弯起来小臂折过去那边）= 身体前方
		var fwd: Vector3 = (ua.basis.inverse() * Vector3(1, 0, 0)).normalized()
		var fwdl: Vector3 = (la.basis.inverse() * Vector3(1, 0, 0)).normalized()
		# 大臂：袖子（比胳膊粗，往肘那边张开），袖口一道镶边
		var flare := 1.55 if of.kind == "xia" else 1.25
		var sleeve := func(t: float) -> Array:
			var f := bd.profv("ua", clampf(t, 0.0, 1.0), 1)
			var b := bd.profv("ua", clampf(t, 0.0, 1.0), 2)
			var k := lerpf(1.3, flare, clampf((t - 0.3) / 0.7, 0.0, 1.0))
			return [(f * k + 0.6) * S, (b * k + 0.6) * S, ((f + b) * 0.5 * k + 0.4) * S]
		var sl_look := func(t: float, _th: float) -> Array:
			if t > 0.9:
				return [Outfit.R.TRIM, 1.0, 0.0]
			return [Outfit.R.ROBE, 0.95, of.pattern]
		tube(ua, lu, -0.12, 1.02, fwd, sleeve, sl_look, blend(side[2], side[1], side[3], 0.25, 0.12), 8, 14)
		# 小臂：护腕（侠）/ 裹着（僧）
		var br_look := func(t: float, th: float) -> Array:
			if of.kind == "seng" and t > 0.15:
				var stripe := fmod(t * 7.0 + th / TAU * 2.0, 1.0)
				return [Outfit.R.BRACER, 0.9 if stripe < 0.18 else 1.0, 0.0]
			return [Outfit.R.BRACER, 1.0, 0.0]
		tube(la, ll, -0.05, 0.9, fwdl, profile("fa", 1.06, 0.3), br_look, blend(side[3], side[2], side[4], 0.2, 0.15), 6, 12)
		# 拳头：圆角方块（顺着小臂方向长 10.4、横着高 9.4、厚 8）
		_fist(hd, side[4])

func _fist(fr: Transform3D, bone: int) -> void:
	var Ln: float = bd.fist.len * S
	var Hh: float = bd.fist.h * S
	var Dd := 8.2 * S
	var bx := fr.basis
	var c := fr.origin
	# 用一个扁一点的椭球 + 指节一道：简易
	ellipsoid(c + bx.y * (Ln * 0.08), bx, Hh * 0.52, Ln * 0.55, Dd * 0.52, Outfit.R.SKIN, [[bone, 1.0]], 1.0, 6, 12)
	ellipsoid(c + bx.y * (Ln * 0.3) + bx.x * (Hh * 0.1), bx, Hh * 0.42, Ln * 0.3, Dd * 0.5, Outfit.R.SKIN, [[bone, 1.0]], 0.95, 5, 10)

func _legs() -> void:
	var pants_k := 1.18 if of.kind == "xia" else 1.24
	for side in [["R", Rig.R_UPPER_LEG, Rig.R_LOWER_LEG, Rig.R_FOOT], ["L", Rig.L_UPPER_LEG, Rig.L_LOWER_LEG, Rig.L_FOOT]]:
		var th_f: Transform3D = rest[side[1]]
		var sh_f: Transform3D = rest[side[2]]
		var ft_f: Transform3D = rest[side[3]]
		var fwd: Vector3 = (th_f.basis.inverse() * Vector3(1, 0, 0)).normalized()
		var fwd2: Vector3 = (sh_f.basis.inverse() * Vector3(1, 0, 0)).normalized()
		tube(th_f, bd.th * S, -0.08, 1.02, fwd, profile("th", pants_k, 0.4), solid(Outfit.R.PANTS, 0.95), blend(side[1], Rig.HIPS, side[2], 0.22, 0.14), 8, 14)
		if of.kind == "seng":
			# 裹腿：小腿下面三分之二一圈一圈缠着（交叉的布条，参考图右边那位）
			var wl := func(t: float, th: float) -> Array:
				if t < 0.3:
					return [Outfit.R.PANTS, 0.95, 0.0]
				var a := fmod(t * 6.0 + th / TAU, 1.0)
				var b := fmod(t * 6.0 - th / TAU + 10.0, 1.0)
				var line := minf(minf(a, 1.0 - a), minf(b, 1.0 - b)) < 0.07
				return [Outfit.R.WRAP, 0.82 if line else 1.0, 0.0]
			var wp := func(t: float) -> Array:
				var tt := clampf(t, 0.0, 1.0)
				var k := pants_k if t < 0.3 else 1.08
				var f := (bd.profv("sh", tt, 1) * k + 0.6) * S
				var b := (bd.profv("sh", tt, 2) * k + 0.6) * S
				return [f, b, (f + b) * 0.5 * 0.95]
			tube(sh_f, bd.sh * S, -0.04, 1.0, fwd2, wp, wl, blend(side[2], side[1], side[3], 0.14, 0.1), 10, 14)
		else:
			# 长靴：小腿下半截是靴筒
			var bl := func(t: float, _th: float) -> Array:
				if t > 0.5:
					return [Outfit.R.SHOE, 1.0 if t < 0.56 or t > 0.6 else 0.8, 0.0]
				return [Outfit.R.PANTS, 0.95, 0.0]
			var bp := func(t: float) -> Array:
				var tt := clampf(t, 0.0, 1.0)
				var k := pants_k if t < 0.5 else 1.12
				var f := (bd.profv("sh", tt, 1) * k + 0.5) * S
				var b := (bd.profv("sh", tt, 2) * k + 0.5) * S
				return [f, b, (f + b) * 0.5 * 0.95]
			tube(sh_f, bd.sh * S, -0.04, 1.0, fwd2, bp, bl, blend(side[2], side[1], side[3], 0.14, 0.1), 10, 14)
		_shoe(ft_f, side[3], side[2])

## 鞋：照 2D 版鞋的侧面轮廓（脚跟圆、鞋口盖住脚踝、鞋头圆）沿着脚尖方向一截一截放样，宽 foot.w
func _shoe(fr: Transform3D, bone: int, shin: int) -> void:
	var b := fr.basis      # Y 脚尖，Z 鞋面朝上，X 横着
	var o := fr.origin
	var Fo: Dictionary = bd.foot
	var heel: float = Fo.heel
	var toe: float = Fo.toe
	var a := bd.ankle
	var top := a - float(Fo.h)
	var toeH: float = Fo.toeH
	var hw: float = Fo.w / 2.0
	var n := 12
	var rings := []
	var bw := [[bone, 1.0]]
	for i in n + 1:
		var u := float(i) / n
		var x := -heel + (heel + toe) * u
		# 鞋底（往下为正，和 2D 一样）、鞋面
		var y_bot := a + 0.35
		var y_top: float
		if x < 0.0:
			y_top = top + (1.0 - absf(x) / heel) * 0.0
		elif x < 4.0:
			y_top = top + 0.8 * x / 4.0
		else:
			y_top = lerpf(top + 0.8, a - toeH, clampf((x - 4.0) / (toe - 4.0 - 4.0), 0.0, 1.0))
		# 头尾收圆
		var ends := 1.0 - pow(absf(u * 2.0 - 1.0), 6.0)
		var w := hw * (0.82 + 0.18 * sin(u * PI)) * maxf(0.25, sqrt(maxf(ends, 0.0)))
		var hgt := (y_bot - y_top) * maxf(0.3, pow(maxf(ends, 0.0), 0.35))
		var yc := y_bot - hgt * 0.5
		var ring := []
		for j in 12:
			var th := TAU * j / 12
			var cs := cos(th)
			var sn := sin(th)
			# 截面：上面圆、底下平一点
			var yy := yc - sn * hgt * 0.5 * (1.0 if sn > 0.0 else 0.85)
			var xx := cs * w
			var p := o + b.y * (x * S) + b.x * (xx * S) - b.z * (yy * S)
			var nn := b.x * cs + b.z * sn
			var bl := bw if x > -2.0 else [[bone, 0.7], [shin, 0.3]]
			ring.append(vert(p, nn, Outfit.R.SHOE, bl, 1.0 if sn > -0.3 else 0.7))
		rings.append(ring)
	stitch(rings)
	# 两头封上
	var c0 := vert(o + b.y * (-heel * S) - b.z * ((a - 2.0) * S), -b.y, Outfit.R.SHOE, bw)
	var c1 := vert(o + b.y * (toe * S) - b.z * ((a - toeH * 0.4) * S), b.y, Outfit.R.SHOE, bw)
	fan(rings[0], c0, true)
	fan(rings[rings.size() - 1], c1, false)

## 袍子下摆：腰带往下到大腿中间（侠长一点到膝盖上面），前后两片（近侧一片跟着前腿、远侧一片跟着后腿，中间开衩），
## 上面跟着髋，越往下越跟着腿
func _robe_skirt() -> void:
	var hip: Vector3 = J3.hip
	var top_y := hip.y + (bd.belt_at * bd.torso) * S
	var hem := (46.0 if of.kind == "xia" else 40.0) * S
	var bot_y := hip.y - hem
	var nr := 7
	for panel in [[Rig.R_UPPER_LEG, 1.0], [Rig.L_UPPER_LEG, -1.0]]:
		var leg: int = panel[0]
		var zs: float = panel[1]
		var rings := []
		var cols := 13
		for i in nr + 1:
			var u := float(i) / nr
			var y := lerpf(top_y, bot_y, u)
			# 截面：腰那儿贴着身子，往下张开一点
			var rx := lerpf(9.6, 13.5, u) * S
			var rz := lerpf(11.0, 15.5, u) * S + (0.25 * S if zs > 0.0 else 0.0)
			var row := []
			var w_leg := clampf(u * 0.85, 0.0, 0.75)
			for j in cols:
				# 这一片：从后面（-x）绕过这一侧到前面（+x），首尾多搭一点（站着不露缝）
				var a := lerpf(-PI * 0.56, PI * 0.56, float(j) / (cols - 1))
				var dz := cos(a) * zs
				var dx := sin(a)
				var p := Vector3(hip.x + dx * rx, y, hip.z + dz * rz)
				var nn := Vector3(dx / rx, 0.15, dz / rz)
				var hem_trim := u > 0.86
				var edge := j == 0 or j == cols - 1
				var reg := Outfit.R.TRIM if (hem_trim or edge) else Outfit.R.ROBE
				row.append(vert(p, nn, reg, [[Rig.HIPS, 1.0 - w_leg], [leg, w_leg]], 0.9 - 0.15 * u, of.pattern))
			rings.append(row)
		# 外面朝外：上一圈 → 下一圈
		for i in nr:
			var ra: Array = rings[i]
			var rb: Array = rings[i + 1]
			for j in cols - 1:
				if zs > 0.0:
					tri(ra[j], ra[j + 1], rb[j + 1])
					tri(ra[j], rb[j + 1], rb[j])
				else:
					tri(ra[j], rb[j + 1], ra[j + 1])
					tri(ra[j], rb[j], rb[j + 1])
		# 背面（里子）：同一片再来一遍、法线朝里、暗一点 —— 抬腿时看得到里面
		var base := V.size()
		for i in nr + 1:
			for j in cols:
				var k: int = rings[i][j]
				vert(V[k], -N[k], Outfit.R.ROBE_DARK, [[BI[k * 4], BW[k * 4]], [BI[k * 4 + 1], BW[k * 4 + 1]]], 0.7)
		for i in nr:
			for j in cols - 1:
				var a0 := base + i * cols + j
				var b0 := base + (i + 1) * cols + j
				if zs > 0.0:
					tri(a0, b0 + 1, a0 + 1)
					tri(a0, b0, b0 + 1)
				else:
					tri(a0, a0 + 1, b0 + 1)
					tri(a0, b0 + 1, b0)

## 腰带：一圈箍在腰上，比袍子宽一点；近侧前面垂两条带子
func _sash() -> void:
	var fr: Transform3D = rest[Rig.SPINE]
	var L := bd.torso * S
	var t0 := bd.belt_at - bd.belt_h / 2.0 / bd.torso
	var t1 := bd.belt_at + bd.belt_h / 2.0 / bd.torso
	var prof := func(t: float) -> Array:
		var f := bd.profv("torso", t, 1)
		var b := bd.profv("torso", t, 2)
		var w := bd.profv("torso", t, 3)
		var k := lerpf(1.0, 0.74, clampf(t / 0.4, 0.0, 1.0))
		return [(f + 2.2) * S, (b + 2.0) * S, (w * k + 2.0) * S]
	var wt := func(t: float) -> Array:
		var u := clampf((t + 0.1) / 0.22, 0.0, 1.0)
		return [[Rig.HIPS, 1.0 - u], [Rig.SPINE, u]]
	tube(fr, L, t0, t1, Vector3(1, 0, 0), prof, solid(Outfit.R.SASH), wt, 2, 18, false, false)
	# 垂下来的两条
	var hip: Vector3 = J3.hip
	var y0 := hip.y + bd.belt_at * bd.torso * S
	for k in 2:
		var z0 := hip.z + (6.5 + k * 3.2) * S
		var x0 := hip.x + 8.5 * S
		var rows := []
		for i in 6:
			var u := float(i) / 5
			var y := y0 - u * (20.0 - k * 4.0) * S
			var x := x0 + u * 1.5 * S
			var w := 1.6 * S
			var row := [vert(Vector3(x, y, z0 - w), Vector3(1, 0, 0), Outfit.R.SASH, [[Rig.HIPS, 1.0 - u * 0.4], [Rig.R_UPPER_LEG, u * 0.4]], 0.95),
				vert(Vector3(x, y, z0 + w), Vector3(1, 0, 0), Outfit.R.SASH, [[Rig.HIPS, 1.0 - u * 0.4], [Rig.R_UPPER_LEG, u * 0.4]], 0.95)]
			rows.append(row)
		for i in 5:
			tri(rows[i][0], rows[i + 1][0], rows[i + 1][1])
			tri(rows[i][0], rows[i + 1][1], rows[i][1])
			tri(rows[i][0], rows[i + 1][1], rows[i + 1][0])
			tri(rows[i][0], rows[i][1], rows[i + 1][1])

## 念珠（僧）：一大串挂在脖子上，前面垂到胸口
func _beads() -> void:
	var fr: Transform3D = rest[Rig.UPPER_CHEST]
	var c := fr.origin
	var b := fr.basis
	var n := 26
	for i in n:
		var a := TAU * i / n
		# 后面在脖子根，前面垂到胸口：椭圆，前低后高
		var fx := cos(a)
		var fz := sin(a)
		var drop := maxf(0.0, fx) * 13.0
		var p := c + b.x * (fx * 9.5 * S + 1.0 * S) + b.z * (fz * 11.0 * S) + b.y * ((7.0 - drop) * S)
		var r := (2.3 if i != 0 else 3.4) * S
		ellipsoid(p, b, r, r, r, Outfit.R.BEADS, [[Rig.UPPER_CHEST, 1.0]], 1.0, 4, 6)
