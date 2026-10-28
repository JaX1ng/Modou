'use strict';
/* 姿势系统：关键帧插值 + 两节骨骼 IK。改动作手感看 moves.js 的关键帧，这里一般不用动 */

/* ============================================================
   姿势：所有角度单位为度；手脚用 IK 目标点（人物模型的骨头长短见 body.js BODY.bone：腿 39 + 37、手 25 + 23）
   tor 上身前倾 / head 头再往前低 / hy 髋离地多高 / dx 髋往前挪 / air 整个人往上抬 / rot 整个人转 / spin 绕竖轴转身
   tw  拧腰（2.4）：正 = 前手那边的肩膀往前送（出前手拳），负 = 后手肩膀往前（出后手拳）
   fh/bh: 前手 / 后手拳心，相对「两肩中间」[往前, 往下]（不跟着上身转，横平竖直）；fe/be 肘往哪边顶（1 往下，-1 往上）
   ff/bf: 前脚 / 后脚的脚踝 [相对髋往前, 鞋底离地多高]；fn/bn 膝盖往哪边顶（1 往前；-1 往后）；
          ft/bt 脚尖再往上勾多少度（扫堂腿伸出去那只脚勾着）；
          fo/bo（2.5）膝盖往侧面（z）摆出去多少度，脚尖跟着朝侧面（扫堂腿蹲着的那条腿：膝盖朝外、不朝后）
   画的时候：护着下巴的后手、前腿离镜头近（画在前面），前手、后腿在远侧
   ============================================================ */
// 出招时的底子（招式关键帧没写的部分都从这里来）：和站姿差不多、略低一点 —— 前手在肩前、后手护着下巴，两脚前后分开
const BASE = { rot: 0, spin: 0, tor: 6, head: 3, hy: 71, dx: 0, air: 0, fe: 1, be: 1, tw: 20, fn: 1, bn: 1, ft: 0, bt: 0, fo: 0, bo: 0,
  fp: 0, bp: 0, fpa: -90, bpa: -90, fpr: 1, bpr: 1, fw: 0, bw: 0,
  fh: [26, -2], bh: [7, -6], ff: [25, 0], bf: [-30, 0] };
// 2.9 掌（Jack：咏春有掌，单独做一个五指并拢的掌）：fp / bp 前手 / 后手是拳（0）还是掌（1，过了一半就画成掌）；
//     fpa / bpa 掌的手指朝哪（度，和 fh / bh 一样是姿势的坐标：0 往前、-90 朝上、90 朝下、180 往后）。拳头的时候不管这两个
// 2.10 fpr / bpr 掌心朝哪（Jack：手掌内翻一定要看得出来是往里翻的）：1 = 掌心朝里（朝中线，问手、护手），0 = 侧着（掌心朝前、朝上下，看见的是掌边），-1 = 朝外。
//     侧面看：朝里 = 大拇指在靠身子那一边；朝外 = 大拇指在前面；侧着 = 掌窄一点、大拇指藏在后面（body.js palmShape）
// 2.10.2 fw / bw 拳头绕手腕往上翘多少度（Jack：日字冲拳胳膊不是完全伸直的，手腕往上弯一点点）：0 = 拳头顺着小臂；正 = 往上翘（小臂朝前时拳面朝前上）。
//     只管拳头，掌的手指朝哪还是 fpa / bpa
const NUMK = ['rot', 'spin', 'tor', 'head', 'hy', 'dx', 'air', 'fe', 'be', 'tw', 'fn', 'bn', 'ft', 'bt', 'fo', 'bo', 'fp', 'bp', 'fpa', 'bpa', 'fpr', 'bpr', 'fw', 'bw'];
const ARRK = ['fh', 'bh', 'ff', 'bf'];
// base：这一招的底子（不写 = 传统格斗的 BASE；别的拳派的招用自己的底子，比如咏春拳的 WBASE，见 wingchun.js）
function mk(o, base) {
  const p = Object.assign({}, base || BASE, o || {});
  for (const k of ARRK) p[k] = p[k].slice();
  return p;
}
function copyPose(dst, src) {
  for (const k of NUMK) dst[k] = src[k];
  for (const k of ARRK) { dst[k][0] = src[k][0]; dst[k][1] = src[k][1]; }
  return dst;
}
// wrap：角度走最短路（翻跟头、转身后 rot/spin 可能累积到 720 之类，先取模再算）
const wrapDeg = d => ((d % 360) + 540) % 360 - 180;
function lerpPose(a, b, t, out, wrap) {
  for (const k of NUMK) {
    let d = b[k] - a[k];
    if (wrap && (k === 'spin' || k === 'rot')) d = wrapDeg(d);
    out[k] = a[k] + d * t;
  }
  if (wrap) { out.rot = wrapDeg(out.rot); out.spin = wrapDeg(out.spin); }
  for (const k of ARRK) {
    out[k][0] = a[k][0] + (b[k][0] - a[k][0]) * t;
    out[k][1] = a[k][1] + (b[k][1] - a[k][1]) * t;
  }
  return out;
}
const EASE = {
  io: u => u * u * (3 - 2 * u),
  out: u => 1 - (1 - u) * (1 - u) * (1 - u),
  in: u => u * u,
  lin: u => u,
  back: u => { const s = 1.7; return 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2); },  // 冲过头再回来，出拳更有弹性
};
const TMP = mk();
function evalKeys(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [f0, p0] = keys[i - 1], [f1, p1, e] = keys[i];
      const u = clamp((t - f0) / ((f1 - f0) || 1), 0, 1);
      return lerpPose(p0, p1, EASE[e](u), TMP, false);
    }
  }
  return keys[keys.length - 1][1];
}

// 跳跃三段：上升（提膝）→ 顶点（收腿团身）→ 下落（伸腿找地）。
// 2.1（Jack 给了参考图：后腿别张那么开，手臂也别张那么开）：两条腿并在一起 —— 膝盖往前上提、小腿往后下收，脚在屁股底下；
// 两只手顺着身子往下垂、稍微张开一点。2.4 按新的腿长、手长重新摆
const P_JUP = { hy: 56, tor: 10, head: -2, tw: 10, ff: [13, 20], bf: [-3, 8], fh: [12, 40], bh: [-14, 39], fe: 1, be: -1 };
const P_JTOP = { hy: 56, tor: 14, head: 0, tw: 10, ff: [8, 13], bf: [1, 10], fh: [14, 39], bh: [-16, 38], fe: 1, be: -1 };
const P_JDN = { hy: 56, tor: 8, head: -1, tw: 10, ff: [12, 5], bf: [-5, 3], fh: [16, 38], bh: [-16, 38], fe: 1, be: -1 };
// 跑着起跳：飞身 —— 身子更往前倾、前膝提得更高往前送，后腿也收着；手还是往下垂
const P_JLEAP = { hy: 56, tor: 22, head: -4, tw: 10, ff: [15, 19], bf: [-6, 10], fh: [16, 37], bh: [-18, 36], fe: 1, be: -1 };
const P_JLEAP_DN = { hy: 56, tor: 12, head: -3, tw: 10, ff: [14, 7], bf: [-7, 5], fh: [17, 37], bh: [-17, 36], fe: 1, be: -1 };   // 飞身往下落：两腿往下伸着找地
const POSE = {
  /* 待机站姿（2.4 照 Jack 的参考图；2.5 照参考图第二张：两脚收近一点、髋高一点、身子微微往前）：头微低；两腿前后岔开 —— 后腿直、前腿膝盖微屈；
     前手：比参考图收短、往里收 —— 大臂往下垂（肘护着肋）、小臂往上立，拳在肩前；后手拳护在下巴前 */
  //   2.6（Jack：待机后面那只手往前放一点点）：后手拳 [6, -6] → [11, -6]，还在下巴前，只是往前探出去一点
  stance: mk({ tor: 6, head: 3, hy: 73, tw: 22, ff: [24, 0], bf: [-29, 0], fh: [27, -1], bh: [11, -6] }),
  run: mk({ tor: 26, head: -16, hy: 62, fe: 0.2, be: 0.2, tw: 0 }),   // 跑步只用到这几个，手脚每帧现算（fighter.js runPose）
  crouch: mk({ hy: 50, tor: 24, head: -6, tw: 18, ff: [27, 0], bf: [-25, 0], fh: [24, 3], bh: [8, -3] }),
  // 格挡：两只小臂竖起来挡在脸前（肘往下沉护着肋），身子微微往后坐
  block: mk({ hy: 70, tor: 2, head: 8, dx: -3, tw: 8, fh: [17, -17], bh: [13, -13], ff: [24, 0], bf: [-33, 0] }),
  cblock: mk({ hy: 50, tor: 18, head: 8, tw: 8, ff: [26, 0], bf: [-25, 0], fh: [19, -13], bh: [15, -10] }),
  squat: mk({ hy: 54, tor: 20, head: -6, tw: 10, ff: [25, 0], bf: [-27, 0], fh: [24, 2], bh: [-4, 8] }),
  land: mk({ hy: 52, tor: 24, head: -4, tw: 10, ff: [30, 0], bf: [-30, 0], fh: [28, 2], bh: [-10, 6] }),
  jup: mk(P_JUP), jtop: mk(P_JTOP), jdn: mk(P_JDN), leap: mk(P_JLEAP), leapDn: mk(P_JLEAP_DN),
  // 被过肩摔扛起来：被拽着一只手、身子缩着、腿乱蹬（整个人的转角 rot 由 fighter.js 按摔的进度算）
  thrown: mk({ tor: 14, head: 18, hy: 52, tw: 0, fh: [28, -42], bh: [-6, -38], ff: [32, 34], bf: [-14, 22] }),
  // 团身（翻滚、被顶回去翻跟头、滚身起）：大腿往前收到胸口、膝盖往前，小腿折回来脚跟贴着屁股（2.4 以前脚放在髋上面，膝盖是反着折的）
  tuck: mk({ hy: 52, tor: 40, head: 16, tw: 0, ff: [4, 33], bf: [-3, 30], fh: [20, 14], bh: [12, 18] }),
  // 挨打：轻的 —— 头往后一甩、上身往后仰、手松开；重的 —— 弯腰缩成一团
  hurtL: mk({ tor: -20, head: -24, dx: -10, hy: 72, tw: -10, fh: [12, -6], bh: [-4, -2], ff: [30, 0], bf: [-32, 0] }),
  hurtH: mk({ tor: 36, head: 28, dx: -14, hy: 62, tw: 0, fh: [22, 22], bh: [10, 26], ff: [22, 0], bf: [-38, 0] }),
  hurtAir: mk({ rot: -30, tor: -14, head: -26, tw: 0, fh: [-10, -30], bh: [-24, -16], ff: [32, 28], bf: [2, 14] }),
  pulled: mk({ tor: 30, head: 18, dx: 8, hy: 64, tw: 0, fh: [20, 16], bh: [8, 20], ff: [36, 0], bf: [-14, 0] }),
  reel: mk({ tor: -32, head: -30, dx: -14, hy: 74, tw: -16, fh: [-16, -32], bh: [-30, -20], ff: [38, 4], bf: [-26, 0] }),   // 失衡：被卸力/推开
  recoil: mk({ tor: -16, head: -18, dx: -12, hy: 70, tw: 0, fh: [30, -24], bh: [18, -20], ff: [30, 0], bf: [-38, 0] }), // 拼招震退
  parry: mk({ tor: -6, head: 8, dx: -6, hy: 70, tw: 26, fh: [44, -28], fe: -1, bh: [12, -14], ff: [24, 0], bf: [-34, 0] }),
  fall: mk({ rot: -60, tor: -16, head: -24, tw: 0, ff: [40, 36], bf: [16, 28], fh: [-14, -34], bh: [-26, -24] }),
  /* 躺着（2.0，Jack：身子和腿要躺在地上，头也在地上、发带平铺在地上，两手平放在身体两边，看着合人体）：
     整个人转 -90°（rot）就是仰面平躺：身体坐标里「往下」= 地上往脚那边，「往前」= 往上，「往后」= 往地里。
     2.4 人变厚了：后背比腿厚，腿的中线要比脊柱低一点（脚往「后」放一点）才贴得着地；头往后仰一点（head -20），后脑勺垫在地上。
     2.5.1 腿长了一点（小腿 37 → 39、大腿 39 → 38）：髋到脚 82 → 83.5、稍弯的那只脚 [-6, 4] → [-7, 3]，膝盖还稍微拱着，大腿贴着地 */
  lie: mk({ rot: -90, tor: 4, head: -20, hy: 83.5, air: 0, tw: 0, ff: [-7, 3], bf: [-7, -2], fh: [-6, 46], bh: [-5, 45.5], fe: 1, be: 1 }),
  lieFlat: mk({ rot: -90, tor: 4, head: -20, hy: 83.5, air: 0, tw: 0, ff: [-6, -2], bf: [-7, -1], fh: [-6, 46], bh: [-5, 45.5], fe: 1, be: 1 }),
  // 起身硬直（2.0）：从蹲着站起来、两手还垂在下面没护住 —— 一看就知道「现在打得着他」
  rise: mk({ hy: 56, tor: 18, head: -2, dx: -2, tw: 0, ff: [26, 0], bf: [-28, 0], fh: [22, 14], bh: [10, 20] }),
  win: mk({ tor: -2, head: -14, hy: 74, tw: 10, fh: [6, -54], bh: [10, -4], ff: [22, 0], bf: [-26, 0] }),
  /* 2.10 被咏春拳黏住（搭手里被黏住的那一方，不管是哪一派）：打过来的那只手 / 那条腿还伸着、被搭住了，身子往前倾着收不回来
     stuckL 前手被黏住、stuckR 后手被黏住、stuckK 腿被搭住（单脚站着） */
  stuckL: mk({ tor: 12, head: 2, dx: 4, hy: 69, tw: 34, fh: [44, -4], bh: [12, -8], ff: [30, 0], bf: [-32, 0] }),
  stuckR: mk({ tor: 14, head: 2, dx: 6, hy: 68, tw: -26, bh: [46, -4], fh: [18, -10], ff: [32, 0], bf: [-32, 0] }),
  stuckK: mk({ tor: -10, head: 6, dx: 6, hy: 74, tw: 12, ff: [60, 34], ft: 10, bf: [-24, 0], fh: [22, -14], bh: [8, -8] }),
  // 甩手：把被黏住的手一甩、往后撤半步
  shake: mk({ tor: -8, head: -6, dx: -10, hy: 71, tw: -10, fh: [18, -20], fe: -1, bh: [4, -8], ff: [26, 0], bf: [-36, 0] }),
  // 被拉手跪马拽倒：手被人扣住往前下方拽，整个人往前扑（整个人转多少 rot 按拽的进度算，见 wingchun.js）
  dragged: mk({ tor: 20, head: 14, dx: 4, hy: 64, tw: 24, fh: [50, 10], bh: [14, 22], ff: [20, 0], bf: [-30, 4] }),
  draggedLow: mk({ tor: 12, head: 10, dx: 2, hy: 80, tw: 10, fh: [44, -18], fe: -1, bh: [30, -16], be: -1, ff: [4, 0], bf: [-8, 2] }),   // 快扑到地上了：腿伸直、两手往前伸
  // 趴着（被拽倒、脸朝下）：整个人往前转 90°，两手撑在头前面的地上
  lieProne: mk({ rot: 90, tor: 2, head: 10, hy: 83.5, air: 0, tw: 0, ff: [-6, -2], bf: [-8, 2], fh: [14, -40], bh: [22, -38], fe: -1, be: -1 }),
};
/* 被回身肘打在背上（2.0.2）：背对着出肘的人往前踉跄 —— u 是踉跄的进度（0 ~ 1）。
   先是背上挨了一下：胸口往前一挺、头往后一仰、两手往后甩；接着往前扑、一脚往前跨出去接住身子、两手往前乱抓；最后慢慢站稳 */
const STAGGER_KEYS = [
  [0, mk({ tor: -16, head: -22, dx: 10, hy: 72, tw: 0, fh: [-18, -8], bh: [-28, 2], ff: [26, 0], bf: [-28, 0] }), 'io'],
  [0.14, mk({ tor: -10, head: -16, dx: 13, hy: 71, tw: 0, fh: [-22, -4], bh: [-30, 6], ff: [30, 8], bf: [-26, 0] }), 'out'],
  [0.38, mk({ tor: 38, head: 18, dx: 16, hy: 60, tw: 0, fh: [34, 22], bh: [18, 30], ff: [48, 14], bf: [-32, 0] }), 'io'],
  [0.6, mk({ tor: 34, head: 12, dx: 12, hy: 62, tw: 0, fh: [30, 16], bh: [-16, -14], ff: [42, 0], bf: [-14, 8] }), 'io'],
  [0.82, mk({ tor: 16, head: 4, dx: 4, hy: 68, tw: 10, fh: [26, 4], bh: [10, 6], ff: [32, 0], bf: [-24, 0] }), 'io'],
  [1, POSE.stance, 'io'],
];
// 2.10 趴着起身（被拉手跪马拽倒的）：两手一撑、跪起来 → 蹲着 → 起身硬直
const PRONE_GETUP_KEYS = [
  [0, POSE.lieProne, 'io'],
  [GETUP * 0.42, mk({ rot: 48, tor: 30, hy: 36, head: 6, tw: 0, ff: [8, 0], bf: [-30, 0], fh: [30, 30], bh: [24, 32] }), 'io'],
  [GETUP * 0.8, mk({ hy: 44, tor: 30, head: -6, tw: 0, ff: [28, 0], bf: [-28, 0], fh: [24, 14], bh: [10, 20] }), 'io'],
  [GETUP, POSE.rise, 'io'],
];
// 起身（2.0：20 帧 → GETUP 13 帧左右）：躺着 → 撑起来坐着 → 蹲着；接着起身硬直（RISE）从蹲着站起来（fighter.js target 'rise'）
const GETUP_KEYS = [
  [0, POSE.lie, 'io'],
  [GETUP * 0.4, mk({ rot: -38, tor: 34, hy: 34, head: 0, tw: 0, ff: [34, 0], bf: [2, 0], fh: [-12, 32], bh: [-22, 36] }), 'io'],
  [GETUP * 0.78, mk({ hy: 42, tor: 30, head: -8, tw: 0, ff: [30, 0], bf: [-28, 0], fh: [24, 14], bh: [10, 20] }), 'io'],
  [GETUP, POSE.rise, 'io'],
];


/* ============================================================
   IK：两节骨骼，hint 决定关节朝哪边弯
   返回 [关节x, 关节y, 末端x, 末端y, 提示要的那一边（+1 = 第一个解，-1 = 第二个解）]。
   2.1 side（可选，-1~1）：不按提示硬挑，照 side 放 —— ±1 就是那个解，中间 = 两个解之间按比例（胳膊在前后方向转过去，
   画面上肘从这边经过「对着镜头」移到那边）。fighter.js fk() 用它让肘、膝换边时分几帧过去，不一帧翻过去
   ============================================================ */
function ik(px, py, tx, ty, a, b, hx, hy, side) {
  const dx = tx - px, dy = ty - py;
  const d0 = Math.hypot(dx, dy) || 1e-3;
  const d = clamp(d0, Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const ux = dx / d0, uy = dy / d0;
  const A = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const c = Math.cos(A), s = Math.sin(A);
  const j1x = px + (ux * c - uy * s) * a, j1y = py + (ux * s + uy * c) * a;
  const j2x = px + (ux * c + uy * s) * a, j2y = py + (-ux * s + uy * c) * a;
  const s1 = (j1x - px) * hx + (j1y - py) * hy, s2 = (j2x - px) * hx + (j2y - py) * hy;
  const want = s1 >= s2 ? 1 : -1, ex = px + ux * d, ey = py + uy * d;
  if (side === undefined) return want > 0 ? [j1x, j1y, ex, ey, want] : [j2x, j2y, ex, ey, want];
  const w = (side + 1) / 2;
  return [j2x + (j1x - j2x) * w, j2y + (j1y - j2y) * w, ex, ey, want];
}
