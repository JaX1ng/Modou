'use strict';
/* 墨斗桌面版主进程：开窗口、三种画面（全屏 / 全屏窗口 / 窗口）、游戏页面能用的接口（见 preload.js）、可选的 Steam。
   游戏本身是 app/index.html，由 python build.py --desktop 生成，和网页版是同一份代码。

   调试：设环境变量 MODOU_DEBUG=1 再启动，才有开发者工具（F12 / Ctrl+Shift+I）和 Ctrl+R 刷新。 */
const { app, BaseWindow, WebContentsView, Menu, dialog, ipcMain, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const steam = require('./steam');

const DEBUG = process.env.MODOU_DEBUG === '1';
const TITLE = '墨斗';
const BG = '#283033';
const APP_DIR = path.join(__dirname, 'app');
const INDEX = path.join(APP_DIR, 'index.html');
// 页面能拿到的权限；其余一律拒绝
const PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write', 'clipboard-read', 'keyboardLock', 'pointerLock']);

let win = null;       // 现在的窗口（BaseWindow）。换「有边框 / 没边框」要换一个窗口
let view = null;      // 游戏页面（WebContentsView）：换窗口时挪到新窗口里接着跑，不重新加载

/* ---------- 设置：userData/settings.json（画面模式、窗口多大） ---------- */
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  } catch (e) {
    return {};
  }
}

function writeSettings(patch) {
  const file = settingsFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify({ ...readSettings(), ...patch }, null, 2));
    fs.renameSync(file + '.tmp', file);
  } catch (e) {
    console.error('[modou] 存设置失败：' + e.message);
  }
}

/* ---------- 只允许待在 app/ 里，外部网页只能经 openExternal 用系统浏览器打开 ---------- */
function isAppUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'file:') return false;
    let p = path.normalize(fileURLToPath(u));
    let base = path.normalize(APP_DIR + path.sep);
    if (process.platform === 'win32') { p = p.toLowerCase(); base = base.toLowerCase(); }
    return p.startsWith(base);
  } catch (e) {
    return false;
  }
}

function isWebUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

function lockDown(wc) {
  const block = (e, url) => {
    const target = (e && e.url) || url;
    if (!isAppUrl(target)) {
      e.preventDefault();
      if (DEBUG) console.log('[modou] 拦下跳转：' + target);
    }
  };
  wc.on('will-navigate', block);
  wc.on('will-frame-navigate', block);
  wc.on('will-redirect', block);
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
}

/* ---------- 画面（2.4，Jack：软件要有真正全屏和全屏窗口两种模式） ----------
   · fullscreen 全屏：系统的全屏 —— 盖住整块屏幕和任务栏（macOS 单独开一个桌面空间）
   · borderless 全屏窗口：没有边框、没有标题栏的窗口，铺满整块屏幕；它还是个普通窗口 —— Alt+Tab、点另一块屏幕，
     它不最小化、不闪一下（macOS 用 simpleFullScreen：不另开桌面空间、没有动画）
   · window 窗口：普通窗口，能拖、能改大小
   F11 / Alt+Enter：在窗口和「全屏 / 全屏窗口里上次用的那个」之间切。游戏里「设置」能三选一。
   边框建窗口时就定了、改不了：Windows / Linux 进出「全屏窗口」要换一个窗口 —— 游戏页面在一个 WebContentsView 里，
   直接挪进新窗口接着跑（不重新加载，打到一半切也不打断） */
const MODES = ['fullscreen', 'borderless', 'window'];
const MAC = process.platform === 'darwin';
let mode = 'window';            // 现在是哪种
let fullPref = 'fullscreen';    // F11 切到哪种「全屏」（上次用的）
let windowBounds = null;        // 窗口模式下窗口多大、在哪（回到窗口模式时用）
let switching = false;          // 正在换窗口 / 进出全屏（这时窗口自己发的事件不算玩家切的）

function displayOf(w) {
  try { return screen.getDisplayMatching(w.getBounds()); } catch (e) { return screen.getPrimaryDisplay(); }
}
function fitView() {
  if (!win || win.isDestroyed() || !view) return;
  const b = win.getContentBounds();
  view.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
}
function tellPage() {
  if (view && !view.webContents.isDestroyed()) view.webContents.send('modou:display', mode);
}
function saveMode() { writeSettings({ display: mode, full: fullPref, ...(windowBounds ? { bounds: windowBounds } : {}) }); }

// 开一个窗口：frameless = 没边框（全屏窗口用，bounds = 整块屏幕）；有边框的放回上次窗口模式的位置（没有就 1280×720 放正中）
function makeWindow(frameless, bounds) {
  const w = new BaseWindow({
    title: TITLE,
    ...(frameless
      ? { ...bounds, frame: false, resizable: false, movable: false, minimizable: true, maximizable: false, fullscreenable: true, hasShadow: false, thickFrame: false }
      : { width: 1280, height: 720, useContentSize: true, center: true, minWidth: 960, minHeight: 540 }),
    backgroundColor: BG,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: path.join(__dirname, 'build', 'icon.png') } : {}),
  });
  if (!frameless && windowBounds && onSomeScreen(windowBounds)) w.setBounds(windowBounds);
  w.frameless = !!frameless;
  w.on('resize', () => { fitView(); rememberBounds(w); });
  w.on('move', () => rememberBounds(w));
  for (const ev of ['maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']) w.on(ev, () => setTimeout(fitView, 0));
  // 玩家自己用系统的办法进出全屏（macOS 左上角绿钮、Windows 的快捷键……）：跟着记
  w.on('enter-full-screen', () => { if (!switching && w === win) { mode = 'fullscreen'; fullPref = 'fullscreen'; saveMode(); tellPage(); } });
  w.on('leave-full-screen', () => { if (!switching && !closingWin && w === win && mode === 'fullscreen') { mode = 'window'; saveMode(); tellPage(); } });
  w.on('closed', () => { if (w === win) win = null; });
  return w;
}
function rememberBounds(w) {
  if (w !== win || mode !== 'window' || w.frameless || w.isFullScreen() || w.isMaximized() || w.isMinimized()) return;
  windowBounds = w.getBounds();
}
let closingWin = false;        // 玩家在关窗口（关的时候系统会先退出全屏 —— 那一下不记成「切回窗口」）
// 上次窗口模式的位置还在某一块屏幕上（屏幕拔掉了就不用它）
function onSomeScreen(b) {
  try { return screen.getAllDisplays().some(d => { const a = d.workArea; return b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y < a.y + a.height - 40 && b.y + b.height > a.y + 20; }); }
  catch (e) { return false; }
}
// 把游戏页面挪到一个新窗口（frameless：有没有边框），旧窗口关掉
function moveTo(frameless, bounds) {
  const old = win;
  const w = makeWindow(frameless, bounds);
  if (old && !old.isDestroyed()) old.contentView.removeChildView(view);
  w.contentView.addChildView(view);
  win = w; fitView();
  w.on('close', () => { if (w === win) closingWin = true; });
  if (old && !old.isDestroyed()) { old.removeAllListeners('close'); old.destroy(); }
  return w;
}
// 换到 next 这种画面
function setMode(next) {
  if (!MODES.includes(next) || !win || win.isDestroyed()) return;
  if (next !== 'window') fullPref = next;
  if (next === mode && (next !== 'fullscreen' || win.isFullScreen())) { tellPage(); return; }
  switching = true;
  try {
    if (MAC) {
      // macOS：一直是同一个窗口。全屏 = 原生全屏；全屏窗口 = simpleFullScreen
      if (next === 'fullscreen') { if (win.isSimpleFullScreen()) win.setSimpleFullScreen(false); win.setFullScreen(true); }
      else if (next === 'borderless') {
        if (win.isFullScreen()) { win.once('leave-full-screen', () => { if (win && mode === 'borderless') win.setSimpleFullScreen(true); }); win.setFullScreen(false); }
        else win.setSimpleFullScreen(true);
      } else { if (win.isFullScreen()) win.setFullScreen(false); if (win.isSimpleFullScreen()) win.setSimpleFullScreen(false); }
    } else if (next === 'borderless') {
      const d = displayOf(win);
      const w = moveTo(true, d.bounds);
      w.show(); w.focus(); w.setBounds(d.bounds); fitView();
    } else {
      // 全屏、窗口都用有边框的窗口（全屏就是它进系统全屏）；从「全屏窗口」出来要换回有边框的
      let w = win;
      if (w.frameless) { w = moveTo(false); w.show(); w.focus(); }
      if (next === 'fullscreen') w.setFullScreen(true);
      else if (w.isFullScreen()) w.setFullScreen(false);
    }
  } finally {
    mode = next;
    saveMode(); tellPage();
    setTimeout(() => { switching = false; fitView(); if (view) view.webContents.focus(); }, 400);
  }
}
const toggleFull = () => setMode(mode === 'window' ? fullPref : 'window');

function focusWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

/* ---------- 窗口 ---------- */
function createWindow() {
  if (!fs.existsSync(INDEX)) {
    dialog.showErrorBox(TITLE, `找不到 ${INDEX}\n\n先在仓库的 src 目录运行：python build.py --desktop`);
    app.quit();
    return;
  }
  // 上次的画面模式（默认全屏）。2.3 以前只记了 fullscreen: true / false
  const st = readSettings();
  mode = MODES.includes(st.display) ? st.display : st.fullscreen === false ? 'window' : 'fullscreen';
  fullPref = st.full === 'borderless' ? 'borderless' : 'fullscreen';
  if (mode !== 'window') fullPref = mode;
  const b = st.bounds;
  if (b && [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width >= 400 && b.height >= 300) windowBounds = b;

  view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: DEBUG,
      backgroundThrottling: false,      // 切出去时联机照常跑
      spellcheck: false,                // 不然会去网上下拼写词典
    },
  });
  view.setBackgroundColor(BG);
  const wc = view.webContents;

  const borderless = mode === 'borderless' && !MAC;
  const first = makeWindow(borderless, borderless ? screen.getPrimaryDisplay().bounds : null);
  first.contentView.addChildView(view);
  win = first; fitView();
  first.on('close', () => { if (first === win) closingWin = true; });

  let shown = false;
  const show = () => {
    if (shown || !win || win.isDestroyed()) return;
    shown = true;
    switching = true;
    if (mode === 'fullscreen') win.setFullScreen(true);
    else if (mode === 'borderless' && MAC) win.setSimpleFullScreen(true);
    win.show(); win.focus(); wc.focus(); fitView();
    setTimeout(() => { switching = false; fitView(); }, 400);
  };
  wc.once('did-finish-load', show);
  setTimeout(show, 3000);

  // F11、Alt+Enter 切全屏（在主进程拦，游戏页面收不到这两个键）
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key;
    if (k === 'F11' || (k === 'Enter' && input.alt && !input.control && !input.meta)) {
      e.preventDefault();
      if (!input.isAutoRepeat) toggleFull();
      return;
    }
    if (!DEBUG) return;
    if (k === 'F12' || (input.control && input.shift && k.toLowerCase() === 'i')) {
      e.preventDefault();
      wc.toggleDevTools();
    } else if (input.control && !input.shift && k.toLowerCase() === 'r') {
      e.preventDefault();
      wc.reload();
    }
  });

  wc.on('preload-error', (_e, file, err) => console.error('[modou] preload 出错：', file, err));
  wc.on('render-process-gone', (_e, d) => console.error('[modou] 页面进程退出：', d.reason, d.exitCode));
  if (DEBUG) {
    wc.on('console-message', (e, level, message) => {
      const msg = (e && e.message) || message;
      const lv = (e && e.level) || level;
      console.log(`[page:${lv}] ${msg}`);
    });
    wc.once('did-finish-load', () => wc.openDevTools({ mode: 'detach' }));
  }

  wc.loadFile(INDEX);
}

/* ---------- 页面 ⇄ 主进程（只认 app/ 里的页面发来的） ---------- */
function trusted(e) {
  if (!win || win.isDestroyed() || !view || e.sender !== view.webContents) return false;
  const frame = e.senderFrame;
  return !!frame && isAppUrl(frame.url);
}

function registerIpc() {
  ipcMain.on('modou:hello', (e) => {
    e.returnValue = trusted(e)
      ? { version: app.getVersion(), fullscreen: mode !== 'window', display: mode, full: fullPref, steam: steam.state() }
      : null;
  });
  ipcMain.on('modou:quit', (e) => { if (trusted(e)) app.quit(); });
  ipcMain.on('modou:set-fullscreen', (e, on) => { if (trusted(e)) setMode(on ? fullPref : 'window'); });
  ipcMain.on('modou:set-display', (e, m) => { if (trusted(e) && MODES.includes(m)) setMode(m); });
  ipcMain.on('modou:open-external', (e, url) => {
    if (trusted(e) && isWebUrl(url)) shell.openExternal(String(url)).catch(() => {});
  });
  ipcMain.handle('modou:steam-achieve', (e, id) => (trusted(e) ? steam.achieve(id) : false));
}

/* ---------- 启动 ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();                                    // 已经开着一个了：那个会被叫到前台
} else {
  // 下面这些必须在 app ready 之前
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');   // 游戏用 WebAudio
  steam.setup(app);
  if (DEBUG) console.log('[steam] ' + steam.status());
  if (process.platform === 'win32') app.setAppUserModelId('io.github.jax1ng.modou');

  app.on('second-instance', focusWindow);
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (!win && app.isReady()) createWindow(); });     // macOS 点 Dock 图标（窗口全关了才重开）
  app.on('web-contents-created', (_e, wc) => lockDown(wc));

  app.whenReady().then(() => {
    // 没有菜单栏。macOS 例外：没菜单的话 ⌘C/⌘V/⌘Q 都不灵，留一个最小的
    Menu.setApplicationMenu(process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }])
      : null);
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      callback(PERMISSIONS.has(permission) && isAppUrl((details && details.requestingUrl) || wc.getURL()));
    });
    registerIpc();
    createWindow();
  });
}
