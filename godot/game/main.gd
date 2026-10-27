class_name Main
extends Node
## 整个游戏：逻辑（GameSim）+ 画面（场景、两个人、镜头、特效、血条）+ 输入 + 主循环（对照 JS ui.js 的 loop）。
## 逻辑一秒 240 步，和屏幕刷新率无关：刚好整数步（60Hz 4 步、120Hz 2 步）就对齐不插值；别的刷新率在两步之间插着画（RA）。
## 菜单、设置、联机这些界面在 ui/ 里，挂在这下面（Ui）。

const S := Rig.S

var sim := GameSim.new()
var anims: Array = []
var views: Array = []
var world: Node3D
var stage: StageView
var cam: CameraRig
var fx := Fx.new()
var fx_front: FxDraw
var fx_back: FxDraw
var fx_stamps: FxDraw
var back_vp: SubViewport
var back_quad: MeshInstance3D
var hud: Hud
var overlay: Overlay
var hud_layer: CanvasLayer
var fx_layer: CanvasLayer
var ui: Node
var pads := [Keys.Pad.new(), Keys.Pad.new()]
var paused := false
var reduce_motion := false

var _acc := 0.0
var _last := 0.0
var _raf := C.FRAME_MS
var _aligned := true
var RA := 1.0
var _rdt := C.FRAME_MS
var _rng := 12345

func _ready() -> void:
	Keys.load_keys()
	Looks.load_looks()
	var compat := RenderingServer.get_current_rendering_method() == "gl_compatibility"
	get_viewport().msaa_3d = Viewport.MSAA_2X
	if not compat:
		get_viewport().msaa_2d = Viewport.MSAA_4X
	world = Node3D.new()
	world.name = "World"
	add_child(world)
	stage = StageView.new()
	world.add_child(stage)
	cam = CameraRig.new()
	world.add_child(cam)
	# 两个人：玩家一那边「侠」、玩家二那边「僧」（照参考图）
	for i in 2:
		var a := FighterAnim.new(sim.p[i])
		anims.append(a)
	anims[0].opp = anims[1]
	anims[1].opp = anims[0]
	for i in 2:
		var v := FighterView.new()
		v.name = "Fighter%d" % i
		v.depth = 0.0 if i == 0 else 0.07
		world.add_child(v)
		v.setup(sim.p[i], anims[i], "xia" if i == 0 else "seng")
		views.append(v)
		anims[i].on_qi = func(an: FighterAnim) -> void: fx.emit_qi(an)
		anims[i].on_dust = func(x: float, y: float, n: int) -> void: fx.dust(x, y, n)
	fx.anims = anims
	# 画在人身后的特效：先画进一张透明的图，贴在人身后一点点的一块板上（盖住整个画面那么大，像素和屏幕一一对上）
	back_vp = SubViewport.new()
	back_vp.transparent_bg = true
	back_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	if not compat:
		back_vp.msaa_2d = Viewport.MSAA_4X
	add_child(back_vp)
	fx_back = FxDraw.new()
	fx_back.layer = "back"
	fx_back.fxs = fx
	fx_back.anims = anims
	fx_back.cam = cam
	back_vp.add_child(fx_back)
	back_quad = MeshInstance3D.new()
	back_quad.mesh = QuadMesh.new()
	var bm := StandardMaterial3D.new()
	bm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	bm.no_depth_test = true
	bm.disable_fog = true
	bm.render_priority = 0
	bm.albedo_texture = back_vp.get_texture()
	back_quad.material_override = bm
	back_quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	world.add_child(back_quad)
	# 人前面的特效、血条、大字
	fx_layer = CanvasLayer.new()
	fx_layer.layer = 1
	add_child(fx_layer)
	fx_front = FxDraw.new()
	fx_front.layer = "front"
	fx_front.fxs = fx
	fx_front.anims = anims
	fx_front.cam = cam
	fx_layer.add_child(fx_front)
	hud_layer = CanvasLayer.new()
	hud_layer.layer = 2
	add_child(hud_layer)
	hud = Hud.new()
	hud.sim = sim
	hud.cam = cam
	hud.anims = anims
	hud.views = views
	hud_layer.add_child(hud)
	# 印章：在血条、训练面板上面
	fx_stamps = FxDraw.new()
	fx_stamps.layer = "stamps"
	fx_stamps.fxs = fx
	fx_stamps.anims = anims
	fx_stamps.cam = cam
	fx_stamps.hud = hud
	hud_layer.add_child(fx_stamps)
	overlay = Overlay.new()
	overlay.main = self
	hud_layer.add_child(overlay)
	# 逻辑层 → 画面
	sim.on_reset = func() -> void:
		for a in anims:
			a.reset()
	sim.on_visual_step = _visual_step
	sim.ev.online = false
	for i in 2:
		var ii := i
		pads[i].key_dash = func() -> bool: return Keys.key_dash(ii, sim.mode)
	_last = Time.get_ticks_usec() / 1000.0
	start_attract()
	# 界面（菜单等）
	var ui_script = load("res://ui/ui.gd")
	if ui_script != null:
		ui = ui_script.new()
		ui.main = self
		add_child(ui)

func rnd(a: float, b: float) -> float:
	_rng = (_rng * 1664525 + 1013904223) & 0xFFFFFFFF
	return a + (b - a) * (_rng / 4294967296.0)

# ---------- 开局 ----------
func start_attract() -> void:
	paused = false
	sim.startAttract(Brain.new(sim.p[0], "normal"), Brain.new(sim.p[1], "normal"))
	apply_looks("attract")
	sim.p[0].label = ""
	sim.p[1].label = ""
	_reset_camera()

## mode：pve（人机，diff 难度）/ pvp（双人）/ train（训练场）
func start_match(mode: String, diff := "normal", dummy := "stand") -> void:
	paused = false
	for p in pads:
		p.clear()
	sim.diff = diff
	sim.dummyMode = dummy
	var b1 = null
	if mode == "pve":
		b1 = Brain.new(sim.p[1], diff)
	elif mode == "train":
		b1 = Dummy.new(sim.p[1], dummy)
	sim.startMatch(mode, null, b1)
	apply_looks(mode)
	if mode == "pve":
		sim.p[0].label = "玩家"
		sim.p[1].label = "电脑 · " + Brain.LEVEL_NAME.get(diff, diff)
	elif mode == "train":
		sim.p[0].label = "练习"
		sim.p[1].label = "木桩"
	elif mode == "pvp":
		sim.p[0].label = "玩家一"
		sim.p[1].label = "玩家二"
	_reset_camera()

func _reset_camera() -> void:
	cam.camX = C.STAGE_W / 2.0
	cam.camZ = C.ZOOM
	fx.clear()

## 换人物颜色（只是画面）
func set_looks(a: String, b: String) -> void:
	sim.p[0].setLook(a)
	sim.p[1].setLook(b)
	views[0].set_look(a)
	views[1].set_look(b)

## 照模式穿上颜色（对照 JS applyLooks）：双人用双人那两个、联机用两边商量好的、别的用人机那两个；训练场的桩叫「桩」
func apply_looks(mode: String, net_looks: Dictionary = {}) -> void:
	var L := Looks.for_mode(mode, net_looks)
	set_looks(L[0], L[1])
	if mode == "train":
		sim.p[1].name = "桩"

# ---------- 每一步的画面（逻辑层每走一步调一次，回滚重算时不调） ----------
func _visual_step(frozen: bool) -> void:
	# 这一步逻辑层发的事件：特效、飘字、印章、大字（这时骨骼还是上一步的，和 JS 当场放特效时一样）
	for e in sim.ev.out:
		if e.type == "snd":
			_sound(e)
		else:
			fx.handle(e)
	sim.ev.out.clear()
	if not frozen:
		for i in 2:
			fx.per_step(i)
	for a in anims:
		a.keepPrev()
	anims[0].animate(frozen, sim.frame)
	anims[1].animate(frozen, sim.frame)
	fx.step()

func _sound(e: Dictionary) -> void:
	if ui != null and ui.has_method("play_sound"):
		ui.play_sound(e.k, e.p)

# ---------- 输入 ----------
func _unhandled_input(e: InputEvent) -> void:
	if ui != null and ui.has_method("wants_input") and ui.wants_input(e):
		return
	var code := Keys.code_of(e)
	if code == "":
		return
	var pressed := false
	var echo := false
	if e is InputEventKey:
		pressed = e.pressed
		echo = e.echo
	elif e is InputEventMouseButton:
		pressed = e.pressed
	if sim.mode == "attract" or paused:
		return
	var r := Keys.route(code, sim.mode)
	if r.is_empty():
		return
	if pressed:
		pads[r[0]].down(r[1], echo)
	else:
		pads[r[0]].up(r[1])
	get_viewport().set_input_as_handled()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		for p in pads:
			p.clear()

# ---------- 主循环 ----------
func _process(_delta: float) -> void:
	var now := Time.get_ticks_usec() / 1000.0
	var dt := minf(100.0, now - _last)
	_rdt = clampf(now - _last, 0.0, 100.0)
	_last = now
	_raf += (dt - _raf) * 0.05
	var k := maxi(1, int(C.jsround(_raf / C.STEP_MS)))
	var off := absf(_raf - k * C.STEP_MS)
	if (off > 0.8) if _aligned else (off < 0.4):
		_aligned = not _aligned
	if _aligned and absf(dt - k * C.STEP_MS) < 1.2:
		dt = k * C.STEP_MS
	if not paused and not (ui != null and ui.has_method("blocks_sim") and ui.blocks_sim()):
		_acc += dt * sim.timeScale
		var n := 0
		while _acc >= C.STEP_MS - 1e-6 and n < 5 * C.SUB:
			sim.simTick([pads[0].sample(), pads[1].sample()])
			_acc -= C.STEP_MS
			n += 1
		if n >= 5 * C.SUB:
			_acc = 0.0
		RA = clampf(_acc / C.STEP_MS, 0.0, 1.0) if (not _aligned or sim.timeScale < 1.0) else 1.0
	render()

## 画一帧：两个人摆好、镜头跟上、特效层对上镜头
func render() -> void:
	var vs := get_viewport().get_visible_rect().size
	cam.view_for(vs.x, vs.y)
	cam.reduce_motion = reduce_motion
	cam.shake = fx.shake
	cam.punch = fx.punch
	for v in views:
		v.reduce_motion = reduce_motion
		v.update_pose(RA)
	var ax := _view_x(0)
	var bx := _view_x(1)
	var local := 0
	cam.follow(_rdt, sim.mode, ax, bx, local, maxf(sim.p[0].alt, sim.p[1].alt), int(sim.frame / C.SUB), rnd)
	# 特效层：场地坐标 → 屏幕像素
	var kpx := vs.x / cam.VW
	var z := cam.zz()
	var t := Transform2D(0.0, Vector2(z * kpx, z * kpx), 0.0, Vector2((cam.VW / 2.0 + cam.shX - cam.camX * z) * kpx, (cam.FY + cam.camLift * z + cam.shY - C.FLOOR * z) * kpx))
	for d in [fx_front, fx_back, fx_stamps]:
		d.transform = t
		d.RA = RA
		d.frame = sim.frame
		d.mode = sim.mode
		d.reduce_motion = reduce_motion
		d.queue_redraw()
	# 身后那一层：图和屏幕一样大，板子放在人身后一点点、正好盖满镜头看到的那么大
	if back_vp.size != Vector2i(vs):
		back_vp.size = Vector2i(vs)
	var depth := cam.position.z + 0.35
	var hh := 2.0 * depth * tan(deg_to_rad(cam.fov) / 2.0)
	back_quad.position = Vector3(cam.position.x, cam.position.y, -0.35)
	(back_quad.mesh as QuadMesh).size = Vector2(hh * vs.x / vs.y, hh)
	hud.scale = Vector2(kpx, kpx)
	hud.queue_redraw()
	overlay.scale = Vector2(kpx, kpx)
	overlay.queue_redraw()

## 这一刻画在哪（两步之间插值）
func _view_x(i: int) -> float:
	var a: FighterAnim = anims[i]
	if RA < 1.0 and not a.vp.is_empty() and absf(float(a.vp.x) - sim.p[i].x) <= 90.0:
		return lerpf(a.vp.x, sim.p[i].x, RA)
	return sim.p[i].x
