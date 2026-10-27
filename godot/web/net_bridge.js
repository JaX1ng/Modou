'use strict';
/* 墨斗 3.0（Godot 网页版）联机的「线」：照 JS 版 net.js 搬过来的那一半 —— 房间码（Trystero 经公共 Nostr 中继找人，之后 WebRTC 直连）、
   手动连接码（复制粘贴）、中继（TURN）设置、邀请链接、掉线等人回来。游戏那一层（打招呼、选色、回滚帧同步）在 Godot 里（net/net_session.gd）。
   Godot 经 JavaScriptBridge 调这里（net/web_transport.gd）：调用都马上返回，结果、收到的消息放进队列，Godot 每帧 poll() 取走。
   队列里的事（JSON）：
     {t:'pair', role, again}   配上一个人了（房间码：id 小的当房主；手动：建房的是房主）
     {t:'link', again}         两条通道都开了            {t:'ctl', m}  控制消息        {t:'in', b}  输入包（base64）
     {t:'lost'}                对局中掉线了，等他回来      {t:'gone'}    等不回来了
     {t:'left'}                大厅里对方走了，接着等      {t:'room', s} waiting / busy / error / rejoining
     {t:'closed', diag}        手动连接断了 / 没连上        {t:'via', v}  direct / relay
     {t:'hostCode', code} / {t:'answer', code} / {t:'err', where, msg} / {t:'relay', ok, msg, cls} / {t:'invite', link} / {t:'openInvite', code} */
(function () {
  const NET = {
    ICE: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
    APP_ID: 'modou-ink-fight-3',   // 3.0 另起一个：和 2.x（JS 版）同一个房间码不会碰到一起
    SIGNAL_N: 8, SIGNAL_URLS: null,
    RECONNECT_WAIT: 20000, HANDSHAKE_WAIT: 4000, ICE_WAIT: 4000, ICE_WAIT_RELAY: 6500, CONNECT_WAIT: 20000, GUEST_WAIT: 300000,
  };
  const Q = [];
  const emit = e => { Q.push(e); };
  let VERSION = '';
  let tickCb = null;

  /* ---------- 中继 ---------- */
  const Relay = {
    list: [],
    load() { try { const v = JSON.parse(localStorage.getItem('modou.relay') || '[]'); this.list = Array.isArray(v) ? v : []; } catch (e) { this.list = []; } return this.list; },
    save(list) { this.list = list || []; try { localStorage.setItem('modou.relay', JSON.stringify(this.list)); } catch (e) {} },
  };
  const isTurn = s => [].concat(s.urls).some(u => /^turns?:/i.test(u));
  const hasTurn = list => (list || []).some(isTurn);
  function parseRelay(text) {
    text = String(text || '').trim();
    if (!text) return [];
    let v;
    const i = text.search(/[\[{]/);
    if (i >= 0) {
      let body = text.slice(i);
      body = body.slice(0, Math.max(body.lastIndexOf(']'), body.lastIndexOf('}')) + 1);
      try { v = JSON.parse(body); } catch (e) { try { v = JSON.parse(jsToJson(body)); } catch (e2) { v = undefined; } }
      if (v && !Array.isArray(v) && v.iceServers) v = v.iceServers;
      if (v && !Array.isArray(v)) v = [v];
    }
    if (!v) {
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
  function testRelay(list, ms) {
    return new Promise(res => {
      let pc, done = false;
      const t0 = performance.now();
      const end = (ok, why, auth) => { if (done) return; done = true; clearTimeout(timer); try { pc.close(); } catch (e) {} res({ ok, why, auth: !!auth, ms: Math.round(performance.now() - t0) }); };
      const timer = setTimeout(() => end(false, '超时：中继没有回应（地址、用户名或密码不对，或者被网络挡了）'), ms || 7000);
      try {
        pc = new RTCPeerConnection({ iceServers: list, iceTransportPolicy: 'relay' });
        pc.createDataChannel('t');
        pc.onicecandidate = e => { if (e.candidate && / typ relay /.test(e.candidate.candidate)) end(true); else if (!e.candidate) end(false, '中继没给地址（多半是用户名或密码不对）'); };
        pc.onicecandidateerror = e => { if (e.errorCode === 401) end(false, '用户名或密码不对（中继拒绝了）', true); };
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(e => end(false, String(e.message || e)));
      } catch (e) { end(false, String(e.message || e)); }
    });
  }
  Relay.load();

  /* ---------- 编码 ---------- */
  function b64u(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
  function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(str) { const s = atob(str); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
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
  function checkVersion(v, who) {
    if (!v) throw new Error(`${who}用的是旧版本。两边要用同一个版本`);
    if (v !== VERSION) throw new Error(`${who}的游戏是 ${v}，你的是 ${VERSION}。两边要用同一个版本（网页刷新一下）`);
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
  function waitIce(pc, relay) {
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, relay ? NET.ICE_WAIT_RELAY : NET.ICE_WAIT);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }

  /* ---------- 房间码、邀请链接 ---------- */
  function signalOverride() { try { const v = JSON.parse(localStorage.getItem('modou.signal') || 'null'); return Array.isArray(v) && v.length ? v.map(String) : null; } catch (e) { return null; } }
  const normCode = s => String(s || '').replace(/\s+/g, '').toLowerCase().slice(0, 24);
  async function inviteLink(code, relay) {
    let h = '#' + encodeURIComponent(code);
    if (relay && relay.length) h += '&r=' + (await packJson(relay));
    return location.href.split('#')[0] + h;
  }
  async function parseInvite(hash) {
    const parts = String(hash || '').replace(/^#/, '').split('&');
    const code = normCode(decodeURIComponent(parts[0] || ''));
    let relay = null;
    for (const p of parts.slice(1)) if (p.startsWith('r=')) { try { const v = await unpackJson(p.slice(2)); if (Array.isArray(v) && hasTurn(v)) relay = v; } catch (e) {} }
    return { code, relay };
  }
  const CHANNELS = new WeakMap();

  const Net = {
    pc: null, ctl: null, inCh: null, role: null, via: '', relayUsed: [], lastDiag: '', peerVersion: '',
    linked: false, hold: false,
    room: null, code: '', peerId: null, linkRelay: null, reconnecting: false, kind: '', busy: null, busyIds: new Set(),
    pingTimer: 0, connTimer: 0, lostTimer: 0, waitedOut: false,

    reset() {
      clearInterval(this.pingTimer); clearTimeout(this.connTimer); clearTimeout(this.lostTimer);
      this.detach();
      if (this.pc && this.kind === 'manual') { try { this.pc.close(); } catch (e) {} }
      this.pc = null; this.linked = false; this.role = null; this.via = ''; this.reconnecting = false;
    },
    detach() {
      for (const ch of [this.ctl, this.inCh]) if (ch) ch.onmessage = ch.onopen = ch.onclose = null;
      this.ctl = this.inCh = null; this.linked = false;
    },
    leaveAll() { this.reset(); this.leaveRoom(); this.peerId = null; this.kind = ''; },
    leaveRoom() { if (this.room) { try { this.room.leave(); } catch (e) {} this.room = null; } this.code = ''; this.busy = null; this.busyIds.clear(); },
    pair(role, again) { this.role = role; emit({ t: 'pair', role, again: !!again }); },

    joinCode(code) {
      code = normCode(code);
      if (!code) throw new Error('先输入一个房间码（两边要一样）');
      if (typeof Trystero === 'undefined' || !Trystero.joinRoom) throw new Error('没有房间码联机的组件，请用下面的「手动连接」');
      this.leaveAll();
      this.kind = 'room'; this.code = code;
      this.relayUsed = mergeIce(Relay.list, this.linkRelay);
      const ice = mergeIce(NET.ICE, this.relayUsed);
      const relayConfig = { warnOnRelayFailure: false, redundancy: NET.SIGNAL_N }, urls = NET.SIGNAL_URLS || signalOverride();
      if (urls) relayConfig.urls = urls;
      this.room = Trystero.joinRoom({ appId: NET.APP_ID, rtcConfig: { iceServers: ice }, relayConfig }, 'room:' + code, {
        onJoinError: d => { this.lastDiag = d && d.error ? String(d.error.message || d.error) : ''; emit({ t: 'room', s: 'error' }); },
        handshakeTimeoutMs: NET.HANDSHAKE_WAIT,
      });
      this.busy = this.room.makeAction('busy', { onMessage: (d, meta) => this.gotBusy(meta && meta.peerId) });
      this.room.onPeerJoin = id => this.peerJoined(id);
      this.room.onPeerLeave = id => this.peerLeft(id);
      emit({ t: 'room', s: 'waiting' });
      return code;
    },
    peerJoined(id) {
      if (this.kind !== 'room' || !this.room || this.busyIds.has(id)) return;
      if (this.peerId && id !== this.peerId) {
        if (this.busy && !this.reconnecting) this.busy.send(1, { target: id }).catch(() => {});
        return;
      }
      if (this.peerId === id && this.linked) return;
      const pc = this.room.getPeers()[id];
      if (!pc) return;
      const again = this.peerId === id && this.reconnecting;
      this.detach();
      this.peerId = id; this.pc = pc;
      this.pair(Trystero.selfId < id ? 'host' : 'guest', again);
      this.openChannels(pc, 0);
      if (again) emit({ t: 'room', s: 'rejoining' });
    },
    openChannels(pc, tries) {
      if (this.pc !== pc || this.kind !== 'room') return;
      const c = CHANNELS.get(pc) || {};
      const live = ch => ch && (ch.readyState === 'open' || ch.readyState === 'connecting');
      try {
        if (!live(c.ctl)) c.ctl = pc.createDataChannel('ctl', { negotiated: true, id: 66, ordered: true });
        if (!live(c.in)) c.in = pc.createDataChannel('in', { negotiated: true, id: 67, ordered: false, maxRetransmits: 0 });
      } catch (e) {
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
      if (id !== this.peerId || this.linked) return;
      this.detach(); this.peerId = null; this.pc = null;
      const other = this.room && Object.keys(this.room.getPeers()).find(p => !this.busyIds.has(p));
      if (other) this.peerJoined(other);
      else { this.leaveAll(); emit({ t: 'room', s: 'busy' }); }
    },
    peerLeft(id) { if (id === this.peerId) this.linkLost(); },
    // 连接断了：对局中就等对方回来（同一个人重新连上就接着打）；还没开打就回到「等对方」
    linkLost() {
      if (this.kind !== 'room') return this.closed();
      clearInterval(this.pingTimer); this.detach();
      if (this.hold) {
        if (!this.reconnecting) {
          this.reconnecting = true;
          clearTimeout(this.lostTimer);
          this.lostTimer = setTimeout(() => { if (this.reconnecting) { this.reconnecting = false; this.peerId = null; emit({ t: 'gone' }); } }, NET.RECONNECT_WAIT);
          emit({ t: 'lost' });
        }
        return;
      }
      this.peerId = null; this.pc = null;
      emit({ t: 'left' });
    },

    /* ---------- 手动连接 ---------- */
    newPc(extra, role) {
      this.leaveAll();
      this.kind = 'manual'; this.pair(role, false);
      this.relayUsed = mergeIce(Relay.list, extra);
      const pc = this.pc = new RTCPeerConnection({ iceServers: mergeIce(NET.ICE, this.relayUsed) });
      pc.onconnectionstatechange = () => {
        if (this.pc !== pc) return;
        const s = pc.connectionState;
        if (!this.linked && this.role === 'guest' && s === 'failed') return;
        if (s === 'failed' || s === 'closed' || (s === 'disconnected' && this.linked)) this.closed();
      };
    },
    async host() {
      this.newPc(null, 'host');
      this.wire(this.pc.createDataChannel('ctl', { ordered: true }));
      this.wire(this.pc.createDataChannel('in', { ordered: false, maxRetransmits: 0 }));
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await waitIce(this.pc, hasTurn(this.relayUsed));
      return packDesc(this.pc.localDescription, this.relayUsed);
    },
    async join(code) {
      const { relay, version, ...desc } = await unpackDesc(code);
      if (desc.type !== 'offer') throw new Error('这是应答码，不是连接码');
      checkVersion(version, '房主');
      this.newPc(relay, 'guest'); this.peerVersion = version;
      this.pc.ondatachannel = e => this.wire(e.channel);
      await this.pc.setRemoteDescription(desc);
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await waitIce(this.pc, hasTurn(this.relayUsed));
      const pc = this.pc;
      clearTimeout(this.connTimer);
      this.connTimer = setTimeout(() => { if (this.pc === pc && !this.linked) { this.waitedOut = true; this.closed(); } }, NET.GUEST_WAIT);
      return packDesc(this.pc.localDescription);
    },
    async finish(code) {
      const { relay, version, ...desc } = await unpackDesc(code);
      if (desc.type !== 'answer') throw new Error('这是连接码，不是应答码');
      checkVersion(version, '对方');
      if (!this.pc || this.role !== 'host' || this.kind !== 'manual') throw new Error('先点「我来建房」');
      if (this.pc.signalingState === 'stable') throw new Error('已经点过「连接」了，正在连，稍等一下（最多 20 秒）');
      this.peerVersion = version;
      const pc = this.pc;
      clearTimeout(this.connTimer);
      this.connTimer = setTimeout(() => { if (this.pc === pc && !this.linked) this.closed(); }, NET.CONNECT_WAIT);
      await this.pc.setRemoteDescription(desc);
    },

    /* ---------- 通道 ---------- */
    wire(ch) {
      const pc = this.pc;
      ch.binaryType = 'arraybuffer';
      if (ch.label === 'ctl') { this.ctl = ch; ch.onmessage = e => { try { emit({ t: 'ctl', m: JSON.parse(e.data) }); } catch (err) {} }; }
      else { this.inCh = ch; ch.onmessage = e => { if (e.data instanceof ArrayBuffer) emit({ t: 'in', b: b64(new Uint8Array(e.data)) }); }; }
      ch.onopen = () => { if (this.pc === pc) this.checkOpen(); };
      ch.onclose = () => { if (this.pc === pc && (this.ctl === ch || this.inCh === ch)) { if (this.kind === 'room') this.linkLost(); else this.closed(); } };
      if (ch.readyState === 'open') setTimeout(() => { if (this.pc === pc) this.checkOpen(); }, 0);
    },
    checkOpen() {
      if (this.linked || !this.ctl || !this.inCh || this.ctl.readyState !== 'open' || this.inCh.readyState !== 'open') return;
      this.linked = true;
      const again = this.reconnecting;
      this.reconnecting = false; clearTimeout(this.lostTimer);
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.route(), 1000);
      emit({ t: 'link', again });
      this.route();
    },
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
        if (via !== this.via) { this.via = via; emit({ t: 'via', v: via }); }
      } catch (e) {}
    },
    diagnose() {
      const pc = this.pc;
      if (!pc || this.kind !== 'manual') return '';
      const kinds = sdp => ({ relay: / typ relay/.test(sdp || ''), srflx: / typ srflx/.test(sdp || ''), host: / typ host/.test(sdp || '') });
      const L = kinds(pc.localDescription && pc.localDescription.sdp), R = kinds(pc.remoteDescription && pc.remoteDescription.sdp);
      const say = k => [k.relay ? '中继' : '', k.srflx ? '公网' : '', k.host ? '本机' : ''].filter(Boolean).join('、') || '没有';
      let tip = '';
      if (!R.relay && !L.relay) tip = '两边都没有中继地址。';
      else if (!R.relay) tip = '对方没拿到中继地址：对方那边连不上中继服务器（换个网络试试）。';
      else if (!L.relay) tip = '你这边没拿到中继地址：中继服务器连不上，点「保存并测试」看看。';
      else tip = '两边都有中继地址还是没通：中继额度用完了，或者凭据刚建还没生效（等两分钟再试）。';
      return `你这边：${say(L)}；对方：${say(R)}。${tip}`;
    },
    closed(gaveUp) {
      if (!this.pc && !gaveUp) return;
      const was = this.linked || gaveUp;
      const diag = was ? '' : this.waitedOut ? '等了 ' + Math.round(NET.GUEST_WAIT / 60000) + ' 分钟，房主一直没点「连接」。让房主重新建房，再来一次。' : this.diagnose();
      this.waitedOut = false;
      const room = this.kind === 'room';
      this.reset();
      if (room) this.peerId = null;
      emit({ t: 'closed', diag });
      if (room && this.room) emit({ t: 'room', s: 'waiting' });
    },
    // 对方说再见：手动连接就断掉；房间码就不理他了、留在房间里等下一个
    dropPeer() {
      const room = this.kind === 'room';
      this.reset();
      if (room) this.peerId = null; else this.kind = '';
    },
  };
  // 关掉网页时告诉对方一声
  window.addEventListener('pagehide', () => { if (Net.ctl && Net.ctl.readyState === 'open') { try { Net.ctl.send(JSON.stringify({ t: 'bye' })); } catch (e) {} } });

  // 页面切到后台时浏览器不刷新画面（Godot 不走主循环），联机就停了、对方一直「等待对方」：
  // 用一个 Worker 计时器（浏览器不暂停它）叫 Godot 在后台接着推进联机（Godot 那边 set_tick 接上）
  (function bgTicker() {
    if (typeof Worker === 'undefined') return;
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(function () { postMessage(0); }, 16);'], { type: 'text/javascript' }));
      const w = new Worker(url);
      let prev = performance.now();
      w.onmessage = () => {
        const now = performance.now(), dt = Math.min(100, now - prev); prev = now;
        if (document.hidden && tickCb) { try { tickCb(dt); } catch (e) {} }
      };
    } catch (e) {}
  })();

  const err = (where, e) => emit({ t: 'err', where, msg: String((e && e.message) || e) });
  window.ModouNet = {
    init(version) { VERSION = String(version); return true; },
    supported() { return typeof RTCPeerConnection !== 'undefined'; },
    embedded() { try { return window.self !== window.top; } catch (e) { return true; } },
    roomSupported() { return typeof Trystero !== 'undefined' && !!Trystero.joinRoom; },
    poll() { return Q.length ? JSON.stringify(Q.splice(0)) : ''; },
    // 房间码：返回 JSON {ok, code} / {ok:false, err}
    joinRoom(raw) {
      try {
        const code = Net.joinCode(raw);
        try { localStorage.setItem('modou.room', code); } catch (e) {}
        const keep = Net.linkRelay ? (location.hash.match(/&r=[^&]*/) || [''])[0] : '';
        try { history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(code) + keep); } catch (e) {}
        return JSON.stringify({ ok: true, code });
      } catch (e) { return JSON.stringify({ ok: false, err: String(e.message || e) }); }
    },
    lastRoom() { try { return localStorage.getItem('modou.room') || ''; } catch (e) { return ''; } },
    clearHash() { try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (e) {} },
    leaveAll() { Net.leaveAll(); },
    leaveRoom() { Net.leaveAll(); },
    leave() { setTimeout(() => Net.leaveAll(), 50); },
    dropPeer() { Net.dropPeer(); },
    inRoom() { return !!Net.room; },
    code() { return Net.code; },
    isRoom() { return Net.kind === 'room'; },
    setHold(on) { Net.hold = !!on; },
    lastDiag() { return Net.lastDiag || ''; },
    relayUsed() { return hasTurn(Net.relayUsed); },
    sendCtl(json) { if (Net.ctl && Net.ctl.readyState === 'open') try { Net.ctl.send(json); } catch (e) {} },
    sendIn(b) { if (Net.inCh && Net.inCh.readyState === 'open') try { Net.inCh.send(unb64(b).buffer); } catch (e) {} },
    host() { Net.host().then(code => emit({ t: 'hostCode', code }), e => err('host', '生成连接码失败：' + (e.message || e))); },
    join(code) { Net.join(code).then(a => emit({ t: 'answer', code: a }), e => err('join', e)); },
    finish(code) { Net.finish(code).then(() => emit({ t: 'connecting' }), e => err('finish', e)); },
    // 中继
    relayCount() { return Relay.list.filter(isTurn).length; },
    relayText() { return Relay.list.length ? JSON.stringify(Relay.list, null, 1) : ''; },
    relaySave(text) {
      (async () => {
        try {
          const list = await resolveRelay(text);
          emit({ t: 'relay', msg: '已读到 ' + list.filter(isTurn).length + ' 个中继地址，正在测试…', cls: '' });
          const r = await testRelay(list);
          if (r.auth) emit({ t: 'relay', msg: '没保存：' + r.why + '。重新复制一遍账号再试。', cls: 'bad', done: true });
          else {
            Relay.save(list);
            if (r.ok) emit({ t: 'relay', msg: `中继可用（${r.ms} 毫秒拿到中继地址）。现在去建房就会带上它。`, cls: 'ok', done: true, text: JSON.stringify(list, null, 1) });
            else emit({ t: 'relay', msg: '已保存，但在这个网络上没测通：' + r.why + '。换个网络再点一次试试。', cls: 'bad', done: true, text: JSON.stringify(list, null, 1) });
          }
        } catch (e) { emit({ t: 'relay', msg: String(e.message || e), cls: 'bad', done: true }); }
      })();
    },
    relayClear() { Relay.save([]); },
    hasTurnList() { return hasTurn(Relay.list); },
    // 邀请链接（带上自己的中继）：生成好了放进队列
    invite() { inviteLink(Net.code, hasTurn(Relay.list) ? Relay.list : null).then(link => emit({ t: 'invite', link })); },
    copy(text) {
      const done = ok => emit({ t: 'copied', ok });
      try { navigator.clipboard.writeText(String(text)).then(() => done(true), () => done(false)); } catch (e) { done(false); }
    },
    // 网址后面带着 #房间码（邀请链接）：打开就进联机、进这个房间
    checkInvite() {
      if (location.hash.length < 2) return;
      parseInvite(location.hash).then(({ code, relay }) => {
        if (!code || (Net.room && Net.code === code)) return;
        if (relay) Net.linkRelay = relay;
        emit({ t: 'openInvite', code });
      }).catch(() => {});
    },
    setTick(cb) { tickCb = cb; },
  };
  window.addEventListener('hashchange', () => window.ModouNet.checkInvite());
})();
