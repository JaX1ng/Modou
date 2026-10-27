extends SceneTree
## 录一段电脑打电脑（一帧一帧按逻辑步数走，不看真的时间：软件渲染很慢也照样是正常速度的画面），每帧存一张图，之后用 ffmpeg 拼成视频。要有显卡 / xvfb。
## 用法：xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 1280x720 -s tests/record_match.gd -- 输出目录 [秒数=12] [每秒帧数=30] [先跳过几秒=3.5] [种子=7]
func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var out: String = args[0] if args.size() > 0 else "user://"
	var secs: float = float(args[1]) if args.size() > 1 else 12.0
	var fps: int = int(args[2]) if args.size() > 2 else 30
	var skip: float = float(args[3]) if args.size() > 3 else 3.5
	var seed_: int = int(args[4]) if args.size() > 4 else 7
	var m = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(m)
	await process_frame
	m.start_match("pve", "hard")
	m.ui.on_match_start()
	m.sim.brains[0] = Brain.new(m.sim.p[0], "hard")
	AiRng.seed(seed_)
	m.set_process(false)          # 主循环停了，这里自己一步一步走
	var steps_per_frame: int = int(round(1000.0 / fps / C.STEP_MS))
	var dt := 1000.0 / fps
	# 开场（第一回合的大字）先跳过去
	for i in int(skip * 1000.0 / C.STEP_MS):
		m.sim.simTick([0, 0])
	var n := int(secs * fps)
	for f in n:
		for s in steps_per_frame:
			m.sim.simTick([0, 0])
		m.RA = 1.0
		m._rdt = dt
		m.render()
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(out.path_join("f_%04d.png" % f))
		if f % 30 == 0:
			print("第 ", f, " 帧 ", m.sim.p[0].state, "/", m.sim.p[1].state, " hp ", m.sim.p[0].hp, "/", m.sim.p[1].hp)
	quit()
