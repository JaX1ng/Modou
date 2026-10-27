class_name SoundBank
extends Node
## 声音（对照 JS fx.js 的 Sound）：tools/render_sfx.mjs 从 JS 版原样录下来的 wav（压缩、限幅按默认音量录进去了），按名字挑一个放。
## 每种录了几遍（JS 每次响都随机差一点），轮着随机挑。音量：设置里 0~100，曲线照 JS（gainFor(v) / gainFor(50)）。
## 逻辑层的声音事件（SimEvents 的 snd）：hit(力度) / whoosh(力度) / block / crash / tumble / stamp / land / clash / parry / burst / finale / victory(赢没赢) / beat([字, 力度])。
## 菜单按钮按下去一声木鱼（ui_press），设置里调音量响一声（preview）。以后换 Jack 给的声音：换掉 assets/sfx 里的文件、sfx.json 写上就行。

const DIR := "res://assets/sfx/"
const VOL_SHIFT := 2.24
const BEAT_KIT := {"咚": "taiko", "嗵": "taikoLo", "嗒": "rim", "嚓": "cha", "锵": "qiang", "铮": "zhengUp", "和": "zhengChord"}
const VOICES := 24

var enabled := true
var vol := 50
var streams := {}          # 名字 → AudioStream
var variants := {}         # 前缀 → [名字…]
var hit_p: Array = []
var whoosh_p: Array = []
var players: Array = []
var _next := 0
var _ui_t := 0
var _rng := RandomNumberGenerator.new()
var _bus := "SFX"

func _ready() -> void:
	_rng.seed = 0x2545f491
	_setup_bus()
	var txt := FileAccess.get_file_as_string(DIR + "sfx.json")
	var m = JSON.parse_string(txt)
	if not (m is Dictionary):
		push_warning("没有声音表 sfx.json")
		return
	hit_p = m.get("hit", [])
	whoosh_p = m.get("whoosh", [])
	for name in m.files:
		var s = load(DIR + name + ".wav")
		if s == null:
			continue
		streams[name] = s
		var pre: String = name.substr(0, name.rfind("-"))
		if not variants.has(pre):
			variants[pre] = []
		variants[pre].append(name)
	for i in VOICES:
		var p := AudioStreamPlayer.new()
		p.bus = _bus
		add_child(p)
		players.append(p)
	set_volume(vol)

func _setup_bus() -> void:
	var idx := AudioServer.get_bus_index(_bus)
	if idx < 0:
		AudioServer.add_bus()
		idx = AudioServer.bus_count - 1
		AudioServer.set_bus_name(idx, _bus)
		AudioServer.set_bus_send(idx, "Master")

## JS 的音量曲线（out 那一级）：0 没声，50 默认，往上最多响到默认的 2.5 倍
static func gain_for(v: int) -> float:
	return 0.0 if v <= 0 else 1.3 * pow(v * VOL_SHIFT / 50.0, 1.32)

func set_volume(v: int) -> void:
	vol = clampi(v, 0, 100)
	var idx := AudioServer.get_bus_index(_bus)
	if idx < 0:
		return
	var g := gain_for(vol) / gain_for(50)
	AudioServer.set_bus_mute(idx, g <= 0.0)
	AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(g, 1e-4)))

func ok() -> bool:
	return enabled and vol > 0 and not streams.is_empty()

## 放一种声音的随机一遍；gain：线性音量倍数
func _fire(prefix: String, gain := 1.0) -> void:
	var list: Array = variants.get(prefix, [])
	if list.is_empty():
		return
	var name: String = list[_rng.randi() % list.size()]
	var p: AudioStreamPlayer = null
	for i in VOICES:
		var q: AudioStreamPlayer = players[(_next + i) % VOICES]
		if not q.playing:
			p = q
			_next = (_next + i + 1) % VOICES
			break
	if p == null:
		p = players[_next]
		_next = (_next + 1) % VOICES
	p.stream = streams[name]
	p.volume_db = linear_to_db(maxf(gain, 1e-4))
	p.play()

static func _pk(p: float) -> String:
	return "%03d" % int(round(p * 100.0))

static func _nearest(list: Array, p: float) -> float:
	var best: float = list[0]
	for x in list:
		if absf(float(x) - p) < absf(best - p):
			best = x
	return best

## 逻辑层的声音事件
func play(k: String, p = null) -> void:
	if not ok():
		return
	match k:
		"hit":
			_fire("hit-" + _pk(_nearest(hit_p, float(p) if p != null else 0.5)))
		"whoosh":
			_fire("whoosh-" + _pk(_nearest(whoosh_p, float(p) if p != null else 0.5)))
		"victory":
			_fire("victory-win" if p else "victory-lose")
		"beat":
			if p is Array and p.size() >= 1:
				var kit: String = BEAT_KIT.get(str(p[0]), "")
				var pw: float = float(p[1]) if p.size() > 1 and p[1] != null else 1.0
				if kit != "":
					_fire("beat-" + kit, pw)
		_:
			_fire(k)

## 菜单按钮按下去：一声木鱼（菜单背景里也响；连着按 40 毫秒内只响一声）
func ui_press() -> void:
	if not ok():
		return
	var now := Time.get_ticks_msec()
	if now - _ui_t < 40:
		return
	_ui_t = now
	_fire("ui")

## 设置里调音量：响一声给你听
func preview() -> void:
	if not ok():
		return
	_fire("hit-070")
