extends SceneTree
## 量一下整个游戏（逻辑 + 动作 + 特效 + 血条，画面用无头的假渲染）一帧要多久：电脑终极打终极，跑 N 帧（每帧按 60Hz 走 4 步）。
## 用法：godot --headless --path godot -s tests/perf_game.gd [帧数]
func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var n: int = int(args[0]) if args.size() > 0 else 1200
	var m = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(m)
	await process_frame
	m.start_match("pve", "hell")
	m.sim.brains[0] = Brain.new(m.sim.p[0], "hell")
	m.ui.show_overlay("")
	AiRng.seed(3)
	Engine.max_fps = 0
	m.prof_on = true
	FighterAnim.PROF_ON = true
	var t0 := Time.get_ticks_usec()
	var worst := 0
	var last := t0
	for i in n:
		await process_frame
		var now := Time.get_ticks_usec()
		worst = maxi(worst, now - last)
		last = now
	var dt := (Time.get_ticks_usec() - t0) / 1000.0
	var P: Dictionary = m.prof
	var steps: int = P.get("steps", 1)
	print("每步：逻辑 + 画面 %.3f 毫秒（其中动作 %.3f、画面那一步总共 %.3f）；每帧 render() %.3f 毫秒" % [P.step / 1000.0 / steps, P.anim / 1000.0 / steps, P.visual / 1000.0 / steps, P.render / 1000.0 / n])
	var AP: Dictionary = FighterAnim.PROF
	var parts := []
	for k in AP:
		parts.append("%s %.3f" % [k, AP[k] / 1000.0 / (n if str(k).begins_with("draw") else steps)])
	print("动作每步（两个人）：", "，".join(parts), " 毫秒")
	print("帧数 %d，平均 %.2f 毫秒 / 帧，最慢 %.2f 毫秒；逻辑走到第 %d 步，%s / %s" % [n, dt / n, worst / 1000.0, m.sim.frame, m.sim.p[0].state, m.sim.p[1].state])
	quit()
