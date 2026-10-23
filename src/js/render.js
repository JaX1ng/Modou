'use strict';
/* 画面：背景、火柴人绘制、特效绘制、印章、血条 HUD、镜头 */

/* ============================================================
   画面
   ============================================================ */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
/* 画面大小（2.0，Jack：全屏要占满电脑屏幕，注意屏幕实际尺寸和浏览器的适配）：
   逻辑画面不再固定 1200×600 —— 宽高比跟着画布走：比 2:1 窄（16:9、16:10、4:3）就宽 1200、往上下多露一些；比 2:1 宽（带鱼屏）就高 600、左右多露。
   VW×VH = 逻辑画面大小；FY = 地线在画面上的高度（多出来的高度大部分给天上）；scale = 逻辑像素 → CSS 像素；pxr = CSS 像素 → 屏幕物理像素
   （devicePixelRatio：高分屏、Windows 缩放 125%/150%、浏览器缩放都算进去；画布太大时封顶，保证帧率）。
   W / H 还是 1200 / 600：规则里用到的（双人对战两人最远距离）不跟着屏幕变。背景、地面在 stage.js */
let scale = 1, pxr = 1, VW = W, VH = H, FY = FLOOR;
const viewFor = (cw, ch) => {                         // CSS 宽高 → 逻辑画面（测试也用）
  const asp = cw / Math.max(1, ch);
  const vw = asp >= W / H ? H * asp : W, vh = asp >= W / H ? H : W / asp;
  return { vw, vh, fy: Math.round(vh - (H - FLOOR) - (vh - H) * 0.25) };
};
// 画面比 2:1 高（地线往下挪了）：人再放大一点（最多 12%），多出来的高度不全给天
const zoomBoost = () => clamp(1 + (FY - FLOOR) / FLOOR * 0.6, 1, 1.12);
function resize() {
  const r = cv.getBoundingClientRect();
  const cw = Math.max(320, r.width), ch = Math.max(160, r.height || r.width / 2);
  let k = Math.min(window.devicePixelRatio || 1, 3);
  const CAP = 10.5e6;                                 // 画布最多约 1000 万像素（4K 全屏 + 高 DPR 时降一点分辨率）
  if (cw * ch * k * k > CAP) k = Math.sqrt(CAP / (cw * ch));
  const v = viewFor(cw, ch);
  VW = v.vw; VH = v.vh; FY = v.fy;
  cv.width = Math.round(cw * k); cv.height = Math.round(ch * k);
  scale = cw / VW; pxr = k;
}
// 给场景用：这一帧画面多大、地线在哪、最大放大倍数（地面层按这个分辨率画）
const viewInfo = () => ({ vw: VW, vh: VH, fy: FY, scale, pxr, zmax: ZOOM * zoomBoost() * 1.06 });

/* 锥形骨骼（毛笔感） */
function bone(a, b, wa, wb) {
  const dx = b[0] - a[0], dy = b[1] - a[1], ang = Math.atan2(dy, dx);
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  ctx.beginPath();
  ctx.moveTo(a[0] + nx * wa / 2, a[1] + ny * wa / 2);
  ctx.lineTo(b[0] + nx * wb / 2, b[1] + ny * wb / 2);
  ctx.arc(b[0], b[1], wb / 2, ang + Math.PI / 2, ang - Math.PI / 2, true);
  ctx.lineTo(a[0] - nx * wa / 2, a[1] - ny * wa / 2);
  ctx.arc(a[0], a[1], wa / 2, ang - Math.PI / 2, ang - 3 * Math.PI / 2, true);
  ctx.closePath(); ctx.fill();
}
function footStub(knee, foot, f, g) {
  const a = Math.atan2(foot[1] - knee[1], foot[0] - knee[0]) - f * Math.PI / 2 * 0.9;
  const tip = [foot[0] + Math.cos(a) * 10, foot[1] + Math.sin(a) * 10];
  bone(foot, tip, 6 * THICK + g, 4.2 * THICK + g);
}
// grow：每段骨头额外加粗多少（画运气时的光用）
/* ---------- 画面插值（2.0.1，Jack：人跑起来有虚影，尤其跑到地图边上）----------
   游戏逻辑固定每秒 60 帧；显示器是 120 / 144Hz 时，同一帧的画面要连着显示两三次，镜头却每次都在挪 ——
   人一顿一顿地往前跳，眼睛跟着看就是重影。跑到地图边上镜头停了、人在画面里走，最明显。
   现在：RA = 这一刻在上一帧和这一帧之间走到哪了（0~1，ui.js 主循环按时间算），人（骨骼、发带）、特效、气都在两帧之间插着画，
   镜头的平滑也按真实时间算（不按画了几次算）。60Hz 的屏幕 RA 一直是 1：不插值，也就不多一点延迟。只是画面，不影响胜负 */
let RA = 1;
const lerp = (a, b, k) => a + (b - a) * k;
const RL = e => e.life + (1 - RA);                   // 插值后的剩余寿命（特效的淡出、放大跟着插）
const RX = e => e.px === undefined ? e.x : lerp(e.px, e.x, RA), RY = e => e.py === undefined ? e.y : lerp(e.py, e.y, RA);
// 一个人这一刻画成什么样：插值好的骨骼 J、发带、位置。一帧挪了一大截（回合重开、被摔过去）就不插
function viewOf(F) {
  const v = F.vp, J = F.J;
  if (RA >= 1 || !v || !J || !v.J.hip || J.x === undefined || Math.abs(v.J.x - J.x) > 90) return { J, ribbons: F.ribbons, x: F.x, alt: F.alt };
  const k = RA, out = {};
  if (v.J.facing === J.facing && v.J.turned === J.turned) {
    for (const key in J) {
      const a = J[key], b = v.J[key];
      out[key] = Array.isArray(a) ? (b ? [lerp(b[0], a[0], k), lerp(b[1], a[1], k)] : a) : typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1.5 ? lerp(b, a, k) : a;
    }
  } else {
    // 转身那一帧：手脚不插（不然会往中间挤一下），整个人按髋的位置平移
    const dx = lerp(v.J.hip[0], J.hip[0], k) - J.hip[0], dy = lerp(v.J.hip[1], J.hip[1], k) - J.hip[1];
    for (const key in J) { const a = J[key]; out[key] = Array.isArray(a) ? [a[0] + dx, a[1] + dy] : a; }
  }
  const ribbons = F.ribbons.map((pts, i) => { const q = v.rb[i]; return pts.map((p, j) => q && q[j] ? { x: lerp(q[j].x, p.x, k), y: lerp(q[j].y, p.y, k) } : p); });
  return { J: out, ribbons, x: lerp(v.J.x, J.x, k), alt: lerp(v.J.alt, J.alt, k) };
}
// mid：画完身子、头以后，画前侧手脚之前调一下（腰带画在这里：箍在身上，但不盖住前面的手脚）
function drawSkeleton(J, color, alpha, back, grow, mid) {
  const g = grow || 0, k = THICK;
  const turned = J.turned, f = J.facing * (turned ? -1 : 1);
  const legs = turned ? [['fk', 'ff'], ['bk', 'bf']] : [['bk', 'bf'], ['fk', 'ff']];
  const arms = turned ? [['fe', 'fh'], ['be', 'bh']] : [['be', 'bh'], ['fe', 'fh']];
  ctx.fillStyle = color;
  const limbSet = (leg, arm) => {
    bone(J.hip, J[leg[0]], 7.5 * k + g, 6.2 * k + g); bone(J[leg[0]], J[leg[1]], 6.2 * k + g, 4.8 * k + g); footStub(J[leg[0]], J[leg[1]], f, g);
    bone(J.sh, J[arm[0]], 6 * k + g, 5 * k + g); bone(J[arm[0]], J[arm[1]], 5 * k + g, 4.2 * k + g);
    ctx.beginPath(); ctx.arc(J[arm[1]][0], J[arm[1]][1], FIST_R * k + g / 2, 0, Math.PI * 2); ctx.fill();   // 拳头（1.9.0 改小：4.8 → 3.5）
  };
  // 后侧肢体
  ctx.globalAlpha = alpha * back;
  limbSet(legs[0], arms[0]);
  ctx.globalAlpha = alpha;
  // 躯干与头
  bone(J.hip, J.neck, 10 * k + g, 8 * k + g);
  bone(J.neck, J.head, 5 * k + g, 5 * k + g);
  ctx.beginPath(); ctx.arc(J.head[0], J.head[1], BONE.head + g / 2, 0, Math.PI * 2); ctx.fill();
  if (mid) { mid(); ctx.fillStyle = color; ctx.globalAlpha = alpha; }
  // 前侧肢体
  limbSet(legs[1], arms[1]);
  ctx.globalAlpha = 1;
}
/* 腰带（2.0.2，Jack：底下那条飘带改成腰带，和头带一样是一箍「柱形」的带子）：横着箍在腰上（髋往上 9），
   跟着上身的方向转（弯腰、躺下都贴着身子），比身子宽一点点，看着是一圈缠在身上的；颜色和头带一样（身体色提亮的那一版） */
function drawBelt(J, col) {
  const h = J.hip, n = J.neck, dx = n[0] - h[0], dy = n[1] - h[1], L = Math.hypot(dx, dy) || 1;
  const half = (10 * THICK - 3.2 * THICK * 9 / BONE.torso) / 2 + 1;     // 那个高度身子的半宽（躯干从髋往脖子越来越细）+ 1
  ctx.save(); ctx.translate(h[0] + dx / L * 9, h[1] + dy / L * 9); ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = col; ctx.fillRect(-2.6, -half, 5.2, half * 2);
  ctx.restore();
}
function drawFighter(F, V) {
  V = V || viewOf(F);
  const J = V.J, P = pal(F);
  // 1.9.0 打击手感：刚挨打的人在打中停顿里左右抖几下
  const shake = F.hitShake > 0 && !reduceMotion ? (F.hitShake % 2 ? 1 : -1) * Math.min(3, F.hitShake * 0.5) : 0;
  if (shake) { ctx.save(); ctx.translate(shake, 0); }
  // 影子
  const sw = 38 * (1 - Math.min(V.alt, 200) / 320);
  ctx.fillStyle = 'rgba(23,24,26,.16)';
  ctx.beginPath(); ctx.ellipse(V.x + F.facing * F.disp.dx * 0.5, FLOOR + 3, F.state === 'down' || F.state === 'ko' ? 58 : sw, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  // 1.9.4 连招烧旺了（4 连起）：脚下烧红一片，一明一暗（2.0.1：自己的气的颜色；2.0.2 连得越多越大越亮）
  const heat = F.heat || 0;
  if (heat > 0.5 && !reduceMotion) {
    const k = Math.min(1, (heat - 0.5) / 0.8), R = 48 + 58 * k, a = (0.24 + 0.4 * k) * (0.85 + 0.15 * Math.sin(F.clock * 0.5));
    ctx.save(); ctx.translate(V.x, FLOOR + 2); ctx.scale(1, 0.2);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R), col = P.qi;
    gr.addColorStop(0, rgbaOf(col, a)); gr.addColorStop(0.55, rgbaOf(col, a * 0.5)); gr.addColorStop(1, rgbaOf(col, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // 气：火苗（在身体后面）
  drawQi(F, false);
  // 残影（2.0.1：自己的气的颜色，淡的，和真身分得开）
  for (const g of F.ghosts) drawSkeleton(g.J, P.qi, (g.dash ? 0.16 : 0.26) * RL(g) / 12, 1);
  // 轨迹：短拳细细一道墨（身体色）；重招一道粗的淡色（气的颜色），和短拳一眼分开
  let tr = F.trail;
  const m = F.move;
  if (tr.length > 1 && RA < 1 && tr[tr.length - 1].f === game.frame) {      // 这一帧刚加的那一点：插到拳头现在画在的地方
    const a = tr[tr.length - 2], b = tr[tr.length - 1];
    tr = tr.slice(0, -1).concat({ x: lerp(a.x, b.x, RA), y: lerp(a.y, b.y, RA), life: b.life });
  }
  if (tr.length > 1) {
    const heavy = m && m.def.heavy, special = m && (heavy || m.def.stamp || m.def.rush || m.def.tag);
    ctx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const u = i / tr.length;
      ctx.strokeStyle = special ? P.qi : F.color;
      ctx.globalAlpha = (heavy ? 0.62 : 0.5) * u * (RL(tr[i]) / 9);
      ctx.lineWidth = 1 + u * (heavy ? 12 : special ? 9 : 6);
      ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 发带（在身体后面）：两条从头带结上飘出去（2.0.2 起只有发带飘，腰上那条改成箍着的腰带，见 drawBelt）
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = F.sash;
  for (const pts of V.ribbons) {
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = 4.2 * (1 - i / pts.length * 0.7);
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
  }
  // 运气时身上一层半透明的光：爆气 / 泼墨 / 截拳 / 卸力 / 连招。只画模糊的影子、不画实心的边，所以是一团光而不是描边。
  // 1.9.4 连招的光：越连光越宽越亮（连得多再加一层更大的光晕），一胀一缩。2.0.1：自己的气的颜色（身体色的淡色），
  // 光比身子淡得多，身子的边照样清楚。2.0.2 连到后面光更宽更亮（气盛得明显）
  if (F.qiGlow > 0.04 && !reduceMotion) {
    const tf = ctx.getTransform(), s = Math.hypot(tf.a, tf.b), D = 6000, hk = Math.min(1, heat);
    const col = P.qi, pulse = 0.8 + 0.2 * Math.sin(F.clock * 0.45);
    const layer = (blur, alpha, grow) => {
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = blur * s; ctx.shadowOffsetX = D;
      ctx.translate(-D / s, 0);
      drawSkeleton(J, col, Math.min(1, alpha), 1, grow);
      ctx.restore();
    };
    layer(16 + 10 * hk, F.qiGlow * pulse * 0.85, 5 + 6 * hk);
    if (F.qiGlow > 0.6) layer(30 + 8 * hk, Math.min(1, (F.qiGlow - 0.45) * 0.7) * pulse, 12);   // 2.1 外面那层光淡一点、窄一点：火舌的形状要看得出来，别糊成一团雾
  }
  // 身子：平时一圈淡淡的墨影；身上气旺的时候（连招的火、泼墨、爆气）换成一圈纸色的亮边 —— 气是同色的，人身子的边要分得开（2.0.1）
  const aura = reduceMotion ? 0 : Math.max(F.qiGlow, Math.min(1, heat * 1.2));
  if (aura > 0.15) { const tf = ctx.getTransform(); ctx.shadowColor = `rgba(246,245,238,${(0.35 + 0.4 * Math.min(1, aura)).toFixed(2)})`; ctx.shadowBlur = 3.2 * Math.hypot(tf.a, tf.b); }
  else { ctx.shadowColor = 'rgba(23,24,26,.35)'; ctx.shadowBlur = 2.5; }
  drawSkeleton(J, F.color, 1, 0.62, 0, () => drawBelt(J, F.sash));
  ctx.shadowBlur = 0;
  if (F.hitFlash > 0) drawSkeleton(J, '#fbfaf3', 0.62 * F.hitFlash / 3, 1);   // 挨打那一下身上白闪
  // 头带 + 眼
  const ht = J.headTilt, hx = J.head[0], hy = J.head[1], fdir = J.facing;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(fdir * (J.rot + ht)); ctx.scale(fdir, 1);
  ctx.fillStyle = F.sash; ctx.fillRect(-13.5, -6.8, 27, 5);
  if (!J.turned) { ctx.fillStyle = C.paper; ctx.beginPath(); ctx.ellipse(6.8, 1.6, 2.8, 1.4, -0.15, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // 气：火星（在身体前面）
  drawQi(F, true);
  // 势破标记（是对面挡出来的：对面的颜色）
  if (F.slowJab > 0 && F.state !== 'down' && F.state !== 'ko') {
    const a = F.slowJab / SLOW_JAB_FRAMES, oc = F.opp ? F.opp.color : C.cin;
    ctx.strokeStyle = oc; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(hx, hy - 30, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * a); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = oc; ctx.font = `13px ${BRUSH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('势', hx, hy - 29);
  }
  if (shake) ctx.restore();
}
function drawFx() {
  ctx.lineCap = 'round';
  for (const s of splats) {
    ctx.globalAlpha = 0.55 * Math.min(1, RL(s) / 60);
    ctx.fillStyle = s.color || C.ink; ctx.beginPath(); ctx.ellipse(s.x, FLOOR + 1.5, s.rx, s.rx * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const e of FX) {
    const L = RL(e), u = clamp(1 - L / e.max, 0, 1), x = RX(e), y = RY(e);
    switch (e.type) {
      case 'drop': {
        // 墨点：水滴形，顺着速度拖一条尾巴（1.9.0 以前是圆点）
        ctx.globalAlpha = Math.min(1, L / 20); ctx.fillStyle = e.color;
        const sp = Math.hypot(e.vx, e.vy), ang = Math.atan2(e.vy, e.vx), Lt = e.r + Math.min(16, sp * 1.8);
        ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * Lt, y - Math.sin(ang) * Lt);
        ctx.arc(x, y, e.r, ang - Math.PI / 2, ang + Math.PI / 2); ctx.closePath(); ctx.fill(); break;
      }
      case 'spark': {
        // 火花：按速度拉长的亮线，外面是打的人的颜色、里面一道浅色的芯
        const a = Math.min(1, L / 6), sp = Math.hypot(e.vx, e.vy) || 1, Lt = Math.min(36, sp * 3.2 + 4);
        const ux = e.vx / sp, uy = e.vy / sp;
        ctx.globalAlpha = a; ctx.strokeStyle = e.color; ctx.lineWidth = e.w * (0.45 + 0.55 * a);
        ctx.beginPath(); ctx.moveTo(x - ux * Lt, y - uy * Lt); ctx.lineTo(x, y); ctx.stroke();
        ctx.strokeStyle = tint(e.color); ctx.lineWidth = e.w * 0.38;
        ctx.beginPath(); ctx.moveTo(x - ux * Lt * 0.45, y - uy * Lt * 0.45); ctx.lineTo(x, y); ctx.stroke(); break;
      }
      case 'star': {
        // 冲击星：尖刺往外窜出去再收，中间一团纸白的爆闪（带边）
        const g = EASE.out(Math.min(1, u * 2.4)), r0 = e.size * 0.1;
        ctx.globalAlpha = 1 - u * u; ctx.fillStyle = e.color;
        for (const s of e.spikes) {
          const Ls = e.size * s.len * (0.3 + 0.7 * g), w = e.size * s.w * (1 - u * 0.75), ca = Math.cos(s.a), sa = Math.sin(s.a);
          ctx.beginPath(); ctx.moveTo(x + ca * r0 - sa * w, y + sa * r0 + ca * w); ctx.lineTo(x + ca * Ls, y + sa * Ls);
          ctx.lineTo(x + ca * r0 + sa * w, y + sa * r0 - ca * w); ctx.closePath(); ctx.fill();
        }
        if (u < 0.5) {
          const R = e.size * 0.36 * (0.55 + g * 0.6), n = e.core.length;
          ctx.globalAlpha = 1 - u * 2;
          ctx.beginPath();
          for (let i = 0; i < n; i++) { const a = e.rot + i / n * Math.PI * 2, r = R * (i % 2 ? e.core[i] * 0.5 : e.core[i]); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
          ctx.closePath(); ctx.fillStyle = '#fbfaf3'; ctx.fill(); ctx.strokeStyle = e.color; ctx.lineWidth = 1.8; ctx.stroke();
        }
        break;
      }
      case 'swipe': {
        // 笔刷扫痕：先很快扫出去，再慢慢淡掉；两头尖中间粗
        const n = 20, span = (e.a1 - e.a0) * Math.min(1, u * 3.4), wk = e.w * (1 - u * 0.5);
        ctx.globalAlpha = (1 - u) * 0.92; ctx.fillStyle = e.color;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const a = e.a0 + span * i / n; ctx.lineTo(x + Math.cos(a) * e.r, y + Math.sin(a) * e.r); }
        for (let i = n; i >= 0; i--) { const t = i / n, a = e.a0 + span * t, r = e.r - wk * Math.sin(Math.PI * t); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); break;
      }
      case 'focus': {
        // 集中线：外头粗、往打中的地方收尖
        ctx.globalAlpha = (1 - u) * 0.75; ctx.fillStyle = e.color;
        for (const l of e.ls) {
          const r1 = l.r * (1 + u * 0.2), r0 = e.r0 * 0.5 + (l.r - e.r0 * 0.5) * (0.1 + u * 0.45), ca = Math.cos(l.a), sa = Math.sin(l.a);
          ctx.beginPath(); ctx.moveTo(x + ca * r1 - sa * l.w, y + sa * r1 + ca * l.w); ctx.lineTo(x + ca * r0, y + sa * r0);
          ctx.lineTo(x + ca * r1 + sa * l.w, y + sa * r1 - ca * l.w); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'crack': {
        // 地裂：一笔一笔裂出去，慢慢淡掉
        ctx.globalAlpha = Math.min(1, L / 10) * 0.8; ctx.strokeStyle = e.color; ctx.lineWidth = 2.2; ctx.lineJoin = 'miter';
        const g = Math.min(1, u * 5);
        for (const pts of e.ls) {
          const m = 1 + Math.floor((pts.length - 1) * g);
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i <= m && i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.stroke();
        }
        ctx.lineJoin = 'round'; break;
      }
      case 'line': {
        const r1 = e.len * (0.15 + u * 0.55), r2 = e.len * (0.5 + u * 0.5);
        ctx.globalAlpha = 1 - u; ctx.strokeStyle = e.color; ctx.lineWidth = e.w * (1 - u) + 0.4;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(e.ang) * r1, y + Math.sin(e.ang) * r1); ctx.lineTo(x + Math.cos(e.ang) * r2, y + Math.sin(e.ang) * r2); ctx.stroke(); break;
      }
      case 'ring': {
        // 断开的环（1.9.0：四段弧、中间有缺口，越往外缺口越大，比一个整圆有冲劲）
        const r = e.r0 + (e.r1 - e.r0) * EASE.out(u), rot = (e.x * 0.37 + e.y * 0.11) % 6.28, gap = 0.18 + u * 0.5;
        ctx.globalAlpha = 1 - u; ctx.strokeStyle = e.color; ctx.lineWidth = e.w * (1 - u) + 0.5;
        for (let k = 0; k < 4; k++) {
          const a0 = rot + k * Math.PI / 2 + gap, a1 = rot + (k + 1) * Math.PI / 2 - gap;
          ctx.beginPath(); ctx.ellipse(x, y, r, r * e.sy, 0, a0, a1); ctx.stroke();
        }
        break;
      }
      case 'arc': {
        ctx.strokeStyle = e.color; const n = 14;
        for (let i = 0; i < n; i++) {
          const a0 = e.a0 + (e.a1 - e.a0) * i / n, a1 = e.a0 + (e.a1 - e.a0) * (i + 1) / n;
          ctx.globalAlpha = (1 - u) * 0.9; ctx.lineWidth = e.w * Math.sin(Math.PI * (i + 0.5) / n) * (1 - u * 0.6) + 0.5;
          ctx.beginPath(); ctx.arc(x, y, e.r * (1 + u * 0.15), a0, a1); ctx.stroke();
        }
        break;
      }
      case 'streak': {
        const g = EASE.out(Math.min(1, u * 2.5));
        ctx.globalAlpha = 1 - u; ctx.strokeStyle = e.color; ctx.lineWidth = e.w * (1 - u * 0.7);
        ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x1 + (e.x2 - e.x1) * g, e.y1 + (e.y2 - e.y1) * g); ctx.stroke(); break;
      }
      case 'swirl': {
        ctx.strokeStyle = e.color;
        for (let k = 0; k < 3; k++) {
          const st = -u * 6 * e.dir + k * 2.1;
          ctx.globalAlpha = (1 - u) * (0.8 - k * 0.2); ctx.lineWidth = (8 - k * 2) * (1 - u) + 0.6;
          ctx.beginPath(); ctx.ellipse(x, y, e.r * (0.8 + u * 0.3), e.r * 0.42 * (0.8 + u * 0.3), 0, st, st + 1.8); ctx.stroke();
        }
        break;
      }
      case 'dust':
        ctx.globalAlpha = 0.22 * (L / e.max); ctx.fillStyle = C.dust;
        ctx.beginPath(); ctx.arc(x, y, e.r, 0, Math.PI * 2); ctx.fill(); break;
      case 'tag':
        drawTag(e, x, y, Math.min(1, L / 14)); break;
    }
  }
  ctx.globalAlpha = 1;
}
// 飘字（2.0.1）：字是归属那个人的身体色，外面一圈淡淡的纸色描边（深色场景、叠在人身上都看得清）。
// cols 两个 = 两人各半（左半边左边那个人的颜色）；parts = 分段各自的颜色（「挡 -3」）
function drawTag(e, x, y, a) {
  ctx.globalAlpha = a; ctx.font = `${e.size}px ${BRUSH}`; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2.5, e.size * 0.17); ctx.strokeStyle = 'rgba(244,243,236,.72)';
  if (e.parts) {
    const ws = e.parts.map(p => ctx.measureText(p[0]).width);
    let px = x - ws.reduce((s, w) => s + w, 0) / 2;
    ctx.textAlign = 'left';
    e.parts.forEach((p, i) => { ctx.strokeText(p[0], px, y); ctx.fillStyle = p[1]; ctx.fillText(p[0], px, y); px += ws[i]; });
  } else {
    ctx.textAlign = 'center'; ctx.strokeText(e.text, x, y);
    if (e.cols.length > 1) {
      const w = ctx.measureText(e.text).width + e.size, h = e.size * 1.6;
      for (let i = 0; i < 2; i++) {
        ctx.save(); ctx.beginPath(); ctx.rect(i ? x : x - w / 2, y - h / 2, w / 2, h); ctx.clip();
        ctx.fillStyle = e.cols[i]; ctx.fillText(e.text, x, y); ctx.restore();
      }
    } else { ctx.fillStyle = e.cols[0]; ctx.fillText(e.text, x, y); }
  }
  ctx.textAlign = 'center';
}
const SEAL_K = 0.86;                                 // 2.0.2（Jack：印章小一点点）：所有印章按这个比例缩
function drawSeal(x, y, text, size, rot, alpha, sc, specks, col) {
  size *= SEAL_K;
  const n = text.length;
  const cols = n >= 4 ? 2 : 1, rows = n >= 4 ? Math.ceil(n / 2) : n;
  const w = cols * size + size * 0.36, h = rows * size + size * 0.36;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.globalAlpha = alpha;
  ctx.fillStyle = col || C.cin;                      // 2.0.1：底板是出招那个人的身体色（以前一律朱红）
  const r = size * 0.12;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, r) : ctx.rect(-w / 2, -h / 2, w, h); ctx.fill();
  ctx.strokeStyle = 'rgba(235,234,226,.85)'; ctx.lineWidth = size * 0.06;
  ctx.strokeRect(-w / 2 + size * 0.1, -h / 2 + size * 0.1, w - size * 0.2, h - size * 0.2);
  ctx.fillStyle = C.paper; ctx.font = `${size * 0.9}px ${BRUSH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const col = Math.floor(i / rows), row = i % rows;
    const cx = ((cols - 1) / 2 - col) * size, cy = (row - (rows - 1) / 2) * size;
    ctx.fillText(text[i], cx, cy + size * 0.05);
  }
  if (specks) { ctx.fillStyle = C.paper; for (const [sx, sy, sr] of specks) { ctx.beginPath(); ctx.arc(sx * w, sy * h, sr, 0, Math.PI * 2); ctx.fill(); } }
  ctx.restore();
}
function drawStamps() {
  const zz = camZ * (1 + (reduceMotion ? 0 : game.punch || 0)), top = FLOOR + (120 - FY - camLift * zz) / zz;   // 印章别盖到上面的血条
  for (const e of FX) {
    if (e.type !== 'stamp') continue;
    const L = RL(e), age = e.max - L;
    const sc = age < 6 ? 1.7 - 0.7 * EASE.out(Math.max(0, age) / 6) : 1;
    const a = clamp(age / 4, 0, 1) * Math.min(1, L / 18);
    drawSeal(clamp(e.x, camX - VW / (2 * camZ) + 50, camX + VW / (2 * camZ) - 50), Math.max(top, e.y), e.text, e.size, e.rot, a, sc, e.specks, e.col);
  }
  ctx.globalAlpha = 1;
}
function drawOverlayFx() {
  for (const e of FX) {
    if (e.type === 'announce') {
      const L = RL(e), age = Math.max(0, e.max - L);
      const sc = age < 10 ? 1.35 - 0.35 * EASE.out(age / 10) : 1 + (age - 10) * 0.0012;
      const a = Math.min(1, age / 6) * Math.min(1, L / 14);
      ctx.save(); ctx.translate(VW / 2, VH * 0.425); ctx.scale(sc, sc); ctx.globalAlpha = a;
      ctx.font = `${e.size}px ${BRUSH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(235,234,226,.6)'; ctx.fillText(e.text, 3, 3);
      ctx.fillStyle = e.col || C.ink; ctx.fillText(e.text, 0, 0);
      if (e.sub) { ctx.font = `30px ${BRUSH}`; ctx.fillStyle = C.cin; ctx.fillText(e.sub, 0, e.size * 0.62); }
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
function hpBar(F, side) {
  const x0 = side < 0 ? 46 : VW - 46, len = 470, y = 26, h = 18;
  const dir = side < 0 ? 1 : -1;
  const pts = side < 0 ? [[x0, y], [x0 + len, y], [x0 + len - 12, y + h], [x0 + 8, y + h]] : [[x0, y], [x0 - len, y], [x0 - len + 12, y + h], [x0 - 8, y + h]];
  const path = () => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); };
  ctx.save(); path(); ctx.fillStyle = 'rgba(220,218,208,.92)'; ctx.fill(); ctx.clip();
  ctx.fillStyle = 'rgba(184,50,29,.45)';
  const lw = len * F.lagHp / F.maxHp, w = len * Math.max(0, F.hp) / F.maxHp;
  ctx.fillRect(dir > 0 ? x0 : x0 - lw, y, lw, h);
  ctx.fillStyle = F.color; ctx.fillRect(dir > 0 ? x0 : x0 - w, y, w, h);
  ctx.fillStyle = 'rgba(235,234,226,.16)'; ctx.fillRect(dir > 0 ? x0 : x0 - w, y + 2, w, 4);
  ctx.restore();
  path(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2.2; ctx.stroke();
  // 气（两格：半格可爆气，满格可泼墨）
  const ql = 250, qy = 48, qh = 6, qx = dir > 0 ? x0 + 8 : x0 - 8 - ql;
  const qw = ql * F.qi / QI_MAX, full = F.qi >= QI_MAX, half = F.qi >= QI_BURST;
  ctx.fillStyle = 'rgba(23,24,26,.12)'; ctx.fillRect(qx, qy, ql, qh);
  ctx.globalAlpha = full ? 0.7 + 0.3 * Math.sin(F.clock * 0.3) : 0.9;
  const P = pal(F);                                                     // 2.0.1 气条：自己的气的颜色，满了用提亮的那一版一闪一闪
  ctx.fillStyle = full ? P.fx : P.qi; ctx.fillRect(dir > 0 ? qx : qx + ql - qw, qy, qw, qh);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(23,24,26,.55)'; ctx.lineWidth = 1; ctx.strokeRect(qx, qy, ql, qh);
  ctx.fillStyle = C.ink; ctx.fillRect(qx + ql / 2 - 1, qy - 2, 2, qh + 4);
  ctx.textBaseline = 'middle'; ctx.textAlign = side < 0 ? 'left' : 'right';
  ctx.font = `15px ${BRUSH}`; ctx.fillStyle = half ? F.color : '#55564f';
  ctx.fillText(full ? '气满 · 可泼墨' : half ? '气 · 可爆气' : '气', dir > 0 ? qx + ql + 8 : qx - 8, qy + 3);
  // 名字
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = side < 0 ? 'left' : 'right';
  ctx.fillStyle = F.color; ctx.font = `30px ${BRUSH}`;
  ctx.fillText(F.name, x0 + dir * 2, 78);
  const nmW = ctx.measureText(F.name).width;
  ctx.font = `500 13px ${UIF}`; ctx.fillStyle = '#55564f';
  ctx.fillText(F.label, x0 + dir * (nmW + 10), 74);
  ctx.textAlign = 'center';
  // 回合胜点（五局三胜：三个点）
  for (let i = 0; i < WIN_ROUNDS; i++) {
    const cx = x0 + dir * (len - 14 - i * 20), cy = 64;
    ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
    if (game.wins[F.idx] > i) { ctx.fillStyle = F.color; ctx.fill(); }
    else { ctx.strokeStyle = 'rgba(23,24,26,.45)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  // 连击
  if (F.combo >= 2 && F.comboT > 0) {
    const a = Math.min(1, F.comboT / 20);
    ctx.globalAlpha = a; ctx.textAlign = side < 0 ? 'left' : 'right';
    const num = String(F.combo);
    ctx.font = `46px ${BRUSH}`; const nw = ctx.measureText(num).width;
    ctx.font = `22px ${BRUSH}`; const lw = ctx.measureText('连击').width;
    const left = side < 0 ? x0 + 2 : x0 - 2 - lw - 8 - nw;
    ctx.textAlign = 'left';
    ctx.font = `46px ${BRUSH}`; ctx.fillStyle = F.color; ctx.fillText(num, left, 128);          // 2.0.1 连击数：连的那个人的颜色
    ctx.font = `22px ${BRUSH}`; ctx.fillStyle = F.color; ctx.fillText('连击', left + nw + 8, 126);
    ctx.globalAlpha = 1;
  }
}
function drawHud() {
  const [a, b] = game.p;
  hpBar(a, -1); hpBar(b, 1);
  // 计时（双人对战不限时，显示 ∞）
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(VW / 2, 40, 29, 0, Math.PI * 2); ctx.fill();
  const frac = game.endless ? 1 : game.timer / ROUND_FRAMES;
  ctx.strokeStyle = C.cin; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(VW / 2, 40, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
  ctx.fillStyle = C.paper; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (game.endless) { ctx.font = `600 34px ${UIF}`; ctx.fillText('∞', VW / 2, 38); }
  else { const sec = String(Math.ceil(game.timer / 60)); ctx.font = `${sec.length > 2 ? 27 : 34}px ${BRUSH}`; ctx.fillText(sec, VW / 2, 42); }
  ctx.font = `16px ${BRUSH}`; ctx.fillStyle = C.ink;
  if (game.mode === 'train') { if (Drill.cur) drawDrillPanel(); else drawTrainPanel(); }
  else ctx.fillText(roundName(), VW / 2, 88);
}
// 画布上的字按宽度折行
function wrapText(text, maxW) {
  const out = []; let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch === ' ' ? '' : ch; }
    else line += ch;
  }
  if (line) out.push(line);
  return out;
}
// 2.1 破招练习的面板：这一课是什么、怎么破（按你自己的键位）、成功几次了、上一遍怎么样；演示时写「演示」
function drawDrillPanel() {
  const c = Drill.cur, d = c.def;
  const x = VW / 2 - 280, y = 80, w = 560, pad = 14;
  ctx.font = `500 13px ${UIF}`;
  const how = wrapText('怎么破：' + d.how.map(t => drillText(t, false)).join('；'), w - pad * 2).slice(0, 3);
  const showLast = c.last && c.frame - c.lastT < 240;
  const h = 46 + how.length * 19 + (showLast ? 26 : 0) + 22;
  ctx.fillStyle = 'rgba(235,234,226,.88)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = c.demo ? C.cin : 'rgba(23,24,26,.35)'; ctx.lineWidth = c.demo ? 2 : 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = `19px ${BRUSH}`; ctx.fillStyle = C.cin; ctx.fillText(c.demo ? '演示' : '破招', x + pad, y + 18);
  const tw = ctx.measureText(c.demo ? '演示' : '破招').width;
  ctx.font = `19px ${BRUSH}`; ctx.fillStyle = C.ink; ctx.fillText(`${d.topicName}：${d.name}`, x + pad + tw + 10, y + 18);
  ctx.textAlign = 'right'; ctx.font = `600 13px ${UIF}`;
  if (c.demo) { ctx.fillStyle = C.cin; ctx.fillText('电脑替你按 · 看准时机 · Esc 跳过', x + w - pad, y + 18); }
  else {
    ctx.fillStyle = c.passed ? C.cin : '#55564f';
    ctx.fillText(`成功 ${Math.min(c.ok, d.need)} / ${d.need}` + (c.passed ? '  ✓ 过关' : ''), x + w - pad, y + 18);
  }
  ctx.textAlign = 'left'; ctx.font = `500 13px ${UIF}`; ctx.fillStyle = '#3e3f3a';
  how.forEach((l, i) => ctx.fillText(l, x + pad, y + 44 + i * 19));
  let yy = y + 44 + how.length * 19;
  if (showLast) {
    ctx.font = `600 14px ${UIF}`; ctx.fillStyle = c.last.ok ? C.indigo : C.cin;
    ctx.fillText((c.last.ok ? '✓ ' : '✗ ') + drillText(c.last.text, false), x + pad, yy + 6); yy += 26;
  }
  ctx.font = `500 11.5px ${UIF}`; ctx.fillStyle = '#7a7b74';
  ctx.fillText(c.demo ? '演示放两遍就回到说明' : '下面「说明」随时再看完整说明 · Esc 暂停', x + pad, yy + 4);
}
// 训练场（2.0.2 以前叫「打桩练习」）的数值面板
function drawTrainPanel() {
  const P = game.p[0], D = game.p[1], I = P.info;
  const x = VW / 2 - 215, y = 82, w = 430, h = 146;
  ctx.fillStyle = 'rgba(235,234,226,.84)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(23,24,26,.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = `18px ${BRUSH}`; ctx.fillStyle = C.cin; ctx.fillText('训练场', x + 12, y + 15);
  ctx.font = `500 12px ${UIF}`; ctx.fillStyle = '#6b6c66'; ctx.textAlign = 'right';
  ctx.fillText(`木桩 ${Math.max(0, Math.round(D.hp))} / ${D.maxHp} · 三成以下回满`, x + w - 12, y + 15); ctx.textAlign = 'left';
  const row = (k, v, yy, col) => {
    ctx.font = `500 13px ${UIF}`; ctx.fillStyle = '#6b6c66'; ctx.fillText(k, x + 14, yy);
    ctx.font = `500 15px ${UIF}`; ctx.fillStyle = col || C.ink; ctx.fillText(v, x + 62, yy);
  };
  if (!I) row('提示', '随便打。下面的按钮能换木桩的动作、开无限气', y + 42);
  else {
    const fd = I.S != null ? `前摇 ${I.S} · 判定 ${I.A} · 后摇 ${I.R}` : '';
    const sys = I.tier ? `（${TIER_NAME[I.lead] || ''}·${TIER_NAME[I.tier] || ''}）` : '';
    row('招式', `${I.label}${sys}  ${fd}`, y + 40);
    // why：为什么（谁克谁、对方为什么没挡住、为什么没抓到）—— 讲规则的字只在这里写，不飘在人身上（1.9.2）
    row('这下', `${I.how}${I.dmg > 0 ? '  -' + I.dmg : ''}${I.why ? '　' + I.why : ''}`, y + 62, I.how === '被挡' ? C.indigo : C.ink);
    const adv = I.down ? '击倒' : I.adv == null ? '—' : (I.adv > 0 ? '+' : '') + I.adv + ' 帧' + (I.adv > 0 ? '（你先动）' : I.adv < 0 ? '（对方先动）' : '（一起动）');
    row('帧差', adv, y + 84, I.adv > 0 || I.down ? C.cin : C.ink);
  }
  const pc = P.prevCombo && P.prevCombo.hits >= 2 ? `  ｜ 上一套 ${P.prevCombo.hits} 下 · ${P.prevCombo.dmg}` : '';
  row('连击', `这一套 ${P.combo} 下 · ${P.comboDmg}${pc}`, y + 106);
  row('最高', `一套最多打掉 ${P.maxComboDmg}`, y + 128, '#55564f');
}
/* ---------- 镜头（1.8.0） ----------
   双人对战（和菜单背景）：两人都要在画面里 —— 照两人中间，离得远就拉远（最远 ZOOM_PVP_MIN），近了放大到 ZOOM。
   人机 / 联机 / 打桩：镜头放大到 ZOOM、跟着自己。两人放得下就照中间；放不下就让自己靠边、朝对手那边多留地方，
   对手在画面外时画面边上画个箭头指着他。镜头只是画面，不进战斗逻辑（联机两边各看各的） */
// 2.0：画面比 2:1 宽 / 高时按实际画面宽 VW 算；画面高（地线往下挪了）再放大一点 zoomBoost。
// 镜头上抬 camLift（2.0）：有人跳得高（千斤坠腾起来）时镜头往上挪一点，头不顶到血条；只是画面
let camX = STAGE_W / 2, camZ = ZOOM, camLift = 0;
const localIdx = () => game.mode === 'online' && typeof Net !== 'undefined' && Net.role === 'guest' ? 1 : 0;
function camGoal(mode, a, b, local) {
  const zTop = ZOOM * zoomBoost();
  if (mode === 'pvp' || mode === 'attract') {
    const top = mode === 'attract' ? ZOOM_PVP_MIN * zoomBoost() : zTop;       // 菜单背景不放大（不挡菜单按钮）
    const zoom = clamp(VW / (Math.abs(a.x - b.x) + 2 * CAM_MARGIN), ZOOM_PVP_MIN, top), half = VW / (2 * zoom);
    return { x: clamp((a.x + b.x) / 2, half, STAGE_W - half), zoom };
  }
  const me = local ? b : a, op = local ? a : b, half = VW / (2 * zTop), dx = op.x - me.x;
  const x = Math.abs(dx) + 2 * CAM_MARGIN <= 2 * half ? (a.x + b.x) / 2 : me.x + Math.sign(dx) * (half - CAM_MARGIN);
  return { x: clamp(x, half, STAGE_W - half), zoom: zTop };
}
// 对手在画面外：画面边上一个他颜色的箭头 + 名字 + 离多远
function drawOffscreen(me, op) {
  const sx = VW / 2 + (op.x - camX) * camZ;
  if (sx > -8 && sx < VW + 8) return;
  const right = sx >= VW + 8, x = right ? VW - 26 : 26, y = FY - 150 * camZ;
  ctx.save(); ctx.translate(x, y); ctx.scale(right ? 1 : -1, 1);
  ctx.fillStyle = 'rgba(235,234,226,.8)'; ctx.beginPath(); ctx.arc(-8, 0, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = op.color; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -15); ctx.lineTo(-3, 0); ctx.lineTo(-8, 15); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = op.color; ctx.font = `20px ${BRUSH}`; ctx.fillText(op.name, x + (right ? -6 : 6), y + 44);
  ctx.fillStyle = '#55564f'; ctx.font = `500 12px ${UIF}`; ctx.fillText(Math.round(Math.abs(op.x - me.x) / 10) * 10 + '', x + (right ? -6 : 6), y + 64);
}
let lastRT = 0, shakeF = -1, shX = 0, shY = 0;
function render() {
  ctx.setTransform(pxr * scale, 0, 0, pxr * scale, 0, 0);
  // 2.0.1：镜头的平滑按真实时间算（以前每画一次挪一截，144Hz 的屏幕上镜头比人走得勤，人看着一抖一抖）
  const now = performance.now(), rdt = lastRT ? clamp(now - lastRT, 0, 100) : STEP_MS; lastRT = now;
  const ease = k => 1 - Math.pow(1 - k, rdt / STEP_MS);
  if (game.frame !== shakeF) {                        // 震屏每一帧（逻辑帧）换一次位置，不是每画一次换一次
    shakeF = game.frame;
    shX = game.shake > 0.3 && !reduceMotion ? rnd(-1, 1) * game.shake : 0; shY = game.shake > 0.3 && !reduceMotion ? rnd(-1, 1) * game.shake * 0.6 : 0;
  }
  const sx = shX, sy = shY;
  const [a, b] = game.p, va = viewOf(a), vb = viewOf(b);
  const goal = camGoal(game.mode, va, vb, localIdx());
  camZ += (goal.zoom - camZ) * ease(0.08); camX += (goal.x - camX) * ease(0.12);
  const half = VW / (2 * camZ);
  camX = clamp(camX, half, STAGE_W - half);
  // 镜头上抬：两人里飞得最高的离地超过 30 才抬，最多抬 48（场地像素）
  camLift += (clamp((Math.max(va.alt, vb.alt) - 30) * 0.35, 0, 48) - camLift) * ease(0.1);
  Stage.use(Stage.forMode(game.mode), viewInfo());
  ctx.save(); ctx.translate(sx, sy);
  const zz = camZ * (1 + (reduceMotion ? 0 : game.punch || 0));     // 重击时镜头往里推一下（1.9.0，只是画面）
  Stage.drawBack(ctx, camX, viewInfo(), camLift * zz);
  ctx.translate(VW / 2, FY + camLift * zz); ctx.scale(zz, zz); ctx.translate(-camX, -FLOOR);
  Stage.drawGround(ctx);
  const order = (b.state === 'attack' && a.state !== 'attack') ? [[a, va], [b, vb]] : [[b, vb], [a, va]];
  drawFighter(...order[0]); drawFighter(...order[1]);
  drawFx();
  drawStamps();
  ctx.restore();
  if (game.flash > 0.01) { ctx.fillStyle = `rgba(245,244,238,${game.flash})`; ctx.fillRect(0, 0, VW, VH); }
  if (game.mode === 'pve' || game.mode === 'online' || game.mode === 'train') { const li = localIdx(); drawOffscreen(game.p[li], game.p[1 - li]); }
  if (game.mode !== 'attract') drawHud();
  if (!game.paused) drawOverlayFx();
  if (game.mode === 'online') drawNetStatus();
  if (game.mode !== 'attract' && Sound.asleep()) drawSoundHint();
}
// 浏览器把声音挂起了：提示一下（按任意键就会叫醒，见 fx.js Sound.wake）
function drawSoundHint() {
  const t = '声音被浏览器暂停了 · 按任意键或点一下画面就恢复';
  ctx.font = `500 13px ${UIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(t).width + 24;
  ctx.fillStyle = 'rgba(23,24,26,.72)'; ctx.fillRect(16, VH - 46, w, 26);
  ctx.fillStyle = C.paper; ctx.fillText(t, 28, VH - 33);
}
// 浅一点的同色（火花的芯、旺火的火心）：和纸色按六成混
const tints = {};
function tint(col) {
  if (tints[col]) return tints[col];
  const n = parseInt(col.slice(1), 16), mix = v => Math.round(v + (250 - v) * 0.6);
  return (tints[col] = `rgb(${mix(n >> 16 & 255)},${mix(n >> 8 & 255)},${mix(n & 255)})`);
}
// #rrggbb + 透明度 → rgba(...)（1.9.4 连招脚下烧红那一片用）
const rgbaOf = (col, a) => { const n = parseInt(col.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
// 火苗（1.9.0；2.1 重画）：一条往上收尖的火舌，底下浓、往上淡，里面一道浅色的芯；hot = 旺火（连招连得多），芯更亮更大。
// 2.1（Jack：形状像火）：四种火舌随机挑 —— 边上带一两个小火叉、尖头歪向一边、有的细长打个弯，看着是一团一团跳动的火，不是一滴一滴的水
const FLAME_SHAPES = [
  { w: 13, tip: [3, 2], forks: [[-1, 0.42, 20]] },
  { w: 14, tip: [0, 5], forks: [[-1, 0.48, 18], [1, 0.38, 15]] },
  { w: 10, tip: [-4, 1], bend: 4, forks: [] },
  { w: 15, tip: [5, 7], forks: [[1, 0.52, 22], [-1, 0.3, 12]] },
];
const flameSprites = {};
function flameSprite(col, hot, v) {
  const key = col + (hot ? '*' : '') + (v || 0);
  if (flameSprites[key]) return flameSprites[key];
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const g = c.getContext('2d'), n = parseInt(col.slice(1), 16), rgb = `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`;
  const S = FLAME_SHAPES[v || 0];
  const fill = (top, a) => {
    const gr = g.createLinearGradient(0, 64, 0, top);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.5, `rgba(${rgb},${a * 0.72})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fill();
  };
  // 主火舌：底下圆、两边鼓、往上收成一个歪着的尖（bend：中间打个弯）
  const w = S.w, tx = 16 + S.tip[0], ty = S.tip[1], b = S.bend || 0;
  g.beginPath(); g.moveTo(16, 62);
  g.bezierCurveTo(16 - w, 60, 16 - w * 1.05 + b, 38, 16 - w * 0.35 + b, ty + 22);
  g.quadraticCurveTo(tx - 3 - b, ty + 9, tx, ty);
  g.quadraticCurveTo(tx + 1 - b, ty + 12, 16 + w * 0.4 + b, ty + 24);
  g.bezierCurveTo(16 + w * 1.08 + b, 40, 16 + w, 60, 16, 62);
  fill(ty, 0.9);
  const dk = v2 => Math.round(v2 * 0.72), rim = `${dk(n >> 16 & 255)},${dk(n >> 8 & 255)},${dk(n & 255)}`;
  const sg = g.createLinearGradient(0, 64, 0, ty); sg.addColorStop(0, `rgba(${rim},.55)`); sg.addColorStop(0.7, `rgba(${rim},.25)`); sg.addColorStop(1, `rgba(${rim},0)`);
  g.strokeStyle = sg; g.lineWidth = 1.4; g.stroke();                       // 2.1 边上一道深一点的墨线：一条一条火舌分得开
  // 小火叉：从火舌的一边斜着窜出去的小尖
  for (const [side, at, hh] of S.forks) {
    const by = 62 - at * 50, bx = 16 + side * w * 0.55, tipx = bx + side * 7, tipy = by - hh;
    g.beginPath(); g.moveTo(bx - side * 4, by + 6);
    g.quadraticCurveTo(bx + side * 6, by - hh * 0.35, tipx, tipy);
    g.quadraticCurveTo(bx + side * 1, by - hh * 0.3, bx - side * 5, by - 2);
    g.closePath(); fill(tipy, 0.7);
  }
  // 芯：下半截一道浅色的
  const m = v2 => Math.round(v2 + (250 - v2) * (hot ? 0.75 : 0.5));
  const core = `${m(n >> 16 & 255)},${m(n >> 8 & 255)},${m(n & 255)}`, ct = hot ? 24 : 32;
  g.beginPath(); g.moveTo(16, 61); g.bezierCurveTo(10, 56, 10.5 + b * 0.5, 42, 16 + S.tip[0] * 0.4, ct); g.bezierCurveTo(21.5 + b * 0.5, 42, 22, 56, 16, 61);
  const gr = g.createLinearGradient(0, 64, 0, ct); gr.addColorStop(0, `rgba(${core},${hot ? 0.95 : 0.7})`); gr.addColorStop(1, `rgba(${core},0)`);
  g.fillStyle = gr; g.fill();
  return (flameSprites[key] = c);
}
// 气的粒子。front = false 画身后的火苗，true 画身前的火星
function drawQi(F, front) {
  for (const p of QI) {
    // 火苗画在身后，火星画在身前；1.9.4 连招烧旺了，有一部分火苗（fr）烧到身前
    if (p.f !== F.idx || (p.k === 'flame' && !p.fr) === front) continue;
    const u = clamp(1 - RL(p) / p.max, 0, 1), col = p.col || pal(F).qi, x = RX(p), y = RY(p);   // col：自己的气的颜色（2.0.1，fx.js emitQi）
    if (p.k === 'flame') {
      ctx.globalAlpha = Math.min(1, p.a * Math.min(1, u * 5) * (1 - u) * 2.4) * (p.fr ? 0.3 : 1);
      // 2.1 火舌的尖顺着它飘的方向（往上冒就朝上，斜着拖就朝后上），一抖一抖；飘得快就拉长一点
      const sp = Math.hypot(p.vx, p.vy), ang = sp > 0.05 ? Math.atan2(p.vy, p.vx) + Math.PI / 2 : 0;
      const r = p.r, len = (p.len || 1) * (1 + Math.min(0.5, sp * 0.08));
      ctx.save(); ctx.translate(x, y); ctx.rotate(clamp(ang, -2.2, 2.2) + Math.sin(p.ph) * 0.14);
      ctx.drawImage(flameSprite(p.fr ? pal(F).core : col, p.hot, p.v), -r, -r * 2.6 * len, r * 2, r * 3.4 * len);   // 烧到身前的火苗用更淡的颜色，不盖住身子
      ctx.restore();
    } else {
      // 火星（2.1）：顺着飞的方向拉成一小道，一闪一闪（以前是圆点，看着像墨点）
      ctx.globalAlpha = p.a * (1 - u) * (0.55 + 0.45 * Math.sin(p.ph * 3));
      const sp = Math.hypot(p.vx, p.vy) || 1, Lt = Math.min(9, sp * 2.2 + 2);
      ctx.strokeStyle = col; ctx.lineWidth = p.r * 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - p.vx / sp * Lt, y - p.vy / sp * Lt); ctx.lineTo(x, y); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
function drawNetStatus() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (Net.reconnecting) {
    const left = Math.max(0, Math.ceil((Net.reconnectUntil - performance.now()) / 1000));
    const y0 = VH * 0.343;
    ctx.fillStyle = 'rgba(235,234,226,.82)'; ctx.fillRect(VW / 2 - 190, y0, 380, 80);
    ctx.fillStyle = C.ink; ctx.font = `30px ${BRUSH}`; ctx.fillText('对方掉线 · 重连中', VW / 2, y0 + 30);
    ctx.font = `500 13px ${UIF}`; ctx.fillStyle = '#55564f'; ctx.fillText(`连回来就接着打（还等 ${left} 秒）`, VW / 2, y0 + 60);
  } else if (Net.stall > 30) {
    const y0 = VH * 0.36;
    ctx.fillStyle = 'rgba(235,234,226,.75)'; ctx.fillRect(VW / 2 - 140, y0, 280, 60);
    ctx.fillStyle = C.ink; ctx.font = `30px ${BRUSH}`; ctx.fillText('等待对方…', VW / 2, y0 + 30);
  }
  ctx.font = `500 13px ${UIF}`; ctx.fillStyle = Net.desync ? C.cin : 'rgba(23,24,26,.5)';
  const rb = Net.rb, roll = rb && rb.stats.rollbacks ? ` · 回滚 ${(rb.stats.frames / Math.max(1, rb.stats.rollbacks)).toFixed(1)} 帧/次` : '';
  ctx.fillText(Net.desync ? '联机不同步：双方画面可能不一致' : `${Net.via === 'relay' ? '经中继 · ' : ''}往返 ${Math.round(Net.rtt)} 毫秒 · 输入延迟 ${Net.delay} 帧${roll}`, VW / 2, VH - 22);
}
