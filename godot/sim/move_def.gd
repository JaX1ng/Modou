class_name MoveDef
extends RefCounted
## 一招的定义（对照 JS moves.js 里 M({...}) 造出来的对象）。招式表里写的是「基准帧数」，build() 统一换算（和 JS 的 M() 一样）。
## 没写的字段：数值 0、false、空串；JS 里「undefined」的地方用 has_xxx / 哨兵值表示。

var name := ""          # 招式表里的键（jab、heavy……）
var kind := ""          # jab / heavy / kick / grab / script / push
var label := ""         # 招名（面板、教程）
var tag := ""           # 打中时飘的字（连招里的招）
var stamp := ""         # 打中时盖的印章
var open := false       # 起手招：前摇、后摇按 TFO
var S := 0.0
var A := 0.0
var R := 0.0
var dmg := 0.0
var reach := 0.0
var vreach := 0.0       # 0 = 没写（JS 里 undefined → reaches 当 999）
var stun := 0.0
var bstun := 0.0
var kb := 0.0
var stop := 0.0         # 顿帧（0 = 没写，按 4）
var shake := 0.0
var power := 0.0        # 打击音的力度（0 = 没写，按 0.4）
var heavy := false
var limb := ""          # 打人的是哪儿：fh bh ff bf fe sh
var fx := ""            # 命中特效种类
var ghost := false
var has_lunge := false  # 前冲 [起帧, 止帧, 前冲像素]
var lunge := PackedFloat64Array()
var has_armor := false  # 霸体 {n 能硬吃几下, from 前摇第几帧起, vs 能吃哪些系}
var armor_n := 0
var armor_from := 0.0
var armor_vs: Array = []
var launch := 0.0
var launchAir := 0.0
var lie := 0.0
var antiAir := 0.0
var inv := PackedFloat64Array()        # 空 = 没有
var sinv := PackedFloat64Array()
var airInv := PackedFloat64Array()
var slipInv := PackedFloat64Array()
var ender := false
var noCancel := false
var rush := false
var air := false
var evadeCrouch := false
var dive := false
var aaProof := false
var scripted := false     # script 动作（擒拿后续、冲刺、闪身……）
var push := false
var stagger := false
var low := false
var cost := 0.0
# script 动作的事件帧（-1e9 = 没有；JS 里 undefined）
var evPush := -1e9
var evSlam := -1e9
var evWave := -1e9
var evHit := -1e9
var evHit2 := -1e9
var tier := ""
var lead := ""
var height := "mid"
var keys: Array = []    # [[时间（帧，换算后）, Pose, 缓动], …]
var base := {}          # 换算前的 S / A / R
var pre26 := {}

const TIER_OF_KIND := {"jab": "light", "heavy": "heavy", "kick": "kick"}
const TIME_KEYS := ["S", "A", "R", "stun", "bstun", "evPush", "evSlam", "evWave", "evHit", "evHit2"]
const ATK_KEYS := ["S", "R", "stun", "bstun"]
const HOLD_R := 0.2

## 和 JS 的 M(o) 一样：o 是招式表里写的字典（基准帧数），返回换算好的 MoveDef
static func build(nm: String, o: Dictionary) -> MoveDef:
	var d := MoveDef.new()
	d.name = nm
	d.base = {"S": float(o.get("S", 0)), "A": float(o.get("A", 0)), "R": float(o.get("R", 0))}
	var isOpen: bool = o.get("open", false)
	var isScript: bool = o.get("script", false)
	var t := {}
	for k in TIME_KEYS:
		if o.has(k):
			var v := float(o[k])
			if v > 0:
				v = C.TFO(v) if (isOpen and (k == "S" or k == "R")) else C.TF(v)
			t[k] = v
	var lie := C.TFH(float(o.lie)) if o.has("lie") and float(o.lie) != 0.0 else 0.0
	var ranges := {}
	for k in ["inv", "sinv", "airInv", "slipInv"]:
		if o.has(k):
			ranges[k] = [C.TF(float(o[k][0])), C.TF(float(o[k][1]))]
	var lg = null
	if o.has("lunge"):
		lg = [C.TF(float(o.lunge[0])), C.TF(float(o.lunge[1])), float(o.lunge[2])]
	var ar = null
	if o.has("armor"):
		ar = {"n": int(o.armor.n), "from": C.TF(float(o.armor.from)), "vs": o.armor.vs}
	var keys: Array = []
	for kk in o.get("keys", []):
		keys.append([float(kk[0]), kk[1], kk[2] if kk.size() > 2 else "io"])
	if not isScript:
		d.pre26 = {"S": t.get("S", 0.0), "R": t.get("R", 0.0), "stun": t.get("stun", 0.0), "bstun": t.get("bstun", 0.0)}
		for k in ATK_KEYS:
			if t.has(k) and t[k] > 0:
				t[k] = C.TA(t[k])
		for k in ranges:
			ranges[k] = [C.TA(ranges[k][0]), C.TA(ranges[k][1])]
		if lg != null:
			lg = [C.TA(lg[0]), C.TA(lg[1]), lg[2]]
		if ar != null:
			ar.from = C.TA(ar.from)
		if not o.get("air", false):
			# 收招开头 HOLD_R（两成）拳脚停在打出去的地方（2.6）
			var i2 := -1
			for i in keys.size():
				if keys[i][0] == 2.0:
					i2 = i
					break
			if i2 >= 0:
				for kk in keys:
					if kk[0] > 2.0 and kk[0] < 3.0:
						kk[0] = 2.0 + HOLD_R + (kk[0] - 2.0) * (1.0 - HOLD_R)
				keys.insert(i2 + 1, [2.0 + HOLD_R, keys[i2][1], "io"])
	d.kind = o.get("kind", "")
	d.label = o.get("label", "")
	d.tag = o.get("tag", "")
	d.stamp = o.get("stamp", "")
	d.open = isOpen
	d.scripted = isScript
	d.S = t.get("S", float(o.get("S", 0)))
	d.A = t.get("A", float(o.get("A", 0)))
	d.R = t.get("R", float(o.get("R", 0)))
	d.stun = t.get("stun", float(o.get("stun", 0)))
	d.bstun = t.get("bstun", float(o.get("bstun", 0)))
	d.evPush = t.get("evPush", -1e9)
	d.evSlam = t.get("evSlam", -1e9)
	d.evWave = t.get("evWave", -1e9)
	d.evHit = t.get("evHit", -1e9)
	d.evHit2 = t.get("evHit2", -1e9)
	d.dmg = float(o.get("dmg", 0))
	d.reach = float(o.get("reach", 0))
	d.vreach = float(o.get("vreach", 0))
	d.kb = float(o.get("kb", 0))
	d.stop = float(o.get("stop", 0))
	d.shake = float(o.get("shake", 0))
	d.power = float(o.get("power", 0))
	d.heavy = o.get("heavy", false)
	d.limb = o.get("limb", "")
	d.fx = o.get("fx", "")
	d.ghost = o.get("ghost", false)
	if lg != null:
		d.has_lunge = true
		d.lunge = PackedFloat64Array(lg)
	if ar != null:
		d.has_armor = true
		d.armor_n = ar.n
		d.armor_from = ar.from
		d.armor_vs = ar.vs
	d.launch = float(o.get("launch", 0))
	d.launchAir = float(o.get("launchAir", 0))
	d.lie = lie
	d.antiAir = float(o.get("antiAir", 0))
	for k in ranges:
		d.set(k, PackedFloat64Array(ranges[k]))
	d.ender = o.get("ender", false)
	d.noCancel = o.get("noCancel", false)
	d.rush = o.get("rush", false)
	d.air = o.get("air", false)
	d.evadeCrouch = o.get("evadeCrouch", false)
	d.dive = o.get("dive", false)
	d.aaProof = o.get("aaProof", false)
	d.push = o.get("push", false)
	d.stagger = o.get("stagger", false)
	d.low = o.get("low", false)
	d.cost = float(o.get("cost", 0))
	d.tier = o.get("tier", "")
	if d.tier == "":
		d.tier = TIER_OF_KIND.get(d.kind, d.kind)
	d.lead = o.get("lead", "")
	if d.lead == "":
		d.lead = d.tier
	d.height = o.get("height", "mid")
	# 关键帧的「阶段」换成帧：0 起手 → 1 出手 → 2 判定完 → 3 收完；script 动作 0~1 是整段进度
	for kk in keys:
		var p: float = kk[0]
		var tt: float
		if isScript:
			tt = p * d.R
		elif p <= 1.0:
			tt = p * d.S
		elif p <= 2.0:
			tt = d.S + (p - 1.0) * d.A
		else:
			tt = d.S + d.A + (p - 2.0) * d.R
		d.keys.append([tt, Pose.mk(kk[1]), kk[2]])
	return d

## 第 r[0] ~ r[1] 帧（含）这种区间有没有写
static func has_range(r: PackedFloat64Array) -> bool:
	return r.size() == 2
