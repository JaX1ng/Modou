extends SceneTree
## 看正式模型（AI 生成的）摆各个姿势是什么样：玩家一（侠，墨）近一点拍，侧面 + 斜 45° 各一张；还有几个关键帧的招式。要有显卡 / xvfb。
## 用法：xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 1280x720 -s tests/render_model.gd -- 输出目录 [姿势,姿势…]

class Shooter extends Node3D:
	var out_dir := ""
	var only: PackedStringArray = []
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
		cam.fov = 30
		add_child(cam)
		var views := []
		var anims := []
		for i in 2:
			var f := Fighter.new(i, "ink" if i == 0 else "ochre", 560.0 + i * 150.0, 1 if i == 0 else -1)
			var a := FighterAnim.new(f)
			var v := FighterView.new()
			v.depth = 0.0 if i == 0 else 0.07
			add_child(v)
			v.setup(f, a, "xia" if i == 0 else "seng")
			views.append(v)
			anims.append(a)
		anims[0].opp = anims[1]
		anims[1].opp = anims[0]
		var shots := [["stance", "stance"], ["block", "block"], ["crouch", "crouch"], ["cblock", "cblock"], ["run", "run"], ["jup", "jup"], ["jtop", "jtop"], ["leap", "leap"],
			["hurtH", "hurtH"], ["hurtL", "hurtL"], ["fall", "fall"], ["lie", "lie"], ["rise", "rise"], ["win", "win"], ["parry", "parry"], ["tuck", "tuck"]]
		var mv := Moves.MOVES
		for nm in mv:
			shots.append(["move_" + nm, "@" + nm])
		for sh in shots:
			if only.size() > 0 and not only.has(sh[0]):
				continue
			var a: FighterAnim = anims[0]
			var key: String = sh[1]
			a.F.state = "idle"
			a.F.move = null
			if key.begins_with("@"):
				var d: MoveDef = mv[key.substr(1)]
				a.disp.copy_from(Pose.evalKeys(d.keys, d.S + d.A * 0.5))
				var ms := MoveState.new()
				ms.name = key.substr(1)
				ms.def = d
				a.F.state = "attack"
				a.F.move = ms
			elif Pose.POSE.has(key):
				a.disp.copy_from(Pose.POSE[key])
			else:
				continue
			views[0].hand_open = views[0]._hand_target().duplicate()
			a.J = {}
			a.fk()
			views[0].update_pose(1.0)
			anims[1].disp.copy_from(Pose.POSE.stance)
			anims[1].J = {}
			anims[1].fk()
			views[1].update_pose(1.0)
			var hp: Vector3 = views[0].bone_world(Rig.HIPS)
			cam.position = Vector3(hp.x + 0.35, 1.0, 4.2)
			cam.rotation_degrees = Vector3(-3, 0, 0)
			await get_tree().process_frame
			await get_tree().process_frame
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(out_dir.path_join(sh[0] + ".png"))
			cam.position = Vector3(hp.x + 2.4, 1.1, 2.6)
			cam.look_at(Vector3(hp.x, 0.9, 0.0))
			await get_tree().process_frame
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(out_dir.path_join(sh[0] + "_45.png"))
			if sh[0] == "stance":
				var hd: Vector3 = views[0].bone_world(Rig.HEAD)
				cam.position = hd + Vector3(0.55, 0.05, 0.75)
				cam.look_at(hd + Vector3(0.05, -0.02, 0.0))
				await get_tree().process_frame
				await RenderingServer.frame_post_draw
				get_viewport().get_texture().get_image().save_png(out_dir.path_join("head.png"))
		print("拍完了")
		get_tree().quit()

func _init() -> void:
	var s := Shooter.new()
	var args := OS.get_cmdline_user_args()
	s.out_dir = args[0] if args.size() > 0 else "user://"
	if args.size() > 1:
		s.only = args[1].split(",")
	root.add_child.call_deferred(s)
