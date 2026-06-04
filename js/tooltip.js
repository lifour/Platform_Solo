/**
 * tooltip.js — 术语交互系统
 *
 * 桌面 hover：显示术语释义浮层
 * 点击术语：弹出操作栏（释义、查更多、高亮）
 */

import { store } from './store.js';
import { enhanceTooltipWithLookup, lookupTerm } from './external-lookup.js';
import { deleteHighlightsByParagraph } from './db.js';
import { isBookmarked, removeBookmark } from './bookmarks.js';
import { readFromParagraph } from './reader.js';
import { showNotesPanel } from './notes.js';

let longPressTimer = null;
let termActionBar = null;

export function setupTermInteraction() {
  const container = document.querySelector('.scroll-container');
  if (!container) return;

  // 操作栏
  termActionBar = document.createElement('div');
  termActionBar.className = 'term-bar';
  termActionBar.hidden = true;
  document.body.appendChild(termActionBar);

  // 桌面 hover
  container.addEventListener('mouseenter', e => {
    if (e.target.classList.contains('term')) showTooltip(e.target);
  }, true);
  container.addEventListener('mouseleave', e => {
    if (e.target.classList.contains('term')) hideTooltip();
  }, true);

  // 点击 → 操作栏
  container.addEventListener('click', e => {
    // 术语
    const term = e.target.closest('.term');
    if (term) { e.stopPropagation(); showTermBar(term); return; }

    // 高亮文字
    const hl = e.target.closest('mark.hl-yellow, mark.hl-green, mark.hl-blue, mark.hl-pink, mark.hl-orange');
    if (hl) { e.stopPropagation(); showHighlightBar(hl); return; }

    // 标注指示器（金色小圆点 → 打开笔记面板）
    const dot = e.target.closest('.anno-dot');
    if (dot) {
      e.stopPropagation();
      showNotesPanel();
      return;
    }

    hideTermBar();
  });

  // 移动端：触击=操作栏，长按=释义浮层
  container.addEventListener('touchstart', e => {
    const target = e.target.closest('.term');
    if (!target) return;
    const startX = e.touches[0].clientX, startY = e.touches[0].clientY;
    let moved = false;
    const onMove = (ev) => {
      const dx = ev.touches[0].clientX - startX, dy = ev.touches[0].clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved = true;
    };
    const onEnd = () => {
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onEnd);
      clearTimeout(longPressTimer);
      if (moved) return;
      // 短触击 → 操作栏
      showTermBar(target);
    };
    container.addEventListener('touchmove', onMove, { passive: true });
    container.addEventListener('touchend', onEnd, { passive: true });
    // 长按 → 释义浮层
    longPressTimer = setTimeout(() => {
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onEnd);
      showTooltip(target);
    }, 300);
  }, { passive: true });

  container.addEventListener('contextmenu', e => {
    if (e.target.closest('.term')) e.preventDefault();
  });

  // 关闭
  document.addEventListener('click', e => {
    if (!e.target.closest('.term') && !e.target.closest('.term-bar') && !e.target.closest('.tooltip')) {
      hideTermBar();
      hideTooltip();
    }
  });
}

// ---- 术语操作栏 ----

function showTermBar(termEl) {
  if (!termActionBar) return;
  const term = termEl.dataset.term;
  const data = store.get('glossaryMap')[term];
  if (!data) return;

  const paraEl = termEl.closest('.para');
  const fold = paraEl ? paraEl.closest('.fold') : null;
  const chapterId = fold ? fold.id : '';
  const paraId = paraEl ? paraEl.dataset.para : '';
  const edition = paraEl ? (paraEl.dataset.edition || '') : '';

  termActionBar.innerHTML = '';
  termActionBar.hidden = false;

  // 术语名
  const name = document.createElement('span');
  name.className = 'term-bar-name';
  name.textContent = term;
  termActionBar.appendChild(name);

  termActionBar.appendChild(_sep());

  // 释义
  const defBtn = _btn('释义', () => { lookupTerm(term); hideTermBar(); });
  termActionBar.appendChild(defBtn);

  // 查更多
  const moreBtn = _btn('查更多', () => {
    window.open(`https://www.putixia.org/?s=${encodeURIComponent(term)}`, '_blank', 'noopener');
    hideTermBar();
  });
  termActionBar.appendChild(moreBtn);

  // 定位
  requestAnimationFrame(() => {
    const rect = termEl.getBoundingClientRect();
    const barW = termActionBar.offsetWidth || 360;
    let left = rect.left + rect.width / 2 - barW / 2;
    let top = rect.bottom + 6;
    termActionBar.style.left = Math.max(8, Math.min(left, window.innerWidth - barW - 8)) + 'px';
    termActionBar.style.top = top + 'px';
    termActionBar.classList.add('visible');
  });
}

function hideTermBar() {
  if (termActionBar) {
    termActionBar.classList.remove('visible');
    termActionBar.hidden = true;
  }
}

function _sep() {
  const el = document.createElement('span');
  el.className = 'term-bar-sep';
  return el;
}

function _btn(text, onClick) {
  const btn = document.createElement('button');
  btn.className = 'term-bar-btn';
  btn.textContent = text;
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

// ---- 原有浮层（桌面 hover） ----

export function showTooltip(termEl) {
  const term = termEl.dataset.term;
  const data = store.get('glossaryMap')[term];
  if (!data) return;

  const tooltip = document.querySelector('.tooltip');
  if (!tooltip) return;

  tooltip.querySelector('.tooltip-term').textContent = term;
  tooltip.querySelector('.tooltip-pinyin').textContent = data.pinyin;
  tooltip.querySelector('.tooltip-meaning').textContent = data.meaning;
  enhanceTooltipWithLookup(tooltip, term);

  const rect = termEl.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 8;

  if (left + 320 > window.innerWidth) left = window.innerWidth - 330;
  if (top + 150 > window.innerHeight) {
    top = rect.top - 8;
    tooltip.style.transform = 'translateY(-100%)';
  } else {
    tooltip.style.transform = '';
  }

  tooltip.style.left = Math.max(10, left) + 'px';
  tooltip.style.top = top + 'px';
  tooltip.classList.add('visible');
}

export function hideTooltip() {
  const tooltip = document.querySelector('.tooltip');
  if (tooltip) tooltip.classList.remove('visible');
}

// ---- 高亮操作栏 ----

function showHighlightBar(hlEl) {
  if (!termActionBar) return;
  const paraEl = hlEl.closest('.para');
  if (!paraEl) return;
  const fold = paraEl.closest('.fold');
  const chapterId = fold ? fold.id : '';
  const paraId = paraEl.dataset.para;
  const edition = paraEl.dataset.edition || '';

  termActionBar.innerHTML = '';
  termActionBar.hidden = false;

  // 颜色标识
  const dot = document.createElement('span');
  const colorClass = [...hlEl.classList].find(c => c.startsWith('hl-')) || 'hl-yellow';
  dot.style.cssText = `width:16px;height:16px;border-radius:3px;background:var(--${colorClass.replace('hl-', '') === 'yellow' ? 'accent-gold' : 'ink-light'});flex-shrink:0;`;
  // Map color class to actual color
  const cMap = { 'hl-yellow': '#FFF176', 'hl-green': '#A5D6A7', 'hl-blue': '#90CAF9', 'hl-pink': '#F48FB1', 'hl-orange': '#FFCC80' };
  dot.style.background = cMap[colorClass] || '#FFF176';
  termActionBar.appendChild(dot);

  termActionBar.appendChild(_sep());

  // 取消高亮（如有书签一并取消）
  const rmBtn = _btn('取消高亮', async () => {
    const fullText = paraEl.textContent || '';
    const hlText = hlEl.textContent || '';
    const startIdx = fullText.indexOf(hlText);
    if (startIdx >= 0) {
      await deleteHighlightsByParagraph(chapterId, paraId, edition);
      const parent = hlEl.parentNode;
      parent.replaceChild(document.createTextNode(hlEl.textContent), hlEl);
      parent.normalize();
    }
    // 如有书签一并移除
    if (isBookmarked(chapterId, paraId)) {
      removeBookmark(chapterId, paraId);
    }
    hideTermBar();
  });
  termActionBar.appendChild(rmBtn);

  termActionBar.appendChild(_sep());

  // 往下读
  const readBtn = _btn('往下读', () => {
    readFromParagraph(paraEl);
    hideTermBar();
  });
  termActionBar.appendChild(readBtn);

  // 定位
  requestAnimationFrame(() => {
    const rect = hlEl.getBoundingClientRect();
    const barW = termActionBar.offsetWidth || 360;
    let left = rect.left + rect.width / 2 - barW / 2;
    let top = rect.bottom + 8;
    termActionBar.style.left = Math.max(8, Math.min(left, window.innerWidth - barW - 8)) + 'px';
    termActionBar.style.top = top + 'px';
    termActionBar.classList.add('visible');
  });
}

// ---- 标注指示器操作栏 ----

function showAnnoBar(paraEl) {
  if (!termActionBar || !paraEl) return;
  const fold = paraEl.closest('.fold');
  const chapterId = fold ? fold.id : '';
  const paraId = paraEl.dataset.para;

  termActionBar.innerHTML = '';
  termActionBar.hidden = false;

  // 标注标识
  const lbl = document.createElement('span');
  lbl.textContent = '📑 有标注';
  lbl.style.cssText = 'font-size:0.8rem;color:var(--accent-gold);white-space:nowrap;';
  termActionBar.appendChild(lbl);

  termActionBar.appendChild(_sep());

  // 书签
  const bm = isBookmarked(chapterId, paraId);
  const bmBtn = _btn(bm ? '★ 已收藏' : '☆ 收藏', () => {
    if (isBookmarked(chapterId, paraId)) removeBookmark(chapterId, paraId);
    else addBookmark(chapterId, paraId, (paraEl.textContent || '').trim().slice(0, 80));
    hideTermBar();
  });
  termActionBar.appendChild(bmBtn);

  termActionBar.appendChild(_sep());

  // 往下读
  const readBtn = _btn('往下读', () => {
    readFromParagraph(paraEl);
    hideTermBar();
  });
  termActionBar.appendChild(readBtn);

  // 定位
  requestAnimationFrame(() => {
    const rect = paraEl.getBoundingClientRect();
    const barW = termActionBar.offsetWidth || 320;
    let left = rect.left + rect.width / 2 - barW / 2;
    let top = rect.bottom + 8;
    termActionBar.style.left = Math.max(8, Math.min(left, window.innerWidth - barW - 8)) + 'px';
    termActionBar.style.top = top + 'px';
    termActionBar.classList.add('visible');
  });
}
