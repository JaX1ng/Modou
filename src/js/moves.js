'use strict';
/* 招式表：每一招的前摇/判定/后摇帧数、伤害、射程、关键帧姿势；连招变招 pickVariant；克制关系 TIER_WIN / relation */

/* ============================================================
   招式表
   S 前摇 / A 判定 / R 后摇（帧）, reach = 两人中心距
   tier 主系（这一下是什么劲）：light 拳 / heavy 重 / kick 腿 / air 空 / aa 对空 / super 必杀
   lead 起手（这套连段从什么起的）：单招的起手就是自己；拳→重 的崩拳起手是拳
   height 打点：mid 中段（站挡蹲挡都能挡）/ low 下段（只能蹲挡）/ high 上段（只能站挡）
   armor 霸体 {n 能硬吃几下, from 前摇第几帧起, vs 能吃哪些系}；inv 全无敌帧 / sinv 打击无敌帧 / airInv 对空中招无敌帧
   ender 收招（打完连段清零）；launch 击倒；launchAir 只把空中的对手打倒；vreach 空中招往下能打多远
   keys 关键帧按「阶段」写：0 起手 → 1 出手（判定开始）→ 2 判定结束 → 3 收招完。改 S/A/R 动画自动跟着变
        script 动作（擒拿后续、撤步…）的 keys 写 0~1，表示整段动作的进度
   1.8.0：这里写的帧数是「基准帧数」，M() 统一乘节奏 TEMPO 取整（config.js），帧数表显示的是换算后的
   2.0：open = 起手招（从中立出的第一招）：前摇、后摇按 TFO 换算（比别的招再慢一点，看得清；前后摇一起长 = 平等）；
        lie（倒地多久）按 TFH 换算（挨了打的后摇改回 1.9.2 的节奏）
   ============================================================ */
const TIER_OF_KIND = { jab: 'light', heavy: 'heavy', kick: 'kick' };
const TIME_KEYS = ['S', 'A', 'R', 'stun', 'bstun', 'evThrow', 'evPush', 'evSlam', 'evWave', 'evHit', 'evHit2'];
function M(o) {
  o.base = { S: o.S, A: o.A, R: o.R };          // 换算前的基准帧数（测试核对节奏用）
  for (const k of TIME_KEYS) if (typeof o[k] === 'number' && o[k] > 0) o[k] = (o.open && (k === 'S' || k === 'R') ? TFO : TF)(o[k]);
  if (o.lie) o.lie = TFH(o.lie);
  for (const k of ['inv', 'sinv', 'airInv', 'slipInv']) if (o[k]) o[k] = o[k].map(TF);
  if (o.lunge) o.lunge = [TF(o.lunge[0]), TF(o.lunge[1]), o.lunge[2]];
  if (o.armor) o.armor = Object.assign({}, o.armor, { from: TF(o.armor.from) });
  o.tier = o.tier || TIER_OF_KIND[o.kind] || o.kind;
  o.lead = o.lead || o.tier;
  o.height = o.height || 'mid';
  const at = o.script ? p => p * o.R : p => p <= 1 ? p * o.S : p <= 2 ? o.S + (p - 1) * o.A : o.S + o.A + (p - 2) * o.R;
  o.keys = o.keys.map(([p, pose, e]) => [at(p), mk(pose), e || 'io']);
  return o;
}
const J_ = (base, o) => Object.assign({}, base, o);
const JT = P_JTOP, JD = P_JDN;

// 常用姿势片段
const P_JAB = { tor: 26, dx: 12, head: -12, fh: [62, -12], bh: [4, -22], ff: [36, 0], bf: [-30, 0] };
const P_CROSS = { tor: 32, dx: 14, head: -12, bh: [64, -10], fh: [4, -24], bf: [-34, 0], ff: [32, 0] };
const P_HEAVY = { tor: 42, dx: 30, hy: 50, head: -8, bh: [72, -8], fh: [-2, 8], ff: [48, 0], bf: [-42, 0] };   // 后手冲出去，前手收到腰间
const P_KICK = { ff: [98, 66], tor: -36, dx: 26, bf: [-8, 0], fh: [-12, -26], bh: [-26, 0], head: 12 };
const P_LOW = { hy: 36, tor: 32, head: -12, ff: [34, 0], bf: [-30, 0] };

const MOVES = {
  /* ---- 拳系（light）：快，近身抢先；被重拳霸体吃掉，但能打断腿 ---- */
  // 短拳：前手从胸口直接往前弹出去，第一帧就往前走、不往回收（1.7.0：以前也先往回收一下，和重拳的起手分不清）
  jab: M({ kind: 'jab', label: '短拳', open: true, S: 4, A: 3, R: 7, dmg: 5, reach: 92, stun: 13, bstun: 7, kb: 2.2, stop: 4, power: .3,
    limb: 'fh', fx: 'jab', lunge: [1, 4, 5],
    keys: [[0, {}], [1, P_JAB, 'back'], [2, P_JAB], [3, {}]] }),
  jab2: M({ kind: 'jab', label: '后手直拳', tag: '后手直拳', S: 4, A: 3, R: 7, dmg: 5, reach: 94, stun: 13, bstun: 7, kb: 2.4, stop: 4, power: .35,
    limb: 'bh', fx: 'jab2', lunge: [1, 4, 6],
    keys: [[0, {}], [0.4, { bh: [2, 0], fh: [26, -6], tor: 4, dx: -2 }], [1, P_CROSS, 'back'], [2, P_CROSS], [3, {}]] }),
  jab3: M({ kind: 'jab', label: '摆拳', tag: '摆拳', S: 5, A: 3, R: 8, dmg: 6, reach: 90, stun: 14, bstun: 8, kb: 2.8, stop: 5, power: .4,
    limb: 'fh', fx: 'hook', lunge: [1, 5, 5],
    keys: [[0, {}], [0.5, { fh: [-8, -14], fe: -1, tor: -4, dx: -4, head: 4 }], [1, { fh: [44, -18], fe: -1, tor: 36, dx: 10, head: -14, ff: [36, 0], bf: [-30, 0] }, 'back'],
      [2, { fh: [48, -10], fe: -1, tor: 40, dx: 10, head: -14, ff: [36, 0], bf: [-30, 0] }], [3, {}]] }),
  rushL: M({ kind: 'jab', label: '连珠快拳', S: 3, A: 3, R: 6, dmg: 4, reach: 94, stun: 13, bstun: 7, kb: 2.4, stop: 3, power: .3,
    limb: 'fh', fx: 'rush', ghost: true, lunge: [1, 3, 13], rush: true,
    keys: [[0, { tor: 20 }], [1, J_(P_JAB, { tor: 28, dx: 14, fh: [64, -8] }), 'back'], [2, J_(P_JAB, { tor: 28, dx: 14, fh: [64, -8] })], [3, { tor: 20 }]] }),
  rushR: M({ kind: 'jab', label: '连珠快拳', S: 3, A: 3, R: 6, dmg: 4, reach: 94, stun: 13, bstun: 7, kb: 2.4, stop: 3, power: .3,
    limb: 'bh', fx: 'rush', ghost: true, lunge: [1, 3, 13], rush: true,
    keys: [[0, { tor: 20 }], [1, J_(P_CROSS, { tor: 30, dx: 15 }), 'back'], [2, J_(P_CROSS, { tor: 30, dx: 15 })], [3, { tor: 20 }]] }),
  rushEnd: M({ kind: 'jab', label: '寸劲', tag: '寸劲', S: 5, A: 3, R: 12, dmg: 7, reach: 96, stun: 16, bstun: 10, kb: 9, stop: 7, shake: 4, power: .7,
    limb: 'fh', fx: 'rushEnd', ghost: true, lunge: [1, 5, 8], ender: true, noCancel: true,
    keys: [[0, { tor: 10, dx: -6, fh: [4, -6] }], [1, { tor: 40, dx: 22, hy: 52, head: -14, fh: [66, -4], bh: [-10, -10], ff: [46, 0], bf: [-34, 0] }, 'back'],
      [2, { tor: 40, dx: 22, hy: 52, head: -14, fh: [66, -4], bh: [-10, -10], ff: [46, 0], bf: [-34, 0] }], [3, {}]] }),
  lowJab: M({ kind: 'jab', label: '下盘拳', open: true, S: 5, A: 3, R: 8, dmg: 4, reach: 88, stun: 12, bstun: 7, kb: 2, stop: 4, power: .3, height: 'low',
    limb: 'fh', fx: 'low', lunge: [1, 5, 4],
    keys: [[0, J_(P_LOW, { fh: [24, -10] })], [1, J_(P_LOW, { tor: 40, dx: 10, fh: [58, 26], bh: [8, -14] }), 'back'],
      [2, J_(P_LOW, { tor: 40, dx: 10, fh: [58, 26], bh: [8, -14] })], [3, J_(P_LOW, { fh: [24, -10] })]] }),
  // 重→拳：贴身顶肘
  elbow: M({ kind: 'jab', label: '顶肘', tag: '顶肘', lead: 'heavy', S: 4, A: 3, R: 9, dmg: 7, reach: 84, stun: 14, bstun: 8, kb: 4, stop: 5, shake: 2, power: .5,
    limb: 'fe', fx: 'elbow', lunge: [1, 4, 10],
    keys: [[0, { tor: 20 }], [0.5, { tor: 4, dx: -4, fh: [6, -24], fe: -1 }],
      [1, { tor: 38, dx: 22, hy: 52, head: -10, fh: [8, 0], fe: -1, bh: [4, -16], ff: [46, 0], bf: [-30, 0] }, 'back'],
      [2, { tor: 38, dx: 22, hy: 52, head: -10, fh: [8, 0], fe: -1, bh: [4, -16], ff: [46, 0], bf: [-30, 0] }], [3, {}]] }),
  // 腿→拳：踢完落步往前冲拳
  stepPunch: M({ kind: 'jab', label: '落步冲拳', tag: '落步冲拳', lead: 'kick', S: 5, A: 3, R: 9, dmg: 6, reach: 100, stun: 14, bstun: 8, kb: 3.5, stop: 5, power: .5,
    limb: 'bh', fx: 'jab2', lunge: [1, 5, 24],
    keys: [[0, { tor: -6, ff: [30, 30] }], [1, { tor: 36, dx: 26, hy: 50, head: -12, bh: [66, -6], fh: [2, -20], ff: [52, 0], bf: [-36, 0] }, 'back'],
      [2, { tor: 36, dx: 26, hy: 50, head: -12, bh: [66, -6], fh: [2, -20], ff: [52, 0], bf: [-36, 0] }], [3, {}]] }),

  /* ---- 重系（heavy）：前摇里带霸体，能硬吃一记短拳；怕腿 ---- */
  // 重拳：先往后蓄 —— 身子后坐、后手拉到耳朵后面、前手伸出去瞄（拳头上聚墨气），再拧腰把后手砸出去。和短拳反着来，一眼分得开
  heavy: M({ kind: 'heavy', label: '重拳', open: true, S: 11, A: 4, R: 13, dmg: 12, reach: 106, stun: 18, bstun: 11, kb: 5.5, stop: 8, shake: 5, power: .8, heavy: true,
    limb: 'bh', fx: 'heavy', lunge: [6, 11, 14], armor: { n: 1, from: 2, vs: ['light'] },
    keys: [[0, {}], [0.3, { tor: -2, dx: -8, hy: 56, head: 2, fh: [40, -14], bh: [-22, -32], ff: [30, 0], bf: [-36, 0] }, 'out'],
      [0.9, { tor: -14, dx: -14, hy: 57, head: 6, fh: [46, -10], bh: [-38, -40], ff: [32, 0], bf: [-42, 0] }],
      [1, P_HEAVY, 'back'], [2, P_HEAVY], [2.5, { tor: 28, dx: 16, hy: 52, bh: [46, 0], fh: [8, -6] }], [3, {}]] }),
  // 拳→重
  beng: M({ kind: 'heavy', label: '崩拳', stamp: '崩拳', lead: 'light', S: 9, A: 4, R: 13, dmg: 15, reach: 112, stun: 19, bstun: 12, kb: 7, stop: 10, shake: 7, power: 1, heavy: true,
    limb: 'fh', fx: 'beng', ghost: true, lunge: [4, 9, 18],
    keys: [[0, {}], [0.5, { fh: [-4, 2], tor: 0, hy: 50, dx: -6, bh: [12, -14] }],
      [1, { fh: [66, 2], tor: 32, dx: 32, hy: 48, ff: [48, 0], bf: [-8, 0], head: -8, bh: [0, -16] }, 'back'],
      [2, { fh: [66, 2], tor: 32, dx: 32, hy: 48, ff: [48, 0], bf: [-8, 0], head: -8, bh: [0, -16] }], [3, {}]] }),
  // 重→重：劈挂，上段（蹲着挡不住）
  chop: M({ kind: 'heavy', label: '劈挂掌', stamp: '劈挂', lead: 'heavy', height: 'high', S: 9, A: 4, R: 14, dmg: 13, reach: 104, stun: 18, bstun: 12, kb: 6, stop: 9, shake: 6, power: .9, heavy: true,
    limb: 'bh', fx: 'chop', ghost: true, lunge: [4, 9, 12], ender: true, noCancel: true,
    keys: [[0, { tor: 20 }], [0.6, { tor: -18, head: -10, dx: -6, hy: 62, bh: [-8, -64], fh: [24, -10], ff: [30, 0], bf: [-30, 0] }],
      [1, { tor: 48, dx: 22, hy: 48, head: -4, bh: [58, 26], fh: [-14, -6], ff: [46, 0], bf: [-34, 0] }, 'out'],
      [2, { tor: 50, dx: 22, hy: 48, head: -4, bh: [56, 32], fh: [-14, -6], ff: [46, 0], bf: [-34, 0] }], [3, {}]] }),
  // 腿→重：盖步砸拳，击倒
  hammer: M({ kind: 'heavy', label: '盖步砸拳', stamp: '盖步砸拳', lead: 'kick', S: 9, A: 5, R: 15, dmg: 14, reach: 108, stun: 20, bstun: 12, kb: 7, stop: 10, shake: 7, power: 1, heavy: true,
    limb: 'bh', fx: 'hammerFist', ghost: true, lunge: [2, 9, 26], launch: 5, ender: true, noCancel: true,
    keys: [[0, { tor: 0 }], [0.6, { spin: 30, tor: -10, head: -14, hy: 60, bh: [-22, -58], fh: [18, -30], ff: [10, 0], bf: [-36, 0] }],
      [1, { spin: 10, tor: 54, dx: 26, hy: 44, head: 6, bh: [52, 34], fh: [-6, -4], ff: [48, 0], bf: [-30, 0] }, 'out'],
      [2, { spin: 10, tor: 54, dx: 26, hy: 44, head: 6, bh: [52, 34], fh: [-6, -4], ff: [48, 0], bf: [-30, 0] }], [3, { spin: 0 }]] }),
  // 拳拳重：冲天炮（对空，击倒）
  upper: M({ kind: 'heavy', label: '冲天炮', stamp: '冲天炮', tier: 'aa', lead: 'light', S: 8, A: 4, R: 16, dmg: 16, reach: 98, stun: 19, bstun: 12, kb: 3, stop: 10, shake: 7, power: 1, heavy: true,
    limb: 'bh', fx: 'upper', ghost: true, lunge: [4, 8, 9], launch: 9, noCancel: true, ender: true, antiAir: 120,
    keys: [[0, {}], [0.5, { bh: [16, 38], hy: 38, tor: 28, fh: [12, -16], dx: 2 }],
      [1, { bh: [26, -66], hy: 70, tor: -14, dx: 14, bf: [-12, 14], head: -20, fh: [4, -8], air: 8 }, 'out'],
      [2, { bh: [26, -66], hy: 70, tor: -14, dx: 14, bf: [-12, 14], head: -20, fh: [4, -8], air: 8 }], [3, {}]] }),
  // 蹲+重：托天掌（对空）
  palm: M({ kind: 'heavy', label: '托天掌', stamp: '托天掌', tier: 'aa', lead: 'heavy', open: true, S: 7, A: 5, R: 15, dmg: 10, reach: 96, stun: 15, bstun: 10, kb: 3, stop: 8, shake: 4, power: .8,
    limb: 'fh', fx: 'palm', ghost: true, lunge: [2, 7, 6], launchAir: 9, antiAir: 160, airInv: [1, 12], ender: true, noCancel: true,
    keys: [[0, J_(P_LOW, { fh: [20, 10], bh: [10, 14] })], [0.5, J_(P_LOW, { hy: 32, fh: [24, 22], bh: [14, 24], tor: 36 })],
      [1, { hy: 68, tor: -8, head: -22, fh: [30, -64], bh: [18, -60], ff: [30, 0], bf: [-20, 8], air: 6, dx: 8 }, 'out'],
      [2, { hy: 68, tor: -8, head: -22, fh: [30, -64], bh: [18, -60], ff: [30, 0], bf: [-20, 8], air: 6, dx: 8 }], [3, {}]] }),
  // 跑+重：铁山靠
  shoulder: M({ kind: 'heavy', label: '铁山靠', stamp: '铁山靠', lead: 'heavy', open: true, S: 10, A: 5, R: 16, dmg: 13, reach: 96, stun: 19, bstun: 13, kb: 11, stop: 10, shake: 8, power: 1, heavy: true,
    limb: 'sh', fx: 'shoulder', ghost: true, lunge: [2, 11, 44], armor: { n: 2, from: 2, vs: ['light'] }, ender: true, noCancel: true,
    keys: [[0, { tor: 30 }], [0.5, { tor: 6, spin: 40, dx: -6, hy: 54, fh: [6, -6], bh: [-6, 0], ff: [30, 0], bf: [-30, 0] }],
      [1, { tor: 44, spin: 70, dx: 34, hy: 48, head: 6, fh: [-2, 8], bh: [-16, 10], ff: [52, 0], bf: [-36, 0] }, 'out'],
      [2, { tor: 44, spin: 70, dx: 34, hy: 48, head: 6, fh: [-2, 8], bh: [-16, 10], ff: [52, 0], bf: [-36, 0] }], [3, { spin: 0 }]] }),

  /* ---- 腿系（kick）：射程远，能打重拳；怕近身短拳，出腿时被拳打中会失衡倒地 ----
     2.0（Jack：腿踢还是超标，尤其距离）：腿踢射程 134 → 126，腿系连招、飞踢也一起短 4~10 */
  kick: M({ kind: 'kick', label: '腿踢', open: true, S: 13, A: 5, R: 14, dmg: 10, reach: 126, stun: 16, bstun: 10, kb: 4, stop: 7, shake: 4, power: .75,
    limb: 'ff', fx: 'kick', lunge: [6, 13, 12],
    keys: [[0, {}], [0.55, { ff: [26, 58], tor: -6, bf: [-20, 0], fh: [22, -26], bh: [2, -10], head: 0 }],
      [1, P_KICK, 'back'], [2, P_KICK], [2.4, { ff: [30, 44], tor: -12, dx: 16 }], [3, {}]] }),
  // 拳→踢
  whip: M({ kind: 'kick', label: '鞭腿', stamp: '鞭腿', lead: 'light', S: 10, A: 5, R: 14, dmg: 12, reach: 122, stun: 17, bstun: 10, kb: 6.5, stop: 8, shake: 5, power: .85,
    limb: 'bf', fx: 'whip', lunge: [5, 10, 10],
    keys: [[0, {}], [0.5, { bf: [8, 52], tor: -10, ff: [22, 0], fh: [20, -24], spin: 20 }],
      [1, { bf: [92, 92], tor: -44, dx: 22, ff: [8, 0], fh: [-6, -30], bh: [-24, 0], head: 18, spin: 30 }, 'back'],
      [2, { bf: [92, 92], tor: -44, dx: 22, ff: [8, 0], fh: [-6, -30], bh: [-24, 0], head: 18, spin: 30 }],
      [2.4, { bf: [22, 44], tor: -12, dx: 12, spin: 10 }], [3, {}]] }),
  // 踢→踢：二起脚（腾空连环踢，击倒）
  twinKick: M({ kind: 'kick', label: '二起脚', stamp: '二起脚', lead: 'kick', S: 8, A: 5, R: 16, dmg: 11, reach: 116, stun: 18, bstun: 11, kb: 6, stop: 9, shake: 6, power: .9,
    limb: 'bf', fx: 'twinKick', ghost: true, lunge: [2, 8, 22], launch: 6, ender: true, noCancel: true,
    keys: [[0, { ff: [30, 30] }], [0.5, { air: 22, tor: 4, ff: [24, 60], bf: [-10, 30], fh: [26, -44], bh: [-18, -40] }],
      [1, { air: 30, tor: -38, head: 16, dx: 16, ff: [12, 54], bf: [84, 104], fh: [-10, -34], bh: [-30, -12] }, 'back'],
      [2, { air: 26, tor: -38, head: 16, dx: 16, ff: [12, 54], bf: [84, 104], fh: [-10, -34], bh: [-30, -12] }],
      [2.5, { air: 6, tor: 6, ff: [30, 10], bf: [-20, 12] }], [3, {}]] }),
  // 拳拳踢：转身蹬
  backKick: M({ kind: 'kick', label: '转身蹬', stamp: '转身蹬', lead: 'light', S: 8, A: 5, R: 16, dmg: 12, reach: 116, stun: 19, bstun: 11, kb: 11, stop: 9, shake: 6, power: .9,
    limb: 'bf', fx: 'backKick', ghost: true, lunge: [2, 8, 12], ender: true, noCancel: true,
    keys: [[0, {}], [0.5, { spin: 130, tor: 24, head: 10, bf: [-30, 34], ff: [10, 0], fh: [18, -10], bh: [8, -6] }],
      [1, { spin: 180, tor: 50, head: 16, dx: 16, bf: [-100, 58], ff: [8, 0], fh: [22, 12], bh: [10, 18], hy: 56 }, 'back'],
      [2, { spin: 180, tor: 50, head: 16, dx: 16, bf: [-100, 58], ff: [8, 0], fh: [22, 12], bh: [10, 18], hy: 56 }],
      [2.5, { spin: 270, tor: 20, bf: [-20, 20] }], [3, { spin: 360 }]] }),
  // 重→踢：旋风腿（击倒）
  whirl: M({ kind: 'kick', label: '旋风腿', stamp: '旋风腿', lead: 'heavy', S: 12, A: 6, R: 16, dmg: 15, reach: 126, stun: 19, bstun: 13, kb: 6, stop: 10, shake: 8, power: 1, heavy: true,
    limb: 'ff', fx: 'whirl', ghost: true, lunge: [4, 12, 16], launch: 7, ender: true, noCancel: true,
    keys: [[0, {}], [0.4, { spin: 90, tor: -4, ff: [12, 36], air: 8, fh: [-10, -40], bh: [-20, -30] }],
      [0.75, { spin: 220, ff: [64, 66], tor: -24, air: 22, fh: [-8, -28], bh: [-22, -6] }],
      [1, { spin: 350, ff: [96, 78], tor: -38, dx: 24, air: 22, fh: [-10, -30], bh: [-28, 0] }, 'out'],
      [2, { spin: 360, ff: [92, 70], tor: -34, dx: 24, air: 10, fh: [-10, -30], bh: [-28, 0] }],
      [2.5, { spin: 360, ff: [34, 34], tor: -8, dx: 14 }], [3, { spin: 360 }]] }),
  // 蹲+踢：扫堂腿（下段，击倒）
  // 1.8.0：扫堂腿太好用（快、远、下段、击倒）→ 前摇长一点、射程短一点（比腿踢近）、收招更长、倒地时间短一点；
  //        反制多了：蹲挡后踩腿、抄腿接住、跳过去打它收招（破绽）、近身短拳打失衡
  sweep: M({ kind: 'kick', label: '扫堂腿', stamp: '扫堂腿', height: 'low', S: 10, A: 4, R: 20, dmg: 8, reach: 112, stun: 16, bstun: 9, kb: 4, stop: 7, shake: 4, power: .7,
    limb: 'ff', fx: 'sweep', lunge: [3, 10, 10], launch: 3, lie: 26, ender: true, noCancel: true,
    // 后腿深蹲撑住、前腿贴地伸直扫出去；手收在身前，后手往后伸着保持平衡（不是伸手去够）
    keys: [[0, J_(P_LOW, {})], [0.45, { hy: 26, tor: 20, head: -6, spin: 20, dx: -4, ff: [14, 10], bf: [-10, 0], fh: [10, 28], bh: [-20, 26] }],
      [1, { hy: 22, tor: 8, head: -12, spin: 12, dx: 4, ff: [64, 2], bf: [-8, 0], fh: [6, 24], bh: [-34, 14] }, 'out'],
      [2, { hy: 22, tor: 8, head: -12, spin: 12, dx: 4, ff: [64, 2], bf: [-8, 0], fh: [6, 24], bh: [-34, 14] }],
      [2.5, { hy: 26, tor: 14, head: -8, spin: 4, ff: [34, 4], bf: [-10, 0], fh: [14, 16], bh: [-20, 12] }], [3, J_(P_LOW, { spin: 0 })]] }),

  /* ---- 空中（上段：蹲着挡不住；飞踢可以蹲下躲）。都是先往后蓄、再往前打的整套动作 ----
     1.7.0：出手时整个人往前下方倾（rot），拳脚真的够得着对面；判定持续到快落地，同一个距离什么时候出都打得到；
     往下够的深度统一 AIR_VREACH。前摇没出完就落地 = 落地后马上在地上出这一招（fighter.js onLand），按了一定有反应 */
  // 空中挥拳：拳头先甩到脑后，人往前一扑，从上往前下方砸过去
  airJab: M({ kind: 'jab', label: '空中挥拳', tier: 'air', lead: 'light', height: 'high', open: true, S: 4, A: 12, R: 6, dmg: 6, reach: 98, vreach: AIR_VREACH, stun: 15, bstun: 9, kb: 2.6, stop: 5, power: .45,
    limb: 'fh', fx: 'airSwing', air: true,
    keys: [[0, JT], [0.55, J_(JT, { rot: 4, tor: -10, head: -8, fh: [-22, -52], bh: [24, -8], ff: [18, 46], bf: [-4, 40] })],
      [1, { rot: 22, tor: 34, head: -10, fh: [62, 10], bh: [-18, -18], ff: [16, 40], bf: [-34, 24] }, 'back'],
      [2, { rot: 24, tor: 36, head: -10, fh: [60, 14], bh: [-18, -18], ff: [16, 40], bf: [-34, 24] }], [3, JD]] }),
  // 泰山压顶：后仰把双拳举过头顶，再整个人往前下方卷下去砸（1.9.0 伤害 12 → 11：打蹲着的人让给千斤坠）
  // 2.1（Jack：打电脑像「版本答案」，前摇、整个动作都太快）：前摇 7 → 10、判定 10 → 11、后摇 8 → 10（举过头顶那一下看得清）
  airHeavy: M({ kind: 'heavy', label: '泰山压顶', stamp: '泰山压顶', tier: 'air', lead: 'heavy', height: 'high', open: true, S: 10, A: 11, R: 10, dmg: 11, reach: 104, vreach: AIR_VREACH, stun: 19, bstun: 12, kb: 5, stop: 9, shake: 6, power: 1, heavy: true,
    limb: 'fh', fx: 'hammer', air: true,
    keys: [[0, JT], [0.7, { rot: -8, tor: -30, head: -14, fh: [-14, -62], bh: [-24, -56], ff: [16, 54], bf: [2, 48] }],
      [1, { rot: 26, tor: 56, head: 22, fh: [40, 50], bh: [32, 54], ff: [20, 22], bf: [-24, 34] }, 'out'],
      [2, { rot: 28, tor: 56, head: 22, fh: [40, 52], bh: [32, 56], ff: [20, 22], bf: [-24, 34] }], [3, JD]] }),
  // 飞踢：先把膝盖收到胸口，身体后仰，整个人前倾着一脚往前下方蹬出去
  // 2.1（Jack：和泰山压顶一样太快、太好用）：前摇 6 → 9、判定 12 → 13、后摇 7 → 9（收膝那一下看得清，整个动作慢一点）
  airKick: M({ kind: 'kick', label: '飞踢', stamp: '飞踢', tier: 'air', lead: 'kick', height: 'high', open: true, S: 9, A: 13, R: 9, dmg: 10, reach: 124, vreach: AIR_VREACH, stun: 18, bstun: 11, kb: 6, stop: 8, shake: 5, power: .9,
    limb: 'ff', fx: 'airKick', air: true, ghost: true, evadeCrouch: true,
    keys: [[0, JT], [0.6, { rot: -6, tor: 12, head: -6, ff: [8, 60], bf: [-6, 46], fh: [26, -42], bh: [-18, -36] }],
      [1, { rot: 14, tor: -40, head: 16, ff: [96, 22], bf: [-12, 50], fh: [-14, -30], bh: [-32, -12] }, 'back'],
      [2, { rot: 14, tor: -40, head: 16, ff: [96, 22], bf: [-12, 50], fh: [-14, -30], bh: [-32, -12] }], [3, JD]] }),
  // 千斤坠：空中按住蹲再踢。先往上一腾、团身（从高处起），再整个人斜成一条线，前脚笔直往前下方踩下去（打到会往后翻着弹开）
  // 1.9.0：主系「坠」—— 专破蹲着的防守和反击：踩蹲着 / 蹲挡 / 出下段的 ×1.3，对空招（托天掌、冲天炮）打不到它、反被踩倒 ×1.5；
  //        怕站着的拳：被短拳系 / 重拳系迎着打中 = 倒栽葱 ×1.4、倒地更久；站挡挡得住。前摇更慢（腾得更高）。
  //        踩中后弹起落在对手面前，这一下算「腿起手」：落地 踢 = 二起脚、重 = 盖步砸拳、拳 = 落步冲拳（都是真连）
  dive: M({ kind: 'kick', label: '千斤坠', stamp: '千斤坠', tier: 'dive', lead: 'kick', height: 'high', S: 15, A: 40, R: 8, dmg: 9, reach: 84, vreach: 64, stun: 19, bstun: 10, kb: 2, stop: 8, shake: 6, power: .9,
    limb: 'ff', fx: 'dive', air: true, ghost: true, dive: true, aaProof: true,
    keys: [[0, JT], [0.7, { rot: -8, tor: 8, head: 4, ff: [20, 58], bf: [-10, 44], fh: [14, -52], bh: [-30, -40] }],
      [1, { rot: -42, tor: 2, head: 12, ff: [14, -16], bf: [-22, 34], fh: [-30, -34], bh: [-40, -14] }, 'out'],
      [2, { rot: -42, tor: 2, head: 12, ff: [14, -16], bf: [-22, 34], fh: [-30, -34], bh: [-40, -14] }], [3, JD]] }),

  /* ---- 擒拿（挡不住；出腿时被拿 = 接腿摔；被任何正在判定中的打击打断）----
     1.8.0：抓住以后先「擒住」一小会儿 —— 这时候按 拳 = 提膝撞，踢 = 别腿摔，重 / 后 = 过肩摔，什么都不按 = 推开；
     被抓的人在擒住刚开始那几帧按「拿」能挣脱。蹲着的人站着抓不到（要用蹲+拿「抄腿」）；抄腿只抓蹲着的和出腿的 */
  grab: M({ kind: 'grab', label: '擒拿', open: true, S: 6, A: 4, R: 15, dmg: 5, reach: 84, power: .4,
    limb: 'fh', lunge: [2, 6, 8],
    keys: [[0, {}], [0.4, { fh: [10, 0], bh: [4, 4], tor: 4, dx: -4, hy: 56 }],
      [1, { fh: [54, 40], bh: [50, 44], tor: 36, dx: 18, hy: 50, ff: [40, 0], bf: [-24, 0], head: -12 }, 'out'],
      [2, { fh: [54, 40], bh: [50, 44], tor: 36, dx: 18, hy: 50, ff: [40, 0], bf: [-24, 0], head: -12 }], [3, {}]] }),
  // 推开：擒住后什么都不按，两手往前一推，把人推出去（自己先动一点）
  grabHit: M({ kind: 'script', label: '推开', S: 0, A: 0, R: 16, script: true, evPush: 4,
    keys: [[0, { fh: [30, 10], bh: [24, 14], tor: 10, dx: 4, hy: 54 }],
      [0.25, { fh: [66, -4], bh: [60, 0], tor: 36, dx: 22, hy: 52, ff: [42, 0], bf: [-16, 0] }, 'back'],
      [0.5, { fh: [66, -4], bh: [60, 0], tor: 36, dx: 22, hy: 52, ff: [42, 0], bf: [-16, 0] }], [1, {}]] }),
  // 过肩摔：往怀里一带 → 下蹲扛起 → 起身后仰把人从头顶抡过去 → 往身后砸 → 收势。对手跟着手走的路线见 fighter.js THROW_PATH
  throwBack: M({ kind: 'script', label: '过肩摔', S: 0, A: 0, R: 30, script: true, evSlam: 14,
    keys: [[0, { fh: [34, 4], bh: [28, 8], tor: 20, hy: 50, head: -6, ff: [32, 0], bf: [-30, 0] }],
      [0.13, { fh: [16, 2], bh: [8, 6], tor: 10, hy: 42, dx: 2, head: -4, ff: [34, 0], bf: [-32, 0] }],
      [0.3, { fh: [4, -56], bh: [-6, -52], tor: -14, head: -20, hy: 60, dx: -4, ff: [30, 0], bf: [-34, 0] }],
      [0.47, { fh: [-44, 24], bh: [-50, 28], tor: -40, head: -22, hy: 46, dx: -10, ff: [38, 0], bf: [-26, 0] }, 'out'],
      [0.62, { fh: [-40, 28], bh: [-46, 32], tor: -34, head: -18, hy: 44, dx: -8, ff: [38, 0], bf: [-26, 0] }], [1, {}]] }),
  legCatch: M({ kind: 'script', label: '接腿摔', S: 0, A: 0, R: 26, script: true, evSlam: 13,
    keys: [[0, { fh: [50, 32], bh: [44, 36], tor: 26, dx: 14, hy: 54 }],
      [0.25, { fh: [30, 4], bh: [22, 8], tor: -14, dx: -2, hy: 62, head: -14 }],
      [0.5, { fh: [36, 50], bh: [26, 54], tor: 48, dx: 12, hy: 42, head: 12 }, 'out'],
      [0.7, { fh: [36, 50], bh: [26, 54], tor: 48, dx: 12, hy: 42, head: 12 }], [1, {}]] }),
  // 抄腿（蹲+拿）：压低身子往前一扑，两手抄对方的腿。抓得到：出腿的（含扫堂腿 → 抄腿摔）、蹲着 / 蹲挡的（→ 擒住 → 抱腿摔）；
  // 站着的人抓不到（抓空，收招长）
  lowGrab: M({ kind: 'grab', label: '抄腿', low: true, height: 'low', open: true, S: 8, A: 4, R: 16, dmg: 0, reach: 88, power: .5,
    limb: 'fh', lunge: [2, 8, 14],
    keys: [[0, J_(P_LOW, { fh: [20, 8], bh: [10, 12] })], [0.5, J_(P_LOW, { hy: 34, tor: 22, fh: [6, 10], bh: [-6, 14], dx: -4 })],
      [1, { hy: 30, tor: 56, dx: 20, head: -16, fh: [60, 52], bh: [54, 56], ff: [44, 0], bf: [-34, 0] }, 'out'],
      [2, { hy: 30, tor: 56, dx: 20, head: -16, fh: [60, 52], bh: [54, 56], ff: [44, 0], bf: [-34, 0] }], [3, J_(P_LOW, {})]] }),
  // 擒住：抓住后的一小会儿，两手揪住对方往怀里带。这几帧决定后续（拳 / 踢 / 重或后 / 不按）；被抓的在前 ESC_WIN 帧按拿能挣脱
  hold: M({ kind: 'script', label: '擒住', S: 0, A: 0, R: 10, script: true,
    keys: [[0, { fh: [52, 30], bh: [46, 34], tor: 30, dx: 14, hy: 52, ff: [36, 0], bf: [-22, 0] }],
      [0.5, { fh: [34, 12], bh: [28, 16], tor: 14, dx: 6, hy: 54, head: 2, ff: [32, 0], bf: [-26, 0] }],
      [1, { fh: [30, 10], bh: [24, 14], tor: 10, dx: 4, hy: 54, head: 4, ff: [32, 0], bf: [-28, 0] }]] }),
  // 提膝撞：揪住连顶两膝，不击倒，但顶完自己先动（帧差 +KNEE_ADV）
  knee: M({ kind: 'script', label: '提膝撞', S: 0, A: 0, R: 22, script: true, evHit: 5, evHit2: 13,
    keys: [[0, { fh: [30, 10], bh: [24, 14], tor: 10, dx: 4, hy: 54 }],
      [0.2, { fh: [26, 16], bh: [20, 20], tor: -10, dx: 8, hy: 58, head: 8, ff: [34, 58], bf: [-20, 0] }, 'out'],
      [0.36, { fh: [30, 10], bh: [24, 14], tor: 8, dx: 4, hy: 54, ff: [24, 4], bf: [-24, 0] }],
      [0.56, { fh: [26, 16], bh: [20, 20], tor: -12, dx: 10, hy: 58, head: 8, ff: [36, 62], bf: [-20, 0] }, 'out'],
      [0.75, { fh: [44, -4], bh: [38, 0], tor: 20, dx: 10, hy: 52, ff: [30, 0], bf: [-30, 0] }], [1, {}]] }),
  // 别腿摔：脚往对方脚后一别，手往前下一推，对方往后仰倒在面前（倒在跟前，起身由你压）
  trip: M({ kind: 'script', label: '别腿摔', S: 0, A: 0, R: 24, script: true, evSlam: 9,
    keys: [[0, { fh: [30, 10], bh: [24, 14], tor: 10, dx: 4, hy: 54 }],
      [0.25, { fh: [40, -6], bh: [34, -2], tor: 26, dx: 16, hy: 50, ff: [58, 6], bf: [-22, 0], head: -8 }],
      [0.4, { fh: [56, 28], bh: [50, 32], tor: 50, dx: 22, hy: 44, ff: [62, 0], bf: [-30, 0], head: 4 }, 'out'],
      [0.6, { fh: [52, 36], bh: [46, 40], tor: 48, dx: 20, hy: 44, ff: [56, 0], bf: [-32, 0] }], [1, {}]] }),
  // 抱腿摔：抄腿抓住蹲着的人，抱着腿往前一顶把人掀翻
  tackle: M({ kind: 'script', label: '抱腿摔', S: 0, A: 0, R: 26, script: true, evSlam: 10,
    keys: [[0, { hy: 30, tor: 56, dx: 20, head: -16, fh: [56, 50], bh: [50, 54], ff: [44, 0], bf: [-34, 0] }],
      [0.3, { hy: 40, tor: 40, dx: 30, head: -10, fh: [44, 20], bh: [38, 24], ff: [56, 0], bf: [-40, 0] }],
      [0.45, { hy: 48, tor: 30, dx: 34, head: -6, fh: [50, -16], bh: [44, -12], ff: [58, 0], bf: [-36, 0] }, 'out'],
      [0.65, { hy: 46, tor: 34, dx: 30, fh: [48, 4], bh: [42, 8], ff: [54, 0], bf: [-36, 0] }], [1, {}]] }),
  // 抄腿摔：抄腿接住对方出腿（含扫堂腿），把腿往上一掀，人仰面摔倒
  scoop: M({ kind: 'script', label: '抄腿摔', S: 0, A: 0, R: 26, script: true, evSlam: 12,
    keys: [[0, { hy: 32, tor: 50, dx: 18, head: -14, fh: [58, 48], bh: [52, 52], ff: [44, 0], bf: [-34, 0] }],
      [0.3, { hy: 52, tor: 10, dx: 10, head: -16, fh: [46, -10], bh: [40, -6], ff: [40, 0], bf: [-30, 0] }],
      [0.5, { hy: 58, tor: -18, dx: 4, head: -22, fh: [30, -54], bh: [24, -50], ff: [34, 0], bf: [-30, 0] }, 'out'],
      [0.7, { hy: 54, tor: 6, dx: 6, fh: [40, -20], bh: [34, -16], ff: [34, 0], bf: [-30, 0] }], [1, {}]] }),

  /* ---- 防守反击 ---- */
  // 推挡：格挡中按拳。出手期间打不中他，把对方推开并打断；空了后摇很长
  shove: M({ kind: 'push', label: '推挡', tier: 'push', S: 2, A: 4, R: 12, dmg: 0, reach: 108, stun: 9, bstun: 0, kb: PUSH_KB, stop: 4, power: .3,
    limb: 'fh', fx: 'shove', push: true, sinv: [0, 6], noCancel: true,
    keys: [[0, { fh: [12, -30], bh: [18, -10], tor: 0, head: 10, dx: -4, hy: 56 }],
      [1, { fh: [62, -14], bh: [58, -8], tor: 32, dx: 16, hy: 54, head: -6, ff: [38, 0], bf: [-32, 0] }, 'back'],
      [2, { fh: [62, -14], bh: [58, -8], tor: 32, dx: 16, hy: 54, head: -6, ff: [38, 0], bf: [-32, 0] }], [3, {}]] }),
  // 截拳（1.8.0）：挡住以后（格挡硬直里）按「重」，花 GC_COST 气从格挡里直接打出一拳。出手前打击无敌，把对方打开
  jieQuan: M({ kind: 'heavy', label: '截拳', stamp: '截拳', tier: 'heavy', lead: 'heavy', S: 5, A: 4, R: 16, dmg: 9, reach: 104, stun: 18, bstun: 10, kb: 9, stop: 9, shake: 5, power: .9, heavy: true,
    limb: 'fh', fx: 'beng', ghost: true, lunge: [0, 5, 18], sinv: [0, 6], cost: GC_COST, ender: true, noCancel: true,
    keys: [[0, { hy: 56, tor: 0, head: 10, dx: -4, fh: [12, -30], bh: [18, -10], ff: [24, 0], bf: [-30, 0] }],
      [0.5, { hy: 54, tor: 8, head: 2, dx: -2, fh: [24, -16], bh: [16, -6], ff: [28, 0], bf: [-32, 0] }],
      [1, { hy: 50, tor: 36, head: -12, dx: 26, fh: [72, -12], bh: [6, -14], ff: [50, 0], bf: [-34, 0] }, 'back'],
      [2, { hy: 50, tor: 36, head: -12, dx: 26, fh: [72, -12], bh: [6, -14], ff: [50, 0], bf: [-34, 0] }], [3, {}]] }),
  // 踩腿（1.8.0）：蹲挡住扫堂腿这类下段腿以后按「踢」，抬膝往前下一脚踩在对方伸出来的腿上。击倒
  stomp: M({ kind: 'kick', label: '踩腿', stamp: '踩腿', height: 'low', S: 4, A: 4, R: 14, dmg: 10, reach: 122, stun: 16, bstun: 9, kb: 4, stop: 9, shake: 6, power: .9,
    limb: 'ff', fx: 'stomp', lunge: [1, 4, 24], launch: 4, lie: 30, ender: true, noCancel: true,
    keys: [[0, J_(P_LOW, { ff: [30, 0] })], [0.6, { hy: 58, tor: -8, head: 6, dx: 4, ff: [30, 64], bf: [-22, 0], fh: [30, -30], bh: [-20, -24] }],
      [1, { hy: 50, tor: 26, head: -14, dx: 22, ff: [74, 4], bf: [-26, 0], fh: [22, -10], bh: [-26, -8] }, 'out'],
      [2, { hy: 50, tor: 26, head: -14, dx: 22, ff: [74, 2], bf: [-26, 0], fh: [22, -10], bh: [-26, -8] }], [3, {}]] }),
  // 冲刺：同一方向双击。压低身子贴地滑出一大步，前 8 帧谁都碰不到，能穿到对面身后；
  // 第 DASH_CANCEL 帧起可以直接按招打出去，冲刺后的第一招带「冲势」
  dash: M({ kind: 'script', label: '冲刺', S: 0, A: 0, R: 16, script: true, lunge: [0, 10, 96], inv: [0, 8],
    keys: [[0, { hy: 50, tor: 24, head: -6, ff: [30, 0], bf: [-26, 0], fh: [16, -8], bh: [4, -4] }],
      [0.12, { hy: 46, tor: 38, head: -16, dx: 8, ff: [46, 8], bf: [-58, 14], fh: [12, 2], bh: [-34, 6] }, 'out'],
      [0.45, { hy: 44, tor: 36, head: -14, dx: 10, ff: [48, 2], bf: [-58, 6], fh: [14, 0], bh: [-34, 4] }],
      [0.7, { hy: 46, tor: 18, head: -8, dx: 4, ff: [42, 0], bf: [-44, 0], fh: [28, -24], bh: [14, -18] }], [1, {}]] }),
  // 闪身（2.0，边挡边冲刺）：按住格挡、朝对手双击方向（格挡中、挡住的硬直里都行）。压低身子、两手护着头，从对手身边钻过去到他身后。
  // 2.0.2：钻的那十来帧（slipInv）只有重系的手上招打不中（闪），短拳、腿、下段、擒拿都截得住（截住闪身 ×1.3）。冲多远按对手在哪算（fighter.js beginSlip），
  // 前冲的距离写在这一招自己身上（move.lungePx）。躲过了重拳 → 自动接回身肘（slipElbow）；钻空了第 SLIP_CANCEL 帧起能直接出招
  slip: M({ kind: 'script', label: '闪身', S: 0, A: 0, R: 22, script: true, lunge: [0, 11, 110], slipInv: [0, 11],
    keys: [[0, { hy: 46, tor: 26, head: 2, dx: -2, fh: [12, -28], bh: [20, -12], fe: -1, ff: [28, 0], bf: [-30, 0] }],
      [0.14, { hy: 38, tor: 46, head: -6, dx: 12, fh: [16, -24], bh: [22, -8], fe: -1, ff: [50, 6], bf: [-50, 12] }, 'out'],
      [0.48, { hy: 38, tor: 44, head: -6, dx: 12, fh: [16, -24], bh: [22, -8], fe: -1, ff: [46, 2], bf: [-52, 8] }],
      [0.72, { hy: 52, tor: 12, head: 6, dx: 2, fh: [12, -28], bh: [18, -12], fe: -1, ff: [26, 0], bf: [-30, 0] }], [1, {}]] }),
  // 回身肘（2.0.2）：闪身躲过重拳、钻到对手身后，自动转身一肘顶在他背上（fighter.js slipElbow）。
  // 打中：他背对着你往前踉跄 STAGGER 帧（打得中、动不了、不自动转身，combat.js applyHit 的 stagger），你先动二十来帧接着打。
  // 姿势：一开始还背对着他（spin 165，刚钻过去的样子），拧身转过来（spin 95，肘往后蓄），再把前手的肘往前顶出去
  slipElbow: M({ kind: 'heavy', label: '回身肘', stamp: '回身肘', tier: 'heavy', lead: 'heavy', S: 5, A: 3, R: 12, dmg: 8, reach: 96, stun: 18, bstun: 10, kb: STAGGER_KB,
    stop: 8, shake: 4, power: .8, limb: 'fe', fx: 'slipElbow', ghost: true, lunge: [0, 5, 18], stagger: true, ender: true, noCancel: true,
    keys: [[0, { spin: 165, tor: 24, hy: 46, head: 2, fh: [12, -26], bh: [20, -10], fe: -1, ff: [30, 0], bf: [-30, 0] }],
      [0.55, { spin: 95, tor: 6, hy: 54, head: -6, dx: -4, fh: [-14, -4], fe: -1, bh: [8, -18], ff: [24, 0], bf: [-34, 0] }],
      [1, { spin: 8, tor: 34, dx: 20, hy: 52, head: -10, fh: [6, 2], fe: -1, bh: [2, -18], ff: [46, 0], bf: [-30, 0] }, 'back'],
      [2, { spin: 4, tor: 34, dx: 20, hy: 52, head: -10, fh: [6, 2], fe: -1, bh: [2, -18], ff: [46, 0], bf: [-30, 0] }], [3, {}]] }),
  // 爆气：挨打时按「重+踢」，花 50 气从身上炸开 —— 2.1（Jack）：把对方炸倒、打掉 18（以前只是震开）
  burst: M({ kind: 'script', label: '爆气', S: 0, A: 0, R: 22, script: true, inv: [0, 18], evWave: 3,
    keys: [[0, { tor: 30, hy: 46, head: 10, fh: [8, 12], bh: [4, 14] }],
      [0.14, { tor: -20, head: -24, hy: 66, fh: [42, -56], bh: [-40, -54], ff: [40, 0], bf: [-40, 0], air: 6 }, 'out'],
      [0.5, { tor: -16, head: -20, hy: 64, fh: [40, -50], bh: [-38, -48], ff: [40, 0], bf: [-40, 0], air: 2 }], [1, {}]] }),
  // 泼墨：气满时按「重+踢」，出手前打击无敌。2.1（Jack：伤害太低）22 → 40
  super: M({ kind: 'heavy', label: '泼墨', stamp: '泼墨', tier: 'super', S: 8, A: 6, R: 22, dmg: 40, reach: 136, stun: 24, bstun: 15, kb: 8, stop: 16, shake: 12, power: 1.2, heavy: true,
    limb: 'fh', fx: 'splash', ghost: true, lunge: [2, 8, 34], sinv: [0, 14], launch: 8, ender: true, noCancel: true, cost: QI_MAX, antiAir: 40,
    keys: [[0, {}], [0.6, { tor: -24, dx: -12, hy: 52, fh: [-14, -46], bh: [-34, -34], head: -12, ff: [30, 0], bf: [-36, 0] }],
      [1, { tor: 46, dx: 36, hy: 46, head: -12, fh: [68, -6], bh: [62, 4], ff: [54, 0], bf: [-38, 0] }, 'back'],
      [2, { tor: 46, dx: 36, hy: 46, head: -12, fh: [68, -6], bh: [62, 4], ff: [54, 0], bf: [-38, 0] }], [3, {}]] }),
};

/* ============================================================
   克制关系（两边同时出手时）：
   1) 先比主系：拳 > 腿 > 重 > 拳；腿 > 对空 > 空中；必杀 > 一切；打击 > 擒拿 → 「克」：克制方单方面打中 ×1.3
   2) 主系一样，比起手（同样按 拳 > 腿 > 重 > 拳）→ 「压」：两边都打中，被压的吃全额，压人的只吃三成
   3) 主系、起手都一样（或互不相克）→ 「平」：拼招，各吃五成、互相震退
   ============================================================ */
const TIER_WIN = {
  light: ['kick', 'grab', 'dive'],      // 1.9.0：站着的拳迎着打千斤坠 = 倒栽葱
  heavy: ['light', 'grab', 'dive'],
  kick: ['heavy', 'aa', 'grab'],        // 腿长，从下面踢中正往上托的对空招（地上的腿撞空中的腿 = 翻滚，见 combat.js tumble）
  aa: ['air', 'grab'],
  air: ['light', 'heavy', 'kick', 'grab'],
  dive: ['aa', 'grab'],                 // 千斤坠踩断对空
  super: ['light', 'heavy', 'kick', 'aa', 'air', 'dive', 'grab'],
};
const TIER_NAME = { light: '拳', heavy: '重', kick: '腿', aa: '对空', air: '空', dive: '坠', super: '必杀', grab: '拿' };
function beats(x, y) {
  if (x === y) return 0;
  if ((TIER_WIN[x] || []).includes(y)) return 1;
  if ((TIER_WIN[y] || []).includes(x)) return -1;
  return 0;
}
// 两招交手：1 克，0.5 压，0 平，-0.5 被压，-1 被克
function relation(da, db) {
  const r = beats(da.tier, db.tier);
  if (r) return r;
  return beats(da.lead, db.lead) * 0.5;
}

// 破解表：每一种招、每一种技术都有对应的破法（图例「破解表」直接读这里；tests.js 逐条验证）
const COUNTERS = [
  ['拳系（短拳、连珠、寸劲、下盘拳、顶肘、落步冲拳）', '重系前摇霸体硬吃（重克拳）；同主系里起手克它的「压」它；被挡后势破，推挡、卸力、截拳反打'],
  ['重系（重拳、崩拳、劈挂掌、盖步砸拳、铁山靠）', `腿系化解后踢中（腿克重）；擒拿比它快；起手克它的「压」它；霸体只能吃一两下，连打破霸体；挡住后打它收招 ×${PUNISH_MUL}`],
  ['腿系（腿踢、鞭腿、转身蹬、旋风腿、二起脚、扫堂腿）', '起腿时被拳打中失衡倒地（拳克腿）；站着擒拿 = 接腿摔，蹲+拿 = 抄腿摔（扫堂腿也接得住）；起手克它的「压」它'],
  ['扫堂腿', `蹲挡住后按踢「踩腿」击倒；蹲+拿抄住它的腿；跳起躲开、落地打它收招 = 破绽 ×${WHIFF_KD_MUL}；贴身短拳打它失衡；卸力`],
  ['击倒招（扫堂腿、冲天炮、旋风腿、盖步砸拳、二起脚、踩腿、泼墨）', `挡住后打它收招 ×${PUNISH_KD_MUL}（挡后反击）；卸力后反打 ×${PUNISH_KD_MUL}；它打空了打收招 ×${WHIFF_KD_MUL}（破绽）；真被打倒了，起身时按住方向滚身起，躲开守在你起身处的人`],
  ['对空（托天掌、冲天炮）', '腿系从下面踢中（腿克对空）；千斤坠踩它（对空打不到千斤坠）；它在地上就是普通重招，前摇长，被挡后摇也长'],
  ['空中招（挥拳、泰山压顶、飞踢）', `托天掌、冲天炮（对空克空中，打下来 = 倒栽葱，倒地更久）；地上出腿迎上飞踢 = 把它顶得翻滚回去；空中互撞看起手分压；站挡、卸力；蹲下躲飞踢；往后退出它的射程，它落地有硬直`],
  ['千斤坠', `站着的拳迎着打（短拳、重拳都行）= 倒栽葱 ×${DIVE_PUNCH_MUL}、倒地更久；站挡挡得住，它弹起来还能再打；地上出腿迎上去 = 顶得它翻滚回去；它先往上腾一下，看得见；别蹲、别出托天掌（正中它下怀）`],
  ['下段（下盘拳、扫堂腿）', '蹲挡；跳起躲开；扫堂腿是腿系，近身被拳克，蹲挡住还能踩腿'],
  ['上段（劈挂掌、所有空中招）', '站挡；劈挂掌是重系，被腿克'],
  ['擒拿 / 过肩摔 / 提膝 / 别腿摔', '任何打击在它抓到前打断它（打击克擒拿）；蹲下它就抓不到；同时擒拿 = 拆；被抓住马上按拿 = 挣脱；冲刺无敌、跳起都躲得开'],
  ['抄腿（蹲+拿）', '站着它就抓不到，抓空收招很长，打它；它前摇慢，短拳、下盘拳打断它；被抓住马上按拿 = 挣脱'],
  ['接腿摔 / 抄腿摔', '出腿别出得太早、太远让人看着接；改用拳；接腿接不住扫堂腿（要抄腿），抄腿接不住跳起来的腿'],
  ['挣脱', '接腿摔、抄腿摔、借力摔都挣不脱；它要提前按才来得及，抓之前先打一下（打击克擒拿）'],
  ['格挡', '站挡怕擒拿和下段，蹲挡怕抄腿和上段；绕到背后（背对挡不住）'],
  ['卸力', '擒拿卸不了；停一拍再打（两次按格挡要隔 24 帧才有卸力）'],
  ['推挡', '擒拿（推挡只防打击）；停手不打，等它推空，打它的后摇'],
  ['截拳', '它出手前打击无敌，但收招长：挡住它反打，或者用擒拿；它要花 ' + GC_COST + ' 气，压对方之前看一眼气条'],
  ['踩腿', '扫堂腿别往蹲挡的人身上用；换下盘拳（拳收招快，踩不到）或者抄腿'],
  ['借力摔（卸力后按拿）', '别让人卸：出招别太好猜、停一拍再打'],
  ['霸体（重拳、铁山靠）', '腿系；擒拿；连打两三下（重拳只吃一下，铁山靠两下）'],
  ['跑动、冲刺', '迎击：打在全速跑过来、或冲刺收尾的人身上 ×1.2；腿踢射程长，正好迎上去'],
  ['冲势（冲刺后第一招）', '卸力（冲进来的时机好猜）；出克它那一系的招；冲刺收尾时先打它 = 迎击'],
  ['连段压制', '推挡、卸力、截拳、爆气；连击衰减，同一套四五下就断'],
  ['爆气', '它只在挨打时能爆（花半格气）：连招别拖太长，看它气条过了一半就收着打；面朝它格挡只吃三成、被推开一点，它的后摇能打；站远一点够不着；冲刺无敌躲开'],
  ['泼墨', `它出手前擒拿抓住它；卸力；格挡只掉三成，挡住后反击 ×${PUNISH_KD_MUL}；跳起躲开；冲刺无敌`],
  ['滚身起', '往你脚下滚到你身后：看见了转身出拳还来得及（它滚完站起来那几帧是起身硬直）；往后滚：看见了再追就晚了，只能它一起身就猜着冲过去 —— 猜错了冲过头，回身打够不着'],
  ['起身（2.0）', '被打倒的一方站起来那几帧挨得了打、动不了：对面短拳这种快招算好时机必中，重拳、腿要提前出（压起身）；被压的按住方向滚身起躲开，压早了的打空，轮到你反打'],
  ['闪身（边挡边冲刺）', `它只躲得过重拳（重系的手上招）：出短拳、腿、下段、擒拿截住它 ×${SLIP_CAUGHT_MUL}；对着按住挡的人别老想用重拳砸开，被它钻过去就是回身肘、背对着挨打`],
  ['回身肘', '闪身躲过重拳才有：重拳打出去要算好它闪不闪；它钻空了（你没出重拳）就只是换到你身后，它收招比你慢，转身打它'],
  ['边挡边走', '擒拿（挡不住）、下段（站着挡）、劈挂掌和空中招（蹲着挡）；它走得慢，跑过去就贴上了'],
];

// 取消：打中或被挡后，在后摇里能接哪一类
const CANCEL = { jab: ['jab', 'heavy', 'kick', 'grab'], heavy: ['jab', 'heavy', 'kick'], kick: ['jab', 'heavy', 'kick'], grab: [], push: [] };
const AIR_OF = { jab: 'airJab', heavy: 'airHeavy', kick: 'airKick' };
const DOWN_OF = { jab: 'lowJab', heavy: 'palm', kick: 'sweep', grab: 'lowGrab' };
// 连招变招：看这一串前面按过什么。mod：'down' 按着蹲 / 'run' 跑起来了
//   拳拳→后手直拳  拳拳拳→摆拳  拳×4、5→连珠快拳  拳×6→寸劲
//   拳重→崩拳  拳踢→鞭腿  拳拳重→冲天炮  拳拳踢→转身蹬
//   重拳→顶肘  重重→劈挂掌  重踢→旋风腿
//   踢拳→落步冲拳  踢重→盖步砸拳  踢踢→二起脚
function pickVariant(kind, chain, air, mod) {
  if (air) return mod === 'down' && kind === 'kick' ? 'dive' : AIR_OF[kind] || null;
  if (mod === 'down') return DOWN_OF[kind];
  let jabs = 0;
  for (let i = chain.length - 1; i >= 0 && chain[i] === 'jab'; i--) jabs++;
  const last = chain[chain.length - 1];
  if (kind === 'jab') {
    if (last === 'heavy') return 'elbow';
    if (last === 'kick') return 'stepPunch';
    return jabs === 0 ? 'jab' : jabs === 1 ? 'jab2' : jabs === 2 ? 'jab3' : jabs >= JAB_CHAIN_MAX - 1 ? 'rushEnd' : (jabs % 2 ? 'rushR' : 'rushL');
  }
  if (kind === 'heavy') {
    if (jabs >= 2) return 'upper';
    if (jabs === 1) return 'beng';
    if (last === 'heavy') return 'chop';
    if (last === 'kick') return 'hammer';
    return mod === 'run' ? 'shoulder' : 'heavy';
  }
  if (kind === 'kick') {
    if (last === 'heavy') return 'whirl';
    if (last === 'kick') return 'twinKick';
    return jabs >= 2 ? 'backKick' : jabs === 1 ? 'whip' : 'kick';
  }
  return 'grab';
}
const reachOf = k => ({ jab: 96, heavy: 112, kick: 128, grab: 84, 'd:jab': 92, 'd:kick': 120, 'd:heavy': 100, 'd:grab': 96 })[k] || 90;
