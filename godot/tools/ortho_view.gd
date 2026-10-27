extends SceneTree
## 正交拍一个 GLB（绑骨前量关节、看权重用；不进游戏）：模型原样、不打光（unshaded），图上 1 米 = 图高 / 高度 个像素。
## 用法：xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 1000x1000 -s tools/ortho_view.gd -- 模型.glb 输出.png 方向 中心x 中心y 中心z 高度 [vcol]
##   方向：front（相机在 +Z，看模型正面）、left（相机在 +X，看模型的左边）、back、right；vcol = 用顶点颜色（rig_char.py wviz 出的）
## 网格、关节用 tools/rig_char.py overlay 画上去
func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	if doc.append_from_file(a[0], st) != OK:
		print("读不了 ", a[0])
		quit(1)
		return
	var scn: Node3D = doc.generate_scene(st)
	root.add_child(scn)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color("#d8d4cc")
	env.environment = e
	root.add_child(env)
	_mats(scn, a.size() > 7 and a[7] == "vcol")
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = float(a[6])
	cam.near = 0.01
	cam.far = 100.0
	root.add_child(cam)
	var c := Vector3(float(a[3]), float(a[4]), float(a[5]))
	var d: Vector3 = {"front": Vector3(0, 0, 10), "back": Vector3(0, 0, -10), "left": Vector3(10, 0, 0), "right": Vector3(-10, 0, 0)}[a[2]]
	cam.look_at_from_position(c + d, c)
	for i in 3:
		await process_frame
	root.get_texture().get_image().save_png(a[1])
	quit()

func _mats(n: Node, vcol: bool) -> void:
	if n is MeshInstance3D:
		var m := n as MeshInstance3D
		if vcol:
			var sm := StandardMaterial3D.new()
			sm.vertex_color_use_as_albedo = true
			sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			sm.cull_mode = BaseMaterial3D.CULL_DISABLED
			m.material_override = sm
		else:
			for s in m.mesh.get_surface_count():
				var mat = m.get_active_material(s)
				if mat is BaseMaterial3D:
					(mat as BaseMaterial3D).shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for ch in n.get_children():
		_mats(ch, vcol)
