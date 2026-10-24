'use strict';
/* 规则测试：双击 tests.html 就能跑，全部打勾说明改动没把规则改坏。
   只用 step([P1输入, P2输入]) 驱动游戏，和真实对战/联机走同一条路。 */

const TESTS = [];
Looks.solo = { me: 'ink', cpu: 'random' }; Looks.pvp = ['ink', 'indigo'];   // 测试不读这台电脑存的颜色
const T = (name, fn) => TESTS.push({ name, fn });
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg ? msg + '：' : '') + `得到 ${A}，应为 ${B}`);
}
function ok(v, msg) { if (!v) throw new Error(msg || '条件不成立'); }

function arena(dist) {
  startMatch('pvp');
  game.phase = 'fight'; game.paused = true;
  F1.x = 520; F2.x = 520 + dist;
  FX.length = 0;
}
function tick(v1 = 0, v2 = 0, n = 1) { for (let i = 0; i < n; i++) step([v1, v2]); }
// 按时间表跑：sched(i) 返回 [P1输入, P2输入]
function run(n, sched) { for (let i = 0; i < n; i++) step(sched(i)); }
const lost = F => MAX_HP - F.hp;
// 让玩家一按顺序出招，返回实际打出的招式名
function combo(acts, v2 = 0) {
  const names = [];
  for (const a of acts) {
    let k = 0;
    while (k++ < 120 && !(F1.actionable() || F1.canCancel(a))) tick(0, v2);
    const before = F1.serial;
    tick(TAP(a), v2);
    k = 0; while (k++ < 10 && F1.serial === before) tick(0, v2);
    names.push(F1.move ? F1.move.name : null);
    const s = F1.serial;
    k = 0; while (k++ < 60 && F1.move && F1.move.serial === s && !(F1.move.hit || F1.move.blocked) && F1.move.t <= F1.move.S + F1.move.def.A) tick(0, v2);
  }
  return names;
}
const BLOCK = HOLD('block'), DOWN = HOLD('down'), LEFT = HOLD('left'), RIGHT = HOLD('right');

/* ---------- 基本 ---------- */
T('血量 400（2.3）；双人对战不限时，人机每回合 ' + ROUND_FRAMES / 60 + ' 秒', () => {
  arena(300); eq(F1.hp, 400); eq(F2.hp, 400); ok(game.endless, '双人应不限时');
  for (const m of ['pve', 'pvp', 'online']) { startMatch(m); game.brains = [null, null]; eq([F1.maxHp, F2.maxHp, F1.hp, F2.hp], [400, 400, 400, 400], m); }
  arena(300);
  tick(0, 0, ROUND_FRAMES + 200); eq(game.phase, 'fight'); eq(game.timer, ROUND_FRAMES);
  startMatch('pve'); game.brains = [null, null]; game.phase = 'fight';
  ok(!game.endless, '人机应限时'); tick(0, 0, 10); eq(game.timer, ROUND_FRAMES - 10);
});
T('节奏（2.0）：前摇 短拳 < 重拳 < 腿踢；起手招的前摇、后摇一起再慢一点（平等，看得清），连招里的招不变；挨了打的后摇（倒地、起身、失衡）改回 1.9.2', () => {
  ok(MOVES.jab.S < MOVES.heavy.S && MOVES.heavy.S < MOVES.kick.S, `${MOVES.jab.S} / ${MOVES.heavy.S} / ${MOVES.kick.S}`);
  for (const [k, d] of Object.entries(MOVES)) if (!d.script) {
    const f = d.open ? TFO : TF;
    eq([d.S, d.A, d.R], [f(d.base.S), TF(d.base.A), f(d.base.R)], k);
  }
  for (const k of ['jab', 'heavy', 'kick', 'grab', 'airKick']) ok(MOVES[k].open, k + ' 是起手招');
  for (const k of ['jab2', 'beng', 'whip', 'hammer', 'twinKick', 'sweep']) ok(!MOVES[k].open, k + ' 连招里也用，不跟着慢（不然连不上）');
  eq([MOVES.jab.S, MOVES.heavy.S, MOVES.kick.S], [5, 14, 16], '短拳 4 → 5、重拳 12 → 14、腿踢 15 → 16');
  // 平等：起手招前摇长多少、后摇也长多少（按同一个倍数）
  let sNow = 0, sWas = 0, rNow = 0, rWas = 0;
  for (const d of Object.values(MOVES)) if (d.open) { sNow += d.S; sWas += TF(d.base.S); rNow += d.R; rWas += TF(d.base.R); }
  ok(Math.abs(sNow / sWas - rNow / rWas) < 0.04, `前摇 ×${(sNow / sWas).toFixed(2)}、后摇 ×${(rNow / rWas).toFixed(2)} 要差不多`);
  ok(sNow / sWas > 1.08, '起手招前摇要比 1.9.4 长一截：' + (sNow / sWas).toFixed(2));
  ok(RUN_MAX * TEMPO === 6.8 && JUMP_V * TEMPO === 12.7, '跑、跳的速度不跟着打击节奏变');
  ok(GETUP + RISE < TF(18) + 6 && LIE_HIT < 40 && PARRY_STUN === TFH(22) && PARRY_STUN < TF(22), '起身、倒地、失衡比 1.9.4 短');
});
T('射程：腿踢最远', () => ok(MOVES.kick.reach > MOVES.heavy.reach && MOVES.heavy.reach > MOVES.jab.reach));
T('场地比画面宽（1.7.0）；开局两人站在场地正中；人机 / 联机每回合 300 秒', () => {
  ok(WALL_R - WALL_L >= 1400, '场地宽 ' + (WALL_R - WALL_L)); eq(ROUND_FRAMES, 300 * 60);
  startMatch('pve'); game.brains = [null, null];
  eq([F1.x, F2.x], [STAGE_W / 2 - START_GAP / 2, STAGE_W / 2 + START_GAP / 2]);
});
T('短拳和重拳一眼分得开：短拳第一帧拳头就往前走；重拳先往后蓄（后手拉到身后、身子后仰）', () => {
  const j = evalKeys(MOVES.jab.keys, 1); ok(j.fh[0] > BASE.fh[0] + 8, '短拳第一帧拳头没往前：' + j.fh[0].toFixed(0));
  const h = evalKeys(MOVES.heavy.keys, MOVES.heavy.S * 0.6); ok(h.bh[0] < -20 && h.tor < 0, '重拳前摇没往后蓄');
  ok(MOVES.heavy.heavy && !MOVES.jab.heavy, '重拳出手有粗轨迹，短拳没有');
});

/* ---------- 移动与朝向 ---------- */
T('往左按就朝左跑，往右按就朝右跑（没有后退），越跑越快', () => {
  arena(300); tick(LEFT); eq(F1.facing, -1); eq(F1.state, 'run');
  const x0 = F1.x; tick(LEFT); const v0 = x0 - F1.x;
  tick(LEFT, 0, 10); const x1 = F1.x; tick(LEFT); const v1 = x1 - F1.x;
  ok(v1 > v0 + 1, `起步 ${v0.toFixed(2)}，跑起来 ${v1.toFixed(2)}`);
  tick(RIGHT); eq(F1.facing, 1);
});
T('跑着能从对手身边挤过去换边，换过去以后按反方向就转身', () => {
  arena(100); run(80, () => [RIGHT, 0]);
  ok(F1.x > F2.x, `墨 ${Math.round(F1.x)} 靛 ${Math.round(F2.x)}`); eq(F1.facing, 1);
  tick(LEFT); eq(F1.facing, -1);
});
T('1.9.0 朝向吸附：不按方向就自动面向对手（不管远近）', () => {
  arena(30); tick(LEFT); eq(F1.facing, -1); F1.x = 520; F2.x = 550;
  tick(0, 0, 2); eq(F1.facing, 1);
  arena(120); tick(LEFT); eq(F1.facing, -1); tick(0, 0, 2); eq(F1.facing, 1, '离得远也转过来');
  arena(900); tick(LEFT); tick(); eq(F1.facing, 1, '离 900 也转');
});
T('1.9.0 近身出招一律朝对手打：按着反方向乱按也打得中（以前会打空、打背身）', () => {
  arena(80); tick(LEFT); eq(F1.facing, -1);
  run(30, i => [i === 0 ? TAP('jab') | LEFT : LEFT * (i < 3), 0]); ok(F2.hp < MAX_HP, '应该打中');
  arena(115); tick(LEFT); run(40, i => [i === 0 ? TAP('kick') | LEFT : 0, 0]); ok(F2.hp < MAX_HP, '腿踢射程里也吸');
});
T('1.9.0 远了出招照按的方向；只按方向不出招 = 想跑：马上朝那边跑，不被吸回来', () => {
  arena(400); tick(LEFT | TAP('jab')); eq(F1.facing, -1, '远处按着左出拳就朝左');
  arena(60); let x = F1.x;
  for (let i = 0; i < 14; i++) { tick(LEFT); eq(F1.facing, -1, '第 ' + i + ' 帧被吸回去了'); ok(F1.x < x, '第 ' + i + ' 帧没往左跑'); x = F1.x; }
});
T('1.9.0 格挡自动面向对手；2.0 按着挡 + 反方向 = 边挡边往后退，一直面朝对手，正面来的招照样挡住', () => {
  arena(70); tick(0, RIGHT); eq(F2.facing, 1); const x0 = F2.x; tick(0, BLOCK | RIGHT, 5); eq(F2.facing, -1);
  ok(F2.x > x0 + 6 && F2.state === 'block', '按着挡往后退：' + (F2.x - x0).toFixed(1));
  run(30, i => [i === 0 ? TAP('jab') : 0, BLOCK | RIGHT]); eq(F2.stats.blocks, 1); ok(lost(F2) <= 2, '挡住只掉一点');
});
T('1.9.0 跳到身后打：站着挡的人跟着转身，挡得住（以前「跳到背后打完就跑」是版本答案）', () => {
  let blocked = 0;
  for (let w = 8; w <= 14; w++) {
    arena(70); tick(0, BLOCK, 3);
    run(70, i => [(i < 30 ? RIGHT : 0) | (i === 0 ? TAP('up') : 0) | (i === w ? TAP('jab') : 0), BLOCK]);
    if (F2.stats.blocks && lost(F2) <= 3) blocked++;
  }
  ok(blocked >= 4, '越过头顶的空中挥拳挡住了 ' + blocked + ' / 7 次');
});
T('冲刺：同一方向双击，前几帧打不中，能拉开距离', () => {
  arena(85); run(40, i => [i === 2 ? TAP('jab') : 0, i === 0 || i === 2 ? RIGHT : 0]);
  eq(F2.hp, MAX_HP); ok(F2.x - F1.x > 140, `距离 ${Math.round(F2.x - F1.x)}`);
});
T('冲刺能穿到对手身后', () => {
  arena(85); run(30, i => [i === 0 || i === 2 ? RIGHT : 0, 0]);
  eq(F1.move === null || F1.move.name === 'dash', true); ok(F1.x > F2.x, `墨 ${Math.round(F1.x)} 靛 ${Math.round(F2.x)}`);
});

/* ---------- 跳跃 ---------- */
T('跳跃：最高不超过 100；站着按方向跳得远（≥160），跑着跳更远（≥210）；不翻跟头', () => {
  const jump = sched => { arena(500); F1.x = 300; F2.x = 1300; let x0 = null, x1 = null, apex = 0, air = false, rot = 0;
    for (let i = 0; i < 90; i++) { step(sched(i)); if (F1.airborne && !air) x0 = F1.x; if (!F1.airborne && air && x1 === null) x1 = F1.x; air = F1.airborne; apex = Math.max(apex, F1.alt); if (F1.state === 'air') rot = Math.max(rot, Math.abs(F1.tgt.rot)); }
    return { d: x1 - x0, apex, rot }; };
  const stand = jump(i => [RIGHT | (i === 0 ? TAP('up') : 0), 0]);
  const runJ = jump(i => [RIGHT | (i === 14 ? TAP('up') : 0), 0]);
  ok(stand.apex < 100, '太高 ' + stand.apex.toFixed(0));
  ok(stand.d >= 160, '站着跳太近 ' + stand.d.toFixed(0));
  ok(runJ.d >= 210 && runJ.d > stand.d + 30, `跑跳 ${runJ.d.toFixed(0)} 站跳 ${stand.d.toFixed(0)}`);
  ok(stand.rot < 1 && runJ.rot < 1, '空中不该翻跟头');
});
T('落地前几帧按的跳不会被吃掉（能连跳）', () => {
  arena(500); let land = -1, air = false;
  for (let i = 0; i < 60 && land < 0; i++) { step([i === 0 ? TAP('up') : 0, 0]); if (air && !F1.airborne) land = i; air = F1.airborne; }
  arena(500); let jumps = 0; air = false;
  for (let i = 0; i < 90; i++) { step([i === 0 || i === land - 5 ? TAP('up') : 0, 0]); if (F1.airborne && !air) jumps++; air = F1.airborne; }
  eq(jumps, 2);
});
T('空中松开方向会慢下来；没方向起跳、空中再按只能小幅移动', () => {
  arena(500); run(12, () => [RIGHT, 0]); tick(RIGHT | TAP('up'), 0); tick(0, 0, 4);
  const v0 = F1.vx; tick(0, 0, 8); ok(F1.vx < v0 * 0.85 && F1.vx > v0 * 0.6, `松手后应该慢下来但不是一下停住：${v0.toFixed(2)} → ${F1.vx.toFixed(2)}`);
  arena(500); tick(TAP('up'), 0); tick(0, 0, 3); eq(F1.vx, 0);
  tick(RIGHT, 0, 20); ok(F1.vx > 0 && F1.vx <= AIR_DRIFT + 0.01, '空中小幅 ' + F1.vx.toFixed(2));
});
T('千斤坠：空中按蹲+踢，先往上腾一下（从高处起），再斜着往前下方直线踩下去', () => {
  arena(300); tick(TAP('up')); tick(0, 0, 14);
  const a0 = F1.alt; tick(DOWN | TAP('kick'));
  eq(F1.move && F1.move.name, 'dive');
  let top = a0; for (let i = 0; i < MOVES.dive.S; i++) { tick(); top = Math.max(top, F1.alt); }
  ok(top > a0 + 10, `应该先往上腾：${a0.toFixed(0)} → ${top.toFixed(0)}`);
  tick(0, 0, 2); ok(F1.vz <= -DIVE_VZ + 0.01 && F1.vx >= DIVE_VX - 0.01, `出脚后斜着往前下：vx ${F1.vx.toFixed(1)} vz ${F1.vz.toFixed(1)}`);
});
T('千斤坠：从对手前方斜着踩下去，站着的人会被踩中；站挡挡得住', () => {
  for (const blk of [false, true]) {
    arena(120); const v2 = blk ? BLOCK : 0;
    tick(TAP('up'), v2); tick(0, v2, 12); tick(DOWN | TAP('kick'), v2); tick(0, v2, 40);
    if (blk) eq(F2.stats.blocks, 1, '站挡'); else ok(lost(F2) > 0, '没踩中');
  }
});

/* ---------- 连招 ---------- */
T('短拳连按：刺拳 → 后手直拳 → 摆拳 → 连珠快拳', () => { arena(80); eq(combo(['jab', 'jab', 'jab', 'jab']), ['jab', 'jab2', 'jab3', 'rushR']); });
T('一串最多 6 拳：第 6 拳是收势「寸劲」，之后重新起算', () => { arena(80); eq(combo(['jab', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab']), ['jab', 'jab2', 'jab3', 'rushR', 'rushL', 'rushEnd', 'jab']); });
T('拳起手：拳重 = 崩拳，拳踢 = 鞭腿，拳拳重 = 冲天炮（击倒），拳拳踢 = 转身蹬', () => {
  arena(85); eq(combo(['jab', 'heavy']), ['jab', 'beng']);
  arena(85); eq(combo(['jab', 'kick']), ['jab', 'whip']);
  arena(80); eq(combo(['jab', 'jab', 'heavy']), ['jab', 'jab2', 'upper']); tick(0, 0, 20); eq(F2.state, 'down');
  arena(80); eq(combo(['jab', 'jab', 'kick']), ['jab', 'jab2', 'backKick']);
});
T('重起手：重拳 = 顶肘，重重 = 劈挂掌，重踢 = 旋风腿（击倒）', () => {
  arena(85); eq(combo(['heavy', 'jab']), ['heavy', 'elbow']);
  arena(90); eq(combo(['heavy', 'heavy']), ['heavy', 'chop']);
  arena(95); eq(combo(['heavy', 'kick']), ['heavy', 'whirl']); tick(0, 0, 20); eq(F2.state, 'down');
});
T('腿起手：踢拳 = 落步冲拳，踢重 = 盖步砸拳（击倒），踢踢 = 二起脚（击倒）', () => {
  arena(115); eq(combo(['kick', 'jab']), ['kick', 'stepPunch']);
  arena(115); eq(combo(['kick', 'heavy']), ['kick', 'hammer']); tick(0, 0, 20); eq(F2.state, 'down');
  arena(115); eq(combo(['kick', 'kick']), ['kick', 'twinKick']); tick(0, 0, 20); eq(F2.state, 'down');
});
T('蹲 + 拳 / 踢 / 重 = 下盘拳 / 扫堂腿 / 托天掌；跑起来按重 = 铁山靠', () => {
  for (const [k, name] of [['jab', 'lowJab'], ['kick', 'sweep'], ['heavy', 'palm']]) { arena(200); tick(DOWN | TAP(k)); eq(F1.move && F1.move.name, name, k); }
  arena(400); tick(RIGHT, 0, 12); tick(RIGHT | TAP('heavy')); eq(F1.move && F1.move.name, 'shoulder');
});
T('每招都有起手和主系（崩拳 = 起手拳、主系重）', () => {
  eq([MOVES.beng.lead, MOVES.beng.tier], ['light', 'heavy']); eq([MOVES.whirl.lead, MOVES.whirl.tier], ['heavy', 'kick']);
  eq([MOVES.hammer.lead, MOVES.hammer.tier], ['kick', 'heavy']); eq([MOVES.jab.lead, MOVES.jab.tier], ['light', 'light']);
});

/* ---------- 交手：克 / 压 / 平 ---------- */
T('关系表：主系克 = 克；主系同、起手克 = 压；都一样 = 平；九种组合两两都有结果', () => {
  eq(relation(MOVES.jab, MOVES.kick), 1, '拳克腿'); eq(relation(MOVES.kick, MOVES.heavy), 1, '腿克重'); eq(relation(MOVES.heavy, MOVES.jab), 1, '重克拳');
  eq(relation(MOVES.whip, MOVES.kick), 0.5, '鞭腿(拳腿) 压 腿踢(腿腿)'); eq(relation(MOVES.whirl, MOVES.whip), 0.5, '旋风腿(重腿) 压 鞭腿(拳腿)');
  eq(relation(MOVES.elbow, MOVES.jab), 0.5, '顶肘(重拳) 压 短拳(拳拳)'); eq(relation(MOVES.chop, MOVES.beng), 0.5, '劈挂(重重) 压 崩拳(拳重)');
  eq(relation(MOVES.jab, MOVES.jab2), 0, '平'); eq(relation(MOVES.chop, MOVES.heavy), 0, '平');
  const T3 = ['light', 'heavy', 'kick'];
  for (const a of T3) for (const b of T3) for (const c of T3) for (const d of T3) eq(relation({ lead: a, tier: b }, { lead: c, tier: d }), -relation({ lead: c, tier: d }, { lead: a, tier: b }), '对称');
});
T('平（拼招）：两边同时出同一招，两边都掉血、互相震退，结果完全对称', () => {
  for (const k of ['jab', 'heavy', 'kick']) {
    arena(k === 'kick' ? 120 : 90); const d0 = F2.x - F1.x;
    tick(TAP(k), TAP(k)); tick(0, 0, 40);
    ok(F1.stats.clashes === 1 && F2.stats.clashes === 1, k + ' 没有拼招');
    ok(F1.hp < MAX_HP && F1.hp === F2.hp, `${k} 掉血 ${lost(F1)} / ${lost(F2)}`);
    ok(F2.x - F1.x > d0 + 30, k + ' 没有震退');
  }
});
T('压：鞭腿（拳起手）和腿踢（腿起手）同时到 → 鞭腿压腿踢，腿踢方吃全额，鞭腿方只吃三成', () => {
  arena(110); F1.chain = ['jab']; F1.chainIdle = 0;
  run(40, i => [i === 3 ? TAP('kick') : 0, i === 0 ? TAP('kick') : 0]);
  eq(F1.stats.presses, 1, '应该是压'); eq(lost(F2), MOVES.whip.dmg); eq(lost(F1), Math.round(MOVES.kick.dmg * PRESS_KEEP));
});
T('克 · 拳克腿：对方起腿时被短拳打中 → 失衡倒地，出拳方不掉血', () => {
  arena(85); run(40, i => [i === 3 ? TAP('jab') : 0, i === 0 ? TAP('kick') : 0]);
  eq(F2.state, 'down'); eq(F1.hp, MAX_HP);
});
T('克 · 腿克重：重拳打到正在起腿的人被化解，腿照样踢中 ×' + BEAT_MUL, () => {
  arena(100); run(60, i => [i === 0 ? TAP('heavy') : 0, i === 2 ? TAP('kick') : 0]);
  eq(F2.hp, MAX_HP, '出腿方'); eq(lost(F1), Math.round(MOVES.kick.dmg * BEAT_MUL), '重拳方');
});
T('克 · 重克拳：重拳前摇霸体硬吃短拳（只吃一半），然后打回去 ×' + BEAT_MUL, () => {
  arena(85); run(60, i => [i === 1 ? TAP('jab') : 0, i === 0 ? TAP('heavy') : 0]);
  eq(lost(F2), Math.round(MOVES.jab.dmg * ARMOR_KEEP), '重拳方'); eq(lost(F1), Math.round(MOVES.heavy.dmg * BEAT_MUL), '短拳方');
});
T('破招：同系招打在对方前摇里 ×' + COUNTER_MUL, () => {
  arena(90); run(60, i => [i === 0 ? TAP('heavy') : 0, i === 6 ? TAP('heavy') : 0]);
  eq(lost(F2), Math.round(MOVES.heavy.dmg * COUNTER_MUL)); eq(F1.hp, MAX_HP);
});
T('打击克擒拿：擒拿还没抓到时被短拳打中', () => {
  arena(80); run(40, i => [i === 1 ? TAP('jab') : 0, i === 0 ? TAP('grab') : 0]);
  eq(F1.hp, MAX_HP); ok(F2.hp < MAX_HP);
});

/* ---------- 反压制 ---------- */
T('连击衰减：一直被短拳打，也会断开，被打的一方有机会动', () => {
  arena(80);
  let longest = 0, cur = 0, freeAfterHit = 0;
  for (let i = 0; i < 300; i++) {
    step([i % 2 ? 0 : TAP('jab'), 0]);
    if (F2.actionable()) { cur = 0; if (F2.hp < MAX_HP) freeAfterHit++; } else longest = Math.max(longest, ++cur);
  }
  ok(longest < 60, `最长连续不能动 ${longest} 帧`); ok(freeAfterHit > 30, `被打后能动的帧数 ${freeAfterHit}`);
});
T('被短拳压着时按住格挡，后面的都能挡住', () => {
  arena(80); run(240, i => [TAP('jab'), i > 30 ? BLOCK : 0]);
  const firstCombo = lost(F2);
  run(200, () => [TAP('jab'), BLOCK]);
  ok(lost(F2) - firstCombo <= 6, `格挡之后还掉了 ${lost(F2) - firstCombo}`);
});
T('卸力：刚按下格挡就被打中 → 不掉血，对方失衡，能马上反打', () => {
  arena(90); run(20, i => [i === 0 ? TAP('heavy') : 0, i >= MOVES.heavy.S - 4 ? BLOCK : 0]);
  eq(F2.hp, MAX_HP); eq(F2.stats.parries, 1); eq(F1.state, 'hit'); ok(F1.reel, '对方应该失衡');
  run(30, i => [0, i === 0 ? TAP('heavy') : 0]);
  ok(F1.hp < MAX_HP, '卸力后反打没打中');
});
T('一直按住格挡、或乱按格挡，都没有卸力', () => {
  arena(90); run(60, i => [i === 20 ? TAP('heavy') : 0, BLOCK]);
  eq(F2.stats.parries, 0, '按住'); eq(F2.stats.blocks, 1, '按住应该是普通格挡');
  arena(90); run(60, i => [i === 20 ? TAP('heavy') : 0, i % 4 < 2 ? BLOCK : 0]);
  eq(F2.stats.parries, 0, '乱按');
});
T('推挡：格挡中按拳，把对方推开并打断', () => {
  arena(85); tick(0, BLOCK, 30);
  let shoved = false;
  for (let i = 0; i < 80; i++) {
    step([i < 30 ? TAP('jab') : 0, BLOCK | (F2.state === 'blockstun' ? TAP('jab') : 0)]);
    if (F2.move && F2.move.name === 'shove' && F2.move.hit) shoved = true;
  }
  ok(shoved, '没推到'); ok(F2.x - F1.x > 130, `距离 ${Math.round(F2.x - F1.x)}`); ok(lost(F2) <= 6);
});
T('爆气（2.1）：挨打时按「重+踢」，花 ' + QI_BURST + ' 气爆开 —— 对方倒地、掉 ' + BURST_DMG + ' 血；格挡硬直里不能爆', () => {
  arena(80); F2.qi = 60;
  let burst = false, down = false;
  for (let i = 0; i < 70; i++) {
    const hurt = F2.state === 'hit' && !burst;
    step([i < 30 ? TAP('jab') : 0, hurt ? TAP('heavy') | TAP('kick') : 0]);
    if (F2.move && F2.move.name === 'burst') burst = true;
    if (F1.state === 'down') down = true;
  }
  ok(burst, '没爆气'); ok(F2.qi < 60 - QI_BURST + 5, '气 ' + F2.qi);
  ok(down, '对方要被炸倒'); eq(lost(F1), BURST_DMG, '爆气伤害');
  // 格挡硬直里按重 + 踢：不是爆气（重 = 截拳）
  arena(80); F2.qi = 60; tick(0, BLOCK, 3); let b2 = false;
  run(40, i => { if (F2.move && F2.move.name === 'burst') b2 = true; return [i === 0 ? TAP('jab') : 0, F2.state === 'blockstun' ? BLOCK | TAP('heavy') | TAP('kick') : BLOCK]; });
  ok(!b2, '格挡硬直里不该能爆气');
});
T('泼墨：气满时按「重+踢」放必杀，击倒', () => {
  arena(110); F1.qi = QI_MAX; tick(TAP('heavy') | TAP('kick'));
  eq(F1.move && F1.move.name, 'super'); eq(F1.qi, 0);
  tick(0, 0, 30); eq(lost(F2), MOVES.super.dmg); eq(F2.state, 'down');
  eq(F1.stats.supers, 1, '泼墨打中记一笔（2.1 软件版成就「泼墨挥毫」看它）'); eq(F2.stats.supers, 0);
});
T('气：挨打会涨气，满了不超过上限', () => {
  arena(85); combo(['jab', 'heavy']); ok(F2.qi > 0 && F2.qi > F1.qi, `${F1.qi} / ${F2.qi}`);
  arena(85); F2.qi = QI_MAX - 0.5; combo(['jab']); eq(F2.qi, QI_MAX);
});

/* ---------- 格挡、高低、擒拿、空中 ---------- */
T('格挡：重拳只吃三成伤害，对方进入「势破」', () => {
  arena(90); tick(0, BLOCK, 3);
  const hp = F2.hp;
  combo(['heavy'], BLOCK); tick(0, BLOCK, 10);
  eq(hp - F2.hp, Math.round(MOVES.heavy.dmg * BLOCK_KEEP), '扣血');
  ok(F1.slowJab > 0, '攻击方没有进入势破');
});
T('势破：下一记短拳前摇 +' + SLOW_JAB_ADD + ' 帧', () => {
  arena(90); tick(0, BLOCK, 3); combo(['heavy'], BLOCK);
  let k = 0; while (k++ < 80 && !F1.actionable()) tick(0, BLOCK);
  tick(TAP('jab'), 0);
  eq(F1.move.S, MOVES[F1.move.name].S + SLOW_JAB_ADD);
});
T('格挡对短拳、腿踢也减伤', () => {
  for (const [a, d] of [['jab', 80], ['kick', 120]]) {
    arena(d); tick(0, BLOCK, 3); const hp = F2.hp;
    combo([a], BLOCK); tick(0, BLOCK, 10);
    eq(hp - F2.hp, Math.max(1, Math.round(MOVES[a].dmg * BLOCK_KEEP)), a);
  }
});
T('下段：站着挡不住扫堂腿，蹲着挡得住', () => {
  arena(110); tick(0, BLOCK, 10); tick(DOWN | TAP('kick'), BLOCK); tick(0, BLOCK, 30); eq(F2.state, 'down', '站挡');
  arena(110); tick(0, BLOCK | DOWN, 10); tick(DOWN | TAP('kick'), BLOCK | DOWN); tick(0, BLOCK | DOWN, 30);
  eq(F2.stats.blocks, 1, '蹲挡'); ok(F2.state !== 'down');
});
T('上段：蹲着挡不住劈挂掌和泰山压顶，站着挡得住', () => {
  arena(90); tick(0, BLOCK | DOWN, 10); combo(['heavy', 'heavy'], BLOCK | DOWN); tick(0, BLOCK | DOWN, 30);
  eq(F2.stats.blocks, 1, '重拳挡住，劈挂挡不住'); ok(lost(F2) > MOVES.chop.dmg / 2);
  arena(95); tick(TAP('up'), BLOCK | DOWN, 1); tick(0, BLOCK | DOWN, 12); tick(TAP('heavy'), BLOCK | DOWN); tick(0, BLOCK | DOWN, 40);
  eq(F2.stats.blocks, 0, '蹲挡'); ok(F2.hp < MAX_HP);
  arena(95); tick(TAP('up'), BLOCK, 1); tick(0, BLOCK, 12); tick(TAP('heavy'), BLOCK); tick(0, BLOCK, 40);
  eq(F2.stats.blocks, 1, '站挡');
});
T('擒拿挡不住；抓住后什么都不按 = 推开，少量伤害', () => { arena(70); tick(0, BLOCK, 3); const hp = F2.hp; combo(['grab'], BLOCK); tick(0, 0, 40); eq(hp - F2.hp, MOVES.grab.dmg); ok(F2.state !== 'down', '推开不击倒'); });
T('擒拿后按住后 = 过肩摔：对方被扛过头顶（中途离地 > 60），摔到身后、倒地', () => {
  arena(70); let maxAlt = 0, carried = 0;
  for (let i = 0; i < 70; i++) { step([(i === 0 ? TAP('grab') : 0) | (i > 6 ? LEFT : 0), 0]); if (F2.carried) { carried++; maxAlt = Math.max(maxAlt, F2.alt); } }
  ok(carried >= 10 && maxAlt > 60, `应该被扛起来甩过去：扛了 ${carried} 帧，最高 ${maxAlt.toFixed(0)}`);
  ok(F2.x < F1.x, `墨 ${Math.round(F1.x)} 靛 ${Math.round(F2.x)}`); eq(F2.state, 'down'); eq(lost(F2), THROW_DMG);
});
T('背靠墙过肩摔：一边摔一边往前挪，对手落在墙里面', () => {
  arena(70); F1.x = WALL_L + 10; F2.x = WALL_L + 80;
  for (let i = 0; i < 70; i++) step([(i === 0 ? TAP('grab') : 0) | (i > 6 ? LEFT : 0), 0]);
  eq(F2.state, 'down'); ok(F2.x >= WALL_L && F2.x < F1.x, `墨 ${Math.round(F1.x)} 靛 ${Math.round(F2.x)}`);
});
T('对方地面出腿时擒拿 = 接腿摔，倒地 ' + LIE_GROUND + ' 帧', () => {
  arena(120); tick(0, TAP('kick')); tick(0, 0, 5); tick(TAP('grab'), 0);
  let k = 0; while (k++ < 40 && F2.state !== 'down') tick();
  eq(F2.state, 'down'); eq(F2.lieT, LIE_GROUND); eq(F1.move && F1.move.name, 'legCatch');
});
T('对方跳起出腿被接，倒地更久（' + LIE_AIR + ' 帧）', () => {
  arena(110); tick(0, TAP('up')); tick(0, 0, 6);
  tick(TAP('grab'), TAP('kick'));
  let k = 0; while (k++ < 40 && F2.state !== 'down') tick();
  eq(F2.state, 'down'); eq(F2.lieT, LIE_AIR);
  ok(LIE_AIR > LIE_GROUND);
});
T('蹲下能躲飞踢（不蹲会被踢中）', () => {
  for (const crouch of [true, false]) {
    arena(110); const v1 = crouch ? DOWN : 0;
    tick(v1, TAP('up')); tick(v1, 0, 17); tick(v1, TAP('kick'));
    const hp = F1.hp; tick(v1, 0, 40);
    if (crouch) eq(F1.hp, hp, '蹲着'); else ok(F1.hp < hp, '站着应该被踢中');
  }
});
T('空中招：同一个距离，起跳后什么时候出都打得到（太晚来不及出完 = 落地后马上出）', () => {
  for (const k of ['jab', 'heavy', 'kick']) {
    const miss = [];
    for (let r = 1; r <= 27; r++) { arena(90); tick(TAP('up')); tick(0, 0, r); tick(TAP(k)); tick(0, 0, 50); if (F2.hp === MAX_HP) miss.push(r); }
    eq(miss, [], k + ' 这些时机没打中');
  }
});
T('空中招出手时整个人往前下方倾，千斤坠斜着踩（身子斜过 35°）', () => {
  for (const k of ['airJab', 'airHeavy', 'airKick']) { const d = MOVES[k]; ok(evalKeys(d.keys, d.S + 1).rot >= 10, d.label + ' 出手没往前倾'); }
  ok(evalKeys(MOVES.dive.keys, MOVES.dive.S + 2).rot <= -35, '千斤坠不够斜');
});
T('过肩摔、千斤坠、空中招这些新动作，同样的输入两次结果一样（联机不会不同步）', () => {
  const once = () => {
    arena(70); const hs = [];
    const plan = i => i === 0 ? [TAP('grab'), 0] : i > 6 && i < 40 ? [LEFT, 0] : i === 90 ? [TAP('up'), TAP('up')] : i === 103 ? [DOWN | TAP('kick'), TAP('heavy')] : i === 160 ? [TAP('up'), 0] : i === 175 ? [TAP('kick'), 0] : [0, 0];
    for (let i = 0; i < 260; i++) { step(plan(i)); if (i % 10 === 0) hs.push(stateHash()); }
    return hs;
  };
  eq(once(), once());
});
T('空中招前摇没出完就落地：落地后马上在地上出（按了一定有反应）', () => {
  arena(300); tick(TAP('up')); let k = 0;
  while (k++ < 60 && !(F1.airborne && F1.vz < 0 && F1.alt < 30)) tick();
  tick(TAP('heavy')); ok(F1.move && F1.move.air, '应该先出空中招');
  k = 0; while (k++ < 20 && F1.airborne) tick();
  k = 0; while (k++ < 12 && !(F1.move && !F1.move.air)) tick();
  eq(F1.move && F1.move.name, 'heavy', '落地后应该出地面重拳');
});
T('2.1 飞踢、泰山压顶（Jack：打电脑像「版本答案」）：前摇长了、整个动作也长了，出手前那一下看得清', () => {
  eq([MOVES.airKick.base.S, MOVES.airHeavy.base.S], [9, 10], '基准前摇');
  ok(MOVES.airKick.S >= 11 && MOVES.airHeavy.S >= 12, `前摇 飞踢 ${MOVES.airKick.S} · 泰山压顶 ${MOVES.airHeavy.S}`);
  for (const k of ['airKick', 'airHeavy']) { const d = MOVES[k]; ok(d.S + d.A + d.R >= 35, d.label + ' 整个动作 ' + (d.S + d.A + d.R) + ' 帧'); }
  ok(MOVES.airJab.S < MOVES.airKick.S && MOVES.airKick.S < MOVES.airHeavy.S, '空中挥拳最快、泰山压顶最慢');
});
T('跳起攻击伤害 ×' + AIR_BONUS, () => {
  arena(95); tick(TAP('up')); tick(0, 0, 12);
  const hp = F2.hp; tick(TAP('heavy'));
  let k = 0; while (k++ < 40 && F2.hp === hp) tick();
  eq(hp - F2.hp, Math.round(MOVES.airHeavy.dmg * AIR_BONUS));
});
T('托天掌能打下跳过来的人（对空克空中）', () => {
  let ok1 = false;
  for (let p = 6; p < 30 && !ok1; p++) {
    arena(230);
    run(70, i => [i === p ? DOWN | TAP('heavy') : 0, (i < 10 ? LEFT : 0) | (i === 10 ? LEFT | TAP('up') : 0) | (i === 18 ? TAP('kick') : 0)]);
    if (F1.hp === MAX_HP && (F2.state === 'down' || F2.hp < MAX_HP) && F1.stats.hits > 0) ok1 = true;
  }
  ok(ok1, '找不到能打下来的时机');
});

T('图例里列的连招都是真连：按得及时，挨打方中间动不了', () => {
  const list = [['jab', 'jab'], ['jab', 'jab', 'jab'], ['jab', 'jab', 'jab', 'jab'], ['jab', 'heavy'], ['jab', 'kick'], ['jab', 'jab', 'heavy'], ['jab', 'jab', 'kick'],
    ['heavy', 'jab'], ['heavy', 'heavy'], ['heavy', 'kick'], ['heavy', 'd:kick'], ['kick', 'jab'], ['kick', 'heavy'], ['kick', 'kick'], ['d:jab', 'd:kick'], ['jab', 'd:kick']];
  for (const seq of list) {
    arena(seq[0] === 'kick' ? 115 : 80);
    let k = 0, free = 0, hit = false;
    for (let i = 0; i < 90; i++) {
      const a = seq[k] || '', low = a.startsWith('d:'), kind = a.replace('d:', '');
      let v = seq.some(x => x.startsWith('d:')) && k < seq.length && low ? DOWN : 0;
      if (k < seq.length && game.freeze === 0 && (F1.actionable() || F1.canCancel(kind))) { v |= TAP(kind); k++; }
      step([v, 0]);
      if (F1.stats.hits) hit = true;
      if (hit && k <= seq.length && F1.stats.hits < seq.length && F2.actionable()) free++;
    }
    eq(F1.stats.hits, seq.length, seq.join('→') + ' 没全打中');
    eq(free, 0, seq.join('→') + ' 中间挨打方能动');
    ok(F1.combo === seq.length || F1.stats.maxCombo === seq.length, seq.join('→') + ' 连击数 ' + F1.stats.maxCombo);
  }
});

/* ---------- 冲刺、冲势、迎击 ---------- */
T('冲刺途中按招 = 冲势：直接打出去，伤害 ×' + DASH_IN_MUL, () => {
  arena(160); run(30, i => [(i === 0 || i === 2 ? RIGHT : 0) | (i === 8 ? TAP('jab') : 0), 0]);
  ok(F1.stats.hits === 1, '没打中'); eq(lost(F2), Math.round(MOVES.jab.dmg * DASH_IN_MUL));
});
T('冲刺刚结束出的第一招也算冲势；之后的不算', () => {
  arena(300); run(20, i => [i === 0 || i === 2 ? RIGHT : 0, 0]);
  tick(TAP('heavy')); ok(F1.move && F1.move.dashIn, '第一招应带冲势');
  tick(0, 0, 40); tick(TAP('heavy')); ok(F1.move && !F1.move.dashIn, '第二招不该带');
});
T('冲势被挡：对方多吃 ' + DASH_IN_BSTUN + ' 帧格挡硬直（同一记短拳，冲势帧差多 ' + DASH_IN_BSTUN + '）', () => {
  arena(80); tick(0, BLOCK, 30); run(20, i => [i === 0 ? TAP('jab') : 0, BLOCK]);
  ok(F1.info && F1.info.blocked, '普通短拳没被挡'); const plain = F1.info.adv;
  arena(160); tick(0, BLOCK, 30); run(30, i => [(i === 0 || i === 2 ? RIGHT : 0) | (i === 8 ? TAP('jab') : 0), BLOCK]);
  ok(F1.info && F1.info.blocked, '冲势短拳没被挡'); eq(F1.info.adv, plain + DASH_IN_BSTUN);
});
T('迎击：打在全速跑过来的人身上 ×' + COUNTER_MUL, () => {
  let found = false;
  for (let p = 0; p < 30 && !found; p++) {
    arena(330); run(60, i => [i === p ? TAP('kick') : 0, LEFT]);
    if (F1.info && F1.info.how.includes('迎击') && lost(F2) === Math.round(MOVES.kick.dmg * COUNTER_MUL)) found = true;
  }
  ok(found, '没有打出迎击');
});

/* ---------- 每一种招、每一种技术都有破法 ---------- */
T('核对：除了泼墨，每一招都有能「克」它和「压」它的招', () => {
  const ks = Object.keys(MOVES).filter(k => !MOVES[k].script && MOVES[k].kind !== 'grab' && MOVES[k].kind !== 'push' && k !== 'super');
  for (const k of ks) {
    ok(ks.some(x => relation(MOVES[x], MOVES[k]) === 1), MOVES[k].label + ' 没有能克它的');
    ok(ks.some(x => relation(MOVES[x], MOVES[k]) === 0.5), MOVES[k].label + ' 没有能压它的');
  }
  eq(relation(MOVES.kick, MOVES.palm), 1, '腿克对空'); eq(relation(MOVES.airJab, MOVES.airKick), 0.5, '空中挥拳压飞踢');
});
T('核对：破解表覆盖所有系别和技术', () => {
  const keys = COUNTERS.map(c => c[0]).join('|');
  for (const w of ['拳系', '重系', '腿系', '扫堂腿', '击倒招', '对空', '空中招', '千斤坠', '下段', '上段', '擒拿', '抄腿', '接腿摔', '挣脱', '格挡', '卸力', '推挡', '截拳', '踩腿', '借力摔', '霸体', '冲刺', '冲势', '连段', '爆气', '泼墨', '滚身起'])
    ok(keys.includes(w), '破解表缺：' + w);
  for (const [k, v] of COUNTERS) ok(v.length > 8, k + ' 没写破法');
});
T('破爆气：面朝着格挡只吃三成、被推开一点，爆气方的后摇能被打', () => {
  arena(90); tick(BLOCK, 0, 30); F2.qi = 60; F2.state = 'hit'; F2.stunT = 20;
  tick(BLOCK, TAP('heavy') | TAP('kick')); eq(F2.move && F2.move.name, 'burst');
  tick(BLOCK, 0, 6); ok(F1.state !== 'hit' && F1.state !== 'down', '格挡方不该被炸倒：' + F1.state);
  eq(lost(F1), Math.round(BURST_DMG * BLOCK_KEEP), '挡住只吃三成');
  let k = 0; while (k++ < 40 && !F1.actionable()) tick(0, 0);
  ok(F2.state === 'attack' && F2.move.name === 'burst', '格挡方先能动，爆气方还在后摇');
});
T('破泼墨：擒拿在它出手前抓住它', () => {
  arena(70); F1.qi = QI_MAX; run(45, i => [i === 0 ? TAP('heavy') | TAP('kick') : 0, i === 0 ? TAP('grab') : 0]);
  eq(F2.hp, MAX_HP); ok(F1.hp < MAX_HP, '应该被抓');
});
T('破泼墨：卸力、格挡、跳起', () => {
  arena(110); F1.qi = QI_MAX; run(30, i => [i === 0 ? TAP('heavy') | TAP('kick') : 0, i >= 5 ? BLOCK : 0]);
  eq(F2.stats.parries, 1, '卸力'); eq(F2.hp, MAX_HP);
  arena(110); tick(0, BLOCK, 30); F1.qi = QI_MAX; run(30, i => [i === 0 ? TAP('heavy') | TAP('kick') : 0, BLOCK]);
  eq(lost(F2), Math.round(MOVES.super.dmg * BLOCK_KEEP), '格挡');
  arena(110); F1.qi = QI_MAX; run(30, i => [i === 0 ? TAP('heavy') | TAP('kick') : 0, i === 0 ? TAP('up') : 0]);
  eq(F2.hp, MAX_HP, '跳起');
});

/* ---------- 1.8.0：五局三胜、键位、镜头 ---------- */
T('五局三胜：赢三回合才算赢；两边各赢两回合时是「决胜局」', () => {
  startMatch('pvp'); game.brains = [null, null];
  const win = i => { game.phase = 'fight'; game.p[1 - i].hp = 0; let k = 0; tick(); while (k++ < 400 && !(game.phase === 'intro' || game.phase === 'over')) tick(); };
  win(0); win(1); win(0); eq(game.phase, 'intro', '2:1 还没完'); eq(game.wins, [2, 1]);
  win(1); eq(game.wins, [2, 2]); eq(roundName(), '决胜局');
  win(0); eq(game.phase, 'over'); eq(game.wins, [3, 2]);
});
T('键位：双人对战用双人那两套（两人都绑了的键归玩家二）；玩家一的鼠标键双人里也能用', () => {
  const m1 = keyMapOf(cloneKeys(DEFAULT_KEYS)), m2 = keyMapOf(cloneKeys(DEFAULT_KEYS2)), ms = m1;
  eq(sharedKeys(DEFAULT_KEYS, DEFAULT_KEYS2).size, 0, '默认两套不冲突');
  eq(keyProblems(cloneKeys(DEFAULT_KEYS2)).dup.length + keyProblems(cloneKeys(DEFAULT_KEYS2)).missing.length, 0, '玩家二默认键位完整');
  eq(keyRoute('KeyF', 'pvp', ms, m1, m2), [0, 'jab']); eq(keyRoute('Comma', 'pvp', ms, m1, m2), [1, 'jab']); eq(keyRoute('Numpad2', 'pvp', ms, m1, m2), [1, 'heavy']);
  eq(keyRoute('Comma', 'pve', ms, m1, m2), null, '人机里玩家二的键没用');
  const k1 = cloneKeys(DEFAULT_KEYS); k1.jab = ['Mouse0', 'KeyL']; const n1 = keyMapOf(k1);
  ok(sharedKeys(k1, DEFAULT_KEYS2).has('KeyL'), '要标出两人都绑了的键');
  eq(keyRoute('KeyL', 'pvp', ms, n1, m2), [1, 'block'], '两人都绑了归玩家二');
  eq(keyRoute('Mouse0', 'pvp', ms, n1, m2), [0, 'jab']);
});
T('键位（1.9.1）：单人（人机 / 联机 / 训练场）一套、双人对战两套，互不影响；以前存的那一套两边都先照抄', () => {
  const solo = cloneKeys(DEFAULT_KEYS); solo.jab = ['KeyJ', null]; solo.left = ['ArrowLeft', 'KeyA'];
  const p1 = cloneKeys(DEFAULT_KEYS), p2 = cloneKeys(DEFAULT_KEYS2);
  const ms = keyMapOf(solo), m1 = keyMapOf(p1), m2 = keyMapOf(p2);
  for (const mode of ['pve', 'online', 'train']) {
    eq(keyRoute('KeyJ', mode, ms, m1, m2), [0, 'jab'], mode + '：单人改的键要生效');
    eq(keyRoute('ArrowLeft', mode, ms, m1, m2), [0, 'left'], mode + '：单人用方向键不会被玩家二抢走');
    eq(keyRoute('KeyF', mode, ms, m1, m2), null, mode + '：单人改掉的旧键不再起作用');
  }
  eq(keyRoute('KeyJ', 'pvp', ms, m1, m2), null, '双人里不看单人那套');
  eq(keyRoute('KeyF', 'pvp', ms, m1, m2), [0, 'jab']); eq(keyRoute('ArrowLeft', 'pvp', ms, m1, m2), [1, 'left']);
  // 读存档：1.9.1 以前只存了一套（modou.keys）→ 单人、双人玩家一都用它
  const old = cloneKeys(DEFAULT_KEYS); old.kick = ['KeyK', 'KeyH'];
  const K = Object.create(Keys);
  K.load(k => k === 'modou.keys' ? JSON.stringify(old) : null);
  eq(K.solo.kick, ['KeyK', 'KeyH']); eq(K.p1.kick, ['KeyK', 'KeyH']); eq(K.p2, cloneKeys(DEFAULT_KEYS2));
  // 三套都存过 → 各用各的；坏掉 / 有冲突的退回默认
  const bad = cloneKeys(DEFAULT_KEYS); bad.jab = ['KeyG', null];
  K.load(k => ({ 'modou.keys': JSON.stringify(solo), 'modou.keys1': JSON.stringify(bad), 'modou.keys2': '{坏的' })[k] || null);
  eq(K.solo.jab, ['KeyJ', null]); eq(K.p1.jab, ['KeyJ', null], '双人玩家一的存档坏了：照抄单人那套'); eq(K.p2, cloneKeys(DEFAULT_KEYS2));
  eq(K.route('KeyJ', 'pve'), [0, 'jab']); eq(K.route('ArrowLeft', 'pvp'), [1, 'left']);
});
T('镜头：双人对战两人都在画面里（离得远就拉远）；人机 / 联机镜头跟着自己，对手可以在画面外', () => {
  const view = g => [g.x - W / (2 * g.zoom), g.x + W / (2 * g.zoom)];
  for (const d of [60, 300, 500, MAXD_PVP]) {
    const a = { x: 700 - d / 2 }, b = { x: 700 + d / 2 }, [l, r] = view(camGoal('pvp', a, b, 0));
    ok(a.x - l >= CAM_MARGIN - 1 && r - b.x >= CAM_MARGIN - 1, '双人对战离 ' + d + ' 有人出画');
  }
  ok(camGoal('pvp', { x: 700 }, { x: 800 }, 0).zoom >= ZOOM - 0.01, '离得近要放大到 ' + ZOOM);
  const a = { x: 200 }, b = { x: 1400 }, [l, r] = view(camGoal('pve', a, b, 0));
  ok(a.x >= l + CAM_MARGIN - 1 && a.x <= r, '人机：自己在画面里'); ok(b.x > r, '人机：对手可以在画面外');
  const v2 = view(camGoal('online', a, b, 1)); ok(b.x >= v2[0] && b.x <= v2[1], '联机加入方：镜头跟着玩家二');
  startMatch('pve'); game.brains = [null, null]; game.phase = 'fight'; F1.x = 200; F2.x = 1400; tick(0, 0, 2);
  ok(F2.x - F1.x > MAXD_PVP + 100, '人机两人能离很远');
  arena(100); F1.x = 200; F2.x = 1400; tick(0, 0, 2); ok(F2.x - F1.x <= MAXD_PVP + 1, '双人对战最远 ' + MAXD_PVP);
});

/* ---------- 1.8.0：防守反击 ---------- */
// 玩家二按住格挡（low = 蹲挡）挡玩家一第 0 帧出的 v1；挡住后 after(F) 返回玩家二的输入（返回 null 继续挡）
function guardThen(dist, v1, low, after, n = 90) {
  arena(dist); const G = BLOCK | (low ? DOWN : 0); tick(0, G, 3);
  let done = false;
  run(n, i => {
    let v2 = done ? 0 : G;
    if (!done) { const a = after(); if (a !== null) { v2 = a; done = true; } }
    return [i === 0 ? v1 : 0, v2];
  });
  return done;
}
T('挡后反击：挡住击倒招（扫堂腿），打它收招 ×' + PUNISH_KD_MUL + '，还多 ' + PUNISH_STUN + ' 帧硬直', () => {
  // 挡住的硬直一结束马上出拳（硬直里按拳是推挡）
  guardThen(80, DOWN | TAP('kick'), true, () => F1.move && F1.move.blocked && F2.actionable() ? TAP('jab') : null, 40);
  ok(F2.info && /挡后反击/.test(F2.info.how), '没打出挡后反击：' + (F2.info && F2.info.how));
  eq(lost(F1), Math.round(MOVES.jab.dmg * PUNISH_KD_MUL));
  eq(F1.stunT + 1 >= MOVES.jab.stun + PUNISH_STUN - 4, true, '没多硬直');
});
T('踩腿：蹲挡住扫堂腿后按踢，一脚踩倒（远近都踩得到），伤害算挡后反击', () => {
  for (const d of [80, 118]) {
    let down = false;
    guardThen(d, DOWN | TAP('kick'), true, () => { if (F1.state === 'down') down = true; return F2.state === 'blockstun' ? BLOCK | DOWN | TAP('kick') : null; }, 40);
    for (let i = 0; i < 40 && !down; i++) { tick(); if (F1.state === 'down') down = true; }
    eq(F2.stats.blocks, 1, d + ' 没挡住'); ok(down, d + ' 没踩倒');
    eq(lost(F1), Math.round(MOVES.stomp.dmg * PUNISH_KD_MUL), d + ' 伤害');
  }
  arena(80); tick(0, BLOCK | DOWN, 3); run(40, i => [i === 0 ? DOWN | TAP('jab') : 0, (BLOCK | DOWN) | (F2.state === 'blockstun' ? TAP('kick') : 0)]);
  ok(!F2.move || F2.move.name !== 'stomp', '下盘拳（拳）踩不到');
});
T('截拳：挡住以后按重，花 ' + GC_COST + ' 气从格挡里打出去，打对方收招算挡后反击', () => {
  arena(80); F2.qi = 40; tick(0, BLOCK, 3);
  let used = false;
  run(60, i => { if (F2.move && F2.move.name === 'jieQuan') used = true; return [i === 0 ? TAP('heavy') : 0, used ? 0 : F2.state === 'blockstun' ? TAP('heavy') : BLOCK]; });
  ok(used, '没出截拳'); ok(F2.qi < 40 - GC_COST + 6, '没花气：' + F2.qi);
  eq(lost(F1), Math.round(MOVES.jieQuan.dmg * PUNISH_MUL));
  arena(80); F2.qi = 10; tick(0, BLOCK, 3); used = false;
  run(40, i => { if (F2.move && F2.move.name === 'jieQuan') used = true; return [i === 0 ? TAP('heavy') : 0, F2.state === 'blockstun' ? TAP('heavy') : BLOCK]; });
  ok(!used, '气不够不能出');
});
T('截拳出手前打击无敌：对方接着打的那一拳打不中它', () => {
  arena(80); F2.qi = 40; tick(0, BLOCK, 3);
  let used = false, hpAt = 0;
  run(50, i => {
    if (!used && F2.move && F2.move.name === 'jieQuan') { used = true; hpAt = F2.hp; }
    const v1 = i === 0 || (F1.move && F1.move.name === 'jab' && F1.canCancel('jab')) ? TAP('jab') : 0;
    return [v1, used ? 0 : F2.state === 'blockstun' ? TAP('heavy') : BLOCK];
  });
  ok(used, '没出截拳'); eq(F2.hp, hpAt, '截拳出手前被打中了'); ok(lost(F1) >= MOVES.jieQuan.dmg, '截拳没打中');
});
T('卸力后反打 ×' + PARRY_MUL + '；卸力后按拿 = 借力摔（' + PARRY_THROW_DMG + ' 伤害，挣不脱）', () => {
  const pb = MOVES.heavy.S - 4;
  arena(90); run(60, i => [i === 0 ? TAP('heavy') : 0, (i >= pb && !F2.stats.parries ? BLOCK : 0) | (F2.state === 'parry' && !F2.move ? TAP('heavy') : 0)]);
  eq(F2.stats.parries, 1); eq(lost(F1), Math.round(MOVES.heavy.dmg * PARRY_MUL));
  arena(90); let down = false;
  run(90, i => { if (F1.state === 'down') down = true; return [i === 0 ? TAP('heavy') : 0, (i >= pb && !F2.stats.parries ? BLOCK : 0) | (F2.state === 'parry' ? TAP('grab') : 0)]; });
  eq(F2.stats.parries, 1); ok(down, '借力摔没摔倒'); eq(lost(F1), PARRY_THROW_DMG); ok(F1.x > F2.x, '摔到身后');
});
T('破绽：击倒招打空（扫堂腿够不着），打它收招 ×' + WHIFF_KD_MUL, () => {
  arena(135); let done = false;
  run(60, i => {
    let v2 = 0;
    if (!done && F1.move && F1.move.name === 'sweep' && F1.move.t > F1.move.S + F1.move.def.A) { v2 = TAP('kick'); done = true; }
    return [i === 0 ? DOWN | TAP('kick') : 0, v2];
  });
  ok(F2.info && /破绽/.test(F2.info.how), '没打出破绽：' + (F2.info && F2.info.how)); eq(lost(F1), Math.round(MOVES.kick.dmg * WHIFF_KD_MUL));
});
T('扫堂腿（1.8.0）：射程比腿踢短一截、前摇 ≥ 11 帧，被蹲挡住对方能先动 ≥ 12 帧', () => {
  const R = n => MOVES[n].reach + MOVES[n].lunge[2];
  ok(R('sweep') + 15 <= R('kick'), `扫堂腿 ${R('sweep')} 腿踢 ${R('kick')}`); ok(MOVES.sweep.S >= 11);
  arena(90); tick(0, BLOCK | DOWN, 3); let f1 = -1, f2 = -1, blocked = false;
  for (let i = 0; i < 80; i++) { step([i === 0 ? DOWN | TAP('kick') : 0, BLOCK | DOWN]); if (F1.move && F1.move.blocked) blocked = true; if (blocked && f2 < 0 && F2.state !== 'blockstun') f2 = i; if (blocked && f1 < 0 && F1.actionable()) f1 = i; }
  ok(f1 - f2 >= 12, '帧差 ' + (f1 - f2));
});
T('滚身起：倒地时按住方向，起身时往那边滚开，滚完面朝对手；不按方向原地起', () => {
  for (const roll of [true, false]) {
    arena(90); let x0 = null, x1 = null;
    for (let i = 0; i < 160; i++) {
      step([i === 0 ? DOWN | TAP('kick') : 0, roll && F2.state === 'down' ? RIGHT : 0]);
      if (F2.state === 'down' && F2.downPhase === 'getup' && x0 === null) x0 = F2.x;
      if (x0 !== null && x1 === null && F2.state !== 'down') x1 = F2.x;
    }
    ok(x0 !== null && x1 !== null, '没倒地 / 没起来');
    if (roll) { ok(Math.abs(x1 - x0 - ROLL_DIST) < 6, '滚了 ' + Math.round(x1 - x0)); eq(F2.facing, -1, '滚完面朝对手'); }
    else ok(Math.abs(x1 - x0) < 6, '没按方向也滚了');
  }
});

/* ---------- 1.8.0：擒拿 ---------- */
T('站着的擒拿抓不到蹲着、蹲挡的人', () => {
  for (const v of [DOWN, BLOCK | DOWN]) { arena(70); tick(0, v, 3); run(40, i => [i === 0 ? TAP('grab') : 0, v]); eq(F2.hp, MAX_HP); ok(!F2.grabbed && F2.state !== 'down'); }
});
T('抄腿（蹲+拿）：抓蹲挡的人 → 擒住 → 抱腿摔；抓不到站着的', () => {
  arena(70); tick(0, BLOCK | DOWN, 3); let down = false;
  run(80, i => { if (F2.state === 'down') down = true; return [i === 0 ? DOWN | TAP('grab') : 0, BLOCK | DOWN]; });
  ok(down, '没摔倒'); eq(lost(F2), TACKLE_DMG);
  arena(70); run(50, i => [i === 0 ? DOWN | TAP('grab') : 0, 0]); eq(F2.hp, MAX_HP, '站着的抓不到');
  arena(70); run(50, i => [i === 0 ? DOWN | TAP('grab') : 0, BLOCK]); eq(F2.hp, MAX_HP, '站挡的也抓不到');
});
T('抄腿接住扫堂腿 → 抄腿摔（挣不脱）；站着的擒拿接不住扫堂腿', () => {
  let caught = false;
  for (let p = 0; p < 12 && !caught; p++) {
    arena(100); run(70, i => [i === p ? DOWN | TAP('grab') : 0, i === 0 ? DOWN | TAP('kick') : 0]);
    if (F1.hp === MAX_HP && lost(F2) === SCOOP_DMG && F1.stats.specials === 1) caught = true;
  }
  ok(caught, '抄不到扫堂腿');
  for (let p = 0; p < 12; p++) { arena(100); run(70, i => [i === p ? TAP('grab') : 0, i === 0 ? DOWN | TAP('kick') : 0]); ok(F2.hp === MAX_HP, '站着擒拿接住了扫堂腿 p=' + p); }
});
T('擒住后：拳 = 提膝撞（不倒、你先动）；踢 = 别腿摔（倒在面前）；重 = 过肩摔（摔到身后）', () => {
  const grabThen = key => {
    arena(70); let down = false, free1 = -1, free2 = -1;
    for (let i = 0; i < 90; i++) {
      const pick = F1.move && F1.move.name === 'hold' && F1.move.t === 2 ? TAP(key) : 0;
      step([i === 0 ? TAP('grab') : pick, 0]);
      if (F2.state === 'down') down = true;
      if (i > 10 && free1 < 0 && F1.actionable()) free1 = i;
      if (i > 10 && free2 < 0 && F2.actionable()) free2 = i;
    }
    return { down, adv: free2 - free1 };
  };
  let r = grabThen('jab'); eq(lost(F2), KNEE_DMG[0] + KNEE_DMG[1], '提膝伤害'); ok(!r.down, '提膝不该击倒'); ok(r.adv >= KNEE_ADV - 1, '提膝后帧差 ' + r.adv);
  r = grabThen('kick'); ok(r.down, '别腿摔没倒'); eq(lost(F2), TRIP_DMG); ok(F2.x > F1.x, '倒在面前');
  r = grabThen('heavy'); ok(r.down, '过肩摔没倒'); eq(lost(F2), THROW_DMG); ok(F2.x < F1.x, '摔到身后');
});
T('按住后 + 拿：不转身，抓住面前的人直接过肩摔（以前容易转身抓空）', () => {
  arena(70); let faceAtHold = 0;
  run(80, i => { if (F1.move && F1.move.name === 'hold' && !faceAtHold) faceAtHold = F1.facing; return [i <= 2 ? LEFT | (i === 0 ? TAP('grab') : 0) : 0, 0]; });
  eq(faceAtHold, 1, '不该转身'); eq(lost(F2), THROW_DMG); ok(F2.x < F1.x, '摔到身后');
  arena(200); tick(LEFT | TAP('grab')); eq(F1.move && F1.move.name, 'grab'); eq(F1.facing, -1, '离得远照常转身');
});
T('挣脱：被擒住马上按拿就挣开，不掉血；按晚了挣不开', () => {
  arena(70); let pressed = false;
  run(60, i => { const v2 = F2.grabbed && !pressed ? (pressed = true, TAP('grab')) : 0; return [i === 0 ? TAP('grab') : 0, v2]; });
  eq(F2.hp, MAX_HP); eq(F2.stats.escapes, 1); ok(!F2.grabbed);
  arena(70); pressed = false;
  run(60, i => { const v2 = F2.grabbed && !pressed && F2.clock - F2.heldAt > HOLD_ESC ? (pressed = true, TAP('grab')) : 0; return [i === 0 ? TAP('grab') : 0, v2]; });
  eq(F2.stats.escapes, 0); ok(F2.hp < MAX_HP, '按晚了应该挣不开');
});
T('1.8.0 新动作（擒住后续、挣脱、截拳、踩腿、抄腿、滚身起）同样的输入两次结果一样', () => {
  const once = () => {
    arena(150); F1.qi = 60; F2.qi = 60;
    let s = 777; const rand = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
    const acts = [TAP('jab'), TAP('heavy'), TAP('kick'), TAP('grab'), DOWN | TAP('grab'), DOWN | TAP('kick'), LEFT | TAP('grab'), TAP('up'), BLOCK, BLOCK | DOWN];
    const hs = [];
    for (let i = 0; i < 3000; i++) {
      const bot = F => F.state === 'blockstun' ? (rand() < 0.5 ? TAP('kick') | DOWN : TAP('heavy')) : F.grabbed ? (rand() < 0.4 ? TAP('grab') : 0)
        : F.state === 'down' ? (rand() < 0.5 ? LEFT : RIGHT) : F.move && F.move.name === 'hold' ? acts[(rand() * 3) | 0] : rand() < 0.12 ? acts[(rand() * acts.length) | 0] : rand() < 0.3 ? (rand() < 0.5 ? LEFT : RIGHT) : 0;
      step([bot(F1), bot(F2)]);
      if (i % 200 === 0) hs.push(stateHash());
    }
    return hs.concat([stateHash(), F1.stats, F2.stats]);
  };
  eq(once(), once());
});

/* ---------- 1.9.0：千斤坠、空中交手 ---------- */
// 玩家一往右跳、第 p 帧出千斤坠；follow = 千斤坠踩中后第一时间按的键；v2(i) = 玩家二的输入
function diveRun(dist, p, v2, follow, n = 110) {
  arena(dist); const r = { hitAt: -1, freeAt: -1, b2free: -1, free2: 0, names: [], crash: false, down2: false };
  let sent = false;
  for (let i = 0; i < n; i++) {
    let v1 = (i === 0 ? TAP('up') | RIGHT : i < 4 ? RIGHT : 0) | (i === p ? DOWN | TAP('kick') : 0);
    if (follow && r.hitAt >= 0 && !sent && F1.actionable()) { v1 |= TAP(follow); sent = true; }
    step([v1, v2 ? v2(i) : 0]);
    if (F1.move && r.names[r.names.length - 1] !== F1.move.name) r.names.push(F1.move.name);
    if (r.hitAt < 0 && F1.move && F1.move.name === 'dive' && (F1.move.hit || F1.move.blocked)) r.hitAt = i;
    if (r.hitAt >= 0 && r.freeAt < 0 && F1.actionable()) r.freeAt = i;
    if (r.hitAt >= 0 && r.b2free < 0 && F2.actionable()) r.b2free = i;
    if (follow && r.hitAt >= 0 && F1.stats.hits < 2 && F2.actionable()) r.free2++;
    if (F2.info && F2.info.how === '倒栽葱') r.crash = true;
    if (F2.state === 'down') r.down2 = true;
  }
  return r;
}
T('千斤坠（1.9.0）：前摇更慢（≥ 15 帧，在高处悬一下，看得见）；踩中站着的人，落地后你先动 ≥ 8 帧', () => {
  ok(MOVES.dive.S >= 15, '前摇 ' + MOVES.dive.S); eq(MOVES.dive.tier, 'dive');
  const r = diveRun(140, 10);
  ok(r.hitAt > 0, '没踩中'); eq(lost(F2), Math.round(MOVES.dive.dmg * AIR_BONUS)); ok(r.b2free - r.freeAt >= 8, '帧差 ' + (r.b2free - r.freeAt));
});
T('千斤坠踩中后接腿的连招（这一下算腿起手）：踢 = 二起脚、重 = 盖步砸拳、拳 = 落步冲拳，都是真连', () => {
  for (const [k, name] of [['kick', 'twinKick'], ['heavy', 'hammer'], ['jab', 'stepPunch']]) {
    const r = diveRun(150, 10, null, k);
    eq(r.names, ['dive', name], k); eq(F1.stats.hits, 2, k + ' 没接上'); eq(r.free2, 0, k + ' 中间挨打方能动');
  }
});
T('千斤坠专破蹲着的：踩蹲着、蹲挡 ×' + DIVE_CROUCH_MUL + '；托天掌打不到它，反被踩倒 ×' + DIVE_AA_MUL, () => {
  const base = MOVES.dive.dmg * AIR_BONUS;
  for (const v of [DOWN, DOWN | BLOCK]) { diveRun(150, 10, () => v); eq(lost(F2), Math.round(base * DIVE_CROUCH_MUL)); eq(F2.info === null || F2.stats.blocks === 0, true, '蹲挡挡住了'); }
  for (const q of [12, 16, 20]) {
    const r = diveRun(150, 10, i => i === q ? DOWN | TAP('heavy') : 0);
    eq(F1.hp, MAX_HP, '托天掌@' + q + ' 打到了千斤坠'); eq(lost(F2), Math.round(base * DIVE_AA_MUL), '托天掌@' + q); ok(r.down2, '没踩倒');
  }
});
T('千斤坠怕站着的拳：迎着打 = 倒栽葱（×' + DIVE_PUNCH_MUL + '、倒地 ' + LIE_CRASH + ' 帧）；站挡挡得住，落地后摇长', () => {
  for (const [k, q] of [['jab', 24], ['heavy', 18]]) {
    const r = diveRun(150, 10, i => i === q ? TAP(k) : 0);
    ok(r.crash, k + ' 没打出倒栽葱'); eq(lost(F1), Math.round(MOVES[k].dmg * DIVE_PUNCH_MUL), k); eq(F2.hp, MAX_HP);
    eq(F1.state, 'down'); eq(F1.lieT, LIE_CRASH);
  }
  const r = diveRun(150, 10, () => BLOCK);
  eq(F2.stats.blocks, 1, '站挡'); ok(r.freeAt - r.b2free >= 14, '挡住后对方先动 ' + (r.freeAt - r.b2free) + ' 帧');
});
// 玩家一跑两步跳起，第 p 帧飞踢；玩家二第 q 帧按 v
function flyKick(dist, p, q, v, n = 120) {
  arena(dist); const r = { x0: null, x1: null, hitInTumble: false };
  for (let i = 0; i < n; i++) {
    step([(i < 6 ? RIGHT : 0) | (i === 0 ? TAP('up') : 0) | (i === p ? TAP('kick') : 0), i === q ? v : 0]);
    if (F1.state === 'tumble' && r.x0 === null) r.x0 = F1.x;
    if (r.x0 !== null && r.x1 === null && F1.state !== 'tumble') r.x1 = F1.x;
  }
  return r;
}
T('空中的腿撞上地上的腿 = 翻滚回去：空中那个吃一半伤害、往后翻着飞 ≥ 150（途中打不中）；地上的不掉血', () => {
  const r = flyKick(170, 12, 4, TAP('kick'));
  ok(r.x0 !== null, '没翻滚'); ok(r.x0 - r.x1 >= 150, '只飞了 ' + Math.round(r.x0 - r.x1));
  eq(lost(F1), Math.round(MOVES.kick.dmg * TUMBLE_KEEP)); eq(F2.hp, MAX_HP);
  arena(150); F1.state = 'tumble'; F1.alt = 40; F1.vz = 3; F1.vx = -6; ok(F1.invuln(), '翻滚途中应该打不中');
  // 腿出晚了（飞踢先到）：飞踢照样克腿
  flyKick(170, 12, 12, TAP('kick')); ok(F2.hp < MAX_HP && F1.hp === MAX_HP, '晚出的腿应该被飞踢克');
});
T('对空招打下飞踢 = 倒栽葱，倒地 ' + LIE_CRASH + ' 帧（以前和普通倒地一样）', () => {
  flyKick(170, 12, 14, DOWN | TAP('heavy'));
  eq(F2.info && F2.info.how, '倒栽葱'); eq(F1.lieT, LIE_CRASH); eq(F2.hp, MAX_HP);
});
T('1.9.0 新规则（千斤坠接连招、倒栽葱、翻滚、朝向吸附）同样的输入两次结果一样', () => {
  const once = () => {
    arena(160); const hs = [];
    let s = 4242; const rand = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
    for (let i = 0; i < 3000; i++) {
      const bot = F => F.airborne ? (rand() < 0.15 ? (rand() < 0.5 ? DOWN | TAP('kick') : TAP('kick')) : 0)
        : rand() < 0.06 ? TAP('up') | (rand() < 0.5 ? LEFT : RIGHT) : rand() < 0.1 ? [TAP('jab'), TAP('kick'), TAP('heavy'), DOWN | TAP('heavy'), BLOCK][(rand() * 5) | 0] | (rand() < 0.5 ? LEFT : 0)
        : rand() < 0.3 ? (rand() < 0.5 ? LEFT : RIGHT) : 0;
      step([bot(F1), bot(F2)]);
      if (i % 150 === 0) hs.push(stateHash());
    }
    return hs.concat([F1.stats, F2.stats]);
  };
  eq(once(), once());
});

T('1.9.2：讲规则的字（谁克谁、该站挡还是蹲挡）不飘在人身上（训练场也不飘），写在训练场面板的「这下」里', () => {
  let seen = [];
  const arenaIn = (mode, dist) => { startMatch(mode); game.brains = [null, null]; game.phase = 'fight'; game.paused = true; F1.x = 520; F2.x = 520 + dist; FX.length = 0; seen = []; };
  const has = re => seen.some(t => re.test(t));
  const push = FX.push;
  FX.push = function (...a) { for (const o of a) if (o.type === 'tag') seen.push(o.text); return push.apply(this, a); };
  try {
    for (const mode of ['pvp', 'train']) {
      arenaIn(mode, 100); run(60, i => [i === 0 ? TAP('heavy') : 0, i === 2 ? TAP('kick') : 0]);      // 腿克重
      ok(!has(/克/), mode + '：不飘「腿克重」：' + seen); ok(has(/^-\d+$/), mode + '：伤害数字照出');
      arenaIn(mode, 110); F1.chain = ['jab']; F1.chainIdle = 0;
      run(40, i => [i === 3 ? TAP('kick') : 0, i === 0 ? TAP('kick') : 0]);                            // 鞭腿压腿踢
      ok(seen.includes('压') && !has(/起手|克/), mode + '：只飘一个「压」：' + seen);
      eq(F1.info.why, '起手 拳克腿', mode + '：面板里写为什么压得住');
      arenaIn(mode, 60); run(30, i => [DOWN | (i === 2 ? TAP('jab') : 0), BLOCK]);                      // 站挡挨下盘拳
      ok(!has(/要蹲挡|要站挡/), mode + '：不飘「要蹲挡」：' + seen); eq(F1.info.why, '下段：站着挡不住');
    }
    // Jack 说的：训练场里木桩蹲挡，重 重（劈挂掌，上段）打中 → 不飘「要站挡」，面板写「上段：蹲着挡不住」
    arenaIn('train', 80);
    const names = combo(['heavy', 'heavy'], DOWN | BLOCK); tick(0, DOWN | BLOCK, 20);
    eq(names[1], 'chop'); eq([F1.info.label, F1.info.blocked], ['劈挂掌', false], '劈挂掌该打中蹲挡'); ok(!has(/要站挡/), '不飘「要站挡」：' + seen);
    eq(F1.info.why, '上段：蹲着挡不住');
  } finally { FX.push = push; }
});

T('1.9.3 音量：0 没声；越往上越响，最多是默认的 2.5 倍；超出 0~100 的拉回来；2.3 默认（50）= 2.2 的 70（= 2.0.2 的 112），前后都跟着挪', () => {
  const was = Sound.vol;
  const old = v => 1.3 * Math.pow(v / 50, 1.32);                       // 2.0.2 的音量曲线
  const v22 = v => old(v * 1.6);                                        // 2.1 / 2.2 的音量曲线
  ok(Math.abs(Sound.gainFor(50) - v22(70)) < 1e-9, '默认要和 2.2 的 70 一样响：' + Sound.gainFor(50)); eq(Sound.gainFor(0), 0);
  for (const v of [10, 25, 40, 60, 80, 100]) ok(Math.abs(Sound.gainFor(v) - v22(v * 1.4)) < 1e-9, '整条曲线跟着挪：' + v);
  ok(Math.abs(Sound.gainFor(100) / Sound.gainFor(50) - 2.5) < 0.01, '最响是默认的 2.5 倍');
  for (let v = 5; v <= 100; v += 5) ok(Sound.gainFor(v) > Sound.gainFor(v - 5), '音量 ' + v + ' 要比 ' + (v - 5) + ' 响');
  Sound.setVol(130); eq(Sound.vol, 100); Sound.setVol(-5); eq(Sound.vol, 0);
  Sound.setVol(was);
  // 存过的音量换成新刻度：没动过（2.2 每次打开都存一个 50）的用新默认；改过的听着和以前一样响
  const load = o => Sound.volFromStore(k => o[k] === undefined ? null : String(o[k]));
  eq(load({}), 50, '没存过');
  eq(load({ 'modou.vol2': 50 }), 50, '2.2 存的 50（没动过）：新默认');
  eq(load({ 'modou.vol2': 70 }), 50, '2.2 的 70 = 现在的 50');
  eq(load({ 'modou.vol2': 100 }), 71, '2.2 的 100');
  eq(load({ 'modou.vol2': 20 }), 14, '2.2 的 20');
  eq(load({ 'modou.vol3': 33, 'modou.vol2': 90 }), 33, '2.3 存的优先');
  eq(load({ 'modou.vol': 80 }), 36, '1.9.3 存的 80');
});
T('1.9.4 站姿：两腿岔开站成「人」字（前脚不再往前戳），两条腿都差不多直；待机时髋几乎不上下动（腿不跟着一弯一直）；出招的底子比站姿低', () => {
  const st = POSE.stance, leg = BONE.th + BONE.sh;
  ok(st.ff[0] >= 10 && st.ff[0] <= 18 && st.bf[0] <= -10 && st.bf[0] >= -18, '两脚各往外一点：' + st.ff + ' / ' + st.bf);
  ok(st.ff[0] - st.bf[0] <= 34, '两脚别岔太开：' + (st.ff[0] - st.bf[0]));
  for (const f of [st.ff, st.bf]) { const d = Math.hypot(f[0], st.hy); ok(d >= leg - 1.2 && d <= leg, '腿差不多伸直、脚踩得到地：' + d.toFixed(1)); }
  // 待机呼吸：看几个相位，髋高最多差 1（以前 ±3，后腿膝盖一弯一直）
  arena(400); let lo = 1e9, hi = -1e9;
  for (let i = 0; i < 80; i++) { tick(); const t = F1.target(); lo = Math.min(lo, t.hy); hi = Math.max(hi, t.hy); }
  ok(hi - lo <= 1, '待机髋上下动了 ' + (hi - lo).toFixed(2));
  ok(BASE.hy > 48 && BASE.hy < st.hy, '出招底子 ' + BASE.hy);
});
T('1.9.4 手臂：大臂比小臂长（以前小臂长），整条胳膊长度不变；跑步往前摆时小臂斜着往前上、手不再平平地往前够', () => {
  ok(BONE.ua > BONE.fa, `大臂 ${BONE.ua} 小臂 ${BONE.fa}`); eq(BONE.ua + BONE.fa, 49, '整条胳膊');
  // 摆到最前面：同侧腿刚抬起往前带（相位 0.54 左右）
  let best = null;
  for (let u = 0.45; u <= 0.65; u += 0.01) { const hnd = runArm(u, 30, 1); if (!best || hnd[0] > best[0]) best = hnd; }
  ok(best[0] <= 40, '手往前够了 ' + best[0].toFixed(1));
  // 小臂的方向：肘到手
  const c = Math.cos(TAU * (0.54 - 0.04)), th = (-c * 70 + 6 - 18) * D2R, el = [Math.sin(th) * BONE.ua, Math.cos(th) * BONE.ua], h = runArm(0.54, 30, 1);
  const up = Math.atan2(el[1] - h[1], h[0] - el[0]) / D2R;       // 小臂高过水平几度
  ok(up >= 40, '小臂只往上斜了 ' + up.toFixed(0) + '°');
});
T('1.9.4 跳起来：大臂往下斜（斜向下 30° 以上，以前差不多平着），小臂还是往下垂', () => {
  for (const [nm, p] of [['上升', POSE.jup], ['顶点', POSE.jtop], ['下落', POSE.jdn], ['飞身', POSE.leap], ['飞身下落', POSE.leapDn]]) {
    for (const [hand, hint] of [[p.fh, p.fe], [p.bh, p.be]]) {
      const r = ik(0, 0, hand[0], hand[1], BONE.ua, BONE.fa, -0.3, hint);
      const down = Math.atan2(r[1], Math.abs(r[0])) / D2R;        // 大臂往下斜几度（前后都按往外算）
      ok(down >= 30, `${nm}：大臂只往下斜 ${down.toFixed(0)}°`);
      ok(r[3] > r[1], `${nm}：手要在肘下面（小臂往下垂）`);
    }
  }
});

/* ---------- 训练场（2.0.2 以前叫打桩练习） ---------- */
T('训练场：木桩血多、不还手、掉到三成以下打完就回满；面板有数值', () => {
  startMatch('train'); game.phase = 'fight';
  eq(F2.maxHp, DUMMY_HP); eq(F2.hp, DUMMY_HP); ok(game.endless);
  F1.x = 520; F2.x = 600;
  combo(['jab', 'heavy']); ok(F1.info && F1.info.dmg > 0, '没有数值'); ok(F1.comboDmg >= MOVES.jab.dmg, '连击伤害');
  F2.hp = DUMMY_HP * DUMMY_REFILL - 10; tick(0, 0, 60); eq(F2.hp, DUMMY_HP, '没回满');
  eq(F1.hp, MAX_HP);
  game.brains[1].mode = 'block'; tick(0, 0, 5); eq(F2.state, 'block');
  startMatch('pvp'); eq(F2.maxHp, MAX_HP); eq(F2.name, '靛');
});

/* ---------- 键位 ---------- */
T('键位：默认没有冲突、每个动作都有键；同一个键给两个动作会报冲突，没键的动作会报缺键', () => {
  const d = keyProblems(cloneKeys(DEFAULT_KEYS));
  eq(d.dup.length, 0); eq(d.missing.length, 0);
  const k = cloneKeys(DEFAULT_KEYS); k.heavy[0] = 'KeyF'; k.up = [null, null];
  const p = keyProblems(k);
  eq(p.dup.map(x => x[0]), ['KeyF']); eq(p.dup[0][1].sort(), ['heavy', 'jab']); eq(p.missing, ['up']);
  const k2 = cloneKeys(DEFAULT_KEYS); k2.jab = ['KeyQ', 'KeyQ'];
  eq(keyProblems(k2).dup.map(x => x[0]), ['KeyQ'], '同一个动作两格填同一个键也算重复');
});
T('键位：改过的键位变成按键表；坏掉的存档会退回默认', () => {
  const k = cloneKeys(DEFAULT_KEYS); k.jab = ['KeyQ', null];
  const m = keyMapOf(k);
  eq(m.KeyQ, 'jab'); eq(m.KeyF, undefined); eq(m.KeyA, 'left');
  eq(cloneKeys({ jab: ['KeyQ'] }).jab, ['KeyQ', null]); eq(cloneKeys({}).up, [null, null]);
  eq(keyName('KeyQ') + keyName('ArrowUp') + keyName('Space') + keyName(null), 'Q↑空格—');
});
T('键位：能绑鼠标按键（左右中键、两个侧键），显示成中文', () => {
  const k = cloneKeys(DEFAULT_KEYS); k.jab = ['Mouse0', 'KeyF']; k.kick = ['Mouse4', null]; k.grab = ['Mouse3', 'KeyT'];
  eq(keyProblems(k).dup.length, 0); const m = keyMapOf(k); eq([m.Mouse0, m.Mouse4, m.Mouse3], ['jab', 'kick', 'grab']);
  eq([0, 1, 2, 3, 4].map(b => keyName('Mouse' + b)), ['鼠标左键', '鼠标中键', '鼠标右键', '鼠标侧键·后', '鼠标侧键·前']);
});

/* ---------- 人物颜色 ---------- */
T('人物颜色：八种颜色、名字都不重复；电脑「随机」不会和玩家撞色', () => {
  eq(PALETTE.length, 8); eq(new Set(PALETTE.map(p => p.color)).size, 8); eq(new Set(PALETTE.map(p => p.name)).size, 8);
  for (let i = 0; i < 40; i++) ok(cpuLook() !== Looks.solo.me, '电脑和玩家撞色');
  startMatch('pve'); ok(F1.look !== F2.look && F1.name !== F2.name, '人机两边颜色应该不同');
  startMatch('train'); eq(F2.name, '桩');
  startMatch('pvp'); eq([F1.look, F2.look], Looks.pvp);
});
T('联机选色：房主说了算 —— 加入方想要的和房主撞了就换一个；不撞就给他', () => {
  eq(settleLook('ink', 'pine', null), 'pine');
  ok(settleLook('ink', 'ink', null) !== 'ink', '不能和房主一样');
  eq(settleLook('ink', 'ink', 'teal'), 'teal', '撞了就保持原来的');
  eq(settleLook('pine', null, 'pine') !== 'pine', true);
});

/* ---------- 联机 ---------- */
T('同样的输入两次结果完全一样（联机同步的前提）', () => {
  const run1 = () => {
    arena(200); F1.qi = 40; F2.qi = 40;
    let s = 12345;
    const rand = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
    const acts = ['left', 'right', 'up', 'down', 'block', 'jab', 'heavy', 'kick', 'grab', 'pair', 'djab', 'dkick'];
    const pickV = () => {
      const a = acts[(rand() * acts.length) | 0];
      if (a === 'pair') return TAP('heavy') | TAP('kick');
      if (a === 'djab') return DOWN | TAP('jab');
      if (a === 'dkick') return DOWN | TAP('kick');
      return PRESS_SET.has(a) ? TAP(a) : HOLD(a);
    };
    const hs = [];
    let h1 = 0, h2 = 0;
    for (let i = 0; i < 4000; i++) {
      if (rand() < 0.08) h1 = rand() < 0.5 ? HOLD(['left', 'right', 'block', 'down'][(rand() * 4) | 0]) : 0;
      if (rand() < 0.08) h2 = rand() < 0.5 ? HOLD(['left', 'right', 'block', 'down'][(rand() * 4) | 0]) : 0;
      step([h1 | (rand() < 0.15 ? pickV() : 0), h2 | (rand() < 0.15 ? pickV() : 0)]);
      if (i % 300 === 0) hs.push(stateHash());
    }
    hs.push(stateHash());
    return hs;
  };
  eq(run1(), run1());
});
T('中继设置：能读 Metered 复制出来的数组、JSON、每行一个；密码里有冒号逗号也不坏；读不懂会说明原因', () => {
  const metered = `[
    { urls: "stun:stun.relay.metered.ca:80", },
    { urls: "turn:global.relay.metered.ca:80", username: "ab12", credential: "x,y:z", },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'ab12', credential: 'x,y:z', },
  ]`;
  const r1 = parseRelay(metered);
  eq(r1.length, 3); eq(r1[1], { urls: 'turn:global.relay.metered.ca:80', username: 'ab12', credential: 'x,y:z' });
  eq(parseRelay('const cfg = { iceServers: ' + metered + ' };'), r1);
  eq(parseRelay('{"iceServers":{"urls":["turn:a.b:3478"],"username":"u","credential":"c"}}'), [{ urls: 'turn:a.b:3478', username: 'u', credential: 'c' }]);
  eq(parseRelay('turn:relay.example.com:3478 user pass\nturn:relay.example.com:3478?transport=tcp, user, pass').length, 2);
  for (const bad of ['随便写的', '[{"urls":"stun:a.b:3478"}]', 'turn:a.b:3478']) {
    let threw = false; try { parseRelay(bad); } catch (e) { threw = /[一-龥]/.test(e.message); } ok(threw, '应该报中文错误：' + bad);
  }
});
T('手动连接：连接码会带上房主的中继（对方不用自己填）；应答码不带', async () => {
  const relay = [{ urls: 'turn:relay.example.com:3478', username: 'u', credential: 'p' }];
  const offer = { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' };
  const d = await unpackDesc(await packDesc(offer, relay));
  eq(d.relay, relay); eq(d.type, 'offer'); eq(d.sdp, offer.sdp); eq(d.version, VERSION);
  let msg = ''; try { checkVersion(undefined, '对方'); } catch (e) { msg = e.message; } ok(/旧版本/.test(msg), '旧版本要拦下');
  msg = ''; try { checkVersion('1.0.0', '对方'); } catch (e) { msg = e.message; } ok(/1\.0\.0/.test(msg), '版本不同要拦下');
  eq((await unpackDesc(await packDesc({ type: 'answer', sdp: 'v=0' }))).relay, undefined);
  eq(mergeIce(relay, relay, [{ urls: 'stun:x' }]).length, 2, '去重');
});
T('连接码能打包再还原', async () => {
  const desc = { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\na=candidate:1 1 udp 2122260223 192.168.1.5 54321 typ host\r\n' };
  const code = await packDesc(desc);
  ok(/^MD[zp][A-Za-z0-9_-]+$/.test(code), '格式');
  const back = await unpackDesc(code); eq({ type: back.type, sdp: back.sdp }, desc); eq(back.version, VERSION);
});

/* ---------- 1.9.0：联机回滚、房间码 ---------- */
// 固定种子的随机输入：两个人各自按住方向 / 格挡 / 蹲，时不时按招
function randInputs(seed, n) {
  let s = seed >>> 0;
  const rand = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  const acts = ['jab', 'heavy', 'kick', 'grab', 'up'], held = [0, 0], out = [];
  for (let i = 0; i < n; i++) {
    const v = [0, 0];
    for (let p = 0; p < 2; p++) {
      if (rand() < 0.08) held[p] = rand() < 0.6 ? HOLD(['left', 'right', 'block', 'down', 'up'][(rand() * 5) | 0]) : 0;
      v[p] = held[p] | (rand() < 0.14 ? TAP(acts[(rand() * acts.length) | 0]) : 0);
    }
    out.push(v);
  }
  return out;
}
// 状态全文（比 stateHash 细：存档里所有逻辑字段，键排好序；招式定义只记名字）
function fullState() {
  const norm = (v, k) => k === 'def' ? Object.keys(MOVES).find(n => MOVES[n] === v) :
    Array.isArray(v) ? v.map(x => norm(x)) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, key) => (o[key] = norm(v[key], key), o), {}) : v;
  return JSON.stringify(norm(saveState()));
}
T('存档 / 读档（联机回滚用）：读档后按同样的输入接着算，和一口气算下来的完全一样', () => {
  const ins = randInputs(4242, 2400), junk = randInputs(99, 300);
  arena(200); F1.qi = F2.qi = 40;
  for (const v of ins) step(v);
  const want = fullState(), wantH = stateHash();
  arena(200); F1.qi = F2.qi = 40;
  for (let i = 0; i < ins.length; i++) {
    if (i === 900) {                       // 存档 → 按别的输入乱算一段（= 猜错了）→ 读档
      const snap = saveState();
      for (const v of junk) step(v);
      loadState(snap);
    }
    step(ins[i]);
  }
  eq(stateHash(), wantH); eq(fullState(), want, '存档漏了逻辑字段');
});
// 模拟联机：本机用 Rollback 往前算，对方的输入经过一条又慢（1~8 帧）、又乱序、还丢包（15%）的网络到达
function rollbackRun(role, seed) {
  const N = 1500, delay = 2, ins = randInputs(seed, N), me = role === 'host' ? 0 : 1;
  const inp = (f, p) => f < delay || f >= N ? 0 : ins[f][p];
  arena(200); F1.qi = F2.qi = 40;
  const want = {};
  for (let f = 0; f < N; f++) { step([inp(f, 0), inp(f, 1)]); if ((f + 1) % NET.HASH_EVERY === 0) want[f + 1] = stateHash(); }
  const wantFull = fullState();
  arena(200); F1.qi = F2.qi = 40;
  const rb = new Rollback(delay, role);
  let s = seed * 7 + 1; const rand = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  const net = [], got = {};
  let t = 0, maxSnaps = 0;
  while (rb.frame < N && t < N * 3) {
    t++;
    const last = t + delay;                                  // 对方差不多和我同步往前走：每帧发一包，带最近 20 帧
    if (rand() > 0.15) {
      const first = Math.max(delay, last - 19), vals = [];
      for (let f = first; f <= last; f++) vals.push(inp(f, 1 - me));
      net.push([t + 1 + ((rand() * 8) | 0), first, vals]);
    }
    for (let i = net.length - 1; i >= 0; i--) if (net[i][0] <= t) { rb.receive(net[i][1], net[i][2]); net.splice(i, 1); }
    rb.rollback();
    rb.sample(f => inp(f, me));
    if (rb.canAdvance()) rb.advance();
    for (const [f, h] of rb.takeHashes()) got[f] = h;
    rb.prune(); maxSnaps = Math.max(maxSnaps, rb.snaps.size);
  }
  const rest = []; for (let f = delay; f < N + delay; f++) rest.push(inp(f, 1 - me));
  rb.receive(delay, rest); rb.rollback();
  for (const [f, h] of rb.takeHashes()) got[f] = h;
  return { rb, want, wantFull, got, maxSnaps, N };
}
for (const role of ['host', 'guest']) T(`回滚（${role === 'host' ? '房主' : '加入方'}）：对方的输入晚到、乱序、丢包，回滚重算后和「早知道真输入」一口气算的完全一样`, () => {
  const r = rollbackRun(role, role === 'host' ? 777 : 778);
  eq(r.rb.frame, r.N);
  ok(r.rb.stats.rollbacks > 20, '应该回滚过很多次：' + r.rb.stats.rollbacks);
  ok(r.rb.stats.maxDepth <= NET.MAX_PRED + 1, '回滚最深 ' + r.rb.stats.maxDepth + ' 帧');
  ok(r.maxSnaps <= NET.MAX_PRED + 1, '存档没及时清掉：' + r.maxSnaps);
  ok(!game.quiet, '重算完要恢复出特效');
  const fs = Object.keys(r.want);
  ok(Object.keys(r.got).length >= fs.length - 1, '核对指纹的帧太少');
  for (const f of Object.keys(r.got)) eq(r.got[f], r.want[f], '第 ' + f + ' 帧状态指纹不一样');
  eq(fullState(), r.wantFull, '最后的状态不一样');
});
T('回滚补特效：对方的拳晚到、重算时才打中的那一下照样有冲击星和伤害数字；本来就放过的不重复放', () => {
  const run = late => {
    arena(70); game.mode = 'online';
    const rb = new Rollback(1, 'host'), remote = f => f === 6 ? TAP('jab') : 0;
    const seen = { star: 0, tag: 0 }, push = FX.push;
    FX.push = function (...a) { for (const o of a) if (o.type in seen) seen[o.type]++; return push.apply(this, a); };
    try {
      for (let t = 0; t < 70; t++) {
        const upto = rb.frame - late;                        // 对方的输入晚 late 帧才到
        if (upto > 1) { const vals = []; for (let f = 1; f < upto; f++) vals.push(remote(f)); rb.receive(1, vals); }
        rb.rollback(); rb.sample(() => 0);
        if (rb.canAdvance()) rb.advance();
      }
    } finally { FX.push = push; game.mode = 'pvp'; }
    return { seen, hp: F1.hp, depth: rb.stats.maxDepth };
  };
  const now = run(0), late = run(8);
  ok(now.hp < MAX_HP, '玩家二的拳应该打中');
  eq(late.hp, now.hp, '晚到也一样打中');
  ok(late.depth >= 8, '应该回滚了 8 帧以上：' + late.depth);
  ok(now.seen.star > 0, '打中要有冲击星');
  eq(late.seen, now.seen, '晚到的那一下补放了特效，而且不多不少');
});
T('猜对方的输入只猜按住的键（不猜新按的招）；对方超过 ' + NET.MAX_PRED + ' 帧没消息就停下来等', () => {
  arena(300);
  const rb = new Rollback(1, 'host');
  rb.receive(1, [HOLD('left') | TAP('jab')]);
  eq(rb.predict(), HOLD('left'));
  let n = 0;
  while (n < 60) { rb.sample(() => 0); if (!rb.canAdvance()) break; rb.advance(); n++; }
  eq(rb.frame - rb.remoteUntil, NET.MAX_PRED);
  rb.frame = 100; rb.lastRemote = 95; rb.remoteAdv = 2;
  eq(rb.localAdv(), 100 - (95 - 1), '我觉得我快几帧'); eq(rb.timeSync(), (6 - 2) / 2, '时间同步：网络延迟抵消，真的快 2 帧');
});
T('输入包：二进制，一帧 2 字节；只发对方还没确认收到的帧（最多 ' + PKT_MAX + ' 帧）', () => {
  const vals = [0, 1, 31, 1023, 512, HOLD('down') | TAP('kick')];
  const buf = encodeInputs(258, 123456, 99, vals, -3.4);
  eq(buf.byteLength, 12 + 2 * vals.length);
  eq(decodeInputs(buf), { epoch: 2, first: 123456, ack: 99, adv: -3, vals });
  eq(decodeInputs(new ArrayBuffer(5)), null); eq(decodeInputs('x'), null);
  const rb = new Rollback(2, 'host');
  rb.sample(f => f + 100);
  eq(rb.outgoing(), { first: 2, vals: [102] }, '前 2 帧是 0，不用发');
  rb.ack = 3; eq(rb.outgoing().vals.length, 0, '对方都收到了就不发');
  rb.frame = 200; rb.sample(f => f & 15);
  const o = rb.outgoing(); eq(o.vals.length, PKT_MAX); eq(o.first + PKT_MAX - 1, 202);
  for (const [rtt, d] of [[20, 1], [150, 2], [500, 3]]) { Net.rtt = rtt; eq(Net.pickDelay(), d, '往返 ' + rtt + ' 毫秒'); }
  Net.rtt = 0;
});
T('房间码：去掉空格、英文不分大小写；邀请链接带着房间码和中继，点开能还原；坏掉的中继不要', async () => {
  eq(normCode('  Mo Dou 1022 '), 'modou1022'); eq(normCode('墨斗 一二'), '墨斗一二');
  const relay = [{ urls: 'turn:relay.example.com:3478', username: 'u', credential: 'p:w,d' }];
  const link = await inviteLink('墨斗1022', relay);
  ok(link.startsWith(location.href.split('#')[0] + '#'), link);
  eq(await parseInvite(link.slice(link.indexOf('#'))), { code: '墨斗1022', relay });
  eq(await parseInvite('#' + encodeURIComponent('墨斗1022')), { code: '墨斗1022', relay: null });
  eq(await parseInvite('#abc&r=zzzz'), { code: 'abc', relay: null });
  eq(await parseInvite('#ABC'), { code: 'abc', relay: null });
});

/* ---------- 1.9.4：出招朝向（千斤坠近身反向踩）、出招不冲过人、连招的火 ---------- */
// 玩家一 sched 那样跳 / 跑，第 p 帧出 key；判定那几帧对手在背后（翻过来就够得着、高度也打得到）还打空了 = 打背身打空
function backWhiff(dist, p, key, sched) {
  arena(dist); let back = false, landed = false, seen = false;
  for (let i = 0; i < p + 70; i++) {
    let v1 = sched(i);
    if (i === p) v1 = (v1 & RIGHT) | key;
    step([v1, 0]);
    const m = F1.move;
    if (i < p || !m || m.def.script) continue;
    seen = true;
    if (m.hit || m.blocked) landed = true;
    if (F1.inActive()) {
      const dx = (F2.x - F1.x) * F1.facing, d = m.def;
      const high = m.air ? F1.alt - F2.alt > (d.vreach || 999) : F2.alt > Math.max(d.antiAir || AIR_SAFE, 0);
      if (dx < -6 && -dx <= d.reach && !high) back = true;
    }
  }
  return seen && back && !landed;
}
T('1.9.4 千斤坠：跳着往前、离对手近的时候按，不再转身往反方向踩 —— 出脚那一帧重新瞄，近了踩得陡，总踩在对手身上', () => {
  const miss = [];
  for (let d = 20; d <= 120; d += 20) for (const p of [5, 8, 11, 14, 17, 20]) {
    arena(d); let hit = false;
    for (let i = 0; i < 90; i++) {
      step([(i === 0 ? TAP('up') : 0) | RIGHT | (i === p ? DOWN | TAP('kick') : 0), 0]);
      if (F1.move && F1.move.name === 'dive' && F1.move.hit) hit = true;
    }
    if (!hit) miss.push(`距离${d}·第${p}帧`);
  }
  eq(miss, [], '这些没踩中');
});
T('1.9.4 千斤坠：对手就在正下方也踩得中（直着往下踩），踩中后落在他面前，接二起脚还是真连', () => {
  arena(0); F2.x = F1.x + 1;
  let hitAt = -1, sent = false, free2 = 0, dvx = null;
  for (let i = 0; i < 110; i++) {
    let v1 = (i === 0 ? TAP('up') : 0) | (i === 10 ? DOWN | TAP('kick') : 0);
    if (hitAt >= 0 && !sent && F1.actionable()) { v1 |= TAP('kick'); sent = true; }
    step([v1, 0]);
    if (F1.move && F1.move.name === 'dive' && F1.move.dvx !== undefined && dvx === null) dvx = F1.move.dvx;
    if (hitAt < 0 && F1.move && F1.move.name === 'dive' && F1.move.hit) hitAt = i;
    if (hitAt >= 0 && F1.stats.hits < 2 && F2.actionable()) free2++;
    if (hitAt >= 0 && F1.state === 'land' && F1.t === 0) ok(Math.abs(F2.x - F1.x) >= 40, '落在对手身上了：' + Math.round(Math.abs(F2.x - F1.x)));
  }
  ok(hitAt > 0, '没踩中'); ok(dvx !== null && dvx < 1, '近身应该直着往下踩：' + dvx);
  eq(F1.stats.hits, 2, '二起脚没接上'); eq(free2, 0, '中间挨打方能动');
});
T('1.9.4 出招朝向：跳着往前冲、跑着贴脸出招，判定时对手不会跑到背后打空（拳 / 重 / 腿 / 空中招 / 千斤坠都查）', () => {
  const bad = [];
  const jumpFwd = i => (i === 0 ? TAP('up') : 0) | RIGHT, runIn = () => RIGHT;
  for (const [nm, key, sched] of [['空中挥拳', TAP('jab'), jumpFwd], ['泰山压顶', TAP('heavy'), jumpFwd], ['飞踢', TAP('kick'), jumpFwd], ['千斤坠', DOWN | TAP('kick'), jumpFwd],
    ['跑着短拳', TAP('jab'), runIn], ['跑着重（铁山靠）', TAP('heavy'), runIn], ['跑着踢', TAP('kick'), runIn], ['跑着扫堂腿', DOWN | TAP('kick'), runIn]])
    for (let d = 20; d <= 160; d += 20) for (let p = 4; p <= 22; p += 3) if (backWhiff(d, p, key, sched)) bad.push(`${nm}·距离${d}·第${p}帧`);
  eq(bad, [], '打背身打空');
});
T('1.9.4 出招朝向：对手在面前起跳（往我这边跳 / 原地跳），按拳 / 重 / 腿 / 扫堂腿 / 托天掌 / 擒拿 —— 他还蹲着没起跳、或者判定那一刻还没到身后，就不转身往后打', () => {
  const keys = [['短拳', TAP('jab')], ['重拳', TAP('heavy')], ['腿踢', TAP('kick')], ['扫堂腿', DOWN | TAP('kick')], ['托天掌', DOWN | TAP('heavy')], ['擒拿', TAP('grab')]];
  const bad = [];
  for (const [how, v2f] of [['往这边跳', i => (i === 0 ? TAP('up') : 0) | LEFT], ['原地跳', i => i === 0 ? TAP('up') : 0]])
    for (const [nm, key] of keys) for (const d of [50, 60, 70, 80, 90, 100, 120]) for (const p of [0, 1, 2, 3, 4, 6, 8]) {
      arena(d); let f0 = 0, x0 = 0, rel = null, hit = false;
      for (let i = 0; i < p + 60; i++) {
        if (i === p) x0 = F1.x;
        step([i === p ? key : 0, v2f(i)]);
        const m = F1.move;
        if (i < p || !m) continue;
        if (!f0) f0 = F1.facing;
        if (rel === null && F1.inActive()) rel = F2.x - x0;   // 判定第一帧：对手离「按的时候我站的地方」多远（正 = 还在面前）
        if (m.hit || m.blocked) hit = true;
      }
      // 转了身却没打中：只有判定那一刻对手确实到了身后（过了 FACE_HYST，站着不动也会自动转过去）才说得过去；
      // 按的时候对手还蹲着没起跳（第 1~3 帧），人在面前，转身打空就是错的
      if (f0 === -1 && !hit && (rel === null || rel > -FACE_HYST + 1)) bad.push(`对手${how}·${nm}·距离${d}·第${p}帧（判定时对手在 ${rel === null ? '?' : rel.toFixed(0)}）`);
      else if (f0 === -1 && !hit && p >= 1 && p <= 3) bad.push(`对手${how}·${nm}·距离${d}·第${p}帧：他还蹲着没起跳就转身了`);
      if (how === '原地跳' && f0 === -1) bad.push(`对手原地跳·${nm}·距离${d}·第${p}帧：转身了`);
    }
  eq(bad, [], '对手还在面前就转身往后打');
});
T('1.9.4 出招不冲过人：跑着贴脸按重（铁山靠），前冲停在对手身上、打得中，不会冲到他身后', () => {
  let shoulders = 0;
  for (const d of [30, 40]) for (let p = 9; p <= 14; p++) {
    arena(d); let passed = false, used = false;
    run(60, i => {
      if (F1.move && F1.move.name === 'shoulder') { used = true; if (F1.x > F2.x + 6) passed = true; }
      return [RIGHT | (i === p ? TAP('heavy') : 0), 0];
    });
    if (used) shoulders++;
    ok(!passed, `离 ${d}、第 ${p} 帧按：铁山靠冲到身后去了`); ok(F2.hp < MAX_HP, `离 ${d}、第 ${p} 帧按：没打中`);
  }
  ok(shoulders >= 6, '跑起来按重应该是铁山靠：' + shoulders);
});
T('1.9.4 连招的火：越连越旺（3 连起每打中一下炸一圈气浪、越往后越大）；2.0.1 火是自己的气的颜色；2.0.2 头两下没有火，3 连才起', () => {
  for (let n = 2; n < 7; n++) ok(comboHeat(n + 1) > comboHeat(n), n + ' 连到 ' + (n + 1) + ' 连没变旺');
  ok(comboHeat(1) === 0 && comboHeat(2) === 0 && comboHeat(3) > 0 && comboHeat(6) > 1 && comboHeat(9) === comboHeat(7), '1、2 连没有，6 连烧到 1 以上，7 连到顶');
  // 一串 6 拳：数每一下打中时出了几个气浪圈，圈越来越大
  arena(80); const rings = []; const push = FX.push;
  FX.push = function (...a) { for (const o of a) if (o.type === 'ring' && o.sy > 0.5) rings.push([F1.combo, o.r1]); return push.apply(this, a); };
  try { combo(['jab', 'jab', 'jab', 'jab', 'jab']); } finally { FX.push = push; }
  eq(rings.map(r => r[0]), [3, 4, 5], '3 连起每下一圈');
  ok(rings[1][1] > rings[0][1] && rings[2][1] > rings[1][1], '圈要越来越大：' + rings.map(r => r[1]));
  const cols = new Set(QI.filter(q => q.f === 0 && q.k === 'flame').map(q => q.col));
  ok(cols.size === 1 && cols.has(pal(F1).qi), '连招的火是自己的气的颜色：' + [...cols]);
});
T('2.0.1 画面插值：显示器比 60Hz 快时，在上一帧和这一帧之间按 RA 插着画（位置、骨骼、发带）；RA = 1 就是这一帧；一下挪太远（瞬移）不插；存档不存它', () => {
  arena(400); run(20, () => [RIGHT, 0]);
  const p = F1.vp.J, x0 = p.x, x1 = F1.J.x;
  ok(x1 > x0 + 2, '跑起来上一帧和这一帧应该差几像素：' + x0 + ' → ' + x1);
  try {
    RA = 0.5; const v = viewOf(F1);
    ok(Math.abs(v.x - (x0 + x1) / 2) < 1e-6, '位置插在中间');
    ok(Math.abs(v.J.hip[0] - (p.hip[0] + F1.J.hip[0]) / 2) < 1e-6 && Math.abs(v.J.fh[1] - (p.fh[1] + F1.J.fh[1]) / 2) < 1e-6, '骨骼插在中间');
    const r0 = F1.vp.rb[0][3], r1 = F1.ribbons[0][3];
    ok(Math.abs(v.ribbons[0][3].x - (r0.x + r1.x) / 2) < 1e-6, '发带插在中间');
    RA = 1; eq(viewOf(F1).x, F1.x, 'RA = 1 就画这一帧');
    RA = 0.5; F1.vp.J.x = F1.J.x - 200; eq(viewOf(F1).x, F1.x, '瞬移不插');
  } finally { RA = 1; }
  ok(SNAP_SKIP.has('vp'), '插值用的上一帧只是画面，不进存档');
});
// 2.0.1 颜色归属
const cdist = (a, b) => { const A = rgbOf(a), B = rgbOf(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
T('2.0.1 颜色归属：每个人的气是自己身体色的淡色（同一个色相、比身子亮得多，墨是灰黑的烟），火花是提亮的那一版；八个人的气、火花互相分得清；印章底板放得下白字', () => {
  for (const p of PALETTE) {
    const P = palOf(p.color), [h0, s0] = hslOf(p.color), [h1] = hslOf(P.qi), [h2, s2] = hslOf(P.fx);
    ok(contrastOf(P.qi, p.color) >= 2.1, p.name + ' 的气和身子分不开（不够淡）：' + P.qi);
    ok(lumOf(P.qi) <= 0.37, p.name + ' 的气太淡了（纸上看不见）：' + P.qi);
    if (s0 >= 0.2) {
      const dh = Math.min(Math.abs(h1 - h0), 6 - Math.abs(h1 - h0)), dh2 = Math.min(Math.abs(h2 - h0), 6 - Math.abs(h2 - h0));
      ok(dh < 0.15 && dh2 < 0.15, p.name + ' 的气 / 火花换了颜色：' + P.qi + ' ' + P.fx);
      ok(s2 >= s0, p.name + ' 的火花没提饱和：' + P.fx);
    }
    ok(contrastOf('#ebeae2', p.color) >= 4.5, p.name + ' 的印章底板太浅，白字看不清');
  }
  for (let i = 0; i < PALETTE.length; i++) for (let j = i + 1; j < PALETTE.length; j++) {
    const a = palOf(PALETTE[i].color), b = palOf(PALETTE[j].color);
    ok(cdist(a.qi, b.qi) > 40, `${PALETTE[i].name}、${PALETTE[j].name} 的气分不清：${a.qi} ${b.qi}`);
    ok(cdist(a.fx, b.fx) > 40, `${PALETTE[i].name}、${PALETTE[j].name} 的火花分不清：${a.fx} ${b.fx}`);
  }
});
T('2.0.1 颜色归属：打中 —— 火花、冲击星、伤害数字、印章都是出招那个人的颜色；被挡 —— 「挡」是挡的人的、掉的血是打的人的；拼招两人各半；压招压人的那边特效多', () => {
  const seen = [], push = FX.push;
  FX.push = function (...a) { for (const o of a) seen.push(o); return push.apply(this, a); };
  try {
    arena(80); seen.length = 0; run(30, i => [i === 0 ? TAP('jab') : 0, 0]);
    const P1 = pal(F1), P2 = pal(F2);
    ok(F2.hp < MAX_HP, '短拳没打中');
    const sp = seen.filter(o => o.type === 'spark'), st = seen.filter(o => o.type === 'star'), dm = seen.filter(o => o.type === 'tag' && /^-\d+$/.test(o.text));
    ok(sp.length && sp.every(o => o.color === P1.fx), '火花不是玩家一的：' + [...new Set(sp.map(o => o.color))]);
    ok(st.length && st.every(o => o.color === P1.ink), '冲击星不是玩家一的');
    ok(dm.length === 1 && dm[0].cols[0] === F1.color, '伤害数字不是打的人的颜色');
    // 招式印章：底板是出招人的颜色
    arena(80); F1.chain = ['jab']; F1.chainIdle = 0; seen.length = 0;
    run(40, i => [i === 0 ? TAP('kick') : 0, 0]);
    const sealed = seen.filter(o => o.type === 'stamp');
    ok(sealed.length && sealed.every(o => o.col === F1.color), '印章底板不是出招人的颜色：' + sealed.map(o => o.text + o.col));
    // 被挡：「挡」= 挡的人，「-n」= 打的人
    arena(80); seen.length = 0; run(50, i => [i === 20 ? TAP('jab') : 0, BLOCK]);
    const bt = seen.find(o => o.type === 'tag' && /^挡/.test(o.text));
    ok(bt && bt.parts[0][1] === F2.color && bt.parts[1][1] === F1.color, '挡住的字颜色不对：' + JSON.stringify(bt && bt.parts));
    // 拼招：「拼」两个颜色（左边的人在左半边），两边火花一样多
    arena(90); seen.length = 0; run(30, i => [i === 0 ? TAP('jab') : 0, i === 0 ? TAP('jab') : 0]);
    const pin = seen.find(o => o.type === 'tag' && o.text === '拼');
    ok(pin && pin.cols[0] === F1.color && pin.cols[1] === F2.color, '「拼」不是两人各半：' + JSON.stringify(pin && pin.cols));
    const n1 = seen.filter(o => o.type === 'spark' && o.color === P1.fx).length, n2 = seen.filter(o => o.type === 'spark' && o.color === P2.fx).length;
    ok(n1 > 0 && n1 === n2, `拼招两边火花要一样多：${n1} / ${n2}`);
    // 压：鞭腿（拳起手）压腿踢 —— 压人的（玩家一）火花多
    arena(110); F1.chain = ['jab']; F1.chainIdle = 0; seen.length = 0;
    run(40, i => [i === 3 ? TAP('kick') : 0, i === 0 ? TAP('kick') : 0]);
    const ya = seen.find(o => o.type === 'tag' && o.text === '压');
    ok(ya && ya.cols[0] === F1.color, '「压」不是压人的颜色');
    const w1 = seen.filter(o => o.type === 'spark' && o.color === P1.fx).length, w2 = seen.filter(o => o.type === 'spark' && o.color === P2.fx).length;
    ok(w1 > w2 * 2 && w2 > 0, `压人的特效要多得多：${w1} / ${w2}`);
  } finally { FX.push = push; }
});

/* ---------- 2.0：躺姿、起身硬直、边挡边走、闪身、腿踢射程、场景、全屏画面 ---------- */
T('2.0 倒地躺平：身子、腿、头都贴着地（最多穿地两三像素），两手放在身体两边，发带也落在地上', () => {
  for (const kind of [0, 1]) {
    arena(90); tick(DOWN | TAP('kick')); let k = 0;
    while (k++ < 80 && F2.downPhase !== 'lie') tick();
    ok(F2.state === 'down', '没倒'); F2.lieKind = kind;
    tick(0, 0, 4); eq(F2.downPhase, 'lie', '躺着');
    for (let i = 0; i < 25; i++) F2.animate(false);              // 让姿势跟到位
    const J = F2.J, up = k => FLOOR - J[k][1];
    for (const k of ['hip', 'neck', 'ff', 'bf', 'fh', 'bh', 'fe', 'be']) ok(up(k) > -4 && up(k) < 12, `躺姿${kind} ${k} 离地 ${up(k).toFixed(1)}`);
    for (const k of ['fk', 'bk']) ok(up(k) > -2 && up(k) < 22, `躺姿${kind} 膝盖离地 ${up(k).toFixed(1)}（腿最多稍微弯一点）`);
    const headLow = up('head') - BONE.head; ok(headLow > -3 && headLow < 3, '后脑勺垫在地上：' + headLow.toFixed(1));
    ok(Math.abs(J.head[0] - J.ff[0]) > 100, '整个人横着躺开');
    for (let i = 0; i < 60; i++) F2.animate(false);
    const tail = F2.ribbons[0][F2.ribbons[0].length - 1]; ok(FLOOR - tail.y < 5, '发带落在地上：' + (FLOOR - tail.y).toFixed(1));
  }
});
// 玩家一扫堂腿打倒玩家二；玩家二起身硬直开始那一帧（riseAt）玩家一按 key（放到他跟前 70）；玩家二一能动就按 v2ok
function wakeTest(key, v2ok, roll) {
  arena(90); const r = { riseAt: -1, freeAt: -1, hitAt: -1, blocked: false, phases: [] };
  let pressed = false, last = '';
  for (let i = 0; i < 220; i++) {
    let v1 = i === 0 ? DOWN | TAP('kick') : 0;
    if (!pressed && F2.state === 'rise') { r.riseAt = i; pressed = true; F1.x = F2.x - 70; F1.facing = 1; v1 = key; }
    const v2 = F2.state === 'down' && roll ? roll : F2.actionable() || F2.state === 'blockstun' ? v2ok : 0;
    const hp = F2.hp;
    step([v1, v2]);
    const s = F2.state + (F2.downPhase || ''); if (s !== last) { r.phases.push([i, s]); last = s; }
    if (pressed && r.freeAt < 0 && F2.actionable()) r.freeAt = i - r.riseAt;
    if (pressed && r.hitAt < 0 && F2.hp < hp) { r.hitAt = i - r.riseAt; r.blocked = F2.state === 'blockstun'; }
  }
  return r;
}
T('2.0 起身：躺的时间、起身都比 1.9.4 短；起身后先有「起身硬直」（打得中、动不了），刚站起来那一帧出短拳必中、出腿踢来不及（他先能挡）', () => {
  const q = wakeTest(0, BLOCK), at = s => (q.phases.find(p => p[1] === s && p[0] > 3) || [-1])[0];
  eq(at('downgetup') - at('downlie'), MOVES.sweep.lie, '扫堂腿躺多久'); ok(MOVES.sweep.lie < TF(26), '扫堂腿也躺得短了');
  eq(at('rise') - at('downgetup'), GETUP, '起身'); eq(at('idle') - at('rise'), RISE, '起身硬直');
  const r = wakeTest(TAP('jab'), BLOCK);
  ok(LIE_HIT + GETUP < 40 + TF(18), '躺 + 起身比 1.9.4 的 40 + 20 短');
  ok(r.hitAt > 0 && !r.blocked && r.hitAt <= RISE - 1, '短拳要在起身硬直里打中：第 ' + r.hitAt + ' 帧');
  ok(MOVES.jab.S + 1 <= RISE - 2 && MOVES.kick.S + 1 > RISE, `起身硬直 ${RISE} 帧要介于短拳（${MOVES.jab.S}）和腿踢（${MOVES.kick.S}）之间`);
  const k = wakeTest(TAP('kick'), BLOCK);
  ok(k.hitAt > RISE && k.blocked, '腿踢起身后才到，应该被挡住：' + k.hitAt);
  const h = wakeTest(TAP('heavy'), BLOCK);
  ok(F2.stats.parries === 1 || h.blocked, '重拳出晚了：起身的人能挡（刚按的挡还能卸力）');
  // 起身硬直里：不能动（按挡、按招都没用），也不是无敌
  arena(90); tick(DOWN | TAP('kick')); let k2 = 0; while (k2++ < 120 && F2.state !== 'rise') tick();
  eq(F2.state, 'rise'); ok(!F2.actionable() && !F2.invuln(), '起身硬直：不能动、打得中');
  tick(0, BLOCK | TAP('jab')); ok(F2.state === 'rise' && !F2.move, '起身硬直里按什么都没用');
});
T('2.0 滚身起：滚开以后也有起身硬直；站在原地等着压的人够不着（滚身起是躲压起身的办法）', () => {
  arena(90); tick(DOWN | TAP('kick')); let k = 0;
  while (k++ < 60 && F2.state !== 'down') tick();
  while (k++ < 120 && F2.downPhase !== 'lie') tick();
  const xDown = F2.x, hp = F2.hp;
  while (k++ < 200 && F2.state !== 'rise') tick(0, F2.state === 'down' ? RIGHT : 0);
  eq(F2.state, 'rise', '滚完也是起身硬直'); ok(F2.x - xDown > ROLL_DIST - 6, '滚了 ' + Math.round(F2.x - xDown));
  // 守在他倒地处跟前的人，在他起身硬直刚开始出拳：够不着
  F1.x = xDown - 70; F1.facing = 1; run(20, i => [i === 0 ? TAP('jab') : 0, 0]);
  eq(F2.hp, hp, '原地压的人打到了滚开的人');
});
T('2.0 冲刺里回身出招：不带冲势，人还被冲刺带着往原来的方向滑（冲过人再回身打够不太着；往前冲着打照旧带冲势）', () => {
  const dashTo = (pred) => { run(3, i => [i === 1 ? 0 : RIGHT, 0]); let k = 0; while (k++ < 20 && !(F1.move && F1.move.name === 'dash' && F1.move.t >= DASH_CANCEL && pred())) tick(); };
  arena(220); dashTo(() => true);
  eq(F1.move && F1.move.name, 'dash'); tick(TAP('jab'));
  ok(F1.move && F1.move.name === 'jab' && F1.move.dashIn, '往前冲着出拳带冲势');
  arena(30); dashTo(() => F1.x > F2.x + 20);
  ok(F1.move && F1.move.name === 'dash' && F1.x > F2.x + 20, '冲过去了');
  const x0 = F1.x; tick(TAP('jab'));
  eq(F1.facing, -1, '回身打'); ok(F1.move && F1.move.name === 'jab' && !F1.move.dashIn, '回身不带冲势');
  tick(0, 0, 4); ok(F1.x > x0 + 4, '还往原来的方向滑了 ' + (F1.x - x0).toFixed(1));
});
T('2.0 边挡边走：按着挡 + 方向（不蹲）慢慢走，前后都行、一直面朝对手；往后退时正面来的拳照样挡住；蹲挡不走', () => {
  arena(200); const x0 = F2.x; tick(0, BLOCK | RIGHT, 20);
  eq(F2.facing, -1, '往后退也面朝对手'); eq(F2.state, 'block');
  ok(Math.abs(F2.x - x0 - 20 * BLOCK_WALK) < 0.5, '往后走了 ' + (F2.x - x0).toFixed(1));
  const x1 = F2.x; tick(0, BLOCK | LEFT, 20); ok(Math.abs(x1 - F2.x - 20 * BLOCK_WALK) < 0.5, '往前走'); eq(F2.facing, -1);
  ok(BLOCK_WALK < RUN_START * 0.5, '比跑慢得多');
  const x2 = F2.x; tick(0, BLOCK | DOWN | RIGHT, 10); eq(F2.x, x2, '蹲挡不走');
  arena(70); run(30, i => [i === 2 ? TAP('jab') : 0, BLOCK | RIGHT]);
  eq(F2.stats.blocks, 1, '边退边挡住'); ok(lost(F2) <= 2);
  arena(70); run(40, i => [i === 2 ? TAP('grab') : 0, BLOCK | RIGHT]); ok(lost(F2) >= MOVES.grab.dmg, '擒拿照样抓得住边挡边走的人');
});
// 2.0.2 闪身：玩家二第 0 帧按 key（出招），玩家一按着挡、第 tap 帧开始朝他双击（按 → 松 → 按）；after：回身肘打完、玩家一能动时依次按的招（打一套）
function slipVs(dist, key, tap, after) {
  arena(dist); tick(BLOCK, 0, 3);
  const r = { dodged: false, elbow: false, stagger: false, back: false, elbowAt: -1, freeA: -1, freeB: -1, shown: [], faces: new Set(), lostAtElbow: 0 };
  const queue = (after || []).slice(), push = FX.push;
  FX.push = function (...a) { for (const o of a) if (o.type === 'tag' || o.type === 'stamp') r.shown.push(o); return push.apply(this, a); };
  try {
    for (let i = 0; i < 110; i++) {
      let v1 = BLOCK;
      if (i >= tap && i <= tap + 2) v1 = BLOCK | (i - tap === 1 ? 0 : RIGHT);
      if (r.elbowAt >= 0 || (F1.move && F1.move.name === 'slipElbow')) v1 = 0;
      if (r.elbowAt >= 0 && queue.length && game.freeze === 0 && (F1.actionable() || (F1.move && F1.canCancel(queue[0])))) v1 = TAP(queue.shift());
      step([v1, i === 0 ? key : 0]);
      if (F2.move && F2.move.slipped) r.dodged = true;
      if (F1.move && F1.move.name === 'slipElbow') r.elbow = true;
      if (F2.stagger && r.elbowAt < 0) { r.stagger = true; r.elbowAt = i; r.back = F2.facing === F1.facing; r.lostAtElbow = lost(F2); }
      if (F2.stagger) r.faces.add(F2.facing);
      if (r.elbowAt >= 0 && r.freeA < 0 && F1.actionable()) r.freeA = i;
      if (r.elbowAt >= 0 && r.freeB < 0 && F2.actionable()) r.freeB = i;
      if (F2.state === 'down') r.down = true;
    }
  } finally { FX.push = push; }
  return r;
}
T('2.0.2 闪身只躲得过重拳：重拳打过来时正在钻 = 闪过；钻到他身后自动回身一肘（回身肘），他背对着往前踉跄、这几帧不转身，你先动 ≥ 18 帧；字幕只出闪的人的', () => {
  for (const d of [60, 80, 100]) {
    const r = slipVs(d, TAP('heavy'), 10);
    ok(r.dodged && r.elbow && r.stagger, `距离 ${d}：闪 ${r.dodged} · 回身肘 ${r.elbow} · 踉跄 ${r.stagger}`);
    ok(r.back, `距离 ${d}：挨了肘要背对着出肘的人`);
    eq(r.faces.size, 1, `距离 ${d}：踉跄的时候不能转身`);
    eq(lost(F1), 0, `距离 ${d}：闪身的人不该掉血`); eq(r.lostAtElbow, MOVES.slipElbow.dmg, `距离 ${d}：回身肘伤害`);
    ok(r.freeB - r.freeA >= 18, `距离 ${d}：踉跄里你先动 ${r.freeB - r.freeA} 帧`);
    tick(0, 0, 3); eq(F2.facing, F1.x >= F2.x ? 1 : -1, `距离 ${d}：踉跄完了又自动面向对手`);
    const other = r.shown.filter(o => (o.cols ? o.cols.includes(F2.color) : o.col === F2.color));
    eq(other.map(o => o.text), [], `距离 ${d}：字幕只出闪的人的，不出挨肘的人怎么了`);
    ok(r.shown.some(o => o.type === 'stamp' && o.text === '回身肘' && o.col === F1.color), `距离 ${d}：回身肘的印章`);
  }
  // 太早钻（重拳还没出手就钻过去了）不算躲过：不出回身肘
  const early = slipVs(80, TAP('heavy'), 0); ok(!early.dodged && !early.elbow, '太早钻不算躲过');
});
T('2.0.2 回身肘之后：他踉跄的那几帧打得中、挡不了 —— 接短拳、短拳、重（冲天炮）一套都打得上', () => {
  const r = slipVs(80, TAP('heavy'), 10, ['jab', 'jab', 'heavy']);
  ok(r.stagger, '没打出踉跄');
  eq(F1.stats.hits, 4, '回身肘 + 三下都要打中：' + F1.stats.hits);
  ok(r.down, '冲天炮打倒');
  eq(F2.stats.blocks, 0, '踉跄里挡不了');
});
T('2.0.2 闪身截得住：短拳、腿踢、下盘拳都打得中正在钻的人（截住闪身 ×' + SLIP_CAUGHT_MUL + '），擒拿照样抓；按着挡往后双击、不按挡双击，还是普通冲刺', () => {
  for (const [nm, key, dmg, dist] of [['短拳', TAP('jab'), MOVES.jab.dmg, 80], ['腿踢', TAP('kick'), MOVES.kick.dmg, 110], ['下盘拳', DOWN | TAP('jab'), MOVES.lowJab.dmg, 80]]) {
    let caught = false;
    for (let tap = 0; tap < 20 && !caught; tap++) {
      const r = slipVs(dist, key, tap);
      ok(!r.dodged && !r.elbow, `${nm}·第${tap}帧钻：不该被闪过`);
      if (F2.info && /截住闪身/.test(F2.info.how) && lost(F1) === Math.round(dmg * SLIP_CAUGHT_MUL)) caught = true;
    }
    ok(caught, nm + ' 截不住闪身');
  }
  let grabbed = false;
  for (let tap = 0; tap < 14 && !grabbed; tap++) { slipVs(80, TAP('grab'), tap); if (lost(F1) >= MOVES.grab.dmg) grabbed = true; }
  ok(grabbed, '擒拿抓不住闪身');
  arena(200); tick(BLOCK, 0, 3); run(4, i => [BLOCK | (i === 1 ? 0 : LEFT), 0]); eq(F1.move && F1.move.name, 'dash', '按着挡往后双击 = 冲刺');
  arena(200); run(4, i => [i === 1 ? 0 : RIGHT, 0]); eq(F1.move && F1.move.name, 'dash', '不按挡双击 = 冲刺');
});
T('2.0 新动作（边挡边走、闪身、回身肘、起身硬直）同样的输入两次结果一样；存档 / 读档、回滚都对得上', () => {
  // 两个人：按着挡时常带方向、时不时双击（闪身）、出招、蹲、倒地时按方向（滚身起）
  const gen = seed => {
    let s = seed >>> 0; const rand = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
    const out = [], st = [{ hold: 0, tap: 0 }, { hold: 0, tap: 0 }];
    for (let i = 0; i < 3000; i++) {
      const v = [0, 0];
      for (let p = 0; p < 2; p++) {
        const q = st[p];
        if (rand() < 0.07) q.hold = [0, BLOCK, BLOCK | LEFT, BLOCK | RIGHT, LEFT, RIGHT, DOWN, BLOCK | DOWN][(rand() * 8) | 0];
        if (q.tap) { q.tap--; v[p] = (q.hold & BLOCK) | (q.tap === 1 ? 0 : q.dir); continue; }
        if (rand() < 0.04) { q.tap = 3; q.dir = rand() < 0.5 ? LEFT : RIGHT; }
        v[p] = q.hold | (rand() < 0.12 ? [TAP('jab'), TAP('heavy'), TAP('kick'), TAP('grab'), DOWN | TAP('kick')][(rand() * 5) | 0] : 0);
      }
      out.push(v);
    }
    return out;
  };
  const ins = gen(2024), once = () => { arena(150); const hs = []; ins.forEach((v, i) => { step(v); if (i % 150 === 0) hs.push(stateHash()); }); return hs.concat([F1.stats, F2.stats]); };
  const A = once(); eq(once(), A);
  let slips = 0, walks = 0, rises = 0;
  arena(150); ins.forEach(v => { step(v); for (const F of game.p) { if (F.move && F.move.name === 'slip' && F.move.t === 1) slips++; if (F.gwalk) walks++; if (F.state === 'rise' && F.t === 0) rises++; } });
  ok(slips >= 3 && walks > 50 && rises > 2, `随机输入里要真的出现这些：闪身 ${slips}、边挡边走 ${walks}、起身硬直 ${rises}`);
  // 存档 / 读档：中途存、乱算一段、读回来接着算 = 一口气算的
  const want = (arena(150), ins.forEach(v => step(v)), fullState());
  arena(150); const junk = gen(7);
  ins.forEach((v, i) => { if (i === 1100) { const snap = saveState(); for (const j of junk.slice(0, 300)) step(j); loadState(snap); } step(v); });
  eq(fullState(), want, '存档漏了新字段');
});
T('2.0 腿踢射程短了：腿踢 134 → 126，飞踢 134 → 124，腿系连招也短一点；还是比重拳远', () => {
  eq([MOVES.kick.reach, MOVES.airKick.reach], [126, 124]);
  ok(MOVES.kick.reach > MOVES.heavy.reach && MOVES.whip.reach < 128 && MOVES.whirl.reach < 132 && MOVES.twinKick.reach < 120, '腿系一起短');
  arena(MOVES.kick.reach + MOVES.kick.lunge[2] + 14); run(40, i => [i === 0 ? TAP('kick') : 0, 0]); eq(F2.hp, MAX_HP, '射程外踢不到');
  arena(MOVES.kick.reach + 4); run(40, i => [i === 0 ? TAP('kick') : 0, 0]); ok(F2.hp < MAX_HP, '射程里踢得到');
});
T('2.0 场景：五张能选（2.1 加了桃花园、大漠孤烟；人机、双人自己选，联机房主选），训练场固定练武场；每张都画得出来', () => {
  eq(STAGE_PICK.length, 5); ok(STAGE_PICK.includes('peach') && STAGE_PICK.includes('desert'), '新加的两张'); ok(STAGE_PICK.every(id => STAGES[id].name && STAGES[id].far && STAGES[id].ground), '每张都有远景和地面');
  eq(Stage.forMode('train'), 'yard'); ok(!STAGE_PICK.includes('yard'), '练武场只给训练场用');
  const was = [Stage.pref, Stage.online];
  Stage.pref = 'falls'; Stage.online = 'bamboo';
  eq([Stage.forMode('pve'), Stage.forMode('pvp'), Stage.forMode('online'), Stage.forMode('attract')], ['falls', 'falls', 'bamboo', 'falls']);
  [Stage.pref, Stage.online] = was;
  for (const id of Object.keys(STAGES)) {
    Stage.build(id, { back: 0.25, ground: 0.25, vw: 1200, fy: 520, vh: 600 });
    ok(Stage.layers.far.width > 0 && Stage.layers.ground.width > 0, id + ' 没画出来');
  }
  Stage.layers = null; Stage.built = null; Stage.id = null;
});
T('2.0 全屏画面：屏幕比 2:1 窄（16:9、16:10）就往上下多露、宽（带鱼屏）就往左右多露；画面不变形，地线下面留的地方差不多', () => {
  for (const [cw, ch] of [[1200, 600], [1920, 1080], [1440, 900], [1512, 982], [2560, 1080], [1024, 768]]) {
    const v = viewFor(cw, ch);
    ok(Math.abs(v.vw / v.vh - cw / ch) < 1e-9, `${cw}×${ch} 变形了`);
    ok(v.vw >= W - 1e-9 && v.vh >= H - 1e-9, `${cw}×${ch} 至少露出 1200×600`);
    ok(v.fy > v.vh * 0.8 && v.vh - v.fy >= H - FLOOR - 1 && v.vh - v.fy < 160, `${cw}×${ch} 地线位置 ${v.fy} / ${v.vh}`);
  }
  eq(viewFor(1200, 600), { vw: 1200, vh: 600, fy: FLOOR }, '2:1 跟以前一样');
  ok(viewFor(2560, 1080).vw > 1400, '带鱼屏左右多露');
});

/* ---------- 2.0.2：气跟着连招起、千斤坠朝向、头带腰带颜色、站姿、印章、电脑「地狱」 ---------- */
const qiOf = i => QI.filter(q => q.f === i).length;
T('2.0.2 气：站着、气满了站着、出头一下（拳 / 重 / 踢）、连两下，身上都不冒气；3 连才起火，越连越旺；连招断了半秒多就退干净', () => {
  arena(200); QI.length = 0; F1.qi = QI_MAX; let mx = 0;
  run(60, () => { mx = Math.max(mx, qiOf(0)); return [0, 0]; });
  eq(mx, 0, '气满了站着也冒气'); ok(F1.qiGlow < 0.02 && F1.heat === 0, '站着身上发光了');
  for (const [nm, key, d] of [['短拳', 'jab', 80], ['重拳', 'heavy', 80], ['腿踢', 'kick', 110]]) {
    arena(d); QI.length = 0; mx = 0;
    run(50, i => { mx = Math.max(mx, qiOf(0)); return [i === 0 ? TAP(key) : 0, 0]; });
    ok(F2.hp < MAX_HP, nm + ' 没打中'); eq(mx, 0, '第一下' + nm + '就冒气了');
  }
  arena(80); QI.length = 0; combo(['jab', 'jab']); mx = 0;
  run(12, () => { mx = Math.max(mx, qiOf(0)); return [0, 0]; });
  eq(F1.stats.hits, 2); eq(mx, 0, '连两下就冒气了');
  // 3 连、5 连：打完那一下后 8 帧里火有多旺、身上冒了多少
  const after = n => {
    arena(80); QI.length = 0; combo(Array(n).fill('jab')); let h = 0;
    run(8, () => { h = Math.max(h, F1.heat); return [0, 0]; });
    eq(F1.combo, n, n + ' 连没连上'); return { h, q: qiOf(0) };
  };
  const c3 = after(3), c5 = after(5);
  ok(c3.h > 0.2 && c3.q > 0, '3 连该起火了：' + c3.h.toFixed(2) + ' / ' + c3.q);
  ok(c5.h > c3.h + 0.3 && c5.q > c3.q * 2, `5 连要旺得多：火 ${c3.h.toFixed(2)} → ${c5.h.toFixed(2)}，火苗 ${c3.q} → ${c5.q}`);
  // 连招断了：40 帧（2/3 秒）以内不再冒新火，60 帧以内火退干净
  let k = 0; while (k++ < 120 && F1.comboLive) tick();
  const born = [];
  for (let i = 1; i <= 60; i++) { tick(); if (QI.some(q => q.f === 0 && q.max - q.life <= 1)) born.push(i); }
  ok(!born.some(i => i > 40), '连招断了 40 帧以后还在冒火：第 ' + born.filter(i => i > 40).slice(0, 3) + ' 帧');
  eq(F1.heat, 0, '60 帧以后火还没退干净');
});
// 2.0.2 千斤坠 / 空中招从头顶过来，底下的人第 q 帧按 key：返回结果（转没转、判定开始或挨打那一刻对手离「我按的时候站的地方」多远、挨没挨打）
function overheadPress(style, d, p, q, key, airKick) {
  const [hold, runup] = style, RIGHT = HOLD('right');
  arena(d + runup * 5);
  const v1At = i => {
    const j = i - runup;
    if (airKick) return RIGHT | (j === 0 ? TAP('up') : 0) | (j === 8 ? TAP('kick') : 0);
    if (hold === null) return (j === 0 ? TAP('up') : 0) | (j === p ? DOWN | TAP('kick') : 0);
    return (j < 0 || hold ? RIGHT : 0) | (j === 0 ? TAP('up') : 0) | (j === p ? DOWN | TAP('kick') : 0);
  };
  let at = -1, f0 = 0, x0 = 0, jumpAt = -1;
  for (let i = 0; i < 100 && at < 0; i++) {
    if (jumpAt < 0 && F1.airborne) jumpAt = i;
    const go = airKick ? jumpAt >= 0 && i - jumpAt === q : F1.state === 'attack' && F1.move && F1.move.name === 'dive' && F1.move.t === q;
    if (go) { at = i; f0 = F2.facing; x0 = F2.x; }
    step([v1At(i), go ? key : 0]);
  }
  if (at < 0 || !F2.move) return null;
  const ser = F2.move.serial, r = { turned: F2.facing !== f0, rel: null, hurt: false, hit: false };
  for (let k = at + 1; k < at + 70; k++) {
    step([v1At(k), 0]);
    const mine = F2.move && F2.move.serial === ser;
    if (r.rel === null && ((mine && F2.inActive()) || F2.state === 'hit' || F2.state === 'down')) { r.rel = (F1.x - x0) * f0; r.hurt = F2.state === 'hit' || F2.state === 'down'; }
    if (mine && F2.move.hit) r.hit = true;
  }
  return r;
}
T('2.0.2 千斤坠在头顶上（Jack：还没跳到身后就往身后打，打空）：底下的人什么时候按拳 / 重 / 腿 / 擒拿 / 扫堂腿，它还在面前就不转身；踩到身后才转身迎它；飞踢已经踢过来了也不背过身去挨', () => {
  const keys = [['短拳', TAP('jab')], ['重拳', TAP('heavy')], ['腿踢', TAP('kick')], ['擒拿', TAP('grab')], ['扫堂腿', DOWN | TAP('kick')]];
  const bad = []; let n = 0;
  for (const [sn, style, ds] of [['按住前跳', [true, 0], [40, 100]], ['跑着跳', [true, 10], [40, 100]], ['原地跳', [null, 0], [0, 20]]])
    for (const d of ds) for (const p of [4, 8, 12]) for (const q of [0, 5, 10, 15]) for (const [kn, key] of keys) {
      const r = overheadPress(style, d, p, q, key); if (!r) continue; n++;
      if (r.turned && r.rel !== null && r.rel > FACE_HYST) bad.push(`${sn}·${kn}·距离${d}·第${p}帧出脚·坠第${q}帧按：它还在面前 ${r.rel.toFixed(0)} 就转身了`);
      if (!r.turned && r.hurt && r.rel !== null && r.rel < -3 * FACE_HYST) bad.push(`${sn}·${kn}·距离${d}·第${p}帧出脚·坠第${q}帧按：它踩在身后 ${r.rel.toFixed(0)} 也没转身`);
    }
  ok(n > 300, '按出去的太少：' + n);
  for (const d of [100, 130, 160]) for (const q of [10, 14, 18, 22]) for (const [kn, key] of keys.slice(0, 3)) {
    const r = overheadPress([true, 0], d, 0, q, key, true);
    if (r && r.turned && r.hurt && r.rel !== null && r.rel > FACE_HYST) bad.push(`飞踢·${kn}·距离${d}·跳起第${q}帧按：它在面前 ${r.rel.toFixed(0)} 踢过来，却转身背对着挨了`);
  }
  eq(bad, [], '朝向不对');
});
T('2.0.2 头带、发带、腰带：都是自己身体色往亮里提一截（同一个色相、明暗对比 2.3 倍上下），八个人互相分得清；腰后不再飘带子，只剩头上两条发带', () => {
  for (const p of PALETTE) {
    const P = palOf(p.color), c = contrastOf(P.band, p.color), [h0, s0] = hslOf(p.color), [h1] = hslOf(P.band);
    ok(c >= 2.2 && c <= 3, p.name + ' 的带子和身子明暗对比 ' + c.toFixed(2) + '（要 2.2 ~ 3：分得开、又不像别的颜色）');
    ok(lumOf(P.band) > lumOf(p.color), p.name + ' 的带子要比身子亮');
    if (s0 >= 0.2) { const dh = Math.min(Math.abs(h1 - h0), 6 - Math.abs(h1 - h0)); ok(dh < 0.1, p.name + ' 的带子换了颜色：' + P.band); }
    ok(!('sash' in p), p.name + ' 还留着以前单独配的带子色');
  }
  for (let i = 0; i < PALETTE.length; i++) for (let j = i + 1; j < PALETTE.length; j++)
    ok(cdist(palOf(PALETTE[i].color).band, palOf(PALETTE[j].color).band) > 40, `${PALETTE[i].name}、${PALETTE[j].name} 的带子分不清`);
  arena(200); eq(F1.ribbons.length, 2, '发带两条（腰后的飘带去掉了）');
  eq(F1.sash, palOf(F1.color).band, '带子用身体色提亮的那一版');
});
T('2.0.2 / 2.1 站姿：前手在胸口上、往前举（小臂往前放下来一点），后手在腰带上面一点（护着肚子）', () => {
  arena(400); tick(0, 0, 90);
  const J = F1.J, f = F1.facing, torso = J.hip[1] - J.neck[1];
  const belt = J.hip[1] - 9;                                            // 腰带在髋往上 9（render.js drawBelt）
  const fy = (J.fh[1] - J.neck[1]) / torso;
  ok(fy >= 0.05 && fy <= 0.4, '前手要在脖子下面、胸口上：' + fy.toFixed(2));
  ok((J.fh[0] - J.neck[0]) * f > 16, '前手往前举：' + ((J.fh[0] - J.neck[0]) * f).toFixed(1));
  ok(belt - J.bh[1] >= 2 && belt - J.bh[1] <= 12, '后手在腰带上面一点：' + (belt - J.bh[1]).toFixed(1));
  ok((J.bh[0] - J.hip[0]) * f > 4, '后手在身前（护着肚子）');
  ok(J.fh[1] - J.head[1] > 18 && J.bh[1] - J.fh[1] > 12, '两只手一高一低，都不在脸边');
});
T('2.1 跳起来（Jack 的参考图）：两条腿并着、膝盖往前提、脚收在身子底下（后腿不往后张开）；两手往下垂、不往外张', () => {
  for (const [nm, p] of [['上升', POSE.jup], ['顶点', POSE.jtop], ['下落', POSE.jdn], ['飞身', POSE.leap], ['飞身下落', POSE.leapDn]]) {
    ok(Math.abs(p.ff[0] - p.bf[0]) <= 22, `${nm}：两脚前后离太开：${p.ff[0]} / ${p.bf[0]}`);
    ok(p.bf[0] >= -10, `${nm}：后腿往后伸太远：${p.bf[0]}`);
    for (const [hand, hint] of [[p.fh, p.fe], [p.bh, p.be]]) {
      const r = ik(0, 0, hand[0], hand[1], BONE.ua, BONE.fa, -0.3, hint);
      ok(Math.abs(r[2]) <= 24 && r[3] >= 34, `${nm}：手张得太开：${r[2].toFixed(0)}, ${r[3].toFixed(0)}`);
    }
    const knee = ik(0, 0, p.ff[0], p.hy - p.ff[1], BONE.th, BONE.sh, 1, -0.15);
    ok(knee[0] > 18, `${nm}：前膝要往前提：${knee[0].toFixed(0)}`);
  }
});
T('2.1 动作衔接：肘、膝换弯向分几帧过去，不一帧整条胳膊翻过去（出短拳的后手肘、起跳、落地）；一直弯在同一边时和以前一样', () => {
  arena(300);
  const F = F1, p = F.disp, L = BONE;
  copyPose(p, POSE.stance); F.J = null; F.fk();
  const exact = (hand, hint) => ik(0, 0, hand[0], hand[1], L.ua, L.fa, -0.3, hint);
  const rel = k => [(F.J[k][0] - F.J.sh[0]) * F.facing, F.J[k][1] - F.J.sh[1]];
  const e0 = exact(p.bh, p.be), r0 = rel('be');
  ok(Math.abs(e0[0] - r0[0]) < 0.01 && Math.abs(e0[1] - r0[1]) < 0.01, '站着不动时肘的位置变了');
  // 换边：提示反过来（后手肘从下面换到上面），分几帧挪过去，每帧挪不到一半，最后到 IK 那一边
  p.be = -1;
  const target = exact(p.bh, -1), span = Math.hypot(target[0] - r0[0], target[1] - r0[1]);
  ok(span > 20, '这个姿势换边要挪得够远才测得出：' + span.toFixed(1));
  let prev = r0, n = 0;
  for (let i = 0; i < 8; i++) {
    F.fk();
    const cur = rel('be'), step = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    ok(step <= span * 0.45, `第 ${i + 1} 帧一下挪了 ${step.toFixed(1)}（全程 ${span.toFixed(1)}）`);
    if (step > 0.01) n++;
    prev = cur;
  }
  ok(Math.hypot(prev[0] - target[0], prev[1] - target[1]) < 0.01, '最后要到 IK 那一边');
  ok(n >= 3, '要分几帧挪过去：' + n);
  // 真打：短拳、腿踢从站着出、收回来，肘一帧比手多挪 20 以上的帧（翻过去）—— 以前短拳 3 帧、腿踢 2 帧，现在只剩短拳起手那一下（身子往前一探）
  let big = 0;
  for (const k of ['jab', 'kick']) {
    arena(400); let J0 = cloneJ(F1.J);
    for (let i = 0; i < 24; i++) {
      tick(i === 0 ? TAP(k) : 0);
      for (const [e, h] of [['fe', 'fh'], ['be', 'bh']]) {
        const dE = Math.hypot(F1.J[e][0] - J0[e][0], F1.J[e][1] - J0[e][1]), dH = Math.hypot(F1.J[h][0] - J0[h][0], F1.J[h][1] - J0[h][1]);
        if (dE - dH > 20) big++;
      }
      J0 = cloneJ(F1.J);
    }
  }
  ok(big <= 1, '肘一帧翻过去的帧数：' + big);
});
T('2.0.2 印章小一点点：比以前小 14%', () => { ok(SEAL_K >= 0.8 && SEAL_K <= 0.9, 'SEAL_K ' + SEAL_K); });
// 2.0.2 地狱：Math.random 换成固定种子的（电脑用随机数，测试要每次一样）
function seededRandom(seed, fn) {
  const r = Math.random; let s = seed >>> 0;
  Math.random = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  try { return fn(); } finally { Math.random = r; }
}
/* ---------- 2.1：电脑难度往上挪一档（易 = 2.0.2 的中、中 = 2.0.2 的难、难 = 2.0.2 的地狱），修好「老吃一招」，新做断档的极难 ---------- */
T('2.2 难度：入门 / 简单 / 中等 / 困难 / 终极（每个两个字）—— 入门是新的、比简单再简单一点；简单、中等没动；困难松了一点；终极的瞬间看穿降下来（2.3 入门、终极又降了一点）', () => {
  eq(LEVEL_IDS, ['novice', 'easy', 'normal', 'hard', 'hell']);
  eq(LEVEL_IDS.map(id => LEVEL_NAME[id]), ['入门', '简单', '中等', '困难', '终极']);
  for (const id of LEVEL_IDS) { ok(LEVEL_NAME[id].length === 2, id + ' 名字要两个字'); eq(LABEL[id], '电脑 · ' + LEVEL_NAME[id]); }
  eq([LEVELS.novice.react, LEVELS.easy.react, LEVELS.normal.react, LEVELS.hard.react, LEVELS.hell.react], [13, 11, 8, 8, 11], '反应帧');
  ok(LEVELS.novice.block < LEVELS.easy.block && LEVELS.novice.read < LEVELS.easy.read && LEVELS.novice.punishBlock < LEVELS.easy.punishBlock, '入门比简单挡得少、读招少、罚得少');
  ok(PLANS.novice.every(([p]) => p.length <= 3) && PLANS.novice.filter(([p]) => p.length <= 2).length >= PLANS.novice.length - 1, '入门的连招短（多是一两下）');
  ok(LEVELS.hard.smart && LEVELS.hard.see === 0.45 && !LEVELS.hard.inst, '困难：2.1 的难松一点（看穿 0.5 → 0.45）');
  ok(LEVELS.hell.smart && LEVELS.hell.inst === 0.2 && LEVELS.hell.instMax === 0.55 && LEVELS.hell.instReact === 1, '终极：瞬间看穿 0.6 / 0.88 → 0.3 / 0.55（2.2）→ 基础 0.2（2.3）');
  ok(LEVELS.hell.react >= LEVELS.hard.react, '终极平时的反应不比人快（看穿靠概率）');
  for (const id of LEVEL_IDS) {
    const L = LEVELS[id];
    ok(L.airBlock >= 0.7 && L.aaPlan >= 0.45 && L.habit > 0 && L.guard > 0 && L.punishBlock >= 0.35, id + '：防跳、空中招站着挡、记习惯、近身护手、挡住就罚，每档都要有');
  }
  for (let i = 1; i < LEVEL_IDS.length; i++) {
    const a = LEVELS[LEVEL_IDS[i - 1]], b = LEVELS[LEVEL_IDS[i]];
    ok(b.habit >= a.habit && b.aaPlan >= a.aaPlan && b.punishBlock >= a.punishBlock, LEVEL_IDS[i] + ' 不能比 ' + LEVEL_IDS[i - 1] + ' 笨');
  }
});
T('困难（2.1 叫难、2.0.2 叫地狱）：看穿不是每次都看得穿 —— 基础 ' + LEVELS.hard.see + '，你在这个距离老出的那一招最多八成，别的招还是基础', () => {
  arena(140); const b = makeBrain(F2, 'hard'), base = LEVELS.hard.see;
  eq(b.seeChance({ name: 'kick' }, 140), base, '还不认识你：基础');
  b.memo.open[bandOf(140)] = { kick: 20, jab: 2 };
  const pk = b.seeChance({ name: 'kick' }, 140), pj = b.seeChance({ name: 'jab' }, 140);
  ok(pk > 0.7 && pk <= 0.8, '老出腿踢：看穿腿踢的概率涨到八成上下：' + pk);
  eq(pj, base, '不常出的招还是基础');
  eq(b.seeChance({ name: 'kick' }, 60), base, '换个距离不算');
});
T('终极（2.1 叫极难）：每一招有一定概率被它 1 帧看穿 —— 基础 ' + LEVELS.hell.inst + '，你在这个距离老出的那一招更高，最多 ' + LEVELS.hell.instMax, () => {
  arena(140); const b = makeBrain(F2, 'hell');
  eq(b.instChance({ name: 'kick' }, 140), LEVELS.hell.inst, '还不认识你：基础');
  b.memo.open[bandOf(140)] = { kick: 20, jab: 2 };
  const pk = b.instChance({ name: 'kick' }, 140), pj = b.instChance({ name: 'jab' }, 140);
  ok(pk > LEVELS.hell.inst + 0.15 && pk <= LEVELS.hell.instMax + 1e-9, '老出腿踢：看穿的概率要涨：' + pk);
  eq(pj, LEVELS.hell.inst, '不常出的招还是基础');
});
function heavySpam(level, n) {
  arena(110); const B = makeBrain(F2, level); game.brains = [null, B];
  let thrown = 0, dodged = 0, landed = 0, elbows = 0, last = -99, kicked = 0, fast = 0;
  for (let i = 0; i < n; i++) {
    const dist = Math.abs(F2.x - F1.x), tw = F2.x > F1.x ? RIGHT : LEFT;
    let v = 0;
    if (F1.actionable() && dist <= 112 && i - last >= 30) { v = TAP('heavy'); last = i; }
    else if (F1.actionable() && dist > 100) v = tw;
    const was = F1.move && F1.move.serial, was2 = F2.move && F2.move.serial;
    F1.hp = MAX_HP;                                  // 只看破不破得了，别让人被打死
    step([v, 0]);
    if (F1.move && F1.move.name === 'heavy' && F1.move.serial !== was) thrown++;
    if (F1.move && F1.move.name === 'heavy' && F1.move.slipped && !F1.move.__c) { F1.move.__c = 1; dodged++; }
    if (F1.move && F1.move.name === 'heavy' && F1.move.hit && !F1.move.__h) { F1.move.__h = 1; landed++; }
    if (F2.move && F2.move.name === 'slipElbow' && F2.move.t === 1) elbows++;
    // 重拳刚出手 2 帧电脑就已经想好怎么破了（算好时机要闪身 / 卸力，或者已经起腿）= 瞬间看穿
    if (F1.move && F1.move.name === 'heavy' && F1.move.t === 2 && B.instFor === F1.move.serial && (B.todo || B.slipSeq.length || (F2.move && F2.move.def.kind === 'kick'))) fast++;
    if (F2.move && F2.move.serial !== was2 && F2.move.def.kind === 'kick') kicked++;
    if (game.phase !== 'fight') break;
  }
  game.brains = [null, null];
  return { thrown, dodged, landed, elbows, parried: F2.stats.parries, kicked, fast };
}
T('困难：一直打重拳，它常常闪身钻过去回身肘、卡准时机卸力、起腿化解，但不是每下都破得了（有的照样打中）', () => seededRandom(7, () => {
  const r = heavySpam('hard', 4000), broke = r.dodged + r.parried;
  ok(r.thrown >= 15, '重拳出得太少：' + r.thrown);
  ok(r.elbows >= 1 && r.dodged >= 1, `闪身回身肘一次都没有（闪过 ${r.dodged}、回身肘 ${r.elbows}）`);
  ok(broke >= r.thrown * 0.15, `破得太少：${r.thrown} 下重拳，闪过 ${r.dodged}、卸力 ${r.parried}`);
  ok(broke <= r.thrown * 0.9, `不能每下都破：${r.thrown} 下重拳，打中 ${r.landed}，闪过 ${r.dodged}、卸力 ${r.parried}`);
}));
T('终极：一直打重拳，大多数被它看穿 —— 有的重拳一出手它马上就动（闪身 / 起腿化解 / 卡准帧卸力），破得和困难差不多，但不是一下都打不中', () => {
  // 2.3 终极平时的看穿降了、反应 11 帧：对着一直出重拳的人，靠的是「你老出这一招就更容易被看穿」（最多 0.55）—— 和困难破得差不多就行
  const sum = lv => { const t = { thrown: 0, landed: 0, fast: 0 }; for (const sd of [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25]) seededRandom(sd, () => { const r = heavySpam(lv, 4000); t.thrown += r.thrown; t.landed += r.landed; t.fast += r.fast; }); return t; };
  const h = sum('hell'), d = sum('hard');
  ok(h.thrown >= 180, '重拳出得太少：' + h.thrown);
  ok(h.fast >= 6, '没有瞬间反应的：' + JSON.stringify(h));
  ok(h.landed / h.thrown <= d.landed / d.thrown + 0.03, `终极不能比困难破得少太多：终极打中 ${h.landed}/${h.thrown}，困难打中 ${d.landed}/${d.thrown}`);
  ok(h.landed <= h.thrown * 0.2, '终极被重拳打中太多：' + h.landed + '/' + h.thrown);
});
// 「木头玩家」：反复出同一种招（从差不多的距离起手），数这一招赚了几次（这一次交手里电脑掉的血比他多），每次净赚多少
const AI_PATS = (() => {
  const P = {}, Bk = HOLD('block'), Dn = HOLD('down');
  const tw = (me, op) => HOLD(op.x >= me.x ? 'right' : 'left');
  const jumpIn = (key, down) => ({ start: [185, 225], go(st, me, op) {
    if (st.i === 0) return TAP('up') | tw(me, op);
    if (st.i < 4) return tw(me, op);
    const d = Math.abs(op.x - me.x);
    if (!st.fired && me.state === 'air' && !me.airUsed) {
      const okk = down ? d >= 50 && d <= 150 && me.vz < 5 : d <= MOVES[AIR_OF[key]].reach + 6 && me.vz < 3;
      if (okk) { st.fired = 1; return (down ? Dn : 0) | TAP(key); }
    }
    return st.i > 8 && !me.airborne && me.state !== 'attack' ? 'done' : 0;
  } });
  P.jumpHeavy = jumpIn('heavy'); P.jumpKick = jumpIn('kick'); P.jumpDive = jumpIn('kick', true);
  const ground = (keys, dist, follow) => ({ start: dist, go(st, me) {
    if (st.i === 0) return keys;
    if (follow && me.state === 'attack' && me.move && me.move.hit && st.k < follow.length) { const k = follow[st.k], kind = k.replace('d:', ''); if (me.canCancel(kind)) { st.k++; return (k.startsWith('d:') ? Dn : 0) | TAP(kind); } }
    return st.i > 3 && me.actionable() ? 'done' : 0;
  } });
  P.kick = ground(TAP('kick'), [124, 134], ['heavy']);
  P.sweep = ground(Dn | TAP('kick'), [100, 116]);
  P.lowJabSweep = ground(Dn | TAP('jab'), [80, 92], ['d:kick']);
  P.heavy = ground(TAP('heavy'), [100, 112], ['kick']);
  P.grabStand = ground(TAP('grab'), [70, 80]);
  P.dashJab = { start: [160, 200], go(st, me, op) {
    if (st.i === 0 || st.i === 2) return tw(me, op);
    if (st.i === 2 + DASH_CANCEL + 1) return TAP('jab');
    return st.i > 12 && me.actionable() ? 'done' : 0;
  } };
  P.crossup = { start: [60, 80], go(st, me, op) {
    if (st.i === 0) { st.side = op.x >= me.x ? 1 : -1; return TAP('up') | HOLD(st.side > 0 ? 'right' : 'left'); }
    if (st.i < 14) return HOLD(st.side > 0 ? 'right' : 'left');
    if (!st.fired && me.state === 'air' && !me.airUsed && (op.x - me.x) * st.side < 0 && me.vz < 0) { st.fired = 1; return TAP('jab'); }
    return st.i > 8 && !me.airborne && me.state !== 'attack' ? 'done' : 0;
  } };
  return P;
})();
function aiPattern(level, name, frames) {
  startMatch('pvp'); game.phase = 'fight'; game.paused = true; game.endless = true;
  game.brains = [null, makeBrain(F2, level)]; F1.x = 700; F2.x = 900;
  const pat = AI_PATS[name];
  let st = null, mode = 'walk', target = 0, att = 0, won = 0, net = 0, waitT = 0, cur = null;
  const close = () => { if (cur && cur.d2 - cur.chip > cur.d1) won++; cur = null; };
  for (let f = 0; f < frames; f++) {
    const h1 = F1.hp, h2 = F2.hp, b0 = F2.stats.blocks, d = Math.abs(F2.x - F1.x);
    let v = 0;
    if (mode === 'walk') {
      if (!target) target = pat.start[0] + Math.random() * (pat.start[1] - pat.start[0]);
      if (F1.actionable()) {
        if (d > target + 8) v = HOLD(F2.x >= F1.x ? 'right' : 'left');
        else if (d < target - 8) v = HOLD(F2.x >= F1.x ? 'left' : 'right');
        else if (++waitT > 4) { mode = 'go'; st = { i: 0, k: 0 }; waitT = 0; att++; cur = { d1: 0, d2: 0, chip: 0, t: 0 }; }
      }
      if (F1.x < WALL_L + 40 || F1.x > WALL_R - 40) { F1.x = 800; F2.x = 800 + target * (Math.random() < 0.5 ? 1 : -1); }
    }
    if (mode === 'go') { const r = pat.go(st, F1, F2); st.i++; if (r === 'done' || st.i > 160) { mode = 'walk'; target = 0; } else v = r; }
    step([v, 0]);
    const dd = Math.max(0, h2 - F2.hp), dt = Math.max(0, h1 - F1.hp);
    net += dd - dt;
    if (cur) { cur.d2 += dd; cur.d1 += dt; if (F2.stats.blocks > b0) cur.chip += dd; if (++cur.t > 150 || (mode === 'walk' && cur.t > 40)) close(); }
    if (F1.hp < MAX_HP - 200 || F2.hp < MAX_HP - 200) F1.hp = F2.hp = MAX_HP;
    if (F1.state === 'ko' || F2.state === 'ko' || game.phase !== 'fight') { startRound(); game.phase = 'fight'; F1.hp = F2.hp = MAX_HP; }
  }
  close(); game.brains = [null, null];
  return { att, rate: won / Math.max(1, att), net: net / Math.max(1, att) };
}
T('2.1 所有难度：泰山压顶、飞踢跳进来不会白吃（以前要么蹲着挡、要么等看见空中招才动，泰山压顶常常打中）', () => seededRandom(11, () => {
  const cap = { novice: 0.6, easy: 0.32, normal: 0.25, hard: 0.2, hell: 0.15 };   // 2.2 入门最松（看反应慢、常蹲不对）
  for (const lv of LEVEL_IDS) for (const pn of ['jumpHeavy', 'jumpKick']) {
    const r = aiPattern(lv, pn, 4800);
    ok(r.att >= 8, `${lv} ${pn} 次数太少：${r.att}`);
    ok(r.rate <= cap[lv], `${lv}：${pn} 赚了 ${(r.rate * 100).toFixed(0)}%（不能超过 ${cap[lv] * 100}%）`);
  }
}));
T('2.1 所有难度：没有「永远吃」的招 —— 一种招反复出，电脑会看反应、记住你的习惯调整防法；困难、终极反复出同一招还要亏', () => seededRandom(12, () => {
  const cap = { novice: 0.7, easy: 0.62, normal: 0.52, hard: 0.42, hell: 0.36 }, bad = [];   // 2.2 终极的看穿降了：0.3 → 0.36（多种子平均只有一成上下，单跑一次起伏大）
  for (const lv of LEVEL_IDS) for (const pn of ['kick', 'sweep', 'lowJabSweep', 'heavy', 'grabStand', 'dashJab', 'crossup', 'jumpDive']) {
    const r = aiPattern(lv, pn, 3600);
    if (r.rate > cap[lv]) bad.push(`${lv} ${pn} 赚 ${(r.rate * 100).toFixed(0)}%`);
    if ((lv === 'hard' || lv === 'hell') && r.net > 1) bad.push(`${lv} ${pn} 每次净赚 ${r.net.toFixed(1)}`);
  }
  ok(!bad.length, bad.join('；'));
}));
T('2.1 接腿：腿快踢到了就不去接（以前晚 5 帧也伸手，常常接空挨踢）', () => seededRandom(5, () => {
  let late = 0, tries = 0;
  for (const lv of ['easy', 'normal']) {
    arena(126); game.brains = [null, makeBrain(F2, lv)];
    let last = -99;
    for (let i = 0; i < 2400; i++) {
      const dist = Math.abs(F2.x - F1.x);
      let v = 0;
      if (F1.actionable() && dist <= 134 && i - last >= 40) { v = TAP('kick'); last = i; }
      else if (F1.actionable() && dist > 130) v = F2.x > F1.x ? RIGHT : LEFT;
      const was2 = F2.move && F2.move.serial;
      F1.hp = F2.hp = MAX_HP;
      step([v, 0]);
      // 电脑在对手出腿时伸手：腿踢还剩不到擒拿前摇那么多帧才按 = 来不及
      if (F2.move && F2.move.serial !== was2 && F2.move.name === 'grab' && F1.move && F1.move.name === 'kick') { tries++; if (F1.move.S - F1.move.t < MOVES.grab.S) late++; }
      if (game.phase !== 'fight') break;
    }
    game.brains = [null, null];
  }
  eq(late, 0, `伸手接腿 ${tries} 次，其中来不及的`);
}));
T('电脑对电脑：一档比一档强 —— 终极赢困难、困难赢中等、中等赢简单、简单赢入门', () => seededRandom(3, () => {
  for (const [a, b] of [['hell', 'hard'], ['hard', 'normal'], ['normal', 'easy'], ['easy', 'novice']]) {
    startMatch('pvp'); game.paused = false; game.endless = true;
    game.brains = [makeBrain(F1, a), makeBrain(F2, b)];
    const won = [0, 0]; let r = 0, n = 0;
    while (r < 4 && n++ < 60000) {
      step([0, 0]);
      if (game.phase === 'roundEnd' && game.phaseT === 1) { r++; if (F1.hp > F2.hp) won[0]++; else if (F2.hp > F1.hp) won[1]++; }
      if (game.phase === 'over') { game.wins = [0, 0]; startRound(); }
    }
    game.brains = [null, null];
    ok(r >= 4 && won[0] >= 3, `${a} 打 ${b}：${won[0]} : ${won[1]}（${r} 回合）`);
  }
}));

// 2.2 「木头玩家」乱换招：每次交手随便挑一种起手（短拳、重拳、腿、扫堂腿、下盘拳、擒拿、跳进来、冲刺进来、光挡着），打中了照常接；
// 数他打掉的血占两人一共掉的血的多少 —— 难度越高他占得越少（Jack：做完保证每一档都有比较明显的区别）
function mixedPlayer(level, frames) {
  const P = AI_PATS, Dn = HOLD('down'), tw = (me, op) => HOLD(op.x >= me.x ? 'right' : 'left');
  const ground = (keys, dist, follow) => ({ start: dist, go(st, me) {
    if (st.i === 0) return keys;
    if (follow && me.state === 'attack' && me.move && me.move.hit && st.k < follow.length) { const k = follow[st.k], kind = k.replace('d:', ''); if (me.canCancel(kind)) { st.k++; return (k.startsWith('d:') ? Dn : 0) | TAP(kind); } }
    return st.i > 3 && me.actionable() ? 'done' : 0;
  } });
  const pats = [ground(TAP('jab'), [78, 90], ['jab', 'heavy']), ground(TAP('jab'), [78, 90], ['kick']), ground(TAP('heavy'), [96, 110], ['kick']), ground(TAP('kick'), [118, 132], ['heavy']),
    ground(Dn | TAP('kick'), [100, 116]), ground(Dn | TAP('jab'), [78, 90], ['d:kick']), ground(TAP('grab'), [70, 80]), P.jumpHeavy, P.jumpKick, P.jumpDive, P.dashJab,
    { start: [90, 140], go(st) { return st.i < 50 ? HOLD('block') : 'done'; } }];
  startMatch('pvp'); game.phase = 'fight'; game.paused = true; game.endless = true;
  game.brains = [null, makeBrain(F2, level)]; F1.x = 700; F2.x = 900;
  let st = null, mode = 'walk', target = 0, waitT = 0, pat = null, dealt = 0, taken = 0;
  for (let f = 0; f < frames; f++) {
    const h1 = F1.hp, h2 = F2.hp, d = Math.abs(F2.x - F1.x);
    let v = 0;
    if (mode === 'walk') {
      if (!pat) { pat = pats[(Math.random() * pats.length) | 0]; target = pat.start[0] + Math.random() * (pat.start[1] - pat.start[0]); }
      if (F1.actionable()) {
        if (d > target + 8) v = HOLD(F2.x >= F1.x ? 'right' : 'left');
        else if (d < target - 8) v = HOLD(F2.x >= F1.x ? 'left' : 'right');
        else if (++waitT > 4) { mode = 'go'; st = { i: 0, k: 0 }; waitT = 0; }
      }
      if (F1.x < WALL_L + 40 || F1.x > WALL_R - 40) { F1.x = 800; F2.x = 800 + target * (Math.random() < 0.5 ? 1 : -1); }
    }
    if (mode === 'go') { const r = pat.go(st, F1, F2); st.i++; if (r === 'done' || st.i > 160) { mode = 'walk'; pat = null; } else v = r; }
    step([v, 0]);
    dealt += Math.max(0, h2 - F2.hp); taken += Math.max(0, h1 - F1.hp);
    if (F1.hp < MAX_HP - 200 || F2.hp < MAX_HP - 200) F1.hp = F2.hp = MAX_HP;
    if (F1.state === 'ko' || F2.state === 'ko' || game.phase !== 'fight') { startRound(); game.phase = 'fight'; F1.hp = F2.hp = MAX_HP; }
  }
  game.brains = [null, null];
  return dealt / Math.max(1, dealt + taken);
}
T('2.2 五档拉得开：乱换招的木头玩家打掉的血占比 入门 > 简单 > 中等 > 困难 > 终极，每一档至少差 4%；终极不再是「完全打不着」（2.3：入门 ≥ 64%、终极 ≥ 20%）', () => {
  const sh = {}, seeds = [5, 6, 7, 8, 9, 10];
  for (const lv of LEVEL_IDS) { let t = 0; for (const sd of seeds) t += seededRandom(sd, () => mixedPlayer(lv, 30000)); sh[lv] = t / seeds.length; }
  const txt = LEVEL_IDS.map(l => `${LEVEL_NAME[l]} ${(sh[l] * 100).toFixed(1)}%`).join(' · ');
  for (let i = 1; i < LEVEL_IDS.length; i++) ok(sh[LEVEL_IDS[i - 1]] - sh[LEVEL_IDS[i]] >= 0.04, '有两档挨得太近：' + txt);
  ok(sh.novice >= 0.64, '入门要让木头玩家明显占上风：' + txt);
  ok(sh.hell >= 0.2, '终极还是太难（木头玩家几乎打不着）：' + txt);
  console.log('五档：' + txt);
});
T('2.2 训练场：进去直接开始 —— 没有「第一回合」「战」这些开场字，也不用等', () => {
  FX.length = 0; startMatch('train'); game.brains[1] = new Dummy(F2, 'stand');
  eq(game.phase, 'fight', '一进来就能打');
  step([0, 0]); step([0, 0]);
  ok(!FX.some(e => e.type === 'announce'), '不要开场字：' + FX.filter(e => e.type === 'announce').map(e => e.text).join(','));
  step([TAP('jab'), 0]);
  ok(F1.state === 'attack', '第一帧就能出招');
  startMatch('pvp'); game.brains = [null, null];
  eq(game.phase, 'intro', '别的模式照旧有开场');
});

T('2.2 教程：网页版每一页、软件版每一章都排得出来；招式、连招、小图都对得上游戏里的招（连招表写的按法真打得出那一招）', () => {
  for (const g of G_MOVES) ok(MOVES[g.id], '教程里没有这一招：' + g.id);
  for (const G of G_COMBOS) for (const c of G.list) {
    for (const m of c.moves) ok(MOVES[m], c.name + ' 的小图用了不存在的招：' + m);
    const n = c.times ? parseInt(c.times.split('~').pop().replace(/[^0-9]/g, ''), 10) : 0;
    const keys = c.times ? Array(n).fill(c.keys[0]) : c.keys, chain = [];
    let last = null;
    for (const k of keys) { const kind = k.replace('d:', ''); last = pickVariant(kind, chain, false, k.startsWith('d:') ? 'down' : ''); chain.push(kind); }
    ok(last && c.moves.includes(last) && c.name.endsWith(MOVES[last].label), `${c.name}：按 ${keys.join(' ')} 打出来的是 ${last}`);
  }
  for (const [id] of GUIDE_TABS) ok(Guide['p_' + id]().length > 300, '网页版这一页是空的：' + id);
  for (const [id] of MANUAL_CH) ok(Manual['c_' + id]().length > 300, '软件版这一章是空的：' + id);
  ok(/<kbd class="kc"><b>拳<\/b><span>F<\/span><\/kbd>/.test(gText('按 [拳]', DEFAULT_KEYS)), '按键显示成你的键');
  const specs = G_MOVES.map(g => g.icon).concat(G_TECH.flatMap(G => G.list.map(t => t.icon)), Object.values(DRILL_ICON), G_COMBOS.flatMap(G => G.list.flatMap(c => c.moves.map(m => ({ move: m })))));
  for (const sp of specs) { const r = PoseIcon.build(sp); ok(r.J && r.J.head && isFinite(r.J.head[0]) && isFinite(r.J.ff[1]), '小图画不出来：' + JSON.stringify(sp)); }
  const cv2 = PoseIcon.canvas({ move: 'kick' }, 96, 96);
  ok(cv2.width >= 192 && cv2.getContext('2d').getImageData(0, 0, cv2.width, cv2.height).data.some((v, i) => i % 4 === 3 && v > 200), '小图是空白的');
  for (const [tid] of DRILL_TOPICS) { ok(DRILL_ICON[tid], tid + ' 没有小图'); ok(DRILL_GROUPS.filter(g => g[2].includes(tid)).length === 1, tid + ' 要在而且只在一组里'); }
  eq(DRILL_GROUPS.reduce((n, g) => n + g[2].length, 0), DRILL_TOPICS.length, '分组里的招数');
});

T('2.3 开场锣鼓：「八 大 仓」—— 回合名随着「仓」砸下来；战鼓越敲越密、越敲越响；「战」那一下大仓；决胜局多一声仓；训练场不敲', () => {
  const keep = Sound.luogu, got = [];
  Sound.luogu = (k, p) => got.push([game.phaseT, k, p]);
  try {
    const intro = () => {
      got.length = 0; let nameAt = -1;
      for (let i = 0; i < 120 && game.phase === 'intro'; i++) {
        const t = game.phaseT; step([0, 0]);
        if (nameAt < 0 && FX.some(e => e.type === 'announce' && /回合|决胜局/.test(e.text))) nameAt = t;
      }
      const at = k => got.filter(g => g[1] === k).map(g => g[0]);
      return { at, nameAt, pw: got.filter(g => g[1] === '咚').map(g => g[2]) };
    };
    FX.length = 0; startMatch('pvp'); game.brains = [null, null];
    let r = intro();
    eq(r.at('八'), [2]); eq(r.at('大'), [6]); eq(r.at('仓'), [10, 68], '仓：回合名、「战」');
    eq(r.nameAt, 10, '回合名和「仓」同一帧');
    const d = r.at('咚');
    ok(d.length >= 10 && d[0] > 10 && d[d.length - 1] < 68, '战鼓在中间：' + d);
    for (let i = 2; i < d.length; i++) ok(d[i] - d[i - 1] <= d[i - 1] - d[i - 2], '鼓点要越来越密：' + d);
    for (let i = 1; i < r.pw.length; i++) ok(r.pw[i] >= r.pw[i - 1], '越敲越响：' + r.pw);
    FX.length = 0; game.wins = [2, 2]; startRound(); r = intro();
    eq(r.at('仓'), [10, 18, 68], '决胜局多一声仓');
    FX.length = 0; startMatch('train'); got.length = 0; for (let i = 0; i < 90; i++) step([0, 0]);
    eq(got.length, 0, '训练场直接开打，不敲');
  } finally { Sound.luogu = keep; startMatch('pvp'); game.brains = [null, null]; }
});
T('2.3 训练场面板（Jack：最底下一排字穿出方框、上面的字把印章挡掉）：面板改矮、不压人头；字放不下先缩再截短；印章画在面板上面，落在面板上的挪到面板下沿外面，挪下去会压到头就少挪；「过关」印章盖在面板上、敲一声仓', () => seededRandom(31, () => {
  const long = '闪身躲过重拳，回身一肘打在背上：他背对着你踉跄、动不了，你先动';
  for (const mw of [60, 160, 320]) {
    const t = fitLine(long, mw, '500', [15, 13], UIF);
    ok(ctx.measureText(t).width <= mw + 0.5 && t.endsWith('…'), `放不下没截短：${mw} ${t}`);
  }
  eq(fitLine('打中 -12', 300, '500', [15, 13], UIF), '打中 -12', '放得下就不动');
  const keepSeal = drawSeal, keepPanel = paperPanel, keepLuogu = Sound.luogu, keepCb = Drill.onPass, keepPasses = Drill.passes, order = [], gongs = [];
  try {
    drawSeal = function () { order.push('seal'); return keepSeal.apply(this, arguments); };
    paperPanel = function () { order.push('panel'); return keepPanel.apply(this, arguments); };
    FX.length = 0; startMatch('train'); game.brains = [null, null];
    F1.x = STAGE_W / 2 - 60; F2.x = STAGE_W / 2 + 60; F1.facing = 1; F2.facing = -1;
    for (let i = 0; i < 40; i++) { step([0, 0]); render(); }                 // 镜头走到位
    const sy = wy => FY + camLift * camZ + (wy - FLOOR) * camZ;               // 场地 y → 画面 y
    const bottom = hudBox.y + hudBox.h;
    ok(bottom <= 84 + 130, '训练面板太高：' + JSON.stringify(hudBox));
    for (const F of game.p) ok(sy(F.J.head[1] - 16) > bottom + 20, `面板压到人头了：头顶 ${sy(F.J.head[1] - 16)}，面板下沿 ${bottom}`);
    // 一般的印章（出招的人身后、头上面一点）：落在面板上 → 整个挪到面板下面，而且画在面板上面
    const hh = 3.36 * 30 * SEAL_K / 2;
    stamp(F1.J.head[0] - 52 * F1.facing, F1.J.head[1] - 46, '过肩摔', 30, F1);
    order.length = 0; render();
    let e = FX.find(x => x.type === 'stamp');
    ok(sy(e.ty - hh) >= bottom, `印章还在面板底下：${sy(e.ty - hh)} < ${bottom}`);
    ok(order.lastIndexOf('seal') > order.indexOf('panel') && order.indexOf('panel') >= 0, '印章要画在面板上面：' + order.join(','));
    const y0 = e.ty; F1.x -= 40; step([0, 0]); render();
    eq(e.ty, y0, '盖下去以后不跟着人跳');
    // 正好在头顶上的：挪下去会压到头 → 少挪，印章底边还在头顶上面
    FX.length = 0;
    stamp(F1.J.head[0], F1.J.head[1] - 130, '千斤坠', 30, F1); render();
    e = FX.find(x => x.type === 'stamp');
    ok(e.ty + hh <= F1.J.head[1] - 16 + 1e-6, `印章压到头了：${e.ty + hh} > ${F1.J.head[1] - 16}`);
    // 别的模式照旧：印章在镜头里画、不挪
    FX.length = 0; startMatch('pvp'); game.brains = [null, null];
    stamp(F1.J.head[0], F1.J.head[1] - 46, '冲天炮', 30, F1); render();
    ok(FX.find(x => x.type === 'stamp').ty == null, '对战里的印章不该挪');
    // 破招练习：每一课的面板都不压人头
    let worst = 0;
    for (const d of DRILLS) { Drill.start(d.id, false); render(); worst = Math.max(worst, hudBox.y + hudBox.h); }
    ok(worst <= 84 + 150 && worst < sy(F1.J.head[1] - 16) - 20, '破招面板太高：' + worst);
    // 过关：不往场地里盖「过关」（那里正好被面板挡住），改成盖在面板上；敲一声仓
    Sound.luogu = (k, p) => gongs.push(k);
    Drill.start('jab.armor', false); Drill.onPass = () => {};
    game.brains[0] = new DrillDemo(F1, Drill.cur.def);
    for (let i = 0; i < 3000 && !Drill.cur.passed; i++) step([0, 0]);
    ok(Drill.cur.passed, '没过关');
    ok(!FX.some(x => x.type === 'stamp' && x.text === '过关'), '「过关」不该盖在场地里');
    ok(gongs.includes('仓'), '过关要敲一声仓：' + gongs);
    order.length = 0; render();
    ok(order.filter(x => x === 'seal').length >= 1 && order.indexOf('seal') > order.indexOf('panel'), '「过关」印章要盖在面板上：' + order.join(','));
  } finally {
    drawSeal = keepSeal; paperPanel = keepPanel; Sound.luogu = keepLuogu; Drill.onPass = keepCb; Drill.passes = keepPasses;
    Drill.stop(); Drill.save(); FX.length = 0; startMatch('pvp'); game.brains = [null, null];
  }
}));

/* ---------- 2.1 训练场 · 破招练习 ---------- */
T('2.1 破招练习：每一种对手的招都有课，一招好几种破法分开（子解法）；单招、连招、技术都有；每一课都有说明、为什么、演示、判定', () => {
  ok(DRILL_TOPICS.length >= 30, '对手的招太少：' + DRILL_TOPICS.length);
  for (const [tid, name] of DRILL_TOPICS) ok(DRILLS.some(d => d.topic === tid), name + ' 没有课');
  ok(DRILLS.length >= 60, '课太少：' + DRILLS.length);
  ok(DRILL_TOPICS.filter(([tid]) => DRILLS.filter(d => d.topic === tid).length >= 2).length >= 15, '有好几种破法的招太少');
  const ids = new Set();
  for (const d of DRILLS) {
    ok(!ids.has(d.id), '重复的课：' + d.id); ids.add(d.id);
    ok(d.name && d.how && d.how.length >= 1 && d.why && d.need >= 1 && typeof d.demo === 'function' && typeof d.win === 'function', d.id + ' 缺东西');
    ok(d.react || d.scene || typeof d.act === 'function', d.id + '：木桩不出招');
    for (const t of d.how.concat([d.why])) ok(!/\[[^拳重踢拿挡蹲跳前后\]]+\]/.test(t), d.id + ' 文字里的按键写错：' + t);
  }
  // 连招也要有：拳拳重、重踢、踢踢、拳重、拳踢、拳拳踢、踢重、重重、下盘拳接扫堂腿
  for (const t of ['upper', 'whirl', 'twin', 'beng', 'whip', 'backKick', 'hammer', 'chop', 'lowSweep', 'rush']) ok(DRILL_TOPICS.some(x => x[0] === t), '缺连招：' + t);
});
T('2.1 破招练习：每一课的演示（电脑替你按）都破得成 —— 说明写的时机是真的，木桩剧本和判定也对', () => seededRandom(21, () => {
  const bad = [];
  for (const d of DRILLS) {
    Drill.start(d.id, false); game.brains[0] = new DrillDemo(F1, d);
    for (let i = 0; i < 1500 && Drill.cur && (Drill.cur.ok < 2 || Drill.cur.tries < 2); i++) step([0, 0]);
    const c = Drill.cur;
    if (!c || c.ok < 2 || c.ok < c.tries * 0.66) bad.push(`${d.id} ${c ? c.ok + '/' + c.tries : '没了'}${c && c.last && !c.last.ok ? '（' + c.last.text + '）' : ''}`);
    Drill.stop();
  }
  startMatch('pvp'); game.brains = [null, null];
  ok(!bad.length, '演示破不成：' + bad.join('；'));
}));
T('破招练习：没破成要说为什么；不动就不算成功；成功 3 次过关 —— 2.2 起每一课都是成功 3 次、不记「已完成」（只数一共过了几次关）', () => seededRandom(22, () => {
  const keepPasses = Drill.passes, keepCue = Drill.cue, keepCb = Drill.onPass;
  ok(DRILLS.every(d => d.need === 3), '每一课都是成功 3 次过关');
  ok(!('done' in Drill), '不能再有「已完成」的记录');
  Drill.start('jab.armor', false);                        // 你什么都不按：挨打、不算成功
  for (let i = 0; i < 900; i++) step([0, 0]);
  ok(Drill.cur.ok === 0 && Drill.cur.tries >= 2, `不按也算成功了：${Drill.cur.ok}/${Drill.cur.tries}`);
  ok(Drill.cur.last && !Drill.cur.last.ok && /重/.test(Drill.cur.last.text), '没说为什么：' + (Drill.cur.last && Drill.cur.last.text));
  game.brains[0] = new DrillDemo(F1, Drill.cur.def);       // 照着破：成功 3 次过关
  let passed = null; Drill.onPass = d => { passed = d.id; };
  for (let i = 0; i < 3000 && !passed; i++) step([0, 0]);
  eq(passed, 'jab.armor', '过关');
  ok(Drill.cur.passed && Drill.cur.ok === 3, '成功 3 次就过');
  eq(Drill.passes, keepPasses + 1, '过关次数 +1');
  eq(localStorage.getItem('modou.drills'), null, '不再记哪一课过了');
  Drill.start('jab.armor', false);
  ok(!Drill.cur.passed && Drill.cur.ok === 0, '再练一次：从 0 开始（不是「已完成」）');
  Drill.stop(); Drill.onPass = keepCb; Drill.passes = keepPasses; Drill.cue = keepCue; Drill.save();
  startMatch('pvp'); game.brains = [null, null];
}));
T('2.2 破招练习的出招提示：开着时木桩站好位置先倒数 3 · 2 · 1（' + DRILL_CUE + ' 帧）再出手；关了照以前随机等；演示里不倒数', () => seededRandom(23, () => {
  const keep = Drill.cue;
  const firstGo = (cue, demo) => {
    Drill.cue = cue; Drill.start('kick.jab', demo);
    let counted = 0, maxTotal = 0, goFrame = -1;
    for (let i = 0; i < 600 && goFrame < 0; i++) {
      step([0, 0]);
      const c = Drill.cur;
      if (c.count) { counted++; maxTotal = Math.max(maxTotal, c.count.total); }
      if (c.rep) goFrame = c.frame;
    }
    const r = { counted, maxTotal, goFrame }; Drill.stop(); return r;
  };
  const on = firstGo(true, false), off = firstGo(false, false), demo = firstGo(true, true);
  ok(on.goFrame > 0 && on.maxTotal === DRILL_CUE && on.counted >= DRILL_CUE - 1, '开着：倒数完才出手 ' + JSON.stringify(on));
  ok(off.goFrame > 0 && off.counted === 0, '关了：不倒数 ' + JSON.stringify(off));
  ok(demo.goFrame > 0 && demo.counted === 0, '演示：不倒数 ' + JSON.stringify(demo));
  Drill.cue = keep; Drill.save();
  startMatch('pvp'); game.brains = [null, null];
}));
T('2.1 破招练习只在训练场：换模式就结束、战斗事件不再记（联机、人机不受影响）', () => {
  Drill.start('kick.catch', false);
  ok(game.mode === 'train' && Drill.cur && CEV.on, '没开起来');
  startMatch('pve'); game.brains = [null, null];
  ok(!Drill.cur && !CEV.on, '换到人机还在练');
  startMatch('pvp'); game.brains = [null, null];
});

(async function runAll() {
  const list = document.getElementById('list');
  let pass = 0;
  const results = [];
  for (const t of TESTS) {
    const li = document.createElement('li');
    try { await t.fn(); li.className = 'ok'; li.textContent = '✓ ' + t.name; pass++; results.push({ name: t.name, ok: true }); }
    catch (e) { li.className = 'bad'; li.textContent = '✗ ' + t.name + ' — ' + e.message; results.push({ name: t.name, ok: false, err: e.message }); }
    list.appendChild(li);
  }
  document.getElementById('sum').innerHTML = `版本 <code>${VERSION}</code> · 通过 ${pass} / ${TESTS.length}` + (pass === TESTS.length ? ' · 全部正常' : ' · 有失败项');
  startAttract();
  window.__results = { pass, total: TESTS.length, results };
})();
