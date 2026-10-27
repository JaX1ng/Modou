extends SceneTree
## 看正式模型（贴图人物）的打光：开一局，同一帧把玩家一的材质换成几套参数各拍一张（也能比描墨线）。要有显卡 / xvfb。
## 桌面版的样子要用 Forward+ 拍：xvfb-run -a godot --path godot --rendering-driver vulkan --resolution 1920x1080 -s tests/shoot_light.gd -- 输出目录 [套,套…]
## （没有显卡的机器装 mesa-vulkan-drivers，用 lavapipe 软件渲染，慢一点）
## 每套：fighter_tex.gdshader 的参数（没写的用 shader 里的默认值）；line_w = 描墨线（多粗，米），不写就不描
const OUTLINE_SHADER := preload("res://view/shaders/fighter_outline.gdshader")
const SETS := {
	"now": {},
	"unlit": {"fill": 1.0, "light_k": 0.0, "rim_amt": 0.0},
	"softer": {"fill": 0.70, "light_k": 0.20, "rim_amt": 0.12},
	"harder": {"fill": 0.66, "light_k": 0.24, "shade_col": Color(0.35, 0.32, 0.40)},
	"line": {"line_w": 0.0035},
}

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var out: String = args[0] if args.size() > 0 else "user://"
	var only: PackedStringArray = args[1].split(",") if args.size() > 1 else PackedStringArray()
	var m = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(m)
	await process_frame
	m.start_match("pve", "hard")
	m.ui.on_match_start()
	for i in 8:
		await process_frame
	var v0: FighterView = m.views[0]
	var mm: ShaderMaterial = v0.mmat
	var base := {}
	for p in ["fill", "light_k", "shade_col", "lit_lo", "lit_hi", "rim_amt", "gain"]:
		base[p] = mm.get_shader_parameter(p)
		if base[p] == null:
			base[p] = RenderingServer.shader_get_parameter_default(mm.shader.get_rid(), p)
	var lm := ShaderMaterial.new()
	lm.shader = OUTLINE_SHADER
	lm.render_priority = 1
	for k in SETS:
		if only.size() > 0 and not only.has(k):
			continue
		var s: Dictionary = SETS[k]
		for p in base:
			mm.set_shader_parameter(p, s.get(p, base[p]))
		lm.set_shader_parameter("width", s.get("line_w", 0.0))
		mm.next_pass = lm if s.has("line_w") else null
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(out.path_join(k + ".png"))
		print("拍 ", k)
	quit()
