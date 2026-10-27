// 声音：JS 版（src/js/fx.js 的 Sound）是浏览器里现合成的（WebAudio）。Godot 版先不重做音色（Jack：音效先不变，以后给新的），
// 这里把 JS 的每一种声音在无头 Chromium 里用 OfflineAudioContext 原样「录」成 wav（每种录几遍：JS 每次响都随机差一点），
// Godot 那边（game/sound_bank.gd）按名字挑一个放。
// JS 的总线：master 0.62 → 压缩器 → 音量（out，默认 50 那一档）→ 限幅。网页版 Godot 放声音走浏览器的「样本」模式，总线上不能挂效果器，
// 所以压缩、限幅按默认音量录进每一个 wav 里；Godot 只按 JS 的音量曲线调大小（gainFor(v) / gainFor(50)）。
// 用法：node tools/render_sfx.mjs ../src/js/fx.js assets/sfx
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const [, , fxPath, outDir] = process.argv;
const src = fs.readFileSync(fxPath, 'utf8');
const a = src.indexOf('const VOL_SHIFT');
const b = src.indexOf('const INTRO_BEATS');
if (a < 0 || b < 0) throw new Error('fx.js 里找不到 Sound 那一段');
const code = src.slice(a, b);

const SR = 44100;
const HIT_P = [0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1.0, 1.1, 1.2];
const WHOOSH_P = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const VARIANTS = 3;
const jobs = [];
const pk = p => String(Math.round(p * 100)).padStart(3, '0');
for (const p of HIT_P) for (let v = 0; v < VARIANTS; v++) jobs.push({ name: `hit-${pk(p)}-${v}`, fn: 'hit', args: [p], len: 1.2 });
for (const p of WHOOSH_P) for (let v = 0; v < VARIANTS; v++) jobs.push({ name: `whoosh-${pk(p)}-${v}`, fn: 'whoosh', args: [p], len: 1.0 });
for (const k of ['block', 'crash', 'tumble', 'stamp', 'land', 'clash', 'parry', 'burst']) for (let v = 0; v < VARIANTS; v++) jobs.push({ name: `${k}-${v}`, fn: k, args: [], len: 1.5 });
for (let v = 0; v < 2; v++) jobs.push({ name: `finale-${v}`, fn: 'finale', args: [], len: 3.0 });
jobs.push({ name: 'victory-win-0', fn: 'victory', args: [true], len: 5.0 });
jobs.push({ name: 'victory-lose-0', fn: 'victory', args: [false], len: 5.0 });
// 开场的鼓：每件家伙按力度 1 录（放的时候按力度调音量）
for (const k of ['taiko', 'taikoLo', 'rim', 'cha', 'qiang', 'zhengUp', 'zhengChord']) for (let v = 0; v < (k === 'taiko' ? VARIANTS : 2); v++) jobs.push({ name: `beat-${k}-${v}`, fn: k, args: [1, 0], len: k.startsWith('zheng') || k === 'cha' || k === 'qiang' ? 3.0 : 1.5 });
for (let v = 0; v < 2; v++) jobs.push({ name: `ui-${v}`, fn: 'muyu', args: [1, 0], len: 0.5 });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await browser.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
await page.setContent('<!doctype html><title>sfx</title>');
await page.addScriptTag({ content: `
const game = { mode: 'pve', quiet: false };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
${code}
Sound.ok = () => true;
window.renderOne = async (job, seed, SR) => {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * job.len), SR);
  Sound.ctx = ctx;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
  const out = ctx.createGain(); out.gain.value = Sound.gainFor(50);
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
  comp.connect(out); out.connect(lim); lim.connect(ctx.destination);
  Sound.master = ctx.createGain(); Sound.master.gain.value = 0.62; Sound.master.connect(comp);
  // 噪声（JS 一开游戏用固定种子生成一次，所有声音共用这一段）
  sndSeed = 0x2545f491;
  const nb = ctx.createBuffer(1, SR, SR), nd = nb.getChannelData(0);
  for (let i = 0; i < SR; i++) nd[i] = srnd() * 2 - 1;
  Sound.noise = nb;
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 3.2); }
  Sound.curve = curve;
  Sound.zbuf = {};
  sndSeed = seed >>> 0;
  Sound[job.fn].apply(Sound, job.args);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  let end = d.length - 1;
  while (end > 0 && Math.abs(d[end]) < 1e-4) end--;
  end = Math.min(d.length, end + Math.round(SR * 0.02));
  let peak = 0;
  const pcm = new Int16Array(end);
  for (let i = 0; i < end; i++) { const x = Math.max(-1, Math.min(1, d[i])); if (Math.abs(x) > peak) peak = Math.abs(x); pcm[i] = Math.round(x * 32767); }
  // 头 44 字节的 wav 头
  const bytes = new Uint8Array(44 + pcm.length * 2), dv = new DataView(bytes.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(bytes.buffer, 44).set(pcm);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { b64: btoa(s), sec: end / SR, peak };
};
` });
fs.mkdirSync(outDir, { recursive: true });
const manifest = {};
let total = 0;
for (let i = 0; i < jobs.length; i++) {
  const job = jobs[i];
  const seed = (0x9e3779b9 * (i + 1)) >>> 0;
  const r = await page.evaluate(([j, s, sr]) => window.renderOne(j, s, sr), [job, seed, SR]);
  const buf = Buffer.from(r.b64, 'base64');
  fs.writeFileSync(path.join(outDir, job.name + '.wav'), buf);
  total += buf.length;
  manifest[job.name] = Math.round(r.sec * 1000) / 1000;
  if (r.peak > 0.99) console.log('注意：', job.name, '削波了', r.peak);
}
fs.writeFileSync(path.join(outDir, 'sfx.json'), JSON.stringify({ hit: HIT_P, whoosh: WHOOSH_P, files: manifest }, null, 1));
console.log('录了', jobs.length, '个，共', Math.round(total / 1024), 'KB');
await browser.close();
