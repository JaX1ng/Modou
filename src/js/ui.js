'use strict';
/* 界面：菜单/暂停/结算/联机面板、人物颜色、全屏、键盘·鼠标·触屏 → Pad、帧数表、主循环与启动 */

const $ = id => document.getElementById(id);
const menu = $('menu'), pauseEl = $('pause'), resultEl = $('result'), onlineEl = $('online'), keysEl = $('keysPanel');
const prepEl = $('prepPanel'), setEl = $('setPanel');            // 2.11 准备页（人机 / 双人 / 观战 / 训练场选场景、颜色、拳派）
const drillEl = $('drillPanel'), introEl = $('drillIntro'), passEl = $('drillPass');   // 2.1 破招练习：选课、说明；2.2 过关
const btnPause = $('btnPause'), btnSound = $('btnSound');
const Desk = window.modouDesktop || null;          // 2.1 软件版（Steam）才有这个对象（desktop/preload.js 给的）；网页版是 null。见下面「软件版」

function showOverlay(el) {
  for (const o of [menu, pauseEl, resultEl, onlineEl, keysEl, prepEl, setEl, drillEl, introEl, passEl]) o.hidden = o !== el;
  $('stage').classList.toggle('playing', ![menu, onlineEl, keysEl, prepEl, setEl].includes(el));
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
// 2.3（Jack：主菜单最底下那句「五局三胜……」删掉）：这一行平时不显示，只在出事的时候写（对方断开、版本不一样……）
function toMenu(msg) {
  game.paused = false; btnPause.disabled = true;
  $('menuMsg').textContent = msg || ''; $('menuMsg').hidden = !msg;
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
  $('btnAgain').textContent = game.mode === 'watch' ? '再来一场' : '再战一局';      // 2.11 观战：两边的选择留着，再看一场
  btnPause.disabled = true;
  MouseLock.sync();
  Ach.matchOver(wi);
  setTimeout(() => { if (game.phase === 'over') showOverlay(resultEl); }, 900);
};
/* 2.2 难度（Jack：入门 / 简单 / 中等 / 困难 / 终极，每个两个字）。2.3（Jack：底下不要点，也不要介绍）：每格就是两个字。
   2.11 从菜单挪进人机对战的准备页（电脑那一块） */
function setDiff(d) {
  game.diff = d;
  for (const b of document.querySelectorAll('[data-d]')) b.setAttribute('aria-pressed', String(b.dataset.d === d));
  try { localStorage.setItem('modou.diff', d); } catch (e) {}
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

// 2.11 主菜单只留模式：点进去先到这个模式的准备页（联机还是联机面板，连上以后在大厅里选）
$('btnPve').addEventListener('click', () => openPrep('pve'));
$('btnPvp').addEventListener('click', () => openPrep('pvp'));
$('btnWatch').addEventListener('click', () => openPrep('watch'));
$('btnTrain').addEventListener('click', () => openPrep('train'));
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
    return `<article class="dtopic">${iconSlot(DRILL_ICON[tid] || { pose: 'stance' }, 104, 104, 'dt-icon', { flip: true, col: C.cin })}<div class="dt-body"><h4>${esc(t[1])}</h4><p>${esc(dashWords(t[2]))}</p>` +
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
// save：玩家自己调的才存（2.3 起打开游戏、打开设置不再存一遍 —— 以后再挪刻度时分得清谁动过）
function setVol(v, hear, save) {
  Sound.setVol(v);
  $('volRange').value = Sound.vol; $('volVal').textContent = Sound.vol;
  if (save) { try { localStorage.setItem('modou.vol3', String(Sound.vol)); } catch (e) {} }
  if (hear) Sound.preview();
}
// 2.1、2.3 音量刻度上挪过（现在的 50 = 2.2 的 70 = 2.0.2 的 112）：以前存过的换算成新刻度，听着和以前一样响（fx.js Sound.volFromStore）
function savedVol() { try { return Sound.volFromStore(k => localStorage.getItem(k)); } catch (e) { return 50; } }
function openSettings(from) { setBack = from; setVol(Sound.vol, false); showOverlay(setEl); }
function closeSettings() { showOverlay(setBack === 'pause' ? pauseEl : menu); }
$('btnSettings').addEventListener('click', () => openSettings('menu'));
$('btnPauseSet').addEventListener('click', () => openSettings('pause'));
$('btnSetDone').addEventListener('click', closeSettings);
$('volRange').addEventListener('input', e => setVol(+e.target.value, false, true));
$('volRange').addEventListener('change', e => setVol(+e.target.value, true, true));       // 松手时响一声
$('volDown').addEventListener('click', () => setVol(Sound.vol - 10, true, true));
$('volUp').addEventListener('click', () => setVol(Sound.vol + 10, true, true));
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
        ? '\n等了半分钟还没连上。如果对方已经输入同一个房间码了：两边刷新一下再试；两台设备在同一个局域网里的话，也可以用下面的「手动连接」。'
        : '\n等了半分钟还没连上。如果对方已经输入同一个房间码了，多半是网络挡住了设备之间的直连（防火墙、对称型 NAT）：在下面「中继服务器」里填一个 TURN 中继（有一边填了就行），或者换个网络再试。';
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
      else relayStatus('已保存，但在这个网络上没测通：' + r.why + '。换个网络再点一次试试。', 'bad');
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
  renderNetLooks(); renderNetStages(); renderNetStyles();
};
// 2.9 联机大厅选拳派：各选各的（对方选了什么写在上面）
function renderNetStyles() {
  const me = Net.myKey(), th = me === 'h' ? 'g' : 'h';
  styleRow('netStyles', Net.styles[me], { sm: true });
  $('netOppStyle').textContent = '对方：' + STYLES[Net.styles[th]].name;
}
$('netStyles').addEventListener('click', e => {
  const b = e.target.closest('.styl'); if (!b || !styleOk(b.dataset.style)) return;
  if (Net.pickStyle(b.dataset.style)) { Styles.solo.me = b.dataset.style; Styles.save(); renderNetStyles(); }
});
// 联机选色：自己的亮着，对方占着的变暗点不了；房主说了算（net.js settleLook）
function renderNetLooks() {
  const me = Net.role === 'host' ? 'h' : 'g', my = Net.looks[me], th = Net.looks[me === 'h' ? 'g' : 'h'];
  $('netLooks').innerHTML = PALETTE.map(p => swatch(p, { on: p.id === my, taken: p.id === th ? '对方' : '' })).join('');
}
Net.onLooks = () => { if (!$('netLobby').hidden) { renderNetLooks(); renderNetStages(); renderNetStyles(); } };
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
    else { netErr('连不上：网络可能不允许两台设备直接连接（防火墙、对称型 NAT）。点开上面「中继服务器」填一个 TURN 中继再试；两台设备在同一个局域网里的话，也可以用下面的「手动连接」。'); $('relayBox').open = true; }
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
  const dm = k.dashMode, tap = dm === 'tap';                                      // 冲刺：2.4 双击方向（冲刺键那一行不用）/ 冲刺键；2.5.1 两种都用
  for (const b of document.querySelectorAll('[data-dashm]')) b.setAttribute('aria-pressed', String(b.dataset.dashm === dm));
  const L = keyName(k.left[0] || k.left[1]), R = keyName(k.right[0] || k.right[1]);
  $('dashHint').textContent = tap ? `双击左 / 右（${L}${L} / ${R}${R}）往那边冲；按着挡朝对手双击 = 闪身。冲刺键那一行不用。`
    : dm === 'key' ? '按冲刺键往按着的方向冲（不按方向就往前；按着挡按 = 闪身）。双击方向不再冲刺。'
    : `两种都能冲：双击左 / 右（${L}${L} / ${R}${R}），或者按冲刺键（往按着的方向冲，不按方向就往前）；按着挡时这么按 = 闪身。`;
  $('keyRows').innerHTML = ACTIONS.map(([a, n]) => {
    const off = a === 'dash' && tap;
    return `<tr${off ? ' class="off"' : ''}><td>${n}</td>` + [0, 1].map(i => {
      const c = k[a][i], waiting = keyWait && keyWait[0] === a && keyWait[1] === i;
      const cls = waiting ? 'wait' : off ? 'off' : !c ? 'empty' : pr.dupCodes.has(c) ? 'bad' : shared.has(c) ? 'shared' : '';
      return `<td><button type="button" class="kbtn ${cls}" data-a="${a}" data-i="${i}"${off ? ' disabled title="选了「双击」，冲刺键不用"' : ''}>${waiting ? '按一个键…' : keyName(c)}</button></td>`;
    }).join('') + '</tr>';
  }).join('');
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
// 2.5.1 冲刺怎么按的三个按钮用 data-dashm（以前和训练场木桩那排按钮一样用 data-dm：点木桩的按钮会把键位草稿的冲刺方式改掉、键位面板没开过时还报错；
// 点冲刺方式又会把木桩设成一个不存在的动作）
for (const b of document.querySelectorAll('[data-dashm]')) b.addEventListener('click', () => { keyDraft[keyWho].dashMode = b.dataset.dashm; keyWait = null; renderKeys(); });
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
// 2.4 冲刺键：这一局用的那套键位选了「冲刺键」，输入里带上这一位（双击方向不冲；联机时对面也按这个算）
pads[0].keyDash = () => Keys.keyDash(0, game.mode);
pads[1].keyDash = () => Keys.keyDash(1, game.mode);
$('btnKeysCancel').addEventListener('click', closeKeys);
$('btnKeys').addEventListener('click', () => openKeys('menu'));
$('btnPauseKeys').addEventListener('click', () => openKeys('pause'));
// 教程里的键位（2.2 起在 guide.js）：改了键位就重画，显示现在真正在用的键
function showKeyCards() { Guide.refresh(); }

/* ---------- 人物颜色（1.7.0）：准备页里选（2.11 以前在菜单「人物颜色」）、联机大厅选 ---------- */
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
/* ---------- 2.9 拳派：准备页里选（2.11 以前在菜单「拳派」），联机大厅各选各的 ----------
   每一派一张卡：架势小图（用这一派自己的架势画）+ 名字 + 一句话 */
const STYLE_LINE = {
  trad: '大开大合：重拳霸体、腿长、摔投',
  wc: '按拍子连环冲拳，按住挡接招，手搭上了在手上做文章',
};
function styleCard(id, o) {
  const sm = !!o.sm, w = sm ? 52 : 92;
  if (id === 'random') return `<button type="button" class="styl rand" data-style="random" aria-pressed="${!!o.on}"><span class="sicon"><i>?</i></span><b>随机</b>${sm ? '' : '<small>每局随机一派</small>'}</button>`;
  return `<button type="button" class="styl" data-style="${id}" aria-pressed="${!!o.on}">${iconSlot({ pose: 'stance', style: id }, w, w, 'sicon')}<b>${STYLES[id].name}</b>` +
    (sm ? '' : `<small>${STYLE_LINE[id] || ''}</small>`) + '</button>';
}
function styleRow(el, cur, o) {
  o = o || {};
  $(el).innerHTML = (o.rand ? styleCard('random', { on: cur === 'random', sm: o.sm }) : '') + STYLE_IDS.map(id => styleCard(id, { on: id === cur, sm: o.sm })).join('');
  PoseIcon.fill($(el));
}

/* ---------- 场景（2.0）：准备页里选（2.11 以前在菜单「场景」），联机大厅房主选 ---------- */
// 一排场景按钮：每个按钮一张小图（远景 + 中景缩小画的）+ 名字。sm = 小一号
function stageButtons(cur, o) {
  o = o || {};
  const tw = o.sm ? 120 : 200, th = o.sm ? 60 : 100, k = Math.min(2, window.devicePixelRatio || 1);
  return STAGE_PICK.map(id => `<button type="button" class="stg" data-stage="${id}" aria-pressed="${id === cur}"${o.lock ? ' disabled' : ''}>` +
    `<img alt="" width="${tw}" height="${th}" src="${Stage.thumb(id, Math.round(tw * k), Math.round(th * k))}"><span>${STAGES[id].name}</span></button>`).join('');
}
// 联机大厅：房主点了算；加入方只看得到房主选的哪张
function renderNetStages() {
  const host = Net.role === 'host';
  $('netStageHint').textContent = host ? '场景（你是房主，你来选）' : '场景（房主选的）';
  $('netStages').innerHTML = stageButtons(Stage.online, { sm: true, lock: !host });
}
$('netStages').addEventListener('click', e => { const b = e.target.closest('.stg'); if (b && !b.disabled && Net.pickStage(b.dataset.stage)) renderNetStages(); });

/* ---------- 2.11 准备页（Jack：主菜单只留模式，颜色 / 拳派 / 场景都进了模式再选）----------
   人机、双人、观战、训练场共用一张：上面一排场景（训练场固定练武场，不用选），下面两边各一块 —— 小人（这一派的架势、选的颜色）、拳派卡、颜色格；
   人机的电脑那一块多一排难度（颜色、拳派都能选「随机」）；训练场右边是木桩（只选拳派）。
   选的先记在草稿里，菜单后面的两个人、背景跟着换（预览）；点「开始」才存（localStorage 照旧 modou.stage / modou.styles / modou.looks / modou.diff），下次进来默认就是上次的。
   键盘：左边 A / D 换颜色、W / S 换拳派，右边 ← / → 换颜色、↑ / ↓ 换拳派；Enter 开始，Esc 返回 */
const PREP = {
  pve: { title: '人机对战', who: ['你', '电脑'], rand: true, diff: true },
  pvp: { title: '双人对战', who: ['玩家一', '玩家二'] },
  watch: { title: '观战', who: ['左边', '右边'], note: '两边都是终极难度的电脑，五局三胜。看它怎么连、怎么破，打完能再来一场。' },
  train: { title: '训练场', who: ['你', '木桩'], dummy: true },
};
let prep = null;              // 草稿：{ mode, stage, looks: [左, 右], styles: [左, 右], diff }
function openPrep(mode) { prep = picksFor(mode); renderPrep(); showOverlay(prepEl); previewPrep(true); }   // 默认是上次选的（game.js picksFor）
// 颜色格：两边不能一样（人机的电脑可以「随机」，随机不会和你撞色）
function prepLooks(i) {
  const P = PREP[prep.mode], my = prep.looks[i], th = prep.looks[1 - i];
  const taken = id => id === th && !(P.rand && i === 0 && th === 'random') ? prep.who[1 - i] : '';
  return (P.rand && i === 1 ? randSwatch(my === 'random') : '') + PALETTE.map(p => swatch(p, { on: p.id === my, taken: taken(p.id) })).join('');
}
function prepFace(i) {
  const st = prep.styles[i], lk = prep.looks[i], col = lk === 'random' ? '#9a9b94' : lookOf(lk).color;
  return iconSlot({ pose: 'stance', style: styleOk(st) ? st : STYLE_DEFAULT }, 84, 96, 'pface' + (styleOk(st) ? '' : ' rand'), { flip: i === 1, col });
}
function renderPrep() {
  const P = PREP[prep.mode], m = prep.mode;
  prep.who = P.who;
  $('prepTitle').textContent = P.title;
  $('prepStageBox').hidden = m === 'train'; $('prepStageFix').hidden = m !== 'train';
  if (m !== 'train') $('prepStages').innerHTML = stageButtons(prep.stage, { sm: true });
  const side = i => {
    const st = prep.styles[i], lk = prep.looks[i], dummy = P.dummy && i === 1;
    const name = lk === 'random' || dummy ? (dummy ? '' : '随机') : lookOf(lk).name, stName = styleOk(st) ? STYLES[st].name : '随机拳派';
    return `<section class="prep-side" data-side="${i}"><div class="ps-head">${prepFace(i)}<div><b>${P.who[i]}${name ? ' · ' + name : ''}</b><small>${stName}${m === 'watch' ? ' · 终极' : ''}</small></div></div>` +
      `<p class="step">${dummy ? '木桩的拳派' : '拳派'}</p><div class="styles sm" data-ps="${i}"></div>` +
      (dummy ? '<p class="hint">木桩站着、蹲着、挡着，进去以后下面的工具条上换。</p>' : `<p class="step">颜色</p><div class="swatches sm" data-pl="${i}">${prepLooks(i)}</div>`) +
      (P.diff && i === 1 ? `<p class="step">难度</p><div class="lvl sm" role="group" aria-label="电脑难度">${LEVEL_IDS.map(id => `<button type="button" data-pd="${id}" aria-pressed="${id === prep.diff}">${LEVEL_NAME[id]}</button>`).join('')}</div>` : '') +
      '</section>';
  };
  $('prepSides').innerHTML = side(0) + side(1) + (P.note ? `<p class="hint prep-note">${P.note}</p>` : '');
  for (const i of [0, 1]) {
    const el = $('prepSides').querySelector(`[data-ps="${i}"]`);
    el.innerHTML = (P.rand && i === 1 ? styleCard('random', { on: prep.styles[i] === 'random', sm: true }) : '') + STYLE_IDS.map(id => styleCard(id, { on: id === prep.styles[i], sm: true })).join('');
  }
  PoseIcon.fill($('prepSides'));
  $('prepKeys').innerHTML = P.dummy ? '<kbd class="lt">A</kbd> <kbd class="lt">D</kbd> 换你的颜色、<kbd class="lt">W</kbd> <kbd class="lt">S</kbd> 换你的拳派，<kbd class="lt">↑</kbd> <kbd class="lt">↓</kbd> 换木桩的拳派，也可以直接点；Enter 开始'
    : `${P.who[0]}按 <kbd class="lt">A</kbd> <kbd class="lt">D</kbd> 换颜色、<kbd class="lt">W</kbd> <kbd class="lt">S</kbd> 换拳派，${P.who[1]}按 <kbd class="lt">←</kbd> <kbd class="lt">→</kbd>、<kbd class="lt">↑</kbd> <kbd class="lt">↓</kbd>，也可以直接点；Enter 开始`;
}
// 菜单后面的两个人就是预览：选的颜色、拳派（随机的那边随便一个），背景是选的场景（训练场是练武场）
function previewPrep(first) {
  if (game.mode !== 'attract' || !prep) return;
  const m = prep.mode, [a, b] = prep.looks;
  Stage.peek = m === 'train' ? 'yard' : prep.stage;
  F1.setLook(a === 'random' ? cpuLook() : a);
  F2.setLook(m === 'train' ? cpuLook() : b === 'random' ? (F2.look !== a ? F2.look : PALETTE.find(p => p.id !== a).id) : b);
  const s0 = prep.styles[0], s1 = styleOk(prep.styles[1]) ? prep.styles[1] : F2.style;
  if (first || F1.style !== s0 || F2.style !== s1) { F1.style = s0; F2.style = s1; resetFighters(); }
}
function closePrep() { prep = null; Stage.peek = null; showOverlay(menu); applyLooks('attract'); }
function prepPick(i, kind, id) {
  if (!prep) return;
  if (kind === 'look') {
    if (id !== 'random' && id === prep.looks[1 - i] && !(prep.mode === 'pve' && i === 0)) return;
    prep.looks[i] = id;
    if (prep.mode === 'pve' && i === 0 && prep.looks[1] === id) prep.looks[1] = 'random';   // 你换成电脑的颜色：电脑改随机
  } else if (kind === 'style') prep.styles[i] = id;
  else if (kind === 'stage') prep.stage = id;
  else if (kind === 'diff') prep.diff = id;
  renderPrep(); previewPrep();
}
function prepCycle(i, kind, d) {
  const P = PREP[prep.mode];
  if (kind === 'look') {
    if (P.dummy && i === 1) return;
    const ids = (P.rand && i === 1 ? ['random'] : []).concat(PALETTE.map(p => p.id)).filter(id => id === 'random' || id !== prep.looks[1 - i] || (prep.mode === 'pve' && i === 0));
    const k = ids.indexOf(prep.looks[i]);
    prepPick(i, 'look', ids[(k + d + ids.length) % ids.length]);
  } else {
    const ids = (P.rand && i === 1 ? ['random'] : []).concat(STYLE_IDS), k = ids.indexOf(prep.styles[i]);
    prepPick(i, 'style', ids[(k + d + ids.length) % ids.length]);
  }
}
function prepGo() {
  if (!prep) return;
  const m = prep.mode;
  savePicks(prep); if (m === 'pve') setDiff(prep.diff);       // 点「开始」才存（game.js savePicks）
  showLooks();
  prep = null; Stage.peek = null;
  startMatch(m);
}
function prepKey(e) {
  const k = { KeyA: [0, 'look', -1], KeyD: [0, 'look', 1], KeyW: [0, 'style', -1], KeyS: [0, 'style', 1],
    ArrowLeft: [1, 'look', -1], ArrowRight: [1, 'look', 1], ArrowUp: [1, 'style', -1], ArrowDown: [1, 'style', 1] }[e.code];
  if (k && prep) {
    e.preventDefault();
    if (!(PREP[prep.mode].dummy && k[0] === 1 && k[1] === 'look')) prepCycle(k[0], k[1], k[2]);   // 训练场：← → 不用（木桩不选颜色），↑ ↓ 换木桩的拳派
  }
  else if (e.code === 'Escape' && !e.repeat) closePrep();
  else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && !(e.target && e.target.tagName === 'BUTTON' && e.target !== $('btnPrepGo'))) { e.preventDefault(); prepGo(); }
}
$('prepStages').addEventListener('click', e => { const b = e.target.closest('.stg'); if (b && !b.disabled) prepPick(0, 'stage', b.dataset.stage); });
$('prepSides').addEventListener('click', e => {
  const sd = e.target.closest('[data-side]'); if (!sd) return;
  const i = +sd.dataset.side, sw = e.target.closest('.sw'), st = e.target.closest('.styl'), lv = e.target.closest('[data-pd]');
  if (sw && !sw.disabled) prepPick(i, 'look', sw.dataset.id);
  else if (st) prepPick(i, 'style', st.dataset.style);
  else if (lv) prepPick(i, 'diff', lv.dataset.pd);
});
$('btnPrepGo').addEventListener('click', prepGo);
$('btnPrepBack').addEventListener('click', closePrep);
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
// 2.4 画面三种（Jack：软件要有真正全屏和全屏窗口）：设置里三选一；顶栏 ⛶、F11、Alt+Enter 在窗口和上次用的那种全屏之间切
const DISP_HINT = {
  fullscreen: '全屏：系统的全屏，盖住整块屏幕和任务栏。',
  borderless: '全屏窗口：没边框的窗口铺满屏幕，切出去（Alt+Tab、点另一块屏幕）不最小化、不闪。',
  window: '窗口：普通窗口，能拖、能改大小。',
};
function showDisplay(m) {
  for (const b of document.querySelectorAll('[data-disp]')) b.setAttribute('aria-pressed', String(b.dataset.disp === m));
  $('dispHint').textContent = (DISP_HINT[m] || '') + '按 F11 / Alt+Enter 在窗口和全屏之间切。';
}
if (Desk) {
  document.documentElement.classList.add('desktop');
  playEl.classList.add('fs');
  for (const id of ['btnExit']) $(id).hidden = false;
  const showFs = on => { btnFull.textContent = on ? '退出全屏' : '⛶ 全屏'; $('btnPauseFull').hidden = !on; setTimeout(resize, 60); };
  showFs(Desk.isFullscreen());
  Desk.onFullscreenChange(showFs);
  if (Desk.setDisplay && Desk.display) {
    $('dispBox').hidden = false; showDisplay(Desk.display());
    if (Desk.onDisplayChange) Desk.onDisplayChange(showDisplay);
    for (const b of document.querySelectorAll('[data-disp]')) b.addEventListener('click', () => { Desk.setDisplay(b.dataset.disp); showDisplay(b.dataset.disp); });
  }
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
  if (!keysEl.hidden || !prepEl.hidden || !setEl.hidden || !drillEl.hidden || !introEl.hidden || !passEl.hidden || Manual.isOpen()) return null;
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
    if (!this.ok() || game.mode === 'attract' || game.mode === 'watch' || game.paused || game.phase === 'over') return false;   // 2.11 观战不用锁
    if ([menu, pauseEl, resultEl, onlineEl, keysEl, prepEl, setEl, drillEl, introEl, passEl].some(o => !o.hidden) || Manual.isOpen()) return false;
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

/* ---------- 菜单的声音（2.3 起；2.5.1 Jack：光标放上去全都不出声，点下去是木鱼声） ----------
   菜单、暂停、结算、各种面板（都在 .overlay 里）和教程面板里的按钮：移上去、Tab 换焦点都不出声；按下去一声木鱼（fx.js Sound.uiPress）。
   浏览器要先点过一下页面才让出声（软件版一开就有） */
const UI_SND = '.overlay button, .overlay summary, #manual button';
document.addEventListener('click', e => {
  const b = e.target.closest ? e.target.closest(UI_SND) : null;
  if (b && !b.disabled && !b.hasAttribute('data-nosnd')) Sound.uiPress();      // 音量 −/＋ 自己会响一声试听，不再叠一声
});

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
  if (!prepEl.hidden) { prepKey(e); return; }
  if (!setEl.hidden) { if (e.code === 'Escape' && !e.repeat) closeSettings(); return; }
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
let last = performance.now(), acc = 0, rafAvg = FRAME_MS, aligned = true;
function loop(now) {
  let dt = Math.min(100, now - last); last = now;
  // 2.0.1 / 2.6 帧率：逻辑一秒 SIM_HZ（240）步，和屏幕刷新率无关。rafAvg = 屏幕大概多久刷新一次：
  // 刚好是整数步（60Hz = 4 步、120Hz = 2 步、240Hz = 1 步）就把这一下对齐成正好那么多步，画面不插值（不多一点延迟；
  // 60Hz 屏幕间隔在 16.7ms 上下抖，不对齐的话偶尔一下走 3 步、下一下走 5 步，画面一顿）；
  // 别的刷新率（144 / 165 / 75Hz…）逻辑步和画面对不齐，在两步之间插值着画（render.js RA），人跑起来才顺、没有重影
  rafAvg += (dt - rafAvg) * 0.05;
  const k = Math.max(1, Math.round(rafAvg / STEP_MS)), off = Math.abs(rafAvg - k * STEP_MS);
  if (aligned ? off > 0.8 : off < 0.4) aligned = !aligned;
  if (aligned && Math.abs(dt - k * STEP_MS) < 1.2) dt = k * STEP_MS;
  if (game.mode === 'online') { if (!document.hidden) Net.tick(dt); RA = aligned ? 1 : clamp(Net.acc / STEP_MS, 0, 1); }
  else if (!game.paused) {
    acc += dt * game.timeScale;
    let n = 0;
    while (acc >= STEP_MS - 1e-6 && n < 5 * SUB) { simTick([pads[0].sample(), pads[1].sample()]); acc -= STEP_MS; n++; }
    if (n >= 5 * SUB) acc = 0;
    RA = !aligned || game.timeScale < 1 ? clamp(acc / STEP_MS, 0, 1) : 1;        // KO 慢镜头时也插（不然几帧才动一下）
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
  // 2.4（Jack：刚进去主菜单没声音，打完一局出来才有木鱼声）：一打开就把声音引擎建好 —— 软件版马上有声；
  // 网页版浏览器规定先点一下页面才让出声，点的那一下（ui.js 下面的 wake）就叫醒它
  Sound.init();
  if (!Desk) Guide.init();                            // 2.2 页面下面的教程（软件版没有这一块，用「教程」面板）
  resize(); startAttract();
  openInvite();
  Ach.drills();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('40px "Ma Shan Zheng"', '墨斗靛朱赭松黛紫苍随机第一二三四五回合战胜负已分时间到平局决胜局连击进步冲拳冲天炮鞭腿旋风腿坠山击飞踢接腿摔擒拿连珠快拳后手直拳摆拳势破挡闪拆破招空中倒地久被两败俱伤本重打等待对方联机不同步拼克制化解霸体卸失衡推开震爆气满可泼墨寸劲转身蹬扫堂托天掌沉肩靠过肩下段上蹲站要拳重腿对必杀压起手顶肘劈山落步冲盖砸二起脚坠山闪背后不住迎击势桩练习回满打截踩抄抱提膝别挣脱借力滚身反绽住翻断挨着撞掉线栽葱朱日远山松崖飞瀑竹林夜月桃花园大漠孤烟练武场训地狱极难')
      .catch(() => {});
  }
  requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
}
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) { try { hot.snapshot(() => ({ diff: game.diff, sound: Sound.on, vol: Sound.vol })); } catch (e) {} }
if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
window.__modou = { game, F1, F2, MOVES, POSE, step, simTick, startMatch, Brain, render, FX, Net, pads, stateHash };
