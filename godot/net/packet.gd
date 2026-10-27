class_name NetPacket
extends RefCounted
## 输入包（二进制，对照 JS net.js 的 encodeInputs / decodeInputs；大端，和 JS 的 DataView 一样）
## [0] 类型 1 = 输入   [1] 局号 epoch & 255   [2..5] 这包第一步的步号   [6..9] 我已经连续收到你的输入到第几步（不含）
## [10] 步数 n（≤ PKT_MAX）   [11] 我觉得我比你快几步（-128~127，时间同步用）
## [12..] 每步一个输入，2 字节（低 5 位按住、往上 6 位新按下、再往上一位「用冲刺键」，见 InputState）

const PKT_INPUT := 1
const PKT_MAX := 192
const PKT_HEAD := 12

static func encode(epoch: int, first: int, ack: int, vals: Array, adv: float) -> PackedByteArray:
	var n := vals.size()
	var b := PackedByteArray()
	b.resize(PKT_HEAD + 2 * n)
	b[0] = PKT_INPUT
	b[1] = epoch & 255
	_put32(b, 2, first)
	_put32(b, 6, ack)
	b[10] = n & 255
	b[11] = clampi(int(C.jsround(adv)), -128, 127) & 255
	for i in n:
		var v: int = int(vals[i]) & 0xFFFF
		b[PKT_HEAD + 2 * i] = (v >> 8) & 255
		b[PKT_HEAD + 2 * i + 1] = v & 255
	return b

## 不是输入包、长度不对：返回 {}
static func decode(b: PackedByteArray) -> Dictionary:
	if b.size() < PKT_HEAD:
		return {}
	var n: int = b[10]
	if b[0] != PKT_INPUT or b.size() < PKT_HEAD + 2 * n:
		return {}
	var vals: Array = []
	vals.resize(n)
	for i in n:
		vals[i] = (b[PKT_HEAD + 2 * i] << 8) | b[PKT_HEAD + 2 * i + 1]
	var adv: int = b[11]
	if adv >= 128:
		adv -= 256
	return {"epoch": int(b[1]), "first": _get32(b, 2), "ack": _get32(b, 6), "adv": adv, "vals": vals}

static func _put32(b: PackedByteArray, at: int, v: int) -> void:
	b[at] = (v >> 24) & 255
	b[at + 1] = (v >> 16) & 255
	b[at + 2] = (v >> 8) & 255
	b[at + 3] = v & 255

static func _get32(b: PackedByteArray, at: int) -> int:
	return (b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]
