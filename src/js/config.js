'use strict';
/* 全局常量。调手感（物理、伤害倍率、倒地时长、攻防节奏、联机参数）先看这里，招式数值在 moves.js */

const VERSION = '2.3.0';

// 1.8.0 节奏：整体放慢约 7%（Jack：多一点反应时间，别慢太多）。帧数都按 TF() 换算取整，速度按 TEMPO 除。
// 1.9.3 打击节奏再慢 5%（Jack：尤其是前摇、后摇）：招式的前摇 / 判定 / 后摇、硬直、倒地、起身这些帧数再 ×HIT_TEMPO；
// 跑、跳的速度不变（那些按 TEMPO 算）。招式表 moves.js 里写的是基准帧数，M() 统一换算。
// 只用乘除（联机两边算出来一样），不用 Math.pow
// 2.0 节奏分三种（Jack：中立时看不清对面出什么；前后摇要「平等」—— 我后摇长一点，你前摇也长一点；挨打、倒地那种后摇改回去一点）：
//   TF  —— 招式的前摇 / 判定 / 后摇、挨打硬直、格挡硬直、各种窗口（和 1.9.3 一样）
//   TFO —— 起手招（从中立出的第一招：短拳、重拳、腿踢、擒拿、托天掌、铁山靠、抄腿、空中三招）的前摇和后摇再一起慢 OPEN_TEMPO：
//          看得清对面在出什么；后摇跟着一样长，谁打空了被反打的机会还是一样（平等）。连招里接的招不变，真连不受影响
//   TFH —— 「挨了打的后摇」：倒地、起身、失衡、拼招震退这些，改回 1.9.2 的节奏（去掉 1.9.3 多慢的 5%）
const TEMPO = 1.07, TEMPO2 = TEMPO * TEMPO, HIT_TEMPO = 1.05, OPEN_TEMPO = 1.12, REACT_TEMPO = 1;
const TF = n => Math.round(n * TEMPO * HIT_TEMPO);
const TFO = n => Math.round(n * TEMPO * HIT_TEMPO * OPEN_TEMPO);
const TFH = n => Math.round(n * TEMPO * REACT_TEMPO);

// 场地（逻辑坐标，画布按比例缩放）。W 是画面宽；场地 STAGE_W 比画面宽，镜头跟着两人左右移
const W = 1200, H = 600, FLOOR = 520, PUSH = 25;                    // PUSH = 身体半宽
const STAGE_W = 1600, WALL_L = 64, WALL_R = STAGE_W - 64;           // 1.7.0 场地加宽（以前和画面一样宽，墙在 64 / 1136）
const START_GAP = 360;                   // 开局两人站在场地正中、相距多远
// 镜头（1.8.0）：人物放大。人机 / 联机 / 打桩：镜头跟着自己，对手可以在画面外（画面边上有箭头）；
// 双人对战：两人都要在画面里 —— 镜头随距离缩放（近了放大、远了拉远），两人最远 MAXD_PVP
// 2.0（Jack：人物再大一点，大小粗细一起放大）：1.62 → 1.76。全屏时屏幕比 2:1 高（16:9、16:10），多出来的高度再放大一点（render.js zoomBoost）
const ZOOM = 1.76;                       // 人机 / 联机 / 打桩的镜头放大倍数（1.7.0 是 1.22，1.8.0 ~ 1.9.4 是 1.62）
const ZOOM_PVP_MIN = 1.24, CAM_MARGIN = 80;   // 双人对战最远时拉到多远；人离画面边至少留多少（场地坐标）
const MAXD_PVP = Math.round(W / ZOOM_PVP_MIN - 2 * CAM_MARGIN);   // 双人对战两人最远距离（保证都在画面里）。画面宽窄怎么变它都不变（是规则）
const MAX_HP = 400;                      // 血量（1.2.0 是 100；1.3.0 起 600；1.8.0 改成 500；2.3 Jack：全部改成 400）
const DUMMY_HP = 3000, DUMMY_REFILL = 0.3;   // 打桩：木桩血量；掉到三成以下、一套打完就自动回满

// 移动：往哪边按就朝哪边跑，没有后退
const RUN_START = 4.2 / TEMPO, RUN_MAX = 6.8 / TEMPO, RUN_ACC = 0.4 / TEMPO2;    // 起步速度、最高速度、每帧加速（1.8.0 按节奏放慢）
const DTAP_WIN = 12;                     // 同一方向双击间隔（帧）以内 = 冲刺
const DASH_CANCEL = 5;                   // 冲刺第几帧起可以直接按招打出去（无敌帧结束前一点）
const DASH_TURN_KV = 4;                 // 2.0 冲刺里回身出招：还被冲刺带着往原来的方向滑（不带冲势），冲过人再回身打够不太着
const DASH_IN_WIN = TF(8);               // 冲刺结束后几帧内出的第一招都算「冲势」
const DASH_IN_MUL = 1.2, DASH_IN_BSTUN = 4;   // 冲势：伤害倍率；被挡时对方多挨的格挡硬直（冲进去压得住）
const RUN_CHARGE = TF(8);                // 跑满多少帧后按重拳变「铁山靠」
const SOFT_PUSH = 2.0 / TEMPO;                   // 两人身体重叠时每帧互相推开多少（软碰撞：跑着能挤过去换边）
const FACE_SNAP = 52;                    // 两人贴得比这还近时，不按方向 / 出招会自动转向对方（朝向吸附）
// 2.0 边挡边走（Jack）：按住格挡 + 方向（不蹲）= 举着手慢慢走，往前往后都行，一直面朝对手、照样挡得住
const BLOCK_WALK = 1.8 / TEMPO;          // 边挡边走的速度（跑步起步是 4.2）
// 2.0 闪身（边挡边冲刺）：按住格挡、朝对手双击方向（格挡中、挡住的硬直里都行）—— 压低身子从对手身边钻过去、到他身后。
// 2.0.2（Jack：以前躲短拳，钻过去以后收招慢，反倒被对面先起手打背身）：改成只躲得过重拳 ——
//   重系的手上招（重拳、崩拳、劈挂掌、盖步砸拳、铁山靠、截拳）打不中正在钻的人（闪）；短拳、腿、下段、对空、空中招、擒拿都截得住它（截住闪身 ×1.3、硬直更长）。
//   躲过了重拳：钻到他身后自动回身一肘（回身肘），打在他背上 —— 他被打得背对着你踉跄一下（STAGGER：打得中、动不了，这几帧不自动转身），
//   你先动二十来帧，接着打。字幕只出你的（闪、回身肘），不出他怎么了
const SLIP_PAST = 62, SLIP_MIN = 70, SLIP_MAX = 150;   // 钻到对手身后多远（两人中心）；最少 / 最多冲多远
const SLIP_CANCEL = TF(9);               // 闪身钻空了（没躲着重拳）：第几帧起能直接出招
const SLIP_ELBOW_AT = 30;                // 躲过重拳以后，钻到他身后多远（两人中心，按他面朝的方向算）就回身出肘；钻完了还没到也出
const SLIP_CAUGHT_MUL = 1.3, SLIP_CAUGHT_STUN = TF(5);   // 截住闪身的伤害倍率；截住时多几帧硬直
const STAGGER = TF(32), STAGGER_KB = 3;  // 被回身肘打中：背对着踉跄多久（帧）、往前踉跄的力度
// 1.9.0 朝向吸附加强（防打背身）：
//   · 不按左右（站着、蹲着）、格挡、挡住的硬直里：一律自动面向对手（不管远近），对手跑到身后马上转过来；
//   · 出招：对手在 ASSIST_R 以内，一律朝对手打（近身乱按方向也不会打空；对手在空中按他落点算）；更远才照按的方向；
//   · 只按方向不出招 = 想跑：马上朝那边跑，不吸回来（不粘手）。
const ASSIST_R = 170, FACE_HYST = 6;     // 出招吸附范围；对手在身后超过这么多像素才转身（重叠时不来回抖）

// 跳跃与空中
const GRAV = 0.92 / TEMPO2, JUMP_V = 12.7 / TEMPO;   // 重力、起跳速度：最高约 94、空中约 31 帧（1.8.0 同样的高度和远近，慢 7%）
const JUMP_VX = 6.2 / TEMPO;                     // 站着按方向起跳的水平速度：约跳 175（1.6.0 是 4.6，跳着走太近）
const RUN_CARRY = 1.15;                  // 跑着起跳：水平速度 = 跑速 × 1.15（至少 JUMP_VX），全速跑跳约 240
const LEAP_VX = 6.6 / TEMPO;                     // 水平速度超过这个，空中用「飞身」姿势（1.7.0 起不再翻跟头）
const AIR_ACC = 0.35 / TEMPO2, AIR_DRIFT = 3.0 / TEMPO;   // 空中按方向：加速度、能自己控制到的最高水平速度（比地面慢）
const AIR_DRAG = 0.9719;                 // 空中松开方向，水平速度每帧剩几成（1.8.0：0.97 按节奏换算）
const AIR_BONUS = 1.35;                  // 跳起出招伤害倍率
const AIR_SAFE = 60;                     // 跳到比这还高，普通地面招打不到（对空招另算，见招式的 antiAir）
const AIR_VREACH = 105;                  // 空中招往下够多深：人斜着往前下打，整个跳跃过程都够得着地上的人（1.6.0 是 72~80，时机不对就打不到）
const DIVE_HOP = 5 / TEMPO, DIVE_VX = 7 / TEMPO, DIVE_VZ = 9.5 / TEMPO;   // 千斤坠：先往上腾一下（前摇里重力减半），出脚后沿斜线匀速往前下踩
// 1.9.0 千斤坠 = 「坠」系：专破蹲着的防守和反击（尤其托天掌），怕站着的拳
const DIVE_CROUCH_MUL = 1.3;             // 踩中蹲着 / 蹲挡 / 正在出下段招的人（踩蹲）
const DIVE_AA_MUL = 1.5;                 // 踩中正在出托天掌、冲天炮的人：对空招打不到千斤坠，被一脚踩倒（踩断对空）
const DIVE_PUNCH_MUL = 1.4;              // 千斤坠半路被站着的拳（短拳系、重拳系）打中：倒栽葱，伤害加成
const DIVE_AA_ALT = 92;                  // 站着的招能打到多高的千斤坠（别的空中招是 AIR_SAFE）：拳迎着踩下来的脚打
const DIVE_RIDE = 4.2 / TEMPO;           // 踩中后顺着这一脚往下落（不往上弹），很快落在对手面前接连招
// 1.9.4 千斤坠瞄准：出脚那一帧按对手在哪重新定朝向；对手近了就踩得陡一点（最陡直着往下踩）—— 以前离得近会踩过头、甚至转身往反方向踩
const DIVE_AIM = 20;                     // 脚往下够得着对手那一帧，两人中心还差多远（近身时按这个定斜度，脚正好落在对手身上）
const DIVE_LAND_GAP = 56;                // 踩中后落在对手面前多远（近身直着踩下来的，顺势往后带一点，不落在对手身上）
// 空中的腿（飞踢、千斤坠）撞上地上的腿：空中那个人往后翻滚飞回去（1.9.0）
const TUMBLE_VX = 8.4 / TEMPO, TUMBLE_VZ = 6 / TEMPO;   // 翻回去的横向速度（飞得远）、往上弹
const TUMBLE_KEEP = 0.5, TUMBLE_LAND = 7;               // 吃地上那一腿几成伤害；落地硬直
const KICK_AA_ALT = 100;                 // 地上的腿能迎着打到多高的空中出腿的人（别的情况地上的招只打到 AIR_SAFE）

// 出招节奏
const CHAIN_WIN = TF(22);                    // 上一招结束后多少帧内再出招算连招变招
const BUF_WIN = 8;                       // 按键缓冲帧数
const PAIR_WIN = 3;                      // 「重+踢」两键间隔几帧内算同时按
const HITSTOP = 0.85;                    // 打中时的停顿（顿帧）倍率，越小节奏越快（1.8.0 从 0.8 加一点，看得清打中了没）
const BLOCK_KEEP = 0.3;                  // 格挡后承受的伤害比例
const SLOW_JAB_FRAMES = TF(90), SLOW_JAB_ADD = 4;   // 被挡后「势破」持续帧数、下一记短拳前摇增加帧数
// 倒地（2.0，Jack：倒地起身的后摇太长；起身后要有几帧「挨打又动不了」，给对面先出手）：
//   躺着 LIE_* → 起身 GETUP（打不中、动不了，从躺着撑到蹲着）→ 起身硬直 RISE（站起来那几帧：打得中、还动不了）→ 能动。
//   RISE 的长短：对面在你刚能挨打那一帧出短拳（前摇 5）来得及打中；出腿踢（前摇 16）来不及 —— 你先能挡。
//   重拳、腿这些慢招要提前出、算好时机（压起身）才压得住；压早了打空，就该你反打。起身时按住方向 = 滚身起，滚开再站起来
const LIE_HIT = TFH(28);                 // 普通击倒躺多久（1.9.4 是 40，没跟着节奏换算）
const LIE_GROUND = TFH(40), LIE_AIR = TFH(76); // 接腿摔倒地帧数（地面/空中）
const GETUP = TFH(13), RISE = TFH(9);    // 起身（打不中）、起身硬直（打得中、动不了）。1.9.4：起身 20 帧，起来马上能动
const LIE_CRASH = TFH(52);               // 倒栽葱（空中出招被克制打下来）倒地更久（1.9.0）
const ROUND_FRAMES = 300 * 60, WIN_ROUNDS = 3;   // 人机/联机每回合 300 秒；双人不限时；五局三胜（1.8.0，以前三局两胜）
const STEP_MS = 1000 / 60;

// 交手（两边同时出招）。每个招有「主系」tier 和「起手」lead，先比主系、再比起手
const TRADE_LEAD = 3;      // 被打中时自己的招还差 ≤3 帧就出来 = 已经出手，算「交手」而不是被破招
const BEAT_LEAD = 8;       // 自己的招主系克制对方、且 ≤8 帧内就出来：对方这一下被化解（打空），自己的招照出
const CLASH_KEEP = 0.5;    // 平（拼招）：各吃对方伤害的五成
const CLASH_STUN = TFH(11), CLASH_KB = 7.5;   // 拼招后双方硬直、互相震退的力度
const PRESS_KEEP = 0.3;    // 压：主系相同、起手克制。被压的吃全额，压人的只吃三成
const PRESS_STUN = TFH(8);     // 压人的一方小硬直（被压的吃正常硬直，所以压人的能接着打）
const COUNTER_MUL = 1.2;   // 破招：打在对方前摇里；迎击：打在全速跑过来、或冲刺收尾的人身上
const BEAT_MUL = 1.3;      // 克：主系克制，克制方单方面打中
const ARMOR_KEEP = 0.5;    // 霸体硬吃短拳时吃的伤害比例

// 连击衰减（防止一套连到死）：同一套连击里每多挨一下
const STUN_DECAY = 3, STUN_FLOOR = 3;    // 硬直少 3 帧，最少 3 帧
const KB_GROW = 0.3;                     // 击退 +30%，连着打会把人越推越远
const DMG_DECAY = 0.08, DMG_FLOOR = 0.5; // 伤害 -8%，最低五成
const JAB_CHAIN_MAX = 6;                 // 一串最多 6 拳，第 6 拳是收势「寸劲」

// 防守反击
const PARRY_WIN = 6;       // 刚按下格挡的 6 帧内被打中 = 卸力（背对着挡不了，也卸不了）
const PARRY_LOCK = 24;     // 两次按格挡间隔不足 24 帧，第二次没有卸力判定（防乱按）
const PARRY_STUN = TFH(22);  // 被卸力的一方失衡帧数
const PARRY_POSE = 6;      // 卸力成功后的收势帧（期间可以直接出招反打）
const PUSH_KB = 12, PUSH_STUN = TFH(9);      // 推挡：把对方推开的力度、打断对方的硬直
// 1.8.0 防守反击的收益（打得越险的招，被反击时吃得越重）
const PUNISH_MUL = 1.3, PUNISH_KD_MUL = 1.5;   // 挡后反击：打在自己刚挡住的那一招的收招里 ×1.3；那一招是击倒招 ×1.5
// 2.1 被挡住的招收招更长（拳不算、空中招看落地硬直）：重系、腿系、对空 +BLOCK_PEN，击倒招 +BLOCK_PEN_KD。
// 以前被挡住的重拳、腿、击倒招，挡的人一能动就够不着、来不及（实测几乎打不出「挡后反击」，规则里写的破法练不出来）
const BLOCK_PEN = TF(5), BLOCK_PEN_KD = TF(7);
const PUNISH_STUN = TF(5);               // 挡后反击、卸力反击打中多 5 帧硬直（好接连招）
const WHIFF_KD_MUL = 1.25;               // 破绽：击倒招打空 / 被躲开，打它的收招
const PARRY_MUL = 1.35;                  // 卸力反击：卸力后趁对方失衡打中；卸掉的是击倒招按 PUNISH_KD_MUL
const GC_COST = 25;                      // 截拳（挡住后按重）耗气
const HOLD_ESC = TF(7);                  // 擒住开始后几帧内被抓的人按「拿」能挣脱（打中停顿那几帧也算）
const THROW_DMG = 10, KNEE_DMG = [4, 5], KNEE_ADV = TF(6), TRIP_DMG = 8, TACKLE_DMG = 9, SCOOP_DMG = 10, PARRY_THROW_DMG = 13;
const HOLD_GAP = 54;                     // 擒住时把对手带到身前多近
const ROLL_DIST = 96;                    // 倒地起身时按住方向：滚身起，往那边滚这么远
const QI_MAX = 100, QI_BURST = 50;       // 气：满格 100；爆气消耗 50，泼墨消耗 100
const QI_PER_HP = 1 / 6;                 // 掉 / 打掉多少血换多少气（血量 6 倍，气按比例折算，涨气速度和以前一样）
// 2.1（Jack：爆气没啥用 → 挨打的时候爆开，把对方炸倒、打掉 18）：只在挨打（受击硬直）里能爆，格挡硬直里不行
const BURST_RANGE = 180, BURST_DMG = 18, BURST_KB = 7, BURST_LIE = TFH(28);   // 爆气炸到多远、伤害、把人炸飞的力度、对方躺多久
const BURST_BLOCK_KB = 6, BURST_BLOCK_STUN = 6;             // 对方面朝着格挡：只吃三成、被推开一点、几乎不硬直，爆气方的后摇就能被打

// 联机（P2P）
const NET = {
  ICE: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }], // 国内连不上可换成国内能访问的 STUN；中继（TURN）在联机面板里填，存在浏览器里
  APP_ID: 'modou-ink-fight',   // 房间码联机（Trystero）用的应用名：只有同一个游戏、同一个房间码的人会碰到一起
  SIGNAL_N: 8,       // 房间码联机时同时连几个公共信令中继（Nostr，只用来交换连接信息）。多连几个，个别中继挂了也找得到对方
  SIGNAL_URLS: null, // 想指定信令中继就填 ['wss://…', …]；null = 用 Trystero 自带的列表（按 APP_ID 挑，两边挑的一样）
  DELAY: 0,          // 输入延迟帧数，0 = 按网络延迟自动算（1.9.0 有回滚，自动算出来是 1~3 帧）
  MAX_PRED: 10,      // 对方的输入最多先猜多少帧；再落后就停下来等（「等待对方…」）
  RECONNECT_WAIT: 20000,   // 房间码联机连上以后掉线：等同一个人回来多久（毫秒），回来了接着打
  HANDSHAKE_WAIT: 4000,    // Trystero 连上后的握手最多等多久（毫秒），超时就重来（偶尔一边的握手消息来早了被丢掉）
  HASH_EVERY: 120,   // 每多少帧互相核对一次状态，发现不同步会在画面上提示
  ICE_WAIT: 4000,    // 收集连接地址最多等多久（毫秒）
  ICE_WAIT_RELAY: 6500,   // 填了中继时多等一会儿（中继地址要跟中继服务器要）
  CONNECT_WAIT: 20000,    // 房主点「连接」后这么久还没连上，就算失败并说明原因（不然可能一直卡在「连接中」）
  GUEST_WAIT: 300000,     // 加入方生成应答码后最多等房主 5 分钟（中途浏览器报「失败」也不放弃，房主一连就通）
};

// 骨骼长度与配色
// 1.9.4 手臂比例（Jack：小臂短一点、大臂长一点）：大臂 24 → 26.5、小臂 25 → 22.5，整条胳膊一样长（够得着的地方不变）
const BONE = { torso: 44, neck: 6, head: 13, ua: 26.5, fa: 22.5, th: 34, sh: 35 };
const THICK = 1.6;                        // 线条粗细倍率（1.8.0 从 1.3 加粗；1.7.0 去掉了身体外面那圈纸色白边）
const FIST_R = 3.5;                       // 拳头半径（× THICK）。1.9.0 从 4.8 改小，只比手腕粗一点
const C = { ink: '#17181a', indigo: '#28518f', cin: '#b8321d', gam: '#d39c1f', paper: '#ebeae2', paper2: '#dcdad0', dust: '#8d8a7e' };
// 人物颜色（1.7.0）：color 身体、text 写在纸上的字（颜色太浅就用深一点的）。名字就是颜色名。
// 2.0.2（Jack：头带、腰带的颜色怪）：头带、发带、腰带不再另配一个颜色，用身体色提亮的那一版（fx.js palOf 的 band，和身子分得开、一看是一家的）
const PALETTE = [
  { id: 'ink', name: '墨', color: '#17181a', text: '#b8321d' },
  { id: 'indigo', name: '靛', color: '#28518f', text: '#8a6510' },
  { id: 'vermil', name: '朱', color: '#a83220', text: '#8a6510' },
  { id: 'ochre', name: '赭', color: '#7b4a22', text: '#2f6f9a' },
  { id: 'pine', name: '松', color: '#2e6b3c', text: '#b8321d' },
  { id: 'teal', name: '黛', color: '#1d5f66', text: '#9a4f17' },
  { id: 'purple', name: '紫', color: '#5b3b82', text: '#8a6510' },
  { id: 'slate', name: '苍', color: '#5d666b', text: '#b8321d' },
];
const lookOf = id => PALETTE.find(p => p.id === id) || null;
const BRUSH = '"Ma Shan Zheng","Kaiti SC","STKaiti","KaiTi",serif';
const UIF = '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
// 2.1 肘、膝换弯向时每帧最多挪多少（-1 → +1 要 5 帧；只是画面，见 fighter.js fk()）
const IK_FLIP = 0.4;

// 小工具。注意：rnd/pick 只能用在特效和 AI 里，战斗逻辑不能用随机数（联机靠逻辑可重放）
const D2R = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
