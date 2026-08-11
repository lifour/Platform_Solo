/**
 * data.js — 数据加载 + Glossary 索引 + 书籍切换
 */
import { store } from './store.js';
import { escapeRegex } from './utils.js';
import { getBookById } from './book-registry.js';
import { toSimplified } from './ui-language.js';
import { buildSearchIndex } from './search-engine.js';

/**
 * 初始化：加载 glossary + 敦煌本 + 拼音数据 + 默认书
 */
export async function loadAllData() {
  // Glossary
  try {
    const glossaryRes = await fetch('data/glossary.json');
    const glossaryData = await glossaryRes.json();
    const glossaryMap = {};
    glossaryData.terms.forEach(t => {
      glossaryMap[t.term] = { pinyin: t.pinyin, meaning: t.meaning };
      const sim = toSimplified(t.term);
      if (sim !== t.term) glossaryMap[sim] = { pinyin: t.pinyin, meaning: t.meaning };
    });
    store.set('glossaryMap', glossaryMap);
    store.set('termPattern', buildTermPattern(glossaryMap));
  } catch (_) {}

  // 敦煌本（仅坛经有）
  try {
    const dhRes = await fetch('data/dunhuang.json');
    if (dhRes.ok) {
      store.set('dunhuangData', await dhRes.json());
      store.set('dunhuangAvailable', true);
    }
  } catch (_) {}

  // 拼音数据
  try {
    const zbPyRes = await fetch('data/zongbao_pinyin.json');
    if (zbPyRes.ok) store.state._zongbaoPinyin = await zbPyRes.json();
  } catch (_) {}
  try {
    const dhPyRes = await fetch('data/dunhuang_pinyin.json');
    if (dhPyRes.ok) store.state._dunhuangPinyin = await dhPyRes.json();
  } catch (_) {}
  try {
    const pRes = await fetch('data/pinyin.json');
    if (pRes.ok) {
      store.set('pinyinMap', await pRes.json());
      store.set('pinyinAvailable', true);
    }
  } catch (_) {}

  const hasPregen = !!(store.state._zongbaoPinyin || store.state._dunhuangPinyin);
  const hasMap = Object.keys(store.get('pinyinMap') || {}).length > 0;
  if (hasPregen || hasMap) store.set('pinyinAvailable', true);

  // 加载默认书籍
  const defaultBook = getBookById('tanjing');
  await loadBookData(defaultBook);
  store.set('currentBookId', 'tanjing');

  // 坛经支持对照+注音
  updateButtonsForBook('tanjing');
}

/**
 * 按书籍信息加载经文数据
 */
export async function loadBookData(book) {
  if (!book) return;
  try {
    const res = await fetch(book.dataUrl);
    const data = await res.json();
    store.set('sutraData', data);
    store.set('currentBookId', book.id);
    // 重建搜索索引
    try { buildSearchIndex(); } catch (_) {}
    return data;
  } catch (err) {
    console.error('加载书籍失败:', book.id, err);
    return null;
  }
}

/**
 * 切换书籍后更新按钮状态
 */
function updateButtonsForBook(bookId) {
  const isTanjing = bookId === 'tanjing';
  const compareBtn = document.getElementById('compare-btn');
  const pinyinBtn = document.getElementById('pinyin-btn');

  if (compareBtn) {
    compareBtn.disabled = !isTanjing;
    compareBtn.title = isTanjing ? '敦煌本对照' : '仅坛经支持对照';
  }
  if (pinyinBtn) {
    const hasPinyin = !!(store.state._zongbaoPinyin || Object.keys(store.get('pinyinMap') || {}).length > 0);
    if (isTanjing && hasPinyin) {
      pinyinBtn.disabled = false;
      pinyinBtn.title = '拼音注音';
    } else {
      pinyinBtn.disabled = true;
      pinyinBtn.title = isTanjing ? '拼音数据未载入' : '仅坛经支持注音';
      pinyinBtn.classList.remove('active');
    }
  }

  // 对照模式仅坛经可用
  if (!isTanjing && store.get('compareMode')) {
    store.set('compareMode', false);
  }
}

/**
 * 切换到指定书籍
 */
export async function switchBook(bookId) {
  const book = getBookById(bookId);
  if (!book || book.id === store.get('currentBookId')) return;

  store.set('sutraData', null);
  // 注意：不要在数据加载前设置 pinyinMode/compareMode
  // 这些会触发 store 事件 → rerender() → sutraData 为 null 时报错

  await loadBookData(book);

  // 数据加载完成后再重置模式
  store.set('pinyinMode', false);
  updateButtonsForBook(bookId);

  store.set('_bookChanged', Date.now());
}

/**
 * 构建术语正则模式
 */
export function buildTermPattern(glossaryMap) {
  const allTerms = new Set();
  Object.keys(glossaryMap).forEach(term => {
    allTerms.add(term);
    const sim = toSimplified(term);
    if (sim !== term) allTerms.add(sim);
  });
  const sorted = [...allTerms].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return null;
  return new RegExp(`(${sorted.map(escapeRegex).join('|')})`, 'g');
}
