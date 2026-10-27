class_name NetPanel
extends RefCounted
## 联机面板（对照 JS ui.js「联机面板」那一段 + index.html #online）：上面房间码（默认），下面折起来的中继服务器、手动连接（局域网）；
## 连上以后只显示大厅（状态、选色、房主「开始对战」）。线在网页里（web/net_bridge.js），游戏那一层是 NetSession。
## 软件版（不是网页）暂时不能联机：面板上说一声。

const RELAY_HINT := "有的网络（有防火墙、对称型 NAT）不允许两台设备直接连接。填一个 TURN 中继服务器，直连不通时数据经它转发。只要一边填：用房间码时把「邀请链接」发给对方，链接会把中继带过去；手动连接时房主填，连接码会带过去。"

var ui: Ui
var tr: WebNetTransport
var net: NetSession
var v: VBoxContainer
# 房间码
var intro: Label
var room_box: VBoxContainer
var room_code: LineEdit
var btn_room_join: Button
var room_status: Label
var room_tools: HBoxContainer
var btn_invite: Button
var _room_hint_t := -1.0
# 中继
var relay_head: Button
var relay_body: VBoxContainer
var relay_text: TextEdit
var relay_status: Label
var btn_relay_save: Button
# 手动
var manual_head: Button
var manual_body: VBoxContainer
var choose_row: HBoxContainer
var host_box: VBoxContainer
var host_code: TextEdit
var host_answer: TextEdit
var btn_connect: Button
var join_box: VBoxContainer
var join_code: TextEdit
var join_answer: TextEdit
var net_wait: Label
var _copy_btn: Button
# 大厅
var lobby: VBoxContainer
var net_status: Label
var looks_row: HFlowContainer
var btn_start: Button
var err_lbl: Label

func build() -> void:
	tr = WebNetTransport.new()
	net = NetSession.new(tr, ui.main.sim)
	net.read_local = func(_f: int) -> int: return ui.main.pads[0].sample()
	net.on_open = _on_open
	net.on_close = _on_close
	net.on_status = _on_status
	net.on_looks = _on_looks
	net.on_room = _on_room
	net.on_begin = _on_begin
	ui.main.net = net
	tr.set_tick(func(dt: float) -> void: _bg_tick(dt))
	v = ui.overlay("online", true, 640.0, true)
	ui.big("联机对战", v, 40)
	intro = ui.hint("两边输入同一个房间码就能连上（或者把邀请链接发给对方，他点开就进）。找对方时经过公共信令服务器（只传连接信息），连上以后两台电脑点对点直连，打的时候不经过服务器。", v)
	# ---- 房间码 ----
	room_box = VBoxContainer.new()
	room_box.add_theme_constant_override("separation", 8)
	v.add_child(room_box)
	ui.step_label("房间码（两边一样就行，随便起，比如「墨斗1022」）", room_box)
	var r := ui.row(room_box, 8)
	room_code = LineEdit.new()
	room_code.max_length = 24
	room_code.placeholder_text = "输入房间码"
	room_code.custom_minimum_size = Vector2(300, 36)
	room_code.text_submitted.connect(func(t: String) -> void: join_room(t))
	r.add_child(room_code)
	btn_room_join = ui.btn("进房间", "Small", func() -> void: join_room(room_code.text), r)
	room_status = ui.hint("", room_box, UiTheme.CREAM, 13)
	room_tools = ui.row(room_box, 8)
	btn_invite = ui.btn("复制邀请链接", "Small", _invite, room_tools)
	ui.btn("换个房间", "Small", _leave_room, room_tools)
	# ---- 中继 ----
	relay_head = ui.btn("", "Small", func() -> void: relay_body.visible = not relay_body.visible, v)
	relay_body = VBoxContainer.new()
	relay_body.add_theme_constant_override("separation", 8)
	relay_body.hide()
	v.add_child(relay_body)
	ui.hint(RELAY_HINT, relay_body)
	relay_text = TextEdit.new()
	relay_text.placeholder_text = "把中继后台复制的 ICE 数组整段粘进来\n（也可以粘 Metered 的 API 链接，或每行「turn:地址:端口 用户名 密码」）"
	relay_text.custom_minimum_size = Vector2(560, 90)
	relay_text.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	relay_body.add_child(relay_text)
	var rr := ui.row(relay_body, 8)
	btn_relay_save = ui.btn("保存并测试", "Small", _relay_save, rr)
	ui.btn("清除", "Small", _relay_clear, rr)
	relay_status = ui.hint("", relay_body, UiTheme.CREAM, 13)
	# ---- 手动连接 ----
	manual_head = ui.btn("手动连接 · 局域网（同一个 Wi-Fi / 路由器时用：复制粘贴连接码直接连）", "Small", func() -> void: manual_body.visible = not manual_body.visible, v)
	manual_body = VBoxContainer.new()
	manual_body.add_theme_constant_override("separation", 8)
	manual_body.hide()
	v.add_child(manual_body)
	choose_row = ui.row(manual_body, 10)
	ui.btn("我来建房", "Primary", _host, choose_row)
	ui.btn("我去加入", "Ghost", _join_view, choose_row)
	host_box = VBoxContainer.new()
	host_box.hide()
	manual_body.add_child(host_box)
	ui.step_label("① 把连接码整段发给对方", host_box)
	var hr := ui.row(host_box, 8)
	host_code = _code_box(hr, true, "正在生成…")
	ui.btn("复制", "Small", func() -> void: _copy(host_code.text, _last_btn()), hr)
	ui.step_label("② 粘贴对方发回的应答码", host_box)
	var hr2 := ui.row(host_box, 8)
	host_answer = _code_box(hr2, false, "粘贴应答码")
	btn_connect = ui.btn("连接", "Small", _connect, hr2)
	join_box = VBoxContainer.new()
	join_box.hide()
	manual_body.add_child(join_box)
	ui.step_label("① 粘贴房主发来的连接码", join_box)
	var jr := ui.row(join_box, 8)
	join_code = _code_box(jr, false, "粘贴连接码")
	ui.btn("生成", "Small", _make_answer, jr)
	ui.step_label("② 把应答码整段发回给房主，然后等着", join_box)
	var jr2 := ui.row(join_box, 8)
	join_answer = _code_box(jr2, true, "先完成第 ① 步")
	ui.btn("复制", "Small", func() -> void: _copy(join_answer.text, _last_btn()), jr2)
	net_wait = ui.hint("发完就等着，别关这个页面。房主点「连接」后会自动连上（最多等 5 分钟）。", join_box)
	net_wait.hide()
	# ---- 大厅 ----
	lobby = VBoxContainer.new()
	lobby.add_theme_constant_override("separation", 10)
	lobby.hide()
	v.add_child(lobby)
	net_status = ui.label("已连接", 16, UiTheme.GOLD, UiTheme.UIF, true)
	lobby.add_child(net_status)
	ui.step_label("选你的颜色（对方选了的那个会变暗，点不了）", lobby)
	looks_row = ui._swatch_row(lobby, false, _pick_look)
	var lr := ui.row(lobby)
	btn_start = ui.btn("开始对战", "Primary", func() -> void: net.start_as_host(), lr)
	err_lbl = ui.hint("", v, UiTheme.BAD, 14)
	var br := ui.row(v)
	ui.btn("返回菜单", "Ghost", back, br)
	_relay_summary()
	if tr.ok():
		relay_text.text = str(tr.js.relayText())
		tr.js.checkInvite()

func _last_btn() -> Button:
	return _copy_btn

func _code_box(parent: Node, ro: bool, ph: String) -> TextEdit:
	var t := TextEdit.new()
	t.editable = not ro
	t.placeholder_text = ph
	t.custom_minimum_size = Vector2(470, 64)
	t.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	parent.add_child(t)
	return t

## 每帧（主循环调）：线上的事、界面上的事
func process(dt: float) -> void:
	if net == null:
		return
	if not (ui.main.sim.mode == "online"):
		net.process(dt * 1000.0)       # 大厅里：打招呼、选色、ping（对局中由 Main 的主循环推进）
	for e in tr.ui_events:
		_ui_event(e)
	tr.ui_events.clear()
	if _room_hint_t > 0.0:
		_room_hint_t -= dt
		if _room_hint_t <= 0.0:
			_room_waited()

## 页面在后台：接着推进联机（不画画面）
func _bg_tick(dt: float) -> void:
	if ui.main.sim.mode == "online":
		net.process(dt)

func _ui_event(e: Dictionary) -> void:
	match str(e.get("t", "")):
		"hostCode":
			host_code.text = str(e.code)
		"answer":
			join_answer.text = str(e.code)
			join_answer.select_all()
			err("")
			net_wait.show()
		"connecting":
			btn_connect.text = "连接中"
			await ui.get_tree().create_timer(3.0).timeout
			btn_connect.text = "连接"
		"err":
			err(str(e.msg))
			if str(e.get("where", "")) == "join":
				join_answer.placeholder_text = "先完成第 ① 步"
		"relay":
			_relay_status(str(e.msg), str(e.get("cls", "")))
			if e.get("done", false):
				btn_relay_save.disabled = false
				_relay_summary()
				if e.has("text"):
					relay_text.text = str(e.text)
		"invite":
			_copy(str(e.link), btn_invite)
			ui.toast("邀请链接带着你的中继，对方点开就连，不用自己填" if bool(tr.js.hasTurnList()) else "把链接发给对方，他点开就进这个房间", 3200)
		"copied":
			if _copy_btn != null:
				_copy_btn.text = "已复制" if e.get("ok", false) else "复制失败"
				var b := _copy_btn
				var orig: String = b.get_meta("orig", "复制")
				await ui.get_tree().create_timer(1.6).timeout
				b.text = orig
		"openInvite":
			open(str(e.code))

# ---------- 打开 / 关 ----------
func open(code: String) -> void:
	_leave_all()
	net.my_look = Looks.solo.me
	_view("choose")
	err("")
	net_wait.hide()
	for t in [host_code, host_answer, join_code, join_answer]:
		t.text = ""
	room_code.text = code if code != "" else (str(tr.js.lastRoom()) if tr.ok() else "")
	_room_ui("")
	var ok := true
	if not tr.ok():
		err("联机目前只在网页版能用：用浏览器打开 jax1ng.github.io/Modou/godot-web/ 再联机。")
		ok = false
	elif not bool(tr.js.supported()):
		err("这个浏览器不支持直连，请用新版 Chrome 或 Edge。")
		ok = false
	elif bool(tr.js.embedded()):
		err("在预览框里连不上。请直接用网页版 jax1ng.github.io/Modou/godot-web/ 在浏览器里打开再联机。")
		ok = false
	elif not bool(tr.js.roomSupported()):
		manual_body.show()
	ui.show_overlay("online")
	if code != "" and ok:
		join_room(code)

func back() -> void:
	if tr.ok():
		net.leave()
		tr.js.clearHash()
	ui.to_menu()

func leave() -> void:
	if tr.ok():
		net.leave()
		tr.js.clearHash()

func restart() -> void:
	net.start_as_host()

func _leave_all() -> void:
	_room_hint_t = -1.0
	if tr.ok():
		net._reset()
		tr.js.leaveAll()

func _view(w: String) -> void:
	var lob := w == "lobby"
	intro.visible = not lob
	room_box.visible = not lob and tr.ok() and bool(tr.js.roomSupported())
	relay_head.visible = not lob
	relay_body.visible = relay_body.visible and not lob
	manual_head.visible = not lob
	if lob:
		manual_body.hide()
	choose_row.visible = not lob and w != "host" and w != "join"
	host_box.visible = w == "host"
	join_box.visible = w == "join"
	lobby.visible = lob
	if w == "host" or w == "join":
		manual_body.show()

func err(msg: String) -> void:
	err_lbl.text = msg
	err_lbl.visible = msg != ""

# ---------- 房间码 ----------
func join_room(raw: String) -> void:
	err("")
	if not tr.ok():
		return
	var res = JSON.parse_string(str(tr.js.joinRoom(raw)))
	if not (res is Dictionary) or not res.get("ok", false):
		err(str(res.get("err", "进不去")) if res is Dictionary else "进不去")
		return
	room_code.text = str(res.code)

func _room_ui(state: String) -> void:
	var in_room := tr.ok() and bool(tr.js.inRoom())
	room_tools.visible = in_room
	room_code.editable = not in_room
	btn_room_join.disabled = in_room
	btn_room_join.text = "已进房" if in_room else "进房间"
	room_status.add_theme_color_override("font_color", UiTheme.CREAM)
	_room_hint_t = -1.0
	if state == "busy":
		room_status.add_theme_color_override("font_color", UiTheme.BAD)
		room_status.text = "这个房间已经有两个人在打了，换一个房间码吧。"
		return
	if state == "" or not in_room:
		room_status.text = ""
		return
	if state == "waiting":
		room_status.text = "房间「%s」· 等对方进来…（让他输入同一个房间码，或者把邀请链接发给他）%s" % [str(tr.js.code()), " · 带着中继" if bool(tr.js.relayUsed()) else ""]
		_room_hint_t = 30.0
	elif state == "rejoining":
		room_status.text = "对方回来了，正在重新连…"
	elif state == "error":
		room_status.text = "找到对方了，握手没成功，正在重试…（一直这样就两边刷新一下网页）"

## 等了半分钟还没连上
func _room_waited() -> void:
	if not tr.ok() or not bool(tr.js.inRoom()) or net.open or ui.cur != "online":
		return
	if bool(tr.js.relayUsed()):
		room_status.text += "\n等了半分钟还没连上。如果对方已经输入同一个房间码了：两边刷新一下再试；两台设备在同一个局域网里的话，也可以用下面的「手动连接」。"
	else:
		room_status.text += "\n等了半分钟还没连上。如果对方已经输入同一个房间码了，多半是网络挡住了设备之间的直连（防火墙、对称型 NAT）：在下面「中继服务器」里填一个 TURN 中继（有一边填了就行），或者换个网络再试。"

func _leave_room() -> void:
	_leave_all()
	_room_ui("")
	tr.js.clearHash()
	err("")
	room_code.grab_focus()

func _invite() -> void:
	_copy_btn = btn_invite
	btn_invite.set_meta("orig", "复制邀请链接")
	tr.js.invite()

func _copy(text: String, b: Button) -> void:
	_copy_btn = b
	if b != null and not b.has_meta("orig"):
		b.set_meta("orig", b.text)
	DisplayServer.clipboard_set(text)
	if tr.ok():
		tr.js.copy(text)
	elif b != null:
		b.text = "已复制"

# ---------- 中继 ----------
func _relay_summary() -> void:
	var n := int(tr.js.relayCount()) if tr.ok() else 0
	relay_head.text = "中继服务器：%s（两台设备直连不通时用）" % ("已设置（%d 个中继地址）" % n if n > 0 else "未设置")

func _relay_status(msg: String, cls: String) -> void:
	relay_status.text = msg
	relay_status.add_theme_color_override("font_color", UiTheme.OK if cls == "ok" else (UiTheme.BAD if cls == "bad" else UiTheme.CREAM))

func _relay_save() -> void:
	if not tr.ok():
		return
	_relay_status("正在读取…", "")
	btn_relay_save.disabled = true
	tr.js.relaySave(relay_text.text)

func _relay_clear() -> void:
	if not tr.ok():
		return
	tr.js.relayClear()
	relay_text.text = ""
	_relay_summary()
	_relay_status("已清除，只用直连。", "")

# ---------- 手动连接 ----------
func _host() -> void:
	if not tr.ok():
		return
	_view("host")
	err("")
	host_code.text = ""
	_room_ui("")
	tr.js.host()

func _join_view() -> void:
	if not tr.ok():
		return
	_leave_all()
	_room_ui("")
	_view("join")
	err("")
	join_code.grab_focus()

func _make_answer() -> void:
	err("")
	join_answer.text = ""
	join_answer.placeholder_text = "正在生成…"
	tr.js.join(join_code.text)

func _connect() -> void:
	err("")
	tr.js.finish(host_answer.text)

# ---------- 大厅 ----------
func _status_text() -> String:
	var ms := int(round(net.rtt))
	var d := net.pick_delay() / C.SUB
	var via := "经中继" if net.via == "relay" else ("直连" if net.via == "direct" else "")
	var code := str(tr.js.code()) if tr.ok() else ""
	return "已连接%s%s · 往返 %s 毫秒 · 输入延迟 %d 帧%s" % ["（房间「%s」）" % code if code != "" else "", " · " + via if via != "" else "", str(ms) if ms > 0 else "…", d, "" if net.role == "host" else " · 等对方点开始"]

func _render_looks() -> void:
	var me := "h" if net.role == "host" else "g"
	var my: String = net.looks.get(me, "")
	var th: String = net.looks.get("g" if me == "h" else "h", "")
	for s: Swatch in looks_row.get_children():
		s.set_state(s.look_id == my, "对方" if s.look_id == th else "")

func _pick_look(id: String) -> void:
	if net.pick_look(id):
		Looks.set_me(id)
		net.my_look = id
		_render_looks()

func _on_open() -> void:
	_view("lobby")
	err("")
	net_status.text = _status_text()
	btn_start.visible = net.role == "host"
	_render_looks()

func _on_looks() -> void:
	if lobby.visible:
		_render_looks()

func _on_status() -> void:
	if lobby.visible:
		net_status.text = _status_text()

func _on_room(s: String) -> void:
	if s == "resumed":
		ui.toast("对方连回来了，接着打")
		return
	if s == "version" and ui.main.sim.mode == "online":
		tr.js.clearHash()
		ui.to_menu(net.lastDiag)
		return
	if ui.cur != "online":
		return
	if s == "version":
		tr.js.clearHash()
		_view("choose")
		_room_ui("")
		err(net.lastDiag)
		return
	if s == "busy":
		tr.js.clearHash()
		_view("choose")
		err("")
	_room_ui(s)

func _on_close(was_open: bool, stay: bool) -> void:
	if ui.main.sim.mode == "online":
		_leave_all()
		tr.js.clearHash()
		ui.to_menu("对方断开了连接" if was_open else "连接失败")
	elif ui.cur == "online" and stay:
		_view("choose")
		err("对方离开了。留在房间里等他回来，或者换个房间。")
		_room_ui("waiting")
	elif ui.cur == "online":
		_view("choose")
		_room_ui("waiting" if bool(tr.js.inRoom()) else "")
		var diag := str(tr.js.lastDiag())
		if net.lastDiag != "":
			diag = net.lastDiag
		if was_open:
			err("对方断开了连接")
		elif diag.contains("房主一直没点"):
			err(diag)
		elif bool(tr.js.relayUsed()):
			err("连不上。" + (diag if diag != "" else "点开上面「中继服务器」，按「保存并测试」看中继能不能用。"))
		else:
			err("连不上：网络可能不允许两台设备直接连接（防火墙、对称型 NAT）。点开上面「中继服务器」填一个 TURN 中继再试；两台设备在同一个局域网里的话，也可以用下面的「手动连接」。")
			relay_body.show()

## 开一局（房主点了开始，或者收到房主的 start）
func _on_begin() -> void:
	ui.main.start_online(net)
	ui.on_match_start()
