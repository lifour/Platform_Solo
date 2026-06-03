/**
 * app.js — 应用入口
 *
 * 导入所有模块并编排初始化流程。
 */
import { store } from './store.js';
import { loadAllData, switchBook } from './data.js';
import { render, rerender } from './render.js';
import { setupScroll, restorePosition, setupNavigation } from './scroll.js';
import { setupSearch } from './search.js';
import {
  initDisplayMode, initCompareMode, initUILanguage,
  setupSettingsPanel,
} from './settings.js';
import { setupTermInteraction } from './tooltip.js';
import { setupToggles } from './toggles.js';
import { setupActionsMenu } from './actions-menu.js';
import { initSelectionToolbar } from './selection-toolbar.js';
import { applyHighlightsToDOM } from './highlight.js';
import { attachAnnotationIndicators } from './annotations.js';
import { loadBookmarks } from './bookmarks.js';
import { showRandomQuote, closeQuoteCard } from './quotes.js';
import { setupReader, stopReading } from './reader.js';
import { updateProgress } from './scroll.js';
import { showAnnotationsPanel } from './annotations.js';
import { showNotesPanel } from './notes.js';
import { getAllNotes } from './db.js';
import { closeLookupPanel } from './external-lookup.js';

/** 跳转到书签位置 */
function jumpToBookmark() {
  window._bookmarkJumped = false;
  try {
    const bookmarks = JSON.parse(localStorage.getItem('sutra_bookmarks_v1') || '[]');
    for (const bm of bookmarks) {
      const fold = document.querySelector(`#${CSS.escape(bm.chapterId)}`);
      if (fold) {
        fold.scrollIntoView({ behavior: 'auto', inline: 'start', block: 'nearest' });
        window._bookmarkJumped = true;
        setTimeout(() => {
          const c = document.querySelector('.scroll-container');
          if (c && store.get('displayMode') === 'scroll') c.scrollTop -= 60;
          updateProgress();
        }, 50);
        break;
      }
    }
  } catch (_) {}
}

async function init() {
  try {
    await loadAllData();

    initDisplayMode();
    initCompareMode();
    initUILanguage();

    // 创建 tooltip 元素
    if (!document.querySelector('.tooltip')) {
      const tooltip = document.createElement('div');
      tooltip.className = 'tooltip';
      tooltip.innerHTML = '<div class="tooltip-term"></div><div class="tooltip-pinyin"></div><div class="tooltip-meaning"></div>';
      document.body.appendChild(tooltip);
    }

    render();

    // 加载书签后立即尝试跳转
    loadBookmarks();
    jumpToBookmark();

    // 恢复已持久化的高亮和标注指示器
    await applyHighlightsToDOM();
    await attachAnnotationIndicators();

    // 如果上面没跳到书签，用保存的位置
    setTimeout(() => {
      if (!window._bookmarkJumped) {
        try {
          const ratio = parseFloat(localStorage.getItem('sutra_scroll_pos'));
          if (!isNaN(ratio) && ratio > 0) {
            const c = document.querySelector('.scroll-container');
            if (c) { c.scrollLeft = ratio * (c.scrollWidth - c.clientWidth); updateProgress(); }
          }
        } catch(_) {}
      }
    }, 500);

    // 事件监听
    setupScroll();
    setupNavigation();
    setupSearch();
    setupToggles();
    setupActionsMenu();
    setupSettingsPanel();
    setupTermInteraction();
    setupReader();
    initSelectionToolbar();

    // 每日一语
    document.getElementById('quote-btn')?.addEventListener('click', showRandomQuote);
    document.getElementById('quote-close')?.addEventListener('click', closeQuoteCard);
    document.getElementById('quote-next')?.addEventListener('click', showRandomQuote);
    document.getElementById('quote-overlay')?.addEventListener('click', closeQuoteCard);

    // 书籍切换（设置面板中）
    async function handleBookSwitch(bookId) {
      stopReading();

      await switchBook(bookId);
      // 更新顶栏标题
      const titles = { tanjing: '六祖坛经', wumenguan: '无门关', wenmingzhiguang: '文明之光' };
      const titleEl = document.getElementById('topbar-title');
      if (titleEl) titleEl.textContent = titles[bookId] || bookId;
      // 更新设置面板下拉同步
      const sel = document.getElementById('book-select');
      if (sel) sel.value = bookId;
      render();
      restorePosition();
      await applyHighlightsToDOM();
      await attachAnnotationIndicators();
    }
    document.getElementById('book-select')?.addEventListener('change', (e) => {
      handleBookSwitch(e.target.value);
    });

    // 查词面板返回按钮
    document.getElementById('annotations-top-btn')?.addEventListener('click', showAnnotationsPanel);
    document.getElementById('notes-top-btn')?.addEventListener('click', showNotesPanel);

    // 笔记导出
    document.getElementById('notes-export-btn')?.addEventListener('click', async () => {
      const notes = await getAllNotes();
      if (!notes || notes.length === 0) return;
      const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `notes_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });

    document.getElementById('notes-back')?.addEventListener('click', () => {
      const panel = document.getElementById('notes-panel');
      if (panel) panel.hidden = true;
    });

    document.getElementById('lookup-back')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeLookupPanel();
    });

    // 全局：点击 settings-panel 外部关闭（排除顶栏按钮）
    document.addEventListener('click', (e) => {
      if (e.target.closest('.topbar-btn, .topbar-nav')) return;
      setTimeout(() => {
        document.querySelectorAll('.settings-panel').forEach(p => {
          if (!p.hidden && !p.contains(e.target)) p.hidden = true;
        });
      }, 80);
    });

    // 模式变更 → 关闭搜索面板 + 重渲染 + 恢复标注
    function onModeChange() {
      // 关闭搜索面板
      const searchRow = document.getElementById('topbar-search-row');
      if (searchRow && !searchRow.hidden) {
        const topbar = document.querySelector('.topbar');
        if (topbar) topbar.classList.remove('searching');
        searchRow.hidden = true;
        searchRow.classList.remove('search-open');
        const panel = document.getElementById('search-panel');
        if (panel) panel.hidden = true;
      }
      rerender();
      reapplyAnnotations();
    }
    store.on('compareMode:changed', onModeChange);
    store.on('pinyinMode:changed', onModeChange);
  } catch (err) {
    console.error('应用初始化失败:', err);
    const container = document.querySelector('.scroll-container');
    if (container) {
      container.innerHTML = '<div class="loading">经文加载失败，请检查 data/ 目录</div>';
    }
  }
}

async function reapplyAnnotations() {
  await applyHighlightsToDOM();
  await attachAnnotationIndicators();
}

document.addEventListener('DOMContentLoaded', init);
