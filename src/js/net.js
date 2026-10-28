'use strict';
/* P2P 联机（1.9.0 重做）
   连接两种：
     ① 房间码（默认）：两边输入同一个房间码，经公共信令（Trystero，走公共 Nostr 中继，只交换连接信息）找到对方，
        之后 WebRTC 点对点直连，游戏数据不经过任何服务器。网址 #房间码 就是邀请链接。掉线后同一个人回来自动续上。
     ② 手动（备用）：复制粘贴连接码（以前的做法，连信令也不用）。
   同步：回滚帧同步（rollback）。两边各跑一份同样的游戏，每帧只互传输入。本机输入只延后 1~3 帧；对方的输入还没到，
        就先「猜」（照他上一帧按住的方向 / 格挡，不猜新按的招）往下算；真的输入到了、猜错了，回到那一帧用真的重算
        （重算时不出特效、不出声）。对方网络卡得太久（超过 MAX_PRED 帧没消息）才停下来等。
   传输：输入走「不保证顺序、不重传」的通道（丢了靠下一包补上），二进制小包：每包带上对方还没确认收到的那几帧（一般 2~6 帧、
        二三十字节；以前是 JSON、每包固定 16 帧、一百多字节）。
   中继（TURN，可选）：有的网络（防火墙、对称型 NAT）不让两台设备直接连，填一个 TURN 中继，连不上直连时数据经中继转发。
        手动连接时连接码带上房主的中继；用房间码时邀请链接带上房主的中继（对方不用自己填）。 */

/* ---------- 中继设置 ---------- */
const Relay = {
  list: [],            // RTCIceServer 数组（含 TURN 账号）
  load() {
    try { const v = JSON.parse(localStorage.getItem('modou.relay') || '[]'); this.list = Array.isArray(v) ? v : []; } catch (e) { this.list = []; }
    return this.list;
  },
  save(list) { this.list = list || []; try { localStorage.setItem('modou.relay', JSON.stringify(this.list)); } catch (e) {} },
};
const isTurn = s => [].concat(s.urls).some(u => /^turns?:/i.test(u));
const hasTurn = list => (list || []).some(isTurn);
// 把用户粘进来的东西变成 iceServers 数组。支持：
//   ① JSON 数组 / 对象（{ iceServers: [...] } 也行）
//   ② JS 写法的数组（键没加引号、单引号、末尾逗号 —— Metered 后台复制出来的就是这种）
//   ③ 每行一个：turn:地址:端口 用户名 密码
function parseRelay(text) {
  text = String(text || '').trim();
  if (!text) return [];
  let v;
  const i = text.search(/[\[{]/);
  if (i >= 0) {
    let body = text.slice(i);
    body = body.slice(0, Math.max(body.lastIndexOf(']'), body.lastIndexOf('}')) + 1);
    try { v = JSON.parse(body); }
    catch (e) { try { v = JSON.parse(jsToJson(body)); } catch (e2) { v = undefined; } }
    if (v && !Array.isArray(v) && v.iceServers) v = v.iceServers;
    if (v && !Array.isArray(v)) v = [v];
  }
  if (!v) {                                     // ③ 按行
    v = text.split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => {
      const [urls, username, credential] = l.split(/[\s,，]+/);
      return username ? { urls, username, credential } : { urls };
    });
  }
  const out = [];
  for (const s of v) {
    if (!s || typeof s !== 'object' || !s.urls) continue;
    const urls = [].concat(s.urls).map(String).filter(u => /^(stun|turns?):/i.test(u));
    if (!urls.length) continue;
    const o = { urls: urls.length === 1 ? urls[0] : urls };
    if (s.username != null) o.username = String(s.username);
    if (s.credential != null) o.credential = String(s.credential);
    if (isTurn(o) && (!o.username || !o.credential)) throw new Error('TURN 地址 ' + urls[0] + ' 缺用户名或密码');
    out.push(o);
  }
  if (!out.length) throw new Error('没看懂：请粘贴中继后台给的 ICE 数组，或者每行「turn:地址:端口 用户名 密码」');
  if (!hasTurn(out)) throw new Error('里面只有 STUN，没有 TURN 中继地址');
  return out;
}
// JS 写法 → JSON：字符串原样保留（密码里有冒号逗号也不怕），只在字符串外面给键加引号、去掉末尾逗号和注释
function jsToJson(body) {
  let out = '', seg = '', i = 0;
  const flush = () => { out += seg.replace(/\/\/[^\n]*/g, '').replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,(\s*[}\]])/g, '$1'); seg = ''; };
  while (i < body.length) {
    const q = body[i];
    if (q === '"' || q === "'" || q === '`') {
      flush();
      let j = i + 1, str = '';
      while (j < body.length && body[j] !== q) { if (body[j] === '\\') { str += body[j + 1]; j += 2; } else str += body[j++]; }
      out += JSON.stringify(str); i = j + 1;
    } else seg += body[i++];
  }
  flush();
  return out;
}
// 粘的是 Metered 的 API 链接（…metered.live/api/v1/turn/credentials?apiKey=…）就去取一次，存下取到的数组
async function resolveRelay(text) {
  const t = String(text || '').trim();
  if (/^https?:\/\//i.test(t)) {
    let r;
    try { r = await fetch(t); } catch (e) { throw new Error('打不开这个链接（网络不通或链接不对）'); }
    if (!r.ok) throw new Error('链接返回错误 ' + r.status + '（apiKey 对吗？）');
    return parseRelay(await r.text());
  }
  return parseRelay(t);
}
function mergeIce(...lists) {
  const seen = new Set(), out = [];
  for (const l of lists) for (const s of l || []) {
    const k = JSON.stringify([s.urls, s.username || '']);
    if (!seen.has(k)) { seen.add(k); out.push(s); }
  }
  return out;
}
// 测中继：只用中继去收集地址，拿到一个中继地址就说明账号能用
function testRelay(list, ms) {
  return new Promise(res => {
    let pc, done = false;
    const end = (ok, why, auth) => { if (done) return; done = true; clearTimeout(timer); try { pc.close(); } catch (e) {} res({ ok, why, auth: !!auth, ms: Math.round(performance.now() - t0) }); };
    const t0 = performance.now();
    const timer = setTimeout(() => end(false, '超时：中继没有回应（地址、用户名或密码不对，或者被网络挡了）'), ms || 7000);
    try {
      pc = new RTCPeerConnection({ iceServers: list, iceTransportPolicy: 'relay' });
      pc.createDataChannel('t');
      pc.onicecandidate = e => { if (e.candidate && / typ relay /.test(e.candidate.candidate)) end(true); else if (!e.candidate) end(false, '中继没给地址（多半是用户名或密码不对）'); };
      // 401 = 中继说账号不对，马上报；别的错（某个端口不通）先不管，可能别的地址能通
      pc.onicecandidateerror = e => { if (e.errorCode === 401) end(false, '用户名或密码不对（中继拒绝了）', true); };
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(e => end(false, String(e.message || e)));
    } catch (e) { end(false, String(e.message || e)); }
  });
}
Relay.load();


/* ---------- 联机选色（1.7.0）----------
   房主说了算：房主选自己的；加入方把想要的颜色发给房主，和房主撞了就保持原来的（或者给第一个没人用的）。
   房主每次定下来都把两边的颜色（h 房主、g 加入方）发给对方，界面上对方的颜色变暗、点不了。开局时 start 消息里再带一遍 */
function settleLook(host, want, cur) {
  for (const c of [want, cur]) if (c && c !== host && lookOf(c)) return c;
  return PALETTE.find(p => p.id !== host).id;
}

/* ---------- 输入包（二进制，1.9.0） ----------
   [0] 类型 1 = 输入   [1] 局号 epoch & 255   [2..5] 这包第一帧的帧号   [6..9] 我已经连续收到你的输入到第几帧（不含）
   [10] 帧数 n（≤ 48）   [11] 我觉得我比你快几帧（-128~127，时间同步用）
   [12..] 每帧一个输入，2 字节（低 5 位按住、往上 5 位新按下，见 input.js） */
// 2.6 逻辑一秒 240 步：「帧号」都是步数，一包最多带 PKT_MAX 步（以前 48 帧）；一秒发 60 包左右（每 SUB 步发一次）
const PKT_INPUT = 1, PKT_MAX = 192, PKT_HEAD = 12;
function encodeInputs(epoch, first, ack, vals, adv) {
  const n = vals.length, buf = new ArrayBuffer(PKT_HEAD + 2 * n), dv = new DataView(buf);
  dv.setUint8(0, PKT_INPUT); dv.setUint8(1, epoch & 255); dv.setUint32(2, first); dv.setUint32(6, ack); dv.setUint8(10, n);
  dv.setInt8(11, Math.max(-128, Math.min(127, Math.round(adv || 0))));
  for (let i = 0; i < n; i++) dv.setUint16(PKT_HEAD + 2 * i, vals[i] & 0xffff);
  return buf;
}
function decodeInputs(buf) {
  if (!(buf instanceof ArrayBuffer) || buf.byteLength < PKT_HEAD) return null;
  const dv = new DataView(buf), n = dv.getUint8(10);
  if (dv.getUint8(0) !== PKT_INPUT || buf.byteLength < PKT_HEAD + 2 * n) return null;
  const vals = new Array(n);
  for (let i = 0; i < n; i++) vals[i] = dv.getUint16(PKT_HEAD + 2 * i);
  return { epoch: dv.getUint8(1), first: dv.getUint32(2), ack: dv.getUint32(6), adv: dv.getInt8(11), vals };
}

/* ---------- 回滚帧同步的核心（不碰网络，tests.js 直接拿来测） ---------- */
// HELD_MASK（输入里「按住」的那几位：猜对方的输入只猜这几位，新按的招不猜）在 input.js
class Rollback {
  // role：'host' 算 step([本机, 对方])，'guest' 算 step([对方, 本机])
  constructor(delay, role) {
    this.delay = delay; this.role = role;
    this.frame = 0;                                // 下一帧要算第几帧
    this.local = new Map(); this.localUntil = 0;   // 本机输入（已经采到第几帧，不含）
    this.remote = new Map(); this.remoteUntil = delay;   // 对方的输入：连续收到第几帧（不含）。前 delay 帧两边都是 0
    for (let f = 0; f < delay; f++) this.remote.set(f, 0);
    this.used = new Map();                         // 算每一帧时用的对方输入（真的或猜的）
    this.snaps = new Map();                        // 算这一帧之前的存档（只给还没确认的帧存）
    this.hashAt = new Map();                       // 算到第几帧时的状态指纹（核对用）
    this.rollFrom = -1;                            // 最早猜错的那一帧
    this.ack = 0;                                  // 对方已经连续收到我的输入到第几帧（不含）
    this.lastRemote = -1;                          // 收到过的对方输入里最新的一帧（时间同步用）
    this.remoteAdv = 0;                            // 对方觉得他比我快几帧（他包里带的）
    this.stats = { rollbacks: 0, frames: 0, maxDepth: 0 };
  }
  // 本机输入：把第 frame + delay 帧（含）以前还没采的都采上（前 delay 帧是 0）
  sample(read) { while (this.localUntil <= this.frame + this.delay) { this.local.set(this.localUntil, this.localUntil < this.delay ? 0 : read(this.localUntil)); this.localUntil++; } }
  predict() { return (this.remote.get(this.remoteUntil - 1) | 0) & HELD_MASK; }
  // 收到对方第 first 帧起的一串输入
  receive(first, vals, adv) {
    if (vals.length && first + vals.length - 1 > this.lastRemote && adv !== undefined) this.remoteAdv = adv;   // 只认最新那包的
    for (let i = 0; i < vals.length; i++) {
      const f = first + i, v = vals[i];
      if (f < this.remoteUntil || this.remote.has(f)) continue;
      this.remote.set(f, v);
      if (f < this.frame && this.used.get(f) !== v && (this.rollFrom < 0 || f < this.rollFrom)) this.rollFrom = f;   // 已经按猜的算过了，猜错了
    }
    if (vals.length) this.lastRemote = Math.max(this.lastRemote, first + vals.length - 1);
    while (this.remote.has(this.remoteUntil)) this.remoteUntil++;
  }
  // 回滚：回到最早猜错的那一帧，用真的输入重算到现在（重算时特效、声音先攒着，算完只补放新多出来的，见 fx.js FXREC）。返回重算了几帧
  rollback() {
    if (this.rollFrom < 0) return 0;
    const from = this.rollFrom; this.rollFrom = -1;
    if (from >= this.frame) return 0;
    const s = this.snaps.get(from);
    if (!s) throw new Error('回滚找不到第 ' + from + ' 帧的存档');
    loadState(s);
    const end = this.frame, g0 = game.frame; this.frame = from;
    game.quiet = true; fxRollStart();
    try { while (this.frame < end) this.advance(); } finally { game.quiet = false; fxRollEnd(g0, game.frame); }
    const depth = end - from;
    this.stats.rollbacks++; this.stats.frames += depth; this.stats.maxDepth = Math.max(this.stats.maxDepth, depth);
    return depth;
  }
  // 还能不能往下算：对方的输入落后太多（超过 MAX_PRED 帧）就停下来等
  canAdvance() { return this.frame - this.remoteUntil < NET.MAX_PRED * SUB && this.localUntil > this.frame; }
  // 算一帧
  advance() {
    const f = this.frame;
    if (f >= this.remoteUntil) this.snaps.set(f, saveState());     // 前面还有没到的帧：存个档，万一要回滚
    // 这一帧对方的输入到了就用真的（包可能乱序先到，前面还缺几帧也一样），没到才猜
    const r = this.remote.has(f) ? this.remote.get(f) : this.predict();
    this.used.set(f, r);
    const l = this.local.get(f) | 0;
    simTick(this.role === 'host' ? [l, r] : [r, l]);
    this.frame = f + 1;
    if (this.frame % (NET.HASH_EVERY * SUB) === 0) this.hashAt.set(this.frame, stateHash());
  }
  // 我觉得我比对方快几帧：我的帧号 - 对方发最新那包时的帧号（含单程延迟，两边一样多）
  localAdv() { return this.lastRemote < 0 ? 0 : this.frame - (this.lastRemote - this.delay); }
  // 时间同步（GGPO 的做法）：两边的「我觉得我快几帧」都含着一样的网络延迟，相减再除以二，延迟抵消，剩下的就是真的差几帧
  timeSync() { return (this.localAdv() - this.remoteAdv) / 2; }
  // 要发给对方的本机输入：对方还没确认的那几帧（最多 PKT_MAX 帧）
  outgoing() {
    const last = this.localUntil - 1, from = Math.max(this.delay, this.ack, last - PKT_MAX + 1);
    const vals = [];
    for (let f = from; f <= last; f++) vals.push(this.local.get(f) | 0);
    return { first: from, vals };
  }
  // 两边输入都定了的状态指纹（拿去和对方核对）
  takeHashes() {
    const out = [], lim = Math.min(this.remoteUntil, this.frame);
    for (const [f, h] of this.hashAt) if (f <= lim) { out.push([f, h]); this.hashAt.delete(f); }
    return out;
  }
  // 扔掉用不着的旧数据
  prune() {
    const conf = Math.min(this.remoteUntil, this.frame);
    for (const k of this.snaps.keys()) if (k < conf) this.snaps.delete(k);
    for (const k of this.used.keys()) if (k < conf) this.used.delete(k);
    for (const k of this.remote.keys()) if (k < conf - 1) this.remote.delete(k);
    const lk = Math.min(this.ack, conf);
    for (const k of this.local.keys()) if (k < lk) this.local.delete(k);
  }
}

/* ---------- 房间码、邀请链接 ---------- */
// 自己指定信令中继（调试用；或者默认的公共中继都连不上时）：浏览器 localStorage「modou.signal」= ["wss://…", …]。
// 注意 Trystero 一个页面只在第一次进房间时连信令中继，之后改了要刷新页面
function signalOverride() {
  try { const v = JSON.parse(localStorage.getItem('modou.signal') || 'null'); return Array.isArray(v) && v.length ? v.map(String) : null; } catch (e) { return null; }
}
// 房间码：去掉空白，英文字母不分大小写，最多 24 个字
const normCode = s => String(s || '').replace(/\s+/g, '').toLowerCase().slice(0, 24);
// 邀请链接 = 网址#房间码；房主填了中继就带上（&r=压缩后的中继），对方点开就连、不用自己填
// 2.1 软件版（Steam）里的网址是本地文件，邀请链接改用网页版的网址：对方点开在浏览器里进同一个房间（网页版、软件版能一起玩）
const WEB_URL = 'https://jax1ng.github.io/Modou/';
async function inviteLink(code, relay) {
  const base = window.modouDesktop ? WEB_URL : location.href.split('#')[0];
  let h = '#' + encodeURIComponent(code);
  if (relay && relay.length) h += '&r=' + (await packJson(relay));
  return base + h;
}
async function parseInvite(hash) {
  const parts = String(hash || '').replace(/^#/, '').split('&');
  const code = normCode(decodeURIComponent(parts[0] || ''));
  let relay = null;
  for (const p of parts.slice(1)) if (p.startsWith('r=')) { try { const v = await unpackJson(p.slice(2)); if (Array.isArray(v) && hasTurn(v)) relay = v; } catch (e) {} }
  return { code, relay };
}
async function packJson(v) {
  const json = JSON.stringify(v);
  if (typeof CompressionStream !== 'undefined') {
    const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
    return 'z' + b64u(new Uint8Array(buf));
  }
  return 'p' + b64u(new TextEncoder().encode(json));
}
async function unpackJson(s) {
  const bytes = unb64u(s.slice(1));
  const json = s[0] === 'z' ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text() : new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

// 房间码联机时，两条通道开在 Trystero 连好的连接上。Trystero 会在同一个应用里复用连接（换个房间又回来、短暂掉线），
// 连接还在的话原来那两条通道也还在：接着用（关掉再开同一个编号会撞车），连接换了新的才开新的
const CHANNELS = new WeakMap();

const Net = {
  pc: null, ctl: null, inCh: null, role: null, via: '', relayUsed: [], peerVersion: '', lastDiag: '',
  linked: false,             // 两条通道都开了
  open: false,               // 两边互相打过招呼（hello）了：可以选色、开打
  rtt: 0, delay: 2, epoch: 0, pingTimer: 0,
  rb: null, acc: 0, stall: 0, adv: 0, holdN: 0,
  hashes: new Map(), desync: false, hashChecks: 0,
  looks: { h: 'ink', g: 'indigo' },
  styles: { h: 'trad', g: 'trad' },   // 2.9 两边的拳派：各选各的（每边自己说了算，开打的 start 里房主把两边的一起发过去，两边按同一份开打）
  // 房间码联机（1.9.0）
  room: null, code: '', peerId: null, linkRelay: null, reconnecting: false, reconnectUntil: 0, lostAt: 0, kind: '',
  busy: null, busyIds: new Set(), versionBad: false,
  // 界面回调（ui.js 设置）
  onOpen() {}, onClose() {}, onStatus() {}, onLooks() {}, onRoom() {},

  supported() { return typeof RTCPeerConnection !== 'undefined'; },
  embedded() { try { return window.self !== window.top; } catch (e) { return true; } },
  roomSupported() { return typeof Trystero !== 'undefined' && !!Trystero.joinRoom; },

  // 断开当前连接（不退房间）。房间码联机的通道不关，只是不再听它（连接归 Trystero 管，可能还会复用）
  reset() {
    clearInterval(this.pingTimer); clearTimeout(this.connTimer); clearTimeout(this.lostTimer);
    this.detach();
    if (this.pc && this.kind === 'manual') { try { this.pc.close(); } catch (e) {} }
    this.pc = null; this.linked = this.open = false; this.rtt = 0; this.role = null; this.via = '';
    this.reconnecting = false; this.rb = null;
  },
  detach() {
    for (const ch of [this.ctl, this.inCh]) if (ch) ch.onmessage = ch.onopen = ch.onclose = null;
    this.ctl = this.inCh = null; this.linked = false;
  },
  // 退出（房间也退）
  leaveAll() { this.reset(); this.leaveRoom(); this.peerId = null; this.kind = ''; },
  leaveRoom() { if (this.room) { try { this.room.leave(); } catch (e) {} this.room = null; } this.code = ''; this.busy = null; this.busyIds.clear(); },
  // 新配对之前：清掉上一次的版本、颜色
  pairStart(role) {
    this.role = role; this.versionBad = false; this.peerVersion = '';
    this.looks = { h: role === 'host' ? Looks.solo.me : null, g: null };
    this.styles = { h: 'trad', g: 'trad' }; this.styles[role === 'host' ? 'h' : 'g'] = Styles.solo.me;
    if (role === 'host') Stage.online = Stage.pref;               // 2.0 场景：房主先用自己菜单里选的那张，大厅里还能换
  },

  /* ---------- ① 房间码 ---------- */
  joinCode(code) {
    code = normCode(code);
    if (!code) throw new Error('先输入一个房间码（两边要一样）');
    if (!this.roomSupported()) throw new Error('这个文件里没有房间码联机的组件，请用下面的「手动连接」');
    this.leaveAll();
    this.kind = 'room'; this.code = code;
    this.relayUsed = mergeIce(Relay.list, this.linkRelay);
    const ice = mergeIce(NET.ICE, this.relayUsed);
    const relayConfig = { warnOnRelayFailure: false, redundancy: NET.SIGNAL_N }, urls = NET.SIGNAL_URLS || signalOverride();
    if (urls) relayConfig.urls = urls;
    this.room = Trystero.joinRoom({ appId: NET.APP_ID, rtcConfig: { iceServers: ice }, relayConfig }, 'room:' + code, {
      onJoinError: d => { this.lastDiag = d && d.error ? String(d.error.message || d.error) : ''; this.onRoom('error'); },
      // 连上以后 Trystero 两边要互相「握手」一下。偶尔一边的握手消息来得太早被丢掉，要等超时重来（默认 10 秒）：
      // 握手只是直连上来回一两条消息，正常一秒都不用，所以等 4 秒就重来，配对卡住时快一点
      handshakeTimeoutMs: NET.HANDSHAKE_WAIT,
    });
    // 房间里已经有两个人在打了：告诉后来的人「满了」
    this.busy = this.room.makeAction('busy', { onMessage: (d, meta) => this.gotBusy(meta && meta.peerId) });
    this.room.onPeerJoin = id => this.peerJoined(id);
    this.room.onPeerLeave = id => this.peerLeft(id);
    this.onRoom('waiting');
    return code;
  },
  peerJoined(id) {
    if (this.kind !== 'room' || !this.room || this.busyIds.has(id)) return;
    if (this.peerId && id !== this.peerId) {                  // 已经和别人配上了：第三个人进来，告诉他满了（等掉线的人回来时先不理他）
      if (this.busy && !this.reconnecting) this.busy.send(1, { target: id }).catch(() => {});
      return;
    }
    if (this.peerId === id && this.open) return;               // 同一个人重复通知：已经连着了
    const pc = this.room.getPeers()[id];
    if (!pc) return;
    const again = this.peerId === id && this.reconnecting;     // 掉线后同一个人回来了：接着打
    this.detach();
    this.peerId = id; this.pc = pc; this.open = false;
    const role = Trystero.selfId < id ? 'host' : 'guest';       // 两边算出来一样：id 小的当房主
    if (again) this.role = role; else this.pairStart(role);
    this.openChannels(pc, 0);
    if (again) this.onRoom('rejoining');
  },
  // 在 Trystero 连好的连接上开两条约定好编号的通道（两边各开各的，不用再协商）：ctl 可靠有序，in 不保证顺序、不重传
  openChannels(pc, tries) {
    if (this.pc !== pc || this.kind !== 'room') return;
    const c = CHANNELS.get(pc) || {};
    const live = ch => ch && (ch.readyState === 'open' || ch.readyState === 'connecting');
    try {
      if (!live(c.ctl)) c.ctl = pc.createDataChannel('ctl', { negotiated: true, id: 66, ordered: true });
      if (!live(c.in)) c.in = pc.createDataChannel('in', { negotiated: true, id: 67, ordered: false, maxRetransmits: 0 });
    } catch (e) {                                              // 上一次的同号通道还没关完：等一下再开
      CHANNELS.set(pc, c);
      if (tries < 16) setTimeout(() => this.openChannels(pc, tries + 1), 250);
      return;
    }
    CHANNELS.set(pc, c);
    this.wire(c.ctl); this.wire(c.in);
  },
  gotBusy(id) {
    if (!id || this.kind !== 'room') return;
    this.busyIds.add(id);
    if (id !== this.peerId || this.open) return;
    this.detach(); this.peerId = null; this.pc = null;
    // 房间里还有别人（没说满的）就换他；都满了就退出来
    const other = this.room && Object.keys(this.room.getPeers()).find(p => !this.busyIds.has(p));
    if (other) this.peerJoined(other);
    else { this.leaveAll(); this.onRoom('busy'); }
  },
  peerLeft(id) {
    if (id !== this.peerId) return;
    this.linkLost();
  },
  // 连接断了：对局中就等对方回来（同一个人重新连上就接着打）；还没开打就回到「等对方」
  linkLost() {
    if (this.kind !== 'room') return this.closed();
    const wasOpen = this.open;
    this.open = false; clearInterval(this.pingTimer); this.detach();
    if (game.mode === 'online' && this.rb) {
      if (!this.reconnecting) {
        this.reconnecting = true; this.lostAt = performance.now(); this.reconnectUntil = this.lostAt + NET.RECONNECT_WAIT;
        clearTimeout(this.lostTimer);
        this.lostTimer = setTimeout(() => { if (this.reconnecting) { this.reconnecting = false; this.peerId = null; this.closed(true); } }, NET.RECONNECT_WAIT);
        this.onStatus();
      }
      return;
    }
    this.peerId = null; this.pc = null;
    if (wasOpen) this.onClose(true, true);                       // 大厅里对方走了：留在房间里接着等
    this.onRoom('waiting');
  },

  /* ---------- ② 手动连接（复制粘贴连接码） ---------- */
  newPc(extra, role) {
    this.leaveAll();
    this.kind = 'manual'; this.pairStart(role);
    this.relayUsed = mergeIce(Relay.list, extra);
    const pc = this.pc = new RTCPeerConnection({ iceServers: mergeIce(NET.ICE, this.relayUsed) });
    // 只认当前这个连接的事件：之前建过的连接被关掉时发来的通知，不能把新连接也关了
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      const s = pc.connectionState;
      // 加入方生成应答码后要等房主粘贴（微信传过去常常要几十秒）。这期间浏览器试连房主的中继会被挡
      // （房主还不认识你），十几秒就报「失败」—— 不能就此放弃，房主一点「连接」，他那边连过来就通了
      if (!this.open && this.role === 'guest' && s === 'failed') return;
      if (s === 'failed' || s === 'closed' || (s === 'disconnected' && this.open)) this.closed();
    };
  },
  // 房主：生成连接码
  async host() {
    this.newPc(null, 'host');
    this.wire(this.pc.createDataChannel('ctl', { ordered: true }));
    this.wire(this.pc.createDataChannel('in', { ordered: false, maxRetransmits: 0 }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await waitIce(this.pc, hasTurn(this.relayUsed));
    return packDesc(this.pc.localDescription, this.relayUsed);    // 连接码带上中继，对方不用自己填
  },
  // 加入方：吃连接码，生成应答码
  async join(code) {
    const { relay, version, ...desc } = await unpackDesc(code);
    if (desc.type !== 'offer') throw new Error('这是应答码，不是连接码');
    checkVersion(version, '房主');
    this.newPc(relay, 'guest'); this.peerVersion = version;
    this.pc.ondatachannel = e => this.wire(e.channel);
    await this.pc.setRemoteDescription(desc);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await waitIce(this.pc, hasTurn(this.relayUsed));
    // 等房主粘贴应答码、点「连接」。等太久（房主可能走了）就算了，提示重来
    const pc = this.pc;
    clearTimeout(this.connTimer);
    this.connTimer = setTimeout(() => { if (this.pc === pc && !this.open) { this.waitedOut = true; this.closed(); } }, NET.GUEST_WAIT);
    return packDesc(this.pc.localDescription);
  },
  // 房主：吃应答码，开始连接
  async finish(code) {
    const { relay, version, ...desc } = await unpackDesc(code);
    if (desc.type !== 'answer') throw new Error('这是连接码，不是应答码');
    checkVersion(version, '对方');
    if (!this.pc || this.role !== 'host' || this.kind !== 'manual') throw new Error('先点「我来建房」');
    if (this.pc.signalingState === 'stable') throw new Error('已经点过「连接」了，正在连，稍等一下（最多 20 秒）');
    this.peerVersion = version;
    const pc = this.pc;
    clearTimeout(this.connTimer);
    this.connTimer = setTimeout(() => { if (this.pc === pc && !this.open) this.closed(); }, NET.CONNECT_WAIT);
    await this.pc.setRemoteDescription(desc);
  },

  /* ---------- 通道 ---------- */
  wire(ch) {
    const pc = this.pc;
    ch.binaryType = 'arraybuffer';
    if (ch.label === 'ctl') { this.ctl = ch; ch.onmessage = e => { try { this.onCtl(JSON.parse(e.data)); } catch (err) {} }; }
    else { this.inCh = ch; ch.onmessage = e => this.onIn(e.data); }
    ch.onopen = () => { if (this.pc === pc) this.checkOpen(); };
    ch.onclose = () => { if (this.pc === pc && (this.ctl === ch || this.inCh === ch)) { if (this.kind === 'room') this.linkLost(); else this.closed(); } };
    if (ch.readyState === 'open') setTimeout(() => { if (this.pc === pc) this.checkOpen(); }, 0);
  },
  // 连不上时看看两边各拿到了哪几类地址，告诉用户卡在哪
  diagnose() {
    const pc = this.pc;
    if (!pc || this.kind !== 'manual') return '';
    const kinds = sdp => ({ relay: / typ relay/.test(sdp || ''), srflx: / typ srflx/.test(sdp || ''), host: / typ host/.test(sdp || '') });
    const L = kinds(pc.localDescription && pc.localDescription.sdp), R = kinds(pc.remoteDescription && pc.remoteDescription.sdp);
    const say = k => [k.relay ? '中继' : '', k.srflx ? '公网' : '', k.host ? '本机' : ''].filter(Boolean).join('、') || '没有';
    let tip = '';
    if (!R.relay && !L.relay) tip = '两边都没有中继地址。';
    else if (!R.relay) tip = '对方没拿到中继地址：' + (this.peerVersion ? '对方那边连不上中继服务器（换个网络试试）。' : '对方多半用的是旧版本，让他换成新的 modou.html。');
    else if (!L.relay) tip = '你这边没拿到中继地址：中继服务器连不上，点「保存并测试」看看。';
    else tip = '两边都有中继地址还是没通：中继额度用完了，或者凭据刚建还没生效（等两分钟再试）。';
    return `你这边：${say(L)}；对方：${say(R)}。${tip}`;
  },
  // 两条通道都开了：开始打招呼。房间码联机时两边各自开通道，对方那条可能还没开、头几条消息会丢，所以 hello 每半秒重发，直到收到对方的
  checkOpen() {
    if (this.linked || !this.ctl || !this.inCh || this.ctl.readyState !== 'open' || this.inCh.readyState !== 'open') return;
    this.linked = true;
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => { this.sendCtl({ t: 'ping', ts: performance.now() }); if (!this.open) this.sendHello(); this.route(); }, 500);
    this.sendHello();
    this.sendCtl({ t: 'ping', ts: performance.now() });
    this.route();
  },
  // got：我已经收到你的 hello 了（你就不用再回）；want：加入方想要的颜色
  sendHello() { this.sendCtl({ t: 'hello', v: VERSION, got: this.open, want: this.role === 'guest' ? Looks.solo.me : undefined }); },
  // 两边都打过招呼：连上了
  linkUp(m) {
    if (this.reconnecting) {                                    // 掉线后续上了：接着打，把对方还没收到的输入补发过去
      this.reconnecting = false; clearTimeout(this.lostTimer);
      if (this.rb) this.sendInputs();
      this.onStatus(); this.onRoom('resumed');
      return;
    }
    // 选色：房主先用自己存的颜色；加入方在 hello 里说想要什么，房主定了发回去
    if (this.role === 'host') { this.looks.g = settleLook(this.looks.h, m.want, this.looks.g); this.sendLooks(); this.sendStage(); }
    this.sendStyle();
    this.onOpen();
  },
  badVersion(v) {
    if (this.versionBad) return;
    this.versionBad = true;
    this.lastDiag = `对方的游戏是 ${v || '旧版本'}，你的是 ${VERSION}。两边要用同一个版本（网页版刷新一下；软件版更新到最新；下载的 modou.html 换成新的）。`;
    this.sendCtl({ t: 'bye' });
    setTimeout(() => { this.leaveAll(); this.onRoom('version'); }, 50);
  },
  // 界面上点了一个颜色（对方占着的点不了）
  pickLook(id) {
    if (!this.open || !lookOf(id)) return false;
    if (this.role === 'host') {
      if (id === this.looks.g) return false;
      this.looks.h = id; this.sendLooks(); this.onLooks(); return true;
    }
    if (id === this.looks.h) return false;
    this.sendCtl({ t: 'look', want: id }); return true;
  },
  sendLooks() { this.sendCtl({ t: 'looks', h: this.looks.h, g: this.looks.g }); },
  // 2.9 拳派：自己点了就换，告诉对方
  myKey() { return this.role === 'host' ? 'h' : 'g'; },
  pickStyle(id) {
    if (!styleOk(id)) return false;
    this.styles[this.myKey()] = id; this.sendStyle(); this.onLooks(); return true;
  },
  sendStyle() { this.sendCtl({ t: 'style', id: this.styles[this.myKey()] }); },
  // 2.0 场景：房主说了算。房主在大厅里点一张，发给加入方；开打的 start 里也带着（只是画面，不影响同步）
  pickStage(id) {
    if (this.role !== 'host' || !STAGE_PICK.includes(id)) return false;
    Stage.online = id; this.sendStage(); this.onLooks(); return true;
  },
  sendStage() { this.sendCtl({ t: 'stage', id: Stage.online }); },
  // 现在走的是直连还是中继（看浏览器选中的那对地址）
  async route() {
    if (!this.pc || !this.pc.getStats) return;
    try {
      const st = await this.pc.getStats();
      let pair = null;
      st.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId); });
      if (!pair) st.forEach(r => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
      if (!pair) return;
      const lc = st.get(pair.localCandidateId), rc = st.get(pair.remoteCandidateId);
      const via = (lc && lc.candidateType === 'relay') || (rc && rc.candidateType === 'relay') ? 'relay' : 'direct';
      if (via !== this.via) { this.via = via; this.onStatus(); }
    } catch (e) {}
  },
  closed(gaveUp) {
    if (!this.pc && !gaveUp) return;
    const was = this.open || gaveUp;
    this.lastDiag = was ? '' : this.waitedOut ? '等了 ' + Math.round(NET.GUEST_WAIT / 60000) + ' 分钟，房主一直没点「连接」。让房主重新建房，再来一次。' : this.diagnose();
    this.waitedOut = false;
    const room = this.kind === 'room';
    this.reset();
    if (room) this.peerId = null;
    this.onClose(was, room && !!this.room);                       // 房间码联机：对方走了，自己还留在房间里等
    if (room && this.room) this.onRoom('waiting');
  },
  leave() { this.sendCtl({ t: 'bye' }); setTimeout(() => this.leaveAll(), 50); },
  sendCtl(m) { if (this.ctl && this.ctl.readyState === 'open') try { this.ctl.send(JSON.stringify(m)); } catch (e) {} },
  onCtl(m) {
    if (this.versionBad) return;
    switch (m.t) {
      case 'ping': this.sendCtl({ t: 'pong', ts: m.ts }); break;
      case 'pong': { const r = performance.now() - m.ts; this.rtt = this.rtt ? this.rtt * 0.8 + r * 0.2 : r; this.onStatus(); break; }
      case 'hello':
        this.peerVersion = m.v;
        if (m.v !== VERSION) { this.badVersion(m.v); break; }
        if (this.open) { if (!m.got) this.sendHello(); break; }     // 他没收到我的：再回一个
        this.open = true;
        if (!m.got) this.sendHello();
        this.linkUp(m);
        break;
      case 'start': this.begin(m.delay, m.epoch, m.looks, m.stage, m.styles); break;
      case 'h': if (m.e === this.epoch) this.checkHash(m.f, m.h, 'r'); break;
      case 'bye': this.reconnecting = false; this.closed(true); break;
      // 选色：加入方要颜色 → 房主定了发回去；加入方收到房主定的结果
      case 'look': if (this.role === 'host') { this.looks.g = settleLook(this.looks.h, m.want, this.looks.g); this.sendLooks(); this.onLooks(); } break;
      case 'looks': if (this.role === 'guest' && lookOf(m.h) && lookOf(m.g)) { this.looks = { h: m.h, g: m.g }; this.onLooks(); } break;
      case 'stage': if (this.role === 'guest' && STAGE_PICK.includes(m.id)) { Stage.online = m.id; this.onLooks(); } break;
      case 'style': if (styleOk(m.id)) { this.styles[this.myKey() === 'h' ? 'g' : 'h'] = m.id; this.onLooks(); } break;
    }
  },
  // 输入延迟：有回滚，只要单程延迟的一半左右（1~3 帧）；按键基本没有延迟感
  pickDelay() { return NET.DELAY ? NET.DELAY * SUB : clamp(Math.round(this.rtt / 2 / STEP_MS * 0.5), SUB, 3 * SUB); },   // 步数（1 ~ 3 帧）
  // 房主开一局（第一局和再战都走这里）
  startAsHost() {
    if (this.role !== 'host' || !this.open) return;
    const d = this.pickDelay(), e = (this.epoch + 1) & 255;
    this.looks.g = settleLook(this.looks.h, this.looks.g, null);
    const looks = [this.looks.h, this.looks.g], styles = [this.styles.h, this.styles.g];
    this.sendCtl({ t: 'start', delay: d, epoch: e, looks, stage: Stage.online, styles });
    this.begin(d, e, looks, Stage.online, styles);
  },
  begin(delay, epoch, looks, stage, styles) {
    if (looks && lookOf(looks[0]) && lookOf(looks[1])) this.looks = { h: looks[0], g: looks[1] };
    if (styles && styleOk(styles[0]) && styleOk(styles[1])) this.styles = { h: styles[0], g: styles[1] };   // 房主发来的这一份（两边一样才同步）
    if (STAGE_PICK.includes(stage)) Stage.online = stage;
    this.delay = delay; this.epoch = epoch;
    this.hashes.clear(); this.acc = 0; this.desync = false; this.hashChecks = 0; this.stall = 0; this.adv = 0; this.holdN = 0;
    this.rb = new Rollback(delay, this.role);
    startMatch('online');
  },
  onIn(data) {
    const p = decodeInputs(data);
    if (!p || p.epoch !== (this.epoch & 255) || !this.rb) return;
    this.rb.receive(p.first, p.vals, p.adv);
    if (p.ack > this.rb.ack) this.rb.ack = p.ack;
  },
  sendInputs() {
    if (!this.inCh || this.inCh.readyState !== 'open' || !this.rb) return;
    const { first, vals } = this.rb.outgoing();
    if (!vals.length) return;
    try { this.inCh.send(encodeInputs(this.epoch, first, this.rb.remoteUntil, vals, this.rb.localAdv())); } catch (e) {}
  },
  // 每次 requestAnimationFrame 调一次（页面在后台时 ui.js 的 Worker 计时器调）
  tick(dt) {
    const rb = this.rb;
    if (!rb) return;
    try { rb.rollback(); } catch (e) { this.desync = true; }
    if (!this.open) { this.stall++; return; }                  // 掉线重连中：原地等
    this.acc += dt * game.timeScale;
    let n = 0;
    while (this.acc >= STEP_MS - 1e-6 && n < 4 * SUB) {
      rb.sample(() => pads[0].sample());
      if (!rb.canAdvance()) {                                  // 对方太久没消息：等
        this.stall++;
        if (this.stall % 4 === 1) this.sendInputs();
        this.acc = Math.min(this.acc, STEP_MS);
        break;
      }
      // 时间同步：我比对方快一帧以上（我老在猜他、他老在回滚），每 6 帧停一帧等等他
      this.adv = this.adv * 0.9 + rb.timeSync() * 0.1;
      if (this.adv > SUB && ++this.holdN % 6 === 0) { this.acc -= STEP_MS; n++; continue; }   // 快一帧（SUB 步）以上：每 6 步停一步
      this.stall = 0;
      if (rb.frame % SUB === 0) this.sendInputs();                 // 一帧发一包（带上对方还没确认的那几步）
      rb.advance();
      this.acc -= STEP_MS; n++;
    }
    if (n >= 4 * SUB) this.acc = 0;
    rb.prune();
    for (const [f, h] of rb.takeHashes()) { this.checkHash(f, h, 'l'); this.sendCtl({ t: 'h', e: this.epoch, f, h }); }
  },
  checkHash(f, h, side) {
    const o = this.hashes.get(f) || {};
    o[side] = h;
    if (o.l !== undefined && o.r !== undefined) { if (o.l !== o.r) this.desync = true; else this.hashChecks++; this.hashes.delete(f); }
    else this.hashes.set(f, o);
    if (this.hashes.size > 60) this.hashes.delete(this.hashes.keys().next().value);
  },
};

function waitIce(pc, relay) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, relay ? NET.ICE_WAIT_RELAY : NET.ICE_WAIT);   // 中继要多等一会儿拿中继地址
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
// 连接码 = 「MD」+ 压缩方式 + base64url(连接描述)
function b64u(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
// 两边游戏版本不一样会不同步，连之前就拦下来
function checkVersion(v, who) {
  if (!v) throw new Error(`${who}用的是旧版本（1.5.1 以前）。两边要用同一个 modou.html`);
  if (v !== VERSION) throw new Error(`${who}的游戏是 ${v}，你的是 ${VERSION}。两边要用同一个 modou.html`);
}
async function packDesc(desc, relay) {
  const o = { t: desc.type, s: desc.sdp, v: VERSION };
  if (relay && relay.length) o.r = relay;
  const json = JSON.stringify(o);
  if (typeof CompressionStream !== 'undefined') {
    const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
    return 'MDz' + b64u(new Uint8Array(buf));
  }
  return 'MDp' + b64u(new TextEncoder().encode(json));
}
async function unpackDesc(code) {
  code = (code || '').replace(/\s+/g, '');
  const kind = code.slice(0, 3);
  let json;
  try {
    const bytes = unb64u(code.slice(3));
    if (kind === 'MDz') json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
    else if (kind === 'MDp') json = new TextDecoder().decode(bytes);
  } catch (e) { json = null; }
  if (!json) throw new Error('连接码不完整或复制错了，请整段重新复制');
  const o = JSON.parse(json);
  const d = { type: o.t, sdp: o.s };
  if (o.v) d.version = o.v;
  if (Array.isArray(o.r) && o.r.length) d.relay = o.r;
  return d;
}
