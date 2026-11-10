// 4.0 平衡实验室的驱动（页面里的函数在 js/lab.js）：开几个无头 Chrome 一起跑，量什么、量多少在这里定。
// 用法（在 src/ 里）：node tools/lab.mjs <tricks|tiers|ladder|ledger|combos|all> [--styles trad,wc] [--levels hard,hell] [--workers 2] [--out 目录] [--quick]
// 要 playwright 和一个 Chrome：PLAYWRIGHT=/…/node_modules/ CHROME=/usr/bin/google-chrome（不写就找常见的位置）
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(here, '..');
const req = createRequire(process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/');
const { chromium } = req('playwright');
const CHROME = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
const args = process.argv.slice(2), cmd = args[0] || 'all';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const QUICK = args.includes('--quick');
const STYLES = opt('styles', 'trad,wc,taiji,mantis').split(',');
const WORKERS = +opt('workers', Math.max(1, Math.min(4, os.cpus().length)));
const OUT = opt('out', path.join(os.tmpdir(), 'modou-lab'));
fs.mkdirSync(OUT, { recursive: true });
const NAME = { trad: '格斗术', wc: '咏春拳', taiji: '太极拳', mantis: '螳螂拳' };
const LV = { novice: '入门', easy: '简单', normal: '中等', hard: '困难', hell: '终极', max: '满级' };
const pct = x => (x * 100).toFixed(1);

/* ---------- 几个页面一起跑 ---------- */
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const pages = [];
for (let i = 0; i < WORKERS; i++) {
  const p = await browser.newPage();
  p.on('pageerror', e => console.error('页面报错：' + e.message));
  await p.goto('file://' + SRC + '/balance.html#norun');
  await p.waitForFunction(() => typeof labRun === 'function');
  pages.push(p);
}
const RULES = await pages[0].evaluate(() => LAB_RULES);
// jobs：[{ fn, arg }]，返回一样顺序的结果
async function runAll(jobs, label) {
  const out = new Array(jobs.length); let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(pages.map(async p => {
    for (;;) {
      const i = next++; if (i >= jobs.length) return;
      out[i] = await p.evaluate(([fn, arg]) => window[fn](...arg), [jobs[i].fn, jobs[i].arg]);
      if (++done % 200 === 0 && label) process.stderr.write(`  ${label} ${done}/${jobs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
    }
  }));
  return out;
}
const mean = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = xs => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, xs.length - 1)); };
// 95% 置信区间半宽（t 分布的近似：n 小的时候放宽）
const T95 = [0, 12.7, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16, 2.14, 2.13];
const half = xs => (T95[xs.length - 1] || 1.98) * sd(xs) / Math.sqrt(xs.length);

/* ---------- 一招鲜筛查（淘汰赛） ---------- */
async function tricks() {
  const levels = opt('levels', 'normal,hard,hell').split(','), cpus = opt('cpu', STYLES.join(',')).split(',');
  const report = [], rows = [];
  for (const S of STYLES) {
    const pats = await pages[0].evaluate(s => labPatterns(s), S);
    for (const C of cpus) for (const L of levels) {
      // 尺：乱换招的机器人（这一派所有套路里乱挑，不防守）打这一档
      const baseJobs = []; for (let sd0 = 1; sd0 <= (QUICK ? 3 : 6); sd0++) baseJobs.push({ fn: 'labRun', arg: [{ styles: [S, C], who: [{ pats: 'all' }, L], frames: 4800, seed: 100 + sd0 }] });
      const base = mean((await runAll(baseJobs)).map(r => r.share));
      const line = Math.min(RULES.trick.cap[L] || 0.6, base + RULES.trick.margin);
      const job = (p, seed, frames) => ({ fn: 'labRun', arg: [{ styles: [S, C], who: [{ pats: [p] }, L], frames, seed }] });
      // 第一轮：每一套跑一小段
      const net = r => (r.dealt[0] - r.dealt[1]) / r.frames * 3600;       // 每分钟净赚多少血（占比高但两边都没打着几下的不算一招鲜：光看占比，跳过来被挡住削 3 点也是九成五）
      let cand = pats.map(p => ({ p, xs: [], ns: [] }));
      (await runAll(cand.map(c => job(c.p, 7, 2400)))).forEach((r, i) => { cand[i].xs.push(r.share); cand[i].ns.push(net(r)); });
      cand.sort((a, b) => mean(b.xs) - mean(a.xs));
      const first = cand.map(c => [c.p.join(' '), mean(c.xs)]);
      cand = cand.filter((c, i) => i < 6 || mean(c.xs) >= line - 0.14);
      // 第二轮：剩下的加 3 个种子、跑长一倍
      for (const seed of [11, 12, 13]) (await runAll(cand.map(c => job(c.p, seed, 4800)))).forEach((r, i) => { cand[i].xs.push(r.share); cand[i].ns.push(net(r)); });
      cand.sort((a, b) => mean(b.xs.slice(1)) - mean(a.xs.slice(1)));
      cand = cand.filter((c, i) => i < 3 || mean(c.xs.slice(1)) >= line - 0.05);
      // 第三轮：再加 8 个种子，给置信区间（头一轮那一小段不算进去）
      if (!QUICK) for (let seed = 21; seed <= 28; seed++) (await runAll(cand.map(c => job(c.p, seed, 4800)))).forEach((r, i) => { cand[i].xs.push(r.share); cand[i].ns.push(net(r)); });
      // 过线 = 占比的整个置信区间都在线上面，而且真的赚得着：每分钟净赚 RULES.trick.net 血以上（一回合 400 血）
      const fin = cand.map(c => { const xs = c.xs.slice(1), m = mean(xs), h = half(xs), nt = mean(c.ns.slice(1)); return { pat: c.p.join(' '), m, h, net: nt, n: xs.length, over: m - h > line && nt >= RULES.trick.net, sus: m > line && nt >= RULES.trick.net * 0.6 }; }).sort((a, b) => b.net - a.net);
      const bad = fin.filter(x => x.over), sus = fin.filter(x => x.sus && !x.over);
      rows.push({ S, C, L, base, line, top: fin.slice(0, 5), bad, sus, first: first.slice(0, 8) });
      report.push(`${NAME[S]} 打 ${NAME[C]}·${LV[L]}：乱换招 ${pct(base)}%，线 ${pct(line)}%；最赚的 ${fin.slice(0, 3).map(x => `${x.pat} ${pct(x.m)}±${pct(x.h)}（每分钟净 ${x.net.toFixed(0)}）`).join(' · ')}` +
        (bad.length ? `  ✗ 过线：${bad.map(x => x.pat).join('、')}` : sus.length ? `  ? 可疑：${sus.map(x => x.pat).join('、')}` : '  ✓'));
      process.stderr.write(report[report.length - 1] + '\n');
    }
  }
  fs.writeFileSync(path.join(OUT, 'tricks.json'), JSON.stringify(rows, null, 1));
  return report;
}

/* ---------- 四派两两、每一档（顺序采样） ---------- */
// 一个种子一个样本：左右各站一次，A 打掉的血占几成
async function cell(A, B, whoA, whoB, o = {}) {
  const xs = [], lo = RULES.tier.lo, hi = RULES.tier.hi, maxN = o.maxN || (QUICK ? 8 : 28), tol = o.tol || 0.02;
  let seed = o.seed0 || 1;
  for (;;) {
    const jobs = [];
    for (let i = 0; i < 4; i++, seed++) {
      jobs.push({ fn: 'labRun', arg: [{ styles: [A, B], who: [whoA, whoB], rounds: o.rounds || 2, seed: seed * 2 + 1 }] });
      jobs.push({ fn: 'labRun', arg: [{ styles: [B, A], who: [whoB, whoA], rounds: o.rounds || 2, seed: seed * 2 + 2 }] });
    }
    const rs = await runAll(jobs);
    for (let i = 0; i < rs.length; i += 2) xs.push((rs[i].share + (1 - rs[i + 1].share)) / 2);
    const m = mean(xs), h = half(xs);
    // 够了：区间够窄；或者整个区间已经在线里 / 整个在线外（再跑结论也不变）
    if (xs.length >= 8 && (h <= tol || (o.band !== false && ((m - h >= lo && m + h <= hi) || m + h < lo || m - h > hi)))) return { m, h, n: xs.length };
    if (xs.length >= maxN) return { m, h, n: xs.length };
  }
}
async function tiers() {
  const levels = opt('levels', 'normal,hard,hell,max').split(','), report = [], rows = [];
  for (let i = 0; i < STYLES.length; i++) for (let j = i + 1; j < STYLES.length; j++) {
    const A = STYLES[i], B = STYLES[j], cells = [];
    // 满级不套线：满级对满级量的是各派的「上限」，Jack 定的形状本来就不一样高（咏春最高，见 MANTIS.md 第二节），只列数
    for (const L of levels) { const c = await cell(A, B, L, L, L === 'max' ? { band: false, maxN: QUICK ? 8 : 20 } : {}); cells.push(Object.assign({ L }, c)); }
    rows.push({ A, B, cells });
    report.push(`${NAME[A]} 打 ${NAME[B]}：` + cells.map(c => `${LV[c.L]} ${pct(c.m)}±${pct(c.h)}（${c.n}）${c.L === 'max' ? '' : c.m - c.h > RULES.tier.hi || c.m + c.h < RULES.tier.lo ? '✗' : c.m > RULES.tier.hi || c.m < RULES.tier.lo ? '?' : ''}`).join(' · '));
    process.stderr.write(report[report.length - 1] + '\n');
  }
  fs.writeFileSync(path.join(OUT, 'tiers.json'), JSON.stringify(rows, null, 1));
  return report;
}

/* ---------- 人机六档：乱换招的机器人（格斗术，三成机会举手、三成机会猜一个键拆）打每一派每一档 ---------- */
async function ladder() {
  const levels = opt('levels', 'novice,easy,normal,hard,hell,max').split(','), report = [], rows = [];
  const bot = { pats: 'all', guard: 0.3, brk: 0.3 };
  for (const C of STYLES) {
    const cells = [];
    for (const L of levels) { const c = await cell('trad', C, bot, L, { band: false, tol: 0.025, maxN: QUICK ? 8 : 20 }); cells.push(Object.assign({ L }, c)); }
    rows.push({ C, cells });
    let ok = true; for (let i = 1; i < cells.length; i++) if (cells[i].m > cells[i - 1].m + 0.01) ok = false;
    for (const c of cells) if (RULES.ladder[c.L] !== undefined && c.m < RULES.ladder[c.L]) ok = false;
    report.push(`乱换招的机器人打 ${NAME[C]}：` + cells.map(c => `${LV[c.L]} ${pct(c.m)}±${pct(c.h)}`).join(' · ') + (ok ? '  ✓' : '  ✗'));
    process.stderr.write(report[report.length - 1] + '\n');
  }
  fs.writeFileSync(path.join(OUT, 'ladder.json'), JSON.stringify(rows, null, 1));
  return report;
}

/* ---------- 每一招的账：同一档对打（默认满级），每一派打每一派（含自己） ---------- */
async function ledger() {
  const L = opt('level', 'max'), seeds = QUICK ? 2 : 4, report = [], agg = {};
  const jobs = [];
  for (const A of STYLES) for (const B of STYLES) for (let s = 1; s <= seeds; s++) jobs.push({ fn: 'labRun', arg: [{ styles: [A, B], who: [L, L], rounds: 4, seed: 300 + s, ledger: true }] });
  const rs = await runAll(jobs, '账');
  let q = 0;
  for (const A of STYLES) for (const B of STYLES) for (let s = 1; s <= seeds; s++) {
    const r = rs[q++];
    [[A, r.led[0]], [B, r.led[1]]].forEach(([st, led]) => {
      const g = agg[st] || (agg[st] = { moves: {}, combos: [], brk: 0, brkMiss: 0, sup: 0, supDmg: 0, dmg: 0, rounds: 0 });
      for (const [n, m] of Object.entries(led.moves)) { const x = g.moves[n] || (g.moves[n] = { use: 0, hit: 0, blk: 0, dmg: 0 }); x.use += m.use; x.hit += m.hit; x.blk += m.blk; x.dmg += m.dmg; g.dmg += m.dmg; }
      g.combos.push(...led.combos); g.brk += led.brk; g.brkMiss += led.brkMiss; g.sup += led.sup; g.supDmg += led.supDmg; g.rounds += r.rounds;
    });
  }
  const labels = await pages[0].evaluate(() => Object.fromEntries(Object.keys(STYLES).map(s => [s, Object.fromEntries(Object.entries(STYLES[s].moves).map(([n, d]) => [n, d.label]))])));
  for (const st of STYLES) {
    const g = agg[st], ms = Object.entries(g.moves).sort((a, b) => b[1].dmg - a[1].dmg), top = ms[0];
    const cl = g.combos.map(c => c[0]), long = cl.filter(n => n >= 5).length, c3 = cl.filter(n => n >= 3).length;
    const supHit = ms.filter(([n]) => /^(super|wSup)/.test(n)).reduce((a, [, m]) => a + m.hit, 0);
    report.push(`${NAME[st]}（${LV[L]}对${LV[L]}，${g.rounds} 回合）：伤害最多的 ` + ms.slice(0, 6).map(([n, m]) => `${labels[st][n] || n} ${pct(m.dmg / g.dmg)}%（出 ${m.use} 中 ${m.hit}）`).join(' · ') +
      `；最大的一招占 ${pct(top[1].dmg / g.dmg)}% ${top[1].dmg / g.dmg > RULES.top ? '✗' : '✓'}；连招 ${cl.length} 套，平均 ${mean(cl).toFixed(2)} 下，三下以上 ${c3}、五下以上 ${long}；` +
      `拆招 拆开 ${g.brk} / 读错 ${g.brkMiss}；大招 ${g.sup} 次、打中 ${supHit} 下、共 ${g.supDmg} 血（一次平均 ${(g.supDmg / Math.max(1, g.sup)).toFixed(1)}）`);
    process.stderr.write(report[report.length - 1] + '\n');
  }
  fs.writeFileSync(path.join(OUT, 'ledger.json'), JSON.stringify(agg, null, 1));
  return report;
}

/* ---------- 连招的账 ---------- */
async function combos() {
  const report = [], rows = [];
  const rs = await runAll(STYLES.flatMap(s => [70, 95].map(d => ({ fn: 'labCombos', arg: [s, d, 8] }))));
  for (let i = 0; i < STYLES.length; i++) {
    const st = STYLES[i], near = rs[i * 2], far = rs[i * 2 + 1], sure = near.sure, b = near.best, lens = Object.keys(b).map(Number), maxN = Math.max(...lens);
    const dSure = b[Math.min(sure, maxN)].dmg, dFull = Math.max(...lens.map(n => b[n].dmg));
    // 算上被拆：实连那几下必中；再往后那一下他三个键里猜一个 —— 三分之一拆开（后面的没了），三分之二读错（那一下 ×1.25，后面照连）
    const ev = dSure + (2 / 3) * (dFull - dSure) * 1.03;
    rows.push({ st, near, far });
    report.push(`${NAME[st]}：实连 ${sure} 下最多 ${dSure}（${b[Math.min(sure, maxN)].names.join(' ')}）；最长 ${maxN} 下、最疼 ${dFull}；每个长度最疼 ` + lens.map(n => `${n}:${b[n].dmg}`).join(' ') +
      `；算上被拆平均 ${ev.toFixed(0)}；相距 95 起手最疼 ${Math.max(...Object.values(far.best).map(x => x.dmg))}`);
    process.stderr.write(report[report.length - 1] + '\n');
  }
  fs.writeFileSync(path.join(OUT, 'combos.json'), JSON.stringify(rows, null, 1));
  return report;
}

const t0 = Date.now(), all = { combos, ledger, ladder, tiers, tricks }, out = [];
for (const k of cmd === 'all' ? Object.keys(all) : cmd.split(',')) { if (!all[k]) { console.error('没有这一项：' + k); continue; } out.push('## ' + k, ...(await all[k]()), ''); }
console.log(out.join('\n'));
console.error(`用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒，${WORKERS} 个页面；细的在 ${OUT}`);
await browser.close();
