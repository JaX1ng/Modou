'use strict';
/* ============================================================
   咏春拳（2.10 重做；2.9 叫「迎春拳」，那一版只是换了动作的传统格斗）—— 设计稿在 WINGCHUN.md，改玩法先改那里。
   和传统格斗不一样的是按键语法，不只是招：
   · 拳：连环冲拳看拍子，不看打没打中 —— 按在拍子上两只手轮流打、越打越快越顺；抢拍晚出，过拍断
   · 重：寸拳（按住蓄劲）；前 + 重 批肘，后 + 重 拐肘，蹲 + 重 沉肘
   · 挡：点一下拍手，按住黐手 —— 黏住打过来的手脚就进「搭手」；挨打的硬直里按住挡 + 对的方向 = 黐手破连
   · 搭手：手搭上了在手上做文章 —— 前 / 后 / 蹲 翻成摊 / 膀 / 伏（顺一级一级涨），拳从手型里打出去，拿 = 拉手扣住手腕
   · 拿：拉手（拉住打过来的手 = 拉手反击；扣住站着的人）→ 都进搭手
   引擎在几个地方先问这一派怎么解释（STYLES.wc 最后那几个钩子）：出招中按键（input 'attack'）、拍开以后（'parry'）、
   挡的时候被打到 / 挨打时被打到（defend）、我打中他（strike）、两边的招撞上（clash）、抓到人（grab）、算硬直（stunOf）、画架势（target）、画搭手的提示（drawCue）
   ============================================================ */

/* ---------- 底子：问手 + 护手，两只掌竖着、掌心朝里（Jack：手掌内翻一定要看得出来是往里翻的）。
   2.10.2 照 ref/wc_stance_side.jpg 重摆：前手（问手）大臂往前下斜、肘沉着不伸直，小臂往上扬，掌张开、手指朝前上（掌心朝里偏下）；
   后手（护手）竖掌、掌心朝里，叠在前手小臂的后半段上；两个肘都朝下，身子正着 ---------- */
const WBASE = { rot: 0, spin: 0, tor: 2, head: 2, hy: 69, dx: 0, air: 0, fe: 1, be: 1, tw: 20, fn: 1, bn: 1, ft: 0, bt: 0, fo: 0, bo: 0,
  fp: 1, bp: 1, fpa: -34, bpa: -84, fpr: 0.85, bpr: 1, fw: 0, bw: 0, fh: [47.3, -2.8], bh: [31, 8], ff: [28, 0], bf: [-32, 0] };
const wmk = o => mk(o, WBASE);
function WM(o) { o.pb = WBASE; o.style = 'wc'; return M(o); }
const WJ = (base, o) => Object.assign({}, base, o);

/* ---------- 2.10.2 日字冲拳（照 ref/wc_chung_seq_1 ～ 6.jpg 那六格；Jack：一拳打出去就是这个顺序，两只手轮流这么打）
   打出去那条胳膊（Jack：大臂往下、小臂平着直着、拳头往上翘一点 —— 胳膊不是完全伸直的，手腕往上弯一点点）：
     大臂从肩往前下斜 W_UA 度、肘尖朝下，小臂往上扬 W_FA 度，到头也留一点弯；拳头绕手腕往上翘 W_COCK 度（pose.js fw / bw）
   另一只手：收在胸口、打出去那条胳膊的肘底下（第 1、2、6 格）；这一拳到头，它张开成竖掌贴到那条胳膊的肘弯上（第 4 格）；
     下一拳就是它从这条小臂上面滚出去、这条从底下抽回来（第 5 格：两条小臂一上一下擦着交错，肩膀正好转到正中）
   身子（Jack：出拳的时候身子不用往前伸很多，一点点就够了，像打桩一样稳住）：一串里 tor / dx / hy 都不变，不跟着拳一冲一冲，
     比架势只往前一点点；拳的远近靠拧腰送肩（tw）和胳膊，两拳之间只有肩膀跟着左右换 ---------- */
const W_LINE = -1;                                              // 搭手里直冲这些后手拳的高度（和肩一样高）
const W_UA = 12, W_FA = 14, W_COCK = 32;
const W_TOR = 3, W_DX = 5, W_HY = 69, W_TWF = 34, W_TWR = -34;   // 一串里身子的样子；出前手、后手时拧腰多少（正 = 前手那边的肩往前）
// 拳心（掌是掌根）离出拳那边的肩膀多远 [往前, 往下]：大臂往前下斜 ua 度、小臂往上扬 fa 度
const wArm = (ua, fa) => [BODY.bone.ua * Math.cos(ua * D2R) + BODY.bone.fa * Math.cos(fa * D2R), BODY.bone.ua * Math.sin(ua * D2R) - BODY.bone.fa * Math.sin(fa * D2R)];
const W_ARM = wArm(W_UA, W_FA), W_ARM_PALM = wArm(8, 8);        // 推掌胳膊伸得直一点
// 换成姿势的坐标（相对两肩中间）：side 1 前手、-1 后手，tw 这一下拧腰多少，at 相对这只手的肩膀
const wFrom = (side, tw, at) => { const s = side * BODY.shoulderW * Math.sin(tw * D2R), t = W_TOR * D2R; return [+(s * Math.cos(t) + at[0]).toFixed(2), +(s * Math.sin(t) + at[1]).toFixed(2)]; };
const W_BODY = { tor: W_TOR, head: 2, hy: W_HY, dx: W_DX, ff: [29, 0], bf: [-31, 0] };
const W_GUARD_FIST = [19, 9], W_GUARD_PALM = [25, 5];           // 收回来的拳（胸口、肘底下）；那一拳到头时张开的竖掌（贴在肘弯上）
// 前手冲拳到头，后手拳收在胸口（第 6 格反过来）；…4：后手张开成竖掌贴到前手的肘弯（第 4 格）—— 下一拳从这里出
const W_PF = WJ(W_BODY, { tw: W_TWF, fh: wFrom(1, W_TWF, W_ARM), fp: 0, fw: W_COCK, fe: 1, bh: W_GUARD_FIST, bp: 0, bw: 0, be: 1 });
const W_PF4 = WJ(W_PF, { bh: W_GUARD_PALM, bp: 1, bpa: -84, bpr: 1 });
const W_PR = WJ(W_BODY, { tw: W_TWR, bh: wFrom(-1, W_TWR, W_ARM), bp: 0, bw: W_COCK, be: 1, fh: W_GUARD_FIST, fp: 0, fw: 0, fe: 1 });
const W_PR4 = WJ(W_PR, { fh: W_GUARD_PALM, fp: 1, fpa: -84, fpr: 1 });
// 立掌（每三下的第三下）：走同一条路推出去，到头是竖掌、掌根往前（侧面看是掌边，掌心微微朝里 fpr 0.35）；推掌胳膊伸得直一点、肩送得多一点
const W_MF = WJ(W_PF, { tw: W_TWF + 6, fh: wFrom(1, W_TWF + 6, W_ARM_PALM), fp: 1, fpa: -76, fpr: 0.35, fw: 0 });
const W_MF4 = WJ(W_MF, { bh: W_GUARD_PALM, bp: 1, bpa: -84, bpr: 1 });
const W_MR = WJ(W_PR, { tw: W_TWR - 6, bh: wFrom(-1, W_TWR - 6, W_ARM_PALM), bp: 1, bpa: -76, bpr: 0.35, bw: 0 });
const W_MR4 = WJ(W_MR, { fh: W_GUARD_PALM, fp: 1, fpa: -84, fpr: 1 });
// 换手（第 5 格）：新的那只从打出去那条小臂上面滚出去（高一点），那条从底下往回抽（低一点、还在前面）；两个肘都在下面
const W_XR = WJ(W_BODY, { tw: 0, bh: [33, -3], bp: 0, bw: 8, be: 1, fh: [40, 6], fp: 0, fw: 6, fe: 1 });    // 出后手
const W_XF = WJ(W_BODY, { tw: 0, fh: [33, -3], fp: 0, fw: 8, fe: 1, bh: [40, 6], bp: 0, bw: 6, be: 1 });    // 出前手
const W_LOW = { hy: 52, tor: 18, head: -4, tw: 20, ff: [28, 0], bf: [-26, 0], fh: [34, -2], bh: [18, 4] };   // 蹲着：两只掌还竖着护在前面

/* ---------- 黐手、搭手的手型（前手；后手护着）—— 2.10.1 照参考图：两只手都在胸口到肩这一段、肘尖都朝下（膀手也不抬肘）
   摊：掌心朝上、小臂往前托；膀：小臂横在中线上、掌心朝外朝下；伏：掌心朝下压 */
const W_SHAPE = {
  '': { fh: [44, 7], fpa: -36, fpr: 1, fe: 1, bh: [24, 12], bpa: -46, bpr: 1, be: 1, tw: 10 },                      // 问手（没翻）
  tan: { fh: [50, 9], fpa: -8, fpr: 0.3, fe: 1, bh: [26, 11], bpa: -46, bpr: 1, be: 1, tw: 16 },                   // 摊
  bong: { fh: [46, 15], fpa: 36, fpr: -0.35, fe: 1, bh: [22, 9], bpa: -46, bpr: 1, be: 1, tw: 12 },                  // 膀（肘沉着、掌心翻朝外下）
  fook: { fh: [48, 11], fpa: 28, fpr: 0.7, fe: 1, bh: [26, 9], bpa: -46, bpr: 1, be: 1, tw: 14 },                   // 伏
};
// 盘手（按住挡没按方向时一直翻；照 ref/wc_dummy_rolling.jpg）：两只掌同一个高度带、一里一外换位，换的那一下两条小臂交叉；肘一直朝下
const W_ROLL = [
  { fh: [50, 7], fpa: -14, fpr: 0.5, fe: 1, bh: [30, 12], bpa: -40, bpr: 1, be: 1, tw: 14 },    // 前手在外（掌心朝上一点）、后手在里
  { fh: [41, 9], fpa: -30, fpr: 0.9, fe: 1, bh: [40, 11], bpa: -32, bpr: 0.9, be: 1, tw: 4 },   // 换位：两条小臂交叉
  { bh: [50, 7], bpa: -14, bpr: 0.5, be: 1, fh: [30, 12], fpa: -40, fpr: 1, fe: 1, tw: -6 },    // 后手在外、前手在里
  { bh: [41, 9], bpa: -30, bpr: 0.9, be: 1, fh: [40, 11], fpa: -32, fpr: 0.9, fe: 1, tw: 4 },   // 换回来
];
const W_GUARD_BACK = { fh: [34, 10], fpa: -50, fpr: 1, fe: 1, bh: [22, 15], bpa: -54, bpr: 1, be: 1, tw: 6 };        // 按住挡 + 后：两只手收回来护着
// 拍手：后手往前下方一拍（掌心朝前下）；前手留在问手的位置
const W_PAT = { tor: 4, dx: 3, hy: 68, tw: 18, bh: [46, 11], bpa: 22, bpr: 0.45, be: 1, fh: [34, 5], fpa: -40, fpr: 1, fe: 1 };

const WMOVES = {
  /* ---- 拳：连环冲拳（beat：按拍子接，见下面「拍子」）。flow：打中了顺加一级 ---- */
  // 冲拳（起手，第 1 → 4 格）：前手从问手收成拳、沉到中线上直直冲出去，拳头竖着往上翘；后手的护手跟过去贴到前手的肘弯上。
  // 身子从架势往前一点点（dx 0 → W_DX），收完招回到架势
  wJab: WM({ kind: 'jab', label: '冲拳', open: true, beat: true, flow: true, S: 3, A: 3, R: 7, dmg: 4, reach: 84, stun: 8, bstun: 6, kb: 1.4, stop: 2, power: .3,
    limb: 'fh', fx: 'jab', lunge: [1, 3, 6],
    keys: [[0, {}], [0.5, WJ(W_BODY, { dx: 2, tw: 26, fh: [42, 3], fp: 0, fw: 10, bh: [27, 8] })], [1, W_PF4, 'back'], [2, W_PF4], [3, {}]] }),
  // 连下去（第 4 → 5 → 6 格，两只手轮流）：贴在肘弯上的那只手收成拳、从这条小臂上面滚出去，这条从底下抽回胸口；
  // 到头以后（判定那几帧）收回来的那只张开成竖掌，贴到打出去那条胳膊的肘弯上，等下一拳。身子一直不动
  wJabR: WM({ kind: 'jab', label: '冲拳', beat: true, flow: true, S: 3, A: 3, R: 6, dmg: 4, reach: 86, stun: 6, bstun: 6, kb: 1.2, stop: 2, power: .3,
    limb: 'bh', fx: 'rush', lunge: [1, 3, 7],
    keys: [[0, W_PF4], [0.45, W_XR], [1, W_PR, 'back'], [2, W_PR4], [3, {}]] }),
  wJabF: WM({ kind: 'jab', label: '冲拳', beat: true, flow: true, S: 3, A: 3, R: 6, dmg: 4, reach: 86, stun: 6, bstun: 6, kb: 1.2, stop: 2, power: .3,
    limb: 'fh', fx: 'rush', lunge: [1, 3, 10],
    keys: [[0, W_PR4], [0.45, W_XF], [1, W_PF, 'back'], [2, W_PF4], [3, {}]] }),
  wPalmF: WM({ kind: 'jab', label: '立掌', beat: true, flow: true, S: 3, A: 3, R: 6, dmg: 4, reach: 86, stun: 6, bstun: 6, kb: 1.3, stop: 2, power: .35,
    limb: 'fh', fx: 'rush', lunge: [1, 3, 7],
    keys: [[0, W_PR4], [0.45, WJ(W_XF, { fp: 1, fpa: -62, fpr: 0.6, fw: 0 })], [1, W_MF, 'back'], [2, W_MF4], [3, {}]] }),
  wPalmR: WM({ kind: 'jab', label: '立掌', beat: true, flow: true, S: 3, A: 3, R: 6, dmg: 4, reach: 86, stun: 6, bstun: 6, kb: 1.3, stop: 2, power: .35,
    limb: 'bh', fx: 'rush', lunge: [1, 3, 7],
    keys: [[0, W_PF4], [0.45, WJ(W_XR, { bp: 1, bpa: -62, bpr: 0.6, bw: 0 })], [1, W_MR, 'back'], [2, W_MR4], [3, {}]] }),
  // 寸拳（收势：连环拳第 8 下、连环拳里按重）：身子往下一沉、后手拳贴着胸口，一寸一寸地炸出去 —— 霸体吃不住，打倒。
  // 2.10.2（Jack：出拳身子稳住）：收势也是沉下去、送肩炸出去，身子只往前一点（以前前倾 14°、往前冲 18）
  wCunEnd: WM({ kind: 'jab', label: '寸拳', stamp: '寸拳', beat: true, flow: true, pierce: true, S: 4, A: 3, R: 12, dmg: 10, reach: 88, stun: 14, bstun: 10, kb: 6, stop: 9, shake: 7, power: 1,
    limb: 'bh', fx: 'rushEnd', ghost: true, lunge: [1, 4, 10], launch: 4.5, ender: true, noCancel: true,
    keys: [[0, W_PF4], [0.6, { tor: 3, dx: 4, hy: 65, tw: 8, bh: [20, 6], bp: 0, fh: [34, -2], fpa: -82, ff: [29, 0], bf: [-31, 0] }],
      [1, { tor: 7, dx: 10, hy: 64, head: 0, tw: -42, bh: [58, -2], bp: 0, bw: 20, fh: [26, 1], fpa: -86, ff: [36, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 7, dx: 10, hy: 64, head: 0, tw: -42, bh: [58, -2], bp: 0, bw: 20, fh: [26, 1], fpa: -86, ff: [36, 0], bf: [-30, 0] }], [3, {}]] }),
  // 标指（前 + 拳）：前手四指并拢往前一插，射程长、伤害低；正好插在他出手的那只胳膊上 = 把手挑开，进搭手（biu）
  wBiu: WM({ kind: 'jab', label: '标指', open: true, beat: true, flow: true, biu: true, S: 4, A: 3, R: 9, dmg: 3, reach: 100, stun: 8, bstun: 6, kb: 1.2, stop: 2, power: .3,
    limb: 'fh', fx: 'jab', lunge: [1, 4, 10],
    keys: [[0, {}], [0.5, { fh: [36, -8], fpa: -40, fpr: 0.6, tw: 22 }],
      [1, { tor: 10, dx: 12, hy: 67, tw: 40, fh: [62, -7], fpa: -2, fpr: 0.15, bh: [24, -3], ff: [36, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 10, dx: 12, hy: 67, tw: 40, fh: [62, -7], fpa: -2, fpr: 0.15, bh: [24, -3], ff: [36, 0], bf: [-30, 0] }], [3, {}]] }),
  // 低掌（蹲 + 拳）：蹲下去一掌推在小腹底下（下段，要蹲着挡）
  wLowPalm: WM({ kind: 'jab', label: '低掌', open: true, beat: true, flow: true, height: 'low', S: 4, A: 3, R: 8, dmg: 4, reach: 84, stun: 8, bstun: 6, kb: 1.6, stop: 2, power: .3,
    limb: 'fh', fx: 'low', lunge: [1, 4, 6],
    keys: [[0, W_LOW], [0.5, WJ(W_LOW, { fh: [30, 10], fpa: -50 })], [1, WJ(W_LOW, { tor: 24, dx: 8, hy: 50, tw: 28, fh: [50, 24], fpa: -40, fpr: 0.5, bh: [22, 2] }), 'back'],
      [2, WJ(W_LOW, { tor: 24, dx: 8, hy: 50, tw: 28, fh: [50, 24], fpa: -40, fpr: 0.5, bh: [22, 2] })], [3, W_LOW]] }),

  /* ---- 重：寸拳（按住蓄劲）、批肘、拐肘、沉肘 ---- */
  // 寸拳：沉身、后手拳贴着胸口，一寸一寸炸出去。射程短、疼，前摇里霸体吃一下拳（重克拳）；打中他踉跄一下（reelHit）。
  // 按住重 = 蓄劲（charge：前摇走到六成停住，最多 WC_CHARGE 帧；蓄的时候没霸体），松开越蓄越疼；蓄满 = 寸劲破体（霸体吃不住、打倒）
  wCun: WM({ kind: 'heavy', label: '寸拳', open: true, charge: true, S: 8, A: 3, R: 12, dmg: 12, reach: 82, stun: 16, bstun: 9, kb: 3, stop: 7, shake: 4, power: .85, heavy: true,
    armor: { n: 1, from: 1, vs: ['light'] }, reelHit: true, limb: 'bh', fx: 'heavy', ghost: true, lunge: [2, 8, 12],
    keys: [[0, {}], [0.6, { tor: 2, dx: -2, hy: 63, tw: 14, bh: [16, 4], bp: 0, fh: [36, -8], fpa: -76, ff: [30, 0], bf: [-34, 0] }, 'out'],
      [1, { tor: 14, dx: 18, hy: 63, head: -2, tw: -34, bh: [58, -2], bp: 0, fh: [28, -4], fpa: -86, ff: [44, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 14, dx: 18, hy: 63, head: -2, tw: -34, bh: [58, -2], bp: 0, fh: [28, -4], fpa: -86, ff: [44, 0], bf: [-30, 0] }], [3, {}]] }),
  // 批肘（前 + 重）：后手肘提到耳边，从上往下斜着劈下去（贴身，打倒）
  wPai: WM({ kind: 'heavy', label: '批肘', stamp: '批肘', open: true, S: 7, A: 3, R: 14, dmg: 12, reach: 66, stun: 16, bstun: 9, kb: 4, stop: 8, shake: 6, power: .95, heavy: true,
    limb: 'be', fx: 'hammer', ghost: true, lunge: [1, 7, 14], launch: 4, lie: 24, ender: true, noCancel: true,
    keys: [[0, {}], [0.6, { tor: -6, dx: -2, hy: 70, tw: -10, bh: [6, -46], bp: 0, be: -1, fh: [34, -10], fpa: -70, ff: [30, 0], bf: [-32, 0] }, 'out'],
      [1, { tor: 24, dx: 16, hy: 63, head: -4, tw: -40, bh: [13, -8], bp: 0, be: 1, fh: [22, 6], fpa: -80, ff: [42, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 24, dx: 16, hy: 63, head: -4, tw: -40, bh: [13, -6], bp: 0, be: 1, fh: [22, 6], fpa: -80, ff: [42, 0], bf: [-30, 0] }], [3, {}]] }),
  // 拐肘（后 + 重）：转马，前手肘横着扫过来（身侧、身后一点也扫得到 reachBack）；打中他失衡
  wGwai: WM({ kind: 'heavy', label: '拐肘', stamp: '拐肘', open: true, S: 8, A: 4, R: 14, dmg: 11, reach: 70, reachBack: 36, stun: 18, bstun: 9, kb: 4.5, stop: 8, shake: 5, power: .9, heavy: true,
    reelHit: true, limb: 'fe', fx: 'whip', ghost: true, lunge: [1, 8, 8], ender: true, noCancel: true,
    keys: [[0, {}], [0.6, { spin: -24, tor: 4, dx: -2, hy: 66, tw: 54, fh: [6, -12], fp: 0, fe: -1, bh: [20, -4], ff: [26, 0], bf: [-34, 0] }, 'out'],
      [1, { spin: 30, tor: 10, dx: 14, hy: 64, tw: -16, fh: [2, 6], fp: 0, fe: -1, bh: [16, 4], ff: [40, 0], bf: [-32, 0] }, 'back'],
      [2, { spin: 34, tor: 10, dx: 14, hy: 64, tw: -18, fh: [2, 6], fp: 0, fe: -1, bh: [16, 4], ff: [40, 0], bf: [-32, 0] }], [3, {}]] }),
  // 沉肘（蹲 + 重）：跪马一沉，后手肘往下压在他大腿上（下段，要蹲着挡）；打中他失衡
  wJum: WM({ kind: 'heavy', label: '沉肘', stamp: '沉肘', open: true, height: 'low', S: 8, A: 3, R: 13, dmg: 10, reach: 68, stun: 16, bstun: 9, kb: 2.5, stop: 7, shake: 4, power: .85, heavy: true,
    reelHit: true, limb: 'be', fx: 'low', lunge: [1, 8, 12], ender: true, noCancel: true,
    keys: [[0, {}], [0.6, { hy: 62, tor: 8, tw: -6, bh: [6, -34], bp: 0, be: -1, fh: [34, -6], fpa: -70, ff: [30, 0], bf: [-32, 0] }, 'out'],
      [1, { hy: 46, tor: 34, dx: 20, head: -6, tw: -30, bh: [17, -4], bp: 0, be: 1, fh: [28, 8], fpa: -40, ff: [42, 0], bf: [-24, 0] }, 'back'],
      [2, { hy: 46, tor: 34, dx: 20, head: -6, tw: -30, bh: [17, -2], bp: 0, be: 1, fh: [28, 8], fpa: -40, ff: [42, 0], bf: [-24, 0] }], [3, W_LOW]] }),

  /* ---- 踢：撑脚一家，近、快、伤害小。link：一串里的踢也按拍子接（拳接踢、踢接拳、踢接踢都走 wcRhythm；2.10.1 Jack：拳踢来回乱按不能没有空） ---- */
  // 正撑脚：前腿提膝、脚跟往前直直撑出去（中段），两只手还护着
  wKick: WM({ kind: 'kick', label: '正撑脚', open: true, flow: true, link: true, S: 6, A: 4, R: 9, dmg: 7, reach: 100, stun: 12, bstun: 6, kb: 1.2, stop: 5, shake: 3, power: .6,
    limb: 'ff', fx: 'kick', lunge: [2, 6, 8],
    keys: [[0, {}], [0.55, { ff: [26, 42], tor: 0, hy: 71, dx: 2, bf: [-26, 0] }],
      [1, { tor: -10, head: 6, dx: 14, hy: 73, tw: 22, ff: [92, 46], ft: 34, bf: [-26, 0] }, 'back'], [2, { tor: -10, head: 6, dx: 14, hy: 73, tw: 22, ff: [92, 46], ft: 34, bf: [-26, 0] }],
      [2.45, { ff: [32, 34], tor: -2, dx: 6, hy: 72, bf: [-26, 0] }], [3, {}]] }),
  // 截脚（蹲 + 踢）：身子一侧，前腿往前下方一截，脚掌横着踩在他膝盖、小腿上（下段）。撞上他地上的出腿 = 截住（stopKick，交手克腿）；踢中他失衡
  wLowKick: WM({ kind: 'kick', label: '截脚', open: true, flow: true, link: true, stopKick: true, height: 'low', S: 5, A: 3, R: 10, dmg: 5, reach: 96, stun: 11, bstun: 6, kb: 2, stop: 5, shake: 3, power: .55,
    limb: 'ff', fx: 'low', lunge: [1, 5, 8], reelHit: true,
    keys: [[0, {}], [0.55, { spin: 10, ff: [22, 26], tor: 0, hy: 68, bf: [-28, 0] }],
      [1, { spin: 18, tor: -8, head: 4, dx: 10, hy: 66, ff: [80, 18], ft: 24, bf: [-28, 0] }, 'back'], [2, { spin: 18, tor: -8, head: 4, dx: 10, hy: 66, ff: [80, 18], ft: 24, bf: [-28, 0] }],
      [2.5, { spin: 6, ff: [32, 14], hy: 68, dx: 4 }], [3, {}]] }),
  // 侧撑脚（拳后接踢）：侧过身、前腿往前横着撑出去，把人撑开
  wSideKick: WM({ kind: 'kick', label: '侧撑脚', tag: '侧撑脚', flow: true, link: true, S: 4, A: 4, R: 10, dmg: 7, reach: 102, stun: 6, bstun: 6, kb: 4.5, stop: 5, shake: 4, power: .7,
    limb: 'ff', fx: 'kick', lunge: [1, 4, 10],
    keys: [[0, {}], [0.5, { spin: 34, ff: [22, 44], tor: 2, hy: 71, bf: [-24, 0] }],
      [1, { spin: 40, tor: -24, head: 10, dx: 20, hy: 74, ff: [100, 48], ft: 12, bf: [-24, 0] }, 'back'], [2, { spin: 40, tor: -24, head: 10, dx: 20, hy: 74, ff: [100, 48], ft: 12, bf: [-24, 0] }],
      [2.5, { spin: 16, ff: [30, 30], tor: -4, dx: 6, hy: 72 }], [3, {}]] }),
  // 连环撑（踢接踢）：换后腿再撑一脚
  wKick2: WM({ kind: 'kick', label: '连环撑', tag: '连环撑', flow: true, link: true, S: 4, A: 4, R: 10, dmg: 6, reach: 100, stun: 6, bstun: 6, kb: 3, stop: 5, shake: 3, power: .65,
    limb: 'bf', fx: 'kick', lunge: [1, 4, 12],
    keys: [[0, { ff: [30, 20] }], [0.5, { bf: [8, 40], ff: [26, 0], tor: 0, hy: 71 }],
      [1, { tor: -12, head: 6, dx: 18, hy: 73, tw: -16, bf: [92, 44], bt: 34, ff: [-2, 0] }, 'back'], [2, { tor: -12, head: 6, dx: 18, hy: 73, tw: -16, bf: [92, 44], bt: 34, ff: [-2, 0] }],
      [2.5, { bf: [10, 28], ff: [22, 0], tor: -2, dx: 8, hy: 71 }], [3, {}]] }),
  // 踩膝（连环撑再接踢）：提膝、往前下方一脚踩在他膝盖上 —— 打倒（倒得近，你压他起身）
  wStompKnee: WM({ kind: 'kick', label: '踩膝', stamp: '踩膝', flow: true, S: 5, A: 4, R: 13, dmg: 9, reach: 96, stun: 14, bstun: 9, kb: 3, stop: 8, shake: 6, power: .9,
    limb: 'ff', fx: 'stomp', lunge: [1, 5, 10], launch: 3, lie: 22, ender: true, noCancel: true,
    keys: [[0, {}], [0.55, { ff: [28, 50], tor: -2, hy: 72, head: 4, bf: [-24, 0] }],
      [1, { tor: 12, head: -6, dx: 16, hy: 64, ff: [72, 12], bf: [-28, 0] }, 'out'], [2, { tor: 12, head: -6, dx: 16, hy: 64, ff: [72, 10], bf: [-28, 0] }], [3, {}]] }),
  // 转马撑（转马以后按踢）：脚跟一拧整个人侧过去，借着转的劲前腿横着撑出去 —— 打倒
  wTurnKick: WM({ kind: 'kick', label: '转马撑', stamp: '转马撑', flow: true, S: 5, A: 4, R: 14, dmg: 10, reach: 104, stun: 14, bstun: 10, kb: 6, stop: 9, shake: 7, power: 1,
    limb: 'ff', fx: 'whip', ghost: true, lunge: [1, 5, 12], launch: 5, ender: true, noCancel: true,
    keys: [[0, {}], [0.55, { spin: 56, ff: [16, 46], tor: 4, hy: 70, bf: [-22, 0] }],
      [1, { spin: 44, tor: -30, head: 12, dx: 32, hy: 74, ff: [106, 50], ft: 10, bf: [-20, 0] }, 'back'], [2, { spin: 44, tor: -30, head: 12, dx: 32, hy: 74, ff: [106, 50], ft: 10, bf: [-20, 0] }],
      [2.5, { spin: 20, ff: [30, 26], tor: -4, dx: 8, hy: 71 }], [3, {}]] }),

  /* ---- 拿：拉手、截腿 —— 抓到人就进搭手（见下面 wcGrab） ---- */
  // 拉手：前手往前一探扣手腕。正好在他出拳、出掌的时候 = 拉手反击（trap）；站着、挡着、硬直里的人 = 扣住手腕。都进搭手。接不住腿
  grab: WM({ kind: 'grab', label: '拉手', open: true, trap: true, S: 4, A: 4, R: 13, dmg: 0, reach: 82, power: .4,
    limb: 'fh', lunge: [1, 4, 6],
    keys: [[0, {}], [0.5, { fh: [34, -8], fpa: -30, tw: 30 }],
      [1, { tor: 10, dx: 10, hy: 67, tw: 38, fh: [53, -4], fpa: 6, fpr: 0.5, bh: [24, -2], ff: [34, 0], bf: [-28, 0] }, 'out'],
      [2, { tor: 10, dx: 10, hy: 67, tw: 38, fh: [53, -4], fpa: 6, fpr: 0.5, bh: [24, -2], ff: [34, 0], bf: [-28, 0] }], [3, {}]] }),
  // 截腿（蹲 + 拿）：蹲下去两手往前下方一截 —— 截住地上的出腿（他失衡，你先打）；抓住蹲着的人进搭手；站着的抓不到
  lowGrab: WM({ kind: 'grab', label: '截腿', low: true, height: 'low', open: true, S: 6, A: 4, R: 15, dmg: 0, reach: 86, power: .5,
    limb: 'fh', lunge: [1, 6, 12],
    keys: [[0, W_LOW], [0.5, WJ(W_LOW, { hy: 46, tor: 22, fh: [26, 10], bh: [16, 14] })],
      [1, { hy: 42, tor: 36, dx: 18, head: -10, fh: [56, 38], fpa: 30, bh: [48, 42], bpa: 40, ff: [44, 0], bf: [-34, 0], tw: 10 }, 'out'],
      [2, { hy: 42, tor: 36, dx: 18, head: -10, fh: [56, 38], fpa: 30, bh: [48, 42], bpa: 40, ff: [44, 0], bf: [-34, 0], tw: 10 }], [3, W_LOW]] }),

  /* ---- 跳起来（上段：蹲着挡不住；飞撑脚能蹲下躲） ---- */
  airJab: WM({ kind: 'jab', label: '飞身冲拳', tier: 'air', lead: 'light', height: 'high', open: true, S: 4, A: 11, R: 6, dmg: 6, reach: 94, vreach: AIR_VREACH, stun: 15, bstun: 9, kb: 2.4, stop: 5, power: .45,
    limb: 'fh', fx: 'airSwing', air: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.55, J_(JT, { rot: 2, tor: 4, fh: [22, -4], fp: 0, bh: [20, 6], tw: 20 })],
      [1, { rot: 18, tor: 24, head: -6, dx: 6, fh: [56, 12], fp: 0, bh: [24, 6], ff: [16, 42], bf: [-28, 28], tw: 30 }, 'back'],
      [2, { rot: 20, tor: 26, head: -6, dx: 6, fh: [54, 15], fp: 0, bh: [24, 6], ff: [16, 42], bf: [-28, 28], tw: 30 }], [3, JD]] }),
  airHeavy: WM({ kind: 'heavy', label: '落掌', stamp: '落掌', tier: 'air', lead: 'heavy', height: 'high', open: true, S: 8, A: 10, R: 9, dmg: 10, reach: 100, vreach: AIR_VREACH, stun: 18, bstun: 11, kb: 4.5, stop: 8, shake: 5, power: .9, heavy: true,
    limb: 'bh', fx: 'hammer', air: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.7, { rot: -6, tor: -22, head: -10, bh: [-8, -56], bpa: -70, be: -1, fh: [24, -20], ff: [18, 54], bf: [2, 48], tw: -20 }],
      [1, { rot: 24, tor: 42, head: 12, dx: 12, bh: [52, 32], bpa: 50, bpr: 0.6, fh: [30, 8], ff: [22, 26], bf: [-24, 36], tw: -20 }, 'out'],
      [2, { rot: 26, tor: 44, head: 12, dx: 12, bh: [50, 36], bpa: 56, bpr: 0.6, fh: [30, 8], ff: [22, 26], bf: [-24, 36], tw: -20 }], [3, JD]] }),
  airKick: WM({ kind: 'kick', label: '飞撑脚', stamp: '飞撑脚', tier: 'air', lead: 'kick', height: 'high', open: true, S: 7, A: 11, R: 8, dmg: 9, reach: 110, vreach: AIR_VREACH, stun: 17, bstun: 10, kb: 5, stop: 7, shake: 4, power: .85,
    limb: 'ff', fx: 'airKick', air: true, ghost: true, evadeCrouch: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.6, { rot: -6, tor: 10, head: -4, ff: [10, 60], bf: [-6, 46], fh: [34, -16], bh: [18, -6], tw: 10 }],
      [1, { rot: 12, tor: -32, head: 12, dx: 16, ff: [98, 26], ft: 30, bf: [-14, 50], fh: [30, -14], bh: [16, -6], tw: 10 }, 'back'],
      [2, { rot: 12, tor: -32, head: 12, dx: 16, ff: [98, 26], ft: 30, bf: [-14, 50], fh: [30, -14], bh: [16, -6], tw: 10 }], [3, JD]] }),
  // 落膝（空中蹲 + 踢）：先往上一腾，再把膝盖往前下方砸下去（主系「坠」：专破蹲着的、对空；怕站着的拳）
  dive: WM({ kind: 'kick', label: '落膝', stamp: '落膝', tier: 'dive', lead: 'kick', height: 'high', S: 13, A: 40, R: 8, dmg: 9, reach: 80, vreach: 64, stun: 18, bstun: 10, kb: 2, stop: 8, shake: 6, power: .9,
    limb: 'ff', fx: 'dive', air: true, ghost: true, dive: true, aaProof: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.7, { rot: -6, tor: 10, head: 4, ff: [20, 58], bf: [-10, 46], fh: [24, -30], bh: [-16, -26], tw: 0 }],
      [1, { rot: -34, tor: 16, head: 10, ff: [40, 32], bf: [-22, 30], fh: [-14, -28], bh: [-30, -12], tw: 0 }, 'out'],
      [2, { rot: -34, tor: 16, head: 10, ff: [40, 32], bf: [-22, 30], fh: [-14, -28], bh: [-30, -12], tw: 0 }], [3, JD]] }),

  /* ---- 防守反击、身法 ---- */
  // 截打（挡 + 拳）：从手上直接一掌截出去（出手前几帧打击无敌），接着按拍子连
  shove: WM({ kind: 'jab', label: '截打', stamp: '截打', beat: true, flow: true, S: 2, A: 3, R: 12, dmg: 5, reach: 88, stun: 12, bstun: 7, kb: 1.6, stop: 5, shake: 2, power: .45,
    limb: 'fh', fx: 'jab', lunge: [0, 2, 8], sinv: [0, 4],
    keys: [[0, { hy: 68, tor: 0, head: 6, dx: -3, tw: 14, fh: [30, -14], fpa: -84, bh: [20, -8], bpa: -84 }],
      [1, { tor: 8, dx: 12, hy: 67, tw: 30, fh: [56, -8], fpa: -78, fpr: 0.4, bh: [22, -4], ff: [34, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 8, dx: 12, hy: 67, tw: 30, fh: [56, -8], fpa: -78, fpr: 0.4, bh: [22, -4], ff: [34, 0], bf: [-30, 0] }], [3, {}]] }),
  // 钉脚（蹲挡住下段的腿以后按踢；咏春的耕手一般直接黏住，用得少）
  stomp: WM({ kind: 'kick', label: '钉脚', stamp: '钉脚', height: 'low', flow: true, S: 4, A: 4, R: 13, dmg: 11, reach: 118, stun: 15, bstun: 9, kb: 4, stop: 9, shake: 6, power: .9,
    limb: 'ff', fx: 'stomp', lunge: [1, 4, 22], launch: 4, lie: 25, ender: true, noCancel: true,
    keys: [[0, W_LOW], [0.6, { hy: 72, tor: -6, head: 6, dx: 4, ff: [30, 60], bf: [-22, 0] }],
      [1, { hy: 62, tor: 18, head: -8, dx: 22, ff: [76, 4], bf: [-26, 0] }, 'out'], [2, { hy: 62, tor: 18, head: -8, dx: 22, ff: [76, 2], bf: [-26, 0] }], [3, {}]] }),
  // 追形（冲刺）：压低身子、两只掌还护在前面，贴着地往前一窜
  dash: WM({ kind: 'script', label: '追形', S: 0, A: 0, R: 16, script: true, lunge: [0, 10, 96], inv: [0, 8],
    keys: [[0, { hy: 62, tor: 14, head: -2, ff: [32, 0], bf: [-28, 0], tw: 24 }],
      [0.12, { hy: 58, tor: 22, head: -6, dx: 8, ff: [50, 8], bf: [-60, 12], fh: [46, -4], bh: [28, 2], tw: 24 }, 'out'],
      [0.45, { hy: 56, tor: 20, head: -4, dx: 10, ff: [52, 2], bf: [-60, 6], fh: [46, -4], bh: [28, 2], tw: 24 }],
      [0.7, { hy: 62, tor: 10, head: -2, dx: 4, ff: [40, 0], bf: [-42, 0], fh: [46, -8], bh: [24, 0], tw: 26 }], [1, {}]] }),
  // 转马（闪身：按着挡朝对手双击）：脚跟一拧侧过身、压低，从他身边转过去（只躲得过重拳；躲过了自动转马掌）
  slip: WM({ kind: 'script', label: '转马', S: 0, A: 0, R: 22, script: true, lunge: [0, 11, 110], slipInv: [0, 11],
    keys: [[0, { hy: 60, tor: 14, head: 4, dx: -2, fh: [30, -16], fpa: -86, bh: [24, -8], tw: 14, ff: [30, 0], bf: [-32, 0] }],
      [0.14, { hy: 48, tor: 32, head: -4, dx: 12, spin: 30, fh: [30, -14], bh: [26, -6], tw: 14, ff: [50, 6], bf: [-52, 12] }, 'out'],
      [0.48, { hy: 48, tor: 30, head: -4, dx: 12, spin: 30, fh: [30, -14], bh: [26, -6], tw: 14, ff: [48, 2], bf: [-54, 8] }],
      [0.72, { hy: 64, tor: 10, head: 6, dx: 2, spin: 10, fh: [30, -16], bh: [24, -8], tw: 14, ff: [28, 0], bf: [-32, 0] }], [1, {}]] }),
  // 转马掌（转马躲过重拳、转到他身后，自动出）：一拧转过来，前手一掌拍在他背上 —— 他背对着你踉跄
  slipElbow: WM({ kind: 'heavy', label: '转马掌', stamp: '转马掌', tier: 'heavy', lead: 'heavy', S: 5, A: 3, R: 12, dmg: 10, reach: 86, stun: 18, bstun: 10, kb: STAGGER_KB,
    stop: 8, shake: 4, power: .8, limb: 'fh', fx: 'slipElbow', ghost: true, lunge: [0, 5, 18], stagger: true, ender: true, noCancel: true,
    keys: [[0, { spin: 165, tor: 20, hy: 58, head: 2, fh: [30, -14], bh: [24, -6], ff: [30, 0], bf: [-32, 0], tw: 0 }],
      [0.55, { spin: 95, tor: 4, hy: 66, head: -4, dx: -4, fh: [16, -6], fpa: -70, bh: [20, -4], ff: [24, 0], bf: [-36, 0], tw: -20 }],
      [1, { spin: 8, tor: 14, dx: 22, hy: 65, head: -4, fh: [55, -4], fpa: -80, fpr: 0.4, bh: [22, -2], ff: [44, 0], bf: [-32, 0], tw: 40 }, 'back'],
      [2, { spin: 4, tor: 14, dx: 22, hy: 65, head: -4, fh: [55, -4], fpa: -80, fpr: 0.4, bh: [22, -2], ff: [44, 0], bf: [-32, 0], tw: 40 }], [3, {}]] }),
  // 爆气（挨打时按重 + 踢，花半格气）：两只掌往外一撑，从身上炸开
  burst: WM({ kind: 'script', label: '爆气', S: 0, A: 0, R: 22, script: true, inv: [0, 18], evWave: 3,
    keys: [[0, { tor: 24, hy: 54, head: 10, fh: [16, 10], bh: [10, 12], tw: 0 }],
      [0.14, { tor: -12, head: -16, hy: 76, fh: [50, -14], fpa: -84, bh: [-34, -10], bpa: -100, ff: [40, 0], bf: [-42, 0], air: 6, tw: 0 }, 'out'],
      [0.5, { tor: -10, head: -14, hy: 74, fh: [48, -12], fpa: -84, bh: [-32, -8], bpa: -100, ff: [40, 0], bf: [-42, 0], air: 2, tw: 0 }], [1, {}]] }),
  // 连环寸拳（大招，气满按重 + 踢）：往下一沉（出手前几帧打击无敌），第一拳打中 = 一串左右交替的寸拳把人钉住，最后一记寸拳打飞
  super: WM({ kind: 'heavy', label: '连环寸拳', stamp: '连环寸拳', tier: 'super', S: 6, A: 3, R: 20, dmg: 4, reach: 92, stun: 20, bstun: 14, kb: 1, stop: 5, shake: 4, power: 1, heavy: true,
    limb: 'fh', fx: 'rush', ghost: true, lunge: [1, 6, 14], sinv: [0, 6], cost: QI_MAX, launch: 6, ender: true, noCancel: true, antiAir: 40,
    flurry: { n: 10, every: 2.25, dmg: 4, last: 20, kb: 1.2, lastKb: 9, endStamp: '寸拳' }, pierce: true,
    keys: [[0, {}], [0.4, { tor: 2, dx: -4, hy: 63, tw: 10, fh: [26, 0], fp: 0, bh: [18, 4], bp: 0, ff: [30, 0], bf: [-34, 0] }, 'out'],
      [1, WJ(W_PF, { dx: 12, hy: 64, fh: [56, -4] }), 'back'], [2, WJ(W_PF, { dx: 12, hy: 64, fh: [56, -4] })], [3, {}]] }),

  /* ---- 搭手（手搭上了；见下面「搭手」）---- */
  // 搭手本身：手搭着，等你按（姿势按手型现画，见 wcTarget）。tch：引擎不管它的时间，由 touchStep 管
  tch: WM({ kind: 'script', label: '搭手', S: 0, A: 0, R: 9999, script: true, tch: true, keys: [[0, {}], [1, {}]] }),
  // 从手型里打出去（都是后手打，前手还搭着他）：没翻 = 直冲；摊 = 摊打；膀 = 膀转摊打（膀手一滚变摊，后手拳打进去）；伏 = 伏打
  tChung: WM({ kind: 'jab', label: '直冲', beat: true, flow: true, S: 2, A: 3, R: 7, dmg: 5, reach: 80, stun: 8, bstun: 6, kb: 1.4, stop: 3, power: .4,
    limb: 'bh', fx: 'jab2', lunge: [0, 2, 4],
    keys: [[0, { tor: 4, dx: 2, hy: 68, tw: 20, fh: [40, -8], fpa: -60, bh: [22, -3] }], [1, { tor: 8, dx: 8, hy: 67, tw: -8, fh: [36, -6], fpa: -60, bh: [54, W_LINE], bp: 0 }, 'back'],
      [2, { tor: 8, dx: 8, hy: 67, tw: -8, fh: [36, -6], fpa: -60, bh: [54, W_LINE], bp: 0 }], [3, {}]] }),
  tTan: WM({ kind: 'jab', label: '摊打', stamp: '摊打', beat: true, flow: true, S: 2, A: 3, R: 7, dmg: 6, reach: 80, stun: 8, bstun: 6, kb: 1.6, stop: 4, shake: 2, power: .5,
    limb: 'bh', fx: 'jab2', lunge: [0, 2, 6],
    keys: [[0, { tor: 4, dx: 2, hy: 68, tw: 26, fh: [44, -3], fpa: -14, fpr: 0.2, bh: [26, -6] }], [1, { tor: 8, dx: 9, hy: 67, tw: -6, fh: [40, -2], fpa: -6, fpr: 0.2, bh: [56, W_LINE], bp: 0 }, 'back'],
      [2, { tor: 8, dx: 9, hy: 67, tw: -6, fh: [40, -2], fpa: -6, fpr: 0.2, bh: [56, W_LINE], bp: 0 }], [3, {}]] }),
  tBong: WM({ kind: 'jab', label: '膀转摊打', stamp: '膀转摊打', beat: true, flow: true, S: 2, A: 3, R: 7, dmg: 7, reach: 80, stun: 8, bstun: 6, kb: 1.8, stop: 4, shake: 3, power: .55,
    limb: 'bh', fx: 'jab2', lunge: [0, 2, 6],
    keys: [[0, { tor: 4, dx: 2, hy: 68, tw: 40, fh: [44, 10], fpa: 80, fpr: -0.35, fe: -1, bh: [12, 10], bpa: -70 }], [0.6, { tw: 10, fh: [40, -2], fpa: 0, fpr: 0.2, fe: 1, bh: [34, -4], bp: 0 }],
      [1, { tor: 9, dx: 10, hy: 67, tw: -8, fh: [40, -2], fpa: -6, fpr: 0.2, bh: [57, W_LINE], bp: 0 }, 'back'],
      [2, { tor: 9, dx: 10, hy: 67, tw: -8, fh: [40, -2], fpa: -6, fpr: 0.2, bh: [57, W_LINE], bp: 0 }], [3, {}]] }),
  tFook: WM({ kind: 'jab', label: '伏打', stamp: '伏打', beat: true, flow: true, S: 2, A: 3, R: 7, dmg: 6, reach: 80, stun: 8, bstun: 6, kb: 1.6, stop: 4, shake: 2, power: .5,
    limb: 'bh', fx: 'jab2', lunge: [0, 2, 6],
    keys: [[0, { tor: 4, dx: 2, hy: 68, tw: 24, fh: [44, 2], fpa: 26, fpr: 0.7, bh: [22, -6] }], [1, { tor: 9, dx: 9, hy: 66, tw: -6, fh: [42, 6], fpa: 34, fpr: 0.7, bh: [56, W_LINE], bp: 0 }, 'back'],
      [2, { tor: 9, dx: 9, hy: 66, tw: -6, fh: [42, 6], fpa: 34, fpr: 0.7, bh: [56, W_LINE], bp: 0 }], [3, {}]] }),
  // 搭手里按重：批肘（疼、打倒，但慢 —— 他来得及甩手）
  tPai: WM({ kind: 'heavy', label: '批肘', stamp: '批肘', S: 5, A: 3, R: 14, dmg: 12, reach: 76, stun: 16, bstun: 9, kb: 4, stop: 8, shake: 6, power: .95, heavy: true,
    limb: 'be', fx: 'hammer', ghost: true, lunge: [0, 5, 12], launch: 4, lie: 24, ender: true, noCancel: true,
    keys: [[0, { tor: 2, hy: 68, tw: 20, fh: [40, -6], fpa: -60, bh: [20, -4] }], [0.6, { tor: -6, dx: -2, hy: 70, tw: -10, bh: [6, -46], bp: 0, be: -1, fh: [34, -8], fpa: -60 }, 'out'],
      [1, { tor: 24, dx: 14, hy: 63, head: -4, tw: -40, bh: [13, -8], bp: 0, be: 1, fh: [22, 6], fpa: -80 }, 'back'],
      [2, { tor: 24, dx: 14, hy: 63, head: -4, tw: -40, bh: [13, -6], bp: 0, be: 1, fh: [22, 6], fpa: -80 }], [3, {}]] }),
  // 搭手里按踢：撑脚（低一点撑在他小腿、膝盖上，把他撑开、失衡）
  tKick: WM({ kind: 'kick', label: '撑脚', tag: '撑脚', flow: true, S: 3, A: 3, R: 11, dmg: 6, reach: 92, stun: 10, bstun: 7, kb: 5, stop: 5, shake: 3, power: .6,
    limb: 'ff', fx: 'kick', lunge: [0, 3, 4], reelHit: true,
    keys: [[0, { tor: 2, hy: 68, tw: 24, fh: [42, -6], fpa: -60, bh: [22, -4] }], [0.55, { ff: [24, 34], tor: 0, hy: 71, fh: [40, -8], fpa: -60 }],
      [1, { tor: -8, head: 4, dx: 8, hy: 72, tw: 20, ff: [84, 26], ft: 30, bf: [-26, 0], fh: [38, -8], fpa: -60 }, 'back'],
      [2, { tor: -8, head: 4, dx: 8, hy: 72, tw: 20, ff: [84, 26], ft: 30, bf: [-26, 0], fh: [38, -8], fpa: -60 }], [3, {}]] }),
  // 扣住手腕以后：拳 = 拉打（前手拽着，后手连冲两拳）
  tLapDa: WM({ kind: 'script', label: '拉打', stamp: '拉打', S: 0, A: 0, R: 20, script: true, evHit: 4, evHit2: 11, lap: 'da',
    keys: [[0, { fh: [32, 2], fp: 0, bh: [22, 2], bp: 0, tor: 4, dx: 2, hy: 67, tw: 10 }],
      [0.18, { fh: [22, 8], fp: 0, bh: [54, -4], bp: 0, tor: 8, dx: 8, hy: 67, tw: -24 }, 'out'],
      [0.36, { fh: [24, 8], fp: 0, bh: [26, 0], bp: 0, tor: 4, dx: 4, hy: 67, tw: 0 }],
      [0.56, { fh: [20, 8], fp: 0, bh: [56, -4], bp: 0, tor: 10, dx: 10, hy: 66, tw: -28 }, 'out'],
      [0.75, { fh: [30, -6], bh: [32, 0], bp: 0, tor: 6, dx: 6, hy: 67, tw: 0 }], [1, {}]] }),
  // 重 = 拉手批肘（前手往回一拽，后手肘从上往下劈 —— 打倒）
  tLapPai: WM({ kind: 'script', label: '拉手批肘', stamp: '拉手批肘', S: 0, A: 0, R: 24, script: true, evHit: 8, lap: 'pai',
    keys: [[0, { fh: [32, 2], fp: 0, bh: [22, 2], tor: 4, dx: 2, hy: 67, tw: 10 }],
      [0.2, { fh: [14, 8], fp: 0, bh: [4, -46], bp: 0, be: -1, tor: -6, dx: -4, hy: 70, tw: -10 }],
      [0.36, { fh: [12, 10], fp: 0, bh: [13, -8], bp: 0, be: 1, tor: 24, dx: 10, hy: 63, head: -4, tw: -40 }, 'back'],
      [0.6, { fh: [12, 10], fp: 0, bh: [13, -6], bp: 0, be: 1, tor: 24, dx: 10, hy: 63, head: -4, tw: -40 }], [1, {}]] }),
  // 踢 = 拉手撑脚（前手拽住，前腿一脚撑在他肚子上 —— 把他撑开、失衡）
  tLapKick: WM({ kind: 'script', label: '拉手撑脚', stamp: '拉手撑脚', S: 0, A: 0, R: 18, script: true, evHit: 6, lap: 'kick',
    keys: [[0, { fh: [32, 2], fp: 0, bh: [22, 2], tor: 4, dx: 2, hy: 67, tw: 10 }],
      [0.2, { fh: [22, 6], fp: 0, ff: [24, 40], tor: -2, hy: 71, bf: [-26, 0] }],
      [0.36, { fh: [18, 6], fp: 0, tor: -12, head: 6, dx: 10, hy: 73, tw: 20, ff: [86, 40], ft: 30, bf: [-26, 0] }, 'back'],
      [0.6, { fh: [26, 0], fp: 0, tor: -8, dx: 8, hy: 72, ff: [40, 26], bf: [-26, 0] }], [1, {}]] }),
  // 蹲 / 拿 = 拉手跪马（咏春的摔，不是过肩摔）：扣住手腕往回一拽、退半步沉身跪马，把他的手往下往前带 —— 他往前扑倒、脸朝下趴在你面前
  tDrag: WM({ kind: 'script', label: '拉手跪马', stamp: '拉手跪马', S: 0, A: 0, R: 30, script: true, evSlam: 14, lap: 'drag', lunge: [0, 6, -30],
    keys: [[0, { fh: [32, 2], fp: 0, bh: [22, 2], tor: 4, dx: 2, hy: 67, tw: 10 }],
      [0.22, { fh: [12, 6], fp: 0, bh: [24, -6], tor: -6, dx: -10, hy: 66, tw: 26, ff: [26, 0], bf: [-38, 0] }, 'out'],
      [0.46, { fh: [28, 36], fp: 0, bh: [24, 18], tor: 24, dx: -6, hy: 44, head: 2, tw: 18, ff: [30, 0], bf: [-34, 0] }],
      [0.7, { fh: [30, 40], fp: 0, bh: [26, 22], tor: 26, dx: -6, hy: 44, head: 0, tw: 18, ff: [30, 0], bf: [-34, 0] }], [1, {}]] }),
  // 扣住手腕以后什么都不按：蝴蝶掌（两只掌并排推出去，把人推开）
  tButterfly: WM({ kind: 'script', label: '蝴蝶掌', S: 0, A: 0, R: 16, script: true, evPush: 4, lap: 'push',
    keys: [[0, { fh: [32, 2], fp: 0, bh: [22, 2], tor: 4, dx: 2, hy: 67, tw: 10 }],
      [0.25, { tor: 14, dx: 18, hy: 64, tw: 0, fh: [55, W_LINE - 3], fpa: -84, fpr: 0.35, bh: [53, W_LINE + 3], bpa: -80, bpr: 0.35, ff: [44, 0], bf: [-34, 0] }, 'back'],
      [0.5, { tor: 14, dx: 18, hy: 64, tw: 0, fh: [55, W_LINE - 3], fpa: -84, fpr: 0.35, bh: [53, W_LINE + 3], bpa: -80, bpr: 0.35, ff: [44, 0], bf: [-34, 0] }], [1, {}]] }),
  // 他甩手了：等着，WC_LAT_WIN 帧里按拳 = 甩手直冲
  tLat: WM({ kind: 'script', label: '甩手', S: 0, A: 0, R: 14, script: true,
    keys: [[0, { tor: 2, hy: 68, tw: 24, fh: [42, -8], fpa: -50, bh: [22, -4] }], [1, {}]] }),
  // 甩手直冲（来留去送）：他把手一甩开，前手顺着直直冲进去 —— 必中，接着按拍子连
  tLatChung: WM({ kind: 'jab', label: '甩手直冲', stamp: '甩手直冲', beat: true, flow: true, S: 2, A: 3, R: 8, dmg: 6, reach: 104, stun: 8, bstun: 6, kb: 1.6, stop: 4, shake: 2, power: .5,
    limb: 'fh', fx: 'jab2', lunge: [0, 3, 18],
    keys: [[0, { tor: 2, hy: 68, tw: 24, fh: [42, -8], fpa: -50, bh: [22, -4] }], [1, WJ(W_PF, { dx: 14, tor: 10 }), 'back'], [2, WJ(W_PF, { dx: 14, tor: 10 })], [3, {}]] }),
  // 翻错了手（乱了）：手一乱、往后缩 —— 先手给他
  tMess: WM({ kind: 'script', label: '乱手', S: 0, A: 0, R: 16, script: true,
    keys: [[0, { tor: 2, hy: 68, tw: 24, fh: [42, -8], bh: [22, -4] }], [0.3, { tor: -10, dx: -6, head: -6, hy: 70, tw: 10, fh: [30, -22], fe: -1, fpa: -110, bh: [10, -12] }, 'out'], [1, {}]] }),
  // 脱手（谁也没按 / 搭了太久）：两边松开、各退一点
  tSep: WM({ kind: 'script', label: '脱手', S: 0, A: 0, R: 5, script: true,
    keys: [[0, { tor: 2, hy: 68, tw: 24, fh: [42, -8], bh: [22, -4] }], [1, {}]] }),
};
// 连环寸拳打中以后那一串：左右手交替；最后一记寸拳
WMOVES.super.flurry.poses = [wmk(WJ(W_PF, { dx: 14, hy: 64, tor: 10 })), wmk(WJ(W_PR, { dx: 14, hy: 64, tor: 10 }))];
WMOVES.super.flurry.endPose = wmk({ tor: 16, dx: 20, hy: 62, head: -2, tw: -36, bh: [58, -2], bp: 0, fh: [30, -3], fpa: -86, ff: [46, 0], bf: [-30, 0] });

/* 架势（fighter.js target 用；挡、搭手的手型在 wcTarget 里现画） */
const WPOSE = {
  stance: wmk({ hy: 70 }),                                    // 问手 + 护手
  crouch: wmk(W_LOW),
  block: wmk(WJ(W_SHAPE[''], { hy: 68 })),                    // 黐手（手型见 wcTarget）
  cblock: wmk({ hy: 50, tor: 16, head: 6, tw: 10, ff: [26, 0], bf: [-25, 0], fh: [36, 16], fpa: 56, fpr: 0.6, bh: [18, -4], bpa: -84 }),   // 耕手：前手斜着往下护住下盘
  parry: wmk({ tor: -2, head: 6, dx: -4, hy: 69, tw: 20, fh: [48, 4], fpa: -18, bh: [24, 10] }),             // 拍开以后：前手还往外拨着
  win: wmk({ tor: 0, head: -6, hy: 74, tw: 0, fh: [22, -8], fp: 0, bh: [24, -8], bpa: -90, ff: [20, 0], bf: [-24, 0] }),   // 抱拳
};

/* ============================================================
   方向（相对对手）：0 没按 / 1 前 / 2 后 / 3 蹲
   离得远（ASSIST_R 以外）按前后只是转身往那边打，不算「前 + 拳」这种组合
   ============================================================ */
function wcDirVs(F, O, near) {
  const h = F.inp.held;
  if (h.down) return 3;
  const d = dirOf(h);
  if (!d || (near && Math.abs(O.x - F.x) > ASSIST_R)) return 0;
  return d === (O.x >= F.x ? 1 : -1) ? 1 : 2;
}
const wcDir = F => wcDirVs(F, F.opp, false);

/* ============================================================
   拍子（连环冲拳）：这一拳判定开始以后再过一拍，下一拳的判定就该到了
   ============================================================ */
const wcBeat = flow => Math.max(WC_BEAT_MIN, WC_BEAT - WC_BEAT_STEP * flow);
// 下一拳出哪一招：两只手轮流（上一拳是后手 → 这一拳前手），每三拳的第三拳是立掌；第 8 下（ci 7）寸拳收势。
// 2.10.1（Jack：换手照传统格斗的普通攻击那样，连下去就两只手轮流）：一串里夹着踢也算，踢记着上一拳是哪只手（m.hand），踢完接的拳换另一只
function beatNext(prevLimb, ci) {
  if (ci >= 7) return 'wCunEnd';
  const front = prevLimb === 'bh' || prevLimb === 'be', palm = ci % 3 === 2;
  return front ? (palm ? 'wPalmF' : 'wJabF') : (palm ? 'wPalmR' : 'wJabR');
}
const chainHand = m => m.def.kind === 'jab' ? m.def.limb : (m.hand || 'bh');     // 这一招以后该换哪只手：拳看自己是哪只手，踢看它记着的
// 一串里按踢出哪一脚：拳后侧撑脚、踢后连环撑；第 3 脚、第 8 下踩膝收势
function kickNext(m, ci) {
  const kc = m.def.kind === 'kick' ? (m.kc || 1) + 1 : 1;
  return [kc >= 3 || ci >= 7 ? 'wStompKnee' : m.def.kind === 'kick' ? 'wKick2' : 'wSideKick', kc];
}
// 一串打出去的招从哪来（算收益用，2.10.1 Jack：反打、贴脸最高，主动进攻降一降）：中立起手 neutral ×WC_NEUTRAL_MUL、拍开 / 耕开以后 counter ×WC_COUNTER_MUL、搭手里 touch ×WC_TOUCH_MUL
const SRC_MUL = { neutral: WC_NEUTRAL_MUL, counter: WC_COUNTER_MUL, touch: WC_TOUCH_MUL };
// 第一下打中的时候定这一串从哪来（搭手里、拍开以后按的在起招时就记了；拍开以后收完招再按的、打在失衡 / 踉跄 / 起身硬直里的也算反打）
function chainMul(A, B, m) {
  if (m.src === undefined) m.src = A.chain[0] === 'pc' || B.state === 'rise' || (B.state === 'hit' && ((B.reel && B.reelBy === A.idx && B.reelKind !== 'knee') || B.stagger)) ? 'counter' : 'neutral';
  if (m.dmgMul === undefined) m.dmgMul = SRC_MUL[m.src];
}
// 一串里的招打中以后他的硬直（引擎 applyHit 问 stunOf）：按拍子算 —— 起手那一下、顺 ≥ 2：正好接得上下一拍（多 WC_MARGIN）；
// 第 2 下（顺 1）、没翻手的直冲：比拍子短 WC_GAP —— 一直按着挡的人第 3 下挡得住（Jack：只有两三招的时候对面有机会）。
// 2.10.1：踢（link）也一样 —— 第 2 下是踢，第 3 下也挡得住；起手的踢（正撑脚、截脚）自己的硬直更长就用自己的
function wcStun(A, B, m, n, dflt) {
  const d = m.def;
  if (!(d.beat || d.link) || d.ender) return dflt;
  const I = wcBeat(Math.min(FLOW_MAX, A.flow + (m.noFlowUp ? 0 : 1)));
  if (A.flow >= 2) return I + WC_MARGIN;
  if (A.flow === 0 && (d.open || m.chainStart)) return d.link ? Math.max(dflt, I + WC_MARGIN) : I + WC_MARGIN;
  return Math.max(2, I - WC_GAP);
}
// 一串里的下一下排在拍子上（拳接拳、拳接踢、踢接拳、踢接踢都一样）：在拍点前 WC_EARLY 帧到后 WC_LATE 帧按 = 在拍子上
// （按早的等到拍点出，按晚的出手快一点补上）；更早 = 抢拍（晚 WC_EARLY_LAG 帧出、顺不涨）；
// 更晚 = 过拍（顺清零，等这一下收完，缓冲里的键变回起手的冲拳 / 正撑脚 —— 慢）
// 拍点：这一下的时间 m.t 走到这里按，下一下的判定正好落在拍子上（wcRhythm 和电脑都用这个算）
function nextOf(F, m, kk) {
  const ci = (m.ci || 0) + 1;
  if (kk === 'kick') { const [n, kc] = kickNext(m, ci); return { name: n, ci, kc }; }
  return { name: beatNext(chainHand(m), ci), ci, kc: 0 };
}
function wcBeatAt(F, m, kk) {
  const next = nextOf(F, m, kk || 'jab');
  return m.S + 1 + wcBeat(F.flow) - F.moves[next.name].S - 1;
}
function wcRhythm(F, m, kk) {
  if (m.qn) return false;                                   // 下一下已经排上了：多按的不算
  const next = nextOf(F, m, kk), Sn = F.moves[next.name].S;
  const P = wcBeatAt(F, m, kk);
  const t = m.t;
  if (t < P - WC_EARLY) { m.qn = next.name; m.qt = P + WC_EARLY_LAG; m.qb = 0; m.qci = next.ci; m.qk = kk; m.qkc = next.kc; beatTag(F, '抢拍'); cev('beat', F, F.opp, { kind: 'early', key: kk }); return false; }
  if (t <= P) { m.qn = next.name; m.qt = P; m.qb = 1; m.qci = next.ci; m.qk = kk; m.qkc = next.kc; return false; }
  if (t <= P + WC_LATE) return wcFire(F, m, next.name, next.ci, 1, Math.max(1, Sn - (t - P)), kk, next.kc);
  if (!m.late) { m.late = true; F.flow = 0; beatTag(F, '过拍'); cev('beat', F, F.opp, { kind: 'late', key: kk }); }
  return null;                                              // 过拍：这一下留在缓冲里，收完招变成起手的招
}
function wcFire(F, m, name, ci, onBeat, S, kind, kc) {
  if (m.def.flow && !m.hit) F.flow = 0;                     // 这一下打空了、被挡了：顺断了（照样能按着拍子接着打）
  const hand = chainHand(m), src = m.src;
  if (!F.beginMove(name, kind || 'jab', S !== undefined ? { S } : null)) return false;
  const nm = F.move; nm.ci = ci; nm.kc = kc || 0; nm.hand = hand; nm.src = src; if (!onBeat) nm.noFlowUp = true;
  return true;
}
function beatTag(F, text) { if (!game.quiet && F.J) tag(F.J.head[0] + F.facing * 18, F.J.head[1] - 30, text, F, 15); }

/* ============================================================
   按键语法
   ============================================================ */
// 站着出招（引擎 startAttack 问 variant；也给电脑、测试猜「按这个键出什么」）
function wcVariant(kind, chain, air, mod, F) {
  if (air) return mod === 'down' && kind === 'kick' ? 'dive' : { jab: 'airJab', heavy: 'airHeavy', kick: 'airKick' }[kind] || null;
  if (mod === 'down') return { jab: 'wLowPalm', heavy: 'wJum', kick: 'wLowKick', grab: 'lowGrab' }[kind] || null;
  if (chain[chain.length - 1] === 'pc') return { jab: 'wJabR', heavy: 'wCun', kick: 'wKick', grab: 'grab' }[kind] || null;   // 拍开、耕开以后：后手冲拳（一手拍一手打）
  if (F && F.move && F.move.name === 'slip' && kind === 'kick') return 'wTurnKick';           // 转马以后按踢 = 转马撑
  const dc = F ? wcDirVs(F, F.opp, true) : 0;
  if (kind === 'jab') return dc === 1 || mod === 'run' ? 'wBiu' : 'wJab';
  if (kind === 'heavy') return dc === 1 || mod === 'run' ? 'wPai' : dc === 2 ? 'wGwai' : 'wCun';
  if (kind === 'kick') return 'wKick';
  return kind === 'grab' ? 'grab' : null;
}
// 出招中按这个键现在接得上吗（电脑、测试问；真按下去走 wcInput → wcPress，两边一个规矩）
function wcCanCancel(F, kind) {
  const m = F.move;
  if (!m || m.air || m.def.script || m.def.noCancel || m.tumbled) return false;
  const d = m.def, after = m.t + DT - 1 - m.S, conf = m.hit || m.blocked || m.absorbed, win = after >= 1 && after < d.A + 13;
  if ((d.beat || d.link) && (kind === 'jab' || kind === 'kick')) return true;   // 一串里拳、踢随时能按（按不准就是抢拍、过拍）
  if (!conf || !win) return false;
  if (d.beat || d.link) return kind === 'heavy' || (kind === 'grab' && m.hit);
  if (d.kind === 'heavy') return kind === 'jab' || kind === 'kick';
  return false;
}
// 出招中按了键：null = 不管（留在缓冲里），false = 收下了（排上了 / 不算），true = 换了一招
function wcPress(F, m, kk) {
  const d = m.def;
  if (m.air || d.script || d.noCancel || m.tumbled) return null;
  if ((d.beat || d.link) && (kk === 'jab' || kk === 'kick')) return wcRhythm(F, m, kk);
  if (!wcCanCancel(F, kk)) return null;
  const ci = (m.ci || 0) + 1;
  if (kk === 'heavy') return wcChain(F, m, 'wCunEnd', 'heavy', 7, 0);
  if (kk === 'grab') return wcChain(F, m, 'grab', 'grab', ci, 0);
  if (kk === 'kick') { const [n, kc] = kickNext(m, ci); return wcChain(F, m, n, 'kick', ci, kc); }
  return wcChain(F, m, beatNext(chainHand(m), ci), 'jab', ci, 0);
}
// 不看拍子接的（寸拳收势、拉手、寸拳以后接拳踢）：记着是一串里的第几下、哪只手、从哪来
function wcChain(F, m, name, kind, ci, kc) {
  const hand = m ? chainHand(m) : 'bh', src = m ? m.src : undefined;
  if (!F.beginMove(name, kind)) return false;
  F.move.ci = ci; F.move.kc = kc; F.move.hand = hand; F.move.src = src; F.move.chainStart = 1;
  return true;
}
// 寸拳按住 = 蓄劲：前摇走到六成停住（拳收在胸口），最多 WC_CHARGE 帧；蓄的时候、松开以后都没有霸体。松开越蓄越疼，蓄满 = 寸劲破体
function wcCharge(F, m, locked) {
  if (m.charged) return;
  if (!m.charging) {
    if (!locked && F.inp.held.heavy && m.t >= m.S * WC_CHARGE_AT && m.t < m.S) { m.charging = true; m.q = 0; m.armorLeft = 0; }
    return;
  }
  if (!locked && F.inp.held.heavy && m.q < WC_CHARGE) {
    m.q += DT; m.hold = true;
    if (!game.quiet && F.J && Math.round(m.q * 4) % 12 === 0) burst(F.J.bh[0], F.J.bh[1], -F.facing, 3, 14, 2, pal(F).qi);   // 劲往拳上收（只是画面）
    return;
  }
  m.charging = false; m.charged = true;
  const q = m.q / WC_CHARGE;
  m.dmgMul = 1 + 0.6 * q;
  if (q >= 1) { m.pierce = true; m.launch = 4.5; m.stamp = '寸劲破体'; }
}
// 引擎在出招中（'attack'）、拍开以后（'parry'）先问这里；true = 这一步这里管了
function wcInput(F, where, locked) {
  if (where === 'parry') {
    if (locked) return false;
    const k = F.takePress(['jab', 'heavy', 'kick', 'grab']);
    if (!k) return false;
    F.facing = F.opp.x >= F.x ? 1 : -1; F.chain = ['pc'];
    if (!F.beginMove({ jab: 'wJabR', heavy: 'wCun', kick: 'wKick', grab: 'grab' }[k], k)) return false;
    F.move.ci = 0; F.move.chainStart = 1; F.move.src = 'counter';
    return true;
  }
  if (where !== 'attack') return false;
  const m = F.move, d = m.def, k = m.t + DT - 1;
  if (d.tch) return touchStep(F, m, k, locked);
  if (d.lap) return lapStep(F, m, k);
  if (m.name === 'tLat') return latStep(F, m, locked);
  if (d.charge) wcCharge(F, m, locked);
  if (m.qn && m.t >= m.qt) return wcFire(F, m, m.qn, m.qci, m.qb, undefined, m.qk, m.qkc);
  if (!locked) {
    const kk = F.takePress(['jab', 'heavy', 'kick', 'grab'], true);
    if (kk) { const r = wcPress(F, m, kk); if (r !== null) { F.takePress([kk]); return r; } }
  }
  return false;
}

/* ============================================================
   挡：拍手（刚按下挡那几帧）、黐手（按住）、耕手（蹲着）；挨打时：黐手破连
   ============================================================ */
const W_SHAPES = ['', 'tan', 'bong', 'fook'];                       // 方向码 → 手型
const SHAPE_NAME = { tan: '摊', bong: '膀', fook: '伏' };
const SHAPE_BEATS = { bong: 'tan', tan: 'fook', fook: 'bong' };     // 膀克摊、摊克伏、伏克膀（咏春打咏春）
const BEATEN_BY = { tan: 'bong', fook: 'tan', bong: 'fook' };       // 克这个手型的是哪个（电脑被黏住时摆）
const COUNTER_SHAPE = { lead: 'tan', rear: 'bong', leg: 'fook' };    // 黏住的是他哪只手脚 → 翻成哪个手型是「破」
const TOUCH_STRIKE = { '': 'tChung', tan: 'tTan', bong: 'tBong', fook: 'tFook' };
// 他这一招是哪只手脚：前手（摊）/ 后手（膀）/ 腿和下段（伏、耕）
function limbClass(d) {
  if (d.height === 'low' || d.limb === 'ff' || d.limb === 'bf') return 'leg';
  return d.limb === 'fh' || d.limb === 'fe' ? 'lead' : 'rear';
}
const handLimb = d => /^(fh|bh|fe|be|sh)$/.test(d.limb) && d.height !== 'low';
// 黏得住吗：地上的拳、掌、肘、肩、腿；空中的招、坠山、大招、推挡、擒拿黏不住。breaking（黐手破连）：顺 ≥ 3 的连环冲拳太快，黏不住
function stickable(A, m, d, breaking) {
  if (m.air || A.airborne || d.script || d.push || d.dive || d.flurry || d.tier === 'super') return false;
  if (d.kind !== 'jab' && d.kind !== 'heavy' && d.kind !== 'kick') return false;
  return !(breaking && d.beat && A.flow >= 3);
}
// 引擎 applyHit：B（咏春）被打到的那一刻先问这里。true = 管了；数 = 这一下的伤害倍数（读错了）；false = 照常
function wcDefend(A, B, c, I) {
  const m = I.m, d = I.d;
  if (!I.front) return false;
  if (B.state === 'hit') {
    // 黐手破连：挨打的硬直里按住挡 + 方向，他的下一下打过来 —— 前手的招按前（摊）、后手的招按后（膀）、腿和下段按蹲（耕）
    if (B.airborne || B.grabbed || B.stuck || B.stagger || B.reel || B.clashed || B.carried || !B.inp.held.block) return false;
    const want = wcDirVs(B, A, false);
    if (!want || !stickable(A, m, d, true)) return false;
    const lc = limbClass(d), need = lc === 'lead' ? 1 : lc === 'rear' ? 2 : 3;
    if (want !== need) { if (!game.quiet) tag(B.x, B.J.head[1] - 40, '读错', A, 18); return WC_WRONG_MUL; }
    m.done = true; m.blocked = true; A.flow = 0;
    touchStart(B, A, { from: 'break', limb: lc, flow: FLOW_COUNTER, shape: W_SHAPES[want] });
    B.stats.parries++;
    stamp(B.J.head[0] - B.facing * 52, B.J.head[1] - 46, '黐手破连', 28, B);
    B.info = { label: '黐手破连', dmg: 0, how: '黏住', why: '他连招的时候按对了方向：手搭上去，进搭手', adv: null, t: B.clock };
    cev('touch', B, A, { from: 'break' });
    return true;
  }
  if (!B.isBlocking()) return false;
  // 拍手 / 耕手：刚按下挡的那几帧（两次按挡要隔 PARRY_LOCK 帧，和卸力一样防乱按）
  if (B.parryReady()) {
    if (!B.lowBlock && handCovers('pat', d, m)) { handParry(A, B, c, 'pat'); return true; }
    if (B.lowBlock && handCovers('gaun', d, m)) { handParry(A, B, c, 'gaun'); return true; }
  }
  if (!B.blockHeightOK(d.height)) return false;              // 站着挡不住下段、蹲着挡不住上段：打中
  if (stickable(A, m, d, false)) {
    // 黐手黏住：只吃三成，我不进挡住的硬直，直接进搭手。手型对上了（前手的招对摊、后手的招对膀、腿和下段对耕）一进去就顺 1
    const lc = limbClass(d), sh = W_SHAPES[wcDirVs(B, A, false)] || '';
    const chip = Math.max(1, Math.round(d.dmg * BLOCK_KEEP));
    B.hp = Math.max(1, B.hp - chip); B.stats.blocks++; B.gainQi(chip * QI_PER_HP + 2); A.gainQi(1);
    m.done = true; m.blocked = true; A.flow = 0;
    note(A, B, chip, '被黏住'); A.info.why = '他在黐手：手上的招、腿被黏住，进了搭手';
    touchStart(B, A, { from: 'stick', limb: lc, flow: sh && sh === COUNTER_SHAPE[lc] ? 1 : 0, shape: sh });
    if (!game.quiet) tag(B.x, B.J.head[1] - 22, [['黏 ', B], ['-' + chip, A]], B, 17);
    cev('touch', B, A, { from: 'stick' });
    return true;
  }
  guard(A, B, c);                                            // 空中的招、大招、推挡：照常挡住
  return true;
}
// 引擎 applyHit：A（咏春）打中 B 的那一刻。标指正好插在他出手的那只胳膊上 = 把手挑开，进搭手
function wcStrike(A, B, c, I) {
  const d = I.d, bm = I.bm;
  if (d.flow && (d.beat || d.link)) chainMul(A, B, I.m);     // 一串里的招：按从哪来算收益（中立起手打折）
  if (!d.biu || !bm || bm.air || bm.def.script || !handLimb(bm.def) || (bm.def.kind !== 'jab' && bm.def.kind !== 'heavy') || bm.def.tier === 'super') return false;
  if (bm.t >= bm.S + bm.def.A + 1) return false;            // 他已经收招了：照常打中
  I.m.done = true; I.m.hit = true;
  biuOpen(A, B, bm.def);
  return true;
}
// 两边的招同时打到：标指撞上他手上的招也是挑开
function wcClash(A, B) {
  for (const [X, Y] of [[A, B], [B, A]]) {
    const xm = X.move, ym = Y.move;
    if (styleOf(X) !== STYLES.wc || !xm || !xm.def.biu || !ym || ym.air || ym.def.script || !handLimb(ym.def) || (ym.def.kind !== 'jab' && ym.def.kind !== 'heavy') || ym.def.tier === 'super') continue;
    xm.done = true; xm.hit = true; ym.done = true;
    biuOpen(X, Y, ym.def);
    return true;
  }
  return false;
}
function biuOpen(A, B, bd) {
  touchStart(A, B, { from: 'biu', limb: limbClass(bd), flow: FLOW_COUNTER });
  A.stats.specials++;
  stamp(A.J.head[0] - A.facing * 52, A.J.head[1] - 46, '标指', 28, A);
  A.info = { label: '标指', dmg: 0, how: '挑开', why: '标指插在他出手的胳膊上：把手挑开，进搭手', adv: null, t: A.clock };
  cev('touch', A, B, { from: 'biu' });
}
// 引擎 doGrab：咏春抓到人 —— 都进搭手
function wcGrab(A, B, type) {
  const bd = B.state === 'attack' && B.move ? B.move.def : null;
  if (type === 'scoop') {                                    // 截腿截住地上的腿：把腿截开，他失衡，你先打
    handParry(B, A, contactPoint(B, A), 'gaun');
    if (!game.quiet) tag(B.x, B.J.head[1] - 50, '截腿', A, 22);
    return true;
  }
  A.move.done = true; A.move.hit = true;
  if (type === 'trap') {                                     // 拉手反击：拉住他打过来的手 —— 扣着手腕进搭手（挣不脱），顺 2
    B.hp -= WC_TRAP_DMG; A.stats.hits++; A.stats.specials++;
    A.gainQi(WC_TRAP_DMG * 0.4 * QI_PER_HP + 4); B.gainQi(WC_TRAP_DMG * 0.9 * QI_PER_HP);
    touchStart(A, B, { from: 'trap', limb: bd ? limbClass(bd) : 'lead', flow: FLOW_COUNTER, lap: true });
    noteGrab(A, WC_TRAP_DMG, '拉手'); A.info.why = '他出' + (bd ? bd.label : '招') + '的时候拉住了他的手：扣着手腕进搭手';
    stamp(A.J.head[0] - A.facing * 52, A.J.head[1] - 46, '拉手', 28, A);
    cev('touch', A, B, { from: 'trap' });
    if (B.hp <= 0) { B.hp = 0; B.stuck = false; B.knockDown(4, A.facing * 3, 999, true); }
    return true;
  }
  if (type === 'grab' || type === 'tackle') {               // 扣住站着、挡着、硬直里、蹲着的人的手腕：进搭手（刚扣住那几帧他按拿挣得脱）
    const flow = B.state === 'hit' ? A.flow : 0;
    touchStart(A, B, { from: 'hold', limb: type === 'tackle' ? 'leg' : 'lead', flow, lap: true, lapEsc: true });
    if (!game.quiet) tag(B.x, B.J.head[1] - 26, '扣住', A, 20);
    cev('touch', A, B, { from: 'hold' });
    return true;
  }
  return false;
}

/* ============================================================
   搭手：手搭上了。我（先手）手型一步一拍地翻、从手型里打出去；他（被黏住）甩手、反拿、硬撑
   我的搭手是一招 'tch'（时间不走，touchStep 每一步管）；他是 'hit' + stuck（打得中、动不了，引擎当他在硬直里）。
   所有状态都是数、字、真假（m.shape、m.rollT……），联机回滚存档一层浅拷贝就够
   ============================================================ */
function touchStart(L, F, o) {
  const dir = F.x >= L.x ? 1 : -1;
  F.move = null; F.state = 'hit'; F.stuck = true; F.stunT = 40; F.reel = false; F.clashed = false; F.stagger = false; F.grabbed = false; F.carried = false;
  F.chain = []; F.chainIdle = 99; F.runT = 0; F.comboLive = false; F.flow = 0; F.kvx = 0; F.vx = 0; F.hurtHeavy = false; F.lowBlock = false; F.gwalk = 0;
  F.facing = -dir;
  L.stunT = 0; L.reel = false; L.clashed = false; L.stagger = false; L.grabbed = false; L.stuck = false; L.lowBlock = false; L.gwalk = 0; L.runT = 0; L.kvx = 0;
  L.facing = dir;
  L.startScript('tch');
  const m = L.move;
  m.from = o.from; m.limb = o.limb || 'lead'; m.shape = o.shape || ''; m.rollTo = ''; m.rollFrom = ''; m.rollT = 0; m.rolls = 0; m.brk = false;
  m.win = WC_TOUCH_OPEN; m.age = 0; m.dead = false; m.held = wcDir(L);
  m.fprev = !!(F.inp.held.block && F.inp.held[L.x >= F.x ? 'left' : 'right']);   // 他黏上的时候已经按着挡 + 后：松开再按才算甩手
  m.lap = !!o.lap; m.lapEsc = !!o.lapEsc; m.lapT = 0;
  L.flow = Math.min(FLOW_MAX, o.flow || 0);
  L.chain = ['pc']; L.chainIdle = 0;
  game.freeze = Math.max(game.freeze, stop(4));
  if (!game.quiet) {
    const mx = (L.x + F.x) / 2, my = L.J ? L.J.sh[1] + 6 : FLOOR - 100;
    sparks(mx, my, dir, 6, 5, pal(L).fx, 1.2, 0.2); arcMid(mx, my, 18, dir > 0 ? 0 : Math.PI, 2.4, 3, pal(L).qi, 12);
    tag(mx, my - 40, '黐', L, 30);
  }
  Sound.block();
}
// 搭手里的一步（我是先手那一方）
function touchStep(L, m, k, locked) {
  const F = L.opp;
  if (locked || F.state !== 'hit' || !F.stuck) { touchEnd(L, F, null); return true; }
  m.age += DT;
  F.stunT = Math.max(F.stunT, 4); F.kvx = 0; L.kvx = 0;
  F.x = clamp(F.x + (L.x + L.facing * WC_TOUCH_GAP - F.x) * PULL_K, WALL_L, WALL_R);
  // 刚扣住手腕那几帧他按拿挣得脱（和传统格斗的擒住一样，提前几帧按的也算）；甩手、反拿要等手搭稳了（WC_TOUCH_GRACE）
  if (m.lap && m.lapEsc && m.age < HOLD_ESC + 1 && F.takePress(['grab'])) { F.stuck = false; escapeGrab(L, F); return true; }
  if (!m.dead && m.age >= WC_TOUCH_GRACE + 1 && touchFollower(L, m, F)) return true;
  if (m.rollT > 0) { m.rollT = Math.max(0, m.rollT - DT); if (m.rollT === 0) { m.shape = m.rollTo; m.win = WC_STEP; } }
  if (m.lapT > 0) { m.lapT = Math.max(0, m.lapT - DT); if (m.lapT === 0) { m.lap = true; m.win = WC_STEP + 2; } }
  if (m.rollT <= WC_ROLL_PRE && m.lapT <= 0 && touchLeader(L, m, F)) return true;
  if (m.rollT <= 0 && m.lapT <= 0) {
    m.win -= DT;
    if (m.win <= 0) { if (m.lap) lapFire(L, F, 'tButterfly'); else touchEnd(L, F, 'time'); return true; }
  }
  return false;
}
function touchLeader(L, m, F) {
  const dc = wcDir(L), edge = dc && dc !== m.held; m.held = dc;
  const key = L.takePress(['jab', 'heavy', 'kick', 'grab']);
  if (m.lap) {                                               // 扣着手腕：拳 = 拉打、重 = 拉手批肘、踢 = 拉手撑脚、蹲 / 拿 = 拉手跪马
    if (key === 'jab') return lapFire(L, F, 'tLapDa');
    if (key === 'heavy') return lapFire(L, F, 'tLapPai');
    if (key === 'kick') return lapFire(L, F, 'tLapKick');
    if (key === 'grab' || (edge && dc === 3)) return lapFire(L, F, 'tDrag');
    return false;
  }
  if (m.rollT > 0 && (key || edge)) { m.shape = m.rollTo; }   // 上一下快翻完了就按了：从翻完的手型接着来
  const cur = m.rollT > 0 ? m.rollTo : m.shape;
  if (key === 'jab') return touchStrike(L, m, F, cur);
  if (key === 'heavy') return touchFire(L, F, 'tPai', 'heavy');
  if (key === 'kick') return touchFire(L, F, 'tKick', 'kick');
  if (key === 'grab') { m.lapT = WC_LAP; m.rollT = 0; m.shape = cur; touchCue(L, '拉', L); Sound.whoosh(0.3); cev('lap', L, F, {}); return false; }
  if (!edge) return false;
  const to = W_SHAPES[dc];
  if (to === cur || m.rolls >= WC_ROLL_MAX) return touchMess(L, F);   // 翻成一样的手型、翻太多：乱了
  m.rollFrom = cur; m.rollTo = to; m.rollT = WC_ROLL + m.rollT; m.rolls++;
  const brk = m.rolls === 1 && to === COUNTER_SHAPE[m.limb];   // 第一下就翻成克他那只手的手型 = 破
  L.flow = Math.min(FLOW_MAX, L.flow + (brk ? 2 : 1)); if (brk) m.brk = true;
  touchCue(L, SHAPE_NAME[to] + (brk ? ' 破' : ''), L);
  cev('roll', L, F, { shape: to, brk });
  Sound.whoosh(0.22);
  return false;
}
// 他（被黏住的那一方）能按的：甩手（后 + 挡）、反拿（拿）
function touchFollower(L, m, F) {
  if (m.lap) return false;                                   // 扣着手腕：挣脱只在刚扣住那几帧（touchStep），过了就什么都做不了
  const away = L.x >= F.x ? 'left' : 'right';
  const sh = !!(F.inp.held.block && F.inp.held[away]), edge = sh && !m.fprev;
  m.fprev = sh;
  if (edge) { touchShake(L, F); return true; }
  if (F.takePress(['grab'])) {
    if (m.rollT > 0) { touchCounterGrab(L, F); return true; }   // 在我翻手的那一拍里抓：抽手反抓
    m.dead = true; touchCue(F, '黏死', F); cev('dead', F, L, {});   // 我没在翻手：抓不到，这一次搭手里他什么都按不了了
  }
  return false;
}
function touchStrike(L, m, F, shape) {
  // 咏春打咏春：他摆的手型克我出拳的手型 = 被他化开，先手换给他（没翻手的直冲化不了）
  const ST = styleOf(F), fs = shape && ST.touchShape ? ST.touchShape(F) : '';
  if (fs && SHAPE_BEATS[fs] === shape) return touchFlip(L, F, fs);
  return touchFire(L, F, TOUCH_STRIKE[shape], 'jab');
}
function touchFire(L, F, name, kind) {
  F.stunT = Math.max(F.stunT, L.moves[name].S + 4);          // 打到他之前他还被黏着
  if (!L.beginMove(name, kind)) return false;
  L.move.ci = 0; L.move.src = 'touch';
  return true;
}
function touchFlip(L, F, fs) {
  touchCue(F, '化', F); cev('flip', F, L, { shape: fs });
  touchStart(F, L, { from: 'flip', limb: 'rear', flow: 1, shape: fs });
  return true;
}
function touchMess(L, F) {
  if (styleOf(F).touchShape) return touchFlip(L, F, '');    // 咏春打咏春：先手换给他
  F.stuck = false; F.stunT = 2;
  L.startScript('tMess'); L.flow = 0;
  touchCue(L, '乱', F); cev('mess', L, F, {});
  return true;
}
function touchShake(L, F) {
  // 他把手甩开、往后撤半步：两边分开；我有 WC_LAT_WIN 帧按拳 = 甩手直冲（来留去送）
  const dir = L.facing;
  F.stuck = false; F.state = 'hit'; F.stunT = WC_LAT_WIN + 4; F.shook = true; F.kvx = dir * 3.2; F.clashed = false; F.reel = false;
  L.startScript('tLat'); L.move.latT = WC_LAT_WIN; L.flow = Math.max(0, L.flow - 1);
  touchCue(F, '甩手', F);
  F.info = { label: '甩手', dmg: 0, how: '甩开', why: '把黏住的手甩开了（他按拳就是甩手直冲）', adv: null, t: F.clock };
  cev('shake', F, L, {});
  Sound.whoosh(0.5);
}
function latStep(L, m, locked) {
  if (m.latT > 0) {
    m.latT = Math.max(0, m.latT - DT);
    if (!locked && L.takePress(['jab'])) { L.beginMove('tLatChung', 'jab'); L.move.ci = 0; L.move.chainStart = 1; L.move.src = 'counter'; return true; }
  }
  return false;
}
function touchCounterGrab(L, F) {
  // 反拿（擒拿克黐手）：在我翻手的那一拍里抽手反抓 —— 照他那一派的擒住接下去
  F.stuck = false; F.stunT = 0; F.state = 'idle'; F.move = null; F.chain = [];
  L.move = null; L.state = 'idle';
  if (!F.beginMove('grab', 'grab')) { touchEnd(L, F, null); return; }
  touchCue(F, '反拿', F); cev('counterGrab', F, L, {});
  doGrab(F, L, 'grab');
}
function touchEnd(L, F, why) {
  if (F.stuck) { F.stuck = false; F.stunT = Math.min(F.stunT, why === 'time' ? 4 : 2); }
  if (L.move && L.move.def.tch) L.startScript('tSep');
  if (why === 'time') { F.kvx = L.facing * 2.5; L.kvx = -L.facing * 2.5; touchCue(L, '脱手', L); cev('touchEnd', L, F, { why }); }
}
function touchCue(F, text, own) {
  if (game.quiet || !F.J) return;
  tag(F.J.head[0] + F.facing * 26, F.J.sh[1] - 18, text, own, text.length > 2 ? 18 : 24);
}

/* ---------- 扣着手腕的那几下（拉打、拉手批肘、拉手撑脚、拉手跪马、蝴蝶掌）：他一直被黏着，到点了打在他身上 ---------- */
function lapFire(L, F, name) {
  F.stuck = true; F.stunT = Math.max(F.stunT, 60);
  L.startScript(name);
  return true;
}
function lapStep(L, m, k) {
  const F = L.opp, d = m.def;
  if (!F.stuck || F.state !== 'hit') return false;
  F.stunT = Math.max(F.stunT, d.R - k + 2); F.kvx = 0;
  if (d.lap !== 'drag') F.x = clamp(F.x + (L.x + L.facing * WC_TOUCH_GAP - F.x) * PULL_K, WALL_L, WALL_R);
  if (d.lap === 'da' && (k === d.evHit || k === d.evHit2)) lapPunch(L, F, k === d.evHit2, d.R - k);
  else if (d.lap === 'pai' && k === d.evHit) lapElbow(L, F);
  else if (d.lap === 'kick' && k === d.evHit) lapKick(L, F, d.R - k);
  else if (d.lap === 'push' && k === d.evPush) lapPush(L, F, d.R - k);
  else if (d.lap === 'drag') { if (k >= 0 && k <= d.evSlam) dragStep(L, F, k / d.evSlam); if (k === d.evSlam) dragSlam(L, F); }
  return false;
}
function lapFx(L, F, kind, big) {
  if (game.quiet) return;
  const c = { x: F.x - L.facing * 12, y: F.J ? F.J.sh[1] + 8 : FLOOR - 100 };
  hitFx(kind, c, L, F);
  game.freeze = Math.max(game.freeze, stop(big ? 7 : 3)); if (big) game.shake = Math.max(game.shake, 6);
}
function lapPunch(L, F, last, left) {
  grabDamage(L, F, last ? 5 : 4, '拉打', last);
  L.flow = Math.min(FLOW_MAX, L.flow + 1);
  lapFx(L, F, 'jab2', last);
  if (last) { F.stuck = false; F.stunT = left + 4; F.kvx = L.facing * 4; F.hurtHeavy = true; if (!game.quiet) stamp(L.J.head[0] - L.facing * 52, L.J.head[1] - 46, '拉打', 26, L); }
  if (F.hp <= 0) { F.hp = 0; F.stuck = false; F.knockDown(4, L.facing * 3, 999, true); }
}
function lapElbow(L, F) {
  grabDamage(L, F, 13, '拉手批肘', true);
  F.stuck = false; F.knockDown(4, L.facing * 3, TFH(26), F.hp <= 0); if (F.hp <= 0) F.hp = 0;
  lapFx(L, F, 'hammer', true);
  if (!game.quiet) { dust(F.x, FLOOR, 8, true); stamp(L.J.head[0] - L.facing * 52, L.J.head[1] - 46, '拉手批肘', 28, L); }
  Sound.hit(0.95);
}
function lapKick(L, F, left) {
  grabDamage(L, F, 7, '拉手撑脚', true);
  F.stuck = false; F.state = 'hit'; F.stunT = left + 10; F.kvx = L.facing * 6.5; F.hurtHeavy = true;
  lapFx(L, F, 'kick', false);
  if (!game.quiet) stamp(L.J.head[0] - L.facing * 52, L.J.head[1] - 46, '拉手撑脚', 26, L);
  if (F.hp <= 0) { F.hp = 0; F.knockDown(4, L.facing * 3, 999, true); }
}
function lapPush(L, F, left) {
  grabDamage(L, F, 5, '蝴蝶掌', false);
  F.stuck = false; F.stunT = left + 4; F.kvx = L.facing * 8; F.hurtHeavy = false;
  lapFx(L, F, 'shove', false);
  if (!game.quiet) tag(F.x, F.J.head[1] - 34, '蝴蝶掌', L, 20);
  if (F.hp <= 0) { F.hp = 0; F.knockDown(4, L.facing * 3, 999, true); }
}
// 拉手跪马：我退一大步、往回往下拽，他上身往前栽、脚还在原地，脸朝下扑倒在我面前，那只手还被我扣着往前伸 ——
// [进度, x（按我现在的位置、朝向，正 = 我身前）, 往前栽多少度（只是画面）]。他一直踩着地（不离地：最低的那一点贴着地面，像一棵树往前倒）
const DRAG_PATH = [[0, WC_TOUCH_GAP, 0], [0.3, 62, 18], [0.6, 70, 50], [0.82, 76, 70], [1, 80, 78]];
function dragStep(L, F, u) {
  if (!F.carried) { F.carried = true; F.kvx = 0; F.vz = 0; F.vx = 0; F.alt = 0; }
  F.carryPose = u < 0.55 ? 'dragged' : 'draggedLow';
  const K = DRAG_PATH; let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
  const t = clamp((u - K[i][0]) / (K[i + 1][0] - K[i][0]), 0, 1), lerp1 = j => K[i][j] + (K[i + 1][j] - K[i][j]) * t;
  F.x = clamp(L.x + L.facing * lerp1(1), WALL_L, WALL_R); F.carryRot = lerp1(2);
}
function dragSlam(L, F) {
  F.carried = false; F.stuck = false;
  grabDamage(L, F, 12, '拉手跪马', true);
  F.knockDown(-1, L.facing * 0.4, TFH(34), F.hp <= 0); F.prone = true; F.slam = true; if (F.hp <= 0) F.hp = 0;
  game.freeze = Math.max(game.freeze, stop(8)); game.shake = Math.max(game.shake, 7);
  if (!game.quiet) { dust(F.x, FLOOR, 10, true); stamp(L.J.head[0] - L.facing * 52, L.J.head[1] - 46, '拉手跪马', 28, L); }
  Sound.hit(0.9);
}
// 咏春被黏住的时候（咏春打咏春）：按着的方向就是他的手型
const wcTouchShape = F => W_SHAPES[wcDir(F)] || '';

/* ============================================================
   画：黐手的手型、搭手、被黏住（引擎 target 先问这里；null = 照通用的画）
   ============================================================ */
const W_CHI_BASE = { hy: 68, tor: 2, head: 4, dx: -1, ff: [26, 0], bf: [-32, 0] };
const W_TCH_BASE = { hy: 68, tor: 5, head: 3, dx: 2, ff: [28, 0], bf: [-32, 0] };
const WCHI = {}, WTCH = {};
for (const s of W_SHAPES) {
  WCHI[s] = wmk(WJ(W_CHI_BASE, W_SHAPE[s]));
  const sh = W_SHAPE[s];
  WTCH[s] = wmk(WJ(W_TCH_BASE, WJ(sh, { fh: [sh.fh[0] + (s === 'bong' ? 2 : 6), sh.fh[1] + 1] })));   // 搭上了：前手再往前伸一点（膀手伸直了就不是膀了）
}
const WTCH_LAP = wmk(WJ(W_TCH_BASE, { tor: 2, dx: -2, tw: 18, fh: [36, 6], fp: 0, fe: 1, bh: [24, 8], bpa: -50, be: 1 }));   // 扣着手腕往回带
const WPAT = wmk(W_PAT);
// 动作台（poses.html）、教程小图也看得到这些手型：黐手 chi*、搭手 tch*、扣着手腕 tchLap、拍手 pat
const W_SHAPE_KEY = { '': '', tan: 'Tan', bong: 'Bong', fook: 'Fook' };
for (const s of W_SHAPES) { WPOSE['chi' + W_SHAPE_KEY[s]] = WCHI[s]; WPOSE['tch' + W_SHAPE_KEY[s]] = WTCH[s]; }
WPOSE.tchLap = WTCH_LAP; WPOSE.pat = WPAT;
const WROLL = W_ROLL.map(o => wmk(WJ(W_CHI_BASE, o))), WROLL_T = 10;   // 盘手：四步一圈，一步 10 帧
const WGUARD_BACK = wmk(WJ(W_CHI_BASE, W_GUARD_BACK));
W_ROLL.forEach((o, i) => { WPOSE['roll' + i] = WROLL[i]; });   // 动作台、教程小图：盘手的四步
function wcTarget(F, t) {
  const st = F.state, ck = F.clock;
  if (st === 'block') {
    if (F.lowBlock) return copyPose(t, WPOSE.cblock);
    if (ck - F.blockPress < 9 && F.parryOK) return copyPose(t, WPAT);          // 刚按下挡：拍手
    const dc = wcDir(F);
    if (dc === 1) copyPose(t, WCHI.tan);                                        // 按着前：摊手往前压
    else if (dc === 2) copyPose(t, WGUARD_BACK);                                // 按着后：收回来护着，慢慢退
    else {
      const p = (ck % (WROLL_T * 4)) / WROLL_T, i = Math.floor(p);               // 盘手：一里一外换位（照参考图）
      lerpPose(WROLL[i], WROLL[(i + 1) % 4], EASE.io(clamp((p - i) * 1.5 - 0.25, 0, 1)), t, false);
    }
    if (F.gwalk) {                                                              // 按着挡走：脚下小碎步（和传统格斗的边挡边走一样）
      const ph = F.walkPhase * TAU, s = Math.sin(ph), c = Math.cos(ph);
      t.ff[0] += 9 * s; t.ff[1] = Math.max(0, 6 * c); t.bf[0] -= 9 * s; t.bf[1] = Math.max(0, -6 * c);
    }
    return t;
  }
  if (st === 'attack' && F.move && F.move.def.tch) {
    const m = F.move;
    if (m.rollT > 0) return lerpPose(WTCH[m.rollFrom], WTCH[m.rollTo], EASE.io(clamp(1 - m.rollT / WC_ROLL, 0, 1)), t, false);
    if (m.lapT > 0) return lerpPose(WTCH[m.shape], WTCH_LAP, EASE.io(clamp(1 - m.lapT / WC_LAP, 0, 1)), t, false);
    return copyPose(t, m.lap ? WTCH_LAP : WTCH[m.shape]);
  }
  if (st === 'hit' && F.stuck && !F.carried) { copyPose(t, WTCH[wcTouchShape(F)]); t.dx -= 3; t.tor -= 2; return t; }   // 咏春被黏住：手还搭着，摆着自己的手型
  return null;
}
// 搭手的提示（画在镜头里，只是画面）：先手那一方手边一圈墨线（转完就该按了），翻成什么手型写一个字
function wcDrawCue(c2d, F, V) {
  const m = F.move;
  if (F.state !== 'attack' || !m || !m.def.tch || !V || !V.J) return;
  const J = V.J, x = (J.fh[0] + J.bh[0]) / 2 + F.facing * 10, y = Math.min(J.fh[1], J.bh[1]) - 26, P = pal(F);
  const full = m.rollT > 0 ? WC_ROLL : m.lapT > 0 ? WC_LAP : m.age < WC_TOUCH_OPEN + 1 && !m.rolls ? WC_TOUCH_OPEN : WC_STEP;
  const left = m.rollT > 0 ? m.rollT : m.lapT > 0 ? m.lapT : m.win, k = clamp(left / full, 0, 1);
  c2d.save();
  c2d.lineCap = 'round';
  c2d.strokeStyle = rgbaOf(P.qi, 0.25); c2d.lineWidth = 2.4; c2d.beginPath(); c2d.arc(x, y, 13, 0, TAU); c2d.stroke();
  c2d.strokeStyle = rgbaOf(m.rollT > 0 || m.lapT > 0 ? P.qi : F.color, 0.9); c2d.lineWidth = 3;
  c2d.beginPath(); c2d.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + TAU * (m.rollT > 0 || m.lapT > 0 ? 1 - k : k)); c2d.stroke();
  const ch = m.lap || m.lapT > 0 ? '拉' : SHAPE_NAME[m.rollT > 0 ? m.rollTo : m.shape] || '黐';
  c2d.fillStyle = F.color; c2d.font = `17px ${BRUSH}`; c2d.textAlign = 'center'; c2d.textBaseline = 'middle';
  c2d.fillText(ch, x, y + 1);
  c2d.restore();
}

/* ============================================================
   交手、跨派、挂进拳派表
   ============================================================ */
// 交手（两边同时打中）：主系、起手照两派共用的那一套（拳 > 腿 > 重 > 拳）；另外截脚专截地上的出腿
function wcRules(a, b) {
  const groundKick = d => d.tier === 'kick' && !d.air && !d.stopKick;
  if (a.stopKick && groundKick(b)) return 1;
  if (b.stopKick && groundKick(a)) return -1;
  return 0;
}
function wcRelation(a, b) { return wcRules(a, b) || relation(a, b); }
// 动作台（poses.html）、测试量「打中时拳脚碰没碰到」用的：分组、要量的招
const W_BENCH_GROUPS = [
  ['拳', ['wJab', 'wJabR', 'wJabF', 'wPalmF', 'wPalmR', 'wCunEnd', 'wBiu', 'wLowPalm', 'shove']],
  ['重', ['wCun', 'wPai', 'wGwai', 'wJum', 'slipElbow', 'super']],
  ['踢', ['wKick', 'wLowKick', 'wSideKick', 'wKick2', 'wStompKnee', 'wTurnKick', 'stomp']],
  ['搭手', ['tChung', 'tTan', 'tBong', 'tFook', 'tPai', 'tKick', 'tLapDa', 'tLapPai', 'tLapKick', 'tDrag', 'tButterfly', 'tLatChung', 'tMess', 'tSep']],
  ['跳起来', ['airJab', 'airHeavy', 'airKick', 'dive']],
  ['拿', ['grab', 'lowGrab']],
  ['身法', ['dash', 'slip', 'burst']],
];
STYLES.wc = {
  id: 'wc', name: '咏春拳', moves: WMOVES, relation: wcRelation, cancel: {}, variant: wcVariant, poses: WPOSE, base: WBASE,
  chainMax: 8, blockHeavy: null, blockWalk: WC_WALK, parry: false,
  input: wcInput, canCancel: wcCanCancel, defend: wcDefend, strike: wcStrike, clash: wcClash, grab: wcGrab, stunOf: wcStun,
  target: wcTarget, drawCue: wcDrawCue, touchShape: wcTouchShape,
  benchGroups: W_BENCH_GROUPS, benchHit: ['wJab', 'wJabR', 'wJabF', 'wPalmF', 'wPalmR', 'wCunEnd', 'wBiu', 'wLowPalm', 'shove', 'wCun', 'wPai', 'wGwai', 'wJum',
    'slipElbow', 'super', 'wKick', 'wLowKick', 'wSideKick', 'wKick2', 'wStompKnee', 'wTurnKick', 'stomp', 'airJab', 'airHeavy', 'airKick', 'dive'],
};
/* 跨派：传统格斗 × 咏春拳（relation(传统的招, 咏春的招)：1 传统赢 / -1 咏春赢 / ±0.5 压 / 0 平）。
   两派的招按同一套系别比；多出来的是咏春的截脚截地上的腿。标指挑开、黐手黏住这些在 wcClash / wcDefend 里，不走这张表 */
MATCHUPS['trad|wc'] = { relation(dT, dW) { return wcRules(dT, dW) || relation(dT, dW); } };
