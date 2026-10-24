'use strict';
/* 场景（2.0）：五张水墨山水（朱日远山 / 松崖飞瀑 / 竹林夜月 / 桃花园 / 大漠孤烟）可以挑，打桩固定用练武场。
   只是画面，不进战斗逻辑：场地大小、墙的位置所有场景都一样（联机两边场景不一样也不会不同步，只是房主选的那张两边都用）。
   每张图三层：
     远景 far（视差 PAR_FAR）、中景 mid（视差 PAR_MID）—— 画在「画面坐标」里，地线对齐画面上的地线，跟着镜头慢慢挪；
     地面 ground —— 画在场地坐标里，跟人一起动、一起缩放；
     另外 near（可选）每帧现画，比如竹林两头那几根顶天的竹子、桃花园两头的老桃树（太高，放不进地面那一层）。
   三层都先画在离屏画布上，分辨率按屏幕算（全屏、高分屏也清楚），每帧只贴图。画的时候只用「种子随机数」，每次画出来一样 */

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const PAR_FAR = 0.12, PAR_MID = 0.38;     // 远景、中景跟镜头挪多少（地面是 1）
const VW_MAX = 1600;                      // 画面最宽按这么宽准备（再宽的屏幕两边补纸色）
const SKY_BELOW = 150;                    // 远景、中景在地线下面多画一截（地面那层盖住大半）
const GX0 = -120, GUP = 190, GDN = 170;   // 地面层：从场地 x=GX0 画到 STAGE_W-GX0，地线上方 GUP、下方 GDN

/* ---------- 画笔 ---------- */
const INK = (a, c) => `rgba(${c || '23,24,26'},${a})`;
// 纸：底色 + 细颗粒 + 纤维
function paperFill(g, w, h, base, R, fiber) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const t = document.createElement('canvas'); t.width = t.height = 128;
  const tg = t.getContext('2d'), id = tg.createImageData(128, 128);
  for (let i = 0; i < id.data.length; i += 4) { const v = R() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 10; }
  tg.putImageData(id, 0, 0);
  g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, w, h);
  g.strokeStyle = fiber || 'rgba(120,118,104,.07)'; g.lineWidth = 0.6;
  const n = Math.round(200 * (w / 1200) * (h / 600));
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, a = R() * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10 + 4, x + Math.cos(a) * 22, y + Math.sin(a) * 22); g.stroke();
  }
}
// 一道远山（连绵的山脊，往下淡进雾里）
function ridge(g, w, base, amp, alpha, seed, freq, col) {
  const r = seeded(seed), ph = [r() * 9, r() * 9, r() * 9];
  g.beginPath(); g.moveTo(0, base + 200);
  for (let x = 0; x <= w; x += 6) {
    const y = base - amp * (0.55 * Math.sin(x * freq + ph[0]) + 0.3 * Math.sin(x * freq * 2.3 + ph[1]) + 0.15 * Math.sin(x * freq * 5.1 + ph[2]) + 0.04 * (r() - 0.5));
    g.lineTo(x, y);
  }
  g.lineTo(w, base + 200); g.closePath();
  const gr = g.createLinearGradient(0, base - amp, 0, base + 120);
  gr.addColorStop(0, INK(alpha, col)); gr.addColorStop(0.5, INK(alpha * 0.45, col)); gr.addColorStop(1, INK(0, col));
  g.fillStyle = gr; g.fill();
}
// 雾：一条横着的纸色，上下都淡
function mist(g, w, y, h, a, col) {
  const c = col || '235,234,226', gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(0.55, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
  g.fillStyle = gr; g.fillRect(0, y, w, h);
}
// 一团雾（圆的，往外淡）
function mistBlob(g, x, y, rx, ry, a, col) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const c = col || '235,234,226', gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
}
// 一座山峰：圆头、两肩往下散开（山水画里的「高远」），墨从山头往下淡；皴笔几道、山头点几个苔点
function peak(g, cx, by, w, h, alpha, R, o) {
  o = o || {};
  const col = o.col, lean = o.lean || 0, sharp = o.sharp || 1.6, n = 26, pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, s = Math.sin(Math.PI * u);
    const prof = Math.pow(s, sharp) * (1 - 0.18 * Math.abs(u - 0.5));
    const wob = (R() - 0.5) * h * 0.035 + Math.sin(u * 17 + cx) * h * 0.012;
    pts.push([cx - w / 2 + w * u + lean * h * prof * 0.25, by - h * prof + wob]);
  }
  g.beginPath(); g.moveTo(pts[0][0], by + 40);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.lineTo(pts[n][0], by + 40); g.closePath();
  const gr = g.createLinearGradient(0, by - h, 0, by + 10);
  gr.addColorStop(0, INK(alpha, col)); gr.addColorStop(0.45, INK(alpha * 0.62, col)); gr.addColorStop(1, INK(0, col));
  g.fillStyle = gr; g.fill();
  // 山头一道深一点的轮廓（只描上半截，往下就没了）
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 1; i < n; i++) {
    const p = pts[i], q = pts[i + 1], top = 1 - (by - p[1]) / h;
    if (top > 0.55) continue;
    g.strokeStyle = INK(alpha * (1.1 - top * 1.4), col); g.lineWidth = 1.2 + (1 - top) * 1.6;
    g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
  }
  // 皴：顺着山势往下的短干笔（短、一组一组的，靠近山头多、往下少）
  const cun = o.cun == null ? 9 : o.cun;
  for (let k = 0; k < cun; k++) {
    const i = 3 + ((R() * (n - 6)) | 0), p = pts[i], side = i < n / 2 ? -1 : 1;
    const depth = R() * R() * h * 0.5, x0 = p[0] - side * (4 + R() * 10), y0 = p[1] + 6 + depth;
    for (let j = 0; j < 3; j++) {
      const len = h * (0.04 + R() * 0.07), xx = x0 - side * j * 5, yy = y0 + j * 3;
      g.strokeStyle = INK(alpha * (0.35 + R() * 0.35) * (1 - depth / h), col); g.lineWidth = 0.7 + R() * 1.1;
      g.beginPath(); g.moveTo(xx, yy); g.quadraticCurveTo(xx - side * len * 0.35, yy + len * 0.55, xx - side * len * 0.15, yy + len); g.stroke();
    }
  }
  // 苔点
  const dots = o.dots == null ? 6 : o.dots;
  g.fillStyle = INK(Math.min(0.9, alpha * 1.8), col);
  for (let k = 0; k < dots; k++) {
    const p = pts[3 + ((R() * (n - 6)) | 0)];
    g.beginPath(); g.ellipse(p[0] + (R() - 0.5) * 6, p[1] + R() * 5, 1.2 + R() * 1.6, 0.9 + R(), R() * 3, 0, Math.PI * 2); g.fill();
  }
  return pts;
}
// 松：弯的树干 + 几层扁平的松针团（边上一圈刺）。lean 往哪边歪
function pine(g, x, y, s, alpha, R, lean, col) {
  lean = lean || 0;
  const tx = x + lean * s * 0.45, ty = y - s;
  g.strokeStyle = INK(alpha, col); g.lineCap = 'round';
  // 树干（两笔：一粗一细，显得有树皮）
  for (const [w, off] of [[s * 0.07, 0], [s * 0.03, s * 0.025]]) {
    g.lineWidth = w; g.beginPath(); g.moveTo(x + off, y);
    g.bezierCurveTo(x + lean * s * 0.05 + off, y - s * 0.4, tx - lean * s * 0.2, ty + s * 0.35, tx, ty); g.stroke();
  }
  // 松针团：一层一层往外伸
  const tiers = 3 + ((R() * 2) | 0);
  for (let i = 0; i < tiers; i++) {
    const u = 0.35 + 0.65 * i / Math.max(1, tiers - 1), px = x + (tx - x) * u, py = y + (ty - y) * u;
    const dir = i % 2 ? 1 : -1, len = s * (0.42 - 0.18 * u) * (0.8 + R() * 0.5);
    const cx = px + dir * len * 0.55, cy = py - s * 0.04;
    g.lineWidth = s * 0.025; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + dir * len * 0.3, py - s * 0.06, cx, cy); g.stroke();
    needles(g, cx, cy, len * 0.75, s * 0.11, alpha, R, col);
  }
  needles(g, tx, ty - s * 0.03, s * 0.24, s * 0.1, alpha, R, col);
}
// 远处的小松（山脊上那种）：一根短树干 + 几层横着的墨点，底下宽、往上窄
function dabPine(g, x, y, s, alpha, R, col) {
  g.strokeStyle = INK(alpha, col); g.lineWidth = Math.max(1, s * 0.07); g.lineCap = 'round';
  const top = x + (R() - 0.5) * s * 0.12;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (R() - 0.5) * s * 0.15, y - s * 0.5, top, y - s); g.stroke();
  for (let i = 0; i < 4; i++) {
    const u = 0.32 + i * 0.2, tw = s * (0.46 - i * 0.09), cx = x + (top - x) * u + (R() - 0.5) * s * 0.1, cy = y - s * u;
    g.fillStyle = INK(alpha * (0.75 + R() * 0.2), col);
    g.beginPath(); g.ellipse(cx, cy, tw, s * 0.075, (R() - 0.5) * 0.25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + tw * 0.35, cy - s * 0.035, tw * 0.55, s * 0.05, 0, 0, Math.PI * 2); g.fill();
  }
}
function needles(g, cx, cy, rx, ry, alpha, R, col) {
  const n = 22;
  g.fillStyle = INK(alpha * 0.85, col);
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + Math.PI * i / n, spike = i % 2 ? 1 : 0.72 + R() * 0.1;
    g.lineTo(cx + Math.cos(a) * rx * spike, cy + Math.sin(a) * ry * spike * 1.15);
  }
  g.quadraticCurveTo(cx, cy + ry * 0.55, cx - rx * 0.95, cy + ry * 0.05);
  g.closePath(); g.fill();
  g.strokeStyle = INK(alpha, col); g.lineWidth = 0.9;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (1.05 + 0.9 * R()), r0 = rx * 0.3;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.4); g.lineTo(cx + Math.cos(a) * rx * 1.08, cy + Math.sin(a) * ry * 1.25); g.stroke();
  }
}
// 一根竹子：一节一节（节上一道深色的环），越往上越细一点
function bamboo(g, x, yBot, yTop, wd, alpha, R, col, lean) {
  lean = lean || 0;
  let y = yBot, i = 0;
  while (y > yTop) {
    const seg = 46 + R() * 34, y2 = Math.max(yTop, y - seg), u0 = (yBot - y) / (yBot - yTop + 1), u1 = (yBot - y2) / (yBot - yTop + 1);
    const x0 = x + lean * (yBot - y), x1 = x + lean * (yBot - y2), w0 = wd * (1 - 0.25 * u0), w1 = wd * (1 - 0.25 * u1);
    const gr = g.createLinearGradient(x0 - w0 / 2, 0, x0 + w0 / 2, 0);
    gr.addColorStop(0, INK(alpha * 0.95, col)); gr.addColorStop(0.45, INK(alpha * 0.55, col)); gr.addColorStop(1, INK(alpha * 0.9, col));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x0 - w0 / 2, y - 1.5); g.lineTo(x1 - w1 / 2, y2 + 2.5); g.lineTo(x1 + w1 / 2, y2 + 2.5); g.lineTo(x0 + w0 / 2, y - 1.5); g.closePath(); g.fill();
    // 节
    g.strokeStyle = INK(Math.min(1, alpha * 1.3), col); g.lineWidth = Math.max(1, wd * 0.16);
    g.beginPath(); g.moveTo(x1 - w1 * 0.62, y2 + 1); g.quadraticCurveTo(x1, y2 + 3.5, x1 + w1 * 0.62, y2 + 1); g.stroke();
    y = y2 - 1.5; i++;
  }
}
// 竹叶：两头尖的一片（一笔撇出去）
function bambooLeaf(g, x, y, len, ang, alpha, col) {
  const c = Math.cos(ang), s = Math.sin(ang), w = len * 0.16;
  g.fillStyle = INK(alpha, col);
  g.beginPath(); g.moveTo(x, y);
  g.quadraticCurveTo(x + c * len * 0.4 - s * w, y + s * len * 0.4 + c * w, x + c * len, y + s * len);
  g.quadraticCurveTo(x + c * len * 0.45 + s * w * 0.6, y + s * len * 0.45 - c * w * 0.6, x, y);
  g.fill();
}
// 一簇竹叶（个、介字那样往下垂着散开）
function leafCluster(g, x, y, n, size, alpha, R, col, side) {
  side = side || (R() < 0.5 ? -1 : 1);
  g.strokeStyle = INK(alpha * 0.8, col); g.lineWidth = Math.max(0.8, size * 0.03);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + side * size * 0.5, y + size * 0.12); g.stroke();
  for (let i = 0; i < n; i++) {
    const ang = Math.PI / 2 + side * (0.25 + i * 0.32 + R() * 0.25) + (R() - 0.5) * 0.3;
    bambooLeaf(g, x + side * size * 0.45 * (i / n), y + size * 0.12 * (i / n), size * (0.7 + R() * 0.45), ang, alpha * (0.75 + R() * 0.25), col);
  }
}
function birds(g, list, col) {
  g.strokeStyle = col || 'rgba(23,24,26,.55)'; g.lineWidth = 1.6; g.lineCap = 'round';
  for (const [x, y, s] of list) {
    g.beginPath(); g.moveTo(x - 9 * s, y - 2 * s); g.quadraticCurveTo(x - 4 * s, y - 6 * s, x, y); g.quadraticCurveTo(x + 4 * s, y - 6 * s, x + 9 * s, y - 3 * s); g.stroke();
  }
}
// 地线：几遍深浅粗细不同的墨线叠出来
function floorLine(g, x0, x1, y, R, col, w) {
  w = w || 1;
  for (let pass = 0; pass < 4; pass++) {
    g.strokeStyle = INK([0.7, 0.3, 0.18, 0.12][pass], col); g.lineWidth = [3, 6, 1.5, 9][pass] * w;
    g.beginPath(); let yy = y + pass * 1.2; g.moveTo(x0, yy);
    for (let x = x0; x <= x1; x += 30) { yy = y + pass * 1.4 + (R() - 0.5) * 2.2; g.lineTo(x, yy); }
    g.stroke();
  }
}
function grassTufts(g, x0, x1, y, n, R, a) {
  g.strokeStyle = INK(a || 0.35); g.lineWidth = 1.2; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), h = 4 + R() * 9;
    g.beginPath(); g.moveTo(x, y + 1); g.quadraticCurveTo(x + 2, y - h * 0.6, x + 5 * (R() - 0.3), y - h); g.stroke();
  }
}
function pebbles(g, x0, x1, y, n, R, a) {
  g.fillStyle = INK(a || 0.22);
  for (let i = 0; i < n; i++) { const x = x0 + R() * (x1 - x0), w = 3 + R() * 6; g.beginPath(); g.ellipse(x, y + 4 + R() * 40, w, w * 0.45, 0, 0, Math.PI * 2); g.fill(); }
}
// 场地两头的木桩（墙在哪）：一根歪着的旧木桩，缠一道朱红绳
function wallPost(g, x, y, lean) {
  g.save(); g.translate(x, y + 2); g.rotate(lean);
  g.fillStyle = 'rgba(23,24,26,.82)';
  g.beginPath(); g.moveTo(-6, 0); g.lineTo(-4.5, -78); g.quadraticCurveTo(0, -84, 4.5, -79); g.lineTo(6, 0); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(235,234,226,.35)'; g.lineWidth = 1;
  for (let j = 0; j < 4; j++) { g.beginPath(); g.moveTo(-2 + j * 1.4, -6 - j * 9); g.lineTo(-1 + j * 1.2, -40 - j * 8); g.stroke(); }
  g.fillStyle = 'rgba(184,50,29,.85)'; g.fillRect(-6.5, -62, 13, 4); g.fillRect(-6.5, -55, 13, 2.5);
  g.strokeStyle = 'rgba(184,50,29,.8)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(5, -58); g.quadraticCurveTo(12, -50, 9 + lean * 60, -38); g.stroke();
  g.restore();
  g.strokeStyle = 'rgba(23,24,26,.45)'; g.lineWidth = 1.3;
  for (let j = 0; j < 5; j++) { const gx = x + (j - 2) * 6; g.beginPath(); g.moveTo(gx, y + 1); g.quadraticCurveTo(gx + 1, y - 8, gx + (j - 2) * 2.5, y - 14 - (j % 2) * 5); g.stroke(); }
}

/* ---------- 桃花园、大漠孤烟用的画笔 ---------- */
const PINK = '226,146,158', PINK_L = '240,196,198', PINK_D = '184,66,94';   // 桃花：粉、淡粉、花苞（深胭脂）
const SAND = '178,134,82', SAND_D = '116,84,52';                            // 沙：赭黄、深赭
// 一笔枝干：顺着一条弯（二次曲线）从粗到细，两边各偏半个粗细围成一块，加进路径 p（毛笔一笔拖出去的样子）
function limb(p, x0, y0, cx, cy, x1, y1, w0, w1) {
  const n = 8, a = [], b = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t, x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    const dx = u * (cx - x0) + t * (x1 - cx), dy = u * (cy - y0) + t * (y1 - cy), d = Math.hypot(dx, dy) || 1, hw = (w0 + (w1 - w0) * t) / 2;
    a.push([x - dy / d * hw, y + dx / d * hw]); b.push([x + dy / d * hw, y - dx / d * hw]);
  }
  p.moveTo(a[0][0], a[0][1]);
  for (const q of a) p.lineTo(q[0], q[1]);
  for (let i = n; i >= 0; i--) p.lineTo(b[i][0], b[i][1]);
  p.closePath();
}
// 圆点加进路径（逆时针，和 limb 同一个绕向，叠在一起不会抠出洞）
function dot(p, x, y, r) { p.moveTo(x + r, y); p.arc(x, y, r, 0, -Math.PI * 2, true); }
// 桃树（只算形状，不画）：一截扭着的老干，往上一回回分杈、越分越细；有的地方不分杈只拐个弯（枝子一折一折的，桃枝的样子）。
// 返回 { wood: 枝干的路径, spots: 开花的地方 [x, y, 那一枝多长], forks: 分杈处 [x, y, 粗细], top: 最高到哪 }
// s = 大约多高；o.lean 主干歪多少（弧度），o.depth 分几回杈，o.spread 枝子张多开，o.w 主干多粗，o.first 第一回分杈的几个方向（不给就随机）
function peachTree(x, y, s, R, o) {
  o = o || {};
  const wood = new Path2D(), spots = [], forks = [], depth = o.depth || 4, spread = o.spread || 1;
  let top = y;
  const grow = (x0, y0, ang, len, w0, d) => {
    const w1 = Math.max(0.7, w0 * (d ? 0.64 + R() * 0.1 : 0.3)), bend = (R() - 0.5) * len * 0.7;
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    limb(wood, x0, y0, (x0 + x1) / 2 - Math.sin(ang) * bend, (y0 + y1) / 2 + Math.cos(ang) * bend, x1, y1, w0, w1);
    top = Math.min(top, y1);
    if (d <= 2) spots.push([x1, y1, len]);
    if (!d) return;
    dot(wood, x1, y1, w1 * 0.55); forks.push([x1, y1, w1]);
    const first = d === depth && o.first, r = R(), k = first ? first.length : r < 0.22 ? 1 : r < 0.86 ? 2 : 3;
    for (let i = 0; i < k; i++) {
      const a = first ? -Math.PI / 2 + first[i]
        : k === 1 ? ang + (R() < 0.5 ? -1 : 1) * (0.25 + R() * 0.3)                          // 只拐个弯
        : ang + ((i - (k - 1) / 2) * (0.5 + R() * 0.5) + (R() - 0.5) * 0.3) * spread;
      grow(x1, y1, clamp(a, -Math.PI + 0.15, -0.15), len * (0.58 + R() * 0.3), w1 * (i ? 0.8 : 1), d - 1);
    }
  };
  grow(x, y, -Math.PI / 2 + (o.lean || 0), s * 0.3, o.w || s * 0.06, depth);
  return { wood, spots, forks, top };
}
// 画一棵算好的桃树的枝干：根那头墨重、枝梢淡；moss = 分杈处点几个苔点；foot = 树脚淡进雾里（中景的大树，人在它前面打）
function paintWood(g, t, y0, alpha, col, R, moss, foot) {
  const gr = g.createLinearGradient(0, y0, 0, t.top);
  gr.addColorStop(0, INK(alpha * (foot ? 0.35 : 1), col)); if (foot) gr.addColorStop(0.3, INK(alpha, col)); gr.addColorStop(1, INK(alpha * 0.55, col));
  g.fillStyle = gr; g.fill(t.wood);
  if (!moss) return;
  g.fillStyle = INK(Math.min(0.9, alpha * 1.4), col);
  for (const [x, y, wd] of t.forks) if (R() < 0.5) { g.beginPath(); g.ellipse(x + (R() - 0.5) * wd * 2, y + (R() - 0.3) * wd * 2, 0.8 + R() * 1.2 + wd * 0.12, 0.6 + R() * 0.7, R() * 3, 0, Math.PI * 2); g.fill(); }
}
// 一树的花（中景）：枝头一团一团 —— 底下一抹淡粉的晕（wash = 几成枝头有），上面叠几层小花点（dabs = 每个枝头至少几点），再点几个深胭脂的花苞。
// 花点按「两种粉 × 两种浓淡」分四批，每批合成一条路径填一回（一树几百个点，一个个填太慢）
function blossomCloud(g, spots, size, alpha, R, wash, dabs) {
  wash = wash == null ? 0.4 : wash; dabs = dabs || 6;
  for (const [x, y] of spots) if (R() < wash) mistBlob(g, x, y - size * 0.2, size * 2.4, size * 1.5, 0.3 * alpha, PINK_L);
  const P = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], buds = new Path2D();
  for (const [x, y] of spots) {
    const n = dabs + ((R() * (dabs + 1)) | 0);
    for (let i = 0; i < n; i++) {
      const an = R() * Math.PI * 2, r = Math.sqrt(R()) * size * 1.25, pr = size * (0.2 + R() * 0.22), rot = R() * 3, p = P[(R() < 0.35 ? 0 : 2) + (R() < 0.5 ? 0 : 1)];
      const px = x + Math.cos(an) * r * 1.2, py = y + Math.sin(an) * r * 0.85 - size * 0.2;
      p.moveTo(px + Math.cos(rot) * pr, py + Math.sin(rot) * pr); p.ellipse(px, py, pr, pr * (0.7 + R() * 0.3), rot, 0, Math.PI * 2);
    }
    for (let i = 0; i < 2; i++) if (R() < 0.55) { const bx = x + (R() - 0.5) * size * 2.2, by = y + (R() - 0.6) * size * 1.6, br = size * (0.06 + R() * 0.07); buds.moveTo(bx + br, by); buds.arc(bx, by, br, 0, Math.PI * 2); }
  }
  [[PINK_L, 0.48], [PINK_L, 0.76], [PINK, 0.48], [PINK, 0.76]].forEach(([c, a], k) => { g.fillStyle = INK(alpha * a, c); g.fill(P[k]); });
  g.fillStyle = INK(alpha * 0.8, PINK_D); g.fill(buds);
}
// 一朵桃花（近处的）：五片圆瓣围一圈，加进路径 p（顺时针，同一批的花叠在一起是一块颜色）
function flower(p, x, y, r, rot) {
  for (let i = 0; i < 5; i++) {
    const a = rot + i * Math.PI * 0.4, px = x + Math.cos(a) * r * 0.52, py = y + Math.sin(a) * r * 0.52;
    p.moveTo(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.5); p.ellipse(px, py, r * 0.5, r * 0.42, a, 0, Math.PI * 2);
  }
}
// 一片花瓣（飘着的、落在地上的）：一头尖一头圆。sq < 1 = 压扁（平躺在地上的）
function petal(g, x, y, s, ang, col, a, sq) {
  const c = Math.cos(ang), sn = Math.sin(ang), w = s * 0.7, k = sq || 1;
  const P = (u, v) => [x + c * u - sn * v, y + (sn * u + c * v) * k];          // 花瓣自己的坐标（u 顺着瓣，v 横着）→ 画面
  const b = P(-s, 0), t = P(s, 0), c1 = P(0, w), c2 = P(s * 1.35, w), c3 = P(s * 1.35, -w), c4 = P(0, -w);
  g.fillStyle = INK(a, col); g.beginPath(); g.moveTo(b[0], b[1]);
  g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], t[0], t[1]);
  g.bezierCurveTo(c3[0], c3[1], c4[0], c4[1], b[0], b[1]);
  g.fill();
}
// 桃花园两头那两棵老桃树（场地坐标）：形状只算一次，存成几条路径，每帧照着填色就行（不用每帧重算几百朵花）
let peachNearCache = null;
function peachNear() {
  if (peachNearCache) return peachNearCache;
  const R = seeded(4111), N = { wood: new Path2D(), dry: new Path2D(), fl: [new Path2D(), new Path2D()], buds: new Path2D(), heart: new Path2D(), fall: new Path2D() };
  for (const [x, side] of [[WALL_L - 36, -1], [WALL_R + 36, 1]]) {
    const t = peachTree(x, FLOOR + 4, 600, R, { lean: side * 0.1, depth: 5, w: 24, first: [side * 0.55, -side * 0.12, -side * 0.62] });
    N.wood.addPath(t.wood);
    for (let j = 0; j < 4; j++) { const xx = x - 6 + j * 3.5; N.dry.moveTo(xx, FLOOR - 6 - j * 12); N.dry.lineTo(xx + side * j, FLOOR - 64 - j * 20); }
    for (const [sx, sy] of t.spots) {
      if (sy > FLOOR - 250 && (side < 0 ? sx > WALL_L - 10 : sx < WALL_R + 10)) continue;   // 场地里头的低处不开花（不挡人）
      const n = 2 + ((R() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const fx = sx + (R() - 0.5) * 26, fy = sy + (R() - 0.5) * 18, r = 5 + R() * 3.5;
        flower(N.fl[R() < 0.45 ? 0 : 1], fx, fy, r, R() * 1.3);
        N.heart.moveTo(fx + r * 0.16, fy); N.heart.arc(fx, fy, r * 0.16, 0, Math.PI * 2);
      }
      if (R() < 0.7) { const bx = sx + (R() - 0.5) * 20, by = sy + (R() - 0.5) * 14, a = R() * 3; N.buds.moveTo(bx + Math.cos(a) * 3.2, by + Math.sin(a) * 3.2); N.buds.ellipse(bx, by, 3.2, 2.2, a, 0, Math.PI * 2); }
    }
    // 树边正飘着的几片花瓣（高处、墙外边，不进打架的地方）
    for (let i = 0; i < 8; i++) {
      const px = x + side * (R() * 70 - 20), py = FLOOR - 210 - R() * 160, a = R() * 3, s = 3 + R();
      N.fall.moveTo(px + Math.cos(a) * s, py + Math.sin(a) * s); N.fall.ellipse(px, py, s, s * 0.55, a, 0, Math.PI * 2);
    }
  }
  return (peachNearCache = N);
}
// 远处山坡上一片桃林：一抹淡粉的晕，上面细细点一层粉点（中间高、两头低，像一片树冠），底下露几根小树干
function grove(g, x, y, rw, R, a) {
  mistBlob(g, x, y - rw * 0.06, rw * 1.2, rw * 0.34, 0.34 * a, PINK_L);
  g.strokeStyle = INK(0.14 * a, '58,60,64'); g.lineWidth = 1;
  for (let i = 0; i < 4; i++) { const tx = x + (R() - 0.5) * rw * 1.4; g.beginPath(); g.moveTo(tx, y + rw * 0.1); g.lineTo(tx + (R() - 0.5) * 2, y + rw * 0.02); g.stroke(); }
  const P = [new Path2D(), new Path2D(), new Path2D()];                      // 淡粉点、浓一点的粉点、深色点，各合成一条路径
  for (let i = 0; i < rw * 0.8; i++) {
    const u = (R() - 0.5) * 2, px = x + u * rw * 1.05, py = y + rw * 0.05 - (1 - u * u) * rw * 0.24 * R(), r = 1 + R() * 1.8, p = P[R() < 0.15 ? 2 : R() < 0.5 ? 0 : 1];
    p.moveTo(px + r, py); p.arc(px, py, r, 0, Math.PI * 2);
  }
  [[PINK, 0.16], [PINK, 0.3], [PINK_D, 0.24]].forEach(([c, k], i) => { g.fillStyle = INK(a * k, c); g.fill(P[i]); });
}
// 石拱桥（侧面）：一个半圆的桥洞，桥面拱起来，两头落到岸上；水里的倒影和桥洞合成一个圆（clip = 水面的路径，倒影只画在水里）
function archBridge(g, cx, wy, span, r, alpha, R, clip) {
  const top = wy - r - 9, half = span / 2;
  const deck = (k) => { g.moveTo(cx - half, wy + 2); g.bezierCurveTo(cx - half * 0.55, wy - 2, cx - r * 1.1, top - k, cx, top - k); g.bezierCurveTo(cx + r * 1.1, top - k, cx + half * 0.55, wy - 2, cx + half, wy + 2); };
  for (const [sy, a] of [[1, 1], [-1, 0.32]]) {                       // 先画桥，再上下翻过来淡淡画一遍倒影
    g.save(); if (sy < 0 && clip) g.clip(clip);
    g.translate(0, wy); g.scale(1, sy); g.translate(0, -wy);
    // 桥身：桥面以下、桥洞以外（石头）
    g.beginPath(); deck(0); g.lineTo(cx + r, wy); g.arc(cx, wy, r, 0, Math.PI, true); g.closePath();
    g.fillStyle = INK(alpha * 0.32 * a, '70,74,76'); g.fill();
    // 桥面（一道深的边）、栏杆
    g.strokeStyle = INK(alpha * a, '50,54,58'); g.lineCap = 'round';
    g.lineWidth = 2.2; g.beginPath(); deck(0); g.stroke();
    g.lineWidth = 1.1; g.beginPath(); deck(10); g.stroke();
    for (let i = 1; i < 10; i++) { const u = i / 10, x = cx - half * 0.86 + u * half * 1.72, k = Math.pow(1 - Math.abs(x - cx) / half, 0.6); g.beginPath(); g.moveTo(x, wy + 2 - (wy + 2 - top) * k); g.lineTo(x, wy + 2 - (wy + 2 - top) * k - 10); g.stroke(); }
    // 桥洞的拱圈（两道）、拱圈上的石缝
    g.lineWidth = 1.8; g.beginPath(); g.arc(cx, wy, r, Math.PI, 0); g.stroke();
    g.lineWidth = 1; g.strokeStyle = INK(alpha * 0.6 * a, '50,54,58'); g.beginPath(); g.arc(cx, wy, r + 5, Math.PI * 1.04, Math.PI * 1.96); g.stroke();
    for (let i = 1; i < 8; i++) { const an = Math.PI + i * Math.PI / 8; g.beginPath(); g.moveTo(cx + Math.cos(an) * r, wy + Math.sin(an) * r); g.lineTo(cx + Math.cos(an) * (r + 5), wy + Math.sin(an) * (r + 5)); g.stroke(); }
    g.restore();
  }
  // 倒影上几道横的水纹（纸色），把倒影打碎一点
  g.save(); if (clip) g.clip(clip);
  g.strokeStyle = 'rgba(244,242,236,.8)'; g.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) { const y = wy + 4 + i * (r / 6) + R() * 3, x = cx + (R() - 0.5) * r * 1.4; g.beginPath(); g.moveTo(x - 8 - R() * 14, y); g.lineTo(x + 8 + R() * 14, y); g.stroke(); }
  g.restore();
}

// 沿着一串点拖一笔：ip 那个点最粗，往两头收尖（沙丘的脊线）
function taperLine(g, pts, i0, i1, ip, wd) {
  const a = [], b = [];
  for (let i = i0; i <= i1; i++) {
    const p = pts[i], q = pts[Math.max(i0, i - 1)], n = pts[Math.min(i1, i + 1)], dx = n[0] - q[0], dy = n[1] - q[1], d = Math.hypot(dx, dy) || 1;
    const k = 1 - Math.abs(i - ip) / Math.max(1, i < ip ? ip - i0 : i1 - ip), hw = wd * Math.pow(Math.max(0, k), 0.6) / 2 + 0.15;
    a.push([p[0] - dy / d * hw, p[1] + dx / d * hw]); b.push([p[0] + dy / d * hw, p[1] - dx / d * hw]);
  }
  g.beginPath(); g.moveTo(a[0][0], a[0][1]);
  for (const q of a) g.lineTo(q[0], q[1]);
  for (let i = b.length - 1; i >= 0; i--) g.lineTo(b[i][0], b[i][1]);
  g.closePath(); g.fill();
}
// 一座沙丘（侧面）：左边是陡的落沙坡（背着太阳，深），右边一道长长的缓坡（迎着光，淡）；脊是一道利落的线，坡脚淡进沙里。返回轮廓上的点
function duneMound(g, x0, px, x1, base, h, alpha) {
  const pts = [];
  for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push([x0 + (px - x0) * u, base - h * Math.pow(u, 1.6)]); }
  for (let i = 1; i <= 28; i++) { const u = i / 28; pts.push([px + (x1 - px) * u, base - h * (1 - u * u * (3 - 2 * u))]); }
  // 沙丘身子：脊下一层赭色，往坡脚淡没（和远山一样淡进沙雾里）
  g.beginPath(); g.moveTo(x0, base);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.closePath();
  const gr = g.createLinearGradient(0, base - h, 0, base);
  gr.addColorStop(0, INK(alpha, SAND)); gr.addColorStop(0.55, INK(alpha * 0.55, SAND)); gr.addColorStop(1, INK(0, SAND));
  g.fillStyle = gr; g.fill();
  // 落沙坡的影子：从脊顶往右下弯到坡脚，和左边的陡坡围成一块
  const sx = px + (x1 - px) * 0.14;
  g.beginPath(); g.moveTo(x0, base);
  for (let i = 0; i <= 16; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.quadraticCurveTo(px + (sx - px) * 0.25, base - h * 0.4, sx, base);
  g.closePath();
  const gs = g.createLinearGradient(0, base - h, 0, base);
  gs.addColorStop(0, INK(alpha * 1.1, SAND_D)); gs.addColorStop(1, INK(0, SAND_D));
  g.fillStyle = gs; g.fill();
  // 脊线：一笔干墨，脊顶最重，两头收尖
  g.fillStyle = INK(Math.min(0.55, alpha * 2.3), SAND_D);
  taperLine(g, pts, 6, 32, 16, 1 + h * 0.035);
  return pts;
}
// 一排沙丘：从左到右一座接一座（后一座压着前一座的坡脚），高矮宽窄都不一样；坡脚跟着一道缓缓的起伏
function duneRow(g, w, base, h0, h1, w0, w1, alpha, R) {
  const ph = R() * 9;
  for (let x = -w0 * 0.5 - R() * w0; x < w + 40;) {
    const ww = w0 + R() * (w1 - w0), hh = h0 + R() * (h1 - h0), b = base + Math.sin(x * 0.004 + ph) * 8;
    duneMound(g, x, x + ww * (0.2 + R() * 0.15), x + ww, b, hh, alpha * (0.85 + R() * 0.3));
    x += ww * (0.5 + R() * 0.3);
  }
}
// 沙丘轮廓上某个 x 的高度
function moundY(pts, x) {
  for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const p = pts[i - 1], q = pts[i], u = (x - p[0]) / (q[0] - p[0] || 1); return p[1] + (q[1] - p[1]) * u; }
  return pts[pts.length - 1][1];
}
// 骆驼（远处的剪影，双峰）：身子、两个驼峰、弯脖子、小头，四条细腿一前一后在走。dir = 1 往右
function camel(g, x, y, s, dir, alpha, rider) {
  g.save(); g.translate(x, y); g.scale(dir * s, s);
  g.fillStyle = INK(alpha, '62,46,34'); g.strokeStyle = INK(alpha, '62,46,34'); g.lineCap = 'round'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-5, -10); g.lineTo(-7, 0); g.moveTo(-3.5, -10); g.lineTo(-2, 0); g.moveTo(4, -10); g.lineTo(2.6, 0); g.moveTo(5.5, -10); g.lineTo(7.6, 0); g.stroke();
  g.beginPath(); g.moveTo(-7.2, -12);
  g.quadraticCurveTo(-7, -16, -4.6, -16.4); g.quadraticCurveTo(-3, -20.5, -1.4, -16.6);
  g.quadraticCurveTo(0.2, -16, 1.4, -16.6); g.quadraticCurveTo(3, -20.5, 4.6, -16.4);
  g.quadraticCurveTo(6.6, -15.6, 7.6, -13.2); g.quadraticCurveTo(10.2, -12.6, 11, -17.4);
  g.quadraticCurveTo(11.8, -19.6, 13.8, -19.2); g.lineTo(14.2, -17.8); g.quadraticCurveTo(12.6, -17.6, 12.3, -15.6);
  g.quadraticCurveTo(11.4, -10.2, 7, -9.4); g.lineTo(-5.6, -9.4); g.quadraticCurveTo(-7.6, -9.8, -7.2, -12); g.fill();
  if (rider) { g.beginPath(); g.ellipse(0, -20, 1.9, 3.4, 0.1, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(0.3, -24.6, 1.5, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
// 烽火台：夯土垒的方台，上窄下宽，顶上一圈垛口；背光的一面深一点
function beacon(g, x, y, h, alpha) {
  const b = h * 0.86, t = h * 0.56;
  g.fillStyle = INK(alpha, SAND_D);
  g.beginPath(); g.moveTo(x - b / 2, y); g.lineTo(x - t / 2, y - h); g.lineTo(x + t / 2, y - h); g.lineTo(x + b / 2, y); g.closePath(); g.fill();
  g.fillStyle = INK(alpha * 0.7, '60,44,32');
  g.beginPath(); g.moveTo(x - b / 2, y); g.lineTo(x - t / 2, y - h); g.lineTo(x - t * 0.08, y - h); g.lineTo(x - b * 0.1, y); g.closePath(); g.fill();
  g.fillStyle = INK(alpha, SAND_D);
  for (let i = 0; i < 4; i++) g.fillRect(x - t / 2 + i * t / 3.4, y - h - h * 0.12, t / 6, h * 0.12);
}
// 孤烟：一根笔直的烟，越往上越宽、越淡（外面一层更淡更宽的，烟边是虚的）
function smokeColumn(g, x, y0, y1, w0, w1, alpha) {
  for (const [k, a] of [[2.6, 0.1], [1.7, 0.16], [1, 1]]) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, INK(alpha * a, '70,64,60')); gr.addColorStop(0.08, INK(alpha * a * 0.9, '70,64,60')); gr.addColorStop(0.6, INK(alpha * a * 0.4, '70,64,60')); gr.addColorStop(1, INK(0, '70,64,60'));
    g.fillStyle = gr; g.beginPath();
    g.moveTo(x - w0 * k / 2, y0); g.lineTo(x - w1 * k / 2, y1); g.lineTo(x + w1 * k / 2, y1); g.lineTo(x + w0 * k / 2, y0); g.closePath(); g.fill();
  }
}
// 风吹出来的沙纹：几条一组、大致平行的细波纹
function windRipples(g, x0, x1, y0, y1, n, R, col) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0), near = (y - y0) / (y1 - y0 + 1), len = 50 + R() * 90 + near * 60, k = 2 + ((R() * 3) | 0), ph = R() * 6;
    for (let j = 0; j < k; j++) {
      const yy = y + j * (5 + near * 5 + R() * 3), xs = x + (R() - 0.5) * 14, l = len * (1 - j * 0.16), amp = 1.2 + R() * 1.4;
      g.strokeStyle = INK(0.1 + R() * 0.1, col || SAND_D); g.lineWidth = 0.8 + R() * 0.7 + near * 0.4;
      g.beginPath(); g.moveTo(xs, yy);
      for (let t = 1; t <= 4; t++) g.quadraticCurveTo(xs + l * (t - 0.5) / 4, yy + (t % 2 ? -amp : amp) + Math.sin(ph + t) * 0.6, xs + l * t / 4, yy + Math.sin(ph + t * 1.7) * 0.8);
      g.stroke();
    }
  }
}
// 一丛骆驼刺（干草）：从一点往上岔开几根细硬的笔
function thornTuft(g, x, y, s, R, a) {
  g.strokeStyle = INK(a, '70,54,38'); g.lineWidth = 1.1; g.lineCap = 'round';
  const n = 5 + ((R() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.3 + (R() - 0.5) * 0.3, len = s * (0.45 + R() * 0.55), mx = x + Math.cos(ang) * len * 0.5, my = y + Math.sin(ang) * len * 0.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
    if (R() < 0.6) { g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(ang - 0.7) * len * 0.3, my + Math.sin(ang - 0.7) * len * 0.3); g.stroke(); }
  }
}
// 断碑：一块石碑，顶上断了一角，半埋在沙里；碑面上几道磨得看不清的刻字
function stele(g, x, y, h, lean, R) {
  g.save(); g.translate(x, y + 5); g.rotate(lean);
  const w = h * 0.36;
  g.fillStyle = 'rgba(66,58,50,.86)';
  g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2 + 1.5, -h * 0.8); g.lineTo(-w * 0.3, -h * 0.87); g.lineTo(-w * 0.08, -h * 0.79);
  g.lineTo(w * 0.1, -h * 0.93); g.lineTo(w * 0.28, -h); g.lineTo(w / 2 - 1.5, -h * 0.97); g.lineTo(w / 2, 0); g.closePath(); g.fill();
  g.fillStyle = 'rgba(236,226,206,.16)'; g.fillRect(-w * 0.32, -h * 0.74, w * 0.64, h * 0.66);
  // 刻字：竖着两行，每个字两三笔（横、竖、撇、捺、点），磨得看不太清
  g.strokeStyle = 'rgba(30,24,20,.45)'; g.lineWidth = 1.2; g.lineCap = 'round';
  for (let c = 0; c < 2; c++) for (let k = 0; k < 4; k++) {
    const cx = -w * 0.15 + c * w * 0.3, cy = -h * 0.64 + k * h * 0.145, n = 2 + ((R() * 3) | 0);
    for (let j = 0; j < n; j++) {
      const t = (R() * 5) | 0, ox = (R() - 0.5) * 4, oy = (R() - 0.5) * 5;
      g.beginPath();
      if (t === 0) { g.moveTo(cx - 3, cy + oy); g.lineTo(cx + 3, cy + oy - 0.5); }
      else if (t === 1) { g.moveTo(cx + ox, cy - 4); g.lineTo(cx + ox, cy + 4); }
      else if (t === 2) { g.moveTo(cx + 1 + ox, cy - 3); g.lineTo(cx - 3 + ox, cy + 3); }
      else if (t === 3) { g.moveTo(cx - 1 + ox, cy - 2); g.lineTo(cx + 3 + ox, cy + 3); }
      else { g.moveTo(cx + ox, cy + oy); g.lineTo(cx + ox + 0.8, cy + oy + 1.3); }
      g.stroke();
    }
  }
  g.strokeStyle = 'rgba(236,226,206,.3)'; g.lineWidth = 1;
  for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(w / 2 - 3 - j * 2, -6 - j * 14); g.lineTo(w / 2 - 4 - j * 2, -30 - j * 16); g.stroke(); }
  g.restore();
}
// 旧木桩（风吹日晒、裂了缝），系一条褪了色的红布条（cloth = 1 往右飘，-1 往左飘）
function stake(g, x, y, h, lean, cloth) {
  g.save(); g.translate(x, y + 3); g.rotate(lean);
  g.fillStyle = 'rgba(72,58,46,.84)';
  g.beginPath(); g.moveTo(-4.5, 0); g.lineTo(-3.6, -h + 4); g.lineTo(-1, -h); g.lineTo(1.5, -h + 6); g.lineTo(3.8, -h + 2); g.lineTo(4.5, 0); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(236,226,206,.32)'; g.lineWidth = 0.9;
  for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(-1.5 + j * 1.4, -4 - j * 7); g.lineTo(-1 + j * 1.2, -h * 0.55 - j * 6); g.stroke(); }
  if (cloth) {
    g.fillStyle = 'rgba(176,58,36,.72)'; g.fillRect(-5, -h * 0.72, 10, 3.2);
    g.beginPath(); g.moveTo(4, -h * 0.71); g.quadraticCurveTo(12 * cloth, -h * 0.66, 18 * cloth, -h * 0.6); g.lineTo(17 * cloth, -h * 0.56); g.quadraticCurveTo(11 * cloth, -h * 0.62, 4, -h * 0.66); g.closePath(); g.fill();
  }
  g.restore();
}
// 沙堆：脚下被风堆起来的一小堆沙
function sandDrift(g, x, y, rw, rh, a) {
  const gr = g.createLinearGradient(0, y - rh, 0, y + 6);
  gr.addColorStop(0, INK(a, SAND)); gr.addColorStop(1, INK(a * 0.3, SAND));
  g.fillStyle = gr; g.beginPath(); g.moveTo(x - rw, y + 4); g.quadraticCurveTo(x - rw * 0.4, y - rh * 1.2, x + rw * 0.1, y - rh); g.quadraticCurveTo(x + rw * 0.6, y - rh * 0.8, x + rw, y + 4); g.closePath(); g.fill();
  g.strokeStyle = INK(a * 1.4, SAND_D); g.lineWidth = 1; g.beginPath(); g.moveTo(x - rw * 0.7, y - rh * 0.3); g.quadraticCurveTo(x - rw * 0.2, y - rh * 1.05, x + rw * 0.2, y - rh * 0.92); g.stroke();
}

/* ---------- 六张图 ----------
   远景 / 中景的 L：{ w, h, fy（地线在这一层里的高度）, R }，画面坐标（1 = 画面上一个逻辑像素）；
   地面的 L：{ x0, x1, R }，直接用场地坐标画（地线 y = FLOOR） */
const STAGES = {
  /* 朱日远山（1.0 起的那张，2.0 重画大了、去掉右边的「以武会友」和「斗」）：纸、朱红的太阳、两道远山、山雾、飞鸟 */
  sun: {
    name: '朱日远山', pick: true, paper: '#ebeae2',
    far(g, L) {
      const { w, fy, R } = L;
      paperFill(g, w, L.h, C.paper, R);
      const sx = w * 0.58, sy = fy - 352;
      g.fillStyle = 'rgba(184,50,29,.13)'; g.beginPath(); g.arc(sx, sy, 58, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(184,50,29,.06)'; g.beginPath(); g.arc(sx, sy, 74, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 4; i++) mistBlob(g, w * (0.15 + 0.23 * i) + R() * 60, fy - 300 - R() * 120, 150 + R() * 90, 22 + R() * 12, 0.5);
      ridge(g, w, fy - 160, 70, 0.10, 3, 0.006);
      birds(g, [[-92, 120, 1], [-62, 104, .8], [-70, 138, .7], [-122, 150, .6], [260, 92, .55], [282, 82, .45]].map(([dx, y, s]) => [sx + dx, fy - 520 + y, s]));
    },
    mid(g, L) {
      const { w, fy, R } = L;
      ridge(g, w, fy - 110, 60, 0.16, 11, 0.009);
      mist(g, w, fy - 125, 80, 0.75);
      ridge(g, w, fy - 34, 34, 0.2, 23, 0.012);
      // 近处山脊上稀稀拉拉几棵小松
      for (let i = 0; i < 12; i++) { const x = 60 + R() * (w - 120); dabPine(g, x, fy - 36 - R() * 24, 22 + R() * 16, 0.34, R); }
    },
    ground(g, L) {
      const { x0, x1, R } = L, GW = x1 - x0;
      const fg = g.createLinearGradient(0, FLOOR, 0, FLOOR + GDN);
      fg.addColorStop(0, 'rgba(70,72,66,.16)'); fg.addColorStop(1, 'rgba(70,72,66,.03)');
      g.fillStyle = fg; g.fillRect(x0, FLOOR, GW, GDN);
      floorLine(g, x0, x1, FLOOR, R);
      grassTufts(g, x0, x1, FLOOR, Math.round(26 * GW / W), R);
      pebbles(g, x0, x1, FLOOR, Math.round(14 * GW / W), R);
      wallPost(g, WALL_L - 30, FLOOR, -0.06); wallPost(g, WALL_R + 30, FLOOR, 0.06);
    },
  },

  /* 松崖飞瀑：远处一排淡淡的高峰、云雾；中景一面大崖，崖缝里一道瀑布落进雾里，崖上松树伸出来；
     脚下是一块青石台子（地线下面是石台的正面，有裂纹、有苔），场地两头各一棵小松 */
  falls: {
    name: '松崖飞瀑', pick: true, paper: '#dedfda',
    far(g, L) {
      const { w, fy, R } = L;
      paperFill(g, w, L.h, '#e9e8df', R);
      const sky = g.createLinearGradient(0, 0, 0, fy);
      sky.addColorStop(0, 'rgba(120,128,126,.10)'); sky.addColorStop(0.6, 'rgba(120,128,126,0)');
      g.fillStyle = sky; g.fillRect(0, 0, w, fy);
      // 远峰：两排，后面的更淡
      for (let i = 0; i < 9; i++) peak(g, w * (i + 0.3 + R() * 0.4) / 9, fy - 70, 150 + R() * 110, 230 + R() * 170, 0.08, R, { sharp: 1.9, lean: (R() - 0.5) * 0.6, cun: 4, dots: 3 });
      mist(g, w, fy - 230, 120, 0.8);
      for (let i = 0; i < 7; i++) peak(g, w * (i + 0.1 + R() * 0.8) / 7, fy - 40, 190 + R() * 120, 170 + R() * 140, 0.13, R, { sharp: 1.5, lean: (R() - 0.5) * 0.5, cun: 7 });
      for (let i = 0; i < 6; i++) mistBlob(g, R() * w, fy - 120 - R() * 200, 160 + R() * 120, 24 + R() * 16, 0.75);
      birds(g, [[w * 0.32, fy - 400, 0.7], [w * 0.34, fy - 386, 0.55], [w * 0.31, fy - 372, 0.5]], 'rgba(23,24,26,.4)');
    },
    mid(g, L) {
      const { w, fy, R } = L;
      // 几面崖：左边一面大的带瀑布，右边两面小一点的石柱（按镜头能看到的那一段摆：中间左右各 ±700 以内）
      const c = w / 2;
      const cliffs = [[c - 430, 310, 520, true], [c + 290, 150, 320, false], [c + 600, 210, 440, false], [c - 760, 180, 380, false]];
      for (const [cx, cw, ch, fall] of cliffs) {
        const pts = peak(g, cx, fy - 20, cw, ch, 0.42, R, { sharp: 0.7, lean: (R() - 0.5) * 0.4, cun: 26, dots: 14 });
        // 崖壁：竖着几道深的裂缝
        g.lineCap = 'round';
        for (let k = 0; k < 10; k++) {
          const x = cx - cw * 0.4 + R() * cw * 0.8, top = fy - 20 - ch * (0.3 + R() * 0.55);
          g.strokeStyle = INK(0.18 + R() * 0.2); g.lineWidth = 1 + R() * 1.6;
          g.beginPath(); g.moveTo(x, top); g.quadraticCurveTo(x + (R() - 0.5) * 20, top + 40, x + (R() - 0.5) * 14, top + 60 + R() * 70); g.stroke();
        }
        if (fall) {
          // 瀑布：从崖顶下面一点的缺口落下来，白的一条（纸色），两边描几道墨，越往下越宽、散成雾
          const fx = cx + cw * 0.08, top = fy - 20 - ch * 0.78;
          const gr = g.createLinearGradient(0, top, 0, fy - 30);
          gr.addColorStop(0, 'rgba(244,243,236,.96)'); gr.addColorStop(0.85, 'rgba(244,243,236,.9)'); gr.addColorStop(1, 'rgba(244,243,236,0)');
          g.fillStyle = gr;
          g.beginPath(); g.moveTo(fx - 9, top); g.quadraticCurveTo(fx - 14, (top + fy) / 2, fx - 22, fy - 30); g.lineTo(fx + 24, fy - 30); g.quadraticCurveTo(fx + 15, (top + fy) / 2, fx + 10, top); g.closePath(); g.fill();
          g.strokeStyle = INK(0.28); g.lineWidth = 1.1;
          for (const s of [-1, 1]) { g.beginPath(); g.moveTo(fx + s * 10, top); g.quadraticCurveTo(fx + s * 15, (top + fy) / 2, fx + s * 23, fy - 40); g.stroke(); }
          g.strokeStyle = 'rgba(160,166,164,.35)'; g.lineWidth = 0.8;
          for (let k = 0; k < 7; k++) { const x = fx - 6 + k * 2.2 + R() * 2; g.beginPath(); g.moveTo(x, top + 10 + R() * 30); g.lineTo(x + (x - fx) * 0.6, fy - 50 - R() * 60); g.stroke(); }
          for (let k = 0; k < 5; k++) mistBlob(g, fx + (R() - 0.5) * 90, fy - 40 - R() * 30, 70 + R() * 50, 26 + R() * 10, 0.85, '244,243,236');
        }
        // 崖上的松：从崖边斜着伸出来
        const n = fall ? 3 : 1 + ((R() * 2) | 0);
        for (let k = 0; k < n; k++) {
          const p = pts[5 + ((R() * 16) | 0)], side = p[0] < cx ? -1 : 1;
          pine(g, p[0], p[1] + 6, 40 + R() * 34, 0.62, R, side * (0.6 + R() * 0.6));
          for (let j = 0; j < 3; j++) { const q = pts[4 + ((R() * 18) | 0)]; dabPine(g, q[0], q[1] + 4, 14 + R() * 10, 0.45, R); }
        }
      }
      // 崖脚的雾
      mist(g, w, fy - 120, 110, 0.7, '240,239,232');
    },
    ground(g, L) {
      const { x0, x1, R } = L, GW = x1 - x0;
      // 石台的正面：上面一道厚的边，往下是石头，墨往下淡
      const fg = g.createLinearGradient(0, FLOOR, 0, FLOOR + GDN);
      fg.addColorStop(0, 'rgba(60,64,62,.34)'); fg.addColorStop(0.35, 'rgba(60,64,62,.16)'); fg.addColorStop(1, 'rgba(60,64,62,.05)');
      g.fillStyle = fg; g.fillRect(x0, FLOOR, GW, GDN);
      // 石块的缝：横着的层理 + 竖着的裂
      g.lineCap = 'round';
      for (let i = 0; i < 46 * GW / W; i++) {
        const x = x0 + R() * GW, y = FLOOR + 10 + R() * (GDN - 30), len = 20 + R() * 60;
        g.strokeStyle = INK(0.1 + R() * 0.18); g.lineWidth = 0.8 + R() * 1.4;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.5, y + (R() - 0.5) * 8, x + len, y + (R() - 0.5) * 6); g.stroke();
      }
      for (let i = 0; i < 14 * GW / W; i++) {
        const x = x0 + R() * GW, y = FLOOR + 4;
        g.strokeStyle = INK(0.18 + R() * 0.2); g.lineWidth = 1 + R();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 12, y + 14 + R() * 20); g.lineTo(x + (R() - 0.5) * 20, y + 30 + R() * 40); g.stroke();
      }
      floorLine(g, x0, x1, FLOOR, R, null, 1.25);
      // 台面上的苔点、小石子、草
      g.fillStyle = INK(0.5);
      for (let i = 0; i < 40 * GW / W; i++) { const x = x0 + R() * GW; g.beginPath(); g.ellipse(x, FLOOR - 1 + R() * 3, 1 + R() * 2, 0.8 + R(), 0, 0, Math.PI * 2); g.fill(); }
      grassTufts(g, x0, x1, FLOOR, Math.round(14 * GW / W), R, 0.3);
      // 场地两头：各一棵从石缝里长出来的小松
      pine(g, WALL_L - 34, FLOOR + 2, 120, 0.82, R, -0.7);
      pine(g, WALL_R + 34, FLOOR + 2, 128, 0.82, R, 0.7);
      for (const x of [WALL_L - 34, WALL_R + 34]) { g.fillStyle = INK(0.55); g.beginPath(); g.ellipse(x, FLOOR + 3, 22, 7, 0, 0, Math.PI * 2); g.fill(); }
    },
  },

  /* 竹林夜月：夜里，天上一层淡墨，一轮大月亮；远处一层淡淡的竹影，中景一片竹林垂着竹叶；
     脚下是土路、落了些竹叶；场地两头各几根顶天的竹子（每帧现画：太高，放不进地面那一层） */
  bamboo: {
    name: '竹林夜月', pick: true, paper: '#9a9e9e',
    far(g, L) {
      const { w, fy, R } = L;
      paperFill(g, w, L.h, '#e4e4dc', R, 'rgba(110,112,104,.06)');
      const night = g.createLinearGradient(0, 0, 0, fy);
      night.addColorStop(0, 'rgba(34,42,56,.40)'); night.addColorStop(0.55, 'rgba(34,42,56,.20)'); night.addColorStop(1, 'rgba(34,42,56,.06)');
      g.fillStyle = night; g.fillRect(0, 0, w, L.h);
      // 月亮：先把天上那一块洗亮（光晕），再画月亮
      const mx = w * 0.64, my = fy - 330, mr = 62;
      mistBlob(g, mx, my, 230, 230, 0.55, '236,236,228');
      mistBlob(g, mx, my, 120, 120, 0.6, '244,243,236');
      g.fillStyle = 'rgba(248,247,240,.97)'; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
      // 月面：几块很淡的影子，偏在一边（别对称，不然像张脸）
      g.fillStyle = 'rgba(196,198,190,.16)';
      for (const [dx, dy, rx, ry, a] of [[0.28, -0.18, 0.32, 0.2, 0.5], [0.12, 0.34, 0.26, 0.14, -0.3], [-0.42, 0.12, 0.14, 0.24, 0.2]]) {
        g.beginPath(); g.ellipse(mx + dx * mr, my + dy * mr, rx * mr, ry * mr, a, 0, Math.PI * 2); g.fill();
      }
      // 月前一缕云
      for (let i = 0; i < 3; i++) mistBlob(g, mx - 40 + i * 50, my + 30 + i * 6, 110, 10, 0.5, '214,216,210');
      // 远处竹影：细细的、很淡，一片一片
      for (let i = 0; i < 70 * w / 1200; i++) {
        const x = R() * w, top = fy - 260 - R() * 260;
        bamboo(g, x, fy + 40, top, 3 + R() * 3, 0.07 + R() * 0.05, R, '34,42,56', (R() - 0.5) * 0.04);
      }
      mist(g, w, fy - 150, 150, 0.55, '226,228,222');
    },
    mid(g, L) {
      const { w, fy, R } = L;
      // 中景竹林：灰一点、粗一点；竹叶都在高处，垂下来（人打架的那一截干净，看得清人）
      const n = Math.round(20 * w / 1200);
      for (let i = 0; i < n; i++) {
        const x = (i + 0.2 + R() * 0.6) * w / n, wd = 6 + R() * 5, a = 0.15 + R() * 0.12, top = -40 - R() * 120;
        bamboo(g, x, fy + 30, top, wd, a, R, '30,34,40', (R() - 0.5) * 0.03);
        const k = 1 + ((R() * 3) | 0);
        for (let j = 0; j < k; j++) leafCluster(g, x + (R() - 0.5) * 6, fy - 330 - R() * 260, 4 + ((R() * 3) | 0), 34 + R() * 18, a * 1.3, R, '30,34,40');
      }
      // 竹林脚下的雾
      mist(g, w, fy - 70, 90, 0.6, '226,228,222');
      // 2.5.1 萤火改成会飞、会一闪一闪的（LIVE.bamboo），以前这里是十几个不动的亮点
    },
    ground(g, L) {
      const { x0, x1, R } = L, GW = x1 - x0;
      const fg = g.createLinearGradient(0, FLOOR, 0, FLOOR + GDN);
      fg.addColorStop(0, 'rgba(56,58,58,.30)'); fg.addColorStop(1, 'rgba(56,58,58,.08)');
      g.fillStyle = fg; g.fillRect(x0, FLOOR, GW, GDN);
      floorLine(g, x0, x1, FLOOR, R, '30,32,36');
      // 落叶：地上横七竖八几片竹叶；路边几个笋、小石子
      for (let i = 0; i < 60 * GW / W; i++) {
        const x = x0 + R() * GW, y = FLOOR + 2 + R() * (GDN - 40);
        bambooLeaf(g, x, y, 10 + R() * 10, (R() - 0.5) * 0.6 + (R() < 0.5 ? 0 : Math.PI), 0.25 + R() * 0.25, '30,32,36');
      }
      for (let i = 0; i < 10 * GW / W; i++) bambooLeaf(g, x0 + R() * GW, FLOOR - 1, 9 + R() * 7, (R() < 0.5 ? 0.1 : Math.PI - 0.1), 0.5, '30,32,36');
      pebbles(g, x0, x1, FLOOR, Math.round(10 * GW / W), R, 0.25);
      for (const x of [WALL_L - 50, WALL_L - 18, WALL_R + 18, WALL_R + 50]) {          // 竹根、笋
        g.fillStyle = INK(0.7, '30,32,36'); g.beginPath(); g.moveTo(x - 7, FLOOR + 2); g.quadraticCurveTo(x - 4, FLOOR - 16, x, FLOOR - 24); g.quadraticCurveTo(x + 4, FLOOR - 16, x + 7, FLOOR + 2); g.closePath(); g.fill();
      }
    },
    // 场地两头顶天的竹子：每帧现画（场地坐标，和人一起缩放）。2.5.1 风从左边吹过来，竹子跟着慢慢摇（st.t：动态背景的时间）
    near(ctx, st) {
      const R = seeded(77), t = st ? st.t : 0;
      for (const [x0, side] of [[WALL_L - 70, -1], [WALL_R + 70, 1]]) {
        for (let i = 0; i < 3; i++) {
          const sway = bambooSway(t, i + (side > 0 ? 3 : 0));
          const x = x0 + side * i * 26 - side * 14 * R(), wd = 13 - i * 2 + R() * 2;
          bamboo(ctx, x, FLOOR + 4, FLOOR - 900, wd, 0.86 - i * 0.12, R, '24,26,30', -side * (0.006 + R() * 0.01) + sway);
          for (let j = 0; j < 4; j++) {
            const y = FLOOR - 240 - j * 110 - R() * 50;
            leafCluster(ctx, x - side * 0.01 * (j * 120 + 200) + sway * (FLOOR + 4 - y), y, 5, 34 + R() * 12, 0.8 - i * 0.1, R, '24,26,30', -side);
          }
        }
      }
    },
  },

  /* 桃花园（《桃花源记》：缘溪行……忽逢桃花林，夹岸数百步……芳草鲜美，落英缤纷）：
     远处圆头的青山在雾里，山脚一片片粉的桃林；中景一条小溪从远处弯过来，溪上一座石拱桥，两岸桃花开成一团团的粉，空中飘着花瓣；
     脚下是土路，落了一地花瓣；场地两头各一棵老桃树（每帧现画：太高，放不进地面那一层），开花的枝子从上面伸进来 */
  peach: {
    name: '桃花园', pick: true, paper: '#e9e4dd',
    far(g, L) {
      const { w, fy, R } = L, H = '240,236,229';                  // H：春天的雾，暖一点
      paperFill(g, w, L.h, '#f0ece5', R, 'rgba(130,112,104,.06)');
      const sky = g.createLinearGradient(0, 0, 0, fy);
      sky.addColorStop(0, 'rgba(118,134,144,.09)'); sky.addColorStop(0.5, 'rgba(118,134,144,0)'); sky.addColorStop(0.85, 'rgba(238,190,186,.10)'); sky.addColorStop(1, 'rgba(238,190,186,0)');
      g.fillStyle = sky; g.fillRect(0, 0, w, fy);
      // 远山：两排圆头的山，后面一排高而淡；山腰绕着雾
      for (let i = 0; i < 6; i++) peak(g, w * (i + 0.15 + R() * 0.7) / 6, fy - 170, 300 + R() * 160, 190 + R() * 130, 0.055, R, { sharp: 1.25, lean: (R() - 0.5) * 0.5, cun: 4, dots: 2, col: '58,72,84' });
      mist(g, w, fy - 300, 150, 0.7, H);
      for (let i = 0; i < 7; i++) peak(g, w * (i + R()) / 7, fy - 120, 250 + R() * 150, 90 + R() * 80, 0.075, R, { sharp: 1.1, lean: (R() - 0.5) * 0.4, cun: 5, dots: 3, col: '58,72,84' });
      // 山坡上一片片桃林（高高低低）
      for (let i = 0; i < 8; i++) grove(g, (i + 0.1 + R() * 0.8) * w / 8, fy - 132 - R() * 76, 34 + R() * 46, R, 0.85);
      for (let i = 0; i < 5; i++) mistBlob(g, R() * w, fy - 210 - R() * 150, 180 + R() * 120, 18 + R() * 12, 0.6, H);
      mist(g, w, fy - 150, 110, 0.6, H);
      // 2.5.1 天上的鸟改成会飞的（LIVE.peach：从左边飞到右边，以前这里是三只不动的燕子）
    },
    mid(g, L) {
      const { w, fy, R } = L, c = w / 2, fall = [];
      const tree = (x, y, s, o, wa, ba, bs) => {
        const t = peachTree(x, y, s, R, o), far = wa < 0.3;                     // far：远处那排小树，花点少一点、不铺晕（小，看不出来）
        paintWood(g, t, y, wa, '54,42,40', R, !far, s > 300);
        blossomCloud(g, t.spots, bs, ba, R, far ? 0.1 : 0.4, far ? 4 : 6);
        if (wa > 0.3) for (const p of t.spots) if (R() < 0.12) fall.push(p);
      };
      // 中景的草地：很淡的一层青灰（溪水才看得出来）
      const mg = g.createLinearGradient(0, fy - 240, 0, fy - 40);
      mg.addColorStop(0, 'rgba(112,124,108,0)'); mg.addColorStop(0.3, 'rgba(112,124,108,.07)'); mg.addColorStop(1, 'rgba(112,124,108,.05)');
      g.fillStyle = mg; g.fillRect(0, fy - 240, w, 200);
      // 远处的小桃树：三三两两，有疏有密
      for (let x = R() * 50; x < w; x += 36 + R() * R() * 210) tree(x, fy - 194 - R() * 30, 64 + R() * 66, { lean: (R() - 0.5) * 0.6, depth: 3 }, 0.22, 0.48, 5 + R() * 3);
      mist(g, w, fy - 222, 70, 0.55, '240,236,229');
      // 小溪：从远处横着流过来，到桥下拐个弯（桥洞底下那一段正对着我们，倒影和桥洞合成一个圆），再往右流走
      const cub = (P, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]); };
      const S = [[[c - 80, fy - 214], [c + 150, fy - 218], [c + 205, fy - 196], [c + 210, fy - 160], 3, 26],
        [[c + 210, fy - 160], [c + 213, fy - 132], [c + 250, fy - 120], [c + 340, fy - 117], 26, 30],
        [[c + 340, fy - 117], [c + 470, fy - 114], [c + 640, fy - 108], [Math.max(c + 900, w + 30), fy - 100], 30, 38]];
      const ln = [], A = [], B = [];
      for (let k = 0; k < 3; k++) for (let i = k ? 1 : 0; i <= 20; i++) { const t = i / 20, p = cub(S[k], t), [h0, h1] = S[k].slice(4); ln.push([p[0], p[1], h0 + (h1 - h0) * (k ? t : Math.pow(t, 1.6))]); }
      for (let i = 0; i < ln.length; i++) {
        const p = ln[i], q = ln[Math.max(0, i - 1)], n = ln[Math.min(ln.length - 1, i + 1)], dx = n[0] - q[0], dy = n[1] - q[1], d = Math.hypot(dx, dy) || 1;
        A.push([p[0] - dy / d * p[2], p[1] + dx / d * p[2] * 0.4]); B.push([p[0] + dy / d * p[2], p[1] - dx / d * p[2] * 0.4]);
      }
      const water = new Path2D(); water.moveTo(A[0][0], A[0][1]);
      for (const p of A) water.lineTo(p[0], p[1]);
      for (let i = B.length - 1; i >= 0; i--) water.lineTo(B[i][0], B[i][1]);
      water.closePath();
      g.fillStyle = 'rgba(245,245,241,.88)'; g.fill(water);
      g.fillStyle = 'rgba(126,148,160,.11)'; g.fill(water);
      g.save(); g.clip(water);
      for (let i = 0; i < 7; i++) { const p = ln[22 + ((R() * 36) | 0)]; mistBlob(g, p[0] + (R() - 0.5) * p[2], p[1] + 4, 16 + R() * 14, 4 + R() * 3, 0.35, PINK_L); }   // 水里两岸桃花的倒影
      g.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const p = ln[8 + ((R() * 52) | 0)], x = p[0] + (R() - 0.5) * p[2] * 1.5, y = p[1] + (R() - 0.5) * 6, l = 3 + p[2] * (0.3 + R() * 0.5);
        g.strokeStyle = R() < 0.5 ? 'rgba(108,130,144,.26)' : 'rgba(255,255,252,.75)'; g.lineWidth = 0.9 + R() * 0.5;
        g.beginPath(); g.moveTo(x - l, y); g.quadraticCurveTo(x, y - 1, x + l, y + (R() - 0.5)); g.stroke();
      }
      g.restore();
      // 两岸：一道淡墨（一段一段的，有断有续）、几块石头、草
      for (const side of [A, B]) {
        for (let i = 0; i < side.length - 2;) {
          const n = 5 + ((R() * 12) | 0);
          g.strokeStyle = INK(0.18 + R() * 0.16, '62,66,64'); g.lineWidth = 1 + R() * 0.8;
          g.beginPath(); g.moveTo(side[i][0], side[i][1]);
          for (let j = 1; j <= n && i + j < side.length; j++) g.lineTo(side[i + j][0], side[i + j][1]);
          g.stroke(); i += n + ((R() * 2) | 0);
        }
        for (let i = 16; i < side.length; i++) {                     // 岸边的草、石头：东一丛西一丛（别排成一排，像篱笆）
          if (R() < 0.3) { const x = side[i][0] + (R() - 0.5) * 20; grassTufts(g, x - 4, x + 4, side[i][1] + (R() - 0.3) * 3, 2 + ((R() * 2) | 0), R, 0.22); }
          if (R() < 0.08) { g.fillStyle = INK(0.3, '62,66,64'); g.beginPath(); g.ellipse(side[i][0] + (R() - 0.5) * 10, side[i][1], 3 + R() * 4, 1.6 + R() * 1.5, 0, 0, Math.PI * 2); g.fill(); }
        }
      }
      // 溪上漂着的花瓣
      for (let i = 0; i < 12; i++) { const p = ln[24 + ((R() * 36) | 0)]; petal(g, p[0] + (R() - 0.5) * p[2] * 1.4, p[1] + (R() - 0.5) * 4, 2 + R(), R() * 6, PINK, 0.6, 0.5); }
      // 溪左边一丛、溪边几棵；中间空着（人在那儿打）
      for (const [x, y, s, lean] of [[c - 560, fy - 136, 200, 0.22], [c - 470, fy - 156, 140, -0.12], [c - 380, fy - 128, 230, -0.28], [c + 40, fy - 182, 120, 0.1], [c + 390, fy - 176, 130, -0.2]]) tree(x, y, s, { lean, depth: 4 }, 0.34, 0.66, 8 + R() * 3);
      // 石拱桥（溪水在这儿正对着我们流，桥洞和倒影合成一个圆）
      archBridge(g, ln[20][0], ln[20][1] + 2, 176, 26, 0.55, R, water);
      tree(c + 360, fy - 136, 220, { lean: -0.25, depth: 4 }, 0.36, 0.7, 9 + R() * 3);
      // 近处两棵大的（画面两头，框住）
      tree(c - 760, fy - 24, 440, { lean: 0.2, depth: 5, w: 22 }, 0.5, 0.82, 13);
      tree(c + 790, fy - 20, 460, { lean: -0.22, depth: 5, w: 23 }, 0.5, 0.82, 13);
      // 空中飘着的花瓣：多半在树下、往右飘
      for (const [x, y] of fall) petal(g, x + (R() - 0.3) * 80, y + 20 + R() * 120, 2.4 + R() * 1.4, R() * Math.PI * 2, R() < 0.35 ? PINK_L : PINK, 0.55 + R() * 0.3);
      for (let i = 0; i < 10 * w / 1200; i++) petal(g, R() * w, fy - 60 - R() * 380, 2.2 + R() * 1.2, R() * Math.PI * 2, PINK, 0.5 + R() * 0.3);
      // 脚下的雾
      mist(g, w, fy - 80, 100, 0.6, '238,235,228');
    },
    ground(g, L) {
      const { x0, x1, R } = L, GW = x1 - x0;
      const fg = g.createLinearGradient(0, FLOOR, 0, FLOOR + GDN);
      fg.addColorStop(0, 'rgba(116,100,88,.2)'); fg.addColorStop(0.4, 'rgba(116,100,88,.1)'); fg.addColorStop(1, 'rgba(116,100,88,.04)');
      g.fillStyle = fg; g.fillRect(x0, FLOOR, GW, GDN);
      // 土路上淡淡的深浅
      g.fillStyle = 'rgba(96,82,72,.05)';
      for (let i = 0; i < 24 * GW / W; i++) { const x = x0 + R() * GW; g.beginPath(); g.ellipse(x, FLOOR + 14 + R() * 120, 30 + R() * 70, 3 + R() * 6, 0, 0, Math.PI * 2); g.fill(); }
      floorLine(g, x0, x1, FLOOR, R, '50,40,38');
      grassTufts(g, x0, x1, FLOOR, Math.round(34 * GW / W), R, 0.3);
      // 落英：路上一片片花瓣（越往下越大，离得近）
      for (let i = 0; i < 110 * GW / W; i++) { const y = FLOOR + 3 + R() * (GDN - 30), k = (y - FLOOR) / GDN; petal(g, x0 + R() * GW, y, 2.2 + k * 3 + R(), R() * Math.PI * 2, R() < 0.3 ? PINK_L : PINK, 0.4 + R() * 0.35, 0.55); }
      pebbles(g, x0, x1, FLOOR, Math.round(8 * GW / W), R, 0.18);
      // 两头老桃树底下：一堆落花
      for (const x of [WALL_L - 36, WALL_R + 36]) for (let i = 0; i < 40; i++) petal(g, x + (R() - 0.5) * 120, FLOOR + 2 + R() * 22, 2.4 + R() * 1.6, R() * Math.PI * 2, R() < 0.3 ? PINK_L : PINK, 0.5 + R() * 0.35, 0.55);
    },
    // 场地两头的老桃树：每帧现画（场地坐标，和人一起缩放）；形状只算一次，存成路径
    near(ctx) {
      const N = peachNear();
      ctx.save();
      ctx.fillStyle = INK(0.86, '44,34,32'); ctx.fill(N.wood);
      ctx.strokeStyle = 'rgba(236,232,224,.3)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke(N.dry);
      ctx.fillStyle = INK(0.62, PINK_L); ctx.fill(N.fl[0]);
      ctx.fillStyle = INK(0.74, PINK); ctx.fill(N.fl[1]);
      ctx.fillStyle = INK(0.85, PINK_D); ctx.fill(N.buds);
      ctx.fillStyle = INK(0.75, '150,44,64'); ctx.fill(N.heart);
      ctx.fillStyle = INK(0.7, PINK); ctx.fill(N.fall);
      ctx.restore();
    },
  },

  /* 大漠孤烟（王维《使至塞上》：大漠孤烟直，长河落日圆）：傍晚，一轮又大又低的落日，正落在天边一条长河上，河里一串红的倒影；
     左边远处一座烽火台，一根烟笔直地升上天；天边一线淡淡的远山、一段城墙；中景一道道起伏的沙梁，沙梁上走着一队骆驼；
     脚下是沙地，风吹出一道道沙纹，几丛骆驼刺、碎石；场地两头各一块断碑、一根旧木桩 */
  desert: {
    name: '大漠孤烟', pick: true, paper: '#e6dac3',
    far(g, L) {
      const { w, fy, R } = L, hz = fy - 214, sx = w * 0.63, sr = 92, sy = hz - sr - 2;
      paperFill(g, w, L.h, '#efe6d2', R, 'rgba(140,114,80,.07)');
      // 天：顶上一层淡淡的暮色，越往下越暖，到天边一片霞光
      const sky = g.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, 'rgba(96,88,98,.12)'); sky.addColorStop(0.4, 'rgba(96,88,98,0)'); sky.addColorStop(0.75, 'rgba(224,156,96,.08)'); sky.addColorStop(1, 'rgba(224,150,90,.2)');
      g.fillStyle = sky; g.fillRect(0, 0, w, hz + 2);
      mistBlob(g, sx, sy + 40, 430, 200, 0.26, '236,166,112');
      // 几缕晚霞：一抹淡淡的暖色，中间一道细细长长、两头尖的
      for (const [dx, dy, len, th, a] of [[-0.5, -128, 300, 5, 0.12], [-0.21, -104, 150, 3, 0.09], [0.24, -152, 320, 5, 0.1], [0.32, -138, 160, 3, 0.08], [-0.12, -300, 280, 4, 0.06], [0.1, -344, 200, 3, 0.05]]) {
        const x = sx + dx * w, y = hz + dy;
        mistBlob(g, x, y - th * 0.3, len * 0.55, th * 2.6, a * 0.9, '214,150,118');
        g.fillStyle = INK(a * 0.7, '172,118,100'); g.beginPath(); g.moveTo(x - len / 2, y);
        g.quadraticCurveTo(x - len * 0.1, y - th, x + len / 2, y - th * 0.3); g.quadraticCurveTo(x + len * 0.05, y + th * 0.6, x - len / 2, y); g.fill();
      }
      // 落日：大、低、圆，日面下半深一点（颜色往下沉）
      const sg = g.createLinearGradient(0, sy - sr, 0, sy + sr);
      sg.addColorStop(0, 'rgba(206,84,46,.24)'); sg.addColorStop(1, 'rgba(196,66,36,.33)');
      g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
      // 远山：天边一线很淡的山（太阳那一段空着，日是圆的）
      const range = (a, b, amp, al) => {
        const ph = R() * 9;
        g.beginPath(); g.moveTo(a, hz + 2);
        for (let x = a; x <= b; x += 4) { const u = (x - a) / (b - a); g.lineTo(x, hz - amp * Math.pow(Math.sin(Math.PI * u), 0.7) * (0.65 + 0.25 * Math.sin(x * 0.021 + ph) + 0.1 * Math.sin(x * 0.07 + ph))); }
        g.lineTo(b, hz + 2); g.closePath();
        const gr = g.createLinearGradient(0, hz - amp, 0, hz); gr.addColorStop(0, INK(al, '86,90,104')); gr.addColorStop(1, INK(al * 0.35, '86,90,104'));
        g.fillStyle = gr; g.fill();
      };
      range(-20, sx - sr - 60, 30, 0.12); range(sx + sr + 50, w + 20, 20, 0.09);
      // 城墙（天边断断续续一道矮墙，墙头一排垛口）、烽火台、孤烟
      const bx = w * 0.3, wy = x => hz - 1 - Math.sin(x * 0.02) * 1.2;
      g.fillStyle = INK(0.3, SAND_D);
      g.fillRect(w * 0.12 - 4, wy(w * 0.12) - 11, 8, 11);
      for (let x = w * 0.12; x < bx - 10;) {
        const e = Math.min(bx - 10, x + 30 + R() * 70);
        g.beginPath(); g.moveTo(x, wy(x));
        for (let xx = x; xx <= e; xx += 3) g.lineTo(xx, wy(xx) - 4);
        for (let xx = e; xx >= x; xx -= 3) g.lineTo(xx, wy(xx));
        g.closePath(); g.fill();
        for (let xx = x; xx < e - 2; xx += 5) g.fillRect(xx, wy(xx) - 6, 2.2, 2.2);
        x = e + 6 + R() * 18;
      }
      beacon(g, bx, hz, 22, 0.62);
      smokeColumn(g, bx, hz - 25, fy - 540, 2.2, 7, 0.36);
      // 长河：天边一条亮的带子（留白），左边近一点宽、右边远一点细；河里两处沙洲；两岸一道淡墨；太阳的倒影是一串朱红的短横
      const rt = x => hz + Math.sin(x * 0.004 + 1.3) * 1.5, rb = x => hz + 7 + 8 * (1 - x / w) + Math.sin(x * 0.009 + 0.5) * 2.5;
      const river = new Path2D(); river.moveTo(-10, rt(-10));
      for (let x = 0; x <= w + 10; x += 8) river.lineTo(x, rt(x));
      for (let x = w + 10; x >= -10; x -= 8) river.lineTo(x, rb(x));
      river.closePath();
      g.fillStyle = 'rgba(248,243,230,.92)'; g.fill(river);
      const rg = g.createLinearGradient(sx - 460, 0, sx + 460, 0);
      rg.addColorStop(0, 'rgba(232,164,112,0)'); rg.addColorStop(0.5, 'rgba(232,164,112,.32)'); rg.addColorStop(1, 'rgba(232,164,112,0)');
      g.fillStyle = rg; g.fill(river);
      for (const [x, len] of [[w * 0.17, 110], [w * 0.88, 70]]) {
        const m = (rt(x) + rb(x)) / 2;
        g.fillStyle = INK(0.3, SAND); g.beginPath(); g.moveTo(x - len / 2, m + 1); g.quadraticCurveTo(x - len * 0.1, rt(x) + 1.5, x + len / 2, m); g.quadraticCurveTo(x, rb(x) - 2, x - len / 2, m + 1); g.fill();
        g.strokeStyle = INK(0.25, SAND_D); g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - len * 0.4, m + 1.5); g.quadraticCurveTo(x, rb(x) - 2.5, x + len * 0.42, m + 0.5); g.stroke();
      }
      for (const [f, a, lw] of [[rt, 0.2, 1], [rb, 0.32, 1.4]]) { g.strokeStyle = INK(a, SAND_D); g.lineWidth = lw; g.beginPath(); for (let x = -10; x <= w + 10; x += 8) g.lineTo(x, f(x)); g.stroke(); }
      for (let i = 0; i < 5; i++) { const y = hz + 2.5 + i * 2.4, hw = sr * (0.75 - i * 0.12) * (0.8 + R() * 0.2); g.fillStyle = `rgba(200,70,38,${0.5 - i * 0.07})`; g.fillRect(sx - hw + (R() - 0.5) * 8, y, hw * 2, 1.4); }
      // 河这边：一层淡淡的沙（中景的沙丘从这里起），几道很淡的起伏
      const ng = g.createLinearGradient(0, hz + 8, 0, fy + 150);
      ng.addColorStop(0, INK(0.1, SAND)); ng.addColorStop(1, INK(0.22, SAND));
      g.fillStyle = ng; g.beginPath(); g.moveTo(-10, rb(-10)); for (let x = 0; x <= w + 10; x += 8) g.lineTo(x, rb(x)); g.lineTo(w + 10, L.h); g.lineTo(-10, L.h); g.closePath(); g.fill();
      g.strokeStyle = INK(0.1, SAND_D); g.lineWidth = 1;
      for (let i = 0; i < 6; i++) { const x = R() * w, y = hz + 30 + R() * 50, len = 120 + R() * 220; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.5, y - 4 - R() * 4, x + len, y + 1); g.stroke(); }
      // 天上盘旋的几只鹰
      for (const [dx, dy, s, rot] of [[-0.2, -420, 0.8, -0.2], [-0.16, -446, 0.6, 0.35], [-0.13, -404, 0.5, 0.1]]) { g.save(); g.translate(sx + dx * w, fy + dy); g.rotate(rot); birds(g, [[0, 0, s]], 'rgba(46,38,34,.55)'); g.restore(); }
    },
    mid(g, L) {
      const { w, fy, R } = L, c = w / 2;
      // 三排沙丘，一排比一排近（越近越大、越实）；排和排之间隔一层淡淡的沙雾
      duneRow(g, w, fy - 128, 12, 24, 260, 480, 0.22, R);
      // 驼队：一座沙丘的缓坡上走着五峰骆驼（往右，朝着河）
      const dx = c - 500, cp = duneMound(g, dx, dx + 60, dx + 380, fy - 126, 30, 0.24);
      for (let i = 0; i < 5; i++) { const x = dx + 92 + i * 26; camel(g, x, moundY(cp, x) + 1, 0.72, 1, 0.55, i === 0); }
      mist(g, w, fy - 136, 50, 0.3, '240,232,214');
      duneRow(g, w, fy - 78, 22, 40, 380, 700, 0.24, R);
      mist(g, w, fy - 86, 50, 0.25, '240,232,214');
      duneRow(g, w, fy - 20, 26, 46, 480, 900, 0.24, R);
      mist(g, w, fy - 56, 76, 0.45, '240,232,214');
    },
    ground(g, L) {
      const { x0, x1, R } = L, GW = x1 - x0;
      const fg = g.createLinearGradient(0, FLOOR, 0, FLOOR + GDN);
      fg.addColorStop(0, INK(0.26, SAND)); fg.addColorStop(0.5, INK(0.15, SAND)); fg.addColorStop(1, INK(0.07, SAND));
      g.fillStyle = fg; g.fillRect(x0, FLOOR, GW, GDN);
      windRipples(g, x0, x1, FLOOR + 12, FLOOR + GDN - 24, Math.round(40 * GW / W), R);
      floorLine(g, x0, x1, FLOOR, R, '84,62,42', 0.95);
      pebbles(g, x0, x1, FLOOR, Math.round(10 * GW / W), R, 0.2);
      for (let i = 0; i < 9 * GW / W; i++) thornTuft(g, x0 + R() * GW, FLOOR + 1, 9 + R() * 8, R, 0.45);
      // 两头：断碑 + 旧木桩（系一条褪了色的红布，往墙外飘，不进打架的地方）
      sandDrift(g, WALL_L - 30, FLOOR, 48, 10, 0.32); stele(g, WALL_L - 36, FLOOR, 96, -0.06, R); stake(g, WALL_L - 10, FLOOR, 56, 0.12, -1);
      sandDrift(g, WALL_R + 30, FLOOR, 48, 10, 0.32); stele(g, WALL_R + 36, FLOOR, 90, 0.07, R); stake(g, WALL_R + 10, FLOOR, 52, -0.14, 1);
    },
  },

  /* 练武场（打桩专用）：粉墙黛瓦的院墙、墙上一道月亮门（门里看得见远处的山和塔）、兵器架、两个木人桩、一面鼓、一面旗；
     地上是方砖，场地两头是绑着红绳的旧木桩。线条规整一点，和山水那几张不一样 */
  yard: {
    name: '练武场', train: true, paper: '#ece9df',
    far(g, L) {
      const { w, fy, R } = L;
      paperFill(g, w, L.h, '#ece9df', R);
      ridge(g, w, fy - 150, 60, 0.09, 31, 0.005);
      // 远处一座塔，雾里
      const px = w * 0.5, base = fy - 120;
      g.fillStyle = INK(0.13);
      for (let i = 0; i < 7; i++) {
        const y = base - i * 30, ww = 46 - i * 4;
        g.fillRect(px - ww / 2 + 6, y - 22, ww - 12, 22);
        g.beginPath(); g.moveTo(px - ww / 2 - 8, y - 20); g.quadraticCurveTo(px, y - 30, px + ww / 2 + 8, y - 20); g.lineTo(px + ww / 2 - 2, y - 26); g.quadraticCurveTo(px, y - 33, px - ww / 2 + 2, y - 26); g.closePath(); g.fill();
      }
      g.fillRect(px - 1.5, base - 7 * 30 - 30, 3, 26);
      mist(g, w, fy - 200, 150, 0.7);
      ridge(g, w, fy - 70, 40, 0.12, 37, 0.008);
      mist(g, w, fy - 120, 120, 0.5);                 // 2.3：远景再淡一点（月亮门里那座塔就在人背后）
    },
    mid(g, L) {
      const { w, fy, R } = L;
      const top = fy - 160, cap = 22;
      // 院墙：白墙，下面一道淡淡的水渍；上面一溜黛瓦
      const wall = g.createLinearGradient(0, top, 0, fy);
      wall.addColorStop(0, 'rgba(246,245,238,1)'); wall.addColorStop(0.75, 'rgba(236,235,226,1)'); wall.addColorStop(1, 'rgba(206,204,194,1)');
      g.fillStyle = wall; g.fillRect(0, top, w, fy - top + 40);
      g.fillStyle = 'rgba(120,122,112,.08)';
      for (let i = 0; i < 30 * w / 1200; i++) { const x = R() * w; g.beginPath(); g.ellipse(x, fy - 10 - R() * 30, 30 + R() * 60, 8 + R() * 16, 0, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = INK(0.25); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, top + 6); g.lineTo(w, top + 6); g.stroke();
      // 月亮门：在墙上挖一个圆洞（透过去看得见远景），再描一圈门框
      const c = w / 2, gates = [c, c - 560, c + 560];
      for (const gx of gates) {
        const gy = fy - 64, gr = 66;
        g.save(); g.globalCompositeOperation = 'destination-out';
        g.beginPath(); g.arc(gx, gy, gr, 0, Math.PI * 2); g.rect(gx - gr * 0.72, gy, gr * 1.44, 80); g.fill();
        g.restore();
        g.strokeStyle = INK(0.5); g.lineWidth = 5; g.beginPath(); g.arc(gx, gy, gr + 2, Math.PI * 0.82, Math.PI * 2.18); g.stroke();
        g.strokeStyle = INK(0.2); g.lineWidth = 2; g.beginPath(); g.arc(gx, gy, gr + 9, Math.PI * 0.86, Math.PI * 2.14); g.stroke();
      }
      // 瓦檐
      g.fillStyle = INK(0.78); g.fillRect(0, top - cap * 0.55, w, cap * 0.55);
      g.beginPath(); g.moveTo(0, top - cap * 0.55); g.lineTo(w, top - cap * 0.55); g.lineTo(w, top - cap); g.lineTo(0, top - cap); g.closePath(); g.fillStyle = INK(0.62); g.fill();
      g.fillStyle = INK(0.85);
      for (let x = 0; x < w; x += 13) { g.beginPath(); g.arc(x + 6.5, top + 1, 6, 0, Math.PI); g.fill(); }
      g.fillStyle = INK(0.9); g.fillRect(0, top - cap - 5, w, 6);
      // 兵器架：两根柱子一根横梁，斜靠几杆枪、棍（枪头下一撮红缨）
      for (const rx of [c - 300, c + 330]) {
        g.strokeStyle = 'rgba(74,52,34,.85)'; g.lineWidth = 5; g.lineCap = 'round';
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(rx + s * 58, fy); g.lineTo(rx + s * 58, fy - 104); g.stroke(); }
        g.lineWidth = 4; g.beginPath(); g.moveTo(rx - 66, fy - 96); g.lineTo(rx + 66, fy - 96); g.stroke();
        g.beginPath(); g.moveTo(rx - 66, fy - 40); g.lineTo(rx + 66, fy - 40); g.stroke();
        for (let k = 0; k < 6; k++) {
          const x = rx - 48 + k * 19, lean = 0.08 + R() * 0.05, len = 150 + R() * 40, spear = k % 2 === 0;
          const tx = x + lean * len, ty = fy - len;
          g.strokeStyle = 'rgba(58,42,30,.9)'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x, fy - 2); g.lineTo(tx, ty); g.stroke();
          if (spear) {
            g.fillStyle = INK(0.85); g.beginPath(); g.moveTo(tx - 3, ty + 2); g.lineTo(tx + lean * 22, ty - 20); g.lineTo(tx + 3, ty + 2); g.closePath(); g.fill();
            g.fillStyle = 'rgba(184,50,29,.85)'; g.beginPath(); g.moveTo(tx, ty + 2); g.quadraticCurveTo(tx - 9, ty + 14, tx - 3, ty + 20); g.quadraticCurveTo(tx + 6, ty + 14, tx, ty + 2); g.fill();
          }
        }
      }
      // 木人桩：一根粗木桩，上面两条斜伸的手臂、中间一条、下面一条腿
      for (const mx of [c - 150, c + 170, c - 430, c + 450]) {
        g.fillStyle = 'rgba(70,48,30,.9)';
        g.beginPath(); g.moveTo(mx - 11, fy); g.lineTo(mx - 10, fy - 128); g.quadraticCurveTo(mx, fy - 136, mx + 10, fy - 128); g.lineTo(mx + 11, fy); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(70,48,30,.9)'; g.lineWidth = 5; g.lineCap = 'round';
        for (const [y, dx, dy] of [[-104, 30, -6], [-104, -26, -8], [-82, 34, 4]]) { g.beginPath(); g.moveTo(mx + Math.sign(dx) * 8, fy + y); g.lineTo(mx + dx, fy + y + dy); g.stroke(); }
        g.lineWidth = 6; g.beginPath(); g.moveTo(mx + 8, fy - 46); g.quadraticCurveTo(mx + 30, fy - 40, mx + 28, fy - 14); g.stroke();
        g.strokeStyle = 'rgba(235,234,226,.25)'; g.lineWidth = 1;
        for (let j = 0; j < 5; j++) { g.beginPath(); g.moveTo(mx - 4 + j * 2, fy - 10 - j * 20); g.lineTo(mx - 3 + j * 2, fy - 30 - j * 20); g.stroke(); }
      }
      // 鼓
      for (const dx of [c - 700, c + 720]) {
        g.strokeStyle = 'rgba(58,42,30,.9)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(dx - 30, fy); g.lineTo(dx - 10, fy - 60); g.moveTo(dx + 30, fy); g.lineTo(dx + 10, fy - 60); g.stroke();
        g.fillStyle = 'rgba(160,44,26,.85)'; g.beginPath(); g.ellipse(dx, fy - 70, 34, 26, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(236,230,214,.9)'; g.beginPath(); g.ellipse(dx, fy - 70, 8, 24, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = INK(0.6); g.lineWidth = 1.5; g.beginPath(); g.ellipse(dx, fy - 70, 34, 26, 0, 0, Math.PI * 2); g.stroke();
      }
      // 旗：一根旗杆（2.5.1 旗面改成每帧现画、迎风飘：LIVE.yard / liveFlag）
      for (const fx of YARD_FLAGS.map(d => c + d)) {
        g.strokeStyle = 'rgba(58,42,30,.95)'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx, fy - 330); g.stroke();
        g.fillStyle = INK(0.85); g.beginPath(); g.arc(fx, fy - 334, 5, 0, Math.PI * 2); g.fill();
      }
      // 2.3（Jack：训练场背景淡一点，不然看不清人）：整层罩一层纸色 —— 瓦檐那道黑边正好在人的胸口、兵器架和木人桩在人腿后面，
      // 颜色都往纸色退一半多。source-atop：只罩画了东西的地方（月亮门的洞、墙头上的天还是透的）
      g.save(); g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(236,233,223,.56)'; g.fillRect(0, 0, w, L.h);
      g.restore();
    },
    ground(g, L) {
      const { x0, x1, R } = L, GW = x1 - x0;
      g.fillStyle = 'rgba(214,210,198,.55)'; g.fillRect(x0, FLOOR, GW, GDN);
      // 方砖：越往下（越近）砖越高；竖缝错开
      g.strokeStyle = INK(0.22); g.lineWidth = 1.2;
      let y = FLOOR + 10, hh = 12, row = 0;
      while (y < FLOOR + GDN) {
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
        const ww = 58 + row * 10, off = row % 2 ? ww / 2 : 0;
        for (let x = x0 - off; x < x1; x += ww) {
          g.beginPath(); g.moveTo(x, y - hh + 1); g.lineTo(x + (x - (x0 + x1) / 2) * 0.01, y - 1); g.stroke();
        }
        row++; hh = 12 + row * 6; y += hh;
      }
      g.fillStyle = INK(0.06);
      for (let i = 0; i < 26 * GW / W; i++) { const x = x0 + R() * GW; g.fillRect(x, FLOOR + 4 + R() * 120, 20 + R() * 40, 4 + R() * 8); }
      floorLine(g, x0, x1, FLOOR, R, null, 0.9);
      pebbles(g, x0, x1, FLOOR, Math.round(6 * GW / W), R, 0.16);
      wallPost(g, WALL_L - 30, FLOOR, -0.04); wallPost(g, WALL_R + 30, FLOOR, 0.04);
    },
  },
};
const STAGE_PICK = Object.keys(STAGES).filter(k => STAGES[k].pick);

/* ---------- 2.5.1 动起来的背景 ----------
   Jack：每张图都来点动态内容 —— 桃花园背后的鸟随机从地图左边飞到右边，缓缓扇翅膀；别的图也加类似的，尽量不重复；
   都往一边飘（从左往右），不要一会儿左一会儿右；别干扰专心打架时的视觉判断。
   · 朱日远山：几缕白云慢慢飘过（有的正好从太阳前面过，把太阳遮淡一点）
   · 松崖飞瀑：瀑布真的往下流（一道道水线往下走），落下去的地方水雾一团团腾起来、往右散开
   · 竹林夜月：萤火虫一闪一闪、慢慢往右飘；两头顶天的竹子迎着风慢慢摇
   · 桃花园：鸟从左边飞到右边（一只、两只、三只一群，扇几下翅膀滑一会儿）；几片花瓣翻着跟头往右飘落
   · 大漠孤烟：烽火台的孤烟一团团往上升（到顶上被风带着往右偏一点）；风卷起一缕缕沙从沙丘上往右掠过去
   · 练武场：两面旗迎风飘（波纹从旗杆往外、从上往下走，穗子跟着甩）
   都在人身后（远景、中景、场地两头），颜色淡、动得慢，打架的那一块干净。
   每张图的 live：{ far(g, L, st, dt), mid(g, L, st, dt) } —— 每帧现画，在贴完那一层之后、同一套坐标里（跟着视差挪）：
     L = { w, h, fy（这一层里地线的高度）, vis: [看得见的左边, 右边] }；st = 这张图的动态状态（换图才清空，窗口缩放重画背景不清空）；
     dt = 这一帧过了几秒（真实时间，暂停、慢镜头照样动）。场地两头每帧现画的 near(ctx, st) 也拿得到 st。
   只用自己的随机数 LIVE_R（不碰 Math.random、vrnd —— 电脑 AI、特效都不受影响）；系统设置了「减少动态效果」就不动（旗子照样画，静止的）。
   只是画面：不进战斗逻辑、不走联机（两边各看各的） */
const LIVE_R = seeded(((Date.now() % 2147483647) ^ 0x2545f491) >>> 0);
const lrand = (a, b) => a + (b - a) * LIVE_R();
const smooth01 = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lifeFade = (life, dur, fin, fout) => Math.min(smooth01(life / fin), smooth01((dur - life) / fout));   // 出来、消失都是慢慢的
// 软圆点的贴图（水雾、萤火、烟）：一次画好，按颜色存起来，每帧只贴
const SOFT_DOTS = {};
function softDot(rgb) {
  if (SOFT_DOTS[rgb]) return SOFT_DOTS[rgb];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.45, `rgba(${rgb},.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (SOFT_DOTS[rgb] = c);
}
function dotAt(g, spr, x, y, r, a) { if (a <= 0.003 || r <= 0) return; g.globalAlpha = Math.min(1, a); g.drawImage(spr, x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; }
const YARD_FLAGS = [-520, 600];                       // 练武场两面旗（离中景中间多远）
// 竹林两头的竹子迎着风摇（多斜多少：正 = 往右）。风从左边来，所以总是往右偏、一阵一阵的
const bambooSway = (t, i) => 0.0032 + 0.0026 * Math.sin(t * 0.9 + i * 0.7) + 0.0011 * Math.sin(t * 2.1 + i * 1.9);

// 一只小鸟（侧面，往右飞）：身子、头、剪刀尾，两只翅膀上下扇（w：1 扬到最高、-1 压到最低、0 平着看过去只剩一小片）；远侧那只淡一点、慢半拍
function liveBird(g, x, y, s, w, w2, a) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const wing = (k, al) => {
    g.fillStyle = INK(al, '34,36,40');
    g.beginPath(); g.moveTo(2.2, -0.6);
    g.quadraticCurveTo(0.8, -0.8 - 7.5 * k, -2.6 + Math.abs(k) * 0.8, -1 - 9.5 * k);
    g.quadraticCurveTo(-1.2, -0.8 - 4 * k, -1.8, -0.2);
    g.closePath(); g.fill();
  };
  wing(w2, a * 0.6);
  g.fillStyle = INK(a, '34,36,40');
  g.beginPath(); g.ellipse(0, 0, 4.4, 1.55, -0.06, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(4.4, -0.7, 1.45, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(5.6, -0.9); g.lineTo(7.4, -0.5); g.lineTo(5.6, -0.1); g.fill();
  g.beginPath(); g.moveTo(-3.2, -0.3); g.lineTo(-8, -1.6); g.lineTo(-7.2, 0.2); g.lineTo(-8, 1.7); g.lineTo(-3.2, 0.6); g.fill();
  wing(w, a);
  g.restore();
}
// 一缕白云（朱日远山）：底边平一点、上边一团一团鼓起来（中间那几团大），两头拖成细丝；底下一层很淡的灰（看得出是云，不是一条白杠）；画一次存成图
function cloudSprite(len, th) {
  const pad = 40, k = 1.5, W2 = len + pad * 2, H2 = th * 5 + pad, c = document.createElement('canvas');
  c.width = Math.ceil(W2 * k); c.height = Math.ceil(H2 * k);
  const g = c.getContext('2d'); g.scale(k, k);
  const base = H2 * 0.6, n = 8 + ((LIVE_R() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = pad + len * u + lrand(-8, 8), env = Math.pow(Math.sin(Math.PI * u), 0.8);
    mistBlob(g, x, base + th * 0.25, len / n * lrand(1.3, 1.8), th * (0.25 + 0.3 * env), 0.06, '104,108,112');      // 底下淡淡的灰
  }
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = pad + len * u + lrand(-10, 10), env = Math.pow(Math.sin(Math.PI * u), 0.8), r = th * (0.35 + 1.05 * env) * lrand(0.75, 1.2);
    mistBlob(g, x, base - r * 0.35, Math.max(r * 1.25, len / n * 0.9), r, 0.42 + 0.32 * env, '248,247,242');         // 一团一团往上鼓
  }
  for (const s of [-1, 1]) mistBlob(g, pad + len * (0.5 + s * 0.46), base, len * 0.22, th * 0.22, 0.4, '246,245,240');   // 两头的细丝
  mistBlob(g, pad + len / 2, base - th * 0.3, len * 0.32, th * 0.8, 0.35, '251,250,246');
  c.lw = W2; c.lh = H2;
  return c;
}
// 风卷起的一缕沙（大漠）：两三道细细的波纹，中间浓、两头淡
function sandWisp(g, x, y, len, a, ph) {
  if (a <= 0.003) return;
  g.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const yy = y + k * 3.5, l = len * (1 - k * 0.3), x0 = x + k * len * 0.15, gr = g.createLinearGradient(x0, 0, x0 + l, 0);
    gr.addColorStop(0, INK(0, SAND_D)); gr.addColorStop(0.35, INK(a, SAND_D)); gr.addColorStop(1, INK(0, SAND_D));
    g.strokeStyle = gr; g.lineWidth = 1.4 - k * 0.4;
    g.beginPath(); g.moveTo(x0, yy);
    for (let t = 1; t <= 4; t++) g.quadraticCurveTo(x0 + l * (t - 0.5) / 4, yy + Math.sin(ph + t) * 1.6, x0 + l * t / 4, yy + Math.sin(ph + t * 1.7) * 0.8);
    g.stroke();
  }
}
/* 练武场的旗：旗面挂在旗杆右边、贴着旗杆那条边不动，风从左边来 —— 一道道波纹从上往下、从旗杆往外走，越往外、越往下飘得越开；下边一排穗跟着甩。
   旗面切成一格一格（u 从旗杆往外 0 ~ 1、v 从上往下 0 ~ 1），波纹斜过去的地方深一点 / 浅一点（看得出褶）。
   颜色是罩过中景那层纸色（2.3：练武场背景退一半多，人看得清）以后的样子 */
function liveFlag(g, fx, fy, t, ph) {
  const NV = 12, NU = 4, A = 4.2, f = 0.55, TAU = Math.PI * 2;
  const outer = v => { const a = 1 - v; return [a * a * (fx + 58) + 2 * a * v * (fx + 52) + v * v * (fx + 60), a * a * (fy - 316) + 2 * a * v * (fy - 250) + v * v * (fy - 180)]; };
  const P = (u, v) => {
    const R0 = outer(v), lx = fx + 2, ly = fy - 322 + 136 * v, x = lx + (R0[0] - lx) * u, y = ly + (R0[1] - ly) * u;
    const amp = A * Math.pow(u, 1.2) * (0.35 + 0.65 * v), arg = TAU * f * t - 2.2 * v - 1.6 * u + ph;
    return [x + amp * (Math.sin(arg) + 0.35 * Math.sin(TAU * 0.23 * t + ph * 2 - 1.2 * v)), y + amp * 0.25 * Math.cos(arg)];
  };
  const line = pts => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); };
  const edge = [];
  for (let j = 0; j <= NU; j++) edge.push(P(j / NU, 0));
  for (let i = 1; i <= NV; i++) edge.push(P(1, i / NV));
  for (let j = NU - 1; j >= 0; j--) edge.push(P(j / NU, 1));
  g.fillStyle = 'rgba(209,151,137,.82)'; line(edge); g.closePath(); g.fill();
  for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++) {
    const a = P(j / NU, i / NV), b = P((j + 1) / NU, i / NV), c = P((j + 1) / NU, (i + 1) / NV), d = P(j / NU, (i + 1) / NV);
    const k = clamp(((c[0] + d[0]) - (a[0] + b[0])) * 0.035, -0.08, 0.08);
    if (Math.abs(k) < 0.01) continue;
    g.fillStyle = k > 0 ? `rgba(120,64,54,${k})` : `rgba(250,238,228,${-k})`;
    line([a, b, c, d]); g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(142,141,135,.45)'; g.lineWidth = 2; g.lineJoin = 'round';
  const inner = [P(0.1, 0.06)];
  for (let i = 0; i <= 6; i++) inner.push(P(0.86, 0.06 + 0.89 * i / 6));
  inner.push(P(0.1, 0.95)); line(inner); g.stroke();
  g.strokeStyle = 'rgba(209,151,137,.8)'; g.lineWidth = 1.2; g.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const u = (k + 0.3) / 9.3, p = P(u, 1), q = P(u, 0.88);
    g.beginPath(); g.moveTo(p[0], p[1] + 1); g.lineTo(p[0] + 1 + (p[0] - q[0]) * 0.9, p[1] + 12); g.stroke();
  }
}
// 一群鸟：扇几下、滑一会儿（扇的时候翅膀上下、身子跟着一起一伏；滑的时候翅膀微微扬着不动）
function birdFlap(m, dt) {
  m.tm -= dt;
  if (m.glide) {
    const e = Math.min(1, dt * 4); m.w += (0.3 - m.w) * e; m.w2 += (0.24 - m.w2) * e;
    if (m.tm <= 0) { m.glide = false; m.ph = Math.asin(clamp(m.w, -1, 1)); m.tm = lrand(2.5, 5); }
  } else {
    m.ph += dt * Math.PI * 2 / m.per; m.w = Math.sin(m.ph); m.w2 = Math.sin(m.ph - 0.35);
    if (m.tm <= 0 && Math.abs(m.w - 0.3) < 0.15 && Math.cos(m.ph) > 0) { m.glide = true; m.tm = lrand(0.8, 2); }
  }
}

const LIVE = {
  sun: {
    // 几缕白云从左往右慢慢飘（三缕，飘出右边就从左边再进来一缕新的；四成从太阳前面过）
    far(g, L, st, dt) {
      const CL = st.clouds || (st.clouds = []), sunY = L.fy - 352;
      const make = x => { const len = lrand(220, 420), th = lrand(12, 22), y = LIVE_R() < 0.4 ? sunY + lrand(-26, 30) : L.fy - lrand(230, 430); return { x, y, sp: lrand(5, 10), spr: cloudSprite(len, th) }; };
      if (!CL.length) for (let i = 0; i < 3; i++) CL.push(make(L.w * (i + lrand(0.1, 0.9)) / 3));
      for (let i = 0; i < CL.length; i++) {
        const c = CL[i]; c.x += c.sp * dt;
        if (c.x - c.spr.lw / 2 > L.w + 10) { CL[i] = make(-260 - lrand(20, 220)); continue; }
        g.drawImage(c.spr, c.x - c.spr.lw / 2, c.y - c.spr.lh / 2, c.spr.lw, c.spr.lh);
      }
    },
  },
  falls: {
    // 瀑布往下流：瀑布里一道道水线往下走（白的、淡灰的），快到底下淡进雾里；底下水雾一团团腾起来、往右散开
    mid(g, L, st, dt) {
      const c = L.w / 2, cx = c - 430, cw = 310, ch = 520, fx = cx + cw * 0.08, top = L.fy - 20 - ch * 0.78, bot = L.fy - 30, md = (top + L.fy) / 2;
      const q = (a, b, e, u) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * e;
      const xl = u => q(fx - 9, fx - 14, fx - 22, u), xr = u => q(fx + 10, fx + 15, fx + 24, u), yy = u => q(top, md, bot, u);
      const S = st.streaks || (st.streaks = Array.from({ length: 14 }, () => ({ s: lrand(0.08, 0.92), u: LIVE_R(), len: lrand(0.06, 0.13), sp: lrand(0.33, 0.45), white: LIVE_R() < 0.4, lw: lrand(0.8, 1.4) })));
      const M = st.spray || (st.spray = []);
      if (st.nextSpray === undefined) st.nextSpray = 0;
      if (dt > 0 && st.t >= st.nextSpray && M.length < 7) { M.push({ x: fx + lrand(-22, 22), y: bot - lrand(4, 16), vx: lrand(7, 15), vy: -lrand(2, 6), r0: lrand(16, 24), life: 0, dur: lrand(3, 5) }); st.nextSpray = st.t + lrand(0.45, 1.1); }
      for (const k of S) { k.u += k.sp * dt; if (k.u > 1) { k.u -= 1 + k.len; k.s = lrand(0.08, 0.92); } }
      for (let i = M.length - 1; i >= 0; i--) { const m = M[i]; m.life += dt; if (m.life >= m.dur) M.splice(i, 1); else { m.x += m.vx * dt; m.y += m.vy * dt; } }
      if (fx + 140 < L.vis[0] || fx - 60 > L.vis[1]) return;                // 看不见就不画（照样往前走）
      g.save();
      g.beginPath(); g.moveTo(fx - 9, top); g.quadraticCurveTo(fx - 14, md, fx - 22, bot); g.lineTo(fx + 24, bot); g.quadraticCurveTo(fx + 15, md, fx + 10, top); g.closePath(); g.clip();
      g.lineCap = 'round';
      for (const k of S) {
        const u0 = clamp(k.u, 0, 1), u1 = clamp(k.u + k.len, 0, 1); if (u1 <= u0) continue;
        const fade = Math.min(1, (1 - u0) * 4);
        g.strokeStyle = k.white ? `rgba(255,255,255,${0.9 * fade})` : `rgba(116,124,128,${0.42 * fade})`; g.lineWidth = k.lw;
        g.beginPath();
        for (let j = 0; j <= 4; j++) { const u = u0 + (u1 - u0) * j / 4, x = xl(u) + (xr(u) - xl(u)) * k.s; j ? g.lineTo(x, yy(u)) : g.moveTo(x, yy(u)); }
        g.stroke();
      }
      g.restore();
      const spr = softDot('246,245,240');
      for (const m of M) dotAt(g, spr, m.x, m.y, m.r0 * (0.7 + 0.9 * m.life / m.dur), 0.55 * lifeFade(m.life, m.dur, 0.6, 1.8));
    },
  },
  bamboo: {
    // 萤火虫：一闪一闪（亮一阵、暗一阵），慢慢往右飘、上下浮着；十来只，出来、消失都是慢慢的；黄绿色（夜里的灰底上看得出来）
    mid(g, L, st, dt) {
      const FL = st.flies || (st.flies = []), halo = softDot('206,228,86'), core = softDot('248,252,186');
      if (st.nextFly === undefined) st.nextFly = 0;
      if (dt > 0 && st.t >= st.nextFly && FL.length < 10) {
        FL.push({ x: lrand(L.vis[0] + 30, L.vis[1] - 120), y: L.fy - lrand(50, 260), vx: lrand(4, 10), bA: lrand(4, 10), bP: lrand(3, 6), ph: LIVE_R() * 6.28, life: 0, dur: lrand(7, 13), pP: lrand(1.6, 3.2), pPh: LIVE_R() * 6.28 });
        st.nextFly = st.t + lrand(0.6, 1.8);
      }
      for (let i = FL.length - 1; i >= 0; i--) {
        const f = FL[i]; f.life += dt;
        if (f.life >= f.dur) { FL.splice(i, 1); continue; }
        f.x += f.vx * dt;
        const y = f.y + f.bA * Math.sin(Math.PI * 2 * f.life / f.bP + f.ph);
        const glow = lifeFade(f.life, f.dur, 1.2, 1.5) * Math.pow(Math.max(0, Math.sin(Math.PI * 2 * f.life / f.pP + f.pPh)) * 0.75 + 0.25, 1.4);
        dotAt(g, halo, f.x, y, 12, glow * 0.6);
        dotAt(g, core, f.x, y, 3.2, glow);
      }
    },
  },
  peach: {
    // 鸟（Jack 点名要的）：隔十几秒从地图左边飞进来一群（一只、两只或三只），缓缓扇翅膀，飞到右边出去；同时最多两群
    far(g, L, st, dt) {
      const B = st.birds || (st.birds = []);
      if (st.nextBird === undefined) st.nextBird = st.t + lrand(1.5, 4);
      if (dt > 0 && st.t >= st.nextBird && B.length < 2) {
        const n = LIVE_R() < 0.5 ? 1 : LIVE_R() < 0.7 ? 2 : 3, s0 = lrand(0.95, 1.2);
        const fl = { x: -40, y: L.fy - lrand(250, 380), sp: lrand(40, 58), ph: LIVE_R() * 6.28, m: [] };
        for (let i = 0; i < n; i++) fl.m.push({ dx: -i * lrand(16, 26), dy: i ? lrand(-9, 9) : 0, s: s0 * lrand(0.88, 1.08), ph: LIVE_R() * 6.28, per: lrand(0.95, 1.35), glide: false, tm: lrand(2.5, 5), w: 0, w2: 0 });
        B.push(fl); st.nextBird = st.t + lrand(8, 20);
      }
      for (let i = B.length - 1; i >= 0; i--) {
        const fl = B[i]; fl.x += fl.sp * dt;
        let left = 1e9;
        for (const m of fl.m) {
          birdFlap(m, dt);
          const x = fl.x + m.dx, y = fl.y + m.dy + Math.sin(st.t * 0.45 + fl.ph) * 7 + (m.glide ? 0 : Math.cos(m.ph) * 0.9);
          left = Math.min(left, x);
          if (x > L.vis[0] - 30 && x < L.vis[1] + 30) liveBird(g, x, y, m.s, m.w, m.w2, 0.6);
        }
        if (left > L.w + 40) B.splice(i, 1);
      }
    },
    // 落英：几片花瓣翻着跟头往右飘、慢慢往下落（在人头顶上面那一截，飘一阵就淡掉）
    mid(g, L, st, dt) {
      const P = st.petals || (st.petals = []);
      if (st.nextPetal === undefined) st.nextPetal = st.t + lrand(0.5, 2);
      if (dt > 0 && st.t >= st.nextPetal && P.length < 6) {
        P.push({ x: lrand(L.vis[0] - 60, L.vis[1] - 160), y: L.fy - lrand(250, 420), vx: lrand(14, 26), vy: lrand(4, 9), rot: LIVE_R() * 6.28, vr: lrand(-1.4, 1.4), s: lrand(2.2, 3.3), life: 0, dur: lrand(7, 12), ph: LIVE_R() * 6.28, col: LIVE_R() < 0.35 ? PINK_L : PINK });
        st.nextPetal = st.t + lrand(1.2, 3);
      }
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]; p.life += dt;
        if (p.life >= p.dur) { P.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        petal(g, p.x, p.y + Math.sin(p.life * 1.3 + p.ph) * 5, p.s, p.rot, p.col, 0.62 * lifeFade(p.life, p.dur, 1.2, 1.6), 0.45 + 0.55 * Math.abs(Math.cos(p.life * 1.7 + p.ph)));
      }
    },
  },
  desert: {
    // 孤烟：一团团淡烟顺着烟柱慢慢往上升（二十来秒升到顶），越往上越宽、越淡，到顶上被风带着往右偏一点
    far(g, L, st) {
      const bx = L.w * 0.3, y0 = L.fy - 239, y1 = L.fy - 540, spr = softDot('70,64,60'), N = 11;
      for (let i = 0; i < N; i++) {
        const p = ((st.t * 0.045 + i / N) % 1 + 1) % 1, k = (i * 7 % N) / N;
        const x = bx + 9 * p * p + Math.sin(st.t * 0.6 + i * 1.7) * (0.8 + 2.2 * p), y = y0 + (y1 - y0) * p;
        dotAt(g, spr, x, y, (2.4 + 5.6 * p) * (1.15 + 0.6 * k) + 1.5, 0.26 * Math.pow(1 - p, 1.1) * smooth01(p / 0.05));
      }
    },
    // 风卷起的沙：一缕一缕从左往右掠过沙丘（淡、细，一两秒就散）
    mid(g, L, st, dt) {
      const W2 = st.wisps || (st.wisps = []);
      if (st.nextWisp === undefined) st.nextWisp = 0;
      if (dt > 0 && st.t >= st.nextWisp && W2.length < 6) {
        W2.push({ x: lrand(L.vis[0] - 80, L.vis[1] - 220), y: L.fy - lrand(60, 160), len: lrand(70, 150), vx: lrand(30, 52), life: 0, dur: lrand(2.2, 3.8), ph: LIVE_R() * 6.28, a: lrand(0.2, 0.3) });
        st.nextWisp = st.t + lrand(0.4, 1.1);
      }
      for (let i = W2.length - 1; i >= 0; i--) {
        const w = W2[i]; w.life += dt;
        if (w.life >= w.dur) { W2.splice(i, 1); continue; }
        w.x += w.vx * dt;
        sandWisp(g, w.x, w.y, w.len, w.a * lifeFade(w.life, w.dur, 0.5, 0.9), w.ph + w.life * 2);
      }
    },
  },
  yard: {
    // 两面旗迎风飘
    mid(g, L, st) { const c = L.w / 2; YARD_FLAGS.forEach((d, i) => liveFlag(g, c + d, L.fy, st.t, i * 1.3)); },
  },
};
for (const k in LIVE) STAGES[k].live = LIVE[k];

/* ---------- 场景管理：选哪张、按屏幕分辨率画成离屏图、每帧贴上去 ---------- */
const Stage = {
  pref: 'sun',                 // 人机 / 双人用的（菜单里选，存在 localStorage「modou.stage」）
  online: 'sun',               // 联机：房主选的（net.js 同步过来）
  id: null, layers: null, built: null, pending: 0,
  live: null, liveLast: 0,     // 2.5.1 动态背景：这张图的状态（{ id, t 秒 }，换图才清空）、上一帧的时间
  load() { try { const v = localStorage.getItem('modou.stage'); if (STAGE_PICK.includes(v)) this.pref = v; } catch (e) {} },
  setPref(id) { if (!STAGE_PICK.includes(id)) return; this.pref = id; try { localStorage.setItem('modou.stage', id); } catch (e) {} },
  // 这一局用哪张：打桩 = 练武场；联机 = 房主选的；别的 = 自己选的
  forMode(mode) { return mode === 'train' ? 'yard' : mode === 'online' ? this.online : this.pref; },
  // 需要的分辨率（逻辑像素 → 屏幕物理像素）：远景、中景按画面缩放；地面还要乘上镜头放大
  want(view) {
    const k = view.scale * view.pxr;
    return { back: clamp(k, 0.6, 2), ground: clamp(k * view.zmax, 1, 3.4), vw: view.vw, fy: view.fy, vh: view.vh };
  },
  // 每帧调：场景换了、分辨率差得多了就重画（窗口一直在拖时先用旧图拉伸，停下来再画清楚）
  use(id, view) {
    const w = this.want(view), b = this.built;
    const stale = !b || b.id !== id || Math.abs(w.back / b.back - 1) > 0.12 || Math.abs(w.ground / b.ground - 1) > 0.12 || w.fy + 60 > b.top || w.vw > b.vw + 1;
    if (!stale) return;
    if (!b || b.id !== id || !this.layers) { this.build(id, w); return; }
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.build(id, this.want(view)), 180);
  },
  build(id, w) {
    const S = STAGES[id] || STAGES.sun, R = n => seeded(n * 7919 + id.length * 131);
    const top = Math.ceil(Math.max(w.fy, 520) + 70);               // 地线以上画多高（盖住画面最上面，再加一点镜头上抬的余量）
    const vw = Math.max(w.vw, W);
    const mk = (lw, lh, res, paint, seed) => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(lw * res); c.height = Math.ceil(lh * res);
      const g = c.getContext('2d'); g.scale(res, res);
      paint(g, { w: lw, h: lh, fy: top, R: R(seed) });
      c.lw = lw; c.lh = lh;
      return c;
    };
    const farW = Math.ceil(vw + 160 + STAGE_W * PAR_FAR), midW = Math.ceil(vw + 160 + STAGE_W * PAR_MID), lh = top + SKY_BELOW;
    const far = mk(farW, lh, w.back * 0.85, S.far, 1);
    const mid = S.mid ? mk(midW, lh, w.back, S.mid, 2) : null;
    const GW = STAGE_W - 2 * GX0, GH = GUP + GDN;
    const gc = document.createElement('canvas');
    gc.width = Math.ceil(GW * w.ground); gc.height = Math.ceil(GH * w.ground);
    const gg = gc.getContext('2d'); gg.scale(w.ground, w.ground); gg.translate(-GX0, GUP - FLOOR);
    S.ground(gg, { x0: GX0, x1: STAGE_W - GX0, R: R(3) });
    this.layers = { far, mid, ground: gc, near: S.near || null };
    this.built = { id, back: w.back, ground: w.ground, top, vw };
    this.id = id;
    if (!this.live || this.live.id !== id) this.live = { id, t: 0 };      // 2.5.1 换了图才从头来（窗口缩放重画背景，鸟照样接着飞）
  },
  // 2.5.1 动态背景的时钟：真实时间，一帧最多算 0.1 秒（切到后台再回来不会一下子跳一大截）；「减少动态效果」时不走
  liveStep() {
    const now = performance.now(), dt = this.liveLast && !reduceMotion ? clamp((now - this.liveLast) / 1000, 0, 0.1) : 0;
    this.liveLast = now;
    if (this.live) this.live.t += dt;
    return dt;
  },
  // 远景、中景：画面坐标。地线对齐画面上的地线 fy（lift = 镜头上抬了多少，画面像素），按视差左右挪；
  // 2.5.1 每一层贴完，接着在同一套坐标里画这一层会动的东西（STAGES[id].live.far / mid）
  drawBack(ctx, camX, view, lift) {
    const L = this.layers, S = STAGES[this.id] || STAGES.sun;
    ctx.fillStyle = S.paper || C.paper;
    ctx.fillRect(-20, -20, view.vw + 40, view.vh + 40);
    if (!L) return;
    const top = this.built.top, lv = S.live, st = this.live, dt = this.liveStep();
    for (const [c, par, py, k] of [[L.far, PAR_FAR, 0.25, 'far'], [L.mid, PAR_MID, 0.5, 'mid']]) {
      if (!c) continue;
      const x = view.vw / 2 - c.lw / 2 - (camX - STAGE_W / 2) * par, y = view.fy + lift * py - top;
      ctx.drawImage(c, x, y, c.lw, c.lh);
      if (lv && lv[k] && st) {
        ctx.save(); ctx.translate(x, y);
        lv[k](ctx, { w: c.lw, h: c.lh, fy: top, vis: [-x, view.vw - x] }, st, dt);
        ctx.restore();
      }
    }
  },
  // 地面：场地坐标（在镜头的变换里画）
  drawGround(ctx) {
    const L = this.layers;
    if (!L) return;
    ctx.drawImage(L.ground, GX0, FLOOR - GUP, STAGE_W - 2 * GX0, GUP + GDN);
    if (L.near) L.near(ctx, this.live);
  },
  // 选场景按钮上的小图：远景 + 中景缩小画一张（只画一次，存起来）
  thumbs: {},
  thumb(id, tw, th) {
    const key = id + tw + 'x' + th;
    if (this.thumbs[key]) return this.thumbs[key];
    const S = STAGES[id], LH = 560, k = th / LH, lw = Math.ceil(tw / k), top = LH * 0.88;
    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    const g = c.getContext('2d');
    const layer = (paint, seed) => {
      const t = document.createElement('canvas'); t.width = tw; t.height = th;
      const tg = t.getContext('2d'); tg.scale(k, k);
      paint(tg, { w: lw, h: LH, fy: top, R: seeded(seed * 7919 + id.length * 131) });
      return t;
    };
    g.drawImage(layer(S.far, 1), 0, 0);
    if (S.mid) g.drawImage(layer(S.mid, 2), 0, 0);
    g.fillStyle = 'rgba(23,24,26,.55)'; g.fillRect(0, top * k, tw, 2);
    return (this.thumbs[key] = c.toDataURL('image/png'));
  },
};
Stage.load();
