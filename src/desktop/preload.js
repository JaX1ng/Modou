'use strict';
/* 游戏页面里的 window.modouDesktop：网页版没有这个对象，游戏代码靠它判断是不是桌面版。
   名字定下来就别改，游戏代码在用。

   window.modouDesktop = {
     isDesktop: true,
     version: '2.1.0',                       // 桌面版版本号（= js/config.js 的 VERSION）
     platform: 'win32' | 'darwin' | 'linux',
     quit(),                                 // 关掉游戏
     setFullscreen(on), isFullscreen(),      // isFullscreen() 同步返回缓存的 true/false
     onFullscreenChange(cb),                 // 全屏变了就 cb(on)（包括按 F11 / Alt+Enter）；返回取消订阅的函数
     openExternal(url),                      // 用系统浏览器打开，只认 http/https；返回是否接受
     steam: {
       ok(),                                 // Steam 连上了没有
       achieve(id),                          // 解锁成就并上传；返回 Promise<boolean>；没连上 Steam 就什么也不做（false）
       personaName(),                        // Steam 昵称；没连上是 ''
     },
   };

   这个文件跑在沙箱里（sandbox: true），只能 require('electron')。 */
const { contextBridge, ipcRenderer } = require('electron');

const hello = ipcRenderer.sendSync('modou:hello') || {};
const steamState = hello.steam || {};
const steamOk = !!steamState.ok;
const steamName = steamOk ? String(steamState.personaName || '') : '';

let fullscreen = !!hello.fullscreen;
const listeners = new Set();
ipcRenderer.on('modou:fullscreen', (_e, on) => {
  fullscreen = !!on;
  for (const cb of Array.from(listeners)) {
    try { cb(fullscreen); } catch (err) { console.error(err); }
  }
});

function isWebUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

contextBridge.exposeInMainWorld('modouDesktop', {
  isDesktop: true,
  version: String(hello.version || ''),
  platform: process.platform,
  quit: () => ipcRenderer.send('modou:quit'),
  setFullscreen: (on) => ipcRenderer.send('modou:set-fullscreen', !!on),
  isFullscreen: () => fullscreen,
  onFullscreenChange: (cb) => {
    if (typeof cb !== 'function') return () => {};
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },
  openExternal: (url) => {
    if (!isWebUrl(url)) return false;
    ipcRenderer.send('modou:open-external', String(url));
    return true;
  },
  steam: {
    ok: () => steamOk,
    achieve: (id) => (steamOk
      ? ipcRenderer.invoke('modou:steam-achieve', String(id)).then((r) => !!r, () => false)
      : Promise.resolve(false)),
    personaName: () => steamName,
  },
});
