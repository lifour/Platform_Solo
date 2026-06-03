/**
 * pagination.js — 翻页模式折页分页
 *
 * 在 paged 模式下，检测 fold 元素是否溢出视口高度，
 * 将多余段落移到新的续页 fold。
 */

import { store } from './store.js';

/**
 * DOM 回流分页：根据实际页面高度把溢出内容移到新折页
 */
export function reflowFolds() {
  if (store.get('displayMode') === 'scroll') return;
  const container = document.querySelector('.scroll-container');
  if (!container) return;

  if (store.get('compareMode')) {
    reflowCompareFolds(container);
    return;
  }

  // 合并续页回章节首折
  const folds = Array.from(container.querySelectorAll('.fold'));
  let chapterFold = null;
  for (const fold of folds) {
    if (fold.classList.contains('fold--chapter-start')) {
      chapterFold = fold;
    } else {
      while (fold.firstChild) chapterFold.appendChild(fold.firstChild);
      fold.remove();
    }
  }

  // 逐折检测溢出，拆分到新折页
  let iterations = 0;
  while (iterations < 500) {
    const overflowed = findOverflowingFold(container);
    if (!overflowed) break;
    iterations++;

    const paras = Array.from(overflowed.querySelectorAll(':scope > .para'));
    if (paras.length <= 1) break;

    const overflow = [];
    while (paras.length > 1 && overflowed.scrollHeight > overflowed.clientHeight + 2) {
      const last = paras.pop();
      overflowed.removeChild(last);
      overflow.unshift(last);
    }

    if (overflow.length > 0) {
      const newFold = document.createElement('div');
      newFold.className = 'fold';
      overflow.forEach(p => newFold.appendChild(p));
      overflowed.after(newFold);
    }
  }
}

export function findOverflowingFold(container) {
  for (const fold of container.querySelectorAll('.fold')) {
    if (fold.classList.contains('compare-mode')) continue;
    if (fold.scrollHeight > fold.clientHeight + 2) return fold;
  }
  return null;
}

/**
 * 对照模式回流分页：每栏独立检测溢出
 */
export function reflowCompareFolds(container) {
  const chapterFolds = Array.from(container.querySelectorAll('.fold--chapter-start'));

  for (const chFold of chapterFolds) {
    let next = chFold.nextElementSibling;
    while (next && !next.classList.contains('fold--chapter-start')) {
      const toRemove = next;
      next = next.nextElementSibling;
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

    let iterations = 0;
    while (iterations < 200) {
      const cols = chFold.querySelectorAll('.compare-col');
      let anyOverflow = false;
      for (const col of cols) {
        if (col.scrollHeight > col.clientHeight + 2) {
          anyOverflow = true;
          break;
        }
      }
      if (!anyOverflow) break;
      iterations++;

      let insertAfter = chFold;
      let sib = chFold.nextElementSibling;
      while (sib && !sib.classList.contains('fold--chapter-start')) {
        insertAfter = sib;
        sib = sib.nextElementSibling;
      }

      const newFold = document.createElement('div');
      newFold.className = 'fold compare-mode';

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

      const hasContent = Array.from(newFold.querySelectorAll('.para')).length > 0;
      if (hasContent) {
        insertAfter.after(newFold);
      } else {
        break;
      }
    }
  }
}
