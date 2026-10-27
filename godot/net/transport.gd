class_name NetTransport
extends RefCounted
## 联机的「线」：只管把消息送到对面，不懂游戏（游戏那一层在 NetSession）。
## 几种：WebNetTransport（网页版：房间码 / 手动连接码，走浏览器的 WebRTC，见 web/net_bridge.js）、LoopbackTransport（测试用的本机回环）。
## 两条通道：ctl 可靠有序（JSON 消息），in 不保证顺序、不重传（输入包，丢了靠下一包补上）。
## poll() 取走这段时间发生的事，每件是一个字典：
##   {t:"link", again:bool}        两条通道都开了（again = 掉线后同一个人回来了）
##   {t:"ctl", m:{…}}              收到一条控制消息
##   {t:"in", b:PackedByteArray}   收到一个输入包
##   {t:"lost"}                    对局中掉线了，等同一个人回来（hold 开着的时候）
##   {t:"gone"}                    等不回来了 / 对方走了
##   {t:"left"}                    大厅里对方走了，接着在房间里等下一个人
##   {t:"room", s:"waiting" | "error" | "busy" | "version" | "rejoining" | "resumed"}
##   {t:"closed", diag:"…"}        手动连接断了 / 没连上（diag = 卡在哪的说明）
##   {t:"via", v:"direct" | "relay"}  现在走直连还是中继
##   {t:"pair", role, again}       配上一个人了（role：host / guest；again = 掉线后同一个人回来了）

func send_ctl(_m: Dictionary) -> void:
	pass

func send_in(_b: PackedByteArray) -> void:
	pass

func poll() -> Array:
	return []

## 毫秒（真的时钟；测试的回环用自己的假时钟）
func now_ms() -> float:
	return Time.get_ticks_usec() / 1000.0

## 对局中：掉线了等同一个人回来接着打（不在对局里掉线 = 回到等人）
func set_hold(_on: bool) -> void:
	pass

## 断开、退房间
func leave() -> void:
	pass

## 对方说再见：手动连接就断掉；房间码就不理他、留在房间里等下一个
func drop_peer() -> void:
	pass

## 房间码联机吗（不是就是手动连接码）
func is_room() -> bool:
	return false
