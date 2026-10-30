'use strict';
/* 招式表：每一招的前摇/判定/后摇帧数、伤害、射程、关键帧姿势；连招变招 pickVariant；克制关系 TIER_WIN / relation */

/* ============================================================
   招式表
   S 前摇 / A 判定 / R 后摇（帧）, reach = 两人中心距
   tier 主系（这一下是什么劲）：light 拳 / heavy 重 / kick 腿 / air 空 / aa 对空 / super 必杀
   lead 起手（这套连段从什么起的）：单招的起手就是自己；拳→重 的进步冲拳起手是拳
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
// 2.6 前后摇（Jack）：这几样在 2.5 的帧数上再 ×ATK_TEMPO（config.js），取到 0.25 帧；判定 A 不变。擒拿后续、冲刺这些 script 动作不变
const ATK_KEYS = ['S', 'R', 'stun', 'bstun'];
// 2.6（Jack：拳头在对方身上停留的时间长一点，算在后摇里）：收招的头 HOLD_R（两成）拳脚还停在打出去的地方，之后才往回收
// （打中时顿帧里本来就停着，顿完了再多停一会儿；打空了就是打出去以后顿一下再收）。空中招的判定一直持续到落地，不用
const HOLD_R = 0.25;   // 2.12（Jack：打击停在身上的时间再长一点点）：0.2 → 0.25，和顿帧（config.js HITSTOP）一起长
// 2.12 慢招（config.js SLOW_R 那一段）：表里写 slow: N 的起手招，换算完前摇不到 N 帧就拉到 N（前冲、无敌、霸体等比挪），后摇、硬直再 ×SLOW_R
function slowDown(o) {
  if (!o.slow) return;
  if (o.S < o.slow) {
    const k = o.slow / o.S; o.S = grid(o.slow);
    for (const kk of ['inv', 'sinv', 'airInv', 'slipInv']) if (o[kk]) o[kk] = o[kk].map(v => grid(v * k));
    if (o.lunge) o.lunge = [grid(o.lunge[0] * k), grid(o.lunge[1] * k), o.lunge[2]];
    if (o.armor) o.armor.from = grid(o.armor.from * k);
  }
  // 后摇、挨打硬直 ×SLOW_R（打中以后的帧差不变）；格挡硬直不动 —— 被挡住本来就该罚得出来（BLOCK_PEN 也加了），硬直跟着长的话挡住了反而追不上他接的下一招
  for (const kk of ['R', 'stun']) if (typeof o[kk] === 'number' && o[kk] > 0) o[kk] = grid(o[kk] * SLOW_R);
}
function M(o) {
  o.base = { S: o.S, A: o.A, R: o.R };          // 换算前的基准帧数（测试核对节奏用）
  for (const k of TIME_KEYS) if (typeof o[k] === 'number' && o[k] > 0) o[k] = (o.open && (k === 'S' || k === 'R') ? TFO : TF)(o[k]);
  if (o.lie) o.lie = TFH(o.lie);
  for (const k of ['inv', 'sinv', 'airInv', 'slipInv']) if (o[k]) o[k] = o[k].map(TF);
  if (o.lunge) o.lunge = [TF(o.lunge[0]), TF(o.lunge[1]), o.lunge[2]];
  if (o.armor) o.armor = Object.assign({}, o.armor, { from: TF(o.armor.from) });
  if (!o.script) {
    o.pre26 = { S: o.S, R: o.R, stun: o.stun, bstun: o.bstun };      // 2.5 的帧数（测试核对「前摇再长 5~10%」用）
    for (const k of ATK_KEYS) if (typeof o[k] === 'number' && o[k] > 0) o[k] = TA(o[k]);
    // 前冲、无敌、霸体这些按招式自己的时间轴算的，跟着一起拉长（不然前冲提前冲完、无敌提前没了）
    for (const k of ['inv', 'sinv', 'airInv', 'slipInv']) if (o[k]) o[k] = o[k].map(TA);
    if (o.lunge) o.lunge = [TA(o.lunge[0]), TA(o.lunge[1]), o.lunge[2]];
    if (o.armor) o.armor.from = TA(o.armor.from);
    slowDown(o);
    if (!o.air) {
      const i2 = o.keys.findIndex(k => k[0] === 2);
      if (i2 >= 0) {
        for (const k of o.keys) if (k[0] > 2 && k[0] < 3) k[0] = 2 + HOLD_R + (k[0] - 2) * (1 - HOLD_R);
        o.keys.splice(i2 + 1, 0, [2 + HOLD_R, o.keys[i2][1], 'io']);
      }
    }
  }
  o.tier = o.tier || TIER_OF_KIND[o.kind] || o.kind;
  o.lead = o.lead || o.tier;
  o.height = o.height || 'mid';
  const at = o.script ? p => p * o.R : p => p <= 1 ? p * o.S : p <= 2 ? o.S + (p - 1) * o.A : o.S + o.A + (p - 2) * o.R;
  // pb：这一招的底子姿势（别的拳派用自己的，比如咏春拳的 WBASE，见 wingchun.js）。2.12（Jack：打击之间的流畅感）：收招最后那一段没写缓动的用 out ——
  //   停住（HOLD_R）以后拳脚先快快地收回来、快到位了慢下来，接下一招的第一帧也是从收到一半的姿势往过去走（animate 每帧往目标挪，不硬切）
  const n = o.keys.length;
  o.keys = o.keys.map(([p, pose, e], i) => [at(p), mk(pose, o.pb), e || (!o.script && i === n - 1 && p === 3 ? 'out' : 'io')]);
  return o;
}
const J_ = (base, o) => Object.assign({}, base, o);
const JT = P_JTOP, JD = P_JDN;

// 常用姿势片段（2.4 按新人物模型重摆。fh / bh 是拳心相对两肩中间，ff / bf 是脚踝相对髋 + 离地高；tw 拧腰）
// 短拳（参考图第一张）：前手一拳直直打出去、和肩一样高（胳膊伸直，肘关节用阴影表现），前手那边的肩膀跟着送出去；
// 后手拳护在下巴前；身子微微前倾，前腿弓、后腿蹬直。
// 2.11（Jack：大臂、小臂顺着一条线直直往前送，拳头和肩差不多高，肘不翘）：拳头再低一点点（以前比肩高 4 像素，现在 1 像素上下）；
// 贴身打中时胳膊折成「ㄱ」、肘往上翘的毛病在 fighter.js fitContact（拳头被往回拽到肩膀后面去了）
const P_JAB = { tor: 14, head: 4, dx: 10, hy: 69, tw: 46, fh: [58, 1], bh: [7, -7], ff: [38, 0], bf: [-30, 0] };
// 后手直拳：反过来，后手那边的肩膀拧过来、后手打直，前手收回下巴
const P_CROSS = { tor: 18, head: 4, dx: 12, hy: 68, tw: -40, bh: [62, 1], fh: [9, -7], ff: [36, 0], bf: [-34, 0] };   // 2.11 拳头也低一点点（和肩差不多高）
// 重拳（2.4 重做，Jack：以前那下像撒娇）：蹬地、转胯、拧腰，后手整条胳膊打直砸出去，前手拉回来护住下巴，后脚跟抬起
const P_HEAVY = { tor: 22, head: 2, dx: 21, hy: 66, tw: -48, bh: [70, -3], fh: [8, -6], ff: [44, 0], bf: [-40, 2] };
// 腿踢：支撑腿站直、身子往后靠，前腿顶着髋整条蹬出去；两手还护着。
// 2.5.1（Jack：踢的时候人往前平移得太多，平移完腿扭得厉害）：整个人往前送 30 → 26.5；支撑脚留在身后（-12 → -28）、髋高一点，
//     支撑腿差不多直着斜撑在身后 —— 以前支撑脚被髋拖着往前滑出去一大截（一来一回 60 / 48 像素），膝盖还往前拱
const P_KICK = { tor: -33, head: 11, dx: 26.5, hy: 75, tw: 10, ff: [100, 66], bf: [-28, 0], fh: [18, -12], bh: [6, -6] };
// 下蹲（下盘拳、托天掌、扫堂腿的起手）
const P_LOW = { hy: 50, tor: 28, head: -6, tw: 18, ff: [28, 0], bf: [-26, 0], fh: [24, 2], bh: [8, -3] };

const MOVES = {
  /* ---- 拳系（light）：快，近身抢先；被重拳霸体吃掉，但能打断腿 ---- */
  // 短拳：前手从胸口直接往前弹出去，第一帧就往前走、不往回收（1.7.0：以前也先往回收一下，和重拳的起手分不清）
  jab: M({ kind: 'jab', label: '短拳', open: true, S: 4, A: 3, R: 7, dmg: 6, reach: 92, stun: 13, bstun: 7, kb: 2.2, stop: 4, power: .3,
    limb: 'fh', fx: 'jab', lunge: [1, 4, 5],
    keys: [[0, {}], [1, P_JAB, 'back'], [2, P_JAB], [2.45, J_(P_JAB, { tor: 10, dx: 6, tw: 32, fh: [38, -3], ff: [34, 0] })], [3, {}]] }),
  jab2: M({ kind: 'jab', label: '后手直拳', tag: '后手直拳', S: 4, A: 3, R: 7, dmg: 7, reach: 94, stun: 13, bstun: 7, kb: 2.4, stop: 4, power: .35,
    limb: 'bh', fx: 'jab2', lunge: [1, 4, 6],
    keys: [[0, {}], [0.4, { tw: 30, fh: [22, -4], tor: 4 }], [1, P_CROSS, 'back'], [2, P_CROSS], [2.45, J_(P_CROSS, { tor: 12, dx: 8, tw: -24, bh: [38, -3] })], [3, {}]] }),
  // 摆拳（2.12 重摆，Jack：第三下 J 的胳膊怎么都是弯的 —— 2.4 按勾拳摆的，肘翻到上面（fe -1）、拳心目标又短，肘顶到头上面去了；
  //   他定的：重摆成直的 —— 拳从身后、身外侧带起来，摆的感觉靠大幅拧腰，到头胳膊伸直、肘在拳下面、拳到下巴那么高。射程、伤害、帧数都没动）
  jab3: M({ kind: 'jab', label: '摆拳', tag: '摆拳', S: 5, A: 3, R: 8, dmg: 8, reach: 90, stun: 14, bstun: 8, kb: 2.8, stop: 5, power: .4,
    limb: 'fh', fx: 'hook', lunge: [1, 5, 5],
    keys: [[0, {}], [0.45, { fh: [-6, 8], fe: 1, tor: 2, dx: -4, head: 4, tw: -12, bh: [8, -7] }],
      [0.8, { fh: [28, 0], fe: 1, tor: 14, dx: 4, head: 0, tw: 24, hy: 69, bh: [7, -7] }],
      [1, { fh: [63, -4], fe: 1, tor: 24, dx: 10, head: -4, tw: 56, hy: 68, ff: [36, 0], bf: [-30, 0], bh: [7, -7] }, 'back'],
      [2, { fh: [63, -4], fe: 1, tor: 28, dx: 10, head: -4, tw: 58, hy: 68, ff: [36, 0], bf: [-30, 0], bh: [7, -7] }], [3, {}]] }),
  rushL: M({ kind: 'jab', label: '连珠快拳', S: 3, A: 3, R: 6, dmg: 5, reach: 94, stun: 13, bstun: 7, kb: 2.4, stop: 3, power: .3,
    limb: 'fh', fx: 'rush', ghost: true, lunge: [1, 3, 13], rush: true,
    keys: [[0, { tor: 14 }], [1, J_(P_JAB, { tor: 20, dx: 12, fh: [60, 2] }), 'back'], [2, J_(P_JAB, { tor: 20, dx: 12, fh: [60, 2] })], [3, { tor: 14 }]] }),
  rushR: M({ kind: 'jab', label: '连珠快拳', S: 3, A: 3, R: 6, dmg: 5, reach: 94, stun: 13, bstun: 7, kb: 2.4, stop: 3, power: .3,
    limb: 'bh', fx: 'rush', ghost: true, lunge: [1, 3, 13], rush: true,
    keys: [[0, { tor: 14 }], [1, J_(P_CROSS, { tor: 22, dx: 12 }), 'back'], [2, J_(P_CROSS, { tor: 22, dx: 12 })], [3, { tor: 14 }]] }),
  // 2.9（Jack：「寸功」改成「寸劲」）：一直叫寸劲，只是以前是飘的小字（18 号毛笔字里「劲」看着像「功」）—— 改成盖印章，大字看得清
  rushEnd: M({ kind: 'jab', label: '寸劲', stamp: '寸劲', S: 5, A: 3, R: 12, dmg: 10, reach: 96, stun: 16, bstun: 10, kb: 9, stop: 7, shake: 4, power: .7,
    limb: 'fh', fx: 'rushEnd', ghost: true, lunge: [1, 5, 8], ender: true, noCancel: true,
    keys: [[0, { tor: 6, dx: -6, fh: [10, -4], tw: 0 }], [1, { tor: 30, dx: 24, hy: 64, head: -4, tw: 50, fh: [62, 0], bh: [-4, 4], ff: [48, 0], bf: [-36, 0] }, 'back'],
      [2, { tor: 30, dx: 24, hy: 64, head: -4, tw: 50, fh: [62, 0], bh: [-4, 4], ff: [48, 0], bf: [-36, 0] }], [3, {}]] }),
  lowJab: M({ kind: 'jab', label: '下盘拳', open: true, S: 5, A: 3, R: 8, dmg: 5, reach: 88, stun: 12, bstun: 7, kb: 2, stop: 4, power: .3, height: 'low',
    limb: 'fh', fx: 'low', lunge: [1, 5, 4],
    keys: [[0, J_(P_LOW, { fh: [24, -6] })], [1, J_(P_LOW, { tor: 36, dx: 10, hy: 44, tw: 40, fh: [52, 30], bh: [7, -5] }), 'back'],
      [2, J_(P_LOW, { tor: 36, dx: 10, hy: 44, tw: 40, fh: [52, 30], bh: [7, -5] })], [3, J_(P_LOW, { fh: [24, -6] })]] }),
  // 重→拳：贴身顶肘
  elbow: M({ kind: 'jab', label: '顶肘', tag: '顶肘', lead: 'heavy', S: 4, A: 3, R: 9, dmg: 9, reach: 84, stun: 14, bstun: 8, kb: 4, stop: 5, shake: 2, power: .5,
    limb: 'fe', fx: 'elbow', lunge: [1, 4, 10],
    keys: [[0, { tor: 14 }], [0.5, { tor: 2, dx: -4, tw: -10, fh: [8, -12] }],
      [1, { tor: 26, dx: 24, hy: 64, head: -6, tw: 60, fh: [14, -5], bh: [6, -6], ff: [46, 0], bf: [-32, 0] }, 'back'],
      [2, { tor: 26, dx: 24, hy: 64, head: -6, tw: 60, fh: [14, -5], bh: [6, -6], ff: [46, 0], bf: [-32, 0] }], [3, {}]] }),
  // 腿→拳：踢完落步往前冲拳
  stepPunch: M({ kind: 'jab', label: '落步冲拳', tag: '落步冲拳', lead: 'kick', S: 5, A: 3, R: 9, dmg: 8, reach: 100, stun: 14, bstun: 8, kb: 3.5, stop: 5, power: .5,
    limb: 'bh', fx: 'jab2', lunge: [1, 5, 24],
    keys: [[0, { tor: -4, ff: [32, 30] }], [1, { tor: 22, dx: 26, hy: 64, head: -4, tw: -46, bh: [64, -2], fh: [8, -7], ff: [52, 0], bf: [-38, 0] }, 'back'],
      [2, { tor: 22, dx: 26, hy: 64, head: -4, tw: -46, bh: [64, -2], fh: [8, -7], ff: [52, 0], bf: [-38, 0] }], [3, {}]] }),

  /* ---- 重系（heavy）：前摇里带霸体，能硬吃一记短拳；怕腿 ---- */
  // 重拳：先往后蓄 —— 身子后坐、后手拉到耳朵后面、前手伸出去瞄（拳头上聚墨气），再拧腰把后手砸出去。和短拳反着来，一眼分得开
  heavy: M({ kind: 'heavy', label: '重拳', open: true, slow: 18, S: 11, A: 4, R: 13, dmg: 13, reach: 106, stun: 18, bstun: 11, kb: 5.5, stop: 8, shake: 5, power: .8, heavy: true,
    limb: 'bh', fx: 'heavy', lunge: [6, 11, 14], armor: { n: 1, from: 2, vs: ['light'] },
    keys: [[0, {}], [0.3, { tor: 2, dx: -6, hy: 68, head: 4, tw: 34, fh: [32, -4], bh: [-4, -8], ff: [30, 0], bf: [-36, 0] }, 'out'],
      [0.9, { tor: -6, dx: -10, hy: 67, head: 6, tw: 48, fh: [36, -6], bh: [-12, -10], ff: [30, 0], bf: [-40, 0] }],
      [1, P_HEAVY, 'back'], [2, P_HEAVY], [2.5, J_(P_HEAVY, { tor: 16, dx: 14, tw: -30, bh: [44, -2] })], [3, {}]] }),
  // 拳→重
  beng: M({ kind: 'heavy', label: '进步冲拳', stamp: '进步冲拳', lead: 'light', S: 9, A: 4, R: 13, dmg: 19, reach: 112, stun: 19, bstun: 12, kb: 7, stop: 10, shake: 7, power: 1, heavy: true,
    limb: 'fh', fx: 'beng', ghost: true, lunge: [4, 9, 18],
    keys: [[0, {}], [0.5, { fh: [2, 4], tor: 2, hy: 64, dx: -6, tw: -10, bh: [6, -6] }],
      [1, { fh: [64, 4], tor: 24, dx: 30, hy: 62, tw: 50, ff: [50, 0], bf: [-14, 0], head: -2, bh: [-2, 8] }, 'back'],
      [2, { fh: [64, 4], tor: 24, dx: 30, hy: 62, tw: 50, ff: [50, 0], bf: [-14, 0], head: -2, bh: [-2, 8] }], [3, {}]] }),
  // 重→重：劈山，上段（蹲着挡不住）
  chop: M({ kind: 'heavy', label: '劈山掌', stamp: '劈山', lead: 'heavy', height: 'high', S: 9, A: 4, R: 14, dmg: 17, reach: 104, stun: 18, bstun: 12, kb: 6, stop: 9, shake: 6, power: .9, heavy: true,
    limb: 'bh', fx: 'chop', ghost: true, lunge: [4, 9, 12], ender: true, noCancel: true,
    keys: [[0, { tor: 12 }], [0.6, { tor: -16, head: -8, dx: -6, hy: 72, tw: 40, bh: [-6, -60], be: -1, fh: [26, -8], ff: [30, 0], bf: [-32, 0] }],
      [1, { tor: 40, dx: 22, hy: 60, head: -2, tw: -40, bh: [56, 22], fh: [-6, -2], ff: [48, 0], bf: [-36, 0] }, 'out'],
      [2, { tor: 42, dx: 22, hy: 60, head: -2, tw: -42, bh: [54, 28], fh: [-6, -2], ff: [48, 0], bf: [-36, 0] }], [3, {}]] }),
  // 腿→重：盖步砸拳，击倒
  hammer: M({ kind: 'heavy', label: '盖步砸拳', stamp: '盖步砸拳', lead: 'kick', S: 9, A: 5, R: 15, dmg: 20, reach: 108, stun: 20, bstun: 12, kb: 7, stop: 10, shake: 7, power: 1, heavy: true,
    limb: 'bh', fx: 'hammerFist', ghost: true, lunge: [2, 9, 26], launch: 5, ender: true, noCancel: true,
    keys: [[0, { tor: 0 }], [0.6, { spin: 30, tor: -10, head: -12, hy: 72, tw: 30, bh: [-20, -58], be: -1, fh: [18, -26], ff: [12, 0], bf: [-38, 0] }],
      [1, { spin: 10, tor: 48, dx: 26, hy: 56, head: 4, tw: -36, bh: [50, 36], fh: [-6, -4], ff: [50, 0], bf: [-32, 0] }, 'out'],
      [2, { spin: 10, tor: 48, dx: 26, hy: 56, head: 4, tw: -36, bh: [50, 36], fh: [-6, -4], ff: [50, 0], bf: [-32, 0] }], [3, { spin: 0 }]] }),
  // 拳拳重：冲天炮（对空，击倒）
  upper: M({ kind: 'heavy', label: '冲天炮', stamp: '冲天炮', tier: 'aa', lead: 'light', S: 8, A: 4, R: 16, dmg: 22, reach: 98, stun: 19, bstun: 12, kb: 3, stop: 10, shake: 7, power: 1, heavy: true,
    limb: 'bh', fx: 'upper', ghost: true, lunge: [4, 8, 9], launch: 9, noCancel: true, ender: true, antiAir: 120,
    keys: [[0, {}], [0.5, { bh: [14, 30], hy: 50, tor: 26, fh: [16, -10], dx: 4, tw: 34 }],
      [1, { bh: [60, -30], hy: 78, tor: 6, dx: 29, bf: [-20, 10], head: -10, fh: [10, -8], air: 6, tw: -44, ff: [42, 0] }, 'out'],
      [2, { bh: [30, -62], hy: 82, tor: -10, dx: 22, bf: [-14, 14], head: -18, fh: [8, -8], air: 8, tw: -40, ff: [38, 0] }], [3, {}]] }),
  // 蹲+重：托天掌（对空）
  palm: M({ kind: 'heavy', label: '托天掌', stamp: '托天掌', tier: 'aa', lead: 'heavy', open: true, S: 7, A: 5, R: 15, dmg: 11, reach: 96, stun: 15, bstun: 10, kb: 3, stop: 8, shake: 4, power: .8,
    limb: 'fh', fx: 'palm', ghost: true, lunge: [2, 7, 6], launchAir: 9, antiAir: 160, airInv: [1, 12], ender: true, noCancel: true,
    keys: [[0, J_(P_LOW, { fh: [20, 10], bh: [10, 14] })], [0.5, J_(P_LOW, { hy: 40, fh: [24, 22], bh: [14, 24], tor: 34 })],
      [1, { hy: 76, tor: 8, head: -12, fh: [54, -34], bh: [48, -30], ff: [42, 0], bf: [-24, 6], air: 4, dx: 28, tw: 14 }, 'out'],
      [2, { hy: 80, tor: -6, head: -20, fh: [34, -60], bh: [24, -56], ff: [36, 0], bf: [-20, 8], air: 6, dx: 18, tw: 10 }], [3, {}]] }),
  // 跑+重：沉肩靠（2.9 改名：Jack 说招名不要带别的拳派的东西，改成通用的说法）
  shoulder: M({ kind: 'heavy', label: '沉肩靠', stamp: '沉肩靠', lead: 'heavy', open: true, slow: 16.5, S: 10, A: 5, R: 16, dmg: 14, reach: 96, stun: 19, bstun: 13, kb: 11, stop: 10, shake: 8, power: 1, heavy: true,
    limb: 'sh', fx: 'shoulder', ghost: true, lunge: [2, 11, 44], armor: { n: 2, from: 2, vs: ['light'] }, ender: true, noCancel: true,
    // 2.4：先缩身蓄一下，再侧过身、压低重心，肩背撞进去（低头、两手收在身前，前脚一大步落地）
    // 2.7.1（Jack：腿别交叉、手也别交叉，就是半蹲着靠过去）：不再转身（spin 56 转过去，两条腿从对面的大腿根出来，交叉成 X；
    //     两只手收在身前也搅在一起）。现在一直侧着：先缩身往下沉一下，再上一步半蹲着（髋 73 → 60，两腿都弯）、身子往前倾、
    //     拧腰把前肩送出去靠上去；前手垂在身前（拳在前大腿那儿）、后手垂在身后，两只手一前一后不交叉。
    //     前脚落在身子底下偏前（不踩进对方两脚中间），后腿斜着撑在后面
    // 2.8（Jack：是肩膀撞过去、人侧着一点过去，不是头撞过去）：肩膀往前靠（tor 20）、头往后仰着收回来（head -40）、拧腰 80°、侧过来 14°。
    // 2.9（Jack：人再侧一点过去，头低下来一点，用肩膀撞上去）：2.8 头往后仰着（头对着天，像被打了一下往后躲）。现在：
    //     侧得多一点（spin 14 → 26，再多两条腿就交叉了）、沉得更低（髋 60 → 55，「沉肩」）、拧腰 84°，头不往后仰了 ——
    //     上身前倾 18°、头再低一点点（head -14：脸朝前、下巴微收，tor + head = 4°，2.8 是 -20°），整个头还是收在前肩、大臂后面，肩膀先到。
    //     蓄的那一下先侧过身、往后坐（拧腰 40°、侧 10°），前手垂在前大腿外面、后手往身后甩，一前一后不交叉
    keys: [[0, { tor: 12, hy: 66 }], [0.5, { tor: 2, dx: -10, hy: 60, head: -4, tw: 40, spin: 10, fh: [10, 28], bh: [-12, 30], ff: [24, 0], bf: [-42, 0] }],
      [1, { tor: 18, dx: 42, hy: 55, head: -14, tw: 84, spin: 26, fh: [10, 42], bh: [-24, 32], ff: [16, 0], bf: [-50, 0] }, 'out'],
      [2, { tor: 18, dx: 42, hy: 55, head: -14, tw: 84, spin: 26, fh: [10, 42], bh: [-24, 32], ff: [16, 0], bf: [-50, 0] }],
      // 收：后手先贴着身子收回来，前手从前面抬起来护着 —— 两只手各走各的，不在身前交叉
      [2.5, { tor: 10, dx: 20, hy: 62, head: -6, tw: 54, spin: 12, fh: [20, 18], bh: [-4, 14], ff: [20, 0], bf: [-44, 0] }], [3, {}]] }),

  /* ---- 腿系（kick）：射程远，能打重拳；怕近身短拳，出腿时被拳打中会失衡倒地 ----
     2.0（Jack：腿踢还是超标，尤其距离）：腿踢射程 134 → 126，腿系连招、飞踢也一起短 4~10 */
  kick: M({ kind: 'kick', label: '腿踢', open: true, slow: 19.5, S: 13, A: 5, R: 14, dmg: 11, reach: 126, stun: 16, bstun: 10, kb: 4, stop: 7, shake: 4, power: .75,
    limb: 'ff', fx: 'kick', lunge: [6, 13, 12],
    keys: [[0, {}], [0.55, { ff: [30, 62], tor: -8, bf: [-27, 0], fh: [22, -12], bh: [6, -7], head: 3, hy: 74, dx: 3, tw: 10 }],
      [1, P_KICK, 'back'], [2, P_KICK], [2.4, { ff: [36, 44], tor: -14, dx: 13, hy: 74, bf: [-27, 0] }], [3, {}]] }),
  // 拳→踢
  whip: M({ kind: 'kick', label: '鞭腿', stamp: '鞭腿', lead: 'light', S: 10, A: 5, R: 14, dmg: 16, reach: 122, stun: 17, bstun: 10, kb: 6.5, stop: 8, shake: 5, power: .85,
    limb: 'bf', fx: 'whip', lunge: [5, 10, 10],
    keys: [[0, {}], [0.5, { bf: [10, 56], tor: -10, ff: [22, 0], fh: [20, -14], bh: [6, -6], spin: 20, hy: 74, tw: 0 }],
      [1, { bf: [94, 96], tor: -40, dx: 22, ff: [8, 0], fh: [-4, -22], bh: [2, -10], head: 16, spin: 30, hy: 76, tw: -10 }, 'back'],
      [2, { bf: [94, 96], tor: -40, dx: 22, ff: [8, 0], fh: [-4, -22], bh: [2, -10], head: 16, spin: 30, hy: 76, tw: -10 }],
      [2.4, { bf: [24, 48], tor: -12, dx: 12, spin: 10, hy: 72 }], [3, {}]] }),
  // 踢→踢：二起脚（腾空飞脚，击倒）。2.4：腾起来先提前膝（第一脚），身子在空中基本立着、微微后仰，
  // 后腿从后面撩上来踢到头那么高，前手往前拍过去（以前整个人往后躺，像摔出去）
  // 2.7（Jack：腿还是扭）：以前腾起来时后腿膝盖往前顶、小腿往后收，和提起来的前腿交叉成一个 X；踢出去时前腿小腿横着往后折（像跪在半空）。
  //     现在：腾空时前腿提膝、小腿往下垂，后腿在身后自然垂着（不交叉）；踢出去时前腿大腿平着、小腿垂下来（收在身下），
  //     后腿整条踢直、往上一点（脚到对方头那么高），前手往前迎着脚拍过去、后手往后摆
  twinKick: M({ kind: 'kick', label: '二起脚', stamp: '二起脚', lead: 'kick', S: 8, A: 5, R: 16, dmg: 15, reach: 116, stun: 18, bstun: 11, kb: 6, stop: 9, shake: 6, power: .9,
    limb: 'bf', fx: 'twinKick', ghost: true, lunge: [2, 8, 22], launch: 6, ender: true, noCancel: true,
    keys: [[0, { ff: [30, 30], tor: 4 }], [0.5, { air: 24, tor: 6, head: 2, ff: [30, 42], bf: [-24, 16], fh: [24, -36], bh: [-14, -26], hy: 66, tw: 16 }],
      [1, { air: 34, tor: -12, head: 8, dx: 25, ff: [30, 26], bf: [92, 112], fh: [44, -2], bh: [-30, -8], hy: 66, tw: -10 }, 'back'],
      [2, { air: 30, tor: -12, head: 8, dx: 25, ff: [30, 26], bf: [92, 112], fh: [44, -2], bh: [-30, -8], hy: 66, tw: -10 }],
      [2.5, { air: 6, tor: 6, ff: [32, 10], bf: [-20, 12], hy: 68 }], [3, {}]] }),
  // 拳拳踢：转身蹬
  backKick: M({ kind: 'kick', label: '转身蹬', stamp: '转身蹬', lead: 'light', S: 8, A: 5, R: 16, dmg: 17, reach: 116, stun: 19, bstun: 11, kb: 11, stop: 9, shake: 6, power: .9,
    limb: 'bf', fx: 'backKick', ghost: true, lunge: [2, 8, 12], ender: true, noCancel: true,
    keys: [[0, {}], [0.5, { spin: 130, tor: 22, head: 8, bf: [-30, 36], ff: [10, 0], fh: [16, -10], bh: [8, -8], hy: 70, tw: 0 }],
      [1, { spin: 180, tor: 46, head: 14, dx: 16, bf: [-104, 62], ff: [8, 0], fh: [20, 8], bh: [10, 14], hy: 72, tw: 0 }, 'back'],
      [2, { spin: 180, tor: 46, head: 14, dx: 16, bf: [-104, 62], ff: [8, 0], fh: [20, 8], bh: [10, 14], hy: 72, tw: 0 }],
      [2.5, { spin: 270, tor: 20, bf: [-22, 22], hy: 70 }], [3, { spin: 360 }]] }),
  // 重→踢：旋风腿（击倒）
  whirl: M({ kind: 'kick', label: '旋风腿', stamp: '旋风腿', lead: 'heavy', S: 12, A: 6, R: 16, dmg: 21, reach: 126, stun: 19, bstun: 13, kb: 6, stop: 10, shake: 8, power: 1, heavy: true,
    limb: 'ff', fx: 'whirl', ghost: true, lunge: [4, 12, 16], launch: 7, ender: true, noCancel: true,
    keys: [[0, {}], [0.4, { spin: 90, tor: -4, ff: [14, 38], air: 8, fh: [-8, -36], bh: [-16, -28], hy: 70, tw: 0 }],
      [0.75, { spin: 220, ff: [66, 70], tor: -22, air: 22, fh: [-6, -26], bh: [-20, -6], hy: 70 }],
      [1, { spin: 350, ff: [100, 80], tor: -36, dx: 28, air: 22, fh: [-8, -26], bh: [-24, 2], hy: 70 }, 'out'],
      [2, { spin: 360, ff: [96, 72], tor: -32, dx: 28, air: 10, fh: [-8, -26], bh: [-24, 2], hy: 70 }],
      [2.5, { spin: 360, ff: [36, 36], tor: -8, dx: 14, hy: 70 }], [3, { spin: 360 }]] }),
  // 蹲+踢：扫堂腿（下段，击倒）
  // 1.8.0：扫堂腿太好用（快、远、下段、击倒）→ 前摇长一点、射程短一点（比腿踢近）、收招更长、倒地时间短一点；
  //        反制多了：蹲挡后踩腿、抄腿接住、跳过去打它收招（破绽）、近身短拳打失衡
  sweep: M({ kind: 'kick', label: '扫堂腿', stamp: '扫堂腿', height: 'low', S: 10, A: 4, R: 20, dmg: 9, reach: 112, stun: 16, bstun: 9, kb: 4, stop: 7, shake: 4, power: .7,
    limb: 'ff', fx: 'sweep', lunge: [3, 10, 10], launch: 3, lie: 23, ender: true, noCancel: true,   // 2.7 躺 ×0.9（26 → 23）
    // 后腿深蹲撑住、前腿贴地伸直扫出去；手收在身前。
    // 2.5（Jack：后面那条腿不是往后，是往侧面 —— z 轴）：蹲着的后腿膝盖、脚尖朝外（bo，往离镜头远的那一侧摆出去），
    // 侧面看就是髋底下缩短的一截，不再往身后支出去
    keys: [[0, J_(P_LOW, {})],
      [0.45, { hy: 34, tor: 14, head: -2, dx: -4, tw: 18, bo: 80, ff: [22, 4], bf: [-4, 0], fh: [22, -2], bh: [8, -8] }],
      [1, { hy: 35, tor: 10, head: -4, dx: 4, tw: 22, bo: 85, ft: 40, ff: [72, 0], bf: [-4, 0], fh: [24, -2], bh: [8, -8] }, 'out'],
      [2, { hy: 35, tor: 10, head: -4, dx: 4, tw: 22, bo: 85, ft: 46, ff: [76, 0], bf: [-4, 0], fh: [24, -2], bh: [8, -8] }],
      [2.5, { hy: 38, tor: 16, head: -4, dx: 0, tw: 18, bo: 50, ff: [40, 2], bf: [-12, 0], fh: [24, 0], bh: [8, -6] }], [3, J_(P_LOW, {})]] }),

  /* ---- 空中（上段：蹲着挡不住；飞踢可以蹲下躲）。都是先往后蓄、再往前打的整套动作 ----
     1.7.0：出手时整个人往前下方倾（rot），拳脚真的够得着对面；判定持续到快落地，同一个距离什么时候出都打得到；
     往下够的深度统一 AIR_VREACH。前摇没出完就落地 = 落地后马上在地上出这一招（fighter.js onLand），按了一定有反应 */
  // 挥拳（跳起来出；2.4 Jack：跳起来出的招名字不要「空中」两个字，以前叫空中挥拳）：拳头先甩到脑后，人往前一扑，从上往前下方砸过去
  airJab: M({ kind: 'jab', label: '挥拳', tier: 'air', lead: 'light', height: 'high', open: true, S: 4, A: 12, R: 6, dmg: 7, reach: 98, vreach: AIR_VREACH, stun: 15, bstun: 9, kb: 2.6, stop: 5, power: .45,
    limb: 'fh', fx: 'airSwing', air: true,
    keys: [[0, JT], [0.55, J_(JT, { rot: 4, tor: -10, head: -6, fh: [-20, -50], fe: -1, bh: [8, -8], ff: [20, 48], bf: [-4, 42], tw: 20 })],
      [1, { rot: 22, tor: 30, head: -8, dx: 5.5, fh: [60, 12], bh: [6, -6], ff: [18, 42], bf: [-34, 26], tw: 50 }, 'back'],
      [2, { rot: 24, tor: 32, head: -8, dx: 5.5, fh: [58, 16], bh: [6, -6], ff: [18, 42], bf: [-34, 26], tw: 50 }], [3, JD]] }),
  // 坠山击：后仰把双拳举过头顶，再整个人往前下方卷下去砸（1.9.0 伤害 12 → 11：打蹲着的人让给坠山）
  // 2.1（Jack：打电脑像「版本答案」，前摇、整个动作都太快）：前摇 7 → 10、判定 10 → 11、后摇 8 → 10（举过头顶那一下看得清）
  airHeavy: M({ kind: 'heavy', label: '坠山击', stamp: '坠山击', tier: 'air', lead: 'heavy', height: 'high', open: true, S: 10, A: 11, R: 10, dmg: 12, reach: 104, vreach: AIR_VREACH, stun: 19, bstun: 12, kb: 5, stop: 9, shake: 6, power: 1, heavy: true,
    limb: 'fh', fx: 'hammer', air: true,
    keys: [[0, JT], [0.7, { rot: -8, tor: -28, head: -12, fh: [-12, -60], bh: [-22, -54], fe: -1, be: -1, ff: [18, 56], bf: [2, 50], tw: 0 }],
      [1, { rot: 26, tor: 50, head: 18, dx: 15, fh: [56, 42], bh: [50, 46], ff: [22, 24], bf: [-24, 36], tw: 0 }, 'out'],
      [2, { rot: 28, tor: 52, head: 18, dx: 15, fh: [54, 46], bh: [48, 50], ff: [22, 24], bf: [-24, 36], tw: 0 }], [3, JD]] }),
  // 飞踢：先把膝盖收到胸口，身体后仰，整个人前倾着一脚往前下方蹬出去
  // 2.1（Jack：和坠山击一样太快、太好用）：前摇 6 → 9、判定 12 → 13、后摇 7 → 9（收膝那一下看得清，整个动作慢一点）
  airKick: M({ kind: 'kick', label: '飞踢', stamp: '飞踢', tier: 'air', lead: 'kick', height: 'high', open: true, S: 9, A: 13, R: 9, dmg: 11, reach: 124, vreach: AIR_VREACH, stun: 18, bstun: 11, kb: 6, stop: 8, shake: 5, power: .9,
    limb: 'ff', fx: 'airKick', air: true, ghost: true, evadeCrouch: true,
    keys: [[0, JT], [0.6, { rot: -6, tor: 12, head: -6, ff: [10, 62], bf: [-6, 48], fh: [24, -30], bh: [6, -8], tw: 10 }],
      [1, { rot: 14, tor: -38, head: 14, dx: 19, ff: [106, 24], bf: [-12, 52], fh: [-10, -24], bh: [2, -10], tw: 10 }, 'back'],
      [2, { rot: 14, tor: -38, head: 14, dx: 19, ff: [106, 24], bf: [-12, 52], fh: [-10, -24], bh: [2, -10], tw: 10 }], [3, JD]] }),
  // 坠山：空中按住蹲再踢。先往上一腾、团身（从高处起），再整个人斜成一条线，前脚笔直往前下方踩下去（打到会往后翻着弹开）
  // 1.9.0：主系「坠」—— 专破蹲着的防守和反击：踩蹲着 / 蹲挡 / 出下段的 ×1.3，对空招（托天掌、冲天炮）打不到它、反被踩倒 ×1.5；
  //        怕站着的拳：被短拳系 / 重拳系迎着打中 = 倒栽葱 ×1.4、倒地更久；站挡挡得住。前摇更慢（腾得更高）。
  //        踩中后弹起落在对手面前，这一下算「腿起手」：落地 踢 = 二起脚、重 = 盖步砸拳、拳 = 落步冲拳（都是真连）
  dive: M({ kind: 'kick', label: '坠山', stamp: '坠山', tier: 'dive', lead: 'kick', height: 'high', S: 15, A: 40, R: 8, dmg: 10, reach: 84, vreach: 64, stun: 19, bstun: 10, kb: 2, stop: 8, shake: 6, power: .9,
    limb: 'ff', fx: 'dive', air: true, ghost: true, dive: true, aaProof: true,
    keys: [[0, JT], [0.7, { rot: -8, tor: 8, head: 4, ff: [22, 60], bf: [-10, 46], fh: [16, -46], bh: [-24, -36], tw: 0 }],
      [1, { rot: -42, tor: 2, head: 12, ff: [16, -16], bf: [-22, 36], fh: [-26, -30], bh: [-36, -12], tw: 0 }, 'out'],
      [2, { rot: -42, tor: 2, head: 12, ff: [16, -16], bf: [-22, 36], fh: [-26, -30], bh: [-36, -12], tw: 0 }], [3, JD]] }),

  /* ---- 擒拿（挡不住；出腿时被拿 = 接腿摔；被任何正在判定中的打击打断）----
     1.8.0：抓住以后先「擒住」一小会儿 —— 这时候按 拳 = 提膝撞，踢 = 别腿摔，重 / 后 = 过肩摔，什么都不按 = 推开；
     被抓的人在擒住刚开始那几帧按「拿」能挣脱。蹲着的人站着抓不到（要用蹲+拿「抄腿」）；抄腿只抓蹲着的和出腿的 */
  grab: M({ kind: 'grab', label: '擒拿', open: true, S: 6, A: 4, R: 15, dmg: 6, reach: 84, power: .4,
    limb: 'fh', lunge: [2, 6, 8],
    keys: [[0, {}], [0.4, { fh: [12, 2], bh: [8, 4], tor: 4, dx: -4, hy: 70, tw: 0 }],
      [1, { fh: [54, 16], bh: [50, 20], tor: 30, dx: 18, hy: 64, ff: [42, 0], bf: [-26, 0], head: -8, tw: 0 }, 'out'],
      [2, { fh: [54, 16], bh: [50, 20], tor: 30, dx: 18, hy: 64, ff: [42, 0], bf: [-26, 0], head: -8, tw: 0 }], [3, {}]] }),
  // 推开：擒住后什么都不按，两手往前一推，把人推出去（自己先动一点）
  grabHit: M({ kind: 'script', label: '推开', S: 0, A: 0, R: 16, script: true, evPush: 4,
    keys: [[0, { fh: [32, 8], bh: [26, 12], tor: 10, dx: 4, hy: 66, tw: 0 }],
      [0.25, { fh: [66, -4], bh: [60, 0], tor: 32, dx: 22, hy: 64, ff: [44, 0], bf: [-18, 0], tw: 0 }, 'back'],
      [0.5, { fh: [66, -4], bh: [60, 0], tor: 32, dx: 22, hy: 64, ff: [44, 0], bf: [-18, 0], tw: 0 }], [1, {}]] }),
  // 过肩摔：往怀里一带 → 下蹲扛起 → 起身后仰把人从头顶抡过去 → 往身后砸 → 收势。对手跟着手走的路线见 fighter.js THROW_PATH
  throwBack: M({ kind: 'script', label: '过肩摔', S: 0, A: 0, R: 30, script: true, evSlam: 14,
    keys: [[0, { fh: [34, 4], bh: [28, 8], tor: 20, hy: 62, head: -6, ff: [34, 0], bf: [-32, 0], tw: 0 }],
      [0.13, { fh: [16, 2], bh: [8, 6], tor: 10, hy: 52, dx: 2, head: -4, ff: [36, 0], bf: [-34, 0], tw: 0 }],
      [0.3, { fh: [4, -56], bh: [-6, -52], fe: -1, be: -1, tor: -14, head: -18, hy: 74, dx: -4, ff: [32, 0], bf: [-36, 0], tw: 0 }],
      [0.47, { fh: [-44, 24], bh: [-50, 28], tor: -38, head: -20, hy: 58, dx: -10, ff: [40, 0], bf: [-28, 0], tw: 0 }, 'out'],
      [0.62, { fh: [-40, 28], bh: [-46, 32], tor: -32, head: -16, hy: 56, dx: -8, ff: [40, 0], bf: [-28, 0], tw: 0 }], [1, {}]] }),
  legCatch: M({ kind: 'script', label: '接腿摔', S: 0, A: 0, R: 26, script: true, evSlam: 13,
    keys: [[0, { fh: [50, 30], bh: [44, 34], tor: 24, dx: 14, hy: 66, tw: 0 }],
      [0.25, { fh: [30, 4], bh: [22, 8], tor: -12, dx: -2, hy: 74, head: -12, tw: 0 }],
      [0.5, { fh: [36, 48], bh: [26, 52], tor: 46, dx: 12, hy: 54, head: 10, tw: 0 }, 'out'],
      [0.7, { fh: [36, 48], bh: [26, 52], tor: 46, dx: 12, hy: 54, head: 10, tw: 0 }], [1, {}]] }),
  // 抄腿（蹲+拿）：压低身子往前一扑，两手抄对方的腿。抓得到：出腿的（含扫堂腿 → 抄腿摔）、蹲着 / 蹲挡的（→ 擒住 → 抱腿摔）；
  // 站着的人抓不到（抓空，收招长）
  lowGrab: M({ kind: 'grab', label: '抄腿', low: true, height: 'low', open: true, S: 8, A: 4, R: 16, dmg: 0, reach: 88, power: .5,
    limb: 'fh', lunge: [2, 8, 14],
    keys: [[0, J_(P_LOW, { fh: [20, 8], bh: [10, 12] })], [0.5, J_(P_LOW, { hy: 40, tor: 22, fh: [8, 10], bh: [-4, 14], dx: -4 })],
      [1, { hy: 36, tor: 54, dx: 20, head: -14, fh: [60, 50], bh: [54, 54], ff: [46, 0], bf: [-36, 0], tw: 0 }, 'out'],
      [2, { hy: 36, tor: 54, dx: 20, head: -14, fh: [60, 50], bh: [54, 54], ff: [46, 0], bf: [-36, 0], tw: 0 }], [3, J_(P_LOW, {})]] }),
  // 擒住：抓住后的一小会儿，两手揪住对方往怀里带。这几帧决定后续（拳 / 踢 / 重或后 / 不按）；被抓的在前 ESC_WIN 帧按拿能挣脱
  hold: M({ kind: 'script', label: '擒住', S: 0, A: 0, R: 10, script: true,
    keys: [[0, { fh: [50, 18], bh: [44, 22], tor: 28, dx: 14, hy: 64, ff: [38, 0], bf: [-24, 0], tw: 0 }],
      [0.5, { fh: [34, 10], bh: [28, 14], tor: 14, dx: 6, hy: 66, head: 2, ff: [34, 0], bf: [-28, 0], tw: 0 }],
      [1, { fh: [30, 8], bh: [24, 12], tor: 10, dx: 4, hy: 66, head: 4, ff: [34, 0], bf: [-30, 0], tw: 0 }]] }),
  // 提膝撞：揪住连顶两膝，不击倒，但顶完自己先动（帧差 +KNEE_ADV）
  knee: M({ kind: 'script', label: '提膝撞', S: 0, A: 0, R: 22, script: true, evHit: 5, evHit2: 13,
    keys: [[0, { fh: [30, 8], bh: [24, 12], tor: 10, dx: 4, hy: 66, tw: 0 }],
      [0.2, { fh: [26, 14], bh: [20, 18], tor: -10, dx: 8, hy: 72, head: 8, ff: [36, 62], bf: [-20, 0], tw: 0 }, 'out'],
      [0.36, { fh: [30, 8], bh: [24, 12], tor: 8, dx: 4, hy: 66, ff: [26, 4], bf: [-26, 0], tw: 0 }],
      [0.56, { fh: [26, 14], bh: [20, 18], tor: -12, dx: 10, hy: 72, head: 8, ff: [38, 66], bf: [-20, 0], tw: 0 }, 'out'],
      [0.75, { fh: [44, -4], bh: [38, 0], tor: 18, dx: 10, hy: 64, ff: [32, 0], bf: [-32, 0], tw: 0 }], [1, {}]] }),
  // 别腿摔：脚往对方脚后一别，手往前下一推，对方往后仰倒在面前（倒在跟前，起身由你压）
  trip: M({ kind: 'script', label: '别腿摔', S: 0, A: 0, R: 24, script: true, evSlam: 9,
    keys: [[0, { fh: [30, 8], bh: [24, 12], tor: 10, dx: 4, hy: 66, tw: 0 }],
      [0.25, { fh: [40, -6], bh: [34, -2], tor: 24, dx: 16, hy: 64, ff: [60, 8], bf: [-24, 0], head: -8, tw: 0 }],
      [0.4, { fh: [56, 26], bh: [50, 30], tor: 46, dx: 22, hy: 56, ff: [64, 0], bf: [-32, 0], head: 4, tw: 0 }, 'out'],
      [0.6, { fh: [52, 34], bh: [46, 38], tor: 44, dx: 20, hy: 56, ff: [58, 0], bf: [-34, 0], tw: 0 }], [1, {}]] }),
  // 抱腿摔：抄腿抓住蹲着的人，抱着腿往前一顶把人掀翻
  tackle: M({ kind: 'script', label: '抱腿摔', S: 0, A: 0, R: 26, script: true, evSlam: 10,
    keys: [[0, { hy: 36, tor: 54, dx: 20, head: -14, fh: [56, 50], bh: [50, 54], ff: [46, 0], bf: [-36, 0], tw: 0 }],
      [0.3, { hy: 48, tor: 38, dx: 30, head: -8, fh: [44, 20], bh: [38, 24], ff: [58, 0], bf: [-42, 0], tw: 0 }],
      [0.45, { hy: 58, tor: 28, dx: 34, head: -4, fh: [50, -16], bh: [44, -12], ff: [60, 0], bf: [-38, 0], tw: 0 }, 'out'],
      [0.65, { hy: 56, tor: 32, dx: 30, fh: [48, 4], bh: [42, 8], ff: [56, 0], bf: [-38, 0], tw: 0 }], [1, {}]] }),
  // 抄腿摔：抄腿接住对方出腿（含扫堂腿），把腿往上一掀，人仰面摔倒
  scoop: M({ kind: 'script', label: '抄腿摔', S: 0, A: 0, R: 26, script: true, evSlam: 12,
    keys: [[0, { hy: 38, tor: 48, dx: 18, head: -12, fh: [58, 48], bh: [52, 52], ff: [46, 0], bf: [-36, 0], tw: 0 }],
      [0.3, { hy: 62, tor: 10, dx: 10, head: -14, fh: [46, -10], bh: [40, -6], ff: [42, 0], bf: [-32, 0], tw: 0 }],
      [0.5, { hy: 70, tor: -16, dx: 4, head: -20, fh: [30, -54], bh: [24, -50], ff: [36, 0], bf: [-32, 0], tw: 0 }, 'out'],
      [0.7, { hy: 66, tor: 6, dx: 6, fh: [40, -20], bh: [34, -16], ff: [36, 0], bf: [-32, 0], tw: 0 }], [1, {}]] }),

  /* ---- 防守反击 ---- */
  // 推挡：格挡中按拳。出手期间打不中他，把对方推开并打断；空了后摇很长
  shove: M({ kind: 'push', label: '推挡', tier: 'push', S: 2, A: 4, R: 12, dmg: 0, reach: 108, stun: 9, bstun: 0, kb: PUSH_KB, stop: 4, power: .3,
    limb: 'fh', fx: 'shove', push: true, sinv: [0, 6], noCancel: true,
    keys: [[0, { fh: [17, -17], bh: [13, -13], tor: 2, head: 8, dx: -3, hy: 70, tw: 8 }],
      [1, { fh: [64, -12], bh: [60, -6], tor: 28, dx: 37, hy: 64, head: -4, ff: [50, 0], bf: [-32, 0], tw: 10 }, 'back'],
      [2, { fh: [64, -12], bh: [60, -6], tor: 28, dx: 37, hy: 64, head: -4, ff: [50, 0], bf: [-32, 0], tw: 10 }], [3, {}]] }),
  // 截击（1.8.0）：挡住以后（格挡硬直里）按「重」，花 GC_COST 气从格挡里直接打出一拳。出手前打击无敌，把对方打开
  jieQuan: M({ kind: 'heavy', label: '截击', stamp: '截击', tier: 'heavy', lead: 'heavy', S: 5, A: 4, R: 16, dmg: 11, reach: 104, stun: 18, bstun: 10, kb: 9, stop: 9, shake: 5, power: .9, heavy: true,
    limb: 'fh', fx: 'beng', ghost: true, lunge: [0, 5, 18], sinv: [0, 6], cost: GC_COST, ender: true, noCancel: true,
    keys: [[0, { hy: 70, tor: 2, head: 8, dx: -3, tw: 8, fh: [17, -17], bh: [13, -13], ff: [24, 0], bf: [-33, 0] }],
      [0.5, { hy: 68, tor: 8, head: 4, dx: -2, tw: 24, fh: [26, -10], bh: [9, -8], ff: [28, 0], bf: [-33, 0] }],
      [1, { hy: 64, tor: 24, head: -4, dx: 17, tw: 50, fh: [64, -4], bh: [6, -6], ff: [46, 0], bf: [-36, 0] }, 'back'],
      [2, { hy: 64, tor: 24, head: -4, dx: 17, tw: 50, fh: [64, -4], bh: [6, -6], ff: [46, 0], bf: [-36, 0] }], [3, {}]] }),
  // 踩腿（1.8.0）：蹲挡住扫堂腿这类下段腿以后按「踢」，抬膝往前下一脚踩在对方伸出来的腿上。击倒
  stomp: M({ kind: 'kick', label: '踩腿', stamp: '踩腿', height: 'low', S: 4, A: 4, R: 14, dmg: 12, reach: 122, stun: 16, bstun: 9, kb: 4, stop: 9, shake: 6, power: .9,
    limb: 'ff', fx: 'stomp', lunge: [1, 4, 24], launch: 4, lie: 27, ender: true, noCancel: true,   // 2.7 躺 ×0.9（30 → 27）
    keys: [[0, J_(P_LOW, { ff: [30, 0] })], [0.6, { hy: 72, tor: -8, head: 6, dx: 4, ff: [30, 66], bf: [-22, 0], fh: [26, -14], bh: [6, -8], tw: 10 }],
      [1, { hy: 62, tor: 22, head: -10, dx: 22, ff: [76, 4], bf: [-26, 0], fh: [22, -6], bh: [6, -6], tw: 10 }, 'out'],
      [2, { hy: 62, tor: 22, head: -10, dx: 22, ff: [76, 2], bf: [-26, 0], fh: [22, -6], bh: [6, -6], tw: 10 }], [3, {}]] }),
  // 冲刺：同一方向双击。压低身子贴地滑出一大步，前 8 帧谁都碰不到，能穿到对面身后；
  // 第 DASH_CANCEL 帧起可以直接按招打出去，冲刺后的第一招带「冲势」
  dash: M({ kind: 'script', label: '冲刺', S: 0, A: 0, R: 16, script: true, lunge: [0, 10, 96], inv: [0, 8],
    keys: [[0, { hy: 62, tor: 22, head: -6, ff: [32, 0], bf: [-28, 0], fh: [18, -6], bh: [8, -6], tw: 10 }],
      [0.12, { hy: 56, tor: 34, head: -14, dx: 8, ff: [50, 8], bf: [-62, 14], fh: [14, 2], bh: [-30, 6], tw: 10 }, 'out'],
      [0.45, { hy: 54, tor: 32, head: -12, dx: 10, ff: [52, 2], bf: [-62, 6], fh: [16, 0], bh: [-30, 4], tw: 10 }],
      [0.7, { hy: 60, tor: 16, head: -6, dx: 4, ff: [44, 0], bf: [-46, 0], fh: [26, -14], bh: [10, -8], tw: 16 }], [1, {}]] }),
  // 闪身（2.0，边挡边冲刺）：按住格挡、朝对手双击方向（格挡中、挡住的硬直里都行）。压低身子、两手护着头，从对手身边钻过去到他身后。
  // 2.0.2：钻的那十来帧（slipInv）只有重系的手上招打不中（闪），短拳、腿、下段、擒拿都截得住（截住闪身 ×1.3）。冲多远按对手在哪算（fighter.js beginSlip），
  // 前冲的距离写在这一招自己身上（move.lungePx）。躲过了重拳 → 自动接回身肘（slipElbow）；钻空了第 SLIP_CANCEL 帧起能直接出招
  slip: M({ kind: 'script', label: '闪身', S: 0, A: 0, R: 22, script: true, lunge: [0, 11, 110], slipInv: [0, 11],
    keys: [[0, { hy: 58, tor: 24, head: 4, dx: -2, fh: [14, -22], bh: [18, -12], fe: -1, ff: [30, 0], bf: [-32, 0], tw: 8 }],
      [0.14, { hy: 46, tor: 42, head: -4, dx: 12, fh: [18, -20], bh: [20, -8], fe: -1, ff: [52, 6], bf: [-54, 12], tw: 8 }, 'out'],
      [0.48, { hy: 46, tor: 40, head: -4, dx: 12, fh: [18, -20], bh: [20, -8], fe: -1, ff: [48, 2], bf: [-56, 8], tw: 8 }],
      [0.72, { hy: 64, tor: 12, head: 6, dx: 2, fh: [14, -22], bh: [16, -12], fe: -1, ff: [28, 0], bf: [-32, 0], tw: 8 }], [1, {}]] }),
  // 回身肘（2.0.2）：闪身躲过重拳、钻到对手身后，自动转身一肘顶在他背上（fighter.js slipElbow）。
  // 打中：他背对着你往前踉跄 STAGGER 帧（打得中、动不了、不自动转身，combat.js applyHit 的 stagger），你先动二十来帧接着打。
  // 姿势：一开始还背对着他（spin 165，刚钻过去的样子），拧身转过来（spin 95，肘往后蓄），再把前手的肘往前顶出去
  slipElbow: M({ kind: 'heavy', label: '回身肘', stamp: '回身肘', tier: 'heavy', lead: 'heavy', S: 5, A: 3, R: 12, dmg: 10, reach: 86, stun: 18, bstun: 10, kb: STAGGER_KB,
    stop: 8, shake: 4, power: .8, limb: 'fe', fx: 'slipElbow', ghost: true, lunge: [0, 5, 18], stagger: true, ender: true, noCancel: true,
    keys: [[0, { spin: 165, tor: 24, hy: 58, head: 2, fh: [14, -18], bh: [16, -12], fe: -1, ff: [30, 0], bf: [-32, 0], tw: 0 }],
      [0.55, { spin: 95, tor: 6, hy: 66, head: -4, dx: -4, fh: [-8, -8], bh: [8, -10], ff: [24, 0], bf: [-36, 0], tw: -20 }],
      [1, { spin: 8, tor: 26, dx: 24, hy: 64, head: -6, fh: [14, -5], bh: [6, -6], ff: [46, 0], bf: [-32, 0], tw: 60 }, 'back'],
      [2, { spin: 4, tor: 26, dx: 24, hy: 64, head: -6, fh: [14, -5], bh: [6, -6], ff: [46, 0], bf: [-32, 0], tw: 60 }], [3, {}]] }),
  // 爆气：挨打时按「重+踢」，花 50 气从身上炸开 —— 2.1（Jack）：把对方炸倒、打掉 18（以前只是震开）
  burst: M({ kind: 'script', label: '爆气', S: 0, A: 0, R: 22, script: true, inv: [0, 18], evWave: 3,
    keys: [[0, { tor: 28, hy: 54, head: 10, fh: [8, 12], bh: [4, 14], tw: 0 }],
      [0.14, { tor: -18, head: -22, hy: 78, fh: [42, -54], bh: [-40, -52], fe: -1, be: -1, ff: [42, 0], bf: [-42, 0], air: 6, tw: 0 }, 'out'],
      [0.5, { tor: -14, head: -18, hy: 76, fh: [40, -48], bh: [-38, -46], fe: -1, be: -1, ff: [42, 0], bf: [-42, 0], air: 2, tw: 0 }], [1, {}]] }),
  // 泼墨：气满时按「重+踢」，出手前打击无敌。2.1（Jack：伤害太低）22 → 40
  // 2.7（Jack：伤害 50；霸体蓄力一小下（算前摇），单手出去，手前面带额外特效；对面的反制手段不变）：
  //   前摇 8 → 10（基准帧）：先沉身蓄力 —— 后手收到腰边、前手往前领着，整个前摇都是霸体（什么打击都硬吃、只掉一半，招不停；
  //   以前是打击无敌，打它一样没用），快蓄满时往前冲一步，后手一掌单手推出去（拧腰送肩）；掌前面炸开一朵墨花（fx.js superStrikeFx）。
  //   擒拿照样抓得住（霸体防不了拿）、卸力、格挡（三成）、挡住后反击 ×1.5、跳起来躲、冲刺无敌躲 —— 和以前一样
  super: M({ kind: 'heavy', label: '泼墨', stamp: '泼墨', tier: 'super', S: 10, A: 6, R: 22, dmg: 50, reach: 136, stun: 24, bstun: 15, kb: 8, stop: 16, shake: 12, power: 1.2, heavy: true,
    limb: 'bh', fx: 'splash', ghost: true, lunge: [6, 10, 34], armor: { n: 99, from: 0, vs: ['light', 'heavy', 'kick', 'aa', 'air', 'dive', 'push'] },
    launch: 8, ender: true, noCancel: true, cost: QI_MAX, antiAir: 40,
    keys: [[0, {}], [0.2, { tor: 2, dx: -4, hy: 64, head: 4, tw: 24, bh: [-12, 22], fh: [28, -8], ff: [28, 0], bf: [-38, 0] }, 'out'],
      [0.75, { tor: -6, dx: -8, hy: 60, head: 6, tw: 36, bh: [-22, 28], fh: [32, -10], ff: [30, 0], bf: [-42, 0] }],
      [1, { tor: 28, dx: 46, hy: 58, head: -6, tw: -50, bh: [78, -2], fh: [4, -4], ff: [62, 0], bf: [-44, 0] }, 'back'],
      [2, { tor: 28, dx: 46, hy: 58, head: -6, tw: -50, bh: [78, -2], fh: [4, -4], ff: [62, 0], bf: [-44, 0] }], [3, {}]] }),
};

/* ============================================================
   克制关系（两边同时出手时）：
   1) 先比主系：拳 > 腿 > 重 > 拳；腿 > 对空 > 空中；必杀 > 一切；打击 > 擒拿 → 「克」：克制方单方面打中 ×1.3
   2) 主系一样，比起手（同样按 拳 > 腿 > 重 > 拳）→ 「压」：两边都打中，被压的吃全额，压人的只吃三成
   3) 主系、起手都一样（或互不相克）→ 「平」：拼招，各吃五成、互相震退
   ============================================================ */
const TIER_WIN = {
  light: ['kick', 'grab', 'dive'],      // 1.9.0：站着的拳迎着打坠山 = 倒栽葱
  heavy: ['light', 'grab', 'dive'],
  kick: ['heavy', 'aa', 'grab'],        // 腿长，从下面踢中正往上托的对空招（地上的腿撞空中的腿 = 翻滚，见 combat.js tumble）
  aa: ['air', 'grab'],
  air: ['light', 'heavy', 'kick', 'grab'],
  dive: ['aa', 'grab'],                 // 坠山踩断对空
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
const COUNTERS = [   // 2.10 [名, 有哪些, 怎么破]：教程里不用括号，有哪些单独一格
  ['拳系', '短拳、连珠、寸劲、下盘拳、顶肘、落步冲拳', '重系前摇霸体硬吃，重克拳；同主系里起手克它的「压」它；被挡后势破，推挡、卸力、截击反打'],
  ['重系', '重拳、进步冲拳、劈山掌、盖步砸拳、沉肩靠', `腿系化解后踢中，腿克重；擒拿比它快；起手克它的「压」它；霸体只能吃一两下，连打破霸体；挡住后打它收招 ×${PUNISH_MUL}`],
  ['腿系', '腿踢、鞭腿、转身蹬、旋风腿、二起脚、扫堂腿', '起腿时被拳打中失衡倒地，拳克腿；站着擒拿 = 接腿摔，蹲 + 拿 = 抄腿摔，扫堂腿也接得住；起手克它的「压」它'],
  ['扫堂腿', '', `蹲挡住后按踢「踩腿」击倒；蹲 + 拿抄住它的腿；跳起躲开、落地打它收招 = 破绽 ×${WHIFF_KD_MUL}；贴身短拳打它失衡；卸力`],
  ['击倒招', '扫堂腿、冲天炮、旋风腿、盖步砸拳、二起脚、踩腿、泼墨', `挡住后打它收招 ×${PUNISH_KD_MUL}，这是挡后反击；卸力后反打 ×${PUNISH_KD_MUL}；它打空了打收招 ×${WHIFF_KD_MUL}，这是破绽；真被打倒了，起身时按住方向滚身起，躲开守在你起身处的人`],
  ['对空', '托天掌、冲天炮', '腿系从下面踢中，腿克对空；坠山踩它，对空打不到坠山；它在地上就是普通重招，前摇长，被挡后摇也长'],
  ['空中招', '挥拳、坠山击、飞踢', '托天掌、冲天炮对空克空中，打下来是倒栽葱，倒地更久；地上出腿迎上飞踢 = 把它顶得翻滚回去；空中互撞看起手分压；站挡、卸力；蹲下躲飞踢；往后退出它的射程，它落地有硬直'],
  ['坠山', '', `站着的拳迎着打，短拳、重拳都行 = 倒栽葱 ×${DIVE_PUNCH_MUL}、倒地更久；站挡挡得住，它往后翻回去五六个身位，你先动但追不上；地上出腿迎上去 = 顶得它翻滚回去；它先往上腾一下，看得见；别蹲、别出托天掌，正中它下怀`],
  ['下段', '下盘拳、扫堂腿', '蹲挡；跳起躲开；扫堂腿是腿系，近身被拳克，蹲挡住还能踩腿'],
  ['上段', '劈山掌、所有空中招', '站挡；劈山掌是重系，被腿克'],
  ['擒拿', '擒拿、过肩摔、提膝、别腿摔', '任何打击在它抓到前打断它，打击克擒拿；蹲下它就抓不到；同时擒拿 = 拆；被抓住马上按拿 = 挣脱；冲刺无敌、跳起都躲得开'],
  ['抄腿', '蹲 + 拿', '站着它就抓不到，抓空收招很长，打它；它前摇慢，短拳、下盘拳打断它；被抓住马上按拿 = 挣脱'],
  ['接腿摔', '接腿摔、抄腿摔', '出腿别出得太早、太远让人看着接；改用拳；接腿接不住扫堂腿，要抄腿；抄腿接不住跳起来的腿'],
  ['挣脱', '', '接腿摔、抄腿摔、借力摔都挣不脱；它要提前按才来得及，抓之前先打一下，打击克擒拿'],
  ['格挡', '', '站挡怕擒拿和下段，蹲挡怕抄腿和上段；绕到背后，背对着挡不住'],
  ['卸力', '', `擒拿卸不了；停一拍再打，两次按格挡要隔 ${PARRY_LOCK} 帧才有卸力`],
  ['推挡', '', '擒拿，推挡只防打击；停手不打，等它推空，打它的后摇'],
  ['截击', '', '它出手前打击无敌，但收招长：挡住它反打，或者用擒拿；它要花 ' + GC_COST + ' 气，压对方之前看一眼气条'],
  ['踩腿', '', '扫堂腿别往蹲挡的人身上用；换下盘拳，拳收招快、踩不到；或者抄腿'],
  ['借力摔', '卸力后按拿', '别让人卸：出招别太好猜、停一拍再打'],
  ['霸体', '重拳、沉肩靠', '腿系；擒拿；连打两三下：重拳只吃一下，沉肩靠两下'],
  ['跑动、冲刺', '', '迎击：打在全速跑过来、或冲刺收尾的人身上 ×1.2；腿踢射程长，正好迎上去'],
  ['冲势', '冲刺后第一招', '卸力，冲进来的时机好猜；出克它那一系的招；冲刺收尾时先打它 = 迎击'],
  ['连段压制', '', '推挡、卸力、截击、爆气；连击衰减，同一套四五下就断'],
  ['爆气', '', '它只在挨打时能爆，花半格气：连招别拖太长，看它气条过了一半就收着打；面朝它格挡只吃三成、被推开一点，它的后摇能打；站远一点够不着；冲刺无敌躲开'],
  ['泼墨', '', `它出手前擒拿抓住它，蓄力那一下是霸体，打它没用，拿得住；卸力；格挡只掉三成，挡住后反击 ×${PUNISH_KD_MUL}；跳起躲开；冲刺无敌`],
  ['滚身起', '', '往你脚下滚到你身后：看见了转身出拳还来得及，它滚完站起来那几帧比原地起身还久；往后滚得近一点：反应快的话看见了马上冲过去出短拳也打得到，反应慢就只能它一起身就猜着冲过去，猜错了冲过头，回身打够不着'],
  ['起身', '', '被打倒的一方站起来那几帧挨得了打、动不了：对面短拳这种快招算好时机必中，重拳、腿要提前出，这是压起身；被压的按住方向滚身起躲开，压早了的打空，轮到你反打'],
  ['闪身', '边挡边冲刺', `它只躲得过重系的手上招：出短拳、腿、下段、擒拿截住它 ×${SLIP_CAUGHT_MUL}；对着按住挡的人别老想用重拳砸开，被它钻过去就是回身肘、背对着挨打`],
  ['回身肘', '', '闪身躲过重拳才有：重拳打出去要算好它闪不闪；它钻空了、你没出重拳，就只是换到你身后，它收招比你慢，转身打它'],
];

// 取消：打中或被挡后，在后摇里能接哪一类
const CANCEL = { jab: ['jab', 'heavy', 'kick', 'grab'], heavy: ['jab', 'heavy', 'kick'], kick: ['jab', 'heavy', 'kick'], grab: [], push: [] };
const AIR_OF = { jab: 'airJab', heavy: 'airHeavy', kick: 'airKick' };
const DOWN_OF = { jab: 'lowJab', heavy: 'palm', kick: 'sweep', grab: 'lowGrab' };
// 连招变招：看这一串前面按过什么。mod：'down' 按着蹲 / 'run' 跑起来了
//   拳拳→后手直拳  拳拳拳→摆拳  拳×4、5→连珠快拳  拳×6→寸劲
//   拳重→进步冲拳  拳踢→鞭腿  拳拳重→冲天炮  拳拳踢→转身蹬
//   重拳→顶肘  重重→劈山掌  重踢→旋风腿
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

/* ============================================================
   拳派（2.7.1 铺垫；Jack：以后还会做更多和这个一样完整的拳派，现在这一套只是「传统格斗」，
   到时候各种克制关系、发生的反应都要重新算）
   一个拳派 = 一整套：招式表 moves（上面的 MOVES）、交手关系 relation（主系克制 TIER_WIN + 起手压）、
   取消规则 cancel（CANCEL）、连招变招 variant（pickVariant）。
   · 每个人身上记着自己是哪一派（Fighter 的 style 字段，存档、联机回滚都带着），出招、取消、连招变招都查自己这一派的表
     （fighter.js 的 this.moves / styleOf(this)）。
   · 两个人同一派：交手照这一派自己的 relation（clashRelation，combat.js 交手时调）。
   · 两个人不同派：不套用任何一派的表 —— 在 MATCHUPS['甲|乙'] 里专门写这一对谁克谁（relation(dA, dB)：1 甲赢 / -1 乙赢 / 0 平，
     ±0.5 压），没写就报错（tests.js 查），不会悄悄用某一派自己的规矩。
   · 现在只有 trad 一派，电脑 AI、破招练习、教程、平衡报告都直接读 MOVES（都是传统格斗专用的）；各种「反应」
     （接腿、卸力、翻滚回去、倒栽葱、踩蹲、拳迎坠山、闪身躲重拳……）写在 combat.js，按招名、系别认 ——
     加新派的时候这些都要按新的一派重新算，清单见 NOTES「拳派」
   ============================================================ */
const STYLES = {
  trad: { id: 'trad', name: '传统格斗', moves: MOVES, relation, cancel: CANCEL, variant: pickVariant },
};
const STYLE_DEFAULT = 'trad';
const MATCHUPS = {};                     // 跨派的规矩（以后加）：'trad|taiji': { relation(dA, dB) { … } }
const styleOf = F => STYLES[(F && F.style) || STYLE_DEFAULT];
// 两个人的招撞在一起谁克谁（combat.js 交手）：同一派照这一派的 relation；不同派查 MATCHUPS（反过来写的那一对取负号）
function clashRelation(A, B) {
  const a = A.style || STYLE_DEFAULT, b = B.style || STYLE_DEFAULT;
  if (a === b) return STYLES[a].relation(A.move.def, B.move.def);
  const mu = MATCHUPS[a + '|' + b];
  if (mu) return mu.relation(A.move.def, B.move.def);
  const mr = MATCHUPS[b + '|' + a];
  if (mr) return -mr.relation(B.move.def, A.move.def);
  throw new Error(`拳派「${STYLES[a].name}」和「${STYLES[b].name}」之间谁克谁还没算（MATCHUPS 里没写 ${a}|${b}）`);
}
