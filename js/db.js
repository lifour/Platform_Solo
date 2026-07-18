/**
 * db.js — IndexedDB 封装
 *
 * Object Stores:
 *   - notes:    用户对段落的笔记/心得
 *   - highlights: 用户文字高亮标注
 *
 * 使用 IndexedDB 而非 localStorage 以突破 5MB 限制。
 */

const DB_NAME = 'sutra_reader';
const DB_VERSION = 1;

/** 打开（或创建）数据库连接 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;

      // notes object store
      if (!db.objectStoreNames.contains('notes')) {
        const noteStore = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        noteStore.createIndex('chapterParaIdx', ['chapterId', 'paraId', 'edition'], { unique: false });
        noteStore.createIndex('updatedAtIdx', 'updatedAt', { unique: false });
      }

      // highlights object store
      if (!db.objectStoreNames.contains('highlights')) {
        const hlStore = db.createObjectStore('highlights', { keyPath: 'id', autoIncrement: true });
        hlStore.createIndex('chapterParaIdx', ['chapterId', 'paraId', 'edition'], { unique: false });
        hlStore.createIndex('colorIdx', 'color', { unique: false });
      }
    };

    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('IndexedDB 被阻塞，请关闭其他标签页');
  });
}

// ---- Notes CRUD ----

export async function saveNote(note) {
  const db = await openDB();
  const tx = db.transaction('notes', 'readwrite');
  const store = tx.objectStore('notes');
  if (note.id) {
    note.updatedAt = Date.now();
    store.put(note);
  } else {
    note.createdAt = Date.now();
    note.updatedAt = note.createdAt;
    store.add(note);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getNote(id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('notes', 'readonly');
    const req = tx.objectStore('notes').get(id);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); resolve(null); };
  });
}

export async function getNotesByParagraph(chapterId, paraId, edition) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('notes', 'readonly');
    const idx = tx.objectStore('notes').index('chapterParaIdx');
    const req = idx.getAll([chapterId, paraId, edition || '']);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); resolve([]); };
  });
}

export async function getAllNotes() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('notes', 'readonly');
    const idx = tx.objectStore('notes').index('updatedAtIdx');
    const req = idx.getAll();
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); resolve([]); };
  });
}

export async function deleteNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readwrite');
    tx.objectStore('notes').delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ---- Highlights CRUD ----

export async function saveHighlight(highlight) {
  const db = await openDB();
  const tx = db.transaction('highlights', 'readwrite');
  const store = tx.objectStore('highlights');
  const doc = { ...highlight, createdAt: highlight.createdAt || Date.now() };
  if (doc.id) {
    store.put(doc);
  } else {
    store.add(doc);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getHighlightsByParagraph(chapterId, paraId, edition) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('highlights', 'readonly');
    const idx = tx.objectStore('highlights').index('chapterParaIdx');
    const req = idx.getAll([chapterId, paraId, edition || '']);
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); resolve([]); };
  });
}

export async function getAllHighlights() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('highlights', 'readonly');
    const store = tx.objectStore('highlights');
    const req = store.getAll();
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); resolve([]); };
  });
}

export async function deleteHighlight(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('highlights', 'readwrite');
    tx.objectStore('highlights').delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function deleteHighlightsByParagraph(chapterId, paraId, edition) {
  const highlights = await getHighlightsByParagraph(chapterId, paraId, edition);
  const ids = highlights.map(h => h.id);
  if (ids.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('highlights', 'readwrite');
    const store = tx.objectStore('highlights');
    ids.forEach(id => store.delete(id));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
