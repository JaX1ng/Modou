class_name FighterAnim
extends RefCounted
## 一个人的动作（对照 JS fighter.js 的画面部分：target / runPose / animate / fitContact / fk / updateRibbons / keepPrev）。
## 逻辑层（Fighter）每一步算完，这里照着状态挑目标姿势、往目标挪、算骨骼：
##   J  —— 画面平面上的骨骼（JS 的 J，世界坐标，y 往下），量拳脚碰没碰到、特效挂在哪都用它
##   P3 —— 同一套骨骼的 3D 位置（身体坐标：朝右、y 往下、z 往镜头；没加 facing、没加世界位置），Skeleton3D 从这里摆
## 只是画面：不进逻辑、不存档（联机回滚重算时不调）。

const TAU_ := PI * 2.0
const D2R := PI / 180.0
const FIT_KEYS := ["hip", "neck", "head", "shF", "shB", "fe", "be", "fh", "bh", "fk", "bk", "ff", "bf"]
const FIT_CORE := {"torso": true, "head": true}
const FIT_FEET := {"FF": true, "BF": true}
const RIB_N := 8
const RIB_SEG := 5.1
const RIB_WIND := 0.15
const RIB_GUST := [0.024, 0.03]
# 跑步循环（一条腿一个周期 u∈[0,1)：0 脚在身前落地 → 踩地往后蹬 → 离地、脚跟往后上方收 → 提膝往前带 → 小腿前伸准备落地）
const RUN_ST := 0.26
const RUN_X0 := 40.0
const RUN_X1 := -46.0
const RUN_SWING := [[0.0, RUN_X1, 0.0], [0.14, -66.0, 24.0], [0.34, -44.0, 51.0], [0.55, 4.0, 48.0], [0.76, 46.0, 33.0], [0.9, 51.0, 13.0], [1.0, RUN_X0, 0.0]]
const RUN_ARM_F := 50.0
const RUN_ARM_B := 46.0

static var RIB_DAMP := C.rootDT(0.8)
static var PROF := {}           # 测性能用（tests/perf_anim.gd）：每一块花了多少微秒
static var PROF_ON := false
static var _LK := {}

var F: Fighter
var bd: BodyDef
var opp: FighterAnim
var disp := Pose.mk(Pose.POSE.stance)
var tgt := Pose.mk()
var hipY := -62.0
var ikS = null                  # 肘、膝上一步弯在哪边（[前手, 后手, 前腿, 后腿]，-1~1）
var J := {}                     # 空 = 还没算过（JS 的 null）
var P3 := {}                    # key → [x, y, z]（身体坐标）
var ang := [0.0, 0.0, 0.0, 0.0, 0.0]   # 3D 摆骨骼要的几个角度（弧度）：前倾 tor、头 hd、拧腰 tw、转身 spin、翻滚 rot
var fkL := {}
var trail: Array = []           # 拳脚轨迹 [{x, y, life, max, f}]
var ghosts: Array = []          # 残影 [{J, life, dash}]
var ribbons: Array = []         # 发带（两条）：每条一串 {x, y, px, py}
var rib_anchor := "knot"        # 发带从哪儿飘出来：knot 头带结（JS 原样）/ belt 腰后（僧：腰带垂下来的两条）
var rib_wind := 1.0             # 风、重力的倍数（1 = JS 原样；腰带垂得多、飘得少）
var rib_grav := 1.0
var lastStep := -999
var vp := {}                    # 上一步的样子（画面插值用）：{J, P3, rb}
var hitFlash := 0.0
var hitShake := 0.0
var heat := 0.0                 # 连招的火有多旺（画面）
var qiGlow := 0.0               # 身上的光
var qx = null                   # 上一步在哪（火往哪边拖）
var qlean := 0.0
var on_qi: Callable             # (FighterAnim) 每一步：身上的气（特效层）
var on_dust: Callable           # (x, y, n) 跑步落脚扬尘

func _init(fighter: Fighter, body: BodyDef = null) -> void:
	F = fighter
	bd = body if body != null else BodyDef.standard()
	reset()

static func lk(k: float) -> float:
	if not _LK.has(k):
		_LK[k] = C.lerpK(k)
	return _LK[k]

## 回合重开（JS reset 里画面那部分）：站姿、骨骼重算、发带从头带结那儿垂下来
func reset() -> void:
	disp.copy_from(Pose.POSE.stance)
	hipY = -62.0
	J = {}
	trail.clear()
	ghosts.clear()
	hitFlash = 0.0
	hitShake = 0.0
	heat = 0.0
	qiGlow = 0.0
	fk()
	ribbons = []
	var f := float(F.facing)
	for r in 2:
		var pts := []
		var a: Array = J[rib_anchor]
		for i in RIB_N:
			var x: float = a[0] - f * i * RIB_SEG
			var y: float = a[1] + i * 2.0
			pts.append({"x": x, "y": y, "px": x, "py": y})
		ribbons.append(pts)
	vp = {}

# ---------- 跑步 ----------
static func runLeg(u: float) -> Array:
	u -= floorf(u)
	if u < RUN_ST:
		return [RUN_X0 + (RUN_X1 - RUN_X0) * u / RUN_ST, 0.0]
	var s := (u - RUN_ST) / (1.0 - RUN_ST)
	var K := RUN_SWING
	var i := 0
	while i < K.size() - 2 and s > K[i + 1][0]:
		i += 1
	var t: float = (s - K[i][0]) / (K[i + 1][0] - K[i][0])
	var a: Array = K[maxi(0, i - 1)]
	var b: Array = K[i]
	var c: Array = K[i + 1]
	var d: Array = K[mini(K.size() - 1, i + 2)]
	return [BodyGeo.cmr(a[1], b[1], c[1], d[1], t), maxf(0.0, BodyGeo.cmr(a[2], b[2], c[2], d[2], t))]

## 手：u 是同侧腿的相位。返回手相对肩膀的位置（已经算进上身前倾 tor）
func runArm(u: float, tor: float, amp: float) -> Array:
	var c := cos(TAU_ * (u - 0.04))
	var fwd := c < 0.0
	var th := (((-c * RUN_ARM_F) if fwd else (-c * RUN_ARM_B)) * amp + 6.0 - tor * 0.6) * D2R
	var ph := ((74.0 - 20.0 * c) if fwd else (72.0 - 38.0 * c)) * D2R
	var ex := sin(th) * bd.ua
	var ey := cos(th) * bd.ua
	return [ex + sin(th + ph) * bd.fa, ey + cos(th + ph) * bd.fa]

func runPose(t: Pose) -> Pose:
	t.copy_from(Pose.POSE.run)
	var u := F.walkPhase
	var k := minf(1.0, F.runT / 8.0)
	var f := runLeg(u)
	var b := runLeg(u + 0.5)
	t.ff[0] = f[0]; t.ff[1] = f[1]
	t.bf[0] = b[0]; t.bf[1] = b[1]
	var bob := cos(TAU_ * 2.0 * (u - 0.38))
	t.tor = 18.0 + 14.0 * k - 2.0 * bob
	t.head = -12.0 - 8.0 * k
	t.hy = 62.0 + 1.5 * bob
	t.air = minf(f[1], b[1]) + 2.0 + 4.0 * bob
	var amp := 0.75 + 0.25 * k
	var fa := runArm(u, t.tor, amp)
	var ba := runArm(u + 0.5, t.tor, amp)
	t.fh[0] = fa[0]; t.fh[1] = fa[1]
	t.bh[0] = ba[0]; t.bh[1] = ba[1]
	return t

# ---------- 目标姿势 ----------
func target() -> Pose:
	var t := tgt
	var ck := F.clock
	var P: Dictionary = Pose.POSE
	match F.state:
		"idle":
			# 待机「呼吸」：上身轻轻起伏，两只拳头慢半拍跟着画小圈；髋只上下动一点点
			t.copy_from(P.stance)
			var ph := ck * TAU_ / 80.0
			var c := cos(ph)
			t.hy -= 0.4 * c
			t.tor += 1.6 * c
			t.head -= 1.3 * cos(ph - 0.5)
			t.fh[1] += 3.0 * cos(ph - 0.9)
			t.fh[0] += 1.5 * sin(ph - 0.9)
			t.bh[1] += 2.0 * cos(ph - 1.3)
			t.bh[0] -= 1.2 * sin(ph - 1.3)
			return t
		"run":
			return runPose(t)
		"crouch":
			return t.copy_from(P.crouch)
		"block":
			t.copy_from(P.cblock if F.lowBlock else P.block)
			if F.gwalk != 0 and not F.lowBlock:
				# 边挡边走：手举着不动，脚下小碎步；往后退身子往后坐，往前压往前探
				var ph := F.walkPhase * TAU_
				var s := sin(ph)
				var c := cos(ph)
				t.ff[0] += 9.0 * s
				t.ff[1] = maxf(0.0, 6.0 * c)
				t.bf[0] -= 9.0 * s
				t.bf[1] = maxf(0.0, -6.0 * c)
				t.hy += 1.2 * absf(c) - 1.0
				if F.gwalk > 0:
					t.tor += 4.0
					t.dx += 3.0
				else:
					t.tor -= 4.0
					t.dx -= 3.0
					t.head += 3.0
			return t
		"rise":
			var u := clampf(F.t / (F.riseT if F.riseT != 0.0 else C.RISE), 0.0, 1.0)
			return Pose.lerpPose(P.rise, P.stance, Pose.ease_fn("io", u), t, false)
		"blockstun":
			t.copy_from(P.cblock if F.lowBlock else P.block)
			t.dx -= 8.0
			t.tor -= 8.0
			t.head += 6.0
			return t
		"parry":
			return t.copy_from(P.parry)
		"jumpsquat":
			return t.copy_from(P.squat)
		"land":
			return t.copy_from(P.land)
		"tumble":
			var u := clampf(F.t / maxf(17.0, (F.tumFly if F.tumFly != 0.0 else 17.0) * 0.8), 0.0, 1.0)
			t.copy_from(P.tuck if u < 0.85 else P.jdn)
			t.rot = -360.0 * Pose.ease_fn("io", u)
			return t
		"air":
			if F.leapJump or absf(F.vx) >= C.LEAP_VX:
				return t.copy_from(P.leap if F.vz > -4.0 else P.leapDn)
			return t.copy_from(P.jup if F.vz > 5.0 else (P.jtop if F.vz > -5.0 else P.jdn))
		"attack":
			var m := F.move
			t.copy_from(Pose.evalKeys(m.def.keys, F.baseTime()))
			# 千斤坠近身踩得陡：身子跟着立直一点
			if m.def.dive and m.bounce == 0.0 and m.has_dvx:
				t.rot *= 0.3 + 0.7 * m.dvx / C.DIVE_VX
			if m.def.dive and m.bounce != 0.0:
				if m.hit:
					t.copy_from(P.land)
					t.rot = -10.0
					t.ff[0] = 40.0
					t.ff[1] = 8.0
				else:
					var u := clampf(m.bounce / maxf(16.0, (m.bFly if m.bFly != 0.0 else 16.0) * 0.8), 0.0, 1.0)
					t.copy_from(P.tuck if u < 0.85 else P.jdn)
					t.rot = -42.0 - 318.0 * Pose.ease_fn("io", u)
			if m.slowed and m.t < m.S:
				t.dx -= 3.0
				t.fh[0] -= 4.0 + sin(ck * 1.7) * 2.0
			if F.armored(""):
				t.dx += sin(ck * 2.3) * 1.4     # 霸体中微微发抖
			return t
		"hit":
			if F.carried:
				t.copy_from(P.thrown)
				t.rot = F.carryRot
				return t
			if F.stagger:
				return t.copy_from(Pose.evalKeys(Pose.STAGGER_KEYS, clampf(1.0 - F.stunT / C.STAGGER, 0.0, 1.0)))
			if F.reel:
				return t.copy_from(P.reel)
			if F.clashed:
				return t.copy_from(P.recoil)
			if F.airborne():
				return t.copy_from(P.hurtAir)
			if F.grabbed and F.stunT > 12.0:
				return t.copy_from(P.pulled)
			return t.copy_from(P.hurtH if F.hurtHeavy else P.hurtL)
		"down", "ko":
			var lie: Pose = P.lieFlat if F.lieKind != 0 else P.lie
			if F.downPhase == "fall":
				return t.copy_from(lie if F.slam else P.fall)
			if F.downPhase == "getup" and F.rollDir != 0:
				var u := F.t / C.GETUP
				if u < 0.75:
					t.copy_from(P.tuck)
					t.rot = (1.0 if F.rollDir == F.facing else -1.0) * 360.0 * Pose.ease_fn("io", u / 0.75)
					t.hy = 40.0
					return t
				return t.copy_from(P.crouch)
			if F.downPhase == "getup":
				return t.copy_from(Pose.evalKeys(Pose.GETUP_KEYS, F.t))
			return t.copy_from(lie)
		"win":
			t.copy_from(P.win)
			var s := sin(ck * 0.08)
			t.fh[1] += s * 2.0
			t.hy += s
			return t
	return t.copy_from(P.stance)

# ---------- 每一步 ----------
## 回身肘那种「姿势先转半圈」（逻辑层留了 spinFlip）：画面马上转过去
func take_flags() -> void:
	if F.spinFlip:
		F.spinFlip = false
		disp.spin = Pose.wrapDeg(disp.spin + 180.0)

static func _pt(key: String, t0: int) -> void:
	PROF[key] = PROF.get(key, 0) + Time.get_ticks_usec() - t0

func animate(frozen: bool, frame: int) -> void:
	take_flags()
	var hold := F.holdPose
	F.holdPose = false       # 刚挨了一下：这一步姿势先不变，顿帧过了再往后仰
	if not frozen:
		var t0 := Time.get_ticks_usec() if PROF_ON else 0
		var tg := target()
		if PROF_ON:
			_pt("target", t0)
		var st := F.state
		var k: float
		if st == "attack" or st == "tumble":
			k = 0.78
		elif F.carried:
			k = 0.85
		elif st == "hit" or st == "blockstun" or st == "parry":
			k = 0.6
		elif st == "down" or st == "ko":
			k = 0.6 if (F.slam and F.downPhase == "fall") else 0.3
		elif st == "run":
			k = 0.5 if F.runT < 5.0 else 0.88
		elif st == "air":
			k = 0.32
		else:
			k = 0.4
		var t1 := Time.get_ticks_usec() if PROF_ON else 0
		if not hold:
			Pose.lerpPose(disp, tg, lk(k), disp, true)
		var hy0 := hipY
		var ik0 = ikS.duplicate() if ikS != null else null
		if PROF_ON:
			_pt("lerp", t1)
			t1 = Time.get_ticks_usec()
		fk()
		if PROF_ON:
			_pt("fk", t1)
			t1 = Time.get_ticks_usec()
		fitContact(hy0, ik0)
		if PROF_ON:
			_pt("fit", t1)
			t1 = Time.get_ticks_usec()
		if on_qi.is_valid():
			on_qi.call(self)
		if PROF_ON:
			_pt("qi", t1)
		# 拳脚轨迹 + 残影（只在出招时有）
		var m := F.move
		if m != null and not m.def.scripted and m.def.limb != "" and m.t >= m.S - 3.0 and m.t <= m.S + m.def.A + 2.0:
			var e: Array = J[m.def.limb]
			trail.append({"x": e[0], "y": e[1], "life": 8.0, "max": 8.0, "f": frame})
			if m.def.ghost and fmod(m.t, 2.0) == 0.0:
				ghosts.append({"J": cloneJ(J), "P3": cloneJ(P3), "ang": ang.duplicate(), "hipY": hipY, "x": F.x, "facing": F.facing, "life": 10.0, "max": 10.0})
		if m != null and (m.name == "dash" or (m.name == "slip" and m.t < 14.0) or (m.dashIn and m.t <= m.S + m.def.A)) and fmod(m.t, 2.0) == 0.0:
			ghosts.append({"J": cloneJ(J), "P3": cloneJ(P3), "ang": ang.duplicate(), "hipY": hipY, "x": F.x, "facing": F.facing, "life": 6.0, "max": 6.0, "dash": true})
		# 跑起来以后，每一脚落地扬一点尘
		if st == "run" and F.runT > C.RUN_CHARGE:
			var step := int(floorf(F.walkPhase * 2.0))
			if step != lastStep:
				lastStep = step
				var foot: Array = J.bf if step % 2 != 0 else J.ff
				if on_dust.is_valid():
					on_dust.call(foot[0], C.FLOOR, 2)
		for i in range(trail.size() - 1, -1, -1):
			trail[i].life -= C.DT
			if trail[i].life <= 0.0:
				trail.remove_at(i)
		for i in range(ghosts.size() - 1, -1, -1):
			ghosts[i].life -= C.DT
			if ghosts[i].life <= 0.0:
				ghosts.remove_at(i)
	if hitFlash > 0.0:
		hitFlash = maxf(0.0, hitFlash - C.DT)
	if hitShake > 0.0:
		hitShake = maxf(0.0, hitShake - C.DT)
	var t2 := Time.get_ticks_usec() if PROF_ON else 0
	updateRibbons()
	if PROF_ON:
		_pt("ribbons", t2)

## 这一步的外形（一块一块，别人量碰没碰到要用；一步只算一次）
var _pc_J = null
var _pc: Array = []
func parts_now() -> Array:
	if not is_same(_pc_J, J):
		_pc = BodyGeo.bodyParts(bd, J, 0.0).parts
		_pc_J = J
	return _pc

static func cloneJ(src: Dictionary) -> Dictionary:
	var o := {}
	for k in src:
		var v = src[k]
		o[k] = v.duplicate() if v is Array else v
	return o

## 记下上一步画出来的样子（画面在两步之间插着画）
func keepPrev() -> void:
	if J.is_empty():
		vp = {}
		return
	var rb := []
	for pts in ribbons:
		var r := []
		for q in pts:
			r.append([q.x, q.y])
		rb.append(r)
	vp = {"J": cloneJ(J), "P3": cloneJ(P3), "ang": ang.duplicate(), "hipY": hipY, "rb": rb, "x": F.x, "facing": F.facing, "alt": F.alt}

## 这一刻画在哪、离地多高（两步之间插值，和 JS viewOf 一样：差太远不插）
func view_x(RA: float) -> float:
	if RA < 1.0 and not vp.is_empty() and absf(float(vp.x) - F.x) <= 90.0:
		return lerpf(vp.x, F.x, RA)
	return F.x

func view_alt(RA: float) -> float:
	if RA < 1.0 and not vp.is_empty() and absf(float(vp.x) - F.x) <= 90.0:
		return lerpf(vp.alt, F.alt, RA)
	return F.alt

# ---------- 拳脚停在对方身上（只是画面） ----------
## 出招时离得比射程近，照着姿势探身、伸直的拳脚会扎进对方身子里：先看身子扎进去了就整个人往回让；再看拳脚，过了对方迎面那一层超过 CONTACT_SINK 就往回收。
## 姿势本身不改（下一步照样从原来的姿势算），只是这一步的骨骼
func fitContact(hy0: float, ik0) -> void:
	var m := F.move
	var limb := m.def.limb if (m != null and F.state == "attack" and not m.def.scripted) else ""
	var o := opp
	if limb == "" or o == null or o.J.is_empty() or J.is_empty() or fkL.is_empty() or (o.F.x - F.x) * F.facing < 24.0:
		return
	# 对手躺在地上、飞在空中不管
	if C.FLOOR - float(o.J.hip[1]) < 30.0 or C.FLOOR - maxf(o.J.ff[1], o.J.bf[1]) > 24.0:
		return
	var fw := float(F.facing)
	var OJ := o.J
	var MJ := J
	var oFront := 1e9
	var mFront := -1e9
	for kk in FIT_KEYS:
		var a: float = OJ[kk][0] * fw
		var b: float = MJ[kk][0] * fw
		if a < oFront:
			oFront = a
		if b > mFront:
			mFront = b
	if mFront + 22.0 < oFront - 22.0:
		return
	var p := disp
	var arm := limb == "fh" or limb == "bh"
	var leg := limb == "ff" or limb == "bf"
	var A := bd.ankle
	var ax := cos(p.spin * D2R) * cos(p.rot * D2R)
	var keep := {"dx": p.dx, "fh": p.fh.duplicate(), "bh": p.bh.duplicate(), "ff": p.ff.duplicate(), "bf": p.bf.duplicate()}
	var noArms := not o.F.isBlocking()
	# 对方的外形要用到才算（先拿骨骼估的上限挡掉大部分）
	var lazy := {}
	var tgt := func(arms: bool) -> Array:
		var key := "hit" if arms else "body"
		if not lazy.has(key):
			lazy[key] = BodyGeo.bodyTargets(o.bd, OJ, not arms, o.parts_now())
		return lazy[key]
	var st := {"ik0": ik0}
	var whole := limb == "sh"
	var legLen := bd.th + bd.sh - 0.8
	var refit := func() -> void:
		hipY = hy0
		if st.ik0 != null:
			for i in 4:
				ikS[i] = st.ik0[i]
		fk()
	# 脚踝目标放到 x（姿势的坐标），腿够不着就往髋底下收到刚好够着
	var footTo := func(k: String, x: float, y: float) -> void:
		var hj := bd.hipSplit if k == "ff" else -bd.hipSplit
		var dx2 := x - hj
		if sqrt(dx2 * dx2 + y * y) > legLen:
			x = hj + signf(dx2) * sqrt(maxf(0.0, legLen * legLen - y * y))
		var arr: Array = p.get(k)
		arr[0] = x
		arr[1] = p.hy - A - y
	# 整个人往回让 d：踩在地上的脚尽量踩着原地（铁山靠这种整个人撞过去的连脚一起往回让）
	var back := func(d: float) -> void:
		var L := fkL
		p.dx -= d
		if not whole and absf(ax) >= 0.6:
			for k in ["ff", "bf"]:
				if absf(L[k][1] - (p.hy - A)) < 6.0:
					footTo.call(k, L[k][0] + d / ax, L[k][1])
	# 先用骨骼估个上限（外形的点离自己那节骨头最远多少，见 _reach）：肯定扎不进去的就不用一块一块量了（结果和量过一样）
	var oMinBody := _front(OJ, fw, true)
	var oMinHit := oMinBody if noArms else _front(OJ, fw, false)
	var moved := 0.0
	for it in 2:
		if _coreMax(fw) - oMinBody <= 2.4:
			break
		var core := []
		for q in BodyGeo.bodyParts(bd, J, 0.0, FIT_CORE).parts:
			core.append(q.pts)
		var pen := BodyGeo.bodyPenT(core, tgt.call(false), fw) - 2.0
		if pen <= 0.4 or moved >= 40.0:
			break
		var d := minf(pen + 0.6, 40.0 - moved)
		moved += d
		back.call(d)
		refit.call()
	# 踩在地上的脚：往前上步别踩进对方两脚中间
	var toeMax := maxf(float(J.ff[0]) * fw, float(J.bf[0]) * fw) + R_FOOT
	var oToe := minf(float(OJ.ff[0]) * fw, float(OJ.bf[0]) * fw) - R_FOOT
	if absf(ax) >= 0.6 and toeMax - (oToe + 4.0) > 0.5:
		var front := 1e9
		for q in BodyGeo.bodyParts(o.bd, OJ, 0.0, FIT_FEET).parts:
			if q.get("foot", false):
				for pt in q.pts:
					front = minf(front, pt[0] * fw)
		var my: Array = BodyGeo.bodyParts(bd, J, 0.0, FIT_FEET).parts
		var L := fkL
		var fixed := false
		for k in ["ff", "bf"]:
			if k == limb or absf(L[k][1] - (p.hy - A)) >= 6.0:
				continue
			var want := "FF" if k == "ff" else "BF"
			var q = null
			for r in my:
				if r.k == want:
					q = r
					break
			if q == null:
				continue
			var toe := -1e9
			for pt in q.pts:
				toe = maxf(toe, pt[0] * fw)
			var over := toe - (front + 4.0)
			if over > 0.5:
				footTo.call(k, L[k][0] - over / ax, L[k][1])
				fixed = true
		if fixed:
			refit.call()
	if not ((arm or leg) and absf(ax) < 0.35):
		var cut := 0.0
		for it in 4:
			if _strikeMax(limb, fw) - oMinHit <= C.CONTACT_SINK + 0.4:
				break
			var sp := BodyGeo.strikeParts(bd, J, limb)
			var pen := BodyGeo.bodyPenT(sp.slice(0, 1) if leg else sp, tgt.call(not noArms), fw) - C.CONTACT_SINK
			if pen <= 0.4 or cut >= 120.0:
				break
			var d := minf(pen + 0.6, 120.0 - cut)
			var dl := d / ax
			var L := fkL
			var e = L.get(limb)          # 肘、肩撞人（fe / be / sh）没有：整个人往回让
			cut += d
			if arm:
				var arr: Array = p.get(limb)
				arr[0] = e[0] - L.sh[0] - dl
				arr[1] = e[1] - L.sh[1]
			elif leg:
				_foldLeg(limb, L, e, dl, st, back, ax)
			else:
				back.call(d)
			refit.call()
	p.dx = keep.dx
	for k in ["fh", "bh", "ff", "bf"]:
		var arr: Array = p.get(k)
		arr[0] = keep[k][0]
		arr[1] = keep[k][1]
	p.fkh = null
	p.bkh = null

# 外形上的点离骨头最远多远（骨头两头的关节连线外面最多鼓出来这么多）：躯干 20.3（侧前方 √(11² + 17²)，转身转到一半最宽）、头 12、
# 拳 7（拳心到角）、鞋 16（脚尖 15.2、鞋高）、大臂 5.5、小臂 4.3（画到手腕，手腕在拳心往回 3.4，所以从拳心算 7.7）、大腿 7.9、小腿 7.1、裆（大腿根圆 7.7）。
# 宽一点不要紧（只是少跳过几回），窄了就会漏量
const R_TORSO := 21.0
const R_HEAD := 12.5
const R_FIST := 7.5
const R_FOOT := 17.0
const R_UA := 6.0
const R_FA := 8.0
const R_TH := 8.5
const R_SH := 7.5

## 对方身子最靠前的地方（往打过来那边看，x·方向 最小）不会比这个更靠前。noArms：胳膊不算
func _front(OJ: Dictionary, fw: float, noArms: bool) -> float:
	var m := 1e9
	for k in ["hip", "neck", "hipF", "hipB"]:
		m = minf(m, float(OJ[k][0]) * fw - R_TORSO)
	m = minf(m, float(OJ.neckTop[0]) * fw - R_TORSO)
	m = minf(m, float(OJ.head[0]) * fw - R_HEAD)
	for k in ["fk", "bk"]:
		m = minf(m, float(OJ[k][0]) * fw - R_TH)
	for k in ["ff", "bf"]:
		m = minf(m, float(OJ[k][0]) * fw - R_FOOT)
	if not noArms:
		for k in ["shF", "shB", "fe", "be"]:
			m = minf(m, float(OJ[k][0]) * fw - R_UA)
		for k in ["fh", "bh"]:
			m = minf(m, float(OJ[k][0]) * fw - R_FIST)
	return m

## 自己躯干 + 头最靠前到哪（x·方向 最大）
func _coreMax(fw: float) -> float:
	var m := -1e9
	for k in ["hip", "neck", "neckTop"]:
		m = maxf(m, float(J[k][0]) * fw + R_TORSO)
	return maxf(m, float(J.head[0]) * fw + R_HEAD)

## 出招的那只拳 / 脚 / 肘 / 肩最靠前到哪
func _strikeMax(limb: String, fw: float) -> float:
	var X := func(k: String) -> float: return float(J[k][0]) * fw
	match limb:
		"fh", "bh":
			return X.call(limb) + R_FIST
		"ff", "bf":
			return X.call(limb) + R_FOOT        # 只量脚（膝盖顶进去像提膝，不管）
		"fe":
			return maxf(maxf(X.call("shF"), X.call("fe")) + R_UA, X.call("fh") + R_FA)
		"be":
			return maxf(maxf(X.call("shB"), X.call("be")) + R_UA, X.call("bh") + R_FA)
		"sh":
			return maxf(maxf(maxf(X.call("shF"), X.call("shB")), maxf(X.call("fe"), X.call("be"))) + R_UA, _coreMax(fw))
	return 1e9

## 出腿离得近、脚要往回收：一律「收腿」的样子（膝盖留在原处、小腿绕着膝盖往下折回来；还不够再平着收、膝盖往上提）
func _foldLeg(k: String, L: Dictionary, e: Array, dl: float, st: Dictionary, back: Callable, ax: float) -> void:
	var p := disp
	var kn: Array = L["fk" if k == "ff" else "bk"]
	var gy := p.hy - bd.ankle
	var hj := bd.hipSplit if k == "ff" else -bd.hipSplit
	var kd := 1.0 if dl > 0.0 else -1.0
	var nx: float = e[0] - dl
	var ny: float = e[1]
	if e[1] < gy - 24.0:
		var r := sqrt((e[0] - kn[0]) * (e[0] - kn[0]) + (e[1] - kn[1]) * (e[1] - kn[1]))
		if r == 0.0:
			r = 1e-3
		var s := kd
		var a0 := atan2(e[1] - kn[1], s * (e[0] - kn[0]))
		var yLow := maxf(e[1], 8.0)
		var a := acos(clampf(s * (nx - kn[0]) / r, -1.0, 1.0))
		var aMax := minf(PI / 2.0 + 0.7, 9.0 if kn[1] + r <= yLow else asin(clampf((yLow - kn[1]) / r, -1.0, 1.0)))
		a = clampf(a, a0, maxf(a0, aMax))
		var fx: float = kn[0] + s * r * cos(a)
		var fy: float = kn[1] + r * sin(a)
		nx = nx if s * (fx - nx) > 0.0 else fx
		ny = fy
		p.set("fkh" if k == "ff" else "bkh", [kn[0] - hj, kn[1] - 8.0])
	# 脚踝收到髋前面就收不动了：剩下的整个人往后让
	var lim := hj + kd * 6.0
	if kd * (nx - lim) < 0.0:
		var rest := kd * (lim - nx)
		nx = lim
		if absf(ax) >= 0.6:
			back.call(rest * absf(ax))
	var arr: Array = p.get(k)
	arr[0] = nx
	arr[1] = p.hy - bd.ankle - ny
	# 膝盖弯在哪边直接定下来
	var h = p.fkh if k == "ff" else p.bkh
	if h != null and st.ik0 != null:
		st.ik0[2 if k == "ff" else 3] = Pose.ik(hj, 0.0, nx, ny, bd.th, bd.sh, h[0], h[1])[4]

# ---------- 骨骼 ----------
## 髋（原点）→ 脊柱（tor 前倾）→ 脖子根 → 脖子 → 头；肩关节在脊柱上，拧腰 tw 时前手肩膀往前、后手肩膀往后错开；
## 两个大腿根前后错开一点。手的目标点 fh / bh 是相对「两肩中间」的；脚的目标点是脚踝。
## 转身 spin：每个点除了前后（x）、上下（y）还有左右（z：后手肩、前腿根在近侧），绕竖轴转过去；rot 在画面平面里转
func fk() -> void:
	var p := disp
	var tor := p.tor * D2R
	var hd := (p.tor + p.head) * D2R
	var tx := sin(tor)
	var ty := -cos(tor)
	var nx := -ty
	var ny := tx
	var neck := [tx * bd.torso, ty * bd.torso]
	var sh := [tx * bd.shoulder, ty * bd.shoulder]
	var hx := sin(hd)
	var hy := -cos(hd)
	var neckTop := [neck[0] + hx * bd.neck, neck[1] + hy * bd.neck]
	var head := [neckTop[0] + hx * bd.head * 0.84 - hy * bd.head * 0.1, neckTop[1] + hy * bd.head * 0.84 + hx * bd.head * 0.1]
	var tw := p.tw * D2R
	var ts := sin(tw) * bd.shoulderW
	var tc := cos(tw) * bd.shoulderW
	var shF := [sh[0] + nx * ts, sh[1] + ny * ts]
	var shB := [sh[0] - nx * ts, sh[1] - ny * ts]
	var hipF := [bd.hipSplit, 0.0]
	var hipB := [-bd.hipSplit, 0.0]
	var fresh := J.is_empty()
	if ikS == null:
		ikS = [0.0, 0.0, 0.0, 0.0]
	var kf := p.fn
	var kb := p.bn
	var fA := _limb(0, fresh, shF[0], shF[1], sh[0] + p.fh[0], sh[1] + p.fh[1], bd.ua, bd.fa, -0.3, p.fe)
	var bA := _limb(1, fresh, shB[0], shB[1], sh[0] + p.bh[0], sh[1] + p.bh[1], bd.ua, bd.fa, -0.3, p.be)
	var fL := _limb(2, fresh, hipF[0], hipF[1], p.ff[0], p.hy - bd.ankle - p.ff[1], bd.th, bd.sh,
		p.fkh[0] if p.fkh != null else kf, p.fkh[1] if p.fkh != null else -0.15)
	var bL := _limb(3, fresh, hipB[0], hipB[1], p.bf[0], p.hy - bd.ankle - p.bf[1], bd.th, bd.sh,
		p.bkh[0] if p.bkh != null else kb, p.bkh[1] if p.bkh != null else -0.15)
	fkL = {"sh": sh, "fh": [fA[2], fA[3]], "bh": [bA[2], bA[3]], "ff": [fL[2], fL[3]], "bf": [bL[2], bL[3]], "fk": [fL[0], fL[1]], "bk": [bL[0], bL[1]]}
	# 膝盖往侧面摆（fo / bo）：绕「大腿根 → 脚踝」那条线往这条腿自己那一侧转出去，脚踝不动
	var fKo := _kneeOut(hipF, fL, p.fo, 1.0)
	var bKo := _kneeOut(hipB, bL, p.bo, -1.0)
	var knot := [head[0] + hy * bd.head * 0.95 + hx * bd.head * 0.22, head[1] - hx * bd.head * 0.95 + hy * bd.head * 0.22]
	var belt := [-tx * 2.0 - 4.0, ty * 4.0]
	var zF := -tc
	var zB := tc
	var zHF := bd.hipW
	var zHB := -bd.hipW
	var pts := {"hip": [0.0, 0.0, 0.0], "hipF": [hipF[0], 0.0, zHF], "hipB": [hipB[0], 0.0, zHB], "neck": [neck[0], neck[1], 0.0], "neckTop": [neckTop[0], neckTop[1], 0.0],
		"head": [head[0], head[1], 0.0], "sh": [sh[0], sh[1], 0.0], "shF": [shF[0], shF[1], zF], "shB": [shB[0], shB[1], zB], "knot": [knot[0], knot[1], 0.0], "belt": [belt[0], belt[1], 0.0],
		"fe": [fA[0], fA[1], zF], "fh": [fA[2], fA[3], zF], "be": [bA[0], bA[1], zB], "bh": [bA[2], bA[3], zB],
		"fk": [fKo[0], fKo[1], zHF + fKo[2]], "ff": [fL[2], fL[3], zHF], "bk": [bKo[0], bKo[1], zHB + bKo[2]], "bf": [bL[2], bL[3], zHB]}
	var sp := p.spin * D2R
	var sc := cos(sp)
	var ss := sin(sp)
	var r := p.rot * D2R
	var cr := cos(r)
	var sr := sin(r)
	var maxY := -1e9
	var P := {}
	for k in pts:
		var v: Array = pts[k]
		var x: float = v[0] * sc - v[2] * ss
		var z: float = v[0] * ss + v[2] * sc
		var y: float = v[1]
		var X := x * cr - y * sr + p.dx
		var Y := x * sr + y * cr
		P[k] = [X, Y, z]
		var low := Y
		if k == "head":
			low += bd.head
		elif k == "ff" or k == "bf":
			low += bd.ankle
		elif k == "knot" or k == "belt":
			continue
		if low > maxY:
			maxY = low
	var hipT: float
	if F.airborne():
		hipT = minf(-(F.alt + p.hy), -maxY)
	else:
		hipT = -maxY - p.air
	hipY = hipT if F.airborne() else hipY + (hipT - hipY) * lk(0.85 if F.state == "run" else 0.55)
	if fresh:
		hipY = hipT
	var f := float(F.facing)
	var ox := F.x
	var oy := C.FLOOR + hipY
	var nJ := {}
	for k in P:
		nJ[k] = [ox + f * P[k][0], oy + P[k][1]]
	nJ.turned = sc < 0.0
	nJ.facing = F.facing
	nJ.rot = r
	nJ.headTilt = hd
	nJ.spin = sp
	# 肘、膝该往哪边顶（世界方向）
	nJ.hFe = _hv(-0.3, p.fe, sc, cr, sr, f)
	nJ.hBe = _hv(-0.3, p.be, sc, cr, sr, f)
	nJ.hFk = _hv(kf, -0.15, sc, cr, sr, f)
	nJ.hBk = _hv(kb, -0.15, sc, cr, sr, f)
	nJ.fkd = kf
	nJ.bkd = kb
	nJ.fft = p.ft
	nJ.bft = p.bt
	nJ.fyaw = p.fo
	nJ.byaw = p.bo
	nJ.x = ox
	nJ.alt = F.alt
	J = nJ
	P3 = P
	ang = [tor, hd, tw, sp, r]

func _limb(i: int, fresh: bool, px: float, py: float, qx: float, qy: float, a: float, b: float, hx2: float, hy2: float) -> Array:
	var want: float = Pose.ik(px, py, qx, qy, a, b, hx2, hy2)[4]
	if fresh:
		ikS[i] = want
	else:
		ikS[i] = ikS[i] + clampf(want - ikS[i], -C.IK_FLIP * C.DT, C.IK_FLIP * C.DT)
	return Pose.ik(px, py, qx, qy, a, b, hx2, hy2, ikS[i])

static func _kneeOut(hp: Array, Lg: Array, deg: float, zs: float) -> Array:
	if deg == 0.0:
		return [Lg[0], Lg[1], 0.0]
	var ax: float = Lg[2] - hp[0]
	var ay: float = Lg[3] - hp[1]
	var al := sqrt(ax * ax + ay * ay)
	if al == 0.0:
		al = 1e-3
	var ux := ax / al
	var uy := ay / al
	var kx: float = Lg[0] - hp[0]
	var ky: float = Lg[1] - hp[1]
	var along := kx * ux + ky * uy
	var px := kx - ux * along
	var py := ky - uy * along
	var a := deg * D2R
	var c := cos(a)
	return [hp[0] + ux * along + px * c, hp[1] + uy * along + py * c, zs * sqrt(px * px + py * py) * sin(a)]

static func _hv(x: float, y: float, sc: float, cr: float, sr: float, f: float) -> Array:
	var X := x * sc
	return [(X * cr - y * sr) * f, X * sr + y * cr]

# ---------- 发带 ----------
## 一串点（Verlet），每步按上一步的位移接着飘 + 风 + 重力
func updateRibbons() -> void:
	var f := float(F.facing) * (-1.0 if J.turned else 1.0)
	var dd := RIB_DAMP
	var d2 := C.DT * C.DT
	for k in ribbons.size():
		var pts: Array = ribbons[k]
		var a: Array = J[rib_anchor] if k < 2 else J.belt
		pts[0].x = a[0]
		pts[0].y = a[1] + (2.0 if k == 1 else 0.0)
		var seg := RIB_SEG if k < 2 else 5.0
		for i in range(1, pts.size()):
			var q: Dictionary = pts[i]
			var vx: float = (q.x - q.px) * dd
			var vy: float = (q.y - q.py) * dd
			q.px = q.x
			q.py = q.y
			var wind: float = (-f * RIB_WIND + sin(F.clock * 0.036 - i * 0.32 + k * 1.3) * RIB_GUST[0] + sin(F.clock * 0.014 + k * 2.1) * RIB_GUST[1]) * rib_wind
			q.x += vx + wind * d2
			q.y += vy + 0.24 * rib_grav * d2
		for it in 3:
			for i in range(1, pts.size()):
				var a0: Dictionary = pts[i - 1]
				var q: Dictionary = pts[i]
				var dx: float = q.x - a0.x
				var dy: float = q.y - a0.y
				var d := sqrt(dx * dx + dy * dy)
				if d == 0.0:
					d = 1e-3
				q.x = a0.x + dx / d * seg
				q.y = a0.y + dy / d * seg
				if q.y > C.FLOOR:
					q.y = C.FLOOR
