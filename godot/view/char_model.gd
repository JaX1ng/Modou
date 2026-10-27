class_name CharModel
extends RefCounted
## AI 生成的正式人物模型（Meshy 出的 GLB：Mixamo 骨骼名、一张贴图）接到游戏的骨骼上。
## 动作还是 FighterAnim / Rig 算的那一套（44 招一个不丢、手感不变），模型的每根骨头跟着 Rig 的一根骨头走（MAP）：
##   1. 模型静止时（A 字站姿）每根骨头在哪：从蒙皮（Skin）里读出来；
##   2. 按 Rig 的规矩，算出「这个站姿下 Rig 的骨头该是什么样」（ref：脊柱顺着髋 → 两肩中间，胳膊腿顺着关节，Z 朝身体右边……）；
##   3. 记下模型骨头相对它的偏差 C = ref⁻¹ · 模型骨头；以后每一帧：模型骨头 = Rig 骨头 · C。
## 模型自己的身材（骨头多长、肩多宽、脚踝多高）量出来做成一个 BodyDef 交给 FighterAnim：动作按模型的身材算 IK，拳脚够得着、脚踩在地上。
## 胳膊腿再顺着骨头伸缩一点点（左右两边骨头长短不一样），正好接上下一节。
## 骨骼是「平的」（每根骨头都没有爸爸）：每根骨头的姿势直接就是它在人物坐标里的位置朝向，伸缩不会传给下一节。
## 换模型（以后出新人物）：tools/import_char.py 拆好 GLB 和贴图，在 MODELS / LOOKS 里加一行。

const S := Rig.S
## 哪个人物、哪身颜色用哪个模型（别的颜色还是代码做的简易模型）
const LOOKS := {"xia": {"ink": "xia"}}
## scene：只有网格 + 蒙皮的 GLB；tex：贴图（%s：网页版 web（长宽各一半）、桌面版 desk（原大））；scale：放大多少（和简易模型一样大：腿长、胳膊长对上）；
## wrist：拳心在手腕往前多远（米，模型原大）；curl：握拳时三节握拳骨各弯多少度（模型站姿里手指本来就半弯着的，弯得少一点）
## 侠（3.0.0-alpha.4 起）：Jack 用 Meshy 出的长袍侠，没绑骨，Claude 绑的（做法见 GODOT.md「正式人物模型」）
const MODELS := {
	"xia": {"scene": "res://assets/chars/xia/xia.glb", "tex": "res://assets/chars/xia/xia_albedo_%s.jpg", "scale": 1.04, "wrist": 0.045, "curl": [55.0, 70.0, 55.0]},
}
## 模型骨头（去掉 mixamorig_ 前缀）→ 跟着 Rig 的哪根骨头。髋跟着脊柱：整个骨盆随上身前倾，弯在腿根（模型的裙摆挂在髋上）
const MAP := {
	"Hips": Rig.SPINE, "Spine": Rig.SPINE, "Spine1": Rig.CHEST, "Spine2": Rig.UPPER_CHEST, "Neck": Rig.NECK, "Head": Rig.HEAD, "headfront": Rig.HEAD,
	"LeftShoulder": Rig.L_SHOULDER, "LeftArm": Rig.L_UPPER_ARM, "LeftForeArm": Rig.L_LOWER_ARM, "LeftHand": Rig.L_HAND,
	"RightShoulder": Rig.R_SHOULDER, "RightArm": Rig.R_UPPER_ARM, "RightForeArm": Rig.R_LOWER_ARM, "RightHand": Rig.R_HAND,
	"LeftUpLeg": Rig.L_UPPER_LEG, "LeftLeg": Rig.L_LOWER_LEG, "LeftFoot": Rig.L_FOOT, "LeftToeBase": Rig.L_FOOT,
	"RightUpLeg": Rig.R_UPPER_LEG, "RightLeg": Rig.R_LOWER_LEG, "RightFoot": Rig.R_FOOT, "RightToeBase": Rig.R_FOOT,
}
## 顺着骨头伸缩：模型骨头 → [Rig 的这根骨头的原点, 到那根的原点, 减掉拳心那一截吗]、模型里这根骨头的下一节是谁
const STRETCH := {
	"LeftArm": [Rig.L_UPPER_ARM, Rig.L_LOWER_ARM, false, "LeftForeArm"], "LeftForeArm": [Rig.L_LOWER_ARM, Rig.L_HAND, true, "LeftHand"],
	"RightArm": [Rig.R_UPPER_ARM, Rig.R_LOWER_ARM, false, "RightForeArm"], "RightForeArm": [Rig.R_LOWER_ARM, Rig.R_HAND, true, "RightHand"],
	"LeftUpLeg": [Rig.L_UPPER_LEG, Rig.L_LOWER_LEG, false, "LeftLeg"], "LeftLeg": [Rig.L_LOWER_LEG, Rig.L_FOOT, false, "LeftFoot"],
	"RightUpLeg": [Rig.R_UPPER_LEG, Rig.R_LOWER_LEG, false, "RightLeg"], "RightLeg": [Rig.R_LOWER_LEG, Rig.R_FOOT, false, "RightFoot"],
}
## 握拳骨（tools/import_char.py 加的，手指卷成拳头）：挂在谁下面、第几节（弯多少看 MODELS 的 curl，绕自己的 +Z 转 = 往手心弯）
const FIST := {
	"LeftFist1": ["LeftHand", 0], "LeftFist2": ["LeftFist1", 1], "LeftFist3": ["LeftFist2", 2],
	"RightFist1": ["RightHand", 0], "RightFist2": ["RightFist1", 1], "RightFist3": ["RightFist2", 2],
}
const CURL_DEFAULT := [80.0, 95.0, 70.0]

## 一个模型量好的东西（两边用同一个模型时共用）
class Proto:
	var key := ""
	var mesh: Mesh
	var skin: Skin
	var tex: Texture2D
	var names := PackedStringArray()   # 每个 bind 的骨头名（平的骨骼照这个顺序建）
	var rig := PackedInt32Array()      # 每个 bind 跟着 Rig 的哪根骨头
	var C: Array = []                  # 每个 bind：相对那根 Rig 骨头（Transform3D，带着模型的缩放）
	var rest: Array = []               # 每个 bind：站姿时在人物坐标里的样子
	var scl := PackedFloat32Array()    # 每个 bind：骨头自己的缩放（GLB 里是厘米 → 米，再放大）
	var st: Array = []                 # 每个 bind：伸缩 [from, to, 减掉多少（米）, 模型里原长（米）]，不伸缩是 null
	var par := PackedInt32Array()      # 每个 bind：挂在哪个 bind 下面（握拳骨），-1 = 跟着 Rig
	var K: Array = []                  # 挂着的骨头：静止时相对爸爸在哪（Transform3D）
	var curl := PackedFloat32Array()   # 挂着的骨头：握紧时弯多少（弧度，绕自己的 +Z）
	var hand := PackedInt32Array()     # 挂着的骨头：是哪只手（0 前手 = 左手，1 后手 = 右手）
	var bd: BodyDef
	var wrist := 0.0                   # 拳心在手腕往前多远（米，放大以后）

static var _cache := {}

## 这身打扮用哪个模型（"" = 用代码做的简易模型）
static func for_look(kind: String, look_id: String) -> String:
	var m: Dictionary = LOOKS.get(kind, {})
	return m.get(look_id, "")

static func proto(key: String) -> Proto:
	if _cache.has(key):
		return _cache[key]
	var info: Dictionary = MODELS[key]
	var p := Proto.new()
	p.key = key
	var sc: PackedScene = load(info.scene)
	var root := sc.instantiate()
	var mi := _find_mesh(root)
	p.mesh = mi.mesh
	p.skin = mi.skin
	root.free()
	p.tex = load(String(info.tex) % ("web" if OS.has_feature("web") else "desk"))
	_measure(p, float(info.scale), float(info.wrist), info.get("curl", CURL_DEFAULT))
	_cache[key] = p
	return p

static func _find_mesh(n: Node) -> MeshInstance3D:
	if n is MeshInstance3D and (n as MeshInstance3D).skin != null:
		return n
	for c in n.get_children():
		var r := _find_mesh(c)
		if r != null:
			return r
	return null

static func _short(nm: String) -> String:
	return nm.trim_prefix("mixamorig_").trim_prefix("mixamorig:")

## 量身材、算 C
static func _measure(p: Proto, k: float, wrist: float, curl: Array) -> void:
	var B := {}
	for i in p.skin.get_bind_count():
		var nm := String(p.skin.get_bind_name(i))
		p.names.append(nm)
		B[_short(nm)] = p.skin.get_bind_pose(i).affine_inverse()
	# W：模型坐标（米，朝 +Z、+X 是左手边）→ 人物坐标（朝 +X、Y 往上、Z 往镜头 = 右手边），放大 k，两个大腿根中间放在原点
	var hip_m: Vector3 = ((B.LeftUpLeg as Transform3D).origin + (B.RightUpLeg as Transform3D).origin) * 0.5
	var W := Transform3D(Basis(Vector3(0, 1, 0), PI * 0.5).scaled(Vector3(k, k, k)), Vector3.ZERO)
	W.origin = -(W.basis * hip_m)
	var J := {}
	for nm in B:
		J[nm] = W * (B[nm] as Transform3D).origin
	var sole := W * Vector3(hip_m.x, 0.0, hip_m.z)       # 模型的脚底（y = 0）
	p.wrist = wrist * k
	# ---- Rig 在这个站姿下的样子（规矩照 Rig.frames）----
	var hip: Vector3 = (J.LeftUpLeg + J.RightUpLeg) * 0.5
	var shm: Vector3 = (J.LeftArm + J.RightArm) * 0.5
	var sd := Vector3(shm.x - hip.x, shm.y - hip.y, 0.0).normalized()
	var tor := atan2(sd.x, sd.y)
	var spine := Basis(Vector3(cos(tor), -sin(tor), 0), Vector3(sin(tor), cos(tor), 0), Vector3(0, 0, 1))
	var shoulder_len: float = (shm - hip).dot(spine.y)
	var torso_len: float = (J.Neck - hip).dot(spine.y)
	var neck_pt: Vector3 = hip + spine.y * torso_len
	# 头、脖子：模型站姿里脸朝正前方 = Rig 里头摆正（hd = 0）。脖子关节本身往后斜一点，不算
	var hb := Basis.IDENTITY
	var neck_len: float = (J.Head - J.Neck).length()
	var shc: Vector3 = hip + spine.y * shoulder_len
	var Z := Vector3(0, 0, 1)
	var ref := []
	ref.resize(Rig.BONES.size())
	ref[Rig.HIPS] = Transform3D(Basis.IDENTITY, hip)
	ref[Rig.SPINE] = Transform3D(spine, hip)
	ref[Rig.CHEST] = Transform3D(spine, hip.lerp(neck_pt, 0.45))
	ref[Rig.UPPER_CHEST] = Transform3D(spine, hip.lerp(neck_pt, 0.78))
	ref[Rig.NECK] = Transform3D(hb, neck_pt)
	ref[Rig.HEAD] = Transform3D(hb, neck_pt + hb.y * neck_len)
	ref[Rig.L_SHOULDER] = Rig._along(shc, J.LeftArm, spine.y)
	ref[Rig.R_SHOULDER] = Rig._along(shc, J.RightArm, spine.y)
	for side in ["Left", "Right"]:
		var L: bool = side == "Left"
		var sh: Vector3 = J[side + "Arm"]
		var el: Vector3 = J[side + "ForeArm"]
		var wr: Vector3 = J[side + "Hand"]
		var fist: Vector3 = wr + (wr - el).normalized() * p.wrist
		ref[Rig.L_UPPER_ARM if L else Rig.R_UPPER_ARM] = Rig._along(sh, el, Z)
		ref[Rig.L_LOWER_ARM if L else Rig.R_LOWER_ARM] = Rig._along(el, fist, Z)
		ref[Rig.L_HAND if L else Rig.R_HAND] = Rig._along(fist, fist + (fist - el), Z)
		# 腿：站姿里腿几乎是直的，弯的方向看不出来 —— 直接用身体的左右方向（Rig 里腿弯起来时 Z 也是朝这边）
		ref[Rig.L_UPPER_LEG if L else Rig.R_UPPER_LEG] = Rig._along(J[side + "UpLeg"], J[side + "Leg"], Z)
		ref[Rig.L_LOWER_LEG if L else Rig.R_LOWER_LEG] = Rig._along(J[side + "Leg"], J[side + "Foot"], Z)
		# 脚：脚底放平、脚尖朝前（Rig._foot：Y 指脚尖、Z 朝鞋面上方）
		ref[Rig.L_FOOT if L else Rig.R_FOOT] = Transform3D(Basis(Vector3(0, 0, 1), Vector3(1, 0, 0), Vector3(0, 1, 0)), J[side + "Foot"])
	# ---- 每根模型骨头相对它跟着的那根 Rig 骨头（握拳骨：相对它爸爸）----
	var bi := {}
	for i in p.names.size():
		bi[_short(p.names[i])] = i
	for i in p.names.size():
		var nm := _short(p.names[i])
		var ri: int = MAP.get(nm, Rig.SPINE)
		var G: Transform3D = W * (B[nm] as Transform3D)
		p.rig.append(ri)
		p.rest.append(G)
		p.C.append((ref[ri] as Transform3D).affine_inverse() * G)
		p.scl.append(G.basis.get_scale().x)
		var fz = FIST.get(nm)
		if fz != null and bi.has(fz[0]):
			p.par.append(bi[fz[0]])
			var rel: Transform3D = (B[fz[0]] as Transform3D).affine_inverse() * (B[nm] as Transform3D)
			p.K.append(rel)
			p.curl.append(deg_to_rad(float(curl[fz[1]])))
			p.hand.append(0 if nm.begins_with("Left") else 1)
		else:
			p.par.append(-1)
			p.K.append(Transform3D.IDENTITY)
			p.curl.append(0.0)
			p.hand.append(0)
		var s = STRETCH.get(nm)
		if s != null:
			var L0: float = (J[s[3]] - J[nm]).length()
			p.st.append([s[0], s[1], p.wrist if s[2] else 0.0, L0])
		else:
			p.st.append(null)
	# ---- 身材（逻辑像素）----
	var px := 1.0 / S
	var bd := BodyDef.new()
	bd.torso = torso_len * px
	bd.shoulder = shoulder_len * px
	bd.neck = neck_len * px
	bd.shoulderW = absf(J.LeftArm.z - J.RightArm.z) * 0.5 * px
	bd.hipW = absf(J.LeftUpLeg.z - J.RightUpLeg.z) * 0.5 * px
	bd.hipSplit = 0.0          # 两个大腿根不前后错开（模型的骨盆是正的）
	bd.ua = ((J.LeftForeArm - J.LeftArm).length() + (J.RightForeArm - J.RightArm).length()) * 0.5 * px
	bd.wrist = p.wrist * px
	bd.fa = ((J.LeftHand - J.LeftForeArm).length() + (J.RightHand - J.RightForeArm).length()) * 0.5 * px + bd.wrist
	bd.th = ((J.LeftLeg - J.LeftUpLeg).length() + (J.RightLeg - J.RightUpLeg).length()) * 0.5 * px
	bd.sh = ((J.LeftFoot - J.LeftLeg).length() + (J.RightFoot - J.RightLeg).length()) * 0.5 * px
	bd.ankle = ((J.LeftFoot.y + J.RightFoot.y) * 0.5 - sole.y) * px
	_measure_mesh(p, bd, W, J, sole)
	p.bd = bd

## 头多大、鞋多长：从网格上量（每个顶点算它主要跟着哪根骨头）
static func _measure_mesh(p: Proto, bd: BodyDef, W: Transform3D, J: Dictionary, sole: Vector3) -> void:
	var arr := p.mesh.surface_get_arrays(0)
	var V: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var BI: PackedInt32Array = arr[Mesh.ARRAY_BONES]
	var BW: PackedFloat32Array = arr[Mesh.ARRAY_WEIGHTS]
	var per := BI.size() / V.size()
	var idx := {}
	for i in p.names.size():
		idx[_short(p.names[i])] = i
	var head_i: int = idx.get("Head", -1)
	var feet := {}
	var toes := {}
	for nm in ["LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"]:
		if idx.has(nm):
			feet[idx[nm]] = "Left" if nm.begins_with("Left") else "Right"
			if nm.ends_with("ToeBase"):
				toes[idx[nm]] = true
	var hz0 := 1e9
	var hz1 := -1e9
	var heel := 0.0
	var toe := 0.0
	var toeH := 0.0
	var fw0 := {"Left": 1e9, "Right": 1e9}
	var fw1 := {"Left": -1e9, "Right": -1e9}
	for v in V.size():
		var best := 0
		var bw := -1.0
		for j in per:
			var w := BW[v * per + j]
			if w > bw:
				bw = w
				best = BI[v * per + j]
		if best != head_i and not feet.has(best):
			continue
		var q := W * V[v]
		if best == head_i:
			hz0 = minf(hz0, q.z)
			hz1 = maxf(hz1, q.z)
		else:
			var side: String = feet[best]
			var an: Vector3 = J[side + "Foot"]
			heel = maxf(heel, an.x - q.x)
			toe = maxf(toe, q.x - an.x)
			fw0[side] = minf(fw0[side], q.z)
			fw1[side] = maxf(fw1[side], q.z)
			if toes.has(best):
				toeH = maxf(toeH, q.y - sole.y)
	var px := 1.0 / S
	# 头：左右宽的一半再大一点（前后比左右长）
	if hz1 > hz0:
		bd.head = (hz1 - hz0) * 0.5 * 1.1 * px
	var fd: Dictionary = bd.foot.duplicate()
	if toe > 0.0:
		fd.heel = heel * px
		fd.toe = toe * px
		fd.w = ((fw1.Left - fw0.Left) + (fw1.Right - fw0.Right)) * 0.5 * px
		fd.h = bd.ankle + 2.5
		fd.toeH = clampf(toeH * px, 3.0, bd.ankle)
	bd.foot = fd

## 这一帧：Rig 算出来的每根骨头（Rig.frames 的结果，人物坐标）→ 模型骨骼（平的）。
## open：[前手, 后手] 张开多少（0 = 握拳，1 = 张开：掌、推、抓）
static var _G: Array = []

static func apply(p: Proto, sk: Skeleton3D, fr: Array, open: Array = [0.0, 0.0]) -> void:
	_G.resize(p.names.size())
	for i in p.names.size():
		var G: Transform3D
		if p.par[i] >= 0:
			var a: float = p.curl[i] * (1.0 - float(open[p.hand[i]]))
			G = (_G[p.par[i]] as Transform3D) * (p.K[i] as Transform3D) * Transform3D(Basis(Vector3(0, 0, 1), a), Vector3.ZERO)
		else:
			G = (fr[p.rig[i]] as Transform3D) * (p.C[i] as Transform3D)
		_G[i] = G
		var s := 1.0
		var st = p.st[i]
		if st != null:
			var a: Vector3 = (fr[st[0]] as Transform3D).origin
			var b: Vector3 = (fr[st[1]] as Transform3D).origin
			s = clampf(((b - a).length() - float(st[2])) / float(st[3]), 0.75, 1.35)
		var sc: float = p.scl[i]
		sk.set_bone_pose_position(i, G.origin)
		sk.set_bone_pose_rotation(i, G.basis.get_rotation_quaternion())
		sk.set_bone_pose_scale(i, Vector3(sc, sc * s, sc))

## 建一副平的骨骼（每根骨头都没有爸爸），静止姿势 = 模型的站姿（人物坐标）
static func make_skeleton(p: Proto) -> Skeleton3D:
	var sk := Skeleton3D.new()
	for i in p.names.size():
		sk.add_bone(p.names[i])
		sk.set_bone_rest(i, p.rest[i])
	sk.reset_bone_poses()
	return sk
