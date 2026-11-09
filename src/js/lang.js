'use strict';
/* ============================================================
   3.5 语言：中文 / English（Jack：设置里能换英文；换成英文以后界面、教程、说明都是英文的）
   · 中文还是原文，照旧写在代码里；英文是一张对照表 EN_TEXT（js/lang_en.js）：中文 → 英文。
     表里没有的照样显示中文，tests.html 的「英文」那几条测试会把漏的一条一条列出来 —— 加了新的中文，就去 lang_en.js 补一行英文
   · 换语言：存在 localStorage「modou.lang」，然后重新载入页面（只在主菜单的设置里换；打着的时候不换）。网址带 ?lang=en / ?lang=zh 也行；
     3.5.1 起没选过的跟着浏览器的语言（browserLang）
   · 页面上的字（index.html 写死的、ui.js / guide.js 塞进去的）：英文时 L10N 先把整页换一遍，之后 MutationObserver 看着，新塞进来的自动换
   · 画在画布上的字（血条、飘字、大字、训练场面板……）：画之前过一遍 TR()
   · 表里的键可以带 {0} {1}：「成功 {0} 次」对得上「成功 3 次」；{0} 抓到的字再查一遍表（「下一课：{0} · {1}」两段都换）；
     写成 {r0} 的不查表、照原样放（房间码是玩家自己打的字）
   · 整句对不上的，按「 · 」「、」「：」「 / 」拆开一段一段查
   · 不换的：印章（水墨的味道；英文时下面另写一行小字，见 render.js drawSeal）、标题「墨斗」、写了 translate="no" 的元素
   ============================================================ */
const LANGS = ['zh', 'en'];
// 3.5.1 跟着浏览器的语言（Jack：根据浏览器的语言，进去默认那个语言）：顺着用户在浏览器 / 系统里排的语言往下找，
// 先碰到中文（简体、繁体都算）就中文，先碰到英文就英文；都对不上（日语、法语……）给英文；什么都读不到才中文
function browserLang(list) {
  const L = Array.from(list || []).map(t => String(t || '').trim().toLowerCase()).filter(Boolean);
  for (const s of L) { if (s.startsWith('zh')) return 'zh'; if (s.startsWith('en')) return 'en'; }
  return L.length ? 'en' : 'zh';
}
// 用哪种：固定的（测试、动作台、平衡报告）> 网址 ?lang= > 设置里自己选过的 > 浏览器的语言。
// 网址、设置里选的存起来（modou.lang）；跟着浏览器判断出来的不存 —— 没选过的人换了浏览器语言，游戏跟着变
function pickLang(o) {
  for (const v of [o.forced, o.query, o.saved]) if (LANGS.includes(v)) return v;
  return browserLang(o.langs);
}
let LANG = (() => {
  const o = {};
  if (typeof window !== 'undefined') o.forced = window.MODOU_LANG;
  try { o.query = new URLSearchParams(location.search).get('lang'); } catch (e) {}
  if (!LANGS.includes(o.forced) && LANGS.includes(o.query)) { try { localStorage.setItem('modou.lang', o.query); } catch (e) {} }
  try { o.saved = localStorage.getItem('modou.lang'); } catch (e) {}
  try { o.langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]; } catch (e) {}
  return pickLang(o);
})();
// 英文：页面先藏着，L10N 把字换成英文再露出来（不闪一下中文）；万一没换成，3 秒后也露出来。
// 3.5.1 起 lang.js 在 <head> 里载入（以前是 index.html 头上一小段自己判断一遍，两处容易对不上）
if (LANG === 'en' && typeof document !== 'undefined' && document.documentElement) {
  const html = document.documentElement;
  html.lang = 'en'; html.classList.add('l10n-wait');
  setTimeout(() => html.classList.remove('l10n-wait'), 3000);
}
const EN = typeof EN_TEXT !== 'undefined' ? EN_TEXT : {};
const HAN_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff01-\uff60]/;   // 汉字 + 中文标点（「、」「（」「～」单独一段也要换）
const T_CACHE = new Map();
const T_MISS = new Set();          // 英文时没查到的中文（测试、调试看）
let T_PATS = null;                 // 带 {n} 的键：第一次用到时编成正则

function tPats() {
  if (T_PATS) return T_PATS;
  T_PATS = { head: new Map(), any: [] };
  for (const k of Object.keys(EN)) {
    if (!/\{r?\d\}/.test(k) || /\}\{/.test(k)) continue;       // 两个 {} 挨着的（Tf 用的「{0}{0}」）当不了对照的模板
    const order = [], raw = [];
    const src = k.split(/(\{r?\d\})/).map(part => {
      const m = /^\{(r?)(\d)\}$/.exec(part);
      if (m) { order.push(+m[2]); raw.push(!!m[1]); return '([\\s\\S]+?)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    const p = { re: new RegExp('^' + src + '$'), order, raw, val: EN[k], lit: k.replace(/\{r?\d\}/g, '').length };
    if (k[0] === '{') T_PATS.any.push(p);
    else { if (!T_PATS.head.has(k[0])) T_PATS.head.set(k[0], []); T_PATS.head.get(k[0]).push(p); }
  }
  for (const l of [...T_PATS.head.values(), T_PATS.any]) l.sort((a, b) => b.lit - a.lit);   // 字多的（更具体的）先试
  return T_PATS;
}
// 拆开查：分隔符 → 英文里换成什么
const T_SEPS = [[' · ', ' · '], ['·', ' · '], ['、', ', '], ['：', ': '], [' / ', ' / '], ['／', ' / '], ['\n', '\n'], ['；', '; ']];
// 查一句：查不到返回 null
function tFind(s) {
  if (!HAN_RE.test(s)) return s;
  const v = EN[s];
  if (v !== undefined) return v;
  const w = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);                   // 前后的空白照留
  if (w[1] || w[3]) { const t = tFind(w[2]); return t == null ? null : w[1] + t + w[3]; }
  const P = tPats();
  for (const list of [P.head.get(s[0]), P.any]) {
    if (!list) continue;
    for (const p of list) {
      const m = p.re.exec(s);
      if (!m) continue;
      const caps = m.slice(1).map((c, j) => p.raw[j] ? c : tFind(c));   // {r0}：抓到的照原样放（玩家自己打的房间码）
      if (caps.some(c => c == null)) continue;                        // 抓到的那一段查不到：不算对上（「{0}帧」别把一整句没翻的中文吞进去）
      return p.val.replace(/\{(\d)\}/g, (_, i) => caps[p.order.indexOf(+i)]);
    }
  }
  for (const [sep, to] of T_SEPS) {
    if (!s.includes(sep)) continue;
    const parts = s.split(sep).map(x => x === '' ? '' : tFind(x));
    if (parts.every(x => x != null)) return parts.join(to);
  }
  return null;
}
// 显示用的字过一遍这个：中文时原样返回；英文时查表，查不到也原样返回（记进 T_MISS）
function TR(s) {
  if (LANG !== 'en' || typeof s !== 'string' || !HAN_RE.test(s)) return s;
  let r = T_CACHE.get(s);
  if (r === undefined) {
    r = tFind(s);
    if (r == null) { T_MISS.add(s); r = s; }
    if (T_CACHE.size >= 5000) T_CACHE.clear();      // 3.5.1 带数字的句子（血量、帧数、倒数……）每种都记一条：记多了清掉重来，不一直涨
    T_CACHE.set(s, r);
  }
  return r;
}
// 代码里拼的句子：Tf('成功 {0} 次', n) —— 中文、英文都照模板填，{0} 里的字也过一遍 TR（同一个 {0} 能用两次：「{0}{0}」）
function Tf(key, ...args) { return (LANG === 'en' && EN[key] !== undefined ? EN[key] : key).replace(/\{(\d)\}/g, (_, i) => TR(String(args[+i] == null ? '' : args[+i]))); }
// 同一个中文在不同地方英文不一样时：先查「场合|中文」，没有再按普通的查
function Tc(ctx, s) { return LANG === 'en' && EN[ctx + '|' + s] !== undefined ? EN[ctx + '|' + s] : TR(s); }
// 设置里换语言：存起来、去掉网址里的 ?lang=、重新载入（重载以后自动再打开设置面板，见 ui.js）
function setLang(l) {
  if (!LANGS.includes(l)) return;
  try { localStorage.setItem('modou.lang', l); sessionStorage.setItem('modou.reopen', 'settings'); } catch (e) {}
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); history.replaceState(null, '', u.href); }
  } catch (e) {}
  location.reload();
}
// 测试用：不重载、当场换（清掉缓存）
function setLangLive(l) { LANG = l; T_CACHE.clear(); T_PATS = null; }

/* ---------- 页面上的字 ---------- */
const L10N = {
  ATTRS: ['title', 'placeholder', 'aria-label'],
  skipTag: /^(SCRIPT|STYLE|NOSCRIPT)$/,
  done: new WeakMap(),                 // 换过的节点 → 换成了什么（英文里故意留的中文 —— 房间码、「势」字 —— 不再查第二遍）
  // 文字：输入框里的字是玩家/程序填的内容，不碰；属性（placeholder 之类）：输入框的也要换
  kept(el) { return !!(el && el.closest && el.closest('[translate="no"],script,style,textarea')); },
  keptA(el) { return !!(el && el.closest && el.closest('[translate="no"],script,style')); },
  // 已经是英文、只是里面故意留了一两个中文字（教程里的「势」字、玩家打的中文房间码）：不再查表
  english(v) { return (v.match(/[A-Za-z]/g) || []).length >= 15 && (v.match(/[\u3400-\u9fff]/g) || []).length <= 3; },
  text(n) {
    const v = n.nodeValue;
    if (!v || !HAN_RE.test(v) || this.done.get(n) === v || this.english(v) || this.kept(n.parentElement)) return;
    const t = TR(v);
    this.done.set(n, t);
    if (t !== v) n.nodeValue = t;
  },
  attrs(el) {
    if (!el.getAttribute) return;
    for (const a of this.ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !HAN_RE.test(v) || this.english(v) || this.keptA(el)) continue;
      const seen = this.done.get(el);
      if (seen && seen[a] === v) continue;
      const t = TR(v);
      this.done.set(el, Object.assign(seen || {}, { [a]: t }));
      if (t !== v) el.setAttribute(a, t);
    }
  },
  tree(root) {
    if (root.nodeType === 3) return this.text(root);
    if (root.nodeType !== 1 || this.keptA(root)) return;
    this.attrs(root);
    const skip = this.skipTag;
    const walk = document.createTreeWalker(root, 5 /* 元素 + 文字 */, {
      acceptNode: n => n.nodeType === 1 && (skip.test(n.tagName) || n.getAttribute('translate') === 'no') ? 2 /* 整棵跳过 */ : 1,
    });
    for (let n = walk.nextNode(); n; n = walk.nextNode()) { if (n.nodeType === 3) this.text(n); else this.attrs(n); }
  },
  start() {
    if (LANG !== 'en' || typeof document === 'undefined' || !document.body) return;
    const html = document.documentElement;
    html.lang = 'en';
    document.title = 'Modou · 墨斗';
    this.tree(document.body);
    new MutationObserver(list => {
      for (const r of list) {
        if (r.type === 'childList') { for (const n of r.addedNodes) this.tree(n); }
        else if (r.type === 'characterData') this.text(r.target);
        else this.attrs(r.target);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: this.ATTRS });
    html.classList.remove('l10n-wait');                // 上面先把页面藏着，换完再露出来（不闪一下中文）
  },
};
// 在 <head> 里载入的时候页面还没有 body：等页面读完（游戏的脚本都跑完了）整页换一遍，之后 MutationObserver 接着看
if (typeof document !== 'undefined' && !document.body) document.addEventListener('DOMContentLoaded', () => L10N.start(), { once: true });
else L10N.start();
