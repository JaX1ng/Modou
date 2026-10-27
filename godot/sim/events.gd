class_name SimEvents
extends RefCounted
## 逻辑层 → 画面层的「事件」：特效、飘字、印章、大字、声音、震屏。逻辑层只说「发生了什么」，画面层决定怎么画、放什么声音。
## 对照 JS fx.js 的 fxDo / FXREC：联机回滚重算（quiet）时先攒着，算完和原来那几帧比，多出来的才补放，原来就放过的不再放一遍。

var out: Array = []          # 画面层每帧取走：[{type, …}, …]
var quiet := false           # 回滚重算时 true
var online := false
var frame_fn: Callable       # 当前步数（GameSim.frame）
var _log := {}               # 步数 → [签名…]（联机时记下放过什么）
var _fresh = null            # 回滚重算时攒着的 [[步数, 签名, 事件], …]

## 发一个事件。sig：去重用的签名（种类 + 字）
func emit(sig: String, ev: Dictionary) -> void:
	var f: int = frame_fn.call()
	if quiet:
		if _fresh != null:
			_fresh.append([f, sig, ev])
		return
	if online:
		if not _log.has(f):
			_log[f] = []
			for k in _log.keys():
				if k < f - 60 * C.SUB:
					_log.erase(k)
		_log[f].append(sig)
	out.append(ev)

func roll_start() -> void:
	_fresh = []

## 重算的是步数在 (g0, g1] 的那几步：这几步的记录换成新时间线的，新时间线里多出来的补放
func roll_end(g0: int, g1: int) -> void:
	var fresh: Array = _fresh if _fresh != null else []
	_fresh = null
	var skip := {}
	for f in range(g0 + 1, g1 + 1):
		if _log.has(f):
			for s in _log[f]:
				skip[s] = skip.get(s, 0) + 1
			_log.erase(f)
	for item in fresh:
		var f: int = item[0]
		var s: String = item[1]
		if not _log.has(f):
			_log[f] = []
		_log[f].append(s)
		var k: int = skip.get(s, 0)
		if k > 0:
			skip[s] = k - 1
		else:
			out.append(item[2])

func clear_log() -> void:
	_log.clear()

# ---------- 便捷写法 ----------
## 声音：k = 种类（hit / block / whoosh / land / clash / parry / burst / stamp / finale / victory / beat …），p = 力度或参数
func snd(k: String, p = null) -> void:
	emit("S" + k, {"type": "snd", "k": k, "p": p})

## 飘字。text：字，或者分段 [[字, 谁的颜色(idx)], …]；own：谁的颜色（idx，或 [a, b] 两人各半，-1 = 墨色）；
## who：挂在谁身上（idx，-1 = 场地上 x 处）；at：挂在哪（head 头顶 / sh 肩膀 / contact 打中的地方 / floor 地面上方 / mid 两人中间）；dy、dx：再偏多少（逻辑像素，往上为负）
func tag(text, own, size: float, who: int, at: String, dy: float, dx := 0.0, x := 0.0) -> void:
	var s: String = text if text is String else _join(text)
	emit("tag" + s, {"type": "tag", "text": text, "own": own, "size": size, "who": who, "at": at, "dy": dy, "dx": dx, "x": x})

## 印章（招式名）：own 出招的人
func stamp(text: String, size: float, own: int) -> void:
	emit("stamp" + text, {"type": "stamp", "text": text, "size": size, "own": own})
	snd("stamp")

## 画面正中的大字（回合、战、胜负已分、某某 胜……）；own = -1 墨色
func announce(text: String, sub: String, life: float, size: float, own := -1) -> void:
	emit("announce" + text, {"type": "announce", "text": text, "sub": sub, "life": life, "size": size, "own": own})

## 打击特效、动作特效：kind 种类，a 出招的人，b 挨打的人（-1 没有），data 别的
func fx(kind: String, a: int, b := -1, data := {}) -> void:
	var ev := {"type": "fx", "kind": kind, "a": a, "b": b}
	ev.merge(data)
	emit("fx" + kind, ev)

func shake(v: float) -> void:
	emit("shake", {"type": "shake", "v": v})

static func _join(parts: Array) -> String:
	var s := ""
	for p in parts:
		s += String(p[0])
	return s
