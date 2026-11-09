// v6.23.3 回归防护：
// 1) 关键弹层 DOM 必须存在（曾因误删导致「点击编辑 / 分享应用没反应」）
// 2) 所有内联事件调用的函数都必须有定义
// 3) 分类管理弹层：标题固定、只有列表内部滚动
const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/../app/src/main/assets/index.html', 'utf8');

// ---- 1. 关键弹层 DOM ----
[
  ['yearPanel', '年份选择'],
  ['recordActionPanel', '账单编辑/删除'],
  ['recordActionSummary', '账单编辑摘要'],
  ['recordViewPanel', '账单详情'],
  ['recordViewContent', '详情内容容器'],
  ['billDetailPanel', '账单明细弹层'],
  ['billDetailTitle', '明细标题'],
  ['billDetailSummary', '明细汇总'],
  ['billDetailList', '明细列表'],
  ['textPanel', '备份/恢复文本面板'],
  ['textBox', '备份文本框'],
  ['restoreFile', '导入文件选择器'],
  ['backupActions', '备份操作条'],
  ['restoreActions', '恢复操作条'],
  ['exportPath', '导出路径提示'],
  ['shareAppPanel', '分享应用'],
  ['sharePosterCanvas', '分享海报画布'],
].forEach(([id, label]) => assert(html.includes('id="' + id + '"'), '缺少「' + label + '」DOM: #' + id));

assert(html.includes('onclick="editPendingRecord()">编辑'), '编辑/删除面板缺少「编辑」按钮');
assert(html.includes('onclick="deletePendingRecord()">删除'), '编辑/删除面板缺少「删除」按钮');
assert(/setting\('📣','分享应用'[^)]*'openShareApp\(\)'\)/.test(html), '「我的」页缺少分享应用入口');
assert(html.includes('onclick="shareAppPoster()"'), '分享面板缺少「分享海报」按钮');

// ---- 2. 内联事件函数必须已定义 ----
const names = new Set();
for (const m of html.matchAll(/on(?:click|change|input|focus|blur|touchstart|touchend|mousedown|mouseup|mousemove|touchmove|keydown|contextmenu)="([^"]{0,160})"/g)) {
  for (const c of m[1].matchAll(/([a-zA-Z_$][\w$]*)\(/g)) names.add(c[1]);
}
const builtin = new Set(['if', 'return', 'typeof', 'parseInt', 'parseFloat', 'Number', 'String', 'encodeURIComponent', 'decodeURIComponent', 'alert', 'confirm', 'event', 'Math', 'Date', 'JSON', 'isNaN', 'setTimeout', 'preventDefault', 'stopPropagation', 'close', 'showPicker', 'click', 'blur', 'focus', 'open']);
const missing = [...names].filter(n => !builtin.has(n)
  && !new RegExp('function\\s+' + n + '\\s*\\(').test(html)
  && !new RegExp('(?:const|let|var)\\s+' + n + '\\s*=').test(html)
  && !new RegExp('window\\.' + n + '\\s*=').test(html));
assert(!missing.length, '内联事件引用了未定义的函数: ' + missing.join(', '));

// ---- 3. 分类管理弹层滚动约束 ----
const css = html.slice(html.lastIndexOf('<style'), html.lastIndexOf('</style>'));
assert(/#catPanel \.panel-box\{display:flex;flex-direction:column;overflow:hidden\}/.test(css), '分类管理弹层未改为纵向 flex 固定头尾');
assert(/#catPanel #catManageList\{flex:1 1 auto;min-height:0;overflow:auto/.test(css), '分类列表未接管滚动');
assert(/#catPanel \.cat-manage-actions\{position:static/.test(css), '底部操作条应改为常驻（非 sticky）');

// ---- 3.5 支出/收入管理列表都有固定的「其他」行 ----
assert(html.includes("html+=`<div class=\"cat-manage-row cat-manage-system\""), '固定「其他」行应为无条件追加（支出与收入同构）');
assert(!/if\(manageType==='expense'\)html\+=`<div class="cat-manage-row cat-manage-system"/.test(html), '固定行不应只在支出分支追加');
assert(/<b>其他<\/b><span class="system-badge">固定分类<\/span>/.test(html), '固定行缺少「固定分类」徽标');
assert((html.match(/if\(name==='其他'\)\{toast/g) || []).length === 2, '新增与改名都应拦截「其他」');

// ---- 4. 版本 ----
const gradle = fs.readFileSync(__dirname + '/../app/build.gradle', 'utf8');
assert(/versionName "6\.23\.3"/.test(gradle) && /versionCode 55/.test(gradle), '版本号应为 6.23.3 / 55');

console.log('PASS 弹层 DOM 完整 / 内联事件函数齐全 / 分类管理滚动固定 / 版本 6.23.3-55');
