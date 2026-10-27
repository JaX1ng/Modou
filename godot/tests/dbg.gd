extends SceneTree
func _init():
	var g := GameSim.new()
	AiRng.seed(4242)
	g.mode = "pve"
	g.brains = [Brain.new(g.p[0], "novice"), Brain.new(g.p[1], "easy")]
	g.startRound()
	g.phase = "fight"
	for i in 16:
		g.simTick([0, 0] if (g.frame + 1) % 4 == 0 else [0, 0])
		var F2: Fighter = g.p[1]
		print(g.frame, " ", F2.x, " ", F2.runT, " ", F2.state, " ", F2.kvx, " ", g.p[0].x, "  ", String.num(F2.x, 17))
	quit()
