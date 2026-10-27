extends SceneTree
## 查画面问题用：开一局，同一帧关掉 / 换掉某样东西各拍一张（泛光、雾、倒影、人身后的特效层、简易模型）。要有显卡 / xvfb。
## 用法：xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 1280x720 -s tests/shoot_variants.gd -- 输出目录
func _init() -> void:
	var out: String = OS.get_cmdline_user_args()[0] if OS.get_cmdline_user_args().size() > 0 else "user://"
	var m = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(m)
	await process_frame
	m.start_match("pve", "hard")
	m.ui.on_match_start()
	for i in 8:
		await process_frame
	var env: Environment = m.stage.env
	var v0: FighterView = m.views[0]
	var shots := {
		"a_default": func() -> void: pass,
		"b_noglow": func() -> void: env.glow_enabled = false,
		"c_glow": func() -> void: env.glow_enabled = true,
	}
	for k in shots:
		(shots[k] as Callable).call()
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(out.path_join(k + ".png"))
		print("拍 ", k)
	# 简易模型（换一身没有正式模型的颜色）
	v0.set_look("vermil")
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(out.path_join("g_simple.png"))
	quit()
