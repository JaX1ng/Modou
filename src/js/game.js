'use strict';
/* 游戏流程：两个角色、回合（开场→对战→KO 慢动作→回合结算→整场结束）、每帧 step(inputs)
   step 只吃「两个整数输入」，同样的输入序列一定算出同样的结果（联机和测试都靠这一点） */

/* ---------- 人物颜色（只是外观，不进战斗逻辑）。存在浏览器 localStorage「modou.looks」 ----------
   solo：人机 / 打桩 / 联机时自己的颜色、电脑的颜色（'random' = 每局随机挑一个和你不一样的）；pvp：双人对战两边上次选的 */
const Looks = {
  solo: { me: 'ink', cpu: 'random' }, pvp: ['ink', 'indigo'],
  load() {
    try {
      const v = JSON.parse(localStorage.getItem('modou.looks') || 'null') || {};
      if (v.solo && lookOf(v.solo.me)) this.solo.me = v.solo.me;
      if (v.solo && (v.solo.cpu === 'random' || lookOf(v.solo.cpu))) this.solo.cpu = v.solo.cpu;
      if (Array.isArray(v.pvp) && lookOf(v.pvp[0]) && lookOf(v.pvp[1]) && v.pvp[0] !== v.pvp[1]) this.pvp = v.pvp.slice(0, 2);
    } catch (e) {}
    if (this.solo.cpu === this.solo.me) this.solo.cpu = 'random';
  },
  save() { try { localStorage.setItem('modou.looks', JSON.stringify({ solo: this.solo, pvp: this.pvp })); } catch (e) {} },
};
Looks.load();
function cpuLook() {
  const me = Looks.solo.me, c = Looks.solo.cpu;
  if (c !== 'random' && c !== me && lookOf(c)) return c;
  const rest = PALETTE.filter(p => p.id !== me);
  return rest[(Math.random() * rest.length) | 0].id;
}
function applyLooks(mode) {
  if (mode === 'pvp') { F1.setLook(Looks.pvp[0]); F2.setLook(Looks.pvp[1]); }
  else if (mode === 'online') { F1.setLook(Net.looks.h); F2.setLook(Net.looks.g); }
  else { F1.setLook(Looks.solo.me); F2.setLook(cpuLook()); }
  if (mode === 'train') F2.name = '桩';
}

const START_X = [STAGE_W / 2 - START_GAP / 2, STAGE_W / 2 + START_GAP / 2];
const F1 = new Fighter(0, { look: 'ink', x: START_X[0], facing: 1 });
const F2 = new Fighter(1, { look: 'indigo', x: START_X[1], facing: -1 });
F1.opp = F2; F2.opp = F1;

const game = {
  mode: 'attract',          // attract（菜单背景电脑互打）| pve | pvp | online | train（训练场，2.0.2 以前叫打桩练习）
  phase: 'attract',         // attract | intro | fight | ko | roundEnd | over
  diff: 'normal', p: [F1, F2], brains: [null, null],
  frame: 0, freeze: 0, shake: 0, flash: 0, punch: 0, timeScale: 1,
  quiet: false,             // 联机回滚重算时为 true：不出特效、不出声（1.9.0）
  round: 1, wins: [0, 0], timer: ROUND_FRAMES, phaseT: 0, paused: false, winner: -1,
  endless: false,           // 双人对战不限时，打到一方倒下为止
  dummyMode: 'stand', trainQi: false,   // 打桩：木桩动作、无限气
};
// 2.1：「地狱」改叫「极难」（id 还是 hell）；2.2：五档都是两个字 —— 入门 / 简单 / 中等 / 困难 / 终极（ai.js LEVEL_NAME）
const LABEL = Object.fromEntries(Object.entries(LEVEL_NAME).map(([id, n]) => [id, '电脑 · ' + n]));
const Hooks = { matchStart() {}, matchOver() {} };   // ui.js 会覆盖

function resetFighters() {
  F1.reset(START_X[0], 1); F2.reset(START_X[1], -1);
  game.freeze = 0; game.timeScale = 1;
  if (game.quiet) return;                      // 联机回滚重算时不动画面（特效、镜头）
  FX.length = 0; QI.length = 0; splats = [];
  game.shake = 0; game.flash = 0;
  if (typeof camX !== 'undefined') { camX = STAGE_W / 2; camZ = ZOOM; }
}
function startAttract() {
  game.mode = 'attract'; game.phase = 'attract'; game.phaseT = 0; game.paused = false; game.endless = false;
  game.brains = [new Brain(F1, 'normal'), new Brain(F2, 'normal')];
  F1.label = ''; F2.label = ''; F2.maxHp = MAX_HP; applyLooks('attract');
  resetFighters();
}
function startMatch(mode) {
  Sound.init();
  if (typeof Drill !== 'undefined' && Drill.cur) { Drill.cur = null; CEV.on = null; }   // 2.1 换模式 / 重开：破招练习那一课结束
  game.mode = mode;
  game.endless = mode === 'pvp' || mode === 'train';
  const train = mode === 'train';
  F2.maxHp = train ? DUMMY_HP : MAX_HP; applyLooks(mode);
  game.brains = mode === 'pve' ? [null, makeBrain(F2, game.diff)] : train ? [null, new Dummy(F2, game.dummyMode)] : [null, null];
  if (mode === 'pve') { F1.label = '玩家'; F2.label = LABEL[game.diff]; }
  else if (train) { F1.label = '练习'; F2.label = '木桩'; }
  else if (mode === 'pvp') { F1.label = '玩家一'; F2.label = '玩家二'; }
  else { const host = Net.role === 'host'; F1.label = host ? '你' : '对手'; F2.label = host ? '对手' : '你'; }
  game.wins = [0, 0]; game.round = 1; game.paused = false; game.frame = 0; FXREC.log.clear();
  for (const p of pads) p.clear();
  startRound();
  if (train) game.phase = 'fight';             // 2.2（Jack：训练场不是「第一回合」，进去直接开始，不要「第一回合」「战」这些开场字）
  Hooks.matchStart();
}
function startRound() {
  resetFighters();
  game.phase = 'intro'; game.phaseT = 0; game.timer = ROUND_FRAMES; game.winner = -1;
}
function endRound(winner, reason) {
  game.phase = 'ko'; game.phaseT = 0; game.winner = winner;
  if (reason === 'time') announce('时间到', null, 80, 110);
  else if (winner === -1) announce('两败俱伤', null, 80, 100);
  else { announce('胜负已分', null, 80, 110, game.p[winner]); Sound.gong(); }
}

function step(inputs) {
  game.frame++;
  const [a, b] = game.p;
  const locked = game.phase !== 'fight' && game.phase !== 'attract';
  for (let i = 0; i < 2; i++) {
    if (game.brains[i]) game.brains[i].tick(locked);
    else applyInput(game.p[i], inputs ? inputs[i] | 0 : 0);
  }
  const frozen = game.freeze > 0;
  if (frozen) game.freeze--;
  else {
    a.update(locked); b.update(locked);
    // 朝向吸附（1.9.0）：不按左右的时候（站、蹲、挡）自动面向对手，不管远近；在判定之前做，对手刚绕到身后这一帧就转过来
    for (const F of game.p) if (F.actionable() && !F.inp.held.left && !F.inp.held.right) F.autoFace();
    resolve(a, b);
    separate(a, b);
    a.record(); b.record();
  }
  if (!game.quiet) {                 // 联机回滚重算时只算胜负，不动画面
    a.keepPrev(); b.keepPrev();      // 2.0.1 上一帧的样子（画面插值用）
    a.animate(frozen); b.animate(frozen);
    for (const F of game.p) {
      if (F.lagHp > F.hp) F.lagHp = Math.max(F.hp, F.lagHp - (F.state === 'hit' || frozen ? 0.05 : 0.6) * F.maxHp / 100);
      else F.lagHp = F.hp;
    }
    updateFx();
    game.shake *= 0.86; game.flash *= 0.84; game.punch *= 0.8;
  }

  switch (game.phase) {
    case 'attract':
      if (a.hp <= 0 || b.hp <= 0) { if (++game.phaseT > 130) { resetFighters(); game.phaseT = 0; } }
      break;
    case 'intro':
      // 2.3（Jack：开场字幕加锣鼓）：「八 大 仓」—— 回合名随着「仓」砸下来；战鼓越敲越密；「战」的时候大仓（fx.js LUOGU_INTRO）
      luoguIntro(game.phaseT, roundName() === '决胜局');
      if (game.phaseT === 10) announce(roundName(), null, 56, 96);
      if (game.phaseT === 68) announce('战', null, 38, 170);
      if (++game.phaseT >= 100) { game.phase = 'fight'; game.phaseT = 0; }
      break;
    case 'fight':
      if (game.mode === 'train') { trainTick(); break; }
      if (a.hp <= 0 || b.hp <= 0) endRound(a.hp <= 0 && b.hp <= 0 ? -1 : a.hp <= 0 ? 1 : 0, 'ko');
      else if (!game.endless && --game.timer <= 0) { game.timer = 0; endRound(a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1, 'time'); }
      break;
    case 'ko':
      game.timeScale = game.phaseT < 40 && !reduceMotion ? 0.3 : 1;
      if (++game.phaseT >= 120) {
        game.timeScale = 1; game.phase = 'roundEnd'; game.phaseT = 0;
        if (game.winner >= 0) {
          game.wins[game.winner]++;
          const Wf = game.p[game.winner];
          if (Wf.actionable() || Wf.state === 'land') Wf.state = 'win';
          announce(`${Wf.name} 胜`, game.wins[game.winner] >= WIN_ROUNDS ? '' : `${game.wins[0]} : ${game.wins[1]}`, 100, 120, Wf);   // 赢的人的颜色
        } else announce('平局', '本回合重打', 100, 120);
      }
      break;
    case 'roundEnd': {
      const Wf = game.winner >= 0 ? game.p[game.winner] : null;
      if (Wf && (Wf.actionable() || Wf.state === 'land')) Wf.state = 'win';
      if (++game.phaseT >= 110) {
        if (game.wins[0] >= WIN_ROUNDS || game.wins[1] >= WIN_ROUNDS) { game.phase = 'over'; game.phaseT = 0; Hooks.matchOver(); }
        else { if (game.winner >= 0) game.round++; startRound(); }
      }
      break;
    }
    case 'over': {
      const Wf = game.p[game.wins[0] >= WIN_ROUNDS ? 0 : 1];
      if (Wf.actionable() || Wf.state === 'land') Wf.state = 'win';
      break;
    }
  }
}
// 打桩：木桩掉到三成以下、这一套打完就回满；玩家掉血也回满；可选无限气
function trainTick() {
  const [a, b] = game.p;
  if (b.hp <= b.maxHp * DUMMY_REFILL && (b.actionable() || b.hp <= 0)) {
    if (b.state === 'ko') { b.state = 'idle'; b.downPhase = null; }
    b.hp = b.lagHp = b.maxHp; tag(b.x, FLOOR - 170, '回满', b, 26);
  }
  if (a.hp < a.maxHp && a.actionable()) a.hp = a.lagHp = a.maxHp;
  if (game.trainQi) a.qi = QI_MAX;
  Drill.tick();                    // 2.1 破招练习：这一遍的计时、判成没成功
}
// 五局三胜：两边都差一局就赢 = 决胜局
function roundName() {
  if (game.wins[0] === WIN_ROUNDS - 1 && game.wins[1] === WIN_ROUNDS - 1) return '决胜局';
  return `第${'一二三四五六七八九'[game.round - 1] || game.round}回合`;
}

/* ---------- 存档 / 读档（1.9.0 联机回滚用） ----------
   只存影响胜负的：两个角色身上的逻辑字段（新加的字段自动跟着存）+ 回合流程。
   画面上的东西（骨骼 J、姿势、发带、残影、特效、气、挨打白闪、血条缓降）、AI 的记录不存 —— 读档后下一帧画面自己会跟上 */
const SNAP_SKIP = new Set(['opp', 'inp', 'disp', 'tgt', 'J', 'vp', 'ribbons', 'trail', 'ghosts', 'history', 'info', 'prevCombo', 'qiGlow', 'heat',
  'hitFlash', 'hitShake', 'hipY', 'lastStep', 'walkPhase', 'carryRot', 'lagHp', 'lieKind', 'gwalk', 'qx', 'qlean', 'ikS']);
const copyVal = v => Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? Object.assign({}, v) : v;
function saveFighter(F) {
  const o = {};
  for (const k of Object.keys(F)) if (!SNAP_SKIP.has(k)) o[k] = copyVal(F[k]);
  o.inp = { held: Object.assign({}, F.inp.held), buf: F.inp.buf.map(e => Object.assign({}, e)) };
  return o;
}
function loadFighter(F, o) {
  for (const k of Object.keys(F)) if (!SNAP_SKIP.has(k) && !(k in o)) delete F[k];   // 存档之后才加上的字段去掉
  for (const k of Object.keys(o)) if (k !== 'inp') F[k] = copyVal(o[k]);
  Object.assign(F.inp.held, o.inp.held); F.inp.buf = o.inp.buf.map(e => Object.assign({}, e));
}
const GAME_KEYS = ['frame', 'freeze', 'phase', 'phaseT', 'round', 'timer', 'winner', 'timeScale'];
function saveState() {
  const g = {}; for (const k of GAME_KEYS) g[k] = game[k];
  g.wins = game.wins.slice();
  return { g, f: [saveFighter(F1), saveFighter(F2)] };
}
function loadState(s) {
  for (const k of GAME_KEYS) game[k] = s.g[k];
  game.wins = s.g.wins.slice();
  loadFighter(F1, s.f[0]); loadFighter(F2, s.f[1]);
}

// 状态指纹：联机时两边定期比对，测试里用来检查「同样输入 → 同样结果」
function stateHash() {
  const s = [game.round, game.timer, game.phase, game.wins[0], game.wins[1], game.freeze];
  for (const F of game.p) s.push(F.hp, F.x.toFixed(3), F.alt.toFixed(3), F.state, F.move ? F.move.name + ':' + F.move.t : '-', F.stunT, F.slowJab, F.qi, F.comboTaken, F.runT, F.facing, F.vx.toFixed(3),
    F.grabbed ? 1 : 0, F.rollDir, F.guardOn, F.stompFor, F.move && F.move.pick || '', F.slipGot ? 1 : 0, F.stagger ? 1 : 0, F.t);
  const str = s.join('|');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
