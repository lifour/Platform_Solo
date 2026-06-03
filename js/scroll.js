/**
 * scroll.js — 滚动/翻页/触摸/进度/导航
 *
 * 负责：
 * 1. 横向滚轮、键盘、触摸翻页
 * 2. 翻页阴影动画
 * 3. 进度条更新
 * 4. 品名导航下拉
 * 5. 阅读位置持久化
 */

import { store } from './store.js';

const STORAGE_KEY = 'sutra_scroll_pos';
let isFlipping = false;

/**
 * 设置所有滚动/翻页相关事件监听
 */
export function setupScroll() {
  const container = document.querySelector('.scroll-container');
  if (!container) return;

  // 翻页阴影遮罩
  const flipShadow = document.createElement('div');
  flipShadow.className = 'flip-shadow';
  document.body.appendChild(flipShadow);

  // 鼠标滚轮 → 逐页翻页
  container.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (isFlipping) return;
    if (store.get('displayMode') === 'paged') flipPage(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // 键盘左右箭头
  document.addEventListener('keydown', e => {
    const searchOpen = document.getElementById('search-panel') && !document.getElementById('search-panel').hidden;
    if (searchOpen) return;
    if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && store.get('displayMode') === 'paged') {
      e.preventDefault(); flipPage(1);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && store.get('displayMode') === 'paged') {
      e.preventDefault(); flipPage(-1);
    }
  });

  // 点击左右边缘翻页
  container.addEventListener('click', e => {
    if (e.target.closest('.term')) return;
    if (store.get('displayMode') !== 'paged') return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    if (x < w * 0.15) flipPage(-1);
    else if (x > w * 0.85) flipPage(1);
  });

  // 触摸手势
  setupTouchGestures(container, flipShadow);

  // 滚动事件：更新进度 + 保存位置
  container.addEventListener('scroll', () => {
    updateProgress();
    savePosition();
  });

  updateProgress();
}

/**
 * 触摸手势处理
 */
function setupTouchGestures(container) {
  let _touchStartX = 0, _touchStartY = 0, _touchStartTime = 0, _touchMoved = false;

  container.addEventListener('touchstart', (ev) => {
    if (!ev.touches || ev.touches.length !== 1) return;
    _touchStartX = ev.touches[0].clientX;
    _touchStartY = ev.touches[0].clientY;
    _touchStartTime = Date.now();
    _touchMoved = false;
  }, { passive: true });

  container.addEventListener('touchmove', (ev) => {
    if (!ev.touches || ev.touches.length !== 1) return;
    const dx = ev.touches[0].clientX - _touchStartX;
    if (Math.abs(dx) > 10) _touchMoved = true;
  }, { passive: true });

  container.addEventListener('touchend', (ev) => {
    const touch = (ev.changedTouches && ev.changedTouches[0]) || null;
    if (!touch) return;
    const dx = touch.clientX - _touchStartX;
    const dy = touch.clientY - _touchStartY;
    const dt = Date.now() - _touchStartTime;
    const rect = container.getBoundingClientRect();
    const startX = _touchStartX - rect.left;
    const w = rect.width;

    // 快速水平滑动
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && dt < 700) {
      // 移动端左侧边缘右滑 → 打开侧边面板
      if (startX < w * 0.12 && dx > 0 && window.innerWidth <= 640) {
        const sp = document.getElementById('side-panel');
        const ov = document.getElementById('panel-overlay');
        if (sp) { sp.hidden = false; sp.classList.add('open'); if (ov) ov.hidden = false; }
        const sh = document.getElementById('side-handle');
        if (sh) sh.hidden = true;
        return;
      }
      // 左右两侧区域滑动 → 翻页
      if (store.get('displayMode') === 'paged') {
        if (startX > w * 0.6) {
          flipPage(dx < 0 ? 1 : -1);
        } else if (startX < w * 0.4) {
          flipPage(dx > 0 ? -1 : 1);
        }
      }
      return;
    }
  }, { passive: true });
}

/**
 * 翻页：direction = 1 下一页，-1 上一页
 */
export function flipPage(direction) {
  if (isFlipping) return;
  const container = document.querySelector('.scroll-container');
  const flipShadow = document.querySelector('.flip-shadow');
  if (!container) return;
  const pageWidth = container.clientWidth;
  const maxScroll = container.scrollWidth - container.clientWidth;
  const currentPage = Math.round(container.scrollLeft / pageWidth);
  const targetScroll = Math.min(Math.max(0, (currentPage + direction) * pageWidth), maxScroll);

  if (Math.abs(targetScroll - container.scrollLeft) < 2) return;

  isFlipping = true;
  if (flipShadow) flipShadow.classList.add('active');

  container.scrollTo({ left: targetScroll, behavior: 'smooth' });

  setTimeout(() => {
    if (flipShadow) flipShadow.classList.remove('active');
    isFlipping = false;
  }, 500);
}

/**
 * 更新进度条和当前品名
 */
export function updateProgress() {
  const container = document.querySelector('.scroll-container');
  if (!container) return;
  const fill = document.querySelector('.progress-bar-fill');
  const label = document.querySelector('.topbar-progress');

  const maxScroll = container.scrollWidth - container.clientWidth;
  const pct = maxScroll > 0 ? (container.scrollLeft / maxScroll) * 100 : 0;

  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = Math.round(pct) + '%';

  updateActiveChapter();
}

/**
 * 同步品名导航下拉到当前可见品
 */
export function updateActiveChapter() {
  const container = document.querySelector('.scroll-container');
  const select = document.getElementById('chapter-select');
  if (!container || !select) return;

  // 滑动模式用垂直偏移，翻页模式用水平偏移
  const isScroll = store.get('displayMode') === 'scroll';
  const scrollPos = isScroll ? container.scrollTop : container.scrollLeft;
  const viewSize = isScroll ? container.clientHeight : container.clientWidth;
  const center = scrollPos + viewSize / 2;

  const chapters = container.querySelectorAll('.fold--chapter-start');
  let activeId = chapters.length > 0 ? chapters[0].id : '';
  chapters.forEach(el => {
    const pos = isScroll ? el.offsetTop : el.offsetLeft;
    if (pos <= center) activeId = el.id;
  });

  if (select.value !== activeId) {
    select.value = activeId;
  }
}

// ---- 阅读位置持久化 ----

export function savePosition() {
  const container = document.querySelector('.scroll-container');
  if (!container) return;
  const maxScroll = container.scrollWidth - container.clientWidth;
  if (maxScroll > 0) {
    const ratio = container.scrollLeft / maxScroll;
    try { localStorage.setItem(STORAGE_KEY, ratio.toString()); } catch (_) {}
  }
}

export function restorePosition() {
  const container = document.querySelector('.scroll-container');
  if (!container) return;

  // 延迟等待 DOM 完全渲染
  setTimeout(() => {
    try {
      const bookmarks = JSON.parse(localStorage.getItem('sutra_bookmarks_v1') || '[]');
      // 按顺序找第一个在当前书中存在的书签
      for (const bm of bookmarks) {
        const fold = container.querySelector(`#${CSS.escape(bm.chapterId)}`);
        if (fold) {
          fold.scrollIntoView({ behavior: 'auto', inline: 'start', block: 'nearest' });
          const isScroll = store.get('displayMode') === 'scroll';
          if (isScroll) container.scrollTop -= 60;
          updateProgress();
          return;
        }
      }
    } catch (_) {}

    // 无书签时恢复上次阅读位置
    try {
      const ratio = parseFloat(localStorage.getItem(STORAGE_KEY));
      if (!isNaN(ratio) && ratio > 0) {
        const maxScroll = container.scrollWidth - container.clientWidth;
        container.scrollLeft = ratio * maxScroll;
      }
    } catch (_) {}

    updateProgress();
  }, 300);
}

// ---- 品名导航 ----

export function setupNavigation() {
  const select = document.getElementById('chapter-select');
  if (!select) return;
  select.addEventListener('change', () => {
    const target = document.getElementById(select.value);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
  });
}
