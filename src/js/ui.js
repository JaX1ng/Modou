'use strict';
/* 界面：菜单/暂停/结算/联机面板、人物颜色、全屏、键盘·鼠标·触屏 → Pad、帧数表、主循环与启动 */

const $ = id => document.getElementById(id);
const menu = $('menu'), pauseEl = $('pause'), resultEl = $('result'), onlineEl = $('online'), keysEl = $('keysPanel');
const lookEl = $('lookPanel'), pvpEl = $('pvpPanel'), setEl = $('setPanel'), stageEl = $('stagePanel');
const drillEl = $('drillPanel'), introEl = $('drillIntro'), passEl = $('drillPass');   // 2.1 破招练习：选课、说明；2.2 过关
const btnPause = $('btnPause'), btnSound = $('btnSound');
const Desk = window.modouDesktop || null;          // 2.1 软件版（Steam）才有这个对象（desktop/preload.js 给的）；网页版是 null。见下面「软件版」

function showOverlay(el) {
  for (const o of [menu, pauseEl, resultEl, onlineEl, keysEl, lookEl, pvpEl, setEl, stageEl, drillEl, introEl, passEl]) o.hidden = o !== el;
  $('stage').classList.toggle('playing', ![menu, onlineEl, keysEl, lookEl, pvpEl, setEl, stageEl].includes(el));
  const t = el && el.querySelector('.ibtn:not([hidden])');
  if (t) setTimeout(() => t.focus({ preventScroll: true }), 0);
}
function setPaused(p) {
  if (game.mode === 'attract' || game.mode === 'online' || game.phase === 'over') return;
  game.paused = p;
  $('btnPauseKeys').hidden = false;
  $('btnPauseDrill').hidden = !(game.mode === 'train' && Drill.cur && !Drill.cur.demo);
  showOverlay(p ? pauseEl : null);
  for (const pd of pads) pd.clear();
  MouseLock.sync();
  if (!p && game.mode === 'train' && Drill.cur && Drill.cur.passed && !Drill.cur.passShown) setTimeout(showPass, 400);   // 2.2 过关那一下正好暂停了：回来再弹结算
}
const MENU_HINT = `五局三胜 · 人机/联机每回合 ${ROUND_FRAMES / 60} 秒，双人不限时 · 键位、招式、连招在「教程」里`;
function toMenu(msg) {
  game.paused = false; btnPause.disabled = true;
  $('menuMsg').textContent = msg || MENU_HINT;
  $('menuMsg').style.color = msg ? 'var(--cinnabar)' : '';
  if (Drill.cur) Drill.stop();
  showOverlay(menu); startAttract();
  $('trainbar').hidden = true;
  MouseLock.sync();
}
Hooks.matchStart = () => {
  showOverlay(null);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // 2.0.2：刚点的按钮别留着焦点（空格松开会「点」到它）
  Guard.arm();
  btnPause.disabled = game.mode === 'online';
  $('trainbar').hidden = game.mode !== 'train';
  drillBar();
  MouseLock.sync();
};
Hooks.matchOver = () => {
  const wi = game.wins[0] >= WIN_ROUNDS ? 0 : 1, Wf = game.p[wi];
  let title = `${Wf.name} 胜`;
  if (game.mode === 'online') title = (wi === 0) === (Net.role === 'host') ? '你赢了' : '你输了';
  $('resTitle').textContent = title;
  const st = game.p.map(F => F.stats), nm = `${F1.name}/${F2.name}`;
  $('resStats').innerHTML =
    `<div><b>${game.wins[0]} : ${game.wins[1]}</b>比分</div>` +
    `<div><b>${st[0].maxCombo} / ${st[1].maxCombo}</b>最高连击 ${nm}</div>` +
    `<div><b>${st[0].specials} / ${st[1].specials}</b>招式命中 ${nm}</div>` +
    `<div><b>${st[0].blocks} / ${st[1].blocks}</b>格挡 ${nm}</div>` +
    `<div><b>${st[0].parries} / ${st[1].parries}</b>卸力 ${nm}</div>` +
    `<div><b>${st[0].clashes}</b>拼招</div>` +
    `<div><b>${st[0].presses} / ${st[1].presses}</b>压制 ${nm}</div>` +
    `<div><b>${st[0].punishes} / ${st[1].punishes}</b>防守反击 ${nm}</div>` +
    `<div><b>${st[0].escapes} / ${st[1].escapes}</b>挣脱 ${nm}</div>`;
  const guest = game.mode === 'online' && Net.role === 'guest';
  $('btnAgain').hidden = guest; $('resWait').hidden = !guest;
  btnPause.disabled = true;
  MouseLock.sync();
  Ach.matchOver(wi);
  setTimeout(() => { if (game.phase === 'over') showOverlay(resultEl); }, 900);
};
/* 2.2 难度（Jack：入门 / 简单 / 中等 / 困难 / 终极，每个两个字；主界面重新排）：
   人机对战按钮旁边一排五格，每格两个字 + 底下一排小点（几个点 = 第几档，终极的点是朱色）；下面一行写这一档是什么样的电脑，
   鼠标停在哪一格就先写那一格的 */
$('lvlSeg').innerHTML = LEVEL_IDS.map((id, i) => `<button type="button" data-d="${id}" aria-pressed="false" title="${LEVEL_NAME[id]}：${LEVEL_DESC[id]}">` +
  `<b>${LEVEL_NAME[id]}</b><i class="pips" aria-hidden="true">${LEVEL_IDS.map((_, j) => `<s${j <= i ? ' class="on"' : ''}></s>`).join('')}</i></button>`).join('');
function showLevelDesc(d) { $('lvlDesc').innerHTML = `<b>${LEVEL_NAME[d]}</b>${LEVEL_DESC[d]}`; }
function setDiff(d) {
  game.diff = d;
  for (const b of document.querySelectorAll('[data-d]')) b.setAttribute('aria-pressed', String(b.dataset.d === d));
  showLevelDesc(d);
  try { localStorage.setItem('modou.diff', d); } catch (e) {}
}
for (const b of document.querySelectorAll('[data-d]')) {
  b.addEventListener('mouseenter', () => showLevelDesc(b.dataset.d));
  b.addEventListener('focus', () => showLevelDesc(b.dataset.d));
  b.addEventListener('mouseleave', () => showLevelDesc(game.diff));
  b.addEventListener('blur', () => showLevelDesc(game.diff));
}
function setSound(on) {
  Sound.on = on; btnSound.textContent = on ? '声音：开' : '声音：关';
  try { localStorage.setItem('modou.sound', on ? '1' : '0'); } catch (e) {}
}
function restart() {
  if (game.mode === 'online') Net.startAsHost();
  else if (game.mode === 'train' && Drill.cur && !Drill.cur.demo) { Drill.start(Drill.cur.def.id, false); game.paused = false; showOverlay(null); drillBar(); }   // 破招练习里「重开」= 这一课从头练
  else startMatch(game.mode);
}

$('btnPve').addEventListener('click', () => startMatch('pve'));
$('btnPvp').addEventListener('click', () => openPvp());
$('btnTrain').addEventListener('click', () => startMatch('train'));
/* ---------- 训练场工具条（2.0.2 以前叫打桩练习） ---------- */
function setDummy(m) {
  game.dummyMode = m;
  if (game.mode === 'train' && game.brains[1]) game.brains[1].mode = m;
  for (const b of document.querySelectorAll('[data-dm]')) b.setAttribute('aria-pressed', String(b.dataset.dm === m));
}
for (const b of document.querySelectorAll('[data-dm]')) b.addEventListener('click', () => { setDummy(b.dataset.dm); b.blur(); });
$('btnQi').addEventListener('click', e => {
  game.trainQi = !game.trainQi;
  e.currentTarget.textContent = game.trainQi ? '无限气：开' : '无限气：关';
  e.currentTarget.setAttribute('aria-pressed', String(game.trainQi)); e.currentTarget.blur();
});
$('btnTrainReset').addEventListener('click', e => { if (game.mode === 'train') { resetFighters(); game.phase = 'fight'; } e.currentTarget.blur(); });
/* ---------- 破招练习（训练场）：选课 → 说明（可以先看演示）→ 练；练的时候「说明」随时再看 ----------
   2.2（Jack：破招练习在下面太小了；里面的 UI 都太小、不好看、没有玩的欲望；不要「已完成」，每一课单独练，成功 3 次就过；
   弄不清对面什么时候出招 —— 练习可以有准备，出招前给提示）：
   · 工具条上「破招练习」做成一个大按钮；选课分组（单招 / 连招 / 空中 / 冲撞 / 破防守 / 必杀 · 起身），每种招一张卡片：
     他出招的样子（动作小图）+ 名字 + 一句话 + 几种破法（大按钮，编号）
   · 说明：左边是对手出的那一招（小图），右边几步怎么破（按键照你的键位），下面为什么；
   · 不打勾、不记哪课过了。成功 3 次：「过关」印章 + 一个结算（下一课 / 再练一次 / 换一课 / 自由练）
   · 出招提示（工具条开关，默认开）：木桩倒数 3 · 2 · 1 再出招，一抬手头上闪「!」（render.js drawDrillCue） */
let introId = null, drillTab = null;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const groupOf = tid => (DRILL_GROUPS.find(g => g[2].includes(tid)) || DRILL_GROUPS[0])[0];
$('drillCount').textContent = `${DRILL_TOPICS.length} 种招 · ${DRILLS.length} 种破法`;
function renderDrillList() {
  if (!drillTab) { try { drillTab = localStorage.getItem('modou.drillTab'); } catch (e) {} }
  if (Drill.cur) drillTab = groupOf(Drill.cur.def.topic);
  if (!DRILL_GROUPS.some(g => g[0] === drillTab)) drillTab = DRILL_GROUPS[0][0];
  $('drillTabs').innerHTML = DRILL_GROUPS.map(([gid, name, tids]) => `<button type="button" role="tab" data-dg="${gid}" aria-selected="${gid === drillTab}">${name}<small>${tids.length}</small></button>`).join('');
  const tids = DRILL_GROUPS.find(g => g[0] === drillTab)[2];
  $('drillList').innerHTML = tids.map(tid => {
    const t = DRILL_TOPICS.find(x => x[0] === tid), list = DRILLS.filter(d => d.topic === tid);
    if (!t || !list.length) return '';
    return `<article class="dtopic">${iconSlot(DRILL_ICON[tid] || { pose: 'stance' }, 104, 104, 'dt-icon', { flip: true, col: C.cin })}<div class="dt-body"><h4>${esc(t[1])}</h4><p>${esc(t[2])}</p>` +
      `<div class="dsols">${list.map((d, i) => `<button type="button" class="dsol" data-drill="${d.id}"><i>${i + 1}</i>${esc(d.name)}</button>`).join('')}</div></div></article>`;
  }).join('');
  PoseIcon.fill($('drillList'));
}
$('drillTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-dg]'); if (!b) return;
  drillTab = b.dataset.dg; try { localStorage.setItem('modou.drillTab', drillTab); } catch (err) {}
  const keep = Drill.cur; Drill.cur = null; renderDrillList(); Drill.cur = keep;      // 点了别的组就看那一组（不跳回正在练的那一组）
  const t = $('drillTabs').querySelector(`[data-dg="${drillTab}"]`); if (t) t.focus({ preventScroll: true });
});
$('drillList').addEventListener('click', e => { const b = e.target.closest('[data-drill]'); if (b) openIntro(b.dataset.drill); });
function openDrills() {
  if (game.mode !== 'train') startMatch('train');
  game.paused = true; renderDrillList(); showOverlay(drillEl); MouseLock.sync();
  const sel = $('drillTabs').querySelector('[aria-selected="true"]'); if (sel) setTimeout(() => sel.focus({ preventScroll: true }), 0);
}
function openIntro(id) {
  const d = Drill.byId(id); if (!d) return;
  introId = id; game.paused = true;
  const live = Drill.cur && !Drill.cur.demo && Drill.cur.def.id === id;
  const sibs = DRILLS.filter(x => x.topic === d.topic), k = sibs.indexOf(d) + 1;
  $('diOp').innerHTML = `<small>对手出</small>${iconSlot(DRILL_ICON[d.topic] || { pose: 'stance' }, 150, 150, 'dt-icon', { flip: true, col: C.cin })}<b>${esc(d.topicName)}</b>`;
  PoseIcon.fill($('diOp'));
  $('diTopic').textContent = sibs.length > 1 ? `破法 ${k} / ${sibs.length}` : '破法';
  $('diName').textContent = d.name;
  $('diHow').innerHTML = d.how.map(t => `<li>${gText(t)}</li>`).join('');
  $('diWhy').innerHTML = `<b>为什么</b>${gText(d.why)}`;
  $('diNeed').innerHTML = `成功 <b>${d.need}</b> 次过关` + (live ? `<span>这一遍已经成功 ${Drill.cur.ok} 次</span>` : '') +
    (Drill.cue ? '<span>木桩出招前会倒数 3 · 2 · 1（工具条能关）</span>' : '');
  const others = sibs.filter(x => x.id !== id);
  $('diOther').innerHTML = others.length ? '这一招的其他破法：' + others.map(x => `<button type="button" class="dlink" data-drill="${x.id}">${esc(x.name)}</button>`).join(' · ') : '';
  $('btnDrillGo').textContent = live ? '接着练' : '开始练习';
  showOverlay(introEl); MouseLock.sync();
}
$('diOther').addEventListener('click', e => { const b = e.target.closest('[data-drill]'); if (b) openIntro(b.dataset.drill); });
function runDrill(demo) {
  const live = Drill.cur && !Drill.cur.demo && Drill.cur.def.id === introId && !Drill.cur.passed;
  if (!(live && !demo)) Drill.start(introId, demo);
  showOverlay(null); game.paused = false; drillBar();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  for (const pd of pads) pd.clear();
  MouseLock.sync();
}
// 训练场工具条：练着课的时候换成「说明 / 演示 / 出招提示 / 换一课 / 退出练习」
function drillBar() {
  const on = game.mode === 'train' && !!Drill.cur;
  $('freeTools').hidden = on; $('drillTools').hidden = !on;
  if (on) {
    const c = Drill.cur, d = c.def;
    $('drillLabel').textContent = (c.demo ? '演示 · ' : '破招 · ') + `${d.topicName}：${d.name}`;
    $('btnDrillReDemo').hidden = c.demo; $('btnDrillCue').hidden = c.demo;
  }
  $('btnDrillCue').textContent = Drill.cue ? '出招提示：开' : '出招提示：关';
  $('btnDrillCue').setAttribute('aria-pressed', String(Drill.cue));
}
// 过关：「过关」印章先看一秒，再停下来弹结算（下一课 / 再练一次 / 换一课 / 自由练）
let passTimer = 0;
function showPass() {
  const c = Drill.cur; if (game.mode !== 'train' || !c || c.demo || !c.passed || c.passShown) return;
  if (game.paused || [drillEl, introEl, pauseEl, keysEl, setEl].some(o => !o.hidden)) return;   // 正开着别的面板：等回到练习再弹（setPaused）
  c.passShown = true;
  const d = c.def, nx = Drill.next(d.id);
  $('dpTopic').textContent = d.topicName;
  $('dpName').textContent = d.name;
  $('dpInfo').textContent = `成功 ${c.ok} 次 · 一共练了 ${c.tries + (c.rep ? 1 : 0)} 遍`;
  $('dpNext').textContent = `下一课：${nx.topicName} · ${nx.name}`;
  game.paused = true; for (const pd of pads) pd.clear();
  showOverlay(passEl); MouseLock.sync();
}
Drill.onDemoEnd = () => { drillBar(); openIntro(introId); };
Drill.onPass = () => { drillBar(); Ach.drills(); clearTimeout(passTimer); passTimer = setTimeout(showPass, 1100); };
$('btnPassNext').addEventListener('click', () => { const c = Drill.cur; if (c) openIntro(Drill.next(c.def.id).id); });
$('btnPassAgain').addEventListener('click', () => { const c = Drill.cur; if (c) { introId = c.def.id; Drill.start(c.def.id, false); runDrill(false); } });
$('btnPassPick').addEventListener('click', () => openDrills());
$('btnPassFree').addEventListener('click', () => { Drill.stop(); resetFighters(); game.phase = 'fight'; showOverlay(null); game.paused = false; drillBar(); MouseLock.sync(); });
$('btnDrills').addEventListener('click', e => { e.currentTarget.blur(); openDrills(); });
$('btnDrillClose').addEventListener('click', () => { showOverlay(null); game.paused = false; drillBar(); MouseLock.sync(); });
$('btnDrillGo').addEventListener('click', () => runDrill(false));
$('btnDrillDemo').addEventListener('click', () => runDrill(true));
$('btnDrillList').addEventListener('click', () => { renderDrillList(); showOverlay(drillEl); });
$('btnDrillInfo').addEventListener('click', e => { e.currentTarget.blur(); if (Drill.cur) openIntro(Drill.cur.def.id); });
$('btnDrillReDemo').addEventListener('click', e => { e.currentTarget.blur(); if (Drill.cur) { introId = Drill.cur.def.id; runDrill(true); } });
$('btnDrillCue').addEventListener('click', e => { e.currentTarget.blur(); Drill.setCue(!Drill.cue); drillBar(); toast(Drill.cue ? '出招提示：开 —— 木桩倒数 3 · 2 · 1 再出招，一抬手头上闪「!」' : '出招提示：关 —— 木桩随时出招，看他抬手再反应', 2600); });
$('btnDrillPick').addEventListener('click', e => { e.currentTarget.blur(); openDrills(); });
$('btnDrillQuit').addEventListener('click', e => { e.currentTarget.blur(); Drill.stop(); resetFighters(); game.phase = 'fight'; drillBar(); });
// 说明 / 选课 / 过关开着的时候按 Esc：说明 → 回去接着练（没在练就回选课）；选课 → 回训练场；过关 → 选课
function drillEsc() {
  if (!passEl.hidden) { openDrills(); return true; }
  if (!introEl.hidden) { if (Drill.cur && !Drill.cur.demo && !Drill.cur.passed && Drill.cur.def.id === introId) runDrill(false); else { renderDrillList(); showOverlay(drillEl); } return true; }
  if (!drillEl.hidden) { showOverlay(null); game.paused = false; drillBar(); MouseLock.sync(); return true; }
  return false;
}
for (const b of document.querySelectorAll('[data-d]')) b.addEventListener('click', () => setDiff(b.dataset.d));   // 1.8.0 修：以前训练场工具条的按钮也会触发换难度
$('btnResume').addEventListener('click', () => setPaused(false));
$('btnPauseDrill').addEventListener('click', () => { if (Drill.cur) openIntro(Drill.cur.def.id); });
$('btnRestart').addEventListener('click', () => { game.paused = false; restart(); });
$('btnQuit').addEventListener('click', () => toMenu());
$('btnAgain').addEventListener('click', restart);
$('btnMenu').addEventListener('click', () => { if (game.mode === 'online') Net.leave(); toMenu(); });
btnPause.addEventListener('click', () => setPaused(!game.paused));
btnSound.addEventListener('click', () => { Sound.init(); setSound(!Sound.on); });
/* ---------- 设置（1.9.3）：音量。不占打斗画面 —— 菜单「设置」、暂停里「设置」进来 ---------- */
let setBack = null;
function setVol(v, hear) {
  Sound.setVol(v);
  $('volRange').value = Sound.vol; $('volVal').textContent = Sound.vol;
  try { localStorage.setItem('modou.vol2', String(Sound.vol)); } catch (e) {}
  if (hear) Sound.preview();
}
// 2.1 音量刻度上挪了（现在的 50 = 以前的 80）：以前存过的音量换算成新刻度，听着和以前一样响；没存过的就用新的默认 50
function savedVol() {
  try {
    const v2 = parseInt(localStorage.getItem('modou.vol2'), 10);
    if (v2 >= 0 && v2 <= 100) return v2;
    const v1 = parseInt(localStorage.getItem('modou.vol'), 10);
    if (v1 >= 0 && v1 <= 100) return clamp(Math.round(v1 / VOL_SHIFT), 0, 100);
  } catch (e) {}
  return 50;
}
function openSettings(from) { setBack = from; setVol(Sound.vol, false); showOverlay(setEl); }
function closeSettings() { showOverlay(setBack === 'pause' ? pauseEl : menu); }
$('btnSettings').addEventListener('click', () => openSettings('menu'));
$('btnPauseSet').addEventListener('click', () => openSettings('pause'));
$('btnSetDone').addEventListener('click', closeSettings);
$('volRange').addEventListener('input', e => setVol(+e.target.value, false));
$('volRange').addEventListener('change', e => setVol(+e.target.value, true));       // 松手时响一声
$('volDown').addEventListener('click', () => setVol(Sound.vol - 10, true));
$('volUp').addEventListener('click', () => setVol(Sound.vol + 10, true));
document.addEventListener('visibilitychange', () => { if (document.hidden && game.phase === 'fight' && !game.paused) setPaused(true); });

/* ---------- 联机面板 ----------
   1.9.0：上面是「房间码」（默认），下面折起来的是「手动连接」（以前的复制粘贴连接码）。连上以后只显示大厅（选色、开始） */
function netView(v) {
  const lobby = v === 'lobby';
  for (const id of ['netIntro', 'netRoom', 'relayBox', 'manualBox']) $(id).hidden = lobby;
  $('netChoose').hidden = lobby || v === 'host' || v === 'join';
  $('netHost').hidden = v !== 'host';
  $('netJoin').hidden = v !== 'join';
  $('netLobby').hidden = !lobby;
  if (v === 'host' || v === 'join') $('manualBox').open = true;
  if (!Net.roomSupported()) $('netRoom').hidden = true;
}
function netErr(msg) { $('netErr').textContent = msg || ''; }
const lastRoom = () => { try { return localStorage.getItem('modou.room') || ''; } catch (e) { return ''; } };
const clearHash = () => { try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); Guard.href = location.href; } catch (e) {} };
function openOnline(code) {
  Sound.init();
  Net.leaveAll(); netView('choose'); netErr(''); $('netWait').hidden = true;
  for (const id of ['hostCode', 'hostAnswer', 'joinCode', 'joinAnswer']) $(id).value = '';
  $('roomCode').value = code || lastRoom(); roomUi(null);
  let ok = true;
  if (!Net.supported()) { netErr('这个浏览器不支持直连，请用新版 Chrome 或 Edge。'); ok = false; }
  else if (Net.embedded()) { netErr('在 claude.ai 预览里连不上。请用网页版 jax1ng.github.io/Modou，或者下载的 modou.html，在浏览器里打开再联机。'); ok = false; }
  else if (!Net.roomSupported()) $('manualBox').open = true;
  showOverlay(onlineEl);
  if (code && ok && Net.roomSupported()) joinRoomUi(code);
}
// 房间码：进房间等对方（房间码记下来，下次打开自动填上；网址后面挂上 #房间码，刷新也还在这个房间）
function joinRoomUi(raw) {
  netErr('');
  let code;
  try { code = Net.joinCode(raw); } catch (e) { netErr(e.message || String(e)); return; }
  $('roomCode').value = code;
  try { localStorage.setItem('modou.room', code); } catch (e) {}
  const keep = Net.linkRelay ? (location.hash.match(/&r=[^&]*/) || [''])[0] : '';     // 链接里带的中继留着，刷新也还在
  try { history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(code) + keep); Guard.href = location.href; } catch (e) {}
}
let roomHintT = 0;
function roomUi(state) {
  const st = $('roomStatus'), inRoom = !!Net.room;
  $('roomTools').hidden = !inRoom; $('roomCode').disabled = inRoom; $('btnRoomJoin').disabled = inRoom;
  $('btnRoomJoin').textContent = inRoom ? '已进房' : '进房间';
  st.className = 'status sm'; clearTimeout(roomHintT);
  if (state === 'busy') { st.className = 'status sm bad'; st.textContent = '这个房间已经有两个人在打了，换一个房间码吧。'; return; }
  if (!state || !inRoom) { st.textContent = ''; return; }
  if (state === 'waiting') {
    st.textContent = `房间「${Net.code}」· 等对方进来…（让他输入同一个房间码，或者把邀请链接发给他）` + (hasTurn(Net.relayUsed) ? ' · 带着中继' : '');
    // 等了半分钟还没连上：对方要是已经进来了，多半是网络不让两台电脑直连
    roomHintT = setTimeout(() => {
      if (!Net.room || Net.open || onlineEl.hidden) return;
      st.textContent += hasTurn(Net.relayUsed)
        ? '\n等了半分钟还没连上。如果对方已经输入同一个房间码了：两边刷新一下再试，或者用下面的「手动连接」。'
        : '\n等了半分钟还没连上。如果对方已经输入同一个房间码了，多半是网络不让两台电脑直连（校园网常见）：在下面「中继服务器」里填一个中继（有一边填了就行），或者两边连同一个手机热点。';
    }, 30000);
  }
  else if (state === 'rejoining') st.textContent = '对方回来了，正在重新连…';
  else if (state === 'error') st.textContent = '找到对方了，握手没成功，正在重试…（一直这样就两边刷新一下网页）';
}
Net.onRoom = state => {
  if (state === 'resumed') { toast('对方连回来了，接着打'); return; }
  if (state === 'version' && game.mode === 'online') { clearHash(); toMenu(Net.lastDiag); return; }
  if (onlineEl.hidden) return;
  if (state === 'version') { clearHash(); netView('choose'); roomUi(null); netErr(Net.lastDiag); return; }
  if (state === 'busy') { clearHash(); netView('choose'); netErr(''); }
  roomUi(state);
};
// 关掉网页时告诉对方一声（他那边马上知道，不用等掉线重连超时）
window.addEventListener('pagehide', () => { if (Net.open) Net.sendCtl({ t: 'bye' }); });
$('btnRoomJoin').addEventListener('click', () => joinRoomUi($('roomCode').value));
$('roomCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); joinRoomUi($('roomCode').value); } });
$('btnRoomLeave').addEventListener('click', () => { Net.leaveAll(); roomUi(null); clearHash(); netErr(''); $('roomCode').focus(); });
$('btnInvite').addEventListener('click', async e => {
  const btn = e.currentTarget;
  const link = await inviteLink(Net.code, hasTurn(Relay.list) ? Relay.list : null);
  try { await navigator.clipboard.writeText(link); btn.textContent = '已复制'; toast(hasTurn(Relay.list) ? '邀请链接带着你的中继，对方点开就连，不用自己填' : Desk ? '把链接发给对方：他点开就在浏览器里进这个房间（网页版、软件版能一起玩）' : '把链接发给对方，他点开就进这个房间', 3200); }
  catch (err) { window.prompt('复制这个链接发给对方：', link); }
  setTimeout(() => { btn.textContent = '复制邀请链接'; }, 1600);
});
async function copyFrom(id, btn) {
  const ta = $(id);
  try { await navigator.clipboard.writeText(ta.value); btn.textContent = '已复制'; }
  catch (e) { ta.focus(); ta.select(); btn.textContent = '按 Ctrl+C'; }
  setTimeout(() => { btn.textContent = '复制'; }, 1600);
}
function netStatusText() {
  const ms = Math.round(Net.rtt), d = Net.pickDelay();
  const via = Net.via === 'relay' ? '经中继' : Net.via === 'direct' ? '直连' : '';
  return `已连接${Net.code ? '（房间「' + Net.code + '」）' : ''}${via ? ' · ' + via : ''} · 往返 ${ms || '…'} 毫秒 · 输入延迟 ${d} 帧` + (Net.role === 'host' ? '' : ' · 等对方点开始');
}
/* ---------- 中继设置 ---------- */
function relaySummary() {
  const n = Relay.list.filter(isTurn).length;
  $('relaySum').textContent = n ? `已设置（${n} 个中继地址）` : '未设置';
}
function relayStatus(msg, cls) { const el = $('relayStatus'); el.textContent = msg || ''; el.className = 'status sm' + (cls ? ' ' + cls : ''); }
$('btnRelaySave').addEventListener('click', async () => {
  const btn = $('btnRelaySave');
  relayStatus('正在读取…'); btn.disabled = true;
  try {
    const list = await resolveRelay($('relayText').value);
    relayStatus('已读到 ' + list.filter(isTurn).length + ' 个中继地址，正在测试…');
    const r = await testRelay(list);
    if (r.auth) relayStatus('没保存：' + r.why + '。重新复制一遍账号再试。', 'bad');
    else {
      Relay.save(list); relaySummary();
      $('relayText').value = JSON.stringify(list, null, 1);
      if (r.ok) relayStatus(`中继可用（${r.ms} 毫秒拿到中继地址）。现在去建房就会带上它。`, 'ok');
      else relayStatus('已保存，但在这个网络上没测通：' + r.why + '。换个网络（比如手机热点）再点一次试试。', 'bad');
    }
  } catch (e) { relayStatus(e.message || String(e), 'bad'); }
  btn.disabled = false;
});
$('btnRelayClear').addEventListener('click', () => { Relay.save([]); $('relayText').value = ''; relaySummary(); relayStatus('已清除，只用直连。'); });
relaySummary();
if (Relay.list.length) $('relayText').value = JSON.stringify(Relay.list, null, 1);
Net.onOpen = () => {
  netView('lobby'); netErr('');
  $('netStatus').textContent = netStatusText();
  $('btnNetStart').hidden = Net.role !== 'host';
  renderNetLooks(); renderNetStages();
};
// 联机选色：自己的亮着，对方占着的变暗点不了；房主说了算（net.js settleLook）
function renderNetLooks() {
  const me = Net.role === 'host' ? 'h' : 'g', my = Net.looks[me], th = Net.looks[me === 'h' ? 'g' : 'h'];
  $('netLooks').innerHTML = PALETTE.map(p => swatch(p, { on: p.id === my, taken: p.id === th ? '对方' : '' })).join('');
}
Net.onLooks = () => { if (!$('netLobby').hidden) { renderNetLooks(); renderNetStages(); } };
$('netLooks').addEventListener('click', e => {
  const b = e.target.closest('.sw'); if (!b || b.disabled) return;
  if (Net.pickLook(b.dataset.id)) { setMyLook(b.dataset.id); renderNetLooks(); }
});
Net.onStatus = () => { if (!$('netLobby').hidden) $('netStatus').textContent = netStatusText(); };
Net.onClose = (wasOpen, stay) => {
  if (game.mode === 'online') { Net.leaveAll(); clearHash(); toMenu(wasOpen ? '对方断开了连接' : '连接失败'); }
  else if (!onlineEl.hidden && stay) { netView('choose'); netErr('对方离开了。留在房间里等他回来，或者换个房间。'); roomUi('waiting'); }
  else if (!onlineEl.hidden) {
    netView('choose'); roomUi(Net.room ? 'waiting' : null);
    if (wasOpen) netErr('对方断开了连接');
    else if (Net.lastDiag && /房主一直没点/.test(Net.lastDiag)) netErr(Net.lastDiag);
    else if (hasTurn(Net.relayUsed)) netErr('连不上。' + (Net.lastDiag || '点开上面「中继服务器」，按「保存并测试」看中继能不能用。'));
    else { netErr('连不上。校园网（eduroam）不让两台电脑直接连：点开上面「中继服务器」填一个中继再试，或者两边连同一个手机热点。'); $('relayBox').open = true; }
  }
};
$('btnOnline').addEventListener('click', () => openOnline());
$('btnNetBack').addEventListener('click', () => { Net.leave(); clearHash(); toMenu(); });
$('btnHost').addEventListener('click', async () => {
  netView('host'); netErr(''); $('hostCode').value = ''; roomUi(null);
  try { $('hostCode').value = await Net.host(); }
  catch (e) { netErr('生成连接码失败：' + (e.message || e)); }
});
$('btnJoin').addEventListener('click', () => { Net.leaveAll(); roomUi(null); netView('join'); netErr(''); $('joinCode').focus(); });
$('copyHost').addEventListener('click', e => copyFrom('hostCode', e.currentTarget));
$('copyJoin').addEventListener('click', e => copyFrom('joinAnswer', e.currentTarget));
$('btnMakeAnswer').addEventListener('click', async () => {
  netErr(''); $('joinAnswer').value = '';
  $('joinAnswer').placeholder = '正在生成…';
  try { $('joinAnswer').value = await Net.join($('joinCode').value); $('joinAnswer').select(); netErr(''); $('netWait').hidden = false; }
  catch (e) { netErr(e.message || String(e)); $('joinAnswer').placeholder = '先完成第 ① 步'; }
});
$('btnConnect').addEventListener('click', async () => {
  netErr('');
  try { await Net.finish($('hostAnswer').value); netErr(''); $('btnConnect').textContent = '连接中'; setTimeout(() => { $('btnConnect').textContent = '连接'; }, 3000); }
  catch (e) { netErr(e.message || String(e)); }
});
$('btnNetStart').addEventListener('click', () => Net.startAsHost());

/* ---------- 键位设置面板（1.9.1：单人 / 双人玩家一 / 双人玩家二 三套，互不影响） ---------- */
let keyDraft = null, keyWho = 0, keyWait = null, keyBack = null;   // 三套草稿、正在改哪套、正在等按键的格子 [动作, 第几格]、关掉后回到哪
const WHO_NAME = ['单人', '双人·玩家一', '双人·玩家二'];
const WHO_HINT = ['单人：人机、联机、训练场用这一套。随便改（方向键、小键盘都行），不影响双人对战。',
  '双人对战·玩家一。两人都绑了的键归玩家二。', '双人对战·玩家二。'];
function openKeys(from) {
  keyDraft = [cloneKeys(Keys.solo), cloneKeys(Keys.p1), cloneKeys(Keys.p2)]; keyWait = null; keyBack = from;
  setKeyWho(game.mode === 'pvp' && from === 'pause' ? (keyWho || 1) : 0); showOverlay(keysEl);
}
function setKeyWho(w) {
  keyWho = w; keyWait = null;
  for (const b of document.querySelectorAll('[data-who]')) b.setAttribute('aria-pressed', String(+b.dataset.who === w));
  $('keyWhoHint').textContent = WHO_HINT[w];
  renderKeys();
}
function closeKeys() {
  keyWait = null; for (const pd of pads) pd.clear();
  if (keyBack === 'pause') showOverlay(pauseEl); else showOverlay(menu);
}
function renderKeys() {
  const k = keyDraft[keyWho], pr = keyProblems(k);
  const shared = keyWho ? sharedKeys(keyDraft[1], keyDraft[2]) : new Set();      // 两人都绑了的键只有双人那两套要管
  $('keyRows').innerHTML = ACTIONS.map(([a, n]) => `<tr><td>${n}</td>` + [0, 1].map(i => {
    const c = k[a][i], waiting = keyWait && keyWait[0] === a && keyWait[1] === i;
    const cls = waiting ? 'wait' : !c ? 'empty' : pr.dupCodes.has(c) ? 'bad' : shared.has(c) ? 'shared' : '';
    return `<td><button type="button" class="kbtn ${cls}" data-a="${a}" data-i="${i}">${waiting ? '按一个键…' : keyName(c)}</button></td>`;
  }).join('') + '</tr>').join('');
  const msg = [];
  for (const [c, acts] of pr.dup) {
    const names = [...new Set(acts)].map(a => '「' + ACT_NAME[a] + '」');
    msg.push(names.length > 1 ? `键位冲突：${keyName(c)} 同时是${names.join('和')}的键` : `${names[0]}两格都是 ${keyName(c)}`);
  }
  for (const a of pr.missing) msg.push(`「${ACT_NAME[a]}」还没有键`);
  for (let w = 0; w < 3; w++) {
    const o = keyProblems(keyDraft[w]);
    if (w !== keyWho && (o.dup.length || o.missing.length)) msg.push(`「${WHO_NAME[w]}」那套还有没改好的`);
  }
  $('keyMsg').textContent = msg.length ? msg.join('；') + '。改好才能保存。' : '';
  $('btnKeysSave').disabled = msg.length > 0;
  const info = [];
  if (shared.size) info.push(`黄色的键两个人都绑了：${[...shared].map(keyName).join('、')}。双人对战时归玩家二${keyWho === 1 ? '，玩家一的这个键不起作用' : ''}。`);
  const usesP = keyDraft.some(d => Object.values(d).some(v => v.includes('KeyP')));
  if (usesP) info.push('P 原来也是暂停键；绑到动作上以后，暂停只用 Esc。');
  $('keyInfo').textContent = info.join(' ');
}
for (const b of document.querySelectorAll('[data-who]')) b.addEventListener('click', () => setKeyWho(+b.dataset.who));
$('keyRows').addEventListener('click', e => {
  if (performance.now() - swallowClick < 600) { swallowClick = 0; return; }   // 这一下是刚才「绑鼠标左键」那一下的 click
  const b = e.target.closest('.kbtn'); if (!b) return;
  keyWait = [b.dataset.a, +b.dataset.i]; renderKeys();
});
function captureKey(e) {
  e.preventDefault(); e.stopPropagation();
  const c = e.code, [a, i] = keyWait;
  if (c === 'Escape') { keyWait = null; renderKeys(); return; }
  if (c === 'Backspace' || c === 'Delete') { keyDraft[keyWho][a][i] = null; keyWait = null; renderKeys(); return; }
  if (NO_BIND.has(c) || !c) { $('keyMsg').textContent = 'Ctrl、Alt、Win 这类键不能用，换一个。'; return; }
  keyDraft[keyWho][a][i] = c; keyWait = null; renderKeys();
}
// 鼠标按键也能绑（1.7.0）：右键、中键、两个侧键在哪按都行；左键要点「正在等的那一格」，不然点别的按钮会被当成绑左键
let swallowClick = 0, blockMenuUntil = 0;
window.addEventListener('mousedown', e => {
  if (!keyWait || e.button > 4) return;
  const onCell = e.target.closest && e.target.closest('.kbtn.wait');
  if (e.button === 0 && !onCell) return;
  e.preventDefault(); e.stopPropagation();
  if (e.button === 0) swallowClick = performance.now();
  if (e.button === 2) blockMenuUntil = performance.now() + 1500;
  keyDraft[keyWho][keyWait[0]][keyWait[1]] = 'Mouse' + e.button; keyWait = null; renderKeys();
}, true);
$('btnKeysSave').addEventListener('click', () => {
  if (keyDraft.some(d => keyProblems(d).dup.length)) return;
  Keys.save(keyDraft[0], keyDraft[1], keyDraft[2]); showKeyCards(); closeKeys();
});
$('btnKeysReset').addEventListener('click', () => { keyDraft[keyWho] = cloneKeys(keyWho === 2 ? DEFAULT_KEYS2 : DEFAULT_KEYS); keyWait = null; renderKeys(); });
$('btnKeysCancel').addEventListener('click', closeKeys);
$('btnKeys').addEventListener('click', () => openKeys('menu'));
$('btnPauseKeys').addEventListener('click', () => openKeys('pause'));
// 教程里的键位（2.2 起在 guide.js）：改了键位就重画，显示现在真正在用的键
function showKeyCards() { Guide.refresh(); }

/* ---------- 人物颜色（1.7.0）：单人设置、双人开打前选、联机大厅选 ---------- */
// 色块：一个小火柴人，身体是颜色；头带、发带、腰带是身体色提亮的那一版（2.0.2 腰带是箍在腰上的一道）
function figSvg(p) {
  const band = palOf(p.color).band;
  return `<svg viewBox="0 0 34 40" aria-hidden="true"><path d="M19 15 L16 27 M16 27 L10 38 M16 27 L23 37 M18 18 L27 15 M18 18 L10 23" fill="none" stroke="${p.color}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="20" cy="9" r="5.6" fill="${p.color}"/><path d="M14.4 7.4 h11.2" stroke="${band}" stroke-width="2.6"/>` +
    `<path d="M14.6 7.8 q-5 .6 -8 4.4" fill="none" stroke="${band}" stroke-width="1.8" stroke-linecap="round"/><path d="M13.7 23.9 L19.5 25.3" stroke="${band}" stroke-width="2.4"/></svg>`;
}
function swatch(p, o) {
  const taken = o.taken || '';
  return `<button type="button" class="sw" data-id="${p.id}" aria-pressed="${!!o.on}"${taken ? ' disabled' : ''} title="${p.name}${taken ? '（' + taken + '）' : ''}">` +
    `${figSvg(p)}<span>${p.name}</span>${taken ? `<small>${taken}</small>` : ''}</button>`;
}
const randSwatch = on => `<button type="button" class="sw rand" data-id="random" aria-pressed="${on}" title="每局随机"><svg viewBox="0 0 34 40" aria-hidden="true">` +
  `<path d="M19 15 L16 27 M16 27 L10 38 M16 27 L23 37 M18 18 L27 15 M18 18 L10 23" fill="none" stroke="#9a9b94" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="3 3"/>` +
  `<circle cx="20" cy="9" r="5.6" fill="none" stroke="#9a9b94" stroke-width="2"/><text x="20" y="12.5" font-size="9" text-anchor="middle" fill="#6b6c66">?</text></svg><span>随机</span></button>`;
// 教程里双人键位的「玩家一 · 墨」「玩家二 · 靛」跟着双人对战上次选的颜色走
function showLooks() { if (Guide.tab === 'start') Guide.refresh(); }
function setMyLook(id) {
  Looks.solo.me = id;
  if (Looks.solo.cpu === id) Looks.solo.cpu = 'random';
  Looks.save();
}
// 单人：菜单「人物颜色」。点了马上记住；菜单背景里两个人就是预览
function renderLookPanel() {
  const me = Looks.solo.me;
  $('soloMe').innerHTML = PALETTE.map(p => swatch(p, { on: p.id === me })).join('');
  $('soloCpu').innerHTML = randSwatch(Looks.solo.cpu === 'random') + PALETTE.map(p => swatch(p, { on: p.id === Looks.solo.cpu, taken: p.id === me ? '你' : '' })).join('');
}
function previewSolo() { if (game.mode === 'attract') { F1.setLook(Looks.solo.me); F2.setLook(Looks.solo.cpu === 'random' ? (F2.look !== Looks.solo.me ? F2.look : cpuLook()) : Looks.solo.cpu); } }
function closeLooks() { showOverlay(menu); }
$('btnLooks').addEventListener('click', () => { renderLookPanel(); previewSolo(); showOverlay(lookEl); });
$('btnLooksDone').addEventListener('click', closeLooks);
$('soloMe').addEventListener('click', e => { const b = e.target.closest('.sw'); if (!b || b.disabled) return; setMyLook(b.dataset.id); renderLookPanel(); previewSolo(); });
$('soloCpu').addEventListener('click', e => {
  const b = e.target.closest('.sw'); if (!b || b.disabled) return;
  Looks.solo.cpu = b.dataset.id; Looks.save(); renderLookPanel();
  if (game.mode === 'attract') F2.setLook(b.dataset.id === 'random' ? cpuLook() : b.dataset.id);
});
/* ---------- 场景（2.0）：菜单「场景」里选（人机、双人用），双人开打前、联机大厅（房主选）也能换 ---------- */
// 一排场景按钮：每个按钮一张小图（远景 + 中景缩小画的）+ 名字。sm = 小一号（双人、联机面板里）
function stageButtons(cur, o) {
  o = o || {};
  const tw = o.sm ? 120 : 200, th = o.sm ? 60 : 100, k = Math.min(2, window.devicePixelRatio || 1);
  return STAGE_PICK.map(id => `<button type="button" class="stg" data-stage="${id}" aria-pressed="${id === cur}"${o.lock ? ' disabled' : ''}>` +
    `<img alt="" width="${tw}" height="${th}" src="${Stage.thumb(id, Math.round(tw * k), Math.round(th * k))}"><span>${STAGES[id].name}</span></button>`).join('');
}
function showStageName() { $('stageName').textContent = STAGES[Stage.pref].name; }
function pickStage(id) { Stage.setPref(id); showStageName(); renderStagePanel(); if (!pvpEl.hidden) renderPvpStages(); }
function renderStagePanel() { $('stageList').innerHTML = stageButtons(Stage.pref); }
function renderPvpStages() { $('pvpStages').innerHTML = stageButtons(Stage.pref, { sm: true }); }
$('btnStage').addEventListener('click', () => { renderStagePanel(); showOverlay(stageEl); });
$('btnStageDone').addEventListener('click', () => showOverlay(menu));
for (const id of ['stageList', 'pvpStages']) $(id).addEventListener('click', e => { const b = e.target.closest('.stg'); if (b && !b.disabled) pickStage(b.dataset.stage); });
// 联机大厅：房主点了算；加入方只看得到房主选的哪张
function renderNetStages() {
  const host = Net.role === 'host';
  $('netStageHint').textContent = host ? '场景（你是房主，你来选）' : '场景（房主选的）';
  $('netStages').innerHTML = stageButtons(Stage.online, { sm: true, lock: !host });
}
$('netStages').addEventListener('click', e => { const b = e.target.closest('.stg'); if (b && !b.disabled && Net.pickStage(b.dataset.stage)) renderNetStages(); });
showStageName();

// 双人：开打前两边选（A/D、←/→ 也能换）。对方选了的变暗
let pvpDraft = null;
function openPvp() { pvpDraft = Looks.pvp.slice(); renderPvp(); renderPvpStages(); showOverlay(pvpEl); }
function renderPvp() {
  for (const i of [0, 1]) $('pvpLook' + i).innerHTML = PALETTE.map(p => swatch(p, { on: p.id === pvpDraft[i], taken: p.id === pvpDraft[1 - i] ? (i ? '玩家一' : '玩家二') : '' })).join('');
  if (game.mode === 'attract') { F1.setLook(pvpDraft[0]); F2.setLook(pvpDraft[1]); }
}
function cyclePvp(i, d) {
  let k = PALETTE.findIndex(p => p.id === pvpDraft[i]);
  do k = (k + d + PALETTE.length) % PALETTE.length; while (PALETTE[k].id === pvpDraft[1 - i]);
  pvpDraft[i] = PALETTE[k].id; renderPvp();
}
function pvpKey(e) {
  const k = { KeyA: [0, -1], KeyD: [0, 1], ArrowLeft: [1, -1], ArrowRight: [1, 1] }[e.code];
  if (k) { e.preventDefault(); cyclePvp(k[0], k[1]); }
  else if (e.code === 'Escape') closePvp();
}
function closePvp() { showOverlay(menu); applyLooks('attract'); }
for (const i of [0, 1]) $('pvpLook' + i).addEventListener('click', e => { const b = e.target.closest('.sw'); if (!b || b.disabled) return; pvpDraft[i] = b.dataset.id; renderPvp(); });
$('btnPvpGo').addEventListener('click', () => { Looks.pvp = pvpDraft.slice(); Looks.save(); showLooks(); startMatch('pvp'); });
$('btnPvpBack').addEventListener('click', closePvp);
showLooks();

/* ---------- 小提示条（画面顶上，几秒后自己消失） ---------- */
let toastTimer = 0;
function toast(msg, ms) {
  const el = $('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms || 3800);
}

/* ---------- 全屏（1.7.0） ----------
   全屏的是整块游戏区（顶栏 + 画面 + 打桩条）。Esc 的冲突：
   · Chrome / Edge：进全屏时锁住 Esc（Keyboard Lock），短按 Esc 照常暂停，按住 Esc 两秒才退出全屏；
   · 其它浏览器锁不了：按 Esc 会直接退出全屏，这时对战顺便暂停（不会一下退全屏、一下又把暂停取消掉），想留在全屏里暂停就按 P；
   · 另外顶栏「退出全屏」、暂停菜单「退出全屏」随时能点 */
const playEl = $('play'), btnFull = $('btnFull');
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
let fsExitAt = -1e9, fsLocked = false;
async function enterFull() {
  const req = playEl.requestFullscreen || playEl.webkitRequestFullscreen;
  try { await req.call(playEl, { navigationUI: 'hide' }); }
  catch (e) { toast('这个浏览器不让网页全屏。可以按 F11 用浏览器自己的全屏。'); return; }
  fsLocked = false;
  try { if (navigator.keyboard && navigator.keyboard.lock) { await navigator.keyboard.lock(['Escape']); fsLocked = true; } } catch (e) {}
  toast(fsLocked ? '全屏中 · Esc 暂停 · 按住 Esc 两秒退出全屏（或点右下角「退出全屏」）'
    : '全屏中 · 按 Esc 退出全屏（对战会顺便暂停）· 想暂停又不退出全屏就按 P', 4500);
}
function exitFull() {
  const ex = document.exitFullscreen || document.webkitExitFullscreen;
  if (fsEl() && ex) { try { const r = ex.call(document); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
}
function onFsChange() {
  if (Desk) return;                                   // 软件版切的是窗口全屏，不走这里（见下面「软件版」）
  const on = !!fsEl();
  playEl.classList.toggle('fs', on);
  btnFull.textContent = on ? '退出全屏' : '⛶ 全屏';
  $('btnPauseFull').hidden = !on;
  if (!on) {
    fsExitAt = performance.now(); fsLocked = false;
    if (Manual.isOpen()) Manual.close();                 // 2.2 全屏时开的教程面板：退出全屏就关（不全屏时教程在页面下面）
    try { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch (e) {}
    if (keyWait) { keyWait = null; renderKeys(); }
    if (game.phase === 'fight' && !game.paused && game.mode !== 'online') setPaused(true);
  }
  setTimeout(resize, 60);
}
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
if (!Desk && !(playEl.requestFullscreen || playEl.webkitRequestFullscreen)) btnFull.hidden = true;
btnFull.addEventListener('click', () => { if (Desk) Desk.setFullscreen(!Desk.isFullscreen()); else if (fsEl()) exitFull(); else enterFull(); btnFull.blur(); });
$('btnPauseFull').addEventListener('click', () => { if (Desk) Desk.setFullscreen(false); else exitFull(); });

/* ---------- 2.2 教程：菜单、暂停里的「教程」 ----------
   软件版、网页全屏时：打开「教程」面板（左边章节、右边文字 + 表格，guide.js Manual）；网页版不全屏时：滚到页面下面的教程（分页，guide.js Guide） */
const legendOpen = () => Manual.isOpen();
function openGuide(e) {
  const btn = e && e.currentTarget;
  if (Desk || fsEl()) { Manual.open(btn); return; }
  const g = $('guide'); if (g) g.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}
$('btnLegend').addEventListener('click', openGuide);
$('btnPauseLegend').addEventListener('click', openGuide);
/* ---------- 2.1 软件版（Steam，desktop/ 打出来的程序）：有 window.modouDesktop 才做，网页版下面这些都不起作用 ----------
   · 窗口里一直是全屏的样子（.fs：只有游戏画面，顶栏缩到右下角）；⛶ 切的是窗口全屏（F11、Alt+Enter 也行，主进程那边管）。
     窗口全屏不是网页全屏：Esc 不会退出全屏，照常暂停；
   · 页面下面的教程收进「教程」面板（2.2：单独一套文字 + 表格，guide.js Manual），菜单、暂停里都能开；
   · 菜单多一个「退出游戏」；
   · 邀请链接用网页版的网址（net.js WEB_URL）：对方点开在浏览器里进同一个房间 —— 网页版、软件版能一起玩（版本号一样就行）；
   · 没有浏览器：鼠标不用锁（MouseLock）、也不用防「后退」（Guard）；
   · Steam 连上了才有成就（Ach）；没连上（直接双击 exe、没开 Steam）照常玩 */
$('btnExit').addEventListener('click', () => { if (Desk) Desk.quit(); });
if (Desk) {
  document.documentElement.classList.add('desktop');
  playEl.classList.add('fs');
  for (const id of ['btnExit']) $(id).hidden = false;
  $('menuMsg').textContent = MENU_HINT;
  const showFs = on => { btnFull.textContent = on ? '退出全屏' : '⛶ 全屏'; $('btnPauseFull').hidden = !on; setTimeout(resize, 60); };
  showFs(Desk.isFullscreen());
  Desk.onFullscreenChange(showFs);
}
/* 成就（API Name 要和 Steamworks 后台建的一模一样，见 desktop/STEAM.md「建成就」）。
   人机：对局里每半秒看一眼连击、泼墨；联机只在结算时看（回滚前猜错的那几帧不算进去）。解锁过的 Steam 自己记着，这里只是同一次别重复发 */
const DRILL_ACH_PASSES = 20;
const Ach = {
  sent: new Set(), tick: 0,
  BEAT: { easy: 'ACH_BEAT_EASY', normal: 'ACH_BEAT_NORMAL', hard: 'ACH_BEAT_HARD', hell: 'ACH_BEAT_EXTREME' },   // 2.2 入门没有单独的成就（赢了算「初战告捷」）
  unlock(id) {
    if (!id || !Desk || !Desk.steam || !Desk.steam.ok() || this.sent.has(id)) return;
    this.sent.add(id);
    try { Desk.steam.achieve(id).catch(() => {}); } catch (e) {}
  },
  stats(st) {
    if (st.maxCombo >= 5) this.unlock('ACH_COMBO_5');           // 连击衰减：一套最多就是 5 下左右（连珠快拳那样）
    if (st.supers > 0) this.unlock('ACH_SUPER');
  },
  watch() { if (Desk && game.mode === 'pve' && ++this.tick % 30 === 0) this.stats(game.p[0].stats); },
  matchOver(wi) {
    if (!Desk) return;
    if (game.mode === 'pve') {
      this.stats(game.p[0].stats);
      if (wi === 0) { this.unlock('ACH_FIRST_WIN'); this.unlock(this.BEAT[game.diff]); }
    } else if (game.mode === 'online') {
      const me = Net.role === 'host' ? 0 : 1;
      this.stats(game.p[me].stats);
      if (wi === me) this.unlock('ACH_ONLINE_WIN');
    }
  },
  // 2.2 不再记哪一课过了（Jack：不算「已完成」）：拆招大师 = 破招练习一共过关 DRILL_ACH_PASSES 次（哪几课都行，同一课过几次也算）
  drills() { if (Desk && Drill.passes >= DRILL_ACH_PASSES) this.unlock('ACH_DRILL_MASTER'); },
};

/* ---------- 鼠标（1.7.0）：键位里绑了鼠标按键就能用（单人那套在人机 / 训练场 / 联机里，双人那两套在双人对战里） ---------- */
const mouseHeld = [];
const UI_TAGS = 'button, a, input, textarea, select, summary, label, details';
function mouseAction(e) {
  if (game.mode === 'attract' || game.paused || keyWait || e.button > 4) return null;
  if (!keysEl.hidden || !lookEl.hidden || !pvpEl.hidden || !setEl.hidden || !stageEl.hidden || !drillEl.hidden || !introEl.hidden || !passEl.hidden || Manual.isOpen()) return null;
  const r = Keys.route('Mouse' + e.button, game.mode);           // 1.8.0：双人对战里鼠标也能用（谁绑了归谁）
  if (!r) return null;
  if (e.button === 0 && e.target.closest && e.target.closest(UI_TAGS)) return null;   // 左键点在按钮上 = 点按钮
  return r;
}
const boundMouse = b => Keys.bound('Mouse' + b);
window.addEventListener('mousedown', e => {
  if (e.button === 1 || e.button === 3 || e.button === 4) e.preventDefault();   // 中键不滚屏、侧键不翻页（2.0.2：不管绑没绑都拦）
  const r = mouseAction(e); if (!r) return;
  e.preventDefault(); mouseHeld[e.button] = r; pads[r[0]].down(r[1], false);
  MouseLock.sync();                                                           // 2.1 对局里点了鼠标键：（再）把指针锁进画面
});
window.addEventListener('mouseup', e => {
  if (e.button === 3 || e.button === 4) e.preventDefault();   // 侧键松开时浏览器会「后退 / 前进」，拦住
  const r = mouseHeld[e.button]; if (r) { mouseHeld[e.button] = null; pads[r[0]].up(r[1]); }
});
window.addEventListener('auxclick', e => { if (e.button === 3 || e.button === 4) e.preventDefault(); });
window.addEventListener('contextmenu', e => {
  // 画面上不弹右键菜单；绑了右键、正在绑键的时候整页都不弹
  if (e.target.closest && e.target.closest('#stage') || performance.now() < blockMenuUntil || (boundMouse(2) && game.mode !== 'attract')) e.preventDefault();
});
/* ---------- 2.1 鼠标「锁」在画面里（Jack：右键按住拖动还会触发浏览器的指令） ----------
   那是浏览器自己的「鼠标手势」（Edge、360 / QQ 这类浏览器、手势插件：按住右键一划 = 后退、刷新、关标签页……），网页拦不住它的按键本身。
   办法：对局里把鼠标锁进画面（Pointer Lock，网页射击游戏那种）—— 指针藏起来，鼠标的动作全交给游戏，浏览器不再把右键拖动当手势。
   只在这一局用的那套键位里绑了鼠标右键 / 中键时才锁（只用键盘的人什么都不变）；暂停、回菜单、结算时放开，继续打的时候再锁上。
   按 Esc 时浏览器会先把指针放出来：对局顺便暂停（和退出全屏一样）。软件版（Steam）没有浏览器手势，不用锁 */
const MouseLock = {
  lostAt: -1e9, warned: false,
  ok() { return !!(cv.requestPointerLock && document.exitPointerLock) && !window.modouDesktop; },
  on() { return document.pointerLockElement === cv; },
  want() {
    if (!this.ok() || game.mode === 'attract' || game.paused || game.phase === 'over') return false;
    if ([menu, pauseEl, resultEl, onlineEl, keysEl, lookEl, pvpEl, setEl, stageEl, drillEl, introEl, passEl].some(o => !o.hidden) || Manual.isOpen()) return false;
    return ['Mouse1', 'Mouse2'].some(c => !!Keys.route(c, game.mode));
  },
  // 该锁就锁、该放就放（锁要在点击 / 按键的那一下里叫，浏览器才答应）
  sync() {
    if (this.want()) {
      if (this.on()) return;
      try { const p = cv.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { const q = cv.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) {} }); } catch (e) {}
      if (!this.warned) { this.warned = true; toast('绑了鼠标右键：对局里鼠标指针先藏起来（防浏览器的鼠标手势）· Esc 暂停就放出来', 4200); }
    } else if (this.on()) { try { document.exitPointerLock(); } catch (e) {} }
  },
};
document.addEventListener('pointerlockchange', () => {
  if (MouseLock.on()) return;
  // 对局里指针被放出来了（多半是按了 Esc）：暂停，别让人在看不见指针的时候继续挨打
  if (game.phase === 'fight' && !game.paused && game.mode !== 'online' && game.mode !== 'attract') { MouseLock.lostAt = performance.now(); setPaused(true); }
});

/* ---------- 2.0.2 不受浏览器自己的操作影响（Jack：鼠标侧键绑成招，一按浏览器就后退；空格误碰页面往下滚） ----------
   · 鼠标侧键（后退 / 前进）、中键：整个页面上按下、松开、点击都拦住，不管绑没绑（上面 mousedown / mouseup / auxclick）；
   · 有的鼠标驱动把侧键直接发成浏览器的「后退」命令（不是鼠标键，网页拦不住）：对局里、键位面板开着的时候，在浏览记录里垫一页（同一个网址），
     后退只是退到垫的这一页、页面不动，马上再垫一页；回到菜单以后后退照常（再按一次就离开网页）；
   · 空格、PageUp / PageDown、Home / End 不滚动页面（输入框里打字除外）；对局里方向键也不滚；
     对局里空格不会「点」到刚才点过的按钮（按钮留着焦点的话，空格松开会触发它） */
const Guard = {
  armed: false, href: location.href, skipHashUntil: 0,
  want() { return !Desk && (game.mode !== 'attract' || !keysEl.hidden); },
  arm() {
    if (this.armed || !this.want()) return;
    try { history.pushState({ modouGuard: 1 }, '', location.href); this.armed = true; this.href = location.href; } catch (e) {}
  },
};
window.addEventListener('popstate', () => {
  if (!Guard.armed) return;
  Guard.armed = false;
  if (!Guard.want()) return;
  Guard.skipHashUntil = performance.now() + 400;                      // 退到垫的那一页时网址的 # 可能不一样：别当成点开了邀请链接
  try { if (location.href !== Guard.href) history.replaceState(null, '', Guard.href); } catch (e) {}
  Guard.arm();
  for (const pd of pads) pd.clear();
  toast('对局里浏览器的「后退」不起作用', 1600);
});
for (const ev of ['keydown', 'pointerdown']) window.addEventListener(ev, () => Guard.arm(), { capture: true, passive: true });
const SCROLL_KEYS = new Set(['Space', 'PageUp', 'PageDown', 'Home', 'End']), ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const typing = t => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
window.addEventListener('keydown', e => {
  if (e.code === 'BrowserBack' || e.code === 'BrowserForward') { e.preventDefault(); return; }
  if (keyWait || typing(e.target) || legendOpen()) return;
  const playing = game.mode !== 'attract' && !game.paused;
  if (!SCROLL_KEYS.has(e.code) && !(playing && ARROW_KEYS.has(e.code))) return;
  if (e.code === 'Space' && !playing && e.target && e.target.tagName === 'BUTTON') return;   // 菜单里空格 = 按按钮（键盘操作照常）
  e.preventDefault();
}, { capture: true });
window.addEventListener('keyup', e => {
  if (e.code === 'Space' && game.mode !== 'attract' && !game.paused && e.target && e.target.tagName === 'BUTTON') e.preventDefault();
}, { capture: true });

/* ---------- 声音：任何按键 / 点击 / 回到页面都把声音叫醒（浏览器有时会把它挂起，联机时尤其容易） ---------- */
for (const ev of ['keydown', 'mousedown', 'pointerdown', 'touchend']) window.addEventListener(ev, () => Sound.wake(), { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) Sound.wake(); });
window.addEventListener('focus', () => Sound.wake());

/* ---------- 键盘 ---------- */
// 人机 / 打桩 / 联机：本机一个人，用单人那套键位；双人对战：双人的两套（1.9.1 起和单人分开）
function route(code) {
  if (game.mode === 'attract') return null;
  const r = Keys.route(code, game.mode);
  return r ? [pads[r[0]], r[1]] : null;
}
const pBound = () => !!Keys.route('KeyP', game.mode);
window.addEventListener('keydown', e => {
  if (keyWait) { captureKey(e); return; }
  if (legendOpen()) { Manual.key(e); return; }                    // 2.2 教程面板开着：Esc 关、↑↓ 换章，别的键不进游戏
  if (!keysEl.hidden) { if (e.code === 'Escape' && !e.repeat) closeKeys(); return; }
  if (!pvpEl.hidden) { pvpKey(e); return; }
  if (!lookEl.hidden) { if (e.code === 'Escape') closeLooks(); return; }
  if (!setEl.hidden) { if (e.code === 'Escape' && !e.repeat) closeSettings(); return; }
  if (!stageEl.hidden) { if (e.code === 'Escape' && !e.repeat) showOverlay(menu); return; }
  if (!drillEl.hidden || !introEl.hidden || !passEl.hidden) { if (e.code === 'Escape' && !e.repeat) drillEsc(); return; }
  if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
  // 破招练习的演示里按 Esc：不看了，回到说明
  if (e.code === 'Escape' && !e.repeat && game.mode === 'train' && Drill.cur && Drill.cur.demo && !game.paused) { e.preventDefault(); const id = Drill.cur.def.id; Drill.stop(); drillBar(); openIntro(id); return; }
  if (e.code === 'Escape' || (e.code === 'KeyP' && !pBound())) {
    e.preventDefault();
    // 按住不放的重复不算；刚因为 Esc 退出全屏的那一下也不算（全屏退出时已经暂停过了）
    if (e.repeat || (e.code === 'Escape' && (performance.now() - fsExitAt < 400 || performance.now() - MouseLock.lostAt < 400))) return;
    if (game.mode !== 'attract' && game.mode !== 'online' && game.phase !== 'over') setPaused(!game.paused);
    return;
  }
  if (game.paused || e.altKey || e.ctrlKey || e.metaKey) return;
  const r = route(e.code);
  if (!r) return;
  e.preventDefault();
  r[0].down(r[1], e.repeat);
});
window.addEventListener('keyup', e => { if (!keysEl.hidden) return; const r = route(e.code); if (r) r[0].up(r[1]); });
window.addEventListener('blur', () => { for (const p of pads) p.clear(); mouseHeld.length = 0; });

/* ---------- 触屏（控制 pads[0]） ---------- */
const touchEl = $('touch');
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) touchEl.hidden = false;
window.addEventListener('touchstart', () => { touchEl.hidden = false; }, { once: true, passive: true });
for (const btn of touchEl.querySelectorAll('.tc')) {
  const act = btn.dataset.a;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault(); Sound.init();
    if (game.mode === 'attract' || game.paused) return;
    btn.classList.add('on'); pads[0].down(act, false);
    try { btn.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const up = () => { btn.classList.remove('on'); pads[0].up(act); };
  btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
}

/* 帧数表、克制总表、破解表：2.2 起在 guide.js（教程「查表」那一页 / 软件版教程）里，直接读 MOVES */

/* ---------- 主循环 ---------- */
let last = performance.now(), acc = 0, rafAvg = STEP_MS, smooth = false;
function loop(now) {
  let dt = Math.min(100, now - last); last = now;
  // 2.0.1 帧率：rafAvg = 屏幕大概多久刷新一次。60Hz 屏幕：间隔在 16.7ms 上下抖，偶尔一下走 0 步、下一下走 2 步（画面一顿），
  // 离一步很近的就当正好一步，画面不插值（不多延迟）。别的刷新率（120 / 144 / 75Hz…）：逻辑帧和画面对不齐，
  // 在两帧之间插值着画（render.js RA），人跑起来才顺、没有重影
  rafAvg += (dt - rafAvg) * 0.05;
  if (smooth ? Math.abs(rafAvg - STEP_MS) < 1 : Math.abs(rafAvg - STEP_MS) > 1.6) smooth = !smooth;
  if (!smooth && Math.abs(dt - STEP_MS) < 1.2) dt = STEP_MS;
  if (game.mode === 'online') { if (!document.hidden) Net.tick(dt); RA = smooth ? clamp(Net.acc / STEP_MS, 0, 1) : 1; }
  else if (!game.paused) {
    acc += dt * game.timeScale;
    let n = 0;
    while (acc >= STEP_MS && n < 5) { step([pads[0].sample(), pads[1].sample()]); acc -= STEP_MS; n++; }
    if (n >= 5) acc = 0;
    RA = smooth || game.timeScale < 1 ? clamp(acc / STEP_MS, 0, 1) : 1;        // KO 慢镜头时 60Hz 屏幕也插（不然三帧才动一下）
  }
  render();
  Ach.watch();
  requestAnimationFrame(loop);
}
// 联机时页面切到后台（换标签页、最小化、去回微信），浏览器会暂停画面刷新，游戏就不往前走，
// 对方会一直「等待对方」。用一个 Worker 计时器（浏览器不暂停它）在后台继续推进联机。
(function bgTicker() {
  if (typeof Worker === 'undefined') return;
  try {
    const url = URL.createObjectURL(new Blob(['setInterval(function () { postMessage(0); }, 16);'], { type: 'text/javascript' }));
    const w = new Worker(url);
    let prev = performance.now();
    w.onmessage = () => {
      const now = performance.now(), dt = Math.min(100, now - prev); prev = now;
      if (document.hidden && game.mode === 'online') Net.tick(dt);
    };
  } catch (e) { /* 不支持就算了：切到后台时联机会暂停 */ }
})();
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
// 2.0：窗口拖到另一块屏幕（DPR 变了）、浏览器缩放 —— 重新按新的像素密度画（不然糊）
(function watchDpr() {
  if (!window.matchMedia) return;
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  const on = () => { resize(); watchDpr(); };
  if (mq.addEventListener) mq.addEventListener('change', on, { once: true }); else if (mq.addListener) mq.addListener(on);
})();

// 1.9.0 邀请链接：网址后面带着 #房间码（可能还带着房主的中继）打开 → 直接进联机面板、进这个房间
function openInvite() {
  if (location.hash.length < 2 || game.mode === 'online' || performance.now() < Guard.skipHashUntil) return;
  parseInvite(location.hash).then(({ code, relay }) => {
    if (!code || (Net.room && Net.code === code)) return;
    if (relay) Net.linkRelay = relay;
    openOnline(code);
  }).catch(() => {});
}
window.addEventListener('hashchange', openInvite);
function boot(data) {
  let d = 'normal', snd = true, vol = savedVol();
  try {
    d = localStorage.getItem('modou.diff') || d; snd = localStorage.getItem('modou.sound') !== '0';
  } catch (e) {}
  if (data && typeof data.vol === 'number') vol = data.vol;
  setVol(vol, false);
  if (data && data.diff) d = data.diff;
  if (data && typeof data.sound === 'boolean') snd = data.sound;
  setDiff(LEVELS[d] ? d : 'normal'); setSound(snd);
  if (!Desk) Guide.init();                            // 2.2 页面下面的教程（软件版没有这一块，用「教程」面板）
  resize(); startAttract();
  openInvite();
  Ach.drills();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('40px "Ma Shan Zheng"', '墨斗靛朱赭松黛紫苍随机第一二三四五回合战胜负已分时间到平局决胜局连击崩拳冲天炮鞭腿旋风腿泰山压顶飞踢接腿摔擒拿连珠快拳后手直拳摆拳势破挡闪拆破招空中倒地久被两败俱伤本重打等待对方联机不同步拼克制化解霸体卸失衡推开震爆气满可泼墨寸劲转身蹬扫堂托天掌铁山靠过肩下段上蹲站要拳重腿对必杀压起手顶肘劈挂落步冲盖砸二起脚千斤坠闪背后不住迎击势桩练习回满打截踩抄抱提膝别挣脱借力滚身反绽住翻断挨着撞掉线栽葱朱日远山松崖飞瀑竹林夜月桃花园大漠孤烟练武场训地狱极难')
      .catch(() => {});
  }
  requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
}
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) { try { hot.snapshot(() => ({ diff: game.diff, sound: Sound.on, vol: Sound.vol })); } catch (e) {} }
if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
window.__modou = { game, F1, F2, MOVES, POSE, step, startMatch, Brain, render, FX, Net, pads, stateHash };
