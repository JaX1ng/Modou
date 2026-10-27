extends SceneTree
## 对照测试：JS 版（tests/js_ref/run_ref.mjs）跑出来的每帧状态指纹，Godot 版跑同样的场景逐帧比。
## 用法：godot --headless --path godot -s tests/diff_trace.gd -- 路径/ref_trace.json [brief]
## 指纹盖住两个人联机存档里的全部字段（Fighter.SAVE_KEYS、招式、连段、统计、输入）+ 回合流程。
## 第一个对不上的帧打出来；JSON 里带了那几帧的全部字段（run_ref.mjs 的 window）就逐个字段比，告诉你是哪个字段。
## brief：每个场景对不上的话打一行「BAD 第几个场景 第几帧」（给 tests/js_ref/check.sh 用，拿去要那几帧的全部字段）

const STAT_KEYS := ["hits", "maxCombo", "blocks", "specials", "parries", "clashes", "presses", "punishes", "escapes", "supers"]
const M_KEYS := ["name", "t", "S", "hit", "blocked", "done", "air", "slowed", "serial", "armorLeft", "press", "dashIn", "pen", "dvx", "bounce", "bFly",
	"pick", "holdKind", "lungePx", "parryThrow", "absorbed", "tumbled", "evaded", "beatVs", "slipped", "missTag", "dodged"]
const G_KEYS := ["frame", "freeze", "phase", "phaseT", "timer", "round", "wins0", "wins1", "winner", "timeScale", "in0", "in1", "F1", "F2", "events"]

class InputGen:
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

static func dumpF(F: Fighter) -> Array:
	var o := []
	for k in Fighter.SAVE_KEYS:
		o.append(F.get(k))
	o.append(",".join(F.chain))
	var st := []
	for k in STAT_KEYS:
		st.append(F.stats[k])
	o.append(st)
	var m := F.move
	if m == null:
		o.append(null)
	else:
		o.append([m.name, m.t, m.S, m.hit, m.blocked, m.done, m.air, m.slowed, m.serial, m.armorLeft, m.press, m.dashIn, m.pen,
			m.dvx if m.has_dvx else null, m.bounce, m.bFly, m.pick, m.holdKind, m.lungePx if m.has_lungePx else null,
			m.parryThrow, m.absorbed, m.tumbled, m.evaded, m.beatVs, m.slipped, m.missTag, m.dodged])
	var H := F.inp
	var b := []
	for e in H.buf:
		b.append([e.a, e.t])
	o.append([H.left, H.right, H.up, H.down, H.block, H.keyDash, b])
	return o

## 这一帧给画面的事件（和 ref.js 一样的写法）：飘字、印章、大字只看「种类 + 字」，声音看哪个、参数
static func evArg(v) -> String:
	if v is bool:
		return "true" if v else "false"
	if v is float or v is int:
		return hx(v)
	return str(v)

static func events(g: GameSim) -> Array:
	var o := []
	for e in g.ev.out:
		match e.type:
			"tag":
				o.append("tag" + (e.text if e.text is String else SimEvents._join(e.text)))
			"stamp":
				o.append("stamp" + e.text)
			"announce":
				o.append("announce" + e.text)
			"snd":
				var p = e.p
				var args := ""
				if p is Array:
					var parts := PackedStringArray()
					for v in p:
						parts.append(evArg(v))
					args = ",".join(parts)
				elif p != null:
					args = evArg(p)
				o.append("snd|" + e.k + "|" + args)
	g.ev.out.clear()
	return o

static func record(g: GameSim, inputs: Array) -> Array:
	return [g.frame, g.freeze, g.phase, g.phaseT, g.timer, g.round_n, g.wins[0], g.wins[1], g.winner, g.timeScale,
		inputs[0], inputs[1], dumpF(g.p[0]), dumpF(g.p[1]), events(g)]

# 覆盖面：跑到过哪些招、哪些状态（最后打出来，看还有什么没测到）
var seen_moves := {}
var seen_states := {}

# ---------- 指纹（和 ref.js 的 frameCanon / djb2 一样） ----------
var _nums := PackedFloat64Array()
var _strs := PackedStringArray()

func _flat(v) -> void:
	if v is Array:
		_strs.append("[")
		for x in v:
			_flat(x)
		_strs.append("]")
	elif v is bool:
		_strs.append("true" if v else "false")
	elif v is float or v is int:
		_nums.append(float(v))
		_strs.append("#")
	elif v == null:
		_strs.append("null")
	else:
		_strs.append(str(v))

func frameHash(rec: Array) -> int:
	_nums = PackedFloat64Array()
	_strs = PackedStringArray()
	_flat(rec)
	return (_nums.to_byte_array().hex_encode() + "|" + "|".join(_strs)).hash()

# ---------- 看的时候：数写成 64 位浮点的十六进制（小端） ----------
static func hx(v) -> Variant:
	if v is bool:
		return v
	if v is float or v is int:
		return PackedFloat64Array([float(v)]).to_byte_array().hex_encode()
	return v

static func hxAll(a: Array) -> Array:
	var o := []
	for v in a:
		o.append(hxAll(v) if v is Array else hx(v))
	return o

static func unhx(s: String) -> float:
	return s.hex_decode().decode_double(0)

static func label(path: Array) -> String:
	var s := ""
	var nk := Fighter.SAVE_KEYS.size()
	for d in path.size():
		var i: int = path[d]
		if d == 0 and i < G_KEYS.size():
			s += G_KEYS[i]
		elif d == 1 and path[0] >= 12 and path[0] <= 13:
			if i < nk:
				s += "." + Fighter.SAVE_KEYS[i]
			else:
				s += "." + ["chain", "stats", "move", "inp"][i - nk]
		elif d == 2 and path[0] >= 12 and path[0] <= 13 and path[1] == nk + 2 and i < M_KEYS.size():
			s += "." + M_KEYS[i]
		elif d == 2 and path[0] >= 12 and path[0] <= 13 and path[1] == nk + 1 and i < STAT_KEYS.size():
			s += "." + STAT_KEYS[i]
		else:
			s += "[" + str(i) + "]"
	return s

func diff(a, b, path: Array) -> String:
	if a is Array and b is Array:
		if a.size() != b.size():
			return label(path) + " 长度 %d / %d" % [a.size(), b.size()]
		for i in a.size():
			var r := diff(a[i], b[i], path + [i])
			if r != "":
				return r
		return ""
	if str(a) != str(b):
		if a is String and b is String and a.length() == 16 and b.length() == 16 and a.is_valid_hex_number() and b.is_valid_hex_number():
			return "%s JS=%s Godot=%s" % [label(path), String.num(unhx(a), 17), String.num(unhx(b), 17)]
		return "%s JS=%s Godot=%s" % [label(path), str(a), str(b)]
	return ""

static func readable(a) -> Variant:
	if a is Array:
		var o := []
		for v in a:
			o.append(readable(v))
		return o
	if a is String and a.length() == 16 and a.is_valid_hex_number():
		return String.num(unhx(a), 6)
	return a

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var path: String = args[0] if args.size() > 0 else "res://tests/ref_trace.json"
	var brief := args.size() > 1 and args[1] == "brief"
	var txt := FileAccess.get_file_as_string(path)
	var data = JSON.parse_string(txt)
	if data == null:
		print("读不了 ", path)
		quit(2)
		return
	var all_ok := true
	for k in data.size():
		var sc: Dictionary = data[k]
		var bad := run_one(sc.cfg, sc.hashes, sc.full)
		if bad >= 0:
			all_ok = false
			if brief:
				print("BAD ", int(sc.cfg.get("index", k)), " ", bad)
	var all_moves: Array = Moves.STYLES[Moves.STYLE_DEFAULT].moves.keys()
	var missing := []
	for nm in all_moves:
		var hit := false
		for k in seen_moves:
			if k == nm or k.begins_with(nm + "/"):
				hit = true
				break
		if not hit:
			missing.append(nm)
	print("跑到过的招：", seen_moves.keys().size(), " 种；没跑到的：", missing)
	var st: Array = seen_states.keys()
	st.sort()
	print("跑到过的状态：", st)
	print("全部一致" if all_ok else "有对不上的")
	quit(0 if all_ok else 1)

## 返回第一个对不上的帧（-1 = 全对）
func run_one(cfg: Dictionary, hashes: Array, full: Dictionary) -> int:
	var g := GameSim.new()
	AiRng.seed(int(cfg.seed))
	var mode: String = cfg.mode
	var train := mode == "train"
	g.trainQi = cfg.get("trainQi", false)
	g.p[1].maxHp = C.DUMMY_HP if train else C.MAX_HP
	g.wins = [0, 0]
	g.round_n = 1
	g.paused = false
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
	var gens := [InputGen.new(int(cfg.inSeed[0]), rate, kd[0]), InputGen.new(int(cfg.inSeed[1]), rate, kd[1])]
	var t0 := Time.get_ticks_msec()
	var prev: Array = []
	for i in hashes.size():
		var inputs := [0 if g.brains[0] != null else gens[0].next(), 0 if g.brains[1] != null else gens[1].next()]
		g.step(inputs)
		for F in g.p:
			seen_states[F.state + ("/" + F.downPhase if F.downPhase != "" else "")] = true
			if F.move != null:
				seen_moves[F.move.name + ("/" + F.move.pick if F.move.pick != "" else "")] = true
		var rec := record(g, inputs)
		var key := str(i)
		if full.has(key):
			var got := hxAll(rec)
			var bad := diff(full[key], got, [])
			if bad != "":
				print("✗ ", cfg.name, " 第 ", i, " 帧对不上：", bad)
				for j in range(maxi(0, i - 2), i + 1):
					if full.has(str(j)):
						print("  帧 ", j, " JS:    ", readable(full[str(j)]))
				print("  帧 ", i, " Godot: ", readable(got))
				return i
			prev = got
		if frameHash(rec) != int(hashes[i]):
			print("✗ ", cfg.name, " 第 ", i, " 帧指纹对不上（", g.phase, "）")
			return i
	print("✓ ", cfg.name, " ", hashes.size(), " 帧一致（", Time.get_ticks_msec() - t0, " 毫秒）")
	return -1
