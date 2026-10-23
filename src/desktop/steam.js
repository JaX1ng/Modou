'use strict';
/* Steam 支持（可选）。
   steamworks.js 装上了、配了 App ID、Steam 开着 → 成就、昵称能用；
   缺哪一样都照常玩，只是 modouDesktop.steam.ok() 为 false。这里任何错误都不往外抛。

   App ID 从哪来（按顺序找）：
     1. desktop/steam.json 的 appId（会打进安装包，正式发布用这个）
     2. exe 旁边的 steam_appid.txt（本地测试用，比如写 480）；npm start 时也看 desktop 目录
     3. 从 Steam 启动时 Steam 给的环境变量 SteamAppId */
const fs = require('node:fs');
const path = require('node:path');

const ACH_ID = /^[A-Za-z0-9_]{1,128}$/;

let sw = null;            // steamworks.js 模块
let client = null;        // init() 返回的接口；null = 没连上 Steam
let personaName = '';
let status = '还没初始化';

const log = (...a) => console.log('[steam]', ...a);

function parseAppId(v) {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function findAppId(app) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'steam.json'), 'utf8'));
    const id = parseAppId(cfg && cfg.appId);
    if (id) return { id, from: 'steam.json' };
  } catch (e) { /* 没有或写错都当没配 */ }
  const dirs = [path.dirname(process.execPath)];
  if (!app.isPackaged) dirs.push(process.cwd());
  for (const dir of dirs) {
    const file = path.join(dir, 'steam_appid.txt');
    try {
      const id = parseAppId(fs.readFileSync(file, 'utf8'));
      if (id) return { id, from: file };
    } catch (e) { /* 没有这个文件 */ }
  }
  const id = parseAppId(process.env.SteamAppId);
  return id ? { id, from: '环境变量 SteamAppId' } : null;
}

const launchedBySteam = () => !!(process.env.SteamAppId || process.env.SteamGameId);

/** 在 app ready 之前调用（Steam 界面叠加要在 ready 前加启动参数）。 */
function setup(app) {
  try {
    sw = require('steamworks.js');
  } catch (e) {
    status = '没有 steamworks.js：' + e.message;
    return;
  }
  if (launchedBySteam()) {
    try { sw.electronEnableSteamOverlay(); } catch (e) { log('开 Steam 界面叠加失败：' + e.message); }
  }
  const found = findAppId(app);
  if (!found) {
    status = '没配置 App ID（desktop/steam.json 里 appId 是 null）';
    return;
  }
  try {
    client = sw.init(found.id);
  } catch (e) {
    client = null;
    status = `Steam 没连上（Steam 没开？）App ID ${found.id}：${e.message}`;
    return;
  }
  try { personaName = String(client.localplayer.getName() || ''); } catch (e) { personaName = ''; }
  status = `已连上 Steam，App ID ${found.id}（来自 ${found.from}）`;
}

/** 解锁成就并上传。没连上 Steam、名字不对、Steam 那边没这个成就 → false。 */
function achieve(id) {
  if (!client || typeof id !== 'string' || !ACH_ID.test(id)) return false;
  try {
    const ok = client.achievement.activate(id);
    try { client.stats.store(); } catch (e) { /* activate 自己也会存，这里只是保险 */ }
    return !!ok;
  } catch (e) {
    log(`解锁成就 ${id} 失败：${e.message}`);
    return false;
  }
}

function state() {
  return { ok: !!client, personaName: client ? personaName : '' };
}

module.exports = { setup, achieve, state, status: () => status };
