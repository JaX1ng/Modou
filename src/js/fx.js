'use strict';
/* 特效粒子、命中特效 hitFx、WebAudio 合成音效（全是视觉/听觉，不影响胜负） */

/* ============================================================
   特效
   ============================================================ */
const FX = [];
let splats = [];
/* ---------- 2.0.1 颜色归属（Jack：字幕、气、打击特效都要一眼看出是谁的）----------
   每个人的一套颜色都从身体颜色 F.color 算出来（头带色好几个人一样，分不出是谁，所以不用它当特效色了）：
     ink  身体色本身：印章底板、伤害数字和字、冲击星的尖刺、墨点、地裂
     fx   打击色：同色提亮、提饱和 —— 迸出去的火花、气浪要跳出来；墨这种没颜色的就是墨本身
     qi   气：同色往淡里走 —— 身上的火苗、光、扫痕、残影、拖尾线，贴着人身子的都用淡的，人身子的边才清楚、不糊成一团
     core 火花芯、旺火的火心：再淡一层 */
const rgbOf = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
function hslOf(c) {
  const [r, g, b] = rgbOf(c).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const h = !d ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;   // 0~6
  return [h, s, l];
}
function hexHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h % 2 - 1)), m = l - c / 2;
  const [R, G, B] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const hx = v => Math.round(clamp(v + m, 0, 1) * 255).toString(16).padStart(2, '0');
  return '#' + hx(R) + hx(G) + hx(B);
}
const lumOf = c => { const [r, g, b] = rgbOf(c).map(v => { v /= 255; return v <= 0.04 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrastOf = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mixHex = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const PALS = {};
function palOf(col) {
  if (PALS[col]) return PALS[col];
  const [h, s, l] = hslOf(col), gray = s < 0.2;
  const fx = gray ? hexHsl(h, s, clamp(l + 0.12, 0.22, 0.52)) : hexHsl(h, Math.min(1, s * 1.15 + 0.06), clamp(l * 1.22, 0.36, 0.52));
  // 气：往亮里提，提到和身子的明暗对比够 2.6 倍（叠在身子边上也分得开）为止；但别亮过纸色太多（亮度 0.36 封顶），
  // 不然纸上、夜里的竹林上都看不见（苍这种本来就浅的身子，气就停在 0.36）
  const qs = gray ? Math.min(1, s * 1.6) : Math.min(1, s * 1.1);         // 饱和度留足：淡了也认得出是什么色（朱的气偏粉红、赭的偏橙，分得开）
  let ql = l + ((gray ? 0.6 : 0.7) - l) * (gray ? 0.5 : 0.45), qi = hexHsl(h, qs, ql);
  while (contrastOf(qi, col) < 2.6 && ql < 0.72 && lumOf(hexHsl(h, qs, ql + 0.02)) <= 0.36) qi = hexHsl(h, qs, ql += 0.02);
  // 2.0.2 头带、发带、腰带（band）：同一个颜色往亮里提一截（和身子的明暗对比 2.3 倍左右），饱和度略低一点像布 ——
  // 箍在身上分得开、不糊成一团，一看就是这个人的（墨是深灰、靛是浅蓝、朱是浅朱）
  const bs = gray ? s : Math.min(1, s * 0.9);
  let bl = l, band = col;
  while (contrastOf(band, col) < 2.3 && bl < 0.8) band = hexHsl(h, bs, bl += 0.01);
  return (PALS[col] = { ink: col, fx, qi, core: mixHex(fx, '#f4f3ec', 0.62), band });
}
// own：人（用他的身体色）或者直接给颜色；没有归属的（回合、时间到这种）用墨色
const colOf = o => !o ? C.ink : typeof o === 'string' ? o : o.color;
const pal = o => palOf(colOf(o));
/* ---------- 联机回滚时的特效和声音（1.9.0） ----------
   回滚重算那几帧（game.quiet）不直接出特效、不出声。可对方的招晚到时，重算出来的时间线里会多出一下「打中」—— 不补的话这一下没火花没声音。
   做法：联机时正常算的每一帧，记下出过的特效 / 声音的「名字」（种类 + 字）；重算时出的先攒着，算完和原来那几帧比，
   多出来的才补放（晚几帧，总比没有好），原来就放过的不再放一遍。猜错了、其实没打中的那一下已经放出去了，收不回来，没关系 */
const FXREC = { log: new Map(), fresh: null };
function fxDo(sig, play) {
  if (game.quiet) { if (FXREC.fresh) FXREC.fresh.push([game.frame, sig, play]); return; }
  if (game.mode === 'online') {
    let a = FXREC.log.get(game.frame);
    if (!a) { FXREC.log.set(game.frame, a = []); for (const f of FXREC.log.keys()) if (f < game.frame - 60) FXREC.log.delete(f); }
    a.push(sig);
  }
  play();
}
function fxRollStart() { FXREC.fresh = []; }
// 重算完：重算的是 game.frame 在 (g0, g1] 的那几帧。这几帧的记录换成新时间线的，新时间线里多出来的特效、声音补放
function fxRollEnd(g0, g1) {
  const fresh = FXREC.fresh || [], skip = new Map();
  FXREC.fresh = null;
  for (let f = g0 + 1; f <= g1; f++) { for (const s of FXREC.log.get(f) || []) skip.set(s, (skip.get(s) || 0) + 1); FXREC.log.delete(f); }
  for (const [f, s, play] of fresh) {
    let a = FXREC.log.get(f); if (!a) FXREC.log.set(f, a = []); a.push(s);
    const k = skip.get(s) || 0;
    if (k > 0) skip.set(s, k - 1); else play();
  }
}
const addFx = o => { o.max = o.max || o.life; fxDo(o.type + (o.text || ''), () => FX.push(o)); return o; };
const flashTo = v => fxDo('flash', () => { game.flash = Math.max(game.flash, v); });
function drops(n, x, y, dir, spd, cols, spread = 0.9, up = 0.35) {
  for (let i = 0; i < n; i++) {
    const a = (vrnd() - 0.5) * 2 * spread - up;
    const s = spd * rnd(0.35, 1.15);
    addFx({ type: 'drop', x, y, vx: Math.cos(a) * s * dir, vy: Math.sin(a) * s - rnd(0, 1.5), r: rnd(1.2, 3.6), color: vpick(cols), life: 90 });
  }
}
function burst(x, y, dir, n, len, w, color) {
  for (let i = 0; i < n; i++) {
    const base = dir > 0 ? 0 : Math.PI;
    addFx({ type: 'line', x, y, ang: base + rnd(-1.3, 1.3), len: len * rnd(0.6, 1.2), w, color, life: 11 });
  }
}
const ring = (x, y, r0, r1, w, color, life = 16, sy = 1) => addFx({ type: 'ring', x, y, r0, r1, w, color, life, sy });
const arcFx = (x, y, r, a0, a1, w, color, life = 14) => addFx({ type: 'arc', x, y, r, a0, a1, w, color, life });
const streak = (x1, y1, x2, y2, w, color, life = 14) => addFx({ type: 'streak', x1, y1, x2, y2, w, color, life });
/* ---------- 1.9.0 新特效：少用圆圈和圆点，多用火花、尖刺、笔刷 ---------- */
// 火花：带速度、阻力、一点重力的亮线，画的时候按速度拉长（看着像迸出去的火星）。dir 朝哪边，spread 张开多大，up 往上偏多少
function sparks(x, y, dir, n, spd, color, spread = 0.9, up = 0.25, life = 16) {
  const base = dir > 0 ? 0 : Math.PI;
  for (let i = 0; i < n; i++) {
    const a = base + rnd(-spread, spread) - up * dir, s = spd * rnd(0.45, 1.25);
    addFx({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, w: rnd(2.2, 4), color, life: (life * rnd(0.6, 1.2)) | 0, g: 0.16 });
  }
}
// 冲击星：从打中的地方炸出几根尖刺（多数朝打的方向），中间一团纸白的闪光，几帧就收
function impact(x, y, dir, size, color, n = 7, spread = 1.0, life = 8) {
  const base = dir > 0 ? 0 : Math.PI, spikes = [];
  for (let i = 0; i < n; i++) {
    const back = i >= n - 2;                                        // 两根往反方向（被打穿的感觉）
    spikes.push({ a: (back ? base + Math.PI : base) + rnd(-spread, spread) * (back ? 0.5 : 1), len: rnd(0.55, 1.15) * (back ? 0.55 : 1), w: rnd(0.12, 0.2) });
  }
  const core = []; for (let i = 0; i < 9; i++) core.push(rnd(0.55, 1));
  addFx({ type: 'star', x, y, size, color, spikes, core, rot: rnd(0, 6.3), life });
}
// 笔刷扫痕：两头尖、中间粗的一道月牙（实心），扫出去以后慢慢淡掉
const swipe = (x, y, r, mid, span, w, color, life = 14) => addFx({ type: 'swipe', x, y, r, a0: mid - span / 2, a1: mid + span / 2, w, color, life });
// 集中线：重击时四周一圈往打中的地方收的细墨线（漫画那种），一两帧
function focusLines(x, y, n, r0, r1, color, life = 9) {
  const ls = []; for (let i = 0; i < n; i++) ls.push({ a: rnd(0, Math.PI * 2), r: rnd(r0, r1), w: rnd(1.2, 3) });
  addFx({ type: 'focus', x, y, ls, r0, life, color });
}
// 地裂：踩地、砸地时沿着地面裂开几道（代替地上那一圈椭圆）
function cracks(x, n, len, color) {
  const ls = [];
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1, pts = [[x + s * rnd(4, 10), FLOOR]];
    let px = pts[0][0], py = FLOOR;
    for (let k = 0; k < 4; k++) { px += s * len * rnd(0.18, 0.32); py = FLOOR + rnd(-3, 4); pts.push([px, py]); }
    ls.push(pts);
  }
  addFx({ type: 'crack', ls, color, life: 26 });
}
// 墨点：拉成水滴形，跟着速度拖尾巴
function inkDrops(n, x, y, dir, spd, color, spread = 0.8, up = 0.3) { drops(n, x, y, dir, spd, [color], spread, up); }
function dust(x, y, n, big) {
  for (let i = 0; i < n; i++) addFx({ type: 'dust', x: x + rnd(-14, 14), y: y - rnd(0, 6), vx: rnd(-1.6, 1.6) * (big ? 1.6 : 1), vy: rnd(-1.4, -0.2), r: rnd(5, 10) * (big ? 1.5 : 1), life: rnd(26, 40) | 0 });
}
// 飘字（2.0.1：每句都有颜色归属）。own = 谁的：一个人 = 他的身体色；[A, B] = 两人各半（「拼」「拆」这种平手的，左半边是站在左边那个人的颜色）。
// text 也可以分几段 [[字, 人], …]：「挡 -3」里「挡」是挡的人的颜色，「-3」是打的人的颜色（伤害数字一律是打的人的颜色）
function tag(x, y, text, own, size = 20) {
  const parts = Array.isArray(text) ? text.map(([t, o]) => [t, colOf(o)]) : null, str = parts ? parts.map(p => p[0]).join('') : text;
  const cols = Array.isArray(own) ? (own[0].x <= own[1].x ? own : [own[1], own[0]]).map(colOf) : [colOf(own)];
  for (let k = 0; k < 6; k++) {
    const hit = FX.some(e => e.type === 'tag' && e.max - e.life < 22 && Math.abs(e.x - x) < 70 && Math.abs(e.y - y) < size);
    if (!hit) break;
    y -= size + 2;
  }
  return addFx({ type: 'tag', x, y, text: str, parts, cols, size, life: 46 });
}
const arcMid = (x, y, r, mid, span, w, color, life) => arcFx(x, y, r, mid - span / 2, mid + span / 2, w, color, life);
// 印章（招式名）：底板是出招那个人的身体色，字是白的（2.0.1；以前一律朱红）
function stamp(x, y, text, size = 30, own) {
  const specks = [];
  for (let i = 0; i < 9; i++) specks.push([rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(0.6, 1.8)]);
  addFx({ type: 'stamp', x, y, text, size, rot: rnd(-0.14, 0.14), life: 70, specks, col: own ? colOf(own) : C.cin });
  Sound.stamp();
}
// 画面正中的大字：回合、时间到这种没有归属（墨色）；「某某 胜」用赢的人的颜色
const announce = (text, sub, life = 70, size = 120, own) => addFx({ type: 'announce', text, sub, life, size, col: colOf(own) });

function updateFx() {
  for (let i = FX.length - 1; i >= 0; i--) {
    const e = FX[i];
    e.life--;
    e.px = e.x; e.py = e.y;                              // 2.0.1 上一帧在哪（画的时候在两帧之间插值，高刷新率屏幕上不一顿一顿）
    if (e.type === 'drop') {
      e.vy += 0.36; e.x += e.vx; e.y += e.vy; e.vx *= 0.985;
      if (e.y >= FLOOR + 2) { splats.push({ x: e.x, rx: e.r * rnd(1.6, 2.6), life: 200, max: 200, color: e.color }); e.life = 0; }
    } else if (e.type === 'spark') {
      e.x += e.vx; e.y += e.vy; e.vx *= 0.86; e.vy = e.vy * 0.86 + e.g;
      if (e.y > FLOOR) { e.y = FLOOR; e.vy *= -0.3; }
    } else if (e.type === 'dust') {
      e.x += e.vx; e.y += e.vy; e.vx *= 0.94; e.vy *= 0.94; e.r *= 1.025;
    } else if (e.type === 'tag') {
      e.y -= 0.7;
    }
    if (e.life <= 0) FX.splice(i, 1);
  }
  for (let i = splats.length - 1; i >= 0; i--) if (--splats[i].life <= 0) splats.splice(i, 1);
  updateQi();
  if (splats.length > 160) splats.splice(0, splats.length - 160);
}

/* ============================================================
   声音（WebAudio 合成，首次点击后开启）
   ============================================================ */
// 音量刻度：现在的 v 有 2.0.2 的 v × VOL_SHIFT 那么响。2.1 是 1.6（50 = 2.0.2 的 80）；
// 2.3（Jack：默认要有 2.2 的「70」那么响，前后都跟着挪）：1.6 × 70 / 50 = 2.24 —— 现在的 50 = 2.2 的 70，别的档也都 × 1.4
const VOL_SHIFT = 2.24, VOL_SHIFT_21 = 1.6;      // VOL_SHIFT_21：2.1 / 2.2 存的音量（modou.vol2）用的刻度，换算用
// 2.1 声音用自己的随机数（不用 Math.random）：声音出不出得来看浏览器（有没有点过页面、声卡醒没醒），
// 以前每响一声就从 Math.random 里拿几个数 —— 电脑 AI 也用 Math.random，测试里固定了种子还会因为「这次有没有声音」打得不一样
let sndSeed = 0x2545f491;
const srnd = () => (sndSeed = (Math.imul(sndSeed, 1664525) + 1013904223) >>> 0) / 4294967296;
const Sound = {
  ctx: null, master: null, out: null, noise: null, on: true, vol: 50,
  // 音量（1.9.3）：设置里 0~100，默认 50；往上最多响到默认的 2.5 倍，0 = 没声。
  // 调的是压缩器后面那一级（out），压缩器照样管着叠在一起的打击声不爆音。
  // 2.1（Jack：默认就要以前「80」那么响，别的档跟着挪）：整条曲线往上挪 —— 现在的 v 就是以前的 v × 1.6（50 = 以前的 80）；
  // 最后再加一级限幅（limiter），开得很大声也不破音
  // 2.3 再挪一次（VOL_SHIFT 2.24）：现在的 50 = 2.2 的 70
  gainFor(v) { return v <= 0 ? 0 : 1.3 * Math.pow(v * VOL_SHIFT / 50, 1.32); },
  // 存着的音量换成现在的刻度（听着和以前一样响）。get(键) 读存档（ui.js 传 localStorage，测试传假的）。
  // 2.1 / 2.2 每次打开游戏都会把音量存一遍（modou.vol2），存着 50 的多半是没动过 —— 用新的默认 50（= 2.2 的 70）；改过的才换算
  volFromStore(get) {
    const num = k => { const v = parseInt(get(k), 10); return v >= 0 && v <= 100 ? v : null; };
    const v3 = num('modou.vol3'), v2 = num('modou.vol2'), v1 = num('modou.vol');
    if (v3 !== null) return v3;
    if (v2 !== null) return v2 === 50 ? 50 : clamp(Math.round(v2 * VOL_SHIFT_21 / VOL_SHIFT), 0, 100);
    if (v1 !== null) return v1 === 50 ? 50 : clamp(Math.round(v1 / VOL_SHIFT), 0, 100);
    return 50;
  },
  setVol(v) {
    this.vol = clamp(Math.round(v), 0, 100);
    if (this.out) this.out.gain.setTargetAtTime(this.gainFor(this.vol), this.ctx.currentTime, 0.03);
  },
  // 设置里调音量时响一声给你听（菜单背景里平时不出声，这一下例外）
  preview() {
    this.init();
    if (!this.ctx || !this.on || this.vol <= 0) return;
    const play = () => { this.forced = true; try { this.hit(0.7); } finally { this.forced = false; } };
    if (this.ctx.state === 'running') play(); else this.ctx.resume().then(play).catch(() => {});
  },
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // 1.9.0：总线上加一个压缩器 —— 打击声叠在一起不爆音，整体也能更响、更「实」
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
      this.out = this.ctx.createGain(); this.out.gain.value = this.gainFor(this.vol);
      const lim = this.ctx.createDynamicsCompressor();           // 2.1 限幅：音量开大了也不削波破音
      lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
      comp.connect(this.out); this.out.connect(lim); lim.connect(this.ctx.destination);
      this.master = this.ctx.createGain(); this.master.gain.value = 0.62; this.master.connect(comp);
      const len = this.ctx.sampleRate * 1.0, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = srnd() * 2 - 1;
      this.noise = buf;
      // 失真曲线：重击的「咔」带一点破音，听着更脆、更狠
      const n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 3.2); }
      this.curve = curve;
      // 2.4 古筝的几个音先算好（第一次开场时不卡那一下）
      for (const f of ZHENG_UP.concat(ZHENG_CHORD, [659.26])) this.zhengBuf(f);
    } catch (e) { this.ctx = null; }
  },
  // 浏览器会把声音引擎挂起（页面切到后台、切去微信、联机时这一局是对方按「开始」开的、没点过页面……）。
  // 1.7.0：任何按键 / 点鼠标 / 回到页面都叫醒它；出声时发现没醒，也每半秒试着叫一次
  wake() {
    if (!this.ctx) { this.init(); return; }
    const s = this.ctx.state;
    if (s !== 'running' && s !== 'closed') this.ctx.resume().catch(() => {});
  },
  asleep() { return this.on && !!this.ctx && this.ctx.state !== 'running'; },
  ok() {
    if (!this.on || !this.ctx || this.vol <= 0 || (game.mode === 'attract' && !this.forced) || game.quiet) return false;
    if (this.ctx.state === 'running') return true;
    const now = performance.now();
    if (now - (this.lastWake || 0) > 500) { this.lastWake = now; this.wake(); }
    return false;
  },
  // dist：给这一下加失真（重击的破音）；delay：晚多少秒响（叠层用）
  nz(dur, freq, q, gain, type, f2, dist, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = this.noise;
    if (dur > 0.5) s.loop = true;                                      // 2.3 锣、钹的余音比噪声那一秒长：循环着放
    s.playbackRate.value = 0.9 + srnd() * 0.2;                      // 每次听着都差一点，不像复读
    const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq, t);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let tail = f;
    if (dist) { const w = c.createWaveShaper(); w.curve = this.curve; f.connect(w); tail = w; }
    s.connect(f); tail.connect(g); g.connect(this.master); s.start(t, srnd() * 0.4); s.stop(t + dur + 0.03);
  },
  tone(freq, dur, gain, type, f2, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
  },
  // 打中（1.9.0 重做）：一下脆响（高频噪声，十几毫秒）+ 一声闷响（往下滑的低音）+ 中频的「啪」；重的再加超低音和破音。
  // p = 0.3（短拳）~ 1.2（泼墨）
  hit(p) {
    if (!this.ok()) return;
    const k = 0.94 + srnd() * 0.12;
    this.nz(0.018, 3200 * k, 0.7, 0.42 + 0.22 * p, 'highpass');                             // 脆
    this.tone((105 + 45 * p) * k, 0.1 + 0.13 * p, 0.5 + 0.32 * p, 'sine', 38);               // 闷
    this.nz(0.05 + 0.06 * p, (1500 - 300 * p) * k, 1.1, 0.3 + 0.3 * p, 'bandpass', 380);     // 啪
    if (p >= 0.7) {
      this.tone(62, 0.22 + 0.12 * p, 0.38 + 0.2 * p, 'sine', 30);                           // 重击的超低音
      this.nz(0.07 + 0.04 * p, 1100, 0.8, 0.22 + 0.16 * p, 'lowpass', 300, true);            // 破音的「咔」
    }
  },
  block() { if (!this.ok()) return; this.tone(1400, 0.05, 0.08, 'square', 760); this.nz(0.04, 3600, 1, 0.2, 'highpass'); this.tone(210, 0.09, 0.22, 'triangle', 110); },
  // 空挥（1.9.0 响一些）：短拳是一声短促的「嗖」，重招 / 腿是更长更低的「呼」
  whoosh(p) {
    if (!this.ok()) return;
    const k = 0.92 + srnd() * 0.16;
    this.nz(0.09 + 0.09 * p, 380 * k, 0.9, 0.12 + 0.13 * p, 'bandpass', (1900 - 500 * p) * k);
    if (p >= 0.8) this.nz(0.16, 160, 0.7, 0.12, 'lowpass', 520);
  },
  crash() { if (!this.ok()) return; this.tone(880, 0.28, 0.08, 'triangle', 180); this.tone(70, 0.3, 0.42, 'sine', 30, 0.08); this.nz(0.14, 700, 0.8, 0.3, 'lowpass', 200, true, 0.08); },
  tumble() { if (!this.ok()) return; this.nz(0.22, 260, 0.8, 0.16, 'bandpass', 1300); this.tone(300, 0.12, 0.1, 'triangle', 620); },
  stamp() { if (!this.ok()) return; this.tone(520, 0.09, 0.16, 'triangle', 360); this.tone(170, 0.16, 0.14, 'sine', 110); },
  land() { if (!this.ok()) return; this.tone(90, 0.08, 0.16, 'sine', 50); },
  clash() { if (!this.ok()) return; this.tone(980, 0.16, 0.12, 'square', 520); this.tone(1460, 0.12, 0.08, 'triangle', 900); this.nz(0.12, 2400, 1.2, 0.3, 'bandpass', 900); this.tone(120, 0.2, 0.3, 'sine', 50); },
  parry() { if (!this.ok()) return; this.tone(1760, 0.25, 0.1, 'sine', 1700); this.tone(2640, 0.18, 0.06, 'sine', 2600); this.nz(0.05, 5000, 1, 0.12, 'highpass'); },
  burst() { if (!this.ok()) return; this.tone(70, 0.45, 0.4, 'sine', 30); this.nz(0.4, 300, 0.6, 0.35, 'lowpass', 1200); },
  // 胜负已分（2.4 不敲锣了）：一声战鼓，紧跟着「锵」（大鼓 + 战鼓 + 镲）和古筝一个和弦
  finale() { if (!this.ok()) return; this.taiko(1, 0); this.qiang(1.15, 0.16); this.zhengChord(1, 0.16); },
  // 一个音：f 在 glide 秒内滑到 f2（之后不动），dur 秒衰减完
  glide(f, f2, glide, dur, gain, delay, type) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (f2 && f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + glide);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  /* ---------- 2.4 开场的鼓（Jack：2.3 的锣鼓不好听、太诡异 —— 大锣敲下去音往下滑、小锣往上挑，听着瘆人）----------
     换成战鼓 + 镲 + 古筝，都是「正」的音，不往上往下滑：
     · 战鼓「咚」：鼓皮一下（音高几十毫秒里就落定 —— 真鼓就这样，不是「呜」地滑）+ 鼓槌「噗」
     · 大鼓：更低更长的「咚」          · 鼓边「嗒」：敲在鼓框上，又干又脆
     · 镲「嚓」：一片亮的「沙」慢慢散开（不带方波那种怪金属音）
     · 古筝「铮」：五声音阶（D 宫：D E F♯ A B）一串往上拨；「和」：D、A、D、A 几根弦一齐拨
     · 「锵」= 大鼓 + 战鼓 + 镲一齐响
     全是现合成的（走 master，跟着音量、压缩器、限幅）。game.js 开场按 INTRO_BEATS 一帧一帧敲：Sound.beat(字, 力度) 走 fxDo（联机回滚不重复响） */
  beat(k, p) { if (!this.ok()) return; const f = this[BEAT_KIT[k]]; if (f) f.call(this, p || 1, 0); },
  taiko(p, d) {
    const k = 0.97 + srnd() * 0.06;
    this.glide(124 * k, 58 * k, 0.06, 0.46 + 0.1 * Math.min(1.4, p), 0.56 * p, d);   // 鼓皮
    this.glide(270 * k, 160 * k, 0.04, 0.15, 0.1 * p, d, 'triangle');               // 鼓皮上面一点的泛音
    this.nz(0.06, 520, 0.7, 0.24 * p, 'lowpass', 180, false, d);                      // 鼓槌「噗」
    this.nz(0.012, 2400, 1, 0.05 * p, 'bandpass', null, false, d);                    // 一点点「啪」
  },
  taikoLo(p, d) {
    this.glide(86, 46, 0.08, 0.8, 0.5 * p, d);
    this.nz(0.1, 360, 0.6, 0.22 * p, 'lowpass', 120, false, d);
  },
  rim(p, d) { this.nz(0.03, 2300, 2.2, 0.2 * p, 'bandpass', null, false, d); this.tone(610, 0.045, 0.07 * p, 'triangle', null, d); },
  cha(p, d) {
    this.nz(0.85 + 0.3 * Math.min(1.4, p), 6200, 0.5, 0.085 * p, 'highpass', null, false, d);   // 亮的「沙」，慢慢散开
    this.nz(0.2, 3600, 0.8, 0.1 * p, 'bandpass', 5200, false, d);                                // 打上去那一下「嚓」
  },
  qiang(p, d) { this.taikoLo(p, d); this.taiko(p * 0.85, (d || 0) + 0.004); this.cha(p * 0.8, (d || 0) + 0.008); },
  // 古筝拨弦：Karplus-Strong（一小段噪声在「弦」里一圈圈走、一圈圈磨平 = 弦振动的声音）。每个音第一次用时现算、存起来
  zhengBuf(freq) {
    const c = this.ctx, cache = this.zbuf || (this.zbuf = {}), key = Math.round(freq * 10);
    if (cache[key]) return cache[key];
    const sr = c.sampleRate, n = Math.floor(sr * 1.8), N = Math.max(2, Math.round(sr / freq));
    const buf = c.createBuffer(1, n, sr), out = buf.getChannelData(0), ring = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) { lp = lp * 0.45 + (srnd() * 2 - 1) * 0.55; ring[i] = lp; }   // 拨的那一下：磨圆一点的噪声（不扎耳朵）
    const fb = Math.pow(0.001, 1 / (freq * 1.7));                                             // 每走一圈再衰减一点：1.7 秒落到 -60dB
    let j = 0, peak = 1e-6;
    for (let i = 0; i < n; i++) { const a = ring[j], b2 = ring[j + 1 < N ? j + 1 : 0]; out[i] = a; ring[j] = (a + b2) * 0.5 * fb; j = j + 1 < N ? j + 1 : 0; if (a > peak) peak = a; else if (-a > peak) peak = -a; }
    for (let i = 0; i < n; i++) out[i] /= peak;
    return (cache[key] = buf);
  },
  zheng(freq, gain, delay, dur) {
    const c = this.ctx, t = c.currentTime + (delay || 0), L = dur || 1.2;
    const s = c.createBufferSource(); s.buffer = this.zhengBuf(freq);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.min(9000, freq * 7); f.Q.value = 0.5;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.setTargetAtTime(0.0001, t + L * 0.55, L * 0.22);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + L + 0.5);
  },
  zhengUp(p, d) { ZHENG_UP.forEach((f, i) => this.zheng(f, 0.12 * p * (0.8 + i * 0.05), (d || 0) + i * 0.034, 1.1)); },
  zhengChord(p, d) { ZHENG_CHORD.forEach((f, i) => this.zheng(f, 0.15 * p * [1, 0.8, 0.7, 0.5][i], (d || 0) + i * 0.016, 1.7)); },
  /* ---------- 菜单的声音（2.3；2.4 按下去换成古筝；2.5.1 Jack：光标放上去全都不出声，点下去是木鱼声）----------
     移上去、Tab 换焦点：不出声。按下去：一声木鱼「笃」—— 2.4 移上去那一声（空心的木头「笃」，音几十毫秒里落定）再厚一点：
     多一个低一点的空腔音、一下木槌的「嗒」。菜单背景里也响（不走 ok() 的「菜单里不出声」）；不走 fxDo（不是对局里的事）。
     一打开游戏就把声音引擎建好（软件版一进来就有声；网页版浏览器要先点一下页面），按下去那一下要是声音引擎还睡着，先叫醒再响 */
  uiReady() { return this.on && this.vol > 0 && !!this.ctx && this.ctx.state === 'running'; },
  muyu(p, d) {
    p = p || 1;
    this.glide(1520, 1380, 0.035, 0.09, 0.075 * p, d);            // 木鱼的空腔：「笃」
    this.glide(760, 700, 0.03, 0.07, 0.03 * p, d, 'triangle');      // 低一点的空腔音（厚一点）
    this.nz(0.014, 2400, 3, 0.045 * p, 'bandpass', null, false, d);  // 木槌敲上去那一下
  },
  uiPress() {
    if (!this.on || this.vol <= 0) return;
    this.init();
    if (!this.ctx) return;
    const play = () => {
      if (!this.uiReady()) return;
      const now = performance.now(); if (now - (this.uiT || 0) < 40) return; this.uiT = now;
      this.muyu(1, 0);
    };
    if (this.ctx.state === 'running') play(); else this.ctx.resume().then(play).catch(() => {});
  },
};
// 开场鼓经的字 → 家伙
const BEAT_KIT = { 咚: 'taiko', 嗵: 'taikoLo', 嗒: 'rim', 嚓: 'cha', 锵: 'qiang', 铮: 'zhengUp', 和: 'zhengChord' };
const ZHENG_UP = [587.33, 659.26, 739.99, 880, 987.77, 1174.66];      // D5 E5 F♯5 A5 B5 D6
const ZHENG_CHORD = [293.66, 440, 587.33, 880];                       // D4 A4 D5 A5
/* 开场的鼓（帧 → [[字, 力度]…]）：两声战鼓，回合名在第 10 帧随「锵」砸下来（game.js）；接着战鼓一下比一下密、越敲越响；
   快到「战」古筝一串往上拨，第 68 帧「战」：「锵」+ 古筝一个和弦。决胜局在前面多一声「锵」、鼓点更密、多一声镲 */
const INTRO_BEATS = { 2: [['咚', 0.8]], 6: [['咚', 0.62]], 10: [['锵', 0.9]] };
[[24, .4], [31, .44], [37, .48], [42, .52], [46, .56], [50, .6], [53, .64], [56, .68], [58, .72], [60, .76], [62, .8], [64, .84], [66, .88]]
  .forEach(([f, p]) => (INTRO_BEATS[f] = INTRO_BEATS[f] || []).push(['咚', p]));
INTRO_BEATS[46].push(['嗒', 0.6]); INTRO_BEATS[56].push(['嗒', 0.7]);
INTRO_BEATS[60].push(['铮', 0.9]);
INTRO_BEATS[68] = [['锵', 1.2], ['和', 0.9]];
const FINAL_BEATS = { 18: [['锵', 0.8]], 27: [['咚', 0.42]], 34: [['咚', 0.46]], 40: [['咚', 0.5]], 44: [['嚓', 0.5]] };
function introBeats(t, final) {
  for (const [k, p] of INTRO_BEATS[t] || []) Sound.beat(k, p);
  if (final) for (const [k, p] of FINAL_BEATS[t] || []) Sound.beat(k, p);
}
// 声音也走 fxDo：回滚重算时先攒着，算完只补放新时间线里多出来的（1.9.0）
for (const k of ['hit', 'block', 'whoosh', 'crash', 'tumble', 'stamp', 'land', 'clash', 'parry', 'burst', 'finale', 'beat']) {
  const play = Sound[k];
  Sound[k] = function (...a) { fxDo('S' + k, () => play.apply(Sound, a)); };
}


const HIT_PUNCH = { heavy: 0.03, beng: 0.05, upper: 0.04, whirl: 0.04, hammer: 0.04, shoulder: 0.05, backKick: 0.04, hammerFist: 0.04, twinKick: 0.035, dive: 0.04, stomp: 0.04, splash: 0.07, rushEnd: 0.03, slipElbow: 0.04 };
// 打中的特效（1.9.0 重做）：每一下 = 冲击星（几根尖刺 + 中间纸白的爆闪）+ 迸出去的火花 + 几滴拉长的墨，再按招式加笔刷扫痕、集中线、地裂。
// 挨打的人身上白闪一下、抖一下（只是画面）。
// 2.0.1 颜色归属：全用出招那个人的颜色（pal(A)）—— 尖刺、墨点、地裂用身体色 ink，火花、集中线用提亮的 fx，
// 扫痕、拖尾线这些贴着出招人身子的用淡的 qi（不然和他自己的手脚糊在一起）
function hitFx(kind, c, A, B) {
  const dir = A.facing, x = c.x, y = c.y, P = pal(A), ink = P.ink, fx = P.fx, qi = P.qi, front = dir > 0 ? 0 : Math.PI;
  const big = HIT_PUNCH[kind];                        // 重击：镜头往里一推
  fxDo('hf' + B.idx, () => { B.hitFlash = 3; B.hitShake = 7; if (big) game.punch = Math.max(game.punch || 0, big); });
  switch (kind) {
    case 'jab':
      impact(x, y, dir, 26, ink, 5, 0.7, 7); sparks(x, y, dir, 5, 6, fx, 0.7); inkDrops(2, x, y, dir, 4, ink); break;
    case 'jab2':
      impact(x, y, dir, 32, ink, 6, 0.75, 8); sparks(x, y, dir, 7, 7, fx, 0.75); inkDrops(3, x, y, dir, 5, ink); break;
    case 'hook':
      swipe(x - dir * 22, y + 6, 34, front - dir * 0.6, 1.9, 7, qi, 14);
      impact(x, y, dir, 30, ink, 6, 0.9); sparks(x, y, dir, 7, 6.5, fx, 0.9, 0.4); break;
    case 'rush':
      impact(x + rnd(-6, 6), y + rnd(-8, 8), dir, 26, ink, 5, 0.7, 6); sparks(x, y, dir, 4, 6, fx, 0.6);
      for (let i = 0; i < 3; i++) { const yy = A.J.sh[1] + rnd(-10, 14); streak(A.x - dir * rnd(40, 70), yy, A.x - dir * 6, yy, 2, qi, 10); }
      break;
    case 'heavy':
      impact(x, y, dir, 48, ink, 8, 0.9, 10); sparks(x, y, dir, 12, 9, fx, 0.8); inkDrops(4, x, y, dir, 7, ink); focusLines(x, y, 10, 70, 120, fx, 7); break;
    case 'beng':
      impact(x, y, dir, 62, ink, 9, 0.6, 11); streak(x - dir * 70, y, x + dir * 150, y, 9, qi, 16);
      sparks(x, y, dir, 16, 11, fx, 0.5, 0.1, 18); inkDrops(5, x, y, dir, 8, ink, 0.5, 0.1); focusLines(x, y, 14, 80, 140, fx, 8); flashTo(0.22); break;
    case 'upper':
      swipe(x - dir * 26, y - 6, 52, front, 2.8, 9, qi, 16); impact(x, y, dir, 44, ink, 7, 0.8);
      sparks(x, y, dir, 12, 9, fx, 0.5, 1.1); inkDrops(4, x, y, dir, 7, ink, 0.5, 1.1); flashTo(0.18); break;
    case 'kick':
      impact(x, y, dir, 40, ink, 7, 0.9); sparks(x, y, dir, 9, 8, fx, 0.8); inkDrops(3, x, y, dir, 6.5, ink);
      swipe(A.x + dir * 30, y + 26, 60, front - dir * 0.35, 1.1, 5, qi, 12); break;
    case 'whip':
      swipe(A.x + dir * 34, y + 30, 74, front - dir * 0.6, 1.9, 9, qi, 16);
      impact(x, y, dir, 40, ink, 7, 0.9); sparks(x, y, dir, 10, 8, fx, 0.8); break;
    case 'whirl':
      addFx({ type: 'swirl', x: A.x, y: A.J.hip[1] - 8, r: 88, color: qi, life: 22, dir });
      impact(x, y, dir, 50, ink, 8, 0.9); sparks(x, y, dir, 14, 10, fx, 1.0); inkDrops(4, x, y, dir, 8, ink); flashTo(0.18); break;
    case 'hammer':          // 泰山压顶
      impact(x, y, dir, 46, ink, 8, 1.2); cracks(B.x, 4, 70, ink); sparks(x, y, dir, 12, 8, fx, 1.4, -0.2); dust(B.x, FLOOR, 6, true); flashTo(0.16); break;
    case 'airKick':
      for (let i = 0; i < 4; i++) { const o = rnd(-18, 18); streak(A.x - dir * rnd(60, 110), A.J.hip[1] + o - 26, A.x - dir * 8, A.J.hip[1] + o, 2.4, qi, 12); }
      impact(x, y, dir, 40, ink, 7, 0.9); sparks(x, y, dir, 11, 8, fx, 0.9, -0.1); break;
    case 'rushEnd':
      impact(x, y, dir, 48, ink, 8, 0.6); streak(x - dir * 40, y, x + dir * 110, y, 6, qi, 12); sparks(x, y, dir, 12, 10, fx, 0.5, 0.15); break;
    case 'low':
      impact(x, y, dir, 24, ink, 5, 0.6); sparks(x, y, dir, 5, 5, fx, 0.6, -0.1); dust(B.x, FLOOR, 2); break;
    case 'sweep':
      swipe(A.x, FLOOR - 4, 100, front - dir * 0.45, 1.0, 8, qi, 16); dust(B.x, FLOOR, 7, true);
      impact(x, y, dir, 32, ink, 6, 0.8); sparks(x, FLOOR - 10, dir, 8, 7, fx, 0.6, 0.6); break;
    case 'palm':
      impact(x, y, dir, 44, ink, 8, 1.4); for (let i = 0; i < 4; i++) streak(x + rnd(-14, 14), y + 30, x + rnd(-24, 24), y - rnd(70, 110), 3, qi, 14);
      sparks(x, y, dir, 12, 9, fx, 0.4, 1.3); flashTo(0.14); break;
    case 'shoulder':
      impact(x, y, dir, 64, ink, 9, 0.8, 11); focusLines(x, y, 14, 80, 150, fx, 8);
      for (let i = 0; i < 4; i++) { const yy = y + rnd(-30, 30); streak(A.x - dir * rnd(60, 120), yy, A.x, yy, 3, qi, 12); }
      sparks(x, y, dir, 16, 10, fx, 0.7, 0.3); dust(A.x, FLOOR, 6, true); flashTo(0.2); break;
    case 'backKick':
      impact(x, y, dir, 54, ink, 8, 0.6, 10); sparks(x, y, dir, 14, 10, fx, 0.5, 0.2); focusLines(x, y, 10, 70, 120, fx, 7); flashTo(0.12); break;
    case 'elbow':
      impact(x, y, dir, 34, ink, 6, 0.8); sparks(x, y, dir, 9, 7, fx, 0.6, 0.2); break;
    case 'slipElbow':       // 2.0.2 回身肘：拧身一肘顶在背上 —— 身后一道拧过来的扫痕（淡）、冲击星、往前迸的火花、集中线
      swipe(A.x, A.J.sh[1] + 4, 40, front + dir * 0.3, 2.4, 7, qi, 14);
      impact(x, y, dir, 46, ink, 8, 0.7, 10); sparks(x, y, dir, 12, 9, fx, 0.6, 0.2); focusLines(x, y, 10, 70, 120, fx, 7); flashTo(0.12); break;
    case 'chop':
      swipe(x - dir * 18, y - 30, 56, front + dir * 0.9, 1.6, 9, qi, 16);
      for (let i = 0; i < 3; i++) streak(x + rnd(-10, 10), y - 70, x + rnd(-6, 6), y + 10, 3, qi, 12);
      impact(x, y, dir, 40, ink, 7, 1.0); sparks(x, y, dir, 10, 8, fx, 0.8, -0.6); break;
    case 'hammerFist':
      cracks(B.x, 4, 64, ink); swipe(x - dir * 10, y - 26, 50, front + dir * 0.8, 1.4, 8, qi, 16);
      impact(x, y, dir, 44, ink, 8, 1.2); sparks(x, y, dir, 12, 8, fx, 1.2, -0.3); dust(B.x, FLOOR, 7, true); flashTo(0.16); break;
    case 'twinKick':
      swipe(A.x + dir * 20, y + 10, 70, front - dir * 1.1, 1.8, 9, qi, 16); swipe(A.x + dir * 20, y + 26, 52, front - dir * 0.9, 1.4, 4, fx, 12);
      impact(x, y, dir, 42, ink, 7, 0.9); sparks(x, y, dir, 12, 9, fx, 0.6, 1.0); flashTo(0.12); break;
    case 'airSwing':
      swipe(A.J.sh[0], A.J.sh[1], 54, front + dir * 0.5, 2.2, 7, qi, 14);
      impact(x, y, dir, 30, ink, 6, 0.9); sparks(x, y, dir, 8, 7, fx, 0.7, -0.2); break;
    case 'dive':
      cracks(B.x, 3, 60, ink); impact(x, y, dir, 46, ink, 8, 1.3);
      for (let i = 0; i < 4; i++) streak(A.x + rnd(-16, 16), A.J.hip[1] - rnd(60, 110), A.x + rnd(-8, 8), A.J.hip[1] - 10, 2.6, qi, 12);
      sparks(x, y, dir, 12, 8, fx, 1.4, -0.4); dust(B.x, FLOOR, 8, true); flashTo(0.14); break;
    case 'stomp':           // 踩腿：一脚踩在地上，地裂开、尘土往两边炸
      cracks(B.x, 5, 80, ink); impact(x, FLOOR - 12, dir, 40, ink, 7, 1.4);
      for (let i = 0; i < 3; i++) streak(A.J.ff[0] + rnd(-8, 8), A.J.ff[1] - rnd(50, 80), A.J.ff[0] + rnd(-4, 4), A.J.ff[1] - 6, 3, qi, 12);
      sparks(x, FLOOR - 8, dir, 12, 8, fx, 1.3, 0.3); dust(B.x, FLOOR, 9, true); flashTo(0.12); break;
    case 'splash':
      impact(x, y, dir, 90, ink, 11, 1.0, 14); focusLines(x, y, 22, 110, 220, fx, 10);
      streak(x - dir * 120, y, x + dir * 220, y, 14, qi, 20);
      sparks(x, y, dir, 26, 13, fx, 1.0, 0.4, 22); inkDrops(12, x, y, dir, 11, ink, 1.0, 0.4); dust(B.x, FLOOR, 10, true); flashTo(0.4); break;
    default:
      impact(x, y, dir, 28, ink, 6, 0.8); sparks(x, y, dir, 6, 6, fx, 0.8);
  }
}
// 拼招 / 压招（2.0.1）：两边的冲击星对撞、各自颜色的火花往对面迸。拼 = 平手，两边一样多；
// 压 = 压人的那边多、被压的那边少（wA / wB 是两边特效的分量）
function clashFx(x, y, A, B, wA = 1, wB = 1) {
  for (const [F, O, w] of [[A, B, wA], [B, A, wB]]) {
    if (w <= 0) continue;
    const P = pal(F), d = O.x >= F.x ? 1 : -1;          // 往对面迸
    impact(x, y, d, 58 * (0.55 + 0.45 * w), P.ink, Math.max(3, Math.round(6 * w)), 1.2, 10);
    sparks(x, y, d, Math.max(2, Math.round(10 * w)), 9, P.fx, 1.2, 0.5);
    focusLines(x, y, Math.max(2, Math.round(6 * w)), 70, 130, P.fx, 8);
  }
  flashTo(0.3);
}
// 卸力：一道弧线把劲卸开 + 火花往回迸（卸力的人的颜色）
function parryFx(B, c) {
  const base = B.facing > 0 ? 0 : Math.PI, P = pal(B);
  swipe(B.x + B.facing * 22, c.y, 38, base, 3.0, 9, P.fx, 18);
  impact(c.x, c.y, -B.facing, 40, P.ink, 8, 1.4, 10);
  sparks(c.x, c.y, -B.facing, 12, 9, P.fx, 1.2, 0.3);
  flashTo(0.4);
}
function shoveFx(A, B) {
  const y = A.J.sh[1], dir = A.facing, P = pal(A);
  impact(B.x - dir * 14, y, dir, 34, P.ink, 6, 0.8);
  for (let i = 0; i < 3; i++) { const yy = y + rnd(-14, 14); streak(A.x + dir * 20, yy, B.x + dir * 30, yy, 3, P.qi, 10); }
}
// 爆气：从身上炸开 —— 一圈断开的环 + 四面迸的火花 + 集中线
function burstFx(F) {
  const y = F.J ? F.J.hip[1] - 20 : FLOOR - 80, P = pal(F);
  ring(F.x, y, 10, 190, 9, P.qi, 24); focusLines(F.x, y, 18, 120, 220, P.qi, 10);   // 从自己身上炸开的都用气的颜色（淡），不和身子糊在一起
  for (const d of [1, -1]) sparks(F.x, y, d, 12, 11, P.qi, 1.6, 0.3, 20);
  fxDo('qr' + F.idx, () => qiRing(F, 18, 1.35));                                    // 2.1 一圈火从身上炸开
  dust(F.x, FLOOR, 10, true); flashTo(0.35);
}
// 2.1 爆气炸中对手：对手身上一颗大冲击星 + 往外迸的火花、墨点（爆气的人的颜色），画面亮一下、镜头推一下
function burstHitFx(A, B) {
  const P = pal(A), dir = B.x >= A.x ? 1 : -1, y = B.J ? B.J.sh[1] + 10 : FLOOR - 80, x = B.x - dir * 6;
  fxDo('hf' + B.idx, () => { B.hitFlash = 3; B.hitShake = 8; game.punch = Math.max(game.punch || 0, 0.05); });
  impact(x, y, dir, 64, P.ink, 9, 1.1, 11); sparks(x, y, dir, 16, 11, P.fx, 1.0, 0.5, 20);
  inkDrops(6, x, y, dir, 9, P.ink, 1.0, 0.5); focusLines(x, y, 12, 80, 150, P.fx, 8);
  dust(B.x, FLOOR, 8, true); flashTo(0.3);
}
// 泼墨起手：四周的线往身上收
function superFx(F) {
  const y = F.J ? F.J.sh[1] : FLOOR - 90;
  focusLines(F.x, y, 24, 60, 200, pal(F).qi, 16);
  fxDo('qr' + F.idx, () => qiRing(F, 14, 1.1));                                     // 2.1 起手一圈火
  tag(F.x - F.facing * 20, y - 70, '墨', F, 48);
  Sound.stamp();
  flashTo(0.25);
}
// 倒栽葱：空中被打下来 —— 往下拖的线、火花往下掉（打的人 A 的颜色；字由 combat.js 的「倒栽葱 ×1.3」出）
function crashFx(B, dir, A) {
  const J = B.J, P = pal(A || B);
  for (let i = 0; i < 5; i++) streak(B.x + rnd(-16, 16), J.hip[1] - rnd(50, 90), B.x + dir * rnd(4, 16), J.hip[1] + 26, 3, P.qi, 16);
  sparks(B.x, J.hip[1] - 20, dir, 10, 7, P.fx, 1.2, -0.9, 20);
  Sound.crash();
}
// 翻滚：两条腿撞在一起 —— 地上那个（赢的）冲击星大、火花多，空中那个小、少；空中那个人身后一道翻滚的弧
function tumbleFx(A, B, c) {
  const a = pal(A), b = pal(B);
  impact(c.x, c.y, -A.facing, 46, b.ink, 7, 1.0, 9); impact(c.x, c.y, A.facing, 30, a.ink, 5, 0.8, 8);
  sparks(c.x, c.y, -A.facing, 10, 9, b.fx, 1.0, 0.6); sparks(c.x, c.y, A.facing, 6, 6, a.fx, 0.8, 0.4);
  swipe(A.x, A.J.hip[1] - 10, 46, A.facing > 0 ? Math.PI : 0, 3.6, 6, a.qi, 18);
  Sound.tumble();
}

// 冲刺：身后拉出几道淡的线（自己的气的颜色）
function dashLines(F) {
  const y0 = F.J ? F.J.hip[1] : FLOOR - 60, P = pal(F);
  for (let i = 0; i < 2; i++) {
    const y = y0 + rnd(-46, 12);
    streak(F.x - F.facing * rnd(20, 40), y, F.x - F.facing * rnd(90, 150), y, rnd(1.6, 3), P.qi, 10);
  }
}
// 闪身（2.0）：起步一道贴地的笔刷弧 + 扬尘；钻的途中身后拉出细线
function slipFx(F) {
  const y = F.J ? F.J.hip[1] : FLOOR - 60;
  swipe(F.x + F.facing * 10, y - 6, 40, F.facing > 0 ? 0 : Math.PI, 1.6, 5, pal(F).qi, 12);
  dust(F.x - F.facing * 12, FLOOR, 4);
}
function slipLines(F) {
  const y0 = F.J ? F.J.hip[1] : FLOOR - 60, P = pal(F);
  for (let i = 0; i < 2; i++) {
    const y = y0 + rnd(-40, 10);
    streak(F.x - F.facing * rnd(16, 30), y, F.x - F.facing * rnd(80, 130), y, rnd(1.4, 2.6), P.qi, 9);
  }
}
// 闪身躲过一拳：那一拳擦着头过去 —— 闪的人（B）一道细弧、几点火花往两边散；擦过去的拳（A）一道淡线
function slipDodgeFx(B, A) {
  const J = B.J, y = J ? J.head[1] + 6 : FLOOR - 120, dir = A.facing, P = pal(B);
  swipe(B.x, y, 30, dir > 0 ? Math.PI : 0, 2.2, 4, P.fx, 12);
  sparks(B.x, y, dir, 5, 5, P.fx, 1.4, 0.6, 12);
  for (let i = 0; i < 3; i++) { const yy = y + rnd(-12, 12); streak(B.x - dir * 50, yy, B.x + dir * 30, yy, 1.6, pal(A).qi, 8); }
}
// 冲势：冲刺后的第一招。脚下扬尘、身后线拉长、头上一个「冲」字
function dashInFx(F) {
  const y = F.J ? F.J.sh[1] : FLOOR - 90, P = pal(F);
  for (let i = 0; i < 5; i++) { const yy = y + rnd(-30, 50); streak(F.x - F.facing * 10, yy, F.x - F.facing * rnd(120, 190), yy, rnd(2.5, 4.5), P.qi, 14); }
  sparks(F.x - F.facing * 10, FLOOR - 4, -F.facing, 6, 6, P.qi, 0.5, 0.5);
  dust(F.x - F.facing * 16, FLOOR, 5, true);
  tag(F.x - F.facing * 30, y - 60, '冲', F, 34);
}

/* ============================================================
   气：身上冒出半透明的火，夹几点火星。全是画面，用随机数没关系，不影响胜负。
   2.0.1：气是角色自己身体色的淡色 pal(F).qi（墨是灰黑的烟），火星用提亮的 pal(F).fx
   1.9.0 / 1.9.4 / 2.0.2：气跟着「连招」走 —— 3 连才起（只在拳脚上冒），越连越旺：4 连整个人冒火、身上发光、脚下亮一片，
   5 连起火更大更浓；连招断了半秒多就退。泼墨、爆气、截拳（花气的招）、卸力那一下照旧有气
   2.1（Jack：气再多方位优化 —— 形状像火，不一定往上冒，可以身后斜着冒、或者周围一圈火，看场合）：
   · 火苗改成真的火舌：底宽上尖、边上带一两个小火叉，几种形状随机挑，一抖一抖；火舌的尖顺着它飘的方向（往上冒就朝上，往后斜着冒就朝后上）；
   · 往哪冒看场合（qiFlow）：站着连招 = 往上冒、略往后飘；跑、冲刺、出招往前冲、在空中飞 = 火往身后斜着拖（越快越斜、越长），飘一会儿再往上卷；
   · 5 连起从背后斜着往后上方喷一片大火舌（以前是竖着一根气柱），像披着一件火做的披风；
   · 一圈火（qiRing）：爆气、泼墨起手、连招打到第 5 下 / 第 7 下 —— 从胸口一圈往外炸开的火舌，炸出去再往上卷
   ============================================================ */
const QI = [];
const addQi = o => { o.max = o.life; o.v = o.v === undefined ? (vrnd() * 4) | 0 : o.v; QI.push(o); };
// 连击数 → 火有多旺（2.0.2：1、2 连没有；3 连 0.4、4 连 0.65、5 连 0.9、6 连 1.15、7 连以上 1.4 到顶）
const comboHeat = n => n >= 3 ? Math.min(1.4, 0.4 + 0.25 * (n - 3)) : 0;
function qiLevel(F) {
  const m = F.state === 'attack' ? F.move : null, d = m && m.def;
  let a = 0, glow = 0;
  if (d && (d.cost || m.name === 'burst')) { a = 1; glow = 1; }                            // 花气的招：泼墨、爆气、截拳
  if (F.state === 'parry') { a = Math.max(a, 0.5); glow = Math.max(glow, 0.4); }             // 卸力那一下闪一下
  const h = F.heat || 0;                                                                     // 连招的火另外冒（emitQi），这里只管身上的光
  if (h > 0.5) glow = Math.max(glow, Math.min(1.45, (h - 0.5) * 1.6));                      // 4 连起发光，越连越亮
  return { a, glow };
}
// 连招打中的气浪（1.9.4）：3 连起每打中一下，身上炸开一圈火色的气浪，越连越大（3 连一小圈，6 连最大）；
// 4 连起脚下也荡开一圈；5 连起再往四面迸火星、画面亮一下；2.1：第 5 下、第 7 下再炸一圈火舌（qiRing）
function comboFx(F) {
  const n = F.combo;
  if (n < 3 || !F.J) return;
  const P = pal(F), y = F.J.hip[1] - 28, k = Math.min(1, (n - 3) / 3);
  ring(F.x, y, 14, 52 + 98 * k, 3 + 9 * k, P.qi, 14 + 10 * k, 0.85);                        // 从自己身上荡开：气的颜色（淡），身子的边不糊
  if (n >= 4) ring(F.x, FLOOR - 2, 10, 50 + 70 * k, 3 + 5 * k, P.qi, 18, 0.22);             // 脚下也荡开一圈
  if (n >= 5) { for (const d of [1, -1]) sparks(F.x, y, d, 4 + n, 8 + n, P.qi, 1.6, 0.7, 20); flashTo(0.06 + 0.03 * Math.min(4, n - 5)); }
  if (n === 5 || n === 7) fxDo('qr' + F.idx, () => qiRing(F, n === 7 ? 18 : 13, n === 7 ? 1.25 : 1));
}
const QI_BONES = [['hip', 'neck'], ['hip', 'neck'], ['neck', 'head'], ['sh', 'fe'], ['fe', 'fh'], ['sh', 'be'], ['be', 'bh'], ['hip', 'fk'], ['fk', 'ff'], ['hip', 'bk'], ['bk', 'bf']];
const QI_LIMBS = [['fe', 'fh'], ['be', 'bh'], ['fk', 'ff'], ['bk', 'bf']];       // 连得少：只在拳脚上冒
const QI_BACK = [['hip', 'neck'], ['hip', 'neck'], ['sh', 'neck']];             // 背上：5 连起往后上方喷的大火舌从这里出
/* 这一刻火往哪边冒（2.1）：人横着动得快（跑、冲刺、出招往前冲、在空中飞、被打飞）火就往身后斜着拖，越快越斜；站着就往上冒。
   返回 { lean: 火往身后偏多少（0 = 竖着往上，1 = 差不多横着往后拖）, back: 身后是哪边（-1 / 1） } */
function qiFlow(F) {
  const vx = F.qx === undefined ? 0 : F.x - F.qx;
  F.qx = F.x;
  const sp = Math.abs(vx) + (F.airborne ? Math.abs(F.vx || 0) * 0.5 : 0);
  F.qlean = (F.qlean || 0) + (clamp((sp - 1.2) / 5, 0, 1) - (F.qlean || 0)) * 0.25;   // 平滑一点，停下来火慢慢立回去
  const back = Math.abs(vx) > 0.6 ? (vx > 0 ? -1 : 1) : -F.facing;
  return { lean: F.qlean, back };
}
// 一条火舌：从 (x, y) 往 (vx, vy) 飘；buoy = 往上浮的劲（斜着冒出去的火慢慢往上卷），drag = 横着的速度每帧剩多少
function flame(F, col, x, y, vx, vy, r, a, life, o) {
  addQi(Object.assign({ k: 'flame', f: F.idx, col, x, y, vx, vy, r, a, life: life | 0, ph: rnd(0, 6.3), buoy: 0.03, drag: 0.97 }, o || {}));
}
// 一圈火（2.1）：从胸口一圈往外炸开的火舌，炸出去很快慢下来，再往上卷。n 条，k = 大小
function qiRing(F, n, k) {
  if (reduceMotion || !F.J) return;
  const P = pal(F), cx = F.x, cy = (F.J.hip[1] + F.J.neck[1]) / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(-0.15, 0.15), s = rnd(3.2, 4.8) * k, r0 = rnd(14, 22);
    flame(F, P.qi, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.9, Math.cos(a) * s, Math.sin(a) * s * 0.9 - 0.6,
      rnd(7, 11) * k, rnd(0.42, 0.6), rnd(20, 30), { buoy: 0.12, drag: 0.88, hot: vrnd() < 0.5, fr: Math.sin(a) > 0.2 && vrnd() < 0.35 });
  }
  for (let i = 0; i < 8; i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(3, 6) * k;
    addQi({ k: 'ember', f: F.idx, col: P.fx, x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, r: rnd(1.4, 2.6), a: 1, life: rnd(16, 28) | 0, ph: rnd(0, 6.3), drag: 0.92 });
  }
}
function emitQi(F) {
  // 连击的火：连上就往上涨（快），断了很快退掉（2.0.2：半秒多就没了；以前要一秒多，打完了还一直烧着）
  const tgt = F.comboLive ? comboHeat(F.combo) : 0, h0 = F.heat || 0;
  F.heat = h0 + (tgt - h0) * (tgt > h0 ? 0.3 : 0.08);
  if (F.heat < 0.02 && tgt === 0) F.heat = 0;
  const { a, glow } = qiLevel(F);
  F.qiGlow += (glow - F.qiGlow) * 0.2;
  const flow = qiFlow(F);
  if (reduceMotion || !F.J) return;
  const J = F.J, h = F.heat, P = pal(F), L = flow.lean, bk = flow.back;
  const spot = bones => {                                    // 在这些骨头上随便挑一点
    const [p0, p1] = bones[(vrnd() * bones.length) | 0], u = vrnd();
    return [J[p0][0] + (J[p1][0] - J[p0][0]) * u + rnd(-7, 7), J[p0][1] + (J[p1][1] - J[p0][1]) * u + rnd(-7, 7)];
  };
  // 一条普通的火：往上冒（略往身后飘）；动得快就往身后斜着拖（L 越大越斜、飘得越快、拉得越长）
  const lick = (x, y, up, r, al, life, extra) => {
    const vx = bk * (rnd(0.1, 0.8) + L * rnd(2.2, 3.6)) + rnd(-0.3, 0.3), vy = -up * (1 - 0.55 * L);
    flame(F, P.qi, x, y, vx, vy, r * (1 + 0.15 * L), al, life * (1 - 0.25 * L), Object.assign({ buoy: 0.02 + 0.06 * L, drag: 0.975 - 0.02 * L }, extra));
  };
  // 招式的气（泼墨、爆气、截拳、卸力）
  let n = a * (2 + 2.6 * a);
  while (n > 0 && a > 0.02) {
    if (n < 1 && vrnd() > n) break;
    n--;
    const [x, y] = spot(QI_BONES);
    if (vrnd() < 0.84) lick(x, y, rnd(1.2, 2.6) * (0.8 + a * 0.4), rnd(4, 8) * (0.7 + a * 0.6), rnd(0.22, 0.36) * (0.5 + a * 0.6), rnd(16, 28));
    else addQi({ k: 'ember', f: F.idx, col: P.fx, x, y, vx: bk * rnd(0, 0.8) + rnd(-0.4, 0.4), vy: -rnd(1.4, 3), r: rnd(1.2, 2.2), a: 0.9, life: rnd(14, 26) | 0, ph: rnd(0, 6.3) });
  }
  // 连招的火（2.0.2）：3 连才起，只在拳脚上冒；4 连起整个人冒火，一部分火苗烧到身子前面；越往后火苗越多、越大、越浓、窜得越高
  if (h > 0.05) {
    const big = h > 0.6, hm = Math.min(1, h);
    let k = h * (1.6 + 2.6 * h);                              // 每帧几个：3 连 1、4 连 2.1、5 连 3.5、6 连 5.3、7 连以上 7.3（2.1：少一点，一条一条火舌看得清）
    while (k > 0) {
      if (k < 1 && vrnd() > k) break;
      k--;
      const [x, y] = spot(h < 0.5 ? QI_LIMBS : QI_BONES);
      if (vrnd() < 0.86) lick(x, y, rnd(1.5, 3.2) * (0.8 + 0.55 * h), rnd(5.5, 8.5) * (0.8 + 0.55 * h), rnd(0.46, 0.64) * (0.65 + 0.35 * hm), rnd(16, 28),
        { hot: big && vrnd() < 0.55, fr: big && vrnd() < 0.08 });   // 烧到身前的很少：气再旺，身子也看得清
      else addQi({ k: 'ember', f: F.idx, col: P.fx, x, y, vx: bk * (rnd(0, 1) + L * 3) + rnd(-0.5, 0.5), vy: -rnd(1.6, 3.6) * (0.8 + 0.45 * h), r: rnd(1, 1.8) * (0.8 + 0.4 * h), a: 1, life: rnd(14, 26) | 0, ph: rnd(0, 6.3) });
    }
    // 5 连起：背上往身后斜着往上喷大火舌（像一件火做的披风；跑起来就整片往后拖）
    if (h > 0.8) {
      let p = (h - 0.7) * 2.2;                                // 5 连每帧 0.44 条、6 连 1、7 连以上 1.5
      while (p > 0) {
        if (p < 1 && vrnd() > p) break;
        p--;
        const [x, y] = spot(QI_BACK), sp = rnd(1.6, 2.8) * (0.8 + 0.3 * h);
        const ang = (0.5 + 0.45 * L + rnd(-0.18, 0.18)) * Math.PI / 2;      // 离竖直往后偏多少：站着 45° 左右，跑起来更平
        flame(F, P.qi, x + bk * 6, y + rnd(0, 8), bk * Math.sin(ang) * sp, -Math.cos(ang) * sp,
          rnd(13, 20) * (0.55 + 0.45 * h), rnd(0.2, 0.3) * hm, rnd(22, 34), { hot: vrnd() < 0.4, buoy: 0.05, drag: 0.98, len: 1.25 });
      }
    }
  }
}
function updateQi() {
  for (let i = QI.length - 1; i >= 0; i--) {
    const p = QI[i];
    p.px = p.x; p.py = p.y;                                   // 2.0.1 上一帧在哪（画的时候插值）
    p.ph += 0.22;
    p.vx *= p.drag || 1; p.vy = p.vy * 0.985 - (p.buoy || 0);   // 2.1 斜着 / 往外冒出去的火：横着慢下来，慢慢往上卷
    p.x += p.vx + Math.sin(p.ph) * 0.4; p.y += p.vy;
    if (p.k === 'flame') p.r *= 0.985;                         // 火苗越飘越细
    if (--p.life <= 0) QI.splice(i, 1);
  }
  if (QI.length > 1000) QI.splice(0, QI.length - 1000);         // 连招烧旺了火苗多（2.1 一圈火 → 1000）
}
