// 用 Playwright 开无头 Chromium 跑 JS 版的场景，每帧一个状态指纹写成 JSON（Godot 版拿去比，tests/diff_trace.gd）
// 用法：node run_ref.mjs 场景.json 输出.json                  全部场景，只要指纹
//       node run_ref.mjs 场景.json 输出.json 第几个 从 到        只跑这一个场景，从「从」到「到」帧的全部字段也要回来（看哪儿对不上）
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
const [, , cfgPath, outPath, only, w0, w1] = process.argv;
let cfgs = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
if (only !== undefined) cfgs = [Object.assign({}, cfgs[+only], { window: [+w0, +w1], index: +only })];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto('file://' + path.resolve(path.dirname(new URL(import.meta.url).pathname), 'ref.html'));
const results = [];
for (const cfg of cfgs) {
  const t0 = Date.now();
  const r = await page.evaluate(c => window.runScenario(c), cfg);
  console.log(cfg.name, 'frames', r.hashes.length, 'ms', Date.now() - t0);
  results.push({ cfg, hashes: r.hashes, full: r.full });
}
fs.writeFileSync(outPath, JSON.stringify(results));
await browser.close();
