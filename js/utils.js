/**
 * utils.js — 纯工具函数
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 长段落按句子边界拆分，maxLen 为目标最大字数
 */
export function splitSentences(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = -1;
    for (let i = Math.min(remaining.length - 1, maxLen); i >= maxLen * 0.4; i--) {
      if ('。！？」）'.includes(remaining[i])) { splitAt = i + 1; break; }
    }
    if (splitAt === -1) {
      for (let i = Math.min(remaining.length - 1, maxLen); i >= maxLen * 0.4; i--) {
        if ('，；：'.includes(remaining[i])) { splitAt = i + 1; break; }
      }
    }
    if (splitAt === -1) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * 构造书签唯一键
 */
export function bookmarkKey(chapterId, paraId) {
  return `${chapterId}:${paraId}`;
}

/**
 * 简单防抖
 */
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
