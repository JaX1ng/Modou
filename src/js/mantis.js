'use strict';
/* ============================================================
   螳螂拳（3.3；设计稿 MANTIS.md）—— 第四派。Jack：螳螂拳的特点是快，但是有弱点在那里；打法、动作的特点我自己定，
   每一派的特点都要非常鲜明、打法非常不同（格斗术 = 攻击多样；咏春 = 防守反打 + 连续进攻，难、上限高；太极 = 慢而强）。
   螳螂的操作是「快 · 勾 · 蹦」：
   · 快：全派没有慢招（站着出的拳 / 重 / 踢前摇 4 / 8 / 6，四派里唯一重、踢也快的），代价一下轻（崩捶 6、劈掌 11、勾踢 7）
   · 一手刁、一手打（3.4，MANTIS.md 〇节）：出手的时候另一只手往下一刁、往回一带；拳背崩、勾手撕、掌刃砍、立掌穿，腿低（勾脚踝）、近（提膝）
   · 勾打连环（3.4）：一串里连着打不过 MT_RUN_MAX 下 —— 两下以后按拿 = 刁手（他接着挨打、被拉回来，下一下 ×MT_DIAO_MUL），或者收势（双封手、勾挂腿、挑掌）；
     打打 · 刁 · 打打 · 刁 · 收，一串最多 COMBO_MAX 下；越连越快（每多一下下一招前摇 −MT_ACC，最少 MT_S_MIN）；
     气短：第三下起每多一下，这一招的收招多 MT_WIND 帧 —— 一串停在哪一下，哪一下就喘这么多（最后一下被挡住 = 大破绽）
   · 勾（拿 = 勾搂，招身上 hook）：他正出手上的招（前摇后 MT_HOOK_EARLY 帧 / 判定里）= 勾住（他的招没了、被勾到面前失衡 MT_HOOK_STUN，
     你 6 帧收手先动，接着打中 ×MT_HOOK_MUL 勾打）；他出腿 = 搂腿（接腿摔）；他站着 / 挡着 / 收招 = 采手（拉一步、短硬直 MT_CAI_STUN，不是擒住）；
     勾空、勾到蹲着的 = 大破绽。螳螂没有卸力，勾就是它的卸力：不是挡着等，是看见他出手伸手去勾
   · 蹦（后 = 蹦步退）：出招打中 / 被挡住以后（判定出来了）按一下后 = 收招换成往后一蹦（MT_HOP 帧、MT_HOP_PX 像素），不吃气短；打空了不能蹦
   · 弱点：薄挡（挡住重系、腿系、空中、对空、大招：削血多 MT_GUARD_CHIP、硬直多 MT_GUARD_ADD、推得远 MT_GUARD_KB；轻拳照旧不掉血）、
     没有卸力（parry: false）、一下轻、勾空 / 停手都是破绽、采手只是短硬直（他蹲着勾也抓不到）
   难度：中等偏难（乱按也能打，但乱按吃亏：轻拳挡住不掉血、停手就喘、挡重招被压），上限中高：读他出手去勾、被挡那一下蹦出去、上下段换着打
   引擎在这几处先问这一派（STYLES.mantis 的钩子，和咏春拳、太极拳一样）：出招中（input 'attack'：越连越快、气短、蹦步退、勾住 / 采手 / 搂腿的那几步）、
   站着 / 挡住硬直里（'neutral' / 'blockstun'：记按后的边沿）、挨打（defend：薄挡）、抓到人（grab：勾住 / 采手 / 搂腿）、画架势（target）、画提示（drawCue）
   ============================================================ */

/* ---------- 底子 = 待机 螳螂桩（ref/mt_stance.png；3.4 照图改对：3.3.0 前后手做反了）——
   大弓步（前腿弓、大腿差不多平，后腿蹬直往后伸），身子立着微微往前；前手勾手高高探在前面、手比头还高（肘往下沉、小臂往上竖，
   手腕折下来、指尖捏在一起朝下）；后手勾手横在胸前（肘贴着身子往下、小臂横着）。这是所有招的底子：关键帧没写的部分都从这里来 ---------- */
const MBASE = { rot: 0, spin: 0, tor: 6, head: 4, hy: 56, dx: 0, air: 0, fe: 1, be: 1, tw: 20, fn: 1, bn: 1, ft: 0, bt: 0, fo: 0, bo: 0,
  fp: 1, bp: 1, fpa: 100, bpa: 100, fpr: 0.85, bpr: 0.85, fw: 0, bw: 0, fz: 0, fs: 0.15, bs: 0.15, fhk: 1, bhk: 1, fv: 0, bv: 0,
  fh: [37, -11], bh: [9, 17], ff: [51, 0], bf: [-57, 0] };
// 后脚踩在地上的姿势，脚踝伸不到就往回收（和太极拳的 tjReach 一样：站高了后腿够不着地就飘）
const M_LEG = (BODY.bone.th + BODY.bone.sh) * 0.985;
function mtReach(p) {
  if (p.bf[1] !== 0 || p.air > 0) return p;
  const dy = p.hy - BODY.bone.ankle, dx = Math.sqrt(Math.max(0, M_LEG * M_LEG - dy * dy)) + BODY.hipSplit;
  if (-p.bf[0] > dx) p.bf[0] = -dx;
  return p;
}
const mmk = o => mtReach(mk(o, MBASE));
function MM(o) { o.pb = MBASE; o.style = 'mantis'; o.mt = true; const d = M(o); for (const k of d.keys) mtReach(k[1]); return d; }
const MJ = (base, o) => Object.assign({}, base, o);
// 一只手：hook 勾手（螳螂手，pa 指尖朝哪：0 往前、90 朝下、-90 朝上）/ palm 掌 / fist 拳（v 0 拳心朝下：拳背崩出去；1 竖拳）
const mHand = (h, at, kind, pa, pr, s, v) => kind === 'fist' ? { [h + 'h']: at, [h + 'p']: 0, [h + 'v']: v === undefined ? 0 : v, [h + 'hk']: 0, [h + 'w']: 0 }
  : { [h + 'h']: at, [h + 'p']: 1, [h + 'hk']: kind === 'hook' ? 1 : 0, [h + 'pa']: pa === undefined ? -80 : pa, [h + 'pr']: pr === undefined ? 0.7 : pr, [h + 's']: s === undefined ? 0.2 : s, [h + 'w']: 0 };
const M_STAND = { hy: 56, ff: [51, 0], bf: [-57, 0] };                 // 螳螂桩的大弓步
const M_IN = { hy: 54, ff: [58, 0], bf: [-55, 0] };                    // 上步（重心往前送）
const M_SIT = { hy: 58, ff: [44, 0], bf: [-58, 0] };                   // 坐后腿（撤步、刁回来）
const M_HI = mHand('f', [37, -11], 'hook', 100, 0.85);                 // 前手勾手高探（桩上那样）
const M_CH = mHand('b', [9, 17], 'hook', 100, 0.85);                  // 后手勾手横在胸前
// 一手刁、一手打：出手的时候另一只手不护下巴，往下一刁、往回一带（像按住他的手打）
const M_DIAO_F = mHand('f', [26, 8], 'hook', 125, 0.9);                // 前手刁住往回带
const M_DIAO_B = mHand('b', [24, 10], 'hook', 115, 0.9);               // 后手往前下一刁

/* ---------- 几个常用的样子 ---------- */
// 崩捶：后手竖拳收到肋下、从胸前崩出去（短、不伸直），前手同时往下一刁
const MP_BENG0 = MJ(M_STAND, { tor: 6, tw: 26, ...M_HI, ...mHand('b', [6, 16], 'fist', 0, 0, 0, 1) });
const MP_BENG = MJ(M_IN, { tor: 12, head: 2, dx: 8, tw: -30, be: 1, ...mHand('b', [50, 0], 'fist', 0, 0, 0, 1), bw: 6, ...M_DIAO_F });
// 探手：坐一下、前手勾手往前一探（射程最长）
const MP_TAN0 = MJ(M_SIT, { tor: 2, tw: 12, ...mHand('f', [30, -8], 'hook', 80, 0.85), ...M_CH });
const MP_TAN = MJ(M_IN, { tor: 14, head: 2, dx: 14, tw: 36, fe: 1, ...mHand('f', [60, -6], 'hook', 70, 0.85, 0.3), ...M_CH });
// 撤步崩：前手拳背从高处往前下一崩，人往后撤
const MP_CHE0 = MJ(M_STAND, { tw: 22, fe: -1, ...mHand('f', [28, -32], 'fist', 0, 0, 0, 0), ...M_CH });
const MP_CHE = MJ(M_SIT, { tor: 4, dx: -8, head: 4, tw: 34, fe: 1, ...mHand('f', [56, -2], 'fist', 0, 0, 0, 0), fw: 14, ...M_CH });
// 劈掌：前手翻上头顶、掌刃劈下来（上段），后手同时往前下一刁
const MP_PI0 = MJ(M_STAND, { tor: -4, head: -6, hy: 58, tw: 10, fe: -1, ...mHand('f', [10, -44], 'palm', -110, 0.2, 0.1), ...M_DIAO_B });
const MP_PI = MJ(M_IN, { tor: 18, head: 6, dx: 14, tw: 34, fe: 1, ...mHand('f', [52, -2], 'palm', 40, 0, 0.1), ...mHand('b', [14, 14], 'hook', 120, 0.9) });
// 挂打：前手往上一挂（小臂竖起来拨开他的手），后手竖拳顺势打脸
const MP_GUA0 = MJ(M_STAND, { tor: 2, tw: 14, fe: -1, ...mHand('f', [30, -36], 'hook', -50, 0.85), ...mHand('b', [6, 12], 'fist', 0, 0, 0, 1) });
const MP_GUADA = MJ(M_IN, { tor: 14, head: 2, dx: 18, tw: -38, fe: -1, be: 1, ...mHand('f', [26, -40], 'hook', -50, 0.85), ...mHand('b', [56, -10], 'fist', 0, 0, 0, 1), bw: 10 });
// 挑掌（对空）：掌心朝上往上一挑
const MP_TIAO0 = MJ(M_STAND, { hy: 50, tor: 16, head: -2, tw: 12, ...mHand('f', [26, 12], 'palm', 10, 0.6, 0.2), ...M_CH });
const MP_TIAO = { hy: 64, tor: -6, head: -10, dx: 8, tw: 22, ff: [30, 0], bf: [-36, 0], fe: 1, ...mHand('f', [34, -52], 'palm', -100, 0.5, 0.35), ...mHand('b', [10, 10], 'hook', 100, 0.85) };
// 勾踢（下段）：前脚贴着地往前一勾，勾他的脚踝（脚尖勾着），两只手还架着
const MP_GOU0 = { hy: 60, tor: 4, head: 2, tw: 16, ff: [28, 10], bf: [-40, 0], ...M_HI, ...M_CH };
const MP_GOU = { hy: 62, tor: -8, head: 6, dx: 10, tw: 14, ff: [86, 4], ft: 34, bf: [-38, 0], ...mHand('f', [36, -18], 'hook', 100, 0.85), ...M_CH };
// 提膝：上步提膝撞，两只勾手往下一采（按着他往膝盖上撞）
const MP_XI0 = { hy: 60, tor: 8, tw: 14, ff: [30, 18], bf: [-40, 0], ...mHand('f', [46, -14], 'hook', 90, 0.85), ...mHand('b', [28, -2], 'hook', 90, 0.85) };
const MP_XI = { hy: 66, tor: 2, head: 6, dx: 18, tw: 14, ff: [34, 44], ft: -10, bf: [-30, 0], ...mHand('f', [36, 12], 'hook', 130, 0.9), ...mHand('b', [28, 16], 'hook', 130, 0.9) };
// 勾挂腿（下段，勾倒）：蹲下前腿贴地往里一勾
const MP_SAO0 = { hy: 44, tor: 24, head: -2, tw: 10, ff: [30, 0], bf: [-30, 0], ...mHand('f', [30, -2], 'hook', 100, 0.85), ...M_CH };
const MP_SAO = { hy: 28, tor: 10, head: 2, dx: 6, tw: 4, ff: [78, 0], ft: 36, bf: [-30, 0], bo: 40, ...mHand('f', [44, 12], 'palm', -10, 0.6, 0.3), ...mHand('b', [-20, -10], 'hook', 100, 0.85) };
// 撕手：勾手从上往前下一撕（爪子一样耙下来）—— 一串里两只手轮着撕
const MP_SIF0 = MJ(M_STAND, { tw: 24, fe: -1, ...mHand('f', [34, -30], 'hook', -30, 0.85), ...M_CH });
const MP_SIF = MJ(M_IN, { tor: 16, head: 4, dx: 10, tw: 30, fe: 1, ...mHand('f', [50, 10], 'hook', 110, 0.9, 0.3), ...mHand('b', [18, 6], 'hook', 100, 0.85) });
const MP_SIB0 = MJ(M_STAND, { tw: 4, be: -1, ...mHand('b', [18, -30], 'hook', -30, 0.85), ...M_DIAO_F });
const MP_SIB = MJ(M_IN, { tor: 16, head: 4, dx: 10, tw: -34, be: 1, ...mHand('b', [50, 10], 'hook', 110, 0.9, 0.3), ...M_DIAO_F });
// 翻腕砍：掌收到对侧肩前（手腕翻过来），掌刃横着砍出去（颈、胸）—— 两只手轮着砍
const MP_KANF0 = MJ(M_STAND, { tor: 4, tw: 4, ...mHand('f', [10, -12], 'palm', 180, 0, 0.1), ...M_CH });
const MP_KANF = MJ(M_IN, { tor: 14, head: 2, dx: 12, tw: 40, ...mHand('f', [54, -12], 'palm', 0, 0, 0.1), ...mHand('b', [18, 10], 'hook', 110, 0.9) });
const MP_KANB0 = MJ(M_STAND, { tor: 4, tw: 30, ...mHand('b', [4, -10], 'palm', 180, 0, 0.1), ...M_DIAO_F });
const MP_KANB = MJ(M_IN, { tor: 14, head: 2, dx: 12, tw: -42, be: 1, ...mHand('b', [54, -12], 'palm', 0, 0, 0.1), ...M_DIAO_F });
// 刁手：前手勾手一探、勾住他的手腕往回一带
const MP_DIAO = MJ(M_IN, { tor: 10, dx: 8, tw: 30, fe: 1, ...mHand('f', [56, -4], 'hook', 60, 0.85, 0.3), ...M_CH });
const MP_DIAO2 = MJ(M_SIT, { tor: 6, dx: 2, tw: 20, fe: 1, ...mHand('f', [28, 10], 'hook', 130, 0.9), ...mHand('b', [18, 4], 'hook', 100, 0.85) });
// 寸打：刁住以后后手竖拳贴身一崩（最快）
const MP_CUN0 = MJ(M_STAND, { tw: 16, ...mHand('b', [10, 14], 'fist', 0, 0, 0, 1), ...M_DIAO_F });
const MP_CUN = MJ(M_IN, { tor: 10, dx: 6, tw: -24, be: 1, ...mHand('b', [44, 6], 'fist', 0, 0, 0, 1), ...M_DIAO_F });
// 穿心掌：刁住以后后手立掌直穿胸口
const MP_CHUAN0 = MJ(M_STAND, { tw: 10, ...mHand('b', [4, 16], 'palm', -90, 0.4, 0.1), ...M_DIAO_F });
const MP_CHUAN = MJ(M_IN, { tor: 16, head: 2, dx: 16, tw: -42, be: 1, ...mHand('b', [58, 2], 'palm', -86, 0.5, 0.1), ...M_DIAO_F });
// 双封手（收势）：两掌一起封出去
const MP_SF0 = MJ(M_SIT, { tor: 0, dx: -4, tw: 6, fe: 1, be: 1, ...mHand('f', [16, 4], 'palm', -82, 0.55, 0.25), ...mHand('b', [12, 8], 'palm', -82, 0.55, 0.25) });
const MP_SF = MJ(M_IN, { tor: 16, head: 2, dx: 18, tw: 6, fe: 1, be: 1, ...mHand('f', [54, 0], 'palm', -78, 0.55, 0.35), ...mHand('b', [50, 6], 'palm', -78, 0.55, 0.35) });
// 封手（挡）：两只勾手竖在胸前，像两把刀（前臂横截护中线）；蹲着的挡两手往下封
const MP_FENG = MJ(M_STAND, { hy: 54, tor: 4, head: 4, dx: -2, tw: 8, fe: 1, be: 1, ...mHand('f', [32, -8], 'hook', 100, 0.9), ...mHand('b', [22, 0], 'hook', 100, 0.9), fz: 1 });
const MP_FENG_LOW = { hy: 40, tor: 14, head: 4, tw: 6, ff: [40, 0], bf: [-50, 0], fe: 1, be: 1, ...mHand('f', [30, 4], 'hook', 110, 0.9), ...mHand('b', [24, 10], 'hook', 110, 0.9) };
// 勾搂：前手勾手往前一探、一勾、往回一带
const MP_HOOK0 = MJ(M_STAND, { tor: 6, tw: 16, ...mHand('f', [34, -8], 'hook', 80, 0.85), ...M_CH });
const MP_HOOK = MJ(M_IN, { tor: 14, head: 2, dx: 12, tw: 36, fe: 1, ...mHand('f', [58, 0], 'hook', 76, 0.85, 0.3), ...M_CH });
const MP_HOOK_IN = MJ(M_SIT, { tor: 8, dx: 2, tw: 18, fe: 1, ...mHand('f', [32, 12], 'hook', 120, 0.9, 0.2), ...mHand('b', [16, 6], 'hook', 100, 0.85) });   // 勾住往回一带

/* ---------- 招式表 ---------- */
const MMOVES = {
  /* ---- 拳 ---- */
  // 崩捶：后手竖拳从胸前崩出去（短、快），前手同时往下一刁 —— 最快的起手（4 帧）；一下轻
  mtBeng: MM({ kind: 'jab', label: '崩捶', open: true, S: 4, A: 3, R: 7, dmg: 6, reach: 94, stun: 13, bstun: 7, kb: 2, stop: 4, power: .3,
    limb: 'bh', fx: 'jab', lunge: [1, 4, 5],
    keys: [[0, {}], [0.4, MP_BENG0], [1, MP_BENG, 'back'], [2, MP_BENG], [2.45, MJ(MP_BENG, { tw: -18, bh: [36, 4] })], [3, {}]] }),
  // 探手（前 + 拳）：上步，前手勾手往前一探 —— 射程最长、最轻，探路用
  mtTan: MM({ kind: 'jab', label: '探手', tag: '探手', open: true, S: 5, A: 3, R: 8, dmg: 5, reach: 110, stun: 12, bstun: 7, kb: 2, stop: 4, power: .3,
    limb: 'fh', fx: 'jab', lunge: [1, 5, 18],
    keys: [[0, {}], [0.45, MP_TAN0], [1, MP_TAN, 'back'], [2, MP_TAN], [3, {}]] }),
  // 撤步崩（后 + 拳）：退一步，前手拳背从高处往前下一崩（拉开距离）
  mtChe: MM({ kind: 'jab', label: '撤步崩', tag: '撤步崩', open: true, S: 5, A: 3, R: 7, dmg: 6, reach: 98, stun: 13, bstun: 7, kb: 3, stop: 4, power: .3,
    limb: 'fh', fx: 'jab', lunge: [2, 12, -36],
    keys: [[0, {}], [0.4, MP_CHE0], [1, MP_CHE, 'back'], [2, MP_CHE], [3, {}]] }),
  // 撩掌（蹲 + 拳）：蹲下后手掌心朝上往前上方一撩（下段），前手还架着
  mtLiao: MM({ kind: 'jab', label: '撩掌', tag: '撩掌', open: true, S: 5, A: 3, R: 8, dmg: 5, reach: 90, stun: 12, bstun: 7, kb: 2, stop: 4, power: .3, height: 'low',
    limb: 'bh', fx: 'low', lunge: [1, 5, 4],
    keys: [[0, { hy: 44, tor: 22, head: -4, tw: 6, ff: [36, 0], bf: [-34, 0], ...mHand('f', [34, -4], 'hook', 100, 0.85), ...mHand('b', [8, 24], 'palm', 60, 0.5, 0.2) }],
      [1, { hy: 40, tor: 28, head: -6, dx: 10, tw: -30, ff: [46, 0], bf: [-36, 0], ...mHand('f', [28, 4], 'hook', 120, 0.9), ...mHand('b', [50, 26], 'palm', -40, 0.5, 0.3) }, 'back'],
      [2, { hy: 40, tor: 28, head: -6, dx: 10, tw: -30, ff: [46, 0], bf: [-36, 0], ...mHand('f', [28, 4], 'hook', 120, 0.9), ...mHand('b', [50, 26], 'palm', -40, 0.5, 0.3) }],
      [3, { hy: 44, tor: 22, head: -4, tw: 6, ff: [36, 0], bf: [-34, 0], ...mHand('f', [34, -4], 'hook', 100, 0.85), ...mHand('b', [8, 24], 'palm', 60, 0.5, 0.2) }]] }),

  /* ---- 重 ---- */
  // 劈掌：前手翻上头顶、掌刃劈下来（上段，蹲着挡不住）；前摇 8，比格斗术的重拳快一倍多，一下 11
  mtPi: MM({ kind: 'heavy', label: '劈掌', stamp: '劈掌', open: true, height: 'high', S: 8, A: 4, R: 11, dmg: 11, reach: 100, stun: 17, bstun: 10, kb: 4, stop: 7, shake: 4, power: .75, heavy: true,
    limb: 'fh', fx: 'palm', lunge: [2, 8, 10],
    keys: [[0, {}], [0.5, MP_PI0], [1, MP_PI, 'back'], [2, MP_PI], [3, {}]] }),
  // 挂打（前 + 重）：上步，前手往上一挂（拨开他的手），后手竖拳顺势打脸
  mtGuaDa: MM({ kind: 'heavy', label: '挂打', stamp: '挂打', open: true, S: 9, A: 4, R: 12, dmg: 12, reach: 104, stun: 18, bstun: 11, kb: 5, stop: 8, shake: 5, power: .85, heavy: true,
    limb: 'bh', fx: 'heavy', lunge: [2, 9, 22],
    keys: [[0, {}], [0.5, MP_GUA0], [1, MP_GUADA, 'back'], [2, MP_GUADA], [3, {}]] }),
  // 挑掌（蹲 + 重）：对空，掌心朝上往上一挑，打跳过来的人
  mtTiao: MM({ kind: 'heavy', label: '挑掌', stamp: '挑掌', tier: 'aa', lead: 'heavy', open: true, S: 7, A: 5, R: 14, dmg: 10, reach: 92, stun: 15, bstun: 10, kb: 3, stop: 8, shake: 4, power: .8,
    limb: 'fh', fx: 'palm', lunge: [2, 7, 6], launchAir: 9, antiAir: 160, airInv: [1, 12], ender: true, noCancel: true,
    keys: [[0, MP_TIAO0], [1, MP_TIAO, 'out'], [2, MJ(MP_TIAO, { hy: 66, tor: -8, head: -14, fh: [26, -60] })], [3, {}]] }),

  /* ---- 踢：腿低、腿近 ---- */
  // 勾踢（下段）：前脚贴着地往前一勾，勾他的脚踝（站着挡不住），手还架着
  mtGou: MM({ kind: 'kick', label: '勾踢', stamp: '勾踢', open: true, height: 'low', S: 6, A: 4, R: 11, dmg: 7, reach: 104, stun: 14, bstun: 8, kb: 3, stop: 6, shake: 3, power: .6,
    limb: 'ff', fx: 'low', lunge: [2, 6, 6],
    keys: [[0, {}], [0.5, MP_GOU0], [1, MP_GOU, 'back'], [2, MP_GOU], [2.5, MP_GOU0], [3, {}]] }),
  // 提膝（前 + 踢）：上步提膝撞，两只勾手往下一采（按着他往膝盖上撞）
  mtXi: MM({ kind: 'kick', label: '提膝', stamp: '提膝', open: true, S: 7, A: 4, R: 12, dmg: 10, reach: 86, stun: 16, bstun: 10, kb: 6, stop: 7, shake: 4, power: .8,
    limb: 'ff', fx: 'kick', lunge: [1, 7, 26],
    keys: [[0, {}], [0.5, MP_XI0], [1, MP_XI, 'back'], [2, MP_XI], [2.5, MP_XI0], [3, {}]] }),
  // 勾挂腿（蹲 + 踢；一串里也是收势）：蹲下前腿贴地往里一勾，勾倒（下段，打倒）
  mtSao: MM({ kind: 'kick', label: '勾挂腿', stamp: '勾挂腿', open: true, S: 8, A: 4, R: 16, dmg: 8, reach: 108, stun: 16, bstun: 9, kb: 4, stop: 7, shake: 5, power: .75, height: 'low',
    limb: 'ff', fx: 'sweep', lunge: [2, 8, 8], launch: 3.5, lie: 20, ender: true, mtFin: true,
    keys: [[0, MP_SAO0], [1, MP_SAO, 'out'], [2, MP_SAO], [3, MP_SAO0]] }),

  /* ---- 一串里（打中 / 被挡住马上按；连打不过两下，要么刁、要么收势，见 mtVariant / mtCanCancel）---- */
  // 撕手：勾手从上往前下一撕 —— 拳在一串里，两只手轮着撕（上一下前手打的这一下后手）
  mtSiF: MM({ kind: 'jab', label: '撕手', tag: '撕手', S: 4, A: 3, R: 7, dmg: 5, reach: 94, stun: 13, bstun: 7, kb: 2, stop: 4, power: .3,
    limb: 'fh', fx: 'jab2', lunge: [1, 4, 6],
    keys: [[0, {}], [0.4, MP_SIF0], [1, MP_SIF, 'back'], [2, MP_SIF], [3, {}]] }),
  mtSiB: MM({ kind: 'jab', label: '撕手', tag: '撕手', S: 4, A: 3, R: 7, dmg: 5, reach: 94, stun: 13, bstun: 7, kb: 2, stop: 4, power: .3,
    limb: 'bh', fx: 'jab2', lunge: [1, 4, 6],
    keys: [[0, {}], [0.4, MP_SIB0], [1, MP_SIB, 'back'], [2, MP_SIB], [3, {}]] }),
  // 翻腕砍：掌刃横着砍颈、胸 —— 重在一串里，两只手轮着砍
  mtKanF: MM({ kind: 'heavy', label: '翻腕砍', stamp: '翻腕砍', S: 6, A: 4, R: 11, dmg: 9, reach: 98, stun: 16, bstun: 10, kb: 4, stop: 6, shake: 4, power: .7, heavy: true,
    limb: 'fh', fx: 'palm', lunge: [1, 6, 10],
    keys: [[0, {}], [0.45, MP_KANF0], [1, MP_KANF, 'back'], [2, MP_KANF], [3, {}]] }),
  mtKanB: MM({ kind: 'heavy', label: '翻腕砍', stamp: '翻腕砍', S: 6, A: 4, R: 11, dmg: 9, reach: 98, stun: 16, bstun: 10, kb: 4, stop: 6, shake: 4, power: .7, heavy: true,
    limb: 'bh', fx: 'palm', lunge: [1, 6, 10],
    keys: [[0, {}], [0.45, MP_KANB0], [1, MP_KANB, 'back'], [2, MP_KANB], [3, {}]] }),
  // 提膝（一串里按踢）
  mtXiC: MM({ kind: 'kick', label: '提膝', stamp: '提膝', S: 5, A: 4, R: 11, dmg: 9, reach: 86, stun: 16, bstun: 10, kb: 5, stop: 7, shake: 4, power: .8,
    limb: 'ff', fx: 'kick', lunge: [1, 5, 20],
    keys: [[0, {}], [0.5, MP_XI0], [1, MP_XI, 'back'], [2, MP_XI], [2.5, MP_XI0], [3, {}]] }),
  // 刁手（一串里按拿）：前手勾住他的手腕往回一带 —— 他接着挨打的硬直续上、被拉回到面前，接下去那一下 ×MT_DIAO_MUL（刁打）。
  //   被挡住就只是把他拉近（挡住的照旧挡住）。刁完不能再刁（见 mtCanCancel）
  mtDiao: MM({ kind: 'jab', label: '刁手', tag: '刁手', diao: true, S: 2, A: 3, R: 8, dmg: MT_DIAO_DMG, reach: 94, stun: 16, bstun: 8, kb: 0, stop: 3, power: .2,
    limb: 'fh', fx: 'jab', lunge: [0, 2, 4],
    keys: [[0, {}], [1, MP_DIAO, 'out'], [2, MP_DIAO2], [3, {}]] }),
  // 寸打（刁以后按拳）：后手竖拳贴身一崩 —— 最快的一下
  mtCun: MM({ kind: 'jab', label: '寸打', tag: '寸打', S: 3, A: 3, R: 7, dmg: 6, reach: 90, stun: 13, bstun: 7, kb: 2.4, stop: 4, power: .35,
    limb: 'bh', fx: 'jab2', lunge: [1, 3, 6],
    keys: [[0, MP_CUN0], [1, MP_CUN, 'back'], [2, MP_CUN], [3, {}]] }),
  // 穿心掌（刁以后按重）：后手立掌直穿胸口
  mtChuan: MM({ kind: 'heavy', label: '穿心掌', stamp: '穿心掌', S: 6, A: 4, R: 12, dmg: 11, reach: 98, stun: 17, bstun: 10, kb: 4, stop: 7, shake: 4, power: .8, heavy: true,
    limb: 'bh', fx: 'palm', lunge: [1, 6, 12],
    keys: [[0, {}], [0.45, MP_CHUAN0], [1, MP_CHUAN, 'back'], [2, MP_CHUAN], [3, {}]] }),
  // 双封手（一串里按前 + 重：收势）：两掌一起封出去，打倒
  mtShuangFeng: MM({ kind: 'heavy', label: '双封手', stamp: '双封手', S: 7, A: 4, R: 14, dmg: 13, reach: 98, stun: 19, bstun: 11, kb: 6, stop: 8, shake: 6, power: .95, heavy: true,
    limb: 'fh', fx: 'palm', lunge: [1, 7, 14], launch: 3.5, lie: 22, ender: true, mtFin: true,
    keys: [[0, {}], [0.4, MP_SF0], [1, MP_SF, 'back'], [2, MP_SF], [3, {}]] }),

  /* ---- 拿：勾搂（hook：抓得住正出手上的招的人 = 勾住；出腿 = 搂腿；站着 / 挡着 = 采手）。一串里按拿是刁手（上面）---- */
  grab: MM({ kind: 'grab', label: '勾搂', open: true, hook: true, hookEarly: MT_HOOK_EARLY, S: 5, A: 4, R: 15, dmg: MT_CAI_DMG, reach: 90, power: .4, limb: 'fh', lunge: [1, 5, 6],
    keys: [[0, {}], [0.5, MP_HOOK0], [1, MP_HOOK, 'out'], [2, MP_HOOK], [3, {}]] }),
  // 低搂（蹲 + 拿）：蹲下前手往前下方一搂 —— 搂住地上的腿（扫堂腿也行）；抓蹲着的人 = 采手
  lowGrab: MM({ kind: 'grab', label: '低搂', low: true, height: 'low', open: true, S: 8, A: 4, R: 16, dmg: 0, reach: 88, power: .5, limb: 'fh', lunge: [1, 7, 10],
    keys: [[0, { hy: 46, tor: 16, tw: 10, ff: [32, 0], bf: [-36, 0], ...mHand('f', [28, 10], 'hook', 60, 0.8), ...M_CH }],
      [1, { hy: 40, tor: 30, dx: 16, head: -8, tw: 16, ff: [44, 0], bf: [-36, 0], ...mHand('f', [50, 34], 'palm', 30, 0.7, 0.5), ...mHand('b', [16, 8], 'hook', 100, 0.85) }, 'out'],
      [2, { hy: 40, tor: 30, dx: 16, head: -8, tw: 16, ff: [44, 0], bf: [-36, 0], ...mHand('f', [50, 34], 'palm', 30, 0.7, 0.5), ...mHand('b', [16, 8], 'hook', 100, 0.85) }], [3, {}]] }),
  // 挂手（挡住的硬直里按拿）：前手顺着架子往上一挂再一勾 —— 出手只要 1 帧、挂住 4 帧：他下一下正好打到的那几帧挂住他的手（勾住，和勾搂一样），
  //   挂空了收招长（他下一下打进来 = 挨一套）。螳螂的「接招」：不用气，靠时机
  mtGuaShou: MM({ kind: 'grab', label: '挂手', hook: true, hookEarly: 99, noChain: true, S: 1, A: 4, R: 16, dmg: MT_HOOK_DMG, reach: 94, power: .4, limb: 'fh', lunge: [0, 1, 4],
    keys: [[0, MP_FENG], [1, MJ(M_STAND, { tor: 10, head: 2, dx: 6, tw: 30, fe: -1, ...mHand('f', [50, -22], 'hook', 40, 0.85, 0.3), ...mHand('b', [20, 2], 'hook', 100, 0.9) }), 'out'],
      [2, MJ(M_STAND, { tor: 10, head: 2, dx: 6, tw: 30, fe: 1, ...mHand('f', [52, -4], 'hook', 90, 0.85, 0.3), ...mHand('b', [20, 2], 'hook', 100, 0.9) })], [3, {}]] }),
  // 勾住（抓到正出手的人）：勾着他的手腕往回一带，他失衡、你先动
  mtGouZhu: MM({ kind: 'script', label: '勾住', S: 0, A: 0, R: MT_GOU_R, script: true,
    keys: [[0, MP_HOOK], [0.6, MP_HOOK_IN, 'out'], [1, MJ(MP_HOOK_IN, { tw: 20 })]] }),
  // 采手（抓到站着、挡着、收招里的人）：抓住手腕往怀里一带，他短硬直
  mtCai: MM({ kind: 'script', label: '采手', S: 0, A: 0, R: MT_CAI_R, script: true,
    keys: [[0, MP_HOOK], [0.5, MJ(MP_HOOK_IN, { tor: 4, dx: -2 }), 'out'], [1, MJ(M_SIT, { tor: 6, tw: 14, ...mHand('f', [30, 8], 'hook', 120, 0.85), ...M_CH })]] }),
  hold: MM({ kind: 'script', label: '采手', S: 0, A: 0, R: MT_CAI_R, script: true,          // 通用代码按名字找 hold：螳螂抓住了不进擒住，这个只是备着（走不到）
    keys: [[0, MP_HOOK], [1, MP_HOOK_IN]] }),
  // 搂腿（接住他踢过来的腿）：前手往下一搂，把腿搂开 —— 他摔倒
  mtLouTui: MM({ kind: 'script', label: '搂腿', S: 0, A: 0, R: 24, script: true,
    keys: [[0, MJ(M_SIT, { tor: 18, tw: 14, ...mHand('f', [42, 28], 'palm', 30, 0.8, 0.3), ...M_CH })],
      [0.35, MJ(M_IN, { tor: 26, head: -4, dx: 12, tw: 32, ...mHand('f', [50, 38], 'palm', 50, 0.8, 0.2), ...mHand('b', [26, 6], 'hook', 100, 0.85) }), 'out'],
      [0.7, MJ(M_IN, { tor: 26, head: -4, dx: 12, tw: 32, ...mHand('f', [50, 38], 'palm', 50, 0.8, 0.2), ...mHand('b', [26, 6], 'hook', 100, 0.85) })], [1, {}]] }),
  legCatch: MM({ kind: 'script', label: '搂腿', S: 0, A: 0, R: 24, script: true, keys: [[0, {}], [1, {}]] }),   // 通用代码按名字找（走不到，备着）
  scoop: MM({ kind: 'script', label: '搂腿', S: 0, A: 0, R: 24, script: true, keys: [[0, {}], [1, {}]] }),

  /* ---- 跳起来（上段：蹲着挡不住；腾空勾踢能蹲下躲）---- */
  airJab: MM({ kind: 'jab', label: '飞崩', tier: 'air', lead: 'light', height: 'high', open: true, S: 4, A: 12, R: 6, dmg: 7, reach: 98, vreach: AIR_VREACH, stun: 15, bstun: 9, kb: 2.6, stop: 5, power: .45,
    limb: 'fh', fx: 'airSwing', air: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fhk: 1, bhk: 1, fpa: 60, bpa: 90, fh: [26, 10], bh: [16, 14] })], [0.55, J_(JT, { rot: 2, tor: 4, fh: [20, -6], fp: 0, fhk: 0, bh: [20, 6], bp: 1, bhk: 1, bpa: 90, tw: 20 })],
      [1, { rot: 18, tor: 24, head: -6, dx: 6, fh: [58, 10], fp: 0, fhk: 0, fv: 0, fw: 12, bh: [22, 6], bp: 1, bhk: 1, bpa: 90, ff: [16, 42], bf: [-28, 28], tw: 34 }, 'back'],
      [2, { rot: 20, tor: 26, head: -6, dx: 6, fh: [56, 12], fp: 0, fhk: 0, fv: 0, fw: 12, bh: [22, 6], bp: 1, bhk: 1, bpa: 90, ff: [16, 42], bf: [-28, 28], tw: 34 }], [3, J_(JD, { fp: 1, bp: 1, fhk: 1, bhk: 1, fpa: 60, bpa: 90 })]] }),
  // 腾空劈：跳起来掌举过头顶、劈下来（不翻身，整个人立着）
  airHeavy: MM({ kind: 'heavy', label: '腾空劈', stamp: '腾空劈', tier: 'air', lead: 'heavy', height: 'high', open: true, S: 10, A: 11, R: 10, dmg: 12, reach: 104, vreach: AIR_VREACH, stun: 19, bstun: 12, kb: 5, stop: 9, shake: 6, power: 1, heavy: true,
    limb: 'fh', fx: 'palm', air: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fhk: 1, bhk: 1, fpa: 60, bpa: 90, fh: [26, 10], bh: [16, 14] })],
      [0.3, { rot: -4, tor: 2, head: -6, tw: 12, fh: [4, -46], fp: 1, fhk: 0, fpa: -120, fpr: 0.3, fe: -1, bh: [18, 0], bp: 1, bhk: 1, bpa: 90, ff: [18, 50], bf: [-10, 40] }],
      [1, { rot: 10, tor: 24, head: 8, dx: 12, tw: 38, fh: [50, 14], fp: 1, fhk: 0, fpa: 34, fpr: 0, fe: 1, bh: [16, -2], bp: 1, bhk: 1, bpa: 90, ff: [26, 36], bf: [-28, 32] }, 'out'],
      [2, { rot: 12, tor: 26, head: 8, dx: 12, tw: 40, fh: [48, 18], fp: 1, fhk: 0, fpa: 34, fpr: 0, fe: 1, bh: [16, -2], bp: 1, bhk: 1, bpa: 90, ff: [26, 34], bf: [-28, 30] }], [3, J_(JD, { fp: 1, bp: 1, fhk: 1, bhk: 1, fpa: 60, bpa: 90 })]] }),
  airKick: MM({ kind: 'kick', label: '腾空勾踢', stamp: '腾空勾踢', tier: 'air', lead: 'kick', height: 'high', open: true, S: 9, A: 13, R: 9, dmg: 11, reach: 120, vreach: AIR_VREACH, stun: 18, bstun: 11, kb: 6, stop: 8, shake: 5, power: .9,
    limb: 'ff', fx: 'airKick', air: true, ghost: true, evadeCrouch: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fhk: 1, bhk: 1, fpa: 60, bpa: 90, fh: [26, 10], bh: [16, 14] })], [0.6, { rot: -4, tor: 8, head: -4, ff: [14, 56], bf: [-8, 44], fh: [30, -12], fp: 1, fhk: 1, fpa: 50, bh: [14, -8], bp: 1, bhk: 1, bpa: 90, tw: 10 }],
      [1, { rot: 10, tor: -24, head: 12, dx: 16, ff: [96, 34], ft: 42, bf: [-16, 48], fh: [36, -24], fp: 1, fhk: 1, fpa: 50, bh: [20, -22], bp: 1, bhk: 1, bpa: 90, tw: 10 }, 'back'],
      [2, { rot: 10, tor: -24, head: 12, dx: 16, ff: [96, 34], ft: 42, bf: [-16, 48], fh: [36, -24], fp: 1, fhk: 1, fpa: 50, bh: [20, -22], bp: 1, bhk: 1, bpa: 90, tw: 10 }], [3, J_(JD, { fp: 1, bp: 1, fhk: 1, bhk: 1, fpa: 60, bpa: 90 })]] }),
  // 坠枝（空中蹲 + 踢）：先往上一腾，再勾手指尖朝下往下插（主系「坠」：专破蹲着的、对空；怕站着的拳）
  dive: MM({ kind: 'kick', label: '坠枝', stamp: '坠枝', tier: 'dive', lead: 'kick', height: 'high', S: 15, A: 40, R: 8, dmg: 10, reach: 84, vreach: 64, stun: 19, bstun: 10, kb: 2, stop: 8, shake: 6, power: .9,
    limb: 'ff', fx: 'dive', air: true, ghost: true, dive: true, aaProof: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fhk: 1, bhk: 1, fpa: 60, bpa: 90, fh: [26, 10], bh: [16, 14] })], [0.7, { rot: -6, tor: 10, head: 4, ff: [20, 58], bf: [-10, 46], fh: [24, -30], fp: 1, fhk: 1, fpa: -90, bh: [-16, -26], bp: 1, bhk: 1, bpa: 90, tw: 0 }],
      [1, { rot: -34, tor: 16, head: 10, ff: [40, 32], bf: [-22, 30], fh: [44, 26], fp: 1, fhk: 1, fpa: 90, bh: [-30, -12], bp: 1, bhk: 1, bpa: 90, tw: 0 }, 'out'],
      [2, { rot: -34, tor: 16, head: 10, ff: [40, 32], bf: [-22, 30], fh: [44, 26], fp: 1, fhk: 1, fpa: 90, bh: [-30, -12], bp: 1, bhk: 1, bpa: 90, tw: 0 }], [3, J_(JD, { fp: 1, bp: 1, fhk: 1, bhk: 1, fpa: 60, bpa: 90 })]] }),

  /* ---- 防守反击、身法 ---- */
  // 封手（挡着按拳 = 推挡）：两掌一封把他推开
  shove: MM({ kind: 'push', label: '封手', tier: 'push', S: 2, A: 4, R: 12, dmg: 0, reach: 108, stun: 9, bstun: 0, kb: PUSH_KB, stop: 4, power: .3, push: true,
    limb: 'fh', fx: 'shove', lunge: [0, 4, 10], sinv: [0, 6], noCancel: true,                      // 和格斗术的推挡一样：出手那几帧打不中他
    keys: [[0, MP_FENG], [1, MJ(M_IN, { tor: 12, head: 2, dx: 14, tw: 8, fe: 1, be: 1, ...mHand('f', [44, 0], 'palm', -72, 0.55, 0.3), ...mHand('b', [38, 6], 'palm', -72, 0.55, 0.3) }), 'back'],
      [2, MJ(M_IN, { tor: 12, head: 2, dx: 14, tw: 8, fe: 1, be: 1, ...mHand('f', [44, 0], 'palm', -72, 0.55, 0.3), ...mHand('b', [38, 6], 'palm', -72, 0.55, 0.3) })], [3, {}]] }),
  // 挂捶（挡住以后按重，花气 —— 格斗术的截击那一下）：前手往外一挂把他的手挂开，后手顺势一捶；出手前几帧打击无敌
  mtGua: MM({ kind: 'heavy', label: '挂捶', stamp: '挂捶', tier: 'heavy', lead: 'heavy', S: 5, A: 4, R: 14, dmg: 10, reach: 102, stun: 18, bstun: 10, kb: 9, stop: 9, shake: 5, power: .9, heavy: true,
    limb: 'bh', fx: 'heavy', ghost: true, lunge: [0, 5, 16], sinv: [0, 6], cost: GC_COST, ender: true, noCancel: true,
    keys: [[0, MP_FENG], [0.45, MJ(M_STAND, { tor: 4, tw: 12, fe: -1, be: 1, ...mHand('f', [26, -18], 'hook', -30, 0.9), ...mHand('b', [8, 10], 'fist', 0, 0, 0, 1) })],
      [1, MJ(M_IN, { tor: 18, head: 2, dx: 20, tw: -42, fe: -1, be: 1, ...mHand('f', [16, -14], 'hook', -30, 0.9), ...mHand('b', [60, 2], 'fist', 0, 0, 0, 1) }), 'back'],
      [2, MJ(M_IN, { tor: 18, head: 2, dx: 20, tw: -42, fe: -1, be: 1, ...mHand('f', [16, -14], 'hook', -30, 0.9), ...mHand('b', [60, 2], 'fist', 0, 0, 0, 1) })], [3, {}]] }),
  // 踏腿（蹲挡住下段的腿以后按踢）：提脚一跺，跺在他伸过来的腿上
  stomp: MM({ kind: 'kick', label: '踏腿', stamp: '踏腿', height: 'low', S: 4, A: 4, R: 14, dmg: 12, reach: 122, stun: 16, bstun: 9, kb: 4, stop: 9, shake: 6, power: .9,
    limb: 'ff', fx: 'stomp', lunge: [1, 4, 22], launch: 4, lie: 25, ender: true, noCancel: true,
    keys: [[0, { hy: 50, tor: 14, ff: [30, 0], bf: [-30, 0] }], [0.6, { hy: 72, tor: -6, head: 6, dx: 4, ff: [30, 60], bf: [-22, 0] }],
      [1, { hy: 62, tor: 18, head: -8, dx: 22, ff: [76, 4], bf: [-26, 0] }, 'out'], [2, { hy: 62, tor: 18, head: -8, dx: 22, ff: [76, 2], bf: [-26, 0] }], [3, {}]] }),
  // 蹦步进（冲刺）：两脚一蹬往前一蹦（猴步）
  dash: MM({ kind: 'script', label: '蹦步进', S: 0, A: 0, R: 16, script: true, lunge: [0, 10, 96], inv: [0, 8],
    keys: [[0, { hy: 58, tor: 14, head: -2, tw: 10, ff: [36, 0], bf: [-36, 0] }],
      [0.15, { hy: 66, tor: 22, head: -6, dx: 10, air: 7, tw: 10, ff: [42, 12], bf: [-40, 16], ...M_HI, ...M_CH }, 'out'],
      [0.5, { hy: 62, tor: 18, head: -4, dx: 12, air: 2, tw: 10, ff: [50, 2], bf: [-50, 6], ...M_HI, ...M_CH }],
      [0.75, { hy: 56, tor: 10, head: -2, dx: 4, tw: 16, ff: [48, 0], bf: [-54, 0] }], [1, {}]] }),
  // 蹦步退（出招打中 / 被挡住以后按一下后）：两脚一蹬往后一蹦，两手还架着；落地那几帧动不了
  mtHop: MM({ kind: 'script', label: '蹦步退', S: 0, A: 0, R: MT_HOP, script: true, lunge: [0, MT_HOP_FLY, -MT_HOP_PX], noChain: true,
    keys: [[0, { hy: 56, tor: 6, tw: 16 }],
      [0.2, { hy: 68, tor: -6, head: 4, dx: -6, air: 9, tw: 8, ff: [30, 16], bf: [-26, 12], ...M_HI, ...M_CH }, 'out'],
      [0.55, { hy: 66, tor: -2, head: 2, dx: -8, air: 4, tw: 8, ff: [28, 8], bf: [-28, 6], ...M_HI, ...M_CH }],
      [0.8, { hy: 56, tor: 8, head: 0, dx: -2, tw: 16, ff: [46, 0], bf: [-54, 0] }], [1, {}]] }),
  // 玉环步（闪身：按着挡朝对手双击）：侧身斜着从他身边绕过去（只躲得过重拳；躲过了自动回身崩）
  slip: MM({ kind: 'script', label: '玉环步', S: 0, A: 0, R: 22, script: true, lunge: [0, 11, 110], slipInv: [0, 11],
    keys: [[0, { hy: 60, tor: 14, head: 4, dx: -2, tw: 14, ff: [30, 0], bf: [-32, 0], ...mHand('f', [28, -12], 'hook', -30, 0.9), ...mHand('b', [16, 8], 'hook', 60, 0.8) }],
      [0.14, { hy: 50, tor: 30, head: -4, dx: 12, spin: 30, tw: 14, ff: [50, 6], bf: [-52, 12], ...mHand('f', [40, -26], 'hook', -60, 0.6), ...mHand('b', [-18, 14], 'hook', 120, 0.9) }, 'out'],
      [0.48, { hy: 50, tor: 28, head: -4, dx: 12, spin: 30, tw: 14, ff: [48, 2], bf: [-54, 8], ...mHand('f', [40, -26], 'hook', -60, 0.6), ...mHand('b', [-18, 14], 'hook', 120, 0.9) }],
      [0.72, { hy: 62, tor: 10, head: 6, dx: 2, spin: 10, tw: 14, ff: [28, 0], bf: [-32, 0] }], [1, {}]] }),
  // 回身崩（玉环步躲过重拳、绕到他身后，自动出）：回身拳背一弹打在他背上 —— 他背对着你踉跄
  slipElbow: MM({ kind: 'heavy', label: '回身崩', stamp: '回身崩', tier: 'heavy', lead: 'heavy', S: 5, A: 3, R: 12, dmg: 10, reach: 88, stun: 18, bstun: 10, kb: STAGGER_KB,
    stop: 8, shake: 4, power: .8, limb: 'fh', fx: 'slipElbow', ghost: true, lunge: [0, 5, 18], stagger: true, ender: true, noCancel: true,
    keys: [[0, { spin: 165, tor: 20, hy: 58, head: 2, ff: [30, 0], bf: [-32, 0], tw: 0, ...mHand('f', [30, -12], 'hook', -60, 0.9), ...mHand('b', [24, -6], 'hook', 90, 0.9) }],
      [0.55, { spin: 95, tor: 4, hy: 64, head: -4, dx: -4, ff: [24, 0], bf: [-36, 0], tw: -16, ...mHand('f', [12, -8], 'hook', -40, 0.9), ...mHand('b', [14, -22], 'hook', 90, 0.9) }],
      [1, { spin: 8, tor: 14, dx: 22, hy: 62, head: -4, ff: [44, 0], bf: [-32, 0], tw: 42, ...mHand('f', [58, -2], 'fist', 0, 0, 0, 0), fw: 12, ...mHand('b', [12, 12], 'hook', 100, 0.9) }, 'back'],
      [2, { spin: 4, tor: 14, dx: 22, hy: 62, head: -4, ff: [44, 0], bf: [-32, 0], tw: 42, ...mHand('f', [58, -2], 'fist', 0, 0, 0, 0), fw: 12, ...mHand('b', [12, 12], 'hook', 100, 0.9) }], [3, {}]] }),
  // 爆气（挨打时按重 + 踢，花半格气）：两只勾手往外一分，从身上炸开
  burst: MM({ kind: 'script', label: '爆气', S: 0, A: 0, R: 22, script: true, inv: [0, 18], evWave: 3,
    keys: [[0, { tor: 24, hy: 56, head: 10, fh: [16, 10], bh: [10, 12], tw: 0 }],
      [0.14, { tor: -12, head: -16, hy: 76, ...mHand('f', [50, -14], 'hook', -40, 0.8), ...mHand('b', [-34, -10], 'hook', -140, 0.8), ff: [40, 0], bf: [-42, 0], air: 6, tw: 0 }, 'out'],
      [0.5, { tor: -10, head: -14, hy: 74, ...mHand('f', [48, -12], 'hook', -40, 0.8), ...mHand('b', [-32, -8], 'hook', -140, 0.8), ff: [40, 0], bf: [-42, 0], air: 2, tw: 0 }], [1, {}]] }),
  // 螳螂扑蝉（大招，气满按重 + 踢）：蹲身蓄势，扑进去两只螳螂手一起勾进去 —— 打中把人发出去
  super: MM({ kind: 'heavy', label: '螳螂扑蝉', stamp: '螳螂扑蝉', tier: 'super', S: 9, A: 6, R: 22, dmg: 48, reach: 130, stun: 24, bstun: 15, kb: 8, stop: 16, shake: 12, power: 1.2, heavy: true,
    limb: 'fh', fx: 'splash', ghost: true, lunge: [4, 9, 40], launch: 7, ender: true, noCancel: true, cost: QI_MAX, antiAir: 40,
    keys: [[0, {}], [0.3, { hy: 54, tor: 18, head: -4, dx: -4, tw: 6, ff: [36, 0], bf: [-44, 0], fe: 1, be: 1, ...mHand('f', [24, -20], 'hook', -20, 0.8), ...mHand('b', [18, -28], 'hook', -20, 0.8) }, 'out'],
      [1, { hy: 62, tor: 28, head: -2, dx: 34, tw: 12, ff: [56, 0], bf: [-40, 2], fe: 1, be: 1, ...mHand('f', [60, -4], 'hook', 64, 0.8, 0.4), ...mHand('b', [54, 6], 'hook', 64, 0.8, 0.4) }, 'back'],
      [2, { hy: 62, tor: 28, head: -2, dx: 34, tw: 12, ff: [56, 0], bf: [-40, 2], fe: 1, be: 1, ...mHand('f', [60, -4], 'hook', 64, 0.8, 0.4), ...mHand('b', [54, 6], 'hook', 64, 0.8, 0.4) }], [3, {}]] }),
};


/* 架势（fighter.js target 用） */
const MPOSE = {
  stance: mmk({}),
  crouch: mmk({ hy: 42, tor: 16, head: -2, tw: 18, ff: [40, 0], bf: [-50, 0], ...mHand('f', [38, -4], 'hook', 100, 0.85), ...M_CH }),
  block: mmk(MP_FENG),
  cblock: mmk(MP_FENG_LOW),
  parry: mmk(MP_HOOK_IN),
  // 收势（赢了）：两脚收拢站直，两只勾手慢慢按下去
  win: mmk({ tor: 0, head: -2, hy: 72, tw: 0, ff: [14, 0], bf: [-14, 0], fe: 1, be: 1, ...mHand('f', [18, 24], 'hook', 100, 0.8), ...mHand('b', [12, 26], 'hook', 100, 0.8) }),
};

/* ============================================================
   方向（相对对手）：0 没按 / 1 前 / 2 后 / 3 蹲；离得远（ASSIST_R 以外）按前后只是转身往那边打
   ============================================================ */
function mtDirVs(F, O, near) {
  const h = F.inp.held;
  if (h.down) return 3;
  const d = dirOf(h);
  if (!d || (near && Math.abs(O.x - F.x) > ASSIST_R)) return 0;
  return d === (O.x >= F.x ? 1 : -1) ? 1 : 2;
}
// 一串里的样子：结尾连着打了几下（拳 / 重 / 踢；刁、勾搂算一个断点）
const MT_STRIKE = { jab: 1, heavy: 1, kick: 1 };
function mtRun(c) { let n = 0; for (let i = c.length - 1; i >= 0 && MT_STRIKE[c[i]]; i--) n++; return n; }
// 上一下是哪只手打的（一串里两只手轮着出）：前手 / 前脚算前，后手算后
const mtFrontLast = F => !!F && !/^b/.test(F.mtLastLimb || 'bh');
// 出哪一招（3.4 勾打连环，MANTIS.md 〇节）：
//   站着 拳 崩捶（前 探手、后 撤步崩）、重 劈掌（前 挂打）、踢 勾踢（前 提膝）；蹲着 撩掌 / 挑掌 / 勾挂腿；拿 勾搂（蹲 低搂）
//   一串里：拳 撕手、重 翻腕砍（两只手轮着出），踢 提膝，拿 刁手；刁以后（勾住、采住以后也是）拳 寸打、重 穿心掌、踢 提膝；
//   收势 前 + 重 双封手、蹲 + 踢 勾挂腿、蹲 + 重 挑掌。连打不过两下：结尾已经连着打了两下，拳重踢就只剩收势（不是收势的出不来）
function mtVariant(kind, chain, air, mod, F) {
  if (air) return mod === 'down' && kind === 'kick' ? 'dive' : { jab: 'airJab', heavy: 'airHeavy', kick: 'airKick' }[kind] || null;
  const c = chain.filter(x => x !== 'pc'), last = c[c.length - 1], run = mtRun(c);
  if (kind === 'grab') return mod === 'down' ? 'lowGrab' : F && F.state === 'attack' && MT_STRIKE[last] ? 'mtDiao' : 'grab';   // 一串里打中 / 被挡住以后接着按拿 = 刁手（站着按的照旧是勾搂）
  if (mod === 'down') {
    if (kind === 'jab') return last && run >= MT_RUN_MAX ? null : 'mtLiao';
    return { heavy: 'mtTiao', kick: 'mtSao' }[kind] || null;
  }
  const dc = F ? mtDirVs(F, F.opp, true) : 0;
  if (!last) {                                                       // 起手
    if (kind === 'jab') return dc === 1 ? 'mtTan' : dc === 2 ? 'mtChe' : 'mtBeng';
    if (kind === 'heavy') return dc === 1 ? 'mtGuaDa' : 'mtPi';
    return dc === 1 ? 'mtXi' : 'mtGou';
  }
  if (kind === 'heavy' && dc === 1) return 'mtShuangFeng';           // 收势
  if (last === 'grab') return { jab: 'mtCun', heavy: 'mtChuan', kick: 'mtXiC' }[kind] || null;   // 刁以后（勾住、采住以后）
  if (run >= MT_RUN_MAX) return null;                                // 连打不过两下
  if (kind === 'jab') return mtFrontLast(F) ? 'mtSiB' : 'mtSiF';
  if (kind === 'heavy') return mtFrontLast(F) ? 'mtKanB' : 'mtKanF';
  return 'mtXiC';
}
// 接招：拳重踢拿都接得上（MT_CANCEL）；刁手只接在打中 / 被挡住的那一下后面，刁完不能再刁；连着打了两下以后拳接不上（重、踢只剩收势，出不出得来看 mtVariant）
const MT_CANCEL = { jab: ['jab', 'heavy', 'kick', 'grab'], heavy: ['jab', 'heavy', 'kick', 'grab'], kick: ['jab', 'heavy', 'kick', 'grab'], grab: [], push: [] };
function mtCanCancel(F, kind) {
  const m = F.move;
  if (!m || m.air || m.def.script || m.def.noCancel || m.tumbled) return false;
  if (!(m.hit || m.blocked || m.absorbed)) return false;
  const after = m.t + DT - 1 - m.S;
  if (after < 1 || after >= m.def.A + 13) return false;
  const c = F.chain.filter(x => x !== 'pc');
  if (c.length >= COMBO_MAX || !(MT_CANCEL[m.def.kind] || []).includes(kind)) return false;
  const last = c[c.length - 1];
  if (kind === 'grab') return !!MT_STRIKE[last];
  if (mtRun(c) >= MT_RUN_MAX) return kind !== 'jab';
  return true;
}

/* ============================================================
   按键语法（引擎先问这里）
   ============================================================ */
// 按着「后」（离开对手的方向）没有。蹦步退看的是「出招的时候按着后」：出招那一步就按着后的不算（后 + 拳是撤步崩，不是要蹦），
// 出手以后才按下去的算 —— 顿帧里按下去的也算（顿帧里 update 不走，按下的边沿看不见，所以看的是按着没有，不是边沿）
const mtBack = F => { const h = F.inp.held; return !!h[F.opp.x >= F.x ? 'left' : 'right'] && !h.down; };
const mtChainLen = F => F.chain.filter(c => c !== 'pc').length;
// 越连越快：一串里第 n 下（n ≥ 2）前摇 −MT_ACC × (n − 1)，最少 MT_S_MIN。刚接上的那一步（m.t 还是 0）改 m.S
function mtQuicken(F) {
  const m = F.move, n = mtChainLen(F);
  if (!m || m.def.script || m.air || n < 2) return;
  m.S = Math.max(Math.min(m.S, MT_S_MIN), grid(m.S - MT_ACC * (n - 1)));
}
function mtInput(F, where, locked) {
  if (where === 'blockstun') {
    // 挡住的硬直里按拿 = 挂手（接他下一下：1 帧出手、4 帧挂住，挂空了挨一套）
    if (!locked && F.takePress(['grab'])) { F.beginMove('mtGuaShou', null); return true; }
    // 蹦步退也能从挡住的硬直里蹦（他一串打在你的架子上：按一下后就蹦出去 —— 螳螂的「被压制」答案；两次蹦要隔 MT_HOP_COOL 帧）
    //   「本来就按着后在退」的不算（边挡边退不是要蹦）：看的是挡住之前那一帧按没按着后（站着、挡着的时候每帧记 mtBackPrev；挡住发生在打中停顿里，停顿里这里不跑，不能看现在）
    if (F.mtBsSer !== F.guardOn) { F.mtBsSer = F.guardOn; F.mtBsBack0 = !!F.mtBackPrev; }
    if (!locked && !F.mtBsBack0 && mtBack(F) && F.clock - (F.mtHopAt === undefined ? -999 : F.mtHopAt) >= MT_HOP_COOL) { mtHop(F); return true; }
    return false;
  }
  if (where === 'neutral') {
    F.mtBackPrev = mtBack(F);
    // 一串已经连着打了两下（接不上了）：再按就是另起一串（不然停手以后 0.4 秒里按拳什么都出不来）
    if (F.chain.length && mtRun(F.chain.filter(x => x !== 'pc')) >= MT_RUN_MAX) F.chain = [];
    return false;
  }
  if (where !== 'attack') return false;
  const m = F.move, d = m.def, k = m.t + DT - 1;
  if (m.t === 0 && m.mtBack0 === undefined) { m.mtBack0 = mtBack(F); if (!d.script && d.limb) F.mtLastLimb = d.limb; }   // 出招那一步按着后没有；这一下是哪只手（脚）打的
  const back = !locked && !m.mtBack0 && mtBack(F);
  if (d.script) {
    if (m.name === 'mtGouZhu' || m.name === 'mtCai') return mtPullStep(F, m, k);
    return false;
  }
  // 刁手：打中了 —— 他接着挨打的硬直续上（招自己的 stun）、失衡（下一下 ×MT_DIAO_MUL 刁打），刁着手往回带到面前；被挡住了只往回带（挡住的照旧挡住）
  if (d.diao && (m.hit || m.blocked)) {
    const o = F.opp;
    if (!m.diaoed) {
      m.diaoed = true;
      if (m.hit && o.state === 'hit') { o.reel = true; o.reelKind = 'diao'; o.reelBy = F.idx; o.reelKD = false; }
    }
    if ((o.state === 'hit' || o.state === 'blockstun') && !o.airborne && k < m.S + d.A + 6) { o.x = clamp(o.x + (F.x + F.facing * MT_PULL_GAP - o.x) * PULL_K, WALL_L, WALL_R); o.kvx = 0; }
  }
  // 气短：第三下起每多连一下收招多 MT_WIND 帧 —— 判定一完（这一步刚进收招）就加在这一招身上；蹦出去就没有
  if (!m.air && !m.mtWinded && m.t >= m.S + d.A + 1) {
    m.mtWinded = true;
    const n = mtChainLen(F);
    if (n >= 3) { m.pen = (m.pen || 0) + grid(MT_WIND * (n - 2)); if (!game.quiet && F.J) tag(F.J.head[0] - F.facing * 12, F.J.head[1] - 40, '喘', F, 15); }
  }
  // 蹦步退：打中 / 被挡住以后（判定出来了）按一下后 —— 收招换成往后一蹦（打空了不能蹦）
  if (back && !m.air && d.kind !== 'grab' && d.kind !== 'push' && (m.hit || m.blocked) && m.t >= m.S + 1 && !d.noHop && F.clock - (F.mtHopAt === undefined ? -999 : F.mtHopAt) >= MT_HOP_COOL) {
    mtHop(F);
    return true;
  }
  // 连下去：照通用的接（MT_CANCEL、一串最多 COMBO_MAX 下）；接上了越连越快
  if (!locked) {
    const kk = F.takePress(['jab', 'heavy', 'kick', 'grab'], true);
    if (kk && F.canCancel(kk)) {
      if (!mtVariant(kk, F.chain, false, F.inp.held.down ? 'down' : '', F)) return false;   // 连着打了两下、按的不是收势：接不上（键留着，收完招另起一串）
      F.takePress([kk]); if (F.startAttack(kk, true)) mtQuicken(F); return true;
    }
  }
  return false;
}
function mtHop(F) {
  const o = F.opp;
  F.facing = o.x >= F.x ? 1 : -1;
  F.chain = []; F.chainIdle = 99; F.stunT = 0; F.gwalk = 0;
  F.startScript('mtHop');
  F.mtHopAt = F.clock;
  if (!game.quiet) { dust(F.x + F.facing * 12, FLOOR, 5); if (F.J) tag(F.J.head[0] - F.facing * 12, F.J.head[1] - 40, '蹦', F, 18); }
  Sound.whoosh(0.5);
}
// 勾住 / 采手那几步：把他往怀里带（他动不了），时间到了放开 —— 他还在硬直里，你先动
function mtPullStep(F, m, k) {
  const o = F.opp, d = m.def, held = o.state === 'hit' && o.mtHeld;
  if (held) { o.x = clamp(o.x + (F.x + F.facing * MT_PULL_GAP - o.x) * PULL_K, WALL_L, WALL_R); o.kvx = 0; }
  if (k >= d.R - 1) { if (held) o.mtHeld = false; F.move = null; F.state = 'idle'; F.chainIdle = 0; return true; }
  m.t += DT;
  return true;
}

/* ============================================================
   挨打（引擎 applyHit 先问这里）：薄挡 —— 挡住重系、腿系、空中、对空、大招：削血多 MT_GUARD_CHIP、硬直多 MT_GUARD_ADD、推得远 MT_GUARD_KB。
   轻拳一系、推挡照通用的（不掉血）
   ============================================================ */
function mtDefend(A, B, c, I) {
  const m = I.m, d = I.d;
  if (!I.front || !B.isBlocking() || !B.blockHeightOK(d.height)) return false;
  const light = (d.tier === 'light' && !d.slowGuard) || d.kind === 'push';
  if (light || d.script) return false;
  guard(A, B, c);
  const extra = Math.max(1, Math.round(d.dmg * (m.air ? AIR_BONUS : 1) * MT_GUARD_CHIP));
  B.hp = Math.max(1, B.hp - extra);
  B.stunT += MT_GUARD_ADD; B.kvx *= MT_GUARD_KB;
  if (A.info) { A.info.dmg += extra; A.info.how = '薄挡'; A.info.why = '螳螂拳的架子薄：挡住重系、腿系、空中招多削血、硬直更长、被推得更远'; }
  B.info = { label: '薄挡', dmg: extra, how: '被压', why: '螳螂拳挡重招吃亏：看见重招伸手去勾、或者蹦出去，别光挡', adv: null, t: B.clock };
  cev('thinGuard', A, B, { name: m.name, extra });
  if (!game.quiet && B.J) tag(B.x - B.facing * 6, B.J.head[1] - 44, '薄', A, 17);
  return true;
}

/* ============================================================
   抓到人（引擎 doGrab 问这里）：勾住（他正出手上的招 trap）、搂腿（catch / scoop）、采手（grab / tackle：站着、挡着、收招里、蹲着）
   ============================================================ */
function mtGrab(A, B, type) {
  const dir = A.facing, bm = B.state === 'attack' && B.move ? B.move : null, bd = bm ? bm.def : null;
  A.move.done = true; A.move.hit = true;
  // 3.3 他那一派的架子撑得开勾手（太极拳的掤：出招的时候伸过去勾他胳膊的手被掤开）：勾空，他那一招照打
  const HR = styleOf(B).hookResist;
  if (type === 'trap' && HR && HR(B, A)) {
    A.move.hit = false; A.move.missTag = true;
    A.info = { label: A.move.def.label, dmg: 0, how: '被掤开', why: '他出招的时候身上有掤，勾他的手被掤开了', adv: null, t: A.clock };
    cev('grabMiss', A, B, { name: A.move.name, why: 'peng' });
    return true;
  }
  // 挂手只挂手上的招：他接着出的不是手上的招（腿、擒拿）、或者根本没接着出 = 挂空（不然挡住一拳按拿就是白送的采手：每一记被挡住的短拳都能罚，比卸力还稳）
  if (A.move.name === 'mtGuaShou' && type !== 'trap') {
    A.move.hit = false; A.move.missTag = true;
    A.info = { label: '挂手', dmg: 0, how: '挂空', why: '挂手只挂得住他接着打过来的手上的招', adv: null, t: A.clock };
    if (!game.quiet) tag(A.x + dir * 10, A.J.head[1] - 30, '挂空', A, 20);
    cev('grabMiss', A, B, { name: A.move.name, why: 'gua' });
    return true;
  }
  B.reel = false; B.clashed = false; B.stagger = false;
  if (type === 'catch' || type === 'scoop') {
    // 搂腿：接住腿往下一搂，他摔倒（接腿摔那一类）
    const scoop = type === 'scoop', airK = !scoop && (B.airborne || !!(bm && bm.air)), dmg = scoop ? SCOOP_DMG : airK ? CATCH_AIR_DMG : CATCH_DMG;
    B.hp -= dmg; A.stats.hits++; A.stats.specials++;
    A.gainQi(dmg * 0.4 * QI_PER_HP); B.gainQi(dmg * 0.9 * QI_PER_HP);
    B.knockDown(airK ? 3.5 : scoop ? 4.5 : 5, dir * 1.6, airK ? LIE_AIR : LIE_GROUND, B.hp <= 0); if (B.hp <= 0) B.hp = 0;
    A.startScript('mtLouTui');
    game.freeze = stop(10); game.shake = Math.max(game.shake, 6);
    if (!game.quiet) {
      const foot = B.J.ff;
      dust(foot[0], foot[1], 5); impact(foot[0], foot[1], dir, 36, pal(A).ink, 6, 1.0); sparks(foot[0], foot[1], dir, 8, 7, pal(A).fx, 1.0, 0.4);
      stamp(A.J.head[0] - dir * 52, A.J.head[1] - 46, '搂腿', 28, A);
      tag(B.x + dir * 16, B.J.head[1] + 4, '-' + dmg, A, 18);
    }
    Sound.hit(0.8);
    bumpCombo(A, B); noteGrab(A, dmg, '搂腿');
    return true;
  }
  if (type === 'trap') {
    // 勾住：他那一招没了，被勾到你面前失衡 MT_HOOK_STUN；你 MT_GOU_R 帧收手先动，接着打中 ×MT_HOOK_MUL（勾打）
    const dmg = MT_HOOK_DMG;
    B.hp -= dmg; A.stats.hits++; A.stats.specials++; A.gainQi(dmg * 0.4 * QI_PER_HP + 6); B.gainQi(dmg * 0.9 * QI_PER_HP);
    B.state = 'hit'; B.stunT = MT_HOOK_STUN; B.reel = true; B.reelKind = 'hook'; B.reelBy = A.idx; B.reelKD = false; B.hurtHeavy = false;
    B.move = null; B.chain = []; B.chainIdle = 99; B.runT = 0; B.kvx = 0; B.flow = 0; B.jin = 0; B.comboLive = false; B.grabbed = false; B.mtHeld = true;
    B.facing = -dir;
    A.mtHookLimb = bd ? bd.limb : 'fh';
    A.startScript('mtGouZhu'); A.chain = ['grab'];   // 勾住以后接的是「刁以后」那几下（寸打 / 穿心掌 / 提膝），挂手勾住的也一样
    game.freeze = stop(7); game.shake = Math.max(game.shake, 3);
    A.info = { label: '勾住', dmg, how: '勾住', why: '他出' + (bd ? bd.label : '招') + '的时候勾住了他的手：他失衡，你先动，接着打中是勾打', adv: MT_HOOK_STUN - MT_GOU_R, t: A.clock };
    B.info = { label: '被勾住', dmg, how: '失衡', why: '出手上的招的时候被螳螂手勾住：想出手上的招就要么比他快、要么等他勾空', adv: -(MT_HOOK_STUN - MT_GOU_R), t: B.clock };
    cev('hook', A, B, { name: bm ? bm.name : null });
    if (!game.quiet) { parryFx(A, contactPoint(A, B)); stamp(A.J.head[0] - dir * 52, A.J.head[1] - 46, '勾住', 30, A); tag(B.x, B.J.head[1] - 30, '失衡', A, 20); tag(B.x + dir * 16, B.J.head[1] + 4, '-' + dmg, A, 16); }
    Sound.parry();
    bumpCombo(A, B); noteGrab(A, dmg, '勾住');
    if (B.hp <= 0) { B.hp = 0; B.mtHeld = false; B.knockDown(4, dir * 3, 999, true); }
    return true;
  }
  // 采手：抓住手腕往怀里一带，他短硬直 MT_CAI_STUN、你 MT_CAI_R 帧放开先动（不是擒住：没有后续、挣不脱、也不疼）。
  // 硬直里的人（挡住的硬直、挨打的硬直）采不住 —— 不然崩捶被挡住接勾搂就是躲不开的一套（采手 → 崩捶 → 采手……无限连）
  if (B.state === 'blockstun' || B.state === 'hit') {
    A.move.hit = false; A.move.missTag = true;
    A.info = { label: '勾搂', dmg: 0, how: '采空', why: '硬直里的人采不住：采手是开他站着的架子用的', adv: null, t: A.clock };
    if (!game.quiet) tag(B.x, B.J.head[1] - 30, '采空', B, 20);
    cev('grabMiss', A, B, { name: A.move.name, why: 'stun' });
    return true;
  }
  const dmg = MT_CAI_DMG;
  B.hp -= dmg; A.stats.hits++;
  A.gainQi(dmg * 0.4 * QI_PER_HP + 2); B.gainQi(dmg * 0.9 * QI_PER_HP);
  B.state = 'hit'; B.stunT = MT_CAI_STUN; B.hurtHeavy = false; B.move = null; B.chain = []; B.chainIdle = 99; B.runT = 0; B.kvx = 0; B.flow = 0; B.jin = 0;
  B.lowBlock = false; B.comboLive = false; B.grabbed = false; B.mtHeld = true; B.facing = -dir;
  A.mtHookLimb = 'fh';
  A.startScript('mtCai'); A.chain = ['grab'];
  game.freeze = stop(4);
  A.info = { label: '采手', dmg, how: '采住', why: '抓住他的手腕往怀里一带：他短硬直，你先动。他举着手挡的时候用', adv: MT_CAI_STUN - MT_CAI_R, t: A.clock };
  cev('cai', A, B, { type });
  if (!game.quiet) { dust(B.x, FLOOR, 3); burst(B.x - dir * 10, FLOOR - 70, dir, 6, 24, 3, pal(A).fx); tag(B.x, B.J.head[1] - 26, '采', A, 20); tag(B.x + dir * 16, B.J.head[1] + 4, '-' + dmg, A, 16); }
  Sound.hit(0.3);
  bumpCombo(A, B); noteGrab(A, dmg, '采手');
  if (B.hp <= 0) { B.hp = 0; B.mtHeld = false; B.knockDown(4, dir * 3, 999, true); }
  return true;
}

/* ============================================================
   画：待机的呼吸（两只螳螂手微微颤）、勾住 / 采手时手搭在他手腕上（只是画面）
   ============================================================ */
function mtTarget(F, t) {
  const st = F.state, m = F.move;
  if (st === 'idle') {
    // 待机：两秒一口气，身子起伏一点；两只勾手一上一下微微颤（螳螂的手在动）
    copyPose(t, MPOSE.stance);
    const ph = F.clock * TAU / 120, c = Math.cos(ph), s = Math.sin(ph * 2.3);
    t.hy -= 0.3 * c; t.tor += 0.8 * c; t.head -= 0.6 * Math.cos(ph - 0.5);
    t.fh[0] += 1.6 * c; t.fh[1] += 1.4 * s; t.fpa += 5 * s;
    t.bh[0] += 1.2 * Math.cos(ph - 0.8); t.bh[1] += 1.6 * Math.sin(ph * 2.3 + 0.9); t.bpa -= 5 * Math.sin(ph * 2.3 + 0.9);
    return t;
  }
  if (st === 'attack' && m && (m.name === 'mtGouZhu' || m.name === 'mtCai')) {
    // 勾住 / 采手：前手真的搭在他的小臂上（他的那只手的手腕；画面上的骨骼 J 只用来摆姿势）
    copyPose(t, evalKeys(m.def.keys, m.t));
    const o = F.opp, lim = F.mtHookLimb || 'fh';
    if (o.state === 'hit' && o.mtHeld && o.J && F.J && o.J[lim] && F.J.sh) {
      const hx = (o.J[lim][0] - F.J.sh[0]) * F.facing - 4, hy = o.J[lim][1] - F.J.sh[1];
      const u = clamp(m.t / Math.max(1, m.def.R * 0.5), 0, 1);
      t.fh[0] = t.fh[0] + (clamp(hx, 10, 50) - t.fh[0]) * u; t.fh[1] = t.fh[1] + (clamp(hy, -30, 36) - t.fh[1]) * u;
    }
    return t;
  }
  return null;
}
// 勾住的时候手腕上一圈墨线（勾打的加成还在）
function mtDrawCue(c2d, F, V) {
  if (!V || !V.J) return;
  const o = F.opp;
  if (o && o.state === 'hit' && o.reel && o.reelKind === 'hook' && o.reelBy === F.idx) {
    const J = V.J, P = pal(F);
    c2d.save(); c2d.lineCap = 'round';
    c2d.strokeStyle = rgbaOf(P.qi, 0.55); c2d.lineWidth = 2.2; c2d.beginPath(); c2d.arc(J.fh[0], J.fh[1], 11, 0, TAU); c2d.stroke();
    c2d.restore();
  }
}

/* ============================================================
   交手、跨派、挂进拳派表
   ============================================================ */
function mtRelation(a, b) { return relation(a, b); }
const M_BENCH_GROUPS = [
  ['拳 · 崩捶', ['mtBeng', 'mtTan', 'mtChe', 'mtLiao']],
  ['重 · 劈掌', ['mtPi', 'mtGuaDa', 'mtTiao']],
  ['踢 · 勾踢', ['mtGou', 'mtXi', 'mtSao']],
  ['一串里', ['mtSiF', 'mtSiB', 'mtKanF', 'mtKanB', 'mtXiC', 'mtDiao', 'mtCun', 'mtChuan', 'mtShuangFeng']],
  ['勾搂', ['grab', 'lowGrab', 'mtGuaShou', 'mtGouZhu', 'mtCai', 'mtLouTui']],
  ['跳起来', ['airJab', 'airHeavy', 'airKick', 'dive']],
  ['身法 · 防守', ['shove', 'mtGua', 'stomp', 'dash', 'mtHop', 'slip', 'slipElbow', 'burst', 'super']],
];
STYLES.mantis = {
  id: 'mantis', name: '螳螂拳', moves: MMOVES, relation: mtRelation, cancel: MT_CANCEL, variant: mtVariant, poses: MPOSE, base: MBASE,
  blockHeavy: 'mtGua', parry: false, runMul: MT_RUN,   // 没有卸力（勾是它的卸力）；挡住按重是挂捶；跑得快一成
  input: mtInput, canCancel: mtCanCancel, defend: mtDefend, grab: mtGrab, target: mtTarget, drawCue: mtDrawCue,
  benchGroups: M_BENCH_GROUPS, benchHit: ['mtBeng', 'mtTan', 'mtChe', 'mtLiao', 'mtPi', 'mtGuaDa', 'mtTiao', 'mtGou', 'mtXi', 'mtSao', 'mtSiF', 'mtSiB', 'mtKanF', 'mtKanB', 'mtXiC',
    'mtDiao', 'mtCun', 'mtChuan', 'mtShuangFeng', 'mtGua', 'slipElbow', 'super', 'stomp', 'airJab', 'airHeavy', 'airKick', 'dive'],
  benchSeq: {
    mtGouZhu: { dist: 86, op: (i, F, O) => i === 0 ? TAP('heavy') : 0, me: (i, F, O) => O.move && O.move.name === 'heavy' && O.move.t >= 4 && O.move.t < 5 ? TAP('grab') : 0 },
    mtCai: { dist: 70, def: 'block', me: (i, F) => i === 0 ? TAP('grab') : 0 },
    mtGuaShou: { dist: 86, op: (i, F, O) => i === 0 ? TAP('jab') : (O.move && O.move.name === 'jab' && O.move.blocked && O.move.t >= O.move.S + 2 && O.move.t < O.move.S + 3 ? TAP('jab') : 0), me: (i, F) => F.state === 'blockstun' && F.stunT < 7 && F.stunT >= 6 ? TAP('grab') | HOLD('block') : HOLD('block') },
    mtLouTui: { dist: 112, op: (i, F, O) => i === 0 ? TAP('kick') : 0, me: (i, F, O) => O.move && O.move.name === 'kick' && O.move.t >= 6 && O.move.t < 7 ? TAP('grab') : 0 },
    mtHop: { dist: 80, def: 'block', me: (i, F) => i === 0 ? TAP('jab') : F.move && F.move.name === 'mtBeng' && F.move.blocked ? HOLD('left') : 0 },
  },
};
/* 跨派：两派的招按同一套系别比（拳 > 腿 > 重 > 拳，起手压）；多出来的照咏春拳那一份（截脚截地上的腿）。
   勾、薄挡在 mtGrab / mtDefend（doGrab / applyHit）里，不走这张表 */
MATCHUPS['trad|mantis'] = { relation(dT, dM) { return relation(dT, dM); } };
MATCHUPS['wc|mantis'] = { relation(dW, dM) { return wcRules(dW, dM) || relation(dW, dM); } };
MATCHUPS['taiji|mantis'] = { relation(dJ, dM) { return relation(dJ, dM); } };
