'use strict';
/* 墨斗桌面版主进程：开窗口、全屏、游戏页面能用的接口（见 preload.js）、可选的 Steam。
   游戏本身是 app/index.html，由 python build.py --desktop 生成，和网页版是同一份代码。

   调试：设环境变量 MODOU_DEBUG=1 再启动，才有开发者工具（F12 / Ctrl+Shift+I）和 Ctrl+R 刷新。 */
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
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

let win = null;

/* ---------- 设置：userData/settings.json（现在只记全屏） ---------- */
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

/* ---------- 全屏 ---------- */
function setFullscreen(on) {
  if (!win || win.isDestroyed()) return;
  if (win.isFullScreen() !== on) win.setFullScreen(on);
}

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
  const startFull = readSettings().fullscreen !== false;     // 默认全屏，之后记住玩家上次的选择
  win = new BrowserWindow({
    title: TITLE,
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    useContentSize: true,
    backgroundColor: BG,
    show: false,
    autoHideMenuBar: true,
    // 只在要全屏时才传 fullscreen：显式传 false 在 macOS 上会把全屏按钮禁掉
    ...(startFull ? { fullscreen: true } : {}),
    ...(process.platform === 'linux' ? { icon: path.join(__dirname, 'build', 'icon.png') } : {}),
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
  const wc = win.webContents;

  win.on('page-title-updated', (e) => e.preventDefault());
  win.once('ready-to-show', () => win.show());
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 3000);

  let closing = false;
  let lastFs = null;
  const onFullscreen = (on) => {
    if (closing || !win || win.isDestroyed() || on === lastFs) return;
    lastFs = on;
    writeSettings({ fullscreen: on });
    wc.send('modou:fullscreen', on);
  };
  win.on('enter-full-screen', () => onFullscreen(true));
  win.on('leave-full-screen', () => onFullscreen(false));
  win.on('close', () => { closing = true; });
  win.on('closed', () => { win = null; });

  // F11、Alt+Enter 切全屏（在主进程拦，游戏页面收不到这两个键）
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key;
    if (k === 'F11' || (k === 'Enter' && input.alt && !input.control && !input.meta)) {
      e.preventDefault();
      if (!input.isAutoRepeat) setFullscreen(!win.isFullScreen());
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

  win.loadFile(INDEX);
}

/* ---------- 页面 ⇄ 主进程（只认 app/ 里的页面发来的） ---------- */
function trusted(e) {
  if (!win || win.isDestroyed() || e.sender !== win.webContents) return false;
  const frame = e.senderFrame;
  return !!frame && isAppUrl(frame.url);
}

function registerIpc() {
  ipcMain.on('modou:hello', (e) => {
    e.returnValue = trusted(e)
      ? { version: app.getVersion(), fullscreen: win.isFullScreen(), steam: steam.state() }
      : null;
  });
  ipcMain.on('modou:quit', (e) => { if (trusted(e)) app.quit(); });
  ipcMain.on('modou:set-fullscreen', (e, on) => { if (trusted(e)) setFullscreen(!!on); });
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
  app.on('activate', () => { if (!win && app.isReady()) createWindow(); });     // macOS 点 Dock 图标
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
