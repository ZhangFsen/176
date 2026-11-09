// 启动冒烟测试：用宽松 DOM 桩执行整段内联脚本，确认初始化不抛错
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/../app/src/main/assets/index.html', 'utf8');
const src = html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/)[1];

const store = new Map();
const localStorage = new Proxy({}, {
  get(t, k) {
    if (k === 'getItem') return k2 => (store.has(k2) ? store.get(k2) : null);
    if (k === 'setItem') return (k2, v) => store.set(k2, String(v));
    if (k === 'removeItem') return k2 => store.delete(k2);
    if (k === 'key') return i => Array.from(store.keys())[i];
    if (k === 'length') return store.size;
    if (typeof k === 'string') return store.has(k) ? store.get(k) : undefined;
  },
  set(t, k, v) { if (typeof k === 'string') store.set(k, String(v)); return true; },
  has() { return true; },
});

const state = {};
function el(path = 'el') {
  if (state[path]) return state[path];
  const target = function () {};
  const proxy = new Proxy(target, {
    get(t, k) {
      if (k === 'innerHTML' || k === 'textContent' || k === 'value' || k === 'className' || k === 'id') return state[path + '.' + k] || '';
      if (k === 'classList') return classList(path);
      if (k === 'style') return styleObj(path);
      if (k === 'dataset') return {};
      if (k === 'children' || k === 'childNodes') return [];
      if (k === 'length') return 0;
      if (k === 'parentNode' || k === 'parentElement' || k === 'firstChild' || k === 'nextSibling') return null;
      if (k === 'offsetHeight' || k === 'offsetWidth' || k === 'clientHeight' || k === 'scrollHeight' || k === 'scrollWidth') return 300;
      if (k === 'scrollTop' || k === 'scrollLeft') return 0;
      if (k === 'tagName') return 'DIV';
      if (k === Symbol.iterator) return function* () {};
      if (k === 'toString' || k === 'valueOf') return () => '[el]';
      if (typeof k === 'symbol') return undefined;
      return el(path + '.' + String(k));
    },
    set(t, k, v) { state[path + '.' + String(k)] = v; return true; },
    has() { return true; },
    apply() { return el(path + '()'); },
    construct() { return el(path + 'new'); },
  });
  state[path] = proxy;
  return proxy;
}
function classList(path) {
  const p = path + '.classList';
  if (!state[p]) {
    const set = new Set();
    state[p] = {
      add: (...c) => c.forEach(x => set.add(x)),
      remove: (...c) => c.forEach(x => set.delete(x)),
      toggle: (c, f) => (f === undefined ? (set.has(c) ? set.delete(c) : set.add(c)) : (f ? set.add(c) : set.delete(c))),
      contains: c => set.has(c),
    };
  }
  return state[p];
}
function styleObj(path) {
  const p = path + '.style';
  if (!state[p]) state[p] = new Proxy({}, { get: (t, k) => t[k] || '', set: (t, k, v) => { t[k] = v; return true; } });
  return state[p];
}

const document = {
  getElementById: id => el('#' + id),
  querySelector: s => el('q' + s),
  querySelectorAll: () => [],
  createElement: () => el('created'),
  addEventListener: () => {},
  removeEventListener: () => {},
  body: el('body'),
  documentElement: el('html'),
  head: el('head'),
  activeElement: null,
  createTextNode: () => el('text'),
};

const ctx = {
  localStorage, document, console,
  navigator: { userAgent: 'node', platform: 'node' },
  location: { href: 'file:///index.html', search: '', hash: '' },
  innerWidth: 400, innerHeight: 800,
  devicePixelRatio: 2,
  requestAnimationFrame: fn => { try { fn(0); } catch (e) { throw e; } },
  setTimeout: (fn) => { /* 不执行延时任务，避免依赖真实时序 */ return 0; },
  clearTimeout: () => {},
  setInterval: () => 0, clearInterval: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  alert: () => {}, confirm: () => true, prompt: () => '',
  Audio: function () { return { play: () => {}, currentTime: 0 }; },
  Image: function () { return el('img'); },
  matchMedia: () => ({ matches: false, addListener: () => {}, addEventListener: () => {} }),
  addEventListener: () => {},
  removeEventListener: () => {},
  encodeURIComponent, decodeURIComponent, JSON, Math, Date, Number, String, Array, Object, RegExp, Set, Map, isNaN, parseFloat, parseInt,
};
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.self = ctx;

vm.createContext(ctx);
try {
  vm.runInContext(src, ctx, { filename: 'index.html<script>' });
} catch (e) {
  console.error('启动冒烟失败：' + e.message);
  console.error(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}

console.log('PASS 整段脚本初始化无异常（顶层执行完毕）');
console.log('  版本常量：', ctx.nativeVersionInfo().versionName, '/', ctx.nativeVersionInfo().versionCode);
console.log('  默认支出分类：', vm.runInContext('DEFAULT_EXPENSE_CATS.map(c=>c[0]).join(" ")', ctx));
console.log('  默认收入分类：', vm.runInContext('DEFAULT_INCOME_CATS.map(c=>c[0]).join(" ")', ctx));
console.log('  分类图标函数：', vm.runInContext('typeof categoryIconHtml', ctx));
