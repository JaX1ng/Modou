extends SceneTree
## 和网页版 ?debug 的 __modouBench 一样的测速（本机）：电脑终极打终极，逻辑 + 动作 n 步、只算逻辑 n 步
func _init() -> void:
	var m = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(m)
	await process_frame
	for i in 3:
		print(m.bench(960))
	quit()
