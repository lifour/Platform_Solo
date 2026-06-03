/**
 * book-registry.js — 书籍注册表
 *
 * 定义所有可阅读的书籍，每本包含 id、标题、数据路径。
 */
export const BOOKS = [
  { id: 'tanjing', title: '六祖坛经', dataUrl: 'data/zongbao.json', chaptersKey: 'chapters' },
  { id: 'wumenguan', title: '无门关', dataUrl: 'data/wumenguan.json', chaptersKey: 'chapters' },
  { id: 'wenmingzhiguang', title: '文明之光', dataUrl: 'data/wenmingzhiguang.json', chaptersKey: 'chapters' },
];

/** 获取当前书的信息 */
export function getBookById(id) {
  return BOOKS.find(b => b.id === id) || BOOKS[0];
}
