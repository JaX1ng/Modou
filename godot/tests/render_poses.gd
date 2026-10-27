extends SceneTree
## 看模型、骨骼对不对：两个人摆几个姿势，拍几张图（要有显卡 / xvfb，不能 --headless）。
## 用法：xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 960x540 -s tests/render_poses.gd -- 输出目录

class Shooter extends Node3D:
	var out_dir := ""
	func _ready() -> void:
		var env := WorldEnvironment.new()
		var e := Environment.new()
		e.background_mode = Environment.BG_COLOR
		e.background_color = Color("#d9b48a")
		e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
		e.ambient_light_color = Color("#9c8fa8")
		e.ambient_light_energy = 0.55
		env.environment = e
		add_child(env)
		var sun := DirectionalLight3D.new()
		sun.light_color = Color("#ffd7a0")
		sun.light_energy = 1.25
		sun.rotation_degrees = Vector3(-28, 140, 0)
		add_child(sun)
		var fill := DirectionalLight3D.new()
		fill.light_color = Color("#b9c4e0")
		fill.light_energy = 0.35
		fill.rotation_degrees = Vector3(-20, -30, 0)
		add_child(fill)
		var floor_m := MeshInstance3D.new()
		var pm := PlaneMesh.new()
		pm.size = Vector2(40, 20)
		floor_m.mesh = pm
		var fmat := StandardMaterial3D.new()
		fmat.albedo_color = Color("#7d7166")
		fmat.roughness = 0.6
		floor_m.material_override = fmat
		add_child(floor_m)
		var cam := Camera3D.new()
		cam.fov = 26
		add_child(cam)
		var views := []
		var anims := []
		for i in 2:
			var f := Fighter.new(i, "ink" if i == 0 else "ochre", 560.0 + i * 160.0, 1 if i == 0 else -1)
			var a := FighterAnim.new(f)
			var v := FighterView.new()
			v.depth = 0.0 if i == 0 else 0.06
			add_child(v)
			v.setup(f, a, "xia" if i == 0 else "seng")
			views.append(v)
			anims.append(a)
		var shots := [
			["stance", "stance", "stance"], ["run", "run", "block"], ["crouch", "crouch", "cblock"], ["jump", "jtop", "leap"],
			["hurt", "hurtH", "hurtL"], ["lie", "lie", "fall"], ["win", "win", "parry"], ["tuck", "tuck", "thrown"],
		]
		# 招式：kick / heavy / sweep 的打出去那一帧
		var mv := Moves.MOVES
		for nm in ["jab", "heavy", "kick", "sweep", "whirl", "backKick", "upper", "dive"]:
			if mv.has(nm):
				shots.append(["move_" + nm, "@" + nm, "stance"])
		for sh in shots:
			for i in 2:
				var a: FighterAnim = anims[i]
				var key: String = sh[1 + i]
				if key.begins_with("@"):
					var d: MoveDef = mv[key.substr(1)]
					a.disp.copy_from(Pose.evalKeys(d.keys, d.S + d.A * 0.5))
				else:
					a.disp.copy_from(Pose.POSE[key])
				a.J = {}
				a.fk()
				views[i].update_pose(1.0)
			# 镜头：两人中间，人高的位置
			var cx: float = (anims[0].F.x + anims[1].F.x) * 0.5 * Rig.S
			cam.position = Vector3(cx, 1.15, 5.6)
			cam.rotation_degrees = Vector3(-4, 0, 0)
			await get_tree().process_frame
			await get_tree().process_frame
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(out_dir.path_join(sh[0] + ".png"))
			if sh[0] == "stance":
				# 头部特写
				for i in 2:
					var hp: Vector3 = views[i].bone_world(Rig.HEAD)
					cam.position = hp + Vector3(-0.15 if i == 0 else 0.15, 0.1, 0.9)
					cam.look_at(hp + Vector3(0, 0.08, 0))
					await get_tree().process_frame
					await RenderingServer.frame_post_draw
					get_viewport().get_texture().get_image().save_png(out_dir.path_join("head%d.png" % i))
				cam.rotation_degrees = Vector3(-4, 0, 0)
			# 侧面也拍一张（看 3D 骨骼）
			cam.position = Vector3(cx + 3.6, 1.15, 4.2)
			cam.rotation_degrees = Vector3(-4, 40, 0)
			await get_tree().process_frame
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(out_dir.path_join(sh[0] + "_side.png"))
		print("拍完了")
		get_tree().quit()

func _init() -> void:
	var s := Shooter.new()
	var args := OS.get_cmdline_user_args()
	s.out_dir = args[0] if args.size() > 0 else "user://"
	root.add_child.call_deferred(s)
