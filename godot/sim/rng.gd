class_name AiRng
extends RefCounted
## 电脑 AI、木桩用的随机数（JS 里是 Math.random；测试里给它固定种子）。两个电脑共用一串（和 JS 一样），
## 算法和 JS tests.js 的 seededRandom 一样：s = s·1103515245 + 12345（取低 32 位），返回 s / 2³²。
## 只给 AI 用：战斗逻辑不用随机数（联机不走 AI）。

static var s := 1

static func seed(v: int) -> void:
	s = v & 0xFFFFFFFF

static func seed_from_time() -> void:
	seed(int(Time.get_unix_time_from_system() * 1000.0) ^ Time.get_ticks_usec())

static func R() -> float:
	s = (s * 1103515245 + 12345) & 0xFFFFFFFF
	return s / 4294967296.0

static func pick(arr: Array):
	return arr[int(R() * arr.size())]
