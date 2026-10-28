'use strict';
/* ============================================================
   迎春拳（2.9，Jack 提的新拳派）：快、小、连贯 —— 靠控制、连贯、反击吃饭的一派。
   和「传统格斗」完全分开的一整套：招式表 YMOVES（每一招的帧数、伤害、关键帧都是自己的）、自己的架势（YPOSE：問手 + 護手，两只掌竖着）、
   取消规则、连招变招、交手关系；跨派（和传统格斗打）的规矩在文件最后 MATCHUPS['trad|ying']。
   战斗里的「反应」（拍手、耕手、盘手、拉手、顺）写在 combat.js / fighter.js，按招式身上的标记认（guard、trap、flow……），不按招名。

   五个键（Jack）：
   · 拳：左右手交替的冲拳、立掌 —— 拳掌结合，一手打一手护（不是螳螂拳那种绕的，就是左右交替）。连得越多越「顺」：
         出手越快、伤害越高、挨打的人硬直越长（「顺」，见 combat.js flow）。第 8 下是寸拳（收势，打倒）。
         刚起手那两三下还没顺：第 2 下和第 3 下之间有一点空（一直按着挡的人挡得住）—— 对面有机会；连上 3 下就顺了，后面跑不掉
   · 重：点一下 = 拍手（单点的小格挡：一只手拍开打过来的拳掌，打的人失衡，你马上反打）；
         按住 = 盘手（两只手一直盘：打过来的拳脚黏住挡下，挡完马上能反打，还能慢慢往前压）；
         蹲 + 重 = 耕手（往下耕开踢过来的腿、下段）；
         连招里（打中以后、拍开以后）的重 = 摊打 → 拍打 → 蝴蝶掌：一手化开一手打，左右交叉的拳加掌
   · 踢：近、快、伤害小，踢法多：正撑脚（单出）、截膝（蹲 + 踢：低位截对方的腿，踢中失衡）、侧撑（拳后接）、
         连环撑（腿接腿）、踩膝（连环撑再接：打倒）、转马撑（摊打、拍打后接：打倒）
   · 拿：拉手 —— 正好在对方出拳、出掌的时候伸手，把他的手拉过来（失衡、往你怀里扑），接一整套；也能擒住站着的人（后续：拉打 / 扫踢摔 / 转马摔 / 推掌）。
         接不住腿（出腿的时候伸手 = 挨踢）。蹲 + 拿 = 截腿：接住地上的腿（扫堂腿也接），抓蹲着的
   · 挡：两只掌竖起来挡（立掌）。卸力（刚按下挡就挨打）和传统格斗一样，只是卸开以后接的是迎春的一整套（顺）；
         挡住的硬直里按拳 = 截打（从挡里直接打出去，带一下打击无敌），按重 = 拍手（不要气）
   · 重 + 踢（气满）：连环寸拳（大招）—— 第一拳打中就是一串连环寸拳，最后一记寸劲把人打飞
   ============================================================ */

// 底子（迎春拳的招没写的部分都从这里来）：問手（前手往前伸、肘往下沉、掌竖着）+ 護手（后手竖掌护在胸口中线），
// 侧身站、前腿弓、后腿往后撑（参考图第一张）
const YBASE = { rot: 0, spin: 0, tor: 2, head: 2, hy: 69, dx: 0, air: 0, fe: 1, be: 1, tw: 30, fn: 1, bn: 1, ft: 0, bt: 0, fo: 0, bo: 0,
  fp: 1, bp: 1, fpa: -84, bpa: -76, fh: [48, -10], bh: [22, -2], ff: [28, 0], bf: [-32, 0] };
const ymk = o => mk(o, YBASE);
function YM(o) { o.pb = YBASE; o.style = 'ying'; return M(o); }

// 常用片段（拳 = fp/bp 0，掌 = 1；fpa/bpa 手指朝哪：-90 朝上、0 往前、90 朝下）
const Y_PF = { tor: 6, dx: 8, hy: 68, tw: 24, fh: [55, -5], fp: 0, bh: [20, 0], bpa: -80, ff: [32, 0], bf: [-30, 0] };          // 前手冲拳（日字拳）、后手護在胸口
const Y_PR = { tor: 6, dx: 9, hy: 68, tw: -22, bh: [55, -5], bp: 0, fh: [22, 2], fpa: -80, ff: [32, 0], bf: [-30, 0] };          // 后手冲拳、前手收回来護在胸口
const Y_MF = { tor: 8, dx: 9, hy: 68, tw: 26, fh: [53, -3], fpa: -74, bh: [18, 3], bp: 0, ff: [32, 0], bf: [-30, 0] };           // 前手立掌（掌根打出去）、后手握拳收在胸口
const Y_MR = { tor: 8, dx: 9, hy: 68, tw: -24, bh: [53, -3], bpa: -76, fh: [18, 3], fp: 0, ff: [32, 0], bf: [-30, 0] };          // 后手立掌、前手握拳收在胸口
const Y_LOW = { hy: 52, tor: 18, head: -4, tw: 20, ff: [28, 0], bf: [-26, 0], fh: [34, -2], bh: [18, 4] };                     // 蹲着：两只掌还竖着护在前面
const YJ = (base, o) => Object.assign({}, base, o);

const YMOVES = {
  /* ---- 拳：左右交替的冲拳、立掌（kind 'jab'，主系 light）。flow：这一下打中了「顺」加一（见 combat.js） ---- */
  // 冲拳（单出、起手）：前手从護手的位置直直冲出去，拳头竖着（日字拳），后手留在胸口护着中线
  yJab: YM({ kind: 'jab', label: '冲拳', open: true, flow: true, S: 3, A: 3, R: 7, dmg: 4, reach: 84, stun: 8, bstun: 6, kb: 1.4, stop: 3, power: .3,
    limb: 'fh', fx: 'jab', lunge: [1, 3, 6],
    keys: [[0, {}], [0.5, { fh: [40, -6], fp: 0, tw: 28 }], [1, Y_PF, 'back'], [2, Y_PF], [2.5, YJ(Y_PF, { dx: 4, fh: [38, -6] })], [3, {}]] }),
  // 连环冲拳里的前手、后手：越连越快（顺）
  yJabR: YM({ kind: 'jab', label: '冲拳', flow: true, S: 3, A: 3, R: 6, dmg: 4, reach: 86, stun: 2, bstun: 6, kb: 1.2, stop: 3, power: .3,
    limb: 'bh', fx: 'rush', lunge: [1, 3, 7],
    keys: [[0, YJ(Y_PF, { fh: [44, -6], fp: 1, dx: 6 })], [0.45, { tw: 4, bh: [34, -4], bp: 0, fh: [30, 0], dx: 6 }], [1, Y_PR, 'back'], [2, Y_PR], [3, YJ(Y_PR, { dx: 5, bh: [30, -4] })]] }),
  // （前手这一拳往前跟一步：踢完接拳也够得着）
  yJabF: YM({ kind: 'jab', label: '冲拳', flow: true, S: 3, A: 3, R: 6, dmg: 4, reach: 86, stun: 2, bstun: 6, kb: 1.2, stop: 3, power: .3,
    limb: 'fh', fx: 'rush', lunge: [1, 3, 12],
    keys: [[0, YJ(Y_PR, { bh: [44, -6], bp: 1, dx: 6 })], [0.45, { tw: 4, fh: [34, -4], fp: 0, bh: [30, 0], dx: 6 }], [1, Y_PF, 'back'], [2, Y_PF], [3, YJ(Y_PF, { dx: 5, fh: [30, -4] })]] }),
  // 立掌：掌根往前推出去（拳掌结合）
  yPalmF: YM({ kind: 'jab', label: '立掌', flow: true, S: 3, A: 3, R: 6, dmg: 4, reach: 86, stun: 2, bstun: 6, kb: 1.3, stop: 3, power: .35,
    limb: 'fh', fx: 'rush', lunge: [1, 3, 7],
    keys: [[0, YJ(Y_PR, { bh: [44, -6], dx: 6 })], [0.45, { tw: 4, fh: [32, -2], bh: [30, 2], bp: 0, dx: 6 }], [1, Y_MF, 'back'], [2, Y_MF], [3, YJ(Y_MF, { dx: 5, fh: [30, -2] })]] }),
  yPalmR: YM({ kind: 'jab', label: '立掌', flow: true, S: 3, A: 3, R: 6, dmg: 4, reach: 86, stun: 2, bstun: 6, kb: 1.3, stop: 3, power: .35,
    limb: 'bh', fx: 'rush', lunge: [1, 3, 7],
    keys: [[0, YJ(Y_PF, { fh: [44, -6], dx: 6 })], [0.45, { tw: 4, bh: [32, -2], fh: [30, 2], fp: 0, dx: 6 }], [1, Y_MR, 'back'], [2, Y_MR], [3, YJ(Y_MR, { dx: 5, bh: [30, -2] })]] }),
  // 寸拳（第 8 下收势）：身子往下一沉、后手拳贴着胸口，一寸一寸地炸出去 —— 劲大，霸体也挡不住（pierce），打倒
  yInch: YM({ kind: 'jab', label: '寸拳', stamp: '寸拳', flow: true, pierce: true, S: 4, A: 3, R: 12, dmg: 10, reach: 88, stun: 14, bstun: 10, kb: 6, stop: 9, shake: 7, power: 1,
    limb: 'bh', fx: 'rushEnd', ghost: true, lunge: [1, 4, 10], launch: 4.5, ender: true, noCancel: true,
    keys: [[0, YJ(Y_PF, { dx: 6 })], [0.6, { tor: 4, dx: 2, hy: 64, tw: 6, bh: [22, 4], bp: 0, fh: [36, -6], ff: [30, 0], bf: [-32, 0] }],
      [1, { tor: 14, dx: 18, hy: 63, head: -2, tw: -34, bh: [58, -2], bp: 0, fh: [30, -3], fpa: -86, ff: [44, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 14, dx: 18, hy: 63, head: -2, tw: -34, bh: [58, -2], bp: 0, fh: [30, -3], fpa: -86, ff: [44, 0], bf: [-30, 0] }], [3, {}]] }),
  // 下冲拳（蹲 + 拳）：蹲下去一拳打在肚子底下（下段，要蹲着挡）
  yLowJab: YM({ kind: 'jab', label: '下冲拳', open: true, flow: true, height: 'low', S: 4, A: 3, R: 8, dmg: 4, reach: 84, stun: 8, bstun: 6, kb: 1.6, stop: 3, power: .3,
    limb: 'fh', fx: 'low', lunge: [1, 4, 6],
    keys: [[0, Y_LOW], [0.5, YJ(Y_LOW, { fh: [30, 10], fp: 0 })], [1, YJ(Y_LOW, { tor: 24, dx: 8, hy: 50, tw: 28, fh: [50, 24], fp: 0, bh: [22, 2] }), 'back'],
      [2, YJ(Y_LOW, { tor: 24, dx: 8, hy: 50, tw: 28, fh: [50, 24], fp: 0, bh: [22, 2] })], [3, Y_LOW]] }),

  /* ---- 重：拍手 / 盘手 / 耕手（guard：不打人，专门化开对方的招）；连招里的重 = 摊打 → 拍打 → 蝴蝶掌 ---- */
  // 拍手（点一下重）：后手往前一拍（掌心朝下往前下方拍），前手留着問手。判定那几帧（A）正面打过来的拳、掌、肘、肩、空中的拳脚被拍开：
  // 打的人失衡（Y_PAT_STUN），你马上能出手（这一下之后按拳 = 后手冲拳打出去，按重 = 摊打，都是顺的）。按住重不放 = 接着盘手
  // （判定只有一小段：要卡准他打到的那一下 —— Jack：高难度的格挡才有大的反击收益）
  yPat: YM({ kind: 'guard', label: '拍手', guard: 'pat', noChain: true, S: 2, A: 6, R: 9, dmg: 0, reach: 0, power: 0,
    keys: [[0, {}], [1, { tor: 4, dx: 3, hy: 68, tw: 30, bh: [40, -6], bpa: 18, fh: [46, -12] }, 'out'], [1.5, { tor: 5, dx: 4, hy: 68, tw: 32, bh: [44, -2], bpa: 34, fh: [46, -12] }],
      [2, { tor: 4, dx: 3, hy: 68, tw: 30, bh: [40, -4], bpa: 24, fh: [46, -12] }], [3, {}]] }),
  // 盘手（按住重）：两只手一直盘 —— 摊（掌心朝上往前托）→ 膀（肘抬起来、小臂斜着横在身前）→ 伏（掌心朝下压）→ 摊…… 一圈 A 帧，按着就一直转。
  // 正面打过来的中段、上段（拳、掌、腿）都黏住挡下（chip 三成，挡的硬直短），挡下以后马上能打（黏打，顺）；下段、擒拿挡不住。按着前能慢慢往前压
  yRoll: YM({ kind: 'guard', label: '盘手', guard: 'roll', loop: true, noChain: true, S: 1, A: 20, R: 5, dmg: 0, reach: 0, power: 0,
    keys: [[0, { tor: 4, dx: 2, hy: 67, tw: 26, bh: [40, -4], bpa: 24, fh: [46, -12] }],
      [1, { tor: 4, dx: 3, hy: 67, tw: 24, fh: [42, -14], fpa: -34, bh: [32, 4], bpa: 30 }],
      [1.33, { tor: 4, dx: 3, hy: 67, tw: 28, fh: [34, -8], fe: -1, fpa: 40, bh: [36, -12], bpa: -36 }],
      [1.67, { tor: 4, dx: 3, hy: 67, tw: 24, fh: [40, 0], fpa: 26, bh: [30, -14], bpa: -30, be: 1 }],
      [2, { tor: 4, dx: 3, hy: 67, tw: 24, fh: [42, -14], fpa: -34, bh: [32, 4], bpa: 30 }], [3, {}]] }),
  // 耕手（蹲 + 重）：蹲下去，前手往前下方一耕（小臂斜着往下、掌心朝外），耕开踢过来的腿、下段的拳。拳、掌（中段、上段）耕不到
  yGaun: YM({ kind: 'guard', label: '耕手', guard: 'gaun', noChain: true, height: 'low', S: 2, A: 6, R: 10, dmg: 0, reach: 0, power: 0,
    keys: [[0, Y_LOW], [1, YJ(Y_LOW, { hy: 54, tor: 14, dx: 4, tw: 30, fh: [44, 26], fpa: 64, bh: [22, -6] }), 'out'],
      [1.5, YJ(Y_LOW, { hy: 54, tor: 16, dx: 6, tw: 34, fh: [48, 32], fpa: 80, bh: [22, -6] })], [2, YJ(Y_LOW, { hy: 54, tor: 14, dx: 4, tw: 30, fh: [44, 28], fpa: 70, bh: [22, -6] })], [3, Y_LOW]] }),
  // 摊打（连招里、拍开以后按重）：前手摊开（掌心朝上往前托，化开对方的手）、同时后手一拳打进去 —— 一手化一手打（cross：交手时克对方的拳系）
  yTan: YM({ kind: 'heavy', label: '摊打', tag: '摊打', flow: true, cross: true, lead: 'light', S: 3, A: 3, R: 8, dmg: 6, reach: 86, stun: 3, bstun: 7, kb: 1.8, stop: 4, shake: 2, power: .5,
    limb: 'bh', fx: 'jab2', lunge: [1, 3, 8],
    keys: [[0, YJ(Y_PF, { fh: [44, -8], fp: 1 })], [0.5, { tw: 12, fh: [36, -10], fpa: -50, bh: [16, 2], bp: 0, dx: 4 }],
      [1, { tor: 8, dx: 10, hy: 67, tw: -14, fh: [40, -18], fpa: -32, bh: [55, -2], bp: 0, ff: [32, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 8, dx: 10, hy: 67, tw: -14, fh: [40, -18], fpa: -32, bh: [55, -2], bp: 0, ff: [32, 0], bf: [-30, 0] }], [3, YJ(Y_PR, { fh: [30, -10], fp: 1 })]] }),
  // 拍打（摊打以后再按重）：后手往下一拍（压住对方的手），前手立掌打出去 —— 左右换过来
  yPak: YM({ kind: 'heavy', label: '拍打', tag: '拍打', flow: true, cross: true, lead: 'light', S: 3, A: 3, R: 8, dmg: 6, reach: 86, stun: 5, bstun: 7, kb: 1.8, stop: 4, shake: 2, power: .5,
    limb: 'fh', fx: 'jab', lunge: [1, 3, 8],
    keys: [[0, YJ(Y_PR, { fh: [30, -6], fp: 1 })], [0.5, { tw: -4, bh: [38, -8], bp: 1, bpa: -10, fh: [20, 0], dx: 4 }],
      [1, { tor: 9, dx: 10, hy: 67, tw: 28, bh: [36, 8], bpa: 14, fh: [55, -6], fpa: -78, ff: [32, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 9, dx: 10, hy: 67, tw: 28, bh: [36, 8], bpa: 14, fh: [55, -6], fpa: -78, ff: [32, 0], bf: [-30, 0] }], [3, {}]] }),
  // 蝴蝶掌（拍打以后再按重）：上一步，两只掌一上一下一起推出去（上面那只手指朝上、下面那只手指朝下）—— 打倒
  yButterfly: YM({ kind: 'heavy', label: '蝴蝶掌', stamp: '蝴蝶掌', flow: true, cross: true, lead: 'light', S: 5, A: 4, R: 13, dmg: 11, reach: 92, stun: 14, bstun: 11, kb: 7, stop: 9, shake: 7, power: 1, heavy: true,
    limb: 'fh', fx: 'shove', ghost: true, lunge: [1, 5, 16], launch: 5, ender: true, noCancel: true,
    keys: [[0, {}], [0.55, { tor: 0, dx: -4, hy: 66, tw: 8, fh: [24, -6], bh: [20, 12], bpa: 70 }],
      [1, { tor: 14, dx: 18, hy: 64, tw: 6, fh: [54, -10], fpa: -84, bh: [52, 14], bpa: 80, ff: [44, 0], bf: [-34, 0] }, 'back'],
      [2, { tor: 14, dx: 18, hy: 64, tw: 6, fh: [54, -10], fpa: -84, bh: [52, 14], bpa: 80, ff: [44, 0], bf: [-34, 0] }], [3, {}]] }),

  /* ---- 踢：近、快、伤害小，踢法多 ---- */
  // 正撑脚（单出）：前腿提膝、脚跟往前直直地撑出去（中段），两只手还护着
  // （撑中了人只退一点：后面接拳、接连环撑够得着）
  yKick: YM({ kind: 'kick', label: '正撑脚', open: true, flow: true, S: 6, A: 4, R: 9, dmg: 7, reach: 100, stun: 12, bstun: 7, kb: 1.2, stop: 5, shake: 3, power: .6,
    limb: 'ff', fx: 'kick', lunge: [2, 6, 8],
    keys: [[0, {}], [0.55, { ff: [26, 42], tor: 0, hy: 71, dx: 2, bf: [-26, 0] }],
      [1, { tor: -10, head: 6, dx: 14, hy: 73, tw: 22, ff: [92, 46], ft: 34, bf: [-26, 0] }, 'back'], [2, { tor: -10, head: 6, dx: 14, hy: 73, tw: 22, ff: [92, 46], ft: 34, bf: [-26, 0] }],
      [2.45, { ff: [32, 34], tor: -2, dx: 6, hy: 72, bf: [-26, 0] }], [3, {}]] }),
  // 截膝（蹲 + 踢）：身子一侧、前腿往前下方一截，脚掌横着踩在对方膝盖、小腿上（下段）。踢中他失衡；撞上他地上的出腿 = 截住（交手时克腿）
  yLowKick: YM({ kind: 'kick', label: '截膝', open: true, flow: true, stopKick: true, height: 'low', S: 5, A: 3, R: 10, dmg: 5, reach: 96, stun: 11, bstun: 7, kb: 2, stop: 5, shake: 3, power: .55,
    limb: 'ff', fx: 'low', lunge: [1, 5, 8], reelHit: true,
    keys: [[0, {}], [0.55, { spin: 10, ff: [22, 26], tor: 0, hy: 68, bf: [-28, 0] }],
      [1, { spin: 18, tor: -8, head: 4, dx: 10, hy: 66, ff: [80, 18], ft: 24, bf: [-28, 0] }, 'back'], [2, { spin: 18, tor: -8, head: 4, dx: 10, hy: 66, ff: [80, 18], ft: 24, bf: [-28, 0] }],
      [2.5, { spin: 6, ff: [32, 14], hy: 68, dx: 4 }], [3, {}]] }),
  // 侧撑（拳后接踢）：侧过身、前腿往前横着撑出去，把人撑开
  ySideKick: YM({ kind: 'kick', label: '侧撑', tag: '侧撑', flow: true, S: 4, A: 4, R: 10, dmg: 7, reach: 102, stun: 3, bstun: 8, kb: 4.5, stop: 5, shake: 4, power: .7,
    limb: 'ff', fx: 'kick', lunge: [1, 4, 10],
    keys: [[0, {}], [0.5, { spin: 34, ff: [22, 44], tor: 2, hy: 71, bf: [-24, 0] }],
      [1, { spin: 40, tor: -24, head: 10, dx: 20, hy: 74, ff: [100, 48], ft: 12, bf: [-24, 0] }, 'back'], [2, { spin: 40, tor: -24, head: 10, dx: 20, hy: 74, ff: [100, 48], ft: 12, bf: [-24, 0] }],
      [2.5, { spin: 16, ff: [30, 30], tor: -4, dx: 6, hy: 72 }], [3, {}]] }),
  // 连环撑（踢接踢）：换后腿再撑一脚
  yKick2: YM({ kind: 'kick', label: '连环撑', tag: '连环撑', flow: true, S: 4, A: 4, R: 10, dmg: 6, reach: 100, stun: 6, bstun: 8, kb: 3, stop: 5, shake: 3, power: .65,
    limb: 'bf', fx: 'kick', lunge: [1, 4, 12],
    keys: [[0, { ff: [30, 20] }], [0.5, { bf: [8, 40], ff: [26, 0], tor: 0, hy: 71 }],
      [1, { tor: -12, head: 6, dx: 18, hy: 73, tw: -16, bf: [92, 44], bt: 34, ff: [-2, 0] }, 'back'], [2, { tor: -12, head: 6, dx: 18, hy: 73, tw: -16, bf: [92, 44], bt: 34, ff: [-2, 0] }],
      [2.5, { bf: [10, 28], ff: [22, 0], tor: -2, dx: 8, hy: 71 }], [3, {}]] }),
  // 踩膝（连环撑再接踢）：提膝、往前下方一脚踩在对方膝盖上 —— 打倒（倒得近，你压他起身）
  yStompKnee: YM({ kind: 'kick', label: '踩膝', stamp: '踩膝', flow: true, S: 5, A: 4, R: 13, dmg: 9, reach: 96, stun: 14, bstun: 9, kb: 3, stop: 8, shake: 6, power: .9,
    limb: 'ff', fx: 'stomp', lunge: [1, 5, 10], launch: 3, lie: 22, ender: true, noCancel: true,
    keys: [[0, {}], [0.55, { ff: [28, 50], tor: -2, hy: 72, head: 4, bf: [-24, 0] }],
      [1, { tor: 12, head: -6, dx: 16, hy: 64, ff: [72, 12], bf: [-28, 0] }, 'out'], [2, { tor: 12, head: -6, dx: 16, hy: 64, ff: [72, 10], bf: [-28, 0] }], [3, {}]] }),
  // 转马撑（摊打、拍打以后按踢）：转马（脚跟一拧整个人侧过去），借着转的劲前腿横着撑出去 —— 打倒
  yTurnKick: YM({ kind: 'kick', label: '转马撑', stamp: '转马撑', flow: true, S: 5, A: 4, R: 14, dmg: 10, reach: 104, stun: 14, bstun: 10, kb: 6, stop: 9, shake: 7, power: 1,
    limb: 'ff', fx: 'whip', ghost: true, lunge: [1, 5, 12], launch: 5, ender: true, noCancel: true,
    keys: [[0, {}], [0.55, { spin: 56, ff: [16, 46], tor: 4, hy: 70, bf: [-22, 0] }],
      [1, { spin: 44, tor: -30, head: 12, dx: 32, hy: 74, ff: [106, 50], ft: 10, bf: [-20, 0] }, 'back'], [2, { spin: 44, tor: -30, head: 12, dx: 32, hy: 74, ff: [106, 50], ft: 10, bf: [-20, 0] }],
      [2.5, { spin: 20, ff: [30, 26], tor: -4, dx: 8, hy: 71 }], [3, {}]] }),

  /* ---- 拿 ---- */
  // 拉手：前手往前一探抓手腕。正好在对方出拳、出掌（前摇、判定里）的时候抓 = 把他的手拉过来（trap）：他失衡、往你怀里扑，你接一整套（顺）；
  // 抓站着不出手的人 = 擒住（后续：拳 = 拉打、踢 = 扫踢摔、重 / 按着后 = 转马摔、不按 = 推掌）。抓不到蹲着的；接不住腿（出腿的时候伸手 = 挨踢）
  grab: YM({ kind: 'grab', label: '拉手', open: true, trap: true, S: 4, A: 4, R: 13, dmg: 6, reach: 82, power: .4,
    limb: 'fh', lunge: [1, 4, 6],
    keys: [[0, {}], [0.5, { fh: [34, -8], fpa: -30, tw: 30 }],
      [1, { tor: 10, dx: 10, hy: 67, tw: 38, fh: [53, -4], fpa: 6, bh: [24, -2], ff: [34, 0], bf: [-28, 0] }, 'out'],
      [2, { tor: 10, dx: 10, hy: 67, tw: 38, fh: [53, -4], fpa: 6, bh: [24, -2], ff: [34, 0], bf: [-28, 0] }], [3, {}]] }),
  // 拉手（抓住对方打过来的手）：往回一拽、身子后坐，后手竖掌已经等着 —— 第 trapCancel 帧起能直接接拳、重（摊打）、踢
  yTrap: YM({ kind: 'script', label: '拉手', S: 0, A: 0, R: 12, script: true, trapPull: true,
    keys: [[0, { tor: 10, dx: 10, hy: 67, tw: 38, fh: [53, -4], fpa: 6, bh: [24, -2], ff: [34, 0], bf: [-28, 0] }],
      [0.35, { tor: -6, dx: -4, hy: 68, tw: -8, fh: [14, 8], fp: 0, bh: [34, -8], bpa: -80, ff: [28, 0], bf: [-36, 0] }, 'out'], [1, { tor: 0, dx: 0, hy: 68, tw: 10, fh: [24, 2], fp: 0, bh: [34, -6] }]] }),
  // 截腿（蹲 + 拿）：蹲下去两手往前下方一截 —— 接住地上的出腿（扫堂腿也接）= 截腿摔；抓蹲着的 = 按摔；站着的人抓不到
  lowGrab: YM({ kind: 'grab', label: '截腿', low: true, height: 'low', open: true, S: 6, A: 4, R: 15, dmg: 0, reach: 86, power: .5,
    limb: 'fh', lunge: [1, 6, 12],
    keys: [[0, Y_LOW], [0.5, YJ(Y_LOW, { hy: 46, tor: 22, fh: [26, 10], bh: [16, 14] })],
      [1, { hy: 42, tor: 36, dx: 18, head: -10, fh: [56, 38], fpa: 30, bh: [48, 42], bpa: 40, ff: [44, 0], bf: [-34, 0], tw: 10 }, 'out'],
      [2, { hy: 42, tor: 36, dx: 18, head: -10, fh: [56, 38], fpa: 30, bh: [48, 42], bpa: 40, ff: [44, 0], bf: [-34, 0], tw: 10 }], [3, Y_LOW]] }),
  // 擒住（抓腕）：一手扣住手腕、一手按住肘，往怀里带
  hold: YM({ kind: 'script', label: '擒住', S: 0, A: 0, R: 10, script: true,
    keys: [[0, { fh: [50, 0], fpa: 6, bh: [42, 6], bpa: 0, tor: 12, dx: 10, hy: 66, ff: [36, 0], bf: [-26, 0], tw: 20 }],
      [0.5, { fh: [36, 4], fpa: 6, bh: [32, 6], bpa: 0, tor: 6, dx: 4, hy: 67, ff: [32, 0], bf: [-30, 0], tw: 20 }],
      [1, { fh: [32, 4], fpa: 6, bh: [30, 4], bpa: 0, tor: 4, dx: 2, hy: 67, ff: [32, 0], bf: [-30, 0], tw: 20 }]] }),
  // 拉打（擒住后按拳）：前手拽着不放，后手连冲两拳
  knee: YM({ kind: 'script', label: '拉打', stamp: '拉打', S: 0, A: 0, R: 20, script: true, evHit: 4, evHit2: 11,
    keys: [[0, { fh: [32, 4], fpa: 6, bh: [22, 2], bp: 0, tor: 4, dx: 2, hy: 67, tw: 10 }],
      [0.18, { fh: [22, 8], fp: 0, bh: [54, -4], bp: 0, tor: 8, dx: 8, hy: 67, tw: -24 }, 'out'],
      [0.36, { fh: [24, 8], fp: 0, bh: [26, 0], bp: 0, tor: 4, dx: 4, hy: 67, tw: 0 }],
      [0.56, { fh: [20, 8], fp: 0, bh: [56, -4], bp: 0, tor: 10, dx: 10, hy: 66, tw: -28 }, 'out'],
      [0.75, { fh: [30, -6], bh: [32, 0], bp: 0, tor: 6, dx: 6, hy: 67, tw: 0 }], [1, {}]] }),
  // 扫踢摔（擒住后按踢）：拽着手往旁边一带，前脚贴地一扫他的脚踝，人往后仰倒在面前
  trip: YM({ kind: 'script', label: '扫踢摔', stamp: '扫踢摔', S: 0, A: 0, R: 22, script: true, evSlam: 9,
    keys: [[0, { fh: [32, 4], fpa: 6, bh: [30, 4], bpa: 0, tor: 4, dx: 2, hy: 67, tw: 20 }],
      [0.25, { fh: [16, 10], fp: 0, bh: [40, -6], bpa: 0, tor: -6, dx: 4, hy: 66, ff: [52, 10], bf: [-26, 0], tw: 10, ft: 20 }],
      [0.4, { fh: [10, 14], fp: 0, bh: [52, 10], bpa: 40, tor: 18, dx: 14, hy: 60, ff: [66, 2], bf: [-30, 0], tw: 10, ft: 30 }, 'out'],
      [0.6, { fh: [16, 12], fp: 0, bh: [48, 16], bpa: 50, tor: 20, dx: 12, hy: 60, ff: [58, 0], bf: [-32, 0], tw: 10 }], [1, {}]] }),
  // 转马摔（擒住后按重、按着后）：一拧腰转马，把人从身前带过去甩到身后（人走的路线和过肩摔一样，见 fighter.js THROW_PATH）
  throwBack: YM({ kind: 'script', label: '转马摔', S: 0, A: 0, R: 30, script: true, evSlam: 14,
    keys: [[0, { fh: [34, 4], fpa: 6, bh: [28, 6], bpa: 0, tor: 14, hy: 62, head: -4, ff: [34, 0], bf: [-32, 0], tw: 20 }],
      [0.13, { fh: [16, 2], fp: 0, bh: [10, 6], bp: 0, tor: 8, hy: 56, dx: 2, head: -2, ff: [34, 0], bf: [-34, 0], tw: 40 }],
      [0.3, { fh: [2, -50], fp: 0, bh: [-8, -46], bp: 0, fe: -1, be: -1, tor: -12, head: -16, hy: 70, dx: -4, ff: [30, 0], bf: [-36, 0], tw: -30, spin: 20 }],
      [0.47, { fh: [-40, 22], fp: 0, bh: [-46, 26], bp: 0, tor: -30, head: -16, hy: 58, dx: -10, ff: [40, 0], bf: [-28, 0], tw: -60, spin: 30 }, 'out'],
      [0.62, { fh: [-36, 26], fp: 0, bh: [-42, 30], bp: 0, tor: -26, head: -12, hy: 58, dx: -8, ff: [40, 0], bf: [-28, 0], tw: -50, spin: 20 }], [1, {}]] }),
  // 推掌（擒住后什么都不按）：两只掌往前一推，把人推出去（自己先动一点）
  grabHit: YM({ kind: 'script', label: '推掌', S: 0, A: 0, R: 16, script: true, evPush: 4,
    keys: [[0, { fh: [32, 4], fpa: 6, bh: [30, 4], bpa: 0, tor: 6, dx: 2, hy: 66, tw: 14 }],
      [0.25, { fh: [62, -6], fpa: -84, bh: [58, 6], bpa: -70, tor: 26, dx: 20, hy: 64, ff: [42, 0], bf: [-20, 0], tw: 10 }, 'back'],
      [0.5, { fh: [62, -6], fpa: -84, bh: [58, 6], bpa: -70, tor: 26, dx: 20, hy: 64, ff: [42, 0], bf: [-20, 0], tw: 10 }], [1, {}]] }),
  // 截腿摔（截腿接住地上的出腿）：两手抄住小腿往上一掀、肩往前一顶，人仰面摔倒
  scoop: YM({ kind: 'script', label: '截腿摔', S: 0, A: 0, R: 26, script: true, evSlam: 12,
    keys: [[0, { hy: 42, tor: 36, dx: 18, head: -10, fh: [56, 38], fpa: 30, bh: [48, 42], bpa: 40, ff: [44, 0], bf: [-34, 0], tw: 10 }],
      [0.3, { hy: 60, tor: 12, dx: 10, head: -12, fh: [44, -8], fpa: -40, bh: [38, -2], bpa: -40, ff: [42, 0], bf: [-32, 0], tw: 10 }],
      [0.5, { hy: 66, tor: 22, dx: 18, head: -4, fh: [56, -12], fpa: -80, bh: [50, 2], bpa: -60, ff: [46, 0], bf: [-30, 0], tw: 10 }, 'out'],
      [0.7, { hy: 66, tor: 16, dx: 14, fh: [48, -10], fpa: -80, bh: [42, 0], bpa: -70, ff: [42, 0], bf: [-32, 0], tw: 14 }], [1, {}]] }),
  // 按摔（截腿抓住蹲着的人）：两手按住他肩背往下一按、往前一推，人趴倒
  tackle: YM({ kind: 'script', label: '按摔', S: 0, A: 0, R: 26, script: true, evSlam: 10,
    keys: [[0, { hy: 42, tor: 36, dx: 18, head: -10, fh: [56, 38], fpa: 30, bh: [48, 42], bpa: 40, ff: [44, 0], bf: [-34, 0], tw: 10 }],
      [0.3, { hy: 56, tor: 30, dx: 22, head: -6, fh: [50, 20], fpa: 70, bh: [44, 24], bpa: 70, ff: [52, 0], bf: [-38, 0], tw: 10 }],
      [0.45, { hy: 52, tor: 40, dx: 28, head: -2, fh: [56, 40], fpa: 80, bh: [50, 44], bpa: 80, ff: [56, 0], bf: [-38, 0], tw: 10 }, 'out'],
      [0.65, { hy: 56, tor: 30, dx: 24, fh: [50, 30], fpa: 60, bh: [44, 34], bpa: 60, ff: [52, 0], bf: [-38, 0], tw: 10 }], [1, {}]] }),
  // （迎春拳站着的拉手接不住腿，用不到接腿摔；留着一样的动作给破招练习、测试这些按名字找的地方）
  legCatch: YM({ kind: 'script', label: '截腿摔', S: 0, A: 0, R: 26, script: true, evSlam: 13,
    keys: [[0, { fh: [50, 30], fpa: 30, bh: [44, 34], bpa: 30, tor: 24, dx: 14, hy: 64, tw: 10 }],
      [0.3, { fh: [44, -8], fpa: -40, bh: [38, -2], bpa: -40, tor: 4, dx: 8, hy: 68, head: -10, tw: 10 }],
      [0.5, { fh: [56, -12], fpa: -80, bh: [50, 2], bpa: -60, tor: 22, dx: 18, hy: 66, tw: 10 }, 'out'],
      [0.7, { fh: [48, -10], fpa: -80, bh: [42, 0], bpa: -70, tor: 16, dx: 14, hy: 66, tw: 14 }], [1, {}]] }),

  /* ---- 跳起来（上段：蹲着挡不住；飞撑能蹲下躲） ---- */
  // 飞身冲拳：跳起来一拳从上往前下方冲下去
  airJab: YM({ kind: 'jab', label: '飞身冲拳', tier: 'air', lead: 'light', height: 'high', open: true, S: 4, A: 11, R: 6, dmg: 6, reach: 94, vreach: AIR_VREACH, stun: 15, bstun: 9, kb: 2.4, stop: 5, power: .45,
    limb: 'fh', fx: 'airSwing', air: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.55, J_(JT, { rot: 2, tor: 4, fh: [22, -4], fp: 0, bh: [20, 6], tw: 20 })],
      [1, { rot: 18, tor: 24, head: -6, dx: 6, fh: [56, 12], fp: 0, bh: [24, 6], ff: [16, 42], bf: [-28, 28], tw: 30 }, 'back'],
      [2, { rot: 20, tor: 26, head: -6, dx: 6, fh: [54, 15], fp: 0, bh: [24, 6], ff: [16, 42], bf: [-28, 28], tw: 30 }], [3, JD]] }),
  // 落掌：跳起来后手掌举过头，整个人往前下方扑下去一掌劈下
  airHeavy: YM({ kind: 'heavy', label: '落掌', stamp: '落掌', tier: 'air', lead: 'heavy', height: 'high', open: true, S: 8, A: 10, R: 9, dmg: 10, reach: 100, vreach: AIR_VREACH, stun: 18, bstun: 11, kb: 4.5, stop: 8, shake: 5, power: .9, heavy: true,
    limb: 'bh', fx: 'hammer', air: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.7, { rot: -6, tor: -22, head: -10, bh: [-8, -56], bpa: -70, be: -1, fh: [24, -20], ff: [18, 54], bf: [2, 48], tw: -20 }],
      [1, { rot: 24, tor: 42, head: 12, dx: 12, bh: [52, 32], bpa: 50, fh: [30, 8], ff: [22, 26], bf: [-24, 36], tw: -20 }, 'out'],
      [2, { rot: 26, tor: 44, head: 12, dx: 12, bh: [50, 36], bpa: 56, fh: [30, 8], ff: [22, 26], bf: [-24, 36], tw: -20 }], [3, JD]] }),
  // 飞撑：跳起来收膝、一脚往前下方撑出去（蹲下躲得开）
  airKick: YM({ kind: 'kick', label: '飞撑', stamp: '飞撑', tier: 'air', lead: 'kick', height: 'high', open: true, S: 7, A: 11, R: 8, dmg: 9, reach: 110, vreach: AIR_VREACH, stun: 17, bstun: 10, kb: 5, stop: 7, shake: 4, power: .85,
    limb: 'ff', fx: 'airKick', air: true, ghost: true, evadeCrouch: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.6, { rot: -6, tor: 10, head: -4, ff: [10, 60], bf: [-6, 46], fh: [34, -16], bh: [18, -6], tw: 10 }],
      [1, { rot: 12, tor: -32, head: 12, dx: 16, ff: [98, 26], ft: 30, bf: [-14, 50], fh: [30, -14], bh: [16, -6], tw: 10 }, 'back'],
      [2, { rot: 12, tor: -32, head: 12, dx: 16, ff: [98, 26], ft: 30, bf: [-14, 50], fh: [30, -14], bh: [16, -6], tw: 10 }], [3, JD]] }),
  // 落膝（空中蹲 + 踢）：先往上一腾，再把膝盖往前下方砸下去（主系「坠」：专破蹲着的、对空；怕站着的拳）
  dive: YM({ kind: 'kick', label: '落膝', stamp: '落膝', tier: 'dive', lead: 'kick', height: 'high', S: 13, A: 40, R: 8, dmg: 9, reach: 80, vreach: 64, stun: 18, bstun: 10, kb: 2, stop: 8, shake: 6, power: .9,
    limb: 'ff', fx: 'dive', air: true, ghost: true, dive: true, aaProof: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.7, { rot: -6, tor: 10, head: 4, ff: [20, 58], bf: [-10, 46], fh: [24, -30], bh: [-16, -26], tw: 0 }],
      [1, { rot: -34, tor: 16, head: 10, ff: [40, 32], bf: [-22, 30], fh: [-14, -28], bh: [-30, -12], tw: 0 }, 'out'],
      [2, { rot: -34, tor: 16, head: 10, ff: [40, 32], bf: [-22, 30], fh: [-14, -28], bh: [-30, -12], tw: 0 }], [3, JD]] }),

  /* ---- 防守反击、身法 ---- */
  // 截打（挡着、挡住的硬直里按拳）：从挡里直接一掌截出去（出手前几帧打击无敌）—— 打中了接着连（顺）；打空了收招长
  shove: YM({ kind: 'jab', label: '截打', stamp: '截打', flow: true, S: 2, A: 3, R: 13, dmg: 5, reach: 88, stun: 12, bstun: 7, kb: 1.6, stop: 5, shake: 2, power: .45,
    limb: 'fh', fx: 'jab', lunge: [0, 2, 8], sinv: [0, 4],
    keys: [[0, { hy: 68, tor: 0, head: 6, dx: -3, tw: 14, fh: [26, -16], fpa: -88, bh: [20, -8], bpa: -84 }],
      [1, { tor: 8, dx: 12, hy: 67, tw: 30, fh: [56, -8], fpa: -82, bh: [22, -4], ff: [34, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 8, dx: 12, hy: 67, tw: 30, fh: [56, -8], fpa: -82, bh: [22, -4], ff: [34, 0], bf: [-30, 0] }], [3, {}]] }),
  // 钉脚（蹲挡住下段的腿以后按踢）：提膝、脚跟往前下方一钉，钉在对方伸出来的腿上 —— 打倒
  stomp: YM({ kind: 'kick', label: '钉脚', stamp: '钉脚', height: 'low', flow: true, S: 4, A: 4, R: 13, dmg: 11, reach: 118, stun: 15, bstun: 9, kb: 4, stop: 9, shake: 6, power: .9,
    limb: 'ff', fx: 'stomp', lunge: [1, 4, 22], launch: 4, lie: 25, ender: true, noCancel: true,
    keys: [[0, Y_LOW], [0.6, { hy: 72, tor: -6, head: 6, dx: 4, ff: [30, 60], bf: [-22, 0] }],
      [1, { hy: 62, tor: 18, head: -8, dx: 22, ff: [76, 4], bf: [-26, 0] }, 'out'], [2, { hy: 62, tor: 18, head: -8, dx: 22, ff: [76, 2], bf: [-26, 0] }], [3, {}]] }),
  // 追形（冲刺）：压低身子、两只掌还护在前面，贴着地往前一窜（和传统格斗一样前 8 帧谁都碰不到）
  dash: YM({ kind: 'script', label: '追形', S: 0, A: 0, R: 16, script: true, lunge: [0, 10, 96], inv: [0, 8],
    keys: [[0, { hy: 62, tor: 14, head: -2, ff: [32, 0], bf: [-28, 0], tw: 24 }],
      [0.12, { hy: 58, tor: 22, head: -6, dx: 8, ff: [50, 8], bf: [-60, 12], fh: [46, -4], bh: [28, 2], tw: 24 }, 'out'],
      [0.45, { hy: 56, tor: 20, head: -4, dx: 10, ff: [52, 2], bf: [-60, 6], fh: [46, -4], bh: [28, 2], tw: 24 }],
      [0.7, { hy: 62, tor: 10, head: -2, dx: 4, ff: [40, 0], bf: [-42, 0], fh: [46, -8], bh: [24, 0], tw: 26 }], [1, {}]] }),
  // 转马（闪身：按着挡朝对手双击）：脚跟一拧侧过身、压低，从他身边转过去（和传统格斗一样只躲得过重拳；躲过了自动转马掌）
  slip: YM({ kind: 'script', label: '转马', S: 0, A: 0, R: 22, script: true, lunge: [0, 11, 110], slipInv: [0, 11],
    keys: [[0, { hy: 60, tor: 14, head: 4, dx: -2, fh: [30, -16], fpa: -86, bh: [24, -8], tw: 14, ff: [30, 0], bf: [-32, 0] }],
      [0.14, { hy: 48, tor: 32, head: -4, dx: 12, spin: 30, fh: [30, -14], bh: [26, -6], tw: 14, ff: [50, 6], bf: [-52, 12] }, 'out'],
      [0.48, { hy: 48, tor: 30, head: -4, dx: 12, spin: 30, fh: [30, -14], bh: [26, -6], tw: 14, ff: [48, 2], bf: [-54, 8] }],
      [0.72, { hy: 64, tor: 10, head: 6, dx: 2, spin: 10, fh: [30, -16], bh: [24, -8], tw: 14, ff: [28, 0], bf: [-32, 0] }], [1, {}]] }),
  // 转马掌（转马躲过重拳、转到他身后，自动出）：还背对着他（spin 165），一拧转过来，前手一掌拍在他背上 —— 他背对着你踉跄
  slipElbow: YM({ kind: 'heavy', label: '转马掌', stamp: '转马掌', tier: 'heavy', lead: 'heavy', S: 5, A: 3, R: 12, dmg: 10, reach: 86, stun: 18, bstun: 10, kb: STAGGER_KB,
    stop: 8, shake: 4, power: .8, limb: 'fh', fx: 'slipElbow', ghost: true, lunge: [0, 5, 18], stagger: true, ender: true, noCancel: true,
    keys: [[0, { spin: 165, tor: 20, hy: 58, head: 2, fh: [30, -14], bh: [24, -6], ff: [30, 0], bf: [-32, 0], tw: 0 }],
      [0.55, { spin: 95, tor: 4, hy: 66, head: -4, dx: -4, fh: [16, -6], fpa: -70, bh: [20, -4], ff: [24, 0], bf: [-36, 0], tw: -20 }],
      [1, { spin: 8, tor: 14, dx: 22, hy: 65, head: -4, fh: [55, -4], fpa: -80, bh: [22, -2], ff: [44, 0], bf: [-32, 0], tw: 40 }, 'back'],
      [2, { spin: 4, tor: 14, dx: 22, hy: 65, head: -4, fh: [55, -4], fpa: -80, bh: [22, -2], ff: [44, 0], bf: [-32, 0], tw: 40 }], [3, {}]] }),
  // 爆气（挨打时按重 + 踢，花半格气）：两只掌往外一撑，从身上炸开（和传统格斗一样把对方炸倒）
  burst: YM({ kind: 'script', label: '爆气', S: 0, A: 0, R: 22, script: true, inv: [0, 18], evWave: 3,
    keys: [[0, { tor: 24, hy: 54, head: 10, fh: [16, 10], bh: [10, 12], tw: 0 }],
      [0.14, { tor: -12, head: -16, hy: 76, fh: [50, -14], fpa: -84, bh: [-34, -10], bpa: -100, ff: [40, 0], bf: [-42, 0], air: 6, tw: 0 }, 'out'],
      [0.5, { tor: -10, head: -14, hy: 74, fh: [48, -12], fpa: -84, bh: [-32, -8], bpa: -100, ff: [40, 0], bf: [-42, 0], air: 2, tw: 0 }], [1, {}]] }),
  // 连环寸拳（大招，气满按重 + 踢）：往下一沉、拳贴着胸口（出手前几帧打击无敌），第一拳打中 = 一串左右交替的连环寸拳把人钉住，
  // 最后一记寸劲（霸体挡不住）把人打飞。第一拳被挡 = 后面不打了，收招很长（挡住的人罚 ×1.5）；打空同样
  super: YM({ kind: 'heavy', label: '连环寸拳', stamp: '连环寸拳', tier: 'super', S: 6, A: 3, R: 20, dmg: 4, reach: 92, stun: 20, bstun: 14, kb: 1, stop: 5, shake: 4, power: 1, heavy: true,
    limb: 'fh', fx: 'rush', ghost: true, lunge: [1, 6, 14], sinv: [0, 6], cost: QI_MAX, launch: 6, ender: true, noCancel: true, antiAir: 40,
    flurry: { n: 10, every: 2.25, dmg: 4, last: 20, kb: 1.2, lastKb: 9 }, pierce: true,
    keys: [[0, {}], [0.4, { tor: 2, dx: -4, hy: 63, tw: 10, fh: [26, 0], fp: 0, bh: [18, 4], bp: 0, ff: [30, 0], bf: [-34, 0] }, 'out'],
      [1, YJ(Y_PF, { dx: 12, hy: 64, fh: [56, -4] }), 'back'], [2, YJ(Y_PF, { dx: 12, hy: 64, fh: [56, -4] })], [3, {}]] }),
};
// 连环寸拳打中以后那一串：左右手交替（fighter.js target 按第几拳在这两个之间换）；最后一记寸劲用 yInch 打中的样子
const Y_FLURRY = [ymk(YJ(Y_PF, { dx: 14, hy: 64, tor: 10, fh: [56, -6] })), ymk(YJ(Y_PR, { dx: 14, hy: 64, tor: 10, bh: [56, -6] }))];
const Y_FLURRY_END = ymk({ tor: 16, dx: 20, hy: 62, head: -2, tw: -36, bh: [58, -2], bp: 0, fh: [30, -3], fpa: -86, ff: [46, 0], bf: [-30, 0] });

/* 迎春拳自己的架势（fighter.js target 用；没写的照传统格斗的 POSE：跑、跳、挨打、躺……） */
const YPOSE = {
  // 待机：問手 + 護手（参考图第一张）
  stance: ymk({ hy: 70 }),
  crouch: ymk(Y_LOW),
  // 挡：两只掌竖起来挡在脸前、胸前（Jack：咏春的挡得是手掌竖起来挡）
  block: ymk({ hy: 68, tor: 0, head: 6, dx: -3, tw: 14, fh: [26, -16], fpa: -88, bh: [20, -8], bpa: -84, ff: [26, 0], bf: [-32, 0] }),
  cblock: ymk({ hy: 50, tor: 16, head: 6, tw: 10, ff: [26, 0], bf: [-25, 0], fh: [22, -10], fpa: -88, bh: [18, -4], bpa: -84 }),
  // 卸开、拍开以后那一下：前手还往外拨着
  parry: ymk({ tor: -2, head: 6, dx: -4, hy: 69, tw: 30, fh: [46, -14], fpa: -50, bh: [22, -2] }),
  // 赢了：抱拳（左掌盖右拳）
  win: ymk({ tor: 0, head: -6, hy: 74, tw: 0, fh: [22, -8], fp: 0, bh: [24, -8], bpa: -90, ff: [20, 0], bf: [-24, 0] }),
};

/* ---------- 连招变招 ----------
   拳一直按：冲拳 → 冲拳（后手）→ 立掌（前手）→ 冲拳（后手）→ 冲拳（前手）→ 立掌（后手）→ 冲拳（前手）→ 寸拳（第 8 下，打倒）
   重：单出 = 拍手（按住 = 盘手）；蹲 = 耕手；拳、踢打出去以后（或者拍开、拉住以后）= 摊打 → 拍打 → 蝴蝶掌
   踢：单出 = 正撑脚；蹲 = 截膝；拳后 = 侧撑；踢后 = 连环撑 → 踩膝；摊打 / 拍打后 = 转马撑
   整串一共最多 8 下（第 8 下按什么都是那一键的收势：寸拳 / 蝴蝶掌 / 踩膝），不会没完没了地连下去 */
const Y_CHAIN = ['yJab', 'yJabR', 'yPalmF', 'yJabR', 'yJabF', 'yPalmR', 'yJabF', 'yInch'];
const Y_CHAIN_MAX = 8;
const Y_AIR_OF = { jab: 'airJab', heavy: 'airHeavy', kick: 'airKick' };
const Y_DOWN_OF = { jab: 'yLowJab', heavy: 'yGaun', kick: 'yLowKick', grab: 'lowGrab' };
function yVariant(kind, chain, air, mod) {
  if (air) return mod === 'down' && kind === 'kick' ? 'dive' : Y_AIR_OF[kind] || null;
  if (mod === 'down') return Y_DOWN_OF[kind];
  const run = k => { let n = 0; for (let i = chain.length - 1; i >= 0 && chain[i] === k; i--) n++; return n; };
  const last = chain[chain.length - 1], n = chain.filter(c => c !== 'pc').length, end = n >= Y_CHAIN_MAX - 1;
  if (kind === 'grab') return 'grab';
  if (kind === 'jab') {
    if (end) return 'yInch';
    if (!chain.length) return 'yJab';
    if (last === 'pc') return 'yJabR';                         // 拍开 / 拉住以后：后手冲拳（一手拍一手打：前手还拨着他的手）
    const j = run('jab'), before = chain[chain.length - 1 - j];
    let h = 0; for (let i = chain.length - 1 - j; i >= 0 && chain[i] === 'heavy'; i--) h++;
    // 这一串拳的第一拳用哪只手：踢完、摊打（后手打）完 → 前手；拍开以后、拍打（前手打）完 → 后手。之后左右交替，照 Y_CHAIN 往下排
    const backFirst = before === 'pc' || (before === 'heavy' && h % 2 === 0);
    if (j === 0) return backFirst ? 'yJabR' : 'yJabF';
    let i = j + (backFirst ? 1 : 0);
    if (i > Y_CHAIN.length - 2) i = Y_CHAIN.length - 3 + (i - (Y_CHAIN.length - 3)) % 2;   // 排到头了：最后两下（后手立掌、前手冲拳）来回换
    return Y_CHAIN[i];
  }
  if (kind === 'heavy') {
    if (!chain.length) return 'yPat';
    if (end) return 'yButterfly';
    const h = run('heavy');
    return h === 0 ? 'yTan' : h === 1 ? 'yPak' : 'yButterfly';
  }
  if (kind === 'kick') {
    if (!chain.length || last === 'pc') return 'yKick';
    if (end) return 'yStompKnee';
    if (last === 'heavy') return 'yTurnKick';
    if (last === 'jab') return 'ySideKick';
    return run('kick') >= 2 ? 'yStompKnee' : 'yKick2';
  }
  return null;
}
// 取消：打中 / 被挡以后在收招里能接哪一类（拍手、耕手、盘手这些 guard 招的取消另外算，见 fighter.js canCancel）
const Y_CANCEL = { jab: ['jab', 'heavy', 'kick', 'grab'], heavy: ['jab', 'heavy', 'kick', 'grab'], kick: ['jab', 'heavy', 'kick'], grab: [], push: [], guard: [] };
/* 交手（两边同时打中）：主系、起手照「拳 > 腿 > 重 > 拳」那一套（和传统格斗同一套系别），另外两条迎春拳自己的：
   · 截膝（stopKick）专截地上的出腿：撞上地上的腿 = 截膝赢（克）；
   · 摊打、拍打、蝴蝶掌（cross）一手化一手打：撞上拳系 = 它赢（克） */
function yRules(a, b) {
  const groundKick = d => d.tier === 'kick' && !d.air && !d.stopKick;
  if (a.stopKick && groundKick(b)) return 1;
  if (b.stopKick && groundKick(a)) return -1;
  if (a.cross && b.tier === 'light' && !b.cross) return 1;
  if (b.cross && a.tier === 'light' && !a.cross) return -1;
  return 0;
}
function yRelation(a, b) { return yRules(a, b) || relation(a, b); }
// 动作台（poses.html）、测试量「打中时拳脚碰没碰到」用的：分组、要量的招
const Y_BENCH_GROUPS = [
  ['拳', ['yJab', 'yJabR', 'yJabF', 'yPalmF', 'yPalmR', 'yInch', 'yLowJab', 'shove']],
  ['重（化 · 摊打）', ['yPat', 'yRoll', 'yGaun', 'yTan', 'yPak', 'yButterfly', 'slipElbow', 'super']],
  ['踢', ['yKick', 'yLowKick', 'ySideKick', 'yKick2', 'yStompKnee', 'yTurnKick', 'stomp']],
  ['跳起来', ['airJab', 'airHeavy', 'airKick', 'dive']],
  ['拿、摔', ['grab', 'yTrap', 'lowGrab', 'hold', 'grabHit', 'knee', 'trip', 'throwBack', 'tackle', 'scoop']],
  ['身法', ['dash', 'slip', 'burst']],
];
STYLES.ying = { id: 'ying', name: '迎春拳', moves: YMOVES, relation: yRelation, cancel: Y_CANCEL, variant: yVariant, poses: YPOSE,
  chainMax: Y_CHAIN_MAX, blockHeavy: 'yPat', base: YBASE,
  benchGroups: Y_BENCH_GROUPS, benchHit: ['yJab', 'yJabR', 'yJabF', 'yPalmF', 'yPalmR', 'yInch', 'yLowJab', 'shove', 'yTan', 'yPak', 'yButterfly', 'slipElbow', 'super',
    'yKick', 'yLowKick', 'ySideKick', 'yKick2', 'yStompKnee', 'yTurnKick', 'stomp', 'airJab', 'airHeavy', 'airKick', 'dive'] };
/* 跨派：传统格斗 × 迎春拳（relation(传统的招, 迎春的招)：1 传统赢 / -1 迎春赢 / ±0.5 压 / 0 平）。
   两派的招都按同一套系别写（拳 / 重 / 腿 / 对空 / 空 / 坠 / 必杀 / 拿），所以主系、起手照两派共用的那一套比；
   多出来的就是上面迎春拳自己那两条（截膝截腿、摊打化拳）—— 传统格斗没有这种招，反过来的不用写 */
MATCHUPS['trad|ying'] = { relation(dT, dY) { return yRules(dT, dY) || relation(dT, dY); } };
