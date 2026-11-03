'use strict';
/* ============================================================
   太极拳（3.0；设计稿 TAIJI.md）—— 第三派。Jack：太极从现实层面就是「慢而强」，游戏里操作的特点要体现出来；
   每一派都要有自己的操作难度、自己的上限（格斗术 = 攻击多样；咏春 = 防守反打 + 连续进攻，难、上限高）。
   太极的操作是「蓄 · 化 · 发」：
   · 慢：全派都是慢招（前摇 18 帧起，没有快招），按 2.12 的标尺，对面反应过来看得见、挡得住每一招 —— 太极不靠快打中人
   · 蓄：拳 / 重 / 踢按住不放，前摇走到六成停住、势接着一式一式往下走（揽雀尾 掤 → 捋 → 挤 → 按，搬拦捶 搬 → 拦 → 捶……），
     每蓄满一段劲 +1；松开 = 发劲。蓄着不能走、不能转身
   · 化（掤）：出招的前摇里、蓄着的时候身上有掤 —— 正面打过来的手上的招、中段上段的腿被化掉（只吃两成、不进硬直、招不停），劲 +1。
     化不了：擒拿（擒拿克掤）、下段、空中的招、坠山、推挡、大招；一招最多化两下，第三下是挨打（连打破掤）
   · 发：松开打出去那一下，劲越多越疼、打得越远（劲 2 打倒，劲 3 发人丈外）；这一招前摇里化过一下 = 借力打力，再 ×1.3
   · 捋（引进落空）：按住挡，他打到之前几帧按一下后 —— 把他牵过去，他背对着你失衡，劲 +1。太极没有卸力，捋就是它的卸力
   · 采（拿）：抓住以后 拳 = 挒、重 = 野马分鬃（摔，不换边）、踢 = 采住蹬脚、不按 = 按（推开）；接住踢过来的腿 = 搂膝拗步
   难度：上手容易（慢、看得清、不用按拍子；乱打的人一拳拳打进掤里白送劲），上限在什么时候松开、什么时候捋、看他要抓就别蓄 ——
   比咏春好上手、上限低一点。打它：抓、打下段、跳着打、退出去等它打空、连打破掤
   引擎在这几处先问这一派（STYLES.taiji 的钩子，和咏春拳一样）：出招中按键 / 蓄势（input 'attack'）、捋以后（'parry'）、站着（'neutral'，记按后）、
   挨打（defend：化、捋）、打中（strike：发劲）、抓到人（grab：搂膝拗步）、画架势（target）、画劲（drawCue）
   ============================================================ */

/* ---------- 底子 = 待机（3.1.2 照 Jack 的图 ref/tj_stance_idle.png）——
   前手立掌往前推：胳膊差不多伸直、和肩一样高，手指朝上微微往前倒（掌心朝前，侧面看得见手指和大拇指）；
   后手横掌护着肚子：肘往后下方沉、贴在后背外面，小臂横在肚子前、腰带上面，手指朝前微微往上；
   弓步：前腿弓（小腿竖着、大腿往前下方斜）、后腿蹬直；身子正、头正，拧一点腰把前肩送出去。
   3.0 ～ 3.1.1 是单鞭（ref/tj_stance_single_whip.png）：前手立掌、后手勾手往身后伸，大马步（髋 52、前脚 50、后脚 -60）。
   这是所有招的底子：关键帧没写的部分（[0, {}]、[3, {}] 起手、收招那一下）都从这里来 ---------- */
const TBASE = { rot: 0, spin: 0, tor: 0, head: 0, hy: 58, dx: 0, air: 0, fe: 1, be: 1, tw: 26, fn: 1, bn: 1, ft: 0, bt: 0, fo: 0, bo: 0,
  fp: 1, bp: 1, fpa: -72, bpa: -22, fpr: 0.7, bpr: 0.8, fw: 0, bw: 0, fz: 0, fs: 0.3, bs: 0.2, fhk: 0, bhk: 0, fv: 0, bv: 1,
  fh: [50, 2], bh: [5, 29], ff: [37, 0], bf: [-58, 0] };   // 前脚 37：前小腿竖着；后脚写 -58，tjReach 收到后腿刚好蹬直（-55.6）
// 3.0.1 后脚往后挪了以后，站高的那几式（髋高 56 ～ 62：拦、捶、靠……）后腿够不着地、脚飘起来 —— 后脚踩在地上的姿势，脚踝伸不到就往回收
// （收到后腿差一点点伸直），不用一式一式地改
const T_LEG = (BODY.bone.th + BODY.bone.sh) * 0.985;
function tjReach(p) {
  if (p.bf[1] !== 0 || p.air > 0) return p;                    // 脚抬起来的、整个人跳起来的（爆气）不管
  const dy = p.hy - BODY.bone.ankle, dx = Math.sqrt(Math.max(0, T_LEG * T_LEG - dy * dy)) + BODY.hipSplit;
  if (-p.bf[0] > dx) p.bf[0] = -dx;
  return p;
}
const tmk = o => tjReach(mk(o, TBASE));
function TM(o) { o.pb = TBASE; o.style = 'taiji'; const d = M(o); for (const k of d.keys) tjReach(k[1]); return d; }
const TJ = (base, o) => Object.assign({}, base, o);
// 一只手：palm 掌（pa 手指朝哪、pr 掌心朝哪、s 手指张开多少）/ 拳（竖拳）/ 勾手
const tHand = (h, at, kind, pa, pr, s) => kind === 'fist' ? { [h + 'h']: at, [h + 'p']: 0, [h + 'v']: 1, [h + 'hk']: 0 }
  : { [h + 'h']: at, [h + 'p']: 1, [h + 'hk']: kind === 'hook' ? 1 : 0, [h + 'pa']: pa === undefined ? -80 : pa, [h + 'pr']: pr === undefined ? 0.7 : pr, [h + 's']: s === undefined ? 0.25 : s };
// 3.0.1（Jack：后腿弯下去太多了）：三种步子的后脚都往后挪（后腿伸得开、膝盖不往地上塌）；弓步的前脚收回来一点 —— 以前前腿直、后腿弯，和弓步反了
const T_STAND = { hy: 52, ff: [48, 0], bf: [-60, 0] };        // 一般的弓马步（太极的架子低、步子大）
const T_BOW = { hy: 52, ff: [50, 0], bf: [-62, 0] };           // 弓步：往前送（前腿弓、后腿蹬直）
const T_SIT = { hy: 53, ff: [44, 0], bf: [-58, 0] };           // 坐步：重心在后腿（蓄、捋往回带）

/* ---------- 揽雀尾（attack_seq 2 ～ 6）：掤 → 捋 → 挤 → 按 ---------- */
const P_PENG = TJ(T_STAND, { tor: 2, dx: 2, tw: 14, ...tHand('f', [30, 6], 'palm', -36, 1, 0.2), ...tHand('b', [16, 16], 'palm', -10, 0.8, 0.15), fz: 1 });   // 掤：前臂圆着撑在胸前
const P_LU = TJ(T_SIT, { tor: -2, dx: -6, tw: -22, ...tHand('f', [18, 14], 'palm', 2, 0.9, 0.2), ...tHand('b', [0, 22], 'palm', 24, 0.9, 0.15) });          // 捋：两手往后下方带
const P_JI = TJ(T_STAND, { tor: 4, dx: 2, tw: 10, ...tHand('f', [28, 6], 'palm', -150, 1, 0.1), ...tHand('b', [24, 8], 'palm', -80, 0.9, 0), fz: 1 });       // 挤：后掌贴在前手腕上往前挤
const P_AN0 = TJ(T_SIT, { tor: -4, dx: -6, tw: 2, ...tHand('f', [14, 6], 'palm', -82, 0.55, 0.25), ...tHand('b', [12, 10], 'palm', -82, 0.55, 0.25) });      // 按之前：两掌收回胸前、往后坐
const P_AN = TJ(T_BOW, { tor: 10, dx: 12, tw: 4, ...tHand('f', [48, 4], 'palm', -78, 0.55, 0.3), ...tHand('b', [44, 8], 'palm', -78, 0.55, 0.3) });         // 按：两掌往前推出去
/* ---------- 搬拦捶（cloudhands 9 ～ 11）：搬 → 拦 → 捶（后手竖拳） ---------- */
const P_BAN = TJ(T_SIT, { tor: 0, dx: -2, tw: 18, ...tHand('f', [30, 12], 'palm', 22, 0.8, 0.15), ...tHand('b', [0, 26], 'fist') });
const P_LAN = TJ(T_SIT, { tor: -2, dx: -4, hy: 62, tw: 20, ...tHand('f', [36, -8], 'palm', -82, 0.6, 0.2), ...tHand('b', [-4, 28], 'fist') });
const P_LAN2 = TJ(P_LAN, { hy: 60, tor: -4, dx: -7, tw: 24, bh: [-8, 27] });
const P_CHUI = TJ(T_BOW, { tor: 10, dx: 16, hy: 62, tw: -34, bw: 10, ...tHand('b', [58, 4], 'fist'), ...tHand('f', [22, 6], 'palm', -82, 0.8, 0.1) });
/* ---------- 蹬脚：提膝（十字手）→ 分手 → 脚跟蹬出去 ---------- */
const P_TIXI = { hy: 72, tor: 0, dx: 0, tw: 6, ff: [18, 40], bf: [-4, 0], ...tHand('f', [24, -8], 'palm', -104, 1, 0.1), ...tHand('b', [27, -4], 'palm', -70, 1, 0.1), fz: 1 };
const P_TIXI2 = TJ(P_TIXI, { hy: 70, tw: 2, ff: [20, 44], ...tHand('f', [32, -16], 'palm', -82, 0.7, 0.3), ...tHand('b', [-18, -14], 'palm', -98, 0.7, 0.3), fz: 0 });
const P_DENG = { hy: 74, tor: -16, head: 6, dx: 12, tw: 8, ff: [92, 50], ft: 34, bf: [-22, 0], ...tHand('f', [38, -22], 'palm', -64, 0.6, 0.35), ...tHand('b', [-36, -14], 'palm', 170, 0.6, 0.35) };
/* ---------- 抱球（cloudhands 3）、云手（4 ～ 6）、单鞭 ---------- */
const P_BALL = TJ(T_SIT, { tor: 0, dx: -2, tw: 6, ...tHand('f', [22, 18], 'palm', 4, 1, 0.2), ...tHand('b', [24, -6], 'palm', 176, 1, 0.2) });   // 抱球：一手在上一手在下，掌心相对

// 一招蓄着的时候一式一式往下走（蓄几段就走到哪；q = 0 是蓄势那一刻的样子）：每一招一串姿势，TJ_SEG 帧走一格
const TJ_FLOW = {};

const TMOVES = {
  /* ---- 拳：揽雀尾一家（掌）。tjCharge：按住蓄、前摇里有掤（化）；松开发劲 ---- */
  // 揽雀尾：前手掤出去、两掌按出去。蓄着：掤 → 捋 → 挤 → 按（收回胸前），松开两掌往前按出去
  tjLan: TM({ kind: 'jab', slowGuard: true, label: '揽雀尾', open: true, tjCharge: true, slow: 18, S: 12, A: 4, R: 12, dmg: 15, reach: 96, stun: 19, bstun: 12, kb: 3.5, stop: 7, shake: 4, power: .75,
    limb: 'fh', fx: 'palm', lunge: [8.6, 12, 12],
    keys: [[0, {}], [0.3, P_BALL], [0.6, P_PENG], [1, P_AN, 'out'], [2, P_AN], [3, {}]] }),
  // 玉女穿梭（前 + 拳）：上步，一手架在头上、一手穿掌推出去 —— 射程长、往前冲一大步
  tjChuan: TM({ kind: 'jab', slowGuard: true, label: '玉女穿梭', stamp: '玉女穿梭', open: true, tjCharge: true, slow: 18, S: 12, A: 4, R: 13, dmg: 12, reach: 100, stun: 18, bstun: 11, kb: 5, stop: 7, shake: 4, power: .7,
    limb: 'fh', fx: 'palm', lunge: [8.6, 12, 26],
    keys: [[0, {}], [0.6, TJ(T_SIT, { tor: 0, dx: -4, tw: 10, ...tHand('f', [20, 16], 'palm', 4, 1, 0.2), ...tHand('b', [24, -4], 'palm', 176, 1, 0.2) })],
      [1, TJ(T_BOW, { tor: 12, dx: 20, tw: 26, ...tHand('f', [54, -2], 'palm', -74, 0.6, 0.35), ...tHand('b', [16, -30], 'palm', -170, 0.9, 0.2) }), 'out'],
      [2, TJ(T_BOW, { tor: 12, dx: 20, tw: 26, ...tHand('f', [54, -2], 'palm', -74, 0.6, 0.35), ...tHand('b', [16, -30], 'palm', -170, 0.9, 0.2) })], [3, {}]] }),
  // 倒卷肱（后 + 拳）：往后退一步，后手从耳边推掌出去、前手收回腰间 —— 一边退一边打（拉开距离用）
  tjDao: TM({ kind: 'jab', slowGuard: true, label: '倒卷肱', stamp: '倒卷肱', open: true, tjCharge: true, slow: 18, S: 12, A: 4, R: 11, dmg: 10, reach: 94, stun: 17, bstun: 10, kb: 6, stop: 6, shake: 3, power: .6,
    limb: 'bh', fx: 'palm', lunge: [6, 14, -26],
    keys: [[0, {}], [0.6, TJ(T_SIT, { tor: -2, dx: -4, tw: 24, ...tHand('f', [34, 2], 'palm', -60, 0.8, 0.2), ...tHand('b', [-10, -10], 'palm', -60, 0.8, 0.2) })],
      [1, TJ(T_SIT, { tor: 4, dx: 0, tw: -30, ...tHand('b', [50, -2], 'palm', -76, 0.55, 0.3), ...tHand('f', [6, 22], 'palm', 4, 1, 0.2) }), 'out'],
      [2, TJ(T_SIT, { tor: 4, dx: 0, tw: -30, ...tHand('b', [50, -2], 'palm', -76, 0.55, 0.3), ...tHand('f', [6, 22], 'palm', 4, 1, 0.2) })], [3, {}]] }),
  // 下势（蹲 + 拳）：坐在后腿上压得很低，前腿伸直，前掌顺着前腿往前穿（下段）；后手勾手留在后面
  tjXia: TM({ kind: 'jab', slowGuard: true, label: '下势', stamp: '下势', open: true, tjCharge: true, slow: 18, S: 12, A: 4, R: 13, dmg: 11, reach: 100, stun: 18, bstun: 11, kb: 4, stop: 6, shake: 3, power: .65, height: 'low',
    limb: 'fh', fx: 'low', lunge: [8.6, 12, 10],
    keys: [[0, {}], [0.6, { hy: 50, tor: 18, head: -4, tw: 10, ff: [40, 0], bf: [-34, 0], ...tHand('f', [22, 10], 'palm', -30, 0.8, 0.2), ...tHand('b', [-34, 0], 'hook', 96, 1) }],
      [1, { hy: 38, tor: 30, head: -8, dx: 6, tw: 20, ff: [62, 0], bf: [-26, 0], ...tHand('f', [56, 38], 'palm', 14, 0.5, 0.15), ...tHand('b', [-34, 4], 'hook', 96, 1) }, 'out'],
      [2, { hy: 38, tor: 30, head: -8, dx: 6, tw: 20, ff: [62, 0], bf: [-26, 0], ...tHand('f', [56, 38], 'palm', 14, 0.5, 0.15), ...tHand('b', [-34, 4], 'hook', 96, 1) }], [3, {}]] }),

  /* ---- 重：搬拦捶一家（拳） ---- */
  // 搬拦捶：前手一搬、一拦，后手竖拳从腰间冲出去。蓄着：搬 → 拦 → 往下沉（拳收在腰后），松开捶出去
  tjBan: TM({ kind: 'heavy', label: '搬拦捶', stamp: '搬拦捶', open: true, tjCharge: true, slow: 22, S: 14, A: 4, R: 14, dmg: 20, reach: 102, stun: 21, bstun: 13, kb: 4, stop: 9, shake: 6, power: .95, heavy: true,
    limb: 'bh', fx: 'heavy', lunge: [8.6, 14, 16],
    keys: [[0, {}], [0.3, P_BAN], [0.6, P_LAN], [1, P_CHUI, 'out'], [2, P_CHUI], [3, {}]] }),
  // 金鸡独立（蹲 + 重，对空）：一腿提膝、一手往上托掌 —— 打跳过来的人（太极唯一不慢的一招，对空无敌）
  tjJinJi: TM({ kind: 'heavy', label: '金鸡独立', stamp: '金鸡独立', tier: 'aa', lead: 'heavy', open: true, S: 9, A: 5, R: 15, dmg: 14, reach: 92, stun: 16, bstun: 10, kb: 3, stop: 8, shake: 4, power: .8,
    limb: 'fh', fx: 'palm', lunge: [2, 8, 6], launchAir: 9, antiAir: 160, airInv: [1, 12], ender: true, noCancel: true,
    keys: [[0, { hy: 52, tor: 16, head: -2, tw: 10, ff: [34, 0], bf: [-30, 0], ...tHand('f', [22, 10], 'palm', -60, 1, 0.2), ...tHand('b', [12, 14], 'palm', 0, 1, 0.2) }],
      [1, { hy: 76, tor: 2, head: -10, dx: 8, tw: 14, ff: [20, 46], bf: [-2, 0], ...tHand('f', [30, -46], 'palm', -96, 0.5, 0.3), ...tHand('b', [8, 26], 'palm', 4, 1, 0.2) }, 'out'],
      [2, { hy: 78, tor: -4, head: -16, dx: 6, tw: 10, ff: [18, 48], bf: [-2, 0], ...tHand('f', [22, -58], 'palm', -98, 0.5, 0.3), ...tHand('b', [8, 26], 'palm', 4, 1, 0.2) }], [3, {}]] }),

  /* ---- 踢：蹬脚一家（脚跟） ---- */
  // 蹬脚：提膝（两手十字合在胸前）→ 分手 → 脚跟往前蹬出去（中段，太极腿最长）
  tjDeng: TM({ kind: 'kick', label: '蹬脚', open: true, tjCharge: true, noPeng: true, slow: 22, S: 15, A: 5, R: 14, dmg: 17, reach: 122, stun: 20, bstun: 12, kb: 4, stop: 8, shake: 5, power: .85,
    limb: 'ff', fx: 'kick', lunge: [10.1, 16, 8],
    keys: [[0, {}], [0.6, P_TIXI], [1, P_DENG, 'out'], [2, P_DENG], [2.4, TJ(P_TIXI, { ff: [24, 34] })], [3, {}]] }),
  // 分脚（前 + 踢、拳后接踢）：脚尖往前上方一踢（比蹬脚远一点、轻一点）
  tjFen: TM({ kind: 'kick', label: '分脚', tag: '分脚', open: true, tjCharge: true, noPeng: true, slow: 20, S: 14, A: 5, R: 14, dmg: 13, reach: 126, stun: 19, bstun: 11, kb: 3, stop: 7, shake: 4, power: .75,
    limb: 'ff', fx: 'whip', lunge: [9.4, 14, 10],
    keys: [[0, {}], [0.6, P_TIXI], [1, TJ(P_DENG, { ff: [96, 58], ft: -10, tor: -18 }), 'out'], [2, TJ(P_DENG, { ff: [96, 58], ft: -10, tor: -18 })], [2.4, TJ(P_TIXI, { ff: [24, 34] })], [3, {}]] }),
  // 跌岔（蹲 + 踢）：往下一坐、前腿贴地铲出去（下段，打倒）
  tjDieCha: TM({ kind: 'kick', label: '跌岔', stamp: '跌岔', open: true, tjCharge: true, noPeng: true, slow: 20, S: 14, A: 4, R: 18, dmg: 12, reach: 114, stun: 18, bstun: 10, kb: 4, stop: 7, shake: 5, power: .8, height: 'low',
    limb: 'ff', fx: 'sweep', lunge: [9.4, 14, 10], launch: 3.5, lie: 22, ender: true,
    keys: [[0, {}], [0.6, { hy: 52, tor: 14, head: -2, tw: 10, ff: [30, 0], bf: [-30, 0], ...tHand('f', [26, 8], 'palm', -40, 0.8), ...tHand('b', [10, -14], 'palm', -100, 0.8) }],
      [1, { hy: 30, tor: 12, head: 2, dx: 8, tw: 4, ff: [74, 0], ft: 30, bf: [-30, 0], bo: 40, ...tHand('f', [44, 14], 'palm', -10, 0.6, 0.3), ...tHand('b', [-28, -18], 'palm', -120, 0.6, 0.3) }, 'out'],
      [2, { hy: 30, tor: 12, head: 2, dx: 8, tw: 4, ff: [74, 0], ft: 30, bf: [-30, 0], bo: 40, ...tHand('f', [44, 14], 'palm', -10, 0.6, 0.3), ...tHand('b', [-28, -18], 'palm', -120, 0.6, 0.3) }], [3, {}]] }),

  /* ---- 势（连下去最多三下；每一下也都按得住蓄）：拳拳 高探马 → 穿掌；拳重 指裆捶；拳拳重 白鹤亮翅；重拳 顺拦肘；重重 双峰贯耳；重踢 转身摆莲；
     踢拳 上步七星；踢重 弯弓射虎；踢踢 转身蹬脚；拳踢 分脚 ---- */
  tjGaoTan: TM({ kind: 'jab', slowGuard: true, label: '高探马', tag: '高探马', tjCharge: true, S: 11, A: 4, R: 11, dmg: 11, reach: 98, stun: 19, bstun: 11, kb: 2.5, stop: 6, shake: 3, power: .65,
    limb: 'bh', fx: 'jab2', lunge: [6.6, 11, 10],
    keys: [[0, {}], [0.6, TJ(T_SIT, { tw: 22, ...tHand('b', [8, -16], 'palm', -60, 0.8), ...tHand('f', [30, 4], 'palm', -10, 1) })],
      [1, TJ(T_BOW, { tor: 10, dx: 12, tw: -30, ...tHand('b', [56, -6], 'palm', -72, 0.5, 0.3), ...tHand('f', [10, 22], 'palm', 4, 1, 0.2) }), 'out'],
      [2, TJ(T_BOW, { tor: 10, dx: 12, tw: -30, ...tHand('b', [56, -6], 'palm', -72, 0.5, 0.3), ...tHand('f', [10, 22], 'palm', 4, 1, 0.2) })], [3, {}]] }),
  tjChuanZ: TM({ kind: 'jab', slowGuard: true, label: '穿掌', stamp: '穿掌', tjCharge: true, S: 11, A: 4, R: 14, dmg: 15, reach: 102, stun: 20, bstun: 12, kb: 9, stop: 8, shake: 5, power: .8,
    limb: 'fh', fx: 'jab2', lunge: [6.6, 11, 14], ender: true, noCancel: true,
    keys: [[0, {}], [0.6, TJ(T_SIT, { tw: -10, ...tHand('f', [16, 12], 'palm', 10, 0.9, 0), ...tHand('b', [30, -2], 'palm', -80, 0.8, 0.1) })],
      [1, TJ(T_BOW, { tor: 12, dx: 18, tw: 40, ...tHand('f', [60, 0], 'palm', -4, 0.25, 0), ...tHand('b', [14, 14], 'palm', -60, 0.9, 0.1) }), 'out'],
      [2, TJ(T_BOW, { tor: 12, dx: 18, tw: 40, ...tHand('f', [60, 0], 'palm', -4, 0.25, 0), ...tHand('b', [14, 14], 'palm', -60, 0.9, 0.1) })], [3, {}]] }),
  tjZhiDang: TM({ kind: 'heavy', label: '指裆捶', stamp: '指裆捶', tjCharge: true, S: 13, A: 4, R: 15, dmg: 19, reach: 98, stun: 21, bstun: 12, kb: 6, stop: 9, shake: 6, power: .95, heavy: true,
    limb: 'bh', fx: 'heavy', lunge: [7.8, 13, 14], launch: 4, ender: true, noCancel: true,
    keys: [[0, {}], [0.6, TJ(T_SIT, { tor: 6, hy: 60, tw: 22, ...tHand('b', [-4, 28], 'fist'), ...tHand('f', [30, 6], 'palm', -60, 0.8) })],
      [1, TJ(T_BOW, { tor: 26, dx: 16, hy: 56, head: -4, tw: -30, ...tHand('b', [52, 30], 'fist'), ...tHand('f', [22, 2], 'palm', -82, 0.8) }), 'out'],
      [2, TJ(T_BOW, { tor: 26, dx: 16, hy: 56, head: -4, tw: -30, ...tHand('b', [52, 30], 'fist'), ...tHand('f', [22, 2], 'palm', -82, 0.8) })], [3, {}]] }),
  tjBaiHe: TM({ kind: 'heavy', label: '白鹤亮翅', stamp: '白鹤亮翅', tjCharge: true, S: 12, A: 5, R: 16, dmg: 20, reach: 96, stun: 21, bstun: 12, kb: 5, stop: 9, shake: 6, power: 1, heavy: true,
    limb: 'fh', fx: 'upper', lunge: [7.2, 12, 10], launch: 5, ender: true, noCancel: true, antiAir: 100,
    keys: [[0, {}], [0.6, TJ(P_BALL, { hy: 60, tor: 4 })],
      [1, { hy: 70, tor: -2, head: -6, dx: 10, tw: 16, ff: [30, 0], bf: [-38, 0], ...tHand('f', [30, -44], 'palm', -100, 0.6, 0.35), ...tHand('b', [12, 26], 'palm', 10, 1, 0.2) }, 'out'],
      [2, { hy: 72, tor: -4, head: -8, dx: 10, tw: 16, ff: [30, 0], bf: [-38, 0], ...tHand('f', [24, -54], 'palm', -100, 0.6, 0.35), ...tHand('b', [12, 26], 'palm', 10, 1, 0.2) }], [3, {}]] }),
  tjShunLan: TM({ kind: 'jab', slowGuard: true, label: '顺拦肘', tag: '顺拦肘', tjCharge: true, S: 10, A: 4, R: 12, dmg: 13, reach: 80, stun: 19, bstun: 11, kb: 2.5, stop: 7, shake: 4, power: .7,
    limb: 'fe', fx: 'elbow', lunge: [6, 10, 14],
    keys: [[0, {}], [0.6, TJ(T_SIT, { tw: -16, ...tHand('f', [8, 14], 'fist'), fe: 1, ...tHand('b', [22, 6], 'palm', -80, 0.8) })],
      [1, TJ(T_BOW, { tor: 18, dx: 22, hy: 60, tw: 56, ...tHand('f', [12, -4], 'fist'), fe: -1, ...tHand('b', [24, 4], 'palm', -86, 0.8, 0.1) }), 'out'],
      [2, TJ(T_BOW, { tor: 18, dx: 22, hy: 60, tw: 56, ...tHand('f', [12, -4], 'fist'), fe: -1, ...tHand('b', [24, 4], 'palm', -86, 0.8, 0.1) })], [3, {}]] }),
  tjShuangFeng: TM({ kind: 'heavy', label: '双峰贯耳', stamp: '双峰贯耳', tjCharge: true, S: 13, A: 4, R: 16, dmg: 22, reach: 96, stun: 22, bstun: 13, kb: 7, stop: 10, shake: 7, power: 1, heavy: true, height: 'high',
    limb: 'fh', fx: 'hook', lunge: [7.8, 13, 14], launch: 4.5, ender: true, noCancel: true,
    keys: [[0, {}], [0.6, TJ(T_SIT, { tor: 6, hy: 60, tw: 0, ...tHand('f', [20, 26], 'fist'), ...tHand('b', [16, 28], 'fist') })],
      [1, TJ(T_BOW, { tor: 14, dx: 18, tw: 6, ...tHand('f', [46, -14], 'fist'), fe: -1, ...tHand('b', [42, -12], 'fist'), be: -1 }), 'out'],
      [2, TJ(T_BOW, { tor: 14, dx: 18, tw: 6, ...tHand('f', [46, -14], 'fist'), fe: -1, ...tHand('b', [42, -12], 'fist'), be: -1 })], [3, {}]] }),
  tjBaiLian: TM({ kind: 'kick', label: '转身摆莲', stamp: '转身摆莲', tjCharge: true, noPeng: true, S: 13, A: 6, R: 16, dmg: 21, reach: 122, stun: 22, bstun: 13, kb: 7, stop: 10, shake: 8, power: 1, heavy: true,
    limb: 'ff', fx: 'whirl', ghost: true, lunge: [7.8, 13, 10], launch: 5, ender: true, noCancel: true,
    keys: [[0, {}], [0.6, { spin: 150, hy: 70, tor: 4, tw: 0, ff: [16, 20], bf: [-6, 0], ...tHand('f', [24, -10], 'palm', -90, 1), ...tHand('b', [20, -6], 'palm', -80, 1) }],
      [1, { spin: 360, hy: 76, tor: -18, head: 8, dx: 10, tw: 0, ff: [84, 72], ft: 10, bf: [-18, 0], ...tHand('f', [56, -40], 'palm', -10, 0.6, 0.4), ...tHand('b', [44, -36], 'palm', -10, 0.6, 0.4) }, 'out'],
      [2, { spin: 360, hy: 76, tor: -18, head: 8, dx: 10, tw: 0, ff: [84, 72], ft: 10, bf: [-18, 0], ...tHand('f', [56, -40], 'palm', -10, 0.6, 0.4), ...tHand('b', [44, -36], 'palm', -10, 0.6, 0.4) }], [3, { spin: 360 }]] }),
  tjQiXing: TM({ kind: 'jab', slowGuard: true, label: '上步七星', tag: '上步七星', tjCharge: true, S: 11, A: 4, R: 12, dmg: 12, reach: 98, stun: 19, bstun: 11, kb: 2.5, stop: 7, shake: 4, power: .7,
    limb: 'fh', fx: 'jab2', lunge: [6.6, 11, 18],
    keys: [[0, { ff: [30, 30] }], [0.6, TJ(T_SIT, { tw: 0, ...tHand('f', [16, 20], 'fist'), ...tHand('b', [12, 22], 'fist') })],
      [1, TJ(T_BOW, { tor: 10, dx: 16, tw: 4, ...tHand('f', [46, -2], 'fist'), ...tHand('b', [42, 2], 'fist'), fz: 1 }), 'out'],
      [2, TJ(T_BOW, { tor: 10, dx: 16, tw: 4, ...tHand('f', [46, -2], 'fist'), ...tHand('b', [42, 2], 'fist'), fz: 1 })], [3, {}]] }),
  tjWanGong: TM({ kind: 'heavy', label: '弯弓射虎', stamp: '弯弓射虎', tjCharge: true, S: 13, A: 4, R: 16, dmg: 22, reach: 100, stun: 21, bstun: 12, kb: 7, stop: 9, shake: 6, power: 1, heavy: true,
    limb: 'bh', fx: 'heavy', lunge: [7.8, 13, 14], launch: 4.5, ender: true, noCancel: true,
    keys: [[0, { ff: [30, 30] }], [0.6, TJ(T_SIT, { tw: 26, ...tHand('b', [-12, -6], 'fist'), ...tHand('f', [10, 22], 'fist') })],
      [1, TJ(T_BOW, { tor: 14, dx: 16, tw: -22, ...tHand('b', [54, -6], 'fist'), ...tHand('f', [46, 14], 'fist') }), 'out'],
      [2, TJ(T_BOW, { tor: 14, dx: 16, tw: -22, ...tHand('b', [54, -6], 'fist'), ...tHand('f', [46, 14], 'fist') })], [3, {}]] }),
  tjZhuanDeng: TM({ kind: 'kick', label: '转身蹬脚', stamp: '转身蹬脚', tjCharge: true, noPeng: true, S: 13, A: 5, R: 16, dmg: 20, reach: 120, stun: 21, bstun: 12, kb: 8, stop: 9, shake: 6, power: .95,
    limb: 'ff', fx: 'backKick', ghost: true, lunge: [7.8, 13, 10], launch: 4.5, ender: true, noCancel: true,
    keys: [[0, { ff: [26, 30] }], [0.6, TJ(P_TIXI, { spin: 160 })], [1, TJ(P_DENG, { spin: 360 }), 'out'], [2, TJ(P_DENG, { spin: 360 })], [3, { spin: 360 }]] }),

  /* ---- 拿：采、搂膝 ---- */
  // 采：前手往前一探、抓住他的手腕往回一采（抓到 = 采住，接着按键：拳 挒、重 野马分鬃、踢 采住蹬脚、不按 按）；正好他出腿 = 接住腿（搂膝拗步）
  grab: TM({ kind: 'grab', label: '采', open: true, S: 6, A: 4, R: 15, dmg: 6, reach: 84, power: .4, limb: 'fh', lunge: [1, 5, 6],
    keys: [[0, {}], [0.5, TJ(T_STAND, { tw: 20, ...tHand('f', [32, 0], 'palm', -20, 0.8, 0.45) })],
      [1, TJ(T_BOW, { tor: 10, dx: 10, tw: 34, ...tHand('f', [52, 2], 'palm', 4, 0.6, 0.55), ...tHand('b', [18, 8], 'palm', -60, 0.9) }), 'out'],
      [2, TJ(T_BOW, { tor: 10, dx: 10, tw: 34, ...tHand('f', [52, 2], 'palm', 4, 0.6, 0.55), ...tHand('b', [18, 8], 'palm', -60, 0.9) })], [3, {}]] }),
  // 搂膝（蹲 + 拿）：蹲下去前手往前下方一搂 —— 接住地上的腿（搂膝拗步）；抓住蹲着的人（采住）
  lowGrab: TM({ kind: 'grab', label: '搂膝', low: true, height: 'low', open: true, S: 8, A: 4, R: 16, dmg: 0, reach: 88, power: .5, limb: 'fh', lunge: [1, 7, 10],
    keys: [[0, { hy: 52, tor: 16, tw: 10, ff: [32, 0], bf: [-32, 0] }],
      [1, { hy: 44, tor: 30, dx: 16, head: -8, tw: 16, ff: [44, 0], bf: [-34, 0], ...tHand('f', [50, 34], 'palm', 30, 0.7, 0.5), ...tHand('b', [20, 6], 'palm', -60, 0.8) }, 'out'],
      [2, { hy: 44, tor: 30, dx: 16, head: -8, tw: 16, ff: [44, 0], bf: [-34, 0], ...tHand('f', [50, 34], 'palm', 30, 0.7, 0.5), ...tHand('b', [20, 6], 'palm', -60, 0.8) }], [3, {}]] }),
  // 采住（抓住了）：手扣着他的腕子往回带。时间到了按着的键出哪一手见 tjHold
  hold: TM({ kind: 'script', label: '采住', S: 0, A: 0, R: 10, script: true,
    keys: [[0, TJ(T_SIT, { tor: 0, dx: -2, tw: 10, ...tHand('f', [30, 8], 'fist'), ...tHand('b', [22, 10], 'palm', -40, 0.9) })], [1, TJ(T_SIT, { tor: -2, dx: -4, tw: 6, ...tHand('f', [24, 10], 'fist'), ...tHand('b', [20, 8], 'palm', -40, 0.9) })]] }),
  // 采住以后：拳 = 挒（扭住胳膊、两下肘靠打在他身上）
  tjLie: TM({ kind: 'script', label: '挒', S: 0, A: 0, R: 22, script: true, evHit: 5, evHit2: 13, tjGrab: 'lie',
    keys: [[0, TJ(T_SIT, { tw: 10, ...tHand('f', [24, 10], 'fist'), ...tHand('b', [20, 8], 'palm', -40, 0.9) })],
      [0.22, TJ(T_BOW, { tor: 12, dx: 8, tw: 48, ...tHand('f', [14, -2], 'fist'), fe: -1, ...tHand('b', [26, 6], 'palm', -60, 0.9) }), 'out'],
      [0.42, TJ(T_SIT, { tw: 10, ...tHand('f', [22, 10], 'fist'), ...tHand('b', [22, 8], 'palm', -40, 0.9) })],
      [0.6, TJ(T_BOW, { tor: 14, dx: 10, tw: -40, ...tHand('b', [46, 0], 'palm', -78, 0.6, 0.3), ...tHand('f', [18, 10], 'fist') }), 'out'], [1, {}]] }),
  // 重 = 野马分鬃（太极的摔：侧身上步，前臂从他腋下往斜上方一分，把他掀出去 —— 落在你前面三个身位外，不换边）
  tjYeMa: TM({ kind: 'script', label: '野马分鬃', S: 0, A: 0, R: 28, script: true, evSlam: 13, tjGrab: 'yema',
    keys: [[0, TJ(T_SIT, { tw: 10, ...tHand('f', [24, 10], 'fist'), ...tHand('b', [20, 8], 'palm', -40, 0.9) })],
      [0.25, TJ(T_SIT, { tor: 4, hy: 60, dx: -4, tw: -20, ...tHand('f', [16, 24], 'palm', 20, 1, 0.2), ...tHand('b', [18, -8], 'palm', 170, 1, 0.2) })],
      [0.48, TJ(T_BOW, { tor: 6, dx: 18, hy: 62, tw: 30, ...tHand('f', [50, -26], 'palm', -60, 0.7, 0.35), ...tHand('b', [-20, 20], 'palm', 20, 1, 0.2) }), 'out'],
      [0.75, TJ(T_BOW, { tor: 4, dx: 18, hy: 62, tw: 30, ...tHand('f', [50, -26], 'palm', -60, 0.7, 0.35), ...tHand('b', [-20, 20], 'palm', 20, 1, 0.2) })], [1, {}]] }),
  // 踢 = 采住蹬脚（扣着他、提膝一脚蹬在肚子上 —— 蹬出去、打倒）
  tjCaiDeng: TM({ kind: 'script', label: '采住蹬脚', S: 0, A: 0, R: 20, script: true, evHit: 8, tjGrab: 'deng',
    keys: [[0, TJ(T_SIT, { tw: 10, ...tHand('f', [24, 10], 'fist'), ...tHand('b', [20, 8], 'palm', -40, 0.9) })],
      [0.25, TJ(P_TIXI, { ...tHand('f', [26, 6], 'fist') })],
      [0.42, TJ(P_DENG, { ff: [80, 40], ...tHand('f', [22, 2], 'fist') }), 'out'], [0.65, TJ(P_TIXI, { ff: [26, 30] })], [1, {}]] }),
  // 不按 = 按（两掌把他推出去，你先动一点）
  tjAn: TM({ kind: 'script', label: '按', S: 0, A: 0, R: 16, script: true, evPush: 4, tjGrab: 'an',
    keys: [[0, TJ(T_SIT, { tw: 10, ...tHand('f', [24, 10], 'fist'), ...tHand('b', [20, 8], 'palm', -40, 0.9) })], [0.25, P_AN, 'out'], [0.55, P_AN], [1, {}]] }),
  // 搂膝拗步（接住他踢过来的腿）：前手往外一搂把腿拨开，后手一掌推在他身上 —— 推出去、打倒
  tjLouXi: TM({ kind: 'script', label: '搂膝拗步', S: 0, A: 0, R: 24, script: true,
    keys: [[0, TJ(T_SIT, { tw: 14, ...tHand('f', [36, 28], 'palm', 30, 0.8, 0.3), ...tHand('b', [10, -10], 'palm', -100, 0.9) })],
      [0.3, TJ(T_BOW, { tor: 12, dx: 14, tw: -32, ...tHand('b', [52, 2], 'palm', -76, 0.55, 0.35), ...tHand('f', [18, 34], 'palm', 40, 0.9, 0.2) }), 'out'],
      [0.6, TJ(T_BOW, { tor: 12, dx: 14, tw: -32, ...tHand('b', [52, 2], 'palm', -76, 0.55, 0.35), ...tHand('f', [18, 34], 'palm', 40, 0.9, 0.2) })], [1, {}]] }),

  /* ---- 跳起来（上段：蹲着挡不住；旋风脚能蹲下躲）—— 跳起来化不了，也不蓄 ---- */
  airJab: TM({ kind: 'jab', label: '白蛇吐信', tier: 'air', lead: 'light', height: 'high', open: true, S: 4, A: 12, R: 6, dmg: 7, reach: 98, vreach: AIR_VREACH, stun: 15, bstun: 9, kb: 2.6, stop: 5, power: .45,
    limb: 'fh', fx: 'airSwing', air: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fpa: -60, bpa: -60, fh: [26, 10], bh: [16, 14] })], [0.55, J_(JT, { rot: 2, tor: 4, fh: [22, -4], fpa: -30, bh: [20, 6], tw: 20 })],
      [1, { rot: 18, tor: 24, head: -6, dx: 6, fh: [56, 12], fp: 1, fpa: 8, fpr: 0.3, fs: 0, bh: [24, 6], ff: [16, 42], bf: [-28, 28], tw: 30 }, 'back'],
      [2, { rot: 20, tor: 26, head: -6, dx: 6, fh: [54, 15], fp: 1, fpa: 8, fpr: 0.3, fs: 0, bh: [24, 6], ff: [16, 42], bf: [-28, 28], tw: 30 }], [3, JD]] }),
  // 3.1 转身撇身捶（Jack：三派跳起来按重长得太像）：太极不往前翻 —— 身子在空中拧过去（后背先朝他），拳从另一边的胯下面
  // 走一个立着的大圆：往上过头顶、再转身甩下来，拳背砸在他头上（杨式转身撇身捶：两手在身前划一个立圆，拳背从上往下盖过来）；
  // 另一只手立掌护着脸。整个人立着，腿一前一后在空中分开
  airHeavy: TM({ kind: 'heavy', label: '转身撇身捶', stamp: '撇身捶', tier: 'air', lead: 'heavy', height: 'high', open: true, S: 10, A: 11, R: 10, dmg: 12, reach: 104, vreach: AIR_VREACH, stun: 19, bstun: 12, kb: 5, stop: 9, shake: 6, power: 1, heavy: true,
    limb: 'fh', fx: 'hammerFist', air: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })],
      [0.2, { rot: -4, tor: 6, head: 4, tw: -50, fh: [-4, 30], fp: 0, fe: 1, bh: [20, -12], bp: 1, bpa: -80, bpr: 0.5, ff: [16, 52], bf: [-6, 44] }],
      [0.52, { rot: -6, tor: -10, head: -6, tw: -10, fh: [2, -52], fp: 0, fe: -1, bh: [22, -6], bp: 1, bpa: -80, bpr: 0.5, ff: [22, 46], bf: [-14, 40] }],
      [1, { rot: 4, tor: 20, head: 8, dx: 14, tw: 36, fh: [50, 18], fp: 0, fe: -1, bh: [16, -4], bp: 1, bpa: -80, bpr: 0.5, ff: [30, 30], bf: [-30, 34] }, 'out'],
      [2, { rot: 6, tor: 24, head: 8, dx: 14, tw: 38, fh: [48, 22], fp: 0, fe: -1, bh: [16, -2], bp: 1, bpa: -80, bpr: 0.5, ff: [30, 28], bf: [-30, 32] }], [3, J_(JD, { fp: 1, bp: 1 })]] }),
  airKick: TM({ kind: 'kick', label: '旋风脚', stamp: '旋风脚', tier: 'air', lead: 'kick', height: 'high', open: true, S: 9, A: 13, R: 9, dmg: 11, reach: 120, vreach: AIR_VREACH, stun: 18, bstun: 11, kb: 6, stop: 8, shake: 5, power: .9,
    limb: 'ff', fx: 'airKick', air: true, ghost: true, evadeCrouch: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.6, { rot: -6, spin: 180, tor: 10, head: -4, ff: [10, 60], bf: [-6, 46], fh: [34, -16], bh: [18, -6], tw: 10 }],
      [1, { rot: 12, spin: 360, tor: -30, head: 12, dx: 16, ff: [98, 30], ft: 20, bf: [-14, 50], fh: [40, -30], fpa: -20, bh: [30, -26], bpa: -20, tw: 10 }, 'back'],
      [2, { rot: 12, spin: 360, tor: -30, head: 12, dx: 16, ff: [98, 30], ft: 20, bf: [-14, 50], fh: [40, -30], fpa: -20, bh: [30, -26], bpa: -20, tw: 10 }], [3, J_(JD, { spin: 360 })]] }),
  // 海底针（空中蹲 + 踢）：先往上一腾，再一掌指尖朝下往下插（主系「坠」：专破蹲着的、对空；怕站着的拳）
  dive: TM({ kind: 'kick', label: '海底针', stamp: '海底针', tier: 'dive', lead: 'kick', height: 'high', S: 14, A: 40, R: 8, dmg: 10, reach: 84, vreach: 64, stun: 19, bstun: 10, kb: 2, stop: 8, shake: 6, power: .9,
    limb: 'ff', fx: 'dive', air: true, ghost: true, dive: true, aaProof: true,
    keys: [[0, J_(JT, { fp: 1, bp: 1, fh: [26, 10], bh: [16, 14] })], [0.7, { rot: -6, tor: 10, head: 4, ff: [20, 58], bf: [-10, 46], fh: [24, -30], fpa: -90, bh: [-16, -26], tw: 0 }],
      [1, { rot: -34, tor: 16, head: 10, ff: [40, 32], bf: [-22, 30], fh: [44, 26], fp: 1, fpa: 70, fs: 0, bh: [-30, -12], tw: 0 }, 'out'],
      [2, { rot: -34, tor: 16, head: 10, ff: [40, 32], bf: [-22, 30], fh: [44, 26], fp: 1, fpa: 70, fs: 0, bh: [-30, -12], tw: 0 }], [3, JD]] }),

  /* ---- 防守反击、身法 ---- */
  // 挤（挡着按拳 = 推挡）：后掌贴在前手腕上，往前一挤把他挤开
  shove: TM({ kind: 'push', label: '挤', tier: 'push', S: 2, A: 4, R: 12, dmg: 0, reach: 108, stun: 9, bstun: 0, kb: PUSH_KB, stop: 4, power: .3, push: true,
    limb: 'fh', fx: 'jab', lunge: [0, 4, 10],
    keys: [[0, P_JI], [1, TJ(P_JI, { tor: 10, dx: 14, fh: [40, 4], bh: [36, 6], ff: [46, 0], bf: [-58, 0] }), 'back'], [2, TJ(P_JI, { tor: 10, dx: 14, fh: [40, 4], bh: [36, 6], ff: [46, 0], bf: [-58, 0] })], [3, {}]] }),
  // 靠（挡住以后按重，花气 —— 格斗术的截击那一下）：侧过身、肩膀往前一靠，出手前几帧打击无敌，把人靠出去
  tjKao: TM({ kind: 'heavy', label: '靠', stamp: '靠', tier: 'heavy', lead: 'heavy', S: 5, A: 4, R: 16, dmg: 12, reach: 100, stun: 18, bstun: 10, kb: 11, stop: 9, shake: 6, power: .95, heavy: true,
    limb: 'sh', fx: 'shoulder', ghost: true, lunge: [0, 5, 18], sinv: [0, 6], cost: GC_COST, ender: true, noCancel: true,
    keys: [[0, TJ(T_SIT, { tor: 4, tw: -10, ...tHand('f', [20, 10], 'palm', -40, 0.9), ...tHand('b', [12, 14], 'palm', -40, 0.9) })],
      [1, TJ(T_BOW, { tor: 22, head: -6, dx: 24, hy: 60, spin: 30, tw: 60, ...tHand('f', [8, 14], 'fist'), ...tHand('b', [4, 18], 'palm', -40, 0.9) }), 'back'],
      [2, TJ(T_BOW, { tor: 22, head: -6, dx: 24, hy: 60, spin: 30, tw: 60, ...tHand('f', [8, 14], 'fist'), ...tHand('b', [4, 18], 'palm', -40, 0.9) })], [3, {}]] }),
  // 震脚（蹲挡住下段的腿以后按踢）：提脚一跺，跺在他伸过来的腿上
  stomp: TM({ kind: 'kick', label: '震脚', stamp: '震脚', height: 'low', S: 4, A: 4, R: 14, dmg: 12, reach: 122, stun: 16, bstun: 9, kb: 4, stop: 9, shake: 6, power: .9,
    limb: 'ff', fx: 'stomp', lunge: [1, 4, 22], launch: 4, lie: 25, ender: true, noCancel: true,
    keys: [[0, { hy: 50, tor: 14, ff: [30, 0], bf: [-30, 0] }], [0.6, { hy: 72, tor: -6, head: 6, dx: 4, ff: [30, 60], bf: [-22, 0] }],
      [1, { hy: 62, tor: 18, head: -8, dx: 22, ff: [76, 4], bf: [-26, 0] }, 'out'], [2, { hy: 62, tor: 18, head: -8, dx: 22, ff: [76, 2], bf: [-26, 0] }], [3, {}]] }),
  // 进步（冲刺）：压低、往前一趟步，手还在身前
  dash: TM({ kind: 'script', label: '进步', S: 0, A: 0, R: 16, script: true, lunge: [0, 10, 96], inv: [0, 8],
    keys: [[0, { hy: 60, tor: 10, head: -2, ff: [32, 0], bf: [-30, 0], tw: 10, ...tHand('f', [28, 4], 'palm', -60, 0.8), ...tHand('b', [18, 10], 'palm', -60, 0.8) }],
      [0.12, { hy: 56, tor: 18, head: -6, dx: 8, ff: [50, 8], bf: [-60, 12], tw: 10, ...tHand('f', [36, 2], 'palm', -60, 0.8), ...tHand('b', [22, 8], 'palm', -60, 0.8) }, 'out'],
      [0.45, { hy: 56, tor: 16, head: -4, dx: 10, ff: [52, 2], bf: [-60, 6], tw: 10, ...tHand('f', [36, 2], 'palm', -60, 0.8), ...tHand('b', [22, 8], 'palm', -60, 0.8) }],
      [0.7, { hy: 60, tor: 8, head: -2, dx: 4, ff: [42, 0], bf: [-44, 0], tw: 8 }], [1, {}]] }),
  // 斜飞（闪身：按着挡朝对手双击）：侧身斜着从他身边飞过去（只躲得过重拳；躲过了自动闪通臂）
  slip: TM({ kind: 'script', label: '斜飞', S: 0, A: 0, R: 22, script: true, lunge: [0, 11, 110], slipInv: [0, 11],
    keys: [[0, { hy: 60, tor: 14, head: 4, dx: -2, tw: 14, ff: [30, 0], bf: [-32, 0], ...tHand('f', [26, -14], 'palm', -90, 0.9), ...tHand('b', [18, 10], 'palm', -40, 0.9) }],
      [0.14, { hy: 48, tor: 32, head: -4, dx: 12, spin: 30, tw: 14, ff: [50, 6], bf: [-52, 12], ...tHand('f', [40, -28], 'palm', -110, 0.6, 0.4), ...tHand('b', [-20, 16], 'palm', 40, 0.9, 0.3) }, 'out'],
      [0.48, { hy: 48, tor: 30, head: -4, dx: 12, spin: 30, tw: 14, ff: [48, 2], bf: [-54, 8], ...tHand('f', [40, -28], 'palm', -110, 0.6, 0.4), ...tHand('b', [-20, 16], 'palm', 40, 0.9, 0.3) }],
      [0.72, { hy: 62, tor: 10, head: 6, dx: 2, spin: 10, tw: 14, ff: [28, 0], bf: [-32, 0] }], [1, {}]] }),
  // 闪通臂（斜飞躲过重拳、转到他身后，自动出）：一手往上架、一手推掌打在他背上 —— 他背对着你踉跄
  slipElbow: TM({ kind: 'heavy', label: '闪通臂', stamp: '闪通臂', tier: 'heavy', lead: 'heavy', S: 5, A: 3, R: 12, dmg: 10, reach: 86, stun: 18, bstun: 10, kb: STAGGER_KB,
    stop: 8, shake: 4, power: .8, limb: 'fh', fx: 'slipElbow', ghost: true, lunge: [0, 5, 18], stagger: true, ender: true, noCancel: true,
    keys: [[0, { spin: 165, tor: 20, hy: 58, head: 2, ff: [30, 0], bf: [-32, 0], tw: 0, ...tHand('f', [30, -14], 'palm', -90, 0.9), ...tHand('b', [24, -6], 'palm', -90, 0.9) }],
      [0.55, { spin: 95, tor: 4, hy: 66, head: -4, dx: -4, ff: [24, 0], bf: [-36, 0], tw: -20, ...tHand('f', [16, -6], 'palm', -70, 0.9), ...tHand('b', [10, -30], 'palm', -100, 0.9) }],
      [1, { spin: 8, tor: 14, dx: 22, hy: 64, head: -4, ff: [44, 0], bf: [-32, 0], tw: 40, ...tHand('f', [56, -4], 'palm', -78, 0.5, 0.35), ...tHand('b', [8, -40], 'palm', -170, 0.9, 0.3) }, 'back'],
      [2, { spin: 4, tor: 14, dx: 22, hy: 64, head: -4, ff: [44, 0], bf: [-32, 0], tw: 40, ...tHand('f', [56, -4], 'palm', -78, 0.5, 0.35), ...tHand('b', [8, -40], 'palm', -170, 0.9, 0.3) }], [3, {}]] }),
  // 爆气（挨打时按重 + 踢，花半格气）：两掌往外一分，从身上炸开
  burst: TM({ kind: 'script', label: '爆气', S: 0, A: 0, R: 22, script: true, inv: [0, 18], evWave: 3,
    keys: [[0, { tor: 24, hy: 54, head: 10, fh: [16, 10], bh: [10, 12], tw: 0, bhk: 0 }],
      [0.14, { tor: -12, head: -16, hy: 76, fh: [50, -14], fpa: -84, fs: 0.7, bh: [-34, -10], bpa: -100, bs: 0.7, bhk: 0, ff: [40, 0], bf: [-42, 0], air: 6, tw: 0 }, 'out'],
      [0.5, { tor: -10, head: -14, hy: 74, fh: [48, -12], fpa: -84, fs: 0.7, bh: [-32, -8], bpa: -100, bs: 0.7, bhk: 0, ff: [40, 0], bf: [-42, 0], air: 2, tw: 0 }], [1, {}]] }),
  // 如封似闭（大招，气满按重 + 踢）：两手十字一封、往后一坐，两掌一起发出去 —— 前摇里有掤（化得了打过来的手脚），打中就是发人丈外
  super: TM({ kind: 'heavy', label: '如封似闭', stamp: '如封似闭', tier: 'super', S: 12, A: 5, R: 22, dmg: 50, reach: 128, stun: 24, bstun: 15, kb: 8, stop: 16, shake: 12, power: 1.2, heavy: true,
    limb: 'fh', fx: 'splash', ghost: true, lunge: [8, 12, 30], launch: 7, ender: true, noCancel: true, cost: QI_MAX, antiAir: 40, tjHua: true,
    keys: [[0, {}], [0.25, TJ(T_SIT, { tor: -2, dx: -4, hy: 62, tw: 0, ...tHand('f', [24, -6], 'palm', -104, 1, 0.1), ...tHand('b', [26, -2], 'palm', -70, 1, 0.1), fz: 1 }), 'out'],
      [0.8, TJ(T_SIT, { tor: -6, dx: -8, hy: 60, tw: 0, ...tHand('f', [14, 8], 'palm', -82, 0.55, 0.3), ...tHand('b', [12, 12], 'palm', -82, 0.55, 0.3) })],
      [1, TJ(T_BOW, { tor: 16, dx: 30, hy: 60, tw: 4, ...tHand('f', [54, 2], 'palm', -78, 0.55, 0.45), ...tHand('b', [50, 8], 'palm', -78, 0.55, 0.45) }), 'back'],
      [2, TJ(T_BOW, { tor: 16, dx: 30, hy: 60, tw: 4, ...tHand('f', [54, 2], 'palm', -78, 0.55, 0.45), ...tHand('b', [50, 8], 'palm', -78, 0.55, 0.45) })], [3, {}]] }),
};
// 蓄着的时候一式一式往下走：揽雀尾 掤 → 捋 → 挤 → 按；搬拦捶 搬 → 拦 → 沉；蹬脚 提膝 → 分手；别的招在蓄势那个样子上往下沉一点
TJ_FLOW.tjLan = [P_PENG, P_LU, P_JI, P_AN0].map(tmk);
TJ_FLOW.tjBan = [P_BAN, P_LAN, P_LAN2, TJ(P_LAN2, { hy: 58, tor: -6, dx: -9 })].map(tmk);
TJ_FLOW.tjDeng = [P_TIXI, TJ(P_TIXI, { hy: 70 }), P_TIXI2, TJ(P_TIXI2, { hy: 68, tor: -2 })].map(tmk);
TJ_FLOW.tjFen = TJ_FLOW.tjDeng;
TJ_FLOW.tjChuan = [TJ(P_BALL, { dx: -4 }), TJ(P_BALL, { dx: -6, hy: 62, tw: 2 }), TJ(P_LU, {}), TJ(P_BALL, { dx: -8, hy: 60, tw: -4 })].map(tmk);

/* 架势（fighter.js target 用；蓄势、捋、云手在 tjTarget 里现画） */
const TPOSE = {
  stance: tmk({}),                                                                                     // 待机（3.1.2 Jack 的图；以前是单鞭）
  // 3.0.1（Jack：后腿弯下去太多了）：蹲着的后膝以前跪到地上（离地 2）—— 髋高 40 → 46、后脚往后，后膝离地 15（和格斗术、咏春蹲着差不多）
  // 3.1.2 待机换了以后，蹲下去手型跟着待机走：前手立掌、后手横在肚子前（以前是单鞭的勾手往身后伸，一蹲手就换个样子）
  crouch: tmk({ hy: 46, tor: 12, head: -2, tw: 22, ff: [40, 0], bf: [-62, 0], ...tHand('f', [44, 4], 'palm', -66, 0.7, 0.3), ...tHand('b', [6, 26], 'palm', -22, 0.8, 0.2) }),
  // 掤（按住挡）：两手十字合在胸前、掌心朝里（十字手）；蹲着是沉屈守中（defense_seq 01）
  block: tmk({ hy: 56, tor: 2, head: 4, dx: -2, tw: 4, ff: [42, 0], bf: [-54, 0], ...tHand('f', [24, -8], 'palm', -104, 1, 0.1), ...tHand('b', [27, -4], 'palm', -70, 1, 0.1), fz: 1 }),
  cblock: tmk({ hy: 46, tor: 14, head: 4, tw: 6, ff: [40, 0], bf: [-62, 0], ...tHand('f', [28, 0], 'palm', -84, 0.8, 0.15), ...tHand('b', [22, 6], 'palm', -60, 0.9, 0.1) }),
  // 捋住了（defense_seq 09 转腰牵引）：转腰、两手往身侧后下方带
  parry: tmk({ tor: -4, head: 2, dx: -8, hy: 54, tw: -34, ff: [44, 0], bf: [-58, 0], ...tHand('f', [16, 10], 'palm', 8, 0.9, 0.25), ...tHand('b', [-12, 16], 'palm', 40, 0.9, 0.25) }),
  // 收势（cloudhands 14 ～ 16）：两脚收拢站直，两掌慢慢往下按
  win: tmk({ tor: 0, head: -2, hy: 74, tw: 0, ff: [12, 0], bf: [-12, 0], ...tHand('f', [16, 26], 'palm', 2, 1, 0.15), ...tHand('b', [12, 28], 'palm', 2, 1, 0.15), bhk: 0 }),
  // 抱球、云手（动作台、教程小图看得到）
  ball: tmk(P_BALL),
};

/* ============================================================
   方向（相对对手）：0 没按 / 1 前 / 2 后 / 3 蹲；离得远（ASSIST_R 以外）按前后只是转身往那边打
   ============================================================ */
function tjDirVs(F, O, near) {
  const h = F.inp.held;
  if (h.down) return 3;
  const d = dirOf(h);
  if (!d || (near && Math.abs(O.x - F.x) > ASSIST_R)) return 0;
  return d === (O.x >= F.x ? 1 : -1) ? 1 : 2;
}
// 出哪一招：站着 拳 揽雀尾（前 玉女穿梭、后 倒卷肱）、重 搬拦捶、踢 蹬脚（前 分脚）；蹲着 下势 / 金鸡独立 / 跌岔；
// 连下去（势，最多三下）：拳拳 高探马 → 拳拳拳 穿掌；拳重 指裆捶、拳拳重 白鹤亮翅；拳踢 分脚；重拳 顺拦肘、重重 双峰贯耳、重踢 转身摆莲；
// 踢拳 上步七星、踢重 弯弓射虎、踢踢 转身蹬脚
function tjVariant(kind, chain, air, mod, F) {
  if (air) return mod === 'down' && kind === 'kick' ? 'dive' : { jab: 'airJab', heavy: 'airHeavy', kick: 'airKick' }[kind] || null;
  if (kind === 'grab') return mod === 'down' ? 'lowGrab' : 'grab';
  if (mod === 'down') return { jab: 'tjXia', heavy: 'tjJinJi', kick: 'tjDieCha' }[kind] || null;
  const c = chain.filter(x => x !== 'pc'), last = c[c.length - 1], prev = c[c.length - 2];
  if (!last) {
    const dc = F ? tjDirVs(F, F.opp, true) : 0;
    if (kind === 'jab') return dc === 1 ? 'tjChuan' : dc === 2 ? 'tjDao' : 'tjLan';
    if (kind === 'heavy') return 'tjBan';
    return dc === 1 ? 'tjFen' : 'tjDeng';
  }
  if (last === 'jab') return kind === 'jab' ? (prev === 'jab' ? 'tjChuanZ' : 'tjGaoTan') : kind === 'heavy' ? (prev === 'jab' ? 'tjBaiHe' : 'tjZhiDang') : 'tjFen';
  if (last === 'heavy') return { jab: 'tjShunLan', heavy: 'tjShuangFeng', kick: 'tjBaiLian' }[kind] || null;
  return { jab: 'tjQiXing', heavy: 'tjWanGong', kick: 'tjZhuanDeng' }[kind] || null;
}
const TJ_CANCEL = { jab: ['jab', 'heavy', 'kick'], heavy: ['jab', 'heavy', 'kick'], kick: ['jab', 'heavy', 'kick'], grab: [], push: [] };

/* ============================================================
   劲（太极唯一的资源）
   ============================================================ */
function tjJin(F, n, text) {
  const was = F.jin || 0;
  F.jin = clamp(was + n, 0, TJ_JIN_MAX); F.jinAt = F.clock;
  if (F.jin > was && !game.quiet && F.J && text) tag(F.J.head[0] - F.facing * 10, F.J.head[1] - 34, text, F, F.jin >= TJ_JIN_MAX ? 22 : 17);
}
// 这一下能化吗（掤）/ 能捋吗：正面打过来的手上的招、中段上段的腿；擒拿、推挡、下段、空中的招、坠山、大招、劲大的破得开（pierce）化不了
function tjSoft(A, m, d) {
  if (d.script || d.push || d.kind === 'grab' || d.dive || d.tier === 'super' || d.flurry || m.air || A.airborne) return false;
  if (d.height === 'low' || d.pierce || m.pierce) return false;
  return d.kind === 'jab' || d.kind === 'heavy' || d.kind === 'kick';
}
// 这一招前摇里有没有掤：蓄势的招（tjCharge，最多化 TJ_HUA_MAX 下）、如封似闭（tjHua，化多少下都行 —— 和泼墨的霸体一个分量）出招 TJ_PENG_FROM 帧以后、判定出来之前。
// 腿上的招没有掤（noPeng：单腿站着掤不住，拳照样打得他失衡）
const tjPeng = m => !!m && m.t >= (m.def.tjHua ? 0 : TJ_PENG_FROM) && m.t < m.S + 1 && !m.def.noPeng && (m.def.tjHua || (m.def.tjCharge && (m.hua || 0) < TJ_HUA_MAX));   // 大招整段前摇都有

/* ============================================================
   蓄势：按住出这一招的那个键（拳 / 重 / 踢）不放，前摇走到 TJ_HOLD_AT 停住，势接着一式一式往下走（m.q 帧），每 TJ_SEG 帧劲 +1，
   最多 TJ_CHARGE 帧（走到头自己发）；松开 = 发劲（从蓄着的那个样子直接打出去）。蓄着的时候不往前冲（前冲留到发的时候）
   ============================================================ */
function tjCharge(F, m, locked) {
  const d = m.def;
  if (!d.tjCharge || m.released) return;
  const held = !locked && !!F.inp.held[m.press];
  if (!m.charging) {
    if (held && m.t >= m.S * TJ_HOLD_AT && m.t < m.S) { m.charging = true; m.q = 0; m.segs = 0; m.lungePx = 0; }
    else if (m.t >= m.S) m.released = true;
    return;
  }
  if (held && m.q < TJ_CHARGE) {
    m.q += DT; m.hold = true;
    const seg = Math.floor(m.q / TJ_SEG + 1e-9);
    if (seg > m.segs) {
      m.segs = seg; tjJin(F, 1, F.jin + 1 >= TJ_JIN_MAX ? '蓄满' : null);   // 一段一段的只在头顶多一个墨点（drawCue），满了才写字
      if (!game.quiet) { Sound.whoosh(0.18); if (F.J) ring((F.J.fh[0] + F.J.bh[0]) / 2, (F.J.fh[1] + F.J.bh[1]) / 2, 18, 30, 2.4, pal(F).qi, 12); }
    }
    if (!game.quiet && F.J && Math.round(m.q * 4) % 10 === 0) burst(F.J.fh[0], F.J.fh[1], -F.facing, 2, 12, 1.6, pal(F).qi);   // 劲往手上收（只是画面）
    return;
  }
  // 松开（或蓄满了）：从蓄着的样子接着打出去
  m.charging = false; m.released = true; m.relPose = F.lastFlowPose ? copyPose(mk(TBASE), F.lastFlowPose) : null; m.relT = m.t;
  delete m.lungePx;
}
// 发劲：这一招判定出来那一刻把劲用掉（打中了按用掉的劲算疼不疼、打多远；打空了劲也没了）
function tjSpend(F, m) {
  if (m.jinUsed !== undefined || !m.def.tjCharge) return;
  if (m.t < m.S) return;
  m.jinUsed = F.jin || 0; F.jin = 0; F.jinAt = F.clock;
}

/* ============================================================
   采住（抓到人）：手扣着他往回带，时间到了看按的键 —— 拳 挒、重 野马分鬃、踢 采住蹬脚、不按 按
   （名字照通用的叫 hold：被抓的人刚被抓住那几帧按拿照样挣得脱，fighter.js tryEscape）
   ============================================================ */
function tjHoldStep(F, m, locked) {
  const o = F.opp, d = m.def, held = o.grabbed && o.state === 'hit', k = m.t + DT - 1;
  if (held) { o.x += (F.x + F.facing * HOLD_GAP - o.x) * PULL_K; o.kvx = 0; }
  if (!locked && !m.tpick) { const kk = F.takePress(['jab', 'heavy', 'kick']); if (kk) m.tpick = kk; }
  if (k >= d.R - 1) {
    if (!held) { F.move = null; F.state = 'idle'; F.chainIdle = 0; return true; }
    F.startScript({ jab: 'tjLie', heavy: 'tjYeMa', kick: 'tjCaiDeng' }[m.tpick] || 'tjAn');
    return true;
  }
  m.t += DT;
  return true;
}
// 采住以后那几下（他一直被扣着，到点了打在他身上）
function tjGrabStep(F, m, k) {
  const o = F.opp, d = m.def, held = o.grabbed && o.state === 'hit';
  if (!held) return false;
  if (d.tjGrab !== 'yema' || k < d.evSlam) { o.x += (F.x + F.facing * HOLD_GAP - o.x) * PULL_K; o.kvx = 0; }
  if (d.tjGrab === 'lie' && (k === d.evHit || k === d.evHit2)) {
    const last = k === d.evHit2;
    grabDamage(F, o, last ? 6 : 5, '挒', last);
    tjGrabFx(F, o, last);
    if (last) { o.grabbed = false; o.stunT = d.R - k + KNEE_ADV; o.kvx = F.facing * 5; o.hurtHeavy = true; if (!game.quiet) stamp(F.J.head[0] - F.facing * 52, F.J.head[1] - 46, '挒', 28, F); }
    if (o.hp <= 0) { o.hp = 0; o.knockDown(4, F.facing * 3, 999, true); }
  } else if (d.tjGrab === 'yema' && k === d.evSlam) {
    // 野马分鬃：把他从身前斜着掀出去，落在你前面（不换边），躺得久；他背后就是墙也照样摔在墙边
    grabDamage(F, o, 13, '野马分鬃', true);
    o.grabbed = false; o.alt = Math.max(o.alt, 0.01);
    o.knockDown(4.5, F.facing * 13, TFH(34), o.hp <= 0); o.slam = true; if (o.hp <= 0) o.hp = 0;
    game.freeze = Math.max(game.freeze, stop(8)); game.shake = Math.max(game.shake, 7);
    if (!game.quiet) { dust(o.x, FLOOR, 8, true); stamp(F.J.head[0] - F.facing * 52, F.J.head[1] - 46, '野马分鬃', 28, F); }
    Sound.hit(0.95);
  } else if (d.tjGrab === 'deng' && k === d.evHit) {
    grabDamage(F, o, 10, '采住蹬脚', true);
    o.grabbed = false; o.knockDown(3.5, F.facing * 10, TFH(26), o.hp <= 0); if (o.hp <= 0) o.hp = 0;
    tjGrabFx(F, o, true);
    if (!game.quiet) stamp(F.J.head[0] - F.facing * 52, F.J.head[1] - 46, '采住蹬脚', 26, F);
  } else if (d.tjGrab === 'an' && k === d.evPush) {
    grabDamage(F, o, 6, '按', false);
    o.grabbed = false; o.stunT = d.R - k + TA(4); o.kvx = F.facing * 9; o.hurtHeavy = false;
    if (!game.quiet) { tag(o.x, o.J.head[1] - 34, '按', F, 22); shoveFx(F, o); }
    if (o.hp <= 0) { o.hp = 0; o.knockDown(4, F.facing * 3, 999, true); }
  }
  return false;
}
function tjGrabFx(F, o, big) {
  if (game.quiet) return;
  const c = { x: o.x - F.facing * 12, y: o.J ? o.J.sh[1] + 8 : FLOOR - 100 };
  hitFx(big ? 'heavy' : 'jab2', c, F, o);
  game.freeze = Math.max(game.freeze, stop(big ? 7 : 3)); if (big) game.shake = Math.max(game.shake, 5);
}

/* ============================================================
   按键语法（引擎先问这里）
   ============================================================ */
function tjInput(F, where, locked) {
  if (where === 'neutral') {
    // 劲放久了掉一级（不让一直攒着）
    if (F.jin > 0 && F.clock - F.jinAt >= TJ_JIN_KEEP) { F.jin--; F.jinAt = F.clock; }
    // 捋：按着挡的时候刚按下「后」（离开对手的方向）记下来（两次按隔得太近没有捋，防乱按）
    const h = F.inp.held, back = !!(h.block && !h.down && h[F.opp.x >= F.x ? 'left' : 'right']);
    if (back && !F.luPrev) { F.luOK = F.clock - F.luPress >= TJ_LU_LOCK; F.luPress = F.clock; }
    F.luPrev = back;
    return false;
  }
  if (where === 'parry') return tjAfterLu(F, locked);
  if (where !== 'attack') return false;
  const m = F.move, d = m.def, k = m.t + DT - 1;
  if (m.name === 'hold') return tjHoldStep(F, m, locked);
  if (d.tjGrab) return tjGrabStep(F, m, k);
  tjCharge(F, m, locked);
  tjSpend(F, m);
  // 发劲打出去了：劲 2 以上打中了把人发出去（挡住了不推远：慢招被挡住照样罚得出来）
  const fa = d.tier === 'super' ? TJ_JIN_MAX : m.jinUsed || 0;
  if ((m.hit || m.blocked) && !m.faDone && fa >= 2) {
    m.faDone = true;
    const o = F.opp, kv = TJ_FA_KV[Math.min(TJ_JIN_MAX, fa)];
    if (o.state === 'down' || o.state === 'ko') o.kvx = F.facing * kv;
  }
  if (m.charging) return false;                                   // 蓄着的时候按别的键不算（缓冲里留着）
  // 连下去（势）：照通用的接（TJ_CANCEL、一串最多三下）
  if (!locked && !d.script) {
    const kk = F.takePress(['jab', 'heavy', 'kick', 'grab'], true);
    if (kk && F.canCancel(kk)) { F.takePress([kk]); F.startAttack(kk, true); return true; }
  }
  return false;
}
// 捋住了以后：先把他牵过去（TJ_LU_PULL 帧：他从你面前被带到你身后 TJ_LU_GAP 远，你转腰跟着转过去；身后是墙就你往前让一步），
// 然后你先动（拳 / 重 / 踢 / 拿 都照常出）
function tjAfterLu(F, locked) {
  const o = F.opp;
  if (F.t < TJ_LU_PULL && F.luBTo !== undefined) {
    const u = clamp((F.t + DT) / TJ_LU_PULL, 0, 1), e = EASE.io(u);
    if (o.luPull && o.state === 'hit') {
      o.x = clamp(o.luFrom + (o.luTo - o.luFrom) * e, WALL_L, WALL_R); o.kvx = 0;
      F.x = clamp(F.luBFrom + (F.luBTo - F.luBFrom) * e, WALL_L, WALL_R);
      if (u >= 0.5) F.facing = o.luTo >= F.luBTo ? 1 : -1;          // 他过了身：跟着转过去
    }
    if (u >= 1) o.luPull = false;
    F.t += DT;
    return true;
  }
  o.luPull = false;
  if (!locked) {
    const kk = F.takePress(['jab', 'heavy', 'kick', 'grab']);
    if (kk) { F.facing = o.x >= F.x ? 1 : -1; if (F.startAttack(kk, false)) return true; }
  }
  if ((F.t += DT) >= TJ_LU_PULL + PARRY_POSE + 4) F.state = 'idle';
  return true;
}

/* ============================================================
   挨打（引擎 applyHit 先问这里）：化（掤）、捋
   ============================================================ */
function tjDefend(A, B, c, I) {
  const m = I.m, d = I.d;
  if (!I.front || !tjSoft(A, m, d)) return false;
  // 捋：按住挡、刚按下后（TJ_LU_WIN 帧以内）
  if (B.state === 'block' && !B.noParry && B.luOK && B.clock - B.luPress < TJ_LU_WIN + 1) { tjLu(A, B, c); return true; }   // noParry：电脑没想捋（和卸力一样，见 fighter.js parryReady）
  // 化：出招的前摇里（蓄着的时候也是）身上有掤
  const bm = B.state === 'attack' ? B.move : null;
  if (bm && tjPeng(bm)) { tjHua(A, B, c, bm); return true; }
  return false;
}
function tjHua(A, B, c, bm) {
  const m = A.move, d = m.def, dir = A.facing;
  m.done = true; m.absorbed = true;                                    // 他这一下被化掉了（照样接得上下一下：连打破掤）
  const chip = Math.max(1, Math.round(d.dmg * (m.dmgMul || 1) * TJ_HUA_KEEP));
  B.hp = Math.max(1, B.hp - chip);
  bm.hua = (bm.hua || 0) + 1; B.huaAt = B.clock;
  tjJin(B, 1, '化');
  A.kvx = -dir * 1.2;
  A.info = { label: d.label, dmg: chip, how: '被化', why: '太极拳出招（蓄着）的时候身上有掤：手上的招、中段上段的腿打进去都被化掉，劲给它攒着。擒拿、下段、跳着打化不了；连打三下破得开', adv: null, t: A.clock };
  B.info = { label: '掤', dmg: 0, how: '化', why: '化掉一下：劲 +1，这一招打出去是借力打力', adv: null, t: B.clock };
  B.stats.parries++; B.gainQi(chip * QI_PER_HP + 2);
  cev('hua', A, B, { name: m.name, by: bm.name });
  game.freeze = Math.max(game.freeze, stop(4));
  if (!game.quiet) {
    const P = pal(B), base = B.facing > 0 ? 0 : Math.PI;
    swipe(B.x + B.facing * 18, c.y, 30, base + B.facing * 0.5, 2.6, 6, P.qi, 16);
    arcMid(B.x + B.facing * 14, c.y, 22, base - B.facing * 1.2, 2.2, 3, P.fx, 14);
    tag(c.x, c.y - 14, '-' + chip, A, 15);
  }
  Sound.block();
}
function tjLu(A, B, c) {
  const m = A.move, d = m.def, ab = B.x >= A.x ? 1 : -1;             // ab：他朝你打过来的方向
  m.done = true;
  // 他被牵过去：从你面前带到你身后 TJ_LU_GAP 远，背对着你往前踉跄 —— 打他的背挡不住。身后是墙：你往前让一步，他贴着墙
  let to = B.x + ab * TJ_LU_GAP, bTo = B.x;
  const lim = ab > 0 ? WALL_R : WALL_L;
  if ((to - lim) * ab > 0) { to = lim; bTo = lim - ab * TJ_LU_GAP; }
  A.state = 'hit'; A.stunT = TJ_LU_PULL + TJ_LU_STUN + (d.launch ? TF(4) : 0);
  A.reel = true; A.reelKind = 'lu'; A.reelBy = B.idx; A.reelKD = !!d.launch; A.stagger = true; A.hurtHeavy = true;
  A.clashed = false; A.grabbed = false; A.move = null; A.chain = []; A.chainIdle = 99; A.runT = 0; A.comboLive = false; A.flow = 0;
  A.facing = ab;                                                        // 冲过了头：背对着你
  A.luPull = true; A.luFrom = A.x; A.luTo = to; A.kvx = 0; if (A.airborne) { A.vz = Math.max(A.vz, 2); A.vx = 0; }
  B.move = null; B.state = 'parry'; B.t = 0; B.stunT = 0; B.kvx = 0; B.gwalk = 0; B.parryKind = 'lu'; B.luOK = false; B.facing = -ab;
  B.luBFrom = B.x; B.luBTo = bTo;
  B.chain = ['pc']; B.chainIdle = 0;
  tjJin(B, 1, null); B.huaAt = B.clock;
  B.gainQi(10); B.stats.parries++;
  A.info = { label: '被捋', dmg: 0, how: '失衡', why: '他按着挡、在你打到之前按了一下后：引进落空，你被牵过去、背对着他', adv: -A.stunT, t: A.clock };
  B.info = { label: '捋', dmg: 0, how: '引进落空', why: '捋住了：他被牵过去、背对着你失衡（打背挡不住），劲 +1', adv: A.stunT, t: B.clock };
  cev('lu', A, B, { name: m.name });
  game.freeze = Math.max(game.freeze, stop(8)); game.shake = Math.max(game.shake, 3);
  if (!game.quiet) { parryFx(B, c); stamp(B.J.head[0] - B.facing * 52, B.J.head[1] - 46, '捋', 30, B); tag(A.x, A.J.head[1] - 30, '失衡', B, 20); }
  Sound.parry();
}

/* ============================================================
   打中（引擎 applyHit 问这里，伤害算出来之前）：发劲 —— 劲越多越疼（劲 2 打倒、劲 3 发人丈外），前摇里化过 = 借力打力
   ============================================================ */
function tjStrike(A, B, c, I) {
  const m = I.m, d = I.d;
  if (!d.tjCharge) return false;
  tjSpend(A, m);
  const jin = m.jinUsed || 0;
  let mul = 1 + TJ_JIN_DMG * jin;
  if (m.hua) { mul *= TJ_JIELI_MUL; m.stamp = '借力打力'; }
  m.dmgMul = (m.dmgMul || 1) * mul;
  if (jin >= 2 && !d.launch) m.launch = jin >= 3 ? 5 : 3.5;
  if (jin >= 3 && !m.stamp) m.stamp = '发';
  if (jin > 0 && !game.quiet) { const P = pal(A); ring(c.x, c.y, 8, 30 + 10 * jin, 3, P.fx, 14); }
  return false;
}

/* ============================================================
   抓到人（引擎 doGrab 问这里）：接住踢过来的腿（站着采到出腿的 catch、蹲着搂住地上的腿 scoop）= 搂膝拗步；
   采住站着的、挡着的、蹲着的 —— 走通用的擒住（名字叫 hold），后面几下在 tjHoldStep
   ============================================================ */
function tjGrab(A, B, type) {
  if (type !== 'catch' && type !== 'scoop') return false;
  A.move.done = true; A.move.hit = true;
  const dir = A.facing, airK = B.airborne || !!(B.move && B.move.air), dmg = airK ? CATCH_AIR_DMG : CATCH_DMG + 2;
  B.reel = false; B.clashed = false; B.stagger = false;
  B.hp -= dmg; A.stats.hits++; A.stats.specials++;
  A.gainQi(dmg * 0.4 * QI_PER_HP); B.gainQi(dmg * 0.9 * QI_PER_HP);
  B.knockDown(airK ? 4 : 3.5, dir * 9, airK ? LIE_AIR : LIE_GROUND, B.hp <= 0); if (B.hp <= 0) B.hp = 0;
  A.startScript('tjLouXi');
  game.freeze = stop(10); game.shake = Math.max(game.shake, 6);
  if (!game.quiet) {
    const foot = B.J.ff;
    dust(foot[0], foot[1], 5); impact(foot[0], foot[1], dir, 36, pal(A).ink, 6, 1.0); sparks(foot[0], foot[1], dir, 8, 7, pal(A).fx, 1.0, 0.4);
    stamp(A.J.head[0] - dir * 52, A.J.head[1] - 46, '搂膝拗步', 28, A);
    tag(B.x + dir * 16, B.J.head[1] + 4, '-' + dmg, A, 18);
  }
  Sound.hit(0.8);
  bumpCombo(A, B); noteGrab(A, dmg, '搂膝拗步');
  return true;
}

/* ============================================================
   画：蓄势一式一式走、发出去、掤（十字手）+ 云手、捋（引擎 target 先问这里；null = 照通用的画）
   ============================================================ */
const TJ_SP = mk(TBASE);
function tjTarget(F, t) {
  const st = F.state, m = F.move;
  if (st === 'attack' && m && m.def.tjCharge) {
    const fl = TJ_FLOW[m.name];
    if (m.charging) {
      // 蓄着：照这一招的那几式走（每 TJ_SEG 帧一格）；没有专门那几式的，在蓄势那个样子上慢慢往下沉
      if (fl) {
        const u = clamp(m.q / TJ_SEG, 0, fl.length - 1), i = Math.min(fl.length - 2, Math.floor(u));
        lerpPose(fl[i], fl[i + 1], EASE.io(u - i), t, false);
      } else {
        copyPose(t, evalKeys(m.def.keys, F.baseTime())); const s = clamp(m.q / TJ_CHARGE, 0, 1); t.hy -= 3 * s; t.tor -= 2 * s; t.dx -= 3 * s;
      }
      copyPose(F.lastFlowPose || (F.lastFlowPose = mk(TBASE)), t);
      return t;
    }
    // 刚松开：从蓄着的那个样子直接打出去（不先回到蓄势那一刻再打）
    if (m.released && m.relPose && m.t < m.S) {
      copyPose(TJ_SP, evalKeys(m.def.keys, m.def.S));
      const u = clamp((m.t - m.relT) / Math.max(1, m.S - m.relT), 0, 1);
      return lerpPose(m.relPose, TJ_SP, EASE.in(u), t, false);
    }
    return null;
  }
  if (st === 'idle') {
    // 3.1.2 待机（Jack 的图）的呼吸：太极慢，两秒一口气（别的派 1.3 秒，fighter.js）—— 呼气身子往下沉一点、前掌往前送、指尖往前倒一点，
    // 吸气反过来；后手跟着慢半拍。腿不动：3.1.3（Jack：后腿在抖）后腿蹬直的时候髋一上一下、膝盖就跟着前后晃（腿快伸直时一点就动），
    // 髋只动 0.25（以前 0.5；别的派 0.4），起伏放在上身和手上
    copyPose(t, TPOSE.stance);
    const ph = F.clock * TAU / 120, c = Math.cos(ph);
    t.hy -= 0.25 * c; t.tor += 0.8 * c; t.head -= Math.cos(ph - 0.5);
    t.fh[0] += 1.5 * c; t.fh[1] += 1.8 * Math.cos(ph - 0.6); t.fpa += 3 * Math.cos(ph - 0.6);
    t.bh[0] += c; t.bh[1] += 1.4 * Math.cos(ph - 0.9);
    return t;
  }
  if (st === 'block') {
    copyPose(t, F.lowBlock ? TPOSE.cblock : TPOSE.block);
    if (F.gwalk && !F.lowBlock) {
      // 云手（cloudhands 4 ～ 6）：按着挡走，两只手在身前一上一下画圈，脚下一步一步挪
      const ph = F.walkPhase * TAU, s = Math.sin(ph), c = Math.cos(ph);
      t.fh[0] = 30 + 6 * c; t.fh[1] = -2 + 14 * s; t.bh[0] = 26 - 6 * c; t.bh[1] = 10 - 14 * s; t.fpa = -70 + 30 * s; t.bpa = -70 - 30 * s; t.fz = c > 0 ? 1 : 0;
      t.ff[0] += 9 * s; t.ff[1] = Math.max(0, 6 * c); t.bf[0] -= 9 * s; t.bf[1] = Math.max(0, -6 * c);
      t.tw = 4 + 14 * c;
    }
    return t;
  }
  if (st === 'parry' && F.parryKind === 'lu') return copyPose(t, TPOSE.parry);
  return null;
}
// 劲：头顶上几个墨点（劲几级就几个）；蓄着的时候手边一圈慢慢合上的墨线（一圈 = 一段劲）
function tjDrawCue(c2d, F, V) {
  if (!V || !V.J) return;
  const J = V.J, P = pal(F), jin = F.jin || 0, m = F.move;
  c2d.save();
  if (jin > 0 && F.state !== 'down' && F.state !== 'ko') {
    const hx = J.head[0], hy = J.head[1] - BONE.head - 14;
    for (let i = 0; i < jin; i++) {
      c2d.fillStyle = rgbaOf(F.color, 0.85); c2d.beginPath(); c2d.arc(hx + (i - (jin - 1) / 2) * 9, hy, 3.2, 0, TAU); c2d.fill();
    }
  }
  if (F.state === 'attack' && m && m.charging) {
    const x = (J.fh[0] + J.bh[0]) / 2, y = (J.fh[1] + J.bh[1]) / 2, k = (m.q % TJ_SEG) / TJ_SEG, full = m.q >= TJ_CHARGE;
    c2d.lineCap = 'round';
    c2d.strokeStyle = rgbaOf(P.qi, 0.3); c2d.lineWidth = 2.2; c2d.beginPath(); c2d.arc(x, y, 15, 0, TAU); c2d.stroke();
    c2d.strokeStyle = rgbaOf(F.color, 0.9); c2d.lineWidth = 3;
    c2d.beginPath(); c2d.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + TAU * (full ? 1 : k)); c2d.stroke();
  }
  c2d.restore();
}

/* ============================================================
   交手、跨派、挂进拳派表
   ============================================================ */
// 交手（两边同时打中）：主系、起手照通用的那一套（拳 > 腿 > 重 > 拳）；太极的招在前摇里撞上的那一下由 tjDefend（化）先管
function tjRelation(a, b) { return relation(a, b); }
const T_BENCH_GROUPS = [
  ['拳 · 揽雀尾', ['tjLan', 'tjChuan', 'tjDao', 'tjXia']],
  ['重 · 搬拦捶', ['tjBan', 'tjJinJi']],
  ['踢 · 蹬脚', ['tjDeng', 'tjFen', 'tjDieCha']],
  ['势（连下去）', ['tjGaoTan', 'tjChuanZ', 'tjZhiDang', 'tjBaiHe', 'tjShunLan', 'tjShuangFeng', 'tjBaiLian', 'tjQiXing', 'tjWanGong', 'tjZhuanDeng']],
  ['采', ['grab', 'lowGrab', 'hold', 'tjLie', 'tjYeMa', 'tjCaiDeng', 'tjAn', 'tjLouXi']],
  ['跳起来', ['airJab', 'airHeavy', 'airKick', 'dive']],
  ['身法 · 防守', ['shove', 'tjKao', 'stomp', 'dash', 'slip', 'slipElbow', 'burst', 'super']],
];
STYLES.taiji = {
  id: 'taiji', name: '太极拳', moves: TMOVES, relation: tjRelation, cancel: TJ_CANCEL, variant: tjVariant, poses: TPOSE, base: TBASE,
  chainMax: 5, blockHeavy: 'tjKao', parry: false,   // 3.1 一串最多三下 → 五下（Jack：连招可以长；太极的势一式接一式：搬拦捶 → 顺拦肘 → 分脚 → 上步七星 → 弯弓射虎）
  input: tjInput, defend: tjDefend, strike: tjStrike, grab: tjGrab, target: tjTarget, drawCue: tjDrawCue,
  benchGroups: T_BENCH_GROUPS, benchHit: ['tjLan', 'tjChuan', 'tjDao', 'tjXia', 'tjBan', 'tjJinJi', 'tjDeng', 'tjFen', 'tjDieCha', 'tjGaoTan', 'tjChuanZ', 'tjZhiDang', 'tjBaiHe',
    'tjShunLan', 'tjShuangFeng', 'tjBaiLian', 'tjQiXing', 'tjWanGong', 'tjZhuanDeng', 'tjKao', 'slipElbow', 'super', 'stomp', 'airJab', 'airHeavy', 'airKick', 'dive'],
};
/* 跨派：两派的招按同一套系别比（拳 > 腿 > 重 > 拳，起手压）；多出来的照咏春拳那一份（截脚截地上的腿）。
   太极的化、捋在 tjDefend（applyHit）里，不走这张表 */
MATCHUPS['trad|taiji'] = { relation(dT, dJ) { return relation(dT, dJ); } };
MATCHUPS['wc|taiji'] = { relation(dW, dJ) { return wcRules(dW, dJ) || relation(dW, dJ); } };
