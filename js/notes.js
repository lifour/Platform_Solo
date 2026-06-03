/**
 * notes.js — 笔记系统
 *
 * 支持预置笔记（随 data/notes.json 打包）和用户笔记（IndexedDB）。
 * 预置笔记跟随 APK 分发，所有用户可见。
 */
import { saveNote, getAllNotes, getNotesByParagraph, deleteNote } from './db.js';
import { store } from './store.js';
import { getChapterTitleById } from './bookmarks.js';

// ---- CRUD ----

export async function createNote(chapterId, paraId, edition, text, excerpt) {
  const note = { chapterId, paraId, edition: edition || '', text, excerpt: (excerpt || '').slice(0, 80), createdAt: Date.now(), updatedAt: Date.now() };
  await saveNote(note);
  const notes = await getNotesByParagraph(chapterId, paraId, edition);
  let selector = `#${CSS.escape(chapterId)} .para[data-para="${paraId}"]`;
  if (edition) selector += `[data-edition="${edition}"]`;
  const para = document.querySelector(selector);
  if (para) attachNoteIndicatorToPara(para, notes.length);
}

export async function updateNote(id, text) {
  const note = await (await import('./db.js')).getNote(id);
  if (!note) return;
  note.text = text;
  note.updatedAt = Date.now();
  await saveNote(note);
}

export async function deleteNoteById(id) {
  await deleteNote(id);
}

export function attachNoteIndicatorToPara(paraEl, count) {
  if (!paraEl) return;
  let indicator = paraEl.querySelector('.note-indicator');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'note-indicator';
    indicator.title = '查看笔记';
    paraEl.appendChild(indicator);
  }
  indicator.textContent = count > 9 ? '9+' : count;
}

// ---- 面板 ----

export async function showNotesPanel() {
  const panel = document.getElementById('notes-panel');
  if (!panel) return;
  panel.hidden = false;
  await renderNotesList();
}

export function hideNotesPanel() {
  const panel = document.getElementById('notes-panel');
  if (panel) panel.hidden = true;
}

export async function renderNotesList() {
  const list = document.getElementById('notes-list');
  const empty = document.getElementById('notes-empty');
  if (!list || !empty) return;

  list.innerHTML = '';
  try {
    const notes = await getAllNotes() || [];

    if (notes.length === 0) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    notes.forEach(n => {
      const li = document.createElement('li');
      li.className = 'note-item';
      const header = document.createElement('div');
      header.className = 'note-item-header';
      const title = document.createElement('span');
      title.style.cssText = 'font-size:0.85rem;color:var(--accent-gold);';
      title.textContent = getChapterTitleById(n.chapterId) || n.chapterId;
      header.appendChild(title);

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:0.4rem;';

      const gotoBtn = document.createElement('button');
      gotoBtn.className = 'topbar-btn';
      gotoBtn.textContent = '跳转';
      gotoBtn.addEventListener('click', () => {
        const target = document.querySelector(`#${CSS.escape(n.chapterId)} .para[data-para="${n.paraId}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        hideNotesPanel();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'topbar-btn';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', async () => {
        await deleteNoteById(n.id);
        renderNotesList();
        const para = document.querySelector(`#${CSS.escape(n.chapterId)} .para[data-para="${n.paraId}"]`);
        if (para) {
          const remaining = await getNotesByParagraph(n.chapterId, n.paraId, n.edition);
          if (remaining.length === 0) {
            const ind = para.querySelector('.note-indicator');
            if (ind) ind.remove();
          } else {
            const ind = para.querySelector('.note-indicator');
            if (ind) ind.textContent = remaining.length > 9 ? '9+' : remaining.length;
          }
        }
      });
      actions.appendChild(delBtn);

      actions.appendChild(gotoBtn);
      header.appendChild(actions);
      li.appendChild(header);

      const excerpt = document.createElement('div');
      excerpt.className = 'note-item-excerpt';
      excerpt.textContent = n.excerpt || '（无摘录）';
      li.appendChild(excerpt);

      const text = document.createElement('div');
      text.className = 'note-item-text';
      const isLong = n.text.length > 100;
      text.textContent = isLong ? n.text.slice(0, 100) + '…' : n.text;
      li.appendChild(text);

      if (isLong) {
        const expandBtn = document.createElement('button');
        expandBtn.className = 'topbar-btn';
        expandBtn.textContent = '展开全文';
        expandBtn.style.cssText = 'font-size:0.75rem;color:var(--accent-gold);margin-top:0.2rem;';
        expandBtn.addEventListener('click', () => showFullNote(n));
        li.appendChild(expandBtn);
      }

      const date = document.createElement('div');
      date.style.cssText = 'font-size:0.75rem;color:var(--ink-light);margin-top:0.2rem;';
      date.textContent = new Date(n.updatedAt || n.createdAt).toLocaleDateString('zh-CN');
      li.appendChild(date);
      list.appendChild(li);
    });
  } catch (_) {
    empty.style.display = 'block';
  }
}

// ---- 全屏查看 ----

function showFullNote(n) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:3000;';
  const card = document.createElement('div');
  card.style.cssText =
    'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'width:min(600px,92%);max-height:85vh;overflow-y:auto;' +
    'background:linear-gradient(180deg,#FBF8F2 0%,var(--paper-bg) 100%);' +
    'border:1px solid var(--accent-gold);border-radius:14px;' +
    'box-shadow:0 16px 48px rgba(62,46,35,0.2);z-index:3001;' +
    'padding:1.5rem;font-family:var(--font-main);';

  const t = document.createElement('div');
  t.style.cssText = 'font-size:0.85rem;color:var(--accent-gold);margin-bottom:0.5rem;';
  t.textContent = getChapterTitleById(n.chapterId) || n.chapterId;
  card.appendChild(t);

  if (n.excerpt) {
    const e = document.createElement('div');
    e.style.cssText = 'font-size:0.8rem;color:var(--ink-light);margin-bottom:0.8rem;padding-bottom:0.5rem;border-bottom:1px solid rgba(216,200,176,0.3);';
    e.textContent = n.excerpt;
    card.appendChild(e);
  }

  const full = document.createElement('div');
  full.style.cssText = 'font-size:0.95rem;line-height:1.9;color:var(--ink-main);white-space:pre-wrap;';
  full.textContent = n.text;
  card.appendChild(full);

  const date = document.createElement('div');
  date.style.cssText = 'font-size:0.75rem;color:var(--ink-light);margin-top:0.8rem;text-align:right;';
  date.textContent = new Date(n.updatedAt || n.createdAt).toLocaleDateString('zh-CN');
  card.appendChild(date);

  const close = document.createElement('button');
  close.textContent = '关闭';
  close.style.cssText = 'display:block;margin-top:1rem;padding:0.5rem;width:100%;border:1px solid var(--paper-edge);border-radius:8px;background:transparent;color:var(--ink-light);cursor:pointer;font-family:var(--font-main);font-size:0.9rem;';
  close.addEventListener('click', () => { overlay.remove(); card.remove(); });
  card.appendChild(close);

  overlay.addEventListener('click', () => { overlay.remove(); card.remove(); });
  document.body.appendChild(overlay);
  document.body.appendChild(card);
}
