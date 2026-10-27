class_name NetSession
extends RefCounted
## 联机的游戏这一层（对照 JS net.js 的 Net 里不碰网络的那一半）：打招呼、对版本、选色、选场景、开局、回滚帧同步、核对状态指纹、掉线续上。
## 线（房间码 / 手动连接码 / 测试回环）在 NetTransport。界面接这些回调：
##   on_open()                    两边都打过招呼了：可以选色、开打
##   on_close(was_open, in_room)  断了（in_room = 房间码联机，自己还留在房间里等下一个人）
##   on_status()                  延迟、走直连还是中继、等待对方……变了
##   on_looks()                   两边的颜色、场景变了
##   on_room(s)                   房间里的事（waiting / busy / version / rejoining / resumed / error）
##   on_begin()                   开一局（界面照 looks、stage 设好两个人，调 sim.startMatch("online", null, null)）

var tr: NetTransport
var sim: GameSim
var read_local: Callable           # (步号) -> 本机这一步的输入
var on_open: Callable
var on_close: Callable
var on_status: Callable
var on_looks: Callable
var on_room: Callable
var on_begin: Callable

var role := ""                     # host / guest（房主是玩家一）
var linked := false                # 两条通道都开了
var open := false                  # 两边互相打过招呼（hello）了
var rtt := 0.0
var delay := 2 * C.SUB
var epoch := 0
var rb: Rollback = null
var acc := 0.0
var stall := 0
var adv := 0.0
var holdN := 0
var hashes := {}
var desync := false
var hashChecks := 0
var looks := {"h": "ink", "g": "indigo"}
var my_look := "ink"               # 自己菜单里选的颜色（加入方想要的）
var stage := ""                    # 这一局的场景（房主说了算，只是画面）
var stage_pick: Array = []         # 能选的场景
var peerVersion := ""
var versionBad := false
var reconnecting := false
var via := ""
var lastDiag := ""
var _ping_at := 0.0
var hash_log := {}                 # 测试用：自己这边核对过的指纹（步号 → 指纹），keep_hashes 开着才记
var keep_hashes := false

func _init(t: NetTransport, g: GameSim) -> void:
	tr = t
	sim = g

func _cb(c: Callable, args := []) -> void:
	if c.is_valid():
		c.callv(args)

## 新配对之前：清掉上一次的版本、颜色
func pair_start(r: String, my_stage := "") -> void:
	role = r
	versionBad = false
	peerVersion = ""
	looks = {"h": my_look if r == "host" else "", "g": ""}
	if r == "host" and my_stage != "":
		stage = my_stage

## 每帧调一次（dt：毫秒）
func process(dt: float) -> void:
	for e in tr.poll():
		match e.t:
			"link":
				_on_link(e.get("again", false))
			"ctl":
				if e.m is Dictionary:
					on_ctl(e.m)
			"in":
				on_in(e.b)
			"lost":
				open = false
				linked = false
				reconnecting = true
				_cb(on_status)
			"gone":
				reconnecting = false
				var was := open or rb != null
				_reset()
				_cb(on_close, [was, false])
			"left":
				var was := open
				_reset()
				if was:
					_cb(on_close, [true, true])
				_cb(on_room, ["waiting"])
			"room":
				if e.s == "resumed":
					pass
				_cb(on_room, [e.s])
			"closed":
				var was := open
				lastDiag = "" if was else str(e.get("diag", ""))
				_reset()
				_cb(on_close, [was, tr.is_room()])
			"via":
				if e.v != via:
					via = e.v
					_cb(on_status)
	var now := tr.now_ms()
	if linked and now - _ping_at >= 500.0:
		_ping_at = now
		send_ctl({"t": "ping", "ts": now})
		if not open:
			send_hello()
	tick(dt)

func _reset() -> void:
	linked = false
	open = false
	rtt = 0.0
	reconnecting = false
	rb = null
	tr.set_hold(false)

## 两条通道都开了：开始打招呼。头几条消息可能丢（对方那条通道可能还没开），所以 hello 每半秒重发，直到收到对方的
func _on_link(again: bool) -> void:
	linked = true
	if not again and not reconnecting:
		open = false
	_ping_at = tr.now_ms()
	send_hello()
	send_ctl({"t": "ping", "ts": tr.now_ms()})

## got：我已经收到你的 hello 了（你就不用再回）；want：加入方想要的颜色
func send_hello() -> void:
	var m := {"t": "hello", "v": C.VERSION, "got": open}
	if role == "guest":
		m.want = my_look
	send_ctl(m)

func send_ctl(m: Dictionary) -> void:
	tr.send_ctl(m)

func on_ctl(m: Dictionary) -> void:
	if versionBad:
		return
	match str(m.get("t", "")):
		"ping":
			send_ctl({"t": "pong", "ts": m.ts})
		"pong":
			var r: float = tr.now_ms() - float(m.ts)
			rtt = rtt * 0.8 + r * 0.2 if rtt != 0.0 else r
			_cb(on_status)
		"hello":
			peerVersion = str(m.get("v", ""))
			if peerVersion != C.VERSION:
				bad_version(peerVersion)
				return
			if open:
				if not m.get("got", false):
					send_hello()      # 他没收到我的：再回一个
				return
			open = true
			if not m.get("got", false):
				send_hello()
			link_up(m)
		"start":
			begin(int(m.delay), int(m.epoch), m.get("looks", []), str(m.get("stage", "")))
		"h":
			if int(m.e) == epoch:
				check_hash(int(m.f), int(m.h), "r")
		"bye":
			reconnecting = false
			var was := open or rb != null
			_reset()
			tr.leave()
			_cb(on_close, [was, false])
		"look":
			if role == "host":
				looks.g = settle_look(looks.h, str(m.get("want", "")), looks.g)
				send_looks()
				_cb(on_looks)
		"looks":
			if role == "guest" and not C.lookOf(str(m.get("h", ""))).is_empty() and not C.lookOf(str(m.get("g", ""))).is_empty():
				looks = {"h": str(m.h), "g": str(m.g)}
				_cb(on_looks)
		"stage":
			if role == "guest" and stage_pick.has(str(m.get("id", ""))):
				stage = str(m.id)
				_cb(on_looks)

## 两边都打过招呼：连上了
func link_up(m: Dictionary) -> void:
	if reconnecting:                     # 掉线后续上了：接着打，把对方还没收到的输入补发过去
		reconnecting = false
		if rb != null:
			send_inputs()
		_cb(on_status)
		_cb(on_room, ["resumed"])
		return
	# 选色：房主先用自己存的颜色；加入方在 hello 里说想要什么，房主定了发回去
	if role == "host":
		looks.g = settle_look(looks.h, str(m.get("want", "")), looks.g)
		send_looks()
		send_stage()
	_cb(on_open)

func bad_version(v: String) -> void:
	if versionBad:
		return
	versionBad = true
	lastDiag = "对方的游戏是 %s，你的是 %s。两边要用同一个版本（网页版刷新一下；软件版更新到最新）。" % [v if v != "" else "旧版本", C.VERSION]
	send_ctl({"t": "bye"})
	_reset()
	tr.leave()
	_cb(on_room, ["version"])

## 房主说了算：房主选自己的；加入方想要的和房主撞了就保持原来的（或者给第一个没人用的）
static func settle_look(host: String, want: String, cur: String) -> String:
	for c in [want, cur]:
		if c != "" and c != host and not C.lookOf(c).is_empty():
			return c
	for p in C.PALETTE:
		if p.id != host:
			return p.id
	return "indigo"

## 界面上点了一个颜色（对方占着的点不了）
func pick_look(id: String) -> bool:
	if not open or C.lookOf(id).is_empty():
		return false
	if role == "host":
		if id == looks.g:
			return false
		looks.h = id
		send_looks()
		_cb(on_looks)
		return true
	if id == looks.h:
		return false
	send_ctl({"t": "look", "want": id})
	return true

func send_looks() -> void:
	send_ctl({"t": "looks", "h": looks.h, "g": looks.g})

## 场景：房主在大厅里点一张，发给加入方；开打的 start 里也带着（只是画面，不影响同步）
func pick_stage(id: String) -> bool:
	if role != "host" or not stage_pick.has(id):
		return false
	stage = id
	send_stage()
	_cb(on_looks)
	return true

func send_stage() -> void:
	send_ctl({"t": "stage", "id": stage})

## 输入延迟：有回滚，只要单程延迟的一半左右（1~3 帧）；按键基本没有延迟感。单位：步
func pick_delay() -> int:
	if C.NET_DELAY != 0:
		return C.NET_DELAY * C.SUB
	return clampi(int(C.jsround(rtt / 2.0 / C.STEP_MS * 0.5)), C.SUB, 3 * C.SUB)

## 房主开一局（第一局和再战都走这里）
func start_as_host() -> void:
	if role != "host" or not open:
		return
	var d := pick_delay()
	var e := (epoch + 1) & 255
	looks.g = settle_look(looks.h, looks.g, "")
	var lk := [looks.h, looks.g]
	send_ctl({"t": "start", "delay": d, "epoch": e, "looks": lk, "stage": stage})
	begin(d, e, lk, stage)

func begin(d: int, e: int, lk, st: String) -> void:
	if lk is Array and lk.size() == 2 and not C.lookOf(str(lk[0])).is_empty() and not C.lookOf(str(lk[1])).is_empty():
		looks = {"h": str(lk[0]), "g": str(lk[1])}
	if stage_pick.is_empty() or stage_pick.has(st):
		stage = st
	delay = d
	epoch = e
	hashes.clear()
	acc = 0.0
	desync = false
	hashChecks = 0
	stall = 0
	adv = 0.0
	holdN = 0
	rb = Rollback.new(sim, d, role)
	tr.set_hold(true)
	sim.online_host = role == "host"
	_cb(on_begin)

func on_in(b: PackedByteArray) -> void:
	var p := NetPacket.decode(b)
	if p.is_empty() or p.epoch != (epoch & 255) or rb == null:
		return
	rb.receive(p.first, p.vals, p.adv)
	if p.ack > rb.ack:
		rb.ack = p.ack

func send_inputs() -> void:
	if rb == null or not linked:
		return
	var o := rb.outgoing()
	if o[1].is_empty():
		return
	tr.send_in(NetPacket.encode(epoch, o[0], rb.remoteUntil, o[1], rb.localAdv()))

## 每帧调一次（dt：这一帧过了多少毫秒）
func tick(dt: float) -> void:
	if rb == null:
		return
	if rb.rollback() < 0:
		desync = true
	if not open:                       # 掉线重连中：原地等
		stall += 1
		return
	acc += dt * sim.timeScale
	var n := 0
	while acc >= C.STEP_MS - 1e-6 and n < 4 * C.SUB:
		rb.sample(read_local)
		if not rb.canAdvance():          # 对方太久没消息：等
			stall += 1
			if stall % 4 == 1:
				send_inputs()
			acc = minf(acc, C.STEP_MS)
			break
		# 时间同步：我比对方快一帧以上（我老在猜他、他老在回滚），每 6 步停一步等等他
		adv = adv * 0.9 + rb.timeSync() * 0.1
		if adv > C.SUB:
			holdN += 1
			if holdN % 6 == 0:
				acc -= C.STEP_MS
				n += 1
				continue
		stall = 0
		if rb.frame % C.SUB == 0:
			send_inputs()                  # 一帧发一包（带上对方还没确认的那几步）
		rb.advance()
		acc -= C.STEP_MS
		n += 1
	if n >= 4 * C.SUB:
		acc = 0.0
	rb.prune()
	for fh in rb.takeHashes():
		check_hash(fh[0], fh[1], "l")
		send_ctl({"t": "h", "e": epoch, "f": fh[0], "h": fh[1]})

func check_hash(f: int, h: int, side: String) -> void:
	if keep_hashes and side == "l":
		hash_log[f] = h
	var o: Dictionary = hashes.get(f, {})
	o[side] = h
	if o.has("l") and o.has("r"):
		if o.l != o.r:
			desync = true
		else:
			hashChecks += 1
		hashes.erase(f)
	else:
		hashes[f] = o
	if hashes.size() > 60:
		hashes.erase(hashes.keys()[0])

## 等对方的输入（画面上「等待对方…」）
func waiting() -> bool:
	return rb != null and stall > 30

func leave() -> void:
	send_ctl({"t": "bye"})
	_reset()
	tr.leave()
