/**
 * render.js — DOM 渲染引擎
 *
 * 负责构建经折装 DOM、术语标记、拼音注音。
 * 每次渲染会重建整个 scroll-container 内容。
 * 不处理事件绑定（由 app.js 在首次渲染后完成）。
 */

import { store } from './store.js';
import { splitSentences } from './utils.js';
import { reflowFolds } from './pagination.js';
import { applySimplifiedToContainer } from './ui-language.js';
import { updateProgress, updateScrollPadding } from './scroll.js';

let _resizeHandlerInstalled = false;

/**
 * 全量渲染经文内容
 */
export function render() {
  const container = document.querySelector('.scroll-container');
  const select = document.getElementById('chapter-select');
  if (!container) return;
  container.innerHTML = '';

  // 重置导航下拉
  if (select) { while (select.options.length > 1) select.remove(1); }

  // 清空移动端目录列表（避免 rerender 重复追加）
  const mobileList = document.getElementById('mobile-chapter-list');
  if (mobileList) mobileList.innerHTML = '';

  // 数据尚未就绪时跳过渲染
  const data = store.state.sutraData;
  if (!data || !data.chapters) {
    container.innerHTML = '<div class="loading">加载中…</div>';
    return;
  }

  const termPattern = store.get('termPattern');
  const compareMode = store.get('compareMode');
  const pinyinMode = store.get('pinyinMode');
  const useTraditional = store.get('useTraditional');

  document.body.classList.toggle('pinyin-mode', pinyinMode);

  if (compareMode) {
    renderCompareMode(container, select, termPattern);
  } else {
    renderNormalMode(container, select, termPattern);
  }

  reflowFolds();

  // 窗口 resize 时重排
  if (!_resizeHandlerInstalled) {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updateScrollPadding();
        const c = document.querySelector('.scroll-container');
        if (!c) return;
        const maxS = c.scrollWidth - c.clientWidth;
        const ratio = maxS > 0 ? c.scrollLeft / maxS : 0;
        reflowFolds();
        requestAnimationFrame(() => {
          const newMax = c.scrollWidth - c.clientWidth;
          c.scrollLeft = ratio * newMax;
          updateProgress();
        });
      }, 250);
    });
    _resizeHandlerInstalled = true;
  }

  // 简体模式：转换正文
  if (!useTraditional) {
    applySimplifiedToContainer(document.querySelector('.scroll-container'));
    applySimplifiedToContainer(document.getElementById('chapter-select'));
    applySimplifiedToContainer(document.getElementById('mobile-chapter-list'));
  }

  store.set('hasRendered', true);
}

/**
 * 带比例保持的全量重渲染
 */
export function rerender() {
  const container = document.querySelector('.scroll-container');
  if (!container) return;
  const maxS = container.scrollWidth - container.clientWidth;
  const ratio = maxS > 0 ? container.scrollLeft / maxS : 0;

  render();

  requestAnimationFrame(() => {
    const newMax = container.scrollWidth - container.clientWidth;
    container.scrollLeft = ratio * newMax;
    updateProgress();
  });
}

/**
 * 更新进度条
 */
// 由 scroll.js 提供 updateProgress()

function renderNormalMode(container, select, termPattern) {
  const sutraData = getEffectiveSutraData();
  const pinyinMode = store.get('pinyinMode');
  const mobileList = document.getElementById('mobile-chapter-list');

  sutraData.chapters.forEach((chapter) => {
    const opt = document.createElement('option');
    opt.value = chapter.id;
    opt.textContent = chapter.title;
    select.appendChild(opt);

    if (mobileList) {
      const li = document.createElement('li');
      li.className = 'mobile-chapter-item';
      li.dataset.target = chapter.id;
      li.textContent = chapter.title;
      li.addEventListener('click', () => {
        const tgt = document.getElementById(chapter.id);
        if (tgt) tgt.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'start' });
        closeMobilePanel();
      });
      mobileList.appendChild(li);
    }

    const fold = document.createElement('div');
    fold.className = 'fold fold--chapter-start';
    fold.id = chapter.id;

    const title = document.createElement('h2');
    title.className = 'chapter-title';
    if (pinyinMode && chapter.pinyinTitle) {
      title.innerHTML = chapter.pinyinTitle;
    } else {
      title.textContent = chapter.title;
    }
    fold.appendChild(title);

    chapter.paragraphs.forEach(p => {
      if (pinyinMode && p.pinyinHtml) {
        const para = document.createElement('p');
        para.className = 'para';
        para.dataset.para = p.id;
        para.innerHTML = p.pinyinHtml;
        fold.appendChild(para);
      } else {
        const chunks = splitSentences(p.text, 200);
        chunks.forEach((chunk) => {
          const para = document.createElement('p');
          para.className = 'para';
          para.dataset.para = p.id;
          para.innerHTML = makeParaHTML(chunk, termPattern);
          fold.appendChild(para);
        });
      }
    });

    container.appendChild(fold);
  });
}

function renderCompareMode(container, select, termPattern) {
  const sutraData = getEffectiveSutraData();
  const dunhuangData = getEffectiveDunhuangData();
  const pinyinMode = store.get('pinyinMode');
  const mobileList = document.getElementById('mobile-chapter-list');

  const dhChapters = {};
  if (dunhuangData && dunhuangData.chapters) {
    dunhuangData.chapters.forEach(ch => { dhChapters[ch.id] = ch; });
  }

  sutraData.chapters.forEach((zbChapter) => {
    const opt = document.createElement('option');
    opt.value = zbChapter.id;
    opt.textContent = zbChapter.title;
    select.appendChild(opt);

    if (mobileList) {
      const li = document.createElement('li');
      li.className = 'mobile-chapter-item';
      li.dataset.target = zbChapter.id;
      li.textContent = zbChapter.title;
      li.addEventListener('click', () => {
        const tgt = document.getElementById(zbChapter.id);
        if (tgt) tgt.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'start' });
        closeMobilePanel();
      });
      mobileList.appendChild(li);
    }

    const dhChapter = dhChapters[zbChapter.id];

    const fold = document.createElement('div');
    fold.className = 'fold fold--chapter-start compare-mode';
    fold.id = zbChapter.id;

    // 敦煌本栏
    const colDH = buildCompareColumn('dh', '敦煌本', dhChapter, pinyinMode, termPattern, zbChapter.title);
    // 宗宝本栏
    const colZB = buildCompareColumn('zb', '宗宝本', zbChapter, pinyinMode, termPattern, zbChapter.title);

    fold.appendChild(colDH);
    fold.appendChild(colZB);
    container.appendChild(fold);
  });
}

function buildCompareColumn(edition, label, chapterData, pinyinMode, termPattern, fallbackTitle) {
  const col = document.createElement('div');
  col.className = `compare-col compare-col--${edition}`;

  const labelEl = document.createElement('span');
  labelEl.className = 'compare-col-label';
  labelEl.textContent = label;
  col.appendChild(labelEl);

  const titleWrap = document.createElement('div');
  titleWrap.className = 'chapter-title-wrap';
  const title = document.createElement('h2');
  title.className = 'chapter-title';
  if (pinyinMode && chapterData && chapterData.pinyinTitle) {
    title.innerHTML = chapterData.pinyinTitle;
  } else {
    title.textContent = chapterData ? chapterData.title || fallbackTitle : fallbackTitle;
  }
  titleWrap.appendChild(title);
  col.appendChild(titleWrap);

  if (chapterData && chapterData.paragraphs) {
    chapterData.paragraphs.forEach(p => {
      if (pinyinMode && p.pinyinHtml) {
        const para = document.createElement('p');
        para.className = 'para';
        para.dataset.para = p.id;
        para.dataset.edition = edition;
        para.innerHTML = p.pinyinHtml;
        col.appendChild(para);
        attachBookmarkToPara(para);
      } else {
        const chunks = splitSentences(p.text, 160);
        chunks.forEach((chunk) => {
          const para = document.createElement('p');
          para.className = 'para';
          para.dataset.para = p.id;
          para.dataset.edition = edition;
          para.innerHTML = makeParaHTML(chunk, termPattern);
          col.appendChild(para);
          attachBookmarkToPara(para);
        });
      }
    });
  } else {
    const notice = document.createElement('p');
    notice.className = 'para';
    notice.style.cssText = 'color:var(--ink-light);font-style:italic;';
    notice.textContent = '（敦煌本无此品内容）';
    col.appendChild(notice);
  }

  return col;
}

function closeMobilePanel() {
  const sp = document.getElementById('side-panel');
  if (sp) { sp.classList.remove('open'); sp.hidden = true; }
  const ov = document.getElementById('panel-overlay');
  if (ov) ov.hidden = true;
  const sh = document.getElementById('side-handle');
  if (sh) sh.hidden = false;
}

function getEffectiveSutraData() {
  const pinyinMode = store.get('pinyinMode');
  if (pinyinMode && store.state._zongbaoPinyin) return store.state._zongbaoPinyin;
  return store.state.sutraData;
}

function getEffectiveDunhuangData() {
  const pinyinMode = store.get('pinyinMode');
  if (pinyinMode && store.state._dunhuangPinyin) return store.state._dunhuangPinyin;
  return store.get('dunhuangData');
}

// ---- 工具函数 ----

export function addPinyinRuby(html) {
  if (!store.get('pinyinMode')) return html;
  const pinyinMap = store.get('pinyinMap') || {};
  return html.replace(/([^<]*?)(<[^>]+>)/g, (match, text, tag) => {
    return rubyText(text, pinyinMap) + tag;
  }).replace(/([^<]+)$/, (match, text) => rubyText(text, pinyinMap));
}

function rubyText(text, pinyinMap) {
  let result = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if ((code >= 0x4E00 && code <= 0x9FFF || code >= 0x3400 && code <= 0x4DBF) && pinyinMap[ch]) {
      result += `<ruby>${ch}<rt>${pinyinMap[ch]}</rt></ruby>`;
    } else {
      result += ch;
    }
  }
  return result;
}

export function makeParaHTML(text, termPattern) {
  let html = termPattern
    ? text.replace(termPattern, '<span class="term" data-term="$1">$1</span>')
    : text;
  if (store.get('pinyinMode')) html = addPinyinRuby(html);
  return html;
}
