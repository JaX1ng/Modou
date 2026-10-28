'use strict';
/* 命中判定：先同时算出「两边这一帧各打不打得中」，再一起结算（没有先手偏向）。
   交手：两边的招同时到（或对方的招只差 TRADE_LEAD 帧就到）→ 看 relation()：
     克 = 主系克制，克制方单方面打中 ×1.3；
     压 = 主系相同、起手克制，两边都打中，被压的吃全额，压人的只吃三成；
     平 = 拼招，两边各吃五成、互相震退。
   单方面打中时依次看：卸力 → 格挡（要面朝对方、高低要对）→ 霸体 → 打中（破招/克制/连击衰减/失衡）。
   打击只打得到面前的人（背对着出招打不中）；背对着挨打挡不住。
   擒拿：挡不住；出腿时被拿 = 接腿摔；被任何正在判定中的打击打断。
   1.8.0：站着的擒拿抓不到蹲着的（蹲+拿「抄腿」专抓蹲着的和出腿的）；抓住先「擒住」，被抓的人马上按拿能挣脱；
          挡后反击 / 卸力反击 / 破绽：防住以后打对方收招有加成，击倒招加得最多 */

const atWall = F => F.x <= WALL_L + 2 || F.x >= WALL_R - 2;
const stop = n => grid(n * HITSTOP);          // 顿帧（2.6 取到 0.25 帧）
// 2.6 时间比较：第 k 帧 = [k, k+1)，以前「t > X」写成 t >= X + 1、「t <= X」写成 t < X + 1（见 config.js）
// 1.9.2：画面上飘的字只出招名和结果（拼、压、化解、卸、破招 ×1.2、倒栽葱 ×1.3、伤害…），不出讲规则的字
// （谁克谁、该站挡还是蹲挡、背后挡不住、站着的抄不到）—— 这些写进打桩练习的数值面板（info.why），不飘在人身上
const CRASH_NAME = '倒栽葱';                     // 空中出招被克制、打下来（倒地更久）
// 2.1 战斗事件（训练场「破招练习」看你这一下破没破成用）：只报告，不改任何东西。平时（人机、对战、联机）CEV.on 是 null
const CEV = { on: null };
const cev = (type, A, B, x) => { if (CEV.on) CEV.on(type, A, B, x || {}); };
// 记数值（打桩练习面板用，不影响胜负）：这一下的招式、伤害、帧差、本套连击伤害
function note(A, B, dmg, how) {
  const m = A.move, d = m.def, left = m.S + d.A + d.R + (m.pen || 0) - m.t;
  const adv = (B.state === 'hit' || B.state === 'blockstun') ? B.stunT - left : null;
  A.info = { label: d.label, lead: d.lead, tier: d.tier, height: d.height, S: m.S, A: d.A, R: d.R, dmg, how,
    adv, down: B.state === 'down' || B.state === 'ko', blocked: how === '被挡', t: A.clock };
  if (dmg > 0 && how !== '被挡') {
    A.comboDmg = (A.combo <= 1 ? 0 : A.comboDmg) + dmg;
    A.maxComboDmg = Math.max(A.maxComboDmg, A.comboDmg);
  }
}
function noteGrab(A, dmg, label) {
  A.info = { label, dmg, how: '抓住', adv: null, t: A.clock };
  A.comboDmg = (A.combo <= 1 ? 0 : A.comboDmg) + dmg; A.maxComboDmg = Math.max(A.maxComboDmg, A.comboDmg);
}
function contactPoint(A, B) {
  const lim = A.move && A.move.def.limb;
  const e = (lim && A.J[lim]) || A.J.fh;
  const topY = B.J.head[1] - 8, botY = FLOOR - 12 - B.alt;
  return { x: B.x - A.facing * 12, y: clamp(e[1], topY, Math.max(topY + 10, botY)) };
}

/* ---------- 判定（只看，不改状态） ---------- */
// 身子压得低：蹲着、蹲挡、正在出下段招（站着的擒拿抓不到）
const lowProfile = F => F.isCrouching() || (F.state === 'attack' && !!F.move && !F.move.air && F.move.def.height === 'low');
// 1.9.0 空中交手用到的几种状态（招还没打中、没被挡）
const liveMove = F => F.state === 'attack' && !!F.move && !F.move.def.script && !F.move.hit && !F.move.blocked;
const airKick = F => liveMove(F) && F.move.air && F.move.def.kind === 'kick';            // 飞踢、坠山
const groundKick = F => liveMove(F) && !F.move.air && F.move.def.tier === 'kick' && F.move.def.height !== 'low';   // 地上的腿（扫堂腿、踩腿贴地，不算）
const diving = F => liveMove(F) && !!F.move.def.dive;                                     // 坠山还在往下踩
const aaProof = F => liveMove(F) && !!F.move.def.aaProof;                                 // 坠山：对空招打不到它
// 2.0 闪身：正在钻（slipInv 那几帧）的人。2.0.2（Jack）：只躲得过重拳 —— 站着打的重系手上招（重拳、进步冲拳、劈山掌、盖步砸拳、沉肩靠、截击），
// 短拳、腿、下段、对空、空中招、擒拿都打得中他（截住闪身）
const slipping = F => F.state === 'attack' && !!F.move && F.move.name === 'slip' && F.inFrames('slipInv');
const slipDodges = m => !m.air && m.def.tier === 'heavy' && m.def.kind === 'heavy' && m.def.height !== 'low';
function grabIntent(A, B) {
  const m = A.move;
  if (A.state !== 'attack' || !m || m.def.kind !== 'grab' || m.done || !A.inActive() || B.invuln()) return null;
  const dist = (B.x - A.x) * A.facing;
  const bm = B.state === 'attack' ? B.move : null;
  const kicking = !!bm && bm.def.kind === 'kick' && !bm.def.dive && bm.t >= 3 && bm.t < bm.S + bm.def.A + 1 && B.facingTo(A);
  // 2.9 迎春拳的拉手（trap）：正好在对方出拳、出掌（地上的、手上的招，前摇或判定里）的时候抓 = 把他的手拉过来；接不住腿（出腿的时候伸手 = 挨踢）
  if (m.def.trap) {
    if (bm && !bm.air && !bm.def.script && !bm.def.guard && (bm.def.kind === 'jab' || bm.def.kind === 'heavy') && /^(fh|bh|fe|be)$/.test(bm.def.limb) && bm.def.height !== 'low'
      && bm.t >= Math.max(1.5, bm.S - Y_TRAP_EARLY) && bm.t < bm.S + bm.def.A + 1 && B.facingTo(A) && B.alt <= 24 && dist >= -6 && dist <= Math.max(m.def.reach, bm.def.reach) + 6) return 'trap';
    if (kicking) return null;
  }
  if (m.def.low) {
    // 抄腿：接住地上的出腿（扫堂腿也接得住；跳起来的腿抄不到）；抓蹲着的；站着的抓不到
    if (kicking && !bm.air && B.alt <= 24 && dist >= -6 && dist <= Math.max(m.def.reach, bm.def.reach) + 6) return 'scoop';
    if (dist < -6 || dist > m.def.reach || B.alt > 24) return null;
    return lowProfile(B) ? 'tackle' : 'whiff';
  }
  // 接腿：对方正朝我出腿（不算扫堂腿）
  if (kicking && bm.def.height !== 'low' && dist >= -6 && dist <= bm.def.reach + 6) return 'catch';
  if (dist < -6 || dist > m.def.reach || B.alt > 24) return null;
  return lowProfile(B) ? 'duck' : 'grab';
}
// 打击能不能碰到：射程、面朝、高度（空中招往下够不够得着）
function reaches(A, B, m, extra) {
  const d = m.def, dist = (B.x - A.x) * A.facing;
  if (dist < -6 || dist > d.reach + (extra || 0)) return false;
  // 地上的招打不到太高的人（对空招另算）。1.9.0：坠山踩下来的时候，站着的招能迎着打到 DIVE_AA_ALT 那么高；
  // 对手在空中出腿的时候，地上的腿能迎上去够到 KICK_AA_ALT（两条腿撞上 = 把他顶回去）
  if (!m.air && B.airborne && B.alt > Math.max(d.antiAir || AIR_SAFE, diving(B) ? DIVE_AA_ALT : 0,
    d.tier === 'kick' && d.height !== 'low' && airKick(B) ? KICK_AA_ALT : 0)) return false;
  if (m.air && A.alt - B.alt > (d.vreach || 999)) return false;
  return true;
}
// A 这一招打不打得到 B（无敌帧）：托天掌的对空无敌防不住坠山，对空招也打不到坠山（1.9.0）
function shielded(A, B, m) {
  if (B.strikeInv()) return true;
  if (m.air && !m.def.dive && B.airInv()) return true;
  return m.def.tier === 'aa' && aaProof(B);
}
function strikeIntent(A, B) {
  const m = A.move;
  if (A.state !== 'attack' || !m || m.done || m.def.kind === 'grab' || m.def.guard || !A.inActive() || B.invuln()) return null;   // 2.9 拍手、盘手这些不打人
  if (!reaches(A, B, m)) return null;
  if (shielded(A, B, m)) return null;
  if (m.def.evadeCrouch && B.isCrouching()) return 'dodge';
  if (slipping(B) && slipDodges(m)) return 'slip';
  return 'hit';
}
// 剩下还没冲完的前冲距离
function lungeLeft(F) {
  const d = F.move.def;
  if (!d.lunge || F.move.air) return 0;
  const [a, b, px] = d.lunge, tb = F.baseTime();
  return Math.max(0, px) * clamp((b - Math.max(tb, a)) / (b - a), 0, 1);
}
// B 的招是不是已经出手、lead 帧内就要打到 A（被打中时算交手）
function committed(B, A, lead) {
  const m = B.move;
  if (B.state !== 'attack' || !m || m.done || m.def.script || m.def.kind === 'grab' || m.def.kind === 'push' || m.def.guard) return false;
  if (m.t >= m.S + m.def.A + 1 || m.S - m.t > lead) return false;
  if (!reaches(B, A, m, lungeLeft(B) + 6)) return false;
  if (A.invuln() || shielded(B, A, m)) return false;
  if (m.def.evadeCrouch && A.isCrouching()) return false;
  if (slipping(A) && slipDodges(m)) return false;
  return true;
}

/* ---------- 结算 ---------- */
function resolve(a, b) {
  let ga = grabIntent(a, b), gb = grabIntent(b, a);
  let sa = strikeIntent(a, b), sb = strikeIntent(b, a);
  if (sa === 'dodge') { dodged(a, b); sa = null; }
  if (sb === 'dodge') { dodged(b, a); sb = null; }
  if (sa === 'slip') { slippedBy(a, b); sa = null; }
  if (sb === 'slip') { slippedBy(b, a); sb = null; }
  if (ga === 'duck' || ga === 'whiff') { grabMiss(a, b, ga); ga = null; }   // 蹲着的抓不到 / 抄腿抓不到站着的
  if (gb === 'duck' || gb === 'whiff') { grabMiss(b, a, gb); gb = null; }
  const holdy = g => g === 'grab' || g === 'tackle';
  if (holdy(ga) && holdy(gb)) { tech(a, b); ga = gb = null; }
  if (ga === 'catch' || ga === 'scoop' || ga === 'trap') sb = null;          // 接腿 / 抄腿：腿被抱住了，踢不到；2.9 拉手：手被拉住了，打不到
  if (gb === 'catch' || gb === 'scoop' || gb === 'trap') sa = null;
  if (sa && holdy(gb)) gb = null;     // 打击打断擒拿
  if (sb && holdy(ga)) ga = null;
  if (sa && sb) exchange(a, b);
  else if (sa) strikeOn(a, b);
  else if (sb) strikeOn(b, a);
  if (ga && a.state === 'attack' && a.move && a.move.def.kind === 'grab' && !a.move.done && !b.invuln()) doGrab(a, b, ga);
  if (gb && b.state === 'attack' && b.move && b.move.def.kind === 'grab' && !b.move.done && !a.invuln()) doGrab(b, a, gb);
  for (const [A, B] of [[a, b], [b, a]]) {
    if (A.comboLive && !(B.state === 'hit' || B.state === 'down' || B.state === 'ko' || B.state === 'blockstun')) A.comboLive = false;
    if (B.state === 'down' && B.downPhase !== 'fall') A.comboLive = false;
  }
}
// 两边的招同时到：克 / 压 / 平。空中的腿撞上地上的腿 = 空中那个被顶得翻滚回去（1.9.0）
function exchange(A, B) {
  A.holdPose = B.holdPose = true;
  if (airKick(A) && groundKick(B)) return tumble(A, B);
  if (airKick(B) && groundKick(A)) return tumble(B, A);
  const r = clashRelation(A, B);             // 2.7.1 拳派：同一派照这一派的克制；不同派要专门算（moves.js MATCHUPS）
  if (r === 1) applyHit(A, B, 'beat');
  else if (r === -1) applyHit(B, A, 'beat');
  else if (r > 0) overpower(A, B);
  else if (r < 0) overpower(B, A);
  else clash(A, B);
}
function strikeOn(A, B) {
  if (A.move.def.push) return B.armored('push') ? absorb(A, B, contactPoint(A, B)) : shoveHit(A, B);   // 2.7 泼墨蓄力的霸体连推挡也吃（以前打击无敌，推挡也推不动）
  if (groundKick(A) && airKick(B)) return tumble(B, A);       // 地上出腿迎上空中的腿：顶回去
  if (committed(B, A, TRADE_LEAD)) return exchange(A, B);
  if (readBeat(B, A)) return evade(A, B);
  applyHit(A, B, null);
}
// 读招：B 的招主系克制 A 的招，B 已经起势（前摇第 3 帧以后、BEAT_LEAD 帧内就出来）
// → A 这一下被化解打空，B 的招照常打出并算克制。重拳对短拳走「霸体」，不走这里
function readBeat(B, A) {
  const m = B.move, ta = A.move.def.tier;
  if (B.state !== 'attack' || !m || m.done || m.def.script || m.t < 3 || m.t >= m.S + 1) return false;
  if (beats(m.def.tier, ta) <= 0 || (m.def.armor && m.def.armor.vs.includes(ta))) return false;
  return committed(B, A, BEAT_LEAD);
}
function evade(A, B) {
  A.move.done = true; A.move.evaded = true;
  B.move.beatVs = A.move.def.tier;
  sparks(B.x + B.facing * 16, B.J.sh[1], B.facing, 6, 6, pal(B).fx, 1.0, 0.3);
  tag(B.x, B.J.head[1] - 40, '化解', B, 20);
  B.info = { label: B.move.def.label, dmg: 0, how: '化解', why: TIER_NAME[B.move.def.tier] + '克' + TIER_NAME[A.move.def.tier], adv: null, t: B.clock };
  cev('evade', A, B, { name: A.move.name, by: B.move.name });
  Sound.whoosh(0.6);
}

function applyHit(A, B, how) {
  const m = A.move, d = m.def, dir = A.facing;
  m.done = true;
  B.holdPose = true;          // 2.4 打中（挡住）那一帧挨打的人先不动，顿帧里拳脚正好落在身上，顿完了才往后仰（只是画面）
  const c = contactPoint(A, B);
  const bm = B.state === 'attack' && B.move && !B.move.def.script ? B.move : null;
  const inStartup = !!bm && bm.t < bm.S + 1;
  const front = B.facingTo(A);
  if (B.isBlocking() && front && B.parryReady()) return parry(A, B, c);
  // 2.9 迎春拳：拍手、耕手判定那几帧拍开、耕开（打的人失衡）；盘手黏住（像挡住，但挡完马上能打）
  const gm = B.state === 'attack' && B.move && B.move.def.guard && front && d.kind !== 'push' ? B.move : null;
  if (gm && gm.def.guard !== 'roll' && B.inActive() && handCovers(gm.def.guard, d, m)) return handParry(A, B, c, gm.def.guard);
  if (gm && gm.def.guard === 'roll' && gm.t >= gm.S + 1 && gm.t < gm.S + gm.def.A && d.height !== 'low') return stick(A, B, c);
  if (B.isBlocking() && front && B.blockHeightOK(d.height)) return guard(A, B, c);
  if (!how && B.armored(d.tier) && !d.pierce) return absorb(A, B, c);   // 2.9 迎春拳的寸拳、连环寸拳劲大：霸体吃不住（pierce）

  let label = null, mul = m.air ? AIR_BONUS : 1;
  const beatVs = how === 'beat' && bm ? bm.def.tier : m.beatVs || (inStartup && beats(d.tier, bm.def.tier) > 0 ? bm.def.tier : null);
  // 迎击：打在全速跑过来、或冲刺收尾（无敌帧过了）的人身上
  const charging = (B.state === 'run' && B.runT >= RUN_CHARGE) || (B.state === 'attack' && B.move && B.move.name === 'dash');
  // 1.8.0 防守反击：挡后反击（打在自己刚挡住的那一招收招里）、破绽（击倒招打空了打它收招）、卸力反击（卸力后趁失衡打）
  const inRecovery = !!bm && bm.t >= bm.S + bm.def.A + 1;
  let punish = null;
  if (inRecovery && A.guardOn === bm.serial) punish = ['挡后反击', bm.def.launch ? PUNISH_KD_MUL : PUNISH_MUL];
  else if (inRecovery && bm.def.launch && !bm.hit) punish = ['破绽', WHIFF_KD_MUL];
  else if (B.state === 'hit' && B.reel && B.reelBy === A.idx && B.reelKind !== 'knee') punish = [REEL_LABEL[B.reelKind] || '卸力反击', B.reelKD ? PUNISH_KD_MUL : PARRY_MUL];
  // 2.9 迎春拳的「顺」：这一招是迎春拳连得上的招（flow）—— 接着连就接着顺；反打（拍开、拉住、卸开、踉跄、起身硬直里的人）第一下就顺 FLOW_COUNTER 级；
  // 盘手黏住一下马上打出去 = 黏打（顺 2 级起）。连断了（他逃出硬直、被挡、被打）顺就清零
  const flowMove = !!d.flow;
  if (flowMove) {
    // 顺接着算的条件是「你这一串一直连着打中」（fighter.js：打空、被挡、挨打、停手 Y_FLOW_IDLE 帧都会清零）——
    // 他在第 2、3 下之间那一点空里没挡、没还手，这一下照样接着顺
    if ((B.state === 'hit' && ((B.reel && B.reelKind !== 'knee') || B.stagger || B.grabbed)) || B.state === 'rise') A.flow = Math.max(A.flow, FLOW_COUNTER);
    // （盘手黏住的那一下正在收招，本来就算挡后反击：名字叫黏打，倍率取大的那个）
    if (A.clock - (A.stickAt === undefined ? -999 : A.stickAt) < Y_STICK_WIN + 1) { A.flow = Math.max(A.flow, 2); if (!inStartup) punish = ['黏打', Math.max(Y_STICK_MUL, punish ? punish[1] : 0)]; A.stickAt = -999; }
  }
  let lmul = 1;
  // 2.0 闪身：钻的时候挨了打（2.0.2 起：短拳、腿、下段这些它躲不过的）= 截住闪身
  const caughtSlip = B.state === 'attack' && !!B.move && B.move.name === 'slip';
  if (d.stagger) { /* 2.0.2 回身肘：不另算加成（它本身就是闪身的收益：打完他踉跄、你先动） */ }
  else if (beatVs) { label = TIER_NAME[d.tier] + '克' + TIER_NAME[beatVs]; lmul = BEAT_MUL; }
  else if (inStartup) { label = '破招'; lmul = COUNTER_MUL; }
  else if (punish) { label = punish[0]; lmul = punish[1]; A.stats.punishes++; }
  else if (caughtSlip) { label = '截住闪身'; lmul = SLIP_CAUGHT_MUL; }
  else if (charging) { label = '迎击'; lmul = COUNTER_MUL; }
  // 1.9.0 空中交手：空中出招被克制它的招打中 = 倒栽葱（倒地更久）；坠山被站着的拳打中再 ×1.4
  const wasAir = B.airborne;
  const crash = wasAir && !!bm && bm.air && beats(d.tier, bm.def.tier) > 0;
  const punchDive = crash && !!bm.def.dive && !m.air && (d.kind === 'jab' || d.kind === 'heavy') && /^(fh|bh|fe)$/.test(d.limb);
  // 坠山踩中：蹲着 / 蹲挡 / 出下段的 ×1.3（踩蹲）；正在出对空招的 ×1.5、踩倒（踩断对空）
  let diveKD = false;
  if (crash) { label = CRASH_NAME; lmul = punchDive ? DIVE_PUNCH_MUL : Math.max(lmul, BEAT_MUL); }
  else if (d.dive && bm && bm.def.tier === 'aa') { label = '踩断对空'; lmul = DIVE_AA_MUL; diveKD = true; }
  else if (d.dive && lowProfile(B)) { label = '踩蹲'; lmul = DIVE_CROUCH_MUL; }
  mul *= lmul;
  if (m.dashIn) mul *= DASH_IN_MUL;
  const n = B.comboTaken;
  mul *= Math.max(DMG_FLOOR, 1 - DMG_DECAY * n * (flowMove ? FLOW_DECAY : 1));
  if (flowMove) mul *= 1 + FLOW_DMG * A.flow;
  const dmg = Math.max(1, Math.round(d.dmg * mul));
  const wrongGuard = B.isBlocking() && front;
  const backHit = B.isBlocking() && !front;
  // 拳打在正在出腿（单脚站着）的人身上 → 失衡倒地
  const offBalance = !!bm && d.tier === 'light' && bm.def.tier === 'kick' && !bm.air && bm.t >= 4 && bm.t < bm.S + bm.def.A + 1;
  const rising = B.state === 'rise';                    // 2.0 打在起身硬直里（打桩面板上写一句）

  B.hp -= dmg; m.hit = true; A.stats.hits++; B.flow = 0;
  if (d.tier === 'super') A.stats.supers++;             // 泼墨打中（软件版成就用）
  bumpCombo(A, B);
  B.comboTaken = n + 1;
  A.gainQi(dmg * 0.4 * QI_PER_HP); B.gainQi(dmg * 0.9 * QI_PER_HP);
  B.reel = false; B.clashed = false; B.grabbed = false; B.stagger = false;
  if (B.hp <= 0) { B.hp = 0; B.knockDown(5, dir * (d.kb * 0.6 + 2), 40, true); }
  else if (crash) B.knockDown(punchDive ? 2.5 : d.launch || d.launchAir || 4, dir * (d.kb * 0.6 + 2.5), LIE_CRASH, false);
  else if (offBalance) B.knockDown(3.5, dir * 2.5, LIE_HIT - 4, false);
  else if (!d.flurry && (d.launch || (d.launchAir && wasAir) || diveKD)) B.knockDown(d.launch || d.launchAir || 3, dir * (d.kb * 0.6 + 2), d.lie || LIE_HIT, false);
  else if (d.stagger) {
    // 2.0.2 回身肘打在背上（Jack）：他被打得背对着你、往前踉跄一下 —— 强制背对（这几帧不自动转身，和朝向吸附不冲突），
    // 打得中、动不了（hit 状态，挡不了）。踉跄完了（stunT 到 0）才又自动面向对手
    B.state = 'hit'; B.stunT = STAGGER; B.stagger = true; B.hurtHeavy = true; B.facing = dir;
    B.kvx = dir * d.kb; if (wasAir) { B.vz = Math.max(B.vz, 2.5); B.vx = 0; }
    B.move = null; B.chain = []; B.chainIdle = 99; B.runT = 0;
  }
  else {
    const bonusStun = punish && label === punish[0] ? PUNISH_STUN : label === '截住闪身' ? SLIP_CAUGHT_STUN : 0;
    B.state = 'hit'; B.stunT = (flowMove ? d.stun + FLOW_STUN * A.flow : Math.max(STUN_FLOOR, d.stun - STUN_DECAY * n)) + (m.air ? AIR_STUN : 0) + bonusStun;   // 2.9 顺的招硬直不衰减、越顺越长
    B.hurtHeavy = !!d.heavy || d.kind === 'kick';
    B.kvx = dir * d.kb * (1 + (flowMove ? 0 : KB_GROW * n)); if (wasAir) { B.vz = Math.max(B.vz, 2.5); B.vx = 0; }
    B.move = null; B.chain = []; B.chainIdle = 99; B.runT = 0;
    // 2.9 截膝踢中：他失衡一下（踉跄着往后倒，控得住，好接）
    if (d.reelHit) { B.reel = true; B.reelKind = 'knee'; B.reelBy = A.idx; B.reelKD = false; B.stunT = Math.max(B.stunT, Y_REEL_HIT); }
    // 2.9 连环寸拳：第一拳打中就钉住他，后面一拳一拳地打（fighter.js attackStep → flurryStep）
    if (d.flurry) { m.fi = 0; m.ft = 0; m.flurry = true; B.stunT = d.flurry.every * 3 + 6; B.kvx = dir * d.flurry.kb; }
  }
  if (flowMove) {
    A.flow = Math.min(FLOW_MAX, A.flow + 1);
    if (A.flow === FLOW_COUNTER && !game.quiet) tag(A.x, A.J.head[1] - 74, '顺', A, 26);   // 顺到跑不掉了：头上一个「顺」
    if (B.state === 'down' || B.state === 'ko') A.flow = 0;          // 打倒了：这一串完了（他起身的时候压上去，又是反打，第一下就顺）
  }
  if (d.dive) {
    // 坠山踩中：顺着这一脚落下来、落在对手面前。没踩倒的话这一下算「腿起手」—— 落地 踢 = 二起脚、重 = 盖步砸拳、拳 = 落步冲拳。
    // 1.9.4：近身直着踩下来的，落地前顺势往后带到对手面前 DIVE_LAND_GAP（不落在对手身上）
    let fall = 0;
    for (let z = A.alt, vz = -DIVE_RIDE; z > 0 && fall < 60; fall++) { z += vz; vz -= GRAV; }   // 还要几帧落地（和 update 一样算）
    A.vz = -DIVE_RIDE; A.vx = -dir * clamp((DIVE_LAND_GAP - (B.x - A.x) * dir) / Math.max(1, fall), 0.8, 4);
    if (B.state === 'hit') { A.chain = ['kick']; A.chainIdle = 0; }
  }
  if (crash) crashFx(B, dir, A);
  if (atWall(B)) A.kvx = -dir * d.kb * 0.7;
  game.freeze = stop((d.stop || 4) + (label ? 2 : 0));
  if (d.shake) game.shake = Math.max(game.shake, d.shake);
  hitFx(d.fx, c, A, B);
  const relLabel = !!beatVs && label === TIER_NAME[d.tier] + '克' + TIER_NAME[beatVs];   // 「腿克重」这种：不飘字，只进打桩面板
  // 2.0.1 字幕的颜色归属：这一下打出来的东西（加成、失衡、伤害、招式印章）都是出招的人 A 的颜色
  if (label && !relLabel) tag(B.x + dir * 10, B.J.head[1] - 36, label + ' ×' + lmul, A, 21);
  if (m.dashIn) tag(A.x, A.J.head[1] - 60, '冲势 ×' + DASH_IN_MUL, A, 20);
  note(A, B, dmg, [label, m.dashIn ? '冲势' : null].filter(Boolean).join(' · ') || '打中');
  cev('hit', A, B, { name: m.name, how: A.info.how, dmg, tier: d.tier, height: d.height, air: !!m.air, crash, offBalance, rising, back: backHit,
    wrong: wrongGuard, bMove: bm ? bm.name : null, bStartup: inStartup, bState: B.state });
  // 对方在挡却挡不住：为什么（打桩面板上写给出招的人看）
  if (backHit) A.info.why = '打在背后，挡不住';
  else if (wrongGuard) A.info.why = d.height === 'low' ? '下段：站着挡不住' : '上段：蹲着挡不住';
  else if (rising) A.info.why = '打在起身硬直里：刚站起来，还挡不了';
  else if (label === '截住闪身') A.info.why = '闪身只躲得过重拳';
  else if (d.stagger && B.stagger) A.info.why = '闪身躲过重拳，回身一肘打在背上：他背对着你踉跄、动不了，你先动';
  if (offBalance) tag(B.x, B.J.head[1] - 62, '失衡', A, 24);
  tag(c.x + dir * 10, c.y - 14, '-' + dmg, A, 18);          // 2.4 跳起来打中的也只写伤害（以前前面加「空中」）
  const sx0 = A.J.head[0] - dir * 52, sy0 = A.J.head[1] - 46;
  if (d.stamp) { stamp(sx0, sy0, d.stamp, 30, A); A.stats.specials++; }
  else if (d.rush && !A.rushStamped) { A.rushStamped = true; stamp(sx0, sy0, '连珠快拳', 26, A); A.stats.specials++; }
  else if (d.tag) tag(A.J.head[0] - dir * 10, A.J.head[1] - 38, d.tag, A, 18);
  Sound.hit(d.power || 0.4);
}
function guard(A, B, c) {
  const m = A.move, d = m.def, dir = A.facing;
  const chip = Math.max(1, Math.round(d.dmg * (m.air ? AIR_BONUS : 1) * BLOCK_KEEP));
  B.hp = Math.max(1, B.hp - chip);
  // 1.8.0：击倒招被挡住，两人几乎不被弹开 —— 留在原地吃反击（挡后反击）
  const kd = !!d.launch, light = d.tier === 'light' || d.kind === 'push';
  // 2.1 重系、腿系被挡住推得没那么远、收招更长（BLOCK_PEN）：挡住以后上前一步就打得到它收招（挡后反击）；拳还是推得开、不加收招
  B.state = 'blockstun'; B.stunT = d.bstun + (m.dashIn ? DASH_IN_BSTUN : 0); B.kvx = dir * d.kb * (kd ? 0.5 : light ? 0.9 : 0.6);
  A.kvx = -dir * d.kb * (atWall(B) ? 0.8 : (m.dashIn ? 0.2 : kd ? 0.15 : light ? 0.4 : 0.3));      // 被挡住，攻击方也被弹回一点（冲势冲得进去）
  if (!m.air && !d.script && !light) m.pen = kd ? BLOCK_PEN_KD : BLOCK_PEN;
  note(A, B, chip, '被挡');
  cev('guard', A, B, { name: m.name, height: d.height, low: !!B.lowBlock });
  if (m.dashIn) tag(A.x, A.J.head[1] - 60, '冲势压制', A, 18);
  if (d.dive) {
    // 坠山被站挡住：往后翻着弹开（落地对方稍微先动，但够不着白打）。
    // 2.8（Jack：别的翻回去都要和被腿顶回去一样远）：照翻滚回去的速度飞（TUMBLE_VX / VZ，同一个高度撞上飞得一样远、一样高），
    // 以前只弹开 80 左右。招拉到落地才完（m.pen：落地后摇照旧），挡的人的挡住硬直跟着拉长，还是比它早 DIVE_BLOCK_ADV 帧能动
    if (A.alt <= 0) A.alt = 0.01;
    A.vz = TUMBLE_VZ; A.vx = -dir * TUMBLE_VX; A.kvx = 0;
    const fly = tumbleFly(A.alt, TUMBLE_VZ);
    m.bFly = fly;
    m.pen = grid(Math.max(0, m.t + fly + 2 - (m.S + d.A + d.R)));
    B.stunT = Math.max(B.stunT, grid(fly + TA(7) - DIVE_BLOCK_ADV));
  }
  m.blocked = true; B.stats.blocks++; A.flow = 0;                     // 2.9 被挡住：迎春拳的顺断了
  B.guardOn = m.serial;                                               // 挡住的是哪一招：打它收招算「挡后反击」
  B.stompFor = d.height === 'low' && d.kind === 'kick' && !m.air && B.lowBlock ? m.serial : -1;   // 蹲挡住下段腿：能踩腿
  B.gainQi(chip * QI_PER_HP + 2); A.gainQi(1);
  if (A.slowJab <= 0) tag(A.x, A.J.head[1] - 34, '势破', B, 20);          // 势破是挡的人 B 挡出来的：B 的颜色
  A.slowJab = SLOW_JAB_FRAMES;
  game.freeze = stop(3);
  const sx = B.x + B.facing * 20, base = B.facing > 0 ? 0 : Math.PI;
  swipe(sx, c.y, 32, base, 2.4, 6, pal(B).qi, 14);                   // 挡：一道护住身前的弧 + 火花往回崩（挡的人的颜色）
  sparks(sx + B.facing * 6, c.y, B.facing, 7, 6, pal(B).fx, 0.9, 0.4, 12);
  tag(B.x, B.J.head[1] - 22, [['挡 ', B], ['-' + chip, A]], B, 17);     // 「挡」是挡的人的颜色，掉的血是打的人的颜色
  Sound.block();
}
// 卸力：刚按下格挡就被打中。不掉血，对方失衡，自己马上能出招
function parry(A, B, c) {
  const dir = A.facing, kd = !!A.move.def.launch;
  A.move.done = true;
  A.state = 'hit'; A.stunT = PARRY_STUN + (kd ? TF(6) : 0); A.reel = true; A.clashed = false; A.stagger = false; A.hurtHeavy = false; A.grabbed = false;
  A.reelBy = B.idx; A.reelKD = kd; A.reelKind = null;                 // 卸力反击：这个人失衡中被 B 打中有加成
  A.move = null; A.chain = []; A.chainIdle = 99; A.runT = 0; A.comboLive = false; A.flow = 0;
  if (styleOf(B).chainMax) { B.chain = ['pc']; B.chainIdle = 0; }      // 2.9 迎春拳卸开以后：按重 = 摊打（一手化一手打），按拳 = 后手冲拳，顺
  A.kvx = -dir * 3; if (A.airborne) { A.vz = Math.max(A.vz, 3); A.vx = 0; }
  B.state = 'parry'; B.t = 0; B.stunT = 0; B.parryOK = false; B.kvx = 0;
  A.info = { label: '被卸力', dmg: 0, how: '失衡', adv: -PARRY_STUN, t: A.clock };
  B.gainQi(10); B.stats.parries++;
  cev('parry', A, B, { name: A.info.label });
  game.freeze = stop(9); game.shake = Math.max(game.shake, 4);
  parryFx(B, c);
  tag(B.x, B.J.head[1] - 40, '卸', B, 34);
  tag(A.x, A.J.head[1] - 30, '失衡', B, 20);
  Sound.parry();
}
/* 2.9 迎春拳的拍手 / 耕手：判定那几帧，正面打过来的招被拍开、耕开 —— 打的人失衡（往前一扑，被带过来一点），拍的人马上能出手（反打，顺）。
   拍手（站着、手往前拍）：拍得开手上的招（拳、掌、肘、肩，地上的、跳起来的都行）和跳起来的腿（不算落膝、坠山这种往下砸的）；拍不开地上的腿、下段。
   耕手（蹲着、手往下耕）：耕得开地上的腿（扫堂腿这种下段的也行）、下段的拳；耕不开中段、上段的拳掌（站着打过来的拳照样打中）。
   都防不了擒拿、推挡 */
const REEL_LABEL = { pat: '拍手反击', gaun: '耕手反击', trap: '拉手反击' };
function handCovers(g, d, m) {
  const hand = /^(fh|bh|fe|be|sh)$/.test(d.limb), leg = d.limb === 'ff' || d.limb === 'bf';
  if (g === 'pat') return d.height !== 'low' && (hand || (m.air && leg && !d.dive));
  if (g === 'gaun') return (leg && !m.air) || d.height === 'low';
  return false;
}
function handParry(A, B, c, g) {
  const m = A.move, d = m.def, dir = A.facing, kd = !!d.launch, gaun = g === 'gaun';
  m.done = true;
  A.state = 'hit'; A.stunT = (gaun ? Y_GAUN_STUN : Y_PAT_STUN) + (kd ? TF(4) : 0); A.reel = true; A.reelKind = g; A.reelBy = B.idx; A.reelKD = kd;
  A.clashed = false; A.stagger = false; A.hurtHeavy = false; A.grabbed = false;
  A.move = null; A.chain = []; A.chainIdle = 99; A.runT = 0; A.comboLive = false; A.flow = 0;
  A.kvx = dir * 1.6;                                                  // 被拍开的人往前一扑（被带过来一点：迎春拳手短，反打够得着）
  if (A.airborne) { A.vz = Math.max(A.vz, 2); A.vx = 0; }
  B.move = null; B.state = 'parry'; B.t = 0; B.stunT = 0; B.kvx = 0; B.gwalk = 0;
  B.chain = ['pc']; B.chainIdle = 0;                                   // 拍开以后：按重 = 摊打、按拳 = 后手冲拳，顺
  B.gainQi(8); B.stats.parries++;
  A.info = { label: gaun ? '被耕开' : '被拍开', dmg: 0, how: '失衡', adv: -A.stunT, t: A.clock };
  B.info = { label: gaun ? '耕手' : '拍手', dmg: 0, how: gaun ? '耕开' : '拍开', why: gaun ? '耕手耕开了地上的腿 / 下段，他失衡，你先动' : '拍手拍开了他手上的招，他失衡，你先动', adv: A.stunT, t: B.clock };
  cev('handParry', A, B, { name: m.name, guard: g });
  game.freeze = stop(8); game.shake = Math.max(game.shake, 3);
  parryFx(B, c);
  tag(B.x, B.J.head[1] - 40, gaun ? '耕' : '拍', B, 34);
  tag(A.x, A.J.head[1] - 30, '失衡', B, 20);
  Sound.parry();
}
/* 2.9 迎春拳的盘手：一直盘着的时候，正面打过来的中段、上段（拳、掌、腿）被黏住挡下 —— 像挡住一样（掉三成、打的人被弹回去、重的招收招更长），
   但盘手的人不进挡住的硬直：手还在盘，马上就能打出去（黏打：Y_STICK_WIN 之内打中 ×Y_STICK_MUL、顺 2 级起；打在他收招里算挡后反击）。
   下段、擒拿、推挡黏不住 */
function stick(A, B, c) {
  const m = A.move, d = m.def, dir = A.facing;
  const chip = Math.max(1, Math.round(d.dmg * (m.air ? AIR_BONUS : 1) * BLOCK_KEEP));
  B.hp = Math.max(1, B.hp - chip);
  m.done = true; m.blocked = true; A.flow = 0;
  const kd = !!d.launch, light = d.tier === 'light';
  A.kvx = -dir * d.kb * (light ? 0.5 : 0.35); B.kvx = dir * Math.min(2.5, d.kb * 0.3);
  if (!m.air && !d.script && !light) m.pen = kd ? BLOCK_PEN_KD : BLOCK_PEN;
  B.guardOn = m.serial; B.stickAt = B.clock;
  B.stats.blocks++; B.gainQi(chip * QI_PER_HP + 2); A.gainQi(1);
  note(A, B, chip, '被挡'); A.info.why = '盘手黏住了：挡下了，他马上能打回来';
  cev('guard', A, B, { name: m.name, height: d.height, low: false, stick: true });
  if (A.slowJab <= 0) tag(A.x, A.J.head[1] - 34, '势破', B, 20);
  A.slowJab = SLOW_JAB_FRAMES;
  game.freeze = stop(3);
  const sx = B.x + B.facing * 20, base = B.facing > 0 ? 0 : Math.PI;
  swipe(sx, c.y, 30, base, 2.6, 6, pal(B).qi, 14);
  sparks(sx + B.facing * 6, c.y, B.facing, 6, 6, pal(B).fx, 0.9, 0.4, 12);
  tag(B.x, B.J.head[1] - 22, [['黏 ', B], ['-' + chip, A]], B, 17);
  Sound.block();
}
/* 2.9 连环寸拳打中以后那一串（fighter.js attackStep 每一步调）：每 every 帧一拳，左右手交替，他一直挨打动不了（硬直续上）；
   打满 n 拳以后最后一记寸劲（last 伤害、把人打飞、打倒）。他中途倒了（血没了）、或者爆气挣开了，这一串就停 */
function flurryStep(A, m) {
  const B = A.opp, F = m.def.flurry, dir = A.facing;
  if (B.state !== 'hit' || B.grabbed) { m.flurry = false; return; }
  m.ft += DT;
  if (m.ft < F.every) return;
  m.ft -= F.every; m.fi++;
  const last = m.fi >= F.n;
  const dmg = Math.max(1, Math.round((last ? F.last : F.dmg) * Math.max(DMG_FLOOR, 1 - DMG_DECAY * B.comboTaken * FLOW_DECAY)));
  B.hp -= dmg; A.stats.hits++; B.comboTaken++;
  A.gainQi(dmg * 0.4 * QI_PER_HP); B.gainQi(dmg * 0.9 * QI_PER_HP);
  bumpCombo(A, B);
  B.holdPose = true;
  const c = contactPoint(A, B);
  if (B.hp <= 0) { B.hp = 0; B.knockDown(5, dir * (F.lastKb * 0.6 + 2), 40, true); m.flurry = false; }
  else if (last) {
    B.knockDown(m.def.launch || 5, dir * (F.lastKb * 0.6 + 2), LIE_HIT, false); m.flurry = false;
    game.freeze = stop(12); game.shake = Math.max(game.shake, 10);
    hitFx('rushEnd', c, A, B);
    stamp(A.J.head[0] - dir * 52, A.J.head[1] - 46, '寸劲', 30, A);
    A.stats.supers++;
  } else {
    B.state = 'hit'; B.stunT = F.every * 3 + 6; B.hurtHeavy = m.fi % 2 === 0; B.kvx = dir * F.kb; A.kvx = dir * F.kb;
    game.freeze = Math.max(game.freeze, stop(1.5)); game.shake = Math.max(game.shake, 2);
    hitFx('rush', c, A, B);
  }
  note(A, B, dmg, last ? '寸劲' : '连环寸拳');
  tag(c.x + dir * 8, c.y - 14 - (m.fi % 3) * 8, '-' + dmg, A, last ? 22 : 15);
  Sound.hit(last ? 1.1 : 0.32);
}
// 霸体：重招前摇里硬吃一记短拳，只掉一半血，招不停
function absorb(A, B, c) {
  const m = A.move, d = m.def, dir = A.facing;
  m.done = true; m.absorbed = true;        // 2.1 被霸体吃了的拳也能马上接下一拳（连打破霸体）
  const dmg = d.dmg > 0 ? Math.max(1, Math.round(d.dmg * (m.air ? AIR_BONUS : 1) * ARMOR_KEEP)) : 0;   // 推挡没伤害
  B.hp -= dmg; B.move.armorLeft--; B.gainQi(dmg * QI_PER_HP);
  cev('absorb', A, B, { name: m.name, by: B.move.name });
  if (B.move.def.tier !== 'super') B.move.beatVs = d.tier;   // 硬吃之后这一拳打出去算「重克拳」（2.7 泼墨本来就克一切，硬吃了也不再多加成）
  A.info = { label: d.label, dmg: 0, how: '被霸体吃了', adv: null, t: A.clock };
  A.kvx = -dir * 1.5;
  if (B.hp <= 0) { B.hp = 0; B.knockDown(4, dir * 3, 999, true); }
  game.freeze = stop(4);
  impact(c.x, c.y, -dir, 30, pal(B).ink, 6, 1.0); sparks(c.x, c.y, -dir, 6, 6, pal(B).fx, 0.8);
  tag(B.x, B.J.head[1] - 40, '霸体', B, 22);
  if (dmg) tag(c.x, c.y - 14, '-' + dmg, A, 16);
  Sound.hit(0.3);
}
// 震退：打中 / 被打中之后把人推回去（拼招、压招共用）
function recoil(F, dmg, stun, kb) {
  F.move = null; F.chain = []; F.chainIdle = 99; F.runT = 0; F.comboLive = false; F.grabbed = false; F.reel = false; F.stagger = false; F.hurtHeavy = false; F.flow = 0;
  F.hp -= dmg;
  F.state = 'hit'; F.stunT = stun; F.clashed = true;
  F.kvx = -F.facing * kb; if (F.airborne) { F.vz = Math.max(F.vz, 3); F.vx = 0; }
  if (F.hp <= 0) { F.hp = 0; F.knockDown(4, -F.facing * 3, 999, true); }
}
const dmgOf = m => m.def.dmg * (m.air ? AIR_BONUS : 1);
// 平（拼招）：主系、起手都一样，同时打中，两边各吃五成，互相震退
function clash(A, B) {
  const ma = A.move, mb = B.move;
  ma.done = mb.done = true;
  const dA = Math.max(1, Math.round(dmgOf(mb) * CLASH_KEEP)), dB = Math.max(1, Math.round(dmgOf(ma) * CLASH_KEEP));
  const ca = contactPoint(A, B), cb = contactPoint(B, A);
  const mx = (A.x + B.x) / 2, my = (ca.y + cb.y) / 2;
  A.info = { label: ma.def.label, dmg: dB, how: '拼招', adv: 0, t: A.clock };
  B.info = { label: mb.def.label, dmg: dA, how: '拼招', adv: 0, t: B.clock };
  for (const [F, dmg] of [[A, dA], [B, dB]]) {
    F.gainQi(dmg * 0.9 * QI_PER_HP + 3); F.stats.clashes++; F.comboTaken = 0;
    recoil(F, dmg, CLASH_STUN, CLASH_KB);
    tag(F.x, F.J.head[1] - 18, '-' + dmg, F.opp, 17);
  }
  game.freeze = stop(10); game.shake = Math.max(game.shake, 6);
  clashFx(mx, my, A, B);                                   // 平手：两边的特效一样多
  cev('clash', A, B, { name: ma.name, by: mb.name });
  tag(mx, my - 56, '拼', [A, B], 40);                       // 「拼」两人各半个颜色
  Sound.clash();
}
// 压：主系一样、起手克制。两边都打中，被压的 L 吃全额、被打退；压人的 W 只吃三成、小硬直，能接着打
function overpower(W, L) {
  const mw = W.move, ml = L.move, dir = W.facing;
  mw.done = ml.done = true; mw.hit = true;
  const dL = Math.max(1, Math.round(dmgOf(mw))), dW = Math.max(1, Math.round(dmgOf(ml) * PRESS_KEEP));
  const c = contactPoint(W, L);
  const nameW = mw.def.label, nameL = ml.def.label, leadW = mw.def.lead, leadL = ml.def.lead;
  W.gainQi(dW * 0.9 * QI_PER_HP + 3); L.gainQi(dL * 0.9 * QI_PER_HP);
  W.stats.presses++; W.stats.hits++; if (mw.def.tier === 'super') W.stats.supers++;
  recoil(W, dW, PRESS_STUN, 3);
  bumpCombo(W, L);
  recoil(L, dL, Math.max(STUN_FLOOR, mw.def.stun), mw.def.kb * 1.2 + 3);
  W.info = { label: nameW, dmg: dL, how: '压 ' + nameL, adv: L.stunT - PRESS_STUN, t: W.clock };
  W.comboDmg = dL; W.maxComboDmg = Math.max(W.maxComboDmg, dL);
  L.info = { label: nameL, dmg: dW, how: '被压', adv: PRESS_STUN - L.stunT, t: L.clock };
  L.clashed = false; L.hurtHeavy = true; L.kvx = dir * (mw.def.kb * 1.2 + 3);
  game.freeze = stop(10); game.shake = Math.max(game.shake, 6);
  clashFx(c.x, c.y, W, L, 1, 0.35); hitFx(mw.def.fx, c, W, L);   // 压：压人的那边特效多，被压的那边少
  tag(c.x, c.y - 56, '压', W, 36);
  cev('press', W, L, { name: mw.name, by: ml.name });
  W.info.why = `起手 ${TIER_NAME[leadW]}克${TIER_NAME[leadL]}`; L.info.why = `起手 ${TIER_NAME[leadL]}被${TIER_NAME[leadW]}克`;
  tag(L.x, L.J.head[1] - 14, '-' + dL, W, 18); tag(W.x, W.J.head[1] - 14, '-' + dW, L, 15);
  Sound.clash(); Sound.hit(0.7);
}
// 翻滚回去（1.9.0）：空中的腿（飞踢、坠山）撞上地上的腿 —— 不算被克死，空中那个人吃一半伤害、往后翻着飞回去（飞得远，
// 途中打不中他）；地上那个人不掉血，只被撞退一点。落地后差不多一起动，等于把距离拉开重来，地上那方小赚
// 2.7（Jack：要翻回去平等，对方抓不到受击时间）：飞得远、翻得高（TUMBLE_VX / VZ）；地上那个人这一腿收招拉长到
// 翻回去的人落地、能动的那一刻（tumbleFly 算出要飞多久），收招里也不能接别的招 —— 两个人同时能动，隔着几个身位重来（2.7.1 飞五六个身位）
function tumble(A, B) {            // A = 空中出腿的，B = 地上出腿的
  const ma = A.move, mb = B.move, away = A.x >= B.x ? 1 : -1;
  ma.done = mb.done = true; mb.hit = true;
  const dmg = Math.max(1, Math.round(mb.def.dmg * TUMBLE_KEEP));
  const c = contactPoint(B, A);
  A.hp -= dmg; B.stats.hits++;
  A.gainQi(dmg * 0.9 * QI_PER_HP); B.gainQi(dmg * 0.4 * QI_PER_HP + 2);
  A.move = null; A.chain = []; A.chainIdle = 99; A.comboLive = false; A.comboTaken = 0; A.reel = false; A.clashed = false; A.stagger = false; A.grabbed = false; A.runT = 0;
  A.facing = -away;                                         // 面朝对手往后翻
  if (A.hp <= 0) { A.hp = 0; A.knockDown(4, away * 4, 999, true); }
  else {
    A.state = 'tumble'; A.t = 0; A.vz = TUMBLE_VZ; A.vx = away * TUMBLE_VX; A.kvx = 0; A.airUsed = true; if (A.alt <= 0) A.alt = 0.01;
    A.tumFly = tumbleFly(A.alt, TUMBLE_VZ);
    const left = mb.S + mb.def.A + mb.def.R + (mb.pen || 0) - mb.t, want = A.tumFly + TUMBLE_LAND;
    if (want > left) mb.pen = (mb.pen || 0) + grid(want - left);
    mb.tumbled = true;
  }
  B.kvx = -away * 3;
  A.info = { label: ma.def.label, dmg: 0, how: '被顶回去', adv: null, t: A.clock };
  B.info = { label: mb.def.label, dmg, how: '顶回去', adv: null, t: B.clock };
  game.freeze = stop(7); game.shake = Math.max(game.shake, 5);
  tumbleFx(A, B, c);
  cev('tumble', B, A, { name: mb.name, by: ma.name });     // 报告成「B 把 A 顶回去」
  tag(A.x, A.J.head[1] - 34, '翻', B, 34);
  tag(c.x, c.y - 14, '-' + dmg, B, 17);
  Sound.clash(); Sound.hit(0.5);
}
// 2.7 翻回去要飞多久（帧）：照 update 里的重力一步一步算（落地那一步为止），和墙、横着飞多远无关
function tumbleFly(alt, vz) {
  let a = alt, v = vz, n = 0;
  while (a > 0 && n < 4000) { a += v * DT + GRAV * GH; v -= GRAV * DT; n++; }
  return n * DT;
}
// 推挡：没伤害，把对方推开并打断
function shoveHit(A, B) {
  const m = A.move, dir = A.facing;
  m.done = true; m.hit = true;
  B.holdPose = true;          // 2.4 推中那一帧先不动（只是画面，和 applyHit 一样）
  B.kvx = dir * PUSH_KB;
  if (B.isBlocking() && B.facingTo(A)) { B.state = 'blockstun'; B.stunT = 8; }
  else {
    B.state = 'hit'; B.stunT = PUSH_STUN; B.reel = true; B.reelKind = 'push'; B.clashed = false; B.stagger = false; B.hurtHeavy = false; B.grabbed = false;
    B.move = null; B.chain = []; B.chainIdle = 99; B.runT = 0;
  }
  if (B.airborne) { B.vz = Math.max(B.vz, 2); B.vx = 0; }
  if (atWall(B)) A.kvx = -dir * PUSH_KB * 0.6;
  game.freeze = stop(4);
  shoveFx(A, B);
  cev('shove', A, B, {});
  tag(B.x, B.J.head[1] - 30, '推开', A, 22);
  Sound.block();
}
// 擒拿抓空（对方蹲着躲开 / 抄腿抄不到站着的）：标一下为什么没抓到
function grabMiss(A, B, why) {
  const m = A.move;
  if (m.missTag) return;
  m.missTag = true;
  if (why === 'duck') tag(B.x, B.J.head[1] - 30, '蹲身闪过', B, 22);
  A.info = { label: m.def.label, dmg: 0, how: '抓空', why: why === 'duck' ? '站着的擒拿抓不到蹲着的（要蹲 + 拿）' : '抄腿抓不到站着的', adv: null, t: A.clock };
  cev('grabMiss', A, B, { name: m.name, why });
}
function dodged(A, B) {
  const m = A.move;
  if (!m.dodged) { m.dodged = true; tag(B.x, B.J.head[1] - 30, '闪', B, 26); cev('dodge', A, B, { name: m.name }); }
}
// 2.0 闪身躲过一下：这一下打空（收不回来、也接不了连招）。2.0.2：只躲得过重拳；钻过去的人记一笔 —— 钻到他身后自动回身一肘（fighter.js slipElbow）。
// 字幕只出闪的人的（「闪」、回身肘的印章），不出挨打的人怎么了（Jack）
function slippedBy(A, B) {
  const m = A.move;
  m.done = true; m.slipped = true;
  B.slipGot = true; B.move.evaded = true;
  slipDodgeFx(B, A);
  cev('slip', A, B, { name: m.name });
  tag(B.x, B.J.head[1] - 34, '闪', B, 30);
  B.info = { label: '闪身', dmg: 0, how: '闪过', why: '闪身躲过了重拳，钻到他身后接着回身一肘', adv: null, t: B.clock };
  A.info = { label: m.def.label, dmg: 0, how: '被闪过', why: '对面在闪身：重拳打不中，换短拳、腿、下段、擒拿截它', adv: null, t: A.clock };
  Sound.whoosh(0.8);
}
function tech(a, b) {
  a.move.done = b.move.done = true; a.kvx = -a.facing * 6; b.kvx = -b.facing * 6;
  tag((a.x + b.x) / 2, FLOOR - 150, '拆', [a, b], 30); Sound.block(); game.freeze = stop(6);   // 拆投是平手：两人各半个颜色
  cev('tech', a, b, {});
}
function doGrab(A, B, type) {
  cev('grab', A, B, { kind: type, name: A.move.name, bMove: B.state === 'attack' && B.move ? B.move.name : null, bState: B.state });
  A.move.done = true; A.move.hit = true;
  const dir = A.facing;
  B.reel = false; B.clashed = false; B.stagger = false;
  if (type === 'trap') {
    // 2.9 迎春拳的拉手：把打过来的手拉过来 —— 他失衡、往你怀里扑（拽过来一点），你拽回来就能接一整套（顺）
    const bName = B.move ? B.move.def.label : '';
    B.hp -= Y_TRAP_DMG; A.stats.hits++; A.stats.specials++;
    A.gainQi(Y_TRAP_DMG * 0.4 * QI_PER_HP + 4); B.gainQi(Y_TRAP_DMG * 0.9 * QI_PER_HP);
    B.state = 'hit'; B.stunT = Y_TRAP_STUN; B.reel = true; B.reelKind = 'trap'; B.reelBy = A.idx; B.reelKD = false; B.hurtHeavy = false; B.grabbed = false;
    B.move = null; B.chain = []; B.chainIdle = 99; B.runT = 0; B.comboLive = false; B.flow = 0;
    B.kvx = -dir * 3.2; if (B.airborne) { B.vz = 0; B.vx = 0; }
    A.startScript('yTrap'); A.chain = ['pc']; A.chainIdle = 0;
    game.freeze = stop(6); game.shake = Math.max(game.shake, 3);
    bumpCombo(A, B); noteGrab(A, Y_TRAP_DMG, '拉手');
    A.info.why = '他出' + bName + '的时候拉住了他的手：他失衡，你接着打';
    burst(B.x - dir * 10, B.J.fh[1], -dir, 6, 24, 3, pal(A).fx);
    stamp(A.J.head[0] - dir * 52, A.J.head[1] - 46, '拉手', 28, A);
    tag(B.x, B.J.head[1] - 30, '失衡', A, 20);
    Sound.hit(0.4);
    if (B.hp <= 0) { B.hp = 0; B.knockDown(4, dir * 3, 999, true); }
    return;
  }
  if (type === 'catch' || type === 'scoop') {
    // 接腿摔（站着拿住对方的腿）/ 抄腿摔（蹲着抄住对方的腿，扫堂腿也算）：马上摔倒，挣不脱
    const scoop = type === 'scoop', wasSweep = !!(B.move && B.move.def.height === 'low');
    const airK = !scoop && (B.airborne || (B.move && B.move.air));
    const dmg = scoop ? SCOOP_DMG : airK ? CATCH_AIR_DMG : CATCH_DMG;
    B.hp -= dmg; A.stats.hits++; A.stats.specials++;
    A.gainQi(dmg * 0.4 * QI_PER_HP); B.gainQi(dmg * 0.9 * QI_PER_HP);
    const foot = B.J.ff;
    B.knockDown(airK ? 3.5 : scoop ? 4.5 : 5, dir * (scoop ? 1 : 1.6), airK ? LIE_AIR : LIE_GROUND, B.hp <= 0);
    A.startScript(scoop ? 'scoop' : 'legCatch');
    game.freeze = stop(10); game.shake = Math.max(game.shake, 6);
    dust(foot[0], foot[1], 5); impact(foot[0], foot[1], dir, 36, pal(A).ink, 6, 1.0); sparks(foot[0], foot[1], dir, 8, 7, pal(A).fx, 1.0, 0.4);
    const catchLabel = A.moves[scoop ? 'scoop' : 'legCatch'].label;          // 2.9 迎春拳是「截腿摔」
    stamp(A.J.head[0] - dir * 52, A.J.head[1] - 46, catchLabel, 30, A);
    tag(B.x, B.J.head[1] - 30, scoop ? (wasSweep ? '扫堂腿被抄' : '腿被抄住') : airK ? '腿被接 · 久倒' : '倒地', A, 18);
    tag(B.x + dir * 16, B.J.head[1] + 4, '-' + dmg, A, 18);
    Sound.hit(0.7);
    bumpCombo(A, B); noteGrab(A, dmg, catchLabel);
  } else {
    // 擒住（站着抓住 / 抄腿抓住蹲着的）：对手被揪住，后续看擒住期间按什么（fighter.js attackStep 'hold'）
    const pick = A.move.pick || null;
    B.state = 'hit'; B.stunT = 90; B.hurtHeavy = false; B.grabbed = true; B.heldAt = B.clock; B.move = null; B.chain = []; B.chainIdle = 99;
    B.kvx = 0; B.runT = 0; B.lowBlock = false; B.comboLive = false;
    A.startScript('hold'); A.move.holdKind = type; A.move.pick = type === 'tackle' ? 'tackle' : pick;
    game.freeze = stop(5);
    const y = FLOOR - 70;
    dust(B.x, FLOOR, 3); burst(B.x - dir * 10, y, dir, 6, 24, 3, pal(A).fx);
    tag(B.x, B.J.head[1] - 26, type === 'tackle' ? '抄腿' : '擒住', A, 20);
    Sound.hit(0.3);
  }
  if (B.hp <= 0) { B.hp = 0; if (B.state !== 'ko') B.knockDown(4, dir * 3, 999, true); }
}
// 挣脱：被擒住的人及时按「拿」—— 两边一起被弹开，谁也不吃亏
function escapeGrab(A, B) {
  const dir = A.facing;
  for (const [F, s] of [[A, -1], [B, 1]]) {
    F.move = null; F.state = 'hit'; F.stunT = TF(10); F.clashed = true; F.reel = false; F.stagger = false; F.grabbed = false; F.carried = false; F.hurtHeavy = false;
    F.chain = []; F.chainIdle = 99; F.runT = 0; F.comboLive = false; F.kvx = dir * s * 7;
  }
  B.stats.escapes++; B.info = { label: '挣脱', dmg: 0, how: '挣脱', adv: 0, t: B.clock }; A.info = { label: '擒拿', dmg: 0, how: '被挣脱', adv: 0, t: A.clock };
  cev('escape', B, A, {});
  game.freeze = stop(6);
  const mx = (A.x + B.x) / 2;
  impact(mx, FLOOR - 80, A.x >= mx ? 1 : -1, 36, pal(B).ink, 5, 1.3); impact(mx, FLOOR - 80, B.x >= mx ? 1 : -1, 36, pal(A).ink, 5, 1.3);
  tag(mx, FLOOR - 160, '挣脱', B, 30);
  Sound.block();
}
// 被擒住的人身上的一下（推开 / 提膝 / 摔）：扣血、记连击、打桩面板
function grabDamage(A, B, dmg, label, big) {
  B.hp -= dmg; A.stats.hits++; if (big) A.stats.specials++;
  A.gainQi(dmg * 0.4 * QI_PER_HP); B.gainQi(dmg * 0.9 * QI_PER_HP);
  bumpCombo(A, B); noteGrab(A, dmg, label);
  tag(B.x + A.facing * 16, B.J.head[1] + 4, '-' + dmg, A, 18);
}
// 推开（擒住后什么都不按）：把人推出去，自己先动一点
function grabPush(A, B, left) {
  grabDamage(A, B, A.moves.grab.dmg, A.moves.grab.label + ' · ' + A.moves.grabHit.label, false);
  B.grabbed = false; B.stunT = left + TA(4); B.kvx = A.facing * 8; B.hurtHeavy = false;
  game.freeze = stop(4); dust(B.x, FLOOR, 3); burst(B.x, FLOOR - 70, A.facing, 6, 24, 3, pal(A).fx);
  Sound.hit(0.4);
  if (B.hp <= 0) { B.hp = 0; B.knockDown(4, A.facing * 3, 999, true); }
}
// 提膝撞：顶两下，第二下放开，对方还在硬直里 —— 你先动 KNEE_ADV 帧
function kneeHit(A, B, second, left) {
  const kl = A.move ? A.move.def.label : '提膝撞';                     // 2.9 迎春拳是「拉打」
  grabDamage(A, B, KNEE_DMG[second ? 1 : 0], kl, second);
  game.freeze = stop(second ? 6 : 4); game.shake = Math.max(game.shake, second ? 4 : 2);
  const k = A.J.ff; impact(k[0], k[1] - 10, A.facing, second ? 36 : 28, pal(A).ink, 6, 1.0); sparks(k[0], k[1] - 10, A.facing, 6, 6, pal(A).fx, 0.9, 0.5);
  if (second) {
    B.grabbed = false; B.stunT = left + KNEE_ADV; B.kvx = A.facing * 5; B.hurtHeavy = true;
    stamp(A.J.head[0] - A.facing * 52, A.J.head[1] - 46, kl, 26, A);
  }
  Sound.hit(second ? 0.7 : 0.45);
  if (B.hp <= 0) { B.hp = 0; B.knockDown(4, A.facing * 3, 999, true); }
}
// 别腿摔 / 抱腿摔：把人摔在面前（倒得近，起身由你压）
function slamDown(A, B, name) {
  const trip = name === 'trip', dmg = trip ? TRIP_DMG : TACKLE_DMG, sl = A.moves[name].label;   // 2.9 迎春拳是「扫踢摔」「按摔」
  grabDamage(A, B, dmg, sl, true);
  B.knockDown(trip ? -1.5 : -2.5, A.facing * (trip ? 2.5 : 4), TFH(trip ? 36 : 34), B.hp <= 0); B.slam = true;   // 2.7 躺 ×0.9（40 / 38 → 36 / 34）
  if (B.hp <= 0) B.hp = 0;
  game.freeze = stop(8); game.shake = Math.max(game.shake, 7);
  dust(B.x, FLOOR, 9, true);
  stamp(A.J.head[0] - A.facing * 52, A.J.head[1] - 46, sl, 28, A);
  Sound.hit(0.9);
}
function bumpCombo(A, B) {
  const inStun = B.state === 'hit' || B.state === 'down' || B.state === 'ko' || B.freeAt === B.clock;
  if (!(A.comboLive && inStun) && A.combo >= 1) A.prevCombo = { hits: A.combo, dmg: A.comboDmg };   // 上一套（打桩面板看连没连上）
  A.combo = A.comboLive && inStun ? A.combo + 1 : 1;
  A.comboLive = true;
  if (A.combo >= 2) A.comboT = 90;
  A.stats.maxCombo = Math.max(A.stats.maxCombo, A.combo);
  comboFx(A);                                           // 1.9.4：3 连起每打中一下身上炸开一圈气浪（只是画面）
}
// 推挤：软碰撞。身体重叠时每帧最多推开 SOFT_PUSH，跑着能挤过去、换到对面
function separate(a, b) {
  if (a.carried || b.carried) return;               // 过肩摔扛着的时候不推挤
  const d = b.x - a.x, ad = Math.abs(d), min = PUSH * 2;
  // 两人最远距离：只有双人对战（和菜单背景）要两人都在画面里；人机 / 联机 / 打桩镜头跟着自己，不限
  const maxD = game.mode === 'pvp' || game.mode === 'attract' ? MAXD_PVP : Infinity;
  if (ad > maxD) { const s = d > 0 ? 1 : -1, ex = (ad - maxD) / 2; a.x += s * ex; b.x -= s * ex; return; }
  const rolling = F => F.state === 'down' && F.downPhase === 'getup' && F.rollDir;
  if (rolling(a) || rolling(b)) return;             // 滚身起能从人脚下滚过去
  const dashing = F => F.state === 'attack' && F.move && (F.move.name === 'dash' || F.move.name === 'slip');
  if (ad >= min || a.airborne || b.airborne || dashing(a) || dashing(b)) return;   // 冲刺、闪身时身子能穿过去
  const push = Math.min((min - ad) / 2, SOFT_PUSH * DT), s = d > 0 ? 1 : d < 0 ? -1 : (a.facing > 0 ? 1 : -1);   // 2.6 每步推 DT 帧那么多
  a.x -= s * push; b.x += s * push;
  a.x = clamp(a.x, WALL_L, WALL_R); b.x = clamp(b.x, WALL_L, WALL_R);
}
