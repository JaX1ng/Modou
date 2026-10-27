extends SceneTree
## 动作对照：JS 版每帧两个人的骨骼 J（画面坐标）、发带、hipY、转身 / 翻滚角，Godot 版（FighterAnim）跑同样的场景逐帧比（容差：sin、cos 两边实现不一样）。
## 用法：node tests/js_ref/run_ref.mjs tests/js_ref/anim_scenarios.json 输出.json，然后
##       godot --headless --path godot -s tests/test_anim.gd -- 输出.json

const J_KEYS := ["hip", "hipF", "hipB", "neck", "neckTop", "head", "sh", "shF", "shB", "knot", "belt", "fe", "fh", "be", "bh", "fk", "ff", "bk", "bf"]
const TOL := 0.01
const PER := 19 * 2 + 2 * 8 * 2 + 3

class Gen:
	var s := 0
	var held := 0
	var n := 0
	var r1 := 0.16
	var r2 := 0.04
	var dk := false
	func _init(seed_v: int, rate, dash_key: bool) -> void:
		s = seed_v & 0xFFFFFFFF
		if rate != null:
			r1 = float(rate[0])
			r2 = float(rate[1])
		dk = dash_key
	func r() -> float:
		s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
		return s / 4294967296.0
	func next() -> int:
		var c := n <= 0
		n -= 1
		if c:
			n = 3 + int(r() * 20)
			var d := r()
			var dn := r()
			var bl := r()
			held = (1 if d < 0.3 else (2 if d < 0.6 else 0)) | (8 if dn < 0.15 else 0) | (16 if bl < 0.2 else 0)
		var v := held
		if r() < r1:
			v |= 1 << (5 + int(r() * 6))
		if r() < r2:
			v |= 1 << (5 + int(r() * 6))
		if dk:
			v |= InputState.DASH_KEY
		return v

static func vec(a: FighterAnim) -> Array:
	var o := []
	for k in J_KEYS:
		o.append(a.J[k][0])
		o.append(a.J[k][1])
	for r in 2:
		for q in a.ribbons[r]:
			o.append(q.x)
			o.append(q.y)
	o.append(a.hipY)
	o.append(a.disp.spin)
	o.append(a.disp.rot)
	return o

static func name_of(i: int) -> String:
	if i < 38:
		return J_KEYS[i / 2] + ("[0]" if i % 2 == 0 else "[1]")
	if i < 70:
		var j := i - 38
		return "发带%d 第%d点%s" % [j / 16, (j % 16) / 2, "x" if j % 2 == 0 else "y"]
	return ["hipY", "spin", "rot"][i - 70]

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var data = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	var ok := true
	for sc in data:
		ok = run_one(sc.cfg, Marshalls.base64_to_raw(sc.anim).to_float64_array(), sc.hashes.size()) and ok
	print("全部一致" if ok else "有对不上的")
	quit(0 if ok else 1)

func run_one(cfg: Dictionary, ref: PackedFloat64Array, frames: int) -> bool:
	var g := GameSim.new()
	var anims := [FighterAnim.new(g.p[0]), FighterAnim.new(g.p[1])]
	anims[0].opp = anims[1]
	anims[1].opp = anims[0]
	g.on_reset = func() -> void:
		anims[0].reset()
		anims[1].reset()
	g.on_visual_step = func(frozen: bool) -> void:
		anims[0].keepPrev()
		anims[1].keepPrev()
		anims[0].animate(frozen, g.frame)
		anims[1].animate(frozen, g.frame)
	AiRng.seed(int(cfg.seed))
	var mode: String = cfg.mode
	var train := mode == "train"
	g.trainQi = cfg.get("trainQi", false)
	g.p[1].maxHp = C.DUMMY_HP if train else C.MAX_HP
	g.wins = [0, 0]
	g.round_n = 1
	g.frame = 0
	if mode == "attract":
		g.startAttract(Brain.new(g.p[0], "normal"), Brain.new(g.p[1], "normal"))
	else:
		g.mode = mode
		g.endless = mode == "pvp" or train
		if train:
			g.brains = [null, Dummy.new(g.p[1], cfg.get("dummy", "stand"))]
		else:
			var ai: Array = cfg.ai
			g.brains = [Brain.new(g.p[0], ai[0]) if ai[0] != null else null, Brain.new(g.p[1], ai[1]) if ai[1] != null else null]
		g.startRound()
		if cfg.get("skipIntro", false) or train:
			g.phase = "fight"
	var kd: Array = cfg.get("keyDash", [false, false])
	var rate = cfg.get("rate", null)
	var gens := [Gen.new(int(cfg.inSeed[0]), rate, kd[0]), Gen.new(int(cfg.inSeed[1]), rate, kd[1])]
	var n := mini(frames, ref.size() / (2 * PER))
	var worst := 0.0
	var worst_rb := 0.0
	var t0 := Time.get_ticks_msec()
	for i in n:
		var inputs := [0 if g.brains[0] != null else gens[0].next(), 0 if g.brains[1] != null else gens[1].next()]
		g.step(inputs)
		for w in 2:
			var got := vec(anims[w])
			var base := (i * 2 + w) * PER
			for j in PER:
				var d := absf(got[j] - ref[base + j])
				if j >= 70 and j <= 72 and j != 70:
					d = absf(Pose.wrapDeg(got[j] - ref[base + j]))
				var tol := TOL if (j < 38 or j >= 70) else 0.5     # 发带是一串链子，前面差一点后面放大，宽一点
				if j < 38 or j >= 70:
					worst = maxf(worst, d)
				else:
					worst_rb = maxf(worst_rb, d)
				if d > tol:
					print("✗ ", cfg.name, " 第 ", i, " 帧 ", "玩家一" if w == 0 else "玩家二", " ", name_of(j), " JS=", ref[base + j], " Godot=", got[j],
						"（", g.p[w].state, " ", g.p[w].move.name if g.p[w].move != null else "", "）")
					return false
	print("✓ ", cfg.name, " ", n, " 帧动作一致（骨骼最大差 ", String.num_scientific(worst), "，发带 ", String.num_scientific(worst_rb), "，", Time.get_ticks_msec() - t0, " 毫秒）")
	return true
