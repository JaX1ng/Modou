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
// 2.6 这一招打中 / 被挡了、马上就能接 a（还在顿帧里也算：按早了缓冲里先存着，能接的那一步自动接上 —— 人就是这么按的）
const soonCancel = (F, a) => F.state === 'attack' && !!F.move && !F.move.air && !F.move.def.script && !F.move.def.noCancel &&
  (F.move.hit || F.move.blocked || F.move.absorbed) && (CANCEL[F.move.def.kind] || []).includes(a) && !(a === 'jab' && F.jabRun() >= JAB_CHAIN_MAX);
// 让玩家一按顺序出招，返回实际打出的招式名
function combo(acts, v2 = 0) {
  const names = [];
  for (const a of acts) {
    let k = 0;
    while (k++ < 120 && !(F1.actionable() || F1.canCancel(a) || soonCancel(F1, a))) tick(0, v2);
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
    // 2.6 前摇、后摇在这上面再 ×ATK_TEMPO（取到 0.25 帧）；判定不变
    eq([d.S, d.A, d.R], [TA(f(d.base.S)), TF(d.base.A), TA(f(d.base.R))], k);
  }
  for (const k of ['jab', 'heavy', 'kick', 'grab', 'airKick']) ok(MOVES[k].open, k + ' 是起手招');
  for (const k of ['jab2', 'beng', 'whip', 'hammer', 'twinKick', 'sweep']) ok(!MOVES[k].open, k + ' 连招里也用，不跟着慢（不然连不上）');
  eq([MOVES.jab.S, MOVES.heavy.S, MOVES.kick.S], [5.5, 15, 17.25], '短拳 4 → 5 → 5.5、重拳 12 → 14 → 15、腿踢 15 → 16 → 17.25（2.6 再长 5~10%）');
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
  // 2.4 重拳蓄到头（前摇九成）：拧腰把后手那边的肩膀拉到后面，后手拳在脖子后面；身子往后坐
  arena(400); const F = F1;
  copyPose(F.disp, evalKeys(MOVES.heavy.keys, MOVES.heavy.S * 0.9)); F.J = null; F.fk();
  ok(F.disp.tor < 0, '重拳蓄劲时身子要往后仰：tor ' + F.disp.tor.toFixed(1));
  const back = (F.J.bh[0] - F.J.neck[0]) * F.facing; ok(back < -6, '后手拳要拉到脖子后面：' + back.toFixed(1));
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
  ok(blocked >= 4, '越过头顶的挥拳挡住了 ' + blocked + ' / 7 次');
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
  ok(MOVES.airJab.S < MOVES.airKick.S && MOVES.airKick.S < MOVES.airHeavy.S, '挥拳最快、泰山压顶最慢');
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
    let k = 0, free = 0, hit = false, pressedOn = -1;
    for (let i = 0; i < 90; i++) {
      const a = seq[k] || '', low = a.startsWith('d:'), kind = a.replace('d:', '');
      let v = seq.some(x => x.startsWith('d:')) && k < seq.length && low ? DOWN : 0;
      if (k < seq.length && (F1.actionable() || F1.canCancel(kind) || (soonCancel(F1, kind) && F1.move.serial !== pressedOn))) { v |= TAP(kind); k++; pressedOn = F1.move ? F1.move.serial : -1; }
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
  eq(relation(MOVES.kick, MOVES.palm), 1, '腿克对空'); eq(relation(MOVES.airJab, MOVES.airKick), 0.5, '挥拳压飞踢');
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
  // 2.7 前摇长了两帧（蓄力）：快打到的时候才按挡（以前第 5 帧按，现在按前摇算）
  const pAt = Math.round(MOVES.super.S) - 5;
  arena(110); F1.qi = QI_MAX; run(30, i => [i === 0 ? TAP('heavy') | TAP('kick') : 0, i >= pAt ? BLOCK : 0]);
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
    const v1 = i === 0 || (F1.move && F1.move.name === 'jab' && (F1.canCancel('jab') || soonCancel(F1, 'jab'))) ? TAP('jab') : 0;
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
    if (roll) { ok(Math.abs(x1 - x0 - ROLL_BACK) < 6, '往后滚了 ' + Math.round(x1 - x0) + '（2.7 往后滚 ' + ROLL_BACK + '）'); eq(F2.facing, -1, '滚完面朝对手'); }
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
      const pick = F1.move && F1.move.name === 'hold' && F1.move.t >= 2 && F1.move.t < 3 ? TAP(key) : 0;
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
  run(60, i => { const v2 = F2.grabbed && !pressed && F2.clock - F2.heldAt >= HOLD_ESC + 1 ? (pressed = true, TAP('grab')) : 0; return [i === 0 ? TAP('grab') : 0, v2]; });
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
T('2.4 站姿（参考图第三张）：两腿前后岔开（比 1.9.4 开）—— 后腿差不多直、前腿膝盖微屈，两脚踩在地上；待机时髋几乎不上下动；出招的底子比站姿低', () => {
  const st = POSE.stance, ang = (a, m, b) => Math.acos(((a[0] - m[0]) * (b[0] - m[0]) + (a[1] - m[1]) * (b[1] - m[1])) / Math.hypot(a[0] - m[0], a[1] - m[1]) / Math.hypot(b[0] - m[0], b[1] - m[1])) / D2R;
  ok(st.ff[0] >= 20 && st.ff[0] <= 32 && st.bf[0] <= -26 && st.bf[0] >= -40, '两脚前后岔开：' + st.ff + ' / ' + st.bf);
  ok(st.ff[0] - st.bf[0] >= 50 && st.ff[0] - st.bf[0] <= 66, '岔开多少：' + (st.ff[0] - st.bf[0]));
  arena(400); copyPose(F1.disp, st); F1.J = null; F1.fk();
  const J = F1.J, kf = ang(J.hipF, J.fk, J.ff), kb = ang(J.hipB, J.bk, J.bf);
  ok(kf >= 128 && kf <= 165, '前腿膝盖微屈：' + kf.toFixed(0) + '°');
  ok(kb >= 145 && kb > kf, '后腿比前腿直：' + kb.toFixed(0) + '°');
  for (const k of ['ff', 'bf']) ok(Math.abs(FLOOR - BODY.bone.ankle - J[k][1]) < 0.6, k + ' 踩在地上');
  // 待机呼吸：看几个相位，髋高最多差 1（以前 ±3，后腿膝盖一弯一直）
  arena(400); let lo = 1e9, hi = -1e9;
  for (let i = 0; i < 80; i++) { tick(); const t = F1.target(); lo = Math.min(lo, t.hy); hi = Math.max(hi, t.hy); }
  ok(hi - lo <= 1, '待机髋上下动了 ' + (hi - lo).toFixed(2));
  ok(BASE.hy > 48 && BASE.hy < st.hy, '出招底子 ' + BASE.hy);
});
T('1.9.4 / 2.4 手臂：大臂比小臂长；2.4 整条胳膊 48（比 1.9.4 的 49 短一点，身子粗壮了看着更短，像真人）；跑步往前摆时小臂斜着往前上、手不再平平地往前够', () => {
  ok(BONE.ua > BONE.fa, `大臂 ${BONE.ua} 小臂 ${BONE.fa}`); eq(BONE.ua + BONE.fa, 48, '整条胳膊');
  // 摆到最前面：同侧腿刚抬起往前带（相位 0.54 左右）
  let best = null;
  for (let u = 0.45; u <= 0.65; u += 0.01) { const hnd = runArm(u, 30, 1); if (!best || hnd[0] > best[0]) best = hnd; }
  ok(best[0] <= 40, '手往前够了 ' + best[0].toFixed(1));
  // 小臂的方向：肘到手
  const c = Math.cos(TAU * (0.54 - 0.04)), th = (-c * RUN_ARM_F + 6 - 18) * D2R, el = [Math.sin(th) * BONE.ua, Math.cos(th) * BONE.ua], h = runArm(0.54, 30, 1);
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
  // 2.6 联机一步一步算（帧号是步数，一帧 SUB 步）。按键按帧生成再展开成步：按住的每一步都按着，新按的招只在那一帧第一步
  const NF = 1200, N = NF * SUB, delay = 2 * SUB, insF = randInputs(seed, NF), me = role === 'host' ? 0 : 1;
  const inp = (f, p) => { if (f < delay || f >= N) return 0; const v = insF[(f / SUB) | 0][p]; return f % SUB === 0 ? v : v & HELD_MASK; };
  arena(200); F1.qi = F2.qi = 40;
  const want = {}, HE = NET.HASH_EVERY * SUB;
  for (let f = 0; f < N; f++) { simTick([inp(f, 0), inp(f, 1)]); if ((f + 1) % HE === 0) want[f + 1] = stateHash(); }
  const wantFull = fullState();
  arena(200); F1.qi = F2.qi = 40;
  const rb = new Rollback(delay, role);
  let s = seed * 7 + 1; const rand = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  const net = [], got = {};
  let t = 0, maxSnaps = 0;
  while (rb.frame < N && t < N * 3) {
    t++;
    const last = t + delay;                                  // 对方差不多和我同步往前走：每步发一包，带最近 20 帧（的步）
    if (rand() > 0.15) {
      const first = Math.max(delay, last - 20 * SUB + 1), vals = [];
      for (let f = first; f <= last; f++) vals.push(inp(f, 1 - me));
      net.push([t + 1 + ((rand() * 8 * SUB) | 0), first, vals]);
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
  ok(r.rb.stats.maxDepth <= NET.MAX_PRED * SUB + 1, '回滚最深 ' + r.rb.stats.maxDepth + ' 步');
  ok(r.maxSnaps <= NET.MAX_PRED * SUB + 1, '存档没及时清掉：' + r.maxSnaps);
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
  eq(rb.frame - rb.remoteUntil, NET.MAX_PRED * SUB, '2.6 帧号是步数：' + NET.MAX_PRED + ' 帧 = ' + NET.MAX_PRED * SUB + ' 步');
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
  // 2.6 输入延迟按步算（单程延迟的一半，1 ~ 3 帧），不再取整帧
  for (const [rtt, d] of [[20, 1], [150, 2.25], [500, 3]]) { Net.rtt = rtt; eq(Net.pickDelay(), d * SUB, '往返 ' + rtt + ' 毫秒'); }
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
  for (const [nm, key, sched] of [['挥拳', TAP('jab'), jumpFwd], ['泰山压顶', TAP('heavy'), jumpFwd], ['飞踢', TAP('kick'), jumpFwd], ['千斤坠', DOWN | TAP('kick'), jumpFwd],
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
  ok(x1 > x0 + 0.5, '跑起来上一步和这一步应该差一点（2.6 一步是 1/4 帧）：' + x0 + ' → ' + x1);
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
    for (let i = 0; i < 25 * SUB; i++) F2.animate(false);        // 让姿势跟到位（2.6 animate 一次是一步）
    // 2.4 人有厚度了：按画出来的外形量 —— 头、身子、两条腿、两只手的最低点都贴着地（最多离地 6、最多穿地 3）
    const J = F2.J, up = k => FLOOR - J[k][1], parts = bodyParts(J, 0).parts;
    const low = k => { const q = parts.find(p => p.k === k); let m = -1e9; for (const [, y] of q.pts) m = Math.max(m, y); return FLOOR - m; };
    for (const k of ['head', 'torso', 'FU', 'FL', 'BU', 'BL', 'aFH', 'aBH']) ok(low(k) > -3 && low(k) < 6, `躺姿${kind} ${k} 最低点离地 ${low(k).toFixed(1)}`);
    for (const k of ['fk', 'bk']) ok(up(k) > -2 && up(k) < 22, `躺姿${kind} 膝盖离地 ${up(k).toFixed(1)}（腿最多稍微弯一点）`);
    ok(low('head') < 2, '后脑勺垫在地上：' + low('head').toFixed(1));
    ok(Math.abs(J.head[0] - J.ff[0]) > 100, '整个人横着躺开');
    for (let i = 0; i < 60 * SUB; i++) F2.animate(false);
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
  eq(F2.state, 'rise', '滚完也是起身硬直'); ok(F2.x - xDown > ROLL_BACK - 6, '滚了 ' + Math.round(F2.x - xDown));
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
      if (r.elbowAt >= 0 && queue.length && (F1.actionable() || (F1.move && (F1.canCancel(queue[0]) || soonCancel(F1, queue[0]))))) v1 = TAP(queue.shift());
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
  const seenSlip = new Set(), was = ['', ''];
  arena(150); ins.forEach(v => { step(v); for (const F of game.p) { if (F.move && F.move.name === 'slip' && !seenSlip.has(F.idx + ':' + F.move.serial)) { seenSlip.add(F.idx + ':' + F.move.serial); slips++; } if (F.gwalk) walks++; if (F.state === 'rise' && was[F.idx] !== 'rise') rises++; was[F.idx] = F.state; } });
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
T('2.4 站姿（参考图第三张，Jack：前手收短、往里收）：后手拳护在下巴前；前手在胸口前往前举 —— 大臂往下垂、小臂往上立，比参考图收得紧', () => {
  arena(400); tick(0, 0, 90);
  const J = F1.J, f = F1.facing, torso = J.hip[1] - J.neck[1], chin = J.head[1] + BONE.head;
  const fy = (J.fh[1] - J.neck[1]) / torso, fwd = (J.fh[0] - J.neck[0]) * f;
  ok(fy >= 0.05 && fy <= 0.4, '前手要在脖子下面、胸口上：' + fy.toFixed(2));
  ok(fwd >= 18 && fwd <= 34, '前手往前举、又收得紧：' + fwd.toFixed(1));
  ok(Math.abs(J.bh[1] - chin) <= 8, '后手拳在下巴那么高：' + (J.bh[1] - chin).toFixed(1));
  const bx = (J.bh[0] - J.neck[0]) * f; ok(bx >= 1 && bx <= 14, '后手拳在下巴前（脖子前面一点）：' + bx.toFixed(1));
  ok(J.fh[1] - J.bh[1] > 3, '前手比后手低');
  ok(J.fe[1] > J.fh[1] + 6 && (J.fe[0] - J.shF[0]) * f < (J.fh[0] - J.shF[0]) * f, '前手大臂往下垂（肘在拳下面、靠后）、小臂往上立');
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
  // 2.4 后手的肩膀不在两肩中间（拧腰往后错开了）：IK 从后手肩膀 shB 算到拳（拳的目标还是相对两肩中间）
  const rel = k => [(F.J[k][0] - F.J.sh[0]) * F.facing, F.J[k][1] - F.J.sh[1]];
  const root = rel('shB'), exact = (hand, hint) => ik(root[0], root[1], hand[0], hand[1], L.ua, L.fa, -0.3, hint);
  const e0 = exact(p.bh, p.be), r0 = rel('be');
  ok(Math.abs(e0[0] - r0[0]) < 0.01 && Math.abs(e0[1] - r0[1]) < 0.01, '站着不动时肘的位置变了');
  // 换边：提示反过来（后手肘从下面换到上面），分几帧挪过去，每帧挪不到一半，最后到 IK 那一边
  p.be = -1;
  const target = exact(p.bh, -1), span = Math.hypot(target[0] - r0[0], target[1] - r0[1]);
  ok(span > 20, '这个姿势换边要挪得够远才测得出：' + span.toFixed(1));
  let prev = r0, n = 0;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < SUB; j++) F.fk();                          // 2.6 fk 一次是一步，一帧 SUB 步
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
// 2.4 只看规则、电脑怎么打的长测试（几万帧）：不算画面（和联机回滚重算一样开 game.quiet）——
// 规则、电脑用的随机数都和画面无关，结果一模一样，快好几倍（新人物模型画面上算得多：拳脚停在对方身上要量外形）
function quietly(fn) { const q = game.quiet; game.quiet = true; try { return fn(); } finally { game.quiet = q; } }
/* ---------- 2.1：电脑难度往上挪一档（易 = 2.0.2 的中、中 = 2.0.2 的难、难 = 2.0.2 的地狱），修好「老吃一招」，新做断档的极难 ---------- */
T('2.2 难度：入门 / 简单 / 中等 / 困难 / 终极（每个两个字）—— 入门是新的、比简单再简单一点；简单、中等没动；困难松了一点；终极的瞬间看穿降下来（2.3 入门、终极又降了一点）', () => {
  eq(LEVEL_IDS, ['novice', 'easy', 'normal', 'hard', 'hell']);
  eq(LEVEL_IDS.map(id => LEVEL_NAME[id]), ['入门', '简单', '中等', '困难', '终极']);
  for (const id of LEVEL_IDS) { ok(LEVEL_NAME[id].length === 2, id + ' 名字要两个字'); eq(LABEL[id], '电脑 · ' + LEVEL_NAME[id]); }
  eq([LEVELS.novice.react, LEVELS.easy.react, LEVELS.normal.react, LEVELS.hard.react, LEVELS.hell.react], [22, 14, 9, 8, 11], '反应帧（2.7 入门、简单、中等慢了）');
  ok(LEVELS.novice.block < LEVELS.easy.block && LEVELS.novice.read < LEVELS.easy.read && LEVELS.novice.punishBlock < LEVELS.easy.punishBlock, '入门比简单挡得少、读招少、罚得少');
  ok(PLANS.novice.every(([p]) => p.length <= 3) && PLANS.novice.filter(([p]) => p.length <= 2).length >= PLANS.novice.length - 1, '入门的连招短（多是一两下）');
  ok(LEVELS.hard.smart && LEVELS.hard.see === 0.45 && !LEVELS.hard.inst, '困难：2.1 的难松一点（看穿 0.5 → 0.45）');
  ok(LEVELS.hell.smart && LEVELS.hell.inst === 0.2 && LEVELS.hell.instMax === 0.55 && LEVELS.hell.instReact === 1, '终极：瞬间看穿 0.6 / 0.88 → 0.3 / 0.55（2.2）→ 基础 0.2（2.3）');
  ok(LEVELS.hell.react >= LEVELS.hard.react, '终极平时的反应不比人快（看穿靠概率）');
  for (const id of LEVEL_IDS) {
    const L = LEVELS[id];
    // 2.7（Jack：入门、简单别搞那么多破招）：这两档防跳、挡住就罚、记习惯都只剩一点（还是有，不是完全不会）；中等往上照旧
    const easyish = id === 'novice' || id === 'easy';
    ok(L.airBlock >= (easyish ? 0.3 : 0.7) && L.aaPlan >= (easyish ? 0.15 : 0.45) && L.habit > 0 && L.guard > 0 && L.punishBlock >= (easyish ? 0.1 : 0.35), id + '：防跳、空中招站着挡、记习惯、近身护手、挡住就罚，每档都要有');
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
function heavySpam(level, n) { return quietly(() => heavySpamRaw(level, n)); }
function heavySpamRaw(level, n) {
  arena(110); const B = makeBrain(F2, level); game.brains = [null, B];
  let thrown = 0, dodged = 0, landed = 0, elbows = 0, last = -99, kicked = 0, fast = 0, elbowSer = -1;
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
    if (F2.move && F2.move.name === 'slipElbow' && F2.move.serial !== elbowSer) { elbowSer = F2.move.serial; elbows++; }
    // 重拳刚出手 2 帧电脑就已经想好怎么破了（算好时机要闪身 / 卸力，或者已经起腿）= 瞬间看穿
    if (F1.move && F1.move.name === 'heavy' && F1.move.t >= 2 && F1.move.t < 3 && !F1.move.__f && B.instFor === F1.move.serial && (B.todo || B.slipSeq.length || (F2.move && F2.move.def.kind === 'kick'))) { F1.move.__f = 1; fast++; }
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
function aiPattern(level, name, frames) { return quietly(() => aiPatternRaw(level, name, frames)); }
function aiPatternRaw(level, name, frames) {
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
T('2.1 所有难度：泰山压顶、飞踢跳进来不会白吃（以前要么蹲着挡、要么等看见空中招才动，泰山压顶常常打中）', () => {
  // 2.2 入门最松（看反应慢、常蹲不对）；2.7（Jack：入门要让乱打的打掉八成血、入门简单别那么多破招）：入门不查，简单放宽
  // 2.7 每一种跑四个种子取平均（以前一个种子从头跑到尾：终极被泰山压顶 12 个种子平均 2.6 是 10%、2.7 是 11%，单跑一次 0 ~ 26% 都有）
  const cap = { easy: 0.8, normal: 0.25, hard: 0.2, hell: 0.15 }, seeds = [11, 12, 13, 14];
  for (const lv of LEVEL_IDS.filter(l => l !== 'novice')) for (const pn of ['jumpHeavy', 'jumpKick']) {
    let rate = 0, att = 99;
    for (const sd of seeds) { const r = seededRandom(sd, () => aiPattern(lv, pn, 4800)); rate += r.rate / seeds.length; att = Math.min(att, r.att); }
    ok(att >= 8, `${lv} ${pn} 次数太少：${att}`);
    ok(rate <= cap[lv], `${lv}：${pn} 赚了 ${(rate * 100).toFixed(0)}%（不能超过 ${cap[lv] * 100}%）`);
  }
});
T('2.1 所有难度：没有「永远吃」的招 —— 一种招反复出，电脑会看反应、记住你的习惯调整防法；困难、终极反复出同一招还要亏', () => {
  // 2.2 终极的看穿降了：0.3 → 0.36（多种子平均只有一成上下，单跑一次起伏大）。
  // 2.7（Jack：入门再简单很多、入门简单别那么多破招）：入门不查（乱打就要能赢）；简单 0.62 → 0.78（不破招了，靠记习惯慢慢挡对）
  // 2.7 每一种招跑四个种子取平均（以前一个种子从头跑到尾，前面哪一招多一帧少一帧，后面的全变：同一档同一招能差 ±6~9%，
  //     2.6 的代码换个种子也会超 —— 困难被闪身跳过去，12 个种子平均 2.6 是 36%、2.7 是 34%，单跑一次能到 46%）
  const cap = { easy: 0.78, normal: 0.52, hard: 0.42, hell: 0.36 }, bad = [], seeds = [12, 13, 14, 15];
  for (const lv of LEVEL_IDS.filter(l => l !== 'novice')) for (const pn of ['kick', 'sweep', 'lowJabSweep', 'heavy', 'grabStand', 'dashJab', 'crossup', 'jumpDive']) {
    let rate = 0, net = 0;
    for (const sd of seeds) { const r = seededRandom(sd, () => aiPattern(lv, pn, 3600)); rate += r.rate / seeds.length; net += r.net / seeds.length; }
    if (rate > cap[lv]) bad.push(`${lv} ${pn} 赚 ${(rate * 100).toFixed(0)}%`);
    if ((lv === 'hard' || lv === 'hell') && net > 1) bad.push(`${lv} ${pn} 每次净赚 ${net.toFixed(1)}`);
  }
  ok(!bad.length, bad.join('；'));
});
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
      // 电脑在对手出腿时伸手：腿踢还剩不到擒拿前摇那么多帧才按 = 来不及。
      // 2.6：只数看得见这一腿以后伸的手（电脑看东西慢 react 帧：腿刚抬起来那几帧它还看不见，那时候伸手是别的原因，比如贴身随手一抓）
      if (F2.move && F2.move.serial !== was2 && F2.move.name === 'grab' && F1.move && F1.move.name === 'kick' && F1.move.t >= LEVELS[lv].react + 2) { tries++; if (F1.move.S - F1.move.t < MOVES.grab.S) late++; }
      if (game.phase !== 'fight') break;
    }
    game.brains = [null, null];
  }
  eq(late, 0, `伸手接腿 ${tries} 次，其中来不及的`);
}));
// 2.4：以前只打 4 回合、赢 3 回合算过 —— 动作、画面一改（随机数用的先后变了）就忽过忽不过。现在两个种子各打 8 回合，16 回合赢 10 回合以上
T('电脑对电脑：一档比一档强 —— 终极赢困难、困难赢中等、中等赢简单、简单赢入门', () => {
  for (const [a, b] of [['hell', 'hard'], ['hard', 'normal'], ['normal', 'easy'], ['easy', 'novice']]) {
    const won = [0, 0]; let r = 0;
    for (const seed of [3, 4]) seededRandom(seed, () => quietly(() => {
      startMatch('pvp'); game.paused = false; game.endless = true;
      game.brains = [makeBrain(F1, a), makeBrain(F2, b)];
      let k = 0, n = 0, was = game.phase;
      while (k < 8 && n++ < 120000) {
        step([0, 0]);
        if (game.phase === 'roundEnd' && was !== 'roundEnd') { k++; r++; if (F1.hp > F2.hp) won[0]++; else if (F2.hp > F1.hp) won[1]++; }
        was = game.phase;
        if (game.phase === 'over') { game.wins = [0, 0]; startRound(); }
      }
      game.brains = [null, null];
    }));
    ok(r >= 16 && won[0] >= 10, `${a} 打 ${b}：${won[0]} : ${won[1]}（${r} 回合）`);
  }
});

// 2.2 「木头玩家」乱换招：每次交手随便挑一种起手（短拳、重拳、腿、扫堂腿、下盘拳、擒拿、跳进来、冲刺进来、光挡着），打中了照常接；
// 数他打掉的血占两人一共掉的血的多少 —— 难度越高他占得越少（Jack：做完保证每一档都有比较明显的区别）
function mixedPlayer(level, frames) { return quietly(() => mixedPlayerRaw(level, frames)); }
function mixedPlayerRaw(level, frames) {
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
T('2.2 五档拉得开：乱换招的木头玩家打掉的血占比 入门 > 简单 > 中等 > 困难 > 终极，每一档至少差 4%；终极不再是「完全打不着」（2.7 Jack：入门 ≥ 80%、简单 ≥ 65%、中等 ≥ 40%；终极 ≥ 20%）', () => {
  const sh = {}, seeds = [5, 6, 7, 8, 9, 10];
  for (const lv of LEVEL_IDS) { let t = 0; for (const sd of seeds) t += seededRandom(sd, () => mixedPlayer(lv, 30000)); sh[lv] = t / seeds.length; }
  const txt = LEVEL_IDS.map(l => `${LEVEL_NAME[l]} ${(sh[l] * 100).toFixed(1)}%`).join(' · ');
  for (let i = 1; i < LEVEL_IDS.length; i++) ok(sh[LEVEL_IDS[i - 1]] - sh[LEVEL_IDS[i]] >= 0.04, '有两档挨得太近：' + txt);
  ok(sh.novice >= 0.8, '入门：乱打的要能打掉八成以上：' + txt);
  ok(sh.easy >= 0.65, '简单：乱打的要能打掉 65% 以上：' + txt);
  ok(sh.normal >= 0.4, '中等：乱打的要能打掉四成以上：' + txt);
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

T('2.4 开场的鼓（Jack：2.3 的锣鼓太诡异）：两声战鼓，回合名随着「锵」砸下来；战鼓越敲越密、越敲越响；「战」之前古筝一串往上拨，「战」那一下「锵」+ 古筝和弦；决胜局多一声锵；训练场不敲', () => {
  const keep = Sound.beat, got = [];
  Sound.beat = (k, p) => got.push([game.phaseT, k, p]);
  try {
    const intro = () => {
      got.length = 0; let nameAt = -1;
      for (let i = 0; i < 120 && game.phase === 'intro'; i++) {
        const t = game.phaseT; step([0, 0]);
        if (nameAt < 0 && FX.some(e => e.type === 'announce' && /回合|决胜局/.test(e.text))) nameAt = t;
      }
      const at = k => got.filter(g => g[1] === k).map(g => g[0]);
      return { at, nameAt, pw: got.filter(g => g[1] === '咚' && g[0] > 10).map(g => g[2]) };
    };
    FX.length = 0; startMatch('pvp'); game.brains = [null, null];
    let r = intro();
    eq(r.at('锵'), [10, 68], '锵：回合名、「战」');
    eq(r.nameAt, 10, '回合名和「锵」同一帧');
    ok(r.at('铮').length === 1 && r.at('铮')[0] > 50 && r.at('铮')[0] < 68, '古筝在「战」前面往上拨：' + r.at('铮'));
    eq(r.at('和'), [68], '「战」那一下古筝和弦');
    const d = r.at('咚').filter(f => f > 10);
    ok(d.length >= 10 && d[d.length - 1] < 68, '战鼓在中间：' + d);
    for (let i = 2; i < d.length; i++) ok(d[i] - d[i - 1] <= d[i - 1] - d[i - 2], '鼓点要越来越密：' + d);
    for (let i = 1; i < r.pw.length; i++) ok(r.pw[i] >= r.pw[i - 1], '越敲越响：' + r.pw);
    FX.length = 0; game.wins = [2, 2]; startRound(); r = intro();
    eq(r.at('锵'), [10, 18, 68], '决胜局多一声锵');
    FX.length = 0; startMatch('train'); got.length = 0; for (let i = 0; i < 90; i++) step([0, 0]);
    eq(got.length, 0, '训练场直接开打，不敲');
  } finally { Sound.beat = keep; startMatch('pvp'); game.brains = [null, null]; }
  // 不再有往下滑、往上挑的锣：开场、胜负已分用到的家伙里没有锣
  for (const k of Object.values(BEAT_KIT)) ok(typeof Sound[k] === 'function' && !/gong/i.test(k), '开场的家伙：' + k);
  ok(!Sound.bigGong && !Sound.smallGong && !Sound.luogu, '锣都去掉了');
});
T('2.4 声音真的出得来：用离线声卡把开场的鼓、胜负已分、按钮声各合成一遍 —— 有声音、不破音（不过 0 dB）、古筝的音高是准的', async () => {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return;
  const render = async (fn, secs) => {
    const keep = { ctx: Sound.ctx, master: Sound.master, out: Sound.out, noise: Sound.noise, zbuf: Sound.zbuf, on: Sound.on, mode: game.mode, quiet: game.quiet };
    const c = new OAC(1, Math.round(44100 * secs), 44100);
    try {
      Sound.ctx = c; Sound.zbuf = {}; Sound.on = true; game.mode = 'pvp'; game.quiet = false;
      Sound.master = c.createGain(); Sound.master.gain.value = 0.62; Sound.master.connect(c.destination);
      const len = 44100, buf = c.createBuffer(1, len, 44100), dd = buf.getChannelData(0);
      for (let i = 0; i < len; i++) dd[i] = srnd() * 2 - 1;
      Sound.noise = buf;
      fn();
      return (await c.startRendering()).getChannelData(0);
    } finally { Object.assign(Sound, { ctx: keep.ctx, master: keep.master, out: keep.out, noise: keep.noise, zbuf: keep.zbuf, on: keep.on }); game.mode = keep.mode; game.quiet = keep.quiet; }
  };
  const stats = d => { let pk = 0, e = 0; for (const v of d) { pk = Math.max(pk, Math.abs(v)); e += v * v; } return { pk, rms: Math.sqrt(e / d.length) }; };
  for (const [nm, fn, secs] of [['战鼓', () => Sound.taiko(1, 0)], ['锵', () => Sound.qiang(1.2, 0)], ['古筝往上', () => Sound.zhengUp(1, 0)], ['和弦', () => Sound.zhengChord(1, 0)], ['胜负已分', () => { Sound.taiko(1, 0); Sound.qiang(1.15, 0.16); Sound.zhengChord(1, 0.16); }],
    ['按钮的木鱼（2.5.1）', () => Sound.muyu(1, 0), 0.25]]) {                    // 木鱼是很短的一声「笃」：量它响的那一小段
    const s = stats(await render(fn, secs || 2));
    ok(s.rms > 0.004, nm + ' 没声音：' + s.rms.toFixed(4));
    ok(s.pk < 1, nm + ' 破音了：' + s.pk.toFixed(2));
  }
  // 古筝：E5（659 Hz）拨一下，自相关估音高（拨的那一下泛音多，看 0.1 ~ 0.3 秒那一段）
  const d = await render(() => Sound.zheng(659.26, 0.3, 0, 0.8), 0.5);
  let best = 0, lag = 0;
  for (let L = 30; L <= 150; L++) { let s2 = 0; for (let i = 4410; i < 13230; i++) s2 += d[i] * d[i + L]; if (s2 > best) { best = s2; lag = L; } }
  const hz = 44100 / lag; ok(Math.abs(hz - 659.26) < 15, '古筝的音高不准：' + hz.toFixed(0));
});
T('2.3 训练场面板（Jack：最底下一排字穿出方框、上面的字把印章挡掉）：面板改矮、不压人头；字放不下先缩再截短；印章画在面板上面，落在面板上的挪到面板下沿外面，挪下去会压到头就少挪；「过关」印章盖在面板上、敲一声锵', () => seededRandom(31, () => {
  const long = '闪身躲过重拳，回身一肘打在背上：他背对着你踉跄、动不了，你先动';
  for (const mw of [60, 160, 320]) {
    const t = fitLine(long, mw, '500', [15, 13], UIF);
    ok(ctx.measureText(t).width <= mw + 0.5 && t.endsWith('…'), `放不下没截短：${mw} ${t}`);
  }
  eq(fitLine('打中 -12', 300, '500', [15, 13], UIF), '打中 -12', '放得下就不动');
  const keepSeal = drawSeal, keepPanel = paperPanel, keepBeat = Sound.beat, keepCb = Drill.onPass, keepPasses = Drill.passes, order = [], gongs = [];
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
    // 过关：不往场地里盖「过关」（那里正好被面板挡住），改成盖在面板上；敲一声「锵」（2.4 以前是锣「仓」）
    Sound.beat = (k, p) => gongs.push(k);
    Drill.start('jab.armor', false); Drill.onPass = () => {};
    game.brains[0] = new DrillDemo(F1, Drill.cur.def);
    for (let i = 0; i < 3000 && !Drill.cur.passed; i++) step([0, 0]);
    ok(Drill.cur.passed, '没过关');
    ok(!FX.some(x => x.type === 'stamp' && x.text === '过关'), '「过关」不该盖在场地里');
    ok(gongs.includes('锵'), '过关要敲一声锵：' + gongs);
    order.length = 0; render();
    ok(order.filter(x => x === 'seal').length >= 1 && order.indexOf('seal') > order.indexOf('panel'), '「过关」印章要盖在面板上：' + order.join(','));
  } finally {
    drawSeal = keepSeal; paperPanel = keepPanel; Sound.beat = keepBeat; Drill.onPass = keepCb; Drill.passes = keepPasses;
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

/* ---------- 2.4 小项 ---------- */
T('2.4 跳起来出的招名字里不带「空中」（Jack）：招名、破招练习的题目、打中时飘的字都没有', () => {
  for (const n in MOVES) for (const k of ['label', 'stamp', 'tag']) ok(!/空中/.test(MOVES[n][k] || ''), `${n}.${k}：${MOVES[n][k]}`);
  for (const t of DRILL_TOPICS) ok(!/空中/.test(t[1]), '破招练习：' + t[1]);
  eq(MOVES.airJab.label, '挥拳');
  for (const n of ['airJab', 'airHeavy', 'airKick', 'dive']) {
    const seen = [], push = FX.push;
    FX.push = function (...a) { for (const o of a) if (o.type === 'tag') seen.push(o.text); return push.apply(this, a); };
    try { simulateMove(n); } finally { FX.push = push; }
    ok(seen.some(t => /^-\d/.test(t)), `${n} 打中要飘伤害：${seen}`);
    ok(!seen.some(t => /空中/.test(t)), `${n} 飘的字：${seen}`);
  }
});

/* ---------- 2.4：冲刺可以设成「双击方向」或者「冲刺键」 ---------- */
T('2.4 冲刺键（Jack：冲刺可以设成双击 A / D，也可以单按一个键）：选了冲刺键 —— 按一下往按着的方向冲、不按方向往前冲，按着挡按 = 闪身；双击方向只是走路', () => {
  eq([TAP('dash'), DASH_KEY], [1 << 10, 1 << 11], '输入的位');
  ok((TAP('dash') | DASH_KEY | 0x3ff) <= 0xffff, '联机一帧 16 位放得下');
  ok((HELD_MASK & DASH_KEY) && !(HELD_MASK & TAP('dash')), '联机猜输入：「用冲刺键」那一位跟着猜，冲刺键本身不猜');
  const K = DASH_KEY;
  // 双击方向：选了冲刺键就不冲
  arena(300); tick(K | RIGHT); tick(K); tick(K | RIGHT); tick(K | RIGHT, 0, 3);
  ok(!(F1.move && F1.move.name === 'dash'), '选了冲刺键，双击方向不该冲出去');
  // 冲刺键 + 按着方向：往那边冲
  arena(300); tick(K | LEFT | TAP('dash')); tick(K | LEFT, 0, 2);
  ok(F1.move && F1.move.name === 'dash' && F1.facing === -1, '按着左按冲刺键 = 往左冲');
  // 冲刺键、没按方向：往前（面朝对手）冲
  arena(300); tick(K | TAP('dash')); tick(K, 0, 2);
  ok(F1.move && F1.move.name === 'dash' && F1.facing === 1, '不按方向 = 往前冲');
  // 按着挡 + 冲刺键 = 闪身
  arena(120); tick(K | BLOCK, 0, 3); tick(K | BLOCK | TAP('dash')); tick(K | BLOCK, 0, 2);
  ok(F1.move && F1.move.name === 'slip', '按着挡按冲刺键 = 闪身：' + (F1.move && F1.move.name));
  // 没选冲刺键：双击照样冲；冲刺键（触屏的「冲」）也能用
  arena(300); tick(RIGHT); tick(0); tick(RIGHT); tick(RIGHT, 0, 3);
  ok(F1.move && F1.move.name === 'dash', '双击方向照样冲');
  arena(300); tick(TAP('dash')); tick(0, 0, 2);
  ok(F1.move && F1.move.name === 'dash', '触屏的「冲」按钮（没选冲刺键）也能冲');
});
T('2.4 冲刺键的键位：每套各选各的，默认双击（和以前一样）；选了双击，冲刺键那一行不算缺键、不算冲突；2.3 存的键位读进来补上默认的冲刺键', () => {
  for (const d of [DEFAULT_KEYS, DEFAULT_KEYS2]) { const k = cloneKeys(d); eq(k.dashMode, 'tap'); ok(k.dash[0], '默认冲刺键'); }
  eq(DEFAULT_KEYS.dash[0], 'ShiftLeft'); eq(DEFAULT_KEYS2.dash, ['ShiftRight', 'Numpad0']);
  const k = cloneKeys(DEFAULT_KEYS); k.dash = [null, null];
  eq(keyProblems(k).missing, [], '选了双击：冲刺键没键也不算缺');
  k.dashMode = 'key'; eq(keyProblems(k).missing, ['dash'], '选了冲刺键：要有键');
  const k2 = cloneKeys(DEFAULT_KEYS); k2.dash = ['KeyF', null];
  eq(keyProblems(k2).dup.length, 0, '双击时冲刺键和拳一个键也不算冲突（冲刺键不用）');
  k2.dashMode = 'key'; ok(keyProblems(k2).dup.length > 0, '选了冲刺键就算冲突');
  ok(!keyMapOf(cloneKeys(DEFAULT_KEYS)).ShiftLeft, '双击时冲刺键不进键位表');
  const kk = cloneKeys(DEFAULT_KEYS); kk.dashMode = 'key'; eq(keyMapOf(kk).ShiftLeft, 'dash');
  // 2.3 存的：没有冲刺这一行、没有 dashMode
  const old = {}; for (const [a] of ACTIONS) if (a !== 'dash') old[a] = DEFAULT_KEYS[a].slice();
  const st = { 'modou.keys': JSON.stringify(old), 'modou.keys2': JSON.stringify(Object.fromEntries(Object.entries(old).map(([a]) => [a, DEFAULT_KEYS2[a]]))) };
  const keep = { solo: Keys.solo, p1: Keys.p1, p2: Keys.p2 };
  try {
    Keys.load(key => st[key] || null);
    eq(Keys.solo.dash, ['ShiftLeft', null]); eq(Keys.solo.dashMode, 'tap'); eq(Keys.p2.dash, ['ShiftRight', 'Numpad0']);
    // 这一局用哪套：双人看双人那两套，别的看单人
    Keys.solo.dashMode = 'key';
    ok(Keys.keyDash(0, 'pve') && Keys.keyDash(0, 'online') && !Keys.keyDash(0, 'pvp'), '单人那套');
    Keys.p2.dashMode = 'key'; ok(Keys.keyDash(1, 'pvp') && !Keys.keyDash(0, 'pvp'), '双人那两套');
    const pd = new Pad(); pd.keyDash = () => true; ok(pd.sample() & DASH_KEY, 'Pad 带上「用冲刺键」');
  } finally { Object.assign(Keys, keep); Keys.rebuild(); }
});
T('2.4 冲刺键：教程、破招练习里「双击 [前]」跟着写成「按 [冲]」（显示你的冲刺键）', () => {
  const k = cloneKeys(DEFAULT_KEYS);
  ok(/双击/.test(gText('双击 [前]（或 [后]）', k)), '双击模式照旧');
  k.dashMode = 'key';
  const h = gText('双击 [前]（或 [后]）', k);
  ok(!/双击/.test(h) && /<b>冲<\/b><span>左 Shift<\/span>/.test(h), '冲刺键模式：' + h);
  ok(!/双击/.test(gText('按住 [挡]，朝对手双击 [前]', k)), '闪身也改');
  ok(/冲刺键/.test(dashWords('双击方向冲进来，冲刺里出招带冲势', k)), '破招练习的题目也改');
});

/* ---------- 2.4：新人物模型（body.js）—— 比例、打中时拳脚碰到人、关节不透明、前后分得清 ---------- */
T('2.4 人物比例像真人：头比以前小（半径 13 → 12），站着 6 ~ 7 个头高；腿占身高一半左右；正面看肩背比胯宽', () => {
  ok(BONE.head < 13 && BONE.head >= 11, '头半径 ' + BONE.head);
  arena(400); copyPose(F1.disp, POSE.stance); F1.J = null; F1.fk();
  let top = 1e9; for (const q of bodyParts(F1.J, 0).parts) for (const [, y] of q.pts) top = Math.min(top, y);
  const h = FLOOR - top, heads = h / (BONE.head * 2);
  ok(heads >= 6 && heads <= 7.2, `身高 ${h.toFixed(0)} = ${heads.toFixed(2)} 个头`);
  const B = BODY.bone, leg = B.th + B.sh + B.ankle;
  ok(leg / (B.torso + B.neck + B.head * 2 + leg) > 0.47, '腿长占身高的一半左右');
  ok(Math.max(...BODY.torso.map(r => r[3])) > BODY.torso[0][3] + 4, '正面看：肩背比胯宽');
  // 2.5.1（Jack：大腿短一点、小腿长一点）：以前这里要求大腿比小腿长；现在照 Jack 说的，大腿比 2.5（39）短、小腿比 2.5（37）长
  ok(B.th < 39 && B.sh > 37, `大腿 ${B.th}、小腿 ${B.sh}：大腿要短一点、小腿长一点`);
  ok(B.ua > B.fa, '大臂比小臂长');
});
T('2.4 打中那一刻拳脚真的落在身上：每一招在最远射程打站着的人，判定第一帧拳、脚、肘、肩离对方身子 -12 ~ +1 像素（不隔空打中、也不整只没进去）', () => {
  const rows = contactAll(), bad = rows.filter(r => !r.ok);
  ok(rows.length >= 30, '量了 ' + rows.length + ' 招');
  ok(!bad.length, bad.map(r => `${MOVES[r.n].label}（${r.n}）${r.hit ? (r.gap > 0 ? '还差 ' : '扎进去 ') + Math.abs(r.gap) : '没打中'}`).join('；'));
});
T('2.4 离得近也不穿过去：贴身出拳、出腿，拳脚停在对方身上（最多过了他迎面那一层 CONTACT_SINK + 1），头和身子也不扎进对方身子里', () => {
  const bad = [];
  for (const [n, d] of [['jab', 50], ['jab2', 50], ['jab3', 50], ['lowJab', 50], ['elbow', 48], ['heavy', 56], ['beng', 60], ['chop', 56], ['upper', 50], ['stepPunch', 60],
    ['kick', 60], ['whip', 60], ['backKick', 60], ['sweep', 56]]) {
    const fr = simulateMove(n, { dist: d }), c = contactOf(fr, n);
    if (!c || !c.hit) { bad.push(n + ' 没打中'); continue; }
    if (c.pen > CONTACT_SINK + 1) bad.push(`${MOVES[n].label} 离 ${d}：过了 ${c.pen.toFixed(1)}`);
    const f = fr[c.frame], core = bodyParts(f.J1, 0).parts.filter(q => q.k === 'torso' || q.k === 'head').map(q => q.pts);
    const bp = bodyPen(core, f.J2, f.J1.facing, true); if (bp > 4) bad.push(`${MOVES[n].label} 离 ${d}：身子扎进去 ${bp.toFixed(1)}`);
  }
  ok(!bad.length, bad.join('；'));
});
T('2.4 拳脚停在身上只是画面：贴身打和远远打，规则上一模一样（伤害、硬直、打中的帧）', () => {
  const runIt = fit => {
    const keep = Fighter.prototype.fitContact; if (!fit) Fighter.prototype.fitContact = () => {};
    try { arena(52); const log = []; for (let i = 0; i < 40; i++) { step([i === 0 ? TAP('heavy') : 0, 0]); log.push([F2.hp, F2.state, F2.stunT, +F1.x.toFixed(3), +F2.x.toFixed(3)]); } return log; }
    finally { Fighter.prototype.fitContact = keep; }
  };
  eq(runIt(true), runIt(false));
});
T('2.4 关节、重叠的地方不半透明：人整块不透明地画（以前一节一节半透明的线叠起来，关节一块深一块浅）', () => {
  arena(400);
  const W2 = 260, H2 = 300, cv = document.createElement('canvas'); cv.width = W2; cv.height = H2; const g = cv.getContext('2d');
  for (const [nm, pose] of [['站姿', POSE.stance], ['短拳', mk(P_JAB)], ['重拳', mk(P_HEAVY)], ['腿踢', mk(P_KICK)], ['扫堂腿', evalKeys(MOVES.sweep.keys, MOVES.sweep.S + 1)], ['蹲', POSE.crouch]]) {
    for (const col of ['ink', 'indigo']) {
      F1.setLook(col); copyPose(F1.disp, pose); F1.J = null; F1.ikS = null; F1.fk();
      const J = F1.J, ox = Math.round(J.hip[0]) - 130, oy = FLOOR - 280;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W2, H2);
      withCtx(g, () => { ctx.setTransform(1, 0, 0, 1, -ox, -oy); drawBody(J, F1.color, F1.sash); ctx.setTransform(1, 0, 0, 1, 0, 0); });
      const px = g.getImageData(0, 0, W2, H2).data, A = (x, y) => px[((Math.round(y) - oy) * W2 + Math.round(x) - ox) * 4 + 3];
      for (const k of ['fe', 'be', 'fk', 'bk', 'hip', 'neck', 'sh', 'fh', 'bh']) eq(A(J[k][0], J[k][1]), 255, `${nm}（${col}）：${k} 那里不透明`);
      // 身子里面（四周都是人）不能有半透明的点；只有外沿抗锯齿那一圈是半透明的
      let semi = 0;
      for (let y = 1; y < H2 - 1; y++) for (let x = 1; x < W2 - 1; x++) {
        const a = px[(y * W2 + x) * 4 + 3]; if (a === 0 || a === 255) continue;
        let inner = true; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) if (px[((y + dy) * W2 + x + dx) * 4 + 3] !== 255) { inner = false; break; }
        if (inner) semi++;
      }
      ok(semi === 0, `${nm}（${col}）：身子里面有 ${semi} 个半透明的点`);
    }
  }
  F1.setLook(Looks.pvp[0]);
});
T('2.5 一个连贯的整体的人（Jack：不能看出是一块块拼起来的）：远侧的手脚和身子一个颜色，关节上不画线、不打阴影，亮边淡、少，只在侧面；近侧的胳膊叠在身上外沿有一道淡亮线（前后分得清）', () => {
  for (const p of PALETTE) {
    const d = cdist(bodyTones(p.color).hl, p.color);
    ok(d >= 8 && d <= 40, `${p.name}：亮边和本色差 ${d.toFixed(0)}（要看得出、但不扎眼）`);
  }
  // 远侧 / 近侧：站着时前手、后腿在远侧，后手、前腿在近侧；转过身来两边对调
  arena(400); copyPose(F1.disp, POSE.stance); F1.J = null; F1.fk();
  const far = J => bodyParts(J, 0).parts.filter(q => q.far).map(q => q.k).join(',');
  eq(far(F1.J), 'aFU,aFL,aFH,BU,BL,BF');
  F1.disp.spin = 180; F1.fk(); eq(far(F1.J), 'aBU,aBL,aBH,FU,FL,FF');
  // 画出来量：几个姿势、两种颜色
  const K = 3, W2 = 300 * K / 2, H2 = 320 * K / 2, cv = document.createElement('canvas'); cv.width = W2; cv.height = H2; const g = cv.getContext('2d');
  for (const [nm, pose] of [['站姿', POSE.stance], ['短拳', mk(P_JAB)], ['重拳', mk(P_HEAVY)], ['蹲', POSE.crouch]]) {
    for (const col of ['ink', 'indigo']) {
      F1.setLook(col); copyPose(F1.disp, pose); F1.J = null; F1.ikS = null; F1.fk();
      const J = F1.J, T2 = bodyTones(F1.color), ox = J.hip[0] - 50, oy = FLOOR - 160;
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.paper; g.fillRect(0, 0, W2, H2);
      withCtx(g, () => { ctx.setTransform(K, 0, 0, K, -ox * K, -oy * K); ctx.fillStyle = F1.color; ctx.fill(bodySilhouette(J, 0)); drawBody(J, F1.color, F1.sash); ctx.setTransform(1, 0, 0, 1, 0, 0); });
      const px = g.getImageData(0, 0, W2, H2).data, at = (x, y) => { const i = ((Math.round((y - oy) * K)) * W2 + Math.round((x - ox) * K)) * 4; return '#' + [px[i], px[i + 1], px[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''); };
      // 肘、膝（关节）那里、远侧那只手的小臂中间：都是本色 —— 关节不画折痕、不打阴影；远侧不换色调
      for (const k of ['fe', 'be', 'fk', 'bk']) ok(cdist(at(J[k][0], J[k][1]), F1.color) < 4, `${nm}（${col}）：${k} 关节上有东西 ${at(J[k][0], J[k][1])}`);
      const fa = J.turned ? ['be', 'bh'] : ['fe', 'fh'], mid = [(J[fa[0]][0] * 0.4 + J[fa[1]][0] * 0.6), (J[fa[0]][1] * 0.4 + J[fa[1]][1] * 0.6)];
      ok(cdist(at(mid[0], mid[1]), F1.color) < 4, `${nm}（${col}）：远侧的小臂中间不是本色 ${at(mid[0], mid[1])}`);
      // 亮色只占人身上一小部分（有，但少）：剪影里面（不算头带、腰带、眼睛）亮色的点
      const base = rgbOf(F1.color), hl = rgbOf(T2.hl);
      let n = 0, lit = 0;
      for (let y = 0; y < H2; y += 2) for (let x = 0; x < W2; x += 2) {
        const i = (y * W2 + x) * 4, c = [px[i], px[i + 1], px[i + 2]];
        const dB = Math.hypot(c[0] - base[0], c[1] - base[1], c[2] - base[2]), dH = Math.hypot(c[0] - hl[0], c[1] - hl[1], c[2] - hl[2]);
        if (Math.min(dB, dH) > 6) continue;                 // 不是身子的颜色（纸、头带、腰带、眼睛）
        n++; if (dH < dB) lit++;
      }
      const r = lit / n;
      ok(r > 0.01 && r < 0.16, `${nm}（${col}）：亮色占 ${(r * 100).toFixed(1)}%（要有一点、但很少）`);
    }
  }
  // 近侧的胳膊叠在胸口上：外沿有一道亮线（参考图里护着下巴那只手）—— 躯干里面（离躯干外沿 3 以上）有亮色的点
  F1.setLook('ink'); copyPose(F1.disp, POSE.stance); F1.J = null; F1.ikS = null; F1.fk();
  {
    const J = F1.J, ox = J.hip[0] - 50, oy = FLOOR - 160;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.paper; g.fillRect(0, 0, W2, H2);
    withCtx(g, () => { ctx.setTransform(K, 0, 0, K, -ox * K, -oy * K); ctx.fillStyle = F1.color; ctx.fill(bodySilhouette(J, 0)); drawBody(J, F1.color, F1.sash); ctx.setTransform(1, 0, 0, 1, 0, 0); });
    const px = g.getImageData(0, 0, W2, H2).data, hl = rgbOf(bodyTones(F1.color).hl), base = rgbOf(F1.color);
    const torso = bodyParts(J, -3).parts.find(q => q.k === 'torso').pts, tp = new Path2D(); tp.moveTo(torso[0][0], torso[0][1]); for (const q of torso) tp.lineTo(q[0], q[1]); tp.closePath();
    let lit = 0;
    g.setTransform(K, 0, 0, K, -ox * K, -oy * K);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (!g.isPointInPath(tp, x, y)) continue;
      const i = (y * W2 + x) * 4, c = [px[i], px[i + 1], px[i + 2]];
      if (Math.hypot(c[0] - hl[0], c[1] - hl[1], c[2] - hl[2]) < Math.hypot(c[0] - base[0], c[1] - base[1], c[2] - base[2])) lit++;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    ok(lit > 40 * K, '护着下巴那只手叠在胸口上要有一道淡亮线：' + lit);
  }
  F1.setLook(Looks.pvp[0]);
});
T('2.5 关节靠肢体本身的粗细看得出来（Jack）：大腿根粗、到膝盖收细、小腿肚鼓、脚踝再收；大臂到肘收细 —— 关节上不靠画线', () => {
  const w = (P, t) => profAt(P, t, 1) + profAt(P, t, 2), maxW = (P, a, b) => { let m = 0; for (let t = a; t <= b + 1e-9; t += 0.02) m = Math.max(m, w(P, t)); return m; };
  const thighTop = w(BODY.th, 0), knee = Math.min(w(BODY.th, 1), w(BODY.sh, 0)), calf = maxW(BODY.sh, 0.1, 0.6), ankle = w(BODY.sh, 1);
  ok(thighTop > knee + 3, `大腿根 ${thighTop.toFixed(1)} 要比膝盖 ${knee.toFixed(1)} 粗`);
  ok(calf > knee + 0.8 && calf > ankle + 1.5, `小腿肚 ${calf.toFixed(1)} 要鼓出来（膝盖 ${knee.toFixed(1)}、脚踝 ${ankle.toFixed(1)}）`);
  ok(w(BODY.ua, 0) > w(BODY.ua, 1) + 1.5, '大臂到肘收细');
  // 侧面看躯干是一根稍有弧度的柱子（参考图第二张）：最粗的地方不超过腰的 1.35 倍（2.4 的大胸肌、大屁股去掉了）
  const tw2 = t => profAt(BODY.torso, t, 1) + profAt(BODY.torso, t, 2), waist = tw2(0.27);
  let chest = 0; for (let t = 0.4; t <= 0.95; t += 0.01) chest = Math.max(chest, tw2(t));
  ok(chest / waist < 1.35 && chest > waist + 2, `胸 ${chest.toFixed(1)} / 腰 ${waist.toFixed(1)}`);
});
T('2.5 拳头改小（Jack）：比 2.4（13.2 × 11.6）小一圈，比头小得多', () => {
  ok(BODY.fist.len <= 13.2 * 0.85 && BODY.fist.h <= 11.6 * 0.85, `拳头 ${BODY.fist.len} × ${BODY.fist.h}`);
  ok(BODY.fist.len < BONE.head * 2 * 0.5, '拳头不到头的一半');
});
T('2.5 扫堂腿（Jack：后面那条腿不是往后，是往侧面 —— z 轴）：蹲着的后腿膝盖、脚尖朝侧面，侧面看是髋底下缩短的一截，不往身后支出去；前腿照旧贴地伸直扫出去', () => {
  const d = MOVES.sweep, fr = simulateMove('sweep', { def: 'none' });
  const act = fr.filter(f => f.mv && f.mv.name === 'sweep' && f.mv.t >= d.S && f.mv.t <= d.S + d.A);
  ok(act.length > 0, '有判定帧');
  for (const f of act) {
    const J = f.J1, fw = J.facing, back = (J.hipB[0] - J.bk[0]) * fw, thigh = Math.hypot(J.bk[0] - J.hipB[0], J.bk[1] - J.hipB[1]);
    ok(back < 6, `后膝往身后支出去了 ${back.toFixed(1)}`);
    ok(thigh < BONE.th * 0.6, `后腿大腿侧面看没缩短（${thigh.toFixed(1)} / ${BONE.th}）：膝盖没朝侧面`);
    ok(J.byaw > 60, '后脚尖要跟着朝侧面');
    let x0 = 1e9, x1 = -1e9; for (const [x] of bodyParts(J, 0).parts.find(q => q.k === 'BF').pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    ok(x1 - x0 < (BODY.foot.heel + BODY.foot.toe) * 0.6, `后脚侧面看要变短（脚尖朝侧面）：${(x1 - x0).toFixed(1)}`);
    ok((J.ff[0] - J.hip[0]) * fw > 50 && FLOOR - J.ff[1] < 14, '前腿贴地伸出去');
  }
  // 站着、别的招：膝盖不往侧面摆（只有扫堂腿蹲着那条腿摆）
  for (const k in POSE) ok(!POSE[k].fo && !POSE[k].bo, '姿势 ' + k + ' 不该摆膝盖');
});
T('2.4 膝盖往前弯（像真人）：所有姿势、所有招的关键帧，弯着的膝盖都在髋到脚踝那条线的前面（fn / bn = -1 的往后；2.5 扫堂腿蹲着那条腿改成膝盖朝侧面 bo）', () => {
  arena(400); const F = F1, bad = [];
  const check = (nm, pose) => {
    if (Math.abs(wrapDeg(pose.spin)) > 50 || Math.abs(pose.rot) > 35) return;
    copyPose(F.disp, pose); F.J = null; F.ikS = null; F.fk();
    const J = F.J, f = F.facing;
    for (const [hip, knee, ank, kd, side] of [[J.hipF, J.fk, J.ff, pose.fn, '前'], [J.hipB, J.bk, J.bf, pose.bn, '后']]) {
      const ax = (ank[0] - hip[0]) * f, ay = ank[1] - hip[1], kx = (knee[0] - hip[0]) * f, ky = knee[1] - hip[1], L = Math.hypot(ax, ay) || 1;
      const off = -(ax * ky - ay * kx) / L;                 // 膝盖在髋→脚踝那条线的哪边（正 = 往前）
      if (Math.abs(off) < 1.5) continue;                     // 差不多伸直的不算
      if ((kd === undefined ? 1 : kd) * off < 0) bad.push(`${nm} ${side}膝往${off > 0 ? '前' : '后'}`);
    }
  };
  for (const k in POSE) check('姿势 ' + k, POSE[k]);
  for (const n in MOVES) MOVES[n].keys.forEach(([t, pose], i) => check(`${MOVES[n].label}（${n}）第 ${i} 帧`, pose));
  ok(!bad.length, bad.slice(0, 12).join('；') + (bad.length > 12 ? ` …共 ${bad.length}` : ''));
});

/* ---------- 2.5.1（Jack 提的 8 条） ---------- */
// 量人身上的东西用的几个姿势：站、跑（腿往前、往后甩）、跳、蹲、下盘拳、腿踢、重拳
const seatPoses = () => {
  const out = [['站姿', POSE.stance], ['蹲', POSE.crouch], ['跳', P_JTOP], ['腿踢', mk(P_KICK)], ['重拳', mk(P_HEAVY)]].map(([n, p]) => [n, mk(p)]);
  for (const [n, d, t] of [['下盘拳', MOVES.lowJab, 1.1], ['扫堂腿', MOVES.sweep, 1.2], ['二起脚', MOVES.twinKick, 1.2]]) out.push([n, evalKeys(d.keys, d.S * Math.min(1, t) + (t > 1 ? (t - 1) * d.A : 0))]);
  return out;
};
const poseJ = pose => { arena(400); copyPose(F1.disp, pose); F1.J = null; F1.ikS = null; F1.fk(); return F1.J; };
T('2.5.1 腰带底下是一整块（Jack：屁股像没穿裤子、有两瓣；腰带那儿穿模）：大腿根不从腰带后面露出来；裆上不打亮边、不出线；躯干不再自己圆出一个屁股', () => {
  const bad = [];
  const inPoly = (x, y, pts) => pointInPoly(x, y, pts) || distToPoly(x, y, pts) < 0.6;
  for (const [nm, pose] of seatPoses()) {
    const J = poseJ(pose), parts = bodyParts(J, 0).parts, tor = parts.find(p => p.k === 'torso'), seat = parts.find(p => p.k === 'seat');
    if (!seat) { bad.push(nm + ' 没有裆'); continue; }
    // 大腿上、腰带下沿以上那一截（以前平头伸进胯里，腿一抬就从腰带后面露出来）：都在躯干或裆里面
    const sx = J.neck[0] - J.hip[0], sy = J.neck[1] - J.hip[1], sl = Math.hypot(sx, sy), tb = (BODY.belt.at - BODY.belt.h / 2 / BODY.bone.torso) * BODY.bone.torso;
    const r0 = (BODY.th[0][1] + BODY.th[0][2]) / 2;
    for (const k of ['FU', 'BU']) for (const [x, y] of parts.find(p => p.k === k).pts) {
      const R = k === 'FU' ? J.hipF : J.hipB;
      if (Math.hypot(x - R[0], y - R[1]) > r0 + 3) continue;              // 只看大腿根那一圈（往膝盖去的那截本来就在外面）
      const up = ((x - J.hip[0]) * sx + (y - J.hip[1]) * sy) / sl;          // 顺着脊柱往上多远
      if (up > tb - 0.5 && !inPoly(x, y, tor.pts) && !inPoly(x, y, seat.pts)) { bad.push(`${nm}：${k} 从腰带后面露出来（${up.toFixed(1)}）`); break; }
    }
    // 躯干只到髋下面一点（不再圆出屁股）
    let low = 1e9; for (const [x, y] of tor.pts) low = Math.min(low, ((x - J.hip[0]) * sx + (y - J.hip[1]) * sy) / sl);
    if (low < -0.12 * BODY.bone.torso) bad.push(`${nm}：躯干往髋下面伸了 ${(-low).toFixed(1)}`);
  }
  // 画出来量：裆里面（往里收 2）没有亮色的点 —— 屁股那道弧、两腿中间从腰带底下弯下来那道弧都没了
  const K = 3, W2 = 240 * K / 2, H2 = 240 * K / 2, cv = document.createElement('canvas'); cv.width = W2; cv.height = H2; const g = cv.getContext('2d');
  for (const [nm, pose] of seatPoses()) for (const col of ['ink', 'indigo']) {
    F1.setLook(col); const J = poseJ(pose), ox = J.hip[0] - 40, oy = J.hip[1] - 40, T2 = bodyTones(F1.color);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.paper; g.fillRect(0, 0, W2, H2);
    withCtx(g, () => { ctx.setTransform(K, 0, 0, K, -ox * K, -oy * K); ctx.fillStyle = F1.color; ctx.fill(bodySilhouette(J, 0)); drawBody(J, F1.color, F1.sash); ctx.setTransform(1, 0, 0, 1, 0, 0); });
    const seat = bodyParts(J, -2).parts.find(p => p.k === 'seat'), sp = new Path2D(); sp.moveTo(seat.pts[0][0], seat.pts[0][1]); for (const q of seat.pts) sp.lineTo(q[0], q[1]); sp.closePath();
    // 腰带盖住的（颜色不是身子的）、近侧那只手挡在上面的（手自己的亮边、描线）不算
    const arm = new Path2D(); for (const q of bodyParts(J, 1.5).parts.filter(q => q.layer === 'nearArm')) addPoly(arm, q.pts);
    const px = g.getImageData(0, 0, W2, H2).data, base = rgbOf(F1.color), hl = rgbOf(T2.hl);
    let lit = 0;
    g.setTransform(K, 0, 0, K, -ox * K, -oy * K);
    for (let y = 0; y < H2; y += 1) for (let x = 0; x < W2; x += 1) {
      if (!g.isPointInPath(sp, x, y) || g.isPointInPath(arm, x, y)) continue;
      const i = (y * W2 + x) * 4, c = [px[i], px[i + 1], px[i + 2]];
      const dB = Math.hypot(c[0] - base[0], c[1] - base[1], c[2] - base[2]), dH = Math.hypot(c[0] - hl[0], c[1] - hl[1], c[2] - hl[2]);
      if (dH < dB && dH < 6) lit++;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (lit > 5 * K) bad.push(`${nm}（${col}）：裆上有 ${lit} 个亮色的点`);   // 几块拼起来的地方抗锯齿会留一两个像素（看不见）；以前那两道弧是几百个
  }
  F1.setLook(Looks.pvp[0]);
  ok(!bad.length, bad.slice(0, 10).join('；'));
});
T('2.5.1 脚小一点、薄一点，人一样高（Jack：高在别的地方一点点）；大腿短一点、小腿长一点；腿上有一点点肌肉（小腿肚鼓、收到跟腱，大腿前面微微鼓）', () => {
  const Fo = BODY.foot;
  ok(Fo.heel + Fo.toe <= 24.8 * 0.9 && Fo.h <= 11.6 * 0.85, `鞋 ${Fo.heel + Fo.toe} × ${Fo.h}（2.5 是 24.8 × 11.6）`);
  ok(BODY.bone.ankle < 4.8, '鞋底薄了');
  // 站着一样高（2.5 量的 146.45）：鞋底薄下来的那点给了腿
  const J = poseJ(POSE.stance); let top = 1e9; for (const q of bodyParts(J, 0).parts) for (const [, y] of q.pts) top = Math.min(top, y);
  ok(Math.abs(FLOOR - top - 146.45) < 0.6, '站着的身高变了：' + (FLOOR - top).toFixed(2));
  for (const k of ['ff', 'bf']) ok(Math.abs(FLOOR - BODY.bone.ankle - J[k][1]) < 0.6, k + ' 还踩在地上');
  ok(BODY.bone.th + BODY.bone.sh >= 76, '腿不比以前短');
  const w = (P, t, k) => profAt(P, t, k), calf = Math.max(...[0.2, 0.25, 0.3, 0.35].map(t => w(BODY.sh, t, 2)));
  ok(calf - w(BODY.sh, 0.88, 2) > 2.2, '小腿肚鼓出来、往下收到跟腱');
  ok(w(BODY.th, 0.5, 1) > (w(BODY.th, 0, 1) + w(BODY.th, 1, 1)) / 2 + 0.6, '大腿前面中段微微鼓（股四头肌）');
  ok(calf - w(BODY.sh, 0, 2) < 2.5 && w(BODY.th, 0.5, 1) - w(BODY.th, 1, 1) < 2.5, '肌肉别太多');
});
T('2.5.1 腿踢平移少一点、支撑腿不扭（Jack：踢的时候人往前平移太多，平移完腿扭得厉害）：髋往前送少了、支撑脚滑得少了（一来一回），出腿时支撑腿差不多直着斜撑在身后', () => {
  const fr = simulateMove('kick', { def: 'none' }), f0 = fr[0], fw = f0.J1.facing, act = fr.find(f => f.mv && f.mv.name === 'kick' && f.mv.act);
  const bfx = fr.map(f => f.J1.bf[0] * fw), hip = (act.J1.hip[0] - f0.J1.hip[0]) * fw;
  ok(hip < 40, '出腿那一刻髋往前送了 ' + hip.toFixed(1) + '（2.5 是 42）');
  ok(Math.max(...bfx) - bfx[0] < 45, '支撑脚往前滑了 ' + (Math.max(...bfx) - bfx[0]).toFixed(1) + '（2.5 是 60）');
  ok(Math.max(...bfx) - bfx[bfx.length - 1] < 33, '收腿时支撑脚往回滑了 ' + (Math.max(...bfx) - bfx[bfx.length - 1]).toFixed(1) + '（2.5 是 48）');
  for (const f of fr.filter(f => f.mv && f.mv.name === 'kick' && f.mv.t >= f.mv.S && f.mv.t <= f.mv.S + f.mv.A)) {
    const J = f.J1, ax = (J.bf[0] - J.hipB[0]) * fw, ay = J.bf[1] - J.hipB[1], kx = (J.bk[0] - J.hipB[0]) * fw, ky = J.bk[1] - J.hipB[1];
    const off = -(ax * ky - ay * kx) / Math.hypot(ax, ay);
    ok(off < 10, '出腿时支撑腿的膝盖往前拱了 ' + off.toFixed(1) + '（2.5 是 15）');
    ok(ax < -10, '支撑脚在身后斜撑着');
  }
  // 射程（规则）一点没动
  eq([MOVES.kick.reach, MOVES.kick.lunge[2]], [126, 12]);
});
T('2.5.1 按钮的声音（Jack：光标放上去全都不出声，点下去是木鱼声）：移上去那一声去掉了；按下去是木鱼（醒着就响，睡着先叫醒）', () => {
  ok(Sound.uiHover === undefined, '不该再有「移上去」的声音');
  const calls = [], keep = { muyu: Sound.muyu, zheng: Sound.zheng, init: Sound.init, ctx: Sound.ctx, on: Sound.on, vol: Sound.vol, uiT: Sound.uiT };
  try {
    Sound.muyu = function () { calls.push('muyu'); }; Sound.zheng = function () { calls.push('zheng'); };
    Sound.init = () => {}; Sound.ctx = { state: 'running' }; Sound.on = true; Sound.vol = 50; Sound.uiT = 0;
    Sound.uiPress();
    eq(calls, ['muyu'], '按钮声：木鱼（不是古筝）');
    Sound.uiPress(); eq(calls.length, 1, '一下点出两声（40 毫秒内）只响一声');
    Sound.vol = 0; Sound.uiT = 0; Sound.uiPress(); eq(calls.length, 1, '静音不响');
  } finally { Object.assign(Sound, keep); }
});
T('2.5.1 冲刺可以「两种都用」（Jack：冲刺可以选双击和单键都启用）：双击方向照样冲、冲刺键也能冲；输入里不多占位（联机两边照样对得上）', () => {
  ok(DASH_MODES.includes('both'));
  const k = cloneKeys(DEFAULT_KEYS); k.dashMode = 'both';
  eq(cloneKeys(k).dashMode, 'both', '存下来读回去还是两种都用');
  eq(cloneKeys({ dashMode: 'xx' }).dashMode, 'tap', '不认得的当双击');
  ok(liveActs(k).some(([a]) => a === 'dash') && keyMapOf(k).ShiftLeft === 'dash', '冲刺键在用');
  const k3 = cloneKeys(k); k3.dash = [null, null]; eq(keyProblems(k3).missing, ['dash'], '两种都用：冲刺键要有键');
  const keep = { solo: Keys.solo, p1: Keys.p1, p2: Keys.p2 };
  try { Keys.solo = k; ok(!Keys.keyDash(0, 'pve'), '两种都用：输入里不带「双击不冲」那一位'); } finally { Object.assign(Keys, keep); Keys.rebuild(); }
  // 真按：不带 DASH_KEY 那一位 —— 双击冲、冲刺键也冲
  arena(300); tick(RIGHT); tick(0); tick(RIGHT); tick(RIGHT, 0, 3);
  ok(F1.move && F1.move.name === 'dash', '双击方向冲');
  arena(300); tick(LEFT | TAP('dash')); tick(LEFT, 0, 2);
  ok(F1.move && F1.move.name === 'dash' && F1.facing === -1, '冲刺键往按着的方向冲');
  arena(120); tick(BLOCK, 0, 3); tick(BLOCK | TAP('dash')); tick(BLOCK, 0, 2);
  ok(F1.move && F1.move.name === 'slip', '按着挡按冲刺键 = 闪身');
  // 教程、破招练习的说法
  ok(/双击.*或按 \[冲\]/.test(dashWords('双击 [前]（或 [后]）', k)), dashWords('双击 [前]（或 [后]）', k));
  ok(/或按 \[冲\]/.test(dashWords('按住 [挡]，朝对手双击 [前]', k)), '闪身也写上冲刺键');
  ok(/双击/.test(gText('双击 [前]（或 [后]）', k)) && /左 Shift/.test(gText('双击 [前]（或 [后]）', k)), '教程里两样都显示');
});
// ---------- 2.6 ----------
T('2.6 时间（Jack：帧逻辑别和帧率绑在一起）：逻辑一秒 240 步（一帧 4 步）、和屏幕刷新率无关；前摇、判定、后摇都按 1/4 帧算；整帧的时候跳、击退和以前一样远', () => {
  eq([SIM_HZ, SUB, DT, Math.round(STEP_MS * SIM_HZ)], [240, 4, 0.25, 1000]);
  arena(200); const f0 = game.frame; step([0, 0]); eq(game.frame - f0, SUB, 'step() 一次走一帧 = SUB 步');
  for (const [k, d] of Object.entries(MOVES)) for (const key of ['S', 'A', 'R']) { const v = d[key] || 0; ok(Math.abs(v * SUB - Math.round(v * SUB)) < 1e-9, `${k}.${key} = ${v} 不在 1/4 帧的格子上`); }
  // 跳：每一步重力分开算准了，整帧时的高度和以前一帧一帧算的一模一样 —— 最高约 94、蹲 3 帧 + 空中 31 帧
  arena(300); step([TAP('up'), 0]); let top = 0, n = 0;
  while ((F1.airborne || F1.state === 'jumpsquat') && n < 80) { step([0, 0]); top = Math.max(top, F1.alt); n++; }
  ok(Math.abs(top - 93.7) < 0.5 && n === 34, `跳：最高 ${top.toFixed(1)}，${n} 帧`);
  // 击退：一步一步衰减，整帧时和以前每帧剩 82% 走得一样远
  arena(200); F2.kvx = 10; const x0 = F2.x; step([0, 0]); ok(Math.abs(F2.x - x0 - 10) < 1e-6, '击退第一帧走 10：' + (F2.x - x0));
  // 判定按步算（不是按帧）：短拳前摇 5.5 帧，走到 t = 6.5（第 S+1 帧开始那一步，帧的中间）就打中
  arena(80); step([TAP('jab'), 0]); let k = 0; while (!F1.move.hit && k++ < 40) simTick([0, 0]);
  ok(F1.move.hit && Math.abs(F1.move.t - (MOVES.jab.S + 1)) < 1e-9, '短拳打中的那一步：t = ' + F1.move.t);
});
T('2.6 前摇长 5~10%（每一招都长、平均 7~8%）；打中以后拳头多停一会儿（顿帧长了，收招先停在打出去的位置再收）', () => {
  const rs = [];
  for (const [k, d] of Object.entries(MOVES)) if (d.pre26) { const r = d.S / d.pre26.S; rs.push(r); ok(r > 1.04 && r < 1.13, `${k} 前摇 ${d.pre26.S} → ${d.S}`); ok(d.R > d.pre26.R, `${k} 后摇没变长`); }
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  ok(rs.length >= 30 && mean >= 1.06 && mean <= 1.09, '前摇平均长了 ' + ((mean - 1) * 100).toFixed(1) + '%');
  // 顿帧：2.5 短拳 3 帧、重拳 7 帧、腿踢 6 帧（数的是整帧）
  const fz = {};
  for (const [dist, mv] of [[80, 'jab'], [96, 'heavy'], [118, 'kick']]) { arena(dist); tick(TAP(mv), 0); let z = 0, n = 0; while (n++ < 80 && F1.state === 'attack') { tick(0, 0); if (game.freeze > 0) z++; } fz[mv] = z; }
  ok(fz.jab >= 4 && fz.heavy >= 9 && fz.kick >= 8, '顿帧：' + JSON.stringify(fz));
  // 收招：开头那一段（后摇的 HOLD_R）姿势停在打出去的那一下
  for (const k of ['jab', 'heavy', 'kick', 'upper', 'whirl']) {
    const d = MOVES[k], ks = d.keys, a = ks.find(q => Math.abs(q[0] - (d.S + d.A)) < 1e-9), b = ks.find(q => Math.abs(q[0] - (d.S + d.A + HOLD_R * d.R)) < 1e-9);
    ok(a && b && JSON.stringify(a[1]) === JSON.stringify(b[1]), k + ' 收招开头没停住');
  }
  // 拳头停在对方身上：短拳打中后拳头伸着的帧数（2.5 是 3 帧）
  arena(80); tick(TAP('jab'), 0); const ext = []; let hitAt = -1;
  for (let i = 0; i < 40 && F1.state === 'attack'; i++) { ext.push(F1.J.fh[0] - F1.J.neck[0]); if (hitAt < 0 && F1.move.hit) hitAt = i; tick(0, 0); }
  const mx = Math.max(...ext); let stay = 0; for (let j = Math.max(0, hitAt); j < ext.length; j++) { if (ext[j] >= mx * 0.85) stay++; else if (stay) break; }
  ok(stay >= 5, '短拳打中后拳头只停了 ' + stay + ' 帧');
});
T('2.6 伤害：每一招都略微提高；连招、高级招提得多，和普通招拉开明显差距；对面的木头玩家照样分得出五档', () => {
  // 2.5：短拳 5、重拳 12、腿踢 10；单招提一点点（≤ 20%），高级招比普通招多出至少三成
  eq([MOVES.jab.dmg, MOVES.heavy.dmg, MOVES.kick.dmg], [6, 13, 11]);
  const base = { light: MOVES.jab.dmg, heavy: MOVES.heavy.dmg, kick: MOVES.kick.dmg };
  for (const k of ['beng', 'chop', 'hammer', 'upper', 'whip', 'twinKick', 'backKick', 'whirl', 'rushEnd']) {
    const d = MOVES[k], b = base[d.lead] || base[d.kind === 'jab' ? 'light' : d.kind];
    ok(b && d.dmg >= b * 1.3, `${d.label} ${d.dmg} 和普通招 ${b} 拉不开`);
  }
  // 整套连招（2.5 的伤害）：拳拳重 23、拳拳腿 20、重腿 26、腿腿 20、腿重 23、拳重 19、重重 24 —— 2.6 至少多两成
  const old = [[80, ['jab', 'jab', 'heavy'], 23], [80, ['jab', 'jab', 'kick'], 20], [96, ['heavy', 'kick'], 26], [118, ['kick', 'kick'], 20], [118, ['kick', 'heavy'], 23], [80, ['jab', 'heavy'], 19], [96, ['heavy', 'heavy'], 24]];
  for (const [dist, acts, was] of old) { arena(dist); combo(acts); tick(0, 0, 90); ok(lost(F2) >= was * 1.2, `${acts.join('+')}：${lost(F2)}（2.5 是 ${was}）`); }
  for (const [dist, mv, was] of [[80, 'jab', 5], [96, 'heavy', 12], [118, 'kick', 10]]) { arena(dist); combo([mv]); tick(0, 0, 60); ok(lost(F2) > was && lost(F2) <= was * 1.25, `${mv} 单招 ${lost(F2)}（2.5 是 ${was}）`); }
  ok(MOVES.super.dmg > 40 && BURST_DMG > 18 && THROW_DMG > 10, '泼墨、爆气、擒拿摔也提一点');
});
T('2.6 画面（Jack）：跑步手臂别甩那么大；待机后手往前一点；飘带短一点、细一点；人物在屏幕上大一点', () => {
  ok(RUN_ARM_F < 70 * 0.8 && RUN_ARM_B < 66 * 0.8, '跑步手臂摆幅（2.5：往前 70°、往后 66°）');
  ok(POSE.stance.bh[0] > 6 && POSE.stance.bh[0] <= 13, '待机后手（2.5 在 6）：' + POSE.stance.bh[0]);
  const len = (RIB_N - 1) * RIB_SEG;
  ok(len < 45.5 * 0.95 && len > 45.5 * 0.65, '飘带长（2.5 是 45.5）：' + len.toFixed(1));   // 2.7 又短了一点（下限 0.75 → 0.65）
  ok(RIB_W < 5.4 * 0.95 && RIB_W > 5.4 * 0.65, '飘带宽（2.5 是 5.4）：' + RIB_W);
  ok(ZOOM > 1.76 && ZOOM <= 1.95, '镜头放大（2.5 是 1.76）：' + ZOOM);
  // 跑起来手臂真的摆得小：大臂从最后甩到最前的角度（2.5 是 130°）
  arena(400); let lo = 1e9, hi = -1e9;
  for (let i = 0; i < 80; i++) { step([RIGHT, 0]); if (i < 20) continue; const J = F1.J, a = Math.atan2(J.fe[0] - J.shF[0], J.fe[1] - J.shF[1]) * 180 / Math.PI * F1.facing; lo = Math.min(lo, a); hi = Math.max(hi, a); }
  ok(hi - lo < 130 * 0.85 && hi - lo > 60, '跑步时大臂从最后到最前摆了 ' + (hi - lo).toFixed(0) + '°');
});

T('2.5.1 动起来的背景（Jack）：每张图都有会动的东西、各不一样；都从左往右飘（不来回）；只用自己的随机数（不碰 Math.random、vrnd）；只在人身后，不进战斗逻辑（2.6：竹叶换掉萤火虫；2.7：燕子换成远景里的一排大雁）', () => {
  const want = { sun: ['far'], falls: ['mid'], bamboo: ['mid'], peach: ['far', 'mid'], desert: ['far', 'mid'], yard: ['mid'] };
  const cv = document.createElement('canvas'); cv.width = 2400; cv.height = 900; const g = cv.getContext('2d');
  const mr = Math.random, seed0 = vrSeed; let rcalls = 0;
  Math.random = function () { rcalls++; return mr(); };
  try {
    for (const id in want) {
      const S = STAGES[id];
      ok(S.live && want[id].every(k => typeof S.live[k] === 'function'), id + ' 要有动起来的东西：' + want[id]);
      const st = { id, t: 0 }, L = { w: 1400, h: 700, fy: 560, vis: [100, 1300] };
      // 跑 40 秒（每帧 1/60），每 5 秒画一张：前后两张不一样（真的在动）；记下所有往一边飘的东西的横向速度
      const shot = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); for (const k of want[id]) S.live[k](g, L, st, 0); return g.getImageData(0, 0, 1400, 700).data; };
      let prev = shot(), diff = 0;
      const vx = [];
      for (let i = 1; i <= 2400; i++) {
        st.t += 1 / 60; g.setTransform(1, 0, 0, 1, 0, 0); for (const k of want[id]) S.live[k](g, L, st, 1 / 60);
        for (const f of st.geese || []) vx.push(f.v);                                     // 大雁每一步都看
        if (i % 300) continue;
        const cur = shot(); for (let j = 3; j < cur.length; j += 4 * 3) if (Math.abs(cur[j] - prev[j]) > 8) diff++; prev = cur;
      }
      ok(diff > 60, id + ' 跑了 40 秒画面没怎么变：' + diff);
      for (const k of ['clouds', 'petals', 'leaves', 'wisps', 'spray']) for (const o of st[k] || []) vx.push(o.sp !== undefined ? o.sp : o.vx);
      ok(vx.every(v => v > 0), id + ' 有往左飘的：' + vx.filter(v => v <= 0).slice(0, 5));
      // 只在人身后：会动的东西都在地线以上、人头顶上面或者远处（大雁、云、花瓣、竹叶在天上；沙在中景）
      for (const f of st.geese || []) for (const m of f.m) ok(f.y + m.dy < L.fy - 300, '大雁飞得太低：' + (L.fy - f.y - m.dy).toFixed(0));
      for (const o of st.petals || []) ok(o.y < L.fy - 120, '花瓣落到人跟前了');
      for (const o of st.leaves || []) ok(o.y < L.fy - 140, '竹叶落到人跟前了');
      ok(!st.flies, id + ' 还有萤火虫');
    }
  } finally { Math.random = mr; }
  eq(rcalls, 0, '动态背景用了 Math.random');
  eq(vrSeed, seed0, '动态背景用了 vrnd（特效的随机数）');
  // 2.7 大雁（桃花园，Jack：燕子变成一排大雁，从左往右，全是扇翅膀飞、不用飘，在远处飞、飞慢一点，飞的地方和人在哪无关）：
  // 在远景那一层（不在中景）；一排五只以上；一直扇（每只的翅膀扇上扇下都到）、不飘不俯冲；一秒 20~45 像素；
  // 从哪飞进来只看这一层（镜头、人在哪都不管）：头一排一进来就在半空，后面的从这一层最左边飞进来，不从「看得见的左边」进来
  ok(typeof STAGES.peach.live.far === 'function', '大雁在远景那一层');
  const st = { id: 'peach', t: 0 }, L = { w: 1400, h: 700, fy: 560, vis: [100, 1300] };
  let seen = 0, minN = 99, vmin = 1e9, vmax = 0, kmin = 9, kmax = -9;
  const starts = [];
  for (let i = 0; i < 60 * 150; i++) {
    st.t += 1 / 60;
    L.vis = i < 60 * 40 ? [100, 1300] : [500, 1700];                  // 镜头挪了（人跑到右边去了）：大雁从哪飞进来不变
    STAGES.peach.live.far(g, L, st, 1 / 60); STAGES.peach.live.mid(g, L, st, 1 / 60);
    for (const f of st.geese) {
      if (!f.seen) { f.seen = 1; starts.push(f.x); }
      seen++; minN = Math.min(minN, f.m.length); vmin = Math.min(vmin, f.v); vmax = Math.max(vmax, f.v);
      const k = Math.sin(f.t * Math.PI * 2 / f.per + f.m[0].ph); kmin = Math.min(kmin, k); kmax = Math.max(kmax, k);
    }
  }
  ok(starts.length >= 3 && seen > 60 * 60, `大雁：飞来 ${starts.length} 排、${(seen / 60).toFixed(0)} 秒看得见`);
  ok(minN >= 5, '一排至少五只：' + minN);
  ok(vmin >= 20 && vmax <= 45, `大雁飞得慢（一秒 ${vmin.toFixed(0)} ~ ${vmax.toFixed(0)} 像素）`);
  ok(kmin < -0.95 && kmax > 0.95, '翅膀一直在扇（扇上扇下都到）');
  ok(starts[0] > L.w * 0.3 && starts.slice(1).every(x => x < 0), '头一排在半空、后面的都从这一层最左边飞进来（不跟着镜头）：' + starts.map(x => x.toFixed(0)));
  // 「减少动态效果」、暂停：dt = 0 —— 不出新的、不动
  const s2 = { id: 'peach', t: 0 }; for (let i = 0; i < 300; i++) { STAGES.peach.live.far(g, L, s2, 0); STAGES.peach.live.mid(g, L, s2, 0); }
  eq(s2.geese.length, 0, 'dt = 0 不该飞出大雁来');
  const pos = () => JSON.stringify(st.geese.map(f => [f.x, f.t]).concat(st.petals.map(p => [p.x, p.y])));
  const p0 = pos(); for (let i = 0; i < 120; i++) { STAGES.peach.live.far(g, L, st, 0); STAGES.peach.live.mid(g, L, st, 0); }
  eq(pos(), p0, 'dt = 0 大雁、花瓣都该停住');
  // 2.6 竹叶不发光、不闪（萤火虫晃眼睛）：画出来的都是暗的墨灰；40 秒里吹下来好几片
  const s3 = { id: 'bamboo', t: 0 }; let leaves = 0, bright = 0;
  for (let i = 0; i < 2400; i++) { s3.t += 1 / 60; const n0 = (s3.leaves || []).length; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 1400, 700); STAGES.bamboo.live.mid(g, L, s3, 1 / 60); leaves += Math.max(0, s3.leaves.length - n0);
    if (i % 600 === 599) { const d = g.getImageData(0, 0, 1400, 700).data; for (let j = 0; j < d.length; j += 4) if (d[j + 3] > 20 && d[j] + d[j + 1] + d[j + 2] > 200) bright++; } }
  ok(leaves >= 8, '竹叶太少：' + leaves);
  eq(bright, 0, '竹林的动态背景有亮的东西');
  // 2.6 朱日远山：太阳单独一层（视差比远景小得多）；云短了、厚了
  ok(STAGES.sun.sky && PAR_SKY <= PAR_FAR / 3, '太阳要单独一层、跟镜头挪得很少');
  const s4 = { id: 'sun', t: 0 }; for (let i = 0; i < 600; i++) { s4.t += 1 / 60; STAGES.sun.live.far(g, L, s4, 1 / 60); }
  ok(s4.clouds.every(c => c.spr.lw - 80 <= 261 && c.spr.lh - 40 >= 19 * 5), '云的长短、厚薄：' + s4.clouds.map(c => `${(c.spr.lw - 80).toFixed(0)}×${((c.spr.lh - 40) / 5).toFixed(0)}`));
  // 2.6 暂停：背景的时钟不走
  const keepP = game.paused, keepL = Stage.liveLast;
  try {
    Stage.live = Stage.live || { id: 'peach', t: 0 }; const t0 = Stage.live.t;
    game.paused = true; Stage.liveLast = performance.now() - 50;
    eq(Stage.liveStep(), 0, '暂停时背景的 dt'); eq(Stage.live.t, t0, '暂停时背景的时间不走');
  } finally { game.paused = keepP; Stage.liveLast = keepL; }
  // 只是画面：画了背景，战斗状态一模一样
  const runIt = draw => { arena(200); const log = []; for (let i = 0; i < 90; i++) { step([i === 5 ? TAP('kick') : 0, 0]); if (draw) render(); log.push(stateHash()); } return log; };
  const keepId = Stage.pref; Stage.setPref('peach');
  try { eq(runIt(true), runIt(false)); } finally { Stage.setPref(keepId); }
});

/* ---------- 2.7（Jack 提的 10 条） ---------- */
T('2.7 脚再薄一点点，薄下来的那部分给了小腿：鞋高 9.4 → 8.4、鞋底 4 → 3.3，小腿 39 → 39.7；髋到鞋底一样长、人一样高', () => {
  const B = BODY.bone, Fo = BODY.foot;
  ok(Fo.h < 9.4 && Fo.h >= 9.4 * 0.85, '鞋高（2.6 是 9.4）：' + Fo.h);
  ok(B.ankle < 4 && B.sh > 39, `鞋底 ${B.ankle}（2.6 是 4）、小腿 ${B.sh}（2.6 是 39）`);
  ok(Math.abs((B.sh - 39) - (4 - B.ankle)) < 1e-9, '鞋底薄下来多少，小腿就长多少');
  ok(Math.abs(B.th + B.sh + B.ankle - 81) < 1e-9, '髋到鞋底一样长（81）');
  const J = poseJ(POSE.stance); let top = 1e9; for (const q of bodyParts(J, 0).parts) for (const [, y] of q.pts) top = Math.min(top, y);
  ok(Math.abs(FLOOR - top - 146.45) < 0.6, '人一样高：' + (FLOOR - top).toFixed(2));
  for (const k of ['ff', 'bf']) ok(Math.abs(FLOOR - B.ankle - J[k][1]) < 0.6, k + ' 踩在地上');
});
// 翻滚回去：玩家一在场地右边一点跑跳过去出飞踢，玩家二出腿迎上去（离墙远，翻多远不被墙挡）
function tumbleRun(x1, dist, p, q, n = 200) {
  arena(dist); F1.x = x1; F2.x = x1 + dist;
  const r = { x0: null, x1: null, alt0: 0, top: 0, freeA: -1, freeB: -1, gapFree: 0, at: -1 };
  for (let i = 0; i < n; i++) {
    step([(i < 6 ? RIGHT : 0) | (i === 0 ? TAP('up') : 0) | (i === p ? TAP('kick') : 0), i === q ? TAP('kick') : 0]);
    if (F1.state === 'tumble' && r.x0 === null) { r.x0 = F1.x; r.alt0 = F1.alt; r.at = i; }
    if (r.x0 !== null) {
      r.top = Math.max(r.top, F1.alt);
      if (r.x1 === null && F1.state !== 'tumble') r.x1 = F1.x;
      if (r.freeA < 0 && r.x1 !== null && F1.actionable()) { r.freeA = i; r.gapFree = Math.abs(F2.x - F1.x); }
      if (r.freeB < 0 && F2.actionable()) r.freeB = i;
      if (r.freeA >= 0 && r.freeB >= 0) break;
    }
  }
  return r;
}
T('2.7 翻滚回去（Jack）：飞回去的距离起码是 2.6 的三倍、翻得更高；翻回去平等 —— 落地能动的那一刻对方也刚能动（对方收腿时也接不了别的招），隔着大半个场地，谁也抓不到谁的受击时间', () => {
  const old = alt => (8.4 / TEMPO) * tumbleFly(alt, 6 / TEMPO);     // 2.6 同样的高度飞多远
  let n = 0;
  for (const [p, q] of [[12, 4], [13, 5], [14, 6], [12, 8]]) {
    const r = tumbleRun(1000, 170, p, q);
    if (r.x0 === null) continue;
    n++;
    const d = r.x0 - r.x1;
    ok(d >= 3 * old(r.alt0) - 1, `撞上时离地 ${r.alt0.toFixed(0)}：飞了 ${d.toFixed(0)}，2.6 是 ${old(r.alt0).toFixed(0)}`);
    ok(r.top - r.alt0 >= 55, '翻得不够高：比撞上那一下高 ' + (r.top - r.alt0).toFixed(0));
    ok(r.freeA >= 0 && r.freeB >= 0 && Math.abs(r.freeA - r.freeB) <= 1, `两边能动的时候差 ${r.freeA - r.freeB} 帧（应该同时）`);
    ok(r.gapFree > 400, '能动的时候还隔着 ' + r.gapFree.toFixed(0));
  }
  ok(n >= 2, '没翻起来几次：' + n);
  // 靠着墙翻：撞到墙就停在墙边（飞不远），照样两边一起能动
  const w = tumbleRun(300, 170, 12, 4);
  ok(w.x0 !== null && w.x1 <= WALL_L + 1, '靠墙翻：停在墙边');
  ok(Math.abs(w.freeA - w.freeB) <= 1, `靠墙翻：两边能动的时候差 ${w.freeA - w.freeB} 帧`);
  // 地上那一腿收招里接不了别的招（不然先收完招跑过去等着打）
  const r2 = tumbleRun(1000, 170, 12, 4, 30); ok(F2.move && F2.move.tumbled && !F2.canCancel('jab') && !F2.canCancel('kick'), '顶回去那一腿还能接招');
});
T('2.7 躺在地上的时间缩短 10% 左右：普通击倒、接腿摔、倒栽葱、摔、爆气、扫堂腿、踩腿都 ×0.9', () => {
  const was = { LIE_HIT: TFH(28), LIE_GROUND: TFH(40), LIE_AIR: TFH(76), LIE_CRASH: TFH(52), BURST_LIE: TFH(28), sweep: TFH(26), stomp: TFH(30) };
  const now = { LIE_HIT, LIE_GROUND, LIE_AIR, LIE_CRASH, BURST_LIE, sweep: MOVES.sweep.lie, stomp: MOVES.stomp.lie };
  for (const k in was) { const r = now[k] / was[k]; ok(r >= 0.86 && r <= 0.94, `${k}：${was[k]} → ${now[k]}（×${r.toFixed(2)}）`); }
  // 真打一下：扫堂腿打倒以后躺的帧数
  arena(100); tick(DOWN | TAP('kick')); let k = 0; while (k++ < 60 && F2.state !== 'down') tick();
  while (k++ < 120 && F2.downPhase !== 'lie') tick();
  let lie = 0; while (k++ < 200 && F2.downPhase === 'lie') { tick(); lie++; }
  ok(Math.abs(lie - MOVES.sweep.lie) <= 1, '扫堂腿躺了 ' + lie);
});
// 滚身起：玩家二被打倒、起身时往后滚（背着玩家一）/ 往玩家一脚下滚；玩家一看见他滚以后 r 帧按 act。打中算不算「打在他还动不了的时候」
function rollPunish(way, r, act, d0 = 80) {
  return quietly(() => {
    arena(d0); F1.x = 700; F2.x = 700 + d0; F1.facing = 1; F2.facing = -1;
    F2.knockDown(0.01, 0, LIE_HIT, false); F2.alt = 0;
    const v2 = way === 'away' ? RIGHT : LEFT;
    let seen = -1, st = 0;
    for (let f = 0; f < 200; f++) {
      let v1 = 0;
      if (seen < 0 && F2.state === 'down' && F2.downPhase === 'getup') seen = f;
      if (seen >= 0) {
        const k = f - seen - r, dir = HOLD(F2.x >= F1.x ? 'right' : 'left');
        if (k === 0 && (act === 'jab' || act === 'kick')) v1 = TAP(act);
        if (act === 'dashJab' || act === 'dashKick') { if (k === 0 || k === 2) v1 = dir; if (k === 2 + DASH_CANCEL + 1) v1 = TAP(act === 'dashJab' ? 'jab' : 'kick'); }
      }
      const before = F2.state, hp = F2.hp;
      step([v1, F2.state === 'down' ? v2 : 0]);
      if (F2.hp < hp) return before === 'rise' || before === 'down';
      if (F2.actionable() && f > seen + 40) return false;
    }
    return false;
  });
}
T('2.7 滚身起（Jack：倒地后直接翻滚很无解）：照样能滚，但滚完站起来那几帧挨得了打（RISE_ROLL）—— 和起身硬直一样按「短拳打得到、腿踢打不到」定', () => {
  ok(RISE_ROLL > RISE && ROLL_BACK < ROLL_DIST, `滚完站起来 ${RISE_ROLL} 帧（原地起 ${RISE}）；往后滚 ${ROLL_BACK}（往前 ${ROLL_DIST}）`);
  // 往后滚：看见了（一刻钟左右）冲刺过去出短拳打得到，冲刺出腿踢打不到；以前往后滚谁都够不着
  for (const d0 of [60, 80, 100]) {
    ok(rollPunish('away', 14, 'dashJab', d0), `往后滚（离 ${d0}）：看见了冲刺短拳要打得到`);
    ok(!rollPunish('away', 14, 'dashKick', d0), `往后滚（离 ${d0}）：冲刺出腿踢不该打得到`);
    // 往脚下滚：转身出短拳打得到，腿踢打不到
    ok(rollPunish('toward', 15, 'jab', d0), `往脚下滚（离 ${d0}）：转身短拳要打得到`);
    ok(!rollPunish('toward', 15, 'kick', d0), `往脚下滚（离 ${d0}）：腿踢不该打得到`);
  }
  // 原地压起身的照旧打空（滚身起还是躲压起身的办法）：见「2.0 滚身起」那条
});
T('2.7 泼墨（Jack）：伤害 50；霸体蓄力一小下（算前摇），单手出掌，掌前面炸开一朵墨花；对面的反制手段不变（擒拿、卸力、格挡、跳、冲刺）', () => {
  const d = MOVES.super;
  eq(d.dmg, 50, '伤害');
  ok(d.limb === 'bh' && !d.sinv && d.armor && d.armor.from === 0 && d.armor.n >= 10, '后手单手出、整个前摇霸体（不再是打击无敌）');
  ok(d.S > 9.75, '前摇比 2.6（9.75）长一点（蓄力）：' + d.S);
  // 蓄力时挨了短拳：硬吃（只掉一半），招不停，照样打中 50
  arena(90); F1.qi = QI_MAX;
  run(40, i => [i === 0 ? TAP('heavy') | TAP('kick') : 0, i === 0 ? TAP('jab') : 0]);      // 短拳打在蓄力里（离出掌还早）
  ok(lost(F1) > 0 && lost(F1) <= Math.ceil(MOVES.jab.dmg * ARMOR_KEEP), '霸体硬吃短拳只掉一半：' + lost(F1));
  eq(lost(F2), d.dmg, '吃了一拳照样打出去');
  eq(F1.stats.supers, 1);
  // 推挡也推不动（以前打击无敌，推挡打不着它）
  arena(100); tick(0, BLOCK, 5); F1.qi = QI_MAX;
  run(40, i => [i === 0 ? TAP('heavy') | TAP('kick') : 0, i < 5 ? BLOCK : i === 5 ? BLOCK | TAP('jab') : 0]);
  ok(F2.hp <= MAX_HP - d.dmg * BLOCK_KEEP, '推挡推不动蓄力的泼墨');
  // 出掌那一下：掌前面一朵墨花（特效）
  arena(120); F1.qi = QI_MAX; game.quiet = false; let bloom = false;
  for (let i = 0; i < 30; i++) { step([i === 0 ? TAP('heavy') | TAP('kick') : 0, 0]); if (FX.some(e => e.type === 'bloom')) { bloom = true; ok(F1.move && F1.move.name === 'super' && F1.move.t >= F1.move.S, '墨花在出掌的时候炸开'); break; } }
  ok(bloom, '没有墨花');
});
T('2.7 场景、人物颜色的「好了」改成「确认」（以后所有的「好了」都写「确认」）', () => {
  const x = new XMLHttpRequest(); x.open('GET', 'index.html', false); x.send();
  const html = x.responseText;
  ok(!/>\s*好了\s*</.test(html), '页面上还有「好了」按钮');
  for (const id of ['btnLooksDone', 'btnStageDone', 'btnSetDone']) ok(new RegExp('id="' + id + '"[^>]*>确认<').test(html), id + ' 要写「确认」');
});
T('2.7 整场赢了放一段声音（输了另一段）：人机看玩家一，双人对战总有人赢', () => {
  const calls = [], keep = Sound.victory; Sound.victory = w => calls.push(w);
  try {
    for (const [mode, winner] of [['pve', 0], ['pve', 1], ['pvp', 1]]) {
      startMatch(mode); game.brains = [null, null]; game.phase = 'fight';
      game.wins = winner === 0 ? [WIN_ROUNDS - 1, 0] : [0, WIN_ROUNDS - 1];
      game.p[1 - winner].hp = 0;
      let k = 0; while (k++ < 400 && game.phase !== 'over') step([0, 0]);
      eq(game.phase, 'over', mode + ' 打完了');
    }
    startMatch('pvp'); game.brains = [null, null]; game.phase = 'fight'; F2.hp = 0;    // 只赢一回合：不放
    let k = 0; while (k++ < 300 && game.phase !== 'intro') step([0, 0]);
  } finally { Sound.victory = keep; }
  eq(calls, [true, false, true]);
  ok(typeof Sound.victory === 'function' && VICTORY_RUN.length >= 8, '赢了：一串往上拨的古筝');
});
T('2.7 发带（Jack：飘得太快，和待机、打斗动作都对不上；头带再细一点点、短一点点）：短了、细了；站着时跟着呼吸慢慢轻轻摆，不自己乱扑腾', () => {
  ok((RIB_N - 1) * RIB_SEG < 39.9 && RIB_W < 4.6, `发带长 ${((RIB_N - 1) * RIB_SEG).toFixed(1)}（2.6 是 39.9）、宽 ${RIB_W}（2.6 是 4.6）`);
  arena(300); game.quiet = false;
  const ys = []; let sp = 0, last = null;
  for (let i = 0; i < 260; i++) {
    step([0, 0]); if (i < 60) continue;
    const pts = F1.ribbons[0], k = F1.J.knot, tip = pts[pts.length - 1], v = [tip.x - k[0], tip.y - k[1]];
    ys.push(v[1]); if (last) sp += Math.hypot(v[0] - last[0], v[1] - last[1]); last = v;
  }
  const range = Math.max(...ys) - Math.min(...ys);
  ok(range < 10, '站着时发带梢上下甩了 ' + range.toFixed(1) + '（2.6 是 22 多）');
  ok(sp / ys.length < 0.35, '站着时发带梢一帧动 ' + (sp / ys.length).toFixed(2) + '（2.6 是 0.7）');
});
T('2.7 腿不扭（Jack：二起脚的腿扭着，不同距离下手臂、腿怪的都改）：离得近出腿，膝盖在上面收着（不往下顶成往上开的 V）；二起脚腾空时两腿不交叉、踢出去时收着的那条腿小腿垂着', () => {
  const kneeUp = (J, k) => {
    const H = k === 'ff' ? J.hipF : J.hipB, K = k === 'ff' ? J.fk : J.bk, E = J[k];
    let nx = -(E[1] - H[1]), ny = E[0] - H[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; if (ny > 0) { nx = -nx; ny = -ny; }
    return (K[0] - H[0]) * nx + (K[1] - H[1]) * ny;            // > 0：膝盖在髋 → 脚踝那条线上面
  };
  const bad = [];
  for (const n of ['kick', 'whip', 'twinKick', 'backKick', 'whirl']) for (const dist of [56, 70, 85]) {
    const fr = simulateMove(n, { dist }), c = contactOf(fr, n); if (!c) continue;
    const f = fr[c.frame], v = kneeUp(f.J1, MOVES[n].limb);
    if (v < -1.5) bad.push(`${MOVES[n].label} 离 ${dist}：膝盖往下顶了 ${(-v).toFixed(1)}`);
  }
  ok(!bad.length, bad.join('；'));
  // 二起脚：腾空那一下两腿不交叉（后腿膝盖在前腿膝盖后面）；踢出去时前腿（收着的）小腿差不多垂直
  const fr = simulateMove('twinKick', {}), d = MOVES.twinKick, at = ph => fr.find(f => f.mv && f.mv.name === 'twinKick' && phaseOf(d, f.mv.t) >= ph);
  const up = at(0.5).J1, fw = up.facing;
  ok((up.bk[0] - up.fk[0]) * fw < 0, '腾空时后腿膝盖跑到前腿膝盖前面去了（两腿交叉）');
  const kk = at(1.05).J1, shin = [kk.ff[0] - kk.fk[0], kk.ff[1] - kk.fk[1]];
  ok(shin[1] > 0 && Math.abs(shin[0]) < Math.abs(shin[1]) * 0.7, '收着的那条腿小腿要往下垂：' + shin.map(v => v.toFixed(1)));
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
