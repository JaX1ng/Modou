'use strict';
/* ============================================================
   动作台（2.4）：poses.html。给以后调人物、调动作用 ——
   · 左边选一招 / 一个姿势；中间用游戏自己的引擎（step）真打一遍，逐帧看；下面是几个关键阶段的小图
   · 「射程」：两人中心距、判定那几帧；右上写打中那一刻拳脚离对方身子还差多少（body.js bodyGap）
   · 右边改关键帧（写的和 moves.js 一样），「应用」马上重打一遍看，「复制」贴回 moves.js；姿势同理（贴回 pose.js）
   · 「模型」：调骨头长短、粗细、阴影，复制出来贴回 body.js 的 BODY 表
   · 「查全部」：每一招在最远射程打站着的人，判定第一帧碰没碰到（测试 tests.js 里也查同样的东西）
   真打一遍、量碰没碰到的那部分在 benchsim.js（测试也用）；这个文件只管页面
   网址后面加 #m=招名 直接打开那一招；#p=姿势名 打开那个姿势
   ============================================================ */
const $b = id => document.getElementById(id);
const PB = {
  tab: 'moves', sel: null, kind: 'move', frames: [], idx: 0, playing: false, acc: 0, raw: {}, rawPose: {},
  def: 'stand', dist: null, col: 'ink', bones: false, reach: true, sil: false, report: null,
};
const PB_GROUPS = BENCH_GROUPS, PB_STATES = BENCH_STATES, PB_HIT_MOVES = BENCH_HIT_MOVES, PB_SEQ = BENCH_SEQ, PB_AIR = BENCH_AIR;
const pbShowOp = () => PB.kind === 'move' && !(PB.def === 'none' && !PB_SEQ[PB.sel]);
const pbOpts = () => ({ dist: PB.dist, def: PB.def, col: PB.col });

/* ---------- 原样的关键帧（M() 换算成帧数以前的写法）：阶段 + 只写和 BASE 不一样的字段 ---------- */
function poseDiff(p) {
  const o = {};
  for (const k of NUMK) if (Math.abs(p[k] - BASE[k]) > 1e-6) o[k] = +p[k].toFixed(2);
  for (const k of ARRK) if (Math.abs(p[k][0] - BASE[k][0]) > 1e-6 || Math.abs(p[k][1] - BASE[k][1]) > 1e-6) o[k] = [+p[k][0].toFixed(2), +p[k][1].toFixed(2)];
  return o;
}
const fmtPose = o => '{ ' + Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? '[' + v.join(', ') + ']' : v}`).join(', ') + ' }';
function keysText(name) {
  const d = MOVES[name], rows = d.keys.map(([t, p, e]) => `  [${+phaseOf(d, t).toFixed(3)}, ${fmtPose(poseDiff(p))}${e && e !== 'io' ? `, '${e}'` : ''}]`);
  return '[\n' + rows.join(',\n') + '\n]';
}
function setKeys(name, arr) {
  const d = MOVES[name];
  const at = d.script ? p => p * d.R : p => p <= 1 ? p * d.S : p <= 2 ? d.S + (p - 1) * d.A : d.S + d.A + (p - 2) * d.R;
  d.keys = arr.map(([p, pose, e]) => [at(p), mk(pose), e || 'io']);
}
for (const n in MOVES) PB.raw[n] = MOVES[n].keys.map(([t, p, e]) => [t, mk(p), e]);
for (const n in POSE) PB.rawPose[n] = mk(POSE[n]);

/* ---------- 用游戏引擎真打一遍（benchsim.js），按页面上选的距离、对手、颜色 ---------- */
const pbMove = name => simulateMove(name, pbOpts());
const pbPose = name => simulateState(name, pbOpts());

/* ---------- 画 ---------- */
const pc = $b('pc'), pctx = pc.getContext('2d');
function figBounds(frames, from, to) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9;
  for (let i = from; i <= to; i++) {
    const f = frames[i]; if (!f) continue;
    for (const J of [f.J1, pbShowOp() ? f.J2 : null]) {
      if (!J) continue;
      for (const k in J) { const v = J[k]; if (Array.isArray(v)) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); } }
    }
  }
  return { x0: x0 - 30, x1: x1 + 30, y0: y0 - 24, y1: FLOOR + 14 };
}
function drawRibbons(pts, col) {
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  for (const p of pts) for (let i = 1; i < p.length; i++) { ctx.lineWidth = 5.4 * (1 - i / p.length * 0.45); ctx.beginPath(); ctx.moveTo(p[i - 1].x, p[i - 1].y); ctx.lineTo(p[i].x, p[i].y); ctx.stroke(); }
}
function drawOne(J, rib, col, band, alt) {
  ctx.fillStyle = 'rgba(23,24,26,.15)'; ctx.beginPath(); ctx.ellipse(J.hip[0], FLOOR + 3, 38 * (1 - Math.min(alt, 200) / 320), 5, 0, 0, Math.PI * 2); ctx.fill();
  if (PB.sil) { drawSilhouette(J, col, 1, 0); return; }
  drawRibbons(rib, band);
  ctx.shadowColor = 'rgba(23,24,26,.35)'; ctx.shadowBlur = 2.5; ctx.fillStyle = col; ctx.fill(bodySilhouette(J, 0)); ctx.shadowBlur = 0;
  drawBody(J, col, band);
}
function drawBonesOverlay(J) {
  ctx.strokeStyle = 'rgba(210,60,30,.85)'; ctx.fillStyle = '#d23c1e'; ctx.lineWidth = 0.8;
  const segs = [['hip', 'neck'], ['neck', 'neckTop'], ['shF', 'fe'], ['fe', 'fh'], ['shB', 'be'], ['be', 'bh'], ['hipF', 'fk'], ['fk', 'ff'], ['hipB', 'bk'], ['bk', 'bf'], ['shF', 'shB']];
  for (const [a, b] of segs) { ctx.beginPath(); ctx.moveTo(J[a][0], J[a][1]); ctx.lineTo(J[b][0], J[b][1]); ctx.stroke(); }
  for (const k of ['hip', 'neck', 'head', 'shF', 'shB', 'fe', 'fh', 'be', 'bh', 'fk', 'ff', 'bk', 'bf']) { ctx.beginPath(); ctx.arc(J[k][0], J[k][1], 1.6, 0, Math.PI * 2); ctx.fill(); }
}
function drawFrame(g, w, h, f, box, o) {
  withCtx(g, () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ebeae2'; ctx.fillRect(0, 0, w, h);
    const s = Math.min(w / (box.x1 - box.x0), h / (box.y1 - box.y0));
    ctx.translate(w / 2 - (box.x0 + box.x1) / 2 * s, (h + (box.y1 - box.y0) * s) / 2 - box.y1 * s); ctx.scale(s, s);
    ctx.strokeStyle = 'rgba(23,24,26,.35)'; ctx.lineWidth = 1.2 / s; ctx.beginPath(); ctx.moveTo(box.x0 - 200, FLOOR + 1); ctx.lineTo(box.x1 + 200, FLOOR + 1); ctx.stroke();
    const showOp = pbShowOp();
    if (o.reach && f.mv && PB_HIT_MOVES.has(f.mv.name)) {
      // 射程：从出招的人中心往前 reach（判定那几帧是红的）
      const d = MOVES[f.mv.name], y = FLOOR + 8;
      ctx.strokeStyle = f.mv.act ? '#b8321d' : 'rgba(23,24,26,.4)'; ctx.lineWidth = (f.mv.act ? 2.4 : 1.2) / s;
      ctx.beginPath(); ctx.moveTo(f.x1, y); ctx.lineTo(f.x1 + d.reach, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f.x1 + d.reach, y - 4); ctx.lineTo(f.x1 + d.reach, y + 4); ctx.stroke();
      ctx.fillStyle = 'rgba(23,24,26,.6)'; ctx.beginPath(); ctx.arc(f.x1, y, 2.2, 0, Math.PI * 2); ctx.arc(f.x2, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    if (showOp) drawOne(f.J2, f.r2, f.c2, f.s2, 0);
    drawOne(f.J1, f.r1, f.c1, f.s1, f.alt1);
    if (o.bones) { drawBonesOverlay(f.J1); if (showOp) drawBonesOverlay(f.J2); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  });
}
function redraw() {
  const r = pc.getBoundingClientRect(), k = Math.min(2, window.devicePixelRatio || 1);
  pc.width = Math.max(10, Math.round(r.width * k)); pc.height = Math.max(10, Math.round(r.height * k));
  const f = PB.frames[PB.idx]; if (!f) return;
  drawFrame(pctx, pc.width, pc.height, f, PB.box, { reach: PB.reach, bones: PB.bones });
  // 角上：第几帧、哪个阶段
  pctx.fillStyle = '#17181a'; pctx.font = `${14 * k}px sans-serif`;
  const m = f.mv;
  const ph = m ? (m.t <= m.S ? `前摇 ${m.t}/${m.S}` : m.t <= m.S + m.A ? `判定 ${m.t - m.S}/${m.A}` : `收招 ${m.t - m.S - m.A}/${m.R}`) : f.st1;
  pctx.fillText(`第 ${PB.idx} 帧 · ${ph}${f.freeze ? ' · 顿帧' : ''}${m && m.hit ? ' · 打中' : m && m.blocked ? ' · 被挡' : ''}`, 12 * k, 22 * k);
  $b('fLab').textContent = PB.idx;
}
function drawStrip() {
  const el = $b('strip'); el.innerHTML = '';
  const fr = PB.frames; if (!fr.length) return;
  let picks;
  if (PB.kind === 'move' && MOVES[PB.sel]) {
    // 每个阶段挑一帧：起手、前摇一半、出手（判定第一帧）、判定中、判定完、收招一半、收完
    const want = [0, 0.5, 1.05, 1.5, 2, 2.5, 3], m0 = fr.findIndex(f => f.mv && f.mv.name === PB.sel);
    picks = want.map(p => {
      let best = -1, bd = 1e9;
      fr.forEach((f, i) => { if (!f.mv || f.mv.name !== PB.sel || i < m0) return; const d = MOVES[PB.sel], q = phaseOf(d, f.mv.t * (f.mv.S ? d.S / f.mv.S : 1)); if (Math.abs(q - p) < bd) { bd = Math.abs(q - p); best = i; } });
      return [p, best];
    }).filter(([, i]) => i >= 0);
  } else picks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(u => [u, Math.round(u * (fr.length - 1))]);
  for (const [p, i] of picks) {
    const fig = document.createElement('figure'), c = document.createElement('canvas');
    c.width = 150; c.height = 130; c.style.width = '150px'; c.style.height = '130px';
    drawFrame(c.getContext('2d'), 150, 130, fr[i], PB.box, { reach: false, bones: false });
    c.addEventListener('click', () => { PB.idx = i; $b('frame').value = i; redraw(); });
    fig.appendChild(c); const cap = document.createElement('figcaption'); cap.textContent = PB.kind === 'move' ? `阶段 ${p} · 第 ${i} 帧` : `第 ${i} 帧`; fig.appendChild(cap);
    el.appendChild(fig);
  }
}

/* ---------- 碰没碰到（benchsim.js contactOf / contactAll） ---------- */
function showReport() {
  const r = $b('report');
  if (PB.kind !== 'move' || !PB_HIT_MOVES.has(PB.sel)) { r.textContent = ''; return; }
  const c = contactOf(PB.frames, PB.sel);
  if (!c) { r.innerHTML = '这一下没出判定'; return; }
  const good = contactGood(c), lb = MOVES[PB.sel].limb;
  r.innerHTML = `${c.hit ? '打中了' : '没打中'} · 判定那一刻${lb.endsWith('h') ? '拳' : lb.endsWith('e') ? '肘' : lb === 'sh' ? '肩' : '脚'}离对方身子 <b class="${good ? 'ok' : 'bad'}">${c.gap > 0 ? '还差 ' + c.gap.toFixed(1) : '扎进去 ' + (-c.gap).toFixed(1)}</b> 像素（第 ${c.frame} 帧）`;
}
function pbContactAll() {
  const rows = contactAll({ def: 'stand', col: PB.col });
  PB.report = rows;
  $b('allTable').innerHTML = '<table><tr><th>招</th><th>射程</th><th>打中</th><th>差多少</th></tr>' + rows.map(r =>
    `<tr><td>${MOVES[r.n].label}</td><td>${Math.round(r.reach)}</td><td>${r.hit ? '✓' : '✗'}</td><td style="color:${r.ok ? 'var(--ok)' : 'var(--bad)'}">${r.gap == null ? '—' : r.gap.toFixed(1)}</td></tr>`).join('') + '</table>';
  for (const b of document.querySelectorAll('#list .item')) { const row = rows.find(x => x.n === b.dataset.n); b.classList.toggle('warn', !!row && !row.ok); }
  open(PB.kind, PB.sel);
  return rows;
}

/* ---------- 列表、选中 ---------- */
function renderList() {
  const el = $b('list');
  $b('editBox').hidden = PB.tab === 'model'; $b('modelBox').hidden = PB.tab !== 'model';
  if (PB.tab === 'moves') el.innerHTML = PB_GROUPS.map(([g, list]) => `<p class="grp">${g}</p>` + list.map(n => `<button class="item${PB.sel === n ? ' on' : ''}" data-n="${n}" data-k="move" type="button">${MOVES[n].label}<small>${n}</small></button>`).join('')).join('');
  else if (PB.tab === 'poses') el.innerHTML = '<p class="grp">基础姿势（pose.js POSE）</p>' + Object.keys(POSE).map(n => `<button class="item${PB.sel === n ? ' on' : ''}" data-n="${n}" data-k="pose" type="button">${n}</button>`).join('') +
    '<p class="grp">动起来看</p>' + PB_STATES.map(([n, l]) => `<button class="item${PB.sel === n ? ' on' : ''}" data-n="${n}" data-k="state" type="button">${l}<small>${n}</small></button>`).join('');
  else { el.innerHTML = '<p class="info">右边的滑块调完马上看得到；满意了点「复制」，把 BODY 表贴回 js/body.js。</p>'; renderModel(); }
}
function open(kind, name) {
  PB.kind = kind; PB.sel = name; PB.playing = false; $b('bPlay').textContent = '▶ 播放';
  PB.frames = kind === 'move' ? pbMove(name) : pbPose(name);
  const mi = PB.frames.findIndex(f => f.mv && f.mv.name === name && f.mv.act);
  PB.idx = kind === 'move' ? Math.max(0, mi) : 0;
  PB.box = figBounds(PB.frames, 0, PB.frames.length - 1);
  $b('frame').max = Math.max(0, PB.frames.length - 1); $b('frame').value = PB.idx;
  const d = MOVES[name];
  $b('title').textContent = kind === 'move' ? `${d.label}（${name}）` : kind === 'pose' ? `姿势 ${name}` : (PB_STATES.find(s => s[0] === name) || [, name])[1];
  $b('meta').textContent = kind === 'move' ? (d.script ? `动作 ${d.R} 帧` : `前摇 ${d.S} · 判定 ${d.A} · 后摇 ${d.R} · 射程 ${d.reach}${d.lunge ? ' + 前冲 ' + d.lunge[2] : ''} · 用 ${d.limb || '—'} 打`) : '';
  const dv = PB.dist != null ? PB.dist : PB_AIR[name] ? airDistOf(name) : PB_SEQ[name] ? PB_SEQ[name].dist : d && d.reach ? Math.round(effReachOf(name)) : 170;
  $b('dLab').textContent = kind === 'move' ? dv : '';
  if (kind === 'move') $b('dist').value = dv;
  $b('keys').value = kind === 'move' ? keysText(name) : kind === 'pose' ? fmtPose(poseDiff(POSE[name])) : '（动起来的状态没有关键帧：跑步在 fighter.js runPose、跳在 pose.js P_J*）';
  $b('keys').disabled = kind === 'state';
  $b('msg').textContent = '';
  try { history.replaceState(null, '', '#' + (kind === 'move' ? 'm=' : kind === 'pose' ? 'p=' : 's=') + name); } catch (e) {}
  for (const b of document.querySelectorAll('#list .item')) b.classList.toggle('on', b.dataset.n === name);
  showReport(); redraw(); drawStrip();
}
function applyEdit() {
  const txt = $b('keys').value;
  try {
    const v = Function('"use strict"; return (' + txt + ');')();
    if (PB.kind === 'move') {
      if (!Array.isArray(v) || !v.every(r => Array.isArray(r) && typeof r[0] === 'number' && r[1] && typeof r[1] === 'object')) throw new Error('要写成 [[阶段, {姿势}, 缓动], …]');
      setKeys(PB.sel, v);
    } else if (PB.kind === 'pose') copyPose(POSE[PB.sel], mk(v));
    $b('msg').textContent = '已应用（只在这个页面里，刷新就没了 —— 满意了点「复制」贴回去）';
    const k = PB.kind, n = PB.sel, i = PB.idx; open(k, n); PB.idx = Math.min(i, PB.frames.length - 1); $b('frame').value = PB.idx; redraw();
  } catch (e) { $b('msg').textContent = '写错了：' + e.message; }
}
function copyText() {
  const n = PB.sel, txt = PB.kind === 'move' ? `keys: ${keysText(n).replace(/\n/g, '\n    ')}` : PB.kind === 'pose' ? `${n}: mk(${fmtPose(poseDiff(POSE[n]))}),` : '';
  try { navigator.clipboard.writeText(txt); $b('msg').textContent = '复制好了'; } catch (e) { $b('msg').textContent = '复制不了：自己选中文字复制'; }
  return txt;
}

/* ---------- 模型（BODY 表） ---------- */
const PB_BASE_BODY = JSON.parse(JSON.stringify(BODY));
const PB_SLIDERS = [
  ['bone.head', '头（半径）', 8, 16, 0.1], ['bone.torso', '躯干', 36, 56, 0.5], ['bone.shoulder', '肩高', 32, 50, 0.5], ['bone.neck', '脖子', 0, 10, 0.2],
  ['bone.ua', '大臂', 18, 32, 0.5], ['bone.fa', '小臂（到拳心）', 16, 30, 0.5], ['bone.th', '大腿', 30, 46, 0.5], ['bone.sh', '小腿', 28, 44, 0.5],
  ['shoulderW', '肩宽（一半）', 6, 20, 0.5], ['hipSplit', '两腿根错开', 0, 6, 0.2], ['muscle', '四肢粗细（倍）', 0.7, 1.4, 0.02], ['torsoW', '躯干粗细（倍）', 0.7, 1.4, 0.02],
  ['fist.len', '拳头长', 6, 16, 0.2], ['fist.h', '拳头高', 6, 14, 0.2], ['fist.r', '拳头圆角', 1, 7, 0.1],
  ['shade.rim', '亮边宽（躯干、腿、鞋）', 0, 3, 0.05], ['shade.rimArm', '亮边宽（胳膊、拳）', 0, 3, 0.05], ['shade.line', '近侧手脚描线宽', 0, 3, 0.05],
  ['shade.tone', '亮边颜色（往纸色混多少）', 0, 0.4, 0.01], ['shade.up', '侧面亮边往上偏', 0, 1, 0.02],
];
const pbScale = { muscle: 1, torsoW: 1 };
const pbGet = p => p === 'muscle' || p === 'torsoW' ? pbScale[p] : p.split('.').reduce((o, k) => o[k], BODY);
function pbSet(p, v) {
  if (p === 'muscle' || p === 'torsoW') {
    pbScale[p] = v;
    for (const seg of p === 'muscle' ? ['ua', 'fa', 'th', 'sh', 'neck'] : ['torso']) BODY[seg] = PB_BASE_BODY[seg].map(r => r.map((x, i) => i === 0 ? x : +(x * v).toFixed(2)));
  } else { const ks = p.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], BODY)[last] = v; }
  Object.assign(BONE, { torso: BODY.bone.torso, neck: BODY.bone.neck, head: BODY.bone.head, ua: BODY.bone.ua, fa: BODY.bone.fa, th: BODY.bone.th, sh: BODY.bone.sh });
  for (const k in BODY_TONES) delete BODY_TONES[k];
}
function renderModel() {
  const el = $b('modelBox');
  el.innerHTML = '<h2>人物模型（body.js 的 BODY 表）</h2>' + PB_SLIDERS.map(([p, l, a, b, s]) => `<div class="sl"><span>${l}</span><input type="range" min="${a}" max="${b}" step="${s}" value="${pbGet(p)}" data-p="${p}"><b>${(+pbGet(p)).toFixed(2)}</b></div>`).join('') +
    '<div class="row"><button class="btn" id="bModelCopy" type="button">复制 BODY 表</button><button class="btn" id="bModelReset" type="button">还原</button></div><p class="msg" id="modelMsg"></p><textarea id="modelOut" spellcheck="false" style="height:160px"></textarea>';
  for (const r of el.querySelectorAll('input[type=range]')) r.addEventListener('input', () => { pbSet(r.dataset.p, +r.value); r.nextElementSibling.textContent = (+r.value).toFixed(2); if (PB.sel) open(PB.kind, PB.sel); });
  $b('bModelCopy').addEventListener('click', () => {
    const out = JSON.stringify(BODY, null, 0).replace(/"(\w+)":/g, '$1: ').replace(/,(?=\S)/g, ', ');
    $b('modelOut').value = 'const BODY = ' + out + ';';
    try { navigator.clipboard.writeText($b('modelOut').value); $b('modelMsg').textContent = '复制好了，替换 body.js 里的 BODY 表（注释会没了，最好只挑改过的数抄过去）'; } catch (e) { $b('modelMsg').textContent = '在下面框里自己复制'; }
  });
  $b('bModelReset').addEventListener('click', () => { for (const [p] of PB_SLIDERS) pbSet(p, p === 'muscle' || p === 'torsoW' ? 1 : pbGet.call(null, p) && p.split('.').reduce((o, k) => o[k], PB_BASE_BODY)); renderModel(); if (PB.sel) open(PB.kind, PB.sel); });
}

/* ---------- 事件 ---------- */
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  PB.tab = b.dataset.tab; for (const x of document.querySelectorAll('.tabs button')) x.setAttribute('aria-pressed', x === b);
  renderList();
});
$b('list').addEventListener('click', e => { const b = e.target.closest('.item'); if (b) { PB.dist = null; open(b.dataset.k, b.dataset.n); } });
$b('frame').addEventListener('input', e => { PB.idx = +e.target.value; redraw(); });
$b('bPlay').addEventListener('click', () => { PB.playing = !PB.playing; $b('bPlay').textContent = PB.playing ? '⏸ 暂停' : '▶ 播放'; if (PB.playing && PB.idx >= PB.frames.length - 1) PB.idx = 0; });
$b('bPrev').addEventListener('click', () => { PB.idx = Math.max(0, PB.idx - 1); $b('frame').value = PB.idx; redraw(); });
$b('bNext').addEventListener('click', () => { PB.idx = Math.min(PB.frames.length - 1, PB.idx + 1); $b('frame').value = PB.idx; redraw(); });
$b('def').addEventListener('change', e => { PB.def = e.target.value; if (PB.sel) open(PB.kind, PB.sel); });
$b('dist').addEventListener('input', e => { PB.dist = +e.target.value; $b('dLab').textContent = PB.dist; });
$b('dist').addEventListener('change', () => { if (PB.sel) open(PB.kind, PB.sel); });
$b('oBones').addEventListener('change', e => { PB.bones = e.target.checked; redraw(); drawStrip(); });
$b('oReach').addEventListener('change', e => { PB.reach = e.target.checked; redraw(); });
$b('oSil').addEventListener('change', e => { PB.sil = e.target.checked; redraw(); drawStrip(); });
$b('col').innerHTML = PALETTE.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
$b('col').addEventListener('change', e => { PB.col = e.target.value; if (PB.sel) open(PB.kind, PB.sel); });
$b('bApply').addEventListener('click', applyEdit);
$b('keys').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyEdit(); } });
$b('bReset').addEventListener('click', () => {
  if (PB.kind === 'move') MOVES[PB.sel].keys = PB.raw[PB.sel].map(([t, p, e]) => [t, mk(p), e]);
  else if (PB.kind === 'pose') copyPose(POSE[PB.sel], PB.rawPose[PB.sel]);
  open(PB.kind, PB.sel);
});
$b('bCopy').addEventListener('click', copyText);
$b('bAll').addEventListener('click', () => { $b('allTable').textContent = '算着…'; setTimeout(pbContactAll, 30); });
window.addEventListener('resize', redraw);
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') $b('bNext').click(); else if (e.key === 'ArrowLeft') $b('bPrev').click(); else if (e.key === ' ') { e.preventDefault(); $b('bPlay').click(); }
});
let pbLast = performance.now();
(function tick(now) {
  const dt = now - pbLast; pbLast = now;
  if (PB.playing && PB.frames.length) {
    PB.acc += dt * +$b('speed').value;
    while (PB.acc >= STEP_MS) { PB.acc -= STEP_MS; PB.idx = PB.idx >= PB.frames.length - 1 ? 0 : PB.idx + 1; }
    $b('frame').value = PB.idx; redraw();
  }
  requestAnimationFrame(tick);
})(pbLast);
// 打开：#m=招 / #p=姿势 / #s=状态
(function boot() {
  Sound.on = false;
  renderList();
  const h = location.hash.slice(1), [k, v] = h.split('=');
  if (k === 'm' && MOVES[v]) open('move', v);
  else if (k === 'p' && POSE[v]) { PB.tab = 'poses'; renderList(); open('pose', v); }
  else if (k === 's') { PB.tab = 'poses'; renderList(); open('state', v); }
  else open('move', 'jab');
})();
window.__pb = { PB, open, simulateMove: pbMove, simulatePose: pbPose, contactAll: pbContactAll, contactOf, drawFrame, figBounds, keysText, setKeys, copyText, pbSet };
