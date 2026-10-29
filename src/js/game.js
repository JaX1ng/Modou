'use strict';
/* 游戏流程：两个角色、回合（开场→对战→KO 慢动作→回合结算→整场结束）、每帧 step(inputs)
   step 只吃「两个整数输入」，同样的输入序列一定算出同样的结果（联机和测试都靠这一点） */

/* ---------- 人物颜色（只是外观，不进战斗逻辑）。存在浏览器 localStorage「modou.looks」 ----------
   solo：人机 / 训练场 / 联机时自己的颜色、电脑的颜色（'random' = 每局随机挑一个和你不一样的）；pvp：双人对战两边上次选的；
   watch（2.11 观战）：两个电脑上次选的。2.11 起都在进了模式以后的准备页里选（ui.js「准备页」），菜单上不再有 */
const Looks = {
  solo: { me: 'ink', cpu: 'random' }, pvp: ['ink', 'indigo'], watch: ['ink', 'vermil'],
  load() {
    const pair = v => Array.isArray(v) && lookOf(v[0]) && lookOf(v[1]) && v[0] !== v[1];
    try {
      const v = JSON.parse(localStorage.getItem('modou.looks') || 'null') || {};
      if (v.solo && lookOf(v.solo.me)) this.solo.me = v.solo.me;
      if (v.solo && (v.solo.cpu === 'random' || lookOf(v.solo.cpu))) this.solo.cpu = v.solo.cpu;
      if (pair(v.pvp)) this.pvp = v.pvp.slice(0, 2);
      if (pair(v.watch)) this.watch = v.watch.slice(0, 2);
    } catch (e) {}
    if (this.solo.cpu === this.solo.me) this.solo.cpu = 'random';
  },
  save() { try { localStorage.setItem('modou.looks', JSON.stringify({ solo: this.solo, pvp: this.pvp, watch: this.watch })); } catch (e) {} },
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
  else if (mode === 'watch') { F1.setLook(Looks.watch[0]); F2.setLook(Looks.watch[1]); }
  else if (mode === 'online') { F1.setLook(Net.looks.h); F2.setLook(Net.looks.g); }
  else { F1.setLook(Looks.solo.me); F2.setLook(cpuLook()); }
  if (mode === 'train') F2.name = '桩';
}
/* ---------- 2.9 拳派（传统格斗 / 咏春拳；2.9 咏春拳叫「迎春拳」，id 'ying'，2.10 改 'wc'）：进战斗逻辑（招式表、架势、按键语法全按拳派走），开打前定好。存在 localStorage「modou.styles」 ----------
   solo：人机 / 训练场 / 联机时自己的拳派、电脑的拳派（'random' = 每局随机）；pvp：双人对战两边上次选的；watch（2.11 观战）：两个电脑的。
   训练场的木桩：dummy（2.11 训练场准备页里选；以前跟着电脑的拳派走）；破招练习两边都是传统格斗（练的就是破传统格斗的招）。
   菜单背景里两个电脑互打：每次随机 */
const STYLE_IDS = ['trad', 'wc'];
const styleOk = id => STYLE_IDS.includes(id);
const Styles = {
  solo: { me: 'trad', cpu: 'random' }, pvp: ['trad', 'trad'], watch: ['trad', 'wc'], dummy: 'trad',
  load() {
    const pair = v => Array.isArray(v) && styleOk(v[0]) && styleOk(v[1]);
    try {
      const v = JSON.parse((localStorage.getItem('modou.styles') || 'null').replace(/"ying"/g, '"wc"')) || {};
      if (v.solo && styleOk(v.solo.me)) this.solo.me = v.solo.me;
      if (v.solo && (v.solo.cpu === 'random' || styleOk(v.solo.cpu))) this.solo.cpu = v.solo.cpu;
      if (pair(v.pvp)) this.pvp = v.pvp.slice(0, 2);
      if (pair(v.watch)) this.watch = v.watch.slice(0, 2);
      if (styleOk(v.dummy)) this.dummy = v.dummy;
      else if (v.solo && styleOk(v.solo.cpu)) this.dummy = v.solo.cpu;     // 2.11 以前木桩跟着电脑的拳派
    } catch (e) {}
  },
  save() { try { localStorage.setItem('modou.styles', JSON.stringify({ solo: this.solo, pvp: this.pvp, watch: this.watch, dummy: this.dummy })); } catch (e) {} },
};
Styles.load();
// 2.11 准备页（ui.js）：这个模式上次选的 —— 场景、两边的颜色和拳派（人机：你、电脑；训练场：你、木桩的拳派；双人、观战：两边）、难度。
// 人机、训练场、联机里「你」是同一份；场景人机、双人、观战共用一份（训练场固定练武场）。点「开始」才 savePicks 存
function picksFor(mode) {
  return {
    mode, stage: Stage.pref, diff: game.diff,
    looks: mode === 'pvp' ? Looks.pvp.slice() : mode === 'watch' ? Looks.watch.slice() : [Looks.solo.me, Looks.solo.cpu],
    styles: mode === 'pvp' ? Styles.pvp.slice() : mode === 'watch' ? Styles.watch.slice() : mode === 'train' ? [Styles.solo.me, Styles.dummy] : [Styles.solo.me, Styles.solo.cpu],
  };
}
function savePicks(p) {
  const m = p.mode;
  if (m !== 'train') Stage.setPref(p.stage);
  if (m === 'pvp') { Looks.pvp = p.looks.slice(); Styles.pvp = p.styles.slice(); }
  else if (m === 'watch') { Looks.watch = p.looks.slice(); Styles.watch = p.styles.slice(); }
  else {
    Looks.solo.me = p.looks[0]; Styles.solo.me = p.styles[0];
    if (m === 'pve') { Looks.solo.cpu = p.looks[1]; Styles.solo.cpu = p.styles[1]; game.diff = p.diff; try { localStorage.setItem('modou.diff', p.diff); } catch (e) {} }
    else Styles.dummy = p.styles[1];
    if (Looks.solo.cpu === Looks.solo.me) Looks.solo.cpu = 'random';
  }
  Looks.save(); Styles.save();
}
const randStyle = () => STYLE_IDS[(Math.random() * STYLE_IDS.length) | 0];
function cpuStyle() { return styleOk(Styles.solo.cpu) ? Styles.solo.cpu : randStyle(); }
function applyStyles(mode) {
  const st = mode === 'pvp' ? Styles.pvp : mode === 'watch' ? Styles.watch : mode === 'online' ? [Net.styles.h, Net.styles.g] : mode === 'attract' ? [randStyle(), randStyle()]
    : mode === 'train' ? [Styles.solo.me, Styles.dummy] : [Styles.solo.me, cpuStyle()];
  F1.style = styleOk(st[0]) ? st[0] : STYLE_DEFAULT; F2.style = styleOk(st[1]) ? st[1] : STYLE_DEFAULT;
}

const START_X = [STAGE_W / 2 - START_GAP / 2, STAGE_W / 2 + START_GAP / 2];
const F1 = new Fighter(0, { look: 'ink', x: START_X[0], facing: 1 });
const F2 = new Fighter(1, { look: 'indigo', x: START_X[1], facing: -1 });
F1.opp = F2; F2.opp = F1;

const game = {
  mode: 'attract',          // attract（菜单背景电脑互打）| pve | pvp | online | train（训练场，2.0.2 以前叫打桩练习）| watch（2.11 观战：两个终极电脑互打）
  phase: 'attract',         // attract | intro | fight | ko | roundEnd | over
  diff: 'normal', p: [F1, F2], brains: [null, null],
  frame: 0, freeze: 0, shake: 0, flash: 0, punch: 0, timeScale: 1,   // frame：走了几步（2.6 起一步 = DT 帧）；freeze：顿帧还剩几帧
  quiet: false,             // 联机回滚重算时为 true：不出特效、不出声（1.9.0）
  round: 1, wins: [0, 0], timer: ROUND_FRAMES, phaseT: 0, paused: false, winner: -1,
  endless: false,           // 双人对战不限时，打到一方倒下为止
  dummyMode: 'stand', trainQi: false,   // 打桩：木桩动作、无限气
};
// 2.1：「地狱」改叫「极难」（id 还是 hell）；2.2：五档都是两个字 —— 入门 / 简单 / 中等 / 困难 / 终极（ai.js LEVEL_NAME）
const LABEL = Object.fromEntries(Object.entries(LEVEL_NAME).map(([id, n]) => [id, '电脑 · ' + n]));
const Hooks = { matchStart() {}, matchOver() {} };   // ui.js 会覆盖
// 2.11 观战（Jack：看两个终极电脑互打，学最高水平的电脑怎么打）：两边都是这一档；五局三胜、回合流程和人机一样，镜头两个人都在画面里（像双人）
const WATCH_LEVEL = 'hell';

function resetFighters() {
  F1.reset(START_X[0], 1); F2.reset(START_X[1], -1);
  game.freeze = 0; game.timeScale = 1;
  if (game.quiet) return;                      // 联机回滚重算时不动画面（特效、镜头）
  FX.length = 0; QI.length = 0; splats = [];
  game.shake = 0; game.flash = 0;
  if (typeof camX !== 'undefined') { camX = STAGE_W / 2; camZ = ZOOM; camLift = game.mode === 'train' ? TRAIN_LIFT : 0; }
}
function startAttract() {
  game.mode = 'attract'; game.phase = 'attract'; game.phaseT = 0; game.paused = false; game.endless = false;
  game.brains = [new Brain(F1, 'normal'), new Brain(F2, 'normal')];
  F1.label = ''; F2.label = ''; F2.maxHp = MAX_HP; applyLooks('attract'); applyStyles('attract');
  resetFighters();
}
function startMatch(mode) {
  Sound.init();
  if (typeof Drill !== 'undefined' && Drill.cur) { Drill.cur = null; CEV.on = null; }   // 2.1 换模式 / 重开：破招练习那一课结束
  game.mode = mode;
  game.endless = mode === 'pvp' || mode === 'train';
  const train = mode === 'train';
  F2.maxHp = train ? DUMMY_HP : MAX_HP; applyLooks(mode); applyStyles(mode);
  game.brains = mode === 'pve' ? [null, makeBrain(F2, game.diff)] : train ? [null, new Dummy(F2, game.dummyMode)]
    : mode === 'watch' ? [makeBrain(F1, WATCH_LEVEL), makeBrain(F2, WATCH_LEVEL)] : [null, null];
  if (mode === 'pve') { F1.label = '玩家'; F2.label = LABEL[game.diff]; }
  else if (train) { F1.label = '练习'; F2.label = '木桩'; }
  else if (mode === 'pvp') { F1.label = '玩家一'; F2.label = '玩家二'; }
  else if (mode === 'watch') { F1.label = LABEL[WATCH_LEVEL]; F2.label = LABEL[WATCH_LEVEL]; }
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
  else { announce('胜负已分', null, 80, 110, game.p[winner]); Sound.finale(); }
}

/* 2.6 逻辑一步（DT 帧 = 1/240 秒）：主循环、联机一步一步调。
   电脑 AI、木桩、破招练习、给 AI 看的快照（record）照旧一帧一次，都在每一帧的最后一步（走完正好是整帧，game.frame 是 SUB 的倍数）：
   电脑在这一步开头想、按（和 step() 里人新按的招同一步），快照、破招练习的计时在这一步最后。
   画面上的东西（姿势、特效、震屏、血条缓降）每步都走，按 DT 换算，屏幕刷新率高的时候更顺 */
const SHAKE_K = rootDT(0.86), FLASH_K = rootDT(0.84), PUNCH_K = rootDT(0.8);
function simTick(inputs) {
  game.frame++;
  const fr = game.frame % SUB === 0;          // 这一步是一帧的最后一步（走完正好是整帧）
  const [a, b] = game.p;
  const locked = game.phase !== 'fight' && game.phase !== 'attract';
  for (let i = 0; i < 2; i++) {
    if (game.brains[i]) { if (fr) game.brains[i].tick(locked); }
    else applyInput(game.p[i], inputs ? inputs[i] | 0 : 0);
  }
  const frozen = game.freeze > 0;
  if (frozen) game.freeze = Math.max(0, game.freeze - DT);
  else {
    a.update(locked); b.update(locked);
    // 朝向吸附（1.9.0）：不按左右的时候（站、蹲、挡）自动面向对手，不管远近；在判定之前做，对手刚绕到身后这一步就转过来
    for (const F of game.p) if (F.actionable() && !F.inp.held.left && !F.inp.held.right) F.autoFace();
    resolve(a, b);
    separate(a, b);
    if (fr) { a.record(); b.record(); }
  }
  if (!game.quiet) {                 // 联机回滚重算时只算胜负，不动画面
    a.keepPrev(); b.keepPrev();      // 2.0.1 上一步的样子（画面插值用）
    a.animate(frozen); b.animate(frozen);
    for (const F of game.p) {
      if (F.lagHp > F.hp) F.lagHp = Math.max(F.hp, F.lagHp - (F.state === 'hit' || frozen ? 0.05 : 0.6) * F.maxHp / 100 * DT);
      else F.lagHp = F.hp;
    }
    updateFx();
    game.shake *= SHAKE_K; game.flash *= FLASH_K; game.punch *= PUNCH_K;
  }

  switch (game.phase) {
    case 'attract':
      if (a.hp <= 0 || b.hp <= 0) { if ((game.phaseT += DT) >= 131) { resetFighters(); game.phaseT = 0; } }
      break;
    case 'intro':
      // 2.3 开场字幕配锣鼓；2.4（Jack：锣鼓太诡异）换成战鼓 + 镲 + 古筝：回合名随着「锵」砸下来；战鼓越敲越密；「战」的时候「锵」+ 古筝和弦（fx.js INTRO_BEATS）
      introBeats(game.phaseT, roundName() === '决胜局');
      if (game.phaseT === 10) announce(roundName(), null, 56, 96);
      if (game.phaseT === 68) announce('战', null, 38, 170);
      if ((game.phaseT += DT) >= 100) { game.phase = 'fight'; game.phaseT = 0; }
      break;
    case 'fight':
      if (game.mode === 'train') { trainTick(fr); break; }
      if (a.hp <= 0 || b.hp <= 0) endRound(a.hp <= 0 && b.hp <= 0 ? -1 : a.hp <= 0 ? 1 : 0, 'ko');
      else if (!game.endless && (game.timer -= DT) <= 0) { game.timer = 0; endRound(a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1, 'time'); }
      break;
    case 'ko':
      game.timeScale = game.phaseT < 40 && !reduceMotion ? 0.3 : 1;
      if ((game.phaseT += DT) >= 120) {
        game.timeScale = 1; game.phase = 'roundEnd'; game.phaseT = 0;
        if (game.winner >= 0) {
          game.wins[game.winner]++;
          const Wf = game.p[game.winner];
          if (Wf.actionable() || Wf.state === 'land') Wf.state = 'win';
          announce(`${Wf.name} 胜`, game.wins[game.winner] >= WIN_ROUNDS ? '' : `${game.wins[0]} : ${game.wins[1]}`, 100, 120, Wf);   // 赢的人的颜色
          if (game.wins[game.winner] >= WIN_ROUNDS) Sound.victory(localWin(game.winner));   // 2.7 整场打完：赢了一段鼓 + 古筝，输了一串往下走的古筝
        } else announce('平局', '本回合重打', 100, 120);
      }
      break;
    case 'roundEnd': {
      const Wf = game.winner >= 0 ? game.p[game.winner] : null;
      if (Wf && (Wf.actionable() || Wf.state === 'land')) Wf.state = 'win';
      if ((game.phaseT += DT) >= 110) {
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
/* 一帧（SUB 步）：测试、平衡报告、动作台、benchsim 用（以前的 step）。和 60 帧/秒时一模一样：
   按住的方向、格挡这一帧的每一步都按着（走、跑这一帧照样走一整帧那么远）；新按下的招在这一帧最后一步按下去
   （招式从整帧开始算，m.t 在每一帧末尾还是整数）。走到整帧为止 */
function step(inputs) {
  const v = [inputs ? inputs[0] | 0 : 0, inputs ? inputs[1] | 0 : 0], h = [v[0] & HELD_MASK, v[1] & HELD_MASK];
  do { simTick((game.frame + 1) % SUB === 0 ? v : h); } while (game.frame % SUB);
}
// 打桩：木桩掉到三成以下、这一套打完就回满；玩家掉血也回满；可选无限气
function trainTick(fr) {
  const [a, b] = game.p;
  if (b.hp <= b.maxHp * DUMMY_REFILL && (b.actionable() || b.hp <= 0)) {
    if (b.state === 'ko') { b.state = 'idle'; b.downPhase = null; }
    b.hp = b.lagHp = b.maxHp; tag(b.x, FLOOR - 170, '回满', b, 26);
  }
  if (a.hp < a.maxHp && a.actionable()) a.hp = a.lagHp = a.maxHp;
  if (game.trainQi) a.qi = QI_MAX;
  if (fr) Drill.tick();             // 2.1 破招练习：这一遍的计时、判成没成功（一帧一次）
}
// 2.7 整场是不是「我」赢了（放哪段声音）：人机看玩家一；联机看自己是哪一边（房主是玩家一）；双人对战两个人都在这台电脑上，总有人赢
function localWin(w) {
  if (game.mode === 'pve') return w === 0;
  if (game.mode === 'online') return w === (typeof Net !== 'undefined' && Net.role === 'host' ? 0 : 1);
  return true;
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
  'hitFlash', 'hitShake', 'hipY', 'lastStep', 'walkPhase', 'carryRot', 'lagHp', 'lieKind', 'gwalk', 'qx', 'qlean', 'ikS', 'holdPose', 'fkL', 'shook', 'prone', 'carryPose']);
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
    F.grabbed ? 1 : 0, F.rollDir, F.guardOn, F.stompFor, F.move && F.move.pick || '', F.slipGot ? 1 : 0, F.stagger ? 1 : 0, F.t, F.style, F.flow,
    F.stuck ? 1 : 0, F.move && F.move.shape || '', F.move && F.move.rollT || 0, F.move && F.move.lap ? 1 : 0);   // 2.10 搭手
  const str = s.join('|');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
