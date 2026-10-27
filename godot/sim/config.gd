class_name C
extends RefCounted
## 全局常量（逻辑层）。对照 JS 版 src/js/config.js：名字、数值、算法一模一样（搬家期间不改规则、不改数值）。
## 规矩（联机靠「同样输入 → 同样结果」）：逻辑层只用 float（64 位）和 int，不用 Vector2/3（32 位）、不用 Godot 的随机数、
## 不用 sin/pow 这类函数；四舍五入一律用 jsround()（JS 的 Math.round：.5 往大的方向取，Godot 的 round() 是往远离 0 取）。

const VERSION := "3.0.0-alpha.1"

# ---------- 时间（2.6）：逻辑一秒 240 步，一帧 = 4 步，一步 = 0.25 帧 ----------
const SIM_HZ := 240
const SUB := 4
const DT := 0.25
const FE := 0.75                      # 1 - DT
const STEP_MS := 1000.0 / 240.0
const FRAME_MS := 1000.0 / 60.0

## JS 的 Math.round（.5 往 +∞ 取）
static func jsround(x: float) -> float:
	return floorf(x + 0.5)

## 取到 DT 的整数倍（帧数用）
static func grid(n: float) -> float:
	return jsround(n * SUB) / SUB

## f 的 DT 次方（SUB 是 2 的幂：开两次方）
static func rootDT(f: float) -> float:
	var r := f
	var n := SUB
	while n > 1:
		r = sqrt(r)
		n >>= 1
	return r

## 每帧「先走 v、再 v *= f」→ 每步「走 v·c、再 v *= r」；cp：先乘衰减再走时每步位移乘多少
static func damp(f: float) -> Array:
	var r := rootDT(f)
	var c := DT if f == 1.0 else (1.0 - r) / (1.0 - f)
	return [r, c, c * f / r]

static func lerpK(k: float) -> float:
	return 1.0 - rootDT(1.0 - k)

const GH := (0.25 - 0.25 * 0.25) / 2.0   # 重力分步：(DT - DT²)/2
static var KB_DAMP_R: float
static var KB_DAMP_C: float

# ---------- 节奏 ----------
const TEMPO := 1.07
const TEMPO2 := 1.07 * 1.07
const HIT_TEMPO := 1.05
const OPEN_TEMPO := 1.12
const REACT_TEMPO := 1.0
const ATK_TEMPO := 1.075

static func TF(n: float) -> float:
	return jsround(n * TEMPO * HIT_TEMPO)

static func TFO(n: float) -> float:
	return jsround(n * TEMPO * HIT_TEMPO * OPEN_TEMPO)

static func TFH(n: float) -> float:
	return jsround(n * TEMPO * REACT_TEMPO)

static func TA(n: float) -> float:
	return grid(n * ATK_TEMPO)

# ---------- 场地 ----------
const W := 1200.0
const H := 600.0
const FLOOR := 520.0
const PUSH := 25.0
const STAGE_W := 1600.0
const WALL_L := 64.0
const WALL_R := 1536.0
const START_GAP := 360.0
const ZOOM := 1.86
const ZOOM_PVP_MIN := 1.24
const CAM_MARGIN := 80.0
static var MAXD_PVP: float
const MAX_HP := 400.0
const DUMMY_HP := 3000.0
const DUMMY_REFILL := 0.3

# ---------- 移动 ----------
const RUN_START := 4.2 / 1.07
const RUN_MAX := 6.8 / 1.07
const RUN_ACC := 0.4 / (1.07 * 1.07)
const DTAP_WIN := 12.0
const DASH_CANCEL := 5.0
const DASH_TURN_KV := 4.0
static var DASH_IN_WIN: float
const DASH_IN_MUL := 1.2
const DASH_IN_BSTUN := 4.0
static var RUN_CHARGE: float
const SOFT_PUSH := 2.0 / 1.07
const FACE_SNAP := 52.0
const BLOCK_WALK := 1.8 / 1.07
const SLIP_PAST := 62.0
const SLIP_MIN := 70.0
const SLIP_MAX := 150.0
static var SLIP_CANCEL: float
const SLIP_ELBOW_AT := 30.0
const SLIP_CAUGHT_MUL := 1.3
static var SLIP_CAUGHT_STUN: float
static var STAGGER: float
const STAGGER_KB := 3.0
const ASSIST_R := 170.0
const FACE_HYST := 6.0

# ---------- 跳跃与空中 ----------
const GRAV := 0.92 / (1.07 * 1.07)
const JUMP_V := 12.7 / 1.07
const JUMP_VX := 6.2 / 1.07
const RUN_CARRY := 1.15
const LEAP_VX := 6.6 / 1.07
const AIR_ACC := 0.35 / (1.07 * 1.07)
const AIR_DRIFT := 3.0 / 1.07
const AIR_DRAG := 0.9719
static var AIR_DRAG_R: float
static var AIR_DRAG_C: float
static var AIR_DRAG_CP: float
const AIR_BONUS := 1.35
const AIR_SAFE := 60.0
const AIR_VREACH := 105.0
const DIVE_HOP := 5.0 / 1.07
const DIVE_VX := 7.0 / 1.07
const DIVE_VZ := 9.5 / 1.07
const DIVE_CROUCH_MUL := 1.3
const DIVE_AA_MUL := 1.5
const DIVE_PUNCH_MUL := 1.4
const DIVE_AA_ALT := 92.0
const DIVE_RIDE := 4.2 / 1.07
const DIVE_AIM := 20.0
const DIVE_LAND_GAP := 56.0
const TUMBLE_VX := 8.65 / 1.07
const TUMBLE_VZ := 12.0 / 1.07
const DIVE_BLOCK_ADV := 17.0
const BODY_SPAN := 50.0
const TUMBLE_KEEP := 0.5
const TUMBLE_LAND := 3.0
const KICK_AA_ALT := 100.0

# ---------- 出招节奏 ----------
static var CHAIN_WIN: float
const BUF_WIN := 8.0
const PAIR_WIN := 3.0
const HITSTOP := 1.15
const BLOCK_KEEP := 0.3
static var SLOW_JAB_FRAMES: float
static var SLOW_JAB_ADD: float
static var LIE_HIT: float
static var LIE_GROUND: float
static var LIE_AIR: float
static var GETUP: float
static var RISE: float
static var RISE_ROLL: float
static var LIE_CRASH: float
const ROUND_FRAMES := 300.0 * 60.0
const WIN_ROUNDS := 3

# ---------- 交手 ----------
const TRADE_LEAD := 3.0
const BEAT_LEAD := 8.0
const CLASH_KEEP := 0.5
static var CLASH_STUN: float
const CLASH_KB := 7.5
const PRESS_KEEP := 0.3
static var PRESS_STUN: float
const COUNTER_MUL := 1.2
const BEAT_MUL := 1.3
const ARMOR_KEEP := 0.5

# ---------- 连击衰减 ----------
static var STUN_DECAY: float
static var STUN_FLOOR: float
static var AIR_STUN: float
const KB_GROW := 0.3
const DMG_DECAY := 0.08
const DMG_FLOOR := 0.5
const JAB_CHAIN_MAX := 6

# ---------- 防守反击 ----------
const PARRY_WIN := 6.0
const PARRY_LOCK := 24.0
static var PARRY_STUN: float
const PARRY_POSE := 6.0
const PUSH_KB := 12.0
static var PUSH_STUN: float
const PUNISH_MUL := 1.3
const PUNISH_KD_MUL := 1.5
static var BLOCK_PEN: float
static var BLOCK_PEN_KD: float
static var PUNISH_STUN: float
const WHIFF_KD_MUL := 1.25
const PARRY_MUL := 1.35
const GC_COST := 25.0
static var HOLD_ESC: float
const THROW_DMG := 12.0
const KNEE_DMG := [5.0, 6.0]
static var KNEE_ADV: float
const TRIP_DMG := 10.0
const TACKLE_DMG := 11.0
const SCOOP_DMG := 12.0
const PARRY_THROW_DMG := 16.0
const CATCH_DMG := 7.0
const CATCH_AIR_DMG := 11.0
const HOLD_GAP := 54.0
const ROLL_DIST := 96.0
const ROLL_BACK := 64.0
const QI_MAX := 100.0
const QI_BURST := 50.0
const QI_PER_HP := 1.0 / 6.0
const BURST_RANGE := 180.0
const BURST_DMG := 21.0
const BURST_KB := 7.0
static var BURST_LIE: float
const BURST_BLOCK_KB := 6.0
const BURST_BLOCK_STUN := 6.0

# ---------- 联机（P2P） ----------
const NET_APP_ID := "modou-ink-fight-godot"   # 和 JS 版分开（两边不能互相联机）
const NET_SIGNAL_N := 8
const NET_DELAY := 0
const NET_MAX_PRED := 10
const NET_RECONNECT_WAIT := 20000
const NET_HANDSHAKE_WAIT := 4000
const NET_HASH_EVERY := 120
const NET_ICE_WAIT := 4000
const NET_ICE_WAIT_RELAY := 6500
const NET_CONNECT_WAIT := 20000
const NET_GUEST_WAIT := 300000

# ---------- 画面用（逻辑不碰） ----------
const IK_FLIP := 0.4
const CONTACT_SINK := 7.0

## 人物颜色：id、名字、身体色、写在纸上的字色（和 JS 一样；3D 衣服的颜色在 view/palette.gd 里按这个提亮）
const PALETTE := [
	{"id": "ink", "name": "墨", "color": "#17181a", "text": "#b8321d"},
	{"id": "indigo", "name": "靛", "color": "#28518f", "text": "#8a6510"},
	{"id": "vermil", "name": "朱", "color": "#a83220", "text": "#8a6510"},
	{"id": "ochre", "name": "赭", "color": "#7b4a22", "text": "#2f6f9a"},
	{"id": "pine", "name": "松", "color": "#2e6b3c", "text": "#b8321d"},
	{"id": "teal", "name": "黛", "color": "#1d5f66", "text": "#9a4f17"},
	{"id": "purple", "name": "紫", "color": "#5b3b82", "text": "#8a6510"},
	{"id": "slate", "name": "苍", "color": "#5d666b", "text": "#b8321d"},
]

static func lookOf(id: String) -> Dictionary:
	for p in PALETTE:
		if p.id == id:
			return p
	return {}

static func clampf2(v: float, a: float, b: float) -> float:
	return a if v < a else (b if v > b else v)

static func _static_init() -> void:
	var kb := damp(0.82)
	KB_DAMP_R = kb[0]
	KB_DAMP_C = kb[1]
	var ad := damp(AIR_DRAG)
	AIR_DRAG_R = ad[0]
	AIR_DRAG_C = ad[1]
	AIR_DRAG_CP = ad[2]
	MAXD_PVP = jsround(W / ZOOM_PVP_MIN - 2.0 * CAM_MARGIN)
	DASH_IN_WIN = TF(8)
	RUN_CHARGE = TF(8)
	SLIP_CANCEL = TF(9)
	SLIP_CAUGHT_STUN = TA(TF(5))
	STAGGER = TF(32)
	CHAIN_WIN = TF(22)
	SLOW_JAB_FRAMES = TF(90)
	SLOW_JAB_ADD = TA(4)
	LIE_HIT = TFH(25)
	LIE_GROUND = TFH(36)
	LIE_AIR = TFH(68)
	GETUP = TFH(13)
	RISE = TFH(9)
	RISE_ROLL = TFH(15)
	LIE_CRASH = TFH(47)
	CLASH_STUN = TFH(11)
	PRESS_STUN = TA(TFH(8))
	STUN_DECAY = TA(3)
	STUN_FLOOR = TA(3)
	AIR_STUN = TA(4)
	PARRY_STUN = TFH(22)
	PUSH_STUN = TA(TFH(9))
	BLOCK_PEN = TA(TF(5))
	BLOCK_PEN_KD = TA(TF(7))
	PUNISH_STUN = TA(TF(5))
	HOLD_ESC = TF(7)
	KNEE_ADV = TA(TF(6))
	BURST_LIE = TFH(25)
