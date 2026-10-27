class_name Rollback
extends RefCounted
## 回滚帧同步的核心（对照 JS net.js 的 Rollback；不碰网络，测试直接拿来测）。
## 两边各跑一份同样的游戏，每步只互传输入。本机输入延后 delay 步；对方的输入还没到就先「猜」（照他上一步按住的方向 / 格挡，
## 不猜新按的招）往下算；真的到了、猜错了，回到那一步用真的重算（重算时特效、声音先攒着，算完只补放新多出来的，见 SimEvents）。
## 「帧号」都是步数（一秒 240 步）。role：host 算 simTick([本机, 对方])，guest 算 simTick([对方, 本机])

var sim: GameSim
var delay := 0
var role := "host"
var frame := 0                     # 下一步要算第几步
var local := {}                    # 本机输入：步号 → 输入
var localUntil := 0                # 已经采到第几步（不含）
var remote := {}                   # 对方的输入
var remoteUntil := 0               # 连续收到第几步（不含）。前 delay 步两边都是 0
var used := {}                     # 算每一步时用的对方输入（真的或猜的）
var snaps := {}                    # 算这一步之前的存档（只给还没确认的步存）
var hashAt := {}                   # 算到第几步时的状态指纹（核对用）
var rollFrom := -1                 # 最早猜错的那一步
var ack := 0                       # 对方已经连续收到我的输入到第几步（不含）
var lastRemote := -1               # 收到过的对方输入里最新的一步（时间同步用）
var remoteAdv := 0                 # 对方觉得他比我快几步（他包里带的）
var stats := {"rollbacks": 0, "frames": 0, "maxDepth": 0}

func _init(g: GameSim, d: int, r: String) -> void:
	sim = g
	delay = d
	role = r
	remoteUntil = d
	for f in d:
		remote[f] = 0

## 本机输入：把第 frame + delay 步（含）以前还没采的都采上（前 delay 步是 0）。read(步号) -> 输入
func sample(read: Callable) -> void:
	while localUntil <= frame + delay:
		local[localUntil] = 0 if localUntil < delay else int(read.call(localUntil))
		localUntil += 1

func predict() -> int:
	return int(remote.get(remoteUntil - 1, 0)) & InputState.HELD_MASK

## 收到对方第 first 步起的一串输入。adv：对方包里带的「他觉得他快几步」（null = 没带）
func receive(first: int, vals: Array, adv = null) -> void:
	if vals.size() > 0 and first + vals.size() - 1 > lastRemote and adv != null:
		remoteAdv = int(adv)        # 只认最新那包的
	for i in vals.size():
		var f := first + i
		var v := int(vals[i])
		if f < remoteUntil or remote.has(f):
			continue
		remote[f] = v
		# 已经按猜的算过了，猜错了
		if f < frame and (not used.has(f) or int(used[f]) != v) and (rollFrom < 0 or f < rollFrom):
			rollFrom = f
	if vals.size() > 0:
		lastRemote = maxi(lastRemote, first + vals.size() - 1)
	while remote.has(remoteUntil):
		remoteUntil += 1

## 回滚：回到最早猜错的那一步，用真的输入重算到现在。返回重算了几步；-1 = 找不到存档（不同步了）
func rollback() -> int:
	if rollFrom < 0:
		return 0
	var from := rollFrom
	rollFrom = -1
	if from >= frame:
		return 0
	if not snaps.has(from):
		push_warning("回滚找不到第 %d 步的存档" % from)
		return -1
	sim.loadState(snaps[from])
	var end := frame
	var g0 := sim.frame
	frame = from
	sim.ev.quiet = true
	sim.ev.roll_start()
	while frame < end:
		advance()
	sim.ev.quiet = false
	sim.ev.roll_end(g0, sim.frame)
	var depth := end - from
	stats.rollbacks += 1
	stats.frames += depth
	stats.maxDepth = maxi(stats.maxDepth, depth)
	return depth

## 还能不能往下算：对方的输入落后太多（超过 MAX_PRED 帧）就停下来等
func canAdvance() -> bool:
	return frame - remoteUntil < C.NET_MAX_PRED * C.SUB and localUntil > frame

## 算一步
func advance() -> void:
	var f := frame
	if f >= remoteUntil:
		snaps[f] = sim.saveState()      # 前面还有没到的步：存个档，万一要回滚
	# 这一步对方的输入到了就用真的（包可能乱序先到，前面还缺几步也一样），没到才猜
	var r: int = int(remote[f]) if remote.has(f) else predict()
	used[f] = r
	var l: int = int(local.get(f, 0))
	sim.simTick([l, r] if role == "host" else [r, l])
	frame = f + 1
	if frame % (C.NET_HASH_EVERY * C.SUB) == 0:
		hashAt[frame] = sim.stateHash()

## 我觉得我比对方快几步：我的步号 - 对方发最新那包时的步号（含单程延迟，两边一样多）
func localAdv() -> int:
	return 0 if lastRemote < 0 else frame - (lastRemote - delay)

## 时间同步（GGPO 的做法）：两边的「我觉得我快几步」都含着一样的网络延迟，相减再除以二，延迟抵消，剩下的就是真的差几步
func timeSync() -> float:
	return (localAdv() - remoteAdv) / 2.0

## 要发给对方的本机输入：对方还没确认的那几步（最多 PKT_MAX 步）。返回 [第一步, [输入…]]
func outgoing() -> Array:
	var last := localUntil - 1
	var from := maxi(maxi(delay, ack), last - NetPacket.PKT_MAX + 1)
	var vals := []
	for f in range(from, last + 1):
		vals.append(int(local.get(f, 0)))
	return [from, vals]

## 两边输入都定了的状态指纹（拿去和对方核对）：[[步号, 指纹], …]
func takeHashes() -> Array:
	var out := []
	var lim := mini(remoteUntil, frame)
	for f in hashAt.keys():
		if f <= lim:
			out.append([f, hashAt[f]])
			hashAt.erase(f)
	return out

## 扔掉用不着的旧数据
func prune() -> void:
	var conf := mini(remoteUntil, frame)
	for k in snaps.keys():
		if k < conf:
			snaps.erase(k)
	for k in used.keys():
		if k < conf:
			used.erase(k)
	for k in remote.keys():
		if k < conf - 1:
			remote.erase(k)
	var lk := mini(ack, conf)
	for k in local.keys():
		if k < lk:
			local.erase(k)
