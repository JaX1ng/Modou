extends SceneTree
func _init():
	print("start")
	var g := GameSim.new()
	print("sim made")
	AiRng.seed(12345)
	g.startMatch("pve", Brain.new(g.p[0], "normal"), Brain.new(g.p[1], "hard"))
	g.phase = "fight"
	var t0 := Time.get_ticks_msec()
	for i in 60:
		g.step([0, 0])
	print("60 frames ms=", Time.get_ticks_msec() - t0, " hp=", g.p[0].hp, ",", g.p[1].hp, " st=", g.p[0].state, ",", g.p[1].state)
	quit()
