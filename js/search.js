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

  // 简体自动转繁体
  const tQuery = toTraditional(query);
  const queries = [tQuery];
  if (tQuery !== query) queries.push(query);

  const results = [];
  const seen = new Set();

  // 仅搜索当前典籍
  const bookId = store.get('currentBookId');
  const dataSources = [{ data: store.state.sutraData, label: bookId === 'tanjing' ? '宗宝本' : '当前典籍' }];
  // 坛经额外搜索敦煌本
  if (bookId === 'tanjing') {
    const dhData = store.get('dunhuangData');
    if (dhData) dataSources.push({ data: dhData, label: '敦煌本' });
  }

  for (const q of queries) {
    for (const src of dataSources) {
      if (!src.data || !src.data.chapters) continue;
      src.data.chapters.forEach(chapter => {
        (chapter.paragraphs || []).forEach(para => {
          let idx = 0;
          while ((idx = para.text.indexOf(q, idx)) !== -1) {
            const key = `${src.label}:${para.id}:${idx}`;
            if (seen.has(key)) { idx += q.length; continue; }
            seen.add(key);
            const ctxStart = Math.max(0, idx - 25);
            const ctxEnd = Math.min(para.text.length, idx + q.length + 25);
            const before = (ctxStart > 0 ? '…' : '') + para.text.slice(ctxStart, idx);
            const match = para.text.slice(idx, idx + q.length);
            const after = para.text.slice(idx + q.length, ctxEnd) + (ctxEnd < para.text.length ? '…' : '');
            results.push({ chapterTitle: chapter.title, paraId: para.id, before, match, after, query: q, edition: src.label });
            idx += q.length;
          }
        });
      });
    }
  }

  countLabel.textContent = results.length > 0 ? `${results.length} 处` : '无结果';

  const panel = document.getElementById('search-panel');
  if (panel) panel.hidden = results.length === 0;

  results.slice(0, 100).forEach(r => {
    const li = document.createElement('li');
    const edLabel = r.edition !== '宗宝本'
      ? `<span style="font-size:0.7rem;color:var(--ink-light);margin-left:0.4em">${escapeHtml(r.edition)}</span>`
      : '';
    li.innerHTML = `<div class="result-chapter">${escapeHtml(r.chapterTitle)}${edLabel}</div>` +
      `<div>${escapeHtml(r.before)}<mark>${escapeHtml(r.match)}</mark>${escapeHtml(r.after)}</div>`;
    li.addEventListener('click', () => navigateToResult(r));
    try { li.setAttribute('data-payload', encodeURIComponent(JSON.stringify(r))); } catch (_) {}
    resultsList.appendChild(li);
  });

  // 同步移动端
  if (mobileResults) {
    mobileResults.innerHTML = resultsList.innerHTML;
    mobileCount.textContent = countLabel.textContent;
    mobileResults.classList.add('visible');
  }
}

/**
 * 跳转到搜索结果段落
 */
export function navigateToResult(result) {
  closeSearch();

  let selector = `.para[data-para="${result.paraId}"]`;
  if (result.edition === '敦煌本') selector = `.para[data-para="${result.paraId}"][data-edition="dh"]`;
  const paraEl = document.querySelector(selector) || document.querySelector(`.para[data-para="${result.paraId}"]`);
  if (!paraEl) return;

  const container = document.querySelector('.scroll-container');
  if (!container) return;

  if (store.get('displayMode') === 'scroll') {
    const offset = getTopbarHeight();
    const containerRect = container.getBoundingClientRect();
    const paraRect = paraEl.getBoundingClientRect();
    const scrollTarget = container.scrollTop + paraRect.top - containerRect.top - offset;
    container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
  } else {
    const fold = paraEl.closest('.fold');
    if (fold) fold.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }

  setTimeout(() => highlightInElement(paraEl, result.query), 550);
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
 * 在元素内高亮第一个搜索匹配
 */
export function highlightInElement(el, query) {
  clearSearchHighlights();
  if (!el || !query) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const idx = node.textContent.indexOf(query);
    if (idx === -1) continue;
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + query.length);
    const mark = document.createElement('mark');
    mark.className = 'search-highlight';
    range.surroundContents(mark);
    break;
  }
}

/**
 * 清除所有搜索高亮
 */
export function clearSearchHighlights() {
  document.querySelectorAll('mark.search-highlight').forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}
