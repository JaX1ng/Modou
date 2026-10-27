class_name Pal
extends RefCounted
## 每个人的一套颜色（对照 JS fx.js 的 palOf）：都从身体颜色算出来。
##   ink  身体色本身：印章底板、伤害数字、冲击星、墨点
##   fx   打击色：同色提亮、提饱和 —— 火花、气浪
##   qi   气：同色往淡里走 —— 身上的火苗、光、扫痕、残影、拖尾线
##   core 火花芯、旺火的火心：再淡一层
##   band 头带、发带、腰带：同一个颜色往亮里提一截，饱和度略低一点像布
## 颜色都是 "#rrggbb" 字串（和 JS 一样算，算出来一样）；要 Color 用 col()

const PAPER := "#ebeae2"
const INK := "#17181a"
const CIN := "#b8321d"       # 朱砂
const GAM := "#d39c1f"       # 藤黄

static var _cache := {}

static func rgb(c: String) -> Array:
	var n := c.substr(1).hex_to_int()
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]

static func hsl(c: String) -> Array:
	var v := rgb(c)
	var r: float = v[0] / 255.0
	var g: float = v[1] / 255.0
	var b: float = v[2] / 255.0
	var mx := maxf(r, maxf(g, b))
	var mn := minf(r, minf(g, b))
	var l := (mx + mn) / 2.0
	var d := mx - mn
	var s := d / (1.0 - absf(2.0 * l - 1.0)) if d != 0.0 else 0.0
	var h := 0.0
	if d != 0.0:
		if mx == r:
			h = fmod((g - b) / d + 6.0, 6.0)
		elif mx == g:
			h = (b - r) / d + 2.0
		else:
			h = (r - g) / d + 4.0
	return [h, s, l]

static func hex_hsl(h: float, s: float, l: float) -> String:
	var c := (1.0 - absf(2.0 * l - 1.0)) * s
	var x := c * (1.0 - absf(fmod(h, 2.0) - 1.0))
	var m := l - c / 2.0
	var R := 0.0
	var G := 0.0
	var B := 0.0
	if h < 1.0:
		R = c; G = x
	elif h < 2.0:
		R = x; G = c
	elif h < 3.0:
		G = c; B = x
	elif h < 4.0:
		G = x; B = c
	elif h < 5.0:
		R = x; B = c
	else:
		R = c; B = x
	return "#" + _hx(R + m) + _hx(G + m) + _hx(B + m)

static func _hx(v: float) -> String:
	return "%02x" % int(C.jsround(clampf(v, 0.0, 1.0) * 255.0))

static func lum(c: String) -> float:
	var v := rgb(c)
	var o := 0.0
	var w := [0.2126, 0.7152, 0.0722]
	for i in 3:
		var x: float = v[i] / 255.0
		x = x / 12.92 if x <= 0.04 else pow((x + 0.055) / 1.055, 2.4)
		o += w[i] * x
	return o

static func contrast(a: String, b: String) -> float:
	var x := lum(a)
	var y := lum(b)
	return (maxf(x, y) + 0.05) / (minf(x, y) + 0.05)

static func mix(a: String, b: String, k: float) -> String:
	var A := rgb(a)
	var B := rgb(b)
	var s := "#"
	for i in 3:
		s += "%02x" % int(C.jsround(A[i] + (B[i] - A[i]) * k))
	return s

## 一个身体色的整套颜色 {ink, fx, qi, core, band}
static func of(col: String) -> Dictionary:
	if _cache.has(col):
		return _cache[col]
	var hl := hsl(col)
	var h: float = hl[0]
	var s: float = hl[1]
	var l: float = hl[2]
	var gray := s < 0.2
	var fx := hex_hsl(h, s, clampf(l + 0.12, 0.22, 0.52)) if gray else hex_hsl(h, minf(1.0, s * 1.15 + 0.06), clampf(l * 1.22, 0.36, 0.52))
	var qs := minf(1.0, s * 1.6) if gray else minf(1.0, s * 1.1)
	var ql := l + ((0.6 if gray else 0.7) - l) * (0.5 if gray else 0.45)
	var qi := hex_hsl(h, qs, ql)
	while contrast(qi, col) < 2.6 and ql < 0.72 and lum(hex_hsl(h, qs, ql + 0.02)) <= 0.36:
		ql += 0.02
		qi = hex_hsl(h, qs, ql)
	var bs := s if gray else minf(1.0, s * 0.9)
	var bl := l
	var band := col
	while contrast(band, col) < 2.3 and bl < 0.8:
		bl += 0.01
		band = hex_hsl(h, bs, bl)
	var o := {"ink": col, "fx": fx, "qi": qi, "core": mix(fx, "#f4f3ec", 0.62), "band": band}
	_cache[col] = o
	return o

static func col(c: String, a := 1.0) -> Color:
	var v := Color(c)
	v.a = a
	return v
