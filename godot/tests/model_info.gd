extends SceneTree
## 正式模型量出来的身材（和简易模型的 BodyDef 比）：godot --headless --path godot -s tests/model_info.gd -- xia
func _init() -> void:
	var key: String = OS.get_cmdline_user_args()[0] if OS.get_cmdline_user_args().size() > 0 else "xia"
	var p := CharModel.proto(key)
	var a := BodyDef.standard()
	var b := p.bd
	for f in ["torso", "shoulder", "neck", "head", "ua", "fa", "wrist", "th", "sh", "ankle", "shoulderW", "hipW", "hipSplit"]:
		print("%-10s 简易 %6.2f  模型 %6.2f" % [f, a.get(f), b.get(f)])
	print("foot 简易 ", a.foot, "\nfoot 模型 ", b.foot)
	print("bones ", p.names.size(), " ", p.names)
	quit()
