/**
 * annotations.js — 标注面板（书签）
 *
 * 书签自带绿色高亮标识，统一在标注面板管理。
 */
import { getChapterTitleById, removeBookmark } from './bookmarks.js';
import { store } from './store.js';

/**
 * 为有书签的段落附加金色圆点指示器
 */
export async function attachAnnotationIndicators() {
  const annotated = new Set();
  try {
    const bookmarks = store.get('bookmarks') || [];
    bookmarks.forEach(b => annotated.add(`${b.chapterId || ''}|${b.paraId || ''}|`));
  } catch (_) {}

  annotated.forEach(k => {
    const [chapterId, paraId] = k.split('|');
    const selector = `#${CSS.escape(chapterId)} .para[data-para="${paraId}"]`;
    const para = document.querySelector(selector);
    if (para && !para.querySelector('.anno-dot')) {
      const dot = document.createElement('span');
      dot.className = 'anno-dot';
      dot.title = '有书签';
      para.appendChild(dot);
    }
  });
}

// ---- 面板 ----

export async function showAnnotationsPanel() {
  const panel = document.getElementById('annotations-panel');
  if (!panel) return;
  panel.hidden = false;
  await renderAnnotationsPanel();
}

export function hideAnnotationsPanel() {
  const panel = document.getElementById('annotations-panel');
  if (panel) panel.hidden = true;
}

/** 刷新标注面板（如果已打开） */
export async function refreshAnnotationsIfOpen() {
  const panel = document.getElementById('annotations-panel');
  if (panel && !panel.hidden) await renderAnnotationsPanel();
}

export async function renderAnnotationsPanel() {
  const list = document.getElementById('annotations-list');
  const empty = document.getElementById('annotations-empty');
  if (!list || !empty) return;

  list.innerHTML = '';

  try {
    const bookmarks = store.get('bookmarks') || [];
    if (bookmarks.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    // 新在上
    const items = bookmarks.map(b => ({
      chapterId: b.chapterId, paraId: b.paraId,
      text: b.excerpt || '', ts: b.ts || 0, id: b.id,
    }));

    // 按品分组
    const byChapter = {};
    items.forEach(item => {
      const chKey = item.chapterId || '__unknown';
      if (!byChapter[chKey]) byChapter[chKey] = [];
      byChapter[chKey].push(item);
    });

    Object.keys(byChapter).sort().forEach(chKey => {
      const chTitle = getChapterTitleById(chKey) || chKey;
      const chHeader = document.createElement('div');
      chHeader.className = 'anno-chapter-header';
      chHeader.textContent = `${chTitle} (${byChapter[chKey].length})`;
      list.appendChild(chHeader);

      byChapter[chKey].forEach(item => {
        const el = document.createElement('div');
        el.className = 'anno-item';

        // 正文预览
        const textEl = document.createElement('div');
        textEl.className = 'anno-item-text';
        textEl.textContent = item.text.slice(0, 80);
        textEl.style.color = 'var(--accent-gold)';
        el.appendChild(textEl);

        // 操作按钮
        const actions = document.createElement('div');
        actions.className = 'anno-item-actions';

        const gotoBtn = document.createElement('button');
        gotoBtn.className = 'topbar-btn';
        gotoBtn.textContent = '跳转';
        gotoBtn.addEventListener('click', () => {
          const target = document.querySelector(
            `#${CSS.escape(item.chapterId)} .para[data-para="${item.paraId}"]`
          );
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          hideAnnotationsPanel();
        });
        actions.appendChild(gotoBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'topbar-btn';
        delBtn.textContent = '删除';
        delBtn.style.color = '#e74c3c';
        delBtn.addEventListener('click', () => {
          removeBookmark(item.chapterId, item.paraId);
          renderAnnotationsPanel();
          const para = document.querySelector(
            `#${CSS.escape(item.chapterId)} .para[data-para="${item.paraId}"]`
          );
          if (para) {
            const dot = para.querySelector('.anno-dot');
            if (dot) dot.remove();
          }
        });
        actions.appendChild(delBtn);

        el.appendChild(actions);
        list.appendChild(el);
      });
    });
  } catch (_) {
    empty.style.display = 'block';
  }
}
