/**
 * bookmarks.js — 书签系统
 *
 * 书签存储在 store.state.bookmarks 中（内存），
 * 持久化到 localStorage。
 */
import { store } from './store.js';
import { bookmarkKey } from './utils.js';

const BOOKMARKS_STORAGE_KEY = 'sutra_bookmarks_v1';

// ---- CRUD ----

export function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    const bm = raw ? JSON.parse(raw) : [];
    store.set('bookmarks', bm);
  } catch (e) {
    store.set('bookmarks', []);
  }
  updateBookmarksBadge();
}

export function saveBookmarks() {
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(store.get('bookmarks')));
  } catch (e) { /* 无痕模式忽略 */ }
  updateBookmarksBadge();
}

export function isBookmarked(chapterId, paraId) {
  const key = bookmarkKey(chapterId, paraId);
  return (store.get('bookmarks') || []).some(b => b.id === key);
}

export function addBookmark(chapterId, paraId, excerpt) {
  const id = bookmarkKey(chapterId, paraId);
  const bookmarks = store.get('bookmarks') || [];
  if (bookmarks.some(b => b.id === id)) return;
  const title = getChapterTitleById(chapterId) || chapterId;
  const label = title;
  bookmarks.unshift({ id, chapterId, paraId, label, excerpt: excerpt ? excerpt.slice(0, 80) : '', ts: Date.now() });
  store.set('bookmarks', bookmarks);
  saveBookmarks();
}

export function removeBookmark(chapterId, paraId) {
  const id = bookmarkKey(chapterId, paraId);
  const bookmarks = store.get('bookmarks') || [];
  const idx = bookmarks.findIndex(b => b.id === id);
  if (idx !== -1) {
    bookmarks.splice(idx, 1);
    store.set('bookmarks', bookmarks);
    saveBookmarks();
  }
}

export function updateBookmarksBadge() {
  const btn = document.getElementById('bookmarks-btn');
  if (!btn) return;
  const n = (store.get('bookmarks') || []).length;
  btn.textContent = n > 0 ? `书签 (${n})` : '书签';
}

export function getChapterTitleById(id) {
  try {
    const data = store.state.sutraData;
    const ch = (data && data.chapters || []).find(c => c.id === id);
    return ch ? ch.title : null;
  } catch (e) { return null; }
}

// ---- DOM 操作 ----

export function attachBookmarkToPara(paraEl) {
  if (!paraEl || !paraEl.dataset || !paraEl.dataset.para) return;
  if (paraEl.querySelector('.bookmark-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'bookmark-btn';
  btn.type = 'button';
  btn.title = '书签';
  btn.innerHTML = '<span aria-hidden>☆</span>';

  const chapterEl = paraEl.closest('.fold');
  const chapterId = chapterEl ? chapterEl.id : '';
  const paraId = paraEl.dataset.para;

  if (isBookmarked(chapterId, paraId)) {
    btn.classList.add('bookmarked');
    btn.innerHTML = '<span aria-hidden>★</span>';
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const excerpt = paraEl.textContent ? paraEl.textContent.trim().slice(0, 120) : '';
    if (isBookmarked(chapterId, paraId)) {
      removeBookmark(chapterId, paraId);
      btn.classList.remove('bookmarked');
      btn.innerHTML = '<span aria-hidden>☆</span>';
    } else {
      addBookmark(chapterId, paraId, excerpt);
      btn.classList.add('bookmarked');
      btn.innerHTML = '<span aria-hidden>★</span>';
    }
    renderBookmarksPanel();
  });

  paraEl.appendChild(btn);
}

// ---- 面板 ----

export function renderBookmarksPanel() {
  const panel = document.getElementById('bookmarks-panel');
  if (!panel) return;
  const list = document.getElementById('bookmarks-list');
  const empty = document.getElementById('bookmarks-empty');
  if (!list || !empty) return;
  list.innerHTML = '';

  const bookmarks = store.get('bookmarks') || [];
  if (bookmarks.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  bookmarks.forEach(b => {
    const li = document.createElement('li');
    li.className = 'bookmarks-list-item';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;';

    const badge = document.createElement('span');
    badge.className = 'bookmarks-badge';
    badge.textContent = '';

    const meta = document.createElement('div');
    meta.className = 'bm-meta';
    const excerptShort = b.excerpt ? (b.excerpt.length > 80 ? b.excerpt.slice(0, 80) + '…' : b.excerpt) : '（无摘录）';
    meta.textContent = (b.label ? b.label + ' · ' : '') + excerptShort;
    meta.title = b.excerpt || '';

    left.appendChild(badge);
    left.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'bm-actions';

    const gotoBtn = document.createElement('button');
    gotoBtn.className = 'topbar-btn';
    gotoBtn.textContent = '跳转';
    gotoBtn.addEventListener('click', () => {
      const target = document.querySelector(`#${CSS.escape(b.chapterId)} .para[data-para="${b.paraId}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      hideBookmarksPanel();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'topbar-btn';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => {
      removeBookmark(b.chapterId, b.paraId);
      renderBookmarksPanel();
      const para = document.querySelector(`#${CSS.escape(b.chapterId)} .para[data-para="${b.paraId}"]`);
      if (para) {
        const btn = para.querySelector('.bookmark-btn');
        if (btn) { btn.classList.remove('bookmarked'); btn.innerHTML = '<span aria-hidden>☆</span>'; }
      }
    });

    actions.appendChild(gotoBtn);
    actions.appendChild(delBtn);
    li.appendChild(left);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

export function showBookmarksPanel() {
  const panel = document.getElementById('bookmarks-panel');
  if (!panel) return;
  panel.hidden = false;
  updateBookmarksBadge();
  renderBookmarksPanel();
}

export function hideBookmarksPanel() {
  const panel = document.getElementById('bookmarks-panel');
  if (panel) panel.hidden = true;
}
