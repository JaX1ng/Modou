'use strict';
/* JS 版当「标准答案」：同一个场景（同样的种子、同样的输入），每帧记下两个人的全部逻辑字段（联机回滚存档里的那些），
   Godot 版跑同样的场景逐帧比（tests/diff_trace.gd）。
   每帧只传一个指纹（数按 64 位浮点的原始字节、字串按 UTF-8，FNV-1a），对不上了再用 cfg.window 把那几帧的全部字段要回来看。
   场景：mode（pve / pvp / online / train / attract）、两边谁是电脑（难度）谁是乱按的「木头人」、种子、跑多少帧。 */

// 输入生成器（和 Godot 版 tests/diff_trace.gd 一样）：一个 LCG，每个木头人一串。rate：这一帧新按一个键、再按一个键的概率
function makeInputGen(seed, rate, dashKey) {
  let s = seed >>> 0, held = 0, n = 0;
  const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const r1 = rate ? rate[0] : 0.16, r2 = rate ? rate[1] : 0.04;
  return () => {
    if (n-- <= 0) {                       // 换一种按住的组合：方向、蹲、挡
      n = 3 + ((r() * 20) | 0);
      const d = r(), dn = r(), bl = r();
      held = (d < 0.3 ? 1 : d < 0.6 ? 2 : 0) | (dn < 0.15 ? 8 : 0) | (bl < 0.2 ? 16 : 0);
    }
    let v = held;
    if (r() < r1) v |= 1 << (5 + ((r() * 6) | 0));   // 这一帧新按一个键（跳 拳 重 踢 拿 冲）
    if (r() < r2) v |= 1 << (5 + ((r() * 6) | 0));
    if (dashKey) v |= DASH_KEY;
    return v;
  };
}

// 和 Godot 的 Fighter.SAVE_KEYS 一样的顺序
const SAVE_KEYS = ['style', 'maxHp', 'x', 'facing', 'alt', 'vz', 'vx', 'kvx', 'vxCap', 'takeoffV', 'hp', 'state', 't',
  'dashEnd', 'comboDmg', 'maxComboDmg', 'freeAt', 'chainIdle', 'slowJab', 'airUsed', 'lowBlock', 'stunT', 'hurtHeavy',
  'grabbed', 'downPhase', 'lieT', 'landT', 'riseT', 'combo', 'comboT', 'comboLive', 'comboTaken', 'rushStamped', 'clock', 'serial',
  'runT', 'airT', 'leapJump', 'carried', 'carry0', 'slam', 'slipGot', 'stagger', 'qi', 'reel', 'clashed', 'noParry', 'guardOn',
  'stompFor', 'reelBy', 'reelKD', 'rollDir', 'heldAt', 'prevBlock', 'blockPress', 'parryOK', 'prevL', 'prevR', 'tapL', 'tapR',
  'dashT', 'dashDir', 'dashFace', 'tumFly', 'slipEnd'];
// JS 里 undefined / null 的字段，Godot 那边存的是什么
const F_NORM = { downPhase: v => v || '', tumFly: v => v || 0, slipEnd: v => v === undefined ? -999 : v, style: v => v || 'trad' };
const STAT_KEYS = ['hits', 'maxCombo', 'blocks', 'specials', 'parries', 'clashes', 'presses', 'punishes', 'escapes', 'supers'];
const M_KEYS = ['name', 't', 'S', 'hit', 'blocked', 'done', 'air', 'slowed', 'serial', 'armorLeft', 'press', 'dashIn', 'pen', 'dvx', 'bounce', 'bFly',
  'pick', 'holdKind', 'lungePx', 'parryThrow', 'absorbed', 'tumbled', 'evaded', 'beatVs', 'slipped', 'missTag', 'dodged'];
const M_DEF = { slowed: false, armorLeft: 0, press: '', dashIn: false, pen: 0, dvx: null, bounce: 0, bFly: 0, pick: '', holdKind: '', lungePx: null,
  parryThrow: false, absorbed: false, tumbled: false, evaded: false, beatVs: '', slipped: false, missTag: false, dodged: false };
function dumpF(F) {
  const o = SAVE_KEYS.map(k => F_NORM[k] ? F_NORM[k](F[k]) : F[k]);
  o.push(F.chain.join(','));
  o.push(STAT_KEYS.map(k => F.stats[k]));
  const m = F.move;
  o.push(m ? M_KEYS.map(k => { const v = m[k]; return v === undefined || v === null ? (k in M_DEF ? M_DEF[k] : v) : v; }) : null);
  const H = F.inp.held;
  o.push([H.left, H.right, H.up, H.down, H.block, !!F.inp.keyDash, F.inp.buf.map(e => [e.a, e.t])]);
  return o;
}
// 看的时候：数写成 64 位浮点的十六进制（小端），Godot 按位比
const HX = new Float64Array(1), HB = new Uint8Array(HX.buffer);
function hx(v) { if (typeof v !== 'number') return v === undefined ? null : v; HX[0] = v; let s = ''; for (let i = 0; i < 8; i++) s += HB[i].toString(16).padStart(2, '0'); return s; }
const hxAll = a => a.map(v => Array.isArray(v) ? hxAll(v) : hx(v));

// 这一帧发生了什么（给画面的）：飘字、印章、大字（fxDo 的签名：种类 + 字）、声音（Sound 的哪个、参数）
let EV = [];
const EV_TYPES = ['tag', 'stamp', 'announce'];
const fxDo0 = fxDo;
fxDo = function (sig, play) { if (EV_TYPES.some(t => sig.startsWith(t))) EV.push(sig); return fxDo0(sig, play); };
const evArg = v => typeof v === 'number' ? hx(v) : String(v);
for (const k of ['hit', 'block', 'whoosh', 'crash', 'tumble', 'stamp', 'land', 'clash', 'parry', 'burst', 'finale', 'victory', 'beat']) {
  const f = Sound[k];
  Sound[k] = function (...a) { EV.push('snd|' + k + '|' + a.map(evArg).join(',')); return f.apply(this, a); };
}
function record(inputs) {
  const ev = EV; EV = [];
  return [game.frame, game.freeze, game.phase, game.phaseT, game.timer, game.round, game.wins[0], game.wins[1], game.winner, game.timeScale,
    inputs[0], inputs[1], dumpF(F1), dumpF(F2), ev];
}
// 指纹：数按顺序放进一个 Float64Array，原始字节写成十六进制；其余（字串、真假、空、数组的括号）用「|」连起来，接在后面；
// 整个字串算 djb2（和 Godot 的 String.hash() 一样：h = h * 33 + 字符的码位）
function flat(v, nums, strs) {
  if (Array.isArray(v)) { strs.push('['); for (const x of v) flat(x, nums, strs); strs.push(']'); }
  else if (typeof v === 'number') { nums.push(v); strs.push('#'); }
  else if (v === null || v === undefined) strs.push('null');
  else strs.push(String(v));
}
const HEX2 = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
function frameCanon(rec) {
  const nums = [], strs = [];
  flat(rec, nums, strs);
  const b = new Uint8Array(new Float64Array(nums).buffer);
  let hex = '';
  for (let i = 0; i < b.length; i++) hex += HEX2[b[i]];
  return hex + '|' + strs.join('|');
}
function djb2(str) { let h = 5381; for (const ch of str) h = (Math.imul(h, 33) + ch.codePointAt(0)) >>> 0; return h; }
const frameHash = rec => djb2(frameCanon(rec));
function runScenario(cfg) {
  let s = cfg.seed >>> 0;
  Math.random = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  // 上一个场景留下的：reset() 不清的字段、attract 不走 startRound 不重设的流程（Godot 那边每个场景都是新的 GameSim）
  for (const F of [F1, F2]) { delete F.tumFly; delete F.slipEnd; }
  game.winner = -1; game.timer = ROUND_FRAMES; game.timeScale = 1; game.freeze = 0;
  const mode = cfg.mode, train = mode === 'train';
  game.trainQi = !!cfg.trainQi;
  F2.maxHp = train ? DUMMY_HP : MAX_HP;
  game.wins = [0, 0]; game.round = 1; game.paused = false; game.frame = 0;
  if (mode === 'attract') {
    game.mode = 'attract'; game.phase = 'attract'; game.phaseT = 0; game.endless = false;
    game.brains = [new Brain(F1, 'normal'), new Brain(F2, 'normal')];
    resetFighters();
  } else {
    game.mode = mode; game.endless = mode === 'pvp' || train;
    game.brains = train ? [null, new Dummy(F2, cfg.dummy || 'stand')]
      : [cfg.ai[0] ? makeBrain(F1, cfg.ai[0]) : null, cfg.ai[1] ? makeBrain(F2, cfg.ai[1]) : null];
    startRound();
    if (cfg.skipIntro || train) game.phase = 'fight';
  }
  const kd = cfg.keyDash || [false, false];
  const gens = [makeInputGen(cfg.inSeed[0], cfg.rate, kd[0]), makeInputGen(cfg.inSeed[1], cfg.rate, kd[1])];
  const hashes = [], full = {};
  EV = [];
  const w = cfg.window;
  for (let i = 0; i < cfg.frames; i++) {
    const inputs = [game.brains[0] ? 0 : gens[0](), game.brains[1] ? 0 : gens[1]()];
    step(inputs);
    const rec = record(inputs);
    hashes.push(frameHash(rec));
    if (w && i >= w[0] && i <= w[1]) full[i] = hxAll(rec);
    if (game.phase === 'over') break;
    if (w && i >= w[1]) break;
  }
  return { hashes, full };
}
window.runScenario = runScenario;
