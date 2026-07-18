/**
 * selection-toolbar.js — 划词浮动工具栏
 *
 * 拖拽选中文字后弹出工具栏。
 * 提供：高亮（5 色）、添加笔记、查字功能。
 */

import { HIGHLIGHT_COLORS, createHighlight, clearHighlightsByRange } from './highlight.js';
import { createNote } from './notes.js';
import { lookupCharacter, lookupTerm } from './external-lookup.js';
import { addBookmark, removeBookmark, isBookmarked } from './bookmarks.js';
import { refreshAnnotationsIfOpen } from './annotations.js';
import { readFromParagraph, stopReading, startReading } from './reader.js';

let toolbar = null;
let activePara = null;
let activeRange = null;

const COLOR_LABELS = { yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色', orange: '橙色' };

export function initSelectionToolbar() {
  // 创建工具栏 DOM
  toolbar = document.createElement('div');
  toolbar.id = 'selection-toolbar';
  toolbar.className = 'sel-toolbar';
  toolbar.hidden = true;
  document.body.appendChild(toolbar);

  // 笔记按钮
  const noteBtn = document.createElement('button');
  noteBtn.className = 'sel-action-btn';
  noteBtn.textContent = '笔记';
  noteBtn.addEventListener('click', (e) => { e.stopPropagation(); handleNote(); });
  toolbar.appendChild(noteBtn);

  // 书签按钮
  const bmBtn = document.createElement('button');
  bmBtn.className = 'sel-action-btn';
  bmBtn.id = 'sel-bookmark-btn';
  bmBtn.textContent = '书签';
  bmBtn.addEventListener('click', (e) => { e.stopPropagation(); handleBookmark(); });
  toolbar.appendChild(bmBtn);

  // 查字按钮（仅单汉字时显示）
  const lookupBtn = document.createElement('button');
  lookupBtn.className = 'sel-action-btn';
  lookupBtn.id = 'sel-zdic-btn';
  lookupBtn.textContent = '查词';
  lookupBtn.style.display = 'none';
  lookupBtn.addEventListener('click', (e) => { e.stopPropagation(); handleLookup(); });
  toolbar.appendChild(lookupBtn);

  // 往下读（从选中段落连续朗读）
  const readFromBtn = document.createElement('button');
  readFromBtn.className = 'sel-action-btn';
  readFromBtn.textContent = '往下读';
  readFromBtn.addEventListener('click', (e) => { e.stopPropagation(); handleReadFrom(); });
  toolbar.appendChild(readFromBtn);

  // 读选中（只读划选文字）
  const readSelBtn = document.createElement('button');
  readSelBtn.className = 'sel-action-btn';
  readSelBtn.textContent = '读选中';
  readSelBtn.addEventListener('click', (e) => { e.stopPropagation(); handleReadSelection(); });
  toolbar.appendChild(readSelBtn);

  // 高亮按钮（点击展开颜色选择）
  const hlBtn = document.createElement('button');
  hlBtn.className = 'sel-action-btn sel-hl-toggle';
  hlBtn.textContent = '高亮 ▸';
  hlBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleHighlightPicker(); });
  toolbar.appendChild(hlBtn);

  // 颜色选择器（默认隐藏，点击高亮后展开）
  const colorPicker = document.createElement('div');
  colorPicker.className = 'sel-color-picker';
  colorPicker.hidden = true;
  // 4 色高亮
  HIGHLIGHT_COLORS.filter(c => c !== 'orange').forEach(color => {
    const btn = document.createElement('button');
    btn.className = `sel-hl-btn sel-hl-${color}`;
    btn.title = COLOR_LABELS[color];
    btn.dataset.color = color;
    btn.addEventListener('click', (e) => { e.stopPropagation(); handleHighlight(color); });
    colorPicker.appendChild(btn);
  });
  // 清除高亮按钮
  const clearBtn = document.createElement('button');
  clearBtn.className = 'sel-hl-btn sel-hl-clear';
  clearBtn.title = '清除高亮';
  clearBtn.innerHTML = '✕';
  clearBtn.addEventListener('click', (e) => { e.stopPropagation(); handleClearHighlight(); });
  colorPicker.appendChild(clearBtn);
  toolbar.appendChild(colorPicker);

  // 取消
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'sel-action-btn sel-cancel-btn';
  cancelBtn.textContent = '✕ 取消';
  cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); hideToolbar(); });
  toolbar.appendChild(cancelBtn);

  // 阻止系统长按菜单（划词用自定义工具栏）
  document.querySelector('.scroll-container')?.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.para')) e.preventDefault();
  });

  // 拖拽选中文字 → 显示工具栏
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const paraEl = findParentPara(range.startContainer);
    if (!paraEl) { hideToolbar(); return; }
    const text = sel.toString().trim();
    if (!text) { hideToolbar(); return; }

    activePara = paraEl;
    activeRange = range;

    // 查字按钮：仅选中单汉字时可见
    const lookupBtn = document.getElementById('sel-zdic-btn');
    if (lookupBtn) {
      // 单汉字：查字；多字：查词
      const hasCJK = [...text].some(ch => isCJKChar(ch));
      lookupBtn.style.display = hasCJK ? '' : 'none';
      lookupBtn.textContent = text.length === 1 ? '查字' : '查词';
    }

    // 书签按钮状态
    const bmBtn = document.getElementById('sel-bookmark-btn');
    if (bmBtn) {
      const chapterId = getChapterId(paraEl);
      const paraId = paraEl.dataset.para;
      bmBtn.textContent = isBookmarked(chapterId, paraId) ? '✓ 已收藏' : '书签';
      bmBtn.classList.toggle('active', isBookmarked(chapterId, paraId));
    }

    const rect = range.getBoundingClientRect();
    positionToolbar(rect.left + rect.width / 2, rect.top);
  });

  // 点击工具栏外 → 关闭（延迟防止与 selectionchange 冲突）
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.sel-toolbar')) setTimeout(hideToolbar, 100);
  });

  // 滚动时不立即隐藏：加延迟保护，避免选完字后惯性滚动导致工具栏消失
  let scrollHideTimer = null;
  document.addEventListener('scroll', () => {
    clearTimeout(scrollHideTimer);
    if (toolbar && !toolbar.hidden && toolbar.classList.contains('visible')) {
      scrollHideTimer = setTimeout(hideToolbar, 300);
    }
  }, { passive: true });

  // 工具栏按钮的 touchstart 要维持选区不被清除
  toolbar.addEventListener('touchstart', (e) => {
    e.preventDefault(); // 防止触摸时原生选区消失
    const btn = e.target.closest('button');
    if (btn) btn.click();
  }, { passive: false });
}

/** 切换高亮颜色选择器的展开/收起 */
function toggleHighlightPicker() {
  const picker = toolbar?.querySelector('.sel-color-picker');
  const toggle = toolbar?.querySelector('.sel-hl-toggle');
  if (!picker || !toggle) return;
  const isOpen = !picker.hidden;
  picker.hidden = isOpen;
  toggle.textContent = isOpen ? '高亮 ▸' : '高亮 ▾';
}

/** 收起颜色选择器 */
function collapseHighlightPicker() {
  const picker = toolbar?.querySelector('.sel-color-picker');
  const toggle = toolbar?.querySelector('.sel-hl-toggle');
  if (picker) picker.hidden = true;
  if (toggle) toggle.textContent = '高亮 ▸';
}

/** 定位工具栏（水平居中，优先上方，不够则下方） */
function positionToolbar(centerX, topY) {
  if (!toolbar) return;
  toolbar.classList.add('visible');
  toolbar.hidden = false;

  const tw = toolbar.offsetWidth || 220;
  let left = centerX - tw / 2;
  let top = topY - 48;

  if (top < 10) top = topY + 20;
  left = Math.max(10, Math.min(left, window.innerWidth - tw - 10));

  toolbar.style.left = left + 'px';
  toolbar.style.top = top + 'px';
}

function hideToolbar() {
  if (toolbar) {
    toolbar.classList.remove('visible');
    toolbar.hidden = true;
    collapseHighlightPicker();
  }
  activePara = null;
  activeRange = null;
}

/**
 * 获取当前选区（优先 activeRange，其次从 window.getSelection 恢复）
 */
function getActiveRange() {
  if (activeRange) return activeRange;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) return sel.getRangeAt(0);
  return null;
}

// ---- 操作处理 ----

async function handleHighlight(color) {
  if (!activePara) return;
  const range = getActiveRange();
  if (!range) { hideToolbar(); return; }
  const chapterId = getChapterId(activePara);
  const paraId = activePara.dataset.para;
  const edition = activePara.dataset.edition || '';
  const fullText = activePara.textContent || '';

  if (range) {
    const text = range.toString();
    const startIdx = fullText.indexOf(text);
    if (startIdx === -1) { hideToolbar(); return; }
    await createHighlight(chapterId, paraId, edition, startIdx, startIdx + text.length, color, text);
  }
  refreshAnnotationsIfOpen();
  hideToolbar();
}

async function handleClearHighlight() {
  if (!activePara) return;
  const range = getActiveRange();
  if (!range) { hideToolbar(); return; }
  const chapterId = getChapterId(activePara);
  const paraId = activePara.dataset.para;
  const edition = activePara.dataset.edition || '';
  const fullText = activePara.textContent || '';
  const text = range.toString();
  const startIdx = fullText.indexOf(text);
  if (startIdx === -1) { hideToolbar(); return; }

  await clearHighlightsByRange(chapterId, paraId, edition, startIdx, startIdx + text.length);
  removeHighlightsInRange(activePara, startIdx, startIdx + text.length);
  refreshAnnotationsIfOpen();
  hideToolbar();
}

function removeHighlightsInRange(paraEl, start, end) {
  const walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
  let offset = 0;
  const marksToRemove = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const len = node.textContent.length;
    const nodeEnd = offset + len;
    if (start < nodeEnd && end > offset) {
      // 这个文本节点在范围内，检查它的父级是否有高亮 mark
      let parent = node.parentNode;
      while (parent && parent !== paraEl) {
        if (parent.nodeType === 1 && parent.tagName === 'MARK' &&
            /^hl-/.test(parent.className)) {
          marksToRemove.push(parent);
          break;
        }
        parent = parent.parentNode;
      }
    }
    offset = nodeEnd;
    if (offset >= end) break;
  }
  marksToRemove.reverse().forEach(m => {
    const p = m.parentNode;
    p.replaceChild(document.createTextNode(m.textContent), m);
    p.normalize();
  });
}


async function handleNote() {
  if (!activePara) return;
  const range = getActiveRange();
  const chapterId = getChapterId(activePara);
  const paraId = activePara.dataset.para;
  const edition = activePara.dataset.edition || '';
  const excerpt = (activePara.textContent || '').trim().slice(0, 80);

  let initialContent = '';
  if (range) {
    const selected = range.toString();
    if (selected) initialContent = '「' + selected + '」';
  }

  const editor = document.createElement('div');
  editor.className = 'note-editor';
  editor.style.cssText =
    `position:fixed;left:${toolbar?.style.left || '50%'};top:${Math.max(60, parseInt(toolbar?.style.top || '100') - 80)}px;` +
    `z-index:2001;background:var(--paper-bg);border:1px solid var(--paper-edge);` +
    `border-radius:8px;padding:0.6rem;width:280px;box-shadow:0 4px 20px rgba(62,46,35,0.18);`;

  editor.innerHTML =
    `<textarea placeholder="输入笔记内容…" style="width:100%;min-height:60px;padding:0.5rem;border:1px solid var(--paper-edge);border-radius:6px;font-family:var(--font-main);font-size:0.9rem;resize:vertical;background:var(--paper-bg);box-sizing:border-box;">${escapeHtml(initialContent)}</textarea>` +
    '<div style="display:flex;justify-content:flex-end;gap:0.4rem;margin-top:0.4rem;">' +
    '<button class="topbar-btn note-save">保存</button>' +
    '<button class="topbar-btn note-cancel">取消</button></div>';

  document.body.appendChild(editor);

  editor.querySelector('.note-save').addEventListener('click', async () => {
    const text = editor.querySelector('textarea').value.trim();
    if (text) await createNote(chapterId, paraId, edition, text, excerpt);
    refreshAnnotationsIfOpen();
    editor.remove();
    hideToolbar();
  });
  editor.querySelector('.note-cancel').addEventListener('click', () => { editor.remove(); hideToolbar(); });
  editor.querySelector('textarea').focus();
  hideToolbar();
}

function handleBookmark() {
  if (!activePara) return;
  const chapterId = getChapterId(activePara);
  const paraId = activePara.dataset.para;
  // 优先使用选中的文字，无选区时取段落前 80 字
  const range = getActiveRange();
  const selected = range ? range.toString().trim() : '';
  const excerpt = selected || (activePara.textContent || '').trim().slice(0, 80);

  if (isBookmarked(chapterId, paraId)) {
    removeBookmark(chapterId, paraId);
    removeAnnoDot(activePara);
  } else {
    addBookmark(chapterId, paraId, excerpt);
    addAnnoDot(activePara);
    // 添加绿色高亮
    const edition = activePara.dataset.edition || '';
    const fullText = activePara.textContent || '';
    const startIdx = selected ? fullText.indexOf(selected) : -1;
    if (startIdx >= 0 && selected) {
      createHighlight(chapterId, paraId, edition, startIdx, startIdx + selected.length, 'green', selected);
    } else {
      createHighlight(chapterId, paraId, edition, 0, fullText.length, 'green', fullText.slice(0, 200));
    }
  }
  refreshAnnotationsIfOpen();
  hideToolbar();
}

// ---- 朗读 ----

/** 朗读选中的文字 */
function handleReadSelection() {
  if (!activePara) return;
  const range = getActiveRange();
  if (!range) { hideToolbar(); return; }
  const text = range.toString().trim();
  if (!text) { hideToolbar(); return; }

  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = parseFloat(document.getElementById('reader-speed')?.value || '1');
  u.pitch = 0.8;
  u.volume = 0.7;
  u.onend = () => {
    const playBtn = document.getElementById('reader-play');
    if (playBtn) playBtn.textContent = '▶';
    const bar = document.getElementById('reader-bar');
    if (bar) bar.hidden = true;
  };
  u.onerror = () => {
    const playBtn = document.getElementById('reader-play');
    if (playBtn) playBtn.textContent = '▶';
  };
  window.speechSynthesis.speak(u);

  const bar = document.getElementById('reader-bar');
  if (bar) bar.hidden = false;
  const playBtn = document.getElementById('reader-play');
  if (playBtn) playBtn.textContent = '⏸';
  hideToolbar();
}

/** 从选中段落往下连续朗读 */
function handleReadFrom() {
  if (!activePara) return;
  readFromParagraph(activePara);
  hideToolbar();
}

function addAnnoDot(para) {
  if (para.querySelector('.anno-dot')) return;
  const dot = document.createElement('span');
  dot.className = 'anno-dot';
  dot.title = '有标注';
  para.appendChild(dot);
}

function removeAnnoDot(para) {
  const dot = para.querySelector('.anno-dot');
  if (dot) dot.remove();
}

function handleLookup() {
  const range = getActiveRange();
  if (!range) return;
  const text = range.toString().trim();
  if (!text) { hideToolbar(); return; }
  // 单汉字查字，多字查词
  if (text.length === 1 && isCJKChar(text)) {
    lookupCharacter(text);
  } else {
    // 取前 20 个字（避免太长）
    const term = text.slice(0, 20);
    lookupTerm(term);
  }
  hideToolbar();
}

// ---- 工具 ----

function findParentPara(node) {
  while (node) {
    if (node.nodeType === 1 && node.classList?.contains('para')) return node;
    node = node.parentNode;
  }
  return null;
}

function isCJKChar(str) {
  const code = str.codePointAt(0);
  return (code >= 0x4E00 && code <= 0x9FFF) ||
         (code >= 0x3400 && code <= 0x4DBF) ||
         (code >= 0x20000 && code <= 0x2A6DF);
}

function getChapterId(paraEl) {
  const fold = paraEl.closest('.fold');
  return fold ? fold.id : '';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
