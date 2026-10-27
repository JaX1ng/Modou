extends SceneTree
## 把所有脚本都加载一遍，看有没有写错（解析错误会打 SCRIPT ERROR）
func _init() -> void:
	var bad := 0
	for dir in ["res://sim", "res://sim/styles", "res://view", "res://net", "res://ui", "res://game"]:
		var d := DirAccess.open(dir)
		if d == null:
			continue
		for f in d.get_files():
			if f.ends_with(".gd"):
				var s = load(dir.path_join(f))
				if s == null or not (s as GDScript).can_instantiate():
					print("✗ ", dir.path_join(f))
					bad += 1
	print("脚本都能加载" if bad == 0 else "有 %d 个脚本加载不了" % bad)
	quit(1 if bad else 0)
