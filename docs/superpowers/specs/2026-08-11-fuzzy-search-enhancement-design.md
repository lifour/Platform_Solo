# 全文搜索增强 — 设计文档

> 日期：2026-08-11 | 参考项目：doc-qa-assistant

## 概述

在现有 `search.js` 基础上，将 `indexOf` 精确匹配替换为 Fuse.js 模糊搜索，改进搜索结果粒度和跳转高亮精度，统一桌面/移动端搜索体验。

## 范围

- **做**：经文段落全文模糊搜索（仅搜当前书籍段落文本，不搜 glossary/笔记）
- **不做**：glossary/笔记索引、AI 增强、后端改动

## 架构

```
Fuse 索引                      搜索结果                        UI 渲染
─────────                    ──────────                     ─────────
sutraData ─┐                            
            ├─► search-engine.js     ┌─► 桌面搜索栏 (#search-results)
dunhuangData┘   buildSearchIndex()   │
                fuse.search(query) ──┤   每条结果包含：
                                     │   · chapterTitle
                        search.js    │   · paraId
                        doSearch() ──┤   · before/match/after
                                     │   · occurrenceOrdinal
                                     │   · totalOccurrences
                                     └─► 移动端面板 (#mobile-search-results)
```

### 文件改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `js/search-engine.js` | **新增** | Fuse.js 索引构建与查询封装 |
| `js/search.js` | **改造** | doSearch() 改用 Fuse，navigateToResult() 精确跳转，新增键盘导航 |
| `index.html` | **微调** | 搜索栏空状态文案模板 |
| `css/sutra.css` | **微调** | `.search-focus` 高亮样式 |
| `package.json` | **依赖** | 新增 `fuse.js` |

## 详细设计

### 1. 搜索索引层 (`search-engine.js`)

```js
import Fuse from 'fuse.js';
import { store } from './store.js';
import { toTraditional } from './ui-language.js';

let fuse = null;

export function buildSearchIndex() {
  const docs = [];
  const bookId = store.get('currentBookId');

  // 当前书籍
  const sutra = store.state.sutraData;
  if (sutra?.chapters) {
    sutra.chapters.forEach(ch => {
      (ch.paragraphs || []).forEach(para => {
        if (para.text?.trim()) {
          docs.push({
            text: para.text,
            chapterTitle: ch.title,
            paraId: para.id,
            edition: bookId === 'tanjing' ? '宗宝本' : '当前典籍',
          });
        }
      });
    });
  }

  // 坛经额外索引敦煌本
  if (bookId === 'tanjing') {
    const dh = store.get('dunhuangData');
    if (dh?.chapters) {
      dh.chapters.forEach(ch => {
        (ch.paragraphs || []).forEach(para => {
          if (para.text?.trim()) {
            docs.push({
              text: para.text,
              chapterTitle: ch.title,
              paraId: para.id,
              edition: '敦煌本',
            });
          }
        });
      });
    }
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

export function getFuse() {
  return fuse;
}
```

**索引重建时机：** 监听 `sutraData:changed` 事件（data.js 中 loadBookData 触发），避免首次搜索卡顿。

### 2. 搜索结果粒度

每条 Fuse 匹配中的每个 `indices` 区间 = 一条搜索结果 = 一次出现。

```js
// search.js doSearch() 中
fuse.search(query).forEach(result => {
  result.matches?.[0]?.indices?.forEach((indices, i) => {
    const [start, end] = indices;
    results.push({
      chapterTitle: result.item.chapterTitle,
      paraId: result.item.paraId,
      edition: result.item.edition,
      query,
      occurrenceOrdinal: i + 1,        // 第几处出现
      totalOccurrences: result.matches[0].indices.length,
      before: result.item.text.slice(Math.max(0, start - 25), start),
      match: result.item.text.slice(start, end + 1),
      after: result.item.text.slice(end + 1, Math.min(result.item.text.length, end + 1 + 25)),
      score: result.score,
    });
  });
});
```

超出 100 条截断，标注"仅显示前 100 条（共 N 处）"。

### 3. 跳转导航

参考 doc-qa-assistant 的 TreeWalker 方案：

```js
function navigateToResult(result) {
  closeSearch();

  // 找到目标段落元素
  let selector = `.para[data-para="${result.paraId}"]`;
  if (result.edition === '敦煌本') selector += '[data-edition="dh"]';
  const paraEl = document.querySelector(selector);

  if (!paraEl) return;

  // 滚动到段落
  scrollToParagraph(paraEl);

  // 高亮所有匹配 + 标记当前跳转目标
  setTimeout(() => {
    highlightAllMatches(paraEl, result.query);
    const range = findOccurrenceRange(paraEl, result.query, result.occurrenceOrdinal);
    if (range) markAsFocus(range);  // .search-focus 样式
  }, 400); // 等滚动动画完成
}
```

**精确出现定位（TreeWalker + Range）：**

- 遍历段落内所有文本节点
- 累计出现次数到 `targetOrdinal`
- 创建 Range 获取精确像素位置用于滚动定位

**RAF 重试兜底：** DOM 未就绪时最多重试 10 帧。

### 4. 高亮策略

| 样式类 | 用途 | 视觉效果 |
|--------|------|---------|
| `mark.search-highlight` | 段落内所有匹配项 | 黄色背景半透明 |
| `mark.search-focus` | 当前跳转目标 | 金色闪烁动画（2s 后自动清除） |

关闭搜索面板 / 点击正文空白处 → 清除所有高亮。

### 5. UI 交互

#### 键盘导航
- `↑↓` — 切换选中结果
- `Enter` — 跳转到选中结果
- `Esc` — 关闭搜索面板

#### 空状态
```
未找到「xxx」
试试简繁转换或减少关键词
```

#### 桌面/移动端结果共享
`doSearch()` 返回结构化结果数组，桌面端 `resultsList` 和移动端 `mobileResults` 各自根据同一份数据渲染，消除当前 `innerHTML` 复制逻辑。

### 6. CSS 新增

```css
mark.search-highlight {
  background: rgba(255, 235, 59, 0.35);
  border-radius: 2px;
  padding: 0 1px;
}
mark.search-focus {
  background: var(--accent-gold);
  border-radius: 3px;
  padding: 0 1px;
  animation: search-focus-pulse 0.6s ease-in-out 3;
}
@keyframes search-focus-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

## 错误处理

- Fuse 索引为空时 → 搜索结果显示"数据未加载完成，请稍候"
- `buildSearchIndex()` 异常 → catch 并设置 `fuse = null`，搜索时显示"搜索不可用"
- `navigateToResult()` 段落不存在 → 静默忽略（段落可能已被折叠/移除）

## 测试要点

- [ ] 精确匹配（输完整词）能找到
- [ ] 模糊匹配（缺字/多字）能找到
- [ ] 简繁自动转换（输入简体搜繁体文本）
- [ ] 多次出现的结果各自独立，跳转位置不同
- [ ] 键盘上下键切换结果，Enter 跳转
- [ ] 切换书籍后索引重建，搜索正常
- [ ] 移动端侧面板搜索行为与桌面一致
- [ ] 点击空白处清除高亮
