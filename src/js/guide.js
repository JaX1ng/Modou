'use strict';
/* ============================================================
   2.2 教程（Jack：操作表排版太怪 —— 进阶操作那一张太长，前面几张底下留一大片空白；整个教程重做：
   网页版做好一点，让玩家想看、看得清、看得懂；软件版单独一套更好的文字 + 表格教程）
   · 一份内容（下面 G_ 开头的表），两种排法：
     网页版 Guide：游戏下面一块「教程」，分页 —— 上手 / 招式 / 连招 / 攻防 / 规则 / 查表；招式、连招、技巧都配游戏里的动作小图
     软件版 Manual：菜单、暂停里的「教程」面板，左边章节、右边文字 + 表格（网页版全屏时也用它：全屏时看不到页面下面）
   · 文字里的 [拳] [重] [踢] [拿] [挡] [蹲] [跳] [前] [后] [冲] 换成按键（按你自己设的单人键位显示）；
     2.4 键位里选了「冲刺键」，「双击 [前]」自动写成「按 [冲]」（input.js dashWords）
   · 前摇、伤害、倍率都直接读 MOVES 和 config.js 的常数：改了数值，教程跟着变
   · 动作小图 PoseIcon：用游戏自己的姿势（moves.js 的关键帧）和画法（render.js drawFigure）画，招式改了动作，小图跟着变
   ============================================================ */

/* ---------- 动作小图 ---------- */
const PoseIcon = {
  F: null,
  fig() { return this.F || (this.F = new Fighter(0, { look: 'ink', x: 0, facing: 1 })); },
  // 一招在第 ph 阶段的样子（0 起手 → 1 出手 → 2 判定完 → 3 收完；script 动作的 ph 是整段进度 0~1）
  poseAt(name, ph) {
    const d = MOVES[name];
    const t = d.script ? ph * d.R : ph <= 1 ? ph * d.S : ph <= 2 ? d.S + (ph - 1) * d.A : d.S + d.A + (ph - 2) * d.R;
    return copyPose(mk(), evalKeys(d.keys, t));
  },
  joints(pose, alt) {
    const F = this.fig();
    copyPose(F.disp, pose); F.alt = alt || 0; F.vz = 0; F.x = 0; F.facing = 1; F.state = 'idle'; F.J = null; F.ikS = null;
    F.fk(); return cloneJ(F.J);
  },
  // spec：{ move: 招名, ph: 阶段（默认出手那一下）, alt: 离地高 } 或 { pose: POSE 里的名字 } 或 { run: true }
  build(s) {
    let pose, trail = null;
    if (s.move) {
      const d = MOVES[s.move], ph = s.ph != null ? s.ph : d.script ? 0.5 : 1.35;
      pose = this.poseAt(s.move, ph);
      if (d.limb && !d.script && s.trail) {                 // 拳脚走过的那一道（默认不画：小图里看着像拿了根棍子）
        trail = [];
        for (const p of [0.62, 0.74, 0.84, 0.92, 1, 1.1, 1.2]) if (p < ph) trail.push(this.joints(this.poseAt(s.move, p), s.alt)[d.limb]);   // 只画最后那一截（看得出往哪打，不像拿着根棍子）
      }
    } else if (s.run) { const F = this.fig(); F.walkPhase = 0.32; F.runT = 20; pose = F.runPose(mk()); }
    else pose = copyPose(mk(), POSE[s.pose] || POSE.stance);
    if (s.rot) pose.rot = s.rot;
    const J = this.joints(pose, s.alt);
    if (trail) trail.push(J[MOVES[s.move].limb]);
    return { J, trail };
  },
  // 画到一块新画布上（w × h 是 CSS 像素）。flip：面朝左；col：身体色
  canvas(spec, w, h, o) {
    o = o || {};
    const c = document.createElement('canvas'), k = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    c.width = Math.round(w * k); c.height = Math.round(h * k); c.style.width = w + 'px'; c.style.height = h + 'px';
    c.className = 'pico'; c.setAttribute('aria-hidden', 'true');
    const g = c.getContext('2d'); if (!g) return c;
    const col = o.col || C.ink, band = palOf(col).band;
    const { J, trail } = this.build(spec);
    // 框住整个人（加上头、拳头、地面），按统一的大小画，太宽 / 太高才缩
    let x0 = 1e9, x1 = -1e9, y0 = 1e9;
    const pts = Object.values(J).filter(Array.isArray).concat(trail || []);
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); }
    x0 -= 16; x1 += 16; y0 -= BONE.head + 10;
    const y1 = FLOOR + 6, m = 4;
    const s = Math.min(h * 0.86 / 162, (w - 2 * m) / (x1 - x0), (h - 2 * m) / (y1 - y0));   // 2.4 新人物站着约 150 高（以前按 182 算，小图显得小）
    g.scale(k, k);
    if (o.flip) { g.translate(w, 0); g.scale(-1, 1); }
    g.translate(w / 2 - (x0 + x1) / 2 * s, h - m - y1 * s + 2); g.scale(s, s);
    // 地面一道淡墨、脚下一点影子
    g.fillStyle = 'rgba(23,24,26,.13)'; g.beginPath(); g.ellipse(J.hip[0], FLOOR + 2, 34, 5, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(23,24,26,.2)'; g.lineWidth = 2.2 / s * 1.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0 - 4, FLOOR + 3); g.lineTo(x1 + 4, FLOOR + 3); g.stroke();
    withCtx(g, () => drawFigure(J, col, band, trail));
    return c;
  },
  // 把页面里 data-icon 的空位填上小图（每个只画一次）
  fill(root) {
    for (const el of root.querySelectorAll('[data-icon]:not([data-drawn])')) {
      el.setAttribute('data-drawn', '1');
      let spec; try { spec = JSON.parse(el.dataset.icon); } catch (e) { continue; }
      const w = +el.dataset.w || 96, h = +el.dataset.h || 96;
      try { el.appendChild(this.canvas(spec, w, h, { flip: el.dataset.flip === '1', col: el.dataset.col || undefined })); } catch (e) {}
    }
  },
};
const iconSlot = (spec, w, h, cls, o) => `<span class="${cls || 'gicon'}" data-icon='${JSON.stringify(spec)}' data-w="${w}" data-h="${h}"${o && o.flip ? ' data-flip="1"' : ''}${o && o.col ? ` data-col="${o.col}"` : ''}></span>`;

/* ---------- 按键 ---------- */
const G_ACT = { 拳: 'jab', 重: 'heavy', 踢: 'kick', 拿: 'grab', 挡: 'block', 蹲: 'down', 跳: 'up', 冲: 'dash' };
const gEsc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const gKey = (a, set) => keyName(((set || Keys.solo)[a] || []).find(Boolean) || null);
function gKbd(ch, set) {
  if (ch === '前' || ch === '后') {
    const dirs = `${gKey('left', set)} / ${gKey('right', set)}`;
    return `<kbd class="kc dir" title="${gEsc(dirs)} 里${ch === '前' ? '朝着' : '背着'}对手的那个"><b>${ch}</b><span>${ch === '前' ? '朝对手' : '背对手'}</span></kbd>`;
  }
  return `<kbd class="kc"><b>${ch}</b><span>${gEsc(gKey(G_ACT[ch], set))}</span></kbd>`;
}
const gText = (s, set) => gEsc(dashWords(s, set)).replace(/\[([拳重踢拿挡蹲跳前后冲])\]/g, (m, k) => gKbd(k, set));
// 连招的按法：'jab' 'heavy' 'kick' 'd:kick'（蹲踢）…… → 一串字（不带键位，键位在页面上方写一次）
const COMBO_TOK = { jab: '拳', heavy: '重', kick: '踢', 'd:kick': '蹲踢', 'd:jab': '蹲拳' };
const comboKeys = (keys, times) => keys.map(k => `<i class="tok${k.startsWith('d:') ? ' low' : ''}">${COMBO_TOK[k]}</i>`).join('<i class="sep">›</i>') + (times ? `<i class="tok times">${times}</i>` : '');

/* ---------- 内容 ---------- */
const HN = { mid: '中', low: '下', high: '上' };
const G_MOVES = [
  { id: 'jab', how: '[拳]', icon: { move: 'jab' }, desc: '最快的一下，贴身抢先手；能打断对面出腿。' },
  { id: 'heavy', how: '[重]', icon: { move: 'heavy' }, desc: '前摇长、有霸体：硬吃一记短拳照样打出去。怕腿、怕擒拿。' },
  { id: 'kick', how: '[踢]', icon: { move: 'kick' }, desc: '射程最远，化解重拳。起腿时挨拳会失衡倒地，还怕接腿。' },
  { id: 'grab', how: '[拿]', icon: { move: 'grab', ph: 1.6 }, tier: '擒拿', height: '—', desc: '挡不住。抓住后按 拳 / 踢 / 重 三种摔法。抓不到蹲着的人。' },
  { id: 'lowJab', how: '[蹲] + [拳]', icon: { move: 'lowJab' }, desc: '下段：站着挡不住，要蹲着挡。' },
  { id: 'sweep', how: '[蹲] + [踢]', icon: { move: 'sweep' }, ko: true, desc: '下段，扫倒人。被蹲挡住会挨踩腿，收招很长。' },
  { id: 'palm', how: '[蹲] + [重]', icon: { move: 'palm' }, ko: true, desc: '对空：专打跳过来的人，打下来摔个倒栽葱。' },
  { id: 'lowGrab', how: '[蹲] + [拿]', icon: { move: 'lowGrab', ph: 1.6 }, tier: '擒拿', desc: '抓蹲着、蹲挡的人；接得住出腿和扫堂腿。抓不到站着的。' },
  { id: 'shoulder', how: '跑起来按 [重]', icon: { move: 'shoulder' }, desc: '能硬吃两下拳，把人撞得老远。' },
  { id: 'airJab', how: '[跳] 再按 [拳]', icon: { move: 'airJab', alt: 64, ph: 1.6 }, desc: '最快的空中招。空中招都是上段，伤害 ×' + AIR_BONUS + '。' },
  { id: 'airHeavy', how: '[跳] 再按 [重]', icon: { move: 'airHeavy', alt: 54, ph: 1.6 }, desc: '跳起来双拳往下砸，伤害高。' },
  { id: 'airKick', how: '[跳] 再按 [踢]', icon: { move: 'airKick', alt: 60, ph: 1.6 }, desc: '跳起来一脚蹬过去，射程远。蹲下躲得开。' },
  { id: 'dive', how: '空中 [蹲] + [踢]', icon: { move: 'dive', alt: 66, ph: 1.4 }, desc: '先往上一腾，再朝人踩下去。专踩蹲着的、踩断托天掌；怕站着的拳。' },
  { id: 'burst', how: '挨打时 [重] + [踢]', icon: { move: 'burst', ph: 0.25 }, tier: '—', height: '—', desc: `花半格气从身上炸开：对面倒地、掉 ${BURST_DMG} 血。只在挨打时能用。` },
  { id: 'super', how: '气满 [重] + [踢]', icon: { move: 'super' }, ko: true, desc: `必杀，${MOVES.super.dmg} 血；挡住了只掉三成。` },
];
const moveTier = g => g.tier || TIER_NAME[MOVES[g.id].tier] || '—';
const moveHeight = g => g.height || HN[MOVES[g.id].height] || '中';
const G_COMBOS = [
  { group: '拳起手', note: '短拳快，打中了接什么都来得及', list: [
    { keys: ['jab', 'jab'], name: '后手直拳', moves: ['jab', 'jab2'] },
    { keys: ['jab', 'jab', 'jab'], name: '摆拳', moves: ['jab2', 'jab3'] },
    { keys: ['jab'], times: '×4~5', name: '连珠快拳', moves: ['rushL', 'rushR'], tag: '一串快拳' },
    { keys: ['jab'], times: '×6', name: '寸劲', moves: ['rushEnd'], tag: '收势，把人打远' },
    { keys: ['jab', 'heavy'], name: '崩拳', moves: ['jab', 'beng'], tag: '冲击波' },
    { keys: ['jab', 'jab', 'heavy'], name: '冲天炮', moves: ['jab2', 'upper'], tag: '把人打上天', ko: true },
    { keys: ['jab', 'kick'], name: '鞭腿', moves: ['jab', 'whip'] },
    { keys: ['jab', 'jab', 'kick'], name: '转身蹬', moves: ['jab2', 'backKick'], tag: '把人蹬远' },
  ] },
  { group: '重起手', note: '重拳打中了接，被挡住接也照样出', list: [
    { keys: ['heavy', 'jab'], name: '顶肘', moves: ['heavy', 'elbow'], tag: '贴身' },
    { keys: ['heavy', 'heavy'], name: '劈挂掌', moves: ['heavy', 'chop'], tag: '上段，要站着挡' },
    { keys: ['heavy', 'kick'], name: '旋风腿', moves: ['heavy', 'whirl'], tag: '转身一腿扫倒', ko: true },
    { keys: ['heavy', 'd:kick'], name: '重拳接扫堂腿', moves: ['heavy', 'sweep'], tag: '下段 —— 和劈挂掌二选一，让他猜' },
  ] },
  { group: '腿起手', list: [
    { keys: ['kick', 'jab'], name: '落步冲拳', moves: ['kick', 'stepPunch'] },
    { keys: ['kick', 'heavy'], name: '盖步砸拳', moves: ['kick', 'hammer'], tag: '往下砸倒', ko: true },
    { keys: ['kick', 'kick'], name: '二起脚', moves: ['kick', 'twinKick'], tag: '腾空两脚', ko: true },
  ] },
  { group: '下段', list: [
    { keys: ['d:jab', 'd:kick'], name: '下盘拳接扫堂腿', moves: ['lowJab', 'sweep'], tag: '两下都是下段' },
  ] },
];
const G_TECH = [
  { group: '防守', list: [
    { name: '格挡', how: '按住 [挡]', icon: { pose: 'block' }, desc: `只吃 ${Math.round(BLOCK_KEEP * 10)} 成伤害；被挡的那个「势破」，下一记短拳慢 ${SLOW_JAB_ADD} 帧。`,
      more: ['下段（下盘拳、扫堂腿）要按住 [蹲] 挡', '上段（劈挂掌、空中招）要站着挡', '背对着挡不住'] },
    { name: '卸力', how: '快挨打的一瞬间刚按下 [挡]', icon: { pose: 'parry' }, desc: `按下挡的 ${PARRY_WIN} 帧内被打中：不掉血，对面失衡；接着打中 ×${PARRY_MUL}。`,
      more: [`两次按挡要隔 ${PARRY_LOCK} 帧以上才有卸力，乱按没用`, '卸力后按 [拿] = 借力摔'] },
    { name: '推挡', how: '挡住以后按 [拳]', icon: { move: 'shove' }, desc: '把对面推开，打断他接下来的招（不掉他的血）。' },
    { name: '截拳', how: '挡住以后按 [重]', icon: { move: 'jieQuan' }, desc: `花 ${GC_COST} 气从格挡里打出一拳，出手前打不中你。` },
    { name: '踩腿', how: '蹲挡住扫堂腿，马上 [蹲] + [踢]', icon: { move: 'stomp' }, desc: `一脚踩倒，算挡后反击 ×${PUNISH_KD_MUL}。` },
    { name: '挣脱', how: '被抓住马上按 [拿]', icon: { pose: 'pulled' }, desc: '擒住刚开始那一下按就挣开。接腿摔、抄腿摔、借力摔挣不脱。' },
  ] },
  { group: '身法', list: [
    { name: '冲刺', how: '双击 [前]（或 [后]）', icon: { move: 'dash', ph: 0.3 }, desc: '贴地滑出一大步；前几帧谁也打不中你，能穿到对面身后。' },
    { name: '冲势', how: '冲刺里出招', icon: { move: 'dash', ph: 0.6 }, desc: `冲刺途中、刚冲完出的第一招 ×${DASH_IN_MUL}，被挡也压得住。` },
    { name: '边挡边走', how: '按住 [挡] 再按方向', icon: { pose: 'block' }, desc: '举着手慢慢走，前后都行，一直面朝对手，照样挡得住。' },
    { name: '闪身', how: '按住 [挡]，朝对手双击 [前]', icon: { move: 'slip', ph: 0.3 }, desc: '压低身子从他身边钻过去。只躲得过重拳一类；躲过了自动回身一肘，他背对着你踉跄。',
      more: [`短拳、腿、下段、擒拿截得住闪身，挨了 ×${SLIP_CAUGHT_MUL}`] },
    { name: '跳', how: '[跳]，按着方向跳得远', icon: { pose: 'leap', alt: 46 }, desc: '跑起来再跳更远。每跳只能出一招空中招；空中按方向只能小调。' },
  ] },
  { group: '擒拿', list: [
    { name: '擒住以后', how: '按 [拳] / [踢] / [重]', icon: { move: 'hold', ph: 0.6 }, desc: '拳 = 提膝撞，踢 = 别腿摔，重（或按住后）= 过肩摔，不按 = 推开。' },
    { name: '过肩摔', how: '面前有人时按住 [后] 再 [拿]', icon: { move: 'throwBack', ph: 0.45 }, desc: '不转身，抓住直接摔到身后 —— 把人换到墙角。' },
    { name: '接腿摔', how: '对面出腿时按 [拿]', icon: { move: 'legCatch', ph: 0.25 }, desc: '抓住腿直接摔倒，挣不脱。手要在腿踢到之前伸出来。' },
    { name: '借力摔', how: '卸力以后按 [拿]', icon: { pose: 'parry' }, desc: '趁对面失衡把他摔出去，挣不脱。' },
  ] },
  { group: '倒地', list: [
    { name: '起身', how: '倒地后自己起来', icon: { pose: 'rise' }, desc: '躺一会儿 → 起身（打不中）→ 起身硬直（站起来那几帧打得中、动不了）→ 能动。' },
    { name: '滚身起', how: '倒地时按住方向', icon: { pose: 'tuck' }, desc: '起身时往那边滚开，躲开守在你起身处的人。' },
    { name: '压起身', how: '他站起来那一下按 [拳]', icon: { move: 'jab' }, desc: '短拳算好时机打在起身硬直里必中；重拳、腿太慢，要提前出。' },
  ] },
  { group: '空中交手', list: [
    { name: '倒栽葱', how: '空中出招被克它的招打中', icon: { pose: 'fall', alt: 30 }, desc: `摔下来倒地更久。托天掌打空中招、站着的拳迎千斤坠（×${DIVE_PUNCH_MUL}）都是。` },
    { name: '翻滚回去', how: '空中的腿撞上地上的腿', icon: { pose: 'tuck', alt: 40 }, desc: '空中那个只吃一半伤害，往后翻开一大段。' },
  ] },
];
const G_MULS = [
  ['克', '主系克制（拳克腿、腿克重、重克拳），单方面打中', '×' + BEAT_MUL],
  ['破招', '打在对方前摇里', '×' + COUNTER_MUL],
  ['迎击', '打在全速跑过来、冲刺收尾的人身上', '×' + COUNTER_MUL],
  ['冲势', '冲刺途中、刚冲完出的第一招', '×' + DASH_IN_MUL],
  ['空中招', '跳起来出的招', '×' + AIR_BONUS],
  ['挡后反击', '打在你刚挡住的那一招的收招里', `×${PUNISH_MUL}（击倒招 ×${PUNISH_KD_MUL}）`],
  ['卸力后打中', '卸掉以后趁他失衡打', '×' + PARRY_MUL],
  ['破绽', '击倒招打空了，打它的收招', '×' + WHIFF_KD_MUL],
  ['截住闪身', '他钻过来时被短拳、腿、下段、擒拿打中', '×' + SLIP_CAUGHT_MUL],
  ['拳迎千斤坠', '站着的拳迎面打中千斤坠（倒栽葱）', '×' + DIVE_PUNCH_MUL],
  ['踩蹲 / 踩断对空', '千斤坠踩中蹲着的 / 正在出托天掌的', `×${DIVE_CROUCH_MUL} / ×${DIVE_AA_MUL}`],
  ['格挡', '挡住了只吃', Math.round(BLOCK_KEEP * 10) + ' 成'],
];
const G_RULES = [
  ['胜负', `血量 ${MAX_HP}，五局三胜。人机、联机每回合 ${ROUND_FRAMES / 3600} 分钟；双人对战、训练场不限时。`],
  ['交手', '两边同时打中：先比主系 —— 克制的一方「克」，单方面打中；主系一样再比起手 —— 克制的一方「压」，被压的吃全额、被打退，压人的只吃三成还能接着打；都一样 = 拼招，各掉五成、互相震退。'],
  ['起手和主系', '单招两者一样；连招的起手是第一下、主系是最后一下。比如 拳→重 的崩拳 = 起手拳、主系重。'],
  ['高低', '中段站着、蹲着都能挡；下段（下盘拳、扫堂腿）要蹲着挡；上段（劈挂掌、空中招）要站着挡。'],
  ['连击衰减', '同一套里每多挨一下，硬直更短、被推得更远、伤害更低 —— 连四五下就断。'],
  ['势破', `被挡住的那个人，下一记短拳前摇 +${SLOW_JAB_ADD} 帧（头上一个「势」字）。`],
  ['朝向', '按着方向不出招就是跑，马上朝那边跑（没有后退）。不按左右、格挡时自动面向对手；出招时对手在近身范围内一律朝他打，乱按方向也不打空。'],
  ['气', `挨打、格挡、打中都会涨，挨打涨得最多。半格（${QI_BURST}）能爆气，满格（${QI_MAX}）能泼墨，截拳花 ${GC_COST}。`],
  ['擒拿', '挡不住，但站着的擒拿抓不到蹲着的（要用抄腿，抄腿又抓不到站着的）；对面出腿时擒拿 = 接腿摔。'],
  ['跳', `跳起出招 ×${AIR_BONUS}，每跳一招；落地前来不及出完，就变成落地后马上出。蹲下能躲飞踢。`],
];
const G_TIPS = [
  '难度从「入门」开始，打得过再往上调。',
  '先用短拳试探：短拳最快，被挡了也不亏多少。',
  '看见他抬腿，出短拳；看见他往后蓄重拳，起腿；他贴着你连拳，出重拳（霸体吃得下）。',
  '他老举着手挡？贴上去擒拿，或者蹲下打下段。',
  '挡住他一下以后，他还在收招 —— 马上 拳拳重 打回去（挡后反击）。',
  '被打倒了，起身时按住方向滚开，别在原地站起来挨打。',
  '训练场里的「破招练习」能一招一招练怎么破对面。',
];

/* ---------- 克制总表、破解表、帧数表（都读 MOVES，改了数值自己变） ---------- */
function relTableHtml() {
  const T = ['light', 'heavy', 'kick'], cls = [];
  for (const lead of T) for (const tier of T) {
    const names = Object.values(MOVES).filter(d => d.lead === lead && d.tier === tier && !d.script).map(d => d.label);
    cls.push({ lead, tier, name: TIER_NAME[lead] + TIER_NAME[tier], eg: [...new Set(names)].join('、') || '—' });
  }
  const SYM = { 1: ['克', 'w2'], 0.5: ['压', 'w1'], 0: ['平', 'eq'], '-0.5': ['被压', 'l1'], '-1': ['被克', 'l2'] };
  let h = '<thead><tr><th>我＼对手</th>' + cls.map(c => `<th title="${c.eg}">${c.name}</th>`).join('') + '</tr></thead><tbody>';
  for (const a of cls) {
    h += `<tr><th title="${a.eg}">${a.name}<small>${a.eg}</small></th>`;
    for (const b of cls) { const [t, k] = SYM[String(relation(a, b))]; h += `<td class="${k}">${t}</td>`; }
    h += '</tr>';
  }
  return `<table class="rel">${h}</tbody></table>`;
}
const relLegend = '<span class="chip w2">克</span>单方面打中 <span class="chip w1">压</span>两边都中、你占大便宜 <span class="chip eq">平</span>拼招 <span class="chip l1">被压</span> <span class="chip l2">被克</span>';
const FRAME_ROWS = ['jab', 'heavy', 'kick', 'grab', 'lowGrab', 'beng', 'whip', 'elbow', 'chop', 'whirl', 'stepPunch', 'hammer', 'twinKick', 'upper', 'backKick', 'rushEnd',
  'lowJab', 'sweep', 'palm', 'shoulder', 'airJab', 'airHeavy', 'airKick', 'dive', 'shove', 'jieQuan', 'stomp', 'slipElbow', 'super'];
function frameTableHtml() {
  const rows = FRAME_ROWS.map(k => {
    const d = MOVES[k], dmg = d.kind === 'grab' ? (k === 'grab' ? `${d.dmg}~${THROW_DMG}` : `${TACKLE_DMG}~${SCOOP_DMG}`) : Math.round(d.dmg * (d.air ? AIR_BONUS : 1));
    return `<tr><td>${d.label}</td><td>${TIER_NAME[d.lead] || '—'}</td><td>${TIER_NAME[d.tier] || '—'}</td><td>${HN[d.height]}</td><td>${d.S}</td><td>${d.dive ? '到地' : d.A}</td><td>${d.R}</td><td>${dmg}</td><td>${d.reach + (d.lunge ? Math.max(0, d.lunge[2]) : 0)}</td></tr>`;
  }).join('');
  return `<table class="frames"><thead><tr><th>招式</th><th>起手</th><th>主系</th><th>段</th><th>前摇</th><th>判定</th><th>后摇</th><th>伤害</th><th>射程</th></tr></thead><tbody>${rows}</tbody></table>`;
}
const FRAME_NOTE = '1 帧 = 1/60 秒。射程是两人中心距（像素，含往前冲的那一段）；空中招伤害已含 ×' + AIR_BONUS + '。段：中段站蹲都能挡，下段要蹲挡，上段要站挡。';

// 键位表的一行一行：[说明, 动作…]
const KEY_ROWS = [['移动', ['left', 'right'], '按哪边朝哪边跑'], ['跳', ['up']], ['蹲', ['down']], ['短拳', ['jab']], ['重拳', ['heavy']], ['腿踢', ['kick']], ['格挡', ['block'], '按住'], ['擒拿', ['grab']],
  ['冲刺', ['dash'], '按着挡朝对手冲 = 闪身']];
// 2.4 冲刺：选了「双击」显示「左左 / 右右」；选了「冲刺键」显示冲刺键
const dashCaps = set => set.dashMode === 'key' ? ((set.dash || []).filter(Boolean).map(c => `<kbd>${gEsc(keyName(c))}</kbd>`).join('') || '—')
  : ['left', 'right'].map(a => { const c = gEsc(keyName((set[a] || []).find(Boolean) || null)); return `<kbd>${c}</kbd><kbd>${c}</kbd>`; }).join('<i class="or">/</i>') + '<i class="or">双击</i>';
const keyCaps = (set, acts) => acts[0] === 'dash' ? dashCaps(set) : acts.map(a => ((set[a] || []).filter(Boolean).map(c => `<kbd>${gEsc(keyName(c))}</kbd>`).join('') || '—')).join('<i class="or">/</i>');

/* ============================================================
   网页版：游戏下面的「教程」，分页
   ============================================================ */
const GUIDE_TABS = [['start', '上手'], ['moves', '招式'], ['combos', '连招'], ['tech', '攻防'], ['rules', '规则'], ['charts', '查表']];
const Guide = {
  el: null, tab: 'start',
  init() {
    this.el = document.getElementById('guide'); if (!this.el) return;
    try { const t = localStorage.getItem('modou.guideTab'); if (GUIDE_TABS.some(x => x[0] === t)) this.tab = t; } catch (e) {}
    this.el.querySelector('.g-tabs').innerHTML = GUIDE_TABS.map(([id, n]) => `<button type="button" role="tab" data-gt="${id}" aria-selected="${id === this.tab}">${n}</button>`).join('');
    this.el.querySelector('.g-tabs').addEventListener('click', e => { const b = e.target.closest('[data-gt]'); if (b) this.show(b.dataset.gt); });
    this.el.querySelector('.g-tabs').addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const i = GUIDE_TABS.findIndex(x => x[0] === this.tab), n = GUIDE_TABS[(i + (e.key === 'ArrowRight' ? 1 : GUIDE_TABS.length - 1)) % GUIDE_TABS.length][0];
      this.show(n); const b = this.el.querySelector(`[data-gt="${n}"]`); if (b) b.focus(); e.preventDefault();
    });
    this.el.addEventListener('click', e => { const b = e.target.closest('[data-goto]'); if (b) { this.show(b.dataset.goto); this.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    this.render();
  },
  show(id) {
    this.tab = id;
    try { localStorage.setItem('modou.guideTab', id); } catch (e) {}
    for (const b of this.el.querySelectorAll('[data-gt]')) b.setAttribute('aria-selected', String(b.dataset.gt === id));
    this.render();
  },
  render() {
    if (!this.el) return;
    const page = this.el.querySelector('.g-page');
    page.innerHTML = this['p_' + this.tab]();
    page.dataset.page = this.tab;
    PoseIcon.fill(page);
  },
  refresh() { if (this.el) this.render(); if (Manual.el && Manual.isOpen()) Manual.render(); },
  /* 上手：键位、两个克制圈、第一局怎么打 */
  p_start() {
    const S = Keys.solo;
    const keys = KEY_ROWS.map(([n, acts, note]) => `<div class="kr"><span class="kn">${n}</span><span class="kk">${keyCaps(S, acts)}</span>${note ? `<small>${note}</small>` : ''}</div>`).join('');
    const tri = (a, b) => `<div class="tri-wrap">
      <svg class="tri-arrows" viewBox="0 0 300 260" aria-hidden="true"><defs><marker id="ga${a}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--cinnabar)"/></marker></defs>
        <path d="M118 52 Q60 92 66 156" marker-end="url(#ga${a})"/><path d="M96 214 Q150 246 204 214" marker-end="url(#ga${a})"/><path d="M234 156 Q240 92 182 52" marker-end="url(#ga${a})"/></svg>
      ${b.map((n, i) => `<div class="tri-node n${i}">${n.icon}<b>${n.name}</b></div>`).join('')}
      ${b.map((n, i) => `<span class="tri-k k${i}">克</span>`).join('')}</div>`;
    const tri1 = tri(1, [{ name: '拳', icon: iconSlot({ move: 'jab' }, 76, 76) }, { name: '腿', icon: iconSlot({ move: 'kick' }, 76, 76) }, { name: '重', icon: iconSlot({ move: 'heavy' }, 76, 76) }]);
    const tri2 = tri(2, [{ name: '打击', icon: iconSlot({ move: 'jab' }, 76, 76) }, { name: '擒拿', icon: iconSlot({ move: 'grab', ph: 1.6 }, 76, 76) }, { name: '格挡', icon: iconSlot({ pose: 'block' }, 76, 76) }]);
    return `<div class="g-start">
      <article class="g-card keys"><h3>键位<small>人机 · 联机 · 训练场</small></h3><div class="krows">${keys}<div class="kr"><span class="kn">暂停</span><span class="kk"><kbd>Esc</kbd><i class="or">/</i><kbd>P</kbd></span></div></div>
        <p class="g-note">菜单「键位设置」里能改；双人对战用另外两套键位，见下面。</p>
        <details class="g-pvp"><summary>双人对战的键位（两个人一个键盘）</summary>${this.pvpKeys()}</details></article>
      <article class="g-card tri"><h3>拳克腿 · 腿克重 · 重克拳</h3>${tri1}
        <ul class="g-list"><li><b>拳克腿</b>：起腿时挨了拳，失衡倒地。</li><li><b>腿克重</b>：重拳起手被腿化解，腿照样踢中。</li><li><b>重克拳</b>：重拳前摇有霸体，硬吃一记短拳打出去。</li></ul></article>
      <article class="g-card tri"><h3>打击 · 擒拿 · 格挡</h3>${tri2}
        <ul class="g-list"><li><b>打击克擒拿</b>：他伸手要抓，打他一下就断了。</li><li><b>擒拿克格挡</b>：擒拿挡不住，专抓举着手的。</li><li><b>格挡克打击</b>：挡住了只吃三成，还能打他收招。</li></ul></article>
      <article class="g-card tips"><h3>第一局怎么打</h3><ol class="g-steps">${G_TIPS.map(t => `<li>${t}</li>`).join('')}</ol>
        <p class="g-more"><button type="button" class="g-link" data-goto="moves">看全部招式 →</button><button type="button" class="g-link" data-goto="combos">连招 →</button></p></article>
    </div>`;
  },
  pvpKeys() {
    const P = [Keys.p1, Keys.p2], L = [lookOf(Looks.pvp[0]), lookOf(Looks.pvp[1])];
    const head = `<tr><th></th>${L.map((p, i) => `<th><span class="dot" style="background:${p.color}"></span>玩家${i ? '二' : '一'} · ${p.name}</th>`).join('')}</tr>`;
    return `<table class="g-keytab">${head}${KEY_ROWS.map(([n, acts]) => `<tr><td>${n}</td>${P.map(k => `<td>${keyCaps(k, acts)}</td>`).join('')}</tr>`).join('')}</table>`;
  },
  /* 招式：一张一张卡片（小图 + 名字 + 按法 + 系 / 段 + 一句话） */
  p_moves() {
    return `<p class="g-lead">「系」决定谁克谁，「段」决定站着还是蹲着挡。按键：<span class="g-keys">${['拳', '重', '踢', '拿', '挡', '蹲', '跳'].concat(Keys.solo.dashMode === 'key' ? ['冲'] : []).map(c => gKbd(c)).join(' ')}</span></p>
      <div class="g-grid moves">${G_MOVES.map(g => {
        const d = MOVES[g.id];
        return `<article class="g-move">${iconSlot(g.icon, 108, 108)}<div class="gm-body"><h4>${d.label}</h4><div class="gm-how">${gText(g.how)}</div>
          <div class="gm-tags">${moveTier(g) !== '—' ? `<span class="tag t-${moveTier(g)}">${moveTier(g)}系</span>` : ''}${moveHeight(g) !== '—' ? `<span class="tag">${moveHeight(g)}段</span>` : ''}${g.ko ? '<span class="tag ko">击倒</span>' : ''}${d.S && g.id !== 'burst' ? `<span class="tag fr">前摇 ${d.S}</span>` : ''}</div>
          <p>${g.desc}</p></div></article>`;
      }).join('')}</div>`;
  },
  /* 连招：按起手分组，每一套是一串小图 */
  p_combos() {
    return `<p class="g-lead">打中或者被挡住以后，马上按下一招就接上了（没打中的话，0.4 秒内接着出也算）。连招的<b>起手</b>是第一下、<b>主系</b>是最后一下 —— 交手时按这两个比克制。
      <span class="g-keys">${['拳', '重', '踢', '蹲'].map(c => gKbd(c)).join(' ')}</span></p>
      ${G_COMBOS.map(G => `<section class="g-sec"><h3>${G.group}${G.note ? `<small>${G.note}</small>` : ''}</h3><div class="g-grid combos">${G.list.map(c =>
        `<article class="g-combo${c.ko ? ' ko' : ''}"><div class="gc-strip">${c.moves.map(m => iconSlot({ move: m }, 86, 92)).join('<i class="gc-arrow">›</i>')}</div>
          <div class="gc-body"><div class="gc-keys">${comboKeys(c.keys, c.times)}</div><h4>${c.name}</h4>${c.tag ? `<p>${c.tag}</p>` : ''}</div></article>`).join('')}</div></section>`).join('')}
      <p class="g-note">连击衰减：同一套里挨得越多，硬直越短、推得越远 —— 一套最多五下左右。</p>`;
  },
  /* 攻防：防守、身法、擒拿、倒地、空中交手 */
  p_tech() {
    return G_TECH.map(G => `<section class="g-sec"><h3>${G.group}</h3><div class="g-grid tech">${G.list.map(t =>
      `<article class="g-tech">${iconSlot(t.icon, 84, 90)}<div class="gt-body"><h4>${t.name}</h4><div class="gt-how">${gText(t.how)}</div><p>${t.desc}</p>${t.more ? `<ul>${t.more.map(m => `<li>${gText(m)}</li>`).join('')}</ul>` : ''}</div></article>`).join('')}</div></section>`).join('');
  },
  /* 规则：加成表 + 规矩 */
  p_rules() {
    return `<div class="g-rules"><article class="g-card"><h3>伤害加成</h3><table class="g-mul"><tbody>${G_MULS.map(([a, b, c]) => `<tr><th>${a}</th><td>${b}</td><td class="num">${c}</td></tr>`).join('')}</tbody></table>
        <p class="g-note">几种加成可以叠在一起（比如冲势 + 破招）。</p></article>
      <article class="g-card"><h3>规矩</h3><dl class="g-dl">${G_RULES.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></article></div>`;
  },
  /* 查表：组合克制总表、破解表、帧数表 */
  p_charts() {
    return `<section class="g-sec"><h3>组合克制总表<small>行是你的招，列是对手同时出的招；名字是「起手 + 主系」</small></h3><div class="scrollx">${relTableHtml()}</div><p class="g-note">${relLegend}</p></section>
      <section class="g-sec"><h3>破解表<small>每一种招、每一种技术都有破法 —— 训练场的「破招练习」能一条一条对着木桩练</small></h3>
        <dl class="counters">${COUNTERS.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>
      <section class="g-sec"><h3>帧数表</h3><div class="scrollx">${frameTableHtml()}</div><p class="g-note">${FRAME_NOTE}</p></section>`;
  },
};

/* ============================================================
   软件版（以及网页全屏时）：「教程」面板 —— 左边章节，右边文字 + 表格
   ============================================================ */
const MANUAL_CH = [
  ['start', '一', '上手'], ['moves', '二', '招式'], ['combos', '三', '连招'], ['tech', '四', '攻防技巧'],
  ['rules', '五', '规则与加成'], ['rel', '六', '克制总表'], ['counters', '七', '破解表'], ['frames', '八', '帧数表'],
];
const Manual = {
  el: null, ch: 'start', back: null,
  build() {
    if (this.el) return;
    this.el = document.getElementById('manual'); if (!this.el) return;
    this.el.innerHTML = `<nav class="mn-side" aria-label="章节"><p class="mn-brand">墨斗<i class="seal">谱</i><small>教程</small></p><div class="mn-chs" role="tablist"></div>
      <p class="mn-help"><kbd>↑</kbd><kbd>↓</kbd> 换章 · <kbd>Esc</kbd> 关</p><button type="button" class="ibtn ghost mn-close">关闭</button></nav><div class="mn-main" tabindex="-1"></div>`;
    this.el.querySelector('.mn-chs').innerHTML = MANUAL_CH.map(([id, no, n]) => `<button type="button" role="tab" data-mc="${id}"><i>${no}</i>${n}</button>`).join('');
    this.el.querySelector('.mn-chs').addEventListener('click', e => { const b = e.target.closest('[data-mc]'); if (b) this.go(b.dataset.mc); });
    this.el.querySelector('.mn-close').addEventListener('click', () => this.close());
    try { const t = localStorage.getItem('modou.manualCh'); if (MANUAL_CH.some(x => x[0] === t)) this.ch = t; } catch (e) {}
  },
  isOpen() { return !!this.el && !this.el.hidden; },
  open(back) {
    this.build(); if (!this.el) return;
    this.back = back || null; this.el.hidden = false; this.go(this.ch);
    const b = this.el.querySelector(`[data-mc="${this.ch}"]`); if (b) b.focus({ preventScroll: true });
  },
  close() {
    if (!this.el) return;
    this.el.hidden = true;
    if (this.back && this.back.focus) this.back.focus({ preventScroll: true });
  },
  go(id) {
    this.ch = id;
    try { localStorage.setItem('modou.manualCh', id); } catch (e) {}
    for (const b of this.el.querySelectorAll('[data-mc]')) b.setAttribute('aria-selected', String(b.dataset.mc === id));
    this.render();
  },
  step(d) { const i = MANUAL_CH.findIndex(x => x[0] === this.ch); this.go(MANUAL_CH[(i + d + MANUAL_CH.length) % MANUAL_CH.length][0]); const b = this.el.querySelector(`[data-mc="${this.ch}"]`); if (b) b.focus({ preventScroll: true }); },
  key(e) {
    if (e.code === 'Escape') { e.preventDefault(); if (!e.repeat) this.close(); return true; }
    if (e.code === 'ArrowDown' || e.code === 'PageDown' || e.code === 'ArrowUp' || e.code === 'PageUp') {
      const main = this.el.querySelector('.mn-main');
      if ((e.code === 'PageDown' || e.code === 'PageUp') && main.scrollHeight > main.clientHeight + 4) return false;   // 长的章节：翻页键照常滚动
      e.preventDefault(); this.step(e.code === 'ArrowDown' || e.code === 'PageDown' ? 1 : -1); return true;
    }
    return false;
  },
  render() {
    const main = this.el.querySelector('.mn-main'), [id, no, name] = MANUAL_CH.find(x => x[0] === this.ch);
    main.innerHTML = `<header class="mn-h"><span>第${no}章</span><h2>${name}</h2></header>` + this['c_' + id]();
    main.scrollTop = 0;
    PoseIcon.fill(main);
  },
  c_start() {
    const rows = KEY_ROWS.concat([['暂停', null]]).map(([n, acts, note]) => `<tr><th>${n}</th>${acts ? [Keys.solo, Keys.p1, Keys.p2].map(k => `<td>${keyCaps(k, acts)}</td>`).join('') : '<td colspan="3"><kbd>Esc</kbd><i class="or">/</i><kbd>P</kbd></td>'}<td class="mn-dim">${note || ''}</td></tr>`).join('');
    const L = [lookOf(Looks.pvp[0]), lookOf(Looks.pvp[1])];
    return `<p class="mn-p">墨斗是一对一的格斗：把对面的血打光，五局三胜。出招只有四个键 —— 短拳、重拳、腿踢、擒拿；再加格挡。下面三节看完就能打。</p>
      <h3>键位</h3><table class="mn-t keys"><thead><tr><th>动作</th><th>单人（人机 · 联机 · 训练场）</th><th>双人 · 玩家一（${L[0].name}）</th><th>双人 · 玩家二（${L[1].name}）</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <p class="mn-dim">菜单「键位设置」里改，三套互不影响。</p>
      <h3>谁克谁</h3>
      <div class="mn-tri">${['jab', 'kick', 'heavy'].map((m, i) => `<div>${iconSlot({ move: m }, 84, 84)}<b>${'拳腿重'[i]}</b></div>`).join('<span>克</span>')}<span>克</span><div class="mn-tri-end">${iconSlot({ move: 'jab' }, 84, 84)}<b>拳</b></div></div>
      <table class="mn-t"><tbody>
        <tr><th>拳克腿</th><td>对面起腿的时候挨了你一拳，失衡倒地。</td></tr>
        <tr><th>腿克重</th><td>重拳起手被腿化解，腿照样踢中他。</td></tr>
        <tr><th>重克拳</th><td>重拳前摇有霸体，硬吃一记短拳照样打出去。</td></tr>
        <tr><th>打击克擒拿</th><td>他伸手要抓，打他一下就断了。</td></tr>
        <tr><th>擒拿克格挡</th><td>擒拿挡不住，专抓一直举着手的。</td></tr>
        <tr><th>格挡克打击</th><td>挡住只吃三成；挡住以后他还在收招，马上打回去 = 挡后反击。</td></tr>
      </tbody></table>
      <h3>第一局怎么打</h3><ol class="mn-ol">${G_TIPS.map(t => `<li>${t}</li>`).join('')}</ol>`;
  },
  c_moves() {
    return `<p class="mn-p">「系」决定谁克谁（拳克腿、腿克重、重克拳）；「段」决定怎么挡：中段站蹲都能挡，下段要蹲着挡，上段要站着挡。前摇是按下去到打出来要几帧（1 帧 = 1/60 秒），越小越快。</p>
      <table class="mn-t moves"><thead><tr><th></th><th>招式</th><th>怎么按</th><th>系</th><th>段</th><th class="num">前摇</th><th class="num">伤害</th><th>说明</th></tr></thead><tbody>${G_MOVES.map(g => {
        const d = MOVES[g.id], dmg = g.id === 'grab' ? `${d.dmg}~${THROW_DMG}` : g.id === 'lowGrab' ? `${TACKLE_DMG}~${SCOOP_DMG}` : g.id === 'burst' ? BURST_DMG : Math.round(d.dmg * (d.air ? AIR_BONUS : 1));
        return `<tr><td class="ic">${iconSlot(g.icon, 64, 64)}</td><th>${d.label}${g.ko ? '<small>击倒</small>' : ''}</th><td class="how">${gText(g.how)}</td><td>${moveTier(g)}</td><td>${moveHeight(g)}</td><td class="num">${g.id === 'burst' ? '—' : d.S}</td><td class="num">${dmg}</td><td>${g.desc}</td></tr>`;
      }).join('')}</tbody></table>`;
  },
  c_combos() {
    return `<p class="mn-p">打中或者被挡住以后马上按下一招就接上了；没打中的话，0.4 秒内接着出也会换成连招动作。下表「拳」=${gKbd('拳')}「重」=${gKbd('重')}「踢」=${gKbd('踢')}「蹲」=${gKbd('蹲')}。</p>
      <table class="mn-t combos"><thead><tr><th>按法</th><th>连招</th><th>特点</th><th>样子</th></tr></thead><tbody>${G_COMBOS.map(G =>
        `<tr class="grp"><th colspan="4">${G.group}${G.note ? `<small>${G.note}</small>` : ''}</th></tr>` + G.list.map(c =>
          `<tr><td class="ck">${comboKeys(c.keys, c.times)}</td><th>${c.name}</th><td>${c.tag || ''}</td><td class="strip">${c.moves.map(m => iconSlot({ move: m }, 58, 62)).join('')}</td></tr>`).join('')).join('')}</tbody></table>
      <p class="mn-dim">连击衰减：同一套里挨得越多，硬直越短、推得越远 —— 一套最多五下左右。</p>`;
  },
  c_tech() {
    return G_TECH.map(G => `<h3>${G.group}</h3><table class="mn-t tech"><colgroup><col style="width:76px"><col style="width:150px"><col style="width:330px"><col></colgroup><tbody>${G.list.map(t =>
      `<tr><td class="ic">${iconSlot(t.icon, 56, 60)}</td><th>${t.name}</th><td class="how">${gText(t.how)}</td><td>${t.desc}${t.more ? `<ul>${t.more.map(m => `<li>${gText(m)}</li>`).join('')}</ul>` : ''}</td></tr>`).join('')}</tbody></table>`).join('');
  },
  c_rules() {
    return `<h3>伤害加成</h3><table class="mn-t"><thead><tr><th>名字</th><th>什么时候</th><th class="num">倍率</th></tr></thead><tbody>${G_MULS.map(([a, b, c]) => `<tr><th>${a}</th><td>${b}</td><td class="num">${c}</td></tr>`).join('')}</tbody></table>
      <p class="mn-dim">几种加成可以叠在一起。</p><h3>规矩</h3><table class="mn-t"><tbody>${G_RULES.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}</tbody></table>`;
  },
  c_rel() { return `<p class="mn-p">两边同时出招时谁占便宜。行是你的招，列是对手的招；名字是「起手 + 主系」，比如「拳重」= 拳起手、重收尾（崩拳）。鼠标停在名字上能看到包含哪些招。</p><div class="scrollx">${relTableHtml()}</div><p class="mn-dim">${relLegend}</p>`; },
  c_counters() { return `<p class="mn-p">每一种招、每一种技术都有破法。训练场的「破招练习」里能一条一条对着木桩练（木桩照着出那一招，有说明和演示）。</p><table class="mn-t counters"><thead><tr><th>对手的招</th><th>怎么破</th></tr></thead><tbody>${COUNTERS.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`; },
  c_frames() { return `<div class="scrollx">${frameTableHtml()}</div><p class="mn-dim">${FRAME_NOTE}</p>`; },
};
