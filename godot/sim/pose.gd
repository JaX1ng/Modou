class_name Pose
extends RefCounted
## 姿势（对照 JS src/js/pose.js）。一个姿势 = 一组参数，动作就是关键帧之间插值。
## 只给画面用（逻辑层不看姿势），所以这里可以用 sin、pow。手脚的点是 [x, y]（64 位浮点，和 JS 一样，对照测试按 JS 的数比）。
##   tor 上身前倾 / head 头再往前低 / hy 髋离地多高 / dx 髋往前挪 / air 整个人往上抬 / rot 整个人转（翻滚、躺）/ spin 绕竖轴转身
##   tw 拧腰（正 = 前手那边的肩往前送）/ fe、be 肘往哪边顶 / fn、bn 膝盖往前(1)往后(-1) / ft、bt 脚尖勾多少度 / fo、bo 膝盖往侧面摆多少度
##   fh、bh 前手 / 后手拳心，相对两肩中间 [往前, 往下]；ff、bf 前脚 / 后脚脚踝 [相对髋往前, 离地多高]
##   fkh、bkh（画面临时用）膝盖往哪边顶的提示方向

var rot := 0.0
var spin := 0.0
var tor := 6.0
var head := 3.0
var hy := 71.0
var dx := 0.0
var air := 0.0
var fe := 1.0
var be := 1.0
var tw := 20.0
var fn := 1.0
var bn := 1.0
var ft := 0.0
var bt := 0.0
var fo := 0.0
var bo := 0.0
var fh := [26.0, -2.0]
var bh := [7.0, -6.0]
var ff := [25.0, 0.0]
var bf := [-30.0, 0.0]
var fkh = null   # [x, y] 或 null
var bkh = null

const NUMK := ["rot", "spin", "tor", "head", "hy", "dx", "air", "fe", "be", "tw", "fn", "bn", "ft", "bt", "fo", "bo"]
const ARRK := ["fh", "bh", "ff", "bf"]

## 出招的底子（招式关键帧没写的部分都从这里来）
const BASE := {"rot": 0, "spin": 0, "tor": 6, "head": 3, "hy": 71, "dx": 0, "air": 0, "fe": 1, "be": 1, "tw": 20, "fn": 1, "bn": 1,
	"ft": 0, "bt": 0, "fo": 0, "bo": 0, "fh": [26, -2], "bh": [7, -6], "ff": [25, 0], "bf": [-30, 0]}

## 从「只写了不一样的字段」的字典造一个完整姿势（BASE 打底）
static func mk(o = null) -> Pose:
	var p := Pose.new()
	p.apply_dict(BASE)
	if o is Dictionary:
		p.apply_dict(o)
	elif o is Pose:
		p.copy_from(o)
	return p

func apply_dict(o: Dictionary) -> void:
	for k in o:
		var v = o[k]
		if v is Array:
			set(k, [float(v[0]), float(v[1])])
		elif v is Vector2:
			set(k, [float(v.x), float(v.y)])
		else:
			set(k, float(v))

func copy_from(s: Pose) -> Pose:
	rot = s.rot; spin = s.spin; tor = s.tor; head = s.head; hy = s.hy; dx = s.dx; air = s.air
	fe = s.fe; be = s.be; tw = s.tw; fn = s.fn; bn = s.bn; ft = s.ft; bt = s.bt; fo = s.fo; bo = s.bo
	fh[0] = s.fh[0]; fh[1] = s.fh[1]; bh[0] = s.bh[0]; bh[1] = s.bh[1]
	ff[0] = s.ff[0]; ff[1] = s.ff[1]; bf[0] = s.bf[0]; bf[1] = s.bf[1]
	return self

func duplicate_pose() -> Pose:
	return Pose.new().copy_from(self)

## 角度走最短路（翻跟头、转身后 rot/spin 可能累积到 720 之类）
static func wrapDeg(d: float) -> float:
	return fposmod(d + 180.0, 360.0) - 180.0

## a → b 插值 t，写进 out；wrap：rot、spin 走最短路
static func lerpPose(a: Pose, b: Pose, t: float, out: Pose, wrap: bool) -> Pose:
	var d_rot := b.rot - a.rot
	var d_spin := b.spin - a.spin
	if wrap:
		d_rot = wrapDeg(d_rot)
		d_spin = wrapDeg(d_spin)
	var o_rot := a.rot + d_rot * t
	var o_spin := a.spin + d_spin * t
	out.tor = a.tor + (b.tor - a.tor) * t
	out.head = a.head + (b.head - a.head) * t
	out.hy = a.hy + (b.hy - a.hy) * t
	out.dx = a.dx + (b.dx - a.dx) * t
	out.air = a.air + (b.air - a.air) * t
	out.fe = a.fe + (b.fe - a.fe) * t
	out.be = a.be + (b.be - a.be) * t
	out.tw = a.tw + (b.tw - a.tw) * t
	out.fn = a.fn + (b.fn - a.fn) * t
	out.bn = a.bn + (b.bn - a.bn) * t
	out.ft = a.ft + (b.ft - a.ft) * t
	out.bt = a.bt + (b.bt - a.bt) * t
	out.fo = a.fo + (b.fo - a.fo) * t
	out.bo = a.bo + (b.bo - a.bo) * t
	out.fh[0] = a.fh[0] + (b.fh[0] - a.fh[0]) * t
	out.fh[1] = a.fh[1] + (b.fh[1] - a.fh[1]) * t
	out.bh[0] = a.bh[0] + (b.bh[0] - a.bh[0]) * t
	out.bh[1] = a.bh[1] + (b.bh[1] - a.bh[1]) * t
	out.ff[0] = a.ff[0] + (b.ff[0] - a.ff[0]) * t
	out.ff[1] = a.ff[1] + (b.ff[1] - a.ff[1]) * t
	out.bf[0] = a.bf[0] + (b.bf[0] - a.bf[0]) * t
	out.bf[1] = a.bf[1] + (b.bf[1] - a.bf[1]) * t
	if wrap:
		o_rot = wrapDeg(o_rot)
		o_spin = wrapDeg(o_spin)
	out.rot = o_rot
	out.spin = o_spin
	return out

static func ease_fn(kind: String, u: float) -> float:
	match kind:
		"io": return u * u * (3.0 - 2.0 * u)
		"out": return 1.0 - (1.0 - u) * (1.0 - u) * (1.0 - u)
		"in": return u * u
		"lin": return u
		"back":
			var s := 1.7
			return 1.0 + (s + 1.0) * pow(u - 1.0, 3.0) + s * pow(u - 1.0, 2.0)   # 冲过头再回来，出拳更有弹性
	return u

static var _TMP := Pose.new()
## 关键帧 [[时间, Pose, 缓动], …] 在 t 处的姿势（返回的是共用的临时对象，马上拷走）
static func evalKeys(keys: Array, t: float) -> Pose:
	if t <= keys[0][0]:
		return keys[0][1]
	for i in range(1, keys.size()):
		if t <= keys[i][0]:
			var f0: float = keys[i - 1][0]
			var p0: Pose = keys[i - 1][1]
			var f1: float = keys[i][0]
			var p1: Pose = keys[i][1]
			var e: String = keys[i][2]
			var span := f1 - f0
			if span == 0.0:
				span = 1.0
			var u := clampf((t - f0) / span, 0.0, 1.0)
			return lerpPose(p0, p1, ease_fn(e, u), _TMP, false)
	return keys[keys.size() - 1][1]

# ---------- 基础姿势（和 JS POSE 一样） ----------
const P_JUP := {"hy": 56, "tor": 10, "head": -2, "tw": 10, "ff": [13, 20], "bf": [-3, 8], "fh": [12, 40], "bh": [-14, 39], "fe": 1, "be": -1}
const P_JTOP := {"hy": 56, "tor": 14, "head": 0, "tw": 10, "ff": [8, 13], "bf": [1, 10], "fh": [14, 39], "bh": [-16, 38], "fe": 1, "be": -1}
const P_JDN := {"hy": 56, "tor": 8, "head": -1, "tw": 10, "ff": [12, 5], "bf": [-5, 3], "fh": [16, 38], "bh": [-16, 38], "fe": 1, "be": -1}
const P_JLEAP := {"hy": 56, "tor": 22, "head": -4, "tw": 10, "ff": [15, 19], "bf": [-6, 10], "fh": [16, 37], "bh": [-18, 36], "fe": 1, "be": -1}
const P_JLEAP_DN := {"hy": 56, "tor": 12, "head": -3, "tw": 10, "ff": [14, 7], "bf": [-7, 5], "fh": [17, 37], "bh": [-17, 36], "fe": 1, "be": -1}

static var POSE := {}
static var STAGGER_KEYS := []
static var GETUP_KEYS := []

static func _static_init() -> void:
	POSE = {
		"stance": mk({"tor": 6, "head": 3, "hy": 73, "tw": 22, "ff": [24, 0], "bf": [-29, 0], "fh": [27, -1], "bh": [11, -6]}),
		"run": mk({"tor": 26, "head": -16, "hy": 62, "fe": 0.2, "be": 0.2, "tw": 0}),
		"crouch": mk({"hy": 50, "tor": 24, "head": -6, "tw": 18, "ff": [27, 0], "bf": [-25, 0], "fh": [24, 3], "bh": [8, -3]}),
		"block": mk({"hy": 70, "tor": 2, "head": 8, "dx": -3, "tw": 8, "fh": [17, -17], "bh": [13, -13], "ff": [24, 0], "bf": [-33, 0]}),
		"cblock": mk({"hy": 50, "tor": 18, "head": 8, "tw": 8, "ff": [26, 0], "bf": [-25, 0], "fh": [19, -13], "bh": [15, -10]}),
		"squat": mk({"hy": 54, "tor": 20, "head": -6, "tw": 10, "ff": [25, 0], "bf": [-27, 0], "fh": [24, 2], "bh": [-4, 8]}),
		"land": mk({"hy": 52, "tor": 24, "head": -4, "tw": 10, "ff": [30, 0], "bf": [-30, 0], "fh": [28, 2], "bh": [-10, 6]}),
		"jup": mk(P_JUP), "jtop": mk(P_JTOP), "jdn": mk(P_JDN), "leap": mk(P_JLEAP), "leapDn": mk(P_JLEAP_DN),
		"thrown": mk({"tor": 14, "head": 18, "hy": 52, "tw": 0, "fh": [28, -42], "bh": [-6, -38], "ff": [32, 34], "bf": [-14, 22]}),
		"tuck": mk({"hy": 52, "tor": 40, "head": 16, "tw": 0, "ff": [4, 33], "bf": [-3, 30], "fh": [20, 14], "bh": [12, 18]}),
		"hurtL": mk({"tor": -20, "head": -24, "dx": -10, "hy": 72, "tw": -10, "fh": [12, -6], "bh": [-4, -2], "ff": [30, 0], "bf": [-32, 0]}),
		"hurtH": mk({"tor": 36, "head": 28, "dx": -14, "hy": 62, "tw": 0, "fh": [22, 22], "bh": [10, 26], "ff": [22, 0], "bf": [-38, 0]}),
		"hurtAir": mk({"rot": -30, "tor": -14, "head": -26, "tw": 0, "fh": [-10, -30], "bh": [-24, -16], "ff": [32, 28], "bf": [2, 14]}),
		"pulled": mk({"tor": 30, "head": 18, "dx": 8, "hy": 64, "tw": 0, "fh": [20, 16], "bh": [8, 20], "ff": [36, 0], "bf": [-14, 0]}),
		"reel": mk({"tor": -32, "head": -30, "dx": -14, "hy": 74, "tw": -16, "fh": [-16, -32], "bh": [-30, -20], "ff": [38, 4], "bf": [-26, 0]}),
		"recoil": mk({"tor": -16, "head": -18, "dx": -12, "hy": 70, "tw": 0, "fh": [30, -24], "bh": [18, -20], "ff": [30, 0], "bf": [-38, 0]}),
		"parry": mk({"tor": -6, "head": 8, "dx": -6, "hy": 70, "tw": 26, "fh": [44, -28], "fe": -1, "bh": [12, -14], "ff": [24, 0], "bf": [-34, 0]}),
		"fall": mk({"rot": -60, "tor": -16, "head": -24, "tw": 0, "ff": [40, 36], "bf": [16, 28], "fh": [-14, -34], "bh": [-26, -24]}),
		"lie": mk({"rot": -90, "tor": 4, "head": -20, "hy": 83.5, "air": 0, "tw": 0, "ff": [-7, 3], "bf": [-7, -2], "fh": [-6, 46], "bh": [-5, 45.5], "fe": 1, "be": 1}),
		"lieFlat": mk({"rot": -90, "tor": 4, "head": -20, "hy": 83.5, "air": 0, "tw": 0, "ff": [-6, -2], "bf": [-7, -1], "fh": [-6, 46], "bh": [-5, 45.5], "fe": 1, "be": 1}),
		"rise": mk({"hy": 56, "tor": 18, "head": -2, "dx": -2, "tw": 0, "ff": [26, 0], "bf": [-28, 0], "fh": [22, 14], "bh": [10, 20]}),
		"win": mk({"tor": -2, "head": -14, "hy": 74, "tw": 10, "fh": [6, -54], "bh": [10, -4], "ff": [22, 0], "bf": [-26, 0]}),
	}
	STAGGER_KEYS = [
		[0.0, mk({"tor": -16, "head": -22, "dx": 10, "hy": 72, "tw": 0, "fh": [-18, -8], "bh": [-28, 2], "ff": [26, 0], "bf": [-28, 0]}), "io"],
		[0.14, mk({"tor": -10, "head": -16, "dx": 13, "hy": 71, "tw": 0, "fh": [-22, -4], "bh": [-30, 6], "ff": [30, 8], "bf": [-26, 0]}), "out"],
		[0.38, mk({"tor": 38, "head": 18, "dx": 16, "hy": 60, "tw": 0, "fh": [34, 22], "bh": [18, 30], "ff": [48, 14], "bf": [-32, 0]}), "io"],
		[0.6, mk({"tor": 34, "head": 12, "dx": 12, "hy": 62, "tw": 0, "fh": [30, 16], "bh": [-16, -14], "ff": [42, 0], "bf": [-14, 8]}), "io"],
		[0.82, mk({"tor": 16, "head": 4, "dx": 4, "hy": 68, "tw": 10, "fh": [26, 4], "bh": [10, 6], "ff": [32, 0], "bf": [-24, 0]}), "io"],
		[1.0, POSE.stance, "io"],
	]
	var g := C.TFH(13)
	GETUP_KEYS = [
		[0.0, POSE.lie, "io"],
		[g * 0.4, mk({"rot": -38, "tor": 34, "hy": 34, "head": 0, "tw": 0, "ff": [34, 0], "bf": [2, 0], "fh": [-12, 32], "bh": [-22, 36]}), "io"],
		[g * 0.78, mk({"hy": 42, "tor": 30, "head": -8, "tw": 0, "ff": [30, 0], "bf": [-28, 0], "fh": [24, 14], "bh": [10, 20]}), "io"],
		[g, POSE.rise, "io"],
	]

## 两节骨骼 IK（2D，画面用）：返回 [关节x, 关节y, 末端x, 末端y, want]；side（-1~1）给了就照它在两个解之间放
static func ik(px: float, py: float, tx: float, ty: float, a: float, b: float, hx: float, hy_: float, side = null) -> Array:
	var ddx := tx - px
	var ddy := ty - py
	var d0 := sqrt(ddx * ddx + ddy * ddy)
	if d0 == 0.0:
		d0 = 1e-3
	var d := clampf(d0, absf(a - b) + 1e-3, a + b - 1e-3)
	var ux := ddx / d0
	var uy := ddy / d0
	var A := acos(clampf((a * a + d * d - b * b) / (2.0 * a * d), -1.0, 1.0))
	var c := cos(A)
	var s := sin(A)
	var j1x := px + (ux * c - uy * s) * a
	var j1y := py + (ux * s + uy * c) * a
	var j2x := px + (ux * c + uy * s) * a
	var j2y := py + (-ux * s + uy * c) * a
	var s1 := (j1x - px) * hx + (j1y - py) * hy_
	var s2 := (j2x - px) * hx + (j2y - py) * hy_
	var want := 1.0 if s1 >= s2 else -1.0
	var ex := px + ux * d
	var ey := py + uy * d
	if side == null:
		return [j1x, j1y, ex, ey, want] if want > 0 else [j2x, j2y, ex, ey, want]
	var w := (float(side) + 1.0) / 2.0
	return [j2x + (j1x - j2x) * w, j2y + (j1y - j2y) * w, ex, ey, want]
