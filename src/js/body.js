'use strict';
/* ============================================================
   人物模型（2.5 重做，Jack：照参考图第二张 —— 比例、线条、身高、阴影都照它；要一个连贯的、整体的人，不能看出是一块块拼起来的）
   想调人物「长什么样」只改这个文件最上面的 BODY 表；动作（姿势、招式）在 pose.js / moves.js。
   调完打开 poses.html（动作台）看效果，「模型」页的滑块调好了能直接复制出数值贴回来。

   · 骨架（看不见，只用来算）：髋 → 脊柱 → 脖子根 → 脖子 → 头；两个肩关节（拧腰 tw 时前后错开）；两个大腿根；
     肘、膝用两节 IK（fighter.js fk()），膝盖还能往侧面（z，离镜头近 / 远）摆出去（姿势的 fo / bo）
   · 外形：每一节（大臂、小臂、大腿、小腿、脖子）沿着骨头按「轮廓表」长出一圈外形。关节在哪，靠肢体本身粗细的变化看出来
     （大腿粗、到膝盖收细、小腿肚鼓、脚踝收；大臂到肘收细），弯起来自然看得出 —— 关节上不画线、不打阴影
   · 画法：整个人先整块填一遍本色（一整块，关节没有缝、不叠色）；再按前后一层一层画：远侧手 → 远侧腿 → 躯干 → 近侧腿 → 腰带 → 头 → 近侧手。
     每一层是一整条胳膊（大臂 + 小臂 + 拳）/ 一整条腿（大腿 + 小腿 + 鞋）合在一起，亮边顺着整条胳膊、整条腿走，不在关节断开
   · 阴影（参考图那种，少、淡、只在侧面）：和本色只差一点点的一道细亮边 —— 躯干前后两侧；腿在外侧（前腿在前沿、后腿在后沿）；
     胳膊、拳、鞋在上沿。画法是「错位填色」：一层先涂亮色，再把同一层往里挪一点涂回本色，剩下的那一道就是亮边
   · 前后：远侧的手脚和身子一个颜色（不换色调）；近侧的胳膊、腿叠在身子上的那一段，外沿描一道同样淡的亮线
     （参考图里护着下巴那只手就是这样），前后分得开，关节里面不出线
   · 参考图的习惯：护在下巴前面的后手、往前伸的前腿在近侧（离镜头近）；前手、后腿在远侧。转过身（spin 过了 90°）两边对调
   ============================================================ */
const BODY = {
  // 骨头长度（逻辑像素）。头是半径。肩 = 肩关节在脊柱上离髋多远（比脖子根低一点）。骨头长短一改，所有姿势都跟着变，轻易别动
  // 2.5.1（Jack：大腿短一点、小腿长一点；鞋小了、薄了，人照样高 —— 高在别处一点点）：大腿 39 → 38、小腿 37 → 39、脚踝离鞋底 4.8 → 4。
  //     髋高是姿势定的（hy），鞋底薄下来的那 0.8 落到了腿上：人一样高，腿长了一点、鞋矮了一截
  // 2.7（Jack：脚再薄一点点，薄下来的那部分变成小腿长度）：鞋底（脚踝离鞋底）4 → 3.3、小腿 39 → 39.7 —— 髋到鞋底一样长，人一样高；
  //     鞋口也矮 0.3（鞋高 9.4 → 8.4），露出来的小腿一共长了 1
  bone: { torso: 46.5, shoulder: 41, neck: 5.5, head: 12, ua: 25, fa: 23, th: 38, sh: 39.7, ankle: 3.3 },
  shoulderW: 11.5,   // 肩宽的一半：拧腰（tw）时两个肩膀前后错开 ±shoulderW·sin(tw)；转身（spin）时左右分开
  hipW: 5.5,         // 两个大腿根离中线多远（转身、膝盖往侧面摆时用）
  hipSplit: 2.2,     // 侧面看两个大腿根前后错开一点（前腿根靠前），两条腿分得开
  wrist: 3.4,        // 小臂画到拳心往回这么多（这一截藏在拳头里）
  // 2.5 拳头改小（Jack）：13.2 × 11.6 → 10.4 × 9.4，圆一点
  fist: { len: 10.4, h: 9.4, r: 4.3 },               // 拳头：顺着小臂方向的长、横着的高、圆角
  // 鞋（参考图那种圆头鞋）：脚跟在脚踝后面多远、脚尖在前面多远、鞋口多高（盖住脚踝）、多宽（脚尖朝镜头时看到的）、鞋头多高。
  // 2.5.1（Jack：脚有点大和厚）：24.8 × 11.6 → 21.4 × 9.4，鞋头也矮一点（8.8 → 7.2）
  // 2.7（Jack：再薄一点点）：鞋高 9.4 → 8.4、鞋头 7.2 → 6.4（长短不变）；薄下来的给了小腿（见上面 bone）
  foot: { heel: 6.2, toe: 15.2, h: 8.4, w: 8.4, toeH: 6.4 },
  // 轮廓表：[沿着这一节骨头的位置 0（根）~1（梢）, 前侧半宽, 后侧半宽]。「前侧」：
  //   大臂 = 胳膊弯起来小臂折过去的那一侧；小臂 = 掌心那一侧；大腿 = 膝盖顶出去那一侧；小腿 = 小腿骨那一侧（后侧是小腿肚）
  // 2.5 照参考图：胳膊细、上下差不多粗（没有鼓出来的三角肌）；腿是顺滑的一条，膝盖收一点、小腿肚鼓一点，脚踝也不细
  ua: [[0, 5.3, 5.5], [0.3, 4.9, 4.9], [0.7, 4.4, 4.3], [1, 4.1, 4.0]],
  fa: [[0, 4.1, 4.0], [0.3, 4.3, 4.1], [0.75, 3.8, 3.5], [1, 3.5, 3.3]],
  // 2.5.1 腿上有一点点肌肉（Jack：有一点肌肉感就行，别太多）：大腿前面（股四头肌）中段微微鼓着、到膝盖上面才收进去，后面（腘绳肌）往下顺着收；
  //     小腿肚鼓在上面三分之一、往下收到跟腱，脚踝比 2.5 细一点；小腿骨那一侧直一点。膝盖上下一样粗（接得上）
  th: [[0, 7.5, 7.9], [0.25, 7.6, 7.8], [0.52, 7.5, 7.1], [0.78, 6.5, 6.0], [0.93, 5.8, 5.5], [1, 5.9, 5.5]],
  sh: [[0, 5.8, 5.6], [0.12, 5.6, 6.5], [0.28, 5.4, 7.1], [0.5, 5.1, 6.2], [0.72, 4.6, 4.9], [0.88, 4.4, 4.4], [1, 4.5, 4.6]],
  neck: [[0, 5.6, 6.0], [0.6, 4.9, 5.1], [1, 4.9, 5.1]],
  // 躯干：[沿脊柱的位置（0 = 髋关节，1 = 脖子根；负的在髋下面）, 胸腹那侧半宽, 后背那侧半宽, 正面对着镜头时的半宽]
  // 2.5 照参考图瘦下来：侧着看是一根稍微有点弧度的柱子 —— 胸口微微挺、腰收一点，不再是大胸肌、大屁股；正面看肩比胯宽。
  // 2.5.1 躯干只到髋（以前往下圆出一个屁股，和两条大腿根合起来像两瓣屁股）：腰带底下那一截是「裆」（seat，见 seatShape）
  torso: [[-0.04, 8.8, 9.4, 12.6], [0.06, 8.8, 9.6, 12.4], [0.2, 8.2, 8.4, 11.4], [0.34, 8.4, 8.4, 11.6],
    [0.52, 9.6, 9.0, 13.4], [0.68, 10.8, 10.0, 15.6], [0.82, 10.8, 11.0, 17.0], [0.91, 9.8, 10.6, 15.4], [0.97, 7.6, 8.6, 10.8], [1, 5.6, 6.0, 7.0]],
  // 2.5.1 裆（腰带底下、两条大腿根那一块，像穿着裤子）：躯干下半截 + 两个大腿根（圆的）+ 两条大腿往下 reach 这么长，合起来取外包（一整块，没有缝、没有凹进去的一道）
  seat: { reach: 9 },
  belt: { at: 0.11, h: 6 },                    // 腰带：在脊柱上的位置（参考图那样系得低，在胯上）、宽
  // 阴影：亮边的颜色（往纸色混多少 —— 参考图里亮边只比本色亮一点点）、躯干 / 腿 / 鞋的亮边多宽、胳膊和拳的亮边多宽、
  // 近侧手脚叠在身上那道亮线多宽、亮边往上偏多少（侧面的亮边顺带一点上沿）
  // 2.10.1 远侧那条胳膊整条淡一点点（far：往纸色混多少 —— 墨色的人暗不下去，所以是「远的淡」，水墨画远处就是淡的）、
  // 肘关节和肩膀那一小块再淡一点点（farJoint）—— 两条胳膊交叉的时候看得出哪条在里哪条在外
  // （Jack：用稍微一点点的阴影表示左右，在肘关节、手臂和肩膀那一点点位置，不要太多阴影）；farR 肘上那一块多大、farRs 肩上那一块多大
  shade: { tone: 0.11, rim: 1.3, rimArm: 1.05, line: 1.3, up: 0.3, far: 0.07, farJoint: 0.12, farR: 5.2, farRs: 5.6 },
};
// 以前的名字（别的文件、测试还在用）：头半径、大臂、小臂、大腿、小腿、躯干、脖子
const BONE = { torso: BODY.bone.torso, neck: BODY.bone.neck, head: BODY.bone.head, ua: BODY.bone.ua, fa: BODY.bone.fa, th: BODY.bone.th, sh: BODY.bone.sh };

/* ---------- 颜色：本色 + 一道淡淡的亮色（亮边、近侧手脚的描线都是它） ---------- */
const bodyRgb = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const bodyMix = (a, b, k) => { const A = bodyRgb(a), B = bodyRgb(b); return '#' + A.map((v, i) => clamp(Math.round(v + (B[i] - v) * k), 0, 255).toString(16).padStart(2, '0')).join(''); };
const BODY_TONES = {};
function bodyTones(col) {
  if (BODY_TONES[col]) return BODY_TONES[col];
  return (BODY_TONES[col] = { base: col, hl: bodyMix(col, C.paper, BODY.shade.tone), far: bodyMix(col, C.paper, BODY.shade.far), farJ: bodyMix(col, C.paper, BODY.shade.farJoint) });
}

/* ---------- 外形 ---------- */
function bodyCmr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}
// 轮廓表在 t 处的值（第 k 列），控制点之间用平滑曲线连
function profAt(P, t, k) {
  if (t <= P[0][0]) return P[0][k];
  for (let i = 1; i < P.length; i++) {
    if (t <= P[i][0]) {
      const a = P[Math.max(0, i - 2)], b = P[i - 1], c = P[i], d = P[Math.min(P.length - 1, i + 1)];
      return bodyCmr(a[k], b[k], c[k], d[k], (t - b[0]) / (c[0] - b[0]));
    }
  }
  return P[P.length - 1][k];
}
/* 一节肢体（A → B）的外形：一圈点。as = 前侧在哪边（+1：法线 n = (-uy, ux) 那边是前侧；-1 反过来；中间两边按比例混，
   肢体伸直、看不出弯向时就是两边的平均）。g = 整圈往外胖多少（负的 = 往里收；运气的光、描线用）。
   ext（大腿用）：根头不画圆头，两条边顺着骨头再往回直直地伸 ext 那么长（伸进胯里、藏在腰带底下）——
   大腿是从胯里长出来的，根上没有一个圆圆的「接头」。返回 { pts, n, u, L } */
function limbShape(A, B, prof, as, g, ext) {
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1e-3, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const wa = (clamp(as, -1, 1) + 1) / 2, N = 8, left = [], right = [];
  let wl0 = 0, wr0 = 0, wl1 = 0, wr1 = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N, f = profAt(prof, t, 1), b = profAt(prof, t, 2);
    const wl = Math.max(0.6, b + (f - b) * wa + g), wr = Math.max(0.6, f + (b - f) * wa + g);
    const cx = A[0] + dx * t, cy = A[1] + dy * t;
    left.push([cx + nx * wl, cy + ny * wl]); right.push([cx - nx * wr, cy - ny * wr]);
    if (i === 0) { wl0 = wl; wr0 = wr; } if (i === N) { wl1 = wl; wr1 = wr; }
  }
  const pts = left.slice(), an = Math.atan2(ny, nx);
  const cap = (cx, cy, r, a0, a1) => { for (let i = 1; i < 10; i++) { const a = a0 + (a1 - a0) * i / 10; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  // 梢头：从左边绕到右边（经过 +u）；根头：从右边绕回左边（经过 -u）
  cap(B[0] + nx * (wl1 - wr1) / 2, B[1] + ny * (wl1 - wr1) / 2, (wl1 + wr1) / 2, an, an - Math.PI);
  for (let i = N; i >= 0; i--) pts.push(right[i]);
  if (ext > 0) {
    // 两条边先直直地伸到快到头（磨圆的时候边还是直的），再收一个平头
    const e = ext + g, e1 = Math.max(0, e - 1.5);
    pts.push([A[0] - ux * e1 - nx * wr0, A[1] - uy * e1 - ny * wr0], [A[0] - ux * e - nx * wr0, A[1] - uy * e - ny * wr0]);
    pts.push([A[0] - ux * e + nx * wl0, A[1] - uy * e + ny * wl0], [A[0] - ux * e1 + nx * wl0, A[1] - uy * e1 + ny * wl0]);
  } else cap(A[0] + nx * (wl0 - wr0) / 2, A[1] + ny * (wl0 - wr0) / 2, (wl0 + wr0) / 2, an + Math.PI, an);
  return { pts, nx, ny, ux, uy, L, wa };
}
// 拳头：顺着小臂方向的圆角方块（中心 H，方向 u），g = 整圈往外胖多少
function fistShape(H, ux, uy, g) {
  const Fi = BODY.fist, hl = Math.max(1, Fi.len / 2 + g), hh = Math.max(1, Fi.h / 2 + g), r = clamp(Fi.r + g, 0.5, hh - 0.2), nx = -uy, ny = ux, pts = [];
  for (const [sx, sy, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]]) {
    const cx = sx * (hl - r), cy = sy * (hh - r);
    for (let i = 0; i <= 4; i++) {
      const a = a0 + Math.PI / 2 * i / 4, lx = cx + Math.cos(a) * r, ly = cy + Math.sin(a) * r;
      pts.push([H[0] + ux * lx + nx * ly, H[1] + uy * lx + ny * ly]);
    }
  }
  return pts;
}
/* 2.9 掌（Jack：咏春有掌 —— 单独做一个五指并拢的掌）：H 是掌根（小臂接到这里），(dx, dy) 手指朝哪，s = 大拇指在哪一边（±1），g 胖瘦。
   侧面看是一片：掌根圆、掌心略宽、四指并拢往指尖收、指尖圆；大拇指贴在掌边上、往指尖那边斜出去一小截（看得出是一只张开的手，不是一根棍） */
const PALM = { len: 15.5, heel: 2.8, w: 3.15, tip: 2.6, thumb: 5.2 };
const PALM_PTS = (() => {
  const P = PALM, pts = [];
  // 一边（v > 0）：掌根 → 掌心 → 指根 → 指尖；指尖绕半圈；另一边回到掌根；掌根绕半圈
  const side = [[0, P.heel], [3.5, P.w], [8, P.w * 0.98], [11.5, P.w * 0.9], [P.len - P.tip, P.tip]];
  for (const q of side) pts.push(q);
  for (let i = 1; i < 6; i++) { const a = Math.PI / 2 - Math.PI * i / 6; pts.push([P.len - P.tip + Math.cos(a) * P.tip, Math.sin(a) * P.tip]); }
  for (let i = side.length - 1; i >= 0; i--) pts.push([side[i][0], -side[i][1]]);
  for (let i = 1; i < 6; i++) { const a = -Math.PI / 2 - Math.PI * i / 6; pts.push([Math.cos(a) * P.heel, Math.sin(a) * P.heel]); }
  return pts;
})();
// 大拇指（v > 0 那一边）：从掌根往上、贴着掌边斜出去
const THUMB_PTS = [[1.2, 2.2], [4.2, 3.6], [6.8, 4.9], [7.9, 5.0], [8.1, 4.0], [6.6, 2.6], [3.6, 1.2]];
// 2.10 r：掌心朝哪（pose.js fpr / bpr）—— 1 朝里（看见整个掌面，大拇指贴在 s 那一边）…… 0 侧着（看见掌边：掌窄、大拇指藏在后面）
function palmShape(H, dx, dy, s, g, r) {
  const a = Math.min(1, Math.abs(r === undefined ? 1 : r)), ws = 0.6 + 0.4 * a;
  const nx = -dy * s, ny = dx * s, k = 1 + g / 3.2;
  const P = (q, w) => [H[0] + dx * (q[0] * (1 + g / PALM.len) - g * 0.4) + nx * q[1] * k * w, H[1] + dy * (q[0] * (1 + g / PALM.len) - g * 0.4) + ny * q[1] * k * w];
  return { palm: PALM_PTS.map(q => P(q, ws)), thumb: a < 0.3 ? null : THUMB_PTS.map(q => P(q, ws * (0.82 + 0.18 * a))) };
}
// 鞋：脚踝 K 是原点，x 往脚尖、y 往鞋底。参考图那种圆头鞋：脚跟圆、鞋口盖住脚踝、鞋面往脚尖斜下去、鞋头圆（2.5.1 小了、薄了，鞋头矮一点）
const FOOT_PTS = (() => {
  const Fo = BODY.foot, a = BODY.bone.ankle, top = a - Fo.h, H = Fo.heel, T = Fo.toe, th = Fo.toeH;
  return [[-H + 2.4, top], [-H + 0.5, top + 2.3], [-H, a - 4], [-H + 0.3, a - 1.4], [-H + 1.8, a + 0.1], [0, a + 0.35], [T - 5.4, a + 0.35],
    [T - 1.8, a - 0.1], [T - 0.2, a - 1.7], [T, a - th * 0.5], [T - 1.1, a - th * 0.75], [T - 4, a - th * 0.92], [T - 8.4, a - th], [4, top + 0.8], [0.4, top - 0.35]];
})();
// 每个点往外的方向（两边的边法线平均），胖瘦（g）按这个挪 —— 整圈一样厚地胖 / 收
const FOOT_NRM = (() => {
  const P = FOOT_PTS, n = P.length, s = signedArea(P) < 0 ? -1 : 1, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n];
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    let nx = (e1[1] / l1 + e2[1] / l2) * s, ny = -(e1[0] / l1 + e2[0] / l2) * s;
    const l = Math.hypot(nx, ny) || 1; out.push([nx / l, ny / l]);
  }
  return out;
})();
// K 脚踝，(dx, dy) 脚尖方向，(sx, sy) 朝鞋底的方向；k = 侧面看脚有多长（脚尖朝镜头 / 背着镜头时变短，最短是鞋宽那么长）
function footShape(K, dx, dy, sx, sy, g, k) {
  k = k === undefined ? 1 : k;
  return FOOT_PTS.map(([x, y], i) => { const [nx, ny] = FOOT_NRM[i], X = x * k + nx * g, Y = y + ny * g; return [K[0] + dx * X + sx * Y, K[1] + dy * X + sy * Y]; });
}
/* 躯干：沿脊柱（髋 → 脖子根）长出来。fx, fy = 身子朝前的方向（垂直于脊柱）；spin = 转身角（转到一半时是正面，宽）。
   返回外形一圈点 + 一个 at(t, w) 换算（脊柱上 t 处、往前 w 的那个点，腰带用）、half(t, k) 这里有多宽 */
function torsoShape(H, N, fx, fy, spin, g) {
  const dx = N[0] - H[0], dy = N[1] - H[1], P = BODY.torso, sl = Math.hypot(dx, dy) || 1;
  const ss = Math.abs(Math.sin(spin)), cs = Math.abs(Math.cos(spin));
  const half = (t, k) => Math.max(0.6, profAt(P, t, k) * cs + profAt(P, t, 3) * ss + g);     // k = 1 胸腹、2 后背
  const at = (t, w) => [H[0] + dx * t + fx * w, H[1] + dy * t + fy * w];
  const ts = [], t0 = P[0][0], eg = g / sl;                // eg：上下两头也跟着胖 / 收
  for (let i = 0; i <= 14; i++) ts.push(t0 + (1 - t0) * i / 14);
  const pts = [];
  for (const t of ts) pts.push(at(t, half(t, 1)));
  // 顶上（斜方肌 → 脖子根），往上拱一点
  pts.push(at(1.035 + eg, half(1, 1) * 0.35)); pts.push(at(1.045 + eg, -half(1, 2) * 0.3));
  for (let i = ts.length - 1; i >= 0; i--) pts.push(at(ts[i], -half(ts[i], 2)));
  // 底下：浅浅地圆过去（2.5.1 只到髋下面一点，整个藏在「裆」里面 —— 不再自己圆出一个屁股）
  const b = half(t0, 2), f = half(t0, 1), bottom = [at(t0 - 0.03 - eg, -b * 0.7), at(t0 - 0.05 - eg, -b * 0.2), at(t0 - 0.05 - eg, f * 0.3), at(t0 - 0.03 - eg, f * 0.75)];
  pts.push(...bottom);
  return { pts, at, half, bottom };
}
// 外包（凸包）：一圈点里最外面的那些，按顺序连起来
function convexHull(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
/* 2.5.1 裆（Jack：屁股还是像没穿裤子，有两瓣；腰带那儿还有点穿模）：
   以前躯干往下圆出一个屁股，两条大腿根再从下面伸进胯里 —— 腿一抬（跑、跳、蹲），屁股自己一个圆、腿根那截平头从腰带后面露出来。
   现在腰带底下这一块是一整块：躯干腰带以下那截 + 两个大腿根（圆的，半径 = 大腿根粗）+ 两条大腿往下 seat.reach 那一段，取外包。
   外包是凸的：后面从腰顺下来到大腿后沿是一条线（站着），腿抬起来是一个圆的裤裆（跑、蹲），中间不会凹进去一道「股沟」。
   tor = torsoShape 的结果；legs = [[大腿根, 膝盖, 脚踝], …]；g = 整圈往外胖多少 */
function seatShape(tor, legs, g) {
  const P = [], tb = BODY.belt.at - BODY.belt.h / 2 / BODY.bone.torso, rch = BODY.seat.reach;
  for (const t of [tb, tb * 0.5, 0]) P.push(tor.at(t, tor.half(t, 1)), tor.at(t, -tor.half(t, 2)));
  P.push(...tor.bottom);
  const r0 = Math.max(0.6, (BODY.th[0][1] + BODY.th[0][2]) / 2 + g);
  for (const [R, M, E] of legs) {
    let ux = M[0] - R[0], uy = M[1] - R[1], ul = Math.hypot(ux, uy);
    if (ul < 6) { ux = E[0] - R[0]; uy = E[1] - R[1]; ul = Math.hypot(ux, uy); }   // 膝盖冲着侧面（扫堂腿蹲着那条腿）：按整条腿的方向
    if (ul < 1e-3) { ux = 0; uy = 1; ul = 1; }
    ux /= ul; uy /= ul;
    const nx = -uy, ny = ux, L = BODY.bone.th, d1 = Math.min(rch, ul);
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; P.push([R[0] + Math.cos(a) * r0, R[1] + Math.sin(a) * r0]); }
    for (const d of [d1 * 0.5, d1]) {
      const w = Math.max(0.6, (profAt(BODY.th, d / L, 1) + profAt(BODY.th, d / L, 2)) / 2 + g);
      P.push([R[0] + ux * d + nx * w, R[1] + uy * d + ny * w], [R[0] + ux * d - nx * w, R[1] + uy * d - ny * w]);
    }
  }
  return convexHull(P);
}

/* ---------- 骨骼 → 一块一块 ----------
   J 是 fighter.js fk() 算出来的世界坐标骨骼。返回按画的先后排好的部件：{ k 名字, pts 外形, far 远侧, layer 哪一层 }
   （层：farArm / farLeg / torso / nearLeg / head / nearArm —— 画的时候一层是一整条胳膊、一整条腿合在一起画）
   only（可选，Set）：只要这几块（量碰没碰到时一帧要算好几回，只算用得着的）。块的名字：
   aFU / aFL / aFH 前手大臂 / 小臂 / 拳，aB* 后手；FU / FL / FF 前腿大腿 / 小腿 / 脚，B* 后腿；torso、neck、head */
function bodyParts(J, g, only) {
  g = g || 0;
  const need = k => !only || only.has(k);
  const B = BODY.bone, f = J.facing * (J.turned ? -1 : 1);
  // 脊柱、朝前
  const sx = J.neck[0] - J.hip[0], sy = J.neck[1] - J.hip[1], sl = Math.hypot(sx, sy) || 1;
  const fx = f * (-sy / sl), fy = f * (sx / sl);
  const parts = [];
  // 两节肢体：根 R、关节 M、梢 E；hint = 关节该往哪边顶（世界方向）；arm：是不是胳膊
  const limb = (key, R, M, E, hint, arm, far, layer) => {
    const nU = need(key + 'U'), nL = need(key + 'L'), nE = need(key + (arm ? 'H' : 'F'));
    if (!nU && !nL && !nE) return;
    // 「前侧」在哪边：胳膊 —— 小臂折向的那一侧（大臂）/ 朝大臂的那一侧（小臂）；腿 —— 膝盖顶出去的那一侧。伸直了看不出来，就按 hint 定
    const side = (A2, B2, toward, sign) => {
      const dx = B2[0] - A2[0], dy = B2[1] - A2[1], L = Math.hypot(dx, dy) || 1e-3, nx = -dy / L, ny = dx / L;
      const tx = toward[0] - B2[0], ty = toward[1] - B2[1], tl = Math.hypot(tx, ty) || 1e-3;
      const v = sign * (nx * tx + ny * ty) / tl / 0.14;
      const hs = (nx * hint[0] + ny * hint[1]) >= 0 ? 1 : -1;               // 关节往 hint 那边顶
      const h = arm ? -hs : hs;                                               // 胳膊：前侧在肘尖的反面；腿：前侧就是膝盖那一面
      return Math.abs(v) >= 1 ? Math.sign(v) : v + (1 - Math.abs(v)) * h;
    };
    const aUp = side(R, M, E, arm ? 1 : -1);       // 大臂：梢往小臂那边折 = 前侧；大腿：小腿往后收 = 后侧
    const aLo = side(M, E, R, arm ? 1 : -1);
    if (arm) {
      const ex = E[0] - M[0], ey = E[1] - M[1], el = Math.hypot(ex, ey) || 1e-3, ux = ex / el, uy = ey / el;
      // 2.9 掌：手的目标点是掌根，小臂一直接到掌根（拳头是拳心，小臂藏进拳头里一截）
      const palm = (key === 'aF' ? J.fpm : J.bpm) >= 0.5, pd = key === 'aF' ? J.fpd : J.bpd;
      const W = palm ? [E[0] - ux * 0.6, E[1] - uy * 0.6] : [E[0] - ux * BODY.wrist, E[1] - uy * BODY.wrist];
      if (nU) parts.push({ k: key + 'U', pts: limbShape(R, M, BODY.ua, aUp, g).pts, far, layer });
      if (nL) parts.push({ k: key + 'L', pts: limbShape(M, W, BODY.fa, aLo, g).pts, far, layer });
      if (nE && palm && pd) {
        // 手指方向：和小臂折得太狠（手腕弯过 100°）就压回 100°（手腕折不了那么多）
        let dx = pd[0], dy = pd[1];
        const c = clamp(dx * ux + dy * uy, -1, 1), MAXB = 100 * D2R;
        if (Math.acos(c) > MAXB) { const cr = ux * dy - uy * dx >= 0 ? 1 : -1, a = Math.atan2(uy, ux) + cr * MAXB; dx = Math.cos(a); dy = Math.sin(a); }
        // 2.10（Jack：手掌内翻一定要看得出来是往里翻的）：掌心朝里 = 大拇指在靠身子那一边（侧面看，不管手指朝哪都是 -f 那边：
        //     手指朝上 → 拇指在后，手指朝前 → 拇指在上，手指朝下 → 拇指在前）；朝外反过来。2.9 一律画在「前上方」，竖着的掌看着就是往外翻的
        const rr = key === 'aF' ? J.fpr : J.bpr, r = rr === undefined ? 1 : rr;
        const s0 = (r >= 0 ? -1 : 1) * f, sh = palmShape(E, dx, dy, s0, g, r);
        parts.push({ k: key + 'H', pts: sh.palm, far, layer, palm: true });
        if (sh.thumb) parts.push({ k: key + 'H', pts: sh.thumb, far, layer, palm: true, thumb: true });
      } else if (nE) parts.push({ k: key + 'H', pts: fistShape(E, ux, uy, g), far, layer, fist: true });
    } else {
      // 脚：站在地上（身子直着、脚踝贴近地面）脚底放平；离了地按小腿的方向（脚尖微微绷着）
      const kd = key === 'F' ? J.fkd : J.bkd, sg = f * (kd < 0 ? -1 : 1);
      const lx = E[0] - M[0], ly = E[1] - M[1], ll = Math.hypot(lx, ly) || 1e-3;
      const up2 = Math.cos(J.rot) > 0.7 ? 1 : 0, gr = up2 * clamp(1 - (FLOOR - B.ankle - E[1]) / 7, 0, 1);
      const pa = (90 - 22 * (1 - gr)) * D2R * -sg, ca = Math.cos(pa), sa = Math.sin(pa);
      let dx = (lx * ca - ly * sa) / ll, dy = (lx * sa + ly * ca) / ll;
      dx += (sg - dx) * gr; dy += (0 - dy) * gr;
      let dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const tilt = (key === 'F' ? J.fft : J.bft) || 0;        // 脚尖往上勾（度）
      if (tilt) { const a = -sg * tilt * D2R, c = Math.cos(a), s2 = Math.sin(a), x2 = dx * c - dy * s2; dy = dx * s2 + dy * c; dx = x2; }
      // 2.5 膝盖往侧面摆（fo / bo）：脚尖跟着膝盖朝侧面，侧面看脚就短了（最短是鞋宽）；转身时也一样（脚尖朝镜头 / 背着镜头）
      //     脚尖的方向：身体坐标里往前转 yaw、往这条腿自己那一侧（前腿 z+、后腿 z-）摆，再跟着身子转 spin，投到画面上剩多长
      const yaw = ((key === 'F' ? J.fyaw : J.byaw) || 0) * D2R, sp = J.spin || 0, zs = key === 'F' ? 1 : -1;
      const kk = Math.max(BODY.foot.w / (BODY.foot.heel + BODY.foot.toe), Math.abs(Math.cos(yaw) * Math.cos(sp) - zs * Math.sin(yaw) * Math.sin(sp)));
      // 2.5.1 大腿根是圆的（以前平头往胯里伸 9，腿一抬那截平头就从腰带后面露出来）—— 圆头整个藏在「裆」里面，看不出接头
      if (nU) parts.push({ k: key + 'U', pts: limbShape(R, M, BODY.th, aUp, g).pts, far, layer });
      if (nL) parts.push({ k: key + 'L', pts: limbShape(M, E, BODY.sh, aLo, g).pts, far, layer });
      if (nE) parts.push({ k: key + 'F', pts: footShape(E, dx, dy, -sg * dy, sg * dx, g, Math.min(1, kk)), far, layer, foot: true });
    }
  };
  const tor = need('torso') || need('neck') || need('seat') ? torsoShape(J.hip, J.neck, fx, fy, J.spin || 0, g) : null;
  const nk = need('neck') ? limbShape(J.neck, J.neckTop, BODY.neck, 1, g) : null;
  // 头：圆
  const hr = B.head + g, head = [];
  if (need('head')) for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; head.push([J.head[0] + Math.cos(a) * hr, J.head[1] + Math.sin(a) * hr]); }
  // 近侧 / 远侧：护着下巴的后手、往前的前腿在近侧；转过身两边对调
  const t = !!J.turned;
  const farArm = t ? ['B', J.shB, J.be, J.bh, J.hBe] : ['F', J.shF, J.fe, J.fh, J.hFe];
  const nearArm = t ? ['F', J.shF, J.fe, J.fh, J.hFe] : ['B', J.shB, J.be, J.bh, J.hBe];
  const farLeg = t ? ['F', J.hipF, J.fk, J.ff, J.hFk] : ['B', J.hipB, J.bk, J.bf, J.hBk];
  const nearLeg = t ? ['B', J.hipB, J.bk, J.bf, J.hBk] : ['F', J.hipF, J.fk, J.ff, J.hFk];
  limb('a' + farArm[0], farArm[1], farArm[2], farArm[3], farArm[4], true, true, 'farArm');
  limb(farLeg[0], farLeg[1], farLeg[2], farLeg[3], farLeg[4], false, true, 'farLeg');
  if (need('torso')) parts.push({ k: 'torso', pts: tor.pts, layer: 'torso' });
  if (nk) parts.push({ k: 'neck', pts: nk.pts, layer: 'torso' });
  // 2.5.1 裆：和躯干一层（盖住远侧那条腿的根），近侧那条腿的根画在它上面也看不出来（一样的颜色、圆头在里面）
  if (need('seat') && tor) parts.push({ k: 'seat', pts: seatShape(tor, [[J.hipF, J.fk, J.ff], [J.hipB, J.bk, J.bf]], g), layer: 'torso', seat: true });
  limb(nearLeg[0], nearLeg[1], nearLeg[2], nearLeg[3], nearLeg[4], false, false, 'nearLeg');
  if (head.length) parts.push({ k: 'head', pts: head, layer: 'head', head: true });
  limb('a' + nearArm[0], nearArm[1], nearArm[2], nearArm[3], nearArm[4], true, false, 'nearArm');
  return { parts, f, fx, fy, tor };
}

/* ---------- 碰没碰到（2.4：打中时拳脚要真的碰到对面身上 —— 动作台、测试都用这个量） ----------
   strikeParts(J, limb)：出招的那只拳 / 脚 / 肘 / 肩是哪几块（外形点）；bodyGap(点, 对手骨骼)：这些点离对手身子最近还差多少
   （正 = 还差这么多像素才碰到；负 = 已经扎进去这么深）；bodyPen：往前打过了对方迎面那一层多远（离得近时拳脚停在身上用，fighter.js fitContact） */
const STRIKE_SET = { fh: ['aFH'], bh: ['aBH'], ff: ['FF', 'FL'], bf: ['BF', 'BL'], fe: ['aFL', 'aFU'], be: ['aBL', 'aBU'], sh: ['aFU', 'aBU', 'torso'] };
for (const k in STRIKE_SET) STRIKE_SET[k] = new Set(STRIKE_SET[k]);
function strikeParts(J, limb, parts) {
  parts = parts || bodyParts(J, 0, STRIKE_SET[limb]).parts;
  const by = k => parts.filter(p => p.k === k).map(p => p.pts);
  if (limb === 'fh') return by('aFH');
  if (limb === 'bh') return by('aBH');
  if (limb === 'ff') return by('FF').concat(by('FL'));
  if (limb === 'bf') return by('BF').concat(by('BL'));
  if (limb === 'fe') return by('aFL').concat(by('aFU'));
  if (limb === 'be') return by('aBL').concat(by('aBU'));
  if (limb === 'sh') return by('aFU').concat(by('aBU'), by('torso'));
  return [];
}
function pointInPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function distToPoly(x, y, pts) {
  let m = 1e9;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1e-6;
    const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L, 0, 1), ex = a[0] + dx * t - x, ey = a[1] + dy * t - y;
    m = Math.min(m, Math.hypot(ex, ey));
  }
  return m;
}
function bodyGap(polys, J2) {
  const tgt = bodyParts(J2, 0).parts.map(p => p.pts);
  let best = 1e9;
  for (const poly of polys) for (const [x, y] of poly) {
    let inside = 0, out = 1e9;
    for (const q of tgt) { const d = distToPoly(x, y, q); if (pointInPoly(x, y, q)) inside = Math.max(inside, d); else out = Math.min(out, d); }
    const g = inside > 0 ? -inside : out;
    if (g < best) best = g;
  }
  return best;
}

// 打进去多深：polys 往 dir（1 往右 / -1 往左）打，最靠前的那一点过了对方身子迎面那一层多远（还没碰到 = 负的）。
// 按横着的一条条线量（这个高度上对方身子最靠近打过来那一边的边），拳头整个穿过去到了身子后面也算得出来（bodyGap 那时候以为又「没碰到」了）。
// noArms：对方的胳膊不算（没在挡的人，拳头从他护着的手上面过去打在身上）
// 对方的外形（量 bodyPen 用）：每一块的点 + 上下范围（这一块不在这个高度上就不用一条边一条边看）
const bodyTargets = (J2, noArms, parts) => (parts || bodyParts(J2, 0).parts).filter(p => !(noArms && p.k[0] === 'a')).map(p => {
  let y0 = 1e9, y1 = -1e9; for (const q of p.pts) { if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  return { pts: p.pts, y0, y1 };
});
function bodyPen(polys, J2, dir, noArms) { return bodyPenT(polys, bodyTargets(J2, noArms), dir); }
// 同上，对方的外形已经算好了（tgt = bodyTargets(...)，一帧里量好几次时省得每次重算）
function bodyPenT(polys, tgt, dir) {
  let best = -1e9;
  for (const poly of polys) for (const [x, y] of poly) {
    let near = 1e9;
    for (const T of tgt) {
      if (y < T.y0 || y > T.y1) continue;
      const q = T.pts;
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        const a = q[j], c = q[i];
        if ((a[1] > y) !== (c[1] > y)) { const u = (a[0] + (c[0] - a[0]) * (y - a[1]) / (c[1] - a[1])) * dir; if (u < near) near = u; }
      }
    }
    if (near < 1e9 && x * dir - near > best) best = x * dir - near;
  }
  return best;
}

/* ---------- 画 ---------- */
// 一圈点的绕向（几块合成一个路径填一次：绕向统一，重叠的地方才不会挖成洞）
function signedArea(pts) { let s = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]); return s; }
// 一圈点加进路径：绕向统一；折线用二次曲线磨圆（经过每两点的中点），线条顺、看不出折角
function addPoly(path, pts) {
  const P = signedArea(pts) < 0 ? pts.slice().reverse() : pts, n = P.length;
  path.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
  path.closePath();
  return path;
}
const polysPath = list => { const p = new Path2D(); for (const q of list) addPoly(p, q.pts || q); return p; };
// 整个人的剪影（整个人先填一遍本色、残影、运气的光、挨打白闪、身子外面那圈影子）：一个路径、填一次 —— 关节、重叠的地方没有缝、不叠色
function bodySilhouette(J, g) { return polysPath(bodyParts(J, g || 0).parts); }
function drawSilhouette(J, col, alpha, grow) {
  if (alpha <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha); ctx.fillStyle = col;
  ctx.fill(bodySilhouette(J, grow));
  ctx.globalAlpha = 1;
}
const BODY_LAYERS = ['farArm', 'farLeg', 'torso', 'nearLeg', 'head', 'nearArm'];
// 2.5.1 腿根上多大一圈不打亮边（腿从裆里出来以前）、近侧那条腿叠在远侧腿上的线离大腿根多远才开始描
const LEG_ROOT_CUT = 11.5, LEG_LINE_CUT = 16;
/* 整个人：J 骨骼，col 身体色，band 头带 / 腰带色。调用前整个人已经填过一遍本色（render.js 先填剪影、带一圈淡影）。
   一层一层从后往前画（每一层只在自己的外形里画）：先把这一层涂成本色（盖住后面几层的亮边），再画这一层侧面那道淡亮边；
   近侧的胳膊、腿叠在身子上的那一段，外沿描一道同样淡的亮线（整条合起来的外沿 —— 关节里面不会出线）。
   都是「先涂亮色、再把不要的地方涂回本色」，每一笔都是整块填满的，不会在剪裁的边上留下一道道浅印子 */
function drawBody(J, col, band) {
  const S = BODY.shade, T = bodyTones(col), bp = bodyParts(J, 0), f = bp.f;
  const inner = bodyParts(J, -S.line).parts;              // 整圈往里收 line 的外形：近侧手脚只留外沿那一圈亮线
  const under = new Path2D(), underLimb = new Path2D();   // 已经画过的层（往里收过的）：全部 / 只算远侧的手脚
  const nrm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  // 腿的外侧：两条腿哪条在前（看膝盖 + 脚踝），在前的那条亮边在前沿、在后的那条在后沿；两条腿差不多并着就按前腿在前
  const ahead = ((J.ff[0] + J.fk[0]) - (J.bf[0] + J.bk[0])) * f, sF = Math.abs(ahead) > 6 ? Math.sign(ahead) : (J.turned ? -1 : 1);
  // 半个平面：过 c 点、(ux, uy) 反方向那一侧（一个很大的四边形）
  const halfPlane = (c, ux, uy) => {
    const vx = -uy, vy = ux, p = new Path2D();
    p.moveTo(c[0] + vx * 900, c[1] + vy * 900); p.lineTo(c[0] - vx * 900, c[1] - vy * 900);
    p.lineTo(c[0] - vx * 900 - ux * 900, c[1] - vy * 900 - uy * 900); p.lineTo(c[0] + vx * 900 - ux * 900, c[1] + vy * 900 - uy * 900); p.closePath();
    return p;
  };
  /* 根上那一截不描、不打亮边：腿是从胯里长出来的、胳膊是从肩膀里长出来的，不是一块拼上去的 ——
     · 腿：腰带底下往上整片不画；2.5.1 大腿根一圈（LEG_ROOT_CUT，腿从「裆」里出来以前）和裆里面也不画 —— 裆上不打亮边、不出线，
       不然屁股那儿一道弧、两腿中间一道弧，合起来就是「两瓣屁股」（Jack）；
     · 胳膊：肩关节往身子那边（顺着大臂往回）不描 */
  const tr = bp.tor, tb = BODY.belt.at - BODY.belt.h / 2 / BODY.bone.torso;
  const beltCut = tr ? (() => { const a = tr.at(tb, 0), b = tr.at(tb + 1, 0), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return halfPlane(a, (a[0] - b[0]) / l, (a[1] - b[1]) / l); })() : null;
  const seatPart = bp.parts.find(p => p.seat), seatCut = seatPart ? polysPath([seatPart]) : null;
  const rootCut = (key, arm) => {
    const R0 = arm ? (key === 'F' ? J.shF : J.shB) : (key === 'F' ? J.hipF : J.hipB);
    if (!arm) { const p = new Path2D(); p.arc(R0[0], R0[1], LEG_ROOT_CUT, 0, Math.PI * 2); return p; }
    const M0 = key === 'F' ? J.fe : J.be, E0 = key === 'F' ? J.fh : J.bh;
    let ux = M0[0] - R0[0], uy = M0[1] - R0[1], ul = Math.hypot(ux, uy);
    if (ul < 6) { ux = E0[0] - R0[0]; uy = E0[1] - R0[1]; ul = Math.hypot(ux, uy); }
    if (ul < 1e-3) return null;
    ux /= ul; uy /= ul;
    return halfPlane([R0[0] + ux * 0.5, R0[1] + uy * 0.5], ux, uy);
  };
  const paint = (c, ...ps) => { ctx.fillStyle = c; for (const p of ps) if (p) ctx.fill(p); };
  let any = false;
  for (const L of BODY_LAYERS) {
    const parts = bp.parts.filter(p => p.layer === L);
    if (!parts.length) continue;
    const path = polysPath(parts), arm = L === 'farArm' || L === 'nearArm', leg = L === 'farLeg' || L === 'nearLeg';
    const key = arm ? parts[0].k[1] : leg ? parts[0].k[0] : null, cut = key ? rootCut(key, arm) : null;
    ctx.save(); ctx.clip(path);
    paint(T.base, path);
    // 亮边：这几块合起来涂亮色，再往 n 的反方向挪 w 涂回本色 —— n 那一侧剩下一道 w 宽的亮边
    const rim = (list, n, w, base) => {
      if (!list.length || w <= 0) return;
      const p = list.length === parts.length ? path : polysPath(list);
      ctx.save(); ctx.clip(p); paint(T.hl, p);
      ctx.translate(-n[0] * w, -n[1] * w); paint(base || T.base, p); ctx.restore();
    };
    if (L === 'torso') {
      // 躯干前后两侧的亮边都只到腰带：腰带底下是裆（裤子），和两条大腿长在一起。
      // 2.5.1：后沿以前一直描到屁股底下，屁股那一圈一道弧（Jack：像没穿裤子）—— 现在腰带以下前后都不打亮边
      rim(parts, nrm(f, -S.up), S.rim * 0.85);
      rim(parts, nrm(-f, -S.up), S.rim);
      if (tr) { const a = tr.at(tb, 0), b = tr.at(tb + 1, 0), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; paint(T.base, halfPlane(a, (b[0] - a[0]) / l, (b[1] - a[1]) / l)); }
    }
    else if (arm) {
      const far = L === 'farArm';
      rim(parts, [0, -1], S.rimArm, far ? T.far : T.base);     // 2.10.1 远侧的胳膊整条暗一点点（亮边照旧）
      if (far) {                                                 // 肘关节、肩膀那一小块再暗一点点（都在这条胳膊的外形里面）
        const el = key === 'F' ? J.fe : J.be, sh0 = key === 'F' ? J.shF : J.shB;
        const ex = el[0] - sh0[0], ey = el[1] - sh0[1], el2 = Math.hypot(ex, ey) || 1;
        const pj = new Path2D();
        pj.arc(el[0], el[1], S.farR, 0, Math.PI * 2);
        pj.moveTo(sh0[0] + ex / el2 * 5 + S.farRs, sh0[1] + ey / el2 * 5); pj.arc(sh0[0] + ex / el2 * 5, sh0[1] + ey / el2 * 5, S.farRs, 0, Math.PI * 2);
        paint(T.farJ, pj);
      }
    }
    else if (leg) {
      const s = key === 'F' ? sF : -sF;
      rim(parts.filter(p => !p.foot), nrm(s * f, -S.up), S.rim);
      rim(parts.filter(p => p.foot), nrm(s * f * 0.3, -1), S.rim);
      paint(T.base, cut, beltCut, seatCut);
    }
    // 近侧的胳膊、腿叠在身子上：外沿描一道淡亮线（整条胳膊 / 整条腿合起来的外沿 —— 关节里面没有线）
    if ((L === 'nearArm' || L === 'nearLeg') && any) {
      paint(T.hl, under);
      if (leg) {
        // 腿：叠在远侧那条腿上描一道（两腿之间那道线，参考图那样）。2.5.1：离大腿根 LEG_LINE_CUT 以内、裆里面都不描 ——
        // 以前从腰带底下就描，沿着近侧大腿后沿弯下来一道弧，和屁股那道弧合起来像两瓣屁股（Jack）
        paint(T.hl, underLimb);
        const hp = key === 'F' ? J.hipF : J.hipB, ring = new Path2D();
        ring.arc(hp[0], hp[1], LEG_LINE_CUT, 0, Math.PI * 2);
        paint(T.base, ring, seatCut);
      }
      paint(T.base, polysPath(inner.filter(p => p.layer === L)), cut, leg ? beltCut : null);
    }
    ctx.restore();
    for (const q of inner) if (q.layer === L) { addPoly(under, q.pts); if (L === 'farArm' || L === 'farLeg') addPoly(underLimb, q.pts); }
    any = true;
    if (L === 'nearLeg' && tr) drawWaistBelt(tr, band);       // 腰带箍在腰上：盖住两条大腿根
    if (L === 'head') drawHeadGear(J, band);
  }
}
// 腰带：横着箍在腰上，比身子宽一点点，跟着身子的方向；一整块平涂（参考图那样）
function drawWaistBelt(tr, band) {
  const t = BODY.belt.at, h = BODY.belt.h / 2 / BODY.bone.torso;
  const f1 = tr.half(t + h, 1) + 0.8, b1 = tr.half(t + h, 2) + 0.8, f0 = tr.half(t - h, 1) + 0.9, b0 = tr.half(t - h, 2) + 0.9;
  const pts = [tr.at(t + h, f1), tr.at(t + h * 1.12, 0), tr.at(t + h, -b1), tr.at(t - h, -b0), tr.at(t - h * 0.88, 0), tr.at(t - h, f0)];
  ctx.fillStyle = band; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
}
// 头带 + 眼睛（头带结在后脑勺，发带从那里飘出去）
function drawHeadGear(J, band) {
  const R = BODY.bone.head, ht = J.headTilt, fdir = J.facing;
  ctx.save(); ctx.translate(J.head[0], J.head[1]); ctx.rotate(fdir * (J.rot + ht)); ctx.scale(fdir, 1);
  ctx.fillStyle = band;
  // 2.7（Jack：头带再细一点点）：宽 0.4 个头半径 → 0.32（后脑勺 4.8 → 3.8 像素）
  ctx.beginPath(); ctx.moveTo(-R * 1.05, -R * 0.58); ctx.lineTo(R * 1.06, -R * 0.5); ctx.lineTo(R * 1.04, -R * 0.18); ctx.lineTo(-R * 1.02, -R * 0.26); ctx.closePath(); ctx.fill();
  if (!J.turned) { ctx.fillStyle = C.paper; ctx.beginPath(); ctx.ellipse(R * 0.53, R * 0.14, R * 0.22, R * 0.112, -0.15, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
