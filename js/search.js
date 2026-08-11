/**
 * search.js — 全文搜索
 *
 * 支持跨宗宝本/敦煌本搜索，简繁自动匹配。
 * 搜索结果可点击跳转到对应段落。
 */

import { store } from './store.js';
import { toTraditional } from './ui-language.js';
import { escapeHtml } from './utils.js';
import { debounce } from './utils.js';
import { updateScrollPadding } from './scroll.js';
import { search as fuseSearch, buildSearchIndex, getFuse } from './search-engine.js';

/**
 * 设置搜索 UI 事件监听（搜索栏、移动端侧边面板、overlay、把手）
 */
export function setupSearch() {
  const btn = document.getElementById('search-btn');
  const panel = document.getElementById('search-panel');
  const input = document.getElementById('search-input');
  const closeBtn = document.getElementById('search-close');
  const resultsList = document.getElementById('search-results');
  const countLabel = document.getElementById('search-count');

  // Mobile side-panel elements
  const mobilePanel = document.getElementById('side-panel');
  const mobileInput = document.getElementById('mobile-search-input');
  const mobileResults = document.getElementById('mobile-search-results');
  const mobileCount = document.getElementById('mobile-search-count');
  const mobileChapterList = document.getElementById('mobile-chapter-list');
  const sideClose = document.getElementById('side-panel-close');
  const panelOverlay = document.getElementById('panel-overlay');

  if (!input || !resultsList || !countLabel) return;

  const doSearchDebounced = debounce((query) => {
    doSearch(query, resultsList, countLabel, mobileResults, mobileCount);
  }, 150);

  const syncMobileSearch = debounce(() => {
    const query = mobileInput ? mobileInput.value.trim() : '';
    doSearch(query, resultsList, countLabel, mobileResults, mobileCount);
  }, 150);

  function isSearchOpen() {
    return document.querySelector('.topbar')?.classList.contains('searching') || false;
  }

  let searchCloseTimer = null;

  function openPanel() {
    const topbarEl = document.querySelector('.topbar');
    const topbarSearchRow = document.getElementById('topbar-search-row');
    if (!topbarEl || !topbarSearchRow || isSearchOpen()) return;
    if (searchCloseTimer) { clearTimeout(searchCloseTimer); searchCloseTimer = null; }
    topbarSearchRow.hidden = false;
    topbarEl.classList.add('searching');
    requestAnimationFrame(() => topbarSearchRow.classList.add('search-open'));
    setTimeout(() => updateScrollPadding(), 200);
    input.focus();
  }

  function closePanel() {
    const topbarEl = document.querySelector('.topbar');
    const topbarSearchRow = document.getElementById('topbar-search-row');
    if (!topbarEl || !topbarSearchRow || !isSearchOpen()) return;
    topbarSearchRow.classList.remove('search-open');
    input.blur();
    panel.hidden = true;
    clearSearchHighlights();
    if (searchCloseTimer) clearTimeout(searchCloseTimer);
    searchCloseTimer = setTimeout(() => {
      topbarEl.classList.remove('searching');
      topbarSearchRow.hidden = true;
      searchCloseTimer = null;
      updateScrollPadding();
    }, 180);
  }

  // 搜索按钮
  if (btn) btn.addEventListener('click', () => { if (isSearchOpen()) closePanel(); else openPanel(); });
  if (closeBtn) closeBtn.addEventListener('click', closePanel);

  // Ctrl+F 快捷键
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      openPanel();
      input.select();
    }
    if (e.key === 'Escape' && isSearchOpen()) closePanel();
  });

  input.addEventListener('input', () => {
    doSearchDebounced(input.value.trim());
  });

  // 键盘导航：↑↓ 切换结果，Enter 跳转
  input.addEventListener('keydown', (e) => {
    const searchPanel = document.getElementById('search-panel');
    if (!searchPanel || searchPanel.hidden) return;

    const items = searchPanel.querySelectorAll('.search-result-item');
    if (items.length === 0) return;

    const active = searchPanel.querySelector('.search-result-active');
    const currentIdx = active ? [...items].indexOf(active) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
      setActiveResultItem(items, currentIdx, nextIdx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
      setActiveResultItem(items, currentIdx, prevIdx);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active) active.click();
    }
  });

  // 移动端搜索输入
  if (mobileInput) {
    mobileInput.addEventListener('input', () => {
      syncMobileSearch();
    });
  }

  // 移动端搜索结果事件委托
  if (mobileResults) {
    mobileResults.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (!li) return;
      const payload = li.getAttribute('data-payload');
      if (!payload) return;
      try { const r = JSON.parse(decodeURIComponent(payload)); navigateToResult(r); } catch (_) {}
      if (mobilePanel) { mobilePanel.classList.remove('open'); mobilePanel.hidden = true; if (panelOverlay) panelOverlay.hidden = true; }
      const sh = document.getElementById('side-handle'); if (sh) sh.hidden = false;
    });
  }

  // 移动端侧边面板关闭
  if (sideClose && mobilePanel) {
    sideClose.addEventListener('click', () => {
      mobilePanel.classList.remove('open');
      mobilePanel.hidden = true;
      if (panelOverlay) panelOverlay.hidden = true;
      const sh = document.getElementById('side-handle'); if (sh) sh.hidden = false;
      if (mobileInput) mobileInput.blur();
      setTimeout(() => { try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch(_) {} }, 60);
    });
  }

  // overlay 关闭
  if (panelOverlay) {
    panelOverlay.addEventListener('click', () => {
      if (mobilePanel) { mobilePanel.classList.remove('open'); mobilePanel.hidden = true; }
      panelOverlay.hidden = true;
      const sh = document.getElementById('side-handle'); if (sh) sh.hidden = false;
      if (mobileInput) mobileInput.blur();
      setTimeout(() => { try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch(_) {} }, 60);
    });
    panelOverlay.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
  }

  // 移动端把手
  const sideHandleEl = document.getElementById('side-handle');
  if (sideHandleEl) {
    sideHandleEl.hidden = false;
    const openMobilePanel = () => {
      if (mobilePanel) { mobilePanel.hidden = false; mobilePanel.classList.add('open'); if (panelOverlay) panelOverlay.hidden = false; }
      sideHandleEl.hidden = true;
    };
    sideHandleEl.addEventListener('click', (e) => { e.stopPropagation(); openMobilePanel(); });
    sideHandleEl.addEventListener('touchstart', (e) => { e.preventDefault(); openMobilePanel(); }, { passive: false });
  }

  return { openPanel, closePanel };
}

/**
 * 执行搜索查询
 */
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
        const item = fr.item;
        const key = `${item.edition}:${item.paraId}:0`;
        if (seen.has(key)) continue;
        seen.add(key);
        const idx = item.text.indexOf(q);
        results.push({
          chapterTitle: item.chapterTitle,
          paraId: item.paraId,
          edition: item.edition === 'dunhuang' ? '敦煌本' : '宗宝本',
          query: q,
          occurrenceOrdinal: 1,
          totalOccurrences: 1,
          matchStart: idx >= 0 ? idx : 0,
          matchEnd: idx >= 0 ? idx + q.length : q.length,
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

  // 同步移动端
  if (mobileResults) {
    mobileResults.innerHTML = resultsList.innerHTML;
    mobileCount.textContent = countLabel.textContent;
    mobileResults.classList.add('visible');
  }
}

/**
 * 跳转到搜索结果段落（跨 chunk 精确定位）
 */
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
  for (const el of allEls) {
    const len = el.textContent.length;
    if (accumulated + len > result.matchStart) {
      targetEl = el;
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
    const focusRange = findOccurrenceRange(targetEl, result.query, result.occurrenceOrdinal);
    if (focusRange) applyFocusHighlight(focusRange);
  }, 450);
}

function closeSearch() {
  const topbarEl = document.querySelector('.topbar');
  if (topbarEl) topbarEl.classList.remove('searching');
  const row = document.getElementById('topbar-search-row');
  if (row) { row.hidden = true; row.classList.remove('search-open'); }
  const panel = document.getElementById('search-panel');
  if (panel) panel.hidden = true;
  clearSearchHighlights();
}

function getTopbarHeight() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return 0;
  return Math.round(topbar.getBoundingClientRect().height) + 4;
}

/**
 * 高亮段落内所有匹配项
 */
function highlightAllMatches(el, query) {
  clearSearchHighlights();
  if (!el || !query) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    let idx = 0;
    while ((idx = node.textContent.indexOf(query, idx)) !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + query.length);
      try {
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        range.surroundContents(mark);
      } catch (_) {
        // 跨节点 range 无法 surroundContents，跳过
      }
      idx += query.length;
    }
  }
}

/**
 * 在元素内定位第 N 个匹配出现位置
 */
function findOccurrenceRange(el, query, targetOrdinal) {
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
 */
function applyFocusHighlight(range) {
  try {
    const mark = document.createElement('mark');
    mark.className = 'search-focus';
    range.surroundContents(mark);
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

/**
 * 清除所有搜索高亮（包括普通高亮和焦点高亮）
 */
export function clearSearchHighlights() {
  document.querySelectorAll('mark.search-highlight, mark.search-focus').forEach(mark => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
  });
}

/**
 * 切换键盘导航的选中结果项
 */
function setActiveResultItem(items, oldIdx, newIdx) {
  if (oldIdx >= 0 && items[oldIdx]) items[oldIdx].classList.remove('search-result-active');
  if (items[newIdx]) {
    items[newIdx].classList.add('search-result-active');
    items[newIdx].scrollIntoView({ block: 'nearest' });
  }
}
