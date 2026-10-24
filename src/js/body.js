'use strict';
/* ============================================================
   人物模型（2.4，Jack：比例像真人、肌肉线条、阴影体现立体、关节不再半透明、前后分得清）
   想调人物「长什么样」只改这个文件最上面的 BODY 表；动作（姿势、招式）在 pose.js / moves.js。
   调完打开 poses.html（动作台）看效果，滑块调好了能直接复制出数值贴回来。

   · 骨架：髋 → 脊柱 → 脖子根 → 脖子 → 头；两个肩关节（拧腰 tw 时前后错开）；两个大腿根；肘、膝用两节 IK（fighter.js fk()）
   · 外形：每一节（大臂、小臂、大腿、小腿、脖子）按「轮廓表」长出一圈外形 —— 沿着骨头走，前侧、后侧各给一串半宽，
     肌肉的鼓包（三角肌、二头、股四头、小腿肚……）就是这串数字里鼓起来的那几格；躯干是倒三角（胸宽、腰细、臀圆）
   · 画法：一块一块按前后顺序整块不透明地画（远侧手 → 远侧腿 → 躯干 → 近侧腿 → 头 → 近侧手），
     阴影用「错位填色」：整块先涂亮色，再把同一块往背光那边挪几像素涂本色 —— 剩下的那一道就是受光的亮边（参考图那种），
     背光那边同样压一道暗边；肌肉的分界画成几道浅线；关节（肘、膝）里侧一道暗折痕、外侧一点亮
   · 前后：近侧（离镜头近）的手脚描一圈浅边，叠在身子上分得开；远侧的手脚整块用淡一点的墨（不透明，像水墨画里远的东西淡），
     关节、重叠的地方不会再叠出深一块浅一块
   · 参考图的习惯：护在下巴前面的后手、往前伸的前腿在近侧（离镜头近）；前手、后腿在远侧。转过身（spin 过了 90°）两边对调
   ============================================================ */
const BODY = {
  // 骨头长度（逻辑像素）。头是半径。肩 = 肩关节在脊柱上离髋多远（比脖子根低一点：斜方肌往下斜）
  // 2.4 比例（Jack：头比以前小、比参考图第三张略大一点点；手臂比以前短；整体像真人）：
  //   头半径 13 → 12（站着约 6.3 个头高，以前 5.5）；腿 69 → 81（大腿 39 + 小腿 37 + 脚踝 4.8）；手臂 49 → 48（大臂 25 + 小臂到拳心 23），
  //   身子比以前粗壮得多，看着手就短了；前手护在肩前收得更紧
  bone: { torso: 46, shoulder: 41, neck: 4.4, head: 12, ua: 25, fa: 23, th: 39, sh: 37, ankle: 4.8 },
  shoulderW: 13.5,   // 肩宽的一半：拧腰（tw）时两个肩膀前后错开 ±shoulderW·sin(tw)；转身（spin）时左右分开
  hipW: 6,           // 两个大腿根离中线多远（转身时左右分开用）
  hipSplit: 2.4,     // 侧面看两个大腿根前后错开一点（前腿根靠前），两条腿分得开
  wrist: 4.4,        // 小臂画到拳心往回这么多（这一截被拳头盖住）
  fist: { len: 13.2, h: 11.6, r: 4.8 },        // 拳头：顺着小臂方向的长、横着的高、圆角
  foot: { heel: 6.2, toe: 17.4, h: 7.4, toeH: 5.6 },   // 脚（鞋）：脚跟在脚踝后面多远、脚尖在前面多远、鞋高、鞋头高
  // 轮廓表：[沿着这一节骨头的位置 0（根）~1（梢）, 前侧半宽, 后侧半宽]。「前侧」：
  //   大臂 = 二头肌那一侧（胳膊弯起来小臂折过去的那一侧）；小臂 = 掌心那一侧；大腿 = 膝盖顶出去那一侧；小腿 = 小腿骨那一侧（后侧是小腿肚）
  ua: [[0, 7.0, 7.2], [0.14, 6.6, 7.0], [0.34, 5.7, 5.7], [0.5, 5.6, 5.3], [0.78, 4.5, 4.5], [1, 4.0, 4.1]],
  fa: [[0, 4.3, 4.2], [0.2, 4.8, 4.5], [0.45, 4.3, 4.0], [0.75, 3.6, 3.4], [1, 3.2, 3.1]],
  th: [[0, 8.4, 8.8], [0.2, 8.2, 8.1], [0.45, 7.5, 7.1], [0.72, 6.3, 6.0], [0.9, 5.5, 5.4], [1, 5.2, 5.2]],
  sh: [[0, 5.1, 5.5], [0.16, 4.8, 6.9], [0.34, 4.6, 6.5], [0.58, 4.1, 5.1], [0.82, 3.6, 3.8], [1, 3.4, 3.4]],
  neck: [[0, 6.0, 6.8], [0.6, 5.2, 5.6], [1, 5.0, 5.4]],
  // 躯干：[沿脊柱的位置（0 = 髋关节，1 = 脖子根；负的在髋下面）, 胸腹那侧半宽, 后背那侧半宽, 正面对着镜头时的半宽]
  // 侧着看：胸大肌鼓出来、腰收进去、臀部往后圆；正面看（转身转到一半）：肩宽、腰细
  torso: [[-0.17, 9.6, 11.4, 12.4], [-0.06, 11.6, 13.0, 13.6], [0.06, 11.4, 12.2, 13.4], [0.2, 10.6, 10.6, 12.2],
    [0.34, 10.8, 10.4, 12.6], [0.52, 12.6, 11.6, 14.6], [0.68, 15.0, 13.4, 17.0], [0.82, 14.8, 15.2, 18.8],
    [0.91, 13.4, 14.4, 16.4], [0.97, 9.8, 11.0, 11.4], [1, 6.8, 7.4, 7.6]],
  belt: { at: 0.11, h: 5.6 },                  // 腰带：在脊柱上的位置（参考图那样系得低，在胯上）、宽
  // 阴影（单位：逻辑像素）：亮边多宽、暗边多宽；光从哪边来（人自己的方向：-x = 背后，-y = 上面）
  light: [-0.6, -0.8], rim: 1.9, rimTorso: 2.8, dark: 2.0,
  // 颜色（从身体色算，k = 往纸色 / 往黑里混多少）：近侧亮边、远侧整块（墨往淡里 far、别的颜色往暗里 farDark）、远侧亮边、背光暗边、肌肉线、近侧描边
  tone: { rim: 0.34, far: 0.09, farDark: 0.24, farRim: 0.3, dark: 0.32, line: 0.15, edge: 0.26, edgeW: 0.85, lineW: 0.95 },
};
// 以前的名字（别的文件、测试还在用）：头半径、大臂、小臂、大腿、小腿、躯干、脖子
const BONE = { torso: BODY.bone.torso, neck: BODY.bone.neck, head: BODY.bone.head, ua: BODY.bone.ua, fa: BODY.bone.fa, th: BODY.bone.th, sh: BODY.bone.sh };

/* ---------- 颜色 ---------- */
const bodyRgb = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const bodyMix = (a, b, k) => { const A = bodyRgb(a), B = bodyRgb(b); return '#' + A.map((v, i) => clamp(Math.round(v + (B[i] - v) * k), 0, 255).toString(16).padStart(2, '0')).join(''); };
const BODY_TONES = {};
function bodyTones(col) {
  if (BODY_TONES[col]) return BODY_TONES[col];
  // 远侧：很深的颜色（墨）往纸色提一点点（水墨画里远的淡）；别的颜色往暗里压（背光那一侧）—— 都是实心的
  const T = BODY.tone, P = C.paper, lum = bodyRgb(col).reduce((a, v, i) => a + v * [0.299, 0.587, 0.114][i], 0) / 255;
  const far = lum < 0.16 ? bodyMix(col, P, T.far) : bodyMix(col, '#000000', T.farDark);
  return (BODY_TONES[col] = { base: col, rim: bodyMix(col, P, T.rim), far, farRim: bodyMix(far, P, T.farRim * 0.7), dark: bodyMix(col, '#000000', T.dark),
    farDark: bodyMix(far, '#000000', T.dark * 0.6), line: bodyMix(col, P, T.line), farLine: bodyMix(far, P, T.line * 0.8), edge: bodyMix(col, P, T.edge) });
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
   肢体伸直、看不出弯向时就是两边的平均）。g = 往外多胖一点（运气的光用）。返回 { pts, n, u, L }，pts 顺时针、逆时针不一定 */
function limbShape(A, B, prof, as, g) {
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
  const cap = (cx, cy, r, a0, a1) => { for (let i = 1; i < 6; i++) { const a = a0 + (a1 - a0) * i / 6; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  // 梢头：从左边绕到右边（经过 +u）；根头：从右边绕回左边（经过 -u）
  cap(B[0] + nx * (wl1 - wr1) / 2, B[1] + ny * (wl1 - wr1) / 2, (wl1 + wr1) / 2, an, an - Math.PI);
  for (let i = N; i >= 0; i--) pts.push(right[i]);
  cap(A[0] + nx * (wl0 - wr0) / 2, A[1] + ny * (wl0 - wr0) / 2, (wl0 + wr0) / 2, an + Math.PI, an);
  return { pts, nx, ny, ux, uy, L, wa };
}
// 拳头：顺着小臂方向的圆角方块（中心 H，方向 u）
function fistShape(H, ux, uy, g) {
  const Fi = BODY.fist, hl = Fi.len / 2 + g * 0.5, hh = Fi.h / 2 + g * 0.5, r = Math.min(Fi.r + g * 0.5, hh - 0.5), nx = -uy, ny = ux, pts = [];
  for (const [sx, sy, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]]) {
    const cx = sx * (hl - r), cy = sy * (hh - r);
    for (let i = 0; i <= 4; i++) {
      const a = a0 + Math.PI / 2 * i / 4, lx = cx + Math.cos(a) * r, ly = cy + Math.sin(a) * r;
      pts.push([H[0] + ux * lx + nx * ly, H[1] + uy * lx + ny * ly]);
    }
  }
  return pts;
}
// 脚（鞋）：脚踝 K，脚尖方向 d，s = 朝鞋底的方向。参考图那种圆头鞋
const FOOT_PTS = (() => {
  const Fo = BODY.foot, a = BODY.bone.ankle;
  return [[-2.6, -2.6], [-Fo.heel + 0.6, -0.9], [-Fo.heel, 1.4], [-Fo.heel + 0.8, a - 0.3], [-Fo.heel + 2.4, a + 0.3], [Fo.toe - 4.5, a + 0.35],
    [Fo.toe - 1.6, a - 0.2], [Fo.toe, a - 1.9], [Fo.toe - 0.5, a - Fo.toeH + 0.6], [Fo.toe - 3, a - Fo.toeH - 0.3], [6.5, -1.9], [2.2, -3.4]];
})();
function footShape(K, dx, dy, sx, sy, g) {
  return FOOT_PTS.map(([x, y]) => { const k = 1 + g / 8; return [K[0] + (dx * x + sx * y) * k, K[1] + (dy * x + sy * y) * k]; });
}
/* 躯干：沿脊柱（髋 → 脖子根）长出来。fx, fy = 身子朝前的方向（垂直于脊柱）；spin = 转身角（转到一半时是正面，宽）。
   返回外形一圈点 + 一个 at(t, w) 换算（脊柱上 t 处、往前 w 的那个点，画肌肉线、腰带用） */
function torsoShape(H, N, fx, fy, spin, g) {
  const dx = N[0] - H[0], dy = N[1] - H[1], P = BODY.torso;
  const ss = Math.abs(Math.sin(spin)), cs = Math.abs(Math.cos(spin));
  const half = (t, k) => profAt(P, t, k) * cs + profAt(P, t, 3) * ss + g;     // k = 1 胸腹、2 后背
  const at = (t, w) => [H[0] + dx * t + fx * w, H[1] + dy * t + fy * w];
  const ts = [], t0 = P[0][0];
  for (let i = 0; i <= 14; i++) ts.push(t0 + (1 - t0) * i / 14);
  const pts = [];
  for (const t of ts) pts.push(at(t, half(t, 1)));
  // 顶上（斜方肌 → 脖子根），往上拱一点
  pts.push(at(1.035, half(1, 1) * 0.35)); pts.push(at(1.045, -half(1, 2) * 0.3));
  for (let i = ts.length - 1; i >= 0; i--) pts.push(at(ts[i], -half(ts[i], 2)));
  // 底下（臀部 → 裆）：往下圆过去
  const b = half(t0, 2), f = half(t0, 1);
  pts.push(at(t0 - 0.06, -b * 0.72)); pts.push(at(t0 - 0.085, -b * 0.25)); pts.push(at(t0 - 0.08, f * 0.3)); pts.push(at(t0 - 0.05, f * 0.78));
  return { pts, at, half };
}

/* ---------- 骨骼 → 一块一块 ----------
   J 是 fighter.js fk() 算出来的世界坐标骨骼。返回按画的先后排好的部件：{ k 名字, pts 外形, far 远侧, lines 肌肉线, joint 关节折痕 }
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
  const limb = (key, R, M, E, hint, arm, far) => {
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
      const W = [E[0] - ux * BODY.wrist, E[1] - uy * BODY.wrist];
      if (nU) { const up = limbShape(R, M, BODY.ua, aUp, g); parts.push({ k: key + 'U', pts: up.pts, far, sh: up, seg: 'ua', A: R }); }
      if (nL) { const lo = limbShape(M, W, BODY.fa, aLo, g); parts.push({ k: key + 'L', pts: lo.pts, far, sh: lo, seg: 'fa', A: M, joint: { at: M, a: R, b: E } }); }
      if (nE) parts.push({ k: key + 'H', pts: fistShape(E, ux, uy, g), far, fist: { E, ux, uy } });
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
      if (nU) { const up = limbShape(R, M, BODY.th, aUp, g); parts.push({ k: key + 'U', pts: up.pts, far, sh: up, seg: 'th', A: R }); }
      if (nL) { const lo = limbShape(M, E, BODY.sh, aLo, g); parts.push({ k: key + 'L', pts: lo.pts, far, sh: lo, seg: 'sh', A: M, joint: { at: M, a: R, b: E } }); }
      if (nE) parts.push({ k: key + 'F', pts: footShape(E, dx, dy, -sg * dy, sg * dx, g), far, foot: true });
    }
  };
  const tor = need('torso') || need('neck') ? torsoShape(J.hip, J.neck, fx, fy, J.spin || 0, g) : null;
  const nk = need('neck') ? limbShape(J.neck, J.neckTop, BODY.neck, 1, g) : null;
  // 头：圆
  const hr = B.head + g * 0.5, head = [];
  if (need('head')) for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; head.push([J.head[0] + Math.cos(a) * hr, J.head[1] + Math.sin(a) * hr]); }
  // 近侧 / 远侧：护着下巴的后手、往前的前腿在近侧；转过身两边对调
  const t = !!J.turned;
  const farArm = t ? ['B', J.shB, J.be, J.bh, J.hBe] : ['F', J.shF, J.fe, J.fh, J.hFe];
  const nearArm = t ? ['F', J.shF, J.fe, J.fh, J.hFe] : ['B', J.shB, J.be, J.bh, J.hBe];
  const farLeg = t ? ['F', J.hipF, J.fk, J.ff, J.hFk] : ['B', J.hipB, J.bk, J.bf, J.hBk];
  const nearLeg = t ? ['B', J.hipB, J.bk, J.bf, J.hBk] : ['F', J.hipF, J.fk, J.ff, J.hFk];
  limb('a' + farArm[0], farArm[1], farArm[2], farArm[3], farArm[4], true, true);
  limb(farLeg[0], farLeg[1], farLeg[2], farLeg[3], farLeg[4], false, true);
  if (need('torso')) parts.push({ k: 'torso', pts: tor.pts, torso: tor, fx, fy });
  if (nk) parts.push({ k: 'neck', pts: nk.pts, sh: nk, seg: 'neck' });
  limb(nearLeg[0], nearLeg[1], nearLeg[2], nearLeg[3], nearLeg[4], false, false);
  if (head.length) parts.push({ k: 'head', pts: head, head: true });
  limb('a' + nearArm[0], nearArm[1], nearArm[2], nearArm[3], nearArm[4], true, false);
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
function bodyPath(pts, dx, dy) {
  const p = new Path2D(), o = dx || 0, q = dy || 0;
  p.moveTo(pts[0][0] + o, pts[0][1] + q);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0] + o, pts[i][1] + q);
  p.closePath();
  return p;
}
// 一圈点的绕向（剪影要把所有块合成一个路径填一次：绕向统一，重叠的地方才不会挖成洞）
function signedArea(pts) { let s = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]); return s; }
// 整个人的剪影（残影、运气的光、挨打白闪、身子外面那圈影子）：一个路径、填一次 —— 关节、重叠的地方不会叠出深色的点
function bodySilhouette(J, g) {
  const { parts } = bodyParts(J, g || 0), p = new Path2D();
  for (const pt of parts) {
    const pts = signedArea(pt.pts) < 0 ? pt.pts.slice().reverse() : pt.pts;
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
  }
  return p;
}
function drawSilhouette(J, col, alpha, grow) {
  if (alpha <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha); ctx.fillStyle = col;
  ctx.fill(bodySilhouette(J, grow));
  ctx.globalAlpha = 1;
}
// 一条线（肌肉分界）：pts 一串点，画成平滑的曲线
function bodyStroke(pts, col, w) {
  if (pts.length < 2) return;
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) ctx.lineTo(pts[1][0], pts[1][1]);
  else { for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], i === pts.length - 2 ? pts[i + 1][0] : mx, i === pts.length - 2 ? pts[i + 1][1] : my); } }
  ctx.stroke();
}
// 肢体上 t 处、离骨头 w（正 = 前侧）的那个点
const segAt = (s, A, t, w) => { const sg = s.wa >= 0.5 ? 1 : -1; return [A[0] + s.ux * s.L * t + s.nx * w * sg, A[1] + s.uy * s.L * t + s.ny * w * sg]; };
/* 整个人：J 骨骼，col 身体色，band 头带 / 腰带色。一块一块画：本色 → 背光暗边 → 受光亮边 → 肌肉线；
   近侧的块叠在前面画过的块上时，重叠的那一段描一道浅边（只描叠在身上的那段，外轮廓不描：纸上不会出一圈灰边） */
function drawBody(J, col, band) {
  const T = bodyTones(col), bp = bodyParts(J, 0), f = bp.f, BT = BODY.tone;
  const lx = BODY.light[0] * f, ly = BODY.light[1];
  const under = new Path2D();                         // 已经画过的块合起来（描边只描在这里面）
  let any = false;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const pt of bp.parts) {
    const far = !!pt.far, path = bodyPath(pt.pts);
    const base = far ? T.far : T.base, rim = far ? T.farRim : T.rim, dark = far ? T.farDark : T.dark, line = far ? T.farLine : T.line;
    const rw = pt.torso ? BODY.rimTorso : pt.head ? BODY.rim * 0.8 : BODY.rim, dw = BODY.dark;
    // 先整块涂本色；亮边 = 这一块减去「往背光那边挪 rw 的这一块」剩下的那一道（evenodd 一次填出来，剪在这一块里面）；
    // 暗边 = 这一块减去「往受光那边挪 dw 的这一块」。只在一道带子上叠色，外沿不会出一圈浅色的毛边
    ctx.fillStyle = base; ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    const strip = (dx, dy, c) => { const p2 = bodyPath(pt.pts); p2.addPath(bodyPath(pt.pts, dx, dy)); ctx.fillStyle = c; ctx.fill(p2, 'evenodd'); };
    if (dark !== base) strip(lx * dw, ly * dw, dark);
    strip(-lx * rw, -ly * rw, rim);
    bodyDetail(J, pt, line, dark, bp);
    ctx.restore();
    if (!far && any) { ctx.save(); ctx.clip(under); ctx.strokeStyle = T.edge; ctx.lineWidth = BT.edgeW; ctx.stroke(path); ctx.restore(); }
    if (pt.k === 'torso') drawWaistBelt(pt, band, T);
    if (pt.head) drawHeadGear(J, band);
    const pts = signedArea(pt.pts) < 0 ? pt.pts.slice().reverse() : pt.pts;
    under.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) under.lineTo(pts[i][0], pts[i][1]); under.closePath();
    any = true;
  }
}
// 肌肉线、关节折痕（在这一块里面画，已经剪在这一块的外形里）
function bodyDetail(J, pt, line, dark, bp) {
  const W = BODY.tone.lineW;
  if (pt.torso) {
    const tr = pt.torso, h1 = t => tr.half(t, 1), h2 = t => tr.half(t, 2);
    if (Math.abs(Math.cos(J.spin || 0)) > 0.3) {
      // 胸大肌下沿：从腋下往胸口斜着弯下来（参考图那一道 V）；背阔肌往腰收的那一道，淡淡的
      bodyStroke([tr.at(0.85, h1(0.85) * 0.98), tr.at(0.75, h1(0.75) * 0.8), tr.at(0.67, h1(0.67) * 0.38)], line, W * 1.15);
      bodyStroke([tr.at(0.78, -h2(0.78) * 0.7), tr.at(0.6, -h2(0.6) * 0.62)], line, W * 0.8);
    }
    return;
  }
  const s = pt.sh, A = pt.A, at = (t, w) => segAt(s, A, t, w);
  if (s && A) {
    // 肌肉的分界（w 正 = 前侧）：三角肌下沿、二头 / 三头之间的沟；小臂的肱桡肌；股四头肌外沿、腘绳肌；小腿肚的内沿
    if (pt.seg === 'ua') bodyStroke([at(0.06, 5.2), at(0.22, 2.0), at(0.34, -3.8)], line, W);                 // 三角肌下沿
    else if (pt.seg === 'fa') bodyStroke([at(0.12, 2.4), at(0.4, 1.4)], line, W * 0.8);                            // 肱桡肌
    else if (pt.seg === 'th') bodyStroke([at(0.22, 3.4), at(0.48, 1.8), at(0.74, 2.6)], line, W * 0.9);            // 股四头肌外沿
    else if (pt.seg === 'sh') bodyStroke([at(0.1, -2.6), at(0.3, -3.3), at(0.52, -2.0)], line, W * 0.9);           // 小腿肚
  }
  if (pt.joint) {
    // 关节：里侧（弯进去的那一侧）一道暗折痕，外侧一小点亮 —— 伸直了也看得出肘、膝在哪
    const { at: M, a: R, b: E } = pt.joint;
    const ax = R[0] - M[0], ay = R[1] - M[1], bx = E[0] - M[0], by = E[1] - M[1];
    const al = Math.hypot(ax, ay) || 1, bl = Math.hypot(bx, by) || 1;
    let ix = ax / al + bx / bl, iy = ay / al + by / bl;            // 指向弯进去那一侧
    const bend = Math.hypot(ix, iy);                                // 0 = 伸直，越大弯得越多
    const tx = bx / bl, ty = by / bl;                               // 顺着下面那一节
    let nx = -ty, ny = tx;
    if (bend > 0.12) { if (nx * ix + ny * iy < 0) { nx = -nx; ny = -ny; } }
    else { const sg = s.wa >= 0.5 ? 1 : -1; nx = s.nx * sg; ny = s.ny * sg; if (pt.seg === 'fa') { nx = -nx; ny = -ny; } }   // 伸直：胳膊里侧 = 掌心那侧，腿里侧 = 膝窝（后侧）
    const r = pt.seg === 'fa' ? 3.4 : 4.3, k = 0.45 + Math.min(1, bend) * 0.55;
    const c = [M[0] + nx * r * 0.9, M[1] + ny * r * 0.9];
    bodyStroke([[c[0] - tx * r * 0.9 * k, c[1] - ty * r * 0.9 * k], [M[0] + nx * r * 0.55, M[1] + ny * r * 0.55], [c[0] + tx * r * 0.9 * k, c[1] + ty * r * 0.9 * k]], dark, BODY.tone.lineW * 1.5);
    // 外侧（肘尖、膝盖骨）一点亮
    bodyStroke([[M[0] - nx * r * 0.62 - tx * 1.4, M[1] - ny * r * 0.62 - ty * 1.4], [M[0] - nx * r * 0.78 + tx * 1.2, M[1] - ny * r * 0.78 + ty * 1.2]], line, BODY.tone.lineW * 1.25);
  }
}
// 腰带：横着箍在腰上，比身子宽一点点，跟着身子的方向
function drawWaistBelt(pt, band, T) {
  const tr = pt.torso, t = BODY.belt.at, h = BODY.belt.h / 2 / BODY.bone.torso;
  const f1 = tr.half(t + h, 1) + 0.9, b1 = tr.half(t + h, 2) + 0.9, f0 = tr.half(t - h, 1) + 0.9, b0 = tr.half(t - h, 2) + 0.9;
  const pts = [tr.at(t + h, f1), tr.at(t + h * 1.15, 0), tr.at(t + h, -b1), tr.at(t - h, -b0), tr.at(t - h * 0.85, 0), tr.at(t - h, f0)];
  ctx.fillStyle = band; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = T.dark; ctx.lineWidth = 0.8; ctx.stroke();
}
// 头带 + 眼睛（头带结在后脑勺，发带从那里飘出去）
function drawHeadGear(J, band) {
  const R = BODY.bone.head, ht = J.headTilt, fdir = J.facing;
  ctx.save(); ctx.translate(J.head[0], J.head[1]); ctx.rotate(fdir * (J.rot + ht)); ctx.scale(fdir, 1);
  ctx.fillStyle = band;
  ctx.beginPath(); ctx.moveTo(-R * 1.05, -R * 0.6); ctx.lineTo(R * 1.06, -R * 0.52); ctx.lineTo(R * 1.04, -R * 0.13); ctx.lineTo(-R * 1.02, -R * 0.2); ctx.closePath(); ctx.fill();
  if (!J.turned) { ctx.fillStyle = C.paper; ctx.beginPath(); ctx.ellipse(R * 0.53, R * 0.14, R * 0.22, R * 0.112, -0.15, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
