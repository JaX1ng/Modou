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
const stop = n => Math.round(n * HITSTOP);
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
const airKick = F => liveMove(F) && F.move.air && F.move.def.kind === 'kick';            // 飞踢、千斤坠
const groundKick = F => liveMove(F) && !F.move.air && F.move.def.tier === 'kick' && F.move.def.height !== 'low';   // 地上的腿（扫堂腿、踩腿贴地，不算）
const diving = F => liveMove(F) && !!F.move.def.dive;                                     // 千斤坠还在往下踩
const aaProof = F => liveMove(F) && !!F.move.def.aaProof;                                 // 千斤坠：对空招打不到它
// 2.0 闪身：正在钻（slipInv 那几帧）的人。2.0.2（Jack）：只躲得过重拳 —— 站着打的重系手上招（重拳、崩拳、劈挂掌、盖步砸拳、铁山靠、截拳），
// 短拳、腿、下段、对空、空中招、擒拿都打得中他（截住闪身）
const slipping = F => F.state === 'attack' && !!F.move && F.move.name === 'slip' && F.inFrames('slipInv');
const slipDodges = m => !m.air && m.def.tier === 'heavy' && m.def.kind === 'heavy' && m.def.height !== 'low';
function grabIntent(A, B) {
  const m = A.move;
  if (A.state !== 'attack' || !m || m.def.kind !== 'grab' || m.done || !A.inActive() || B.invuln()) return null;
  const dist = (B.x - A.x) * A.facing;
  const bm = B.state === 'attack' ? B.move : null;
  const kicking = !!bm && bm.def.kind === 'kick' && !bm.def.dive && bm.t >= 3 && bm.t <= bm.S + bm.def.A && B.facingTo(A);
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
  // 地上的招打不到太高的人（对空招另算）。1.9.0：千斤坠踩下来的时候，站着的招能迎着打到 DIVE_AA_ALT 那么高；
  // 对手在空中出腿的时候，地上的腿能迎上去够到 KICK_AA_ALT（两条腿撞上 = 把他顶回去）
  if (!m.air && B.airborne && B.alt > Math.max(d.antiAir || AIR_SAFE, diving(B) ? DIVE_AA_ALT : 0,
    d.tier === 'kick' && d.height !== 'low' && airKick(B) ? KICK_AA_ALT : 0)) return false;
  if (m.air && A.alt - B.alt > (d.vreach || 999)) return false;
  return true;
}
// A 这一招打不打得到 B（无敌帧）：托天掌的对空无敌防不住千斤坠，对空招也打不到千斤坠（1.9.0）
function shielded(A, B, m) {
  if (B.strikeInv()) return true;
  if (m.air && !m.def.dive && B.airInv()) return true;
  return m.def.tier === 'aa' && aaProof(B);
}
function strikeIntent(A, B) {
  const m = A.move;
  if (A.state !== 'attack' || !m || m.done || m.def.kind === 'grab' || !A.inActive() || B.invuln()) return null;
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
  if (B.state !== 'attack' || !m || m.done || m.def.script || m.def.kind === 'grab' || m.def.kind === 'push') return false;
  if (m.t > m.S + m.def.A || m.S - m.t > lead) return false;
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
  if (ga === 'catch' || ga === 'scoop') sb = null;          // 接腿 / 抄腿：腿被抱住了，踢不到
  if (gb === 'catch' || gb === 'scoop') sa = null;
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
  if (airKick(A) && groundKick(B)) return tumble(A, B);
  if (airKick(B) && groundKick(A)) return tumble(B, A);
  const r = relation(A.move.def, B.move.def);
  if (r === 1) applyHit(A, B, 'beat');
  else if (r === -1) applyHit(B, A, 'beat');
  else if (r > 0) overpower(A, B);
  else if (r < 0) overpower(B, A);
  else clash(A, B);
}
function strikeOn(A, B) {
  if (A.move.def.push) return shoveHit(A, B);
  if (groundKick(A) && airKick(B)) return tumble(B, A);       // 地上出腿迎上空中的腿：顶回去
  if (committed(B, A, TRADE_LEAD)) return exchange(A, B);
  if (readBeat(B, A)) return evade(A, B);
  applyHit(A, B, null);
}
// 读招：B 的招主系克制 A 的招，B 已经起势（前摇第 3 帧以后、BEAT_LEAD 帧内就出来）
// → A 这一下被化解打空，B 的招照常打出并算克制。重拳对短拳走「霸体」，不走这里
function readBeat(B, A) {
  const m = B.move, ta = A.move.def.tier;
  if (B.state !== 'attack' || !m || m.done || m.def.script || m.t < 3 || m.t > m.S) return false;
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
  const c = contactPoint(A, B);
  const bm = B.state === 'attack' && B.move && !B.move.def.script ? B.move : null;
  const inStartup = !!bm && bm.t <= bm.S;
  const front = B.facingTo(A);
  if (B.isBlocking() && front && B.parryReady()) return parry(A, B, c);
  if (B.isBlocking() && front && B.blockHeightOK(d.height)) return guard(A, B, c);
  if (!how && B.armored(d.tier)) return absorb(A, B, c);

  let label = null, mul = m.air ? AIR_BONUS : 1;
  const beatVs = how === 'beat' && bm ? bm.def.tier : m.beatVs || (inStartup && beats(d.tier, bm.def.tier) > 0 ? bm.def.tier : null);
  // 迎击：打在全速跑过来、或冲刺收尾（无敌帧过了）的人身上
  const charging = (B.state === 'run' && B.runT >= RUN_CHARGE) || (B.state === 'attack' && B.move && B.move.name === 'dash');
  // 1.8.0 防守反击：挡后反击（打在自己刚挡住的那一招收招里）、破绽（击倒招打空了打它收招）、卸力反击（卸力后趁失衡打）
  const inRecovery = !!bm && bm.t > bm.S + bm.def.A;
  let punish = null;
  if (inRecovery && A.guardOn === bm.serial) punish = ['挡后反击', bm.def.launch ? PUNISH_KD_MUL : PUNISH_MUL];
  else if (inRecovery && bm.def.launch && !bm.hit) punish = ['破绽', WHIFF_KD_MUL];
  else if (B.state === 'hit' && B.reel && B.reelBy === A.idx) punish = ['卸力反击', B.reelKD ? PUNISH_KD_MUL : PARRY_MUL];
  let lmul = 1;
  // 2.0 闪身：钻的时候挨了打（2.0.2 起：短拳、腿、下段这些它躲不过的）= 截住闪身
  const caughtSlip = B.state === 'attack' && !!B.move && B.move.name === 'slip';
  if (d.stagger) { /* 2.0.2 回身肘：不另算加成（它本身就是闪身的收益：打完他踉跄、你先动） */ }
  else if (beatVs) { label = TIER_NAME[d.tier] + '克' + TIER_NAME[beatVs]; lmul = BEAT_MUL; }
  else if (inStartup) { label = '破招'; lmul = COUNTER_MUL; }
  else if (punish) { label = punish[0]; lmul = punish[1]; A.stats.punishes++; }
  else if (caughtSlip) { label = '截住闪身'; lmul = SLIP_CAUGHT_MUL; }
  else if (charging) { label = '迎击'; lmul = COUNTER_MUL; }
  // 1.9.0 空中交手：空中出招被克制它的招打中 = 倒栽葱（倒地更久）；千斤坠被站着的拳打中再 ×1.4
  const wasAir = B.airborne;
  const crash = wasAir && !!bm && bm.air && beats(d.tier, bm.def.tier) > 0;
  const punchDive = crash && !!bm.def.dive && !m.air && (d.kind === 'jab' || d.kind === 'heavy') && /^(fh|bh|fe)$/.test(d.limb);
  // 千斤坠踩中：蹲着 / 蹲挡 / 出下段的 ×1.3（踩蹲）；正在出对空招的 ×1.5、踩倒（踩断对空）
  let diveKD = false;
  if (crash) { label = CRASH_NAME; lmul = punchDive ? DIVE_PUNCH_MUL : Math.max(lmul, BEAT_MUL); }
  else if (d.dive && bm && bm.def.tier === 'aa') { label = '踩断对空'; lmul = DIVE_AA_MUL; diveKD = true; }
  else if (d.dive && lowProfile(B)) { label = '踩蹲'; lmul = DIVE_CROUCH_MUL; }
  mul *= lmul;
  if (m.dashIn) mul *= DASH_IN_MUL;
  const n = B.comboTaken;
  mul *= Math.max(DMG_FLOOR, 1 - DMG_DECAY * n);
  const dmg = Math.max(1, Math.round(d.dmg * mul));
  const wrongGuard = B.isBlocking() && front;
  const backHit = B.isBlocking() && !front;
  // 拳打在正在出腿（单脚站着）的人身上 → 失衡倒地
  const offBalance = !!bm && d.tier === 'light' && bm.def.tier === 'kick' && !bm.air && bm.t >= 4 && bm.t <= bm.S + bm.def.A;
  const rising = B.state === 'rise';                    // 2.0 打在起身硬直里（打桩面板上写一句）

  B.hp -= dmg; m.hit = true; A.stats.hits++;
  if (d.tier === 'super') A.stats.supers++;             // 泼墨打中（软件版成就用）
  bumpCombo(A, B);
  B.comboTaken = n + 1;
  A.gainQi(dmg * 0.4 * QI_PER_HP); B.gainQi(dmg * 0.9 * QI_PER_HP);
  B.reel = false; B.clashed = false; B.grabbed = false; B.stagger = false;
  if (B.hp <= 0) { B.hp = 0; B.knockDown(5, dir * (d.kb * 0.6 + 2), 40, true); }
  else if (crash) B.knockDown(punchDive ? 2.5 : d.launch || d.launchAir || 4, dir * (d.kb * 0.6 + 2.5), LIE_CRASH, false);
  else if (offBalance) B.knockDown(3.5, dir * 2.5, LIE_HIT - 4, false);
  else if (d.launch || (d.launchAir && wasAir) || diveKD) B.knockDown(d.launch || d.launchAir || 3, dir * (d.kb * 0.6 + 2), d.lie || LIE_HIT, false);
  else if (d.stagger) {
    // 2.0.2 回身肘打在背上（Jack）：他被打得背对着你、往前踉跄一下 —— 强制背对（这几帧不自动转身，和朝向吸附不冲突），
    // 打得中、动不了（hit 状态，挡不了）。踉跄完了（stunT 到 0）才又自动面向对手
    B.state = 'hit'; B.stunT = STAGGER; B.stagger = true; B.hurtHeavy = true; B.facing = dir;
    B.kvx = dir * d.kb; if (wasAir) { B.vz = Math.max(B.vz, 2.5); B.vx = 0; }
    B.move = null; B.chain = []; B.chainIdle = 99; B.runT = 0;
  }
  else {
    const bonusStun = punish && label === punish[0] ? PUNISH_STUN : label === '截住闪身' ? SLIP_CAUGHT_STUN : 0;
    B.state = 'hit'; B.stunT = Math.max(STUN_FLOOR, d.stun - STUN_DECAY * n) + (m.air ? 4 : 0) + bonusStun;
    B.hurtHeavy = !!d.heavy || d.kind === 'kick';
    B.kvx = dir * d.kb * (1 + KB_GROW * n); if (wasAir) { B.vz = Math.max(B.vz, 2.5); B.vx = 0; }
    B.move = null; B.chain = []; B.chainIdle = 99; B.runT = 0;
  }
  if (d.dive) {
    // 千斤坠踩中：顺着这一脚落下来、落在对手面前。没踩倒的话这一下算「腿起手」—— 落地 踢 = 二起脚、重 = 盖步砸拳、拳 = 落步冲拳。
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
  tag(c.x + dir * 10, c.y - 14, (m.air ? '空中 ' : '') + '-' + dmg, A, 18);
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
  if (d.dive) { A.vz = 5.2; A.vx = -dir * 3.6; }      // 千斤坠被站挡住：往后翻着弹开一段（落地对方稍微先动，但够不着白打）
  m.blocked = true; B.stats.blocks++;
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
  A.reelBy = B.idx; A.reelKD = kd;                                    // 卸力反击：这个人失衡中被 B 打中有加成
  A.move = null; A.chain = []; A.chainIdle = 99; A.runT = 0; A.comboLive = false;
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
// 霸体：重招前摇里硬吃一记短拳，只掉一半血，招不停
function absorb(A, B, c) {
  const m = A.move, d = m.def, dir = A.facing;
  m.done = true; m.absorbed = true;        // 2.1 被霸体吃了的拳也能马上接下一拳（连打破霸体）
  const dmg = Math.max(1, Math.round(d.dmg * (m.air ? AIR_BONUS : 1) * ARMOR_KEEP));
  B.hp -= dmg; B.move.armorLeft--; B.gainQi(dmg * QI_PER_HP);
  cev('absorb', A, B, { name: m.name, by: B.move.name });
  B.move.beatVs = d.tier;                 // 硬吃之后这一拳打出去算「重克拳」
  A.info = { label: d.label, dmg: 0, how: '被霸体吃了', adv: null, t: A.clock };
  A.kvx = -dir * 1.5;
  if (B.hp <= 0) { B.hp = 0; B.knockDown(4, dir * 3, 999, true); }
  game.freeze = stop(4);
  impact(c.x, c.y, -dir, 30, pal(B).ink, 6, 1.0); sparks(c.x, c.y, -dir, 6, 6, pal(B).fx, 0.8);
  tag(B.x, B.J.head[1] - 40, '霸体', B, 22);
  tag(c.x, c.y - 14, '-' + dmg, A, 16);
  Sound.hit(0.3);
}
// 震退：打中 / 被打中之后把人推回去（拼招、压招共用）
function recoil(F, dmg, stun, kb) {
  F.move = null; F.chain = []; F.chainIdle = 99; F.runT = 0; F.comboLive = false; F.grabbed = false; F.reel = false; F.stagger = false; F.hurtHeavy = false;
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
// 翻滚回去（1.9.0）：空中的腿（飞踢、千斤坠）撞上地上的腿 —— 不算被克死，空中那个人吃一半伤害、往后翻着飞回去（飞得远，
// 途中打不中他）；地上那个人不掉血，只被撞退一点。落地后差不多一起动，等于把距离拉开重来，地上那方小赚
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
  else { A.state = 'tumble'; A.t = 0; A.vz = TUMBLE_VZ; A.vx = away * TUMBLE_VX; A.kvx = 0; A.airUsed = true; if (A.alt <= 0) A.alt = 0.01; }
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
// 推挡：没伤害，把对方推开并打断
function shoveHit(A, B) {
  const m = A.move, dir = A.facing;
  m.done = true; m.hit = true;
  B.kvx = dir * PUSH_KB;
  if (B.isBlocking() && B.facingTo(A)) { B.state = 'blockstun'; B.stunT = 8; }
  else {
    B.state = 'hit'; B.stunT = PUSH_STUN; B.reel = true; B.clashed = false; B.stagger = false; B.hurtHeavy = false; B.grabbed = false;
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
  if (type === 'catch' || type === 'scoop') {
    // 接腿摔（站着拿住对方的腿）/ 抄腿摔（蹲着抄住对方的腿，扫堂腿也算）：马上摔倒，挣不脱
    const scoop = type === 'scoop', wasSweep = !!(B.move && B.move.def.height === 'low');
    const airK = !scoop && (B.airborne || (B.move && B.move.air));
    const dmg = scoop ? SCOOP_DMG : airK ? 9 : 6;
    B.hp -= dmg; A.stats.hits++; A.stats.specials++;
    A.gainQi(dmg * 0.4 * QI_PER_HP); B.gainQi(dmg * 0.9 * QI_PER_HP);
    const foot = B.J.ff;
    B.knockDown(airK ? 3.5 : scoop ? 4.5 : 5, dir * (scoop ? 1 : 1.6), airK ? LIE_AIR : LIE_GROUND, B.hp <= 0);
    A.startScript(scoop ? 'scoop' : 'legCatch');
    game.freeze = stop(10); game.shake = Math.max(game.shake, 6);
    dust(foot[0], foot[1], 5); impact(foot[0], foot[1], dir, 36, pal(A).ink, 6, 1.0); sparks(foot[0], foot[1], dir, 8, 7, pal(A).fx, 1.0, 0.4);
    stamp(A.J.head[0] - dir * 52, A.J.head[1] - 46, scoop ? '抄腿摔' : '接腿摔', 30, A);
    tag(B.x, B.J.head[1] - 30, scoop ? (wasSweep ? '扫堂腿被抄' : '腿被抄住') : airK ? '空中被接 · 久倒' : '倒地', A, 18);
    tag(B.x + dir * 16, B.J.head[1] + 4, '-' + dmg, A, 18);
    Sound.hit(0.7);
    bumpCombo(A, B); noteGrab(A, dmg, scoop ? '抄腿摔' : '接腿摔');
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
  grabDamage(A, B, MOVES.grab.dmg, '擒拿 · 推开', false);
  B.grabbed = false; B.stunT = left + 4; B.kvx = A.facing * 8; B.hurtHeavy = false;
  game.freeze = stop(4); dust(B.x, FLOOR, 3); burst(B.x, FLOOR - 70, A.facing, 6, 24, 3, pal(A).fx);
  Sound.hit(0.4);
  if (B.hp <= 0) { B.hp = 0; B.knockDown(4, A.facing * 3, 999, true); }
}
// 提膝撞：顶两下，第二下放开，对方还在硬直里 —— 你先动 KNEE_ADV 帧
function kneeHit(A, B, second, left) {
  grabDamage(A, B, KNEE_DMG[second ? 1 : 0], '提膝撞', second);
  game.freeze = stop(second ? 6 : 4); game.shake = Math.max(game.shake, second ? 4 : 2);
  const k = A.J.ff; impact(k[0], k[1] - 10, A.facing, second ? 36 : 28, pal(A).ink, 6, 1.0); sparks(k[0], k[1] - 10, A.facing, 6, 6, pal(A).fx, 0.9, 0.5);
  if (second) {
    B.grabbed = false; B.stunT = left + KNEE_ADV; B.kvx = A.facing * 5; B.hurtHeavy = true;
    stamp(A.J.head[0] - A.facing * 52, A.J.head[1] - 46, '提膝撞', 26, A);
  }
  Sound.hit(second ? 0.7 : 0.45);
  if (B.hp <= 0) { B.hp = 0; B.knockDown(4, A.facing * 3, 999, true); }
}
// 别腿摔 / 抱腿摔：把人摔在面前（倒得近，起身由你压）
function slamDown(A, B, name) {
  const trip = name === 'trip', dmg = trip ? TRIP_DMG : TACKLE_DMG;
  grabDamage(A, B, dmg, trip ? '别腿摔' : '抱腿摔', true);
  B.knockDown(trip ? -1.5 : -2.5, A.facing * (trip ? 2.5 : 4), TFH(trip ? 40 : 38), B.hp <= 0); B.slam = true;
  if (B.hp <= 0) B.hp = 0;
  game.freeze = stop(8); game.shake = Math.max(game.shake, 7);
  dust(B.x, FLOOR, 9, true);
  stamp(A.J.head[0] - A.facing * 52, A.J.head[1] - 46, trip ? '别腿摔' : '抱腿摔', 28, A);
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
  const push = Math.min((min - ad) / 2, SOFT_PUSH), s = d > 0 ? 1 : d < 0 ? -1 : (a.facing > 0 ? 1 : -1);
  a.x -= s * push; b.x += s * push;
  a.x = clamp(a.x, WALL_L, WALL_R); b.x = clamp(b.x, WALL_L, WALL_R);
}
