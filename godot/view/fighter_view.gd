class_name FighterView
extends Node3D
## 场上的一个人（画面）：骨骼 + 模型 + 发带。每一帧照 FighterAnim（两步之间按 RA 插值）摆骨骼。
## 朝左时整个人 x 缩放 -1（镜像：和 2D 版一样，近侧永远是后手、前腿）。

const S := Rig.S
const FIGHTER_SHADER := preload("res://view/shaders/fighter.gdshader")
const OUTLINE_SHADER := preload("res://view/shaders/fighter_outline.gdshader")
const REFLECT_SHADER := preload("res://view/shaders/fighter_reflect.gdshader")
const RIBBON_W := 4.0       # 发带画多宽（逻辑像素，和 2D 版一样）

var F: Fighter
var anim: FighterAnim
var outfit: Outfit
var skel: Skeleton3D
var body: MeshInstance3D
var shadow_body: MeshInstance3D
var refl_body: MeshInstance3D      # 湿地面里的倒影
var refl_mat: ShaderMaterial
var mat: ShaderMaterial
var line_mat: ShaderMaterial
var ribbon_mesh: ImmediateMesh
var ribbon_node: MeshInstance3D
var ribbon_mat: StandardMaterial3D
var depth := 0.0             # 两个人前后错开一点（不穿插得那么明显）
var reduce_motion := false
var kind := "xia"
var look_id := ""
var _frames: Array = []
var _bone_idx: Array = []

func setup(fighter: Fighter, a: FighterAnim, outfit_kind: String) -> void:
	F = fighter
	anim = a
	kind = outfit_kind
	skel = Skeleton3D.new()
	skel.name = "Skel"
	add_child(skel)
	for i in Rig.BONES.size():
		skel.add_bone(Rig.BONES[i])
	for i in Rig.BONES.size():
		if Rig.PARENT[i] >= 0:
			skel.set_bone_parent(i, Rig.PARENT[i])
	body = MeshInstance3D.new()
	body.name = "Body"
	body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	skel.add_child(body)
	# 影子另用一份（人走透明那一趟，透明的东西不投影）：同一个模型、只投影
	shadow_body = MeshInstance3D.new()
	shadow_body.name = "Shadow"
	shadow_body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
	skel.add_child(shadow_body)
	mat = ShaderMaterial.new()
	mat.shader = FIGHTER_SHADER
	mat.render_priority = 1
	line_mat = ShaderMaterial.new()
	line_mat.shader = OUTLINE_SHADER
	line_mat.render_priority = 1
	mat.next_pass = line_mat
	refl_mat = ShaderMaterial.new()
	refl_mat.shader = REFLECT_SHADER
	refl_mat.render_priority = -1
	# 桌面版（Forward+）同样的灯下人显得暗一点：亮一点（和网页版看上去一样，见 StageView._tune_for_renderer）
	if RenderingServer.get_current_rendering_method() != "gl_compatibility":
		mat.set_shader_parameter("gain", 1.12)
	refl_body = MeshInstance3D.new()
	refl_body.name = "Reflection"
	refl_body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	refl_body.extra_cull_margin = 4.0
	skel.add_child(refl_body)
	# 僧：没有头带，飘的是腰后垂下来的两条（腰带的颜色）
	if kind == "seng":
		anim.rib_anchor = "belt"
		anim.rib_wind = 0.9
		anim.rib_grav = 1.4
		anim.reset()
	set_look(F.look)
	# 发带：画在世界坐标里（不跟着镜像），一条一条的带子
	ribbon_mesh = ImmediateMesh.new()
	ribbon_node = MeshInstance3D.new()
	ribbon_node.mesh = ribbon_mesh
	ribbon_node.top_level = true
	ribbon_mat = StandardMaterial3D.new()
	ribbon_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	ribbon_mat.vertex_color_use_as_albedo = true
	ribbon_mat.vertex_color_is_srgb = true
	ribbon_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ribbon_mat.roughness = 0.9
	ribbon_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS
	ribbon_mat.render_priority = 1
	ribbon_node.material_override = ribbon_mat
	add_child(ribbon_node)

## 换颜色（人物颜色）：只换颜色表；第一次会做模型
func set_look(id: String) -> void:
	if id == look_id and body.mesh != null:
		return
	look_id = id
	outfit = Outfit.make(kind, id)
	if body.mesh == null:
		_build()
	var cols := outfit.colors()
	mat.set_shader_parameter("regions", cols)
	refl_mat.set_shader_parameter("regions", cols)

func _build() -> void:
	var mb := ModelBuilder.new(anim.bd, outfit)
	mb.build()
	# 骨骼的静止姿势 = 做模型时的姿势
	for i in Rig.BONES.size():
		var g: Transform3D = mb.rest[i]
		var p: int = Rig.PARENT[i]
		skel.set_bone_rest(i, g if p < 0 else (mb.rest[p] as Transform3D).affine_inverse() * g)
	skel.reset_bone_poses()
	body.mesh = mb.mesh()
	body.skin = mb.skin()
	body.skeleton = NodePath("..")
	body.material_override = mat
	shadow_body.mesh = body.mesh
	shadow_body.skin = body.skin
	shadow_body.skeleton = NodePath("..")
	refl_body.mesh = body.mesh
	refl_body.skin = body.skin
	refl_body.skeleton = NodePath("..")
	refl_body.material_override = refl_mat
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	shadow_body.material_override = sm

## 这一帧画成什么样：RA = 在上一步和这一步之间走到哪了（0~1）
func update_pose(RA: float) -> void:
	var a := anim
	if a.J.is_empty():
		return
	var P3: Dictionary = a.P3
	var ang: Array = a.ang
	var hipY := a.hipY
	var x := F.x
	var vp: Dictionary = a.vp
	var interp: bool = RA < 1.0 and not vp.is_empty() and vp.facing == F.facing and vp.J.turned == a.J.turned and absf(float(vp.x) - F.x) <= 90.0
	if interp:
		var P := {}
		for k in P3:
			var q: Array = P3[k]
			var o: Array = vp.P3[k]
			P[k] = [lerpf(o[0], q[0], RA), lerpf(o[1], q[1], RA), lerpf(o[2], q[2], RA)]
		P3 = P
		var oa: Array = vp.ang
		ang = [lerpf(oa[0], ang[0], RA), lerpf(oa[1], ang[1], RA), lerpf(oa[2], ang[2], RA),
			oa[3] + wrapf(ang[3] - oa[3], -PI, PI) * RA, oa[4] + wrapf(ang[4] - oa[4], -PI, PI) * RA]
		hipY = lerpf(vp.hipY, hipY, RA)
		x = lerpf(vp.x, F.x, RA)
	var toes := Rig.toe_dirs(a.bd, a.J, P3, hipY)
	var fr := Rig.frames(P3, ang, hipY, toes)
	_frames = fr
	# 骨骼：每根骨头相对爸爸那根
	for i in fr.size():
		var p: int = Rig.PARENT[i]
		var lt: Transform3D = fr[i] if p < 0 else (fr[p] as Transform3D).affine_inverse() * fr[i]
		skel.set_bone_pose_position(i, lt.origin)
		skel.set_bone_pose_rotation(i, lt.basis.get_rotation_quaternion())
	# 挨打时左右抖（和 JS 一样：打中停顿里左右各抖一下，最多 3 像素）
	var shake := 0.0
	if a.hitShake > 0.0 and not reduce_motion:
		shake = (1.0 if int(ceilf(a.hitShake)) % 2 == 1 else -1.0) * minf(3.0, a.hitShake * 0.5)
	position = Vector3((x + shake) * S, 0.0, depth)
	scale = Vector3(float(F.facing), 1.0, 1.0)
	var fl := clampf(a.hitFlash / 3.0, 0.0, 1.0) * 0.85
	mat.set_shader_parameter("flash", fl)
	refl_mat.set_shader_parameter("flash", fl)
	_draw_ribbons(RA, interp)

## 发带（头带两条尾巴）：2D 里模拟的一串点，在人身后一点点画成带子
func _draw_ribbons(RA: float, interp: bool) -> void:
	ribbon_mesh.clear_surfaces()
	var a := anim
	if a.ribbons.is_empty():
		return
	var col := outfit.band if anim.rib_anchor == "knot" else outfit.sash
	var rw := RIBBON_W * 1.25 if anim.rib_anchor == "knot" else RIBBON_W * 2.6
	var zb := depth - 0.02
	ribbon_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for r in a.ribbons.size():
		var pts: Array = a.ribbons[r]
		var prev = a.vp.get("rb", null) if interp else null
		var P := []
		for i in pts.size():
			var x: float = pts[i].x
			var y: float = pts[i].y
			if prev != null and r < prev.size() and i < prev[r].size():
				x = lerpf(prev[r][i][0], x, RA)
				y = lerpf(prev[r][i][1], y, RA)
			P.append(Vector3(x * S, (C.FLOOR - y) * S, zb - r * 0.004))
		for i in P.size() - 1:
			var d: Vector3 = (P[i + 1] - P[i])
			var nrm := Vector3(-d.y, d.x, 0).normalized()
			var w0 := rw * S * 0.5 * (1.0 - 0.55 * float(i) / (P.size() - 1))
			var w1 := rw * S * 0.5 * (1.0 - 0.55 * float(i + 1) / (P.size() - 1))
			var a0: Vector3 = P[i] + nrm * w0
			var b0: Vector3 = P[i] - nrm * w0
			var a1: Vector3 = P[i + 1] + nrm * w1
			var b1: Vector3 = P[i + 1] - nrm * w1
			var c0 := col.darkened(0.08 * r)
			for v in [a0, b0, a1, b0, b1, a1]:
				ribbon_mesh.surface_set_color(c0)
				ribbon_mesh.surface_set_normal(Vector3(0, 0, 1))
				ribbon_mesh.surface_add_vertex(v)
	ribbon_mesh.surface_end()

## 某根骨头这一帧在世界里的位置（特效挂在身上用）
func bone_world(i: int) -> Vector3:
	if _frames.is_empty():
		return global_position
	return global_transform * (_frames[i] as Transform3D).origin
