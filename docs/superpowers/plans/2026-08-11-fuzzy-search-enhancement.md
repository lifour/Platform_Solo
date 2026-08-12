# 全文搜索增强 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `search.js` 的 `indexOf` 精确匹配替换为 Fuse.js 模糊搜索，修复跳转定位 bug，改进高亮行为，增加键盘导航。

**Architecture:** 新增 `js/search-engine.js` 封装 Fuse 索引构建与查询；改造 `js/search.js` 的 `doSearch()` 和 `navigateToResult()`，用 TreeWalker 精确定位跨 chunk 的出现位置。

**Tech Stack:** Fuse.js 7.x（纯 JS，~14KB gzip），Vanilla JS，现有 Vite 构建

## 全局约束

- 仅搜索当前书籍经文段落文本，不搜 glossary/笔记
- Fuse.js 配置：`minMatchCharLength: 1`, `ignoreLocation: true`, `threshold: 0.36`, `includeMatches: true`
- 搜索结果按出现次数展开（一段中 N 次匹配 = N 条结果），最多 100 条
- 支持键盘 ↑↓ 导航、Enter 跳转、Esc 关闭
- 桌面和移动端共用同一份搜索结果数据

---

### Task 1: 安装 Fuse.js 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 fuse.js**

```bash
npm install fuse.js
```

- [ ] **Step 2: 验证版本**

检查 `package.json` 中 `dependencies` 已新增 `"fuse.js": "^7.1.0"`（或最新 7.x）。

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add fuse.js dependency for fuzzy search"
```

---

### Task 2: 创建搜索索引模块 `js/search-engine.js`

**Files:**
- Create: `js/search-engine.js`

**Produces:**
- `buildSearchIndex()` — 从当前书籍数据构建 Fuse 索引，返回 Fuse 实例
- `search(query)` — 执行模糊搜索，返回 `FuseResult[]`
- `getFuse()` — 获取当前索引实例（用于检查是否已构建）

- [ ] **Step 1: 创建 `js/search-engine.js`**

```js
/**
 * search-engine.js — Fuse.js 模糊搜索索引
 *
 * 从当前书籍段落数据构建全文搜索索引。
 * 索引在书籍数据变更时重建。
 */
import Fuse from 'fuse.js';
import { store } from './store.js';

let fuse = null;

/**
 * 构建/重建 Fuse 搜索索引
 * 覆盖当前书籍（sutraData）+ 敦煌本（如可用）
 */
export function buildSearchIndex() {
  const docs = [];

  const sutra = store.state.sutraData;
  if (sutra && sutra.chapters) {
    sutra.chapters.forEach(ch => {
      (ch.paragraphs || []).forEach(para => {
        if (para.text && para.text.trim()) {
          docs.push({
            text: para.text,
            chapterTitle: ch.title,
            paraId: para.id,
            edition: 'zongbao',
          });
        }
      });
    });
  }

  // 敦煌本（仅坛经有）
  const dh = store.get('dunhuangData');
  if (dh && dh.chapters) {
    dh.chapters.forEach(ch => {
      (ch.paragraphs || []).forEach(para => {
        if (para.text && para.text.trim()) {
          docs.push({
            text: para.text,
            chapterTitle: ch.title,
            paraId: para.id,
            edition: 'dunhuang',
          });
        }
      });
    });
  }

  if (docs.length === 0) {
    fuse = null;
    return null;
  }

  fuse = new Fuse(docs, {
    includeMatches: true,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 1,
    threshold: 0.36,
    keys: ['text'],
  });

  return fuse;
}

/**
 * 执行模糊搜索
 * @param {string} query - 搜索词
 * @returns {Array} Fuse 原始搜索结果
 */
export function search(query) {
  if (!fuse) return [];
  if (!query || !query.trim()) return [];
  return fuse.search(query.trim());
}

/**
 * 获取当前 Fuse 实例
 * @returns {Fuse|null}
 */
export function getFuse() {
  return fuse;
}
```

- [ ] **Step 2: 验证文件语法**

```bash
node --check js/search-engine.js
```

- [ ] **Step 3: 提交**

```bash
git add js/search-engine.js
git commit -m "feat: add Fuse.js search index builder (search-engine.js)"
```

---

### Task 3: 改造 `doSearch()` — Fuse 搜索替代 indexOf

**Files:**
- Modify: `js/search.js:1-13,158-233`

**Consumes:**
- `search(query)` from `js/search-engine.js`
- `toTraditional(query)` from `js/ui-language.js`

- [ ] **Step 1: 更新 imports，引入 search-engine**

修改 `js/search.js` 顶部 imports，新增：
```js
import { search as fuseSearch, buildSearchIndex, getFuse } from './search-engine.js';
```

- [ ] **Step 2: 重写 `doSearch()` 函数**

将 `js/search.js:160-233` 替换为：

```js
export function doSearch(query, resultsList, countLabel, mobileResults, mobileCount) {
  resultsList.innerHTML = '';
  countLabel.textContent = '';

  if (!query) {
    const panel = document.getElementById('search-panel');
    if (panel) panel.hidden = true;
    if (mobileResults) { mobileResults.innerHTML = ''; mobileResults.classList.remove('visible'); mobileCount.textContent = ''; }
    return;
  }

  // 确保索引已构建
  if (!getFuse()) buildSearchIndex();

  // 简繁双查询
  const tQuery = toTraditional(query);
  const queries = [tQuery];
  if (tQuery !== query) queries.push(query);

  const results = [];
  const seen = new Set();

  for (const q of queries) {
    const fuseResults = fuseSearch(q);
    for (const fr of fuseResults) {
      const indices = fr.matches && fr.matches[0] ? fr.matches[0].indices : [];
      if (indices.length === 0) {
        // Fuse 可能返回无 indices 的结果（minMatchCharLength: 1 时罕见）
        const item = fr.item;
        const key = `${item.edition}:${item.paraId}:0`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          chapterTitle: item.chapterTitle,
          paraId: item.paraId,
          edition: item.edition === 'dunhuang' ? '敦煌本' : '宗宝本',
          query: q,
          occurrenceOrdinal: 1,
          totalOccurrences: 1,
          matchStart: item.text.indexOf(q),
          matchEnd: item.text.indexOf(q) + q.length,
          before: '',
          match: q,
          after: '',
          score: fr.score,
        });
        continue;
      }

      indices.forEach(([start, end], i) => {
        const item = fr.item;
        const key = `${item.edition}:${item.paraId}:${start}`;
        if (seen.has(key)) return;
        seen.add(key);

        const ctxStart = Math.max(0, start - 25);
        const ctxEnd = Math.min(item.text.length, end + 1 + 25);
        results.push({
          chapterTitle: item.chapterTitle,
          paraId: item.paraId,
          edition: item.edition === 'dunhuang' ? '敦煌本' : '宗宝本',
          query: q,
          occurrenceOrdinal: i + 1,
          totalOccurrences: indices.length,
          matchStart: start,
          matchEnd: end + 1,
          before: (ctxStart > 0 ? '…' : '') + item.text.slice(ctxStart, start),
          match: item.text.slice(start, end + 1),
          after: item.text.slice(end + 1, ctxEnd) + (ctxEnd < item.text.length ? '…' : ''),
          score: fr.score,
        });
      });
    }
  }

  // 按相关性排序
  results.sort((a, b) => a.score - b.score);

  countLabel.textContent = results.length > 0 ? `${results.length} 处` : '无结果';

  const panel = document.getElementById('search-panel');
  if (panel) panel.hidden = results.length === 0;

  const maxResults = 100;
  const displayResults = results.slice(0, maxResults);

  displayResults.forEach((r, idx) => {
    const li = document.createElement('li');
    li.className = 'search-result-item';
    if (idx === 0) li.classList.add('search-result-active');
    const edLabel = r.edition !== '宗宝本'
      ? `<span class="search-edition-label">${escapeHtml(r.edition)}</span>`
      : '';
    li.innerHTML =
      `<div class="result-chapter">${escapeHtml(r.chapterTitle)}${edLabel}<span class="result-occurrence">${r.occurrenceOrdinal}/${r.totalOccurrences}</span></div>` +
      `<div>${escapeHtml(r.before)}<mark>${escapeHtml(r.match)}</mark>${escapeHtml(r.after)}</div>`;
    li.addEventListener('click', () => navigateToResult(r));
    try { li.setAttribute('data-payload', encodeURIComponent(JSON.stringify(r))); } catch (_) {}
    resultsList.appendChild(li);
  });

  if (results.length > maxResults) {
    const note = document.createElement('li');
    note.className = 'search-result-note';
    note.textContent = `仅显示前 ${maxResults} 条（共 ${results.length} 处）`;
    resultsList.appendChild(note);
  }

  // 同步移动端（共享同一数据源，各自渲染）
  if (mobileResults) {
    mobileResults.innerHTML = resultsList.innerHTML;
    mobileCount.textContent = countLabel.textContent;
    mobileResults.classList.add('visible');
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add js/search.js
git commit -m "feat: replace indexOf with Fuse.js fuzzy search in doSearch()"
```

---

### Task 4: 修复 `navigateToResult()` — 跨 chunk 精确定位 + 全匹配高亮

**Files:**
- Modify: `js/search.js:236-271`（navigateToResult, highlightInElement, closeSearch 周边）

- [ ] **Step 1: 替换 `navigateToResult` 函数**

将 `js/search.js:239-262` 的 `navigateToResult` 替换为：

```js
export function navigateToResult(result) {
  closeSearch();

  // 找到目标段落 DOM 元素（可能有多个 chunk 共享同一 data-para）
  let selector = `.para[data-para="${result.paraId}"]`;
  if (result.edition === '敦煌本') selector += '[data-edition="dh"]';
  const allEls = [...document.querySelectorAll(selector)];
  if (allEls.length === 0) return;

  // 根据 matchStart 在全文中的偏移，定位到正确的 chunk
  let accumulated = 0;
  let targetEl = allEls[0];
  let offsetInChunk = result.matchStart;
  for (const el of allEls) {
    const len = el.textContent.length;
    if (accumulated + len > result.matchStart) {
      targetEl = el;
      offsetInChunk = result.matchStart - accumulated;
      break;
    }
    accumulated += len;
  }

  // 滚动到目标段落
  const container = document.querySelector('.scroll-container');
  if (!container) return;

  if (store.get('displayMode') === 'scroll') {
    const topbarH = getTopbarHeight();
    const containerRect = container.getBoundingClientRect();
    const elRect = targetEl.getBoundingClientRect();
    const scrollTarget = container.scrollTop + elRect.top - containerRect.top - topbarH;
    container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
  } else {
    const fold = targetEl.closest('.fold');
    if (fold) fold.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }

  // 等高亮 DOM 稳定后高亮
  setTimeout(() => {
    highlightAllMatches(targetEl, result.query);
    const focusRange = findOccurrenceRange(targetEl, result.query, result.occurrenceOrdinal, offsetInChunk);
    if (focusRange) applyFocusHighlight(focusRange);
  }, 450);
}
```

- [ ] **Step 2: 新增辅助函数**

在 `getTopbarHeight` 之后，`highlightInElement` 之前，新增：

```js
/**
 * 高亮段落内所有匹配项
 */
function highlightAllMatches(el, query) {
  clearSearchHighlights();
  if (!el || !query) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  const ranges = [];
  for (const node of textNodes) {
    let idx = 0;
    while ((idx = node.textContent.indexOf(query, idx)) !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + query.length);
      ranges.push(range);
      idx += query.length;
    }
  }

  ranges.forEach(range => {
    try {
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      range.surroundContents(mark);
    } catch (_) {
      // 跨节点 range 无法 surroundContents，跳过
    }
  });
}

/**
 * 在元素内定位第 N 个匹配出现位置（从 chunk 内偏移开始计算）
 */
function findOccurrenceRange(el, query, targetOrdinal, offsetInChunk) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n = 0;
  while (walker.nextNode()) {
    let idx = 0;
    while ((idx = walker.currentNode.textContent.indexOf(query, idx)) !== -1) {
      n++;
      if (n >= targetOrdinal) {
        const range = document.createRange();
        range.setStart(walker.currentNode, idx);
        range.setEnd(walker.currentNode, idx + query.length);
        return range;
      }
      idx += query.length;
    }
  }
  return null;
}

/**
 * 对当前跳转目标应用焦点高亮样式
 * 创建一个 gold 背景的 mark，2s 后自动淡出
 */
function applyFocusHighlight(range) {
  try {
    const mark = document.createElement('mark');
    mark.className = 'search-focus';
    range.surroundContents(mark);
    // 2 秒后自动清除焦点样式
    setTimeout(() => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
      }
    }, 2500);
  } catch (_) {
    // 跨节点 range 无法 surroundContents，跳过
  }
}
```

- [ ] **Step 3: 删除旧的 `highlightInElement`**

删除 `js/search.js:283-301` 的旧 `highlightInElement` 函数（被新函数替代）。

- [ ] **Step 4: 修改 `clearSearchHighlights` 同时清除两种高亮**

将 `clearSearchHighlights` 选择器从 `mark.search-highlight` 改为 `mark.search-highlight, mark.search-focus`：

```js
export function clearSearchHighlights() {
  document.querySelectorAll('mark.search-highlight, mark.search-focus').forEach(mark => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
  });
}
```

- [ ] **Step 5: 提交**

```bash
git add js/search.js
git commit -m "fix: precise cross-chunk navigation and all-match highlighting in search"
```

---

### Task 5: 新增键盘导航（↑↓ Enter Esc）

**Files:**
- Modify: `js/search.js` — `setupSearch()` 函数的 input 事件部分

- [ ] **Step 1: 在 `setupSearch()` 中添加键盘事件**

在 `js/search.js` 的 `setupSearch()` 函数中，将现有的 `input.addEventListener('input', ...)` 替换为：

```js
input.addEventListener('input', () => {
  doSearchDebounced(input.value.trim());
});

// 键盘导航：↑↓ 切换结果，Enter 跳转
input.addEventListener('keydown', (e) => {
  const panel = document.getElementById('search-panel');
  if (!panel || panel.hidden) return;

  const items = panel.querySelectorAll('.search-result-item');
  if (items.length === 0) return;

  const active = panel.querySelector('.search-result-active');
  const currentIdx = active ? [...items].indexOf(active) : -1;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
    setActiveResult(items, currentIdx, nextIdx);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prevIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
    setActiveResult(items, currentIdx, prevIdx);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (active) active.click();
  }
});

function setActiveResult(items, oldIdx, newIdx) {
  if (oldIdx >= 0) items[oldIdx].classList.remove('search-result-active');
  items[newIdx].classList.add('search-result-active');
  items[newIdx].scrollIntoView({ block: 'nearest' });
}
```

- [ ] **Step 2: 确认 Esc 已处理**

现有代码第 91 行已有 `Escape` 处理，确认其正常工作：
```js
if (e.key === 'Escape' && isSearchOpen()) closePanel();
```

- [ ] **Step 3: 提交**

```bash
git add js/search.js
git commit -m "feat: add keyboard navigation (up/down/enter) for search results"
```

---

### Task 6: 新增搜索相关 CSS 样式

**Files:**
- Modify: `css/sutra.css`

- [ ] **Step 1: 在 `css/sutra.css` 末尾添加搜索增强样式**

```css
/* ---- 搜索增强样式 ---- */

/* 所有匹配项高亮 */
mark.search-highlight {
  background: rgba(255, 235, 59, 0.35);
  border-radius: 2px;
  padding: 0 1px;
}

/* 当前跳转目标焦点高亮（金色脉冲） */
mark.search-focus {
  background: var(--accent-gold, #C8A96E);
  color: #fff;
  border-radius: 3px;
  padding: 0 2px;
  animation: search-focus-pulse 0.6s ease-in-out 3;
}

@keyframes search-focus-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 搜索结果项 */
.search-result-item {
  cursor: pointer;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  transition: background 0.15s;
}

.search-result-item:hover,
.search-result-item.search-result-active {
  background: rgba(200, 169, 110, 0.12);
}

/* 搜索结果项中的出处标签 */
.search-edition-label {
  font-size: 0.7rem;
  color: var(--ink-light, #999);
  margin-left: 0.4em;
}

/* 出现次数指示器 */
.result-occurrence {
  font-size: 0.7rem;
  color: var(--ink-light, #999);
  margin-left: 0.6em;
}

/* 搜索结果提示信息 */
.search-result-note {
  font-size: 0.8rem;
  color: var(--ink-light, #999);
  text-align: center;
  padding: 0.5rem 0;
}
```

- [ ] **Step 2: 提交**

```bash
git add css/sutra.css
git commit -m "style: add search highlight and result item styles"
```

---

### Task 7: 连接索引重建到数据变更事件

**Files:**
- Modify: `js/data.js`

- [ ] **Step 1: 在 `loadBookData` 中触发索引重建**

在 `js/data.js` 的 `loadBookData` 函数（约第 69-81 行）中，成功加载数据后调用 `buildSearchIndex`：

在 `js/data.js` 顶部添加 import：
```js
import { buildSearchIndex } from './search-engine.js';
```

在 `loadBookData` 函数中，`store.set('currentBookId', book.id)` 之后添加：
```js
// 重建搜索索引
try { buildSearchIndex(); } catch (_) {}
```

完整的 `loadBookData` 变为：
```js
export async function loadBookData(book) {
  if (!book) return;
  try {
    const res = await fetch(book.dataUrl);
    const data = await res.json();
    store.set('sutraData', data);
    store.set('currentBookId', book.id);
    // 重建搜索索引
    try { buildSearchIndex(); } catch (_) {}
    return data;
  } catch (err) {
    console.error('加载书籍失败:', book.id, err);
    return null;
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add js/data.js
git commit -m "feat: rebuild search index on book data load"
```

---

### Task 8: 构建验证

**Files:**
- 无新文件

- [ ] **Step 1: 构建项目**

```bash
npm run build
```

预期：构建成功，dist/ 目录输出正常，无编译错误。

- [ ] **Step 2: 验证 fuse.js 被打包**

```bash
ls -la dist/assets/index-*.js
```

确认 JS bundle 包含 Fuse.js 代码（bundle 体积增加 ~14KB gzip 约 5KB）。

- [ ] **Step 3: 提交（如有修改）**

```bash
git status
# 如无改动则跳过提交
```

---

## 验证清单

构建成功后，在浏览器中验证以下行为：

- [ ] 输入精确匹配词能搜索到结果
- [ ] 输入模糊词（缺字/错字）仍能搜索到相关结果
- [ ] 简繁自动转换（输入简体搜繁体文本）
- [ ] 同一段落中多次出现各自独立显示（出现次数标签正确）
- [ ] 点击搜索结果精确滚动到目标段落，焦点高亮可见
- [ ] 段落内所有匹配项均有黄色高亮
- [ ] 键盘 ↑↓ 可切换选中结果，Enter 跳转，Esc 关闭
- [ ] 切换书籍后搜索正常（搜索新书内容）
- [ ] 移动端侧面板搜索行为与桌面一致
- [ ] 点击正文空白处清除高亮
