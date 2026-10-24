'use strict';
/* ============================================================
   2.1 训练场 · 破招练习（Jack：训练场要能把每种招都打出来，练破解对面的所有招 —— 一个招可能有好几种破法，分开练，
   放在同一招底下当子解法；单招、连招都要有。教学要清楚：开始前有文字说明和场景演示，练的途中也能再看说明）
   · 一课 = 对手的一招（单招 / 连招 / 一种技术）× 一种破法。木桩照剧本一遍一遍出这一招，你照说明破；成功 need 次（都是 3 次）算过关
   · 2.2（Jack：不要「已完成」—— 每一课就是单独练一次，成功 3 次就过，不算「已完成」；还有：弄不清对面什么时候出招，
     练习可以有准备，出招前给提示）：不再记哪课过了（没有打勾、没有「已过关 x / 75」）；过关只弹一个结算（再练一次 / 下一课 / 换一课），
     只数一共过了几次关（成就「拆招大师」用，界面上不显示）。出招提示 cue（默认开，工具条能关）：木桩站好位置后倒数 3 · 2 · 1 再出招，
     他每一招一抬手头上闪一个「!」；被动课写「等你出招」，起身课倒数后再放倒、起身时画一圈进度
   · 「主动课」木桩出招，你破；「被动课」木桩摆一种架势（挡、卸力、推挡、接腿……），你出招破它；「起身课」每一遍先把人放倒
   · 演示：你这边也交给电脑，按到帧地破给你看，配字
   · 成没成功看战斗里实际发生了什么（combat.js 报告的 CEV 事件：打中和加成、挡住、卸力、接腿、拆……），不看你按了什么
   · 只在训练场用，不进联机（CEV.on 平时是 null）。木桩、演示都是 AI（brain），和人机一样走 step()
   ============================================================ */
const TW = (me, op) => HOLD(op.x >= me.x ? 'right' : 'left');      // 朝对手按
const AW = (me, op) => HOLD(op.x >= me.x ? 'left' : 'right');      // 背着对手按
const BLK = HOLD('block'), DWN = HOLD('down');
const keyBits = a => a.startsWith('d:') ? DWN | TAP(a.slice(2)) : TAP(a);
const isMove = (F, ...names) => F.state === 'attack' && !!F.move && names.includes(F.move.name);
const toHit = F => F.state === 'attack' && F.move ? F.move.S - F.move.t + 1 : 99;      // 还有几帧出手（这一帧按下的招 = 第 1 帧）
const gap = (a, b) => Math.abs(a.x - b.x);

/* ---------- 木桩的出招剧本（每帧返回按键；'done' = 这一遍出完了） ---------- */
// 一串：第一下马上按，后面的打中 / 被挡了能取消就接，打空了等能动再按（还在连招时间里，照样是连招里的那一招）
// （按了一下要等这一招真的出来了才按下一下：打中停顿那几帧里连按，后一下会过期丢掉）
function seq(...keys) {
  return (st, me) => {
    if (st.i === 0) { st.k = 1; st.ser = me.serial; return keyBits(keys[0]); }
    const nx = keys[st.k];
    if (nx) {
      const kind = nx.replace('d:', ''), m = me.move;
      if (game.freeze > 0 || me.serial === st.ser) return nx.startsWith('d:') ? DWN : 0;
      if ((me.state === 'attack' && m && (m.hit || m.blocked || m.absorbed) && me.canCancel(kind)) || (me.actionable() && st.i > 2)) { st.k++; st.ser = me.serial; return keyBits(nx); }
      return nx.startsWith('d:') ? DWN : 0;
    }
    return st.i > 3 && me.actionable() && me.serial !== st.ser ? 'done' : 0;
  };
}
// 跳过来出空中招（'d:kick' = 千斤坠；null = 空跳）。站着按方向跳大约往前飞 70；千斤坠 diveAt 以内才踩（近了踩得陡）
function jumpAtk(key, diveAt = 150) {
  return (st, me, op) => {
    if (st.i === 0) return TAP('up') | TW(me, op);
    const d = gap(me, op);
    if (key && !st.fired && me.state === 'air' && !me.airUsed) {
      const dive = key === 'd:kick';
      const go = dive ? d >= 50 && d <= diveAt && me.vz < 5 : d <= MOVES[AIR_OF[key]].reach + 6 && me.vz < 3;
      if (go) { st.fired = 1; return (dive ? DWN : 0) | TAP(dive ? 'kick' : key); }
    }
    if (st.i > 8 && !me.airborne && me.actionable()) return 'done';
    return me.state === 'jumpsquat' || me.airborne ? TW(me, op) : 0;    // 起跳那几帧、空中一直朝他按着（起跳时按着方向才跳得远；千斤坠不受方向键影响）
  };
}
// 冲刺进来（双击方向），冲刺第 DASH_CANCEL 帧起出招（冲势）；key = null 只冲不出
function dashAtk(key) {
  return (st, me, op) => {
    if (st.i === 0 || st.i === 2) return TW(me, op);
    if (key && st.i === 2 + DASH_CANCEL + 1) return TAP(key);
    return st.i > 12 && me.actionable() ? 'done' : 0;
  };
}
// 跑起来（跑满了）到 at 那么近出招：'heavy' = 铁山靠；key = null 跑到跟前就停
function runAtk(key, at) {
  return (st, me, op) => {
    const d = gap(me, op);
    if (st.fired) return st.i > st.fired + 3 && me.actionable() ? 'done' : 0;
    if (me.runT >= RUN_CHARGE + 1 && d <= at) { st.fired = st.i; return key ? TW(me, op) | TAP(key) : 0; }
    return st.i > 150 ? 'done' : TW(me, op);
  };
}
// 两种里随便出一种（看第二下换着挡的课）
const either = (...acts) => (st, me, op) => { if (st.i === 0) st.pick = acts[(Math.random() * acts.length) | 0]; return st.pick(st, me, op); };

/* ---------- 演示里「你」这边的按法 ---------- */
// 他这一招还有 n 帧出手的时候按 keys（n 按招的前摇算）
const atLeft = (names, n, keys) => (st, me, op) => {
  if (isMove(op, ...names) && st.ser !== op.move.serial && toHit(op) <= n) { st.ser = op.move.serial; return keys; }
  return 0;
};
// 他一出这一招（第 t 帧）就按
const onStart = (names, keys, t = 1) => (st, me, op) => {
  if (isMove(op, ...names) && st.ser !== op.move.serial && op.move.t >= t) { st.ser = op.move.serial; return keys; }
  return 0;
};
// 挡住以后，等他那一招进了收招（不再接下一招了），马上反打一套（默认 拳拳重 = 冲天炮）；被弹开了就先往前凑
function punishAfterBlock(route = ['jab', 'jab', 'heavy']) {
  return (st, me, op) => {
    if (st.pk) return st.c(st, me, op);
    if (me.state === 'blockstun') { st.blocked = true; return BLK; }
    const m = op.move, rec = op.state === 'attack' && m && m.blocked && m.t > m.S + m.def.A + 2;
    if (st.dq && st.dq.length) { const v = st.dq.shift(); if (!st.dq.length) { st.pk = 1; st.c = chain(route); } return v; }
    if (st.blocked && me.actionable() && (rec || (op.state === 'land' && op.t < op.landT - 3))) {
      const d = gap(me, op);
      if (d > effR(route[0]) + 34) { st.dq = [TW(me, op), 0, TW(me, op), 0, 0, 0, 0]; return st.dq.shift(); }   // 被推远了：冲刺进去（第 5 帧起出招）
      if (d > effR(route[0]) - 4) return TW(me, op);
      st.pk = 1; st.c = chain(route); return st.c(st, me, op);
    }
    return BLK;
  };
}
// 卸力：他的招还有 3 帧打到时刚按下格挡（之前别按着）
const parryAt = (names, low) => (st, me, op) => {
  if (isMove(op, ...names) && toHit(op) <= 3 && toHit(op) >= 1 && st.ser !== op.move.serial) { st.ser = op.move.serial; st.hold = 10; }
  if (st.hold > 0) { st.hold--; return BLK | (low ? DWN : 0); }
  return 0;
};
// 连按：按 keys 里的每一招，一下接一下（打中能取消就接，不然能动了就接）
function chain(keys) {
  return (st, me) => {
    if (st.ci == null) { st.ci = 1; st.cser = me.serial; return keyBits(keys[0]); }
    const nx = keys[st.ci];
    if (!nx) return 0;
    if (game.freeze > 0 || me.serial === st.cser) return nx.startsWith('d:') ? DWN : 0;
    const m = me.move;
    if ((me.state === 'attack' && m && (m.hit || m.blocked || m.absorbed) && me.canCancel(nx.replace('d:', ''))) || me.actionable()) { st.ci++; st.cser = me.serial; return keyBits(nx); }
    return nx.startsWith('d:') ? DWN : 0;
  };
}
const walkTo = (me, op, d) => gap(me, op) > d + 4 ? TW(me, op) : 0;

/* ---------- 课 ----------
   文字里的 [拳] [重] [踢] [拿] [挡] [蹲] [跳] [前] [后] 会换成你自己的键位（界面里显示成按键）
   主动课：at 木桩从多远出招，act 出招剧本；被动课：react: true，pose 木桩的架势（每帧），你出一招算一遍
   win(R)：这一遍成没成功（R 见 Drill.check）；miss(R)：没成功时给的提示（不给就用通用的） */
const DRILL_TOPICS = [
  ['jab', '短拳', '贴身最快的一下（前摇 5 帧），看见了再挡来不及，靠预判和霸体'],
  ['lowJab', '下盘拳', '蹲着出的拳，下段：站着挡不住'],
  ['rush', '连拳（连珠快拳）', '一串短拳压着你打'],
  ['upper', '冲天炮（拳拳重）', '拳拳接重，击倒，收招很长'],
  ['heavy', '重拳', '前摇长、有霸体，打中很疼'],
  ['chop', '重拳接第二下', '重 重 = 劈挂掌（上段），重 + 蹲踢 = 扫堂腿（下段），二选一'],
  ['whirl', '旋风腿（重踢）', '重拳接腿，击倒'],
  ['beng', '崩拳（拳重）', '短拳接重拳，冲击波把人打远'],
  ['whip', '鞭腿（拳踢）', '短拳接一记鞭腿'],
  ['backKick', '转身蹬（拳拳踢）', '两拳接转身一蹬，把人蹬远'],
  ['hammer', '盖步砸拳（踢重）', '腿接重拳往下砸，击倒'],
  ['lowSweep', '下盘拳接扫堂腿', '两下都是下段'],
  ['kick', '腿踢', '射程最远的一下，前摇长'],
  ['twin', '二起脚（踢踢）', '两脚连踢，击倒'],
  ['sweep', '扫堂腿', '蹲着扫，下段、击倒，收招很长'],
  ['palm', '托天掌', '对空招：专打跳过来的人'],
  ['airHeavy', '泰山压顶', '跳起来双拳往下砸（上段）'],
  ['airKick', '飞踢', '跳起来一脚蹬过来（上段）'],
  ['airJab', '空中挥拳', '跳起来挥拳（上段，最快的空中招）'],
  ['dive', '千斤坠', '空中按住蹲再踢：先腾一下，再斜着踩下来'],
  ['grab', '擒拿', '挡不住的抓'],
  ['lowGrab', '抄腿', '蹲下抱腿，专抓蹲着的'],
  ['shoulder', '铁山靠', '跑起来按重：能硬吃两下拳，撞得远'],
  ['dash', '冲刺 · 冲势', '双击方向冲进来，冲刺里出招带冲势'],
  ['run', '跑过来', '全速跑过来的人'],
  ['guard', '站着挡', '木桩一直站着举手'],
  ['crouch', '蹲着挡', '木桩一直蹲着举手'],
  ['gwalk', '边挡边走', '举着手往你这边挪'],
  ['parry', '卸力', '木桩会卡准时机按挡，把你的招卸掉'],
  ['shove', '推挡', '木桩挡住就把你推开'],
  ['jieQuan', '截拳', '木桩挡住就花气从格挡里打出一拳'],
  ['catch', '接腿', '木桩专等你出腿，一伸手就接住'],
  ['slip', '闪身', '木桩按着挡从你身边钻过去'],
  ['burst', '爆气', '你连打它，它花半格气爆开'],
  ['super', '泼墨', '气满放的必杀（40 血）'],
  ['wake', '起身攻防', '倒地、起身、压起身、滚身起'],
];
const DRILLS = [
  /* —— 短拳 —— */
  { id: 'jab.armor', topic: 'jab', name: '重拳霸体硬吃', at: 82, act: seq('jab'),
    how: ['站在他拳够得着的地方', '他一抬手出拳，你马上按 [重]（别等打到身上）', '重拳前摇有霸体，吃下这一拳照样打出去'],
    why: '重克拳：重拳前摇霸体能硬吃一记短拳，接着这一拳算「重克拳」×1.3',
    demo: onStart(['jab'], TAP('heavy'), 0), win: R => R.my('hit', e => /重克拳/.test(e.how)),
    miss: R => R.op('hit') ? '慢了：他的拳先到了 —— 看见他抬手就按 [重]' : null },
  { id: 'jab.parry', topic: 'jab', name: '卸力', at: 82, act: seq('jab'),
    how: ['先别按着挡', '他的拳快到的一瞬间，刚按下 [挡]（按下去那 6 帧内被打中就是卸力）', '卸掉以后他失衡，你接着打'],
    why: '卸力：不掉血，对方失衡；接着打中 ×1.35，按 [拿] 是借力摔。两次按挡要隔 24 帧以上才有卸力',
    demo: parryAt(['jab']), win: R => R.my('parry'),
    miss: R => R.op('block') || R.my('block') ? '挡住了，但不是卸力：按早了 —— 等拳快到了再按' : R.op('hit') ? '按晚了，拳已经到了' : null },
  { id: 'jab.shove', topic: 'jab', name: '挡住再推挡', at: 82, act: seq('jab'),
    how: ['按住 [挡] 挡住他的拳', '还在挡的硬直里就按 [拳] —— 推挡', '把他推开、打断他接下来的招'],
    why: '推挡：挡住以后按拳，把对方推开并打断（不掉他的血）',
    demo: (st, me) => me.state === 'blockstun' ? BLK | TAP('jab') : BLK, win: R => R.my('shove'),
    miss: R => R.my('block') ? '挡住了 —— 还在硬直里再按 [拳]' : null },
  { id: 'jab.jieQuan', topic: 'jab', name: '挡住打截拳', at: 82, act: seq('jab'), meQi: 60,
    how: ['按住 [挡] 挡住他的拳', '还在挡的硬直里按 [重] —— 截拳（花 25 气）', '截拳出手前打不中你，直接从格挡里打出去'],
    why: '截拳：挡住后按重，花 25 气从格挡里打出一拳，出手前打击无敌（这一课给你气）',
    demo: (st, me) => me.state === 'blockstun' ? BLK | TAP('heavy') : BLK, win: R => R.my('hit', e => e.name === 'jieQuan'),
    miss: R => R.my('block') ? '挡住了 —— 还在硬直里再按 [重]' : null },
  /* —— 下盘拳 —— */
  { id: 'lowJab.block', topic: 'lowJab', name: '蹲着挡', at: 80, act: seq('d:jab'),
    how: ['按住 [蹲] + [挡]', '下盘拳是下段，站着挡不住，要蹲着挡'],
    why: '高低：下段（下盘拳、扫堂腿）要蹲挡，上段（劈挂掌、空中招）要站挡，其他的站蹲都能挡',
    demo: () => BLK | DWN, win: R => R.my('block', e => e.name === 'lowJab' && e.low),
    miss: R => R.op('hit', e => e.wrong) ? '站着挡的 —— 下段要按住 [蹲] 再挡' : null },
  { id: 'lowJab.armor', topic: 'lowJab', name: '重拳霸体硬吃', at: 80, act: seq('d:jab'),
    how: ['他一蹲下出拳，马上按 [重]', '下盘拳也是拳系，重拳霸体照样吃得下'],
    why: '重克拳：下盘拳是拳系，重拳霸体吃得下它',
    demo: onStart(['lowJab'], TAP('heavy'), 0), win: R => R.my('hit', e => /重克拳/.test(e.how)),
    miss: R => R.op('hit') ? '慢了 —— 他一蹲就按 [重]' : null },
  /* —— 连拳 —— */
  { id: 'rush.shove', topic: 'rush', name: '推挡打断', at: 82, act: seq('jab', 'jab', 'jab', 'jab'),
    how: ['按住 [挡] 挡住第一拳', '在挡的硬直里按 [拳] 推挡，把他推开，后面的拳就断了'],
    why: '连段压制的破法：推挡、卸力、截拳、爆气',
    demo: (st, me) => me.state === 'blockstun' ? BLK | TAP('jab') : BLK, win: R => R.my('shove') },
  { id: 'rush.burst', topic: 'rush', name: '挨打时爆气', at: 82, act: seq('jab', 'jab', 'jab', 'jab'), meQi: 60,
    how: ['这一课别挡，先挨两下', '挨打的时候按 [重] + [踢]（一起按）爆气 —— 花半格气', '爆开把他打倒，掉 18 血'],
    why: '爆气只在挨打时能用：对方倒地；他要是面朝你举着手，只吃三成（这一课给你气）',
    demo: (st, me) => me.state === 'hit' && me.comboTaken >= 2 ? TAP('heavy') | TAP('kick') : 0,
    win: R => R.my('burst', e => e.hit), miss: R => R.my('burst', e => e.miss) ? '爆早了 / 他不在身边' : '挨打的时候按 [重] + [踢]' },
  /* —— 冲天炮 —— */
  { id: 'upper.punish', topic: 'upper', name: '全挡住，打它收招', at: 82, act: seq('jab', 'jab', 'heavy'),
    how: ['按住 [挡] 把三下都挡住（冲天炮是中段，站着挡就行）', '冲天炮被挡住收招很长：一能动就 [拳] [拳] [重]', '打在它收招里 = 挡后反击，击倒招 ×1.5'],
    why: '击倒招（冲天炮、旋风腿、二起脚、扫堂腿……）被挡住，收招里挨打是挡后反击 ×1.5',
    demo: punishAfterBlock(), win: R => R.my('hit', e => /挡后反击/.test(e.how)),
    miss: R => R.my('block') ? '挡住了 —— 一能动马上打，晚了他就收完了' : null },
  /* —— 重拳 —— */
  { id: 'heavy.kick', topic: 'heavy', name: '起腿化解（腿克重）', at: 100, act: seq('heavy'),
    how: ['站在你腿够得着的地方', '他往后一蓄力（重拳前摇长），马上按 [踢]', '腿把重拳化解掉，接着踢中他'],
    why: '腿克重：重拳起手被腿化解，腿照样踢出去算克制 ×1.3',
    demo: onStart(['heavy'], TAP('kick'), 1), win: R => R.my('hit', e => /腿克重/.test(e.how)) || R.my('evade'),
    miss: R => R.op('hit') ? '腿起晚了：要在他重拳打到前好几帧就起腿' : null },
  { id: 'heavy.grab', topic: 'heavy', name: '擒拿比它快', at: 84, act: seq('heavy'),
    how: ['贴近一点（擒拿够得着）', '他一蓄力出重拳，按 [拿]', '擒拿比重拳快，抓住了接着按 [重] 过肩摔'],
    why: '重拳前摇长：擒拿先抓到；霸体只防拳，不防擒拿',
    demo: (st, me, op) => isMove(op, 'heavy') && !st.g ? (st.g = 1, TAP('grab')) : isMove(me, 'hold') ? TAP('heavy') : 0,
    win: R => R.my('grab', e => e.bMove === 'heavy'), miss: R => R.op('hit') ? '抓晚了 —— 他一蓄力就按 [拿]' : null },
  { id: 'heavy.slip', topic: 'heavy', name: '闪身 → 回身肘', at: 98, act: seq('heavy'),
    how: ['按住 [挡]', '他重拳打过来的时候，按着挡双击 [前] —— 闪身', '从他身边钻到身后，自动回身一肘打在他背上'],
    why: '闪身只躲得过重拳（重系的手上招）；躲过了自动回身肘，他背对着你踉跄',
    demo: (st, me, op) => {
      if (isMove(op, 'heavy') && toHit(op) <= 8 && !st.s) { st.s = 1; st.q = [TW(me, op), 0, TW(me, op)]; }
      if (st.q && st.q.length) return BLK | st.q.shift();
      return BLK;
    },
    win: R => R.my('slip'), miss: R => R.op('hit') ? '挨了重拳 —— 他一出重拳就按着挡双击 [前]' : R.my('block') ? '挡住了 —— 按着挡双击 [前] 才是闪身' : null },
  { id: 'heavy.punish', topic: 'heavy', name: '挡住打收招', at: 98, act: seq('heavy'),
    how: ['按住 [挡] 挡住重拳', '重拳收招长：一能动就 [拳] [拳] [重]', '打在它收招里 = 挡后反击 ×1.3'],
    why: '挡后反击：挡住以后打对方还没收完的那一招，×1.3（击倒招 ×1.5）',
    demo: punishAfterBlock(), win: R => R.my('hit', e => /挡后反击/.test(e.how)),
    miss: R => R.my('block') ? '挡住了 —— 一能动马上打' : null },
  { id: 'heavy.parry', topic: 'heavy', name: '卸力', at: 98, act: seq('heavy'),
    how: ['别一直按着挡', '重拳快打到的一瞬间刚按下 [挡]', '重拳前摇长、好猜，最适合卸'],
    why: '卸力：被打前一瞬间按下格挡，不掉血、对方失衡；接着打中 ×1.35',
    demo: parryAt(['heavy']), win: R => R.my('parry'),
    miss: R => R.my('block') ? '挡住了但没卸：按早了，等拳快到再按' : R.op('hit') ? '按晚了' : null },
  /* —— 重拳接第二下 —— */
  { id: 'chop.high', topic: 'chop', name: '劈挂掌站着挡', at: 96, act: seq('heavy', 'heavy'),
    how: ['按住 [挡] 挡重拳', '他接第二下劈挂掌（上段，从上往下劈）：站着挡，别蹲'],
    why: '劈挂掌是上段：蹲着挡不住',
    demo: () => BLK, win: R => R.my('block', e => e.name === 'chop' && !e.low),
    miss: R => R.op('hit', e => e.name === 'chop') ? '劈挂掌是上段，蹲着挡不住 —— 站着挡' : null },
  { id: 'chop.read', topic: 'chop', name: '看第二下换着挡', at: 96, act: either(seq('heavy', 'heavy'), seq('heavy', 'd:kick')),
    how: ['按住 [挡] 挡重拳', '看他第二下：劈挂掌（往上抡）→ 站着挡；扫堂腿（往下蹲）→ 按住 [蹲] 挡', '两种他随便出，看清了再换'],
    why: '重拳后面接劈挂掌（上段）还是扫堂腿（下段）是二选一的猜：看清了换着挡',
    demo: (st, me, op) => {
      if (isMove(op, 'sweep')) st.low = 1; else if (isMove(op, 'chop')) st.low = 0;
      return BLK | (st.low ? DWN : 0);
    },
    win: R => R.my('block', e => e.name === 'chop' && !e.low) || R.my('block', e => e.name === 'sweep' && e.low),
    miss: R => R.op('hit', e => e.wrong) ? '挡错了高低：劈挂掌站挡、扫堂腿蹲挡' : null },
  /* —— 旋风腿 —— */
  { id: 'whirl.punish', topic: 'whirl', name: '挡住打收招', at: 100, act: seq('heavy', 'kick'),
    how: ['按住 [挡] 挡住重拳和旋风腿', '旋风腿是击倒招，被挡住收招长：一能动就 [拳] [拳] [重]'],
    why: '击倒招被挡住，收招里挨打 = 挡后反击 ×1.5',
    demo: punishAfterBlock(), win: R => R.my('hit', e => /挡后反击/.test(e.how)) },
  { id: 'whirl.jab', topic: 'whirl', name: '拳打它起腿（失衡）', at: 92, act: seq('heavy', 'kick'),
    how: ['按住 [挡] 挡住重拳', '一能动、看见他转身要起腿，马上按 [拳]', '拳打在单脚站着出腿的人身上：失衡倒地'],
    why: '拳克腿：起腿时被拳打中会失衡倒地',
    demo: (st, me, op) => isMove(op, 'whirl') && me.actionable() && !st.j ? (st.j = 1, TAP('jab')) : st.j ? 0 : BLK,
    win: R => R.my('hit', e => /拳克腿/.test(e.how) || (e.offBalance && e.bMove === 'whirl')),
    miss: R => R.op('hit', e => e.name === 'whirl') ? '慢了 —— 他一转身就出拳' : null },
  /* —— 崩拳 / 鞭腿 / 转身蹬 / 盖步砸拳 / 下盘拳接扫堂腿 —— */
  { id: 'beng.slip', topic: 'beng', name: '挡住第一拳，闪身躲崩拳', at: 84, act: seq('jab', 'heavy'),
    how: ['按住 [挡] 挡住他的短拳', '他接崩拳（往后一拧身、重系的手上招），快打到的时候按着挡双击 [前] —— 闪身（挡住的硬直里也能闪）', '别闪太早（钻过去了它还没打出来）；钻到他身后自动回身一肘'],
    why: '崩拳被挡住会把你冲开、收招短，挡完了打不着；闪身专躲重系的手上招（重拳、崩拳、劈挂掌、盖步砸拳、铁山靠）',
    demo: (st, me, op) => {
      if (isMove(op, 'beng') && toHit(op) <= 8 && !st.s) { st.s = 1; st.q = [TW(me, op), 0, TW(me, op)]; }
      if (st.q && st.q.length) return BLK | st.q.shift();
      return BLK;
    },
    win: R => R.my('slip'), miss: R => R.op('hit', e => e.name === 'beng') ? '挨了崩拳 —— 他一接崩拳就按着挡双击 [前]' : R.my('block', e => e.name === 'beng') ? '挡住了 —— 按着挡双击 [前] 才是闪身' : null },
  { id: 'whip.punish', topic: 'whip', name: '挡住打收招', at: 84, act: seq('jab', 'kick'),
    how: ['按住 [挡] 挡住短拳和鞭腿', '腿系被挡住收招长：一能动就 [拳] [拳] [重]'],
    why: '挡后反击：腿系的招被挡住收招长',
    demo: punishAfterBlock(), win: R => R.my('hit', e => /挡后反击/.test(e.how)) },
  { id: 'whip.jab', topic: 'whip', name: '拳打它起腿（失衡）', at: 84, act: seq('jab', 'kick'),
    how: ['按住 [挡] 挡住第一拳', '一能动、看见他起腿，马上按 [拳]', '拳打在出腿的人身上：失衡倒地'],
    why: '拳克腿：连招里接的腿也一样',
    demo: (st, me, op) => isMove(op, 'whip') && me.actionable() && !st.j ? (st.j = 1, TAP('jab')) : st.j ? 0 : BLK,
    win: R => R.my('hit', e => /拳克腿/.test(e.how) || (e.offBalance && e.bMove === 'whip')),
    miss: R => R.op('hit', e => e.name === 'whip') ? '慢了 —— 他一起腿就出拳' : null },
  { id: 'backKick.punish', topic: 'backKick', name: '挡住，冲进去打收招', at: 84, act: seq('jab', 'jab', 'kick'),
    how: ['按住 [挡] 挡住两拳和转身蹬（会被蹬开一段）', '一能动就双击 [前] 冲进去，冲刺里出 [拳]'],
    why: '挡后反击：转身蹬把你蹬远了，走过去来不及，冲刺进去',
    demo: punishAfterBlock(), win: R => R.my('hit', e => /挡后反击/.test(e.how)),
    miss: R => R.my('block') ? '挡住了 —— 被蹬远了要冲刺进去' : null },
  { id: 'hammer.punish', topic: 'hammer', name: '挡住打收招（×1.5）', at: 110, act: seq('kick', 'heavy'),
    how: ['按住 [挡] 挡住腿和盖步砸拳', '盖步砸拳是击倒招，被挡住收招很长：一能动就 [拳] [拳] [重]'],
    why: '击倒招被挡住，收招里挨打 = 挡后反击 ×1.5',
    demo: punishAfterBlock(), win: R => R.my('hit', e => /挡后反击/.test(e.how)) },
  { id: 'lowSweep.stomp', topic: 'lowSweep', name: '蹲挡到底，踩腿', at: 82, act: seq('d:jab', 'd:kick'),
    how: ['按住 [蹲] + [挡]：两下都是下段', '挡住扫堂腿马上 [蹲] + [踢] —— 踩腿'],
    why: '蹲挡住扫堂腿，紧接着蹲+踢 = 踩腿，算挡后反击 ×1.5',
    demo: (st, me) => me.stompReady() ? DWN | TAP('kick') : BLK | DWN, win: R => R.my('hit', e => e.name === 'stomp'),
    miss: R => R.op('hit', e => e.wrong) ? '两下都是下段：一直蹲着挡' : R.my('block') ? '挡住了 —— 扫堂腿一挡住就 蹲+踢' : null },
  /* —— 腿踢 —— */
  { id: 'kick.jab', topic: 'kick', name: '拳打出腿（失衡倒地）', at: 92, act: seq('kick'),
    how: ['贴近他（拳够得着）', '他一抬腿就按 [拳]', '拳打在单脚站着出腿的人身上：失衡倒地'],
    why: '拳克腿：起腿时被拳打中失衡倒地',
    demo: onStart(['kick'], TAP('jab'), 2), win: R => R.my('hit', e => /拳克腿/.test(e.how) || e.offBalance),
    miss: R => R.op('hit') ? '慢了 —— 他一抬腿就出拳' : null },
  { id: 'kick.catch', topic: 'kick', name: '接腿摔', at: 112, act: seq('kick'),
    how: ['他一抬腿（腿踢前摇长），马上按 [拿]', '手要在腿踢到之前伸出来 —— 抓住他的腿直接摔倒'],
    why: '对方出腿时擒拿 = 接腿摔，挣不脱',
    demo: onStart(['kick'], TAP('grab'), 1), win: R => R.my('grab', e => e.kind === 'catch'),
    miss: R => R.op('hit') ? '伸手晚了：腿快踢到了才抓接不住 —— 他一抬腿就按' : null },
  { id: 'kick.scoop', topic: 'kick', name: '抄腿摔', at: 104, act: seq('kick'),
    how: ['他一抬腿，马上按住 [蹲] 再按 [拿]（抄腿）', '抄腿前摇比擒拿还长，要更早'],
    why: '抄腿接得住出腿（也接得住扫堂腿）',
    demo: onStart(['kick'], DWN | TAP('grab'), 0), win: R => R.my('grab', e => e.kind === 'scoop'),
    miss: R => R.op('hit') ? '慢了 —— 他一抬腿就 蹲+拿' : null },
  { id: 'kick.whiff', topic: 'kick', name: '让它踢空，冲进去打收招', at: 120, act: seq('kick'),
    how: ['站在他腿刚好够得着的地方', '他一抬腿，按住 [挡] 再按 [后] 往后挪半步（举着手退，一直面朝他）', '腿踢空了，马上双击 [前] 冲进去出 [拳]'],
    why: '打空的招还在收招，冲进去打他（冲刺第 5 帧起能直接出招）',
    demo: (st, me, op) => {
      if (isMove(op, 'kick') && !st.s) st.s = 1;
      if (st.s === 1) { if (isMove(op, 'kick') && op.move.t <= op.move.S + op.move.def.A) return BLK | AW(me, op); st.s = 2; st.q = [TW(me, op), 0, TW(me, op), 0, 0, 0, 0, 0, TAP('jab')]; }
      if (st.q && st.q.length) return st.q.shift();
      return 0;
    },
    win: R => R.opWhiff('kick') && R.my('hit'), miss: R => R.op('hit') ? '没退开 —— 他一抬腿就按着挡往后挪' : R.opWhiff('kick') ? '踢空了 —— 马上冲进去打' : null },
  /* —— 二起脚 —— */
  { id: 'twin.punish', topic: 'twin', name: '挡住打收招', at: 110, act: seq('kick', 'kick'),
    how: ['按住 [挡] 挡住两脚', '二起脚是击倒招，被挡住收招长：一能动就冲上去 [拳] [拳] [重]'],
    why: '击倒招被挡住，收招里挨打 = 挡后反击 ×1.5',
    demo: punishAfterBlock(), win: R => R.my('hit', e => /挡后反击/.test(e.how)) },
  /* —— 扫堂腿 —— */
  { id: 'sweep.stomp', topic: 'sweep', name: '蹲挡后踩腿', at: 108, act: seq('d:kick'),
    how: ['按住 [蹲] + [挡] 挡住扫堂腿', '挡住以后马上 [蹲] + [踢] —— 踩腿，一脚踩倒'],
    why: '蹲挡住扫堂腿，紧接着蹲+踢 = 踩腿，算挡后反击 ×1.5',
    demo: (st, me) => me.stompReady() ? DWN | TAP('kick') : BLK | DWN, win: R => R.my('hit', e => e.name === 'stomp'),
    miss: R => R.my('block') ? '挡住了 —— 马上 蹲+踢' : R.op('hit') ? '扫堂腿是下段：按住 [蹲] 再挡' : null },
  { id: 'sweep.scoop', topic: 'sweep', name: '抄腿摔', at: 106, act: seq('d:kick'),
    how: ['他一蹲下要扫，马上按住 [蹲] 再按 [拿]（抄腿）', '抄腿要很早：他一蹲就按'],
    why: '抄腿接得住扫堂腿（抄腿摔，挣不脱）',
    demo: onStart(['sweep'], DWN | TAP('grab'), 0), win: R => R.my('grab', e => e.kind === 'scoop'),
    miss: R => R.op('hit') ? '慢了 —— 他一蹲就 蹲+拿' : null },
  { id: 'sweep.jump', topic: 'sweep', name: '跳起躲开，空中砸它收招（破绽）', at: 110, act: seq('d:kick'),
    how: ['他一蹲下要扫，马上朝他跳（按住 [前] 再 [跳]）', '扫堂腿从脚底下过去；在空中按 [重] —— 泰山压顶砸在他收招里', '击倒招打空了、收招里挨打 = 破绽 ×1.25（跳起出招还有 ×1.35）'],
    why: '下段打不到跳起来的人；扫堂腿收招很长，原地跳落下来就晚了，要朝他跳、空中出招',
    demo: (st, me, op) => {
      if (isMove(op, 'sweep') && !st.j) { st.j = 1; return TAP('up') | TW(me, op); }
      if (st.j && (me.state === 'jumpsquat' || me.airborne)) {
        if (me.state === 'air' && !me.airUsed && gap(me, op) <= MOVES.airHeavy.reach + 4 && me.vz < 4) return TAP('heavy') | TW(me, op);
        return TW(me, op);
      }
      return 0;
    },
    win: R => R.my('hit', e => /破绽/.test(e.how)), miss: R => R.op('hit') ? '跳晚了 —— 他一蹲就跳' : R.wasAir ? '躲开了 —— 在空中就出招砸他' : null },
  { id: 'sweep.jab', topic: 'sweep', name: '贴身短拳打失衡', at: 86, act: seq('d:kick'),
    how: ['贴着他', '他一蹲下要扫，马上按 [拳]', '扫堂腿也是腿系：出腿时挨拳失衡倒地'],
    why: '拳克腿：扫堂腿起腿时被拳打中失衡',
    demo: onStart(['sweep'], TAP('jab'), 1), win: R => R.my('hit', e => e.bMove === 'sweep' && (/拳克腿|破招/.test(e.how) || e.offBalance)),
    miss: R => R.op('hit') ? '慢了 —— 他一蹲就出拳' : null },
  /* —— 托天掌 —— */
  { id: 'palm.dive', topic: 'palm', name: '千斤坠踩断对空', at: 200, react: true,
    pose: (st, me, op) => op.airborne && gap(me, op) <= 150 && op.vz < 3 && !st.p ? (st.p = 1, DWN | TAP('heavy')) : (op.airborne ? 0 : (st.p = 0, 0)),
    how: ['从远处朝他跳过去（按住 [前] 再 [跳]）', '他会出托天掌接你', '在空中按住 [蹲] 再按 [踢] —— 千斤坠，踩断托天掌'],
    why: '千斤坠踩断对空：对空招打不到千斤坠，踩中托天掌 ×1.5 还踩倒',
    trigger: 'jump',
    demo: (st, me, op) => {
      if (!st.j) { if (gap(me, op) > 210) return TW(me, op); if (gap(me, op) < 170 || !me.actionable()) return 0; st.j = 1; return TAP('up') | TW(me, op); }
      if (me.state === 'air' && !me.airUsed && gap(me, op) <= 150 && me.vz < 5) return DWN | TAP('kick');
      return me.state === 'jumpsquat' || me.airborne ? TW(me, op) : 0;
    },
    win: R => R.my('hit', e => /踩断对空/.test(e.how)), miss: R => R.op('hit') ? '被托天掌打下来了 —— 跳到他头上之前就出千斤坠' : null },
  { id: 'palm.punish', topic: 'palm', name: '挡住打收招', at: 84, act: seq('d:heavy'),
    how: ['按住 [挡] 挡住托天掌', '托天掌被挡住收招很长：一能动就 [拳] [拳] [重]'],
    why: '挡后反击：托天掌是击倒招，挡住以后打它收招 ×1.5',
    demo: punishAfterBlock(), win: R => R.my('hit', e => /挡后反击/.test(e.how)) },
  /* —— 泰山压顶 / 飞踢 / 空中挥拳 —— */
  ...['airHeavy', 'airKick', 'airJab'].flatMap(an => {
    const key = { airHeavy: 'heavy', airKick: 'kick', airJab: 'jab' }[an], nm = MOVES[an].label;
    const list = [
      { id: an + '.palm', topic: an, name: '托天掌（倒栽葱）', at: 205, act: jumpAtk(key),
        how: ['他跳过来的时候，等他快落到你身前', '按住 [蹲] 再按 [重] —— 托天掌', '托天掌出手前几帧空中招打不中你；打下来 = 倒栽葱，倒地更久'],
        why: '对空克空中：托天掌打下跳过来的人，算倒栽葱',
        demo: (st, me, op) => op.state === 'attack' && op.move && op.move.air && gap(me, op) <= 125 && !st.p ? (st.p = 1, DWN | TAP('heavy')) : 0,
        win: R => R.my('hit', e => e.name === 'palm' && /倒栽葱/.test(e.how)),
        miss: R => R.op('hit') ? '托晚了 —— 他往下落、快进你身前就托' : R.my('hit', e => e.name === 'palm') ? '打中了 —— 再晚一点，等他落下来再托' : '他还在天上时按 蹲+重' },
      { id: an + '.block', topic: an, name: '站着挡，打它落地', at: 205, act: jumpAtk(key),
        how: ['他跳过来，按住 [挡]（站着！空中招是上段，蹲着挡不住）', '挡住以后他落地有硬直：马上 [拳] [拳] [重]'],
        why: '空中招被挡住，落地的硬直里挨打',
        demo: (st, me, op) => {
          if (me.state === 'blockstun') { st.b = 1; return BLK; }
          if (st.b && me.actionable() && !st.c) st.c = chain(['jab', 'jab', 'heavy']);
          return st.c ? st.c(st, me, op) : BLK;
        },
        win: R => R.my('block', e => !e.low) && R.my('hit'), miss: R => R.op('hit', e => e.wrong) ? '蹲着挡不住空中招 —— 站着挡' : R.my('block') ? '挡住了 —— 他一落地就打' : null },
    ];
    if (an === 'airKick') list.push(
      { id: 'airKick.duck', topic: an, name: '蹲下躲开', at: 210, act: jumpAtk(key),
        how: ['他跳起来蹬过来的时候，按住 [蹲]', '飞踢从头顶过去（蹲下躲得开飞踢，别的空中招躲不开）'],
        why: '蹲下能躲飞踢',
        demo: (st, me, op) => (isMove(op, 'airKick') || st.d) && op.airborne ? (st.d = 1, DWN) : (st.d = 0, 0),
        win: R => R.my('dodge'), miss: R => R.op('hit') ? '蹲晚了 —— 看见他蹬腿就蹲' : null },
      { id: 'airKick.kick', topic: an, name: '地上出腿顶回去', at: 215, act: jumpAtk(key),
        how: ['他跳起来朝你飞、过了最高点往下落的时候就按 [踢]（腿前摇长，要提前，别等他蹬出来）', '地上的腿撞上空中的腿：他被顶得翻滚回去'],
        why: '空中的腿撞上地上的腿 = 空中那个翻滚回去，地上的不掉血',
        demo: (st, me, op) => op.airborne && gap(me, op) <= 170 && op.vz < 4 && !st.k ? (st.k = 1, TAP('kick')) : 0,
        win: R => R.my('tumble'), miss: R => R.op('hit') ? '腿起晚了 —— 他一蹬腿你就踢' : null });
    return list;
  }),
  /* —— 千斤坠 —— */
  { id: 'dive.jab', topic: 'dive', name: '站着出拳迎（倒栽葱）', at: 140, act: jumpAtk('d:kick', 100),
    how: ['他先往上腾一下（要踩了），这时候别蹲、别出托天掌', '站着等，他斜着踩下来快到你头顶时按 [拳]', '站着的拳迎面打中千斤坠 = 倒栽葱 ×1.4'],
    why: '千斤坠怕站着的拳；对空招打不到它、反被踩倒',
    demo: (st, me, op) => isMove(op, 'dive') && !st.j && Drill.diveReady(me, op) ? (st.j = 1, TAP('jab')) : 0,
    win: R => R.my('hit', e => /倒栽葱/.test(e.how)), miss: R => R.op('hit') ? '拳出晚了（或者你蹲着）—— 他快踩到你头顶就出拳' : null },
  { id: 'dive.block', topic: 'dive', name: '站着挡，再打', at: 200, act: jumpAtk('d:kick'),
    how: ['他腾起来要踩，按住 [挡]（站着挡，千斤坠是上段）', '挡住了他往后弹开，落地后你先动：冲过去打他'],
    why: '千斤坠被站挡住，往后翻着弹开',
    demo: (st, me, op) => {
      if (me.state === 'blockstun') { st.b = 1; return BLK; }
      if (st.b && me.actionable() && !op.airborne) { if (gap(me, op) > MOVES.jab.reach) return TW(me, op); if (!st.c) st.c = chain(['jab', 'jab', 'heavy']); }
      return st.c ? st.c(st, me, op) : st.b ? 0 : BLK;
    },
    win: R => R.my('block', e => e.name === 'dive') && R.my('hit'), miss: R => R.my('block') ? '挡住了 —— 他落地你过去打' : null },
  { id: 'dive.kick', topic: 'dive', name: '地上出腿顶回去', at: 210, act: jumpAtk('d:kick'),
    how: ['他先往上腾一下（要踩了）—— 一看见他腾起来就按 [踢]（腿前摇长，要提前）', '地上的腿迎上空中的腿：他翻滚回去'],
    why: '地上出腿迎上千斤坠 = 顶得它翻滚回去（他悬着的那一下就要起腿）',
    demo: (st, me, op) => isMove(op, 'dive') && op.move.t >= 2 && op.move.t <= 6 && !st.k ? (st.k = 1, TAP('kick')) : 0,
    win: R => R.my('tumble'), miss: R => R.op('hit') ? '腿起晚了' : null },
  /* —— 擒拿 —— */
  { id: 'grab.strike', topic: 'grab', name: '先打一下（打击克擒拿）', at: 76, act: seq('grab'),
    how: ['他贴上来伸手要抓，马上按 [拳]', '打击打断擒拿：拳比擒拿快'],
    why: '打击克擒拿：任何正在判定中的打击都打断擒拿',
    demo: onStart(['grab'], TAP('jab'), 1), win: R => R.my('hit', e => e.bMove === 'grab'),
    miss: R => R.op('grab') ? '被抓了 —— 他一伸手就出拳' : null },
  { id: 'grab.duck', topic: 'grab', name: '蹲下躲开，打它收招', at: 76, act: seq('grab'),
    how: ['他伸手要抓，按住 [蹲]', '站着的擒拿抓不到蹲着的人，他抓空了收招很长', '起来马上 [拳] [拳] [重]'],
    why: '站着的擒拿抓不到蹲着的（要用抄腿）',
    demo: (st, me, op) => {
      if (isMove(op, 'grab') && !st.miss) return DWN;
      if (st.miss || R_has(st, 'grabMiss')) { st.miss = 1; if (!st.c) st.c = chain(['jab', 'jab', 'heavy']); return st.c(st, me, op); }
      return 0;
    },
    win: R => R.op('grabMiss', e => e.why === 'duck') && R.my('hit'), miss: R => R.op('grab') ? '被抓了 —— 他一伸手就蹲' : R.op('grabMiss') ? '躲开了 —— 起来打他收招' : null },
  { id: 'grab.escape', topic: 'grab', name: '被抓住马上挣脱', at: 76, act: seq('grab'),
    how: ['这一课先让他抓住', '被揪住的那一下马上按 [拿] —— 挣脱', '晚了就挣不开了（接腿、抄腿、借力摔都挣不开）'],
    why: '擒住刚开始那几帧按拿能挣脱，两边一起弹开',
    demo: (st, me) => me.grabbed ? TAP('grab') : 0, win: R => R.my('escape'),
    miss: R => R.op('grab') ? '挣晚了 —— 一被揪住就按 [拿]' : null },
  /* —— 抄腿 —— */
  { id: 'lowGrab.stand', topic: 'lowGrab', name: '站着别蹲，打它收招', at: 82, act: seq('d:grab'),
    how: ['他蹲下抱过来的时候，站着别动（别蹲、别蹲挡）', '抄腿抓不到站着的人，他抓空收招很长', '马上 [拳] [拳] [重]'],
    why: '抄腿只抓蹲着的和出腿的，抓不到站着的',
    demo: (st, me, op) => {
      if (st.miss || R_has(st, 'grabMiss')) { st.miss = 1; if (!st.c) st.c = chain(['jab', 'jab', 'heavy']); return st.c(st, me, op); }
      return 0;
    },
    win: R => R.op('grabMiss', e => e.why !== 'duck') && R.my('hit'), miss: R => R.op('grab') ? '被抄住了 —— 别蹲' : R.op('grabMiss') ? '躲开了 —— 马上打他' : null },
  { id: 'lowGrab.jab', topic: 'lowGrab', name: '短拳打断', at: 82, act: seq('d:grab'),
    how: ['他一蹲身要抄，马上按 [拳]', '抄腿前摇慢，短拳先打到'],
    why: '打击克擒拿：抄腿也一样',
    demo: onStart(['lowGrab'], TAP('jab'), 1), win: R => R.my('hit', e => e.bMove === 'lowGrab') },
  /* —— 铁山靠 —— */
  { id: 'shoulder.kick', topic: 'shoulder', name: '腿迎上去', at: 260, act: runAtk('heavy', 134),
    how: ['他跑过来的时候，估计着他快进你腿的射程就按 [踢]（提前一点按，他跑得快）', '腿克重：铁山靠是重系；打在全速跑过来的人身上还有迎击 ×1.2'],
    why: '腿克重 + 迎击：腿射程长，正好迎上去',
    demo: (st, me, op) => (op.state === 'run' || isMove(op, 'shoulder')) && !st.k && gap(me, op) - Math.abs(op.vxRun || 6.5) * (MOVES.kick.S - 2) <= effR('kick') ? (st.k = 1, TAP('kick')) : 0,
    win: R => R.my('hit', e => MOVES[e.name] && MOVES[e.name].tier === 'kick'), miss: R => R.op('hit') ? '腿出晚了 —— 他还没到就要按' : R.opWhiff('shoulder') ? '他的铁山靠打空了 —— 下回迎上去' : null },
  { id: 'shoulder.grab', topic: 'shoulder', name: '擒拿比它快', at: 260, act: runAtk('heavy', 134),
    how: ['他跑过来一扛肩膀（铁山靠前摇），马上按 [拿]', '擒拿比铁山靠快；霸体只防拳，不防擒拿'],
    why: '霸体（重拳、铁山靠）的破法：腿系、擒拿、连打',
    demo: onStart(['shoulder'], TAP('grab'), 1), win: R => R.my('grab', e => e.bMove === 'shoulder'),
    miss: R => R.op('hit') ? '抓晚了 —— 他一扛肩就按 [拿]' : null },
  { id: 'shoulder.punish', topic: 'shoulder', name: '挡住打收招', at: 260, act: runAtk('heavy', 134),
    how: ['按住 [挡] 挡住铁山靠（会被撞开一点）', '一能动就冲过去打他收招'],
    why: '挡后反击：铁山靠被挡住收招长',
    demo: (st, me, op) => {
      if (me.state === 'blockstun') { st.b = 1; return BLK; }
      if (st.b && me.actionable()) { if (gap(me, op) > effR('jab')) return TW(me, op); if (!st.c) st.c = chain(['jab', 'jab', 'heavy']); }
      return st.c ? st.c(st, me, op) : st.b ? 0 : BLK;
    },
    win: R => R.my('block', e => e.name === 'shoulder') && R.my('hit'), miss: R => R.my('block') ? '挡住了 —— 一能动就冲过去' : null },
  /* —— 冲刺 · 冲势 —— */
  { id: 'dash.parry', topic: 'dash', name: '卸力', at: 136, act: dashAtk('jab'),
    how: ['他双击冲进来，冲刺里一定会出招（冲势）', '他冲到跟前、拳快到的一瞬间刚按下 [挡] —— 卸力'],
    why: '冲进来的时机好猜，最适合卸力',
    demo: (st, me, op) => {
      if ((isMove(op, 'jab') && toHit(op) <= 3) && !st.p) { st.p = 1; st.h = 8; }
      if (st.h > 0) { st.h--; return BLK; }
      return 0;
    },
    win: R => R.my('parry'), miss: R => R.my('block') ? '挡住了没卸：按早了' : R.op('hit') ? '按晚了' : null },
  { id: 'dash.meet', topic: 'dash', name: '冲刺收尾先打它（迎击）', at: 180, act: dashAtk(null),
    how: ['他双击冲进来（这一课他冲完不出招）', '冲刺前几帧谁也打不中他；等他冲到跟前快停下的时候按 [拳]', '打在冲刺收尾的人身上 = 迎击 ×1.2'],
    why: '迎击：打在全速跑过来、或冲刺收尾（无敌帧过了）的人身上 ×1.2',
    demo: (st, me, op) => isMove(op, 'dash') && op.move.t >= 7 && gap(me, op) <= MOVES.jab.reach + 6 && !st.j ? (st.j = 1, TAP('jab')) : 0,
    win: R => R.my('hit', e => /迎击/.test(e.how)), miss: R => R.my('hit') ? '打中了，但不是迎击 —— 等他快冲完那一下打' : null },
  /* —— 跑过来 —— */
  { id: 'run.meet', topic: 'run', name: '迎击（腿踢射程长）', at: 280, act: runAtk(null, 96),
    how: ['他全速跑过来（这一课他跑到跟前就停）', '他快进你腿的射程就按 [踢]', '打在全速跑过来的人身上 = 迎击 ×1.2'],
    why: '迎击：腿踢射程长，正好迎上去',
    demo: (st, me, op) => op.state === 'run' && !st.k && gap(me, op) - 6.3 * (MOVES.kick.S - 1) <= effR('kick') ? (st.k = 1, TAP('kick')) : 0,
    win: R => R.my('hit', e => /迎击/.test(e.how)), miss: R => R.my('hit') ? '打中了，但他已经停下了 —— 早一点' : null },
  /* —— 站挡 / 蹲挡 / 边挡边走（被动课：你出招）—— */
  { id: 'guard.grab', topic: 'guard', name: '擒拿（挡不住）', react: true, pose: () => BLK, at: 80,
    how: ['走到他跟前（贴近）', '按 [拿]：擒拿挡不住', '抓住后按 [重] 过肩摔 / [踢] 别腿摔 / [拳] 提膝撞'],
    why: '擒拿克格挡',
    demo: (st, me, op) => gap(me, op) > 74 ? TW(me, op) : isMove(me, 'hold') ? TAP('heavy') : st.g ? 0 : (st.g = 1, TAP('grab')),
    win: R => R.my('grab', e => e.kind === 'grab'), miss: () => '贴近了再抓（擒拿只够得着 84 那么远）' },
  { id: 'guard.low', topic: 'guard', name: '打下段', react: true, pose: () => BLK, at: 84,
    how: ['他站着挡：按住 [蹲] + [拳]（下盘拳）或 [蹲] + [踢]（扫堂腿）', '下段站着挡不住'],
    why: '站挡怕下段',
    demo: (st, me, op) => gap(me, op) > 84 ? TW(me, op) : st.g ? 0 : (st.g = 1, DWN | TAP('jab')),
    win: R => R.my('hit', e => e.height === 'low'), miss: R => R.op('block') ? '被挡住了：要按住 [蹲] 出下段' : null },
  { id: 'crouch.tackle', topic: 'crouch', name: '抄腿（蹲 + 拿）', react: true, pose: () => BLK | DWN, at: 80,
    how: ['他蹲着挡：站着的擒拿抓不到蹲着的', '按住 [蹲] 再按 [拿] —— 抄腿，抓蹲着的人'],
    why: '蹲挡怕抄腿和上段',
    demo: (st, me, op) => gap(me, op) > 80 ? TW(me, op) : st.g ? 0 : (st.g = 1, DWN | TAP('grab')),
    win: R => R.my('grab', e => e.kind === 'tackle'), miss: R => R.my('grabMiss') ? '站着抓的抓不到蹲着的 —— 蹲 + 拿' : null },
  { id: 'crouch.high', topic: 'crouch', name: '打上段（劈挂掌）', react: true, pose: () => BLK | DWN, at: 94,
    how: ['他蹲着挡：上段打得穿', '[重] 接着再按 [重] —— 劈挂掌（上段，从上往下劈）', '跳起来打的空中招也是上段'],
    why: '蹲挡怕上段（劈挂掌、空中招）',
    demo: (st, me, op) => gap(me, op) > 94 ? TW(me, op) : (st.c = st.c || chain(['heavy', 'heavy']))(st, me, op),
    win: R => R.my('hit', e => e.height === 'high'), miss: () => '重 重 第二下是劈挂掌（上段）' },
  { id: 'gwalk.grab', topic: 'gwalk', name: '擒拿', react: true, pose: (st, me, op) => BLK | (gap(me, op) > 70 ? TW(me, op) : 0), at: 140,
    how: ['他举着手往你这边挪', '等他进了擒拿的距离按 [拿]（擒拿挡不住）'],
    why: '边挡边走也是在挡：擒拿、下段（站着挡的时候）都破得了',
    demo: (st, me, op) => gap(me, op) <= 80 && !st.g ? (st.g = 1, TAP('grab')) : isMove(me, 'hold') ? TAP('kick') : 0,
    win: R => R.my('grab', e => e.kind === 'grab') },
  { id: 'gwalk.low', topic: 'gwalk', name: '打下段', react: true, pose: (st, me, op) => BLK | (gap(me, op) > 70 ? TW(me, op) : 0), at: 140,
    how: ['他举着手（站着）挪过来', '进了射程按住 [蹲] + [踢]（扫堂腿）或 [蹲] + [拳]'],
    why: '站着挡怕下段',
    demo: (st, me, op) => gap(me, op) <= 108 && !st.g ? (st.g = 1, DWN | TAP('kick')) : 0,
    win: R => R.my('hit', e => e.height === 'low') },
  /* —— 卸力（木桩会卸）—— */
  { id: 'parry.bait', topic: 'parry', name: '骗它按挡，再抓', react: true, pose: 'parry', at: 104,
    how: ['他专等你出招时卡准按挡卸力', '先在拳刚好够不着的地方空出一拳（离他一步多）—— 他以为要打到了，会按挡', '他按过挡 24 帧内卸不了第二次：马上贴上去按 [拿]'],
    why: '卸力要「刚按下」挡：两次按挡隔不到 24 帧没有卸力 —— 停一拍、骗一下再打；擒拿本来就卸不了',
    demo: (st, me, op) => {
      const d = gap(me, op);
      if (!st.f) { if (d > 106) return TW(me, op); if (d < 98) return BLK | AW(me, op); if (!me.actionable()) return 0; st.f = 1; return TAP('jab'); }
      if (st.f === 1) { if (me.actionable() && op.clock - op.blockPress < 20) st.f = 2; else return 0; }
      if (st.f === 2) { if (d > 76) return TW(me, op); st.f = 3; return TAP('grab'); }
      return isMove(me, 'hold') ? TAP('heavy') : 0;
    },
    win: R => R.my('grab', e => e.kind === 'grab') && !R.op('parry'),
    miss: R => R.op('parry') ? '被卸了 —— 先骗他按一下挡，再马上抓' : R.op('block') ? '打在他挡上了 —— 骗完了用擒拿' : null },
  { id: 'parry.grab', topic: 'parry', name: '擒拿卸不了', react: true, pose: 'parry', at: 80,
    how: ['他等着卸你的拳脚', '擒拿卸不了：贴近了直接 [拿]'],
    why: '卸力只防打击，擒拿卸不了',
    demo: (st, me, op) => gap(me, op) > 76 ? TW(me, op) : st.g ? (isMove(me, 'hold') ? TAP('heavy') : 0) : (st.g = 1, TAP('grab')),
    win: R => R.my('grab', e => e.kind === 'grab') },
  /* —— 推挡 —— */
  { id: 'shove.grab', topic: 'shove', name: '擒拿（推挡只防打击）', react: true, pose: 'shove', at: 80,
    how: ['他挡住你的拳就推开你', '别打他，贴近了 [拿]'],
    why: '推挡只防打击，擒拿照样抓',
    demo: (st, me, op) => gap(me, op) > 76 ? TW(me, op) : st.g ? (isMove(me, 'hold') ? TAP('kick') : 0) : (st.g = 1, TAP('grab')),
    win: R => R.my('grab', e => e.kind === 'grab') },
  /* —— 截拳 —— */
  { id: 'jieQuan.grab', topic: 'jieQuan', name: '擒拿', react: true, pose: 'jieQuan', at: 80, opQi: 100,
    how: ['别往他格挡上打（打了他就截拳）', '贴近了直接 [拿]'],
    why: '截拳是从格挡里打出来的，你不打他就出不了；擒拿挡不住',
    demo: (st, me, op) => gap(me, op) > 76 ? TW(me, op) : st.g ? (isMove(me, 'hold') ? TAP('heavy') : 0) : (st.g = 1, TAP('grab')),
    win: R => R.my('grab', e => e.kind === 'grab') },
  /* —— 接腿（木桩专等你出腿）—— */
  { id: 'catch.jab', topic: 'catch', name: '改用拳', react: true, pose: 'catch', at: 96,
    how: ['他专等你出腿接腿摔', '别从远处起腿：贴近了用 [拳]，拳收得快他接不到'],
    why: '接腿摔怕的是拳：出腿别太早、太远让人看着接',
    demo: (st, me, op) => gap(me, op) > 88 ? TW(me, op) : st.g ? 0 : (st.g = 1, TAP('jab')),
    win: R => R.my('hit', e => MOVES[e.name] && MOVES[e.name].tier === 'light') && !R.op('grab'), miss: R => R.op('grab') ? '被接腿了 —— 换拳' : null },
  /* —— 闪身（木桩钻过来）—— */
  { id: 'slip.jab', topic: 'slip', name: '出拳截住（×1.3）', at: 110,
    act: (st, me, op) => st.i === 0 || st.i === 2 ? BLK | TW(me, op) : st.i < 6 ? BLK : st.i > 8 && me.actionable() ? 'done' : 0,
    how: ['他按着挡朝你双击，压低身子从你身边钻过来', '闪身只躲得过重拳：看见他钻就按 [拳]（腿、下段、擒拿也行）', '截住闪身 ×1.3'],
    why: '闪身只躲得过重拳，短拳、腿、下段、擒拿都截得住它',
    demo: (st, me, op) => isMove(op, 'slip') && !st.j ? (st.j = 1, TAP('jab')) : 0,
    win: R => R.my('hit', e => /截住闪身/.test(e.how)), miss: R => R.op('slip') ? '你出的是重拳？重拳被它躲过去了 —— 换短拳' : null },
  /* —— 爆气（你连打它，它爆）—— */
  { id: 'burst.block', topic: 'burst', name: '打两下就收手举挡', react: true, pose: 'burst', at: 84,
    how: ['他气条过了一半（这一课他一直有气）：挨了两下他就会爆', '打他两下就收手，马上按住 [挡]（别打第三下）', '他爆气面朝你挡住只吃三成，接着打他爆完的后摇'],
    why: '爆气只在挨打时能爆：连招别拖长，看他气条过半就收着打',
    demo: (st, me, op) => {
      if (!st.c) { if (gap(me, op) > 84) return TW(me, op); st.c = chain(['jab', 'jab']); }
      if (st.c && (st.ci || 0) < 2) return st.c(st, me, op);
      return BLK;
    },
    win: R => R.op('burst', e => e.blocked), miss: R => R.op('burst', e => e.hit) ? '被爆倒了 —— 打两下就举手挡' : null },
  /* —— 泼墨 —— */
  { id: 'super.punish', topic: 'super', name: '挡住打收招（×1.5）', at: 110, act: (st, me) => st.i === 0 ? TAP('heavy') | TAP('kick') : st.i > 3 && me.actionable() ? 'done' : 0, opQi: 100,
    how: ['按住 [挡] 挡住泼墨（只掉三成）', '泼墨收招很长：一能动就 [拳] [拳] [重]'],
    why: '泼墨是击倒招：挡住后反击 ×1.5',
    demo: punishAfterBlock(), win: R => R.my('hit', e => /挡后反击/.test(e.how)) },
  { id: 'super.parry', topic: 'super', name: '卸力', at: 110, act: (st, me) => st.i === 0 ? TAP('heavy') | TAP('kick') : st.i > 3 && me.actionable() ? 'done' : 0, opQi: 100,
    how: ['别按着挡', '泼墨快打到的一瞬间刚按下 [挡]'],
    why: '泼墨也卸得掉',
    demo: parryAt(['super']), win: R => R.my('parry') },
  /* —— 起身攻防 —— */
  { id: 'wake.meaty', topic: 'wake', name: '压起身（短拳）', react: true, scene: 'opDown', at: 70,
    how: ['他倒在你跟前（这一课每遍先把他放倒）', '站在他身边等他起身', '他快站起来的时候按 [拳]：打在起身硬直里，必中'],
    why: '起身硬直：被打倒的人站起来那几帧挨得了打、动不了。短拳快，算好时机必中；重拳、腿太慢要提前',
    demo: (st, me, op) => op.state === 'down' && op.downPhase === 'getup' && GETUP - op.t <= MOVES.jab.S + 1 && !st.j ? (st.j = 1, TAP('jab')) : 0,
    win: R => R.my('hit', e => e.rising), miss: R => R.my('hit') ? '打早了 —— 起身那一下打不中，要等他站起来' : null },
  { id: 'wake.roll', topic: 'wake', name: '被压起身：滚身起', react: true, scene: 'meDown', at: 70, late: true,
    how: ['这一课每遍先把你放倒，他守在你起身的地方出拳', '倒地时按住 [前] 或 [后]：起身时往那边滚开', '滚开了他就打空'],
    why: '滚身起：躲开守在你起身处的人',
    demo: (st, me, op) => {
      if (me.state !== 'down') return 0;
      const away = me.x >= op.x ? 1 : -1, room = away > 0 ? WALL_R - me.x : me.x - WALL_L;   // 背后没地方滚了就往他脚下滚
      return room > ROLL_DIST + 30 ? AW(me, op) : TW(me, op);
    },
    win: R => R.rolled && !R.op('hit'), miss: R => !R.rolled ? '倒地时按住方向键再起来' : R.op('hit') ? '滚了还是挨打：往另一边滚试试' : null },
  { id: 'wake.cross', topic: 'wake', name: '他往你脚下滚：转身出拳', react: true, scene: 'opDownRoll', at: 70,
    how: ['他倒在你跟前，起身时往你脚下滚到你身后', '你会自动转过去：看见他滚过来，等他站起来那一下按 [拳]'],
    why: '往你脚下滚：看见了转身出拳还来得及（他滚完站起来那几帧是起身硬直）',
    demo: (st, me, op) => op.state === 'rise' && !st.j ? (st.j = 1, TAP('jab')) : 0,
    win: R => R.my('hit', e => e.rising), miss: R => R.my('hit') ? '打早了 —— 等他站起来' : null },
];
DRILLS.forEach(d => { d.need = d.need || 3; d.topicName = (DRILL_TOPICS.find(t => t[0] === d.topic) || [])[1]; });
// 被动课的木桩出招方法（同一种架势好几课共用）
const DRILL_POSE = {
  // 卸力：看你出招（打击），卡在打到前 3 帧刚按下挡；按过挡 24 帧内卸不了
  parry: (st, me, op) => {
    const m = op.move;
    if (op.state === 'attack' && m && !m.def.script && m.def.kind !== 'grab' && toHit(op) <= 3 && toHit(op) >= 1 && st.pser !== m.serial && gap(me, op) <= effR(m.name) + 10) { st.pser = m.serial; st.ph = 10; }
    if (st.ph > 0) { st.ph--; return BLK; }
    return 0;
  },
  // 推挡：一直举着手，挡住了就按拳推开
  shove: (st, me) => me.state === 'blockstun' ? BLK | TAP('jab') : BLK,
  // 推挡（性子急的）：举着手，你一走进 125 以内就推（推空了有收招）；推完歇一会儿
  shoveEarly: (st, me, op) => {
    if ((st.cool = (st.cool || 0) - 1) <= 0 && me.state === 'block' && gap(me, op) <= 125 && gap(me, op) > MOVES.shove.reach + 2) { st.cool = 70; return BLK | TAP('jab'); }
    return me.state === 'blockstun' ? BLK | TAP('jab') : BLK;
  },
  // 截拳：一直举着手，挡住了就按重截拳
  jieQuan: (st, me) => me.state === 'blockstun' ? BLK | TAP('heavy') : BLK,
  // 接腿：看你一出腿（站着出的腿）就伸手
  catch: (st, me, op) => isMove(op, 'kick', 'whip', 'backKick', 'twinKick') && st.cs !== op.move.serial ? (st.cs = op.move.serial, TAP('grab')) : 0,
  // 闪身：离你 110 左右就按着挡朝你双击钻过来
  slip: (st, me, op) => {
    if (st.sq && st.sq.length) return BLK | st.sq.shift();
    if (me.actionable() && gap(me, op) <= 116 && gap(me, op) >= 96 && (st.cool = (st.cool || 0) - 1) <= 0) { st.cool = 70; st.sq = [TW(me, op), 0, TW(me, op)]; return BLK; }
    return gap(me, op) > 116 ? TW(me, op) : 0;
  },
  // 爆气：挨了两下，再挨的时候反应过来（12 帧，和人差不多）就爆；你接着出第三下也爆
  burst: (st, me, op) => {
    st.ht = me.state === 'hit' && me.comboTaken >= 2 && !me.grabbed ? (st.ht || 0) + 1 : 0;
    return st.ht >= 12 || (st.ht > 1 && op.state === 'attack' && op.move && op.move.t <= 2) ? TAP('heavy') | TAP('kick') : 0;
  },
};
const R_has = (st, type) => !!(Drill.cur && Drill.cur.rep && Drill.cur.rep.ev.some(e => e.type === type));   // 演示用：这一遍里有没有发生过
// 2.2 出招提示：木桩站好位置以后倒数多久再出手（3 · 2 · 1，每个数 DRILL_CUE / 3 帧）；关了提示就照以前随机等 24 ~ 54 帧
const DRILL_CUE = 66;
// 2.2 选课面板的分组（对手的招 → 哪一组）
const DRILL_GROUPS = [
  ['single', '单招', ['jab', 'lowJab', 'heavy', 'kick', 'sweep', 'palm', 'grab', 'lowGrab']],
  ['combo', '连招', ['rush', 'upper', 'beng', 'whip', 'backKick', 'chop', 'whirl', 'hammer', 'twin', 'lowSweep']],
  ['air', '空中', ['airJab', 'airHeavy', 'airKick', 'dive']],
  ['rush', '冲撞', ['shoulder', 'dash', 'run']],
  ['guard', '破防守', ['guard', 'crouch', 'gwalk', 'parry', 'shove', 'jieQuan', 'catch', 'slip', 'burst']],
  ['other', '必杀 · 起身', ['super', 'wake']],
];
// 2.2 每一种对手的招配一张动作小图（guide.js PoseIcon 的写法）
const DRILL_ICON = {
  jab: { move: 'jab' }, lowJab: { move: 'lowJab' }, rush: { move: 'rushR' }, upper: { move: 'upper' }, heavy: { move: 'heavy' }, chop: { move: 'chop' },
  whirl: { move: 'whirl' }, beng: { move: 'beng' }, whip: { move: 'whip' }, backKick: { move: 'backKick' }, hammer: { move: 'hammer' }, lowSweep: { move: 'sweep' },
  kick: { move: 'kick' }, twin: { move: 'twinKick' }, sweep: { move: 'sweep' }, palm: { move: 'palm' }, airHeavy: { move: 'airHeavy', alt: 54, ph: 1.6 },
  airKick: { move: 'airKick', alt: 60, ph: 1.6 }, airJab: { move: 'airJab', alt: 64, ph: 1.6 }, dive: { move: 'dive', alt: 66, ph: 1.4 }, grab: { move: 'grab', ph: 1.6 },
  lowGrab: { move: 'lowGrab', ph: 1.6 }, shoulder: { move: 'shoulder' }, dash: { move: 'dash', ph: 0.3 }, run: { run: true }, guard: { pose: 'block' },
  crouch: { pose: 'cblock' }, gwalk: { pose: 'block' }, parry: { pose: 'parry' }, shove: { move: 'shove' }, jieQuan: { move: 'jieQuan' },
  catch: { move: 'grab', ph: 1.6 }, slip: { move: 'slip', ph: 0.3 }, burst: { move: 'burst', ph: 0.25 }, super: { move: 'super' }, wake: { pose: 'rise' },
};

/* ---------- 木桩、演示里的你 ---------- */
class DrillBot {
  constructor(f, def) { this.f = f; this.def = def; this.st = { phase: 'set', t: 0 }; }
  tick(locked) {
    const f = this.f; f.noParry = true;
    if (locked || game.paused) { applyInput(f, 0); return; }
    applyInput(f, Drill.botStep(this.st, f, f.opp) | 0);
  }
}
class DrillDemo {
  constructor(f, def) { this.f = f; this.def = def; }
  tick(locked) {
    const f = this.f; f.noParry = false;
    const c = Drill.cur;
    if (locked || !c || game.paused) { applyInput(f, 0); return; }
    // 主动课（木桩出招）：两遍之间演示的你不出招，只照样举着手 / 蹲着（挡的课一直举着手，不然他出招那一下刚按挡就成了卸力）
    if (!c.rep && !this.def.react && !this.def.scene) { applyInput(f, (this.def.demo({}, f, f.opp) | 0) & (BLK | DWN)); return; }
    applyInput(f, this.def.demo(c.ds, f, f.opp) | 0);
  }
}

/* ---------- 一课怎么跑 ---------- */
const Drill = {
  cur: null,
  passes: 0,                // 2.2 一共过了几次关（只给成就「拆招大师」用；不记哪一课过没过）
  cue: true,                // 2.2 出招提示（倒数、「!」）
  onDemoEnd: null,          // ui.js：演示放完了
  onPass: null,             // ui.js：过关了
  load() {
    try {
      this.passes = Math.max(0, parseInt(localStorage.getItem('modou.drillPasses'), 10) || 0);
      this.cue = localStorage.getItem('modou.drillCue') !== '0';
      localStorage.removeItem('modou.drills');            // 2.1 记的「哪些课过了」不要了（2.2 起不算「已完成」）
    } catch (e) {}
  },
  save() { try { localStorage.setItem('modou.drillPasses', String(this.passes)); localStorage.setItem('modou.drillCue', this.cue ? '1' : '0'); } catch (e) {} },
  setCue(on) { this.cue = !!on; this.save(); },
  byId: id => DRILLS.find(d => d.id === id),
  // 下一课：同一招的下一种破法，没有了就下一种招的第一课（最后一课的下一课是第一课）
  next(id) { const i = DRILLS.findIndex(d => d.id === id); return DRILLS[(i + 1) % DRILLS.length]; },
  // 开始一课（demo = 演示）：只在训练场
  start(id, demo) {
    const def = this.byId(id); if (!def) return;
    if (game.mode !== 'train') startMatch('train');
    resetFighters(); game.phase = 'fight'; game.paused = false;
    F2.maxHp = DUMMY_HP; F2.hp = F2.lagHp = DUMMY_HP;
    this.cur = { def, demo: !!demo, ok: 0, tries: 0, rep: null, last: null, lastT: -999, passed: false, demoReps: 0, frame: 0, ds: {}, count: null, goAt: -999, passAt: -1 };
    game.brains = [demo ? new DrillDemo(F1, def) : null, new DrillBot(F2, def)];
    const p0 = STAGE_W / 2 - (def.at || 120) / 2;
    F1.x = p0; F2.x = p0 + clamp(def.at || 120, 60, 300); F1.facing = 1; F2.facing = -1;
    if (def.at >= 180) { F1.x = STAGE_W / 2 - def.at / 2; F2.x = STAGE_W / 2 + def.at / 2; }
    CEV.on = (type, A, B, x) => this.ev(type, A, B, x);
  },
  stop() {
    this.cur = null; CEV.on = null;
    if (game.mode === 'train') { game.brains = [null, new Dummy(F2, game.dummyMode)]; }
  },
  // 战斗事件 → 记进这一遍。actor：这件事是谁「做成」的（打中的人、挡住的人、卸力的人……）
  ev(type, A, B, x) {
    const c = this.cur; if (!c || !c.rep) return;
    const actorA = { hit: 1, press: 1, tumble: 1, shove: 1, grabMiss: 1, grab: 1, escape: 1, burst: 1, clash: 1, tech: 1 }[type];
    const actor = actorA ? A : B;
    c.rep.ev.push(Object.assign({ type: type === 'guard' ? 'block' : type, mine: actor === F1, t: c.rep.t }, x));
    this.check();
  },
  // 这一遍成没成功（R：查这一遍里发生过的事）
  R(rep) {
    const ev = rep.ev;
    return {
      my: (type, f) => ev.some(e => e.type === type && e.mine && (!f || f(e))),
      op: (type, f) => ev.some(e => e.type === type && !e.mine && (!f || f(e))),
      opWhiff: name => rep.whiff.includes(name),
      wasAir: rep.air, rolled: rep.rolled,
    };
  },
  check(final) {
    const c = this.cur, rep = c && c.rep;
    if (!rep || rep.won || (c.def.late && !final)) return;      // late：要看完整个一遍才知道（比如滚开了有没有挨打）
    if (c.def.win(this.R(rep))) {
      rep.won = true; c.ok++; c.last = { ok: true, text: '成功！' + (c.demo ? '' : c.ok >= c.def.need ? '' : `（还要 ${c.def.need - c.ok} 次）`) }; c.lastT = c.frame;
      if (!c.demo) Sound.stamp && Sound.stamp();
      if (!c.demo && c.ok >= c.def.need && !c.passed) {
        c.passed = true; c.passAt = c.frame; this.passes++; this.save();
        // 2.3：「过关」印章盖在上面的练习面板上（render.js drawDrillPanel，以前盖在你头顶、被面板挡住），配一声锣
        if (Sound.luogu) Sound.luogu('仓', 0.75);
        if (this.onPass) this.onPass(c.def);
      }
    }
  },
  // 一遍结束：没成功就说哪里不对
  endRep() {
    const c = this.cur, rep = c.rep; if (!rep) return;
    this.check(true);
    c.rep = null; c.tries++; c.ds = {};                 // 演示里「你」的记录：一遍一清
    if (!rep.won) {
      const R = this.R(rep), why = c.def.miss && c.def.miss(R);
      c.last = { ok: false, text: why || (rep.ev.some(e => e.type === 'hit' && !e.mine) ? '挨打了 —— 再看看说明的时机' : '没破成 —— 照说明再来') };
      c.lastT = c.frame;
    }
    if (c.demo && ++c.demoReps >= 2 && (c.ok >= 1 || c.demoReps >= 4)) { const cb = this.onDemoEnd; this.stop(); if (cb) cb(); }
  },
  startRep() {
    const c = this.cur;
    c.rep = { t: 0, ev: [], whiff: [], air: false, rolled: false, won: false };
  },
  // 每帧（训练场 trainTick 里调）：这一遍的计时、记打空的招、跳没跳、滚没滚；被动课按你出招开一遍
  tick() {
    const c = this.cur; if (!c) return;
    c.frame++;
    const me = F1, op = F2, def = c.def;
    if (def.meQi) me.qi = Math.max(me.qi, def.meQi);
    if (def.opQi && !(c.rep && c.rep.t > 0 && def.opQi < QI_MAX)) op.qi = Math.max(op.qi, def.opQi);
    if (def.pose === 'burst') op.qi = Math.max(op.qi, QI_BURST + 10);
    const rep = c.rep;
    // 被动课：你出一招（打击或擒拿）就算一遍；起身课按场景开
    if (def.react && !def.scene && !def.trigger && !rep && me.state === 'attack' && me.move && !me.move.def.script && me.move.serial !== c.mSer) { c.mSer = me.move.serial; this.startRep(); }
    if (def.trigger === 'jump' && !rep && (me.state === 'jumpsquat' || me.airborne)) this.startRep();
    if (def.trigger === 'op' && !rep && op.state === 'attack' && op.move && op.move.serial !== c.oSer) { c.oSer = op.move.serial; this.startRep(); }
    if (!c.rep) return;
    const r = c.rep; r.t++;
    if (me.airborne) r.air = true;
    if (me.state === 'down' && me.downPhase === 'getup' && me.rollDir) r.rolled = true;
    const om = op.state === 'attack' ? op.move : null;
    if (r.oMove && (!om || om.serial !== r.oMove.serial)) { if (!r.oMove.hit && !r.oMove.blocked && !r.oMove.def.script) r.whiff.push(r.oMove.name); r.oMove = null; }
    if (om) r.oMove = om;
    this.check();                    // 有的课要看「他打空了」这种每帧才记得到的事
    // 一遍什么时候算完：木桩出完招 / 你出完招，两人都能动了，再等一下（看后面的反打）
    const calm = me.actionable() && (op.actionable() || op.state === 'block' || op.state === 'crouch');
    r.calm = calm ? (r.calm || 0) + 1 : 0;
    const passive = def.react || def.scene, ready = passive ? r.t > 30 : c.botDone;
    if ((ready && r.calm > (passive ? 24 : 30)) || r.t > 300) this.endRep();
  },
  // 木桩每帧：站位 → 等一会儿 → 出招 → 等两边停下
  botStep(st, me, op) {
    const c = this.cur, def = c && c.def;
    if (!def) return 0;
    if (def.scene) return this.sceneStep(st, me, op);
    if (def.react) {
      const pose = typeof def.pose === 'string' ? DRILL_POSE[def.pose] : def.pose;
      // 太远太近都挪一挪（只在你没出招、他能动的时候）
      if (!c.rep && me.actionable() && op.actionable() && !op.airborne && def.at && def.pose !== 'slip') {
        const d = gap(me, op);
        if (d > def.at + 60 && def.trigger !== 'jump') return TW(me, op);
        // 要你跳过来的课：离得太近就往后撤一点（冲刺撤开；背靠墙就直接摆好）
        if (def.trigger === 'jump' && d < def.at - 30) {
          if (st.dq && st.dq.length) return st.dq.shift();
          if (this.nearWall(me, op)) { this.place(def.at); return 0; }
          st.dq = [AW(me, op), 0, AW(me, op)]; return st.dq.shift();
        }
      }
      return pose ? pose(st, me, op) | 0 : 0;
    }
    const d = gap(me, op);
    if (st.phase === 'set') {
      c.count = null;
      if (c.rep) return 0;                          // 上一遍还没算完
      if (!me.actionable() || !(op.actionable() || op.state === 'block' || op.state === 'crouch')) { st.t = 0; return 0; }
      if (++st.t > 150) { this.place(def.at); st.t = 0; return 0; }
      if (d > def.at + 8) return TW(me, op);
      if (d < def.at - 8) {
        if (def.at - d > 50 && !this.nearWall(me, op)) { st.dq = [AW(me, op), 0, AW(me, op)]; st.phase = 'back'; return st.dq.shift(); }
        if (this.nearWall(me, op)) { this.place(def.at); return 0; }
        return BLK | AW(me, op);
      }
      st.phase = 'wait'; st.t = 0;
      st.w = this.cue && !c.demo ? DRILL_CUE : (def.wait || [24, 54])[0] + (Math.random() * ((def.wait || [24, 54])[1] - (def.wait || [24, 54])[0]) | 0);
      return 0;
    }
    if (st.phase === 'back') {
      if (st.dq.length) return st.dq.shift();
      if (me.actionable()) st.phase = 'set';
      return 0;
    }
    if (st.phase === 'wait') {
      if (Math.abs(d - def.at) > 22) { st.phase = 'set'; st.t = 0; c.count = null; return 0; }
      c.count = this.cue && !c.demo ? { left: st.w - st.t, total: st.w } : null;      // 2.2 倒数（画面上画在木桩头上）
      if (++st.t < st.w) return 0;
      st.phase = 'go'; st.i = 0; st.fired = 0; st.k = 0; st.pick = null; c.count = null; c.goAt = c.frame;
      this.startRep(); c.botDone = false;
    }
    if (st.phase === 'go') {
      const v = def.act(st, me, op); st.i++;
      if (v === 'done' || st.i > 240) { st.phase = 'set'; st.t = 0; c.botDone = true; return 0; }
      return v;
    }
    return 0;
  },
  // 起身课：每一遍先把人放倒
  sceneStep(st, me, op) {
    const c = this.cur, def = c.def;
    if (!c.rep) {
      if (!me.actionable() || !op.actionable()) { c.count = null; return 0; }
      const w = this.cue && !c.demo ? DRILL_CUE : 30;                              // 2.2 出招提示开着：倒数 3 · 2 · 1 再放倒
      c.count = this.cue && !c.demo ? { left: w - st.t, total: w } : null;
      if (++st.t < w) return 0;
      st.t = 0; c.count = null; c.goAt = c.frame; this.place(def.at || 70);
      if (def.scene === 'opDown' || def.scene === 'opDownRoll') { me.knockDown(3, 0, TFH(24), false); st.roll = def.scene === 'opDownRoll'; }
      else { op.knockDown(3, 0, TFH(24), false); st.meaty = 1; }
      this.startRep(); return 0;
    }
    if (def.scene === 'opDownRoll') return me.state === 'down' && st.roll ? TW(me, op) : 0;
    if (def.scene === 'meDown') {
      // 守在他起身的地方：他开始起身就算好时机出拳
      if (op.state === 'down' && op.downPhase === 'getup' && GETUP - op.t <= MOVES.jab.S + 1 && st.meaty) { st.meaty = 0; return TAP('jab'); }
      if (op.state === 'down' && gap(me, op) > 70) return TW(me, op);
      return 0;
    }
    return 0;
  },
  nearWall: (me, op) => { const bx = me.x - (op.x >= me.x ? 1 : -1) * 80; return bx < WALL_L + 30 || bx > WALL_R - 30; },
  // 站位重摆（训练场里可以直接挪）：两人回到场地中间、隔 d
  place(d) {
    const cx = clamp((F1.x + F2.x) / 2, WALL_L + d / 2 + 60, WALL_R - d / 2 - 60), s = F1.x <= F2.x ? 1 : -1;
    F1.x = cx - s * d / 2; F2.x = cx + s * d / 2; F1.kvx = F2.kvx = 0;
  },
  // 千斤坠：现在出拳能不能正好迎上（演示用；和电脑 diveHit 一样算）
  diveReady(me, op) {
    const om = op.move, J = MOVES.jab, k = J.S + 1, hover = Math.max(0, om.S - om.t);
    if (hover >= k) return false;
    const dv = k - hover, vx = om.t > om.S ? op.vx : op.facing * DIVE_VX;
    const alt = op.alt - DIVE_VZ * dv, d = Math.abs(op.x + vx * dv - me.x);
    return alt <= DIVE_AA_ALT + 4 && alt >= 58 && d <= J.reach + 4;
  },
};
Drill.load();
// 文字里的 [拳] 之类换成按键：html = true 给界面用（<kbd>），否则给画面上的字用
const DRILL_KEYS = { 拳: 'jab', 重: 'heavy', 踢: 'kick', 拿: 'grab', 挡: 'block', 蹲: 'down', 跳: 'up' };
function drillText(s, html) {
  return s.replace(/\[([拳重踢拿挡蹲跳前后])\]/g, (m, k) => {
    if (k === '前' || k === '后') {       // 方向：看你站在他哪一边（左 / 右键里朝着他 / 背着他的那个）
      const dirs = `${keyName((Keys.solo.left || [])[0])} / ${keyName((Keys.solo.right || [])[0])}`;
      return html ? `<kbd class="lt" title="${dirs} 里${k === '前' ? '朝着' : '背着'}他的那个">${k === '前' ? '朝他' : '背他'}</kbd>` : `「${k === '前' ? '朝他' : '背他'}」`;
    }
    const key = keyName((Keys.solo[DRILL_KEYS[k]] || [])[0]);
    return html ? `<kbd class="lt">${key}</kbd><b>${k}</b>` : `「${k}」(${key})`;
  });
}
