class_name Outfit
extends RefCounted
## 一身打扮（只是画面）：什么发型、穿什么、什么颜色。人物颜色（PALETTE）换的是袍子的颜色，别的跟着配。
## 现在两身：侠（玩家一那边：束发、交领长袍、护腕、长靴）、僧（玩家二那边：光头、短袍、裹腿、念珠）——照参考图。
## 以后出新人物：另写一身（或者另给一个模型），动作、骨骼不用动。

var kind := "xia"            # xia 侠 / seng 僧
var robe := Color("#e9e4d8")     # 袍子
var robe_dark := Color("#c9c1b0")# 袍子背光面 / 里子
var trim := Color("#1d1e21")     # 领口、袖口、衣边的镶边
var inner := Color("#f3efe6")    # 里衣（领口露出来的一道）
var sash := Color("#2a2b2e")     # 腰带
var pants := Color("#3a3833")    # 裤子
var shoe := Color("#17181a")     # 鞋 / 靴
var bracer := Color("#26221f")   # 护腕
var wrap := Color("#d9d2c2")     # 裹腿
var skin := Color("#e2b48f")
var hair := Color("#141414")
var band := Color("#2a2b2e")     # 头带
var beads := Color("#4a2c1c")    # 念珠
var eye := Color("#1a1412")
var pattern := 0.0               # 袍子上的墨竹（侠，墨色那身）

## 区域编号：模型每个顶点记着自己是哪一块（着色器按编号取颜色，换颜色不用重做模型）
enum R { SKIN, ROBE, ROBE_DARK, TRIM, INNER, SASH, PANTS, SHOE, BRACER, WRAP, HAIR, BAND, BEADS, EYE, MOUTH, WHITE }
const N_REGIONS := 16

## 按人物颜色（PALETTE 的 id）配一身。kind：xia / seng
static func make(kind: String, look_id: String) -> Outfit:
	var o := Outfit.new()
	o.kind = kind
	var look := C.lookOf(look_id)
	var col: String = look.get("color", "#28518f")
	var pal := Pal.of(col)
	var base := Color(col)
	if kind == "xia":
		o.skin = Color("#e6bf9a")
		o.hair = Color("#121212")
		o.pants = Color("#2f2c29")
		o.shoe = Color("#151517")
		o.bracer = Color("#1f1c1a")
		if look_id == "ink":
			# 墨：白袍、墨色镶边、袍子上墨竹（参考图左边那位）
			o.robe = Color("#ebe6da")
			o.robe_dark = Color("#cfc7b6")
			o.trim = Color("#1b1c1f")
			o.inner = Color("#f6f3ec")
			o.sash = Color("#202124")
			o.band = Color("#202124")
			o.pattern = 1.0
		else:
			o.robe = _cloth(base)
			o.robe_dark = o.robe.darkened(0.22)
			o.trim = Color(pal.band).darkened(0.1) if base.get_luminance() < 0.25 else base.darkened(0.55)
			o.inner = Color("#efe9dd")
			o.sash = base.darkened(0.45)
			o.band = Color(pal.band)
	else:
		o.skin = Color("#c29a80")      # 僧：晒黑一点
		o.hair = Color("#2a201a")
		o.pants = Color("#3b3029")
		o.shoe = Color("#1b1714")
		o.wrap = Color("#e1d8c6")
		o.beads = Color("#3c2416")
		if look_id == "ochre":
			o.robe = Color("#c39434")     # 赭：参考图右边那位的土黄僧袍
		else:
			o.robe = _cloth(base)
		o.robe_dark = o.robe.darkened(0.25)
		o.trim = o.robe.darkened(0.45)
		o.inner = o.robe.lightened(0.25)
		o.sash = Color("#9b2a1c") if look_id != "vermil" else Color("#d8b25a")
		o.band = Color(pal.band)
	return o

## 布的颜色：身体色太深的提亮一点（3D 打光后太深的布看不出褶），太艳的压一点
static func _cloth(c: Color) -> Color:
	var h := c.h
	var s := c.s
	var v := c.v
	v = clampf(v * 1.25 + 0.08, 0.28, 0.85)
	s = clampf(s * 0.92, 0.0, 0.85)
	return Color.from_hsv(h, s, v)

## 着色器用的颜色表（按区域编号）。着色器里按线性颜色算光，这里先从 sRGB 转过去（不转的话整个人发白、发灰）
func colors() -> PackedColorArray:
	var a := colors_srgb()
	for i in a.size():
		a[i] = a[i].srgb_to_linear()
	return a

func colors_srgb() -> PackedColorArray:
	var a := PackedColorArray()
	a.resize(N_REGIONS)
	a[R.SKIN] = skin
	a[R.ROBE] = robe
	a[R.ROBE_DARK] = robe_dark
	a[R.TRIM] = trim
	a[R.INNER] = inner
	a[R.SASH] = sash
	a[R.PANTS] = pants
	a[R.SHOE] = shoe
	a[R.BRACER] = bracer
	a[R.WRAP] = wrap
	a[R.HAIR] = hair
	a[R.BAND] = band
	a[R.BEADS] = beads
	a[R.EYE] = eye
	a[R.MOUTH] = skin.darkened(0.35)
	a[R.WHITE] = Color("#f2efe8")
	return a
