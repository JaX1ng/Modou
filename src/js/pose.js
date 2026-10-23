'use strict';
/* 姿势系统：关键帧插值 + 两节骨骼 IK。改动作手感看 moves.js 的关键帧，这里一般不用动 */

/* ============================================================
   姿势：所有角度单位为度；手脚用 IK 目标点
   fh/bh: 前手/后手 相对肩膀 [x,y]
   ff/bf: 前脚/后脚 [相对髋 x, 离地高度]
   ============================================================ */
// 出招时的底子（招式关键帧没写的部分都从这里来）：身子直、略往后仰；两脚前后分开、膝盖微屈（1.9.3 从 hy 48 抬到 56，
// 后脚收近一点，不再蹲得那么低）；前手拳护在下巴前，后手拳收在胸口，两肘往下沉
const BASE = { rot: 0, spin: 0, tor: -3, head: 5, hy: 56, dx: 0, air: 0, fe: 1, be: 1,
  fh: [28, -7], bh: [14, 9], ff: [30, 0], bf: [-26, 0] };
const NUMK = ['rot', 'spin', 'tor', 'head', 'hy', 'dx', 'air', 'fe', 'be'];
const ARRK = ['fh', 'bh', 'ff', 'bf'];
function mk(o) {
  const p = Object.assign({}, BASE, o || {});
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
// 2.1（Jack 给了参考图：后腿别张那么开，手臂也别张那么开）：两条腿并在一起 —— 膝盖往前上提、小腿往后下收，脚在屁股底下
// （以前后腿往后蹬直、像跨栏）；两只手顺着身子往下垂、稍微张开一点：前手肘往后弯、拳头在腰前，后手往后下垂、肘往后（以前两臂往前后张开、像展翅）。
// 上身略往前倾，头跟着往前。上升时前膝提得高一点，下落时两腿往下伸、准备落地
const P_JUP = { hy: 48, tor: 10, head: -4, ff: [11, 16], bf: [-3, 6], fh: [12, 41], bh: [-18, 38], fe: 1, be: -1 };
const P_JTOP = { hy: 48, tor: 15, head: -1, ff: [6, 10], bf: [1, 8], fh: [14, 40], bh: [-20, 37], fe: 1, be: -1 };
const P_JDN = { hy: 48, tor: 8, head: -2, ff: [10, 4], bf: [-4, 2], fh: [16, 39], bh: [-20, 37], fe: 1, be: -1 };
// 跑着起跳：飞身 —— 身子更往前倾、前膝提得更高往前送，后腿也收着（只比前腿靠后一点，不再往后蹬直）；手还是往下垂
const P_JLEAP = { hy: 48, tor: 22, head: -6, ff: [13, 15], bf: [-8, 8], fh: [16, 38], bh: [-21, 36], fe: 1, be: -1 };
const P_JLEAP_DN = { hy: 48, tor: 12, head: -4, ff: [12, 6], bf: [-7, 4], fh: [17, 38], bh: [-20, 36], fe: 1, be: -1 };   // 飞身往下落：两腿往下伸着找地
const POSE = {
  // 待机站姿（1.9.4，Jack：前腿别往前伸那么多，两腿岔开站就行，后腿别弯）：两腿各往外斜一点，站成一个「人」字，
  // 两条腿都差不多直（膝盖只弯一点点），两脚一共岔开 30（以前前脚 +30、后脚 -10，前腿直直地往前戳）。
  // 两条腿一样长：要是后腿完全竖直伸直，前脚往前就够不着地，所以两条腿一起往外斜。
  // 2.0.2（Jack：两只拳头别都在头边上）：前手拳护在胸口上面、靠近脖子；后手拳垂在腰下面一点、身子前面
  // 2.1（Jack：合人体一点）：后手拳从腰下面提到腰带上面一点（护着肚子）；前手小臂往前放下来一点（拳头往前、稍低）
  stance: mk({ hy: 66.7, ff: [15, 0], bf: [-15, 0], fh: [24, 6], bh: [12, 24] }),
  run: mk({ tor: 26, head: -16, hy: 54, fe: 0.2, be: 0.2 }),   // 跑步只用到这几个，手脚每帧现算（fighter.js runPose）
  crouch: mk({ hy: 38, tor: 26, head: -12, ff: [32, 0], bf: [-30, 0], fh: [26, 2], bh: [14, 12] }),
  block: mk({ hy: 56, tor: 0, head: 10, dx: -4, fh: [12, -30], bh: [18, -10], ff: [24, 0], bf: [-30, 0] }),
  cblock: mk({ hy: 38, tor: 14, head: 8, ff: [30, 0], bf: [-30, 0], fh: [14, -26], bh: [20, -10] }),
  squat: mk({ hy: 44, tor: 24, head: -8, ff: [26, 0], bf: [-26, 0], fh: [26, 0], bh: [-10, 4] }),
  land: mk({ hy: 42, tor: 26, head: -6, ff: [32, 0], bf: [-30, 0], fh: [36, -6], bh: [-18, -2] }),
  jup: mk(P_JUP), jtop: mk(P_JTOP), jdn: mk(P_JDN), leap: mk(P_JLEAP), leapDn: mk(P_JLEAP_DN),
  // 被过肩摔扛起来：被拽着一只手、身子缩着、腿乱蹬（整个人的转角 rot 由 fighter.js 按摔的进度算）
  thrown: mk({ tor: 14, head: 18, hy: 46, fh: [28, -44], bh: [-6, -40], ff: [30, 30], bf: [-14, 18] }),
  tuck: mk({ hy: 48, tor: 40, head: 16, ff: [8, 52], bf: [-2, 46], fh: [20, 14], bh: [12, 18] }),
  hurtL: mk({ tor: -22, head: -30, dx: -10, hy: 58, fh: [4, 0], bh: [-12, 6], ff: [30, 0], bf: [-30, 0] }),
  hurtH: mk({ tor: 38, head: 32, dx: -16, hy: 48, fh: [24, 24], bh: [12, 30], ff: [20, 0], bf: [-36, 0] }),
  hurtAir: mk({ rot: -30, tor: -14, head: -26, fh: [-10, -30], bh: [-24, -16], ff: [30, 26], bf: [2, 12] }),
  pulled: mk({ tor: 30, head: 18, dx: 8, hy: 56, fh: [20, 16], bh: [8, 20], ff: [34, 0], bf: [-14, 0] }),
  reel: mk({ tor: -34, head: -34, dx: -14, hy: 60, fh: [-18, -34], bh: [-32, -22], ff: [36, 4], bf: [-24, 0] }),   // 失衡：被卸力/推开
  recoil: mk({ tor: -18, head: -20, dx: -12, hy: 56, fh: [34, -30], bh: [20, -26], ff: [30, 0], bf: [-36, 0] }), // 拼招震退
  parry: mk({ tor: -6, head: 8, dx: -6, hy: 56, fh: [46, -34], fe: -1, bh: [12, -18], ff: [24, 0], bf: [-32, 0] }),
  fall: mk({ rot: -60, tor: -16, head: -24, ff: [38, 34], bf: [14, 26], fh: [-14, -34], bh: [-26, -24] }),
  /* 躺着（2.0，Jack：身子和腿要躺在地上，头也在地上、发带平铺在地上，两手平放在身体两边，看着合人体）：
     整个人转 -90°（rot）就是仰面平躺：身体坐标里「往下」= 地上往脚那边，「往前」= 往上。
     所以脚的目标点 [0, x] 在身体坐标里正下方 = 平平放在地上；膝盖往「前」弯 = 往上拱一点（腿稍微弯着）。
     上身抬 4°、头再仰 10°：后脑勺正好垫在地上，身子那条线贴着地（只往地里穿两三像素，不会因为头圆、整个人被垫高一截）。
     两只手从肩膀顺着身子往脚那边伸直，放在身体两边（侧面看就叠在身子上）。lie 一条腿稍微弯；lieFlat 两腿伸直 —— 每次倒地换着来 */
  lie: mk({ rot: -90, tor: 4, head: 10, hy: 64, air: 0, ff: [0, 0], bf: [0, -4], fh: [-3, 48.4], bh: [-2, 47.8], fe: 1, be: 1 }),
  lieFlat: mk({ rot: -90, tor: 4, head: 10, hy: 64, air: 0, ff: [0, -5], bf: [-1, -4], fh: [-3, 48.4], bh: [-2, 47.8], fe: 1, be: 1 }),
  // 起身硬直（2.0）：从蹲着站起来、两手还垂在下面没护住 —— 一看就知道「现在打得着他」
  rise: mk({ hy: 48, tor: 18, head: -2, dx: -2, ff: [24, 0], bf: [-26, 0], fh: [22, 12], bh: [10, 18] }),
  win: mk({ tor: -2, head: -16, fh: [6, -56], bh: [18, -6], ff: [22, 0], bf: [-24, 0] }),
};
/* 被回身肘打在背上（2.0.2）：背对着出肘的人往前踉跄 —— u 是踉跄的进度（0 ~ 1）。
   先是背上挨了一下：胸口往前一挺、头往后一仰、两手往后甩；接着往前扑、一脚往前跨出去接住身子、两手往前乱抓；最后慢慢站稳 */
const STAGGER_KEYS = [
  [0, mk({ tor: -16, head: -22, dx: 10, hy: 58, fh: [-18, -8], bh: [-28, 2], ff: [26, 0], bf: [-26, 0] }), 'io'],
  [0.14, mk({ tor: -10, head: -16, dx: 13, hy: 57, fh: [-22, -4], bh: [-30, 6], ff: [30, 8], bf: [-24, 0] }), 'out'],
  [0.38, mk({ tor: 38, head: 18, dx: 16, hy: 50, fh: [34, 22], bh: [18, 30], ff: [46, 14], bf: [-30, 0] }), 'io'],
  [0.6, mk({ tor: 34, head: 12, dx: 12, hy: 52, fh: [30, 16], bh: [-16, -14], ff: [40, 0], bf: [-12, 8] }), 'io'],
  [0.82, mk({ tor: 16, head: 4, dx: 4, hy: 56, fh: [26, 4], bh: [10, 12], ff: [32, 0], bf: [-22, 0] }), 'io'],
  [1, POSE.stance, 'io'],
];
// 起身（2.0：20 帧 → GETUP 13 帧左右）：躺着 → 撑起来坐着 → 蹲着；接着起身硬直（RISE）从蹲着站起来（fighter.js target 'rise'）
const GETUP_KEYS = [
  [0, POSE.lie, 'io'],
  [GETUP * 0.4, mk({ rot: -38, tor: 34, hy: 30, head: 0, ff: [32, 0], bf: [2, 0], fh: [-12, 32], bh: [-22, 36] }), 'io'],
  [GETUP * 0.78, mk({ hy: 36, tor: 30, head: -8, ff: [30, 0], bf: [-26, 0], fh: [24, 14], bh: [10, 20] }), 'io'],
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
