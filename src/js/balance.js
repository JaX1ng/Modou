'use strict';
/* 平衡报告（1.8.0；1.9.0 加了千斤坠、拳迎千斤坠 / 腿顶飞踢）：双击 balance.html 跑，大约三四分钟（2.6 起一帧四步）。不进游戏，只是开发时查平衡用。
   一、中立局「同时下决定」的收益矩阵 → 求均衡混合策略（博弈论里的纳什均衡，用遗憾匹配迭代）。
      每个选项 = 开局前 45 帧照计划按（出什么招 / 挡 / 跳 / 冲刺 / 跑过去…）；之后双方都按「好玩家」反应：
      打中就接连招、挡住 / 卸力后够得着就惩罚、踩腿 / 截拳这类反制有就用；看招再挡的人反应 REACT 帧。
      收益 = 打掉的血 - 掉的血 + 击倒 ±KD。
      看两样：均衡里每个选项占多少（某一项长期占一大半 = 太强）；「对随便出的对手平均赚多少」（越高越容易被滥用）。
   二、电脑（困难）对电脑（困难）打 40 回合，数每招用了几次、谁打出的击倒最多。
   2.0.2：闪身只躲得过重拳 —— 「挡住就闪身」（挡住拳再钻）没用了，换成「看招：重拳就闪身、别的挡」；闪过了自动回身肘、他踉跄，接短拳、短拳、重 */
const KD = 6, HORIZON = 210;
let REACT = 15;
const HAS = n => !!MOVES[n];
const tw = (me, op) => HOLD(op.x >= me.x ? 'right' : 'left');
const aw = (me, op) => HOLD(op.x >= me.x ? 'left' : 'right');
const effReach = n => MOVES[n].reach + (MOVES[n].lunge ? Math.max(0, MOVES[n].lunge[2]) : 0);
const KEY = a => a.startsWith('d:') ? DOWN_B | TAP(a.slice(2)) : TAP(a);
const DOWN_B = HOLD('down'), BLOCK_B = HOLD('block');

// 选项：plan(i, me, op, st) 返回这一帧的输入；route 打中后接的连招
const OPTIONS = {
  jab: { plan: (i) => i === 0 ? TAP('jab') : 0, route: ['jab', 'heavy'] },
  heavy: { plan: (i) => i === 0 ? TAP('heavy') : 0, route: ['kick'] },
  kick: { plan: (i) => i === 0 ? TAP('kick') : 0, route: ['heavy'] },
  sweep: { plan: (i) => i === 0 ? DOWN_B | TAP('kick') : 0, route: [] },
  lowJab: { plan: (i) => i <= 12 ? DOWN_B | (i === 0 ? TAP('jab') : 0) : 0, route: ['d:kick'] },
  palm: { plan: (i) => i === 0 ? DOWN_B | TAP('heavy') : 0, route: [] },
  grab: { plan: (i, me, op) => (i === 0 ? TAP('grab') : 0) | (i >= 3 && me.state === 'attack' && me.move && /grab|hold|grabHit/.test(me.move.name) ? aw(me, op) : 0), route: [] },
  lowGrab: { need: 'lowGrab', plan: (i) => i === 0 ? DOWN_B | TAP('grab') : 0, route: [] },
  block0: { plan: (i, me, op) => i < 45 ? BLOCK_B | (i < 2 ? tw(me, op) : 0) : 0, route: [], gc: true },
  block7: { plan: (i, me, op) => i >= 7 && i < 45 ? BLOCK_B : 0, route: [], gc: true },
  block11: { plan: (i, me, op) => i >= 11 && i < 45 ? BLOCK_B : 0, route: [], gc: true },
  cblock0: { plan: (i) => i < 45 ? BLOCK_B | DOWN_B : 0, route: [], gc: true },
  cblock8: { plan: (i) => i < 8 ? DOWN_B : i < 45 ? BLOCK_B | DOWN_B : 0, route: [], gc: true },
  jumpKick: { plan: (i, me, op, st) => {
    if (i === 0) return TAP('up') | tw(me, op);
    if (i < 4) return tw(me, op);
    if (me.state === 'air' && !me.airUsed && !st.fired && Math.abs(op.x - me.x) <= MOVES.airKick.reach + 6 && me.vz < 3) { st.fired = 1; return TAP('kick'); }
    return 0;
  }, route: [] },
  jumpHeavy: { plan: (i, me, op, st) => {
    if (i === 0) return TAP('up') | tw(me, op);
    if (i < 4) return tw(me, op);
    if (me.state === 'air' && !me.airUsed && !st.fired && Math.abs(op.x - me.x) <= MOVES.airHeavy.reach + 6 && me.vz < 3) { st.fired = 1; return TAP('heavy'); }
    return 0;
  }, route: [] },
  // 1.9.0 千斤坠：跳过去，离对手 50~150 时出；踩中落地接二起脚
  jumpDive: { plan: (i, me, op, st) => {
    if (i === 0) return TAP('up') | tw(me, op);
    if (i < 4) return tw(me, op);
    const d = Math.abs(op.x - me.x);
    if (me.state === 'air' && !me.airUsed && !st.fired && d >= 50 && d <= 150 && me.vz < 5) { st.fired = 1; return DOWN_B | TAP('kick'); }
    return 0;
  }, route: [] },
  dashJab: { plan: (i, me, op) => i === 0 || i === 2 ? tw(me, op) : i === 2 + DASH_CANCEL + 1 ? TAP('jab') : 0, route: ['jab', 'heavy'] },
  dashHeavy: { plan: (i, me, op) => i === 0 || i === 2 ? tw(me, op) : i === 2 + DASH_CANCEL + 1 ? TAP('heavy') : 0, route: ['kick'] },
  backDash: { plan: (i, me, op) => i === 0 || i === 2 ? aw(me, op) : 0, route: [] },
  wait: { plan: () => 0, route: [] },
  // 跑过去再出手（中距离走位：长腿、扫堂腿最擅长打这种）
  runJab: { plan: (i, me, op, st) => st.fired ? 0 : Math.abs(op.x - me.x) <= 90 ? (st.fired = 1, TAP('jab')) : tw(me, op), route: ['jab', 'heavy'] },
  runGrab: { plan: (i, me, op, st) => st.fired ? 0 : Math.abs(op.x - me.x) <= 78 ? (st.fired = 1, TAP('grab')) : tw(me, op), route: [] },
  runShoulder: { plan: (i, me, op, st) => st.fired ? 0 : (me.runT >= RUN_CHARGE + 1 && Math.abs(op.x - me.x) <= effReach('shoulder') - 6) ? (st.fired = 1, tw(me, op) | TAP('heavy')) : tw(me, op), route: [] },
  // 看招再挡（反应 REACT 帧）：看到对方的招朝我来就按格挡、高低挡对；按下那一下自带卸力窗口（慢招能卸力）
  reactBlock: { plan: (i, me, op, st) => reactDef(me, op, st, false), route: [], gc: true, react: true },
  // 看招再挡 + 对空：对方跳过来就托天掌
  reactAA: { plan: (i, me, op, st) => reactDef(me, op, st, true), route: [], gc: true, react: true },
  // 1.9.0 看招再挡 + 拳迎千斤坠：看见千斤坠就站着等，进了拳的射程出短拳（倒栽葱）；对方跳过来出飞踢就地上出腿顶回去
  reactPunch: { plan: (i, me, op, st) => reactDef(me, op, st, 'punch'), route: [], gc: true, react: true },
  // 2.0 闪身：一上来就按着挡朝对手双击，从他身边钻过去（躲过拳的话接短拳连招）
  slip: { plan: (i, me, op) => i < 3 ? BLOCK_B | (i === 1 ? 0 : tw(me, op)) : 0, route: [] },
  // 2.0.2 看招（反应 REACT 帧）：看见重拳朝我来就闪身钻过去（躲过了自动回身肘），别的招照样挡
  reactSlip: { plan: (i, me, op, st) => reactDef(me, op, st, 'slip'), route: [], gc: true, react: true },
  // 2.0 边挡边往后退
  gwalkBack: { plan: (i, me, op) => i < 45 ? BLOCK_B | aw(me, op) : 0, route: [], gc: true },
};
function reactDef(me, op, st, aa) {
  const h = op.history, s = h[Math.max(0, h.length - 1 - REACT)];
  if (!s) return 0;
  const dist = Math.abs(op.x - me.x);
  if (aa === 'punch') {
    if (s.name === 'dive' && s.atk) st.antiDive = 1;
    const om = op.move, diving = op.state === 'attack' && om && om.def.dive && !om.hit && !om.blocked;
    if (st.antiDive && diving && me.actionable()) {
      if (dist <= MOVES.jab.reach + 6 && op.alt <= DIVE_AA_ALT + 14) { st.antiDive = 0; return TAP('jab') | tw(me, op); }
      return tw(me, op);
    }
    if (s.name === 'airKick' && s.atk && !st.kickDone && dist >= 110 && dist <= 180 && me.actionable()) { st.kickDone = 1; return TAP('kick') | tw(me, op); }
  }
  if (aa === true && s.air && !s.atk && dist < 150 && op.alt > 20 && op.vz < 2 && me.actionable() && !st.aaDone) { st.aaDone = 1; return DOWN_B | TAP('heavy'); }
  if (s.atk && s.facing === (me.x >= op.x ? 1 : -1) && dist <= s.reach + 26) {
    // 2.0.2 看见的是重拳（闪身躲得过的那几招）、还来得及：闪身（按着挡朝他双击）
    if (aa === 'slip' && st.slipFor !== s.serial && me.actionable() && s.sLeft - REACT >= 1 && MOVES[s.name] && !MOVES[s.name].air && MOVES[s.name].tier === 'heavy' && MOVES[s.name].kind === 'heavy' && MOVES[s.name].height !== 'low') {
      st.slipFor = s.serial; st.slipSeq = [0, 1]; return BLOCK_B | tw(me, op);
    }
    if (!st.blockUntil || st.blockSerial !== s.serial) { st.blockSerial = s.serial; st.blockUntil = st.i + s.remain + 8; st.low = s.height === 'low'; }
  }
  if (st.blockUntil && st.i <= st.blockUntil) return BLOCK_B | (st.low ? DOWN_B : 0) | (st.i === st.blockUntil - 1 ? 0 : 0);
  return 0;
}

// 惩罚：挡住 / 看到对方空招收招时，挑够得着、来得及的最好的一招
function punisher(me, op, blockedByMe) {
  const m = op.move;
  let left;
  if (op.state === 'land' && op.landT > 4) left = op.landT - op.t;   // 1.9.0：空中招被挡 / 打空的落地硬直也打（以前漏了，千斤坠被挡算成不亏）
  else {
    if (op.state !== 'attack' || !m || m.def.script) return null;
    left = m.S + m.def.A + m.def.R + (m.pen || 0) - m.t;     // 对方还要多少帧才收完（2.1 含被挡住多出来的收招）
    if (m.t <= m.S + m.def.A) return null;                   // 还没进收招
  }
  const dist = Math.abs(op.x - me.x);
  const cands = [['heavy', ['kick']], ['jab', ['jab', 'heavy']], ['kick', ['heavy']], ['d:kick', []]];
  for (const [k, route] of cands) {
    const name = k === 'd:kick' ? 'sweep' : k;
    if (dist > effReach(name) - 4) continue;
    const need = MOVES[name].S + 1 + (blockedByMe ? 0 : REACT);
    if (left >= need) return [k, route];
  }
  return null;
}

function makeBot(opt, side) {
  const st = { i: 0, route: null, started: false, fired: 0, punished: -1 };
  const O = OPTIONS[opt];
  return () => {
    const me = side ? F2 : F1, op = me.opp, i = st.i++;
    let v = 0;
    // 2.0 闪身的双击（按着挡：按 → 松 → 按），挡住的硬直里也要按完
    if (st.slipSeq && st.slipSeq.length) { const k = st.slipSeq.shift(); return BLOCK_B | (k ? tw(me, op) : 0); }
    // 挡住踩腿 / 截拳（1.8.0）
    if (me.state === 'blockstun') {
      if (HAS('stomp') && me.stompReady && me.stompReady()) return DOWN_B | TAP('kick');
      if (HAS('jieQuan') && O.gc && me.qi >= GC_COST && op.move && op.state === 'attack') return TAP('heavy');
      return BLOCK_B | (me.lowBlock ? DOWN_B : 0);
    }
    // 2.0.2 闪身躲过了重拳：自动回身肘，他背对着踉跄 —— 能动了就接短拳、短拳、重（冲天炮）
    if (me.move && me.move.name === 'slipElbow' && me.move.hit && !st.elbowFollow) st.elbowFollow = 1;
    if (st.elbowFollow === 1 && me.actionable() && op.stagger) { st.elbowFollow = 2; st.route = ['jab', 'heavy']; return TAP('jab') | tw(me, op); }
    // 卸力成功：反打
    if (me.state === 'parry') { st.route = ['kick']; return TAP('heavy'); }
    // 千斤坠踩中：落地接二起脚（1.9.0）
    if (me.move && me.move.name === 'dive' && me.move.hit) st.diveFollow = 1;
    if (st.diveFollow && me.actionable()) { st.diveFollow = 0; return TAP('kick') | tw(me, op); }
    // 打中了：接连招
    if (me.state === 'attack' && me.move && me.move.hit && !me.move.def.script && st.route && st.route.length) {
      const k = st.route[0], kind = k.replace('d:', '');
      if (me.canCancel(kind)) { st.route.shift(); return KEY(k); }
      return st.route[0].startsWith('d:') ? DOWN_B : 0;
    }
    // 惩罚（对方落地硬直按落地那一刻算一次）
    const key = op.state === 'land' ? 'land' + op.clock : op.move && op.move.serial;
    if (me.actionable() && (op.move || op.state === 'land') && key !== st.punished && !(op.state === 'land' && st.landPunished === op.serial)) {
      const p = punisher(me, op, op.state === 'land' ? true : op.move.blocked);
      if (p) { st.punished = key; if (op.state === 'land') st.landPunished = op.serial; st.route = p[1].slice(); return KEY(p[0]) | tw(me, op); }
    }
    if (i < 45 || O.react) {
      v = O.plan(i, me, op, st);
      if (i === 0) st.route = O.route.slice();
    }
    return v;
  };
}

function simulate(a, b, dist, qi) {
  startMatch('pvp'); game.phase = 'fight'; game.paused = true;
  const mid = STAGE_W / 2;
  F1.x = mid - dist / 2; F2.x = mid + dist / 2; F1.facing = 1; F2.facing = -1;
  F1.qi = F2.qi = qi || 0;
  FX.length = 0; QI.length = 0;
  const b1 = makeBot(a, 0), b2 = makeBot(b, 1);
  let kd = [0, 0], was = [false, false];
  for (let t = 0; t < HORIZON; t++) {
    step([b1(), b2()]);
    for (const [k, F] of [[0, F1], [1, F2]]) { const d = F.state === 'down' || F.state === 'ko'; if (d && !was[k]) kd[k]++; was[k] = d; }
  }
  const d1 = MAX_HP - F1.hp, d2 = MAX_HP - F2.hp;
  return (d2 - d1) + KD * (kd[1] - kd[0]);
}

function solve(A, iters = 40000) {
  const n = A.length, m = A[0].length;
  const rr = new Array(n).fill(0), rc = new Array(m).fill(0), sr = new Array(n).fill(0), sc = new Array(m).fill(0);
  const strat = r => { const pos = r.map(x => Math.max(0, x)), s = pos.reduce((a, b) => a + b, 0); return s > 0 ? pos.map(x => x / s) : r.map(() => 1 / r.length); };
  for (let it = 0; it < iters; it++) {
    const p = strat(rr), q = strat(rc);
    const ur = A.map(row => row.reduce((s, x, j) => s + x * q[j], 0));
    const uc = A[0].map((_, j) => -A.reduce((s, row, i) => s + row[j] * p[i], 0));
    const vr = ur.reduce((s, x, i) => s + x * p[i], 0), vc = uc.reduce((s, x, j) => s + x * q[j], 0);
    for (let i = 0; i < n; i++) { rr[i] += ur[i] - vr; sr[i] += p[i]; }
    for (let j = 0; j < m; j++) { rc[j] += uc[j] - vc; sc[j] += q[j]; }
  }
  const P = sr.map(x => x / iters), Q = sc.map(x => x / iters);
  const val = A.reduce((s, row, i) => s + row.reduce((t, x, j) => t + x * P[i] * Q[j], 0), 0);
  return { P, Q, val };
}

function runBalance(opts) {
  opts = opts || {};
  if (opts.react) REACT = opts.react;
  if (opts.patch) (0, eval)(opts.patch);          // 试改数值：比如 "MOVES.sweep.S = 10"
  if (opts.only) for (const k of Object.keys(OPTIONS)) if (!opts.only.includes(k)) delete OPTIONS[k];
  if (opts.drop) for (const k of opts.drop) delete OPTIONS[k];
  const names = Object.keys(OPTIONS).filter(k => !OPTIONS[k].need || HAS(OPTIONS[k].need));
  const dists = opts.dists || [70, 95, 120, 145, 175, 210];
  const out = { names, dists, rows: [] };
  const avg = Object.fromEntries(names.map(n => [n, 0])), navg = Object.fromEntries(names.map(n => [n, 0]));
  for (const d of dists) {
    const A = names.map(a => names.map(b => simulate(a, b, d, opts.qi)));
    const { P, Q, val } = solve(A);
    const mix = names.map((n, i) => [n, (P[i] + Q[i]) / 2]).sort((x, y) => y[1] - x[1]);
    for (const [n, w] of mix) avg[n] += w / dists.length;
    // 对「随便出」的对手（所有选项等概率）平均能赚多少：越高 = 越容易被滥用
    const naive = names.map((n, i) => [n, A[i].reduce((s, x) => s + x, 0) / names.length]).sort((x, y) => y[1] - x[1]);
    for (const [n, v] of naive) navg[n] += v / dists.length;
    out.rows.push({ d, val, mix: mix.filter(x => x[1] >= 0.01).map(([n, w]) => n + ' ' + (w * 100).toFixed(0) + '%'),
      naive: naive.slice(0, 6).map(([n, v]) => n + ' ' + v.toFixed(1)), A: opts.full ? A : undefined });
  }
  out.navg = Object.entries(navg).sort((x, y) => y[1] - x[1]).map(([n, v]) => n + ' ' + v.toFixed(1));
  out.avg = Object.entries(avg).sort((x, y) => y[1] - x[1]).map(([n, w]) => n + ' ' + (w * 100).toFixed(1) + '%');
  return out;
}
window.runBalance = runBalance;
window.simulate = simulate;
window.OPTIONS_LIST = () => Object.keys(OPTIONS);

/* 三、起身攻防（2.0）：一方被扫堂腿打倒以后，双方各按一种打法打 200 帧。
   压的一方（A）：站到他跟前，算好时机出短拳 / 擒拿 / 重拳（压在起身硬直头一两帧；出手那会儿还看不清他滚不滚）、
     赌他往后滚（他一起身就冲过去，到了再出拳，不看）、看清他怎么起再打（反应 REACT 帧：原地起就短拳，滚到身后就转身打，往后滚就冲过去追）、
     站着等（挡住了再反打）；
   起来的一方（B）：原地起身后挡 / 蹲挡 / 起来就出拳，往对手那边滚（从他脚下滚到身后）/ 往后滚。
   双方看到对面招打空了在收招，够得着、来得及（加反应）就惩罚；打中了接连招。
   收益 = 倒地以后 A 打掉的血 - B 打掉的血 + 击倒 ±KD。倒地的意义：均衡里 A 应该赚（起身被动），但不该哪一招必赚（不然起身就没得玩） */
const OKI_A = {
  meatyJab: { key: 'jab' }, meatyGrab: { key: 'grab' }, meatyHeavy: { key: 'heavy' },
  guessRoll: { key: 'jab', guess: true }, reactHit: { key: 'jab', react: true }, waitBlock: { wait: true },
};
const OKI_B = {
  standBlock: { after: () => BLOCK_B }, crouchBlock: { after: () => BLOCK_B | DOWN_B }, wakeJab: { after: (me, op, st) => st.j++ < 2 ? TAP('jab') : BLOCK_B },
  rollTo: { roll: 1, after: () => BLOCK_B }, rollAway: { roll: -1, after: () => BLOCK_B },
};
const OKI_GAP = 62;                                                     // 压的人站在离他这么远的地方等他起来
const OKI_ROUTE = { jab: ['jab', 'heavy'], heavy: ['kick'], grab: [] };
// 起身的人还要几帧进起身硬直（滚身起也一样算）；在起身硬直里 = 0
const toRise = F => F.state === 'down' ? (F.downPhase === 'getup' ? GETUP - F.t : F.downPhase === 'lie' ? F.lieT - F.t + GETUP : 99) : F.state === 'rise' ? 0 : -1;
// 打中了接连招；对面招打空了在收招就惩罚（看到要反应）
function okiFollow(me, op, st) {
  if (me.state === 'attack' && me.move && me.move.hit && !me.move.def.script && st.route && st.route.length) {
    const k = st.route[0]; if (me.canCancel(k)) { st.route.shift(); return TAP(k); } return 0;
  }
  if (me.actionable() && op.move && op.move.serial !== st.punished) {
    const p = punisher(me, op, !!op.move.blocked);
    if (p) { st.punished = op.move.serial; st.route = p[1].slice(); return KEY(p[0]) | tw(me, op); }
  }
  return null;
}
function okiBot(opt, me, op) {
  const O = OKI_A[opt], st = { i: 0, fired: false, route: null, spot: op.x, upAt: -1, dashAt: -1, punished: -1 };
  const S = O.key ? MOVES[O.key].S : 0;
  const dashing = () => me.state === 'attack' && me.move && me.move.name === 'dash';
  const fire = () => { st.fired = true; st.route = OKI_ROUTE[O.key].slice(); return TAP(O.key); };
  return () => {
    const i = st.i++, left = toRise(op);
    if (st.upAt < 0 && op.state === 'down' && op.downPhase === 'getup') st.upAt = i;   // 他开始起身了（滚不滚、往哪滚要反应 REACT 帧才看清）
    const seen = st.upAt >= 0 && i - st.upAt >= REACT;
    const f = okiFollow(me, op, st); if (f !== null) return f;
    // 冲过去：双击方向（按 → 松 → 按），冲刺里到了时机再出拳（冲刺第 DASH_CANCEL 帧起能直接出招）
    if (st.dashAt >= 0 && i - st.dashAt <= 2) return i - st.dashAt === 1 ? 0 : HOLD(st.dashDir > 0 ? 'right' : 'left');
    if (!st.fired && dashing()) return me.move.t >= DASH_CANCEL && left <= S && (left > 0 || Math.abs(op.x - me.x) <= MOVES[O.key].reach + 6) ? fire() : 0;
    if (me.state === 'blockstun') return BLOCK_B;
    if (!me.actionable()) return 0;
    if (O.wait || st.fired) return left > 30 && Math.abs(op.x - me.x) > 80 ? tw(me, op) : BLOCK_B;   // 站着等 / 出完了：挡
    // 他还躺着：走到他跟前 OKI_GAP 站好
    const gap = Math.abs(st.spot - me.x);
    if (st.upAt < 0 && gap > OKI_GAP + 4) return HOLD(st.spot >= me.x ? 'right' : 'left');
    if (O.guess) {                                                      // 赌他往后滚：他一起身就冲（不看）
      if (st.upAt === i) { st.dashAt = i; st.dashDir = st.spot >= me.x ? 1 : -1; return HOLD(st.dashDir > 0 ? 'right' : 'left'); }
      return st.upAt >= 0 && left <= S ? fire() : 0;
    }
    if (O.react) {                                                      // 看清了再打：够得着就出拳（自动朝向他），够不着就冲过去
      if (!seen) return 0;
      const d = Math.abs(op.x - me.x);
      if (d <= MOVES[O.key].reach - 2) return fire();
      st.dashAt = i; st.dashDir = op.x >= me.x ? 1 : -1; return HOLD(st.dashDir > 0 ? 'right' : 'left');
    }
    return left >= 0 && left <= S ? fire() : 0;                        // 压起身：出招打在起身硬直头一帧
  };
}
function riserBot(opt, me, op) {
  const O = OKI_B[opt], st = { j: 0, route: null, punished: -1 };
  return () => {
    if (me.state === 'down') return O.roll ? HOLD((op.x >= me.x) === (O.roll > 0) ? 'right' : 'left') : 0;   // 滚身起：倒着就按住方向
    const f = okiFollow(me, op, st); if (f !== null) return f;
    if (me.state === 'blockstun') return BLOCK_B | (me.lowBlock ? DOWN_B : 0);
    return me.actionable() ? O.after(me, op, st) : 0;
  };
}
function simulateOki(a, b, trace) {
  startMatch('pvp'); game.phase = 'fight'; game.paused = true;
  const mid = STAGE_W / 2;
  F1.x = mid - 45; F2.x = mid + 45; F1.facing = 1; F2.facing = -1; FX.length = 0; QI.length = 0;
  for (let i = 0; i < 40 && F2.state !== 'down'; i++) step([i === 0 ? DOWN_B | TAP('kick') : 0, 0]);   // 先扫倒
  const hp1 = F1.hp, hp2 = F2.hp, A = okiBot(a, F1, F2), B = riserBot(b, F2, F1);
  let kd = [0, 0], was = [false, true];
  for (let t = 0; t < 200; t++) {
    const ia = A(), ib = B();
    step([ia, ib]);
    if (trace) trace.push(`${t} A${ia} ${F1.state}${F1.move ? '/' + F1.move.name + ':' + F1.move.t + (F1.move.hit ? 'H' : F1.move.blocked ? 'B' : '') : ''} x${F1.x.toFixed(0)} hp${F1.hp} | B${ib} ${F2.state}${F2.downPhase ? '/' + F2.downPhase : ''}${F2.move ? '/' + F2.move.name + ':' + F2.move.t : ''} t${F2.t} x${F2.x.toFixed(0)} hp${F2.hp}`);
    for (const [k, F] of [[0, F1], [1, F2]]) { const d = F.state === 'down' || F.state === 'ko'; if (d && !was[k]) kd[k]++; was[k] = d; }
  }
  return ((hp2 - F2.hp) - (hp1 - F1.hp)) + KD * (kd[1] - kd[0]);
}
function runOki() {
  const as = Object.keys(OKI_A), bs = Object.keys(OKI_B);
  const A = as.map(a => bs.map(b => simulateOki(a, b)));
  const { P, Q, val } = solve(A, 20000);
  return { as, bs, A, val, P, Q };
}
window.runOki = runOki; window.simulateOki = simulateOki;

// 报告里选项的中文名
const OPT_NAME = { jab: '短拳', heavy: '重拳', kick: '腿踢', sweep: '扫堂腿', lowJab: '下盘拳', palm: '托天掌', grab: '擒拿', lowGrab: '抄腿',
  block0: '站挡', block7: '站挡·第7帧按（卸力）', block11: '站挡·第11帧按（卸力）', cblock0: '蹲挡', cblock8: '蹲挡·第8帧按（卸力）',
  jumpKick: '跳起飞踢', jumpHeavy: '跳起泰山压顶', jumpDive: '跳起千斤坠', reactPunch: '看招再挡+拳迎千斤坠', dashJab: '冲刺短拳', dashHeavy: '冲刺重拳', backDash: '往后冲', wait: '不动',
  runJab: '跑过去短拳', runGrab: '跑过去擒拿', runShoulder: '铁山靠', reactBlock: '看招再挡', reactAA: '看招再挡+对空',
  slip: '闪身', reactSlip: '看招：重拳闪身、别的挡', gwalkBack: '边挡边退',
  meatyJab: '压起身·短拳', meatyGrab: '压起身·擒拿', meatyHeavy: '压起身·重拳', guessRoll: '赌他往后滚·冲过去打', reactHit: '看清怎么起再打', waitBlock: '站着等',
  standBlock: '原地起·站挡', crouchBlock: '原地起·蹲挡', wakeJab: '原地起·出拳', rollTo: '往对手那边滚', rollAway: '往后滚' };
const zh = list => list.map(t => { const i = t.lastIndexOf(' '); return (OPT_NAME[t.slice(0, i)] || t.slice(0, i)) + ' ' + t.slice(i + 1); });
// 电脑对打统计：每招用了几次、打中几次、击倒来自哪招、各种加成出现几次
function aiStats(lv, rounds) {
  const use = {}, kd = {}, lab = {};
  startMatch('pvp'); game.brains = [new Brain(F1, lv), new Brain(F2, lv)]; game.endless = true;
  let r = 0, frames = 0, prevPhase = game.phase;
  const seen = [-1, -1], wasDown = [false, false], lastInfo = [null, null];
  while (r < rounds && frames < 600000) {
    step([0, 0]); frames++;
    for (const [i, F] of [[0, F1], [1, F2]]) {
      if (F.move && F.move.serial !== seen[i]) { seen[i] = F.move.serial; use[F.move.def.label] = (use[F.move.def.label] || 0) + 1; }
      if (F.info && F.info !== lastInfo[i] && F.info.how && F.info.dmg > 0 && F.info.how !== '被挡') {
        lastInfo[i] = F.info;
        for (const w of ['挡后反击', '卸力反击', '破绽', '破招', '克', '迎击']) if (F.info.how.includes(w)) lab[w] = (lab[w] || 0) + 1;
      }
      const o = F.opp, d = o.state === 'down' || o.state === 'ko';
      if (d && !wasDown[1 - i]) { const n = F.info ? F.info.label : '?'; kd[n] = (kd[n] || 0) + 1; }
      wasDown[1 - i] = d;
    }
    if (game.phase === 'roundEnd' && prevPhase !== 'roundEnd') r++;        // 2.6：phaseT 一步走 1/4 帧，不一定正好等于 1，按「刚进 roundEnd」数
    prevPhase = game.phase;
    if (game.phase === 'over') { game.wins = [0, 0]; startRound(); }
  }
  const top = (o, n) => { const t = Object.values(o).reduce((a, b) => a + b, 0); return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${(v / t * 100).toFixed(0)}%`).join(' · '); };
  return { rounds: r, frames, use: top(use, 14), kd: top(kd, 10), bonus: Object.entries(lab).map(([k, v]) => k + ' ' + v).join(' · ') };
}
window.aiStats = aiStats;

// 页面：打开 balance.html 自动跑
if (document.getElementById('out')) {
  const out = document.getElementById('out');
  const say = t => { out.textContent += t + '\n'; };
  say(`墨斗 ${VERSION} 平衡报告（跑完大约三四分钟）\n`);
  setTimeout(() => {
    const r = runBalance({ qi: 30 });
    say('一、中立局均衡（每一行：两人相距多远 → 均衡里各选项占比）');
    for (const row of r.rows) say(`  相距 ${row.d}：${zh(row.mix).join(' · ')}\n      对随便出的对手最赚：${zh(row.naive).join(' · ')}`);
    say('  各距离平均占比：' + zh(r.avg.slice(0, 12)).join(' · '));
    say('  对随便出的对手平均赚：' + zh(r.navg.slice(0, 12)).join(' · '));
    const o = runOki(), pct = (n, w) => zh([n + ' ' + (w * 100).toFixed(0) + '%'])[0];
    say('\n三、起身攻防（扫堂腿打倒以后，压的人 vs 起来的人，每格 = 压的人赚多少）');
    say('  ' + ['', ...o.bs.map(b => OPT_NAME[b])].join(' ｜ '));
    o.as.forEach((a, i) => say('  ' + [OPT_NAME[a], ...o.A[i].map(v => (v > 0 ? '+' : '') + v)].join(' ｜ ')));
    say(`  均衡：压的人平均赚 ${o.val.toFixed(1)}；压的人用 ${o.as.map((a, i) => pct(a, o.P[i])).filter(t => !/ 0%$/.test(t)).join(' · ')}；起来的人用 ${o.bs.map((b, j) => pct(b, o.Q[j])).filter(t => !/ 0%$/.test(t)).join(' · ')}`);
    setTimeout(() => {
      const a = aiStats('hard', 40);
      say(`\n二、电脑（困难）对打 ${a.rounds} 回合（${Math.round(a.frames / 60)} 秒）`);
      say('  用得最多：' + a.use); say('  击倒来自：' + a.kd); say('  加成出现次数：' + a.bonus);
      startAttract();
      window.__done = true;
    }, 30);
  }, 30);
}
