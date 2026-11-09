// v6.21 分类合并语义测试：在 Node vm 中直接运行 index.html 里的真实函数
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/../app/src/main/assets/index.html', 'utf8');

// ---- 从 HTML 中精确切出需要的代码块 -------------------------------------
function sliceFrom(startMark, endMark) {
  const i = html.indexOf(startMark);
  const j = html.indexOf(endMark, i);
  assert(i >= 0 && j > i, 'marker missing: ' + startMark);
  return html.slice(i, j);
}
const defaults = sliceFrom('const DEFAULT_EXPENSE_CATS=', 'let entries=readJSON(');
const otherAndSan = sliceFrom('const EXPENSE_OTHER_CAT', 'cats=sanitizeExpenseCats(cats);');
const catBlock = sliceFrom('/* ===== v6.21 分类体系', 'function saveAll(){');
const searchFns = sliceFrom('function billSearchStats(results){', 'function renderBillSearchBody(q,results){')
  + '\n' + sliceFrom('function billSearchSummaryText(results){', 'function billSearchFilterLine(q,results){');

// ---- 运行环境桩 -----------------------------------------------------------
const store = new Map();
const localStorage = new Proxy({}, {
  get(t, k) {
    if (k === 'getItem') return k2 => (store.has(k2) ? store.get(k2) : null);
    if (k === 'setItem') return (k2, v) => store.set(k2, String(v));
    if (k === 'removeItem') return k2 => store.delete(k2);
    if (typeof k === 'string') return store.has(k) ? store.get(k) : undefined;
  },
  set(t, k, v) { if (typeof k === 'string') store.set(k, String(v)); return true; },
  has() { return true; },
});

const ctx = {
  localStorage,
  console,
  LS: { entries: 'mjz_entries', cats: 'mjz_cats', incomeCats: 'mjz_income_cats' },
  entries: [],
  cats: [],
  incomeCats: [],
  mjyNowIso: () => '2026-11-09T00:00:00.000Z',
  ensureMjyEntryIds: () => {
    ctx.entries.forEach((e, i) => { if (!e.id) e.id = 'id' + i; });
  },
  saveAll: () => {
    localStorage.setItem('mjz_entries', JSON.stringify(ctx.entries));
    localStorage.setItem('mjz_cats', JSON.stringify(ctx.cats));
    localStorage.setItem('mjz_income_cats', JSON.stringify(ctx.incomeCats));
  },
  render: () => {},
  toast: () => {},
  readJSON: (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } },
  yuan: v => '¥' + (Number(v) || 0).toFixed(2),
  esc: x => String(x == null ? '' : x),
  entryName: e => (e && e.name) || '其他',
  billSearchYearLabel: () => '2026年',
  billSearchTypeLabel: () => '全部类型',
  billSearchAmountLabel: () => '',
  makeBackup: () => ({}),
  window: {},
};
vm.createContext(ctx);
vm.runInContext(defaults + '\n' + otherAndSan + '\n' + catBlock + '\n' + searchFns, ctx);

// ---- 用例 1：归并 6.19 的 12 类 + 更早的细分类 ----------------------------
ctx.cats = [['餐饮', '🍜'], ['交通', '🚌'], ['购物', '🛍️'], ['居家', '🏠'], ['娱乐', '🎮'], ['医疗', '💊'],
  ['学习', '📚'], ['人情', '🎁'], ['通讯', '📱'], ['住房', '🔑'], ['宠物', '🐶'], ['咖啡', '☕']];
ctx.incomeCats = [['工资', '💴'], ['兼职', '💼'], ['理财', '📈'], ['人情', '💌'], ['报销', '🧾'], ['其他', '💰']];
ctx.entries = [
  { name: '咖啡', amount: -20, date: '2026-01-01', time: '08:00' },
  { name: '加油', amount: -300, date: '2026-01-02', time: '09:00' },
  { name: '学习', amount: -199, date: '2026-01-03', time: '10:00' },
  { name: '宠物', amount: -80, date: '2026-01-04', time: '11:00' },
  { name: '人情', amount: 500, date: '2026-01-05', time: '12:00' },
  { name: '我的自定义', amount: -66, date: '2026-01-06', time: '13:00' },
  { name: '其他', amount: -9, date: '2026-01-07', time: '14:00' },
];
assert(ctx.catV7HasOldCats() === true, '应检测到旧分类');
ctx.runCatV7Merge();
const names = ctx.entries.map(e => e.name);
assert.strictEqual(JSON.stringify(names.slice(0, 5)), JSON.stringify(['餐饮', '交通', '服务', '服务', '礼金']), '归并结果不对: ' + names);
assert.strictEqual(names[5], '我的自定义', '自定义分类不应被改写');
assert.strictEqual(names[6], '其他', '其他 不应被改写');
assert.strictEqual(JSON.stringify(Array.from(ctx.cats, c => c[0])), JSON.stringify(['餐饮', '交通', '居住', '购物', '娱乐', '医疗', '服务']), '支出分类应为 7 个');
// v6.23：收入改为与支出同构——存储层只放 7 个标准类，固定的「其他」格子由 renderCats 补齐
assert.strictEqual(ctx.incomeCats.length, 7, '收入分类应为 7 项（其他格子由渲染补齐）');
assert.strictEqual(ctx.incomeCats.every(c => c[0] !== '其他'), true, '收入列表不应把「其他」存进数据');
assert(store.get('mjz_cat_v621_undo'), '应写入撤销记录');
console.log('PASS 归并：7 类支出 / 旧细分类(咖啡·加油·学习·宠物·人情)全部落到新分类，自定义保留');

// ---- 用例 2：撤销恢复原始名称 ---------------------------------------------
ctx.undoCatV7Merge();
assert.strictEqual(JSON.stringify(ctx.entries.map(e => e.name).slice(0, 5)), JSON.stringify(['咖啡', '加油', '学习', '宠物', '人情']), '撤销后名称未还原');
assert.strictEqual(ctx.cats.length, 12, '撤销应恢复 12 个可选分类');
assert.strictEqual(ctx.hasCatV7Undo(), false, '撤销记录应被清除');
console.log('PASS 撤销：账单名称与可选分类均回到整理前状态');

// ---- 用例 3：sanitize 清理旧名、保留自定义 --------------------------------
const cleaned = ctx.sanitizeExpenseCats([['咖啡', '☕'], ['餐饮', '食'], ['我的自定义', '★'], ['其他', '…']]);
assert.strictEqual(JSON.stringify(Array.from(cleaned, c => c[0])), JSON.stringify(['餐饮', '我的自定义']), 'sanitize 结果不对: ' + cleaned);
console.log('PASS sanitize：剔除旧细分类、保留自定义、剔除固定「其他」');

// ---- 用例 4：图标按名称映射 ----------------------------------------------
const svg = ctx.categoryIconSvg('餐饮', 'expense');
assert(svg.indexOf('<svg') === 0, '餐饮图标应输出 svg');
assert(svg.indexOf('M3.6 11.6h16.8') > 0 && svg.indexOf('M16.2 2.6 13.2 11') > 0, '餐饮图标应为「碗 + 筷子」');
assert(ctx.categoryIconSvg('早餐', 'expense') === svg, '旧细分类「早餐」应复用餐饮图标');
assert(ctx.categoryIconSvg('某某分类', 'expense').indexOf('M20 13 13 20') > 0, '未知分类应回落到 tag 图标');
assert(ctx.categoryIconHtml('工资', 'income', 'x').indexOf('class="category-icon x"') > 0, 'iconHtml 结构不对');
console.log('PASS 图标：7 类与收入类均有独立图标，未知分类回落 tag');

// ---- 用例 5：搜索汇总卡 ---------------------------------------------------
const rows = [
  { name: '餐饮', amount: -100, date: '2026-03-01', time: '12:00' },
  { name: '餐饮', amount: -50, date: '2026-03-02', time: '12:00' },
  { name: '工资', amount: 8000, date: '2026-03-05', time: '09:00' },
];
const card = ctx.billSearchSummaryText(rows);
assert(card.indexOf('支出总额') > 0 && card.indexOf('收入总额') > 0 && card.indexOf('账单笔数') > 0, '缺少三块汇总');
assert(card.indexOf('¥150.00') > 0 && card.indexOf('¥8000.00') > 0, '金额计算不对: ' + card);
assert(card.indexOf('3 笔') > 0, '笔数不对');
assert(card.indexOf('平均每笔') > 0 && card.indexOf('最大一笔') > 0, '缺少平均/最大一笔');
console.log('PASS 搜索汇总：支出/收入/笔数 + 平均每笔 + 最大一笔');

// ---- 用例 6：分类面板渲染出的标记 ----------------------------------------
const picked = {};
ctx.cats = [['餐饮','食'],['交通','行'],['居住','住'],['购物','购'],['娱乐','娱'],['医疗','医'],['服务','服']];
ctx.addCat = null;
ctx.addType = 'expense';
ctx.currentCats = () => ctx.cats;
ctx.manageType = 'expense';
ctx.$ = id => (picked[id] = picked[id] || { innerHTML: '' });
ctx.document = { querySelector: () => ({ classList: { add() {} }, style: {}, offsetHeight: 60, offsetWidth: 0 }) };
ctx.requestAnimationFrame = () => {};
vm.runInContext(sliceFrom('function renderCats(){', 'function openCategoryManagerFromAdd'), ctx);
ctx.renderCats();
const grid = picked['catGrid'].innerHTML;
const chips = grid.split('class="cat ').length - 1;
assert.strictEqual(chips, 8, '支出面板应有 7 类 + 其他 = 8 个格子，实际 ' + chips);
assert(grid.indexOf('<svg class="category-icon-svg"') > 0, '分类格子应输出内联 SVG');
assert(grid.indexOf('<span>') === -1, '不应再有旧的字形 span');
assert(grid.indexOf('<small>其他</small>') > 0, '缺少「其他」格子');
console.log('PASS 面板渲染：7 类 + 其他 = 8 格，全部使用 SVG 图标');

ctx.renderSelectedCat && ctx.renderSelectedCat();
console.log('全部用例通过');
