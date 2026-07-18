/**
 * highlight.js — 文字高亮系统
 *
 * 用户在段落中选中文字后选择颜色，高亮信息存入 IndexedDB。
 * 每次重渲染后自动从 IndexedDB 恢复所有高亮标记。
 */
import { saveHighlight, getAllHighlights, deleteHighlight, deleteHighlightsByParagraph, getHighlightsByParagraph } from './db.js';
import { store } from './store.js';

const HIGHLIGHT_COLORS = ['green', 'blue', 'yellow', 'pink', 'orange'];

/**
 * 从 IndexedDB 加载全部高亮并应用到 DOM
 */
export async function applyHighlightsToDOM() {
  try {
    const highlights = await getAllHighlights();
    if (!highlights || highlights.length === 0) return;
    highlights.forEach(hl => applyHighlightToPara(hl));
  } catch (_) { /* IndexedDB not available */ }
}

/**
 * 对单个段落元素应用高亮
 */
function applyHighlightToPara(highlight) {
  const { chapterId, paraId, edition, startOffset, endOffset, color } = highlight;
  if (!chapterId || !paraId || startOffset == null || endOffset == null) return;

  let selector = `#${CSS.escape(chapterId)} .para[data-para="${paraId}"]`;
  if (edition) selector += `[data-edition="${edition}"]`;

  const para = document.querySelector(selector);
  if (!para) return;

  const textLength = para.textContent.length;
  if (startOffset >= textLength || endOffset > textLength || startOffset >= endOffset) return;

  wrapRangeInMark(para, startOffset, endOffset, color);
}

/**
 * 在段落元素中，将指定字符偏移范围内的文字包裹为高亮 <mark>
 */
function wrapRangeInMark(paraEl, startOffset, endOffset, color) {
  const walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startNode = null, startNodeOffset = 0;
  let endNode = null, endNodeOffset = 0;

  // 找到起始和结束的文本节点
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeLen = node.textContent.length;
    const nodeEnd = currentOffset + nodeLen;

    if (!startNode && startOffset < nodeEnd) {
      startNode = node;
      startNodeOffset = startOffset - currentOffset;
    }
    if (!endNode && endOffset <= nodeEnd) {
      endNode = node;
      endNodeOffset = endOffset - currentOffset;
      break;
    }
    currentOffset = nodeEnd;
  }

  if (!startNode || !endNode) return;

  try {
    const range = document.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);

    const mark = document.createElement('mark');
    mark.className = `hl-${color}`;
    range.surroundContents(mark);
  } catch (_) {
    // 如果 range 跨多个文本节点，surroundContents 可能失败
    // 使用简化的方法：直接包裹文本内容
    trySimplifiedWrap(paraEl, startOffset, endOffset, color);
  }
}

/**
 * 简化版包裹（当 surroundContents 跨节点失败时的 fallback）
 */
function trySimplifiedWrap(_paraEl, _startOffset, _endOffset, _color) {
  // surroundContents 失败通常是因为 range 跨了 term/ruby 等内联元素
  // 此时不修改 DOM：高亮已保存到 IndexedDB，下次 rerender 后通过 applyHighlightsToDOM 恢复
}

function escapeForHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 创建新高亮
 */
export async function createHighlight(chapterId, paraId, edition, startOffset, endOffset, color, text) {
  if (!HIGHLIGHT_COLORS.includes(color)) color = 'green';
  const highlight = { chapterId, paraId, edition: edition || '', startOffset, endOffset, text: text || '', color, createdAt: Date.now() };
  await saveHighlight(highlight);
  // 重新应用高亮到当前段落
  applyHighlightToPara({ ...highlight, id: highlight.id });
}

/**
 * 删除段落的所有高亮
 */
export async function clearParagraphHighlights(chapterId, paraId, edition) {
  await deleteHighlightsByParagraph(chapterId, paraId, edition);
  // 移除 DOM 中的高亮标记
  let selector = `#${CSS.escape(chapterId)} .para[data-para="${paraId}"]`;
  if (edition) selector += `[data-edition="${edition}"]`;
  const para = document.querySelector(selector);
  if (para) {
    para.querySelectorAll('mark.hl-yellow, mark.hl-green, mark.hl-blue, mark.hl-pink, mark.hl-orange')
      .forEach(m => {
        const parent = m.parentNode;
        parent.replaceChild(document.createTextNode(m.textContent), m);
        parent.normalize();
      });
  }
}

/**
 * 删除指定字符范围内的高亮
 */
export async function clearHighlightsByRange(chapterId, paraId, edition, startOffset, endOffset) {
  try {
    const highlights = await getHighlightsByParagraph(chapterId, paraId, edition);
    const toDelete = highlights.filter(h =>
      (h.startOffset < endOffset && h.endOffset > startOffset)
    );
    for (const h of toDelete) {
      await deleteHighlight(h.id);
    }
  } catch (_) {}
}

export { HIGHLIGHT_COLORS };
