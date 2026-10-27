class_name CameraRig
extends Camera3D
## 镜头（对照 JS render.js 的 camGoal / render 开头那段）。2D 版是「场地坐标 × 放大倍数 camZ、以 camX 为中心」，
## 3D 里换成：镜头平视（不俯仰），站在人那个平面（z = 0）前面，离多远正好让那个平面上 1 场地像素 = camZ 个逻辑画面像素 ——
## 人在画面上的大小、位置、地线高度都和 2D 版一样（特效、飘字照 2D 的算法画在画面上也对得上）。
##   双人对战（和菜单背景）：照两人中间，离得远就拉远（最远 ZOOM_PVP_MIN），近了放大到 ZOOM。
##   人机 / 联机 / 训练场：放大到 ZOOM、跟着自己；两人放得下就照中间，放不下就让自己靠边、朝对手那边多留地方。
## 镜头只是画面，不进逻辑（联机两边各看各的）。

const S := Rig.S
const VFOV := 24.0

var camX := C.STAGE_W / 2.0
var camZ := C.ZOOM
var camLift := 0.0
var punch := 0.0          # 重击时镜头往里推一下
var shake := 0.0          # 震屏
var flash := 0.0          # 画面白一下（特效层画）
var VW := C.W
var VH := C.H
var FY := C.FLOOR
var shX := 0.0
var shY := 0.0
var _shake_f := -1
var reduce_motion := false

func _ready() -> void:
	fov = VFOV
	keep_aspect = Camera3D.KEEP_HEIGHT
	near = 0.3
	far = 200.0
	current = true

## 逻辑画面多大、地线在哪（和 JS viewFor 一样：比 2:1 窄就宽 1200、往上下多露；比 2:1 宽就高 600、左右多露）
func view_for(cw: float, ch: float) -> void:
	var asp := cw / maxf(1.0, ch)
	VW = C.H * asp if asp >= C.W / C.H else C.W
	VH = C.H if asp >= C.W / C.H else C.W / asp
	FY = C.jsround(VH - (C.H - C.FLOOR) - (VH - C.H) * 0.25)

## 画面比 2:1 高（地线往下挪了）：人再放大一点（最多 12%）
func zoom_boost() -> float:
	return clampf(1.0 + (FY - C.FLOOR) / C.FLOOR * 0.6, 1.0, 1.12)

func goal(mode: String, ax: float, bx: float, local: int) -> Vector2:
	var zTop := C.ZOOM * zoom_boost()
	if mode == "pvp" or mode == "attract":
		var top := C.ZOOM_PVP_MIN * zoom_boost() if mode == "attract" else zTop
		var zoom := clampf(VW / (absf(ax - bx) + 2.0 * C.CAM_MARGIN), C.ZOOM_PVP_MIN, top)
		var half := VW / (2.0 * zoom)
		return Vector2(clampf((ax + bx) / 2.0, half, C.STAGE_W - half), zoom)
	var me := bx if local == 1 else ax
	var op := ax if local == 1 else bx
	var half2 := VW / (2.0 * zTop)
	var dx := op - me
	var x := (ax + bx) / 2.0 if absf(dx) + 2.0 * C.CAM_MARGIN <= 2.0 * half2 else me + signf(dx) * (half2 - C.CAM_MARGIN)
	return Vector2(clampf(x, half2, C.STAGE_W - half2), zTop)

## 每画一帧调一次。rdt：这一帧过了多少毫秒（镜头的平滑按真实时间算）；ax、bx：两人这一刻画在哪；alt：两人里飞得最高的离地多高
func follow(rdt: float, mode: String, ax: float, bx: float, local: int, alt: float, frame_no: int, rnd: Callable) -> void:
	var ease := func(k: float) -> float: return 1.0 - pow(1.0 - k, rdt / C.FRAME_MS)
	var g := goal(mode, ax, bx, local)
	camZ += (g.y - camZ) * ease.call(0.08)
	camX += (g.x - camX) * ease.call(0.12)
	var half := VW / (2.0 * camZ)
	camX = clampf(camX, half, C.STAGE_W - half)
	# 有人跳得高（千斤坠腾起来）时镜头往上挪一点，头不顶到血条
	camLift += (clampf((alt - 30.0) * 0.35, 0.0, 48.0) - camLift) * ease.call(0.1)
	# 震屏每一帧（1/60 秒）换一次位置
	if frame_no != _shake_f:
		_shake_f = frame_no
		var on := shake > 0.3 and not reduce_motion
		shX = rnd.call(-1.0, 1.0) * shake if on else 0.0
		shY = rnd.call(-1.0, 1.0) * shake * 0.6 if on else 0.0
	place()

## 这一刻实际的放大倍数（重击时往里推一下）
func zz() -> float:
	return camZ * (1.0 + (0.0 if reduce_motion else punch))

## 摆镜头：人那个平面（z = 0）上 1 场地像素 = zz 个逻辑画面像素；地线在画面 FY + camLift·zz
func place() -> void:
	var z := zz()
	var f_log := (VH / 2.0) / tan(deg_to_rad(VFOV) / 2.0)   # 逻辑画面上，1 米在 1 米远处多少像素
	var d := f_log * S / z
	# 画面整体平移 (shX, shY)（逻辑像素）= 镜头反着挪
	var cy := (FY + camLift * z - VH / 2.0) * S / z
	position = Vector3(camX * S - shX * S / z, cy + shY * S / z, d)
	rotation = Vector3.ZERO

## 场地坐标 → 画面上的逻辑坐标（和 2D 版一样）。特效、飘字、印章都按这个画
func to_view(x: float, y: float) -> Vector2:
	var z := zz()
	return Vector2(VW / 2.0 + (x - camX) * z + shX, FY + camLift * z + (y - C.FLOOR) * z + shY)

## 画面上的逻辑坐标 → 场地坐标
func to_stage(vx: float, vy: float) -> Vector2:
	var z := zz()
	return Vector2(camX + (vx - shX - VW / 2.0) / z, C.FLOOR + (vy - shY - FY - camLift * z) / z)
