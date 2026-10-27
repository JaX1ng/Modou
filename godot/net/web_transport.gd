class_name WebNetTransport
extends NetTransport
## 网页版的「线」：浏览器里的 WebRTC（房间码 = Trystero 找人、手动 = 复制粘贴连接码），见 web/net_bridge.js（window.ModouNet）。
## 这里只是把调用转过去、把那边队列里的事取回来：联机那一层要的（link / ctl / in / lost / gone / left / room / closed / via / pair）
## 交给 NetSession；界面要的（hostCode / answer / err / relay / invite / copied / openInvite / connecting）放进 ui_events 给联机面板。

const SESSION_EVENTS := ["link", "ctl", "in", "lost", "gone", "left", "room", "closed", "via", "pair"]

var js: JavaScriptObject
var ui_events: Array = []
var _tick_cb: JavaScriptObject

func _init() -> void:
	if OS.has_feature("web"):
		js = JavaScriptBridge.get_interface("ModouNet")
		if js != null:
			js.init(C.VERSION)

func ok() -> bool:
	return js != null

func send_ctl(m: Dictionary) -> void:
	if js != null:
		js.sendCtl(JSON.stringify(m))

func send_in(b: PackedByteArray) -> void:
	if js != null:
		js.sendIn(Marshalls.raw_to_base64(b))

func poll() -> Array:
	var out := []
	if js == null:
		return out
	var s = js.poll()
	if s == null or str(s) == "":
		return out
	var arr = JSON.parse_string(str(s))
	if not (arr is Array):
		return out
	for e in arr:
		if not (e is Dictionary):
			continue
		var t := str(e.get("t", ""))
		if t == "in":
			e.b = Marshalls.base64_to_raw(str(e.b))
		if SESSION_EVENTS.has(t):
			out.append(e)
		else:
			ui_events.append(e)
	return out

func set_hold(on: bool) -> void:
	if js != null:
		js.setHold(on)

func leave() -> void:
	if js != null:
		js.leave()

func drop_peer() -> void:
	if js != null:
		js.dropPeer()

func is_room() -> bool:
	return js != null and bool(js.isRoom())

## 页面在后台（不画画面、Godot 主循环停了）时，浏览器那边的 Worker 计时器叫这个接着推进联机
func set_tick(cb: Callable) -> void:
	if js == null:
		return
	_tick_cb = JavaScriptBridge.create_callback(func(args: Array) -> void: cb.call(float(args[0]) if args.size() > 0 else 16.0))
	js.setTick(_tick_cb)
