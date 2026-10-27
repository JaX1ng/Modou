class_name LoopbackTransport
extends NetTransport
## 测试用：同一个进程里的两头，假时钟、延迟、抖动、丢包、乱序都能设。ctl 照样走一遍 JSON（和网页版一样，数字读回来是浮点）。

var peer: LoopbackTransport
var clock: Dictionary              # 两头共用 {"t": 毫秒}
var latency := 40.0                # 单程延迟（毫秒）
var jitter := 20.0                 # 输入包额外随机晚到 0 ~ jitter（会乱序）
var loss := 0.1                    # 输入包丢包率
var _s := 1                        # 自己的随机数（不碰 AiRng）
var _q: Array = []                 # 要送到我这头的：[到达时间, 序号, 事件]
var _n := 0
var _last_ctl := 0.0
var _events: Array = []
var down := false                  # 断线（测重连）

static func pair(seed_v: int, lat: float, jit: float, lost: float) -> Array:
	var c := {"t": 0.0}
	var a := LoopbackTransport.new()
	var b := LoopbackTransport.new()
	a.peer = b
	b.peer = a
	a.clock = c
	b.clock = c
	for x in [a, b]:
		x.latency = lat
		x.jitter = jit
		x.loss = lost
	a._s = seed_v & 0xFFFFFFFF
	b._s = (seed_v * 7 + 3) & 0xFFFFFFFF
	a._events.append({"t": "link", "again": false})
	b._events.append({"t": "link", "again": false})
	return [a, b]

func _r() -> float:
	_s = (_s * 1664525 + 1013904223) & 0xFFFFFFFF
	return _s / 4294967296.0

func now_ms() -> float:
	return clock.t

func send_ctl(m: Dictionary) -> void:
	if down:
		return
	var at := maxf(clock.t + latency, peer._last_ctl)     # 可靠有序：不会比前一条先到
	peer._last_ctl = at
	peer._push(at, {"t": "ctl", "m": JSON.parse_string(JSON.stringify(m))})

func send_in(b: PackedByteArray) -> void:
	if down or _r() < loss:
		return
	peer._push(clock.t + latency + _r() * jitter, {"t": "in", "b": b.duplicate()})

func _push(at: float, ev: Dictionary) -> void:
	_n += 1
	_q.append([at, _n, ev])

func poll() -> Array:
	var out := _events
	_events = []
	if _q.is_empty():
		return out
	_q.sort_custom(func(x, y): return x[0] < y[0] or (x[0] == y[0] and x[1] < y[1]))
	var i := 0
	while i < _q.size() and _q[i][0] <= clock.t:
		out.append(_q[i][2])
		i += 1
	_q = _q.slice(i)
	return out
