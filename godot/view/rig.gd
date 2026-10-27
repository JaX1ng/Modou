class_name Rig
extends RefCounted
## 骨骼（3D）：FighterAnim 算出来的关节位置 → 每根骨头的位置和朝向（Godot 人形骨骼的名字，以后换成美术做的模型照名字对上就能用）。
## 坐标：人物自己的坐标（朝 +X、Y 往上、Z 往镜头），单位米；整个人朝左时外面那层节点 x 缩放 -1（镜像，和 2D 版一样近侧还是后手、前腿）。
## 每根骨头的朝向：Y 顺着骨头（从这个关节指向下一个），X、Z 见 frames()。
##
##   Hips ─ Spine ─ Chest ─ UpperChest ─ Neck ─ Head
##                            ├ LeftShoulder ─ LeftUpperArm ─ LeftLowerArm ─ LeftHand      （前手，远侧）
##                            └ RightShoulder ─ RightUpperArm ─ RightLowerArm ─ RightHand  （后手，近侧）
##        ├ LeftUpperLeg ─ LeftLowerLeg ─ LeftFoot     （后腿，远侧）
##        └ RightUpperLeg ─ RightLowerLeg ─ RightFoot  （前腿，近侧）

const S := 0.012          # 1 逻辑像素 = 多少米
const BONES := ["Hips", "Spine", "Chest", "UpperChest", "Neck", "Head",
	"LeftShoulder", "LeftUpperArm", "LeftLowerArm", "LeftHand",
	"RightShoulder", "RightUpperArm", "RightLowerArm", "RightHand",
	"LeftUpperLeg", "LeftLowerLeg", "LeftFoot",
	"RightUpperLeg", "RightLowerLeg", "RightFoot"]
const PARENT := [-1, 0, 1, 2, 3, 4,
	3, 6, 7, 8,
	3, 10, 11, 12,
	0, 14, 15,
	0, 17, 18]
enum { HIPS, SPINE, CHEST, UPPER_CHEST, NECK, HEAD, L_SHOULDER, L_UPPER_ARM, L_LOWER_ARM, L_HAND,
	R_SHOULDER, R_UPPER_ARM, R_LOWER_ARM, R_HAND, L_UPPER_LEG, L_LOWER_LEG, L_FOOT, R_UPPER_LEG, R_LOWER_LEG, R_FOOT }

## FighterAnim 的一个点（身体坐标：朝右、y 往下、像素，相对髋）→ 人物坐标（米，Y 往上，原点在脚下地面）
static func pt(P3: Dictionary, k: String, hipY: float) -> Vector3:
	var v: Array = P3[k]
	return Vector3(v[0] * S, -(hipY + v[1]) * S, v[2] * S)

## 每根骨头在人物坐标里的位置、朝向（Transform3D，按 BONES 的顺序）。
## P3、ang（[前倾 tor, 头 hd, 拧腰 tw, 转身 spin, 翻滚 rot]，弧度）、hipY 来自 FighterAnim；foot = [前脚, 后脚] 脚尖朝哪（toe_dirs 算的）
static func frames(P3: Dictionary, ang: Array, hipY: float, foot: Array) -> Array:
	var tor: float = ang[0]
	var hd: float = ang[1]
	var tw: float = ang[2]
	var sp: float = ang[3]
	var r: float = ang[4]
	# 转身（绕竖轴）、翻滚（在画面平面里转）：身体坐标 → 人物坐标
	var M := Basis(Vector3(0, 0, 1), -r) * Basis(Vector3(0, 1, 0), -sp)
	var p := func(k: String) -> Vector3: return pt(P3, k, hipY)
	var out := []
	out.resize(BONES.size())
	# 髋：不跟着上身前倾（腿根在髋上，前倾的是脊柱）
	out[HIPS] = Transform3D(M, p.call("hip"))
	# 脊柱、胸：X 胸口朝前，Y 顺着脊柱往上，Z 往右（近侧）
	var spine := M * Basis(Vector3(cos(tor), -sin(tor), 0), Vector3(sin(tor), cos(tor), 0), Vector3(0, 0, 1))
	var hip: Vector3 = p.call("hip")
	var neck: Vector3 = p.call("neck")
	var shc: Vector3 = p.call("sh")
	out[SPINE] = Transform3D(spine, hip)
	out[CHEST] = Transform3D(spine, hip.lerp(neck, 0.45))
	# 上胸：拧腰（tw）绕脊柱转，两个肩膀一前一后
	var upper := spine * Basis(Vector3(0, 1, 0), -tw)
	out[UPPER_CHEST] = Transform3D(upper, hip.lerp(neck, 0.78))
	# 脖子、头：跟着头的角度（前倾 + 低头）
	var hb := M * Basis(Vector3(cos(hd), -sin(hd), 0), Vector3(sin(hd), cos(hd), 0), Vector3(0, 0, 1))
	out[NECK] = Transform3D(hb, neck)
	out[HEAD] = Transform3D(hb, p.call("neckTop"))
	# 肩：从脊柱上的肩点指向肩关节，Z 尽量朝上（脊柱方向）
	var up: Vector3 = spine.y
	var bodyZ: Vector3 = M.z
	out[L_SHOULDER] = _along(shc, p.call("shF"), up)
	out[R_SHOULDER] = _along(shc, p.call("shB"), up)
	# 胳膊、腿：Y 顺着骨头，Z 尽量是身体的左右方向（2D 版的胳膊、腿都在一个前后的平面里弯，膝盖往侧面摆的时候才出这个平面）
	out[L_UPPER_ARM] = _along(p.call("shF"), p.call("fe"), bodyZ)
	out[L_LOWER_ARM] = _along(p.call("fe"), p.call("fh"), bodyZ)
	out[L_HAND] = _along(p.call("fh"), p.call("fh") + (p.call("fh") - p.call("fe")), bodyZ)
	out[R_UPPER_ARM] = _along(p.call("shB"), p.call("be"), bodyZ)
	out[R_LOWER_ARM] = _along(p.call("be"), p.call("bh"), bodyZ)
	out[R_HAND] = _along(p.call("bh"), p.call("bh") + (p.call("bh") - p.call("be")), bodyZ)
	out[L_UPPER_LEG] = _along(p.call("hipB"), p.call("bk"), _knee_z(p.call("hipB"), p.call("bk"), p.call("bf"), bodyZ))
	out[L_LOWER_LEG] = _along(p.call("bk"), p.call("bf"), _knee_z(p.call("hipB"), p.call("bk"), p.call("bf"), bodyZ))
	out[R_UPPER_LEG] = _along(p.call("hipF"), p.call("fk"), _knee_z(p.call("hipF"), p.call("fk"), p.call("ff"), bodyZ))
	out[R_LOWER_LEG] = _along(p.call("fk"), p.call("ff"), _knee_z(p.call("hipF"), p.call("fk"), p.call("ff"), bodyZ))
	# 脚：Y 指向脚尖，Z 朝鞋面上方
	out[R_FOOT] = _foot(p.call("ff"), foot[0])
	out[L_FOOT] = _foot(p.call("bf"), foot[1])
	return out

## 骨头从 a 指向 b，Z 尽量朝 zref
static func _along(a: Vector3, b: Vector3, zref: Vector3) -> Transform3D:
	var y := b - a
	if y.length_squared() < 1e-12:
		y = Vector3(0, -1, 0)
	y = y.normalized()
	var z := zref - y * zref.dot(y)
	if z.length_squared() < 1e-8:
		z = Vector3(0, 0, 1) - y * y.z
		if z.length_squared() < 1e-8:
			z = Vector3(1, 0, 0)
	z = z.normalized()
	var x := y.cross(z)
	return Transform3D(Basis(x, y, z), a)

## 腿弯的那个平面的法线（朝身体的左右）：腿伸直了看不出来就用身体的左右方向
static func _knee_z(hip: Vector3, knee: Vector3, ankle: Vector3, bodyZ: Vector3) -> Vector3:
	var n := (knee - hip).cross(ankle - knee)
	if n.length_squared() < 1e-10:
		return bodyZ
	n = n.normalized()
	return n if n.dot(bodyZ) >= 0.0 else -n

## 脚：toe = [脚尖方向, 鞋面朝上的方向]（人物坐标）
static func _foot(ankle: Vector3, toe: Array) -> Transform3D:
	var y: Vector3 = toe[0]
	var z: Vector3 = toe[1] - y * (toe[1] as Vector3).dot(y)
	if z.length_squared() < 1e-8:
		z = Vector3(0, 1, 0)
	z = z.normalized()
	return Transform3D(Basis(y.cross(z), y, z), ankle)

## 两只脚的脚尖朝哪（和 2D 版画鞋一样算：站在地上脚底放平；离了地按小腿的方向绷着；膝盖往侧面摆、转身时脚尖朝镜头 / 背着镜头）。
## 返回 [[前脚尖方向, 前脚鞋面朝上], [后脚…]]，人物坐标
static func toe_dirs(bd: BodyDef, J: Dictionary, P3: Dictionary, hipY: float) -> Array:
	# 用「朝右」那一份算（人物坐标），转过身（turned）时 2D 版的朝向反过来
	var f := -1.0 if J.turned else 1.0
	var Jl := {"rot": J.rot, "spin": J.spin, "fkd": J.fkd, "bkd": J.bkd, "fft": J.fft, "bft": J.bft, "fyaw": J.fyaw, "byaw": J.byaw}
	var out := []
	for key in ["F", "B"]:
		var kn: Array = P3["fk" if key == "F" else "bk"]
		var an: Array = P3["ff" if key == "F" else "bf"]
		# 画面坐标（y 往下）：x 照身体坐标，y 加上髋的高度（地面判断要用）
		var M := [kn[0], C.FLOOR + hipY + kn[1]]
		var E := [an[0], C.FLOOR + hipY + an[1]]
		var d := BodyGeo.footDir(bd, Jl, key, M, E, f)
		var kk: float = minf(1.0, d[4])
		var sp: float = J.spin
		var yaw: float = (float(J.fyaw) if key == "F" else float(J.byaw)) * PI / 180.0
		var zs := 1.0 if key == "F" else -1.0
		var hz := cos(yaw) * sin(sp) + zs * sin(yaw) * cos(sp)
		var toe := Vector3(d[0] * kk, -d[1] * kk, signf(hz) * sqrt(maxf(0.0, 1.0 - kk * kk)))
		if toe.length_squared() < 1e-8:
			toe = Vector3(1, 0, 0)
		# 鞋面朝上 = 朝鞋底的反方向（画面平面里垂直于脚尖）
		var upv := Vector3(-d[2], d[3], 0.0)
		out.append([toe.normalized(), upv])
	return out
