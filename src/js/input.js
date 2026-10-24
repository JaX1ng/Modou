'use strict';
/* 输入：键位表、Pad（键盘/触屏 → 每帧一个整数）、applyInput（整数 → 角色输入缓冲）
   每帧输入编码成一个整数，联机时两边只互传这个整数 */

// 角色内部的输入：按住状态 + 带时间戳的按键缓冲
class Input {
  constructor() { this.held = { left: false, right: false, up: false, down: false, block: false }; this.buf = []; this.keyDash = false; }
  press(a, t) { this.buf.push({ a, t }); if (this.buf.length > 12) this.buf.shift(); }
  clear() { this.buf.length = 0; for (const k in this.held) this.held[k] = false; }
}

// 编码：低 5 位是按住，往上 6 位是本帧新按下（2.4 多了「冲刺」键），再往上一位是「这个人用冲刺键冲刺」（双击方向不冲 —— 键位设置里选的）
const HELD_ACTS = ['left', 'right', 'up', 'down', 'block'];
const PRESS_ACTS = ['up', 'jab', 'heavy', 'kick', 'grab', 'dash'];
const PRESS_SET = new Set(PRESS_ACTS);
const HOLD = a => 1 << HELD_ACTS.indexOf(a);
const TAP = a => 1 << (5 + PRESS_ACTS.indexOf(a));
const DASH_KEY = 1 << (5 + PRESS_ACTS.length);   // 2.4：冲刺用冲刺键（这一位一直带着，联机时对面也知道这个人双击方向不冲刺）

class Pad {
  constructor() { this.held = { left: false, right: false, up: false, down: false, block: false }; this.pending = []; this.keyDash = null; }
  down(a, repeat) {
    if (a in this.held) this.held[a] = true;
    if (PRESS_SET.has(a) && !repeat) this.pending.push(a);
  }
  up(a) { if (a in this.held) this.held[a] = false; }
  sample() {
    let v = 0;
    for (let i = 0; i < HELD_ACTS.length; i++) if (this.held[HELD_ACTS[i]]) v |= 1 << i;
    for (const a of this.pending) v |= TAP(a);
    this.pending.length = 0;
    if (this.keyDash && this.keyDash()) v |= DASH_KEY;      // ui.js 接上：这一局用的那套键位选了「冲刺键」
    return v;
  }
  clear() { this.pending.length = 0; for (const k in this.held) this.held[k] = false; }
}
const pads = [new Pad(), new Pad()];   // pads[0] = 本机玩家（人机/联机/打桩，或双人的玩家一），pads[1] = 双人的玩家二

function applyInput(F, v) {
  for (let i = 0; i < HELD_ACTS.length; i++) F.inp.held[HELD_ACTS[i]] = !!(v & (1 << i));
  for (let i = 0; i < PRESS_ACTS.length; i++) if (v & (1 << (5 + i))) F.inp.press(PRESS_ACTS[i], F.clock);
  F.inp.keyDash = !!(v & DASH_KEY);
}

// 键位（KeyboardEvent.code，不受输入法影响）
const MAP_P1 = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'jab', KeyG: 'heavy', KeyH: 'kick', KeyR: 'block', KeyT: 'grab', ShiftLeft: 'dash' };
const MAP_P2 = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Comma: 'jab', Period: 'heavy', Slash: 'kick', KeyL: 'block', Semicolon: 'grab', ShiftRight: 'dash' };
const MAP_P2X = { Numpad1: 'jab', Numpad2: 'heavy', Numpad3: 'kick', Numpad4: 'block', Numpad5: 'grab', Numpad0: 'dash' };   // 玩家二第二格：小键盘

/* ---------- 自定义键位（1.6.0 单人；1.8.0 双人对战也能改；1.9.1 单人和双人分开） ----------
   三套：单人（人机 / 联机 / 打桩）、双人对战的玩家一、双人对战的玩家二。每个动作两格。
   存在浏览器里（localStorage「modou.keys」单人、「modou.keys1」双人玩家一、「modou.keys2」双人玩家二），换新版本文件也还在。
   单人那套和双人那两套互不影响：单人随便用方向键、小键盘，不用管会不会和玩家二抢键。
   双人对战时，两人都绑了的键归玩家二（玩家一那个键在双人对战里不起作用，键位设置里会标出来）。
   1.9.1 以前单人和双人的玩家一是同一套（存在 modou.keys）：第一次打开新版本时，双人的玩家一照抄这一套 */
/* 2.4 冲刺怎么按（Jack：可以设成双击 A / D，也可以单按一个键冲刺）：每套键位各选各的 —— dashMode: 'tap' 双击方向（默认，和以前一样）/ 'key' 冲刺键；
   2.5.1 多一种 'both' 两种都用（Jack：冲刺可以选双击和单键都启用）。
   选「冲刺键」：按一下冲刺键 = 往按着的方向冲（没按方向就往前冲；按着挡往前冲 = 闪身），双击方向就只是走路；
   选「双击」：冲刺键那一行不用（不算缺键，也不和别的键算冲突）；
   选「两种都用」：双击方向照样冲，冲刺键也能冲（输入里不带「用冲刺键」那一位 —— 那一位的意思就是「双击方向不冲」，联机两边照样对得上）。
   触屏的「冲」按钮哪种都能用 */
const DASH_MODES = ['tap', 'key', 'both'];
const ACTIONS = [['left', '左'], ['right', '右'], ['up', '跳'], ['down', '蹲'], ['jab', '短拳'], ['heavy', '重拳'], ['kick', '腿踢'], ['block', '格挡'], ['grab', '擒拿'], ['dash', '冲刺']];
const ACT_NAME = Object.fromEntries(ACTIONS);
const codeOf = (map, a) => Object.keys(map).find(k => map[k] === a) || null;
const DEFAULT_KEYS = {}, DEFAULT_KEYS2 = {};          // 单人、双人玩家一默认一样；玩家二另一套
for (const [a] of ACTIONS) { DEFAULT_KEYS[a] = [codeOf(MAP_P1, a), null]; DEFAULT_KEYS2[a] = [codeOf(MAP_P2, a), codeOf(MAP_P2X, a)]; }
DEFAULT_KEYS.dashMode = DEFAULT_KEYS2.dashMode = 'tap';
const NO_BIND = new Set(['Escape', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu']);
// 一套键位：每个动作两格 + dashMode（'tap' 双击方向冲刺 / 'key' 冲刺键 / 'both' 两种都用）。1.x ~ 2.3 存的没有冲刺这一行：补上默认的冲刺键
const cloneKeys = (k, def) => {
  const o = Object.fromEntries(ACTIONS.map(([a]) => [a, (k[a] || (a === 'dash' && def ? def.dash : null) || [null, null]).slice(0, 2).concat([null, null]).slice(0, 2)]));
  o.dashMode = DASH_MODES.includes(k.dashMode) ? k.dashMode : 'tap';
  return o;
};
// 这套键位里真正在用的动作（选了「双击」，冲刺键那一行不用）
const liveActs = k => ACTIONS.filter(([a]) => a !== 'dash' || k.dashMode !== 'tap');
// 冲突检查：同一个键给了两个动作 → 冲突；某个动作一个键都没有 → 缺键
function keyProblems(k) {
  const used = {}, out = { dup: [], missing: [], dupCodes: new Set() };
  for (const [a] of liveActs(k)) for (const c of k[a]) if (c) (used[c] = used[c] || []).push(a);
  for (const c in used) if (new Set(used[c]).size > 1 || used[c].length > 1) { out.dup.push([c, used[c]]); out.dupCodes.add(c); }
  for (const [a] of liveActs(k)) if (!k[a].some(Boolean)) out.missing.push(a);
  return out;
}
function keyMapOf(k) { const m = {}; for (const [a] of liveActs(k)) for (const c of k[a]) if (c) m[c] = a; return m; }
// 两个玩家都绑了的键（双人对战时归玩家二）
function sharedKeys(k1, k2) { const m2 = keyMapOf(k2); return new Set(Object.keys(keyMapOf(k1)).filter(c => m2[c])); }
const KEY_STORE = ['modou.keys', 'modou.keys1', 'modou.keys2'];     // 单人、双人玩家一、双人玩家二
const Keys = {
  solo: cloneKeys(DEFAULT_KEYS), p1: cloneKeys(DEFAULT_KEYS), p2: cloneKeys(DEFAULT_KEYS2),
  map: {}, map1: {}, map2: {},                 // map：单人；map1 / map2：双人对战的玩家一 / 玩家二
  // get：读存档（测试里传假的进来）。坏掉的、有冲突的存档不要，用默认
  load(get) {
    get = get || (k => { try { return localStorage.getItem(k); } catch (e) { return null; } });
    const read = key => {
      try {
        const v = JSON.parse(get(key) || 'null');
        if (v && typeof v === 'object') { const k = cloneKeys(v, key === KEY_STORE[2] ? DEFAULT_KEYS2 : DEFAULT_KEYS); if (!keyProblems(k).dup.length) return k; }
      } catch (e) {}
      return null;
    };
    this.solo = read(KEY_STORE[0]) || cloneKeys(DEFAULT_KEYS);
    this.p1 = read(KEY_STORE[1]) || cloneKeys(this.solo);           // 以前只有一套：双人的玩家一照抄
    this.p2 = read(KEY_STORE[2]) || cloneKeys(DEFAULT_KEYS2);
    this.rebuild();
  },
  rebuild() { this.map = keyMapOf(this.solo); this.map1 = keyMapOf(this.p1); this.map2 = keyMapOf(this.p2); },
  save(solo, p1, p2) {
    this.solo = cloneKeys(solo); this.p1 = cloneKeys(p1); this.p2 = cloneKeys(p2); this.rebuild();
    try { [this.solo, this.p1, this.p2].forEach((k, i) => localStorage.setItem(KEY_STORE[i], JSON.stringify(k))); } catch (e) {}
  },
  route(code, mode) { return keyRoute(code, mode, this.map, this.map1, this.map2); },
  // 2.4 这一局第 i 个玩家（本机）用的那套键位是不是「只用冲刺键」（双击方向不冲）：双人对战看双人那两套，别的模式看单人那套。
  // 2.5.1「两种都用」不算（双击照样冲；冲刺键在键位表里，按了照样冲）
  keyDash(i, mode) { return (mode === 'pvp' ? (i ? this.p2 : this.p1) : this.solo).dashMode === 'key'; },
  bound(code) { return !!(this.map[code] || this.map1[code] || this.map2[code]); },   // 哪一套里绑了这个键
};
// 这一局里这个键是谁的什么动作：[0 或 1, 动作]，没有就 null。
// 双人对战用双人的两套（两人都绑了的归玩家二）；人机 / 联机 / 打桩只看单人那套
function keyRoute(code, mode, ms, m1, m2) {
  if (mode === 'pvp') return m2[code] ? [1, m2[code]] : m1[code] ? [0, m1[code]] : null;
  return ms[code] ? [0, ms[code]] : null;
}
Keys.load();
// 2.4 教程、破招练习里讲冲刺的话：这套键位选了「冲刺键」，「双击 [前]」都换成「按 [冲]」（[冲] 换成冲刺键）；
// 2.5.1 选了「两种都用」：写成「双击 [前] 或按 [冲]」
function dashWords(s, set) {
  const m = (set || Keys.solo).dashMode;
  if (m === 'both') return s.replace(/双击 \[前\]（或 \[后\]）/g, '双击 [前]（或 [后]），或按 [冲]').replace(/朝对手双击 \[前\]/g, '朝对手双击 [前]（或按 [冲]）')
    .replace(/双击 \[前\](?!（)/g, '双击 [前] 或按 [冲]').replace(/双击方向/g, '双击方向或按冲刺键');
  if (m !== 'key') return s;
  return s.replace(/双击 \[前\]（或 \[后\]）/g, '按 [冲]（按着 [后] 再按 = 往后冲）')
    .replace(/朝对手双击 \[前\]/g, '按 [冲]').replace(/双击 \[前\]/g, '按 [冲]')
    .replace(/双击方向/g, '按冲刺键').replace(/双击冲进来/g, '冲刺冲进来').replace(/朝你双击/g, '朝你冲刺');
}
// 鼠标按键（1.7.0）：记成 Mouse0~4（MouseEvent.button）。3、4 是侧键（一般是「后退」「前进」）
const MOUSE_NAME = ['鼠标左键', '鼠标中键', '鼠标右键', '鼠标侧键·后', '鼠标侧键·前'];
// 键的显示名
function keyName(c) {
  if (!c) return '—';
  let m;
  if ((m = /^Mouse(\d)$/.exec(c))) return MOUSE_NAME[+m[1]] || '鼠标键' + m[1];
  if ((m = /^Key([A-Z])$/.exec(c))) return m[1];
  if ((m = /^Digit(\d)$/.exec(c))) return m[1];
  if ((m = /^Numpad(\d)$/.exec(c))) return '小键盘' + m[1];
  if ((m = /^F(\d+)$/.exec(c))) return c;
  const N = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: '空格', Enter: '回车', Tab: 'Tab', Backspace: '退格', CapsLock: 'Caps',
    ShiftLeft: '左 Shift', ShiftRight: '右 Shift', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', NumpadAdd: '小键盘+', NumpadSubtract: '小键盘-', NumpadMultiply: '小键盘*', NumpadDivide: '小键盘/',
    NumpadEnter: '小键盘回车', NumpadDecimal: '小键盘.', Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn' };
  return N[c] || c;
}
