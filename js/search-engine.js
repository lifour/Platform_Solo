/**
 * search-engine.js — Fuse.js 模糊搜索索引
 *
 * 从当前书籍段落数据构建全文搜索索引。
 * 索引在书籍数据变更时重建。
 */
import Fuse from 'fuse.js';
import { store } from './store.js';

let fuse = null;

/**
 * 构建/重建 Fuse 搜索索引
 * 覆盖当前书籍（sutraData）+ 敦煌本（如可用）
 */
export function buildSearchIndex() {
  const docs = [];

  const sutra = store.state.sutraData;
  if (sutra && sutra.chapters) {
    sutra.chapters.forEach(ch => {
      (ch.paragraphs || []).forEach(para => {
        if (para.text && para.text.trim()) {
          docs.push({
            text: para.text,
            chapterTitle: ch.title,
            paraId: para.id,
            edition: 'zongbao',
          });
        }
      });
    });
  }

  // 敦煌本（仅坛经有）
  const dh = store.get('dunhuangData');
  if (dh && dh.chapters) {
    dh.chapters.forEach(ch => {
      (ch.paragraphs || []).forEach(para => {
        if (para.text && para.text.trim()) {
          docs.push({
            text: para.text,
            chapterTitle: ch.title,
            paraId: para.id,
            edition: 'dunhuang',
          });
        }
      });
    });
  }

  if (docs.length === 0) {
    fuse = null;
    return null;
  }

  fuse = new Fuse(docs, {
    includeMatches: true,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 1,
    threshold: 0.36,
    keys: ['text'],
  });

  return fuse;
}

/**
 * 执行模糊搜索
 * @param {string} query - 搜索词
 * @returns {Array} Fuse 原始搜索结果
 */
export function search(query) {
  if (!fuse) return [];
  if (!query || !query.trim()) return [];
  return fuse.search(query.trim());
}

/**
 * 获取当前 Fuse 实例
 * @returns {Fuse|null}
 */
export function getFuse() {
  return fuse;
}
