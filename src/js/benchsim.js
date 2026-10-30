'use strict';
/* ============================================================
   动作台（poses.html）和测试（tests.html）共用（2.4）：用游戏引擎真打一遍某一招 / 某个状态，记下每一帧的骨骼；
   量打中那一刻拳脚离对方身子还差多少（body.js bodyGap）。
   只用 step() 驱动，和真打、联机走同一条路；量完了场上是乱的（要玩就重新开一局）
   ============================================================ */
const BENCH_GROUPS = [
  ['拳系', ['jab', 'jab2', 'jab3', 'rushL', 'rushR', 'rushEnd', 'lowJab', 'elbow', 'stepPunch']],
  ['重系', ['heavy', 'beng', 'chop', 'hammer', 'upper', 'palm', 'shoulder', 'jieQuan', 'slipElbow', 'super']],
  ['腿系', ['kick', 'whip', 'twinKick', 'backKick', 'whirl', 'sweep', 'stomp']],
  ['跳起来', ['airJab', 'airHeavy', 'airKick', 'dive']],
  ['擒拿、摔', ['grab', 'lowGrab', 'hold', 'grabHit', 'knee', 'trip', 'throwBack', 'tackle', 'legCatch', 'scoop']],
  ['防守、身法', ['shove', 'dash', 'slip', 'burst']],
];
const BENCH_STATES = [['idle', '待机（呼吸）'], ['running', '跑'], ['jump', '站着跳'], ['leapJ', '跑着跳'], ['getup', '倒地 → 起身'], ['stagger', '踉跄'], ['blockWalk', '边挡边走']];
// 量「碰没碰到」的招：拳系、重系、腿系、跳起来的招 + 推掌
const BENCH_HIT_MOVES = new Set(BENCH_GROUPS.slice(0, 4).flatMap(g => g[1]).concat(['shove']));
// 打中那一刻拳脚离对方身子：最多扎进去 12、最多还差 1 像素，看着就是打在身上（不是隔空打中，也不是整只拳头没进身子里）
const CONTACT_OK = [-12, 1];
// 最远射程（射程 + 前冲）。量的时候少放半个像素：前冲一帧一帧加上去有零点几的浮点误差，正好卡在边上会差 1e-13 打不中
// 2.9 MV：哪一派的招式表（不写 = 传统格斗；别的派传那一派的表，或者 o.style = 拳派的 id）
const benchMoves = o => (o && o.style && STYLES[o.style] ? STYLES[o.style].moves : MOVES);
const effReachOf = (n, MV) => { const d = (MV || MOVES)[n]; return d.reach + (d.lunge && !d.script ? Math.max(0, d.lunge[2]) : 0) - 0.5; };
const benchKind = d => ['jab', 'heavy', 'kick', 'grab'].includes(d.kind) ? d.kind : null;
// 第 t 帧是这一招的第几「阶段」（0 起手 → 1 出手 → 2 判定完 → 3 收完；script 动作 0~1）
function phaseOf(d, t) {
  if (d.script) return t / d.R;
  if (t <= d.S) return d.S ? t / d.S : 0;
  if (t <= d.S + d.A) return 1 + (t - d.S) / (d.A || 1);
  return 2 + (t - d.S - d.A) / (d.R || 1);
}

const snapRib = F => F.ribbons.map(pts => pts.map(q => ({ x: q.x, y: q.y })));
function benchRecord(frames) {
  const m = F1.move;
  frames.push({
    J1: cloneJ(F1.J), J2: cloneJ(F2.J), r1: snapRib(F1), r2: snapRib(F2), x1: F1.x, x2: F2.x, alt1: F1.alt, st1: F1.state, st2: F2.state,
    mv: m ? { name: m.name, t: m.t, S: m.S, A: m.def.A, R: m.def.R, hit: m.hit, blocked: m.blocked, act: F1.inActive(), limb: m.def.limb } : null,
    c1: F1.color, c2: F2.color, s1: F1.sash, s2: F2.sash, freeze: game.freeze > 0,
  });
}
// 摆好场子：玩家一在 700 面朝右，玩家二离他 dist（def：stand 站着 / crouch 蹲着 / block 站挡 / none 不要对手，放到很远）
// 2.9 style：玩家一是哪一派（不写 = 传统格斗）；opStyle：玩家二
function benchSetup(dist, def, col, style, opStyle) {
  startMatch('pvp'); game.phase = 'fight'; game.paused = true; game.brains = [null, null];
  F1.style = style || STYLE_DEFAULT; F2.style = opStyle || STYLE_DEFAULT;
  if (col) { F1.setLook(col); F2.setLook(col === 'indigo' ? 'vermil' : 'indigo'); }
  const far = def === 'none';
  F1.x = far ? 500 : 700; F2.x = far ? 1500 : 700 + dist; F1.facing = 1; F2.facing = -1;
  const dIn = def === 'crouch' ? HOLD('down') : def === 'block' ? HOLD('block') : 0;
  for (let i = 0; i < 14; i++) step([0, dIn]);
  F1.x = far ? 500 : 700; F2.x = far ? 1500 : 700 + dist;
  for (let i = 0; i < 2; i++) step([0, dIn]);
  return dIn;
}
// 擒拿后续、接腿这些要两边配合的：照真的按法按
const BENCH_SEQ = {
  hold: { dist: 70, me: (i, F) => i === 0 ? TAP('grab') : 0 },
  grabHit: { dist: 70, me: (i, F) => i === 0 ? TAP('grab') : 0 },
  knee: { dist: 70, me: (i, F) => i === 0 ? TAP('grab') : F.move && F.move.name === 'hold' && F.move.t >= 3 && F.move.t < 4 ? TAP('jab') : 0 },
  trip: { dist: 70, me: (i, F) => i === 0 ? TAP('grab') : F.move && F.move.name === 'hold' && F.move.t >= 3 && F.move.t < 4 ? TAP('kick') : 0 },
  throwBack: { dist: 70, me: (i, F) => i === 0 ? TAP('grab') : F.move && F.move.name === 'hold' && F.move.t >= 3 && F.move.t < 4 ? TAP('heavy') : 0 },
  tackle: { dist: 76, def: 'crouch', me: (i, F) => i === 0 ? HOLD('down') | TAP('grab') : 0 },
  legCatch: { dist: 112, op: (i, F, O) => i === 0 ? TAP('kick') : 0, me: (i, F, O) => O.move && O.move.name === 'kick' && O.move.t >= 6 && O.move.t < 7 ? TAP('grab') : 0 },
  scoop: { dist: 104, op: (i, F, O) => i === 0 ? HOLD('down') | TAP('kick') : 0, me: (i, F, O) => O.move && O.move.name === 'sweep' && O.move.t >= 3 && O.move.t < 4 ? HOLD('down') | TAP('grab') : 0 },
  // 回身肘：对手出重拳，按着挡朝他双击闪过去，钻到他身后自动回身一肘（打在背上）
  // 钻的时机跟着重拳的前摇走（2.12 重拳 15 → 18）：重拳出手前 5 帧开始双击
  slipElbow: { dist: 80, min: 30, op: i => i === 3 ? TAP('heavy') : 0,
    me: (i, F) => { const t0 = 3 + MOVES.heavy.S - 5; return F.move && F.move.name === 'slipElbow' ? 0 : i >= t0 && i <= t0 + 2 ? HOLD('block') | (i === t0 + 1 ? 0 : HOLD('right')) : HOLD('block'); } },
};
// 跳起来出的招：真跳 —— 按住前跳起来，快到最高点按招（坠山按住蹲再踢）。最远多远起跳还打得中，现找一遍（记下来）
const BENCH_AIR = { airJab: 'jab', airHeavy: 'heavy', airKick: 'kick', dive: 'kick' };
const airSeq = name => ({ air: true, me: (i, F) => {
  const k = BENCH_AIR[name], down = name === 'dive';
  if (i === 0) return TAP('up') | HOLD('right');
  if (F.state === 'air' && !F.airUsed && F.vz < 3) return TAP(k) | HOLD('right') | (down ? HOLD('down') : 0);
  return F.state === 'jumpsquat' || F.airborne ? HOLD('right') | (down && F.move && F.move.name === 'dive' ? HOLD('down') : 0) : 0;
} });
const benchAirDist = {};
function airDistOf(name, style) {
  const key = (style || STYLE_DEFAULT) + ':' + name;
  if (benchAirDist[key]) return benchAirDist[key];
  const d = benchMoves({ style })[name]; let best = d.reach + 60;
  for (let x = d.reach + 240; x >= d.reach + 20; x -= 6) {
    const fr = runSeq(name, airSeq(name), x, 'stand', null, style);
    if (fr.some(f => f.mv && f.mv.name === name && f.mv.hit)) { best = x; break; }
  }
  return (benchAirDist[key] = best);
}
function runSeq(name, seq, dist, def, col, style, opStyle) {
  const dIn = benchSetup(dist, def, col, style, opStyle), frames = [];
  benchRecord(frames);
  let idle = 0;
  for (let i = 0; i < 220; i++) {
    step([seq.me(i, F1, F2), seq.op ? seq.op(i, F1, F2) : dIn]);
    benchRecord(frames);
    const busy = F1.state === 'attack' || F1.state === 'air' || F1.state === 'jumpsquat' || F1.state === 'land' || F2.state === 'down' || F2.state === 'hit';
    idle = busy ? 0 : idle + 1;
    if (i > 8 && idle > 10) break;
  }
  return frames;
}
// 打一招，返回每一帧。o.dist：离多远（不写 = 最远射程；跳起来的招 = 最远还打得中的地方）；o.def：对手怎么站；o.col：玩家一的颜色
function simulateMove(name, o) {
  o = o || {};
  const MV = benchMoves(o), d = MV[name], def0 = o.def || 'stand';
  if (BENCH_AIR[name]) return runSeq(name, airSeq(name), o.dist != null ? o.dist : airDistOf(name, o.style), def0, o.col, o.style, o.opStyle);
  const seq = (o.style && STYLES[o.style] && STYLES[o.style].benchSeq || {})[name] || BENCH_SEQ[name];
  const dist = o.dist != null ? o.dist : seq ? seq.dist : d.reach ? effReachOf(name, MV) : 170;   // 冲刺、闪身这些没有射程的：站远一点看
  const def = seq && seq.def ? seq.def : def0;
  const dIn = benchSetup(dist, def, o.col, o.style, o.opStyle);
  const frames = [];
  benchRecord(frames);
  if (!seq) {
    if (d.air) { F1.state = 'air'; F1.alt = d.dive ? 92 : 64; F1.vz = d.dive ? 2 : 0.5; F1.vx = 0; F1.airUsed = false; F1.fk(); }
    if (d.script) { F1.startScript(name); }
    else F1.beginMove(name, d.guard ? null : benchKind(d));
  }
  let idle = 0;
  for (let i = 0; i < 220; i++) {
    const me = seq ? seq.me(i, F1, F2) : 0, op = seq && seq.op ? seq.op(i, F1, F2) : dIn;
    step([me, op]);
    benchRecord(frames);
    const busy = F1.state === 'attack' || F1.state === 'air' || F1.state === 'land' || F2.state === 'down' || F2.state === 'hit';
    idle = busy ? 0 : idle + 1;
    if (i > (seq && seq.min || 8) && idle > 10) break;
  }
  return frames;
}
// 一个姿势（POSE 里的）摆一帧；动起来的状态（BENCH_STATES：跑、跳、起身……）照真的按法走一遍
function simulateState(name, o) {
  o = o || {};
  benchSetup(400, 'none', o.col, o.style);
  const frames = [], PS = o.style && STYLES[o.style] && STYLES[o.style].poses || {};   // 2.9 这一派自己的架势（没写的照 POSE）
  if ((PS[name] || POSE[name]) && !BENCH_STATES.some(x => x[0] === name)) {
    copyPose(F1.disp, PS[name] || POSE[name]); F1.state = 'idle'; F1.J = null; F1.ikS = null; F1.fk();
    for (let i = 0; i < 30; i++) { F1.updateRibbons(); }
    benchRecord(frames);
    return frames;
  }
  const steps = { idle: 80, running: 70, jump: 40, leapJ: 46, getup: 64, stagger: 40, blockWalk: 60 }[name] || 40;
  if (name === 'getup') F1.knockDown(3, 0, LIE_HIT, false);
  if (name === 'stagger') { F1.state = 'hit'; F1.stagger = true; F1.stunT = STAGGER; F1.facing = 1; }
  for (let i = 0; i < steps; i++) {
    let v = 0;
    if (name === 'running') v = HOLD('right');
    if (name === 'blockWalk') v = HOLD('block') | HOLD('left');
    if (name === 'jump') v = i === 0 ? TAP('up') : 0;
    if (name === 'leapJ') v = i < 26 ? HOLD('right') | (i === 25 ? TAP('up') : 0) : HOLD('right');
    step([v, 0]); benchRecord(frames);
  }
  return frames;
}
/* 碰没碰到：打中那一帧（没打中就判定第一帧）出招的拳 / 脚 / 肘 / 肩离对方身子还差多少（gap，负 = 扎进去）、
   往前过了对方迎面那一层多远（pen：离得近时看拳头是不是整个穿过去了） */
function contactOf(frames, name, MV) {
  const d = (MV || MOVES)[name]; if (!d || !d.limb) return null;
  let at = frames.findIndex(f => f.mv && f.mv.name === name && f.mv.hit);
  const first = frames.findIndex(f => f.mv && f.mv.name === name && f.mv.act);
  if (at < 0) at = first;
  if (at < 0) return null;
  const f = frames[at];
  const sp = strikeParts(f.J1, d.limb);
  return { frame: at, hit: frames.some(x => x.mv && x.mv.name === name && x.mv.hit), gap: bodyGap(sp, f.J2), pen: bodyPen(d.limb === 'ff' || d.limb === 'bf' ? sp.slice(0, 1) : sp, f.J2, f.J1.facing, true), first };
}
const contactGood = c => !!c && c.hit && c.gap >= CONTACT_OK[0] && c.gap <= CONTACT_OK[1];
// 每一招在最远射程打站着的人：[{ n 招名, reach 最远射程, hit 打中没有, gap 差多少 }]
function contactAll(o) {
  const rows = [], MV = benchMoves(o), list = o && o.style && STYLES[o.style] && STYLES[o.style].benchHit ? STYLES[o.style].benchHit : BENCH_HIT_MOVES;
  for (const n of list) {
    const c = contactOf(simulateMove(n, o), n, MV);
    rows.push({ n, reach: BENCH_AIR[n] ? airDistOf(n, o && o.style) : effReachOf(n, MV), hit: !!(c && c.hit), gap: c ? +c.gap.toFixed(1) : null, ok: contactGood(c) });
  }
  return rows;
}
