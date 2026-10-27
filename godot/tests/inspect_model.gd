extends SceneTree
## 看一个导入的人物模型（GLB）里有什么：节点、骨骼、蒙皮、网格大小。用法：godot --headless --path godot -s tests/inspect_model.gd -- res://assets/chars/xia/xia.glb
func _init() -> void:
	var path: String = OS.get_cmdline_user_args()[0] if OS.get_cmdline_user_args().size() > 0 else "res://assets/chars/xia/xia.glb"
	var sc: PackedScene = load(path)
	var n := sc.instantiate()
	_walk(n, 0)
	var mi := _find(n, "MeshInstance3D") as MeshInstance3D
	var sk := _find(n, "Skeleton3D") as Skeleton3D
	print("mesh aabb ", mi.mesh.get_aabb(), " surfaces ", mi.mesh.get_surface_count(), " verts ", mi.mesh.surface_get_array_len(0))
	print("mesh global ", mi.global_transform if mi.is_inside_tree() else _gx(mi))
	print("skel global ", _gx(sk))
	var skin := mi.skin
	print("binds ", skin.get_bind_count())
	for i in skin.get_bind_count():
		var nm := skin.get_bind_name(i)
		var bi := sk.find_bone(nm)
		var B := skin.get_bind_pose(i).affine_inverse()
		var R := sk.get_bone_global_rest(bi)
		print("  %2d %-24s bone=%2d bindpos=%s restpos=%s diff=%.5f" % [i, nm, bi, B.origin, R.origin, (B.origin - R.origin).length()])
	quit()

func _gx(n: Node) -> Transform3D:
	var t := Transform3D.IDENTITY
	var c := n
	while c != null and c is Node3D:
		t = (c as Node3D).transform * t
		c = c.get_parent()
	return t

func _walk(n: Node, d: int) -> void:
	var s := "  ".repeat(d) + n.name + " (" + n.get_class() + ")"
	if n is Node3D:
		s += " " + str((n as Node3D).transform)
	print(s)
	for c in n.get_children():
		_walk(c, d + 1)

func _find(n: Node, cls: String) -> Node:
	if n.get_class() == cls:
		return n
	for c in n.get_children():
		var r := _find(c, cls)
		if r != null:
			return r
	return null
