// v6.22 分类归一测试：验证「云端旧分类整表覆盖」不会再压掉 7 个标准分类
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/../app/src/main/assets/index.html', 'utf8');

function sliceFrom(startMark, endMark) {
  const i = html.indexOf(startMark);
  const j = html.indexOf(endMark, i);
  assert(i >= 0 && j > i, 'marker missing: ' + startMark);
  return html.slice(i, j);
}

const defaults = sliceFrom('const DEFAULT_EXPENSE_CATS=', 'let entries=readJSON(');
const otherAndSan = sliceFrom('const EXPENSE_OTHER_CAT', 'cats=sanitizeExpenseCats(cats);');
const catBlock = sliceFrom('/* ===== v6.21 分类体系', 'function saveAll(){');

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

let saved = 0;
const ctx = {
  localStorage, console,
  LS: { entries: 'mjz_entries', cats: 'mjz_cats', incomeCats: 'mjz_income_cats' },
  entries: [], cats: [], incomeCats: [],
  mjyNowIso: () => '2026-11-09T00:00:00.000Z',
  ensureMjyEntryIds: () => {},
  saveAll: () => { saved++; },
  render: () => {}, toast: () => {},
  readJSON: (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } },
  makeBackup: () => ({}),
  window: {},
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(defaults + '\n' + otherAndSan + '\n' + catBlock, ctx);

const N = ctx.normalizeExpenseCatsV622;
const names = list => Array.from(list, c => c[0]);
const STD = ['餐饮', '交通', '居住', '购物', '娱乐', '医疗', '服务'];

// ---- 1. 云端只有 4 项（用户实际遇到的情况）→ 补齐 7 类 -------------------
{
  const out = N([['餐饮', '食'], ['购物', '购'], ['娱乐', '娱'], ['医疗', '医']]);
  assert.strictEqual(JSON.stringify(names(out)), JSON.stringify(STD), '4 项应补齐为 7 类，实际 ' + names(out));
  console.log('PASS 云端 4 项 -> 补齐 7 个标准分类');
}

// ---- 2. 旧细分类按映射归并 ----------------------------------------------
{
  const out = N([['咖啡', '☕'], ['加油', '⛽'], ['学习', '📚'], ['宠物', '🐶'], ['房租', '🏠']]);
  assert.strictEqual(JSON.stringify(names(out)), JSON.stringify(STD), '旧分类应全部归并，实际 ' + names(out));
  console.log('PASS 旧细分类全部落到 7 类');
}

// ---- 3. 自定义分类保留在末尾、不重复补标准类 ----------------------------
{
  const out = N([['餐饮', '食'], ['我的订阅', '★'], ['交通', '行']]);
  const n = names(out);
  assert.strictEqual(JSON.stringify(n), JSON.stringify(STD.concat(['我的订阅'])), '自定义应接在末尾，实际 ' + n);
  console.log('PASS 自定义分类保留，标准类不重复');
}

// ---- 4. 同名不同图标只留一个 --------------------------------------------
{
  const out = N([['餐饮', '食'], ['餐饮', '🍜'], ['餐饮', '🥢']]);
  const n = names(out);
  assert.strictEqual(n.filter(x => x === '餐饮').length, 1, '同名应去重，实际 ' + n);
  console.log('PASS 同名不同图标已按名字去重');
}

// ---- 5. 映射到「其他」的（还款/贷款）被剔除 ------------------------------
{
  const out = N([['还款', '💳'], ['贷款', '🏦']]);
  const n = names(out);
  assert.strictEqual(JSON.stringify(n), JSON.stringify(STD), '还款/贷款不应留在分类栏，实际 ' + n);
  console.log('PASS 归到「其他」的旧分类被剔除');
}

// ---- 6. 幂等：归一两次结果相同 ------------------------------------------
{
  const once = N([['咖啡', '☕'], ['我的订阅', '★'], ['餐饮', '食']]);
  const twice = N(once);
  assert.strictEqual(JSON.stringify(twice), JSON.stringify(once), '归一化应幂等');
  console.log('PASS 归一化幂等');
}

// ---- 7. 启动迁移：本机已是 4 类脏数据 → 修成 7 类并落盘 -------------------
{
  store.clear(); saved = 0;
  ctx.cats = [['餐饮', '食'], ['购物', '购'], ['娱乐', '娱'], ['医疗', '医']];
  const changed = ctx.ensureCatV622Cats();
  assert.strictEqual(changed, true, '应判定为已修正');
  assert.strictEqual(JSON.stringify(names(ctx.cats)), JSON.stringify(STD), '迁移后应为 7 类，实际 ' + names(ctx.cats));
  assert.strictEqual(store.get('mjz_cat_v622_normalized'), '1', '迁移标记应写入');
  assert.strictEqual(store.get('mjz_cat_v621_merged'), '1', 'v6.21 归并标记应钉死，避免再清自定义');
  assert.strictEqual(saved, 1, '应有且仅有一次落盘');
  assert.strictEqual(ctx.ensureCatV622Cats(), false, '第二次调用应直接返回');
  console.log('PASS 启动迁移：4 类脏数据修成 7 类，只落盘一次');
}

// ---- 8. 撤销保护：列表里还有旧名时不动 -----------------------------------
{
  store.clear(); saved = 0;
  ctx.cats = [['咖啡', '☕'], ['餐饮', '食']];
  const changed = ctx.ensureCatV622Cats();
  assert.strictEqual(changed, false, '检测到旧名应跳过');
  assert.strictEqual(JSON.stringify(names(ctx.cats)), JSON.stringify(['咖啡', '餐饮']), '不应改动用户撤销后的分类');
  assert.strictEqual(saved, 0, '不应落盘');
  console.log('PASS 撤销保护：检测到旧名时不动分类');
}

// ---- 9. 空列表也给出 7 类 ------------------------------------------------
{
  const out = N([]);
  assert.strictEqual(JSON.stringify(names(out)), JSON.stringify(STD), '空列表应回落到 7 类');
  console.log('PASS 空列表回落为 7 类');
}

console.log('\n全部用例通过');
