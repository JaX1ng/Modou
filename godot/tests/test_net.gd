extends SceneTree
## 联机测试（不连网）：① 存档 / 读档后接着算，和一直算下去一模一样；② 两份游戏经「本机回环」联机（延迟、抖动、丢包、乱序、
## 两边帧率不一样、一阵子全丢），回滚帧同步：两边核对的状态指纹一致，而且和「拿两边真的输入一口气算下来」的一模一样。
## 用法：godot --headless --path godot -s tests/test_net.gd

class Gen:
	var s := 0
	var held := 0
	var n := 0
	func _init(seed_v: int) -> void:
		s = seed_v & 0xFFFFFFFF
	func r() -> float:
		s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
		return s / 4294967296.0
	## 一帧一个：按住的组合隔几帧换一次，偶尔新按一个键（只在一帧的最后一步按，和 step() 一样）
	func at(step: int) -> int:
		if step % C.SUB != C.SUB - 1:
			return held
		var c := n <= 0
		n -= 1
		if c:
			n = 3 + int(r() * 20)
			var d := r()
			held = (1 if d < 0.3 else (2 if d < 0.6 else 0)) | (8 if r() < 0.15 else 0) | (16 if r() < 0.2 else 0)
		var v := held
		if r() < 0.16:
			v |= 1 << (5 + int(r() * 6))
		return v

var fails := 0

func check(ok: bool, what: String) -> void:
	if ok:
		print("  ✓ ", what)
	else:
		fails += 1
		print("  ✗ ", what)

func _init() -> void:
	test_save_load()
	for cfg in [
		{"name": "近（20ms，不丢包）", "lat": 20.0, "jit": 5.0, "loss": 0.0, "fps": [60.0, 60.0], "seed": 1},
		{"name": "一般（60ms，抖 30，丢 10%）", "lat": 60.0, "jit": 30.0, "loss": 0.1, "fps": [60.0, 144.0], "seed": 2},
		{"name": "远（140ms，抖 60，丢 25%）", "lat": 140.0, "jit": 60.0, "loss": 0.25, "fps": [75.0, 50.0], "seed": 3},
		{"name": "一阵子全丢（1.5 秒）", "lat": 50.0, "jit": 20.0, "loss": 0.05, "fps": [60.0, 60.0], "seed": 4, "outage": [8000.0, 9500.0]},
	]:
		test_online(cfg)
	print("全部通过" if fails == 0 else "有 %d 处没通过" % fails)
	quit(0 if fails == 0 else 1)

func test_save_load() -> void:
	print("存档 / 读档")
	var g := GameSim.new()
	g.startMatch("pvp", null, null)
	g.phase = "fight"
	var ga := Gen.new(11)
	var gb := Gen.new(22)
	var ins := []
	for i in 12000:
		ins.append([ga.at(i), gb.at(i)])
	for i in 3000:
		g.simTick(ins[i])
	var snap := g.saveState()
	var hashes := []
	for i in range(3000, 12000):
		g.simTick(ins[i])
		if i % 500 == 0:
			hashes.append(g.stateHash())
	var h1 := g.stateHash()
	# 读回去，同样的输入再算一遍
	g.loadState(snap)
	var hashes2 := []
	for i in range(3000, 12000):
		g.simTick(ins[i])
		if i % 500 == 0:
			hashes2.append(g.stateHash())
	check(g.stateHash() == h1 and hashes == hashes2, "读档后接着算 9000 步，和原来一模一样")
	# 读档后存档本身没被改（存的是拷贝）
	g.loadState(snap)
	var h_again := g.stateHash()
	g.loadState(snap)
	check(g.stateHash() == h_again, "同一个存档读两次一样")

func test_online(cfg: Dictionary) -> void:
	print("联机：", cfg.name)
	var pair := LoopbackTransport.pair(cfg.seed, cfg.lat, cfg.jit, cfg.loss)
	var sims := [GameSim.new(), GameSim.new()]
	var sess := []
	var logs := [{}, {}]
	var gens := [Gen.new(100 + cfg.seed), Gen.new(200 + cfg.seed)]
	var opened := [false, false]
	for k in 2:
		var s := NetSession.new(pair[k], sims[k])
		s.keep_hashes = true
		s.my_look = "ink" if k == 0 else "pine"
		s.pair_start("host" if k == 0 else "guest")
		var kk := k
		s.read_local = func(step: int) -> int:
			var v: int = gens[kk].at(step)
			logs[kk][step] = v
			return v
		s.on_open = func() -> void: opened[kk] = true
		s.on_begin = func() -> void: sims[kk].startMatch("online", null, null)
		sess.append(s)
	var clock: Dictionary = pair[0].clock
	var next := [0.0, 3.0]
	var period := [1000.0 / cfg.fps[0], 1000.0 / cfg.fps[1]]
	var started := false
	var end_ms := 32000.0
	var outage: Array = cfg.get("outage", [])
	while clock.t < end_ms:
		var k := 0 if next[0] <= next[1] else 1
		clock.t = next[k]
		if outage.size() == 2:
			var down: bool = clock.t >= outage[0] and clock.t < outage[1]
			pair[0].down = down
			pair[1].down = down
		sess[k].process(period[k])
		next[k] += period[k]
		if not started and opened[0] and opened[1]:
			started = true
			sess[0].start_as_host()
	check(started, "连上、打过招呼、开局")
	if not started:
		return
	var h0: Dictionary = sess[0].hash_log
	var h1: Dictionary = sess[1].hash_log
	check(not sess[0].desync and not sess[1].desync, "两边没发现不同步")
	check(sess[0].hashChecks >= 5 and sess[1].hashChecks >= 5, "核对过状态指纹（%d / %d 次）" % [sess[0].hashChecks, sess[1].hashChecks])
	# 拿两边真的输入一口气算下来（不回滚），在同样的步数上比指纹
	var ref := GameSim.new()
	ref.startMatch("online", null, null)
	var d: int = sess[0].delay
	var last := 0
	for f in h0.keys():
		last = maxi(last, f)
	var same := true
	var cnt := 0
	for f in last:
		var a: int = 0 if f < d else int(logs[0].get(f, 0))
		var b: int = 0 if f < d else int(logs[1].get(f, 0))
		ref.simTick([a, b])
		var st := f + 1
		if h0.has(st) or h1.has(st):
			var h := ref.stateHash()
			if (h0.has(st) and h0[st] != h) or (h1.has(st) and h1[st] != h):
				same = false
			cnt += 1
	check(same and cnt > 0, "和一口气算下来的一模一样（比了 %d 个点，算到第 %d 步）" % [cnt, last])
	var st0: Dictionary = sess[0].rb.stats
	var st1: Dictionary = sess[1].rb.stats
	print("    回滚 %d / %d 次，重算 %d / %d 步，最深 %d / %d 步；延迟 %d 步；rtt %.0f ms" % [st0.rollbacks, st1.rollbacks, st0.frames, st1.frames, st0.maxDepth, st1.maxDepth, sess[0].delay, sess[0].rtt])
