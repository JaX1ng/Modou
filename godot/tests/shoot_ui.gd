extends SceneTree
## 界面截图：主菜单、人物颜色、键位、设置、双人选色、联机、训练场、暂停、结算。要有显卡 / xvfb。
## 用法：xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 1280x720 -s tests/shoot_ui.gd -- 输出目录
var out := ""
var m

func shot(name: String) -> void:
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(out.path_join("ui_%s.png" % name))
	print("拍 ", name)

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	out = args[0] if args.size() > 0 else "user://"
	m = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(m)
	await process_frame
	var ui = m.ui
	await shot("menu")
	ui.open_looks()
	await shot("looks")
	ui.open_keys("menu")
	await shot("keys")
	ui._click_cell("jab", 1)
	await shot("keys_wait")
	ui.key_wait = null
	ui.open_settings("menu")
	await shot("settings")
	ui.open_pvp()
	await shot("pvp")
	ui.net_ui.open("")
	await shot("online")
	ui.net_ui.relay_body.show()
	ui.net_ui.manual_body.show()
	await shot("online_open")
	ui.show_overlay("menu")
	ui.start("train")
	for i in 30:
		await process_frame
	await shot("train")
	ui.set_paused(true)
	await shot("pause")
	ui.set_paused(false)
	ui.start("pve")
	m.sim.wins = [3, 1]
	m.sim.phase = "over"
	ui._on_match_over()
	ui.show_overlay("result")
	await shot("result")
	quit()
