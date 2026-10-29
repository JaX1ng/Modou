'use strict';
/* ============================================================
   教程（2.2 起两种排法：网页版 Guide 在游戏下面分页看，软件版 / 网页全屏用 Manual 面板，左边章节、右边文字 + 表格）
   2.10（Jack：以后会有更多更多的拳派进来，底下的教程得重新做，不要用括号往里塞）：按拳派分成一本一本的书 ——
   · 「通用」一本：键位、两个克制圈、规矩、身法和倒地，哪一派都一样的东西
   · 每一派一本：上手、招式、连招、攻防、查表，页数和页名每一派自己定（咏春拳是连环拳、黐手 · 搭手）
   · 先选书（通用 / 传统格斗 / 咏春拳 ……），再翻页；以后加拳派，在 GUIDE_BOOKS 里加一本就行，两种排法都从这里来
   · 文字不用括号塞补充：要补充的单独成句，或者放进表格的一格（测试会查）
   · 文字里的 [拳] [重] [踢] [拿] [挡] [蹲] [跳] [前] [后] [冲] 换成按键（按你自己设的单人键位显示）
   · 前摇、伤害、倍率都直接读招式表和 config.js 的常数：改了数值，教程跟着变；动作小图 PoseIcon 用游戏自己的姿势和画法
   ============================================================ */

/* ---------- 动作小图 ---------- */
const PoseIcon = {
  F: null,
  fig() { return this.F || (this.F = new Fighter(0, { look: 'ink', x: 0, facing: 1 })); },
  // 一招在第 ph 阶段的样子（0 起手 → 1 出手 → 2 判定完 → 3 收完；script 动作的 ph 是整段进度 0~1）
  poseAt(name, ph, MV) {
    const d = (MV || MOVES)[name];
    const t = d.script ? ph * d.R : ph <= 1 ? ph * d.S : ph <= 2 ? d.S + (ph - 1) * d.A : d.S + d.A + (ph - 2) * d.R;
    return copyPose(mk(), evalKeys(d.keys, t));
  },
  joints(pose, alt) {
    const F = this.fig();
    copyPose(F.disp, pose); F.alt = alt || 0; F.vz = 0; F.x = 0; F.facing = 1; F.state = 'idle'; F.J = null; F.ikS = null;
    F.fk(); return cloneJ(F.J);
  },
  // spec：{ move: 招名, ph: 阶段（默认出手那一下）, alt: 离地高 } 或 { pose: 架势名 } 或 { run: true }；style：哪一派（不写是传统格斗）
  build(s) {
    let pose, trail = null;
    const ST = s.style && STYLES[s.style], MV = ST ? ST.moves : MOVES, PS = ST && ST.poses || POSE;
    if (s.move) {
      const d = MV[s.move], ph = s.ph != null ? s.ph : d.script ? 0.5 : 1.35;
      pose = this.poseAt(s.move, ph, MV);
      if (d.limb && !d.script && s.trail) {
        trail = [];
        for (const p of [0.62, 0.74, 0.84, 0.92, 1, 1.1, 1.2]) if (p < ph) trail.push(this.joints(this.poseAt(s.move, p, MV), s.alt)[d.limb]);
      }
    } else if (s.run) { const F = this.fig(); F.walkPhase = 0.32; F.runT = 20; pose = F.runPose(mk()); }
    else pose = copyPose(mk(), PS[s.pose] || POSE[s.pose] || POSE.stance);
    if (s.rot) pose.rot = s.rot;
    const J = this.joints(pose, s.alt);
    if (trail) trail.push(J[MV[s.move].limb]);
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
    let x0 = 1e9, x1 = -1e9, y0 = 1e9;
    const pts = Object.values(J).filter(Array.isArray).concat(trail || []);
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); }
    x0 -= 16; x1 += 16; y0 -= BONE.head + 10;
    const y1 = FLOOR + 6, m = 4;
    const s = Math.min(h * 0.86 / 162, (w - 2 * m) / (x1 - x0), (h - 2 * m) / (y1 - y0));
    g.scale(k, k);
    if (o.flip) { g.translate(w, 0); g.scale(-1, 1); }
    g.translate(w / 2 - (x0 + x1) / 2 * s, h - m - y1 * s + 2); g.scale(s, s);
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
// 连招的按法：'jab' 'heavy' 'kick' 'd:kick'（蹲着按）'f:jab'（朝他按着方向按）…… → 一串字（键位在页面上方写一次）
const COMBO_TOK = { jab: '拳', heavy: '重', kick: '踢', grab: '拿', 'd:kick': '蹲踢', 'd:jab': '蹲拳', 'd:heavy': '蹲重', 'd:grab': '蹲拿', 'f:jab': '前拳', 'f:heavy': '前重', 'b:heavy': '后重' };
const comboKeys = (keys, times) => keys.map(k => `<i class="tok${k.startsWith('d:') ? ' low' : ''}">${COMBO_TOK[k]}</i>`).join('<i class="sep">›</i>') + (times ? `<i class="tok times">${times}</i>` : '');
const HN = { mid: '中', low: '下', high: '上' };
// 2.6 帧数按 1/4 帧算：整数照写，零头写成 .25 / .5 / .75
const fmtF = v => Number.isInteger(v) ? String(v) : String(+v.toFixed(2));
const FRAME_NOTE = `1 帧 = 1/60 秒，按 1/4 帧算，所以有 .25、.5、.75。射程是两人中心距，单位像素，算上往前冲的那一段；空中招的伤害已经乘了 ×${AIR_BONUS}。段：中段站蹲都能挡，下段要蹲着挡，上段要站着挡。`;

// 键位表的一行一行：[说明, 动作…, 备注]
const KEY_ROWS = [['移动', ['left', 'right'], '按哪边朝哪边跑'], ['跳', ['up']], ['蹲', ['down']], ['短拳', ['jab']], ['重拳', ['heavy']], ['腿踢', ['kick']], ['格挡', ['block'], '按住'], ['擒拿', ['grab']],
  ['冲刺', ['dash'], '按着挡朝对手冲 = 闪身']];
// 2.4 冲刺：选了「双击」显示「左左 / 右右」；选了「冲刺键」显示冲刺键；2.5.1 选了「两种都用」两样都显示
const dashKeyCaps = set => (set.dash || []).filter(Boolean).map(c => `<kbd>${gEsc(keyName(c))}</kbd>`).join('') || '—';
const dashTapCaps = set => ['left', 'right'].map(a => { const c = gEsc(keyName((set[a] || []).find(Boolean) || null)); return `<kbd>${c}</kbd><kbd>${c}</kbd>`; }).join('<i class="or">/</i>') + '<i class="or">双击</i>';
const dashCaps = set => set.dashMode === 'key' ? dashKeyCaps(set) : set.dashMode === 'both' ? dashTapCaps(set) + '<i class="or">或</i>' + dashKeyCaps(set) : dashTapCaps(set);
const keyCaps = (set, acts) => acts[0] === 'dash' ? dashCaps(set) : acts.map(a => ((set[a] || []).filter(Boolean).map(c => `<kbd>${gEsc(keyName(c))}</kbd>`).join('') || '—')).join('<i class="or">/</i>');

/* ============================================================
   排版的零件：每一种内容两种排法 —— web（网页版：卡片）、man（软件版：表格）。书里的每一页都用这几样拼
   ============================================================ */
const GX = {
  // 一段话
  p(t, mode) { return mode === 'man' ? `<p class="mn-p">${t}</p>` : `<p class="g-lead">${t}</p>`; },
  note(t, mode) { return mode === 'man' ? `<p class="mn-dim">${t}</p>` : `<p class="g-note">${t}</p>`; },
  // 小标题 + 内容
  sec(title, body, mode, small) {
    return mode === 'man' ? `<h3>${title}</h3>${small ? `<p class="mn-dim">${small}</p>` : ''}${body}`
      : `<section class="g-sec"><h3>${title}${small ? `<small>${small}</small>` : ''}</h3>${body}</section>`;
  },
  // 招式：[{ id, how, icon, desc, tier?, height?, ko? }]，MV 这一派的招式表，style 这一派的 id
  moves(list, MV, style, mode) {
    const tierOf = g => g.tier || TIER_NAME[MV[g.id].tier] || '—', hOf = g => g.height || HN[MV[g.id].height] || '中';
    const ic = (g, w, h) => iconSlot(Object.assign({ style }, g.icon), w, h);
    if (mode === 'man') {
      return `<table class="mn-t moves"><thead><tr><th></th><th>招式</th><th>怎么按</th><th>系</th><th>段</th><th class="num">前摇</th><th class="num">伤害</th><th>说明</th></tr></thead><tbody>${list.map(g => {
        const d = MV[g.id];
        return `<tr><td class="ic">${ic(g, 64, 64)}</td><th>${d.label}${g.ko ? '<small>击倒</small>' : ''}</th><td class="how">${gText(g.how)}</td><td>${tierOf(g)}</td><td>${hOf(g)}</td><td class="num">${g.noFrame ? '—' : fmtF(d.S)}</td><td class="num">${g.dmg !== undefined ? g.dmg : Math.round(d.dmg * (d.air ? AIR_BONUS : 1))}</td><td>${gText(g.desc)}</td></tr>`;
      }).join('')}</tbody></table>`;
    }
    return `<div class="g-grid moves">${list.map(g => {
      const d = MV[g.id], t = tierOf(g), hh = hOf(g);
      return `<article class="g-move">${ic(g, 108, 108)}<div class="gm-body"><h4>${d.label}</h4><div class="gm-how">${gText(g.how)}</div>
        <div class="gm-tags">${t !== '—' ? `<span class="tag t-${t}">${t}系</span>` : ''}${hh !== '—' ? `<span class="tag">${hh}段</span>` : ''}${g.ko ? '<span class="tag ko">击倒</span>' : ''}${d.S && !g.noFrame ? `<span class="tag fr">前摇 ${fmtF(d.S)}</span>` : ''}</div>
        <p>${gText(g.desc)}</p></div></article>`;
    }).join('')}</div>`;
  },
  // 连招：[{ group, note?, list: [{ keys, times?, name, moves, tag?, ko? }] }]
  combos(groups, style, mode) {
    const ic = (m, w, h) => iconSlot({ style, move: m }, w, h);
    if (mode === 'man') {
      return `<table class="mn-t combos"><thead><tr><th>按法</th><th>连招</th><th>特点</th><th>样子</th></tr></thead><tbody>${groups.map(G =>
        `<tr class="grp"><th colspan="4">${G.group}${G.note ? `<small>${G.note}</small>` : ''}</th></tr>` + G.list.map(c =>
          `<tr><td class="ck">${comboKeys(c.keys, c.times)}</td><th>${c.name}${c.ko ? '<small>击倒</small>' : ''}</th><td>${c.tag || ''}</td><td class="strip">${c.moves.map(m => ic(m, 58, 62)).join('')}</td></tr>`).join('')).join('')}</tbody></table>`;
    }
    return groups.map(G => `<section class="g-sec"><h3>${G.group}${G.note ? `<small>${G.note}</small>` : ''}</h3><div class="g-grid combos">${G.list.map(c =>
      `<article class="g-combo${c.ko ? ' ko' : ''}"><div class="gc-strip">${c.moves.map(m => ic(m, 86, 92)).join('<i class="gc-arrow">›</i>')}</div>
        <div class="gc-body"><div class="gc-keys">${comboKeys(c.keys, c.times)}</div><h4>${c.name}</h4>${c.tag ? `<p>${c.tag}</p>` : ''}</div></article>`).join('')}</div></section>`).join('');
  },
  // 技巧：[{ group, list: [{ name, how, icon, desc, more? }] }]
  tech(groups, style, mode) {
    const ic = (t, w, h) => iconSlot(Object.assign({ style }, t.icon), w, h);
    if (mode === 'man') {
      return groups.map(G => `<h3>${G.group}</h3><table class="mn-t tech"><colgroup><col style="width:76px"><col style="width:150px"><col style="width:300px"><col></colgroup><tbody>${G.list.map(t =>
        `<tr><td class="ic">${ic(t, 56, 60)}</td><th>${t.name}</th><td class="how">${gText(t.how)}</td><td>${gText(t.desc)}${t.more ? `<ul>${t.more.map(m => `<li>${gText(m)}</li>`).join('')}</ul>` : ''}</td></tr>`).join('')}</tbody></table>`).join('');
    }
    return groups.map(G => `<section class="g-sec"><h3>${G.group}${G.note ? `<small>${G.note}</small>` : ''}</h3><div class="g-grid tech">${G.list.map(t =>
      `<article class="g-tech">${ic(t, 84, 90)}<div class="gt-body"><h4>${t.name}</h4><div class="gt-how">${gText(t.how)}</div><p>${gText(t.desc)}</p>${t.more ? `<ul>${t.more.map(m => `<li>${gText(m)}</li>`).join('')}</ul>` : ''}</div></article>`).join('')}</div></section>`).join('');
  },
  // 名词解释：[[名字, 说明]]
  dl(rows, mode) {
    return mode === 'man' ? `<table class="mn-t"><tbody>${rows.map(([a, b]) => `<tr><th>${a}</th><td>${gText(b)}</td></tr>`).join('')}</tbody></table>`
      : `<dl class="g-dl">${rows.map(([a, b]) => `<dt>${a}</dt><dd>${gText(b)}</dd>`).join('')}</dl>`;
  },
  // 三列的表：[[名字, 说明, 数]]
  muls(rows, mode) {
    return mode === 'man' ? `<table class="mn-t"><thead><tr><th>名字</th><th>什么时候</th><th class="num">倍率</th></tr></thead><tbody>${rows.map(([a, b, c]) => `<tr><th>${a}</th><td>${b}</td><td class="num">${c}</td></tr>`).join('')}</tbody></table>`
      : `<table class="g-mul"><tbody>${rows.map(([a, b, c]) => `<tr><th>${a}</th><td>${b}</td><td class="num">${c}</td></tr>`).join('')}</tbody></table>`;
  },
  // 一串要点（有序）
  steps(list, mode) { return mode === 'man' ? `<ol class="mn-ol">${list.map(t => `<li>${gText(t)}</li>`).join('')}</ol>` : `<ol class="g-steps">${list.map(t => `<li>${gText(t)}</li>`).join('')}</ol>`; },
  // 网页版两张卡片并排（软件版就是上下两节）
  pair(a, b, mode) {
    if (mode === 'man') return GX.sec(a[0], a[1], mode) + GX.sec(b[0], b[1], mode);
    return `<div class="g-rules"><article class="g-card"><h3>${a[0]}</h3>${a[1]}</article><article class="g-card"><h3>${b[0]}</h3>${b[1]}</article></div>`;
  },
  // 横着滚的大表
  wide(html, mode) { return `<div class="scrollx">${html}</div>`; },
};
// 帧数表：MV 这一派的招式表，rows 要列的招
function frameTableHtml(MV, rows, dmgOf) {
  MV = MV || MOVES; rows = rows || FRAME_ROWS;
  const body = rows.map(k => {
    const d = MV[k], dmg = dmgOf && dmgOf(k, d) !== undefined ? dmgOf(k, d) : Math.round(d.dmg * (d.air ? AIR_BONUS : 1));
    return `<tr><td>${d.label}</td><td>${TIER_NAME[d.lead] || '—'}</td><td>${TIER_NAME[d.tier] || '—'}</td><td>${HN[d.height] || '中'}</td><td>${fmtF(d.S)}</td><td>${d.dive ? '到地' : fmtF(d.A)}</td><td>${fmtF(d.R)}</td><td>${dmg}</td><td>${d.reach + (d.lunge ? Math.max(0, d.lunge[2]) : 0)}</td></tr>`;
  }).join('');
  return `<table class="frames"><thead><tr><th>招式</th><th>起手</th><th>主系</th><th>段</th><th>前摇</th><th>判定</th><th>后摇</th><th>伤害</th><th>射程</th></tr></thead><tbody>${body}</tbody></table>`;
}
// 组合克制总表（读 MOVES：起手 × 主系）
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
// 两个克制圈（网页版：三角；软件版：一排）
function triHtml(a, nodes, mode) {
  if (mode === 'man') return `<div class="mn-tri">${nodes.map(n => `<div>${n.icon(84)}<b>${n.name}</b></div>`).join('<span>克</span>')}<span>克</span><div class="mn-tri-end">${nodes[0].icon(84)}<b>${nodes[0].name}</b></div></div>`;
  return `<div class="tri-wrap">
    <svg class="tri-arrows" viewBox="0 0 300 260" aria-hidden="true"><defs><marker id="ga${a}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--cinnabar)"/></marker></defs>
      <path d="M118 52 Q60 92 66 156" marker-end="url(#ga${a})"/><path d="M96 214 Q150 246 204 214" marker-end="url(#ga${a})"/><path d="M234 156 Q240 92 182 52" marker-end="url(#ga${a})"/></svg>
    ${nodes.map((n, i) => `<div class="tri-node n${i}">${n.icon(76)}<b>${n.name}</b></div>`).join('')}
    ${nodes.map((n, i) => `<span class="tri-k k${i}">克</span>`).join('')}</div>`;
}

/* ============================================================
   通用：哪一派都一样的东西
   ============================================================ */
const G_FIRST = [
  '难度从「入门」开始，打得过再往上调。',
  '菜单「拳派」里先挑一派。每一派五个键一样，打法不一样：上面选那一派的书看。',
  '拳克腿、腿克重、重克拳：看他出什么，出克它的那一手。',
  '他老举着手挡，贴上去拿他，或者蹲下打下段。',
  '挡住他一下以后他还在收招，马上打回去。',
  '被打倒了，起身的时候按住方向滚开，别在原地站起来挨打。',
  '训练场里能对着木桩随便练；破招练习一招一招教怎么破传统格斗的招。',
];
const G_RULES = [
  ['胜负', `血量 ${MAX_HP}，五局三胜。人机、联机每回合 ${ROUND_FRAMES / 3600} 分钟；双人对战、训练场不限时。`],
  ['交手', '两边同时打中，先比主系：克制的一方叫「克」，单方面打中。主系一样再比起手：克制的一方叫「压」，被压的吃全额、被打退，压人的只吃三成还能接着打。都一样就是拼招，各掉五成、互相震退。'],
  ['起手和主系', '单招两者一样；连招的起手是第一下，主系是最后一下。'],
  ['高低', '中段站着、蹲着都能挡；下段要蹲着挡；上段要站着挡。每一招是哪一段，看那一派的招式页。'],
  ['连击衰减', '同一套里每多挨一下，硬直更短、被推得更远、伤害更低，连四五下就断。咏春拳的连环冲拳衰减得慢。'],
  ['势破', `被挡住的那个人，下一记短拳的前摇多 ${SLOW_JAB_ADD} 帧，头上一个「势」字。`],
  ['朝向', '按着方向不出招就是跑，马上朝那边跑，没有后退。不按左右、格挡的时候自动面向对手；出招时对手在近身范围里，一律朝他打，乱按方向也不打空。'],
  ['气', `挨打、格挡、打中都会涨，挨打涨得最多。半格 ${QI_BURST} 能爆气，满格 ${QI_MAX} 能放大招。`],
  ['擒拿', '擒拿挡不住。站着的擒拿抓不到蹲着的，蹲着的擒拿抓不到站着的。'],
  ['跳', `跳起来出招 ×${AIR_BONUS}，每跳只能出一招；落地前来不及出完，就变成落地后马上出。往前蹬的空中腿蹲下躲得开。`],
];
const G_MULS = [
  ['克', '主系克制，单方面打中', '×' + BEAT_MUL],
  ['破招', '打在对方前摇里', '×' + COUNTER_MUL],
  ['迎击', '打在全速跑过来、冲刺收尾的人身上', '×' + COUNTER_MUL],
  ['冲势', '冲刺途中、刚冲完出的第一招', '×' + DASH_IN_MUL],
  ['空中招', '跳起来出的招', '×' + AIR_BONUS],
  ['挡后反击', '打在你刚挡住的那一招的收招里', `×${PUNISH_MUL}，击倒招 ×${PUNISH_KD_MUL}`],
  ['失衡后打中', '卸开、拍开、耕开以后趁他失衡打', '×' + PARRY_MUL],
  ['破绽', '击倒招打空了，打它的收招', '×' + WHIFF_KD_MUL],
  ['截住闪身', '他钻过来的时候被短拳、腿、下段、擒拿打中', '×' + SLIP_CAUGHT_MUL],
  ['格挡', '挡住了只吃', Math.round(BLOCK_KEEP * 10) + ' 成'],
];
// 身法和倒地：图用传统格斗的动作（哪一派都一样的按法）
const G_BODY = [
  { group: '身法', list: [
    { name: '格挡', how: '按住 [挡]', icon: { pose: 'block' }, desc: `只吃 ${Math.round(BLOCK_KEEP * 10)} 成伤害。刚按下挡的那一下每一派不一样：传统格斗是卸力，咏春拳是拍手。`,
      more: ['下段要按住 [蹲] 挡，上段要站着挡', '背对着挡不住'] },
    { name: '冲刺', how: '双击 [前] 或 [后]', icon: { move: 'dash', ph: 0.3 }, desc: '贴地滑出一大步；前几帧谁也打不中你，能穿到对面身后。' },
    { name: '冲势', how: '冲刺里出招', icon: { move: 'dash', ph: 0.6 }, desc: `冲刺途中、刚冲完出的第一招 ×${DASH_IN_MUL}，被挡也压得住。` },
    { name: '边挡边走', how: '按住 [挡] 再按方向', icon: { pose: 'block' }, desc: '举着手慢慢走，前后都行，一直面朝对手，照样挡得住。' },
    { name: '闪身', how: '按住 [挡]，朝对手双击 [前]', icon: { move: 'slip', ph: 0.3 }, desc: '压低身子从他身边钻过去。只躲得过重拳一类；躲过了自动转身打他背后一下，他背对着你踉跄。',
      more: [`短拳、腿、下段、擒拿截得住闪身，挨了 ×${SLIP_CAUGHT_MUL}`] },
    { name: '跳', how: '[跳]，按着方向跳得远', icon: { pose: 'leap', alt: 46 }, desc: '跑起来再跳更远。每跳只能出一招空中招；空中按方向只能小调。' },
  ] },
  { group: '挨打和倒地', list: [
    { name: '挣脱', how: '被抓住马上按 [拿]', icon: { pose: 'pulled' }, desc: '刚被抓住那一下按就挣开，提前几帧按的也算。有的摔法挣不脱，看那一派的攻防页。' },
    { name: '爆气', how: '挨打时 [重] + [踢]', icon: { move: 'burst', ph: 0.25 }, desc: `花半格气从身上炸开：对面倒地、掉 ${BURST_DMG} 血。只在挨打的时候能用。` },
    { name: '起身', how: '倒地后自己起来', icon: { pose: 'rise' }, desc: '躺一会儿，起身的时候打不中；站起来那几帧是起身硬直，打得中、动不了；然后才能动。' },
    { name: '滚身起', how: '倒地时按住方向', icon: { pose: 'tuck' }, desc: '起身时往那边滚开，往前滚得远、往后滚得近，躲开守在你起身处的人。滚完站起来那几帧比原地起身久，对面看见了追上来出短拳打得到。' },
    { name: '压起身', how: '他站起来那一下按 [拳]', icon: { move: 'jab' }, desc: '短拳算好时机打在起身硬直里必中；重拳、腿太慢，要提前出。' },
  ] },
  { group: '空中交手', list: [
    { name: '倒栽葱', how: '空中出招被克它的招打中', icon: { pose: 'fall', alt: 30 }, desc: '摔下来倒地更久。对空的招打中空中招、站着的拳迎着打中往下踩的空中招，都是倒栽葱。' },
    { name: '翻滚回去', how: '空中的腿撞上地上的腿', icon: { pose: 'tuck', alt: 40 }, desc: '空中那个只吃一半伤害，高高地往后翻出五六个身位；落地时两边一起能动，重新来过。' },
  ] },
];

/* ============================================================
   传统格斗
   ============================================================ */
const G_MOVES = [
  { id: 'jab', how: '[拳]', icon: { move: 'jab' }, desc: '最快的一下，贴身抢先手；能打断对面出腿。' },
  { id: 'heavy', how: '[重]', icon: { move: 'heavy' }, desc: '前摇长、有霸体：硬吃一记短拳照样打出去。怕腿、怕擒拿。' },
  { id: 'kick', how: '[踢]', icon: { move: 'kick' }, desc: '射程最远，化解重拳。起腿时挨拳会失衡倒地，还怕接腿。' },
  { id: 'grab', how: '[拿]', icon: { move: 'grab', ph: 1.6 }, tier: '擒拿', height: '—', dmg: `${MOVES.grab.dmg}~${THROW_DMG}`, desc: '挡不住。抓住后按 拳 / 踢 / 重 三种摔法。抓不到蹲着的人。' },
  { id: 'lowJab', how: '[蹲] + [拳]', icon: { move: 'lowJab' }, desc: '下段：站着挡不住，要蹲着挡。' },
  { id: 'sweep', how: '[蹲] + [踢]', icon: { move: 'sweep' }, ko: true, desc: '下段，扫倒人。被蹲挡住会挨踩腿，收招很长。' },
  { id: 'palm', how: '[蹲] + [重]', icon: { move: 'palm' }, ko: true, desc: '对空：专打跳过来的人，打下来摔个倒栽葱。' },
  { id: 'lowGrab', how: '[蹲] + [拿]', icon: { move: 'lowGrab', ph: 1.6 }, tier: '擒拿', dmg: `${TACKLE_DMG}~${SCOOP_DMG}`, desc: '抓蹲着、蹲挡的人；接得住出腿和扫堂腿。抓不到站着的。' },
  { id: 'shoulder', how: '跑起来按 [重]', icon: { move: 'shoulder' }, desc: '能硬吃两下拳，把人撞得老远。' },
  { id: 'airJab', how: '[跳] 再按 [拳]', icon: { move: 'airJab', alt: 64, ph: 1.6 }, desc: '最快的空中招。空中招都是上段，伤害 ×' + AIR_BONUS + '。' },
  { id: 'airHeavy', how: '[跳] 再按 [重]', icon: { move: 'airHeavy', alt: 54, ph: 1.6 }, desc: '跳起来双拳往下砸，伤害高。' },
  { id: 'airKick', how: '[跳] 再按 [踢]', icon: { move: 'airKick', alt: 60, ph: 1.6 }, desc: '跳起来一脚蹬过去，射程远。蹲下躲得开。' },
  { id: 'dive', how: '空中 [蹲] + [踢]', icon: { move: 'dive', alt: 66, ph: 1.4 }, desc: '先往上一腾，再朝人踩下去。专踩蹲着的、踩断托天掌；怕站着的拳。' },
  { id: 'burst', how: '挨打时 [重] + [踢]', icon: { move: 'burst', ph: 0.25 }, tier: '—', height: '—', noFrame: true, dmg: BURST_DMG, desc: `花半格气从身上炸开：对面倒地、掉 ${BURST_DMG} 血。只在挨打时能用。` },
  { id: 'super', how: '气满 [重] + [踢]', icon: { move: 'super' }, ko: true, desc: `必杀，${MOVES.super.dmg} 血。先沉身蓄力，这一下霸体，打它没用、拿得住；再单手一掌推出去。挡住了只掉三成。` },
];
const G_COMBOS = [
  { group: '拳起手', note: '短拳快，打中了接什么都来得及', list: [
    { keys: ['jab', 'jab'], name: '后手直拳', moves: ['jab', 'jab2'] },
    { keys: ['jab', 'jab', 'jab'], name: '摆拳', moves: ['jab2', 'jab3'] },
    { keys: ['jab'], times: '×4~5', name: '连珠快拳', moves: ['rushL', 'rushR'], tag: '一串快拳' },
    { keys: ['jab'], times: '×6', name: '寸劲', moves: ['rushEnd'], tag: '收势，把人打远' },
    { keys: ['jab', 'heavy'], name: '进步冲拳', moves: ['jab', 'beng'], tag: '冲击波' },
    { keys: ['jab', 'jab', 'heavy'], name: '冲天炮', moves: ['jab2', 'upper'], tag: '把人打上天', ko: true },
    { keys: ['jab', 'kick'], name: '鞭腿', moves: ['jab', 'whip'] },
    { keys: ['jab', 'jab', 'kick'], name: '转身蹬', moves: ['jab2', 'backKick'], tag: '把人蹬远' },
  ] },
  { group: '重起手', note: '重拳打中了接，被挡住接也照样出', list: [
    { keys: ['heavy', 'jab'], name: '顶肘', moves: ['heavy', 'elbow'], tag: '贴身' },
    { keys: ['heavy', 'heavy'], name: '劈山掌', moves: ['heavy', 'chop'], tag: '上段，要站着挡' },
    { keys: ['heavy', 'kick'], name: '旋风腿', moves: ['heavy', 'whirl'], tag: '转身一腿扫倒', ko: true },
    { keys: ['heavy', 'd:kick'], name: '重拳接扫堂腿', moves: ['heavy', 'sweep'], tag: '下段，和劈山掌二选一，让他猜' },
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
    { name: '卸力', how: '快挨打的一瞬间刚按下 [挡]', icon: { pose: 'parry' }, desc: `按下挡的 ${PARRY_WIN} 帧里被打中：不掉血，对面失衡；接着打中 ×${PARRY_MUL}。`,
      more: [`两次按挡要隔 ${PARRY_LOCK} 帧以上才有卸力，乱按没用`, '卸力后按 [拿] 是借力摔'] },
    { name: '推挡', how: '挡住以后按 [拳]', icon: { move: 'shove' }, desc: '把对面推开，打断他接下来的招，不掉他的血。' },
    { name: '截击', how: '挡住以后按 [重]', icon: { move: 'jieQuan' }, desc: `花 ${GC_COST} 气从格挡里打出一拳，出手前打不中你。` },
    { name: '踩腿', how: '蹲挡住扫堂腿，马上 [蹲] + [踢]', icon: { move: 'stomp' }, desc: `一脚踩倒，算挡后反击 ×${PUNISH_KD_MUL}。` },
    { name: '回身肘', how: '闪身躲过重拳', icon: { move: 'slipElbow' }, desc: '自动出：钻到他身后回身一肘，他背对着你踉跄、动不了，你先动。' },
  ] },
  { group: '擒拿', list: [
    { name: '擒住以后', how: '按 [拳] / [踢] / [重]', icon: { move: 'hold', ph: 0.6 }, desc: '拳是提膝撞，踢是别腿摔，重或者按住后是过肩摔，不按就推开。' },
    { name: '过肩摔', how: '面前有人时按住 [后] 再 [拿]', icon: { move: 'throwBack', ph: 0.45 }, desc: '不转身，抓住直接摔到身后，把人换到墙角。' },
    { name: '接腿摔', how: '对面出腿时按 [拿]', icon: { move: 'legCatch', ph: 0.25 }, desc: '抓住腿直接摔倒，挣不脱。手要在腿踢到之前伸出来。' },
    { name: '借力摔', how: '卸力以后按 [拿]', icon: { pose: 'parry' }, desc: '趁对面失衡把他摔出去，挣不脱。' },
  ] },
];
const G_TRAD_TIPS = [
  '先用短拳试探：短拳最快，被挡了也不亏多少。',
  '看见他抬腿，出短拳；看见他往后蓄重拳，起腿；他贴着你连拳，出重拳硬吃。',
  '他老举着手挡，贴上去擒拿，或者蹲下打下段。',
  '挡住他一下以后他还在收招，马上 拳拳重 打回去，这叫挡后反击。',
  '快挨打的那一下刚按下挡是卸力：不掉血，他失衡，你先打。',
  '跳过来的人用托天掌打下来；空中往下踩的坠山，站着出拳迎上去。',
];
const G_TRAD_MULS = [
  ['拳迎坠山', '站着的拳迎面打中坠山，倒栽葱', '×' + DIVE_PUNCH_MUL],
  ['踩蹲', '坠山踩中蹲着的', '×' + DIVE_CROUCH_MUL],
  ['踩断对空', '坠山踩中正在出托天掌的', '×' + DIVE_AA_MUL],
];
const FRAME_ROWS = ['jab', 'heavy', 'kick', 'grab', 'lowGrab', 'beng', 'whip', 'elbow', 'chop', 'whirl', 'stepPunch', 'hammer', 'twinKick', 'upper', 'backKick', 'rushEnd',
  'lowJab', 'sweep', 'palm', 'shoulder', 'airJab', 'airHeavy', 'airKick', 'dive', 'shove', 'jieQuan', 'stomp', 'slipElbow', 'super'];
const tradDmg = k => k === 'grab' ? `${MOVES.grab.dmg}~${THROW_DMG}` : k === 'lowGrab' ? `${TACKLE_DMG}~${SCOOP_DMG}` : undefined;

/* ============================================================
   咏春拳（WINGCHUN.md）
   ============================================================ */
const WG_KEYS = [
  { name: '连环冲拳', how: '[拳]，按着拍子按', icon: { move: 'wJabR' }, desc: '两只手轮流打，按在拍子上越打越快、越顺，第 8 下寸拳收势。[前] + [拳] 标指，[蹲] + [拳] 低掌。' },
  { name: '寸拳', how: '[重]，按住蓄劲', icon: { move: 'wCun' }, desc: '[前] + [重] 批肘，[后] + [重] 拐肘，[蹲] + [重] 沉肘。' },
  { name: '撑脚', how: '[踢]', icon: { move: 'wKick' }, desc: '近、快、伤害小。[蹲] + [踢] 截脚，专截地上的腿。' },
  { name: '拉手', how: '[拿]', icon: { move: 'grab', ph: 1.6 }, desc: '拉住打过来的手，扣住站着的人，都进搭手。[蹲] + [拿] 截腿。' },
  { name: '黐手', how: '点一下 [挡] 拍手，按住 [挡] 黐手', icon: { pose: 'chiTan' }, desc: '黏住打过来的手脚就进搭手。蹲着按是耕手。' },
  { name: '搭手', how: '手搭上了以后', icon: { pose: 'tchBong' }, desc: '翻手型、从手型里打出去，或者拉手扣住手腕往下拽。' },
];
const WG_TIPS = [
  '先练拍子：一串里的拳和踢都看你按得准不准，不看打没打中。头上写「抢拍」是按早了，「过拍」是按晚了。乱按全是空，按准了才打得满。',
  '自己主动打一串伤害打八折；反打回去的、搭手里打出去的才疼。手腿短，别追着人打，等他来。',
  '贴着他按住挡，等他出手：打过来就黏住，进搭手。',
  '搭手里先翻一下手型再打，顺涨上去打得更疼。他前手打来翻摊、后手打来翻膀、腿打来翻伏，写「破」就是翻对了。',
  '翻手的那一拍会被人反拿：对面会反拿，就少翻，直接打。',
  '他挡着不动，拉手扣他手腕，再按 [蹲] 拉手跪马把他拽倒。',
  '被他连招打的时候按住挡 + 方向黐手破连：前手打来按 [前]、后手打来按 [后]、腿和下段按 [蹲]。',
];
const WG_MOVES = [
  { id: 'wJab', how: '[拳]', icon: { move: 'wJab' }, desc: '后手从问手的小臂上面直直冲出去，连环冲拳的第一拳。接着按拍子按就是一串，两只手轮流打，中间夹了踢也接着轮。收回来的拳在胸前绕一个小圆再打出去。' },
  { id: 'wBiu', how: '[前] + [拳]', icon: { move: 'wBiu' }, desc: '四指并拢往前一插，够得最远。正好插在他出手的胳膊上，就把手挑开、进搭手。' },
  { id: 'wLowPalm', how: '[蹲] + [拳]', icon: { move: 'wLowPalm' }, desc: '蹲下去一掌推在小腹底下。下段，要蹲着挡。' },
  { id: 'wCun', how: '[重]，按住蓄劲', icon: { move: 'wCun' }, desc: '贴着胸口一寸一寸炸出去的一拳。前摇里霸体吃一下拳，打中他失衡。按住蓄劲越蓄越疼，蓄满是寸劲破体，打倒；蓄的时候没有霸体。' },
  { id: 'wPai', how: '[前] + [重]', icon: { move: 'wPai' }, ko: true, desc: '后手肘提起来往下劈，贴身打倒。' },
  { id: 'wGwai', how: '[后] + [重]', icon: { move: 'wGwai' }, desc: '转马横着扫一肘，身侧、身后一点也扫得到，打中他失衡。' },
  { id: 'wJum', how: '[蹲] + [重]', icon: { move: 'wJum' }, desc: '跪马一沉，肘往下压。下段，打中他失衡。' },
  { id: 'wKick', how: '[踢]', icon: { move: 'wKick' }, desc: '提膝，脚跟直直撑出去。近、快、伤害小。' },
  { id: 'wLowKick', how: '[蹲] + [踢]', icon: { move: 'wLowKick' }, desc: '脚掌横着截在他膝盖、小腿上。下段。撞上他地上的出腿就截住，踢中他失衡。' },
  { id: 'grab', how: '[拿]', icon: { move: 'grab', ph: 1.6 }, tier: '擒拿', height: '—', dmg: `0~${WC_TRAP_DMG}`, desc: '前手一探扣手腕。他正出拳出掌 = 拉住他打过来的手，挣不脱；站着、挡着的人 = 扣住手腕，刚扣住那一下他挣得开。都进搭手。拉不住腿。' },
  { id: 'lowGrab', how: '[蹲] + [拿]', icon: { move: 'lowGrab', ph: 1.6 }, tier: '擒拿', dmg: 0, desc: '两手往前下方一截：截住地上的出腿，他失衡；也抓得住蹲着的人。抓不到站着的。' },
  { id: 'airJab', how: '[跳] 再按 [拳]', icon: { move: 'airJab', alt: 64, ph: 1.6 }, desc: '跳起来一拳。空中招都是上段。' },
  { id: 'airHeavy', how: '[跳] 再按 [重]', icon: { move: 'airHeavy', alt: 54, ph: 1.6 }, desc: '跳起来一掌往下拍，伤害高。' },
  { id: 'airKick', how: '[跳] 再按 [踢]', icon: { move: 'airKick', alt: 60, ph: 1.6 }, desc: '跳起来一脚撑过去，射程远。蹲下躲得开。' },
  { id: 'dive', how: '空中 [蹲] + [踢]', icon: { move: 'dive', alt: 66, ph: 1.4 }, desc: '先往上一腾，再把膝盖往前下方砸下去。专破蹲着的；怕站着的拳。' },
  { id: 'burst', how: '挨打时 [重] + [踢]', icon: { move: 'burst', ph: 0.25 }, tier: '—', height: '—', noFrame: true, dmg: BURST_DMG, desc: `花半格气，两只掌往外一撑从身上炸开：对面倒地、掉 ${BURST_DMG} 血。` },
  { id: 'super', how: '气满 [重] + [踢]', icon: { move: 'super' }, ko: true, dmg: `${WMOVES.super.dmg} + 连环`, desc: '往下一沉，第一拳打中就是一串左右交替的寸拳把人钉住，最后一记寸劲打飞，霸体也吃不住。第一拳被挡就停。' },
];
const WG_BEAT = [
  ['拍子', `这一下打到他以后再过一拍，下一下就该打到。拍子开始是 ${WC_BEAT} 帧，越顺越快，最快 ${WC_BEAT_MIN} 帧。一串里的拳和踢都按拍子：拳接踢、踢接拳、踢接踢一样。`],
  ['按在拍子上', `拍点前 ${WC_EARLY} 帧到后 ${WC_LATE} 帧之间按都算：按早了等到拍点出手，按晚了出手快一点补上。`],
  ['抢拍', `再早就是抢拍：这一下晚 ${WC_EARLY_LAG} 帧才出，顺不涨，中间就有空。`],
  ['过拍', '再晚就是过拍：顺清零，连断了，这一下等收完招从起手重新打，拳是冲拳，踢是慢的正撑脚。'],
  ['顺', `按在拍子上打中一下顺一级，最多 ${FLOW_MAX} 级。每一级伤害多 ${Math.round(FLOW_DMG * 100)}%、他的硬直更长、拍子更快。打空、被挡、挨打、停手就断了。`],
  ['头两下有空', '刚起手的第二下打中以后，他的硬直比拍子短一点：他一直按着挡，第三下就挡住了。第二下是踢也一样。连上三下、顺到两级以后就没有空。'],
  ['被挡', '一串被挡着的时候，每一下之间他都有一点空，推挡推得开。'],
  ['反打', `拍开、耕开、截住以后，第一拳就顺 ${FLOW_COUNTER} 级，一整套跑不掉，伤害也比自己起手的高。`],
  ['收势', '一串最多 8 下。连环拳里按 [重] 是寸拳收势；按 [踢] 是侧撑脚，再按 [踢] 连环撑、踩膝；打中了按 [拿] 是拉手扣住手腕。'],
];
const WG_COMBOS = [
  { group: '连环冲拳', note: '按在拍子上，一拍一拳', list: [
    { keys: ['jab'], times: '×8', name: '连环冲拳', moves: ['wJabF', 'wPalmR', 'wCunEndF'], tag: '两只手轮流打，每三拳一记立掌，第 8 下寸拳收势打倒', ko: true },
    { keys: ['jab', 'kick', 'jab', 'kick'], name: '拳踢轮着打', moves: ['wSideKick', 'wPalmF', 'wSideKick'], tag: '踢也要按在拍子上；踢完接的拳换另一只手' },
    { keys: ['jab', 'jab', 'jab', 'heavy'], name: '冲拳接寸拳', moves: ['wJabF', 'wPalmR', 'wCunEndF'], tag: '连环拳里随时按重：寸拳收势，霸体吃不住', ko: true },
    { keys: ['jab', 'jab', 'kick', 'kick', 'kick'], name: '侧撑 连环撑 踩膝', moves: ['wSideKick', 'wKick2', 'wStompKnee'], tag: '拳里接踢，踢里再接踢，都按拍子', ko: true },
    { keys: ['jab', 'jab', 'grab'], name: '冲拳接拉手', moves: ['wJabF', 'grab'], tag: '打中了按拿：扣住手腕进搭手' },
  ] },
  { group: '腿和下段起手', list: [
    { keys: ['kick', 'kick', 'kick'], name: '正撑 连环撑 踩膝', moves: ['wKick', 'wKick2', 'wStompKnee'], ko: true },
    { keys: ['d:kick', 'jab', 'jab'], name: '截脚接冲拳', moves: ['wLowKick', 'wJabR', 'wPalmF'], tag: '踢中他失衡，接着按拍子打' },
    { keys: ['d:jab', 'jab', 'jab'], name: '低掌接冲拳', moves: ['wLowPalm', 'wJabR', 'wPalmF'], tag: '下段起手' },
  ] },
];
const WG_GUARD = [
  { group: '挡', list: [
    { name: '拍手', how: '刚按下 [挡]', icon: { pose: 'pat' }, desc: `按下挡的 ${PARRY_WIN} 帧里被他手上的招打到：拍开，他失衡，你先打。空中的拳脚也拍得开。`,
      more: [`两次按挡要隔 ${PARRY_LOCK} 帧以上才拍得开，乱按没用`, '拍不到地上的腿和下段', '拍开以后按 [拳] 是后手冲拳，一手拍一手打'] },
    { name: '耕手', how: '蹲着刚按下 [挡]', icon: { pose: 'cblock' }, desc: '耕开地上的腿和下段，他失衡。耕不到中段的拳。' },
    { name: '黐手', how: '按住 [挡]', icon: { pose: 'roll1' }, desc: `黏住打过来的拳、掌、肘、腿：只吃 ${Math.round(BLOCK_KEEP * 10)} 成，他的招停住，进搭手。没按方向两只掌一里一外盘着；按着 [前] 是摊手往前压，按着 [后] 收回来护着。`,
      more: ['黏不住擒拿、空中招、大招', '站着黏不住下段，蹲着黏得住', '按着挡再按方向是黐着手慢慢走'] },
    { name: '黐手破连', how: '挨打时按住 [挡] + 方向', icon: { pose: 'chiBong' }, desc: `他连招的时候，下一下是前手打来按 [前]、后手打来按 [后]、腿和下段按 [蹲]：黏住他、进搭手，顺 ${FLOW_COUNTER} 级。`,
      more: [`按错了那一下伤害 ×${WC_WRONG_MUL}`, '顺到三级的连环冲拳太快，黏不住'] },
    { name: '截打', how: '挡着按 [拳]', icon: { move: 'shove' }, desc: '从手上直接一掌截出去，出手前几帧打不中你，接着按拍子连。' },
    { name: '转马', how: '按住 [挡]，朝对手双击 [前]', icon: { move: 'slip', ph: 0.3 }, desc: '只躲得过重拳一类，躲过了自动转马掌，他背对着你踉跄。' },
  ] },
];
// 搭手：先手那一方按什么
const WG_TOUCH = [
  ['[前] / [后] / [蹲]', '翻成摊 / 膀 / 伏', `翻一下顺一级。第一下就翻成克他那只手的手型叫「破」，顺两级：他前手打来翻摊、后手打来翻膀、腿和下段翻伏。最多翻 ${WC_ROLL_MAX} 下，翻成一样的、翻第四下就乱了。`],
  ['[拳]', '从手型里打出去', '没翻是直冲，摊是摊打，膀是膀转摊打，伏是伏打。打完接着按拍子连。'],
  ['[重]', '批肘', '疼、打倒，慢一点，他来得及甩手。'],
  ['[踢]', '撑脚', '低一点撑在他小腿上，他失衡。'],
  ['[拿]', '拉手扣住手腕', '扣住以后按 [拳] 拉打两拳，[重] 拉手批肘，[踢] 拉手撑脚，[蹲] 或再按 [拿] 拉手跪马；什么都不按是蝴蝶掌推开。'],
  ['不按', '脱手', `搭上以后 ${WC_TOUCH_OPEN} 帧里要按，翻完一下 ${WC_STEP} 帧里要按，不然两边松开。`],
];
// 搭手：被黏住的那一方
const WG_FOLLOW = [
  { name: '甩手', how: '按住 [挡] + [后]', icon: { pose: 'shake' }, desc: `把手一甩、往后撤半步，脱开。他 ${WC_LAT_WIN} 帧里按 [拳] 就是甩手直冲，必中。` },
  { name: '反拿', how: '他翻手的那一拍里按 [拿]', icon: { move: 'grab', ph: 1.6 }, desc: '抽手反抓，照你那一派的擒拿接下去。他没在翻手的时候按就是黏死：这一次搭手里什么都按不了。' },
  { name: '挣脱', how: '刚被扣住手腕时按 [拿]', icon: { pose: 'pulled' }, desc: '扣住刚开始那一下挣得开，提前几帧按的也算。拉手拉住打过来的手，挣不开。' },
  { name: '咏春打咏春', how: '被黏住时按着方向', icon: { pose: 'tchFook' }, desc: '按着 [前]、[后]、[蹲] 就是摊、膀、伏。膀克摊、摊克伏、伏克膀：他从被你克住的手型里打出来，就被化开，先手换给你。' },
];
const WG_LAP = { name: '拉手跪马', how: '扣住手腕以后按 [蹲]', icon: { move: 'tDrag', ph: 0.5 }, desc: '扣着他的手腕往回往下一拽，自己退一步沉身跪马：他往前扑倒，脸朝下趴在你面前，那只手还在你手里。' };
const WG_VS = [
  ['咏春拳打传统格斗', '他的重拳、腿慢：按住挡黐住，等他打过来，黏住了在手上做文章。他老举着手挡，就拉手扣他手腕，接拉手跪马。他贴身连拳，挨了第一下就按住挡 + 方向黐手破连。'],
  ['传统格斗打咏春拳', '他按着挡的时候别乱出拳脚，会被黏住。擒拿抓得住黐手的人，站着的黐手黏不住下段。被他黏住了，在他翻手那一拍里按 [拿] 反拿；他连环冲拳刚起手，挨了两拳马上按住挡，第三拳就挡住了。'],
];
const WG_MULS = [
  ['顺', '按在拍子上打中一下涨一级，每一级', `+${Math.round(FLOW_DMG * 100)}%`],
  ['自己起手', '站着主动打出去的一串，每一下', '×' + WC_NEUTRAL_MUL],
  ['反打', '拍开、耕开、压起身以后的一串，每一下', '×' + WC_COUNTER_MUL],
  ['搭手', '搭手里打出去的一串，每一下', '×' + WC_TOUCH_MUL],
  ['寸劲蓄满', '寸拳按住蓄满劲', '×1.6'],
  ['黐手破连按错', '挨打时按错了方向，那一下', '×' + WC_WRONG_MUL],
];
const WG_FRAMES = ['wJab', 'wJabR', 'wPalmF', 'wCunEnd', 'wBiu', 'wLowPalm', 'wCun', 'wPai', 'wGwai', 'wJum', 'wKick', 'wLowKick', 'wSideKick', 'wKick2', 'wStompKnee', 'wTurnKick',
  'grab', 'lowGrab', 'tChung', 'tTan', 'tBong', 'tFook', 'tPai', 'tKick', 'tLatChung', 'airJab', 'airHeavy', 'airKick', 'dive', 'shove', 'slipElbow', 'super'];
const wcDmg = (k, d) => d.kind === 'grab' ? (k === 'grab' ? `0~${WC_TRAP_DMG}` : '0') : k === 'super' ? `${d.dmg} + 连环` : undefined;

/* ============================================================
   书：通用一本、每一派一本。page：{ id, name, body(mode) }；以后加拳派在这里加一本
   ============================================================ */
const keysUse = (list, mode) => GX.p(`按键：<span class="g-keys">${list.map(c => gKbd(c)).join(' ')}</span>`, mode);
const GUIDE_BOOKS = [
  { id: 'all', name: '通用', pages: [
    { id: 'start', name: '上手', body(mode) {
      const S = Keys.solo;
      if (mode === 'man') {
        const rows = KEY_ROWS.concat([['暂停', null]]).map(([n, acts, note]) => `<tr><th>${n}</th>${acts ? [Keys.solo, Keys.p1, Keys.p2].map(k => `<td>${keyCaps(k, acts)}</td>`).join('') : '<td colspan="3"><kbd>Esc</kbd><i class="or">/</i><kbd>P</kbd></td>'}<td class="mn-dim">${note || ''}</td></tr>`).join('');
        const L = [lookOf(Looks.pvp[0]), lookOf(Looks.pvp[1])];
        return GX.p('墨斗是一对一的格斗：把对面的血打光，五局三胜。出招只有四个键：短拳、重拳、腿踢、擒拿；再加格挡。每一派按键一样、打法不一样。', mode) +
          GX.sec('键位', `<table class="mn-t keys"><thead><tr><th>动作</th><th>单人：人机 · 联机 · 训练场</th><th>双人 · 玩家一 · ${L[0].name}</th><th>双人 · 玩家二 · ${L[1].name}</th><th></th></tr></thead><tbody>${rows}</tbody></table>${GX.note('菜单「键位设置」里改，三套互不影响。', mode)}`, mode) +
          GX.sec('拳派', GX.dl(STYLE_IDS.map(id => [STYLES[id].name, guideStyleLine(id)]), mode), mode) +
          GX.sec('第一局怎么打', GX.steps(G_FIRST, mode), mode);
      }
      const keys = KEY_ROWS.map(([n, acts, note]) => `<div class="kr"><span class="kn">${n}</span><span class="kk">${keyCaps(S, acts)}</span>${note ? `<small>${note}</small>` : ''}</div>`).join('');
      return `<div class="g-start">
        <article class="g-card keys"><h3>键位<small>人机 · 联机 · 训练场</small></h3><div class="krows">${keys}<div class="kr"><span class="kn">暂停</span><span class="kk"><kbd>Esc</kbd><i class="or">/</i><kbd>P</kbd></span></div></div>
          <p class="g-note">菜单「键位设置」里能改；双人对战用另外两套键位，见下面。</p>
          <details class="g-pvp"><summary>双人对战的键位：两个人一个键盘</summary>${Guide.pvpKeys()}</details></article>
        <article class="g-card schools"><h3>拳派<small>菜单「拳派」里换</small></h3><ul class="g-books-list">${STYLE_IDS.map(id => `<li>${iconSlot({ style: id, pose: 'stance' }, 64, 72)}<div><b>${STYLES[id].name}</b><span>${guideStyleLine(id)}</span>
          <button type="button" class="g-link" data-book="${id}">看${STYLES[id].name}的书 →</button></div></li>`).join('')}</ul></article>
        <article class="g-card tips"><h3>第一局怎么打</h3>${GX.steps(G_FIRST, mode)}</article>
      </div>`;
    } },
    { id: 'rel', name: '克制', body(mode) {
      const ic = (spec) => w => iconSlot(spec, w, w);
      const t1 = triHtml(1, [{ name: '拳', icon: ic({ move: 'jab' }) }, { name: '腿', icon: ic({ move: 'kick' }) }, { name: '重', icon: ic({ move: 'heavy' }) }], mode);
      const t2 = triHtml(2, [{ name: '打击', icon: ic({ move: 'jab' }) }, { name: '擒拿', icon: ic({ move: 'grab', ph: 1.6 }) }, { name: '格挡', icon: ic({ pose: 'block' }) }], mode);
      const rows1 = [['拳克腿', '对面起腿的时候挨了你一拳，失衡倒地。'], ['腿克重', '重拳起手被腿化解，腿照样踢中他。'], ['重克拳', '重拳前摇有霸体，硬吃一记短拳照样打出去。']];
      const rows2 = [['打击克擒拿', '他伸手要抓，打他一下就断了。'], ['擒拿克格挡', '擒拿挡不住，专抓一直举着手的。'], ['格挡克打击', '挡住只吃三成；挡住以后他还在收招，马上打回去。']];
      if (mode === 'man') return GX.p('哪一派都是这两个圈：每一招属于拳、重、腿里的一系，三系互相克；打击、擒拿、格挡也互相克。', mode) + GX.sec('拳克腿 · 腿克重 · 重克拳', t1 + GX.dl(rows1, mode), mode) + GX.sec('打击 · 擒拿 · 格挡', t2 + GX.dl(rows2, mode), mode) + GX.sec('两边同时出招', GX.dl(G_RULES.slice(1, 3), mode), mode);
      return `<div class="g-start tri3">
        <article class="g-card tri"><h3>拳克腿 · 腿克重 · 重克拳</h3>${t1}${GX.dl(rows1, mode)}</article>
        <article class="g-card tri"><h3>打击 · 擒拿 · 格挡</h3>${t2}${GX.dl(rows2, mode)}</article>
        <article class="g-card"><h3>两边同时出招</h3>${GX.dl(G_RULES.slice(1, 3), mode)}<p class="g-note">每一派自己的招属于哪一系，看那一派的招式页和查表。</p></article>
      </div>`;
    } },
    { id: 'rules', name: '规矩', body(mode) {
      return GX.pair(['规矩', GX.dl(G_RULES.filter((r, i) => i !== 1 && i !== 2), mode)], ['伤害加成', GX.muls(G_MULS, mode) + GX.note('几种加成可以叠在一起，比如冲势加破招。每一派自己的加成写在那一派的书里。', mode)], mode);
    } },
    { id: 'body', name: '身法', body(mode) { return GX.tech(G_BODY, 'trad', mode); } },
  ] },
  { id: 'trad', name: '传统格斗', style: 'trad', pages: [
    { id: 'start', name: '上手', body(mode) {
      return GX.p('传统格斗：拳、重、腿三系的招式多、连招多，大开大合，重拳霸体、腿长、摔投，靠读招和破招。', mode) +
        GX.sec('怎么打', GX.steps(G_TRAD_TIPS, mode), mode) +
        GX.sec('自己的加成', GX.muls(G_TRAD_MULS, mode), mode);
    } },
    { id: 'moves', name: '招式', body(mode) {
      return keysUse(['拳', '重', '踢', '拿', '挡', '蹲', '跳'], mode) + GX.p('「系」决定谁克谁，「段」决定站着还是蹲着挡。前摇是按下去到打出来要几帧，越小越快。', mode) + GX.moves(G_MOVES, MOVES, 'trad', mode);
    } },
    { id: 'combos', name: '连招', body(mode) {
      return GX.p(`打中或者被挡住以后马上按下一招就接上了；没打中的话，0.4 秒内接着出也算。连招的<b>起手</b>是第一下、<b>主系</b>是最后一下，交手时按这两个比克制。<span class="g-keys">${['拳', '重', '踢', '蹲'].map(c => gKbd(c)).join(' ')}</span>`, mode) +
        GX.combos(G_COMBOS, 'trad', mode) + GX.note('连击衰减：同一套里挨得越多，硬直越短、推得越远，一套最多五下左右。', mode);
    } },
    { id: 'tech', name: '攻防', body(mode) { return GX.tech(G_TECH, 'trad', mode); } },
    { id: 'charts', name: '查表', body(mode) {
      return GX.sec('组合克制总表', GX.wide(relTableHtml(), mode) + GX.note(relLegend, mode), mode, '行是你的招，列是对手同时出的招；名字是「起手 + 主系」') +
        GX.sec('破解表', mode === 'man' ? `<table class="mn-t counters"><thead><tr><th>对手的招</th><th>都有哪些</th><th>怎么破</th></tr></thead><tbody>${COUNTERS.map(([k, e, v]) => `<tr><th>${k}</th><td class="mn-dim">${e}</td><td>${v}</td></tr>`).join('')}</tbody></table>`
          : `<dl class="counters">${COUNTERS.map(([k, e, v]) => `<div><dt>${k}</dt>${e ? `<dd class="ex">${e}</dd>` : ''}<dd>${v}</dd></div>`).join('')}</dl>`, mode, '每一种招、每一种技术都有破法；训练场的破招练习能一条一条对着木桩练') +
        GX.sec('帧数表', GX.wide(frameTableHtml(MOVES, FRAME_ROWS, tradDmg), mode) + GX.note(FRAME_NOTE, mode), mode);
    } },
  ] },
  { id: 'wc', name: '咏春拳', style: 'wc', pages: [
    { id: 'start', name: '上手', body(mode) {
      const lap = GX.tech([{ group: '咏春拳的摔', list: [WG_LAP] }], 'wc', mode);
      return GX.p('咏春拳：手短、快、贴身。连环冲拳按拍子打，不看打没打中；手一搭上就在手上做文章。', mode) +
        GX.tech([{ group: '五个键和搭手', list: WG_KEYS }], 'wc', mode) +
        GX.sec('怎么打', GX.steps(WG_TIPS, mode), mode) + lap;
    } },
    { id: 'moves', name: '招式', body(mode) {
      return keysUse(['拳', '重', '踢', '拿', '挡', '蹲', '前', '后'], mode) + GX.p('站着按键出这些招；连环拳里、搭手里按键是另一套，看后面两页。', mode) + GX.moves(WG_MOVES, WMOVES, 'wc', mode);
    } },
    { id: 'combos', name: '连环拳', body(mode) {
      return GX.pair(['拍子和顺', GX.dl(WG_BEAT, mode)], ['自己的加成', GX.muls(WG_MULS, mode)], mode) + GX.combos(WG_COMBOS, 'wc', mode);
    } },
    { id: 'tech', name: '黐手 · 搭手', body(mode) {
      const touch = mode === 'man' ? `<table class="mn-t"><thead><tr><th>按</th><th>做什么</th><th>说明</th></tr></thead><tbody>${WG_TOUCH.map(([a, b, c]) => `<tr><td class="how">${gText(a)}</td><th>${b}</th><td>${gText(c)}</td></tr>`).join('')}</tbody></table>`
        : `<table class="g-mul touch"><tbody>${WG_TOUCH.map(([a, b, c]) => `<tr><td class="how">${gText(a)}</td><th>${b}</th><td>${gText(c)}</td></tr>`).join('')}</tbody></table>`;
      return GX.tech(WG_GUARD, 'wc', mode) +
        GX.sec('搭手：手搭上了', GX.p('黐手黏住、标指挑开、拉手拉住、黐手破连，都进搭手：先手那一方手边一圈墨线，转完之前要按。手型在圈里写着。', mode) + touch, mode, '先手按什么') +
        GX.tech([{ group: '被黏住的一方', list: WG_FOLLOW }, { group: '扣住手腕以后', list: [WG_LAP] }], 'wc', mode);
    } },
    { id: 'charts', name: '查表', body(mode) {
      return GX.sec('两派对打', GX.dl(WG_VS, mode), mode) +
        GX.sec('帧数表', GX.wide(frameTableHtml(WMOVES, WG_FRAMES, wcDmg), mode) + GX.note(FRAME_NOTE + '直冲、摊打这几招是搭手里打出去的。', mode), mode);
    } },
  ] },
];
// 拳派一句话（菜单拳派面板里的那一句）
const guideStyleLine = id => (typeof STYLE_LINE !== 'undefined' && STYLE_LINE[id]) || '';
const bookOf = id => GUIDE_BOOKS.find(b => b.id === id) || GUIDE_BOOKS[0];

/* ============================================================
   网页版：游戏下面的「教程」—— 上面一排书（通用 / 各派），下面一排页
   ============================================================ */
const Guide = {
  el: null, book: 'all', tab: 'start',
  init() {
    this.el = document.getElementById('guide'); if (!this.el) return;
    try {
      const b = localStorage.getItem('modou.guideBook'), t = localStorage.getItem('modou.guideTab');
      if (GUIDE_BOOKS.some(x => x.id === b)) this.book = b;
      if (bookOf(this.book).pages.some(p => p.id === t)) this.tab = t;
    } catch (e) {}
    const books = this.el.querySelector('.g-books'), tabs = this.el.querySelector('.g-tabs');
    books.addEventListener('click', e => { const b = e.target.closest('[data-gb]'); if (b) this.open(b.dataset.gb); });
    tabs.addEventListener('click', e => { const b = e.target.closest('[data-gt]'); if (b) this.show(b.dataset.gt); });
    for (const [el, attr, list, go] of [[books, 'gb', () => GUIDE_BOOKS, id => this.open(id)], [tabs, 'gt', () => bookOf(this.book).pages, id => this.show(id)]]) {
      el.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const L = list(), cur = attr === 'gb' ? this.book : this.tab, i = L.findIndex(x => x.id === cur), n = L[(i + (e.key === 'ArrowRight' ? 1 : L.length - 1)) % L.length].id;
        go(n); const b = this.el.querySelector(`[data-${attr}="${n}"]`); if (b) b.focus(); e.preventDefault();
      });
    }
    this.el.addEventListener('click', e => {
      const b = e.target.closest('[data-goto], [data-book]'); if (!b || b.closest('.g-books')) return;
      if (b.dataset.book) this.open(b.dataset.book); else this.show(b.dataset.goto);
      this.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    this.render();
  },
  // 换一本书：停在同名的那一页，没有就第一页
  open(id) {
    this.book = bookOf(id).id;
    if (!bookOf(this.book).pages.some(p => p.id === this.tab)) this.tab = bookOf(this.book).pages[0].id;
    this.save(); this.render();
  },
  show(id) { this.tab = id; this.save(); this.render(); },
  save() { try { localStorage.setItem('modou.guideBook', this.book); localStorage.setItem('modou.guideTab', this.tab); } catch (e) {} },
  render() {
    if (!this.el) return;
    const B = bookOf(this.book);
    if (!B.pages.some(p => p.id === this.tab)) this.tab = B.pages[0].id;
    this.el.querySelector('.g-books').innerHTML = GUIDE_BOOKS.map(b => `<button type="button" role="tab" data-gb="${b.id}" aria-selected="${b.id === this.book}">${b.name}</button>`).join('');
    this.el.querySelector('.g-tabs').innerHTML = B.pages.map(p => `<button type="button" role="tab" data-gt="${p.id}" aria-selected="${p.id === this.tab}">${p.name}</button>`).join('');
    const page = this.el.querySelector('.g-page');
    page.innerHTML = this.page(B.id, this.tab);
    page.dataset.page = B.id + '-' + this.tab;
    PoseIcon.fill(page);
  },
  page(book, tab) { const B = bookOf(book), P = B.pages.find(p => p.id === tab) || B.pages[0]; return P.body('web'); },
  refresh() { if (this.el) this.render(); if (Manual.el && Manual.isOpen()) Manual.render(); },
  pvpKeys() {
    const P = [Keys.p1, Keys.p2], L = [lookOf(Looks.pvp[0]), lookOf(Looks.pvp[1])];
    const head = `<tr><th></th>${L.map((p, i) => `<th><span class="dot" style="background:${p.color}"></span>玩家${i ? '二' : '一'} · ${p.name}</th>`).join('')}</tr>`;
    return `<table class="g-keytab">${head}${KEY_ROWS.map(([n, acts]) => `<tr><td>${n}</td>${P.map(k => `<td>${keyCaps(k, acts)}</td>`).join('')}</tr>`).join('')}</table>`;
  },
};

/* ============================================================
   软件版（以及网页全屏时）：「教程」面板 —— 左边先选书、再选章，右边文字 + 表格
   ============================================================ */
const CH_NO = '一二三四五六七八九十';
const Manual = {
  el: null, book: 'all', ch: 'start', back: null,
  build() {
    if (this.el) return;
    this.el = document.getElementById('manual'); if (!this.el) return;
    this.el.innerHTML = `<nav class="mn-side" aria-label="章节"><p class="mn-brand">墨斗<i class="seal">谱</i><small>教程</small></p><div class="mn-books" role="tablist"></div><div class="mn-chs" role="tablist"></div>
      <p class="mn-help"><kbd>↑</kbd><kbd>↓</kbd> 换章 · <kbd>←</kbd><kbd>→</kbd> 换书 · <kbd>Esc</kbd> 关</p><button type="button" class="ibtn ghost mn-close">关闭</button></nav><div class="mn-main" tabindex="-1"></div>`;
    this.el.querySelector('.mn-books').addEventListener('click', e => { const b = e.target.closest('[data-mb]'); if (b) this.openBook(b.dataset.mb); });
    this.el.querySelector('.mn-chs').addEventListener('click', e => { const b = e.target.closest('[data-mc]'); if (b) this.go(b.dataset.mc); });
    this.el.querySelector('.mn-main').addEventListener('click', e => { const b = e.target.closest('[data-book]'); if (b) this.openBook(b.dataset.book); });
    this.el.querySelector('.mn-close').addEventListener('click', () => this.close());
    try {
      const b = localStorage.getItem('modou.manualBook'), t = localStorage.getItem('modou.manualCh');
      if (GUIDE_BOOKS.some(x => x.id === b)) this.book = b;
      if (bookOf(this.book).pages.some(p => p.id === t)) this.ch = t;
    } catch (e) {}
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
  openBook(id) {
    this.book = bookOf(id).id;
    if (!bookOf(this.book).pages.some(p => p.id === this.ch)) this.ch = bookOf(this.book).pages[0].id;
    this.go(this.ch);
  },
  go(id) {
    this.ch = id;
    try { localStorage.setItem('modou.manualBook', this.book); localStorage.setItem('modou.manualCh', id); } catch (e) {}
    this.render();
  },
  step(d) {
    const P = bookOf(this.book).pages, i = P.findIndex(x => x.id === this.ch);
    this.go(P[(i + d + P.length) % P.length].id);
    const b = this.el.querySelector(`[data-mc="${this.ch}"]`); if (b) b.focus({ preventScroll: true });
  },
  stepBook(d) {
    const i = GUIDE_BOOKS.findIndex(x => x.id === this.book);
    this.openBook(GUIDE_BOOKS[(i + d + GUIDE_BOOKS.length) % GUIDE_BOOKS.length].id);
    const b = this.el.querySelector(`[data-mb="${this.book}"]`); if (b) b.focus({ preventScroll: true });
  },
  key(e) {
    if (e.code === 'Escape') { e.preventDefault(); if (!e.repeat) this.close(); return true; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); this.stepBook(e.code === 'ArrowRight' ? 1 : -1); return true; }
    if (e.code === 'ArrowDown' || e.code === 'PageDown' || e.code === 'ArrowUp' || e.code === 'PageUp') {
      const main = this.el.querySelector('.mn-main');
      if ((e.code === 'PageDown' || e.code === 'PageUp') && main.scrollHeight > main.clientHeight + 4) return false;   // 长的章节：翻页键照常滚动
      e.preventDefault(); this.step(e.code === 'ArrowDown' || e.code === 'PageDown' ? 1 : -1); return true;
    }
    return false;
  },
  render() {
    const B = bookOf(this.book);
    if (!B.pages.some(p => p.id === this.ch)) this.ch = B.pages[0].id;
    this.el.querySelector('.mn-books').innerHTML = GUIDE_BOOKS.map(b => `<button type="button" role="tab" data-mb="${b.id}" aria-selected="${b.id === this.book}">${b.name}</button>`).join('');
    this.el.querySelector('.mn-chs').innerHTML = B.pages.map((p, i) => `<button type="button" role="tab" data-mc="${p.id}" aria-selected="${p.id === this.ch}"><i>${CH_NO[i]}</i>${p.name}</button>`).join('');
    const main = this.el.querySelector('.mn-main'), i = B.pages.findIndex(p => p.id === this.ch);
    main.innerHTML = `<header class="mn-h"><span>${B.name} · 第${CH_NO[i]}章</span><h2>${B.pages[i].name}</h2></header>` + this.chapter(B.id, this.ch);
    main.scrollTop = 0;
    PoseIcon.fill(main);
  },
  chapter(book, ch) { const B = bookOf(book), P = B.pages.find(p => p.id === ch) || B.pages[0]; return P.body('man'); },
};
