'use strict';
/* ============================================================
   4.0 平衡实验室（Jack：重测技能之间的平衡、人机强度、角色之间的平衡；优化或重构测试平衡的算法）
   以前的量法（balance.js）：中立均衡（只有格斗术、咏春有选项表）、分层（两派对打各 N 个种子，N 是写死的）、六边形。
   毛病：一、「一招鲜」只靠 tests.js 里十来个写死的套路（全是格斗术的）；二、种子数写死，分明的格子白跑、挨着线的格子又不够；
        三、量的脚本每次都在 Claude 那边现写，下一次没有了；四、单线程，一遍十几分钟到几个小时。
   现在分两半：
   · 这个文件（页面里的函数，balance.html / tests.html 都带着）：一局怎么量。
       labRun(cfg)        两边各是谁（电脑哪一档 / 模式机器人）打几回合或者多少帧 → 这一个种子的样本：打掉的血各占几成、回合胜负、
                          每一招的账（出了几次、打中、被挡、打掉多少血）、连招多长、拆招拆了几次、大招用了几次打掉多少
       labPatterns(style) 这一派所有的「套路」：每个键、蹲 / 前 / 跳 / 冲刺 / 跑起来的每一招、两三下的每一种按法、电脑连招表里的每一套、大招
       labCombos(style)   打木桩穷举连招（集束搜索）：每个长度最疼的一套、实连那几下最多打多少
   · tools/lab.mjs（node，开几个无头 Chrome 一起跑）：量什么、量多少。
       tricks  一招鲜筛查 —— 淘汰赛：所有套路先各跑一小段，只有排在前面的、离线不远的进下一轮加样本（一轮比一轮少、一轮比一轮准），
               最后剩下的才给置信区间。比每个套路都跑满快六七倍，可疑的那几个反而量得更准
       tiers   四派两两、每一档：一个种子一个样本（左右各一回合），跑到 95% 置信区间半宽够窄、或者整个区间已经落在线里 / 线外就停（顺序采样）
       ladder  人机六档：乱换招的机器人打每一派每一档，入门 > 简单 > …… 一档比一档难，照 Jack 2.7 定的尺
       ledger  满级对满级每一招的账：没有哪一招独占伤害的大头
       combos  四派连招的账：实连几下打多少、连满打多少、算上被拆的平均数
   量出来的数、过没过线都写进 NOTES「查平衡」；线（LAB_RULES）在这个文件最后，两边共用
   ============================================================ */
const LAB_KEYS = ['jab', 'heavy', 'kick', 'grab'];
const LAB_REACT = 12;                     // 模式机器人的反应：看见对面的位置晚这么多帧
// 一个记号拆开：'d:kick' 蹲着踢、'f:heavy' 按着前出重、'b:jab'、'j:kick' 跳过去出、'j:d:kick' 坠山、'dash:jab' 冲刺接、'run:heavy' 跑起来出、'super' 大招
function labTok(t) { const p = t.split(':'), key = p.pop(); return { key, d: p.includes('d'), f: p.includes('f'), b: p.includes('b'), j: p.includes('j'), dash: p.includes('dash'), run: p.includes('run') }; }
const labJumpFar = F => { const T = 2 * jumpVOf(F) / GRAV; return jumpVxOf(F) * T; };
// 模式机器人：spec.pats 里随便挑一套，走到够得着的地方按出来（后面的键能接就接、接不上等收完招照按），按完再挑；
// spec.guard 对面出手的时候举手的机会（挡对高低），spec.brk 挨连招的时候猜一个键拆的机会。别的什么都不会 —— 量的就是「只会这一套」能赚多少
function labBot(spec, side, style, rng) {
  let cur = null, k = 0, i = 0, st = null, target = 0, guardFor = -1, guardOn = false, brkFor = -1;
  const Dn = HOLD('down'), Bk = HOLD('block');
  const reachTok = (M, T) => {
    if (T.key === 'super') { const d = M.moves.super; return d.script ? 200 : d.reach + (d.lunge ? d.lunge[2] : 0) - 8; }
    const name = styleOf(M).variant(T.key, [], false, T.d ? 'down' : T.run ? 'run' : '', M), d = name && M.moves[name];
    return d ? d.reach + (d.lunge && d.lunge[2] > 0 ? d.lunge[2] : 0) - 8 : 80;
  };
  return () => {
    // 机器人看对面在哪有反应时间（LAB_REACT 帧以前的位置）：不然他倒地滚到哪它一帧不差地跟到哪、回回压起身压个正着 ——
    // 量出来「拳 重 重」这种打倒了再压的套路占九成多，那是机器人的本事不是招的本事（人看见往哪滚要十来帧）
    const M = side ? F2 : F1, O = side ? F1 : F2, H = O.history, ox = H && H.length > LAB_REACT ? H[H.length - 1 - LAB_REACT].x : O.x;
    const d = Math.abs(ox - M.x), tw = ox >= M.x ? 'right' : 'left', TW = HOLD(tw), AW = HOLD(tw === 'right' ? 'left' : 'right');
    if (M.state === 'hit' || M.state === 'blockstun') {
      // 拆招：一套想一次，随便猜一个键
      if (spec.brk && M.state === 'hit' && !M.brkKey && !M.brkLock && M.comboTaken >= sureOf(O) && brkFor !== O.serial) { brkFor = O.serial; if (rng() < spec.brk) return TAP(LAB_KEYS[(rng() * 3) | 0]) | (styleOf(M).ownBreak ? Bk : 0); }
      return M.state === 'blockstun' ? Bk | (M.lowBlock ? Dn : 0) : 0;
    }
    if (!cur) {
      if (!M.actionable()) return 0;
      // 举手：对面正在出手、够得着我 —— 这一招想一次挡不挡
      const om = O.move;
      if (spec.guard && O.state === 'attack' && om && !om.def.script && om.t < om.S + om.def.A + 1 && d <= (om.def.reach || 90) + 40) {
        if (guardFor !== om.serial) { guardFor = om.serial; guardOn = rng() < spec.guard; }
        if (guardOn) return Bk | (om.def.height === 'low' ? Dn : 0);
      }
      cur = spec.pats[(rng() * spec.pats.length) | 0]; k = 0; i = 0; st = {}; target = 0;
    }
    const T = labTok(cur[k]);
    if (T.key === 'super' && M.qi < QI_MAX) { if (++k >= cur.length) cur = null; return 0; }   // 气没满：这一下跳过
    i++;
    const next = () => { k++; i = 0; st = {}; if (k >= cur.length) { cur = null; } };
    if (i > 240) { cur = null; return 0; }
    const press = () => (T.key === 'super' ? TAP('heavy') | TAP('kick') : TAP(T.key)) | (T.d ? Dn : 0) | (T.f ? TW : 0) | (T.b ? AW : 0);
    // 一套里后面的键：能接就接（打中、被挡都接：乱按的人就是这样），收完招了还没按出去就站着照按
    if (k > 0 && !T.j && !T.dash && !T.run) {
      if (M.state === 'attack') { if (T.key !== 'super' && M.canCancel(T.key)) { const v = press(); next(); return v; } return (T.d ? Dn : 0) | (T.f ? TW : 0); }
      if (!M.actionable()) return 0;
      const v = press(); next(); return v;
    }
    if (!M.actionable() && !st.go) return M.state === 'air' && st.air ? TW : 0;
    // 跳过去出
    if (T.j) {
      if (!st.go) {
        if (!target) target = labJumpFar(M) * (0.95 + rng() * 0.2);
        if (d > target + 10) return TW; if (d < target - 10) return AW;
        st.go = 1; st.t = 0; return TAP('up') | TW;
      }
      st.t++;
      if (M.state === 'air' && !M.airUsed && !st.fired) {
        const ok = T.d ? d >= 50 && d <= 150 && M.vz < 5 : d <= (M.moves[AIR_OF[T.key]] || M.moves.airJab).reach + 6 && M.vz < 3;
        if (ok) { st.fired = 1; return TAP(T.key) | (T.d ? Dn : 0) | TW; }
      }
      if (st.t > 8 && !M.airborne && M.state !== 'attack' && M.state !== 'jumpsquat') { next(); return 0; }
      return st.t < 60 ? TW : 0;
    }
    // 冲刺接
    if (T.dash) {
      if (!st.go) {
        const D = M.moves.dash; if (!target) target = D.lunge[2] * 0.8 + reachTok(M, T);
        if (d > target + 10) return TW; if (d < target - 14) return AW;
        st.go = 1; st.t = 0; return TW;
      }
      st.t++;
      if (st.t === 1) return 0; if (st.t === 2) return TW;
      const m = M.move;
      if (M.state === 'attack' && m && m.name === 'dash') { const ca = m.def.cancelAt === undefined ? DASH_CANCEL : m.def.cancelAt; if (m.t >= ca + 1) { const v = press(); next(); return v; } return 0; }
      if (st.t > 6) { next(); return 0; }
      return 0;
    }
    // 跑起来出
    if (T.run) {
      if (!st.go) { if (d < 230) return AW; st.go = 1; }
      if (d <= reachTok(M, T) + 14 && M.runT >= RUN_CHARGE) { const v = press(); next(); return v | TW; }
      if (d <= 60) { next(); return 0; }
      return TW;
    }
    // 站着 / 蹲着 / 按着方向出：走到够得着
    if (!target) target = reachTok(M, T) - rng() * 10;
    if (d > target) return TW;
    if (d < 40 && T.key !== 'grab') return AW;
    const v = press(); next(); return v;
  };
}
// 这一派所有的套路（一招鲜筛查用）：[名字, 一套键]
function labPatterns(style) {
  const out = [], seen = new Set(), add = p => { const n = p.join(' '); if (!seen.has(n)) { seen.add(n); out.push(p); } };
  for (const a of ['jab', 'heavy', 'kick', 'grab']) { add([a]); add(['d:' + a]); add(['dash:' + a]); if (a !== 'grab') { add(['f:' + a]); add(['j:' + a]); } }
  add(['j:d:kick']); add(['run:heavy']); add(['b:jab']); add(['super']);
  const K3 = ['jab', 'heavy', 'kick'];
  for (const a of K3) for (const b of K3) { add([a, b]); for (const c of K3) add([a, b, c]); }
  for (const a of K3) { add([a, 'grab']); add(['j:' + a, 'jab', 'heavy']); add(['j:' + a, 'kick']); add(['dash:' + a, 'jab', 'kick']); add([a, 'd:kick']); add(['d:jab', a]); add([a, 'f:heavy']); }
  add(['j:d:kick', 'kick']); add(['j:d:kick', 'heavy']); add(['j:d:kick', 'jab', 'jab']);
  // 电脑连招表里的每一套（各派自己的长连招）
  const kit = KITS[style];
  if (kit && kit.plans) for (const lv of ['hard', 'max']) for (const [p] of kit.plans[lv] || []) if (Array.isArray(p) && p.length >= 3) add(p.slice());
  if (style === 'mantis') { add(['jab', 'jab', 'grab', 'jab', 'jab', 'grab', 'f:heavy']); add(['jab', 'heavy', 'grab', 'heavy', 'kick', 'grab', 'd:kick']); add(['super', 'jab', 'jab', 'jab', 'heavy', 'jab', 'heavy', 'kick']); }
  if (style === 'wc') { add(['jab', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab']); add(['jab', 'jab', 'jab', 'kick', 'kick', 'kick']); add(['f:jab', 'jab', 'jab', 'heavy']); }
  return out;
}
// 账本：一招一行
function labLedgerNew() { return { moves: {}, combos: [], brk: 0, brkMiss: 0, sup: 0, supDmg: 0, grabDmg: 0, guards: 0 }; }
/* 一局。cfg：
     styles [左, 右]；who [左, 右]：'novice' ～ 'max' = 电脑哪一档，或者 { pats, guard, brk } = 模式机器人（{ pats: 'all' } = 这一派所有套路里乱挑）
     rounds 打几回合（打到一边倒下算一回合），或者 frames 打多少帧（血掉到一半以下两边回满：只量谁赚谁亏，不分回合）
     seed 种子；ledger 要不要一招一招的账 */
function labRun(cfg) {
  const styles = cfg.styles, who = cfg.who;
  let s0 = (cfg.seed || 1) >>> 0; const rng = () => (s0 = (Math.imul(s0, 1103515245) + 12345) >>> 0) / 4294967296;
  const keep = Styles.pvp, q0 = game.quiet, mr = Math.random, ev0 = CEV.on;
  Styles.pvp = styles;
  try { startMatch('pvp'); } finally { Styles.pvp = keep; }
  game.endless = true; game.quiet = true; Math.random = rng;
  const led = [labLedgerNew(), labLedgerNew()], cur = [null, null], serial = [-1, -1];
  const row = (k, n) => led[k].moves[n] || (led[k].moves[n] = { use: 0, hit: 0, blk: 0, dmg: 0 });
  const closeCombo = k => { if (cur[k] && cur[k].n) led[k].combos.push([cur[k].n, cur[k].dmg]); cur[k] = null; };
  if (cfg.ledger) CEV.on = (type, A, B, x) => {
    const k = A.idx;
    if (type === 'hit') {
      const r = row(k, x.name); r.hit++; r.dmg += x.dmg;
      if (A.combo <= 1) closeCombo(k);
      (cur[k] || (cur[k] = { n: 0, dmg: 0 })).n = A.combo; cur[k].dmg += x.dmg;
      if (x.tier === 'super') { led[k].supDmg += x.dmg; }
    } else if (type === 'guard') { row(k, x.name).blk++; led[B.idx].guards++; }
    else if (type === 'break') led[k].brk++;
    else if (type === 'breakMiss') led[k].brkMiss++;
    else if (type === 'catch' && A.state !== 'blockstun') led[k].brk += 0;
  };
  try {
    const bots = who.map((w, k) => typeof w === 'string' ? null : labBot(Object.assign({}, w, { pats: w.pats === 'all' ? labPatterns(styles[k]) : w.pats }), k, styles[k], rng));
    game.brains = who.map((w, k) => typeof w === 'string' ? new Brain(k ? F2 : F1, w) : null);
    let r = 0, f = 0, prev = game.phase, hp = [F1.hp, F2.hp];
    const dealt = [0, 0], wins = [0, 0], maxF = cfg.frames || 400000, rounds = cfg.frames ? 1e9 : cfg.rounds || 2;
    while (r < rounds && f < maxF) {
      step([bots[0] ? bots[0]() : 0, bots[1] ? bots[1]() : 0]); f++;
      dealt[0] += Math.max(0, hp[1] - F2.hp); dealt[1] += Math.max(0, hp[0] - F1.hp); hp = [F1.hp, F2.hp];
      if (cfg.ledger) for (const F of [F1, F2]) { const m = F.move; if (m && m.serial !== serial[F.idx]) { serial[F.idx] = m.serial; if (!m.def.script || m.name === 'super') { row(F.idx, m.name).use++; if (m.name === 'super') led[F.idx].sup++; } } }
      if (cfg.frames) {
        if (F1.hp < MAX_HP / 2 || F2.hp < MAX_HP / 2) { F1.hp = F2.hp = MAX_HP; hp = [MAX_HP, MAX_HP]; }
        if (game.phase !== 'fight') { game.wins = [0, 0]; startRound(); game.phase = 'fight'; hp = [F1.hp, F2.hp]; }
      } else {
        if (game.phase === 'roundEnd' && prev !== 'roundEnd') { r++; if (F1.hp !== F2.hp) wins[F1.hp > F2.hp ? 0 : 1]++; }
        prev = game.phase;
        if (game.phase === 'over') { game.wins = [0, 0]; startRound(); hp = [F1.hp, F2.hp]; }
      }
    }
    closeCombo(0); closeCombo(1);
    game.brains = [null, null];
    const tot = Math.max(1, dealt[0] + dealt[1]);
    return { share: dealt[0] / tot, dealt, wins, rounds: r, frames: f, led: cfg.ledger ? led : null };
  } finally { Math.random = mr; game.quiet = q0; CEV.on = ev0; game.brains = [null, null]; }
}
/* 连招的账：这一派打木桩（格斗术的人，不还手、不拆），从每个起手穷举接法 —— 集束搜索（每一层留最疼的 beam 套）。
   返回每个长度最疼的一套（键、招名、总伤害）。dist 相距多远起手 */
function labCombos(style, dist, beam) {
  const q0 = game.quiet, B = beam || 8, D = dist || 80, ev0 = CEV.on;
  const toks = ['jab', 'heavy', 'kick', 'grab', 'd:jab', 'd:heavy', 'd:kick', 'f:jab', 'f:heavy', 'f:kick'];
  const keep = Styles.pvp; Styles.pvp = [style, 'trad'];
  try { startMatch('pvp'); } finally { Styles.pvp = keep; }
  game.quiet = true; game.endless = true; game.brains = [null, null];
  const best = {};
  try {
    F1.reset(700, 1); F2.reset(700 + D, -1); game.phase = 'fight'; game.phaseT = 0; F2.hp = MAX_HP;
    const root = saveState();
    // 从 state 起按 tok：返回打中没有（这一套接上了：comboTaken 多了一下、他没倒）和新的 state
    const tryTok = (state, tok, n) => {
      loadState(state);
      const T = labTok(tok), hp0 = F2.hp, n0 = F2.comboTaken, tw = HOLD('right');
      let pressed = false, names = null;
      for (let i = 0; i < 70; i++) {
        let v = 0;
        if (!pressed) {
          if (n === 0 ? true : F1.state === 'attack' && F1.canCancel(T.key)) { v = TAP(T.key) | (T.d ? HOLD('down') : 0) | (T.f ? tw : 0); pressed = true; }
          else if (n > 0 && F1.state !== 'attack') return null;           // 收完招了还没接上：不算连招
          else v = (T.d ? HOLD('down') : 0) | (T.f ? tw : 0);
        }
        const ser = F1.serial;
        step([v, 0]);
        if (pressed && names === null && F1.serial !== ser && F1.move) names = F1.move.name;
        if (F2.comboTaken > n0 || (F2.hp < hp0 && F2.comboTaken === 0 && n0 === 0)) {
          if (n > 0 && F2.comboTaken !== n0 + 1) return null;
          for (let j = 0; j < 3; j++) step([0, 0]);
          return { state: saveState(), dmg: hp0 - F2.hp, name: names, down: F2.state === 'down' || F2.state === 'ko' };
        }
        if (pressed && F1.state !== 'attack' && i > 3) return null;
      }
      return null;
    };
    let layer = [{ state: root, keys: [], names: [], dmg: 0, down: false }];
    for (let n = 0; n < COMBO_MAX; n++) {
      const nextL = [];
      for (const node of layer) {
        if (node.down) continue;
        for (const tok of toks) {
          const r = tryTok(node.state, tok, n);
          if (!r || !r.name) continue;
          nextL.push({ state: r.state, keys: node.keys.concat(tok), names: node.names.concat(r.name), dmg: node.dmg + r.dmg, down: r.down });
        }
      }
      if (!nextL.length) break;
      nextL.sort((a, b) => b.dmg - a.dmg);
      // 一样的招名序列只留一套
      const seen = new Set(), uniq = [];
      for (const x of nextL) { const kx = x.names.join('>'); if (!seen.has(kx)) { seen.add(kx); uniq.push(x); } }
      best[n + 1] = { dmg: uniq[0].dmg, keys: uniq[0].keys, names: uniq[0].names.map(x => STYLES[style].moves[x].label), count: uniq.length };
      // 留下来的：最疼的 B 套 + 没打倒的里最疼的 B 套（打倒的接不下去了，别让它们把能接的挤掉）
      const live = uniq.filter(x => !x.down).slice(0, B);
      layer = live;
    }
    return { style, dist: D, sure: sureOf(F1), best };
  } finally { game.quiet = q0; CEV.on = ev0; }
}
/* 线（tools/lab.mjs 和 tests.js 共用）：
   trick：模式机器人只会一套、不防守，打每一派的电脑 —— 打掉的血占比不能超过这一档的线（超了 = 这一套对电脑是「版本答案」）；
          线 = 乱换招的机器人打这一档的占比 + margin，再封一个顶 cap；而且要真赚得着：每分钟净赚 net 血以上
   tier ：两派同一档对打，打掉的血占比在 [lo, hi] 里
   ladder：乱换招的机器人打每一档，至少打掉这么多（Jack 2.7：入门 80% 以上、简单 65%、中等 40%，终极两成以上），而且一档比一档少
   top  ：满级对满级，一招打掉的血最多占这一派全部的几成 */
const LAB_RULES = {
  trick: { margin: 0.16, cap: { normal: 0.72, hard: 0.6, hell: 0.55 }, net: 120 },   // net：还要每分钟净赚这么多血以上才算（占比高但谁也没打着几下的不算）
  tier: { lo: 0.44, hi: 0.56 },
  ladder: { novice: 0.75, easy: 0.6, normal: 0.36, hard: 0.2, hell: 0.15 },
  top: 0.3,
};
window.labRun = labRun; window.labPatterns = labPatterns; window.labCombos = labCombos; window.LAB_RULES = LAB_RULES;
