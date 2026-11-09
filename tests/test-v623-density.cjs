// v6.23 布局密度（紧凑/宽松 B 档）+ 备注编辑态 测试
// 1) 基础密度块无条件生效；宽松块用 body.loose 抬高约 1.15 倍
// 2) 备注聚焦时收起数字键盘、金额框熄灭、键盘动作被守卫
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/../app/src/main/assets/index.html', 'utf8');

function block(id) {
  const start = html.indexOf('<style id="' + id + '">');
  assert(start >= 0, 'style block missing: ' + id);
  const end = html.indexOf('</style>', start);
  return html.slice(start, end);
}

// ---- 1. 基础密度：不再用 body.compact 前缀，宽松才靠 body.loose ----
const base = block('v622-compact');
assert(!/body\.compact/.test(base), '基础密度块不应再带 body.compact 前缀');
assert(base.includes('body .card{padding:12px!important'), '卡片基础内边距应为 12px');
const loose = block('v623-loose');
[
  ['body.loose .card{padding:14px!important', '卡片 14px'],
  ['body.loose .summary .big{font-size:32px!important', '汇总大字 32px'],
  ['body.loose .day-group-rows .row{min-height:50px!important', '账单行 50px'],
  ['body.loose .record-category-icon{width:33px!important', '图标 33px'],
  ['body.loose .money{font-size:15px!important', '金额 15px'],
  ['body.loose .nav button{height:48px!important', '导航按钮 48px'],
  ['body.loose .setting{padding:11px 0!important', '设置行 11px'],
  ['body.loose .title{font-size:22px!important', '标题 22px'],
].forEach(([needle, label]) => assert(loose.includes(needle), '宽松档缺少：' + label));
// 宽松档必须是「紧凑 + 放大」，不能退回 v7.0 的 36px/56px 原值
assert(!loose.includes('font-size:36px'), '宽松档不应使用 v7.0 的 36px 大字（那是 A 档）');
assert(!loose.includes('min-height:56px'), '宽松档不应使用 v7.0 的 56px 行高（那是 A 档）');

// ---- 2. 备注编辑态（6.23.3）：软键盘盖住数字键盘，自绘键盘禁用，不重排不加按钮 ----
assert(!html.includes('noteEditingBar'), '不应再有「完成备注」按钮条（6.23.3 已回退）');
assert(!html.includes('finishNoteEdit'), '不应再有 finishNoteEdit 残留');
assert(html.includes('onblur="handleNoteBlur(event)"'), '备注框缺少 onblur');
const noteCss = block('v623-note');
assert(!noteCss.includes('body.note-editing #keypad{opacity'), '数字键盘不应再置灰禁用（6.23.3 二次调整：点键盘即接管）');
assert(noteCss.includes('body.note-editing #keypad{display:none!important}') === false, '数字键盘不应被隐藏');
assert(html.includes("noteEditAt=0}e.preventDefault()"), '数字键盘 pointerdown 缺少「先结束备注编辑再输金额」的接管逻辑');
assert(html.includes('function bindNoteViewportUnlock(') && html.includes('bindNoteViewportUnlock()}'), '缺少软键盘收起自动解锁（visualViewport 兜底）');
assert(html.includes("if(name==='其他'){toast('“其他”为固定分类');return}"), '新增/改名未拦截「其他」（需不分支出收入）');
assert(noteCss.includes('.amount-box:not(.focused) .amount-cursor{animation:none!important'), '金额框假光标未按 focused 关闭');
assert(noteCss.includes('body.note-editing .note-input{border:1px solid var(--primary)!important'), '备注框未拿到唯一高亮');
// 金额框不再硬编码 focused（由 renderAmount 按编辑态切换）
assert(!/<div class="amount-box focused" id="amountBox">/.test(html) || html.includes("box.classList.toggle('focused',!noteEditing())"), '金额框焦点未由 JS 驱动');
// Android 端：软键盘用 adjustPan 整块盖住页面底部
const manifest = fs.readFileSync(__dirname + '/../app/src/main/AndroidManifest.xml', 'utf8');
assert(/android:name="\.MainActivity"[^>]*android:windowSoftInputMode="adjustPan"/.test(manifest), 'MainActivity 缺少 windowSoftInputMode=adjustPan');

// ---- 3. 行为验证：备注编辑时键盘动作被守卫、金额不被改写 ----
const fn = name => {
  const i = html.indexOf('function ' + name + '(');
  assert(i >= 0, 'function missing: ' + name);
  let d = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1); }
  }
  throw new Error('unbalanced: ' + name);
};

const store = { mjz_entries: null };
const bodyClasses = new Set();
const noteEl = { value: '', readOnly: false, blur() {}, classList: { add() {}, remove() {}, toggle() {} } };
const amountBox = { classList: { _c: new Set(), add(c) { this._c.add(c); }, remove(c) { this._c.delete(c); }, toggle(c, on) { on ? this._c.add(c) : this._c.delete(c); }, contains(c) { return this._c.has(c); } } };
const moneyEl = { innerHTML: '' };
const ctx = {
  console,
  document: {
    body: { classList: { _s: bodyClasses, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); } } },
    activeElement: null,
  },
  $: id => (id === 'noteInput' ? noteEl : id === 'amountBox' ? amountBox : id === 'entryDateInput' ? { value: '' } : id === 'amountDisplay' ? moneyEl : null),
  addAmount: '5',
  addDate: '2026-11-09',
  hasAmount: () => true,
  updateAmountGate: () => {},
  toast: () => {},
  haptic: () => {},
  renderNoteSuggestions: () => {},
  noteSuggestionsOpen: false,
  addStep: 'amount',
  Date,
  setTimeout: (f) => f(),
  clearTimeout: () => {},
};
vm.createContext(ctx);
['noteEditing', 'setNoteEditing', 'keypadLocked', 'keyNum', 'renderAmount'].forEach(n => vm.runInContext(fn(n), ctx));

assert(ctx.noteEditing() === false, '初始不应在备注编辑态');
ctx.setNoteEditing(true);
assert(ctx.noteEditing() === true, 'setNoteEditing(true) 未生效');
assert(amountBox.classList.contains('focused') === false, '进入备注态后金额框应取消 focused');
ctx.keyNum('9');                       // 模拟误触数字键
assert.strictEqual(ctx.addAmount, '5', '备注编辑态下键盘不应改写金额');
ctx.setNoteEditing(false);
assert(amountBox.classList.contains('focused') === true, '退出备注态后金额框应恢复 focused');

// ---- 4. 密度改为「我的」页行内分段控件（不再弹窗） ----
assert(!html.includes('id="densityPanel"'), '密度面板 HTML 应已移除');
assert(!html.includes('function openDensity('), 'openDensity 应已移除');
assert(html.includes('<div class="density-seg">'), '缺少行内密度分段控件');
assert(html.includes("pickDensity('compact')") && html.includes("pickDensity('loose')"), '分段控件应直接切换密度');
assert(!html.includes('closePanel(\'densityPanel\')'), '仍残留密度面板关闭调用');
// 选中态必须由 JS 渲染（高亮当前档）
assert(html.includes("class=\"seg-btn${layoutDensity==='loose'?' on':''}\""), '宽松按钮缺少选中态渲染');

// ---- 5. 「撤销分类整理」入口已从我的页移除 ----
assert(!/hasCatV7Undo\(\)\?setting\('↩️','撤销分类整理'/.test(html), '我的页仍渲染「撤销分类整理」入口');
const mineFn = html.slice(html.indexOf('function renderMine(){'), html.indexOf('function setting(ic,t,d'));
assert(!mineFn.includes('撤销分类整理'), 'renderMine 里不应再出现撤销入口');

// ---- 6. v6.23.2：撤销导致分类残缺的自动修复 + 恢复默认分类 ----
assert(html.includes("const CAT_V6232_KEY='mjz_cat_v6232_repaired'"), '缺少 v6.23.2 修复标记');
assert(html.includes('function ensureCatV6232Repair('), '缺少 ensureCatV6232Repair');
assert(/try\{ensureCatV6232Repair\(\)\}catch\(e\)\{\}render\(\);/.test(html), '启动时未调用修复函数');
assert(html.includes('function catV6232Incomplete('), '缺少「是否缺标准类」的判定');
// 只在缺标准类时才动手（正常用户不受影响）
assert(/if\(!expBroken&&!incBroken\)return false;/.test(html), '修复应仅在分类残缺时执行');
assert(html.includes('onclick="resetManagedCats()"'), '分类管理缺少「恢复默认分类」按钮');
assert(html.includes('function resetManagedCats('), '缺少 resetManagedCats');
assert(html.includes('class="cat-manage-actions"'), '操作按钮未包在吸底容器里');
assert(/cats=DEFAULT_EXPENSE_CATS\.map\(c=>\[c\[0\],c\[1\]\]\);/.test(html), '恢复默认分类应重置为 7 个标准支出类');

// ---- 7. 版本一致性 ----
const gradle = fs.readFileSync(__dirname + '/../app/build.gradle', 'utf8');
assert(/versionName "6\.23\.3"/.test(gradle), 'build.gradle 版本名未升级');
assert(/versionCode 55/.test(gradle), 'build.gradle versionCode 未升级');
assert(html.includes('6.23.3'), 'index.html 缺少版本号 6.23.3');
assert(html.includes('versionCode:55'), 'index.html 兜底 versionCode 未升级');

console.log('PASS 密度行内切换 / 撤销入口移除 / 分类残缺自动修复 / 恢复默认分类 / 备注收键盘 / 版本 6.23.2-54');
