extends SceneTree
## 跑一局（电脑打电脑），隔一会儿拍一张：看整个画面（场景、人、特效、血条）。要有显卡 / xvfb。
## 用法：xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 1280x720 -s tests/shoot_game.gd -- 输出目录 [模式 pve/pvp/train/attract] [张数]
func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var out: String = args[0] if args.size() > 0 else "user://"
	var mode: String = args[1] if args.size() > 1 else "pve"
	var n: int = int(args[2]) if args.size() > 2 else 10
	var main_scene: PackedScene = load("res://main.tscn")
	var m = main_scene.instantiate()
	root.add_child(m)
	await process_frame
	if mode != "attract":
		m.start_match(mode, "hard")
		m.sim.brains[0] = Brain.new(m.sim.p[0], "hard")
		if mode == "pvp":
			m.sim.brains[1] = Brain.new(m.sim.p[1], "hard")
	AiRng.seed(7)
	var shots := [1.0, 3.5, 5.0, 7.0, 9.0, 11.0, 13.5, 16.0, 19.0, 22.0]
	shots.resize(mini(n, shots.size()))
	var t0 := Time.get_ticks_msec()
	var k := 0
	while k < shots.size():
		await process_frame
		var t := (Time.get_ticks_msec() - t0) / 1000.0
		if t >= shots[k]:
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(out.path_join("game_%02d.png" % k))
			print("拍 ", k, " t=", t, " fps=", Engine.get_frames_per_second(), " ", m.sim.p[0].state, "/", m.sim.p[1].state)
			k += 1
	quit()
