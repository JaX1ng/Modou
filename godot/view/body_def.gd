class_name BodyDef
extends RefCounted
## 人物的身材（对照 JS body.js 最上面的 BODY 表）：骨头多长、肩多宽、每一节肢体沿着骨头多粗（轮廓表）、拳头、鞋。
## 骨骼（Skeleton3D）、模型、动作里的 IK 都从这里取尺寸。以后出新人物（高矮胖瘦不一样）就另给一个 BodyDef，动作、逻辑不用动。
## 单位：逻辑像素（1 像素 = View3D.S 米）。

# 骨头长度。head 是头的半径；shoulder = 肩关节在脊柱上离髋多远（比脖子根低一点）
var torso := 46.5
var shoulder := 41.0
var neck := 5.5
var head := 12.0
var ua := 25.0          # 大臂
var fa := 23.0          # 小臂
var th := 38.0          # 大腿
var sh := 39.7          # 小腿
var ankle := 3.3        # 脚踝离鞋底
var shoulderW := 11.5   # 肩宽的一半（拧腰时两个肩膀前后错开 ±shoulderW·sin(tw)；转身时左右分开）
var hipW := 5.5         # 两个大腿根离中线多远（左右）
var hipSplit := 2.2     # 侧面看两个大腿根前后错开一点（前腿根靠前）
var wrist := 3.4        # 小臂画到拳心往回这么多（这一截藏在拳头里）
var fist := {"len": 10.4, "h": 9.4, "r": 4.3}
var foot := {"heel": 6.2, "toe": 15.2, "h": 8.4, "w": 8.4, "toeH": 6.4}
# 轮廓表：[沿着骨头的位置 0（根）~1（梢）, 前侧半宽, 后侧半宽]
#   大臂「前侧」= 胳膊弯起来小臂折过去的那一侧；小臂 = 掌心那一侧；大腿 = 膝盖顶出去那一侧；小腿 = 小腿骨那一侧（后侧是小腿肚）
var p_ua := [[0.0, 5.3, 5.5], [0.3, 4.9, 4.9], [0.7, 4.4, 4.3], [1.0, 4.1, 4.0]]
var p_fa := [[0.0, 4.1, 4.0], [0.3, 4.3, 4.1], [0.75, 3.8, 3.5], [1.0, 3.5, 3.3]]
var p_th := [[0.0, 7.5, 7.9], [0.25, 7.6, 7.8], [0.52, 7.5, 7.1], [0.78, 6.5, 6.0], [0.93, 5.8, 5.5], [1.0, 5.9, 5.5]]
var p_sh := [[0.0, 5.8, 5.6], [0.12, 5.6, 6.5], [0.28, 5.4, 7.1], [0.5, 5.1, 6.2], [0.72, 4.6, 4.9], [0.88, 4.4, 4.4], [1.0, 4.5, 4.6]]
var p_neck := [[0.0, 5.6, 6.0], [0.6, 4.9, 5.1], [1.0, 4.9, 5.1]]
# 躯干：[沿脊柱的位置（0 = 髋，1 = 脖子根；负的在髋下面）, 胸腹那侧半宽, 后背那侧半宽, 正面对着镜头时的半宽]
var p_torso := [[-0.04, 8.8, 9.4, 12.6], [0.06, 8.8, 9.6, 12.4], [0.2, 8.2, 8.4, 11.4], [0.34, 8.4, 8.4, 11.6],
	[0.52, 9.6, 9.0, 13.4], [0.68, 10.8, 10.0, 15.6], [0.82, 10.8, 11.0, 17.0], [0.91, 9.8, 10.6, 15.4], [0.97, 7.6, 8.6, 10.8], [1.0, 5.6, 6.0, 7.0]]
var seat_reach := 9.0
var belt_at := 0.11     # 腰带在脊柱上的位置
var belt_h := 6.0

var _foot_pts: Array = []
var _foot_nrm: Array = []

static var _std: BodyDef

## 默认的身材（和 JS 2.8.0 一样）
static func standard() -> BodyDef:
	if _std == null:
		_std = BodyDef.new()
	return _std

## 鞋的外形（脚踝是原点，x 往脚尖、y 往鞋底）：参考图那种圆头鞋
func foot_pts() -> Array:
	if _foot_pts.is_empty():
		var a := ankle
		var top := a - float(foot.h)
		var H: float = foot.heel
		var T: float = foot.toe
		var tH: float = foot.toeH
		_foot_pts = [[-H + 2.4, top], [-H + 0.5, top + 2.3], [-H, a - 4.0], [-H + 0.3, a - 1.4], [-H + 1.8, a + 0.1], [0.0, a + 0.35], [T - 5.4, a + 0.35],
			[T - 1.8, a - 0.1], [T - 0.2, a - 1.7], [T, a - tH * 0.5], [T - 1.1, a - tH * 0.75], [T - 4.0, a - tH * 0.92], [T - 8.4, a - tH], [4.0, top + 0.8], [0.4, top - 0.35]]
		# 每个点往外的方向（两边的边法线平均）
		var P := _foot_pts
		var n := P.size()
		var s := -1.0 if BodyGeo.signedArea(P) < 0.0 else 1.0
		_foot_nrm = []
		for i in n:
			var pa: Array = P[(i + n - 1) % n]
			var pb: Array = P[i]
			var pc: Array = P[(i + 1) % n]
			var e1x: float = pb[0] - pa[0]
			var e1y: float = pb[1] - pa[1]
			var e2x: float = pc[0] - pb[0]
			var e2y: float = pc[1] - pb[1]
			var l1 := sqrt(e1x * e1x + e1y * e1y)
			var l2 := sqrt(e2x * e2x + e2y * e2y)
			if l1 == 0.0:
				l1 = 1.0
			if l2 == 0.0:
				l2 = 1.0
			var nx := (e1y / l1 + e2y / l2) * s
			var ny := -(e1x / l1 + e2x / l2) * s
			var l := sqrt(nx * nx + ny * ny)
			if l == 0.0:
				l = 1.0
			_foot_nrm.append([nx / l, ny / l])
	return _foot_pts

func foot_nrm() -> Array:
	foot_pts()
	return _foot_nrm

# 轮廓表在固定几个位置上的值先算好（外形一帧要算很多回）：key → {t: [前侧, 后侧, 正面]}
var _memo := {}

## 轮廓表 key 在 t 处的第 k 列（和 BodyGeo.profAt 一样，算过的位置记下来）
func profv(key: String, t: float, k: int) -> float:
	var m: Dictionary = _memo.get(key, {})
	if m.is_empty():
		_memo[key] = m
	var row = m.get(t)
	if row == null:
		var P := prof(key)
		row = [0.0, BodyGeo.profAt(P, t, 1), BodyGeo.profAt(P, t, 2), BodyGeo.profAt(P, t, 3) if P[0].size() > 3 else 0.0]
		if m.size() < 512:
			m[t] = row
	return row[k]

## 这一节骨头的轮廓表
func prof(key: String) -> Array:
	match key:
		"ua": return p_ua
		"fa": return p_fa
		"th": return p_th
		"sh": return p_sh
		"neck": return p_neck
		"torso": return p_torso
	return []
