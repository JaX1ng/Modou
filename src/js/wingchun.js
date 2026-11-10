'use strict';
/* ============================================================
   咏春拳（2.10 重做；2.9 叫「迎春拳」，那一版只是换了动作的格斗术）—— 设计稿在 WINGCHUN.md，改玩法先改那里。
   和格斗术不一样的是按键语法，不只是招：
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
  fp: 1, bp: 1, fpa: -34, bpa: -84, fpr: 0.85, bpr: 1, fw: 0, bw: 0, fz: 0, fs: 0.25, bs: 0, fhk: 0, bhk: 0, fv: 1, bv: 1,
  fh: [47.3, -2.8], bh: [31, 8], ff: [28, 0], bf: [-32, 0] };
const wmk = o => mk(o, WBASE);
function WM(o) { o.pb = WBASE; o.style = 'wc'; return M(o); }
const WJ = (base, o) => Object.assign({}, base, o);

/* ---------- 2.10.2 日字冲拳（照 ref/wc_chung_seq_1 ～ 6.jpg 那六格；Jack：一拳打出去就是这个顺序，两只手轮流这么打）
   打出去那条胳膊（Jack：大臂往下、小臂平着直着、拳头往上翘一点 —— 胳膊不是完全伸直的，手腕往上弯一点点）：
     大臂从肩往前下斜 W_UA 度、肘尖朝下，小臂往上扬 W_FA 度，到头也留一点弯；拳头绕手腕往上翘 W_COCK 度（pose.js fw / bw）
   身子（Jack：出拳的时候身子不用往前伸很多，一点点就够了，像打桩一样稳住）：一串里 tor / dx / hy 都不变，不跟着拳一冲一冲，
     比架势只往前一点点；拳的远近靠拧腰送肩（tw）和胳膊，两拳之间只有肩膀跟着左右换
   2.10.3（Jack：动作再圆一点 —— 拳头收回来的时候，在肩膀内侧画一个小圆再出去）：收回来的那只拳一圈一圈地走 ——
     从打出去那条胳膊底下抽回胸口（第 6 格）→ 在肩膀内侧往后、往上绕一个小圆 W_LOOP → 转到上面张开成竖掌，贴在那条胳膊的肘弯上（第 4 格）
     → 下一拳从这条小臂上面滚出去（第 5 格：两条小臂一上一下擦着交错，肩膀正好转到正中）→ 打到头。两只手一前一后差一拍，各绕各的圈
   2.10.3（Jack：第一拳只是把问手的掌变成拳，要换一只手出）：起手那一拳是后手 —— 护手收成拳，从问手的小臂上面打出去，问手从底下收回来绕圈 ---------- */
const W_LINE = -1;                                              // 搭手里直冲这些后手拳的高度（和肩一样高）
const W_UA = 12, W_FA = 14, W_COCK = 32;
const W_TOR = 3, W_DX = 5, W_HY = 69, W_TWF = 34, W_TWR = -34;   // 一串里身子的样子；出前手、后手时拧腰多少（正 = 前手那边的肩往前）
// 拳心（掌是掌根）离出拳那边的肩膀多远 [往前, 往下]：大臂往前下斜 ua 度、小臂往上扬 fa 度
const wArm = (ua, fa) => [BODY.bone.ua * Math.cos(ua * D2R) + BODY.bone.fa * Math.cos(fa * D2R), BODY.bone.ua * Math.sin(ua * D2R) - BODY.bone.fa * Math.sin(fa * D2R)];
const W_ARM = wArm(W_UA, W_FA), W_ARM_PALM = wArm(8, 8);        // 推掌胳膊伸得直一点
// 换成姿势的坐标（相对两肩中间）：side 1 前手、-1 后手，tw 这一下拧腰多少，at 相对这只手的肩膀
const wFrom = (side, tw, at) => { const s = side * BODY.shoulderW * Math.sin(tw * D2R), t = W_TOR * D2R; return [+(s * Math.cos(t) + at[0]).toFixed(2), +(s * Math.sin(t) + at[1]).toFixed(2)]; };
const W_BODY = { tor: W_TOR, head: 2, hy: W_HY, dx: W_DX, ff: [29, 0], bf: [-31, 0] };
// 收回来的那只拳绕的小圆（肩膀内侧、胸口前面；从下面往后、往上绕）：底下 → 后下 → 最后面 → 后上 → 上面；转到上面再往前贴到肘弯上张开成竖掌
const W_LOOP = [[18, 10], [13, 7.5], [11, 3.5], [12.5, -0.5], [16.5, -1.6]];   // 3.1 圈底再低 2（收着的拳要在打出去那条胳膊的肘底下；手按手指搭以后拳心高了一点）
const W_GUARD_PALM = [23, -0.5];                                // 圈转到上面、张开成竖掌贴在打出去那条胳膊的肘弯上（第 4 格）
const W_UNDER = [40, 7], W_OVER = [33, -3];                     // 换手（第 5 格）：收回去的那条在下面、还在前面；打出去的那只在上面
// 一只手的样子：h 'f' 前手 / 'b' 后手，at 拳心（掌是掌根）在哪；palm 掌（pa 手指朝哪、pr 掌心朝哪）；cock 拳头往上翘多少
// 2.13 掌都是四指并拢的竖掌（贴在肘弯上的护手、立掌；参考图 ref/wc_chung_seq_4.jpg）：s 0
const wHand = (h, at, palm, cock, pa, pr) => ({ [h + 'h']: at, [h + 'p']: palm ? 1 : 0, [h + 'w']: palm ? 0 : cock || 0, [h + 'pa']: pa === undefined ? -84 : pa, [h + 'pr']: pr === undefined ? 1 : pr, [h + 'e']: 1, [h + 's']: 0 });
const wSide = h => h === 'f' ? 1 : -1, wOther = h => h === 'f' ? 'b' : 'f';
// 打到头：h 那只手打出去（palm：立掌，胳膊直一点、肩多送 6°），另一只手 g 在 gAt（拳或者掌）
function wStrike(h, palm, gAt, gPalm) {
  const tw = wSide(h) * (W_TWF + (palm ? 6 : 0));
  return Object.assign({}, W_BODY, { tw }, wHand(h, wFrom(wSide(h), tw, palm ? W_ARM_PALM : W_ARM), palm, W_COCK, -76, 0.35), wHand(wOther(h), gAt, gPalm));
}
// 一串里一拳的关键帧（h 出拳那只手）：起手时 h 是贴在肘弯上的竖掌、另一只手 g 打在外面（上一拳）；
// 0.45 换手：h 从上面滚出去、g 从底下抽回；1 打到头（g 到圈底下）；1 ~ 2 判定那几帧里 g 绕小圆、转到上面张开成竖掌；收完招回到架势
function wChainKeys(h, palm, first) {
  const g = wOther(h), keys = [];
  keys.push([0, first || Object.assign(wStrike(g, false, W_GUARD_PALM, true), wHand(h, W_GUARD_PALM, true))]);
  keys.push([0.45, first ? Object.assign({}, W_BODY, { dx: 2.5, tw: 0 }, wHand(h, [35, -3], palm, palm ? 0 : 8, -62, 0.6), wHand(g, [42, 6], false, 4))
    : Object.assign({}, W_BODY, { tw: 0 }, wHand(h, W_OVER, palm, palm ? 0 : 8, -62, 0.6), wHand(g, W_UNDER, false, 4))]);
  keys.push([1, wStrike(h, palm, W_LOOP[0], false), 'back']);
  for (let i = 1; i < W_LOOP.length; i++) keys.push([1 + i * 0.2, wStrike(h, palm, W_LOOP[i], false), 'lin']);
  keys.push([2, wStrike(h, palm, W_GUARD_PALM, true), 'lin']);
  keys.push([3, {}]);
  return keys;
}
// 别的招拿来用的片段：前手 / 后手冲拳到头（另一只手在圈底下），…4：另一只手张开成竖掌贴在肘弯上
const W_PF = wStrike('f', false, W_LOOP[0], false), W_PR = wStrike('b', false, W_LOOP[0], false);
const W_PF4 = wStrike('f', false, W_GUARD_PALM, true), W_PR4 = wStrike('b', false, W_GUARD_PALM, true);
const W_LOW = { hy: 52, tor: 18, head: -4, tw: 20, ff: [28, 0], bf: [-26, 0], fh: [34, -2], bh: [18, 4] };   // 蹲着：两只掌还竖着护在前面

/* ---------- 黐手、搭手的手型（前手；后手护着）—— 2.10.1 照参考图：两只手都在胸口到肩这一段、肘尖都朝下（膀手也不抬肘）
   摊：掌心朝上、小臂往前托；膀：小臂横在中线上、掌心朝外朝下；伏：掌心朝下压
   2.12（Jack：缠绕是 z 轴上的事，别像蛇一样上下扭，必要时加一点阴影）：四个手型的前手一样高（往下 9），翻手只在里 / 外上走 ——
   fz 正 = 前手到外面（近侧，画在后手前面）、负 = 到里面（远侧，淡一点）：摊、伏在外面，膀转到里面；翻手过零那一下两条小臂交叉、淡色换边 */
const W_SHAPE = {
  '': { fh: [44, 9], fpa: -36, fpr: 1, fe: 1, bh: [24, 12], bpa: -46, bpr: 1, be: 1, tw: 10, fz: 0, fs: 0.25, bs: 0 },                 // 问手（没翻）
  tan: { fh: [50, 9], fpa: -8, fpr: 0.3, fe: 1, bh: [26, 11], bpa: -46, bpr: 1, be: 1, tw: 16, fz: 1, fs: 0.45, bs: 0 },             // 摊（在外面；掌心朝上、手指松开一点）
  bong: { fh: [46, 9], fpa: 36, fpr: -0.35, fe: 1, bh: [22, 9], bpa: -46, bpr: 1, be: 1, tw: 12, fz: -1, fs: 0.2, bs: 0 },           // 膀（转到里面；肘沉着、掌心翻朝外下）
  fook: { fh: [48, 9], fpa: 28, fpr: 0.7, fe: 1, bh: [26, 9], bpa: -46, bpr: 1, be: 1, tw: 14, fz: 1, fs: 0.15, bs: 0 },              // 伏（在外面，压着）
};
/* ---------- 2.11 挡重做（WINGCHUN.md 十五）：按住挡 = 听劲（Jack：长按挡的时候手臂不动，只是往后收一点 —— 不再一直翻盘手）；
   按住挡再按 拳 / 重 / 拿 = 接招，五个桩法照 ref/wc_guard_1 ～ 5.png ---------- */
const W_TING = { fh: [40, -1], fpa: -40, fpr: 0.85, fe: 1, bh: [26, 8], bpa: -84, bpr: 1, be: 1, tw: 16, fs: 0.25, bs: 0 };                       // 听劲：问手、护手往胸前收一点
const W_TING_LOW = { hy: 52, tor: 16, head: 4, tw: 12, ff: [26, 0], bf: [-25, 0], fh: [36, 6], fpa: -30, fpr: 0.85, fe: 1, bh: [22, 2], bpa: -84, bpr: 1, be: 1, fs: 0.25, bs: 0 };   // 蹲着听劲
const W_CATCH = {
  // 拍手（图 2，按拳接他前手的拳）：前手竖掌往前一拍、拍在他胳膊上往里带，后手竖掌跟在后面护着
  pat: { tor: 4, dx: 4, hy: 68, tw: 26, fh: [52, 2], fpa: -84, fpr: 0.25, fe: 1, bh: [36, 4], bpa: -86, bpr: 0.95, be: 1, ff: [27, 0], bf: [-32, 0], fs: 0.55, bs: 0 },   // 2.13 拍出去的手张开（图 2），护手并拢
  // 摊手（图 1，按拳接他后手的拳）：前手往前上方摊出去、手张开把拳托开，后手竖掌护在前手肘弯上
  tan: { tor: 2, dx: 3, hy: 68, tw: 24, fh: [45, -16], fpa: -48, fpr: 0.1, fe: 1, bh: [30, 3], bpa: -86, bpr: 1, be: 1, ff: [27, 0], bf: [-32, 0], fs: 0.6, bs: 0 },     // 2.13 摊出去的手张开（图 1）
  // 膀手转马（图 4，按重接重拳）：脚跟一拧转马、侧过身，前手膀手 —— 肘在前、小臂往下垂着把劲往外带；后手在上面拦着
  bong: { spin: 26, tor: 6, dx: 0, hy: 66, tw: 4, fh: [30, 30], fpa: 78, fpr: 0.5, fe: -1, bh: [46, -9], bpa: -64, bpr: 0.5, be: 1, ff: [24, 0], bf: [-34, 0], fs: 0.15, bs: 0 },   // 2.13 垂下去的手手指松着（图 4）
  // 按手（图 5，站着按拿接中段、上段的腿）：下面一只手往前下方把腿按下去（掌心朝下），上面一只手竖掌拦着
  gum: { tor: 8, dx: 4, hy: 67, tw: 12, fh: [48, 24], fpa: 22, fpr: -0.3, fe: 1, bh: [44, -15], bpa: -76, bpr: 0.8, be: 1, ff: [27, 0], bf: [-32, 0], fs: 0.25, bs: 0 },   // 2.13 上面拦着的竖掌并拢（图 5）
  // 耕手（图 3，蹲着按拿接地上的腿）：一只手往下往外耕开，一只手竖掌护在脸前
  gaun: { hy: 52, tor: 18, head: 2, tw: 6, fh: [34, 40], fpa: 74, fpr: 0.4, fe: 1, bh: [22, -16], bpa: -86, bpr: 1, be: 1, ff: [27, 0], bf: [-26, 0], fs: 0.1, bs: 0 },     // 2.13 耕下去的手四指并拢（图 3）
};
const CATCH_NAME = { pat: '拍手', tan: '摊手', bong: '膀手', gum: '按手', gaun: '耕手' };
const W_TING_K = WJ({ hy: 68, tor: 2, head: 4, dx: -1, ff: [26, 0], bf: [-32, 0] }, W_TING);   // 站着听劲（整个人）

const WMOVES = {
  /* ---- 拳：连环冲拳（beat：按拍子接，见下面「拍子」）。flow：打中了顺加一级 ---- */
  // 冲拳（起手）：2.10.3（Jack：第一拳只是把问手的掌变成拳，要换一只手出）—— 后手出：护手收成拳，从问手的小臂上面打出去，
  // 问手从底下收回来、在肩膀内侧绕一个小圆，转到上面张开成竖掌贴在后手的肘弯上。身子从架势往前一点点（dx 0 → W_DX），收完招回到架势
  wJab: WM({ kind: 'jab', label: '冲拳', open: true, beat: true, flow: true, S: 3, A: 3, R: 7, dmg: 5, reach: 84, stun: 8, bstun: 6, kb: 1.4, stop: 2, power: .3,
    limb: 'bh', fx: 'jab', lunge: [1, 3, 6],
    keys: wChainKeys('b', false, {}) }),
  // 连下去（第 4 → 5 → 6 格，两只手轮流）：贴在肘弯上的那只手收成拳、从这条小臂上面滚出去，这条从底下抽回胸口、绕一个小圆；
  // 到头以后（判定那几帧）它转到上面张开成竖掌，贴到打出去那条胳膊的肘弯上，等下一拳。身子一直不动
  wJabR: WM({ kind: 'jab', label: '冲拳', beat: true, flow: true, S: 3, A: 3, R: 6, dmg: 5, reach: 86, stun: 6, bstun: 6, kb: 1.2, stop: 2, power: .3,
    limb: 'bh', fx: 'rush', lunge: [1, 3, 7],
    keys: wChainKeys('b', false) }),
  wJabF: WM({ kind: 'jab', label: '冲拳', beat: true, flow: true, S: 3, A: 3, R: 6, dmg: 5, reach: 86, stun: 6, bstun: 6, kb: 1.2, stop: 2, power: .3,
    limb: 'fh', fx: 'rush', lunge: [1, 3, 10],
    keys: wChainKeys('f', false) }),
  // 立掌（每三下的第三下）：走同一条路推出去，到头是竖掌、掌根往前（侧面看是掌边，掌心微微朝里）；推掌胳膊伸得直一点、肩送得多一点
  wPalmF: WM({ kind: 'jab', label: '立掌', beat: true, flow: true, S: 3, A: 3, R: 6, dmg: 5, reach: 86, stun: 6, bstun: 6, kb: 1.3, stop: 2, power: .35,
    limb: 'fh', fx: 'rush', lunge: [1, 3, 7],
    keys: wChainKeys('f', true) }),
  wPalmR: WM({ kind: 'jab', label: '立掌', beat: true, flow: true, S: 3, A: 3, R: 6, dmg: 5, reach: 86, stun: 6, bstun: 6, kb: 1.3, stop: 2, power: .35,
    limb: 'bh', fx: 'rush', lunge: [1, 3, 7],
    keys: wChainKeys('b', true) }),
  // 寸拳（收势：连环拳第 8 下、连环拳里按重）：身子往下一沉、拳贴着胸口，一寸一寸地炸出去 —— 霸体吃不住，打倒。
  // 2.10.2（Jack：出拳身子稳住）：收势也是沉下去、送肩炸出去，身子只往前一点（以前前倾 14°、往前冲 18）
  // 2.10.3 两只手轮流到底：轮到哪只手就哪只手收势（上一拳前手 → 后手寸拳 wCunEnd；上一拳后手 → 前手寸拳 wCunEndF）
  wCunEnd: WM({ kind: 'jab', label: '寸拳', stamp: '寸拳', beat: true, flow: true, pierce: true, S: 4, A: 3, R: 12, dmg: 10, reach: 88, stun: 14, bstun: 10, kb: 6, stop: 9, shake: 7, power: 1,
    limb: 'bh', fx: 'rushEnd', ghost: true, lunge: [1, 4, 10], launch: 4.5, ender: true, noCancel: true,
    keys: [[0, W_PF4], [0.6, { tor: 3, dx: 4, hy: 65, tw: 8, bh: [20, 6], bp: 0, fh: [34, -2], fpa: -82, ff: [29, 0], bf: [-31, 0] }],
      [1, { tor: 7, dx: 10, hy: 64, head: 0, tw: -42, bh: [58, -2], bp: 0, bw: 20, fh: [26, 1], fpa: -86, ff: [36, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 7, dx: 10, hy: 64, head: 0, tw: -42, bh: [58, -2], bp: 0, bw: 20, fh: [26, 1], fpa: -86, ff: [36, 0], bf: [-30, 0] }], [3, {}]] }),
  wCunEndF: WM({ kind: 'jab', label: '寸拳', stamp: '寸拳', beat: true, flow: true, pierce: true, S: 4, A: 3, R: 12, dmg: 10, reach: 88, stun: 14, bstun: 10, kb: 6, stop: 9, shake: 7, power: 1,
    limb: 'fh', fx: 'rushEnd', ghost: true, lunge: [1, 4, 10], launch: 4.5, ender: true, noCancel: true,
    keys: [[0, W_PR4], [0.6, { tor: 3, dx: 4, hy: 65, tw: -8, fh: [20, 6], fp: 0, bh: [34, -2], bpa: -82, ff: [29, 0], bf: [-31, 0] }],
      [1, { tor: 7, dx: 10, hy: 64, head: 0, tw: 42, fh: [58, -2], fp: 0, fw: 20, bh: [26, 1], bpa: -86, ff: [36, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 7, dx: 10, hy: 64, head: 0, tw: 42, fh: [58, -2], fp: 0, fw: 20, bh: [26, 1], bpa: -86, ff: [36, 0], bf: [-30, 0] }], [3, {}]] }),
  // 标指（前 + 拳）：前手四指并拢往前一插，射程长、伤害低；正好插在他出手的那只胳膊上 = 把手挑开，进搭手（biu）
  wBiu: WM({ kind: 'jab', label: '标指', open: true, beat: true, flow: true, biu: true, S: 4, A: 3, R: 9, dmg: 3, reach: 100, stun: 8, bstun: 6, kb: 1.2, stop: 2, power: .3,
    limb: 'fh', fx: 'jab', lunge: [1, 4, 10],
    keys: [[0, {}], [0.5, { fh: [36, -8], fpa: -40, fpr: 0.6, tw: 22 }],
      [1, { tor: 10, dx: 12, hy: 67, tw: 40, fh: [62, -7], fpa: -2, fpr: 0.15, fs: 0, bh: [24, -3], ff: [36, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 10, dx: 12, hy: 67, tw: 40, fh: [62, -7], fpa: -2, fpr: 0.15, fs: 0, bh: [24, -3], ff: [36, 0], bf: [-30, 0] }], [3, {}]] }),
  // 低掌（蹲 + 拳）：蹲下去一掌推在小腹底下（下段，要蹲着挡）
  wLowPalm: WM({ kind: 'jab', label: '低掌', open: true, beat: true, flow: true, height: 'low', S: 4, A: 3, R: 8, dmg: 4, reach: 84, stun: 8, bstun: 6, kb: 1.6, stop: 2, power: .3,
    limb: 'fh', fx: 'low', lunge: [1, 4, 6],
    keys: [[0, W_LOW], [0.5, WJ(W_LOW, { fh: [30, 10], fpa: -50 })], [1, WJ(W_LOW, { tor: 24, dx: 8, hy: 50, tw: 28, fh: [50, 24], fpa: -40, fpr: 0.5, fs: 0.1, bh: [22, 2] }), 'back'],
      [2, WJ(W_LOW, { tor: 24, dx: 8, hy: 50, tw: 28, fh: [50, 24], fpa: -40, fpr: 0.5, fs: 0.1, bh: [22, 2] })], [3, W_LOW]] }),

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
      [1, { tor: 10, dx: 10, hy: 67, tw: 38, fh: [53, -4], fpa: 6, fpr: 0.5, fs: 0.5, bh: [24, -2], ff: [34, 0], bf: [-28, 0] }, 'out'],
      [2, { tor: 10, dx: 10, hy: 67, tw: 38, fh: [53, -4], fpa: 6, fpr: 0.5, fs: 0.5, bh: [24, -2], ff: [34, 0], bf: [-28, 0] }], [3, {}]] }),
  // 截腿（蹲 + 拿）：蹲下去两手往前下方一截 —— 截住地上的出腿（他失衡，你先打）；抓住蹲着的人进搭手；站着的抓不到
  lowGrab: WM({ kind: 'grab', label: '截腿', low: true, height: 'low', open: true, S: 6, A: 4, R: 15, dmg: 0, reach: 86, power: .5,
    limb: 'fh', lunge: [1, 6, 12],
    keys: [[0, W_LOW], [0.5, WJ(W_LOW, { hy: 46, tor: 22, fh: [26, 10], bh: [16, 14] })],
      [1, { hy: 42, tor: 36, dx: 18, head: -10, fh: [56, 38], fpa: 30, fs: 0.45, bh: [48, 42], bpa: 40, bs: 0.45, ff: [44, 0], bf: [-34, 0], tw: 10 }, 'out'],
      [2, { hy: 42, tor: 36, dx: 18, head: -10, fh: [56, 38], fpa: 30, fs: 0.45, bh: [48, 42], bpa: 40, bs: 0.45, ff: [44, 0], bf: [-34, 0], tw: 10 }], [3, W_LOW]] }),

  /* ---- 跳起来（上段：蹲着挡不住；飞撑脚能蹲下躲） ---- */
  airJab: WM({ kind: 'jab', label: '飞身冲拳', tier: 'air', lead: 'light', height: 'high', open: true, S: 3, A: 10, R: 5, dmg: 5, reach: 94, vreach: AIR_VREACH, stun: 15, bstun: 9, kb: 2.4, stop: 5, power: .45,
    limb: 'fh', fx: 'airSwing', air: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.55, J_(JT, { rot: 2, tor: 4, fh: [22, -4], fp: 0, bh: [20, 6], tw: 20 })],
      [1, { rot: 18, tor: 24, head: -6, dx: 6, fh: [56, 12], fp: 0, bh: [24, 6], ff: [16, 42], bf: [-28, 28], tw: 30 }, 'back'],
      [2, { rot: 20, tor: 26, head: -6, dx: 6, fh: [54, 15], fp: 0, bh: [24, 6], ff: [16, 42], bf: [-28, 28], tw: 30 }], [3, JD]] }),
  // 3.1 飞身盖肘（Jack：三派跳起来按重长得太像 —— 都是整个人往前翻着砸）：咏春不翻身 —— 人在空中立着、两膝收起来护住中线，
  // 后手的肘先抬过头（拳收在耳边），再以肩为轴往前下方盖下去，肘尖领着、拳留在脸边，打在他锁骨、脸上（标指里的盖肘 kop jarn），前手竖掌护在胸前
  airHeavy: WM({ kind: 'heavy', label: '飞身盖肘', stamp: '盖肘', tier: 'air', lead: 'heavy', height: 'high', open: true, S: 7, A: 9, R: 8, dmg: 9, reach: 100, vreach: AIR_VREACH, stun: 18, bstun: 11, kb: 4.5, stop: 8, shake: 5, power: .9, heavy: true,
    limb: 'be', fx: 'chop', air: true, reelHit: true,   // 4.0 盖肘压住他的手：打中他失衡一下（落地好接）
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })],
      [0.7, { rot: -4, tor: -8, head: -2, fh: [24, 4], fp: 1, fpa: -80, fpr: 0.2, bh: [-2, -18], bp: 0, be: 1, ff: [20, 58], bf: [-2, 48], tw: -36 }],
      [1, { rot: 8, tor: 12, head: 0, dx: 30, fh: [22, 18], fp: 1, fpa: -70, fpr: 0.2, bh: [20, -10], bp: 0, be: 1, ff: [24, 50], bf: [4, 44], tw: 60 }, 'out'],
      [2, { rot: 10, tor: 16, head: 0, dx: 30, fh: [22, 20], fp: 1, fpa: -70, fpr: 0.2, bh: [20, -6], bp: 0, be: 1, ff: [24, 48], bf: [2, 42], tw: 62 }], [3, J_(JD, { fp: 1, bp: 1 })]] }),
  airKick: WM({ kind: 'kick', label: '飞撑脚', stamp: '飞撑脚', tier: 'air', lead: 'kick', height: 'high', open: true, S: 6, A: 10, R: 8, dmg: 8, reach: 110, vreach: AIR_VREACH, stun: 17, bstun: 10, kb: 10, stop: 7, shake: 4, power: .85,
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

  /* ---- 2.11 接招（按住挡再按键；WINGCHUN.md 十五）：script，自己不打人 —— 按下去以后第 WC_CATCH_ON 帧起，
     WC_CATCH_WIN（拳）/ WC_CATCH_WIN_H（重、拿）帧里打过来的招按对了键 = 接住（wcDefend 管：手上的招进搭手、腿失衡）；
     后面一小会儿是收手，这时候挨打、或者按错了键挨打 = 这一下 ×WC_WRONG_MUL ---- */
  cPat: WM({ kind: 'script', label: '拍手', S: 0, A: 0, R: 13, script: true, catchKey: 'jab',
    keys: [[0, W_TING_K], [0.14, W_CATCH.pat, 'out'], [0.55, W_CATCH.pat], [1, {}]] }),
  cBong: WM({ kind: 'script', label: '膀手转马', S: 0, A: 0, R: 14, script: true, catchKey: 'heavy',
    keys: [[0, W_TING_K], [0.15, W_CATCH.bong, 'out'], [0.58, W_CATCH.bong], [1, {}]] }),
  cGum: WM({ kind: 'script', label: '按手', S: 0, A: 0, R: 14, script: true, catchKey: 'grab',
    keys: [[0, W_TING_K], [0.15, W_CATCH.gum, 'out'], [0.58, W_CATCH.gum], [1, {}]] }),
  cGaun: WM({ kind: 'script', label: '耕手', S: 0, A: 0, R: 14, script: true, catchKey: 'grab', catchLow: true, height: 'low',
    keys: [[0, W_TING_LOW], [0.15, W_CATCH.gaun, 'out'], [0.58, W_CATCH.gaun], [1, W_LOW]] }),

  /* ---- 防守反击、身法 ---- */
  // 截打（2.10 是挡 + 拳）：2.11 起挡 + 拳是拍手接招，这一招用不上了（引擎按名字要每一派都有一份 shove，留着）
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
  dash: WM({ kind: 'script', label: '追形', S: 0, A: 0, R: 11, script: true, lunge: [0, 7, 66], inv: [0, 4], cancelAt: 3,   // 4.0 追形：碎步，短、快、第 3 帧起就能出手（两下才抵别人一下那么远，无敌也短）
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
      [0.14, { tor: -12, head: -16, hy: 76, fh: [50, -14], fpa: -84, fs: 0.7, bh: [-34, -10], bpa: -100, bs: 0.7, ff: [40, 0], bf: [-42, 0], air: 6, tw: 0 }, 'out'],
      [0.5, { tor: -10, head: -14, hy: 74, fh: [48, -12], fpa: -84, fs: 0.7, bh: [-32, -8], bpa: -100, bs: 0.7, ff: [40, 0], bf: [-42, 0], air: 2, tw: 0 }], [1, {}]] }),
  /* 4.0 连环寸拳（大招，气满按重 + 踢）= 五段连环（Jack：大招可以是一大套连招，考验对面每一段怎么防）：
     第一段中段（站着蹲着都挡得住，起手那几帧打击无敌），打中 / 被挡住都接着出后面四段 —— 每一段上段（标指戳脸：蹲着挡不住）或者下段（低掌按腹：站着挡不住），
     出招的人在上一段里按 拳 = 上、踢 = 下（不按就上下轮着来）；第五段是寸拳，打中打倒。每一段挨了打的硬直、挡住的硬直都比下一段到得早两三帧 ——
     挡的人每一段都能重新挡（挡对高低）、松开再按卸力、冲刺闪开；挡错一段挨一段。全中 12 + 13 × 3 + 22 = 73，被挡住一段只削 WC_SUP_CHIP 成。
     哪一段打空了（他闪开了）这一串就到此为止。段和段之间的那两三帧里他的拳、推挡打不断（霸体吃一下），卸力卸得掉 */
  super: WM({ kind: 'heavy', label: '连环寸拳', stamp: '连环寸拳', tier: 'super', S: 6, A: 3, R: 20, dmg: 12, reach: 92, stun: 12, bstun: 12, kb: 1, stop: 5, shake: 4, power: 1, heavy: true,
    limb: 'fh', fx: 'rush', ghost: true, lunge: [1, 6, 14], sinv: [0, 6], cost: QI_MAX, noCancel: true, antiAir: 40, pierce: true, chip: WC_SUP_CHIP, sup: true,
    keys: [[0, {}], [0.4, { tor: 2, dx: -4, hy: 63, tw: 10, fh: [26, 0], fp: 0, bh: [18, 4], bp: 0, ff: [30, 0], bf: [-34, 0] }, 'out'],
      [1, WJ(W_PF, { dx: 12, hy: 64, fh: [56, -4] }), 'back'], [2, WJ(W_PF, { dx: 12, hy: 64, fh: [56, -4] })], [3, {}]] }),
  // 上段（标指）：手先抬过头顶再戳下来 —— 看得见是上段
  wSupH: WM({ kind: 'heavy', label: '标指', tier: 'super', height: 'high', S: 11, A: 3, R: 16, dmg: 13, reach: 100, stun: 12, bstun: 12, kb: 1, stop: 5, shake: 3, power: .8, heavy: true,
    limb: 'fh', fx: 'jab', ghost: true, lunge: [2, 11, 16], noCancel: true, pierce: true, chip: WC_SUP_CHIP, sup: true, chase: true, armor: { n: 1, from: 0, vs: ['light', 'push'] },
    keys: [[0, {}], [0.55, { tor: -4, dx: -2, hy: 70, tw: -10, fh: [22, -46], fpa: -20, fpr: 0.5, fs: 0, bh: [26, -2], ff: [30, 0], bf: [-32, 0] }, 'out'],
      [1, { tor: 12, dx: 14, hy: 67, tw: 40, fh: [62, -22], fpa: 18, fpr: 0.15, fs: 0, bh: [24, -3], ff: [38, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 12, dx: 14, hy: 67, tw: 40, fh: [62, -22], fpa: 18, fpr: 0.15, fs: 0, bh: [24, -3], ff: [38, 0], bf: [-30, 0] }], [3, {}]] }),
  // 下段（低掌）：身子先沉下去再按出去 —— 看得见是下段
  wSupL: WM({ kind: 'heavy', label: '低掌', tier: 'super', height: 'low', S: 11, A: 3, R: 16, dmg: 13, reach: 96, stun: 12, bstun: 12, kb: 1, stop: 5, shake: 3, power: .8, heavy: true,
    limb: 'fh', fx: 'low', ghost: true, lunge: [2, 11, 16], noCancel: true, pierce: true, chip: WC_SUP_CHIP, sup: true, chase: true, armor: { n: 1, from: 0, vs: ['light', 'push'] },
    keys: [[0, {}], [0.55, WJ(W_LOW, { hy: 46, tor: 30, fh: [22, 14], fpa: -50 }), 'out'],
      [1, WJ(W_LOW, { tor: 24, dx: 10, hy: 48, tw: 28, fh: [52, 26], fpa: -40, fpr: 0.5, fs: 0.1, bh: [22, 2] }), 'back'],
      [2, WJ(W_LOW, { tor: 24, dx: 10, hy: 48, tw: 28, fh: [52, 26], fpa: -40, fpr: 0.5, fs: 0.1, bh: [22, 2] })], [3, {}]] }),
  // 第五段：寸拳收尾（上 / 下各一个），打中打倒
  wSupHE: WM({ kind: 'heavy', label: '寸拳', stamp: '寸拳', tier: 'super', height: 'high', S: 11, A: 3, R: 22, dmg: 22, reach: 100, stun: 20, bstun: 14, kb: 9, stop: 12, shake: 9, power: 1.2, heavy: true,
    limb: 'bh', fx: 'heavy', ghost: true, lunge: [2, 11, 18], noCancel: true, pierce: true, chip: WC_SUP_CHIP, sup: true, chase: true, launch: 6, ender: true, armor: { n: 1, from: 0, vs: ['light', 'push'] },
    keys: [[0, {}], [0.55, { tor: -4, dx: -4, hy: 70, tw: 24, bh: [10, -44], bp: 0, fh: [30, -6], ff: [30, 0], bf: [-34, 0] }, 'out'],
      [1, { tor: 16, dx: 20, hy: 64, head: -2, tw: -40, bh: [60, -20], bp: 0, fh: [28, -3], fpa: -86, ff: [46, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 16, dx: 20, hy: 64, head: -2, tw: -40, bh: [60, -20], bp: 0, fh: [28, -3], fpa: -86, ff: [46, 0], bf: [-30, 0] }], [3, {}]] }),
  wSupLE: WM({ kind: 'heavy', label: '寸拳', stamp: '寸拳', tier: 'super', height: 'low', S: 11, A: 3, R: 22, dmg: 22, reach: 96, stun: 20, bstun: 14, kb: 9, stop: 12, shake: 9, power: 1.2, heavy: true,
    limb: 'bh', fx: 'low', ghost: true, lunge: [2, 11, 18], noCancel: true, pierce: true, chip: WC_SUP_CHIP, sup: true, chase: true, launch: 6, ender: true, armor: { n: 1, from: 0, vs: ['light', 'push'] },
    keys: [[0, {}], [0.55, WJ(W_LOW, { hy: 46, tor: 30, tw: 20, bh: [8, 10], bp: 0 }), 'out'],
      [1, WJ(W_LOW, { tor: 26, dx: 14, hy: 48, tw: -36, bh: [56, 24], bp: 0, fh: [22, 2] }), 'back'],
      [2, WJ(W_LOW, { tor: 26, dx: 14, hy: 48, tw: -36, bh: [56, 24], bp: 0, fh: [22, 2] })], [3, {}]] }),

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
    keys: [[0, { tor: 4, dx: 2, hy: 68, tw: 26, fh: [44, -3], fpa: -14, fpr: 0.2, fs: 0.45, bh: [26, -6] }], [1, { tor: 8, dx: 9, hy: 67, tw: -6, fh: [40, -2], fpa: -6, fpr: 0.2, fs: 0.45, bh: [56, W_LINE], bp: 0 }, 'back'],
      [2, { tor: 8, dx: 9, hy: 67, tw: -6, fh: [40, -2], fpa: -6, fpr: 0.2, fs: 0.45, bh: [56, W_LINE], bp: 0 }], [3, {}]] }),
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
    keys: [[0, { fh: [16, 14], fp: 0, bh: [22, 2], bp: 0, tor: 2, dx: -2, hy: 67, tw: 14 }],
      [0.18, { fh: [10, 16], fp: 0, bh: [54, -4], bp: 0, tor: 8, dx: 6, hy: 67, tw: -24 }, 'out'],
      [0.36, { fh: [12, 16], fp: 0, bh: [26, 0], bp: 0, tor: 4, dx: 2, hy: 67, tw: 0 }],
      [0.56, { fh: [8, 16], fp: 0, bh: [56, -4], bp: 0, tor: 10, dx: 8, hy: 66, tw: -28 }, 'out'],
      [0.75, { fh: [30, -6], bh: [32, 0], bp: 0, tor: 6, dx: 6, hy: 67, tw: 0 }], [1, {}]] }),
  // 重 = 拉手批肘（前手往回一拽，后手肘从上往下劈 —— 打倒）
  tLapPai: WM({ kind: 'script', label: '拉手批肘', stamp: '拉手批肘', S: 0, A: 0, R: 24, script: true, evHit: 8, lap: 'pai',
    keys: [[0, { fh: [16, 14], fp: 0, bh: [22, 2], tor: 2, dx: -2, hy: 67, tw: 14 }],
      [0.2, { fh: [8, 14], fp: 0, bh: [4, -46], bp: 0, be: -1, tor: -6, dx: -4, hy: 70, tw: -10 }],
      [0.36, { fh: [12, 10], fp: 0, bh: [13, -8], bp: 0, be: 1, tor: 24, dx: 10, hy: 63, head: -4, tw: -40 }, 'back'],
      [0.6, { fh: [12, 10], fp: 0, bh: [13, -6], bp: 0, be: 1, tor: 24, dx: 10, hy: 63, head: -4, tw: -40 }], [1, {}]] }),
  // 踢 = 拉手撑脚（前手拽住，前腿一脚撑在他肚子上 —— 把他撑开、失衡）
  tLapKick: WM({ kind: 'script', label: '拉手撑脚', stamp: '拉手撑脚', S: 0, A: 0, R: 18, script: true, evHit: 6, lap: 'kick',
    keys: [[0, { fh: [16, 14], fp: 0, bh: [22, 2], tor: 2, dx: -2, hy: 67, tw: 14 }],
      [0.2, { fh: [14, 12], fp: 0, ff: [24, 40], tor: -2, hy: 71, bf: [-26, 0] }],
      [0.36, { fh: [18, 6], fp: 0, tor: -12, head: 6, dx: 10, hy: 73, tw: 20, ff: [86, 40], ft: 30, bf: [-26, 0] }, 'back'],
      [0.6, { fh: [26, 0], fp: 0, tor: -8, dx: 8, hy: 72, ff: [40, 26], bf: [-26, 0] }], [1, {}]] }),
  // 蹲 / 拿 = 拉手跪马（咏春的摔，不是过肩摔）：扣住手腕往回一拽、退半步沉身跪马，把他的手往下往前带 —— 他往前扑倒、脸朝下趴在你面前
  tDrag: WM({ kind: 'script', label: '拉手跪马', stamp: '拉手跪马', S: 0, A: 0, R: 30, script: true, evSlam: 14, lap: 'drag', lunge: [0, 6, -30],
    keys: [[0, { fh: [16, 14], fp: 0, bh: [22, 2], tor: 2, dx: -2, hy: 67, tw: 14 }],
      [0.22, { fh: [8, 10], fp: 0, bh: [24, -6], tor: -6, dx: -10, hy: 66, tw: 26, ff: [26, 0], bf: [-38, 0] }, 'out'],
      [0.46, { fh: [28, 36], fp: 0, bh: [24, 18], tor: 24, dx: -6, hy: 44, head: 2, tw: 18, ff: [30, 0], bf: [-34, 0] }],
      [0.7, { fh: [30, 40], fp: 0, bh: [26, 22], tor: 26, dx: -6, hy: 44, head: 0, tw: 18, ff: [30, 0], bf: [-34, 0] }], [1, {}]] }),
  // 扣住手腕以后什么都不按：蝴蝶掌（两只掌并排推出去，把人推开）
  tButterfly: WM({ kind: 'script', label: '蝴蝶掌', S: 0, A: 0, R: 16, script: true, evPush: 4, lap: 'push',
    keys: [[0, { fh: [16, 14], fp: 0, bh: [22, 2], tor: 2, dx: -2, hy: 67, tw: 14 }],
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

/* 架势（fighter.js target 用；搭手的手型在 wcTarget 里现画） */
const WPOSE = {
  stance: wmk({ hy: 70 }),                                    // 问手 + 护手
  crouch: wmk(W_LOW),
  block: wmk(W_TING_K),                                       // 2.11 听劲：按住挡，两只手往胸前收一点，不动
  cblock: wmk(W_TING_LOW),                                    // 蹲着听劲
  parry: wmk({ tor: -2, head: 6, dx: -4, hy: 69, tw: 20, fh: [48, 4], fpa: -18, bh: [24, 10] }),             // 拉开以后（截腿截住腿）：前手还往外拨着
  win: wmk({ tor: 0, head: -6, hy: 74, tw: 0, fh: [22, -8], fp: 0, bh: [24, -8], bpa: -90, ff: [20, 0], bf: [-24, 0] }),   // 抱拳
};
// 2.11 接招的五个桩法（动作台、教程小图也看得到：cPat 拍手、cTan 摊手、cBong 膀手转马、cGum 按手、cGaun 耕手）
const WCATCH = {};
for (const k of Object.keys(W_CATCH)) { WCATCH[k] = wmk(W_CATCH[k]); WPOSE['c' + k[0].toUpperCase() + k.slice(1)] = WCATCH[k]; }

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
// 2.10.1（Jack：换手照格斗术的普通攻击那样，连下去就两只手轮流）：一串里夹着踢也算，踢记着上一拳是哪只手（m.hand），踢完接的拳换另一只
function beatNext(prevLimb, ci) {
  const front = prevLimb === 'bh' || prevLimb === 'be', palm = ci % 3 === 2;
  if (ci >= 7) return cunNext(prevLimb);
  return front ? (palm ? 'wPalmF' : 'wJabF') : (palm ? 'wPalmR' : 'wJabR');
}
// 寸拳收势也轮到哪只手就哪只手（2.10.3：起手换成后手以后，第 8 下轮到前手）
const cunNext = prevLimb => prevLimb === 'bh' || prevLimb === 'be' ? 'wCunEndF' : 'wCunEnd';
const chainHand = m => m.def.kind === 'jab' ? m.def.limb : (m.hand || 'fh');     // 这一招以后该换哪只手：拳看自己是哪只手，踢看它记着的（2.10.3 踢起手、没打过拳：下一拳是后手，和起手的冲拳一样）
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
  if (kk === 'heavy') return wcChain(F, m, cunNext(chainHand(m)), 'heavy', 7, 0);
  if (kk === 'grab') return wcChain(F, m, 'grab', 'grab', ci, 0);
  if (kk === 'kick') { const [n, kc] = kickNext(m, ci); return wcChain(F, m, n, 'kick', ci, kc); }
  return wcChain(F, m, beatNext(chainHand(m), ci), 'jab', ci, 0);
}
// 不看拍子接的（寸拳收势、拉手、寸拳以后接拳踢）：记着是一串里的第几下、哪只手、从哪来
function wcChain(F, m, name, kind, ci, kc) {
  const hand = m ? chainHand(m) : 'fh', src = m ? m.src : undefined;
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
// 引擎在站着（'neutral'）、出招中（'attack'）、拍开 / 接住以后（'parry'）先问这里；true = 这一步这里管了
function wcInput(F, where, locked) {
  if (where === 'neutral') {
    // 2.11 按住挡再按 拳 / 重 / 拿 = 接招（拍手 / 膀手转马 / 按手；蹲着按拿 = 耕手）。蹲着按拳、重接不了（下段的手上招接不住）：这一下不算
    const h = F.inp.held;
    if (locked || !h.block) return false;
    const k = F.takePress(CATCH_KEYS, true);
    if (!k) return false;
    F.takePress([k]);
    if (h.down && k !== 'grab') return false;
    catchStart(F, k, !!h.down);
    return true;
  }
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
  if (d.sup) return supStep(F, m, locked);                          // 4.0 大招五段
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

// 4.0 大招五段（连环寸拳）：这一段里按 拳 / 重 = 下一段上段，踢 / 拿 = 下段（不按就上下轮着来）；判定一完、这一段打中或者被挡住了，就接下一段
function supStep(F, m, locked) {
  const d = m.def, n = m.supN || 1;
  if (!locked) { const k = F.takePress(['jab', 'heavy', 'kick', 'grab']); if (k) m.supNext = k === 'jab' || k === 'heavy' ? 'H' : 'L'; }
  if (n >= WC_SUP_N || m.t < m.S + d.A + 1 || !(m.hit || m.blocked)) return false;
  const o = F.opp;
  if (o.state === 'down' || o.state === 'ko' || F.state !== 'attack') return false;
  const nx = m.supNext || (m.supLast === 'H' ? 'L' : 'H');
  F.facing = o.x >= F.x ? 1 : -1;
  if (!F.beginMove((nx === 'H' ? 'wSupH' : 'wSupL') + (n + 1 >= WC_SUP_N ? 'E' : ''), null)) return false;
  F.move.supN = n + 1; F.move.supLast = nx;
  return true;
}

/* ============================================================
   2.11 挡：听劲 + 接招（WINGCHUN.md 十五）。光按住挡 = 听劲（普通挡，只吃三成）；按住挡再按键 = 接招：
   拳接拳系的手上招（他前手的拍手、后手的摊手）、重接重系的手上招（膀手转马）、拿接腿（站着按手，蹲着耕手）。
   接住手上的招 = 进搭手（我先手、顺 FLOW_COUNTER）；截住腿、空中接住拳脚 = 他失衡，我先动。
   挨打、被挡住的硬直里也能接（新的黐手破连）：按住挡，他下一下打过来之前 WC_CATCH_HIT 帧以内按对键
   ============================================================ */
const W_SHAPES = ['', 'tan', 'bong', 'fook'];                       // 方向码 → 手型
const SHAPE_NAME = { tan: '摊', bong: '膀', fook: '伏' };
const SHAPE_BEATS = { bong: 'tan', tan: 'fook', fook: 'bong' };     // 膀克摊、摊克伏、伏克膀（咏春打咏春）
const BEATEN_BY = { tan: 'bong', fook: 'tan', bong: 'fook' };       // 克这个手型的是哪个（电脑被黏住时摆）
const COUNTER_SHAPE = { lead: 'tan', rear: 'bong', leg: 'fook' };    // 搭上的是他哪只手脚 → 翻成哪个手型是「破」
const TOUCH_STRIKE = { '': 'tChung', tan: 'tTan', bong: 'tBong', fook: 'tFook' };
// 他这一招是哪只手脚：前手（摊）/ 后手（膀）/ 腿和下段（伏、耕）
function limbClass(d) {
  if (d.height === 'low' || d.limb === 'ff' || d.limb === 'bf') return 'leg';
  return d.limb === 'fh' || d.limb === 'fe' ? 'lead' : 'rear';
}
const handLimb = d => /^(fh|bh|fe|be|sh)$/.test(d.limb) && d.height !== 'low';
const CATCH_KEYS = ['jab', 'heavy', 'grab'];
/* 2.12 一错、一平、一对（WINGCHUN.md 十六；Jack：三个键里只有唯一解，下限太低 —— 改成一种错、一种平、一种对）：
   环 拳 → 重 → 拿 → 拳。按他这一招的本键 = 对（接住），按环上的下一个 = 平（当普通挡住：吃三成、不进搭手、不罚），按上一个 = 错（×WC_WRONG_MUL）。
   他出拳系：拳对、重平（膀手转马把拳带开）、拿错；出重系：重对、拿平（按手压下去）、拳错；出腿：拿对、拳平（拍在腿上）、重错。
   时机不对（按早了在收手时挨打）照旧算错，接不住的那几类（catchKeyOf 返回 null）照旧 ×WC_WRONG_MUL */
const CATCH_NEXT = { jab: 'heavy', heavy: 'grab', grab: 'jab' };
// 按了 key 接 need：'hit' 对 / 'flat' 平 / 'miss' 错（need 为 null = 接不住，怎么按都是错）
const catchGrade = (need, key) => !need ? 'miss' : key === need ? 'hit' : key === CATCH_NEXT[need] ? 'flat' : 'miss';
// 他这一招接得住吗、按哪个键接：'jab' 拳（拳系的手上招）/ 'heavy' 重（重系的手上招）/ 'grab' 拿（腿）；null = 接不住。
// 接不住的：擒拿、推挡、坠山落膝、大招、连环寸拳那一串、下段的手上招。low = 蹲着接（耕手）：只接地上的腿（扫堂腿这种下段的也行）；站着接不住下段
function catchKeyOf(A, m, d, low) {
  if (d.script || d.push || d.dive || d.flurry || d.tier === 'super' || d.kind === 'grab') return null;
  if (m.jinUsed > 0) return null;                                      // 4.0 太极拳带着劲发出来的招（蓄过、有劲）：劲大，接不住（和 pierce 一个道理）
  const leg = d.kind === 'kick' || d.limb === 'ff' || d.limb === 'bf', air = !!(m.air || A.airborne);
  if (low) return leg && !air ? 'grab' : null;
  if (d.height === 'low') return null;
  if (leg) return 'grab';
  return d.kind === 'heavy' ? 'heavy' : d.kind === 'jab' ? 'jab' : null;
}
// 接的是哪一手（五个桩法）：拳 —— 他前手的拳拍手、后手的拳摊手；重 —— 膀手转马；拿 —— 站着按手、蹲着耕手
const catchTech = (k, d, low) => k === 'grab' ? (low ? 'gaun' : 'gum') : k === 'heavy' ? 'bong' : limbClass(d) === 'lead' ? 'pat' : 'tan';
// 按住挡再按键：摆出接招的架势（WMOVES 的 cPat / cBong / cGum / cGaun，script，自己不打人）
function catchStart(F, k, low) {
  F.facing = F.opp.x >= F.x ? 1 : -1;
  F.startScript(low ? 'cGaun' : { jab: 'cPat', heavy: 'cBong', grab: 'cGum' }[k]);
  F.lowBlock = false; F.gwalk = 0;
  Sound.whoosh(0.25);
}
// 引擎 applyHit：B（咏春）被打到的那一刻先问这里。true = 管了；数 = 这一下的伤害倍数（接错了 ×WC_WRONG_MUL）；false = 照常（听劲 = 普通挡）
function wcDefend(A, B, c, I) {
  const m = I.m, d = I.d;
  if (!I.front) return false;
  // ① 接招的架势里被打到：能接的那几帧里、按对了键 = 接住；按错了键、早了晚了（收手的时候挨打）= 这一下 ×WC_WRONG_MUL
  const bm = B.state === 'attack' ? B.move : null;
  if (bm && bm.def.catchKey) {
    const win = bm.def.catchKey === 'jab' ? WC_CATCH_WIN : WC_CATCH_WIN_H, low = !!bm.def.catchLow;
    const inWin = bm.t >= WC_CATCH_ON && bm.t < WC_CATCH_ON + win, need = catchKeyOf(A, m, d, low);
    const g = inWin ? catchGrade(need, bm.def.catchKey) : 'miss';
    if (g === 'hit') { catchHit(A, B, c, need, low); return true; }
    if (g === 'flat') return catchFlat(A, B, c, low);
    return catchMiss(A, B, inWin && need ? 'key' : 'time');
  }
  // ② 挨打、被挡住的硬直里按住挡 + 键（新的黐手破连）：他这一下打过来之前 WC_CATCH_HIT 帧以内按的键 —— 按对了接住，按错了、几个键乱按 ×WC_WRONG_MUL。
  //    顺三级以上的连环冲拳太快，接不住（按了也是按错）
  // 4.0 挨打的硬直里接 = 咏春拳的拆招：一样要过了实连的那几下（sureOf；咏春的手快，比别的派早 WC_BRK_EARLY 下就能接）、接错了这一套不能再接（brkLock）；挡住的硬直里照旧随时能接
  if ((B.state === 'blockstun' || (B.state === 'hit' && !B.brkLock && B.comboTaken >= sureOf(A) - WC_BRK_EARLY)) && B.inp.held.block && !(B.airborne || B.grabbed || B.stuck || B.stagger || B.reel || B.clashed || B.carried)) {
    const buf = B.inp.buf, recent = buf.filter(e => CATCH_KEYS.includes(e.a) && B.clock - e.t < WC_CATCH_HIT + 1);
    if (recent.length) {
      for (let i = buf.length - 1; i >= 0; i--) if (recent.includes(buf[i])) buf.splice(i, 1);   // 这几下按键用掉了（接没接住都是）
      const keys = new Set(recent.map(e => e.a)), low = !!B.inp.held.down;
      const need = d.beat && A.flow >= 3 ? null : catchKeyOf(A, m, d, low);
      const g = keys.size === 1 ? catchGrade(need, recent[0].a) : 'miss';
      if (g === 'hit') { catchHit(A, B, c, need, low); return true; }
      if (g === 'flat') { cev('catchFlat', B, A, { name: m.name }); return false; }   // 平：这一下照常（挡住的硬直里就是挡住；挨打的硬直里本来就挡不住，照旧挨）
      if (B.state === 'hit') B.brkLock = true;
      return catchMiss(A, B, keys.size > 1 ? 'mash' : 'key');
    }
  }
  return false;
}
function catchHit(A, B, c, key, low) {
  const m = A.move, d = m.def, tech = catchTech(key, d, low), air = !!(m.air || A.airborne);
  m.done = true; m.blocked = true; A.flow = 0;
  B.stats.parries++; B.gainQi(8);
  A.info = { label: d.label, dmg: 0, how: '被接住', why: '他按住挡接你这一招，按对了键（' + { jab: '拳接拳', heavy: '重接重', grab: '拿接腿' }[key] + '）', adv: null, t: A.clock };
  B.info = { label: CATCH_NAME[tech], dmg: 0, how: '接住', why: key === 'grab' || air ? '接住了：他失衡，你先动' : '接住了他的手：进搭手，你先手', adv: null, t: B.clock };
  if (key === 'grab' || air) catchReel(A, B, c, tech);                // 截住腿、空中接住拳脚：他失衡，我先动
  else touchStart(B, A, { from: 'catch', limb: limbClass(d), flow: FLOW_COUNTER, shape: tech === 'tan' ? 'tan' : tech === 'bong' ? 'bong' : '', catchPose: tech, grace: WC_CATCH_GRACE });
  if (!game.quiet && B.J) stamp(B.J.head[0] - B.facing * 52, B.J.head[1] - 46, CATCH_NAME[tech], 28, B);
  cev('catch', B, A, { tech, key, name: m.name, air });
  if (B.move && B.move.def.tch) cev('touch', B, A, { from: 'catch', tech });
  Sound.parry();
}
// 截住腿（按手、耕手）、空中接住拳脚：他失衡 WC_CATCH_REEL 帧（比被卸力还久），我停在接的那一手上，接着按什么出什么（wcInput 'parry'）
function catchReel(A, B, c, tech) {
  const m = A.move, d = m.def, dir = A.facing, kd = !!d.launch;
  A.state = 'hit'; A.stunT = WC_CATCH_REEL + (kd ? TF(4) : 0); A.reel = true; A.reelKind = tech; A.reelBy = B.idx; A.reelKD = kd;
  A.clashed = false; A.stagger = false; A.hurtHeavy = false; A.grabbed = false;
  A.move = null; A.chain = []; A.chainIdle = 99; A.runT = 0; A.comboLive = false; A.flow = 0;
  A.kvx = dir * 1.6; if (A.airborne) { A.vz = Math.max(A.vz, 2); A.vx = 0; }
  B.move = null; B.state = 'parry'; B.t = 0; B.stunT = 0; B.kvx = 0; B.gwalk = 0; B.parryKind = tech;
  B.chain = ['pc']; B.chainIdle = 0;
  game.freeze = Math.max(game.freeze, stop(8)); game.shake = Math.max(game.shake, 3);
  if (!game.quiet) { parryFx(B, c); tag(A.x, A.J.head[1] - 30, '失衡', B, 20); }
}
// 2.12 平（按了环上的下一个键）：当普通挡住 —— 收起接招的架势、按这一手的高低挡住，吃三成、不进搭手、不罚（guard 照常记势破、挡住的硬直、BLOCK_PEN）
function catchFlat(A, B, c, low) {
  B.move = null; B.lowBlock = !!low; B.chain = []; B.chainIdle = 99;
  guard(A, B, c);
  if (!game.quiet && B.J) tag(B.x, B.J.head[1] - 40, '平', B, 18);
  cev('catchFlat', B, A, { name: A.move.name });
  return true;
}
// 接错了（按错键、几个键乱按、早了晚了在收手）：这一下 ×WC_WRONG_MUL；被挡住的硬直里按错了，手一松 —— 挡不住了
function catchMiss(A, B, why) {
  if (B.state === 'blockstun') B.state = 'hit';
  if (!game.quiet && B.J) tag(B.x, B.J.head[1] - 40, { key: '读错', mash: '乱按', time: '没接住' }[why], A, 18);
  cev('catchMiss', B, A, { why, name: A.move.name });
  return WC_WRONG_MUL;
}
// 引擎 applyHit：A（咏春）打中 B 的那一刻。标指正好插在他出手的那只胳膊上 = 把手挑开，进搭手
function wcStrike(A, B, c, I) {
  const d = I.d, bm = I.bm;
  // 一串里的招（拳、踢）按从哪来算收益（中立起手打折）；2.11（Jack：削弱平时的拳 / 重 / 踢）寸拳、三个肘也一样 —— 中立打出去打折，截住、接住以后的反打照样多
  if ((d.flow && (d.beat || d.link)) || (d.heavy && !d.tch && d.tier !== 'super' && /^w/.test(I.m.name))) chainMul(A, B, I.m);
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
  m.grace = o.grace || WC_TOUCH_GRACE;                                   // 他头几帧什么都按不了（2.11 接住进来的多几帧）
  m.catchPose = o.catchPose || ''; m.catchT = o.catchPose ? WC_CATCH_SHOW : 0;   // 2.11 接住进来的：先停在接的那一手上（只是画面）
  m.fprev = !!(F.inp.held.block && F.inp.held[L.x >= F.x ? 'left' : 'right']);   // 他黏上的时候已经按着挡 + 后：松开再按才算甩手
  m.lap = !!o.lap; m.lapEsc = !!o.lapEsc; m.lapT = 0;
  L.flow = Math.min(FLOW_MAX, o.flow || 0);
  L.chain = ['pc']; L.chainIdle = 0;
  game.freeze = Math.max(game.freeze, stop(4));
  if (!game.quiet) {
    const mx = (L.x + F.x) / 2, my = L.J ? L.J.sh[1] + 6 : FLOOR - 100;
    sparks(mx, my, dir, 6, 5, pal(L).fx, 1.2, 0.2); arcMid(mx, my, 18, dir > 0 ? 0 : Math.PI, 2.4, 3, pal(L).qi, 12);
    if (o.from !== 'catch') tag(mx, my - 40, '黐', L, 30);              // 接住进来的盖了桩法的章，不另写
  }
  Sound.block();
}
// 搭手里的一步（我是先手那一方）
function touchStep(L, m, k, locked) {
  const F = L.opp;
  if (locked || F.state !== 'hit' || !F.stuck) { touchEnd(L, F, null); return true; }
  m.age += DT; if (m.catchT > 0) m.catchT = Math.max(0, m.catchT - DT);
  F.stunT = Math.max(F.stunT, 4); F.kvx = 0; L.kvx = 0;
  F.x = clamp(F.x + (L.x + L.facing * WC_TOUCH_GAP - F.x) * PULL_K, WALL_L, WALL_R);
  // 刚扣住手腕那几帧他按拿挣得脱（和格斗术的擒住一样，提前几帧按的也算）；甩手、反拿要等手搭稳了（WC_TOUCH_GRACE）
  if (m.lap && m.lapEsc && m.age < HOLD_ESC + 1 && F.takePress(['grab'])) { F.stuck = false; escapeGrab(L, F); return true; }
  if (!m.dead && m.age >= (m.grace || WC_TOUCH_GRACE) + 1 && touchFollower(L, m, F)) return true;
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
  L.lapLimb = L.move && L.move.limb || 'lead';                 // 3.1 扣着的是他哪只手（别手 wcBind 画用，只是画面）
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
/* ============================================================
   3.1 别手（Jack：咏春的别手没有把对面的模型别住 —— 一个人的手臂对另一个人的手臂的格挡、扭曲、控制，要非常细致）。
   以前接招、搭手、扣手腕的时候两个人各摆各的样子，两条胳膊碰不到一起。现在两个人这一步的骨骼算好以后再「别」一遍（只是画面，
   改的是这一步的 J，disp 用完还回去 —— 战斗、联机都不看）：
   ① 先把他被别住的那只手放到被别的地方（双方肩膀中间那一带，照手法：摊手托高、伏手压低、拍手拍得往下往里、膀手往上往外滑开、
      扣手腕被拽到我胸前、身子往前栽），肘自己弯（IK）；
   ② 再把我的手放到他小臂上该碰的那一点：拍手、伏手是掌（掌根）压在他小臂上面；摊手、膀手、问手是我小臂靠手腕那一截贴在他小臂下面 / 上面；
      扣手腕是我的手攥住他手腕（我的手不动，他的手被拽过来）；
   ③ 来回对两遍（他的胳膊动了接触点跟着动），接触的地方贴着（WC_BIND_OK 以内）。
   手法的数：[他手到哪（离两人肩膀中间往他那边 x、比肩膀低 y）, 碰在他小臂的哪（肘 0 → 手 1）, 我贴在上面 1 / 下面 -1, 我用掌 1 / 小臂 0, 他上身往前栽多少, 拧多少]
   参考：ref/wc_moves_12.png、wc_defense_combos.png、wc_dummy_combos.png；WINGCHUN.md 十七
   ============================================================ */
const WC_BIND = {
  wen: [-10, 12, 0.9, 1, 0, 0, 0],         // 问手：两人手腕搭在一起，我的小臂靠手腕那截搭在他手腕上面（他胳膊半弯着伸过来）
  tan: [-12, 6, 0.84, -1, 0, 0, -6],       // 摊手：我小臂靠手腕那截托在他手腕底下，把他的手托高、往外
  bong: [-14, 9, 0.86, -1, 0, 2, -10],     // 膀手：我小臂斜着（肘比手腕高）垫在他手腕底下，他的手顺着往上、往外滑开
  fook: [-8, 18, 0.6, 1, 1, 4, 4],         // 伏手：我手腕、掌根压在他小臂靠肘那截上面，他的手被压低
  pat: [-22, 16, 0.5, 1, 1, 6, 10],        // 拍手（刚接住）：他的拳被拍得往下、往里偏（拳过了我的胸口），我掌根拍在他小臂中段上面
  ptan: [-24, -2, 0.78, -1, 0, 0, -8],     // 摊手接（刚接住）：他的拳被托过我肩膀上面
  pbong: [-20, 4, 0.76, -1, 0, 2, -14],    // 膀手转马接（刚接住）：他的拳顺着膀手往上、往外滑开
};
// 用掌压上去的那几手，掌怎么摆（手指朝哪 fpa、掌心朝里多少 fpr、手指张开 fs）：拍手掌根往下拍、手指顺着他小臂往前；伏手手腕折着、手指往前下搭在他小臂上
const WC_BIND_PALM = { pat: [8, 0.35, 0.3], fook: [36, 0.55, 0.15] };
const WC_BIND_OK = 2;
const BIND_K = ['fh', 'bh', 'ff', 'bf'];
function bindLerp(a, b, u) { return a.map((v, i) => v + (b[i] - v) * u); }
// 这一步谁别着谁、用什么手法（null = 没别着）
function bindOf(L, F) {
  const m = L.move;
  if (!F.J || !L.J || L.state !== 'attack' || !m) return null;
  const lk = lim => lim === 'rear' ? 'bh' : lim === 'leg' ? 'ff' : 'fh';
  if (m.def.tch && F.stuck && !F.carried) {
    const fk = lk(m.limb);
    if (fk === 'ff') return null;
    if (m.lap || m.lapT > 0) return { mode: 'hold', fk, u: m.lapT > 0 ? 1 - m.lapT / WC_LAP : 1 };
    const sh = s => s === '' ? WC_BIND.wen : WC_BIND[s];
    let b = m.rollT > 0 ? bindLerp(sh(m.rollFrom), sh(m.rollTo), EASE.io(clamp(1 - m.rollT / WC_ROLL, 0, 1))) : sh(m.shape);
    let pk = m.rollT > 0 ? (m.rollT < WC_ROLL / 2 ? m.rollTo : m.rollFrom) : m.shape;
    if (m.catchT > 0) {
      const c = WC_BIND[{ pat: 'pat', tan: 'ptan', bong: 'pbong' }[m.catchPose]], u = EASE.io(clamp(m.catchT / WC_CATCH_SHOW, 0, 1));
      if (c) b = bindLerp(b, c, u);
      if (u > 0.5) pk = m.catchPose;
    }
    return { mode: 'place', fk, b, palm: WC_BIND_PALM[pk] || null };
  }
  if (m.def.lap && F.stuck && L.lapLimb && L.lapLimb !== 'leg') return { mode: 'hold', fk: lk(L.lapLimb), u: 1, drag: m.def.lap === 'drag' };
  return null;
}
// 把 X 的一只手（脚）的目标点挪到世界坐标 P：照这一步骨骼的误差反着改姿势（转身、整个人转的角度都反算回去），重算两三遍
function bindPut(X, key, P, keep, n) {
  const p = X.disp, f = X.facing, r = p.rot * D2R, cr = Math.cos(r), sr = Math.sin(r), sc = Math.max(0.35, Math.abs(Math.cos(p.spin * D2R)));
  const sy = key === 'ff' || key === 'bf' ? -1 : 1;           // 脚的姿势坐标 y 是往上抬多高（手是往下）
  for (let i = 0; i < (n || 3); i++) {
    const cur = X.J[key], ex = (P[0] - cur[0]) * f, ey = P[1] - cur[1];
    if (Math.abs(ex) + Math.abs(ey) < 0.3) break;
    p[key][0] += (cr * ex + sr * ey) / sc; p[key][1] += sy * (-sr * ex + cr * ey);
    bindRefit(X, keep);
  }
}
function bindRefit(X, keep) { if (keep.ik) for (let i = 0; i < 4; i++) X.ikS[i] = keep.ik[i]; X.fk(true); }
const BIND_N = ['tor', 'tw', 'head', 'fz', 'fpa', 'fpr', 'fs', 'fp', 'dx'];
const bindKeep = X => { const o = { ik: X.ikS ? X.ikS.slice() : null, p: BIND_K.map(k => X.disp[k].slice()) }; for (const k of BIND_N) o[k] = X.disp[k]; return o; };
function bindRestore(X, k) { BIND_K.forEach((key, i) => { X.disp[key][0] = k.p[i][0]; X.disp[key][1] = k.p[i][1]; }); for (const n of BIND_N) X.disp[n] = k[n]; }
// 胳膊的肘、手（J 的世界坐标）：fh → 前手（fe、fh）
const armOf = (J, k) => k === 'bh' ? [J.be, J.bh] : [J.fe, J.fh];
function wcBind(L, F) {
  const B = bindOf(L, F);
  if (!B) return false;
  const kL = bindKeep(L), kF = bindKeep(F), fL = L.facing;
  // 他被别住的是前手的话，这条胳膊换到近侧（离镜头近、画在他身子前面）：不然前手在远侧，被他自己的身子、我的护手挡着，看不见两条胳膊怎么搭
  if (B.fk === 'fh') F.disp.fz = 1;
  // 搭手的时候两个人中心只隔 WC_TOUCH_GAP（66），身子再往前倾，两边的肩膀就挤到一起了 —— 两条胳膊没地方弯着搭在中间。
  // 两个人身子立直一点、髋往后让一点（只是画面），肩膀隔开六十几，两条小臂正好在中间手腕搭手腕（ref/wc_dummy_combos 那样）
  if (B.mode === 'place') { L.disp.tor = Math.min(L.disp.tor, 0); L.disp.dx -= 4; F.disp.tor = Math.min(F.disp.tor, 3); F.disp.dx -= 5; }
  bindRefit(L, kL); bindRefit(F, kF);
  const lh = 'fh';                                                      // 我搭着他的是前手（问手、摊、膀、伏、拍、扣手腕都是前手；后手护着 / 打人）
  if (B.mode === 'place') {
    const [bx, by, t, side, palm, ftor, ftw] = B.b;
    // ① 他的手：两人肩膀中间往他那边 bx、比肩膀低 by；他上身往前栽、拧腰
    const mx = (L.J.sh[0] + F.J.sh[0]) / 2 + fL * bx, my = (L.J.sh[1] + F.J.sh[1]) / 2 + by;
    F.disp.tor += ftor; F.disp.tw += ftw; bindRefit(F, kF);
    bindPut(F, B.fk, [mx, my], kF);
    // ② 他小臂上的那一点（肘 → 手的 t 处），往上（side 1）/ 往下（-1）挪出两条胳膊的粗细
    for (let it = 0; it < 2; it++) {
      const [E, W] = armOf(F.J, B.fk), ux = W[0] - E[0], uy = W[1] - E[1], ul = Math.hypot(ux, uy) || 1;
      let nx = -uy / ul, ny = ux / ul; if (ny * side > 0) { nx = -nx; ny = -ny; }       // 法线朝上（side 1）/ 朝下（-1）
      const C = [E[0] + ux * t, E[1] + uy * t], gap = palm ? 4.6 : 7.2;
      const P = [C[0] + nx * gap, C[1] + ny * gap];
      if (palm) {
        if (B.palm && it === 0) { L.disp.fp = 1; L.disp.fpa = B.palm[0]; L.disp.fpr = B.palm[1]; L.disp.fs = B.palm[2]; bindRefit(L, kL); }
        // 掌（掌根到掌心）压在那一点：手的目标点是掌根，掌心在顺着手指往前 5 的地方
        const d = L.J.fpm >= 0.5 && L.J.fpd ? L.J.fpd : { 0: fL, 1: 0 };
        bindPut(L, lh, [P[0] - d[0] * 5, P[1] - d[1] * 5], kL, 3);
      } else {
        // 小臂靠手腕那一截（肘 → 手 0.8 处）贴在那一点
        for (let j = 0; j < 3; j++) {
          const [e, w] = armOf(L.J, lh), q = [e[0] + (w[0] - e[0]) * 0.8, e[1] + (w[1] - e[1]) * 0.8];
          const dx = P[0] - q[0], dy = P[1] - q[1];
          if (Math.abs(dx) + Math.abs(dy) < 0.4) break;
          bindPut(L, lh, [w[0] + dx * 1.25, w[1] + dy * 1.25], kL, 1);
        }
      }
    }
    // 护手（后手）跟着前手：竖掌护在胸口前、中线上，在前手的手腕后面（ref/wc_moves_12 第 2 格），不跑到前手前面去挡住搭着的那两只手
    if (!(L.move.def.limb === 'bh' && !L.move.def.tch)) {
      const w = L.J[lh], gx = L.J.sh[0] + fL * Math.min(20, Math.max(8, (w[0] - L.J.sh[0]) * fL - 10));
      bindPut(L, 'bh', [gx, L.J.sh[1] + 9], kL, 2);
    }
  } else {
    // 扣手腕、拉打、拉手跪马：我的手攥着不动，他的手腕被拽到我手里（手腕在我拳心往外一点），身子跟着往前栽
    const u = clamp(B.u, 0, 1), H = L.J[lh];
    // 他被拽着：身子别往前扑（扑过来肩膀就到我手边了，胳膊没法被拽直）—— 上身微微往前、肩膀被带出来（拧腰），头往前探
    if (!B.drag) { F.disp.tor = Math.min(F.disp.tor, 4) + 4 * u; F.disp.head += 6 * u; F.disp.tw += 14 * u; bindRefit(F, kF); }
    const [E0, W0] = armOf(F.J, B.fk), ax = W0[0] - E0[0], ay = W0[1] - E0[1], al = Math.hypot(ax, ay) || 1;
    const P = [H[0] + (W0[0] - H[0]) * (1 - u) + ax / al * 2.5 * u, H[1] + (W0[1] - H[1]) * (1 - u) + ay / al * 2.5 * u];
    bindPut(F, B.fk, P, kF);
  }
  bindRestore(L, kL); bindRestore(F, kF);
  return true;
}
// 3.1 截住腿（按手、耕手）以后：他踢过来的那条腿被截在我肚子前面（按手：掌心按在他小腿上面往下压；耕手：小臂贴着他小腿往外、往下扫），
// 头两成半还搭着，后面三成半他慢慢把腿收回去（他往后仰着失衡 —— POSE.reel）。他是哪条腿踢的已经不记了：画前腿（离我近的那条）
// [碰在他小腿的哪（膝 0 → 脚踝 1）, 隔多远（我在上面）, 用掌 1 / 小臂 0, 他的脚在我髋前面多远, 比我的髋低多少（耕手：离地多高 —— 扫过来的腿贴着地被耕开）]
const LEG_BIND = { gum: [0.7, 5, 1, 16, -4, 0], gaun: [0.6, 6, 0, 34, 7, 1] };
function wcLegBind(L, F) {
  const lb = F.state === 'hit' && F.reel && F.reelBy === L.idx && L.state === 'parry' ? LEG_BIND[F.reelKind] : null;
  if (!lb || !F.J || !L.J || F.airborne) return false;
  const u0 = clamp(1 - F.stunT / WC_CATCH_REEL, 0, 1), u = u0 < 0.25 ? 1 : 1 - EASE.io(clamp((u0 - 0.25) / 0.35, 0, 1));
  if (u <= 0.01) return false;
  const kF = bindKeep(F), kL = bindKeep(L), fL = L.facing, [t, gap, palm, ax, ay, low] = lb;
  const mix = (a, b) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], fkh = F.disp.fkh;
  // ① 他的脚：截在我髋前面；他的髋被这一截顶回去（踢出去冲过来的那一下没了），腿差不多伸直（不折成提膝）
  F.disp.fkh = [0.25, 1];
  if (F.disp.dx > -4) { F.disp.dx -= (F.disp.dx + 4) * u; bindRefit(F, kF); }
  bindPut(F, 'ff', mix(F.J.ff, [L.J.hip[0] + fL * ax, low ? FLOOR - BODY.bone.ankle - ay : L.J.hip[1] + ay]), kF, 3);
  // ② 我的手贴在他小腿上（膝 → 脚踝 t 处）的上面
  for (let it = 0; it < 2; it++) {
    const K = F.J.fk, A = F.J.ff, q = [K[0] + (A[0] - K[0]) * t, K[1] + (A[1] - K[1]) * t], P = [q[0], q[1] - gap];
    if (palm) {
      const d = L.J.fpm >= 0.5 && L.J.fpd ? L.J.fpd : { 0: fL, 1: 0 };
      bindPut(L, 'fh', mix(L.J.fh, [P[0] - d[0] * 5, P[1] - d[1] * 5]), kL, 3);
    } else for (let j = 0; j < 3; j++) {
      const E = L.J.fe, W = L.J.fh, c = [E[0] + (W[0] - E[0]) * 0.8, E[1] + (W[1] - E[1]) * 0.8], dx = (P[0] - c[0]) * u, dy = (P[1] - c[1]) * u;
      if (Math.abs(dx) + Math.abs(dy) < 0.4) break;
      bindPut(L, 'fh', [W[0] + dx * 1.25, W[1] + dy * 1.25], kL, 1);
    }
  }
  bindRestore(L, kL); bindRestore(F, kF); F.disp.fkh = fkh;
  return true;
}
// 两个人都画好以后别一遍（game.js simTick 里，animate 之后）
function wcBindAll(a, b) {
  for (const [L, F] of [[a, b], [b, a]]) if (styleOf(L) === STYLES.wc) wcBind(L, F) || wcLegBind(L, F);
}
// 咏春被黏住的时候（咏春打咏春）：按着的方向就是他的手型
const wcTouchShape = F => W_SHAPES[wcDir(F)] || '';

/* ============================================================
   画：听劲、接招的桩法、搭手、被黏住（引擎 target 先问这里；null = 照通用的画）
   ============================================================ */
const W_TCH_BASE = { hy: 68, tor: 5, head: 3, dx: 2, ff: [28, 0], bf: [-32, 0] };
const WTCH = {};
for (const s of W_SHAPES) {
  const sh = W_SHAPE[s];
  WTCH[s] = wmk(WJ(W_TCH_BASE, WJ(sh, { fh: [sh.fh[0] + (s === 'bong' ? 2 : 6), sh.fh[1] + 1] })));   // 搭上了：前手再往前伸一点（膀手伸直了就不是膀了）
}
// 3.1 扣着手腕往回带：手往回拽到自己胸口前下（以前停在他胸口前 —— 他的胳膊只能折着），他的胳膊被拽直（别手 wcBind 把他的手腕放进这只手里）
const WTCH_LAP = wmk(WJ(W_TCH_BASE, { tor: 0, dx: -4, tw: 22, fh: [16, 14], fp: 0, fe: 1, bh: [24, 4], bpa: -60, be: 1 }));
// 动作台（poses.html）、教程小图也看得到这些手型：搭手 tch*、扣着手腕 tchLap
const W_SHAPE_KEY = { '': '', tan: 'Tan', bong: 'Bong', fook: 'Fook' };
for (const s of W_SHAPES) WPOSE['tch' + W_SHAPE_KEY[s]] = WTCH[s];
WPOSE.tchLap = WTCH_LAP;
function wcTarget(F, t) {
  const st = F.state;
  if (st === 'block') {
    // 2.11 听劲：按住挡，两只手往胸前收一点、不动（Jack：不是一直翻盘手）；按着前 / 后慢慢走
    copyPose(t, F.lowBlock ? WPOSE.cblock : WPOSE.block);
    if (F.gwalk && !F.lowBlock) {                                               // 按着挡走：脚下小碎步（和格斗术的边挡边走一样）
      const ph = F.walkPhase * TAU, s = Math.sin(ph), c = Math.cos(ph);
      t.ff[0] += 9 * s; t.ff[1] = Math.max(0, 6 * c); t.bf[0] -= 9 * s; t.bf[1] = Math.max(0, -6 * c);
    }
    return t;
  }
  // 截住腿（按手、耕手）、空中接住拳脚以后：停在接的那一手上，他失衡
  if (st === 'parry' && F.parryKind && WCATCH[F.parryKind]) return copyPose(t, WCATCH[F.parryKind]);
  if (st === 'attack' && F.move && F.move.def.tch) {
    const m = F.move;
    // 刚接住进搭手：先停在接的那一手上（拍手、摊手、膀手转马），再顺到搭手的手型
    if (m.catchT > 0 && WCATCH[m.catchPose]) return lerpPose(WTCH[m.shape], WCATCH[m.catchPose], EASE.io(clamp(m.catchT / WC_CATCH_SHOW, 0, 1)), t, false);
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
  const en = Tc('hand', ch);                       // 3.5 英文：圈里照旧是那个字，圈底下另写手型的粤语拼法（Tan / Bong / Fook / Lap / Chi）
  if (en !== ch) {
    c2d.font = `11px ${BRUSH}`; c2d.lineJoin = 'round'; c2d.lineWidth = 2.5; c2d.strokeStyle = 'rgba(244,243,236,.85)';
    c2d.strokeText(en, x, y + 22); c2d.fillText(en, x, y + 22);
  }
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
  ['拳', ['wJab', 'wJabR', 'wJabF', 'wPalmF', 'wPalmR', 'wCunEnd', 'wCunEndF', 'wBiu', 'wLowPalm']],
  ['接招', ['cPat', 'cBong', 'cGum', 'cGaun']],
  ['重', ['wCun', 'wPai', 'wGwai', 'wJum', 'slipElbow', 'super']],
  ['踢', ['wKick', 'wLowKick', 'wSideKick', 'wKick2', 'wStompKnee', 'wTurnKick', 'stomp']],
  ['搭手', ['tChung', 'tTan', 'tBong', 'tFook', 'tPai', 'tKick', 'tLapDa', 'tLapPai', 'tLapKick', 'tDrag', 'tButterfly', 'tLatChung', 'tMess', 'tSep']],
  ['跳起来', ['airJab', 'airHeavy', 'airKick', 'dive']],
  ['拿', ['grab', 'lowGrab']],
  ['身法', ['dash', 'slip', 'burst']],
];
STYLES.wc = {
  id: 'wc', name: '咏春拳', moves: WMOVES, relation: wcRelation, cancel: {}, variant: wcVariant, poses: WPOSE, base: WBASE,
  sure: 5, ownBreak: true, jumpV: 0.8, jumpVx: 0.92,   // 4.0 小跳：跳得矮（最高六成多）、落得快，越不过站着的人打过来的手脚，只是快   // 4.0 实连五拳（拳小、连得密）；拆招用自己的接招（按住挡 + 键）
  chainMax: 8, blockHeavy: null, blockWalk: WC_WALK, parry: false, catchGuard: true,   // 2.11 catchGuard：挡着的时候按拳不是截打 / 推挡（是接招，见 wcDefend）
  input: wcInput, canCancel: wcCanCancel, defend: wcDefend, strike: wcStrike, clash: wcClash, grab: wcGrab, stunOf: wcStun,
  target: wcTarget, drawCue: wcDrawCue, touchShape: wcTouchShape,
  benchGroups: W_BENCH_GROUPS, benchHit: ['wJab', 'wJabR', 'wJabF', 'wPalmF', 'wPalmR', 'wCunEnd', 'wCunEndF', 'wBiu', 'wLowPalm', 'wCun', 'wPai', 'wGwai', 'wJum',
    'slipElbow', 'super', 'wKick', 'wLowKick', 'wSideKick', 'wKick2', 'wStompKnee', 'wTurnKick', 'stomp', 'airJab', 'airHeavy', 'airKick', 'dive'],
};
/* 跨派：格斗术 × 咏春拳（relation(格斗术的招, 咏春的招)：1 格斗术赢 / -1 咏春赢 / ±0.5 压 / 0 平）。
   两派的招按同一套系别比；多出来的是咏春的截脚截地上的腿。标指挑开、黐手黏住这些在 wcClash / wcDefend 里，不走这张表 */
MATCHUPS['trad|wc'] = { relation(dT, dW) { return wcRules(dT, dW) || relation(dT, dW); } };
