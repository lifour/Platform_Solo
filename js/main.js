/**
 * main.js — 六祖坛经·阅藏 核心逻辑
 *
 * 1. 加载 JSON 经文 + 术语词典
 * 2. 渲染经折装 DOM
 * 3. 横向滚动 (wheel → scrollLeft)
 * 4. 品名导航跳转
 * 5. 术语浮层（桌面悬停 / 移动长按）
 * 6. 阅读进度记忆 (localStorage)
 */

// ---- 全局状态 ----
let sutraData = null;    // zongbao.json 或 zongbao_pinyin.json
let dunhuangData = null; // dunhuang.json 或 dunhuang_pinyin.json
let glossaryMap = {};    // term → { pinyin, meaning }
let pinyinMap = {};      // char → pinyin
let tooltip = null;      // tooltip DOM element
let longPressTimer = null;
let isFlipping = false;
let compareMode = false; // 对照模式
let readerEdition = 'zongbao'; // 当前单本阅读版本
let pinyinMode = false;  // 拼音注音模式
let useTraditionalContent = false; // 经文内容：默认简体
let _hasRendered = false;
let pinyinRenderedParagraphIDs = null;
let readerLayoutInProgress = false;
let readerSelectionLocked = false;
let currentReaderTitle = '六祖坛经-行由品第一';
let currentReaderPageLabel = '1 / 1页';
let pendingReaderAnchor = null;

const STORAGE_KEY = 'sutra_scroll_pos';

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (_) {
    return false;
  }
}

// 在首次 DOM 排版和原生 Page Curl 分页之前恢复阅读字体设置，
// 避免原生页面与打开设置后露出的 Web 页面字号不一致。
function applyStoredReaderTypographyBeforeRender() {
  let fontPx = 18;
  let lineHeight = 1.9;
  let fontFamily = '';
  try {
    const storedFont = parseInt(localStorage.getItem('ui_font_px'), 10);
    const storedLineHeight = parseFloat(localStorage.getItem('ui_line_height'));
    fontFamily = localStorage.getItem('ui_font_family') || '';
    if (Number.isFinite(storedFont)) fontPx = storedFont;
    if (Number.isFinite(storedLineHeight)) lineHeight = storedLineHeight;
  } catch (_) {}
  fontPx = Math.min(28, Math.max(16, 16 + Math.round((fontPx - 16) / 2) * 2));
  lineHeight = Number(Math.min(2.1, Math.max(1.3, 1.3 + Math.round((lineHeight - 1.3) / 0.2) * 0.2)).toFixed(1));
  document.documentElement.style.setProperty('--reader-font-size', `${fontPx}px`);
  document.documentElement.style.setProperty('--reader-line-height', lineHeight);
  if (fontFamily) document.documentElement.style.setProperty('--reader-font-family', fontFamily);
}

function isMobileReader() {
  return window.matchMedia('(max-width: 480px)').matches;
}

function setReaderChromeVisible(visible) {
  document.body.classList.toggle('reader-chrome-hidden', !visible);
  document.getElementById('reader-mobile-page')?.toggleAttribute('hidden', !visible);
  document.getElementById('reader-mobile-title')?.toggleAttribute('hidden', visible);
}

function toggleReaderChrome() {
  if (!isMobileReader()) return;
  setReaderChromeVisible(document.body.classList.contains('reader-chrome-hidden'));
}

function setAppScreen(screen) {
  const isLibrary = screen === 'library';
  document.body.dataset.appScreen = isLibrary ? 'library' : 'reader';
  document.body.classList.toggle('app-screen-library', isLibrary);
  document.body.classList.toggle('app-screen-reader', !isLibrary);
  writeStorage('tanjing_app_screen', isLibrary ? 'library' : 'reader');
  const library = document.getElementById('library-panel');
  const readerRegions = [
    document.querySelector('.topbar'),
    document.querySelector('.scroll-container'),
    document.querySelector('.mobile-tabbar'),
    document.querySelector('.reader-mobile-topbar')
  ].filter(Boolean);
  if (library) {
    library.inert = !isLibrary;
    library.setAttribute('aria-hidden', String(!isLibrary));
  }
  readerRegions.forEach((region) => {
    region.inert = isLibrary;
    region.setAttribute('aria-hidden', String(isLibrary));
  });
}

function applyUILanguage(useTraditional) {
  useTraditionalContent = useTraditional;
  // 繁简是正文阅读参数；按钮、设置、目录等界面文字始终保持原样。
  if (!_hasRendered) return;
  // 正文直接读取导入阶段由系统转换引擎生成的简体，或人工校订的繁体主文本。
  // 不再现场遍历 DOM 做字符表替换，因此未来经书可以复用同一数据结构。
  rerender();
}

function initUILanguage() {
  const stored = (function(){ try { return localStorage.getItem('ui_traditional'); } catch(e){ return null; } })();
  const useTrad = stored === '1';
  applyUILanguage(useTrad);
  try {
    const control = document.getElementById('setting-traditional-mode');
    if (control) {
      control.setAttribute('aria-pressed', useTrad ? 'true' : 'false');
      control.classList.toggle('is-active', useTrad);
    }
  } catch(e){}
}

// ---- 启动 ----
// module 脚本在部分 WebView / 热更新场景中可能晚于 DOMContentLoaded 执行，
// 因此同时兼容“DOM 尚未完成”和“DOM 已经就绪”两种加载时序。
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
// 脚本位于 body 末尾，此时阅读容器已存在；立即安装选区监听，避免错过
// 某些移动 WebView 较早派发的 DOMContentLoaded。
setupSelectionToolbar();
setupHighlightActions();

async function init() {
  try {
    const [primarySutra, glossaryData] = await Promise.all([
      fetchJSON('data/zongbao.json'),
      fetchJSON('data/glossary.json'),
    ]);
    sutraData = primarySutra;


    // 可选数据：敦煌本 & 拼音（不阻塞主流程）
    // 预加载拼音版数据
    window._zongbaoRaw = sutraData;
    window._dunhuangRaw = null;
    try {
      dunhuangData = await fetchJSON('data/dunhuang.json');
      window._dunhuangRaw = dunhuangData;
    } catch (_) { /* 敦煌本不可用 */ }
    // 预加载拼音版
    window._zongbaoPinyin = null;
    window._dunhuangPinyin = null;
    try {
      window._zongbaoPinyin = await fetchJSON('data/zongbao_pinyin.json');
    } catch (_) {}
    try {
      window._dunhuangPinyin = await fetchJSON('data/dunhuang_pinyin.json');
    } catch (_) {}

    // 构建术语查找表（按长度降序排列以支持最长匹配）
    glossaryData.terms.forEach(t => {
      const entry = { pinyin: t.pinyin, meaning: t.meaning };
      glossaryMap[t.term] = entry;
      glossaryMap[toSimplified(t.term)] = entry;
    });

    // initialize UI prefs (display mode, compare mode) before first render
    initDisplayMode();
    initCompareMode();
    initUILanguage();
    applyStoredReaderTypographyBeforeRender();
    render();
    setupScroll();
    setupNavigation();
    setupToggles();
    restorePosition();
    setupSearch();
    setupLiquidInteractions();
    setupNativeIOSBridge();
    if (isMobileReader()) setReaderChromeVisible(false);
  } catch (err) {
    console.error('加载经文数据失败:', err);
    document.querySelector('.scroll-container').innerHTML =
      '<div class="loading">经文加载失败，请检查 data/ 目录</div>';
  }
}

// 将网页业务状态同步给 iOS 26 原生 UIKit 控件；普通浏览器中不会启用。
function setupNativeIOSBridge() {
  const handler = window.webkit?.messageHandlers?.tanJingNativeUI;
  if (!handler) return;
  document.documentElement.classList.add('native-liquid-glass');
  if (!Number.isInteger(window.__tanJingNativeSelectedIndex)) {
    window.__tanJingNativeSelectedIndex = -1;
  }
  const ids = ['mobile-toc-btn', 'mobile-notes-btn', 'mobile-lighthouse-btn', 'mobile-settings-btn'];
  let scheduled = false;
  const sendState = () => {
    scheduled = false;
    const active = ids.map(id => document.getElementById(id)?.classList.contains('active') || false);
    const requestedIndex = window.__tanJingNativeSelectedIndex;
    // 藏经阁、目录、灯塔、设置可能同时带 active；只回写用户最后操作的项目，避免选中块跳回旧状态。
    const selectedIndex = requestedIndex >= 0 && active[requestedIndex] ? requestedIndex : -1;
    if (selectedIndex < 0) window.__tanJingNativeSelectedIndex = -1;
    handler.postMessage({
      chromeVisible: !document.body.classList.contains('reader-chrome-hidden'),
      selectedIndex,
      readerTitle: currentReaderTitle,
      readerPageLabel: currentReaderPageLabel,
      searchCompact: document.querySelector('.topbar')?.classList.contains('search-compact') || false,
      pageCurlEnabled: displayMode === 'paged',
      pageCurlSuspended: isNativePageCurlSuspended()
    });
    // 字号/行距调整期间只维护当前 Web 预览。弹窗退出后再把最终
    // 结果一次性交给 UIKit，避免拖动一次滑块重建多轮原生页面。
    if (!document.body.classList.contains('reader-panel-open') && nativePageCurlNeedsSync) {
      syncNativePageCurl();
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sendState);
  };
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
  ids.forEach((id, index) => {
    document.getElementById(id)?.addEventListener('click', () => {
      window.__tanJingNativeSelectedIndex = index;
      schedule();
    });
  });
  schedule();
  syncNativePageCurl();
}

let nativePageCurlSyncTimer = null;
let nativePageCurlRevision = 0;
let nativePageCurlNeedsSync = false;
let nativePageCurlRequestedIndex = null;

function isNativePageCurlSuspended() {
  return compareMode ||
    readerSelectionLocked ||
    document.body.classList.contains('reader-panel-open') ||
    document.body.classList.contains('reader-search-open') ||
    nativePageCurlNeedsSync;
}

function setReaderSelectionLocked(locked) {
  const next = !!locked;
  if (readerSelectionLocked === next) return;
  readerSelectionLocked = next;
  document.body.classList.toggle('reader-selection-locked', next);
  document.querySelectorAll('.compare-reader-pane').forEach(pane => {
    if (next) {
      pane.dataset.selectionScrollLeft = String(pane.scrollLeft);
      pane.style.setProperty('scroll-snap-type', 'none', 'important');
    } else {
      pane.style.removeProperty('scroll-snap-type');
    }
  });
  postNativePageCurlVisibility();
}

function nativeUIHandler() {
  return window.webkit?.messageHandlers?.tanJingNativeUI || null;
}

function postNativePageCurlVisibility() {
  const handler = nativeUIHandler();
  if (!handler) return;
  handler.postMessage({
    pageCurlEnabled: displayMode === 'paged' && !compareMode,
    pageCurlSuspended: isNativePageCurlSuspended()
  });
}

function syncNativePageCurl() {
  const handler = nativeUIHandler();
  if (!handler) return;
  if (document.body.classList.contains('reader-panel-open') ||
      document.body.classList.contains('reader-search-open')) {
    nativePageCurlNeedsSync = true;
    postNativePageCurlVisibility();
    return;
  }
  clearTimeout(nativePageCurlSyncTimer);
  nativePageCurlSyncTimer = setTimeout(() => {
    if (displayMode !== 'paged' || compareMode) {
      handler.postMessage({ pageCurlEnabled: false });
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const container = document.querySelector('.scroll-container');
      if (!container) return;
      const folds = Array.from(container.querySelectorAll(':scope > .fold'));
      if (!folds.length) return;
      nativePageCurlRevision += 1;
      let chapterID = '';
      let pageIndexInChapter = 0;
      const bodyClasses = [pinyinMode ? 'pinyin-mode' : '', 'mode-paged'].filter(Boolean).join(' ');
      const rootStyle = getComputedStyle(document.documentElement);
      const readerFontSize = rootStyle.getPropertyValue('--reader-font-size').trim() || '18px';
      const readerLineHeight = rootStyle.getPropertyValue('--reader-line-height').trim() || '1.9';
      const readerFontFamily = rootStyle.getPropertyValue('--reader-font-family').trim() || 'serif';
      const pages = folds.map((fold, globalPageIndex) => {
        if (fold.classList.contains('fold--chapter-start')) {
          chapterID = fold.id || `chapter-${globalPageIndex}`;
          pageIndexInChapter = 0;
        }
        const anchor = fold.querySelector('.para[data-para]')?.dataset.para || chapterID;
        const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="fonts/font.css"><link rel="stylesheet" href="css/sutra.css"><style>:root{--reader-font-size:${readerFontSize};--reader-line-height:${readerLineHeight};--reader-font-family:${readerFontFamily}}html,body{width:100%;height:100%;margin:0;background:#F3EFE0;overflow:hidden}body{display:block}.scroll-container{position:fixed;inset:0;width:100%;height:100%;display:block;overflow:hidden}.scroll-container>.fold{width:100%;height:100%;max-width:none;box-sizing:border-box;overflow:hidden}body::after,.progress-bar,.mobile-tabbar{display:none!important}</style></head><body class="${bodyClasses}"><main class="scroll-container">${fold.outerHTML}</main></body></html>`;
        const page = {
          id: `${nativePageCurlRevision}:${chapterID}:${pageIndexInChapter}`,
          chapterID,
          pageIndexInChapter,
          globalPageIndex,
          anchor,
          html
        };
        pageIndexInChapter += 1;
        return page;
      });
      const measuredPageIndex = Math.min(
        pages.length - 1,
        Math.max(0, Math.round(container.scrollLeft / Math.max(1, container.clientWidth)))
      );
      // 目录跳转使用一次性的强制目标页。原生翻页层重建时直接采用它，
      // 避免重建前仍读取到旧页而把刚完成的目录跳转覆盖掉。
      const currentPageIndex = Number.isInteger(nativePageCurlRequestedIndex)
        ? Math.min(pages.length - 1, Math.max(0, nativePageCurlRequestedIndex))
        : measuredPageIndex;
      nativePageCurlRequestedIndex = null;
      nativePageCurlNeedsSync = false;
      handler.postMessage({
        pageCurlEnabled: true,
        pageCurlSuspended: false,
        pageCurl: {
          pages,
          currentPageIndex,
          viewportTop: container.getBoundingClientRect().top,
          background: '#F3EFE0'
        }
      });
    }));
  }, 40);
}

// ---- 全局液态玻璃触控反馈 ----
function setupLiquidInteractions() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tabbar = document.querySelector('.mobile-tabbar');
  const tabButtons = tabbar ? Array.from(tabbar.querySelectorAll('.mobile-tabbar-btn')) : [];
  const indicator = tabbar?.querySelector('.mobile-tabbar-indicator');

  function bounce(element) {
    if (!element || reduceMotion.matches || typeof element.animate !== 'function') return;
    element.getAnimations().forEach(animation => {
      if (animation.id === 'liquid-control-bounce') animation.cancel();
    });
    const animation = element.animate([
      { scale: '0.965', offset: 0 },
      { scale: '1.025', offset: 0.38 },
      { scale: '0.995', offset: 0.72 },
      { scale: '1', offset: 1 }
    ], {
      duration: 420,
      easing: 'cubic-bezier(0.2, 0.82, 0.25, 1)',
      fill: 'none'
    });
    animation.id = 'liquid-control-bounce';
  }

  function moveTabIndicator(index, visible = true) {
    if (!tabbar || !indicator || index < 0) {
      tabbar?.classList.remove('has-liquid-selection');
      return;
    }
    tabbar.style.setProperty('--liquid-index', String(index));
    tabbar.classList.toggle('has-liquid-selection', visible);
    indicator.classList.remove('is-settling');
    void indicator.offsetWidth;
    indicator.classList.add('is-settling');
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('button, [role="button"]');
    if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;

    const tabIndex = tabButtons.indexOf(control);
    const isLibraryTab = Boolean(control.closest('.library-home-nav-main'));
    // iOS 的整条导航是稳定玻璃面；标签只移动选中玻璃，不缩放文字和图标。
    if (tabIndex === -1 && !isLibraryTab) bounce(control);
    if (tabIndex === -1) return;
    requestAnimationFrame(() => {
      if (control.classList.contains('active')) {
        moveTabIndicator(tabIndex);
        return;
      }
      const fallbackIndex = tabButtons.findIndex(button => button.classList.contains('active'));
      moveTabIndicator(fallbackIndex, fallbackIndex >= 0);
    });
  });

  const initialIndex = tabButtons.findIndex(button => button.classList.contains('active'));
  if (initialIndex >= 0) moveTabIndicator(initialIndex);
}

// display mode: 'scroll' or 'paged'
let displayMode = 'scroll';

function applyDisplayMode(mode) {
  displayMode = mode === 'paged' ? 'paged' : 'scroll';
  document.body.classList.toggle('mode-scroll', displayMode === 'scroll');
  document.body.classList.toggle('mode-paged', displayMode === 'paged');
  try { localStorage.setItem('ui_display_mode', displayMode); } catch(e){}
  const modeLabel = document.getElementById('page-mode-label');
  if (modeLabel) modeLabel.textContent = compareMode
    ? '仿真翻页'
    : (displayMode === 'paged' ? '仿真翻页' : '滑动显示');
  const displaySelect = document.getElementById('display-mode-select');
  if (displaySelect) displaySelect.value = compareMode ? 'paged' : displayMode;
  if (_hasRendered) rerender();
  postNativePageCurlVisibility();
}

function initDisplayMode() {
  try { const stored = localStorage.getItem('ui_display_mode'); if (stored) displayMode = stored; } catch(e){}
  applyDisplayMode(displayMode || 'scroll');
}

// compare mode init/apply
function applyCompareMode(enabled) {
  compareMode = !!enabled;
  try { localStorage.setItem('ui_compare_mode', compareMode ? '1' : '0'); } catch(e){}
  const cb = document.getElementById('compare-btn'); if (cb) cb.classList.toggle('active', compareMode);
  const settingButton = document.getElementById('setting-compare-mode');
  settingButton?.classList.toggle('is-active', compareMode);
  settingButton?.setAttribute('aria-pressed', compareMode ? 'true' : 'false');
  document.body.classList.toggle('compare-reading', compareMode);
  const displaySelect = document.getElementById('display-mode-select');
  const modeLabel = document.getElementById('page-mode-label');
  if (displaySelect) {
    displaySelect.disabled = compareMode;
    // 对照阅读使用独立的横向分页器，不改写用户原有的单本阅读偏好。
    displaySelect.value = compareMode ? 'paged' : displayMode;
  }
  if (modeLabel) modeLabel.textContent = compareMode
    ? '仿真翻页'
    : (displayMode === 'paged' ? '仿真翻页' : '滑动显示');
}

function initCompareMode() {
  try { const stored = localStorage.getItem('ui_compare_mode'); if (stored !== null) compareMode = (stored === '1' || stored === 'true'); } catch(e){}
  try { readerEdition = localStorage.getItem('ui_reader_edition') === 'dunhuang' ? 'dunhuang' : 'zongbao'; } catch(e){}
  applyCompareMode(compareMode);
}


// ---- 渲染经折装 ----
function render() {
  const container = document.querySelector('.scroll-container');
  const select = document.getElementById('chapter-select');
  const mobileList = document.getElementById('mobile-chapter-list');
  container.innerHTML = '';
  if (mobileList) mobileList.innerHTML = '';

  // 重置导航下拉
  while (select.options.length > 1) select.remove(1);

  // 获取所有术语（按长度降序，确保最长匹配优先）
  const terms = Object.keys(glossaryMap).sort((a, b) => b.length - a.length);
  const termPattern = terms.length > 0
    ? new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'g')
    : null;

  // 切换 body 的 pinyin-mode class
  document.body.classList.toggle('pinyin-mode', pinyinMode);

  // 切换数据源
  if (pinyinMode && window._zongbaoPinyin) {
    sutraData = readerEdition === 'dunhuang' && window._dunhuangPinyin
      ? window._dunhuangPinyin
      : window._zongbaoPinyin;
    if (window._dunhuangPinyin) dunhuangData = window._dunhuangPinyin;
  } else {
    sutraData = readerEdition === 'dunhuang' && window._dunhuangRaw
      ? window._dunhuangRaw
      : window._zongbaoRaw;
    dunhuangData = window._dunhuangRaw;
  }

  if (compareMode) {
    renderCompareSplitMode(container, select, termPattern);
  } else {
    renderNormalMode(container, select, termPattern);
  }

  alignVerseColumns(container);

  // Safari 的 ruby-overhang 对连续注音不会始终保留可读间隔。
  // 依据每个拼音音节的实际长度给 ruby 分配侧向空间，让正文排版
  // 由较宽的拼音决定，而不是继续挤压到单个汉字的宽度里。
  if (pinyinMode) applyAdaptivePinyinSpacing(container);

  // DOM 回流分页
  if (!compareMode) reflowFolds();

  // 窗口尺寸变化时重新分页
  if (!window._resizeHandlerInstalled) {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const c = document.querySelector('.scroll-container');
        const maxS = c.scrollWidth - c.clientWidth;
        const ratio = maxS > 0 ? c.scrollLeft / maxS : 0;
        reflowFolds();
        requestAnimationFrame(() => {
          const newMax = c.scrollWidth - c.clientWidth;
          c.scrollLeft = ratio * newMax;
          updateProgress();
        });
      }, 250);
    });
    window._resizeHandlerInstalled = true;
  }

  // 创建 tooltip 元素（如果尚未创建）
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.innerHTML = '<div class="tooltip-term"></div><div class="tooltip-pinyin"></div><div class="tooltip-meaning"></div>';
    document.body.appendChild(tooltip);
  }

  // 绑定术语交互（仅首次）
  if (!window._termInteractionInstalled) {
    setupTermInteraction();
    window._termInteractionInstalled = true;
  }

  // 简繁只转换阅读区域的文本节点，不触碰按钮和设置界面。
  if (useTraditionalContent) {
    applyTraditionalToContainer(document.querySelector('.scroll-container'));
  } else {
    applySimplifiedToContainer(document.querySelector('.scroll-container'));
  }
  _hasRendered = true;
  applyReaderNoteHighlights();
  syncNativePageCurl();
}

const READER_NOTES_KEY = 'tanjing_reader_notes_v1';
const READER_HIGHLIGHTS_KEY = 'tanjing_reader_highlights_v1';

function loadReaderNotes() {
  try {
    const notes = JSON.parse(localStorage.getItem(READER_NOTES_KEY) || '[]');
    return Array.isArray(notes) ? notes : [];
  } catch (_) {
    return [];
  }
}

function loadReaderHighlights() {
  try {
    const highlights = JSON.parse(localStorage.getItem(READER_HIGHLIGHTS_KEY) || '[]');
    return Array.isArray(highlights) ? highlights : [];
  } catch (_) {
    return [];
  }
}

function applyReaderNoteHighlights() {
  document.querySelectorAll('mark.reader-note-highlight').forEach((mark) => {
    const parent = mark.parentNode;
    parent?.replaceChild(document.createTextNode(mark.textContent || ''), mark);
    parent?.normalize();
  });
  const seen = new Set();
  [...loadReaderHighlights(), ...loadReaderNotes().filter(note => !note.highlightRemoved)].filter((note) => {
    if (!note.quote || !note.paragraphID) return false;
    const key = `${note.paragraphID}\u0000${note.quote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).forEach((note) => {
    const paragraph = document.querySelector(`.para[data-para="${CSS.escape(note.paragraphID)}"]`);
    if (!paragraph) return;
    const candidates = [note.quote, toSimplified(note.quote), toTraditional(note.quote)];
    const query = candidates.find((value) => value && searchableTextInElement(paragraph).includes(value));
    if (query) {
      const existingMarks = new Set(paragraph.querySelectorAll('mark.reader-note-highlight'));
      markTextInElement(paragraph, query, 'reader-note-highlight', false);
      paragraph.querySelectorAll('mark.reader-note-highlight').forEach(mark => {
        if (!existingMarks.has(mark)) {
          mark.dataset.highlightQuote = note.quote;
          mark.dataset.highlightParagraph = note.paragraphID;
        }
      });
    }
  });
}

function setupHighlightActions() {
  const container = document.querySelector('.scroll-container');
  const panel = document.getElementById('highlight-actions');
  const quoteLabel = document.getElementById('highlight-actions-quote');
  const closeButton = document.getElementById('highlight-actions-close');
  const removeButton = document.getElementById('highlight-remove');
  const deleteNoteButton = document.getElementById('highlight-note-delete');
  if (!container || !panel || window._highlightActionsInstalled) return;
  window._highlightActionsInstalled = true;
  let active = null;

  const close = () => {
    panel.classList.remove('visible');
    panel.hidden = true;
    active = null;
  };
  const isMatch = item => active && item.quote === active.quote && item.paragraphID === active.paragraphID;

  container.addEventListener('click', event => {
    const mark = event.target.closest('mark.reader-note-highlight');
    if (!mark) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const paragraph = mark.closest('.para[data-para]');
    active = {
      quote: mark.dataset.highlightQuote || mark.textContent || '',
      paragraphID: mark.dataset.highlightParagraph || paragraph?.dataset.para || ''
    };
    if (!active.quote) return;
    if (quoteLabel) quoteLabel.textContent = `“${active.quote}”`;
    const hasNote = loadReaderNotes().some(isMatch);
    if (deleteNoteButton) deleteNoteButton.hidden = !hasNote;
    panel.hidden = false;
    const rect = mark.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    panel.style.left = `${Math.min(Math.max(12, (rect.left + rect.right - panelRect.width) / 2), window.innerWidth - panelRect.width - 12)}px`;
    panel.style.top = `${Math.max(12, rect.top - panelRect.height - 12)}px`;
    requestAnimationFrame(() => panel.classList.add('visible'));
  });

  removeButton?.addEventListener('click', () => {
    if (!active || !window.confirm('确定删除这处高亮吗？笔记内容会保留。')) return;
    writeStorage(READER_HIGHLIGHTS_KEY, JSON.stringify(loadReaderHighlights().filter(item => !isMatch(item))));
    writeStorage(READER_NOTES_KEY, JSON.stringify(loadReaderNotes().map(note => isMatch(note) ? { ...note, highlightRemoved: true } : note)));
    close();
    applyReaderNoteHighlights();
    syncNativePageCurl();
  });

  deleteNoteButton?.addEventListener('click', () => {
    if (!active || !window.confirm('确定删除与这处高亮关联的笔记吗？')) return;
    writeStorage(READER_NOTES_KEY, JSON.stringify(loadReaderNotes().filter(note => !isMatch(note))));
    close();
    applyReaderNoteHighlights();
    syncNativePageCurl();
  });

  closeButton?.addEventListener('click', close);
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !event.target.closest('#highlight-actions') && !event.target.closest('mark.reader-note-highlight')) close();
  });
}

function setupSelectionToolbar() {
  const container = document.querySelector('.scroll-container');
  const toolbar = document.getElementById('selection-toolbar');
  const magnifier = document.getElementById('selection-magnifier');
  const magnifierContent = magnifier?.querySelector('.selection-magnifier-content');
  if (!container || !toolbar || window._selectionToolbarInstalled) return;
  window._selectionToolbarInstalled = true;
  let selectionSnapshot = null;
  let speech = null;
  let magnifierTimer = null;
  let magnifierSource = null;
  let magnifierGestureActive = false;
  let selectionCaptureTimer = null;
  let emptySelectionTimer = null;
  let selectionGraceUntil = 0;

  const hideMagnifier = () => {
    clearTimeout(magnifierTimer);
    magnifierTimer = null;
    magnifierGestureActive = false;
    magnifierSource = null;
    if (!magnifier) return;
    magnifier.classList.remove('visible');
    setTimeout(() => {
      if (!magnifier.classList.contains('visible')) magnifier.hidden = true;
    }, 180);
  };

  const updateMagnifier = (clientX, clientY, source) => {
    if (!magnifierGestureActive || !magnifier || !magnifierContent || !source?.closest?.('.para')) return;
    const scale = 1.7;
    const size = 112;
    const margin = 10;
    const viewport = window.visualViewport;
    const viewLeft = viewport?.offsetLeft || 0;
    const viewTop = viewport?.offsetTop || 0;
    const viewWidth = viewport?.width || window.innerWidth;
    const fingerGap = 24;
    const x = Math.min(Math.max(clientX, viewLeft + size / 2 + margin), viewLeft + viewWidth - size / 2 - margin);
    const y = Math.max(clientY - fingerGap, viewTop + size + margin);
    magnifier.style.left = `${x}px`;
    magnifier.style.top = `${y}px`;
    magnifierContent.replaceChildren(source.closest('.para').cloneNode(true));
    const clone = magnifierContent.firstElementChild;
    const sourceRect = source.closest('.para').getBoundingClientRect();
    clone.style.position = 'absolute';
    clone.style.left = `${sourceRect.left}px`;
    clone.style.top = `${sourceRect.top}px`;
    clone.style.width = `${sourceRect.width}px`;
    clone.style.margin = '0';
    magnifierContent.style.transform = `translate(${size / 2 - clientX * scale}px, ${size / 2 - clientY * scale}px) scale(${scale})`;
    magnifier.hidden = false;
    requestAnimationFrame(() => magnifier.classList.add('visible'));
  };

  const startMagnifier = (clientX, clientY, source) => {
    if (!source?.closest?.('.para')) return;
    magnifierGestureActive = true;
    magnifierSource = source;
    clearTimeout(magnifierTimer);
    magnifierTimer = setTimeout(() => {
      magnifierTimer = null;
      // 达到长按阈值后进入选词锁：系统选区可继续拖动，阅读器不再翻页。
      // Android Chrome / WebView 的原生选区通常稍晚于 pointer 事件生成，
      // 给它保留一段锁定宽限期，避免手指抬起时被误判为取消选择。
      selectionGraceUntil = Date.now() + 650;
      setReaderSelectionLocked(true);
      updateMagnifier(clientX, clientY, magnifierSource);
    }, 260);
  };

  const hide = ({ clearSelection = false } = {}) => {
    clearTimeout(selectionCaptureTimer);
    clearTimeout(emptySelectionTimer);
    selectionCaptureTimer = null;
    emptySelectionTimer = null;
    selectionGraceUntil = 0;
    toolbar.classList.remove('visible');
    toolbar.hidden = true;
    if (clearSelection) window.getSelection()?.removeAllRanges();
    selectionSnapshot = null;
    setReaderSelectionLocked(false);
  };

  const capture = () => {
    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/g, ' ').trim() || '';
    if (!selection || selection.rangeCount === 0 || !text) return null;
    const range = selection.getRangeAt(0);
    const start = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const end = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;
    if (!start?.closest?.('.scroll-container') || !end?.closest?.('.scroll-container')) return null;
    const paragraph = start.closest('.para[data-para]') || end.closest('.para[data-para]');
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width || rect.height);
    if (!rects.length) return null;
    return {
      quote: text.slice(0, 1000),
      paragraphID: paragraph?.dataset.para || currentReadingParagraphID() || '',
      rect: rects.reduce((result, rect) => ({
        left: Math.min(result.left, rect.left),
        right: Math.max(result.right, rect.right),
        top: Math.min(result.top, rect.top),
        bottom: Math.max(result.bottom, rect.bottom)
      }), { left: rects[0].left, right: rects[0].right, top: rects[0].top, bottom: rects[0].bottom })
    };
  };

  const position = (snapshot) => {
    toolbar.hidden = false;
    toolbar.classList.add('visible');
    const viewport = window.visualViewport;
    const viewLeft = viewport?.offsetLeft || 0;
    const viewTop = viewport?.offsetTop || 0;
    const viewWidth = viewport?.width || window.innerWidth;
    const viewHeight = viewport?.height || window.innerHeight;
    const margin = 10;
    const gap = 12;
    const toolbarRect = toolbar.getBoundingClientRect();
    const preferredLeft = (snapshot.rect.left + snapshot.rect.right - toolbarRect.width) / 2;
    const left = Math.min(Math.max(preferredLeft, viewLeft + margin), Math.max(viewLeft + margin, viewLeft + viewWidth - toolbarRect.width - margin));
    const above = snapshot.rect.top - toolbarRect.height - gap;
    const preferredTop = above >= viewTop + margin ? above : snapshot.rect.bottom + gap;
    const top = Math.min(Math.max(preferredTop, viewTop + margin), Math.max(viewTop + margin, viewTop + viewHeight - toolbarRect.height - margin));
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  };

  const showFromSelection = ({ unlockOnFailure = true } = {}) => {
    const snapshot = capture();
    if (!snapshot) {
      if (unlockOnFailure) setReaderSelectionLocked(false);
      return false;
    }
    selectionSnapshot = snapshot;
    setReaderSelectionLocked(true);
    position(snapshot);
    return true;
  };

  container.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    startMagnifier(event.clientX, event.clientY, event.target);
  }, { passive: true });
  container.addEventListener('pointermove', event => {
    if (!magnifierGestureActive || (!magnifierTimer && magnifier?.hidden)) return;
    magnifierSource = document.elementFromPoint(event.clientX, event.clientY) || magnifierSource;
    if (!magnifier?.hidden) updateMagnifier(event.clientX, event.clientY, magnifierSource);
  }, { passive: true });

  // 少数旧版 Android WebView 没有可靠的 Pointer Events，以 Touch Events 兜底。
  if (!window.PointerEvent) {
    container.addEventListener('touchstart', event => {
      const touch = event.touches?.[0];
      if (touch) startMagnifier(touch.clientX, touch.clientY, event.target);
    }, { passive: true });
    container.addEventListener('touchmove', event => {
      const touch = event.touches?.[0];
      if (!touch || !magnifierGestureActive || (!magnifierTimer && magnifier?.hidden)) return;
      magnifierSource = document.elementFromPoint(touch.clientX, touch.clientY) || magnifierSource;
      if (!magnifier?.hidden) updateMagnifier(touch.clientX, touch.clientY, magnifierSource);
    }, { passive: true });
  }

  const captureAndroidSelection = (deadline) => {
    clearTimeout(selectionCaptureTimer);
    if (showFromSelection({ unlockOnFailure: false })) {
      selectionGraceUntil = 0;
      return;
    }
    if (Date.now() < deadline) {
      selectionCaptureTimer = setTimeout(() => captureAndroidSelection(deadline), 60);
      return;
    }
    selectionGraceUntil = 0;
    setReaderSelectionLocked(false);
  };

  const finishSelectionGesture = () => {
    if (!magnifierGestureActive && !magnifierTimer) return;
    const enteredSelectionLock = readerSelectionLocked;
    hideMagnifier();
    if (enteredSelectionLock) {
      // Chromium 可能在 touchend/pointerup 之后才提交 Selection，轮询一个很短的
      // 时间窗；一旦捕获成功就停止，失败才释放阅读器锁。
      selectionGraceUntil = Math.max(selectionGraceUntil, Date.now() + 480);
      selectionCaptureTimer = setTimeout(() => captureAndroidSelection(selectionGraceUntil), 20);
    } else {
      selectionCaptureTimer = setTimeout(() => showFromSelection(), 20);
    }
  };

  // 在页面级捕获结束事件：即使手指拖出经文区域，也必须在离屏时关闭放大镜。
  document.addEventListener('pointerup', finishSelectionGesture, { passive: true, capture: true });
  document.addEventListener('pointercancel', finishSelectionGesture, { passive: true, capture: true });
  document.addEventListener('touchend', finishSelectionGesture, { passive: true, capture: true });
  document.addEventListener('touchcancel', finishSelectionGesture, { passive: true, capture: true });
  document.addEventListener('selectionchange', () => {
    const hasSelection = !!window.getSelection()?.toString().trim();
    clearTimeout(emptySelectionTimer);
    if (hasSelection) {
      setReaderSelectionLocked(true);
      return;
    }
    // 自定义操作栏已经出现时，Android 可能临时收起系统选区；此时保持锁定，
    // 直到用户点选操作或点击正文外部明确结束本次选择。
    if (!toolbar.hidden || toolbar.matches(':active') || Date.now() < selectionGraceUntil) return;
    emptySelectionTimer = setTimeout(() => {
      if (!window.getSelection()?.toString().trim() && toolbar.hidden && Date.now() >= selectionGraceUntil) hide();
    }, 140);
  });

  toolbar.addEventListener('pointerdown', event => event.preventDefault());
  toolbar.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-selection-action]');
    if (!button || !selectionSnapshot) return;
    const { quote, paragraphID } = selectionSnapshot;
    switch (button.dataset.selectionAction) {
      case 'copy':
        try { await navigator.clipboard.writeText(quote); } catch (_) { /* 系统选择菜单仍可复制 */ }
        break;
      case 'highlight': {
        const highlights = loadReaderHighlights();
        const duplicate = highlights.some(item => item.quote === quote && item.paragraphID === paragraphID);
        if (!duplicate) writeStorage(READER_HIGHLIGHTS_KEY, JSON.stringify([{ id: `${Date.now()}`, quote, paragraphID }, ...highlights].slice(0, 1000)));
        applyReaderNoteHighlights();
        syncNativePageCurl();
        break;
      }
      case 'note':
        window.__tanJingPendingSelection = { quote, paragraphID };
        document.getElementById('mobile-notes-btn')?.click();
        break;
      case 'share': {
        const text = `《六祖坛经》\n${quote}`;
        try {
          if (navigator.share) await navigator.share({ title: '六祖坛经书摘', text });
          else await navigator.clipboard.writeText(text);
        } catch (_) { /* 用户取消系统分享 */ }
        break;
      }
      case 'ask': {
        window.__tanJingLighthouseQuote = quote;
        const lighthouseQuote = document.querySelector('.lighthouse-quote');
        if (lighthouseQuote) {
          lighthouseQuote.textContent = `“${quote}”`;
          lighthouseQuote.hidden = false;
        }
        document.getElementById('mobile-lighthouse-btn')?.click();
        break;
      }
      case 'speak':
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          if (!speech || speech.text !== quote) {
            speech = new SpeechSynthesisUtterance(quote);
            speech.lang = 'zh-CN';
            speech.rate = 0.9;
            window.speechSynthesis.speak(speech);
          } else speech = null;
        }
        break;
    }
    hide({ clearSelection: button.dataset.selectionAction !== 'note' });
  });

  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('#selection-toolbar') && !event.target.closest('.para')) hide();
  });

  // 测试与原生容器共用的受控入口；普通用户流程仍由系统长按选区触发。
  window.__tanJingShowSelectionToolbar = (quote, paragraphID, rect) => {
    const safeQuote = String(quote || '').replace(/\s+/g, ' ').trim();
    if (!safeQuote || !rect) return false;
    selectionSnapshot = { quote: safeQuote.slice(0, 1000), paragraphID: paragraphID || '', rect };
    setReaderSelectionLocked(true);
    position(selectionSnapshot);
    return true;
  };
  window.__tanJingShowSelectionMagnifier = (clientX, clientY, selector = '.para') => {
    const source = document.querySelector(selector);
    if (!source) return false;
    magnifierGestureActive = true;
    magnifierSource = source;
    setReaderSelectionLocked(true);
    updateMagnifier(clientX, clientY, source);
    return true;
  };
}

/**
 * 将文本包裹 ruby 拼音注音（仅限 CJK 汉字）
 */
function addPinyinRuby(html) {
  if (!pinyinMode) return html;
  // 匹配非标签部分的汉字
  return html.replace(/([^<]*?)(<[^>]+>)/g, (match, text, tag) => {
    return rubyText(text) + tag;
  }).replace(/([^<]+)$/, (match, text) => rubyText(text));
}

function rubyText(text) {
  let result = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if ((code >= 0x4E00 && code <= 0x9FFF || code >= 0x3400 && code <= 0x4DBF) && pinyinMap[ch]) {
      result += `<ruby>${ch}<rt>${pinyinMap[ch]}</rt></ruby>`;
    } else {
      result += ch;
    }
  }
  return result;
}

function applyAdaptivePinyinSpacing(root) {
  root.querySelectorAll('ruby').forEach((ruby) => {
    const annotation = ruby.querySelector('rt')?.textContent?.trim() || '';
    const latinLength = Array.from(
      annotation.normalize('NFD').replace(/[\u0300-\u036f\s'-]/g, '')
    ).length;
    // 短音节保持紧凑，guang/xiang/zhong 等长音节逐级增加留白。
    // 上限避免一行字符过少；相邻 ruby 的两侧间距会自然相加。
    const sideGap = Math.min(0.20, 0.04 + Math.max(0, latinLength - 2) * 0.035);
    ruby.style.setProperty('--ruby-side-gap', `${sideGap.toFixed(3)}em`);
  });
}

/**
 * 生成带术语标记和可选拼音的段落 HTML
 */
function makeParaHTML(text, termPattern) {
  let html = termPattern
    ? text.replace(termPattern, '<span class="term" data-term="$1">$1</span>')
    : text;
  if (pinyinMode) html = addPinyinRuby(html);
  return html;
}

/**
 * 标记同一自然段被分页器预拆出的片段。
 * 只有第一个片段保留首行缩进，只有最后一个片段保留段后距。
 */
function markParagraphFragment(element, index, total) {
  if (total > 1) element.classList.add('para--split');
  if (index === 0 && total > 1) element.classList.add('para--paragraph-start');
  if (index > 0) element.classList.add('para--continuation');
  if (index < total - 1) element.classList.add('para--fragment');
  if (index === total - 1 && total > 1) element.classList.add('para--paragraph-end');
}

function markVerse(element, paragraph) {
  if (paragraph.isVerse) element.classList.add('para--verse');
}

function alignVerseColumns(root) {
  root.querySelectorAll('.para--verse').forEach((verse) => {
    const lines = verse.innerHTML
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return;

    const rows = lines.map((line) => line.split(/\u3000+/));
    const columnCount = Math.max(1, ...rows.map((row) => row.length));
    verse.style.setProperty('--verse-columns', String(columnCount));
    verse.innerHTML = rows.map((row) => {
      const cells = row.map((cell) => {
        const content = cell.replace(
          /^([「『（《〈【“‘]+)/,
          '<span class="verse-opening-punctuation">$1</span>'
        );
        return `<span class="verse-cell">${content}</span>`;
      });
      while (cells.length < columnCount) {
        cells.push('<span class="verse-cell" aria-hidden="true"></span>');
      }
      return cells.join('');
    }).join('');
  });
}

/**
 * 普通模式渲染
 */
function renderNormalMode(container, select, termPattern) {
  sutraData.chapters.forEach((chapter) => {
    // 导航下拉选项
    const opt = document.createElement('option');
    opt.value = chapter.id;
    opt.textContent = readerChapterTitle(chapter);
    select.appendChild(opt);
    // 同步填充移动端目录列表（若存在）
    const mobileList = document.getElementById('mobile-chapter-list');
    if (mobileList) {
      const li = document.createElement('li');
      li.className = 'mobile-chapter-item';
      li.dataset.target = chapter.id;
      li.innerHTML = `<span class="mobile-chapter-name">${escapeHtml(readerChapterTitle(chapter))}</span><span class="mobile-chapter-page"></span>`;
      mobileList.appendChild(li);
    }

    if (pinyinMode && pinyinRenderedParagraphIDs &&
        !chapter.paragraphs.some((paragraph) => pinyinRenderedParagraphIDs.has(paragraph.id))) return;

    // 创建章节首折，放入所有段落
    const fold = document.createElement('div');
    fold.className = 'fold fold--chapter-start';
    fold.id = chapter.id;


    const title = document.createElement('h2');
    title.className = 'chapter-title';
    // 拼音仅用于正文；章节名始终保持无注音标题。
    title.textContent = readerChapterTitle(chapter);
    fold.appendChild(title);


    chapter.paragraphs.forEach(p => {
      if (pinyinMode && pinyinRenderedParagraphIDs && !pinyinRenderedParagraphIDs.has(p.id)) return;
      // 拼音模式直接渲染 pinyinHtml
      if (pinyinMode && p.pinyinHtml) {
        const pinyinHTML = useTraditionalContent && p.traditionalPinyinHtml
          ? p.traditionalPinyinHtml
          : p.pinyinHtml;
        const chunks = splitPinyinHTML(pinyinHTML, 72);
        chunks.forEach((chunk, index) => {
          const para = document.createElement('p');
          para.className = 'para';
          markParagraphFragment(para, index, chunks.length);
          markVerse(para, p);
          para.dataset.para = p.id;
          para.innerHTML = chunk;
          fold.appendChild(para);
        });
      } else {
        // Keep source paragraphs identifiable, but create page-sized layout
        // fragments so a single long paragraph can never become a scrollable
        // page inside UIPageViewController.
        const sourceText = readerParagraphText(p);
        const chunks = splitSentences(sourceText, 96);
        let sourceOffset = 0;
        chunks.forEach((chunk, index) => {
          const para = document.createElement('p');
          para.className = 'para';
          markParagraphFragment(para, index, chunks.length);
          markVerse(para, p);
          para.dataset.para = p.id;
          para.dataset.sourceStart = String(sourceOffset);
          para.dataset.sourceEnd = String(sourceOffset + chunk.length);
          para.innerHTML = makeParaHTML(chunk, termPattern);
          fold.appendChild(para);
          sourceOffset += chunk.length;
        });
      }
    });

    container.appendChild(fold);
  });
}

/**
 * 对照阅读：上下两个独立阅读窗。两个版本按“品 + 品内进度”同步，
 * 可兼容同品段落数量不同的情况。
 */
function renderCompareSplitMode(container, select, termPattern) {
  const zongbao = pinyinMode && window._zongbaoPinyin ? window._zongbaoPinyin : window._zongbaoRaw;
  const dunhuang = pinyinMode && window._dunhuangPinyin ? window._dunhuangPinyin : window._dunhuangRaw;
  const canonicalChapters = zongbao?.chapters || [];

  canonicalChapters.forEach((chapter) => {
    const opt = document.createElement('option');
    opt.value = chapter.id;
    opt.textContent = readerChapterTitle(chapter);
    select.appendChild(opt);
    const mobileList = document.getElementById('mobile-chapter-list');
    if (mobileList) {
      const li = document.createElement('li');
      li.className = 'mobile-chapter-item';
      li.dataset.target = chapter.id;
      li.innerHTML = `<span class="mobile-chapter-name">${escapeHtml(readerChapterTitle(chapter))}</span><span class="mobile-chapter-page"></span>`;
      mobileList.appendChild(li);
    }
  });

  const createPane = (edition, label, data) => {
    const pane = document.createElement('section');
    pane.className = `compare-reader-pane compare-reader-pane--${edition}`;
    pane.dataset.edition = edition;
    pane.tabIndex = 0;
    pane.setAttribute('aria-label', `${label}阅读区`);
    const paneLabel = document.createElement('div');
    paneLabel.className = 'compare-reader-label';
    paneLabel.innerHTML = `<span>${label}</span><small class="compare-reader-page-label">1 / 1页</small>`;
    pane.appendChild(paneLabel);
    const track = document.createElement('div');
    track.className = 'compare-reader-track';
    pane.appendChild(track);
    const chapterMap = new Map((data?.chapters || []).map(chapter => [chapter.id, chapter]));

    canonicalChapters.forEach((canonical) => {
      const chapter = chapterMap.get(canonical.id);
      if (!chapter) {
        const section = document.createElement('article');
        section.className = 'compare-reader-page compare-reader-chapter';
        section.dataset.chapter = canonical.id;
        section.dataset.chapterPage = '0';
        section.dataset.chapterPages = '1';
        const title = document.createElement('h2');
        title.className = 'chapter-title';
        title.textContent = readerChapterTitle(canonical);
        section.appendChild(title);
        const missing = document.createElement('p');
        missing.className = 'compare-reader-missing';
        missing.textContent = '此版本无独立对应品目';
        section.appendChild(missing);
        track.appendChild(section);
      } else {
        const chunks = [];
        chapter.paragraphs.forEach((paragraph) => {
          if (pinyinMode && paragraph.pinyinHtml) {
            chunks.push({ paragraph, text: readerParagraphText(paragraph), html: useTraditionalContent && paragraph.traditionalPinyinHtml ? paragraph.traditionalPinyinHtml : paragraph.pinyinHtml, paragraphPage: 0, paragraphPages: 1 });
            return;
          }
          const paragraphChunks = splitSentences(readerParagraphText(paragraph), 120);
          paragraphChunks.forEach((text, paragraphPage) => {
            chunks.push({ paragraph, text, html: makeParaHTML(text, termPattern), paragraphPage, paragraphPages: paragraphChunks.length });
          });
        });
        chunks.forEach(({ paragraph, text, html, paragraphPage, paragraphPages }, pageIndex) => {
          const section = document.createElement('article');
          section.className = 'compare-reader-page compare-reader-chapter';
          section.dataset.chapter = canonical.id;
          section.dataset.chapterPage = String(pageIndex);
          section.dataset.chapterPages = String(Math.max(1, chunks.length));
          section.dataset.paragraph = paragraph.id;
          section.dataset.paragraphPage = String(paragraphPage);
          section.dataset.paragraphPages = String(paragraphPages);
          section.dataset.semanticText = text;
          if (pageIndex === 0) {
            const title = document.createElement('h2');
            title.className = 'chapter-title';
            title.textContent = readerChapterTitle(chapter);
            section.appendChild(title);
          }
          const para = document.createElement('p');
          para.className = 'para';
          markVerse(para, paragraph);
          para.dataset.para = paragraph.id;
          para.dataset.edition = edition;
          para.innerHTML = html;
          section.appendChild(para);
          track.appendChild(section);
        });
      }
    });
    return pane;
  };

  const upperEdition = readerEdition === 'dunhuang' ? 'dh' : 'zb';
  const upper = upperEdition === 'dh'
    ? createPane('dh', '敦煌本', dunhuang)
    : createPane('zb', '宗宝本', zongbao);
  const lower = upperEdition === 'dh'
    ? createPane('zb', '宗宝本', zongbao)
    : createPane('dh', '敦煌本', dunhuang);
  container.append(upper, lower);
  setupSynchronizedComparePanes(container);
}

function setupSynchronizedComparePanes(container) {
  const panes = Array.from(container.querySelectorAll('.compare-reader-pane'));
  if (panes.length !== 2) return;
  let activePane = null;
  const frames = new WeakMap();
  const settleTimers = new WeakMap();
  const lockedUntil = new WeakMap();
  const semanticCache = new WeakMap();
  const counterpartCache = new WeakMap();
  const pageAtViewport = pane => {
    const pages = Array.from(pane.querySelectorAll('.compare-reader-page'));
    const index = Math.min(pages.length - 1, Math.max(0, Math.round(pane.scrollLeft / Math.max(1, pane.clientWidth))));
    return pages[index] || null;
  };
  const updatePanePageLabel = pane => {
    const pages = Array.from(pane.querySelectorAll('.compare-reader-page'));
    const current = Math.min(pages.length, Math.max(1, Math.round(pane.scrollLeft / Math.max(1, pane.clientWidth)) + 1));
    const label = pane.querySelector('.compare-reader-page-label');
    if (label) label.textContent = `${current} / ${Math.max(1, pages.length)}页`;
  };
  const normalizedPageText = page => {
    if (semanticCache.has(page)) return semanticCache.get(page);
    const text = toSimplified(page.dataset.semanticText || page.textContent || '')
      .replace(/善知识|惠能|慧能|大师|和尚|宗宝本|敦煌本/g, '')
      .replace(/[\s\p{P}\p{S}]/gu, '');
    const grams = new Set();
    for (let index = 0; index < text.length - 1; index += 1) grams.add(text.slice(index, index + 2));
    const value = { text, grams };
    semanticCache.set(page, value);
    return value;
  };
  const pageSimilarity = (sourcePage, targetPage) => {
    const sourceValue = normalizedPageText(sourcePage);
    const targetValue = normalizedPageText(targetPage);
    if (!sourceValue.grams.size || !targetValue.grams.size) return 0;
    let common = 0;
    sourceValue.grams.forEach(gram => { if (targetValue.grams.has(gram)) common += 1; });
    const containment = common / Math.max(1, Math.min(sourceValue.grams.size, targetValue.grams.size));
    const dice = (2 * common) / Math.max(1, sourceValue.grams.size + targetValue.grams.size);
    return containment * .68 + dice * .32;
  };
  const semanticCounterpart = (source, target, sourcePage) => {
    let cachedTargets = counterpartCache.get(sourcePage);
    if (cachedTargets?.has(target)) return cachedTargets.get(target);
    const pages = Array.from(target.querySelectorAll('.compare-reader-page'));
    if (!pages.length) return null;
    const sourcePages = Array.from(source.querySelectorAll('.compare-reader-page'));
    const sourceIndex = Math.max(0, sourcePages.indexOf(sourcePage));
    const relativeIndex = sourcePages.length > 1
      ? Math.round((sourceIndex / (sourcePages.length - 1)) * (pages.length - 1))
      : 0;
    let bestPage = null;
    let bestScore = 0;
    pages.forEach((candidate, candidateIndex) => {
      const lexical = pageSimilarity(sourcePage, candidate);
      // 内容相似度优先；极小的顺序权重只用于相似候选之间消歧。
      const distance = Math.abs(candidateIndex - relativeIndex) / Math.max(1, pages.length - 1);
      const score = lexical - distance * .018;
      if (score > bestScore) {
        bestScore = score;
        bestPage = candidate;
      }
    });
    if (bestPage && bestScore >= .055) {
      if (!cachedTargets) {
        cachedTargets = new WeakMap();
        counterpartCache.set(sourcePage, cachedTargets);
      }
      cachedTargets.set(target, bestPage);
      return bestPage;
    }

    // 没有足够共同文字时，以同段落在本版中的页内进度映射，最后才回退全文顺序。
    const paragraphPage = Number(sourcePage.dataset.paragraphPage) || 0;
    const paragraphPages = Math.max(1, Number(sourcePage.dataset.paragraphPages) || 1);
    const localProgress = paragraphPages > 1 ? paragraphPage / (paragraphPages - 1) : 0;
    const sameChapter = pages.filter(page => page.dataset.chapter === sourcePage.dataset.chapter);
    const fallback = sameChapter.length
      ? (sameChapter[Math.round(localProgress * (sameChapter.length - 1))] || sameChapter[0])
      : pages[Math.min(pages.length - 1, Math.max(0, relativeIndex))];
    if (!cachedTargets) {
      cachedTargets = new WeakMap();
      counterpartCache.set(sourcePage, cachedTargets);
    }
    cachedTargets.set(target, fallback);
    return fallback;
  };
  const placePaneAt = (pane, left, settle = false) => {
    if (!Number.isFinite(left)) return;
    lockedUntil.set(pane, performance.now() + (settle ? 360 : 80));
    const previousBehavior = pane.style.scrollBehavior;
    pane.style.scrollBehavior = 'auto';
    if (!settle) pane.style.scrollSnapType = 'none';
    pane.scrollLeft = left;
    requestAnimationFrame(() => {
      pane.style.scrollBehavior = previousBehavior;
      if (settle) pane.style.scrollSnapType = '';
    });
  };
  const sync = (source, target, settle = false) => {
    if (readerSelectionLocked) return;
    const sourcePages = Array.from(source.querySelectorAll('.compare-reader-page'));
    if (!sourcePages.length) return;
    const sourcePosition = Math.min(sourcePages.length - 1, Math.max(0, source.scrollLeft / Math.max(1, source.clientWidth)));
    const currentIndex = settle ? Math.round(sourcePosition) : Math.floor(sourcePosition);
    const nextIndex = settle ? currentIndex : Math.min(sourcePages.length - 1, currentIndex + 1);
    const fraction = settle ? 0 : sourcePosition - currentIndex;
    const page = sourcePages[currentIndex];
    if (!page) return;
    const currentCounterpart = semanticCounterpart(source, target, page);
    const nextCounterpart = semanticCounterpart(source, target, sourcePages[nextIndex]) || currentCounterpart;
    if (!currentCounterpart) return;
    // 两版每一页的对应位置可能不同；在两个语义锚点间连续插值，让另一窗
    // 与手指逐帧同行，而不是越过半页后突然闪到目标页。
    const targetLeft = currentCounterpart.offsetLeft
      + (nextCounterpart.offsetLeft - currentCounterpart.offsetLeft) * fraction;
    placePaneAt(target, targetLeft, settle);
    document.getElementById('chapter-select').value = page.dataset.chapter || '';
    updateProgress();
    if (settle) savePosition();
    updatePanePageLabel(source);
    updatePanePageLabel(target);
  };
  panes.forEach((pane, index) => {
    const claimInteraction = () => {
      activePane = pane;
      lockedUntil.set(pane, 0);
    };
    pane.addEventListener('touchstart', claimInteraction, { passive: true });
    pane.addEventListener('pointerdown', claimInteraction, { passive: true });
    pane.addEventListener('wheel', claimInteraction, { passive: true });
    pane.addEventListener('keydown', claimInteraction);
    pane.addEventListener('scroll', () => {
      if (readerSelectionLocked) return;
      if (performance.now() < (lockedUntil.get(pane) || 0)) return;
      if (activePane && activePane !== pane) return;
      activePane = pane;
      cancelAnimationFrame(frames.get(pane));
      frames.set(pane, requestAnimationFrame(() => sync(pane, panes[1 - index], false)));
      clearTimeout(settleTimers.get(pane));
      settleTimers.set(pane, setTimeout(() => sync(pane, panes[1 - index], true), 140));
    }, { passive: true });
    // iOS 惯性滚动及 scroll-snap 完成后再强制校准一次，防止偶发漏页。
    pane.addEventListener('scrollend', () => {
      if (activePane === pane) sync(pane, panes[1 - index], true);
    }, { passive: true });
    pane.addEventListener('touchend', () => {
      clearTimeout(settleTimers.get(pane));
      settleTimers.set(pane, setTimeout(() => sync(pane, panes[1 - index], true), 220));
    }, { passive: true });
  });
  panes.forEach(updatePanePageLabel);
}

/**
 * 对照模式渲染：双栏（敦煌本 | 宗宝本）
 */
function renderCompareMode(container, select, termPattern) {
  // 构建敦煌本按 chapter id 索引
  const dhChapters = {};
  if (dunhuangData && dunhuangData.chapters) {
    dunhuangData.chapters.forEach(ch => { dhChapters[ch.id] = ch; });
  }

  sutraData.chapters.forEach((zbChapter) => {
    const opt = document.createElement('option');
    opt.value = zbChapter.id;
    opt.textContent = readerChapterTitle(zbChapter);
    select.appendChild(opt);
    // 同步填充移动端目录列表（若存在）
    const mobileList = document.getElementById('mobile-chapter-list');
    if (mobileList) {
      const li = document.createElement('li');
      li.className = 'mobile-chapter-item';
      li.dataset.target = zbChapter.id;
      li.innerHTML = `<span class="mobile-chapter-name">${escapeHtml(readerChapterTitle(zbChapter))}</span><span class="mobile-chapter-page"></span>`;
      mobileList.appendChild(li);
    }

    if (pinyinMode && pinyinRenderedParagraphIDs &&
        !zbChapter.paragraphs.some((paragraph) => pinyinRenderedParagraphIDs.has(paragraph.id))) return;

    const dhChapter = dhChapters[zbChapter.id];

    const fold = document.createElement('div');
    fold.className = 'fold fold--chapter-start compare-mode';
    fold.id = zbChapter.id;

    // 敦煌本栏
    const colDH = document.createElement('div');
    colDH.className = 'compare-col compare-col--dh';
    const labelDH = document.createElement('span');
    labelDH.className = 'compare-col-label';
    labelDH.textContent = '敦煌本';
    colDH.appendChild(labelDH);

    const titleWrapDH = document.createElement('div');
    titleWrapDH.className = 'chapter-title-wrap';

    const titleDH = document.createElement('h2');
    titleDH.className = 'chapter-title';
    titleDH.textContent = readerChapterTitle(dhChapter || zbChapter);
    titleWrapDH.appendChild(titleDH);
    colDH.appendChild(titleWrapDH);


    if (dhChapter) {
      dhChapter.paragraphs.forEach(p => {
        if (pinyinMode && pinyinRenderedParagraphIDs && !pinyinRenderedParagraphIDs.has(p.id)) return;
        if (pinyinMode && p.pinyinHtml) {
          const para = document.createElement('p');
          para.className = 'para';
          markVerse(para, p);
          para.dataset.para = p.id;
          para.dataset.edition = 'dh';
          para.innerHTML = useTraditionalContent && p.traditionalPinyinHtml
            ? p.traditionalPinyinHtml
            : p.pinyinHtml;
          colDH.appendChild(para);
        } else {
          const sourceText = readerParagraphText(p);
          const chunks = splitSentences(sourceText, 160);
          let sourceOffset = 0;
          chunks.forEach((chunk, index) => {
            const para = document.createElement('p');
            para.className = 'para';
            markParagraphFragment(para, index, chunks.length);
            markVerse(para, p);
            para.dataset.para = p.id;
            para.dataset.edition = 'dh';
            para.dataset.sourceStart = String(sourceOffset);
            para.dataset.sourceEnd = String(sourceOffset + chunk.length);
            para.innerHTML = makeParaHTML(chunk, termPattern);
            colDH.appendChild(para);
            sourceOffset += chunk.length;
          });
        }
      });
    } else {
      const notice = document.createElement('p');
      notice.className = 'para';
      notice.style.color = 'var(--ink-light)';
      notice.style.fontStyle = 'italic';
      notice.textContent = '（敦煌本无此品内容）';
      colDH.appendChild(notice);
    }

    // 宗宝本栏
    const colZB = document.createElement('div');
    colZB.className = 'compare-col compare-col--zb';
    const labelZB = document.createElement('span');
    labelZB.className = 'compare-col-label';
    labelZB.textContent = '宗宝本';
    colZB.appendChild(labelZB);

    const titleWrapZB = document.createElement('div');
    titleWrapZB.className = 'chapter-title-wrap';

    const titleZB = document.createElement('h2');
    titleZB.className = 'chapter-title';
    titleZB.textContent = readerChapterTitle(zbChapter);
    titleWrapZB.appendChild(titleZB);
    colZB.appendChild(titleWrapZB);


    zbChapter.paragraphs.forEach(p => {
      if (pinyinMode && pinyinRenderedParagraphIDs && !pinyinRenderedParagraphIDs.has(p.id)) return;
      if (pinyinMode && p.pinyinHtml) {
        const para = document.createElement('p');
        para.className = 'para';
        markVerse(para, p);
        para.dataset.para = p.id;
        para.dataset.edition = 'zb';
        para.innerHTML = useTraditionalContent && p.traditionalPinyinHtml
          ? p.traditionalPinyinHtml
          : p.pinyinHtml;
        colZB.appendChild(para);
      } else {
        const sourceText = readerParagraphText(p);
        const chunks = splitSentences(sourceText, 160);
        let sourceOffset = 0;
        chunks.forEach((chunk, index) => {
          const para = document.createElement('p');
          para.className = 'para';
          markParagraphFragment(para, index, chunks.length);
          markVerse(para, p);
          para.dataset.para = p.id;
          para.dataset.edition = 'zb';
          para.dataset.sourceStart = String(sourceOffset);
          para.dataset.sourceEnd = String(sourceOffset + chunk.length);
          para.innerHTML = makeParaHTML(chunk, termPattern);
          colZB.appendChild(para);
          sourceOffset += chunk.length;
        });
      }
    });

    fold.appendChild(colDH);
    fold.appendChild(colZB);
    container.appendChild(fold);
  });
}

/**
 * 长段落按句子边界拆分，maxLen 为目标最大字数
 */
function splitSentences(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = -1;
    // 优先在句号等处断开
    for (let i = Math.min(remaining.length - 1, maxLen); i >= maxLen * 0.4; i--) {
      // 以最外层结束符为界，避免把 』」）》】 等右侧标点甩到下一页开头。
      if ('。！？』」）》】〉”’）'.includes(remaining[i])) { splitAt = i + 1; break; }
    }
    // 次选逗号、分号
    if (splitAt === -1) {
      for (let i = Math.min(remaining.length - 1, maxLen); i >= maxLen * 0.4; i--) {
        if ('，；：'.includes(remaining[i])) { splitAt = i + 1; break; }
      }
    }
    if (splitAt === -1) splitAt = maxLen; // 强制断开

    // 分割点可能刚好落在“句号｜右引号”之间；把连续右侧标点一起带走。
    const trailingClosers = '』」）》】〉”’）';
    while (splitAt < remaining.length && trailingClosers.includes(remaining[splitAt])) {
      splitAt += 1;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) chunks.push(remaining);

  // 最后兜底：强制长度截断也不能让任何中文标点成为续片首字符。
  for (let index = 1; index < chunks.length; index++) {
    const match = chunks[index].match(/^[，。！？；：、』」）》】〉”’）]+/);
    if (!match) continue;
    chunks[index - 1] += match[0];
    chunks[index] = chunks[index].slice(match[0].length);
  }
  return chunks;
}

/**
 * Split annotated ruby HTML without breaking a <ruby> unit.  This gives the
 * DOM paginator enough movable blocks while preserving each character/pinyin
 * pairing and the original paragraph anchor.
 */
function splitPinyinHTML(html, maxLen) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const chunks = [];
  let current = document.createElement('span');
  let length = 0;

  function flush() {
    if (!current.childNodes.length) return;
    chunks.push(current.innerHTML);
    current = document.createElement('span');
    length = 0;
  }

  Array.from(template.content.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      Array.from(node.textContent || '').forEach((character) => {
        if (length >= maxLen && /[。！？；：，、]/.test(character)) flush();
        current.appendChild(document.createTextNode(character));
        length += 1;
        if (length >= maxLen) flush();
      });
      return;
    }
    const visibleLength = Math.max(1, (node.querySelector?.('rb')?.textContent || node.childNodes[0]?.textContent || '').length);
    if (length + visibleLength > maxLen) flush();
    current.appendChild(node.cloneNode(true));
    length += visibleLength;
  });
  flush();
  if (!chunks.length) return [html];

  // 预生成拼音 HTML 仍可能恰好在右侧标点前达到长度上限。
  // 将下一片开头的右引号/右括号移回上一片，保证续页不以孤立标点开头。
  const leadingClosers = /^[，。！？；：、』」）》】〉”’）]+/;
  for (let index = 1; index < chunks.length; index++) {
    const next = document.createElement('template');
    next.innerHTML = chunks[index];
    const first = next.content.firstChild;
    if (!first || first.nodeType !== Node.TEXT_NODE) continue;
    const match = (first.textContent || '').match(leadingClosers);
    if (!match) continue;
    chunks[index - 1] += match[0];
    first.textContent = (first.textContent || '').slice(match[0].length);
    chunks[index] = next.innerHTML;
  }
  return chunks.filter(Boolean);
}

/**
 * DOM 回流分页：根据实际页面高度把溢出内容移到新折页
 */
function reflowFolds() {
  if (displayMode === 'scroll') return; // in scroll mode, don't paginate into folds
  const container = document.querySelector('.scroll-container');

  if (compareMode) {
    // 对照模式：每个 compare-mode fold 包含两栏
    // 如果任一栏溢出，将两栏的溢出段落同时移至新折
    reflowCompareFolds(container);
    return;
  }

  // 旧实现会先把整章全部塞进一页，再从末尾逐项移出；每移一次都
  // 触发布局，随后又从第一页扫描全部折页，长文下接近 O(n²)。
  // 这里先保存各章节点，再按阅读顺序单次装页：每个节点最多测量、
  // 移动一次，复杂度降为 O(n)。
  const groups = [];
  let group = null;
  Array.from(container.querySelectorAll(':scope > .fold')).forEach((fold) => {
    if (fold.classList.contains('fold--chapter-start')) {
      group = { firstFold: fold, folds: [], nodes: [] };
      groups.push(group);
    }
    if (!group) return;
    group.folds.push(fold);
    group.nodes.push(...Array.from(fold.children));
  });

  groups.forEach(({ firstFold, folds, nodes }) => {
    const chapterID = firstFold.id;
    folds.slice(1).forEach((fold) => fold.remove());
    firstFold.replaceChildren();
    firstFold.className = 'fold fold--chapter-start';
    firstFold.id = chapterID;

    let page = firstFold;
    nodes.forEach((node) => {
      page.appendChild(node);
      if (page.scrollHeight <= page.clientHeight + 2 || page.children.length <= 1) return;

      page.removeChild(node);
      const continuation = document.createElement('div');
      continuation.className = 'fold';
      page.after(continuation);
      continuation.appendChild(node);
      page = continuation;
    });
  });
}

/**
 * 对照模式回流分页：每栏独立检测溢出
 */
function reflowCompareFolds(container) {
  const chapterFolds = Array.from(container.querySelectorAll('.fold--chapter-start'));

  for (const chFold of chapterFolds) {
    // 先把续页合并回来
    let next = chFold.nextElementSibling;
    while (next && !next.classList.contains('fold--chapter-start')) {
      const toRemove = next;
      next = next.nextElementSibling;
      // 把续页两栏的段落放回章节首折对应栏
      const contCols = toRemove.querySelectorAll('.compare-col');
      const origCols = chFold.querySelectorAll('.compare-col');
      contCols.forEach((contCol, idx) => {
        if (origCols[idx]) {
          const paras = Array.from(contCol.querySelectorAll('.para'));
          paras.forEach(p => origCols[idx].appendChild(p));
        }
      });
      toRemove.remove();
    }

    // 检测各栏溢出
    let iterations = 0;
    while (iterations < 200) {
      const cols = chFold.querySelectorAll('.compare-col');
      // 找溢出最多的栏
      let anyOverflow = false;
      for (const col of cols) {
        if (col.scrollHeight > col.clientHeight + 2) {
          anyOverflow = true;
          break;
        }
      }
      if (!anyOverflow) break;
      iterations++;

      // 找到要插入续页的位置
      let insertAfter = chFold;
      let sib = chFold.nextElementSibling;
      while (sib && !sib.classList.contains('fold--chapter-start')) {
        insertAfter = sib;
        sib = sib.nextElementSibling;
      }

      // 创建续页
      const newFold = document.createElement('div');
      newFold.className = 'fold compare-mode';

      // 对每栏做溢出转移
      for (const col of cols) {
        const newCol = document.createElement('div');
        newCol.className = col.className;

        const paras = Array.from(col.querySelectorAll(':scope > .para'));
        if (col.scrollHeight > col.clientHeight + 2 && paras.length > 1) {
          const overflow = [];
          while (paras.length > 1 && col.scrollHeight > col.clientHeight + 2) {
            const last = paras.pop();
            col.removeChild(last);
            overflow.unshift(last);
          }
          overflow.forEach(p => newCol.appendChild(p));
        }

        newFold.appendChild(newCol);
      }

      // 只有当续页确实有内容时才添加
      const hasContent = Array.from(newFold.querySelectorAll('.para')).length > 0;
      if (hasContent) {
        insertAfter.after(newFold);
      } else {
        break;
      }
    }
  }
}

// ---- 对照 & 拼音 切换 ----
function setupToggles() {
  const compareBtn = document.getElementById('compare-btn');
  const pinyinBtn = document.getElementById('pinyin-btn');
  const settingsPinyinBtn = document.getElementById('setting-pinyin-mode');
  const settingsEditionBtn = document.getElementById('setting-edition-switch');
  const settingsCompareBtn = document.getElementById('setting-compare-mode');
  const settingsEditionLabel = document.getElementById('setting-edition-label');

  const updateEditionControls = () => {
    if (settingsEditionLabel) settingsEditionLabel.textContent = readerEdition === 'dunhuang' ? '敦煌本' : '宗宝本';
    settingsCompareBtn?.classList.toggle('is-active', compareMode);
    settingsCompareBtn?.setAttribute('aria-pressed', compareMode ? 'true' : 'false');
  };
  updateEditionControls();

  if (!dunhuangData) {
    compareBtn.disabled = true;
    compareBtn.title = '敦煌本数据未载入';
  }
  // 如果有预生成的 pinyin JSON，也视为可用
  const hasPinyinPregen = !!(window._zongbaoPinyin || window._dunhuangPinyin);
  if ((!pinyinMap || Object.keys(pinyinMap).length === 0) && !hasPinyinPregen) {
    pinyinBtn.disabled = true;
    pinyinBtn.title = '拼音数据未载入';
  }

  compareBtn.addEventListener('click', () => {
    if (!dunhuangData) return;
    // 模式切换前保存实际经文锚点，不能用两个模式的总页数比例换算。
    pendingReaderAnchor = captureReaderAnchor();
    applyCompareMode(!compareMode);
    updateEditionControls();
    rerender();
    postNativePageCurlVisibility();
  });

  settingsEditionBtn?.addEventListener('click', () => {
    const sourceAnchor = captureReaderAnchor();
    const targetEdition = readerEdition === 'zongbao' ? 'dunhuang' : 'zongbao';
    pendingReaderAnchor = mapReaderAnchorToEdition(sourceAnchor, targetEdition);
    readerEdition = targetEdition;
    writeStorage('ui_reader_edition', readerEdition);
    if (compareMode) applyCompareMode(false);
    updateEditionControls();
    rerender();
    postNativePageCurlVisibility();
  });

  settingsCompareBtn?.addEventListener('click', () => compareBtn.click());

  pinyinBtn.addEventListener('click', () => {
    // 允许使用预生成的 pinyin HTML 或者单字符拼音映射
    const available = (pinyinMap && Object.keys(pinyinMap).length > 0) || hasPinyinPregen;
    if (!available) return;
    const focusParagraphID = currentReadingParagraphID();
    pinyinMode = !pinyinMode;
    if (pinyinMode && window._zongbaoPinyin) {
      pinyinRenderedParagraphIDs = pinyinParagraphWindow(focusParagraphID, 2);
    } else {
      pinyinRenderedParagraphIDs = null;
    }
    pinyinBtn.classList.toggle('active', pinyinMode);
    if (settingsPinyinBtn) {
      settingsPinyinBtn.classList.toggle('is-active', pinyinMode);
      settingsPinyinBtn.setAttribute('aria-pressed', pinyinMode ? 'true' : 'false');
    }
    rerender();
  });

  if (settingsPinyinBtn) {
    settingsPinyinBtn.disabled = pinyinBtn.disabled;
    settingsPinyinBtn.classList.toggle('is-active', pinyinMode);
    settingsPinyinBtn.setAttribute('aria-pressed', pinyinMode ? 'true' : 'false');
    settingsPinyinBtn.addEventListener('click', () => pinyinBtn.click());
  }
}

function currentReadingParagraphID() {
  const container = document.querySelector('.scroll-container');
  if (!container) return '';
  if (compareMode) {
    const pane = container.querySelector('.compare-reader-pane:first-child');
    const pageIndex = Math.max(0, Math.round((pane?.scrollLeft || 0) / Math.max(1, pane?.clientWidth || 1)));
    return pane?.querySelectorAll('.compare-reader-page')[pageIndex]?.querySelector('.para[data-para]')?.dataset.para || '';
  }
  const pageWidth = Math.max(1, container.clientWidth);
  const pageIndex = Math.max(0, Math.round(container.scrollLeft / pageWidth));
  const fold = container.querySelectorAll(':scope > .fold')[pageIndex] || null;
  return fold?.querySelector('.para[data-para]')?.dataset.para || '';
}

function captureReaderAnchor() {
  const container = document.querySelector('.scroll-container');
  if (!container) return null;
  if (compareMode) {
    const pane = container.querySelector('.compare-reader-pane:first-child');
    const pages = Array.from(pane?.querySelectorAll('.compare-reader-page') || []);
    const pageIndex = Math.min(pages.length - 1, Math.max(0, Math.round((pane?.scrollLeft || 0) / Math.max(1, pane?.clientWidth || 1))));
    const page = pages[pageIndex];
    if (!page) return null;
    const paragraphPage = Number(page.dataset.paragraphPage) || 0;
    const paragraphPages = Math.max(1, Number(page.dataset.paragraphPages) || 1);
    return {
      paragraphID: page.dataset.paragraph || page.querySelector('.para[data-para]')?.dataset.para || '',
      paragraphProgress: paragraphPages > 1 ? paragraphPage / (paragraphPages - 1) : 0,
      chapterID: page.dataset.chapter || '',
      edition: pane?.dataset.edition || ''
    };
  }

  const vertical = displayMode === 'scroll';
  const folds = Array.from(container.querySelectorAll(':scope > .fold'));
  const foldIndex = vertical
    ? Math.max(0, folds.findLastIndex(fold => fold.offsetTop <= container.scrollTop + container.clientHeight * .35))
    : Math.min(folds.length - 1, Math.max(0, Math.round(container.scrollLeft / Math.max(1, container.clientWidth))));
  const paragraph = folds[foldIndex]?.querySelector('.para[data-para]');
  return paragraph ? {
    paragraphID: paragraph.dataset.para || '',
    paragraphProgress: 0,
    chapterID: paragraph.closest('.fold--chapter-start')?.id || document.getElementById('chapter-select')?.value || '',
    edition: readerEdition === 'dunhuang' ? 'dh' : 'zb'
  } : null;
}

function editionData(edition) {
  return edition === 'dunhuang' || edition === 'dh'
    ? window._dunhuangRaw
    : window._zongbaoRaw;
}

function normalizedEditionText(text) {
  return toSimplified(text || '')
    .replace(/善知识|惠能|慧能|大师|和尚/g, '')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

function editionTextGrams(text) {
  const normalized = normalizedEditionText(text);
  const grams = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) grams.add(normalized.slice(index, index + 2));
  return grams;
}

function editionTextSimilarity(sourceText, targetText) {
  const source = editionTextGrams(sourceText);
  const target = editionTextGrams(targetText);
  if (!source.size || !target.size) return 0;
  let common = 0;
  source.forEach(gram => { if (target.has(gram)) common += 1; });
  const containment = common / Math.max(1, Math.min(source.size, target.size));
  const dice = (2 * common) / Math.max(1, source.size + target.size);
  return containment * .68 + dice * .32;
}

function mapReaderAnchorToEdition(anchor, targetEdition) {
  if (!anchor) return null;
  const sourceData = editionData(anchor.edition);
  const targetData = editionData(targetEdition);
  const sourceParagraphs = (sourceData?.chapters || []).flatMap(chapter =>
    (chapter.paragraphs || []).map(paragraph => ({ ...paragraph, chapterID: chapter.id }))
  );
  const targetParagraphs = (targetData?.chapters || []).flatMap(chapter =>
    (chapter.paragraphs || []).map(paragraph => ({ ...paragraph, chapterID: chapter.id }))
  );
  if (!targetParagraphs.length) return anchor;
  const sourceIndex = Math.max(0, sourceParagraphs.findIndex(paragraph => paragraph.id === anchor.paragraphID));
  const sourceParagraph = sourceParagraphs[sourceIndex];
  const expectedIndex = sourceParagraphs.length > 1
    ? Math.round((sourceIndex / (sourceParagraphs.length - 1)) * (targetParagraphs.length - 1))
    : 0;
  let best = null;
  let bestScore = -Infinity;
  targetParagraphs.forEach((paragraph, index) => {
    const semanticScore = editionTextSimilarity(sourceParagraph?.text || '', paragraph.text || '');
    const orderDistance = Math.abs(index - expectedIndex) / Math.max(1, targetParagraphs.length - 1);
    const score = semanticScore - orderDistance * .018;
    if (score > bestScore) {
      bestScore = score;
      best = paragraph;
    }
  });
  if (!best || bestScore < .045) best = targetParagraphs[expectedIndex] || targetParagraphs[0];
  return {
    paragraphID: best.id,
    paragraphProgress: anchor.paragraphProgress || 0,
    chapterID: best.chapterID,
    edition: targetEdition === 'dunhuang' ? 'dh' : 'zb'
  };
}

function pinyinParagraphWindow(focusParagraphID, radius) {
  const chapters = window._zongbaoPinyin?.chapters || [];
  if (!chapters.length) return new Set();
  const paragraphs = chapters.flatMap((chapter) => chapter.paragraphs || []);
  const focusIndex = Math.max(0, paragraphs.findIndex((paragraph) => paragraph.id === focusParagraphID));
  const start = Math.max(0, focusIndex - radius);
  const end = Math.min(paragraphs.length, focusIndex + radius + 1);
  return new Set(paragraphs.slice(start, end).map((paragraph) => paragraph.id));
}

function ensurePinyinWindowAroundCurrentPage() {
  if (!pinyinMode || !pinyinRenderedParagraphIDs) return;
  const focusParagraphID = currentReadingParagraphID();
  const nearby = pinyinParagraphWindow(focusParagraphID, 2);
  let changed = false;
  nearby.forEach((id) => {
    if (!pinyinRenderedParagraphIDs.has(id)) {
      pinyinRenderedParagraphIDs.add(id);
      changed = true;
    }
  });
  if (changed) rerender();
}

window.__tanJingEnsurePinyinWindow = ensurePinyinWindowAroundCurrentPage;

function rerender() {
  const container = document.querySelector('.scroll-container');
  const oldComparePane = compareMode ? container.querySelector('.compare-reader-pane:first-child') : null;
  const maxS = oldComparePane
    ? oldComparePane.scrollWidth - oldComparePane.clientWidth
    : container.scrollWidth - container.clientWidth;
  const ratio = maxS > 0 ? (oldComparePane ? oldComparePane.scrollLeft : container.scrollLeft) / maxS : 0;
  const oldPageWidth = Math.max(1, container.clientWidth);
  const oldPageIndex = Math.round(container.scrollLeft / oldPageWidth);
  const oldFold = container.querySelectorAll(':scope > .fold')[oldPageIndex];
  const transitionAnchor = pendingReaderAnchor;
  pendingReaderAnchor = null;
  const readingAnchor = transitionAnchor?.paragraphID || (compareMode
    ? currentReadingParagraphID()
    : oldFold?.querySelector('.para[data-para]')?.dataset.para || '');

  render();

  requestAnimationFrame(() => {
    if (compareMode) {
      const pane = container.querySelector('.compare-reader-pane:first-child');
      const newMax = Math.max(0, (pane?.scrollWidth || 0) - (pane?.clientWidth || 0));
      if (pane) pane.scrollLeft = ratio * newMax;
      pane?.dispatchEvent(new Event('scroll'));
      updateProgress();
      postNativePageCurlVisibility();
      return;
    }
    const anchoredParagraphs = readingAnchor
      ? Array.from(container.querySelectorAll(`.para[data-para="${CSS.escape(readingAnchor)}"]`))
      : [];
    const anchorIndex = Math.round((transitionAnchor?.paragraphProgress || 0) * Math.max(0, anchoredParagraphs.length - 1));
    const anchoredParagraph = anchoredParagraphs[anchorIndex] || anchoredParagraphs[0] || null;
    const anchoredFold = anchoredParagraph?.closest('.fold');
    if (anchoredFold && displayMode === 'paged') {
      container.scrollLeft = anchoredFold.offsetLeft;
    } else if (anchoredParagraph && displayMode === 'scroll') {
      const containerRect = container.getBoundingClientRect();
      const paragraphRect = anchoredParagraph.getBoundingClientRect();
      container.scrollTop += paragraphRect.top - containerRect.top;
    } else {
      const newMax = container.scrollWidth - container.clientWidth;
      container.scrollLeft = ratio * newMax;
    }
    updateProgress();
    syncNativePageCurl();
  });
}

/**
 * 字体、字号和行距变化只影响几何布局，不需要重建全文 DOM。
 * 保留当前页中的实际节点引用，回流后定位到它所在的新页，避免跳页。
 */
function repaginateReaderLayout() {
  const container = document.querySelector('.scroll-container');
  if (!container) return;

  if (displayMode !== 'paged') {
    updateProgress();
    syncNativePageCurl();
    return;
  }

  const pageWidth = Math.max(1, container.clientWidth);
  const pageIndex = Math.round(container.scrollLeft / pageWidth);
  const currentFold = container.querySelectorAll(':scope > .fold')[pageIndex];
  const readingNode = currentFold?.querySelector('.para[data-para]') || null;

  // 分页回流会暂时删除旧折页。若保留 scroll-snap 与 smooth，WebKit
  // 会先吸附到临时页面，再平滑移动到校正页，看起来就像设置时自动
  // 翻了一页。回流期间关闭二者，只在最终位置稳定后恢复。
  const previousScrollBehavior = container.style.scrollBehavior;
  const previousScrollSnapType = container.style.scrollSnapType;
  readerLayoutInProgress = true;
  container.style.scrollBehavior = 'auto';
  container.style.scrollSnapType = 'none';

  reflowFolds();

  requestAnimationFrame(() => {
    const targetFold = readingNode?.closest('.fold');
    if (targetFold) {
      container.scrollTo({ left: targetFold.offsetLeft, behavior: 'auto' });
    }
    updateProgress();
    requestAnimationFrame(() => {
      container.style.scrollBehavior = previousScrollBehavior;
      container.style.scrollSnapType = previousScrollSnapType;
      readerLayoutInProgress = false;
      setTimeout(syncNativePageCurl, 0);
    });
  });
}

// ---- 横向滚动 & 翻页 ----
function setupScroll() {
  const container = document.querySelector('.scroll-container');

  // 鼠标滚轮 → 逐页翻页
  container.addEventListener('wheel', e => {
    if (readerSelectionLocked) {
      e.preventDefault();
      return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (isFlipping) return;
    if (displayMode === 'paged') flipPage(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // 键盘左右箭头翻页（搜索面板开启时跳过）
  document.addEventListener('keydown', e => {
    if (readerSelectionLocked) return;
    const searchOpen = document.getElementById('search-panel') && !document.getElementById('search-panel').hidden;
    if (searchOpen) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (displayMode === 'paged') { e.preventDefault(); flipPage(1); }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (displayMode === 'paged') { e.preventDefault(); flipPage(-1); }
    }
  });

    // 点击左右边缘翻页（避免干扰术语点击）
  container.addEventListener('click', e => {
    if (readerSelectionLocked || window.getSelection()?.toString().trim()) return;
    if (e.target.closest('.term, button, input, select, a, .tooltip')) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    // 左/右边缘点击翻页
      if (displayMode === 'paged') {
        if (x < w * 0.15) flipPage(-1);
        else if (x > w * 0.85) flipPage(1);
      }

    // 阅读器中央轻点：显示或隐藏底部阅读工具。
    if (isMobileReader() && x >= w * 0.18 && x <= w * 0.82) {
      toggleReaderChrome();
    }
  });

  // Touch gestures: detect horizontal swipes for flip, and center tap to open side-panel
  let _touchStartX = 0, _touchStartY = 0, _touchStartTime = 0, _touchMoved = false;
  container.addEventListener('touchstart', (ev) => {
    if (readerSelectionLocked) return;
    if (!ev.touches || ev.touches.length !== 1) return;
    _touchStartX = ev.touches[0].clientX;
    _touchStartY = ev.touches[0].clientY;
    _touchStartTime = Date.now();
    _touchMoved = false;
  }, { passive: true });

  container.addEventListener('touchmove', (ev) => {
    if (readerSelectionLocked) return;
    if (!ev.touches || ev.touches.length !== 1) return;
    const dx = ev.touches[0].clientX - _touchStartX;
    const dy = ev.touches[0].clientY - _touchStartY;
    if (Math.abs(dx) > 10) _touchMoved = true;
  }, { passive: true });

  container.addEventListener('touchend', (ev) => {
    if (readerSelectionLocked) return;
    const touch = (ev.changedTouches && ev.changedTouches[0]) || null;
    if (!touch) return;
    const dx = touch.clientX - _touchStartX;
    const dy = touch.clientY - _touchStartY;
    const dt = Date.now() - _touchStartTime;
    const rect = container.getBoundingClientRect();
    const startX = _touchStartX - rect.left;
    const w = rect.width;

    // 快速水平滑动视为翻页（限定水平位移和倾向）
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && dt < 700) {
      // 如果起点在右侧区域，则右侧滑动控制翻页
      if (startX > w * 0.6) {
        if (displayMode === 'paged') flipPage(dx < 0 ? 1 : -1);
      } else if (startX < w * 0.4) {
        if (displayMode === 'paged') flipPage(dx > 0 ? -1 : 1);
      }
      return;
    }

    // 左侧边缘向右的快速滑动：打开侧边面板（移动端，避免中间误触）
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && dt < 700) {
      if (startX < w * 0.12 && dx > 0 && window.innerWidth <= 640) {
        const sp = document.getElementById('side-panel');
        if (sp) { sp.hidden = false; sp.classList.add('open'); if (panelOverlay) panelOverlay.hidden = false; const sh = document.getElementById('side-handle'); if (sh) sh.hidden = true; }
        return;
      }
      // 如果起点在右侧区域，则右侧滑动控制翻页
      if (startX > w * 0.6) {
        if (displayMode === 'paged') flipPage(dx < 0 ? 1 : -1);
      } else if (startX < w * 0.4) {
        if (displayMode === 'paged') flipPage(dx > 0 ? -1 : 1);
      }
      return;
    }
  }, { passive: true });

  // 更新进度
  container.addEventListener('scroll', () => {
    if (readerLayoutInProgress) return;
    updateProgress();
    savePosition();
  });

  updateProgress();
}

/**
 * 翻页：direction = 1 下一页，-1 上一页
 */
function flipPage(direction) {
  if (isFlipping || readerSelectionLocked) return;
  const container = document.querySelector('.scroll-container');
  // iOS 原生 Page Curl 可见时，手势和动画完全交给 UIPageViewController。
  if (nativeUIHandler() && displayMode === 'paged') return;
  const pageWidth = container.clientWidth;
  const maxScroll = container.scrollWidth - container.clientWidth;
  const currentPage = Math.round(container.scrollLeft / pageWidth);
  const targetPage = Math.min(Math.max(0, currentPage + direction), Math.max(0, Math.ceil(container.scrollWidth / pageWidth) - 1));
  const targetScroll = Math.min(Math.max(0, targetPage * pageWidth), maxScroll);

  if (Math.abs(targetScroll - container.scrollLeft) < 2) return;

  isFlipping = true;
  container.scrollTo({ left: targetScroll, behavior: 'smooth' });
  setTimeout(() => {
    isFlipping = false;
  }, 450);
}

function updateProgress() {
  const container = document.querySelector('.scroll-container');
  const fill = document.querySelector('.progress-bar-fill');
  const label = document.querySelector('.topbar-progress');

  const primaryPane = compareMode ? container.querySelector('.compare-reader-pane:first-child') : null;
  const scroller = primaryPane || container;
  const isVertical = !compareMode && displayMode === 'scroll';
  const maxScroll = isVertical
    ? scroller.scrollHeight - scroller.clientHeight
    : scroller.scrollWidth - scroller.clientWidth;
  const currentScroll = isVertical ? scroller.scrollTop : scroller.scrollLeft;
  const pct = maxScroll > 0 ? (currentScroll / maxScroll) * 100 : 0;

  const roundedPct = Math.min(100, Math.max(0, Math.round(pct)));
  fill.style.width = pct + '%';
  label.textContent = roundedPct + '%';
  updateLibraryBookProgress('tanjing', roundedPct);

  let currentPage = 1;
  let totalPages = 1;
  if (isVertical) {
    totalPages = Math.max(1, Math.ceil(scroller.scrollHeight / Math.max(1, scroller.clientHeight)));
    currentPage = Math.min(totalPages, Math.max(1, Math.floor(scroller.scrollTop / Math.max(1, scroller.clientHeight)) + 1));
  } else if (compareMode) {
    totalPages = Math.max(1, primaryPane.querySelectorAll('.compare-reader-page').length);
    currentPage = Math.min(totalPages, Math.max(1, Math.round(primaryPane.scrollLeft / Math.max(1, primaryPane.clientWidth)) + 1));
  } else {
    totalPages = Math.max(1, container.querySelectorAll(':scope > .fold').length);
    currentPage = Math.min(totalPages, Math.max(1, Math.round(container.scrollLeft / Math.max(1, container.clientWidth)) + 1));
  }
  const nextPageLabel = `${currentPage} / ${totalPages}页`;
  if (nextPageLabel !== currentReaderPageLabel) {
    currentReaderPageLabel = nextPageLabel;
    const mobilePage = document.getElementById('reader-mobile-page');
    if (mobilePage) mobilePage.textContent = currentReaderPageLabel;
    nativeUIHandler()?.postMessage({ readerPageLabel: currentReaderPageLabel });
  }

  // 更新当前品名高亮
  updateActiveChapter();
  updateDirectoryPresentation(currentPage, totalPages);
}

function updateLibraryBookProgress(bookID, percent) {
  const value = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  document.querySelectorAll(`[data-book-progress="${CSS.escape(bookID)}"]`).forEach((element) => {
    element.textContent = `${value}% · 继续阅读`;
    element.setAttribute('aria-label', `当前阅读进度 ${value}%`);
  });
}

function chapterPageRange(chapter, container, totalPages) {
  if (compareMode) return { start: 1, end: 1 };
  if (displayMode === 'scroll') {
    const height = Math.max(1, container.clientHeight);
    const start = Math.max(1, Math.floor(chapter.offsetTop / height) + 1);
    const nextChapter = Array.from(container.querySelectorAll('.fold--chapter-start'))
      .find(item => item.offsetTop > chapter.offsetTop);
    const endOffset = nextChapter ? nextChapter.offsetTop - 1 : container.scrollHeight - 1;
    return { start, end: Math.max(start, Math.min(totalPages, Math.floor(endOffset / height) + 1)) };
  }
  const folds = Array.from(container.querySelectorAll(':scope > .fold'));
  const startIndex = folds.indexOf(chapter);
  const nextIndex = folds.findIndex((fold, index) => index > startIndex && fold.classList.contains('fold--chapter-start'));
  return { start: Math.max(1, startIndex + 1), end: nextIndex < 0 ? totalPages : Math.max(startIndex + 1, nextIndex) };
}

function updateDirectoryPresentation(currentPage, totalPages) {
  const container = document.querySelector('.scroll-container');
  const list = document.getElementById('mobile-chapter-list');
  if (!container || !list) return;
  const selectedId = document.getElementById('chapter-select')?.value || '';
  const progress = totalPages > 1 ? ((currentPage - 1) / (totalPages - 1)) * 100 : 0;
  const currentPageEl = document.getElementById('directory-current-page');
  const progressLabelEl = document.getElementById('directory-progress-label');
  const fillEl = document.getElementById('directory-progress-fill');
  const chapterEl = document.getElementById('directory-current-chapter');
  if (currentPageEl) currentPageEl.textContent = `${currentPage} / ${totalPages}页`;
  if (progressLabelEl) progressLabelEl.textContent = `进度 ${Math.round(progress)}%`;
  if (fillEl) fillEl.style.width = `${progress}%`;

  list.querySelectorAll('.mobile-chapter-item').forEach(item => {
    const chapter = compareMode
      ? container.querySelector(`.compare-reader-pane:first-child .compare-reader-chapter[data-chapter="${CSS.escape(item.dataset.target || '')}"]`)
      : document.getElementById(item.dataset.target || '');
    const isCurrent = item.dataset.target === selectedId;
    item.classList.toggle('is-current', isCurrent);
    item.setAttribute('aria-current', isCurrent ? 'true' : 'false');
    const page = item.querySelector('.mobile-chapter-page');
    if (compareMode && page) {
      page.textContent = '';
    } else if (chapter && page) {
      const range = chapterPageRange(chapter, container, totalPages);
      page.textContent = `${range.start}页`;
    }
    if (isCurrent && chapterEl) {
      chapterEl.textContent = item.querySelector('.mobile-chapter-name')?.textContent || '';
    }
  });
}

function updateActiveChapter() {
  const container = document.querySelector('.scroll-container');
  const select = document.getElementById('chapter-select');

  // 横向分页按中心 X，纵向阅读按视口中心 Y，避免纵向模式始终误判为最后一章。
  const activeScroller = compareMode ? container.querySelector('.compare-reader-pane:first-child') : container;
  const chapters = compareMode
    ? activeScroller?.querySelectorAll('.compare-reader-page') || []
    : container.querySelectorAll('.fold--chapter-start');
  let activeId = '';
  if (compareMode) {
    const pageIndex = Math.max(0, Math.round(activeScroller.scrollLeft / Math.max(1, activeScroller.clientWidth)));
    activeId = chapters[pageIndex]?.dataset.chapter || '';
  } else if (displayMode === 'scroll') {
    const centerY = activeScroller.scrollTop + activeScroller.clientHeight / 2;
    chapters.forEach(el => {
      if (el.offsetTop <= centerY) activeId = el.id;
    });
  } else {
    const centerX = container.scrollLeft + container.clientWidth / 2;
    chapters.forEach(el => {
      if (el.offsetLeft <= centerX) activeId = el.id;
    });
  }

  if (!activeId) return;
  if (select.value !== activeId) select.value = activeId;

  const rawChapterTitle = select.selectedOptions[0]?.textContent?.trim() || '';
  const chapterTitle = rawChapterTitle.replace(/品?第([一二三四五六七八九十百]+)$/, '品第$1');
  const nextTitle = chapterTitle ? `六祖坛经-${chapterTitle}` : '六祖坛经';
  if (nextTitle !== currentReaderTitle) {
    currentReaderTitle = nextTitle;
    const mobileTitle = document.getElementById('reader-mobile-title');
    if (mobileTitle) mobileTitle.textContent = currentReaderTitle;
    nativeUIHandler()?.postMessage({ readerTitle: currentReaderTitle });
  }
}

function navigateToChapter(chapterID) {
  const container = document.querySelector('.scroll-container');
  if (compareMode) {
    const panes = Array.from(container?.querySelectorAll('.compare-reader-pane') || []);
    if (!panes.length) return false;
    panes.forEach((pane) => {
      const chapter = pane.querySelector(`.compare-reader-page[data-chapter="${CSS.escape(chapterID)}"]`);
      if (chapter) pane.scrollTo({ left: chapter.offsetLeft, behavior: 'auto' });
    });
    const select = document.getElementById('chapter-select');
    if (select) select.value = chapterID;
    updateProgress();
    savePosition();
    return true;
  }
  const chapter = chapterID ? document.getElementById(chapterID) : null;
  const chapterTitle = chapter?.querySelector('.chapter-title') || chapter;
  const targetPage = chapterTitle?.closest('.fold') || chapter;
  if (!container || !chapter || !targetPage) return false;

  const previousBehavior = container.style.scrollBehavior;
  const previousSnap = container.style.scrollSnapType;
  container.style.scrollBehavior = 'auto';
  container.style.scrollSnapType = 'none';

  if (displayMode === 'scroll') {
    // 定位章节大标题本身，确保落点不是章节附近的估算位置。
    chapterTitle.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
  } else {
    const folds = Array.from(container.querySelectorAll(':scope > .fold'));
    const pageIndex = Math.max(0, folds.indexOf(targetPage));
    // 回流分页后折页宽度可能受安全区和小数像素影响，使用章节折页的
    // 真实偏移，不能再用“页码 × 容器宽度”估算。
    const targetLeft = Math.min(Math.max(0, targetPage.offsetLeft), Math.max(0, container.scrollWidth - container.clientWidth));
    isFlipping = false;
    nativePageCurlRequestedIndex = pageIndex;
    container.scrollTo({ left: targetLeft, behavior: 'auto' });
    nativeUIHandler()?.postMessage({
      pageCurlEnabled: true,
      pageCurlSuspended: false,
      pageCurlCurrentIndex: pageIndex
    });
  }

  const select = document.getElementById('chapter-select');
  if (select) select.value = chapterID;
  updateProgress();
  savePosition();
  requestAnimationFrame(() => {
    container.style.scrollBehavior = previousBehavior;
    container.style.scrollSnapType = previousSnap;
    if (displayMode === 'paged') syncNativePageCurl();
  });
  return true;
}

// ---- 品名导航 ----
function setupNavigation() {
  const select = document.getElementById('chapter-select');
  select.addEventListener('change', () => {
    navigateToChapter(select.value);
  });
}

// ---- 术语浮层交互 ----
function setupTermInteraction() {
  const container = document.querySelector('.scroll-container');

  // 桌面端：mouseenter / mouseleave
  container.addEventListener('mouseenter', e => {
    if (e.target.classList.contains('term')) {
      showTooltip(e.target);
    }
  }, true);

  container.addEventListener('mouseleave', e => {
    if (e.target.classList.contains('term')) {
      hideTooltip();
    }
  }, true);

  // 移动端：touchstart 长按
  container.addEventListener('touchstart', e => {
    const target = e.target.closest('.term');
    if (!target) return;
    longPressTimer = setTimeout(() => {
      e.preventDefault();
      showTooltip(target);
    }, 400);
  }, { passive: false });

  container.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
  });

  container.addEventListener('touchmove', () => {
    clearTimeout(longPressTimer);
  });

  // 点击其他区域关闭 tooltip
  document.addEventListener('click', e => {
    if (!e.target.closest('.term') && !e.target.closest('.tooltip')) {
      hideTooltip();
    }
  });
}

function showTooltip(termEl) {
  const term = termEl.dataset.term;
  const data = glossaryMap[term];
  if (!data) return;

  tooltip.querySelector('.tooltip-term').textContent = term;
  tooltip.querySelector('.tooltip-pinyin').textContent = data.pinyin;
  tooltip.querySelector('.tooltip-meaning').textContent = data.meaning;

  // 先显示并测量真实尺寸，再依据视口安全边距定位；长释义和窄屏都不会越界。
  const rect = termEl.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportWidth = viewport?.width || window.innerWidth;
  const viewportHeight = viewport?.height || window.innerHeight;
  const margin = 10;
  const gap = 8;

  tooltip.style.left = `${viewportLeft + margin}px`;
  tooltip.style.top = `${viewportTop + margin}px`;
  tooltip.style.maxWidth = `${Math.max(0, viewportWidth - margin * 2)}px`;
  tooltip.style.maxHeight = `${Math.max(0, viewportHeight - margin * 2)}px`;
  tooltip.classList.add('visible');

  const tooltipRect = tooltip.getBoundingClientRect();
  const minLeft = viewportLeft + margin;
  const maxLeft = viewportLeft + viewportWidth - tooltipRect.width - margin;
  const preferredLeft = rect.left + rect.width / 2 - tooltipRect.width / 2;
  const left = Math.min(Math.max(preferredLeft, minLeft), Math.max(minLeft, maxLeft));
  const spaceBelow = viewportTop + viewportHeight - rect.bottom - margin;
  const spaceAbove = rect.top - viewportTop - margin;
  const placeAbove = tooltipRect.height + gap > spaceBelow && spaceAbove > spaceBelow;
  const preferredTop = placeAbove
    ? rect.top - tooltipRect.height - gap
    : rect.bottom + gap;
  const maxTop = viewportTop + viewportHeight - tooltipRect.height - margin;
  const top = Math.min(Math.max(preferredTop, viewportTop + margin), Math.max(viewportTop + margin, maxTop));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  if (tooltip) {
    tooltip.classList.remove('visible');
  }
}

// ---- 阅读进度持久化 ----
function savePosition() {
  const container = document.querySelector('.scroll-container');
  const comparePane = compareMode ? container.querySelector('.compare-reader-pane:first-child') : null;
  const scroller = comparePane || container;
  const vertical = !compareMode && displayMode === 'scroll';
  const maxScroll = vertical
    ? scroller.scrollHeight - scroller.clientHeight
    : scroller.scrollWidth - scroller.clientWidth;
  if (maxScroll > 0) {
    const currentScroll = vertical ? scroller.scrollTop : (compareMode ? scroller.scrollLeft : container.scrollLeft);
    const ratio = currentScroll / maxScroll;
    try {
      localStorage.setItem(`${STORAGE_KEY}_${compareMode ? 'compare' : displayMode}`, ratio.toString());
    } catch (_) { /* 无痕模式等情况忽略 */ }
  }
}

function restorePosition() {
  try {
    const ratio = parseFloat(localStorage.getItem(`${STORAGE_KEY}_${compareMode ? 'compare' : displayMode}`));
    if (!isNaN(ratio) && ratio > 0) {
      const container = document.querySelector('.scroll-container');
      // 等 DOM 渲染完成后恢复位置
      requestAnimationFrame(() => {
        const comparePane = compareMode ? container.querySelector('.compare-reader-pane:first-child') : null;
        const scroller = comparePane || container;
        const vertical = !compareMode && displayMode === 'scroll';
        const maxScroll = vertical
          ? scroller.scrollHeight - scroller.clientHeight
          : scroller.scrollWidth - scroller.clientWidth;
        if (vertical) scroller.scrollTop = ratio * maxScroll;
        else if (compareMode) scroller.scrollLeft = ratio * maxScroll;
        else container.scrollLeft = ratio * maxScroll;
        updateProgress();
      });
    }
  } catch (_) { /* 忽略 */ }
}

// ---- 工具函数 ----
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- 简体→繁体映射（经文为繁体，用户输入简体自动转换） ----
const _s2tMap = (()=>{
  const pairs =
    '爱愛碍礙罢罷备備笔筆边邊变變标標别別宾賓补補参參残殘惭慚惨慘仓倉层層产產长長尝嘗偿償厂廠车車彻徹陈陳称稱诚誠惩懲迟遲冲衝丑醜处處触觸辞辭从從达達带帶担擔当當导導灯燈敌敵递遞点點电電调調东東动動独獨断斷对對队隊夺奪尔爾发發范範飞飛坟墳奋奮丰豐风風凤鳳肤膚妇婦复復赶趕个個给給宫宮贡貢沟溝构構购購顾顧关關观觀广廣归歸龟龜国國过過还還汉漢号號轰轟后後护護划劃华華画畫怀懷坏壞欢歡环環换換黄黃汇匯会會获獲击擊鸡雞积積极極际際继繼夹夾荐薦坚堅间間见見将將奖獎讲講酱醬节節杰傑尽盡进進惊驚经經净淨竞競举舉据據觉覺军軍开開垦墾恳懇夸誇块塊来來兰蘭拦攔蓝藍劳勞乐樂类類离離历歷丽麗两兩灵靈领領刘劉龙龍楼樓虑慮录錄陆陸驴驢乱亂论論罗羅马馬买買卖賣满滿门門闷悶梦夢庙廟灭滅鸣鳴难難恼惱脑腦拟擬酿釀鸟鳥宁寧农農欧歐盘盤赔賠喷噴骗騙贫貧凭憑仆僕朴樸启啟气氣迁遷签簽钱錢枪槍亲親穷窮请請庆慶权權劝勸确確让讓热熱认認荣榮赛賽伞傘丧喪扫掃杀殺晒曬伤傷赏賞烧燒设設审審声聲胜勝圣聖师師时時实實识識势勢释釋寿壽书書属屬术術树樹双雙丝絲苏蘇诉訴虽雖随隨岁歲孙孫损損态態叹歎谈談汤湯讨討体體条條听聽铁鐵厅廳头頭图圖团團万萬网網为為韦韋卫衛稳穩问問无無务務雾霧误誤习習鲜鮮显顯宪憲乡鄉响響协協胁脅写寫兴興须須选選学學训訓压壓亚亞烟煙严嚴颜顏验驗阳陽样樣养養摇搖药藥业業叶葉页頁医醫仪儀忆憶义義艺藝阴陰银銀饮飲应應拥擁邮郵犹猶鱼魚与與语語郁鬱誉譽渊淵远遠愿願约約阅閱运運杂雜脏臟暂暫则則责責贼賊赠贈斋齋战戰张張针針阵陣争爭证證纸紙质質种種众眾专專转轉装裝壮壯状狀资資总總纵縱组組钻鑽缘緣禅禪诸諸谓謂诲誨蕴蘊顿頓说說烦煩忏懺诵誦谛諦颂頌辩辯坛壇岭嶺宝寶尘塵刹剎闻聞谤謗悯憫怜憐惫憊赞讚恒恆诫誡谱譜筹籌绝絕忧憂迹跡';
  const m = {};
  for (let i = 0; i < pairs.length; i += 2) {
    const s = pairs[i], t = pairs[i+1];
    if (s !== t) m[s] = t;
  }
  return m;
})();

function toTraditional(str) {
  let out = '';
  for (const ch of str) out += _s2tMap[ch] || ch;
  return out;
}

// ---- 繁→简映射（由 _s2tMap 反转） ----
const _t2sMap = Object.fromEntries(Object.entries(_s2tMap).map(([s, t]) => [t, s]));

function toSimplified(str) {
  let out = '';
  for (const ch of str) out += _t2sMap[ch] || ch;
  return out;
}

// 仅转换 DOM 文本节点（保留属性值，如 data-term 保持繁体供词典匹配）
function applySimplifiedToContainer(el) {
  if (!el) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => { node.textContent = toSimplified(node.textContent); });
}

function applyTraditionalToContainer(el) {
  if (!el) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => { node.textContent = toTraditional(node.textContent); });
}

function readerChapterTitle(chapter) {
  if (!chapter) return '';
  return useTraditionalContent && chapter.traditionalTitle
    ? chapter.traditionalTitle
    : chapter.title;
}

function readerParagraphText(paragraph) {
  if (!paragraph) return '';
  return useTraditionalContent && paragraph.traditionalText
    ? paragraph.traditionalText
    : paragraph.text;
}

// ---- 全文搜索 ----
function setupSearch() {
  const topbarEl = document.querySelector('.topbar');
  const btn = document.getElementById('search-btn');
  const panel = document.getElementById('search-panel');
  const input = document.getElementById('search-input');
  const closeBtn = document.getElementById('search-close');
  const resultsList = document.getElementById('search-results');
  const countLabel = document.getElementById('search-count');
  const compactBtn = document.getElementById('search-compact-btn');
  const searchHistory = document.getElementById('search-history');
  const searchHistoryList = document.getElementById('search-history-list');
  const searchHistoryClear = document.getElementById('search-history-clear');
  const searchOverlay = document.getElementById('search-overlay');
  const settingsBtn = document.getElementById('search-settings-btn');
  const topSettingsBtn = document.getElementById('top-search-settings');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsBack = document.getElementById('settings-back');
  const fontSizeRange = document.getElementById('font-size-range');
  const fontSizeDecr = document.getElementById('font-size-decr');
  const fontSizeIncr = document.getElementById('font-size-incr');
  const fontSizeValue = document.getElementById('font-size-value');
  const fontSelect = document.getElementById('font-select');
  const fontMenuTrigger = document.getElementById('font-menu-trigger');
  const fontCustomMenu = document.getElementById('font-custom-menu');
  const lineHeightRange = document.getElementById('line-height-range');
  const lineHeightDecr = document.getElementById('line-height-decr');
  const lineHeightIncr = document.getElementById('line-height-incr');
  const lineHeightValue = document.getElementById('line-height-value');

  // Mobile side-panel elements (may be absent on desktop)
  const mobilePanel = document.getElementById('side-panel');
  const mobileChapterList = document.getElementById('mobile-chapter-list');
  const mobileInput = document.getElementById('mobile-search-input');
  const mobileResults = document.getElementById('mobile-search-results');
  const mobileCount = document.getElementById('mobile-search-count');
  const panelOverlay = document.getElementById('panel-overlay');
  const lighthouseBtn = document.getElementById('mobile-lighthouse-btn');
  const lighthousePanel = document.getElementById('lighthouse-panel');
  const lighthouseForm = document.getElementById('lighthouse-form');
  const lighthouseInput = document.getElementById('lighthouse-input');
  const lighthouseSubmit = document.getElementById('lighthouse-submit');
  const lighthouseStatus = document.getElementById('lighthouse-status');
  const notesBtn = document.getElementById('mobile-notes-btn');
  const notesPanel = document.getElementById('notes-panel');
  const notesSelection = document.getElementById('notes-selection');
  const notesThought = document.getElementById('notes-thought');
  const notesSave = document.getElementById('notes-save');
  const notesCancelEdit = document.getElementById('notes-cancel-edit');
  const notesEditingState = document.getElementById('notes-editing-state');
  const notesCharacterCount = document.getElementById('notes-character-count');
  const notesStatus = document.getElementById('notes-status');
  const notesList = document.getElementById('notes-list');
  const notesCount = document.getElementById('notes-count');
  const libraryBtn = document.getElementById('mobile-library-btn');
  const libraryPanel = document.getElementById('library-panel');

  let debounceTimer = null;
  const SEARCH_HISTORY_KEY = 'sutra_search_history';
  const SEARCH_HISTORY_LIMIT = 20;
  const PANEL_TRANSITION_MS = 360;

  function loadSearchHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).slice(0, SEARCH_HISTORY_LIMIT) : [];
    } catch(e) {
      return [];
    }
  }

  function storeSearchHistory(query) {
    const normalized = query.trim();
    if (!normalized) return;
    const items = [normalized, ...loadSearchHistory().filter(item => item !== normalized)].slice(0, SEARCH_HISTORY_LIMIT);
    try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items)); } catch(e) {}
  }

  function renderSearchHistory() {
    if (!searchHistoryList || !searchHistory) return;
    const items = loadSearchHistory();
    searchHistoryList.innerHTML = '';
    items.forEach(query => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'search-history-pill';
      item.textContent = query;
      item.addEventListener('click', () => {
        input.value = query;
        commitSearch(query);
      });
      searchHistoryList.appendChild(item);
    });
    searchHistory.classList.toggle('is-empty', items.length === 0);
  }

  function showAnimatedPanel(element) {
    if (!element) return;
    if (element._hideTimer) clearTimeout(element._hideTimer);
    element.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => element.classList.add('open')));
  }

  function hideAnimatedPanel(element) {
    if (!element) return;
    element.classList.remove('open');
    if (!isMobileReader()) {
      element.hidden = true;
      return;
    }
    if (element._hideTimer) clearTimeout(element._hideTimer);
    element._hideTimer = setTimeout(() => { element.hidden = true; }, PANEL_TRANSITION_MS);
  }

  function openSettingsPanel() {
    closeSidePanel();
    closeLighthousePanel();
    closeNotesPanel();
    closeLibraryPanel();
    showAnimatedPanel(settingsPanel);
    if (panelOverlay) panelOverlay.hidden = false;
    const button = document.getElementById('mobile-settings-btn');
    if (button) button.classList.add('active');
    document.body.classList.add('reader-panel-open');
    if (isMobileReader()) setReaderChromeVisible(true);
  }

  function closeSettingsPanel() {
    if (fontCustomMenu) fontCustomMenu.hidden = true;
    fontMenuTrigger?.setAttribute('aria-expanded', 'false');
    hideAnimatedPanel(settingsPanel);
    const button = document.getElementById('mobile-settings-btn');
    if (button) button.classList.remove('active');
  }

  function toggleSettingsPanel() {
    if (settingsPanel && !settingsPanel.hidden && settingsPanel.classList.contains('open')) {
      closeSettingsPanel();
      if (panelOverlay) panelOverlay.hidden = true;
      document.body.classList.remove('reader-panel-open');
      if (isMobileReader()) setReaderChromeVisible(true);
      return;
    }
    openSettingsPanel();
  }

  function openSidePanel() {
    closeSettingsPanel();
    closeLighthousePanel();
    closeNotesPanel();
    closeLibraryPanel();
    showAnimatedPanel(mobilePanel);
    mobilePanel.dataset.open = 'true';
    if (panelOverlay) panelOverlay.hidden = false;
    if (sideHandleEl) sideHandleEl.hidden = true;
    const button = document.getElementById('mobile-toc-btn');
    if (button) {
      button.classList.add('active');
      button.setAttribute('aria-expanded', 'true');
    }
    mobilePanel?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('reader-panel-open');
    document.body.classList.add('directory-panel-open');
    updateProgress();
    nativeUIHandler()?.postMessage({ directoryVisible: true });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      mobileChapterList?.querySelector('.mobile-chapter-item.is-current')?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }));
  }

  function closeSidePanel() {
    if (mobilePanel) mobilePanel.dataset.open = 'false';
    hideAnimatedPanel(mobilePanel);
    const button = document.getElementById('mobile-toc-btn');
    if (button) {
      button.classList.remove('active');
      button.setAttribute('aria-expanded', 'false');
    }
    mobilePanel?.setAttribute('aria-hidden', 'true');
    const handle = document.getElementById('side-handle');
    if (handle) handle.hidden = false;
    document.body.classList.remove('directory-panel-open');
    nativeUIHandler()?.postMessage({ directoryVisible: false });
  }

  function toggleSidePanel() {
    if (mobilePanel?.dataset.open === 'true') {
      closeSidePanel();
      if (panelOverlay) panelOverlay.hidden = true;
      document.body.classList.remove('reader-panel-open');
      if (isMobileReader()) setReaderChromeVisible(true);
      return;
    }
    openSidePanel();
  }

  // 目录 Sheet：只允许从顶部标题区向下拖动；超过阈值或快速下甩时关闭。
  if (mobilePanel) {
    const dragArea = mobilePanel.querySelector('.side-panel-header');
    let dragStartY = 0;
    let dragCurrentY = 0;
    let dragStartTime = 0;
    let dragging = false;
    let dragPointerID = null;

    const setDirectoryDragOffset = (distance) => {
      // reader-tool-panel 的统一开合规则带 !important，拖拽位移必须使用同级优先级。
      mobilePanel.style.setProperty('transform', `translate3d(0, ${distance}px, 0)`, 'important');
      const progress = Math.min(1, distance / Math.max(1, mobilePanel.clientHeight * .72));
      if (panelOverlay) panelOverlay.style.opacity = String(1 - progress * .72);
    };

    const clearDirectoryDragStyles = () => {
      mobilePanel.style.removeProperty('transform');
      panelOverlay?.style.removeProperty('opacity');
    };

    const finishDirectoryDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      try { dragArea?.releasePointerCapture(dragPointerID ?? event.pointerId); } catch (_) {}
      dragPointerID = null;
      const distance = Math.max(0, dragCurrentY - dragStartY);
      const elapsed = Math.max(1, performance.now() - dragStartTime);
      const velocity = distance / elapsed;
      const shouldClose = distance > Math.min(150, mobilePanel.clientHeight * 0.18) || velocity > 0.65;
      mobilePanel.classList.remove('is-dragging');
      if (shouldClose) {
        // 从手指释放位置继续滑出屏幕，不先闪回顶部。
        requestAnimationFrame(() => {
          mobilePanel.style.setProperty('transform', 'translate3d(0, 100%, 0)', 'important');
          if (panelOverlay) panelOverlay.style.opacity = '0';
        });
        closeSidePanel();
        document.body.classList.remove('reader-panel-open');
        if (panelOverlay) panelOverlay.hidden = true;
        if (isMobileReader()) setReaderChromeVisible(true);
        setTimeout(clearDirectoryDragStyles, PANEL_TRANSITION_MS + 30);
      } else {
        // 未达到阈值时，从当前位置连续回弹，不产生跳帧。
        requestAnimationFrame(() => {
          mobilePanel.style.setProperty('transform', 'translate3d(0, 0, 0)', 'important');
          if (panelOverlay) panelOverlay.style.opacity = '1';
        });
        setTimeout(clearDirectoryDragStyles, PANEL_TRANSITION_MS);
      }
    };

    dragArea?.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      dragging = true;
      dragStartY = event.clientY;
      dragCurrentY = event.clientY;
      dragStartTime = performance.now();
      dragPointerID = event.pointerId;
      mobilePanel.classList.add('is-dragging');
      try { dragArea.setPointerCapture(event.pointerId); } catch (_) {}
    });

    dragArea?.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      dragCurrentY = event.clientY;
      const distance = Math.max(0, dragCurrentY - dragStartY);
      setDirectoryDragOffset(distance);
    });
    dragArea?.addEventListener('pointerup', finishDirectoryDrag);
    dragArea?.addEventListener('pointercancel', finishDirectoryDrag);
  }

  if (mobileChapterList) {
    mobileChapterList.addEventListener('click', (event) => {
      const item = event.target.closest('.mobile-chapter-item');
      if (!item) return;
      event.preventDefault();
      // 原生 Page Curl 在目录打开期间处于 suspended。必须先关闭目录、
      // 恢复翻页层，再发送章节页码，否则原生端会丢弃这次跳转。
      closeSidePanel();
      document.body.classList.remove('reader-panel-open');
      if (panelOverlay) panelOverlay.hidden = true;
      postNativePageCurlVisibility();
      const chapterID = item.dataset.target || '';
      // 等目录退出状态完成一轮布局后再定位；目标页会由 Page Curl 重建
      // 消息强制携带，不再依赖容易丢失的中间滚动状态。
      requestAnimationFrame(() => requestAnimationFrame(() => {
        navigateToChapter(chapterID);
        if (displayMode === 'paged') setTimeout(syncNativePageCurl, 0);
      }));
      if (isMobileReader()) setReaderChromeVisible(true);
    });
  }

  function openLighthousePanel() {
    closeSidePanel();
    closeSettingsPanel();
    closeNotesPanel();
    closeLibraryPanel();
    showAnimatedPanel(lighthousePanel);
    if (panelOverlay) panelOverlay.hidden = false;
    document.body.classList.add('reader-panel-open');
    if (lighthouseBtn) lighthouseBtn.classList.add('active');
    if (lighthouseStatus) lighthouseStatus.textContent = '';
    if (isMobileReader()) setReaderChromeVisible(true);
  }

  function closeLighthousePanel() {
    hideAnimatedPanel(lighthousePanel);
    if (lighthouseBtn) lighthouseBtn.classList.remove('active');
  }

  function toggleLighthousePanel() {
    if (lighthousePanel && !lighthousePanel.hidden && lighthousePanel.classList.contains('open')) {
      closeLighthousePanel();
      if (panelOverlay) panelOverlay.hidden = true;
      document.body.classList.remove('reader-panel-open');
      if (isMobileReader()) setReaderChromeVisible(true);
      return;
    }
    openLighthousePanel();
  }

  let pendingNoteSelection = { quote: '', paragraphID: '' };
  let editingNoteID = '';
  let noteComposerDraft = null;

  function storeReaderNotes(notes) {
    return writeStorage(READER_NOTES_KEY, JSON.stringify(notes));
  }

  function updateNotesComposer() {
    const length = Array.from(notesThought?.value || '').length;
    if (notesCharacterCount) notesCharacterCount.textContent = `已输入 ${length} 字 · 最多 500 字`;
    if (notesEditingState) notesEditingState.hidden = !editingNoteID;
    if (notesCancelEdit) notesCancelEdit.hidden = !editingNoteID;
    if (notesSave) {
      notesSave.disabled = !pendingNoteSelection.quote && !notesThought?.value.trim();
      notesSave.textContent = editingNoteID ? '保存修改' : '保存笔记';
    }
  }

  function setNotesStatus(message = '') {
    if (notesStatus) notesStatus.textContent = message;
  }

  function resetNoteComposer({ keepSelection = false } = {}) {
    editingNoteID = '';
    if (!keepSelection) pendingNoteSelection = { quote: '', paragraphID: currentReadingParagraphID() || '' };
    if (notesThought) notesThought.value = '';
    if (notesSelection && !keepSelection) {
      notesSelection.textContent = '';
      notesSelection.hidden = true;
    }
    updateNotesComposer();
  }

  function goToReaderNote(note) {
    if (!note?.paragraphID) return;
    const paragraph = document.querySelector(`.para[data-para="${CSS.escape(note.paragraphID)}"]`);
    if (!paragraph) return;
    closeNotesPanel();
    if (panelOverlay) panelOverlay.hidden = true;
    document.body.classList.remove('reader-panel-open');
    if (displayMode === 'scroll') {
      paragraph.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    } else {
      paragraph.closest('.fold')?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'start' });
      requestAnimationFrame(syncNativePageCurl);
    }
    paragraph.classList.remove('note-target-flash');
    requestAnimationFrame(() => paragraph.classList.add('note-target-flash'));
    setTimeout(() => paragraph.classList.remove('note-target-flash'), 1900);
    updateProgress();
    savePosition();
    if (isMobileReader()) setReaderChromeVisible(true);
  }

  function editReaderNote(note) {
    editingNoteID = note.id;
    pendingNoteSelection = { quote: note.quote || '', paragraphID: note.paragraphID || '' };
    if (notesSelection) {
      notesSelection.textContent = note.quote || '这是一条当前页感想。';
      notesSelection.hidden = !note.quote;
    }
    if (notesThought) {
      notesThought.value = note.thought || '';
      notesThought.focus({ preventScroll: true });
    }
    setNotesStatus('正在编辑这条笔记');
    updateNotesComposer();
    notesPanel?.querySelector('.notes-panel-body')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function captureNoteSelection() {
    const selection = window.getSelection();
    const quote = selection?.toString().replace(/\s+/g, ' ').trim() || '';
    const anchor = selection?.anchorNode?.nodeType === Node.TEXT_NODE
      ? selection.anchorNode.parentElement
      : selection?.anchorNode;
    const paragraph = anchor?.closest?.('.para[data-para]');
    return {
      quote: quote.slice(0, 500),
      paragraphID: paragraph?.dataset.para || currentReadingParagraphID() || ''
    };
  }

  function renderReaderNotes() {
    if (!notesList) return;
    const notes = loadReaderNotes();
    if (notesCount) notesCount.textContent = `${notes.length} 条`;
    notesList.innerHTML = '';
    if (!notes.length) {
      notesList.innerHTML = '<p class="notes-empty">还没有笔记。选择一段经文，写下此刻所感。</p>';
      return;
    }
    notes.forEach((note) => {
      const article = document.createElement('article');
      article.className = 'note-card';
      article.dataset.noteId = note.id;
      const date = note.updatedAt || note.createdAt;
      const timeLabel = date ? new Date(date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
      article.innerHTML = `${note.quote ? `<blockquote>${escapeHtml(note.quote)}</blockquote>` : ''}<p>${escapeHtml(note.thought || '（仅划线）')}</p><footer><span>${escapeHtml(note.chapter || '六祖坛经')} · ${escapeHtml(note.page || '')}${timeLabel ? ` · ${escapeHtml(timeLabel)}` : ''}</span><span class="note-card-actions"><button class="note-locate" type="button">原文</button><button class="note-edit" type="button">编辑</button><button class="note-delete" type="button">删除</button></span></footer>`;
      article.querySelector('.note-locate')?.addEventListener('click', () => goToReaderNote(note));
      article.querySelector('.note-edit')?.addEventListener('click', () => editReaderNote(note));
      article.querySelector('.note-delete')?.addEventListener('click', () => {
        if (!window.confirm('确定删除这条笔记吗？')) return;
        const next = loadReaderNotes().filter((item) => item.id !== note.id);
        storeReaderNotes(next);
        if (editingNoteID === note.id) resetNoteComposer();
        setNotesStatus('笔记已删除');
        renderReaderNotes();
        applyReaderNoteHighlights();
        syncNativePageCurl();
      });
      notesList.appendChild(article);
    });
  }

  function openNotesPanel() {
    closeSidePanel();
    closeSettingsPanel();
    closeLighthousePanel();
    closeLibraryPanel();
    const incomingSelection = window.__tanJingPendingSelection || captureNoteSelection();
    window.__tanJingPendingSelection = null;
    if (incomingSelection.quote) {
      pendingNoteSelection = incomingSelection;
      editingNoteID = '';
      noteComposerDraft = null;
      if (notesThought) notesThought.value = '';
    } else if (noteComposerDraft) {
      pendingNoteSelection = noteComposerDraft.selection;
      editingNoteID = noteComposerDraft.editingNoteID;
      if (notesThought) notesThought.value = noteComposerDraft.thought;
    } else {
      pendingNoteSelection = incomingSelection;
      editingNoteID = '';
      if (notesThought) notesThought.value = '';
    }
    if (notesSelection) {
      notesSelection.textContent = pendingNoteSelection.quote;
      notesSelection.hidden = !pendingNoteSelection.quote;
    }
    setNotesStatus('');
    updateNotesComposer();
    renderReaderNotes();
    showAnimatedPanel(notesPanel);
    if (panelOverlay) panelOverlay.hidden = false;
    notesBtn?.classList.add('active');
    document.body.classList.add('reader-panel-open');
    if (isMobileReader()) setReaderChromeVisible(true);
  }

  function closeNotesPanel() {
    const thought = notesThought?.value || '';
    noteComposerDraft = thought.trim() || editingNoteID
      ? { thought, editingNoteID, selection: { ...pendingNoteSelection } }
      : null;
    hideAnimatedPanel(notesPanel);
    notesBtn?.classList.remove('active');
  }

  function toggleNotesPanel() {
    if (notesPanel && !notesPanel.hidden && notesPanel.classList.contains('open')) {
      closeNotesPanel();
      if (panelOverlay) panelOverlay.hidden = true;
      document.body.classList.remove('reader-panel-open');
      return;
    }
    openNotesPanel();
  }

  function saveReaderNote() {
    const thought = notesThought?.value.trim() || '';
    if (!pendingNoteSelection.quote && !thought) return;
    if (Array.from(thought).length > 500) {
      setNotesStatus('笔记内容需在 500 字以内');
      return;
    }
    const notes = loadReaderNotes();
    const now = new Date().toISOString();
    if (editingNoteID) {
      const index = notes.findIndex(note => note.id === editingNoteID);
      if (index >= 0) notes[index] = { ...notes[index], quote: pendingNoteSelection.quote, paragraphID: pendingNoteSelection.paragraphID, thought, updatedAt: now };
    } else {
      notes.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        quote: pendingNoteSelection.quote,
        paragraphID: pendingNoteSelection.paragraphID,
        thought,
        chapter: currentReaderTitle,
        page: currentReaderPageLabel,
        createdAt: now
      });
    }
    if (!storeReaderNotes(notes)) {
      setNotesStatus('保存失败，请检查浏览器存储权限');
      return;
    }
    noteComposerDraft = null;
    if (notesThought) notesThought.value = '';
    const wasEditing = Boolean(editingNoteID);
    editingNoteID = '';
    pendingNoteSelection = { quote: '', paragraphID: pendingNoteSelection.paragraphID };
    if (notesSelection) {
      notesSelection.textContent = '';
      notesSelection.hidden = true;
    }
    setNotesStatus(wasEditing ? '修改已保存' : '笔记已保存');
    updateNotesComposer();
    renderReaderNotes();
    applyReaderNoteHighlights();
    syncNativePageCurl();
  }

  const READER_ROUTE_TRANSITION_MS = 420;
  let libraryRouteTimer = 0;

  function clearLibraryRouteClasses() {
    document.body.classList.remove(
      'reader-route-transition',
      'reader-route-back-active',
      'reader-route-forward',
      'reader-route-forward-active'
    );
  }

  function openLibraryPanel(animated = true) {
    closeSidePanel();
    closeSettingsPanel();
    closeLighthousePanel();
    closeNotesPanel();
    if (!libraryPanel) return;
    if (libraryRouteTimer) clearTimeout(libraryRouteTimer);
    if (libraryPanel._hideTimer) clearTimeout(libraryPanel._hideTimer);
    libraryPanel.hidden = false;
    setAppScreen('library');
    if (panelOverlay) panelOverlay.hidden = true;
    document.body.classList.add('reader-panel-open');
    if (libraryBtn) libraryBtn.classList.add('active');
    nativeUIHandler()?.postMessage({ libraryVisible: true, chromeVisible: false });
    if (isMobileReader()) setReaderChromeVisible(false);

    if (!animated || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      clearLibraryRouteClasses();
      libraryPanel.classList.add('open');
      document.body.classList.add('library-home-open');
      return;
    }

    // 先保留阅读正文作为退场页，再让书架从左侧覆盖进来。
    document.body.classList.remove('library-home-open');
    clearLibraryRouteClasses();
    document.body.classList.add('reader-route-transition');
    void libraryPanel.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      libraryPanel.classList.add('open');
      document.body.classList.add('reader-route-back-active');
    }));

    libraryRouteTimer = setTimeout(() => {
      document.body.classList.add('library-home-open');
      clearLibraryRouteClasses();
      libraryRouteTimer = 0;
    }, READER_ROUTE_TRANSITION_MS);
  }

  function closeLibraryPanel() {
    if (libraryRouteTimer) clearTimeout(libraryRouteTimer);
    libraryRouteTimer = 0;
    clearLibraryRouteClasses();
    if (libraryPanel) {
      libraryPanel.classList.remove('open');
      libraryPanel.hidden = true;
    }
    document.body.classList.remove('library-home-open');
    if (libraryBtn) libraryBtn.classList.remove('active');
    nativeUIHandler()?.postMessage({ libraryVisible: false, chromeVisible: false });
  }

  function makeBookOpeningTransition(sourceBook) {
    const cover = sourceBook?.querySelector('.library-book-cover');
    if (!cover) return null;

    const rect = cover.getBoundingClientRect();
    const nativeHandler = nativeUIHandler();
    if (nativeHandler) {
      nativeHandler.postMessage({
        bookOpening: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          duration: 0.92
        }
      });
      return {
        duration: 920,
        cleanup() {}
      };
    }

    // 非 iOS 26 的最小兜底；原生环境不会执行这段动画。
    if (typeof cover.animate !== 'function') return null;
    const clone = cover.cloneNode(true);
    clone.classList.add('library-book-opening-cover');
    Object.assign(clone.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    document.body.appendChild(clone);
    sourceBook.classList.add('is-opening');

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scale = Math.max(viewportWidth / rect.width, viewportHeight / rect.height) * 1.08;
    const moveX = viewportWidth / 2 - (rect.left + rect.width / 2);
    const moveY = viewportHeight / 2 - (rect.top + rect.height / 2);
    const animation = clone.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      { transform: `translate3d(${moveX}px, ${moveY}px, 0) scale(${scale})`, opacity: 0 }
    ], {
      duration: 640,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards'
    });

    return {
      duration: 640,
      cleanup() {
        animation.cancel();
        clone.remove();
        sourceBook.classList.remove('is-opening');
      }
    };
  }

  function enterReaderFromLibrary(sourceBook = null) {
    if (!libraryPanel) return;
    if (libraryRouteTimer) clearTimeout(libraryRouteTimer);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bookOpening = reduceMotion ? null : makeBookOpeningTransition(sourceBook);
    const transitionDuration = bookOpening?.duration || READER_ROUTE_TRANSITION_MS;

    // 阅读页从右侧进入；动画结束前仍保持原生阅读容器暂停，避免中途闪现。
    document.body.classList.remove('library-home-open');
    setAppScreen('reader');
    clearLibraryRouteClasses();
    document.body.classList.add('reader-route-transition', 'reader-route-forward');
    void libraryPanel.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // 封面先向用户靠近，再让书架退场，避免看到页面突然替换。
      setTimeout(() => libraryPanel.classList.remove('open'), bookOpening ? 120 : 0);
      document.body.classList.add('reader-route-forward-active');
    }));

    libraryRouteTimer = setTimeout(() => {
      libraryPanel.hidden = true;
      clearLibraryRouteClasses();
      document.body.classList.remove('reader-panel-open');
      if (libraryBtn) libraryBtn.classList.remove('active');
      if (panelOverlay) panelOverlay.hidden = true;
      window.__tanJingNativeSelectedIndex = -1;
      nativeUIHandler()?.postMessage({ selectedIndex: -1, libraryVisible: false, chromeVisible: false });
      postNativePageCurlVisibility();
      if (isMobileReader()) setReaderChromeVisible(false);
      bookOpening?.cleanup();
      libraryRouteTimer = 0;
    }, transitionDuration);
  }

  function toggleLibraryPanel() {
    openLibraryPanel();
  }

  libraryPanel?.querySelector('[data-book="tanjing"]')?.addEventListener('click', (event) => {
    enterReaderFromLibrary(event.currentTarget);
  });

  const libraryShelf = libraryPanel?.querySelector('.library-shelf');
  const libraryHeader = libraryPanel?.querySelector('.library-home-header');
  const libraryLighthouseView = libraryPanel?.querySelector('.library-lighthouse-view');
  const librarySearchView = libraryPanel?.querySelector('.library-search-view');
  const libraryBooksTab = document.getElementById('library-home-books');
  const libraryLighthouseTab = document.getElementById('library-home-lighthouse');
  const librarySearchButton = document.getElementById('library-home-search');
  const librarySearchDock = libraryPanel?.querySelector('.library-search-dock');
  const librarySearchInput = document.getElementById('library-search-input');
  const librarySearchBack = document.getElementById('library-search-back');
  const librarySearchClose = document.getElementById('library-search-close');
  const librarySearchResults = document.getElementById('library-search-results');
  const libraryAddBook = document.getElementById('library-add-book');
  const cloudLibraryPanel = document.getElementById('cloud-library-panel');
  const cloudLibraryClose = document.getElementById('cloud-library-close');
  const cloudLibrarySearchInput = document.getElementById('cloud-library-search-input');
  const cloudLibraryList = document.getElementById('cloud-library-list');
  const cloudLibraryStatus = document.getElementById('cloud-library-status');
  const cloudLibrarySelection = document.getElementById('cloud-library-selection');
  const cloudLibraryDownload = document.getElementById('cloud-library-download');
  const CLOUD_SUTRA_CATALOG_URL = 'data/cloud_sutra_catalog.json';
  let cloudCatalog = [];
  let cloudCatalogLoaded = false;
  const selectedCloudBooks = new Set();
  const libraryBooks = [
    { title: '六祖坛经', pinyin: 'liuzutanjing', initials: 'lztj', available: true },
    { title: '心经', aliases: '般若波罗蜜多心经', pinyin: 'xinjing boreboluomiduoxinjing', initials: 'xj brblmdxj', available: false },
    { title: '大乘起信论', pinyin: 'dashengqixinlun', initials: 'dsqxl', available: false },
    { title: '华严经', aliases: '大方广佛华严经 梵行品 净行品 普贤行愿品', pinyin: 'huayanjing dafangguangfohuayanjing', initials: 'hyj dfgfhyj', available: false },
    { title: '圆觉经', aliases: '大方广圆觉修多罗了义经', pinyin: 'yuanjuejing', initials: 'yjj', available: false },
    { title: '楞严经', aliases: '大佛顶首楞严经', pinyin: 'lengyanjing', initials: 'lyj', available: false },
    { title: '地藏经', aliases: '地藏菩萨本愿经', pinyin: 'dizangjing', initials: 'dzj', available: false },
    { title: '阿弥陀经', aliases: '佛说阿弥陀经', pinyin: 'amituojing', initials: 'amtj', available: false },
    { title: '无量寿经', aliases: '佛说无量寿经', pinyin: 'wuliangshoujing', initials: 'wlsj', available: false },
    { title: '金刚经', aliases: '金刚般若波罗蜜经', pinyin: 'jingangjing', initials: 'jgj', available: false },
    { title: '法华经', aliases: '妙法莲华经', pinyin: 'fahuajing miaofalianhuajing', initials: 'fhj mflhj', available: false }
  ];

  function normalizeBookQuery(value) {
    return value.trim().toLowerCase().replace(/\s+/g, '');
  }

  function updateCloudSelection() {
    const count = selectedCloudBooks.size;
    if (cloudLibrarySelection) cloudLibrarySelection.textContent = count ? `已选择 ${count} 本` : '未选择经书';
    if (cloudLibraryDownload) cloudLibraryDownload.disabled = count === 0;
  }

  function renderCloudCatalog(query = '') {
    if (!cloudLibraryList) return;
    const normalized = normalizeBookQuery(query);
    const books = cloudCatalog
      .filter((book) => {
        if (!normalized) return true;
        return normalizeBookQuery(book.title).includes(normalized) ||
          normalizeBookQuery(book.shortTitle || '').includes(normalized) ||
          normalizeBookQuery(book.pinyin || '').includes(normalized) ||
          normalizeBookQuery(book.initials || '').includes(normalized);
      })
      .sort((a, b) => String(a.pinyin || '').localeCompare(String(b.pinyin || ''), 'en'));

    cloudLibraryList.innerHTML = '';
    books.forEach((book) => {
      const label = document.createElement('label');
      label.className = 'cloud-library-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedCloudBooks.has(book.id);
      checkbox.setAttribute('aria-label', `选择${book.title}`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedCloudBooks.add(book.id);
        else selectedCloudBooks.delete(book.id);
        updateCloudSelection();
      });
      const copy = document.createElement('span');
      copy.className = 'cloud-library-copy';
      copy.innerHTML = `<strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.pinyin || '')}</small>`;
      const size = document.createElement('span');
      size.className = 'cloud-library-size';
      size.textContent = book.size || '';
      label.append(checkbox, copy, size);
      cloudLibraryList.appendChild(label);
    });
    if (!books.length) cloudLibraryList.innerHTML = '<p class="cloud-library-status">未找到相关经书</p>';
    if (cloudLibraryStatus) cloudLibraryStatus.textContent = `共 ${books.length} 本 · 按拼音排序`;
  }

  async function loadCloudCatalog() {
    if (cloudCatalogLoaded) return;
    if (cloudLibraryStatus) cloudLibraryStatus.textContent = '正在读取经书目录…';
    try {
      const payload = await fetchJSON(CLOUD_SUTRA_CATALOG_URL, { cache: 'no-cache' });
      cloudCatalog = Array.isArray(payload.books) ? payload.books : [];
      cloudCatalogLoaded = true;
      renderCloudCatalog(cloudLibrarySearchInput?.value || '');
    } catch (error) {
      if (cloudLibraryStatus) cloudLibraryStatus.textContent = '暂时无法连接云端经库，请稍后重试';
      if (cloudLibraryList) cloudLibraryList.innerHTML = '';
    }
  }

  function openCloudLibrary() {
    if (!cloudLibraryPanel) return;
    cloudLibraryPanel.hidden = false;
    document.body.classList.add('reader-panel-open');
    // 云端经库是主页之上的全屏层。保留主页路由状态，只暂时隐藏原生主页底栏，
    // 否则把 libraryVisible 置为 false 会错误地露出阅读页顶部和底部控件。
    nativeUIHandler()?.postMessage({ cloudLibraryVisible: true });
    loadCloudCatalog();
    requestAnimationFrame(() => cloudLibrarySearchInput?.focus({ preventScroll: true }));
  }

  function closeCloudLibrary() {
    if (!cloudLibraryPanel) return;
    cloudLibrarySearchInput?.blur();
    cloudLibraryPanel.hidden = true;
    nativeUIHandler()?.postMessage({ cloudLibraryVisible: false });
    if (libraryPanel && !libraryPanel.hidden) {
      document.body.classList.add('reader-panel-open');
      nativeUIHandler()?.postMessage({ librarySelectedIndex: 0 });
    }
  }

  async function downloadSelectedCloudBooks() {
    const selected = cloudCatalog.filter((book) => selectedCloudBooks.has(book.id));
    const downloadable = selected.filter((book) => book.downloadURL);
    if (!downloadable.length) {
      if (cloudLibraryStatus) cloudLibraryStatus.textContent = '所选经书尚未发布到云端';
      return;
    }
    if (cloudLibraryDownload) cloudLibraryDownload.disabled = true;
    if (cloudLibraryStatus) cloudLibraryStatus.textContent = `正在下载 ${downloadable.length} 本经书…`;
    try {
      const payloads = await Promise.all(downloadable.map(async (book) => {
        return { book, data: await fetchJSON(book.downloadURL) };
      }));
      const failedWrites = payloads.filter(({ book, data }) =>
        !writeStorage(`downloaded_sutra_${book.id}`, JSON.stringify(data))
      );
      if (failedWrites.length) throw new Error('浏览器存储空间不足');
      if (cloudLibraryStatus) cloudLibraryStatus.textContent = `已下载 ${payloads.length} 本经书`;
      selectedCloudBooks.clear();
      updateCloudSelection();
    } catch (error) {
      if (cloudLibraryStatus) cloudLibraryStatus.textContent = '下载失败，请检查网络后重试';
    } finally {
      if (cloudLibraryDownload) cloudLibraryDownload.disabled = selectedCloudBooks.size === 0;
    }
  }

  function showLibrarySection(section) {
    const searching = section === 'search';
    if (libraryHeader) libraryHeader.hidden = searching;
    if (libraryShelf) libraryShelf.hidden = section !== 'books';
    if (libraryLighthouseView) libraryLighthouseView.hidden = section !== 'lighthouse';
    if (librarySearchView) librarySearchView.hidden = !searching;
    libraryBooksTab?.classList.toggle('is-active', section === 'books');
    libraryLighthouseTab?.classList.toggle('is-active', section === 'lighthouse');
    const libraryNav = libraryPanel?.querySelector('.library-home-nav-main');
    libraryNav?.style.setProperty('--library-index', section === 'lighthouse' ? '1' : '0');
    libraryNav?.classList.toggle('has-selection', !searching);
    libraryPanel?.classList.toggle('is-searching', searching);
    if (librarySearchDock) librarySearchDock.hidden = !searching;
    if (librarySearchButton) librarySearchButton.hidden = searching;
    const main = libraryPanel?.querySelector('.library-home-nav-main');
    if (main) main.hidden = searching;
    nativeUIHandler()?.postMessage({
      librarySelectedIndex: section === 'books' ? 0 : section === 'lighthouse' ? 1 : 2
    });
  }

  function renderLibrarySearch(query) {
    if (!librarySearchResults || !librarySearchView) return;
    const normalized = query.trim().toLowerCase().replace(/\s+/g, '');
    const empty = librarySearchView.querySelector('.library-search-empty');
    const matches = normalized
      ? libraryBooks.filter(book => book.title.includes(query.trim()) || book.aliases?.includes(query.trim()) || book.pinyin.includes(normalized) || book.initials.includes(normalized))
      : [];
    if (empty) empty.hidden = normalized.length > 0;
    librarySearchResults.innerHTML = '';
    matches.forEach(book => {
      const item = document.createElement('button');
      item.type = 'button';
      item.disabled = !book.available;
      item.innerHTML = `<strong>${book.title}</strong><small>${book.available ? '进入阅读' : '待上架'}</small>`;
      if (book.available) item.addEventListener('click', () => libraryPanel?.querySelector('[data-book="tanjing"]')?.click());
      librarySearchResults.appendChild(item);
    });
    if (normalized && !matches.length) librarySearchResults.innerHTML = '<p>未找到相关典籍</p>';
  }

  libraryBooksTab?.addEventListener('click', () => showLibrarySection('books'));
  libraryLighthouseTab?.addEventListener('click', () => showLibrarySection('lighthouse'));
  librarySearchButton?.addEventListener('click', () => {
    showLibrarySection('search');
    renderLibrarySearch('');
    requestAnimationFrame(() => {
      try { librarySearchInput?.focus({ preventScroll: true }); } catch (_) { librarySearchInput?.focus(); }
    });
  });
  librarySearchInput?.addEventListener('input', () => renderLibrarySearch(librarySearchInput.value));
  libraryAddBook?.addEventListener('click', openCloudLibrary);
  cloudLibraryClose?.addEventListener('click', closeCloudLibrary);
  cloudLibrarySearchInput?.addEventListener('input', () => renderCloudCatalog(cloudLibrarySearchInput.value));
  cloudLibraryDownload?.addEventListener('click', downloadSelectedCloudBooks);
  librarySearchBack?.addEventListener('click', () => {
    librarySearchInput?.blur();
    showLibrarySection('books');
  });
  librarySearchClose?.addEventListener('click', () => {
    if (librarySearchInput) librarySearchInput.value = '';
    librarySearchInput?.blur();
    showLibrarySection('books');
  });

  document.getElementById('reader-mobile-search')?.addEventListener('click', () => {
    document.getElementById('search-btn')?.click();
  });

  // Settings defaults
  const FONT_MIN = 16;
  const FONT_MAX = 28;
  const FONT_STEP = 2;
  const LINE_HEIGHT_MIN = 1.3;
  const LINE_HEIGHT_MAX = 2.1;
  const LINE_HEIGHT_STEP = 0.2;
  const DEFAULT_FONT_PX = 18;
  const DEFAULT_LINE_HEIGHT = 1.9;
  let readerLayoutTimer = null;

  function scheduleReaderRepagination() {
    if (!_hasRendered) return;
    clearTimeout(readerLayoutTimer);
    // 合并连续滑动输入，只做一次现有 DOM 的分页回流。
    readerLayoutTimer = setTimeout(repaginateReaderLayout, 180);
  }

  function normalizedFontSize(value) {
    const numeric = Number.isFinite(value) ? value : DEFAULT_FONT_PX;
    return Math.min(FONT_MAX, Math.max(FONT_MIN, FONT_MIN + Math.round((numeric - FONT_MIN) / FONT_STEP) * FONT_STEP));
  }

  function normalizedLineHeight(value) {
    const numeric = Number.isFinite(value) ? value : DEFAULT_LINE_HEIGHT;
    const snapped = LINE_HEIGHT_MIN + Math.round((numeric - LINE_HEIGHT_MIN) / LINE_HEIGHT_STEP) * LINE_HEIGHT_STEP;
    return Number(Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, snapped)).toFixed(1));
  }

  function applySettings(fontPx, lineHeight) {
    fontPx = normalizedFontSize(fontPx);
    lineHeight = normalizedLineHeight(lineHeight);
    const rootStyle = getComputedStyle(document.documentElement);
    const oldFontPx = parseFloat(rootStyle.getPropertyValue('--reader-font-size'));
    const oldLineHeight = parseFloat(rootStyle.getPropertyValue('--reader-line-height'));
    const layoutChanged = oldFontPx !== fontPx || oldLineHeight !== lineHeight;
    document.documentElement.style.setProperty('--reader-font-size', fontPx + 'px');
    document.documentElement.style.setProperty('--reader-line-height', lineHeight);
    try { localStorage.setItem('ui_font_px', fontPx.toString()); localStorage.setItem('ui_line_height', lineHeight.toString()); } catch(e){}
    if (fontSizeValue) fontSizeValue.textContent = fontPx.toString();
    if (lineHeightValue) lineHeightValue.textContent = '行距';
    if (fontSizeRange) fontSizeRange.value = fontPx;
    if (lineHeightRange) lineHeightRange.value = lineHeight;
    if (settingsPanel) {
      settingsPanel.style.setProperty('--font-range-position', (((fontPx - FONT_MIN) / (FONT_MAX - FONT_MIN)) * 100) + '%');
      settingsPanel.style.setProperty('--line-range-position', (((lineHeight - LINE_HEIGHT_MIN) / (LINE_HEIGHT_MAX - LINE_HEIGHT_MIN)) * 100) + '%');
    }
    if (layoutChanged) scheduleReaderRepagination();
  }

  // initialize from storage
  (function initSettings() {
    let f = DEFAULT_FONT_PX, lh = DEFAULT_LINE_HEIGHT;
    try { const sf = localStorage.getItem('ui_font_px'); const sl = localStorage.getItem('ui_line_height'); if (sf) f = parseInt(sf,10); if (sl) lh = parseFloat(sl); } catch(e){}
    applySettings(f, lh);
  })();

  // initialize display mode and wire selector
  initDisplayMode();
  const displaySelect = document.getElementById('display-mode-select');
  if (displaySelect) {
    displaySelect.value = displayMode;
    displaySelect.addEventListener('change', () => applyDisplayMode(displaySelect.value));
  }

  // font selector wiring
  // 菜单必须脱离带 backdrop-filter/overflow 的设置面板；否则 WKWebView 会把 fixed 子层裁掉。
  if (fontCustomMenu && fontCustomMenu.parentElement !== document.body) {
    document.body.appendChild(fontCustomMenu);
  }

  // 在浏览器空闲时预热菜单中会用到的少量字形，避免首次点击才解析字体。
  const warmFontMenuPreviews = () => {
    if (!document.fonts?.load) return;
    document.fonts.load('19px "LXGW WenKai"', '霞鹜文楷').catch(() => {});
    document.fonts.load('19px "Noto Serif SC"', '思源宋体').catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmFontMenuPreviews, { timeout: 1200 });
  } else {
    setTimeout(warmFontMenuPreviews, 200);
  }

  try {
    const storedFont = localStorage.getItem('ui_font_family');
    if (fontSelect) {
      const syncFontChoicePreview = () => {
        const option = fontSelect.options[fontSelect.selectedIndex];
        const family = option?.value || "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
        fontSelect.style.fontFamily = family;
        fontCustomMenu?.querySelectorAll('.font-menu-option').forEach((item, index) => {
          const selected = index === fontSelect.selectedIndex;
          item.classList.toggle('is-selected', selected);
          item.setAttribute('aria-checked', selected ? 'true' : 'false');
        });
      };
      if (storedFont) {
        fontSelect.value = storedFont;
        if (fontSelect.selectedIndex < 0) {
          if (storedFont.includes('PingFang SC')) fontSelect.selectedIndex = 0;
          else if (storedFont.includes('LXGW WenKai')) fontSelect.selectedIndex = 1;
          else fontSelect.selectedIndex = 2;
          document.documentElement.style.setProperty('--reader-font-family', fontSelect.value);
          try { localStorage.setItem('ui_font_family', fontSelect.value); } catch(e){}
        }
      }
      syncFontChoicePreview();
      fontSelect.addEventListener('change', () => {
        const val = fontSelect.value;
        document.documentElement.style.setProperty('--reader-font-family', val);
        try { localStorage.setItem('ui_font_family', val); } catch(e){}
        syncFontChoicePreview();
        scheduleReaderRepagination();
      });
      // apply stored value on init
      if (storedFont) document.documentElement.style.setProperty('--reader-font-family', storedFont);
    }
  } catch(e) {}

  fontMenuTrigger?.addEventListener('click', () => {
    const willOpen = fontCustomMenu?.hidden ?? true;
    if (fontCustomMenu) fontCustomMenu.hidden = !willOpen;
    fontMenuTrigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });
  fontCustomMenu?.querySelectorAll('.font-menu-option').forEach(item => {
    item.addEventListener('click', () => {
      const index = Number(item.dataset.fontIndex);
      if (!fontSelect || !Number.isInteger(index)) return;
      fontSelect.selectedIndex = index;
      fontSelect.dispatchEvent(new Event('change', { bubbles: true }));
      fontCustomMenu.hidden = true;
      fontMenuTrigger?.setAttribute('aria-expanded', 'false');
    });
  });

  // settings UI wiring
  if (settingsBtn) settingsBtn.addEventListener('click', toggleSettingsPanel);
  // mobile side-panel no longer has a separate settings button
  if (settingsBack) settingsBack.addEventListener('click', () => {
    closeSettingsPanel();
    document.body.classList.remove('reader-panel-open');
    if (panelOverlay) panelOverlay.hidden = true;
    if (isMobileReader()) setReaderChromeVisible(true);
  });

  if (fontSizeRange) {
    fontSizeRange.addEventListener('input', () => applySettings(parseInt(fontSizeRange.value,10), parseFloat(lineHeightRange.value||DEFAULT_LINE_HEIGHT)));
  }
  if (lineHeightRange) {
    lineHeightRange.addEventListener('input', () => applySettings(parseInt(fontSizeRange.value||DEFAULT_FONT_PX,10), parseFloat(lineHeightRange.value)));
  }
  if (fontSizeDecr) fontSizeDecr.addEventListener('click', () => applySettings(parseInt(fontSizeRange.value||DEFAULT_FONT_PX,10) - FONT_STEP, parseFloat(lineHeightRange.value||DEFAULT_LINE_HEIGHT)));
  if (fontSizeIncr) fontSizeIncr.addEventListener('click', () => applySettings(parseInt(fontSizeRange.value||DEFAULT_FONT_PX,10) + FONT_STEP, parseFloat(lineHeightRange.value||DEFAULT_LINE_HEIGHT)));
  if (lineHeightDecr) lineHeightDecr.addEventListener('click', () => applySettings(parseInt(fontSizeRange.value||DEFAULT_FONT_PX,10), parseFloat(lineHeightRange.value||DEFAULT_LINE_HEIGHT) - LINE_HEIGHT_STEP));
  if (lineHeightIncr) lineHeightIncr.addEventListener('click', () => applySettings(parseInt(fontSizeRange.value||DEFAULT_FONT_PX,10), parseFloat(lineHeightRange.value||DEFAULT_LINE_HEIGHT) + LINE_HEIGHT_STEP));

  if (topSettingsBtn) topSettingsBtn.addEventListener('click', toggleSettingsPanel);

  // Traditional UI toggle wiring
  try {
    const tradControl = document.getElementById('setting-traditional-mode');
    if (tradControl) {
      let initial = false;
      try { initial = (localStorage.getItem('ui_traditional') === '1'); } catch(e){}
      tradControl.setAttribute('aria-pressed', initial ? 'true' : 'false');
      tradControl.classList.toggle('is-active', initial);
      tradControl.addEventListener('click', () => {
        const v = tradControl.getAttribute('aria-pressed') !== 'true';
        tradControl.setAttribute('aria-pressed', v ? 'true' : 'false');
        tradControl.classList.toggle('is-active', v);
        try { localStorage.setItem('ui_traditional', v ? '1' : '0'); } catch(e){}
        applyUILanguage(v);
      });
    }
  } catch(e) {}

  function focusSearchInput(selectText = false) {
    const focus = () => {
      try {
        input.focus({ preventScroll: true });
        if (selectText) input.select();
      } catch(e) {
        input.focus();
      }
    };
    // 必须在点击事件的调用栈内立即 focus，iOS 才会把它识别为用户触发并弹出键盘。
    focus();
    // 转场可能短暂转移焦点；下一帧仅作一次无动画兜底。
    requestAnimationFrame(() => {
      if (document.activeElement !== input) focus();
    });
  }

  function openPanel() {
    const topbarSearchRow = document.getElementById('topbar-search-row');
    topbarEl.classList.add('searching');
    document.body.classList.add('reader-search-open');
    topbarEl.classList.remove('search-compact');
    if (topbarSearchRow) topbarSearchRow.hidden = false;
    if (compactBtn) compactBtn.hidden = true;
    if (searchHistory) searchHistory.hidden = false;
    if (searchOverlay) searchOverlay.hidden = false;
    panel.hidden = true;
    renderSearchHistory();
    if (isMobileReader()) setReaderChromeVisible(false);
    focusSearchInput(false);
  }

  function expandSearch() {
    topbarEl.classList.remove('search-compact');
    if (compactBtn) compactBtn.hidden = true;
    if (searchHistory) searchHistory.hidden = false;
    panel.hidden = true;
    renderSearchHistory();
    focusSearchInput(true);
  }

  function commitSearch(query) {
    const normalized = query.trim();
    if (!normalized) return;
    storeSearchHistory(normalized);
    renderSearchHistory();
    topbarEl.classList.add('search-compact');
    if (searchHistory) searchHistory.hidden = true;
    if (compactBtn) compactBtn.hidden = false;
    try { input.blur(); } catch(e) {}
    doSearch(normalized);
  }

  function closePanel() {
    clearTimeout(debounceTimer);
    const topbarSearchRow = document.getElementById('topbar-search-row');
    topbarEl.classList.remove('searching', 'search-compact');
    document.body.classList.remove('reader-search-open');
    if (topbarSearchRow) topbarSearchRow.hidden = true;
    if (compactBtn) compactBtn.hidden = true;
    if (searchHistory) searchHistory.hidden = true;
    if (searchOverlay) searchOverlay.hidden = true;
    panel.hidden = true;
    clearSearchHighlights();
    try { input.blur(); } catch(e) {}
    try { if (mobileInput) mobileInput.blur(); } catch(e) {}
    // 等待 iOS 收起键盘后再清理残余焦点；不改 window/经文滚动位置。
    setTimeout(() => {
      try {
        const active = document.activeElement;
        if (active && active !== document.body) active.blur();
      } catch(e) {}
    }, 120);
    if (isMobileReader()) setReaderChromeVisible(true);
  }

  btn.addEventListener('click', () => {
    topbarEl.classList.contains('searching') ? closePanel() : openPanel();
  });

  closeBtn.addEventListener('click', closePanel);
  if (compactBtn) compactBtn.addEventListener('click', expandSearch);
  if (searchOverlay) searchOverlay.addEventListener('pointerdown', closePanel);
  if (searchHistoryClear) {
    searchHistoryClear.addEventListener('click', () => {
      try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch(e) {}
      renderSearchHistory();
    });
  }

  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitSearch(input.value);
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      openPanel();
      input.select();
    }
    if (e.key === 'Escape' && topbarEl.classList.contains('searching')) {
      closePanel();
    }
  });

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    // iPhone 上由键盘“搜索”明确提交，避免输入时结果层盖住搜索框和历史。
    if (isMobileReader()) {
      panel.hidden = true;
      return;
    }
    debounceTimer = setTimeout(() => doSearch(input.value.trim()), 150);
  });

  // Mobile input mirrors desktop search
  if (mobileInput) {
    mobileInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        doSearch(mobileInput.value.trim());
        // sync mobile result list and show overlayed results area
        if (mobileResults) {
          mobileResults.innerHTML = resultsList.innerHTML;
          mobileCount.textContent = countLabel.textContent;
          mobileResults.classList.add('visible');
          // attach click handlers that read data-payload
          mobileResults.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => {
              const payload = li.getAttribute('data-payload');
              if (!payload) return;
              try { const r = JSON.parse(decodeURIComponent(payload)); navigateToResult(r); } catch(e){}
              if (mobilePanel) { mobilePanel.classList.remove('open'); mobilePanel.hidden = true; if (panelOverlay) panelOverlay.hidden = true; }
              const sh = document.getElementById('side-handle'); if (sh) sh.hidden = false;
            });
          });
        }
      }, 150);
    });
  }

  function doSearch(query) {
    resultsList.innerHTML = '';
    countLabel.textContent = '';
    if (!query) {
      panel.hidden = true;
      panel.classList.remove('is-empty-results');
      // hide mobile overlay results when query cleared
      if (mobileResults) { mobileResults.innerHTML = ''; mobileResults.classList.remove('visible'); mobileCount.textContent = ''; }
      return;
    }

    // 两种字形都参与搜索：宗宝本以简体保存，敦煌本仍兼容繁体数据。
    const sQuery = toSimplified(query);
    const tQuery = toTraditional(query);
    const queries = Array.from(new Set([query, sQuery, tQuery]));

    const results = [];
    const seen = new Set(); // 去重

    // 始终搜索完整原文；拼音懒加载窗口不应限制可搜索范围。
    // 敦煌本仅在对照模式渲染时加入，避免返回点击后不存在的结果。
    const dataSources = [{ data: window._zongbaoRaw || sutraData, label: '宗宝本' }];
    if (compareMode && (window._dunhuangRaw || dunhuangData)) {
      dataSources.push({ data: window._dunhuangRaw || dunhuangData, label: '敦煌本' });
    }

    for (const q of queries) {
      for (const src of dataSources) {
        src.data.chapters.forEach(chapter => {
          chapter.paragraphs.forEach(para => {
            const searchableText = readerParagraphText(para);
            let idx = 0;
            while ((idx = searchableText.indexOf(q, idx)) !== -1) {
              const key = `${src.label}:${para.id}:${idx}`;
              if (seen.has(key)) { idx += q.length; continue; }
              seen.add(key);
              const ctxStart = Math.max(0, idx - 25);
              const ctxEnd = Math.min(searchableText.length, idx + q.length + 25);
              const before = (ctxStart > 0 ? '…' : '') + searchableText.slice(ctxStart, idx);
              const match = searchableText.slice(idx, idx + q.length);
              const after = searchableText.slice(idx + q.length, ctxEnd) + (ctxEnd < searchableText.length ? '…' : '');
              results.push({
                chapterTitle: readerChapterTitle(chapter),
                paraId: para.id,
                matchIndex: idx,
                before, match, after,
                query: q,
                edition: src.label,
              });
              idx += q.length;
            }
          });
        });
      }
    }

    countLabel.textContent = results.length > 0 ? `${results.length} 处` : '无结果';

    // 非空查询即显示结果面板；“无结果”也必须给用户明确反馈，不能只剩遮罩。
    panel.hidden = false;
    panel.classList.toggle('is-empty-results', results.length === 0);

    if (results.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'search-no-results';
      empty.textContent = `未找到“${query}”`;
      empty.setAttribute('aria-live', 'polite');
      resultsList.appendChild(empty);
    }

    results.slice(0, 100).forEach(r => {
      const li = document.createElement('li');
      const edLabel = r.edition !== '宗宝本' ? `<span style="font-size:0.7rem;color:var(--ink-light);margin-left:0.4em">${escapeHtml(r.edition)}</span>` : '';
      li.innerHTML =
        `<div class="result-chapter">${escapeHtml(r.chapterTitle)}${edLabel}</div>` +
        `<div>${escapeHtml(r.before)}<mark>${escapeHtml(r.match)}</mark>${escapeHtml(r.after)}</div>`;
      // attach desktop click handler
      li.addEventListener('click', () => navigateToResult(r));
      // store payload for cloned mobile list
      try { li.setAttribute('data-payload', encodeURIComponent(JSON.stringify(r))); } catch(e){}
      resultsList.appendChild(li);
    });

    // sync to mobile panel if present
    if (mobileResults) {
      mobileResults.innerHTML = resultsList.innerHTML;
      mobileCount.textContent = countLabel.textContent;
      mobileResults.classList.add('visible');
      mobileResults.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
          const payload = li.getAttribute('data-payload');
          if (!payload) return;
          try { const r = JSON.parse(decodeURIComponent(payload)); navigateToResult(r); } catch(e){}
          if (mobilePanel) { mobilePanel.classList.remove('open'); mobilePanel.hidden = true; if (panelOverlay) panelOverlay.hidden = true; }
          const sh = document.getElementById('side-handle'); if (sh) sh.hidden = false;
        });
      });
    }
  }

  // overlay click closes panel
  if (panelOverlay) {
    const closeOverlayPanels = (event) => {
      if (event) event.preventDefault();
      closeSidePanel();
      closeLighthousePanel();
      closeLibraryPanel();
      closeSettingsPanel();
      closeNotesPanel();
      document.body.classList.remove('reader-panel-open');
      panelOverlay.hidden = true;
      if (isMobileReader()) setReaderChromeVisible(true);
      try { if (mobileInput) mobileInput.blur(); } catch(e){}
      setTimeout(() => { try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch(e){} }, 60);
    };
    panelOverlay.addEventListener('pointerdown', closeOverlayPanels, { passive: false });
  }

  // side-handle open (mobile reliable opener)
  const sideHandleEl = document.getElementById('side-handle');
  if (sideHandleEl) {
    // show handle on mobile
    sideHandleEl.hidden = false;
    sideHandleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openSidePanel();
    });
  }

  const mobileTocBtn = document.getElementById('mobile-toc-btn');
  const mobileSettingsBtn = document.getElementById('mobile-settings-btn');
  if (mobileTocBtn && sideHandleEl) {
    mobileTocBtn.addEventListener('click', toggleSidePanel);
  }
  if (mobileSettingsBtn) {
    mobileSettingsBtn.addEventListener('click', toggleSettingsPanel);
  }
  notesBtn?.addEventListener('click', toggleNotesPanel);
  notesSave?.addEventListener('click', saveReaderNote);
  notesThought?.addEventListener('input', () => {
    setNotesStatus('');
    updateNotesComposer();
  });
  notesThought?.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !notesSave?.disabled) {
      event.preventDefault();
      saveReaderNote();
    }
  });
  notesCancelEdit?.addEventListener('click', () => {
    resetNoteComposer();
    setNotesStatus('已取消编辑');
  });
  if (lighthouseBtn && lighthousePanel) {
    lighthouseBtn.addEventListener('click', toggleLighthousePanel);
  }
  const updateLighthouseSubmit = () => {
    if (!lighthouseSubmit) return;
    const hasQuestion = !!lighthouseInput?.value.trim();
    lighthouseSubmit.disabled = !hasQuestion;
    lighthouseSubmit.classList.toggle('is-ready', hasQuestion);
  };
  lighthouseInput?.addEventListener('input', updateLighthouseSubmit);
  updateLighthouseSubmit();
  lighthouseForm?.addEventListener('submit', event => {
    event.preventDefault();
    const question = lighthouseInput?.value.trim() || '';
    if (!question) {
      lighthouseInput?.focus();
      return;
    }
    if (lighthouseStatus) lighthouseStatus.textContent = '灯塔对话能力正在接入';
  });
  if (libraryBtn && libraryPanel) {
    libraryBtn.addEventListener('click', toggleLibraryPanel);
  }

  // App 的首屏是藏经阁主页；阅读页由书架中的已上架典籍进入。
  const initialScreen = (() => {
    try { return localStorage.getItem('tanjing_app_screen'); } catch (_) { return null; }
  })();
  if (initialScreen === 'reader') {
    setAppScreen('reader');
    libraryPanel.hidden = true;
    libraryPanel.classList.remove('open');
    document.body.classList.remove('library-home-open', 'reader-panel-open');
    if (isMobileReader()) setReaderChromeVisible(false);
  } else {
    openLibraryPanel(false);
  }

  function navigateToResult(result) {
    closePanel();

    // 优先匹配版本
    let selector = `.para[data-para="${result.paraId}"]`;
    if (result.edition === '敦煌本') {
      selector = `.para[data-para="${result.paraId}"][data-edition="dh"]`;
    }
    let candidates = Array.from(document.querySelectorAll(selector));
    if (!candidates.length && pinyinMode) {
      // 拼音正文按当前页懒加载；搜索到窗外段落时只扩展到目标附近再渲染。
      pinyinRenderedParagraphIDs = pinyinParagraphWindow(result.paraId, 2);
      render();
      candidates = Array.from(document.querySelectorAll(selector));
    }
    if (!candidates.length) {
      candidates = Array.from(document.querySelectorAll(`.para[data-para="${result.paraId}"]`));
    }
    const matchIndex = Number.isFinite(result.matchIndex) ? result.matchIndex : 0;
    const paraEl = candidates.find(element => {
      const start = Number(element.dataset.sourceStart);
      const end = Number(element.dataset.sourceEnd);
      return Number.isFinite(start) && Number.isFinite(end) && matchIndex >= start && matchIndex < end;
    }) || candidates.find(element => {
      const visibleQuery = useTraditionalContent ? toTraditional(result.query) : toSimplified(result.query);
      return searchableTextInElement(element).includes(visibleQuery);
    }) || candidates[0];
    if (!paraEl) return;

    const fold = paraEl.closest('.fold');
    const reader = document.querySelector('.scroll-container');
    const previousScrollBehavior = reader?.style.scrollBehavior || '';
    if (reader) reader.style.scrollBehavior = 'auto';
    if (displayMode === 'scroll') {
      paraEl.scrollIntoView({ behavior: 'auto', inline: 'nearest', block: 'center' });
    } else if (fold) {
      fold.scrollIntoView({ behavior: 'auto', inline: 'start', block: 'nearest' });
      const pageIndex = reader
        ? Math.max(0, Math.round(reader.scrollLeft / Math.max(1, reader.clientWidth)))
        : 0;
      nativeUIHandler()?.postMessage({ pageCurlCurrentIndex: pageIndex });
    }

    const visibleQuery = useTraditionalContent ? toTraditional(result.query) : toSimplified(result.query);
    requestAnimationFrame(() => {
      if (reader) reader.style.scrollBehavior = previousScrollBehavior;
      highlightInElement(paraEl, visibleQuery);
    });
  }
}

function searchableTextInElement(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text = '';
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('rt')) continue;
    text += node.textContent || '';
  }
  return text;
}

function highlightInElement(el, query) {
  clearSearchHighlights();
  markTextInElement(el, query, 'search-highlight', true);
}

function markTextInElement(el, query, className, firstOnly = true) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    // 拼音 rt 不属于正文搜索字符串，否则每个汉字之间会被注音打断。
    if (node.parentElement?.closest('rt')) continue;
    textNodes.push(node);
  }

  let fullText = '';
  const segments = textNodes.map(node => {
    const start = fullText.length;
    fullText += node.textContent || '';
    return { node, start, end: fullText.length };
  });
  const matchStart = fullText.indexOf(query);
  if (matchStart < 0) return false;
  const matchEnd = matchStart + query.length;

  // 一个词可能横跨术语 span 或多个 ruby；分别包住交叠的文本片段，视觉上仍是连续高亮。
  segments.forEach(({ node, start, end }) => {
    const overlapStart = Math.max(start, matchStart);
    const overlapEnd = Math.min(end, matchEnd);
    if (overlapStart >= overlapEnd) return;
    const range = document.createRange();
    range.setStart(node, overlapStart - start);
    range.setEnd(node, overlapEnd - start);
    const mark = document.createElement('mark');
    mark.className = className;
    range.surroundContents(mark);
  });
  return true;
}

function clearSearchHighlights() {
  document.querySelectorAll('mark.search-highlight').forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}
