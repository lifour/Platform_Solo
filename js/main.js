/**
 * main.js — 六祖坛经·阅藏 核心逻辑
 *
 * 1. 加载 JSON 经文 + 术语词典
 * 2. 渲染经折装 DOM
 * 3. 横向滚动 (wheel → scrollLeft)
 * 4. 品名导航跳转
 * 5. 术语浮层（桌面悬停 / 移动长按）
 * 6. 阅读进度记忆 (localStorage)
 */

// ---- 全局状态 ----
let sutraData = null;    // zongbao.json 或 zongbao_pinyin.json
let dunhuangData = null; // dunhuang.json 或 dunhuang_pinyin.json
let glossaryMap = {};    // term → { pinyin, meaning }
let pinyinMap = {};      // char → pinyin
let tooltip = null;      // tooltip DOM element
let longPressTimer = null;
let isFlipping = false;
let compareMode = false; // 对照模式
let pinyinMode = false;  // 拼音注音模式

const STORAGE_KEY = 'sutra_scroll_pos';

// ---- 启动 ----
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const [sutraRes, glossaryRes] = await Promise.all([
      fetch('data/zongbao.json'),
      fetch('data/glossary.json'),
    ]);
    sutraData = await sutraRes.json();
    const glossaryData = await glossaryRes.json();


    // 可选数据：敦煌本 & 拼音（不阻塞主流程）
    // 预加载拼音版数据
    window._zongbaoRaw = sutraData;
    window._dunhuangRaw = null;
    try {
      const dhRes = await fetch('data/dunhuang.json');
      if (dhRes.ok) {
        dunhuangData = await dhRes.json();
        window._dunhuangRaw = dunhuangData;
      }
    } catch (_) { /* 敦煌本不可用 */ }
    // 预加载拼音版
    window._zongbaoPinyin = null;
    window._dunhuangPinyin = null;
    try {
      const zbPyRes = await fetch('data/zongbao_pinyin.json');
      if (zbPyRes.ok) window._zongbaoPinyin = await zbPyRes.json();
    } catch (_) {}
    try {
      const dhPyRes = await fetch('data/dunhuang_pinyin.json');
      if (dhPyRes.ok) window._dunhuangPinyin = await dhPyRes.json();
    } catch (_) {}

    // 构建术语查找表（按长度降序排列以支持最长匹配）
    glossaryData.terms.forEach(t => {
      glossaryMap[t.term] = { pinyin: t.pinyin, meaning: t.meaning };
    });

    render();
    setupScroll();
    setupNavigation();
    setupToggles();
    restorePosition();
    setupSearch();
  } catch (err) {
    console.error('加载经文数据失败:', err);
    document.querySelector('.scroll-container').innerHTML =
      '<div class="loading">经文加载失败，请检查 data/ 目录</div>';
  }
}

// ---- 渲染经折装 ----
function render() {
  const container = document.querySelector('.scroll-container');
  const select = document.getElementById('chapter-select');
  container.innerHTML = '';

  // 重置导航下拉
  while (select.options.length > 1) select.remove(1);

  // 获取所有术语（按长度降序，确保最长匹配优先）
  const terms = Object.keys(glossaryMap).sort((a, b) => b.length - a.length);
  const termPattern = terms.length > 0
    ? new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'g')
    : null;

  // 切换 body 的 pinyin-mode class
  document.body.classList.toggle('pinyin-mode', pinyinMode);

  // 切换数据源
  if (pinyinMode && window._zongbaoPinyin) {
    sutraData = window._zongbaoPinyin;
    if (window._dunhuangPinyin) dunhuangData = window._dunhuangPinyin;
  } else {
    sutraData = window._zongbaoRaw;
    dunhuangData = window._dunhuangRaw;
  }

  if (compareMode) {
    renderCompareMode(container, select, termPattern);
  } else {
    renderNormalMode(container, select, termPattern);
  }

  // DOM 回流分页
  reflowFolds();

  // 窗口尺寸变化时重新分页
  if (!window._resizeHandlerInstalled) {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const c = document.querySelector('.scroll-container');
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
    window._resizeHandlerInstalled = true;
  }

  // 创建 tooltip 元素（如果尚未创建）
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.innerHTML = '<div class="tooltip-term"></div><div class="tooltip-pinyin"></div><div class="tooltip-meaning"></div>';
    document.body.appendChild(tooltip);
  }

  // 绑定术语交互（仅首次）
  if (!window._termInteractionInstalled) {
    setupTermInteraction();
    window._termInteractionInstalled = true;
  }
}

/**
 * 将文本包裹 ruby 拼音注音（仅限 CJK 汉字）
 */
function addPinyinRuby(html) {
  if (!pinyinMode) return html;
  // 匹配非标签部分的汉字
  return html.replace(/([^<]*?)(<[^>]+>)/g, (match, text, tag) => {
    return rubyText(text) + tag;
  }).replace(/([^<]+)$/, (match, text) => rubyText(text));
}

function rubyText(text) {
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

/**
 * 生成带术语标记和可选拼音的段落 HTML
 */
function makeParaHTML(text, termPattern) {
  let html = termPattern
    ? text.replace(termPattern, '<span class="term" data-term="$1">$1</span>')
    : text;
  if (pinyinMode) html = addPinyinRuby(html);
  return html;
}

/**
 * 普通模式渲染
 */
function renderNormalMode(container, select, termPattern) {
  sutraData.chapters.forEach((chapter) => {
    // 导航下拉选项
    const opt = document.createElement('option');
    opt.value = chapter.id;
    opt.textContent = chapter.title;
    select.appendChild(opt);

    // 创建章节首折，放入所有段落
    const fold = document.createElement('div');
    fold.className = 'fold fold--chapter-start';
    fold.id = chapter.id;


    const title = document.createElement('h2');
    title.className = 'chapter-title';
    if (pinyinMode && chapter.pinyinTitle) {
      title.innerHTML = chapter.pinyinTitle;
    } else {
      title.innerHTML = chapter.title;
    }
    fold.appendChild(title);


    chapter.paragraphs.forEach(p => {
      // 拼音模式直接渲染 pinyinHtml
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

/**
 * 对照模式渲染：双栏（敦煌本 | 宗宝本）
 */
function renderCompareMode(container, select, termPattern) {
  // 构建敦煌本按 chapter id 索引
  const dhChapters = {};
  if (dunhuangData && dunhuangData.chapters) {
    dunhuangData.chapters.forEach(ch => { dhChapters[ch.id] = ch; });
  }

  sutraData.chapters.forEach((zbChapter) => {
    const opt = document.createElement('option');
    opt.value = zbChapter.id;
    opt.textContent = zbChapter.title;
    select.appendChild(opt);

    const dhChapter = dhChapters[zbChapter.id];

    const fold = document.createElement('div');
    fold.className = 'fold fold--chapter-start compare-mode';
    fold.id = zbChapter.id;

    // 敦煌本栏
    const colDH = document.createElement('div');
    colDH.className = 'compare-col compare-col--dh';
    const labelDH = document.createElement('span');
    labelDH.className = 'compare-col-label';
    labelDH.textContent = '敦煌本';
    colDH.appendChild(labelDH);

    const titleWrapDH = document.createElement('div');
    titleWrapDH.className = 'chapter-title-wrap';

    const titleDH = document.createElement('h2');
    titleDH.className = 'chapter-title';
    if (pinyinMode && dhChapter && dhChapter.pinyinTitle) {
      titleDH.innerHTML = dhChapter.pinyinTitle;
    } else {
      titleDH.innerHTML = zbChapter.title;
    }
    titleWrapDH.appendChild(titleDH);
    colDH.appendChild(titleWrapDH);


    if (dhChapter) {
      dhChapter.paragraphs.forEach(p => {
        if (pinyinMode && p.pinyinHtml) {
          const para = document.createElement('p');
          para.className = 'para';
          para.dataset.para = p.id;
          para.dataset.edition = 'dh';
          para.innerHTML = p.pinyinHtml;
          colDH.appendChild(para);
        } else {
          const chunks = splitSentences(p.text, 160);
          chunks.forEach((chunk) => {
            const para = document.createElement('p');
            para.className = 'para';
            para.dataset.para = p.id;
            para.dataset.edition = 'dh';
            para.innerHTML = makeParaHTML(chunk, termPattern);
            colDH.appendChild(para);
          });
        }
      });
    } else {
      const notice = document.createElement('p');
      notice.className = 'para';
      notice.style.color = 'var(--ink-light)';
      notice.style.fontStyle = 'italic';
      notice.textContent = '（敦煌本無此品內容）';
      colDH.appendChild(notice);
    }

    // 宗宝本栏
    const colZB = document.createElement('div');
    colZB.className = 'compare-col compare-col--zb';
    const labelZB = document.createElement('span');
    labelZB.className = 'compare-col-label';
    labelZB.textContent = '宗寶本';
    colZB.appendChild(labelZB);

    const titleWrapZB = document.createElement('div');
    titleWrapZB.className = 'chapter-title-wrap';

    const titleZB = document.createElement('h2');
    titleZB.className = 'chapter-title';
    if (pinyinMode && zbChapter.pinyinTitle) {
      titleZB.innerHTML = zbChapter.pinyinTitle;
    } else {
      titleZB.innerHTML = zbChapter.title;
    }
    titleWrapZB.appendChild(titleZB);
    colZB.appendChild(titleWrapZB);


    zbChapter.paragraphs.forEach(p => {
      if (pinyinMode && p.pinyinHtml) {
        const para = document.createElement('p');
        para.className = 'para';
        para.dataset.para = p.id;
        para.dataset.edition = 'zb';
        para.innerHTML = p.pinyinHtml;
        colZB.appendChild(para);
      } else {
        const chunks = splitSentences(p.text, 160);
        chunks.forEach((chunk) => {
          const para = document.createElement('p');
          para.className = 'para';
          para.dataset.para = p.id;
          para.dataset.edition = 'zb';
          para.innerHTML = makeParaHTML(chunk, termPattern);
          colZB.appendChild(para);
        });
      }
    });

    fold.appendChild(colDH);
    fold.appendChild(colZB);
    container.appendChild(fold);
  });
}

/**
 * 长段落按句子边界拆分，maxLen 为目标最大字数
 */
function splitSentences(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = -1;
    // 优先在句号等处断开
    for (let i = Math.min(remaining.length - 1, maxLen); i >= maxLen * 0.4; i--) {
      if ('。！？」）'.includes(remaining[i])) { splitAt = i + 1; break; }
    }
    // 次选逗号、分号
    if (splitAt === -1) {
      for (let i = Math.min(remaining.length - 1, maxLen); i >= maxLen * 0.4; i--) {
        if ('，；：'.includes(remaining[i])) { splitAt = i + 1; break; }
      }
    }
    if (splitAt === -1) splitAt = maxLen; // 强制断开
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * DOM 回流分页：根据实际页面高度把溢出内容移到新折页
 */
function reflowFolds() {
  const container = document.querySelector('.scroll-container');

  if (compareMode) {
    // 对照模式：每个 compare-mode fold 包含两栏
    // 如果任一栏溢出，将两栏的溢出段落同时移至新折
    reflowCompareFolds(container);
    return;
  }

  // 第一步：把续页段落合并回章节首折
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

  // 第二步：逐折检测溢出，拆分到新折页
  let iterations = 0;
  while (iterations < 500) {
    const overflowed = findOverflowingFold(container);
    if (!overflowed) break;
    iterations++;

    const paras = Array.from(overflowed.querySelectorAll(':scope > .para'));
    if (paras.length <= 1) break; // 单段无法再拆

    // 从末尾移除段落直到不溢出
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

function findOverflowingFold(container) {
  for (const fold of container.querySelectorAll('.fold')) {
    if (fold.classList.contains('compare-mode')) continue; // 对照模式另行处理
    if (fold.scrollHeight > fold.clientHeight + 2) return fold;
  }
  return null;
}

/**
 * 对照模式回流分页：每栏独立检测溢出
 */
function reflowCompareFolds(container) {
  const chapterFolds = Array.from(container.querySelectorAll('.fold--chapter-start'));

  for (const chFold of chapterFolds) {
    // 先把续页合并回来
    let next = chFold.nextElementSibling;
    while (next && !next.classList.contains('fold--chapter-start')) {
      const toRemove = next;
      next = next.nextElementSibling;
      // 把续页两栏的段落放回章节首折对应栏
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

    // 检测各栏溢出
    let iterations = 0;
    while (iterations < 200) {
      const cols = chFold.querySelectorAll('.compare-col');
      // 找溢出最多的栏
      let anyOverflow = false;
      for (const col of cols) {
        if (col.scrollHeight > col.clientHeight + 2) {
          anyOverflow = true;
          break;
        }
      }
      if (!anyOverflow) break;
      iterations++;

      // 找到要插入续页的位置
      let insertAfter = chFold;
      let sib = chFold.nextElementSibling;
      while (sib && !sib.classList.contains('fold--chapter-start')) {
        insertAfter = sib;
        sib = sib.nextElementSibling;
      }

      // 创建续页
      const newFold = document.createElement('div');
      newFold.className = 'fold compare-mode';

      // 对每栏做溢出转移
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

      // 只有当续页确实有内容时才添加
      const hasContent = Array.from(newFold.querySelectorAll('.para')).length > 0;
      if (hasContent) {
        insertAfter.after(newFold);
      } else {
        break;
      }
    }
  }
}

// ---- 对照 & 拼音 切换 ----
function setupToggles() {
  const compareBtn = document.getElementById('compare-btn');
  const pinyinBtn = document.getElementById('pinyin-btn');

  if (!dunhuangData) {
    compareBtn.disabled = true;
    compareBtn.title = '敦煌本數據未載入';
  }
  // 如果有预生成的 pinyin JSON，也视为可用
  const hasPinyinPregen = !!(window._zongbaoPinyin || window._dunhuangPinyin);
  if ((!pinyinMap || Object.keys(pinyinMap).length === 0) && !hasPinyinPregen) {
    pinyinBtn.disabled = true;
    pinyinBtn.title = '拼音數據未載入';
  }

  compareBtn.addEventListener('click', () => {
    if (!dunhuangData) return;
    compareMode = !compareMode;
    compareBtn.classList.toggle('active', compareMode);
    rerender();
  });

  pinyinBtn.addEventListener('click', () => {
    // 允许使用预生成的 pinyin HTML 或者单字符拼音映射
    const available = (pinyinMap && Object.keys(pinyinMap).length > 0) || hasPinyinPregen;
    if (!available) return;
    pinyinMode = !pinyinMode;
    pinyinBtn.classList.toggle('active', pinyinMode);
    rerender();
  });
}

function rerender() {
  const container = document.querySelector('.scroll-container');
  const maxS = container.scrollWidth - container.clientWidth;
  const ratio = maxS > 0 ? container.scrollLeft / maxS : 0;

  render();

  requestAnimationFrame(() => {
    const newMax = container.scrollWidth - container.clientWidth;
    container.scrollLeft = ratio * newMax;
    updateProgress();
  });
}

// ---- 横向滚动 & 翻页 ----
function setupScroll() {
  const container = document.querySelector('.scroll-container');

  // 创建翻页阴影遮罩
  const flipShadow = document.createElement('div');
  flipShadow.className = 'flip-shadow';
  document.body.appendChild(flipShadow);

  // 鼠标滚轮 → 逐页翻页
  container.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (isFlipping) return;
    flipPage(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // 键盘左右箭头翻页（搜索面板开启时跳过）
  document.addEventListener('keydown', e => {
    const searchOpen = document.getElementById('search-panel') && !document.getElementById('search-panel').hidden;
    if (searchOpen) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault(); flipPage(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); flipPage(-1);
    }
  });

  // 点击左右边缘翻页（避免干扰术语点击）
  container.addEventListener('click', e => {
    if (e.target.closest('.term')) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.15) flipPage(-1);
    else if (x > rect.width * 0.85) flipPage(1);
  });

  // 更新进度
  container.addEventListener('scroll', () => {
    updateProgress();
    savePosition();
  });

  updateProgress();
}

/**
 * 翻页：direction = 1 下一页，-1 上一页
 */
function flipPage(direction) {
  if (isFlipping) return;
  const container = document.querySelector('.scroll-container');
  const flipShadow = document.querySelector('.flip-shadow');
  const pageWidth = container.clientWidth;
  const maxScroll = container.scrollWidth - container.clientWidth;
  const currentPage = Math.round(container.scrollLeft / pageWidth);
  const targetScroll = Math.min(Math.max(0, (currentPage + direction) * pageWidth), maxScroll);

  if (Math.abs(targetScroll - container.scrollLeft) < 2) return;

  isFlipping = true;
  if (flipShadow) flipShadow.classList.add('active');

  container.scrollTo({ left: targetScroll, behavior: 'smooth' });

  setTimeout(() => {
    if (flipShadow) flipShadow.classList.remove('active');
    isFlipping = false;
  }, 500);
}

function updateProgress() {
  const container = document.querySelector('.scroll-container');
  const fill = document.querySelector('.progress-bar-fill');
  const label = document.querySelector('.topbar-progress');

  const maxScroll = container.scrollWidth - container.clientWidth;
  const pct = maxScroll > 0 ? (container.scrollLeft / maxScroll) * 100 : 0;

  fill.style.width = pct + '%';
  label.textContent = Math.round(pct) + '%';

  // 更新当前品名高亮
  updateActiveChapter();
}

function updateActiveChapter() {
  const container = document.querySelector('.scroll-container');
  const select = document.getElementById('chapter-select');
  const scrollLeft = container.scrollLeft;
  const centerX = scrollLeft + container.clientWidth / 2;

  // 找到当前可见的章节起始折
  const chapters = container.querySelectorAll('.fold--chapter-start');
  let activeId = '';
  chapters.forEach(el => {
    if (el.offsetLeft <= centerX) {
      activeId = el.id;
    }
  });

  if (activeId && select.value !== activeId) {
    select.value = activeId;
  }
}

// ---- 品名导航 ----
function setupNavigation() {
  const select = document.getElementById('chapter-select');
  select.addEventListener('change', () => {
    const target = document.getElementById(select.value);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
  });
}

// ---- 术语浮层交互 ----
function setupTermInteraction() {
  const container = document.querySelector('.scroll-container');

  // 桌面端：mouseenter / mouseleave
  container.addEventListener('mouseenter', e => {
    if (e.target.classList.contains('term')) {
      showTooltip(e.target);
    }
  }, true);

  container.addEventListener('mouseleave', e => {
    if (e.target.classList.contains('term')) {
      hideTooltip();
    }
  }, true);

  // 移动端：touchstart 长按
  container.addEventListener('touchstart', e => {
    const target = e.target.closest('.term');
    if (!target) return;
    longPressTimer = setTimeout(() => {
      e.preventDefault();
      showTooltip(target);
    }, 400);
  }, { passive: false });

  container.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
  });

  container.addEventListener('touchmove', () => {
    clearTimeout(longPressTimer);
  });

  // 点击其他区域关闭 tooltip
  document.addEventListener('click', e => {
    if (!e.target.closest('.term') && !e.target.closest('.tooltip')) {
      hideTooltip();
    }
  });
}

function showTooltip(termEl) {
  const term = termEl.dataset.term;
  const data = glossaryMap[term];
  if (!data) return;

  tooltip.querySelector('.tooltip-term').textContent = term;
  tooltip.querySelector('.tooltip-pinyin').textContent = data.pinyin;
  tooltip.querySelector('.tooltip-meaning').textContent = data.meaning;

  // 定位
  const rect = termEl.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 8;

  // 确保不超出右边
  if (left + 320 > window.innerWidth) {
    left = window.innerWidth - 330;
  }
  // 确保不超出底部
  if (top + 150 > window.innerHeight) {
    top = rect.top - 8;
    tooltip.style.transform = 'translateY(-100%)';
  } else {
    tooltip.style.transform = '';
  }

  tooltip.style.left = Math.max(10, left) + 'px';
  tooltip.style.top = top + 'px';
  tooltip.classList.add('visible');
}

function hideTooltip() {
  if (tooltip) {
    tooltip.classList.remove('visible');
  }
}

// ---- 阅读进度持久化 ----
function savePosition() {
  const container = document.querySelector('.scroll-container');
  const maxScroll = container.scrollWidth - container.clientWidth;
  if (maxScroll > 0) {
    const ratio = container.scrollLeft / maxScroll;
    try {
      localStorage.setItem(STORAGE_KEY, ratio.toString());
    } catch (_) { /* 无痕模式等情况忽略 */ }
  }
}

function restorePosition() {
  try {
    const ratio = parseFloat(localStorage.getItem(STORAGE_KEY));
    if (!isNaN(ratio) && ratio > 0) {
      const container = document.querySelector('.scroll-container');
      // 等 DOM 渲染完成后恢复位置
      requestAnimationFrame(() => {
        const maxScroll = container.scrollWidth - container.clientWidth;
        container.scrollLeft = ratio * maxScroll;
        updateProgress();
      });
    }
  } catch (_) { /* 忽略 */ }
}

// ---- 工具函数 ----
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- 简体→繁体映射（经文为繁体，用户输入简体自动转换） ----
const _s2tMap = (()=>{
  const pairs =
    '爱愛碍礙罢罷备備笔筆边邊变變标標别別宾賓补補参參残殘惭慚惨慘仓倉层層产產长長尝嘗偿償厂廠车車彻徹陈陳称稱诚誠惩懲迟遲冲衝丑醜处處触觸辞辭从從达達带帶担擔当當导導灯燈敌敵递遞点點电電调調东東动動独獨断斷对對队隊夺奪尔爾发發范範飞飛坟墳奋奮丰豐风風凤鳳肤膚妇婦复復赶趕个個给給宫宮贡貢沟溝构構购購顾顧关關观觀广廣归歸龟龜国國过過还還汉漢号號轰轟后後护護划劃华華画畫怀懷坏壞欢歡环環换換黄黃汇匯会會获獲击擊鸡雞积積极極际際继繼夹夾荐薦坚堅间間见見将將奖獎讲講酱醬节節杰傑尽盡进進惊驚经經净淨竞競举舉据據觉覺军軍开開垦墾恳懇夸誇块塊来來兰蘭拦攔蓝藍劳勞乐樂类類离離历歷丽麗两兩灵靈领領刘劉龙龍楼樓虑慮录錄陆陸驴驢乱亂论論罗羅马馬买買卖賣满滿门門闷悶梦夢庙廟灭滅鸣鳴难難恼惱脑腦拟擬酿釀鸟鳥宁寧农農欧歐盘盤赔賠喷噴骗騙贫貧凭憑仆僕朴樸启啟气氣迁遷签簽钱錢枪槍亲親穷窮请請庆慶权權劝勸确確让讓热熱认認荣榮赛賽伞傘丧喪扫掃杀殺晒曬伤傷赏賞烧燒设設审審声聲胜勝圣聖师師时時实實识識势勢释釋寿壽书書属屬术術树樹双雙丝絲苏蘇诉訴虽雖随隨岁歲孙孫损損态態叹歎谈談汤湯讨討体體条條听聽铁鐵厅廳头頭图圖团團万萬网網为為韦韋卫衛稳穩问問无無务務雾霧误誤习習鲜鮮显顯宪憲乡鄉响響协協胁脅写寫兴興须須选選学學训訓压壓亚亞烟煙严嚴颜顏验驗阳陽样樣养養摇搖药藥业業叶葉页頁医醫仪儀忆憶义義艺藝阴陰银銀饮飲应應拥擁邮郵犹猶鱼魚与與语語郁鬱誉譽渊淵远遠愿願约約阅閱运運杂雜脏臟暂暫则則责責贼賊赠贈斋齋战戰张張针針阵陣争爭证證纸紙质質种種众眾专專转轉装裝壮壯状狀资資总總纵縱组組钻鑽缘緣禅禪诸諸谓謂诲誨蕴蘊顿頓说說烦煩忏懺诵誦谛諦颂頌辩辯坛壇岭嶺宝寶尘塵刹剎闻聞谤謗悯憫怜憐惫憊赞讚恒恆诫誡谱譜筹籌绝絕忧憂迹跡';
  const m = {};
  for (let i = 0; i < pairs.length; i += 2) {
    const s = pairs[i], t = pairs[i+1];
    if (s !== t) m[s] = t;
  }
  return m;
})();

function toTraditional(str) {
  let out = '';
  for (const ch of str) out += _s2tMap[ch] || ch;
  return out;
}

// ---- 全文搜索 ----
function setupSearch() {
  const btn = document.getElementById('search-btn');
  const panel = document.getElementById('search-panel');
  const input = document.getElementById('search-input');
  const closeBtn = document.getElementById('search-close');
  const resultsList = document.getElementById('search-results');
  const countLabel = document.getElementById('search-count');

  let debounceTimer = null;

  function openPanel() {
    panel.hidden = false;
    input.focus();
  }
  function closePanel() {
    panel.hidden = true;
    clearSearchHighlights();
  }

  btn.addEventListener('click', () => {
    panel.hidden ? openPanel() : closePanel();
  });

  closeBtn.addEventListener('click', closePanel);

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      openPanel();
      input.select();
    }
    if (e.key === 'Escape' && !panel.hidden) {
      closePanel();
    }
  });

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(input.value.trim()), 150);
  });

  function doSearch(query) {
    resultsList.innerHTML = '';
    countLabel.textContent = '';
    if (!query) return;

    // 简体自动转繁体
    const tQuery = toTraditional(query);
    const queries = [tQuery];
    // 若转换后不同，同时搜原文（兼容直接输入繁体）
    if (tQuery !== query) queries.push(query);

    const results = [];
    const seen = new Set(); // 去重

    // 搜索的数据源
    const dataSources = [{ data: sutraData, label: '宗寶本' }];
    if (dunhuangData) dataSources.push({ data: dunhuangData, label: '敦煌本' });

    for (const q of queries) {
      for (const src of dataSources) {
        src.data.chapters.forEach(chapter => {
          chapter.paragraphs.forEach(para => {
            let idx = 0;
            while ((idx = para.text.indexOf(q, idx)) !== -1) {
              const key = `${src.label}:${para.id}:${idx}`;
              if (seen.has(key)) { idx += q.length; continue; }
              seen.add(key);
              const ctxStart = Math.max(0, idx - 25);
              const ctxEnd = Math.min(para.text.length, idx + q.length + 25);
              const before = (ctxStart > 0 ? '…' : '') + para.text.slice(ctxStart, idx);
              const match = para.text.slice(idx, idx + q.length);
              const after = para.text.slice(idx + q.length, ctxEnd) + (ctxEnd < para.text.length ? '…' : '');
              results.push({
                chapterTitle: chapter.title,
                paraId: para.id,
                before, match, after,
                query: q,
                edition: src.label,
              });
              idx += q.length;
            }
          });
        });
      }
    }

    countLabel.textContent = results.length > 0 ? `${results.length} 處` : '無結果';

    results.slice(0, 100).forEach(r => {
      const li = document.createElement('li');
      const edLabel = r.edition !== '宗寶本' ? `<span style="font-size:0.7rem;color:var(--ink-light);margin-left:0.4em">${escapeHtml(r.edition)}</span>` : '';
      li.innerHTML =
        `<div class="result-chapter">${escapeHtml(r.chapterTitle)}${edLabel}</div>` +
        `<div>${escapeHtml(r.before)}<mark>${escapeHtml(r.match)}</mark>${escapeHtml(r.after)}</div>`;
      li.addEventListener('click', () => navigateToResult(r));
      resultsList.appendChild(li);
    });
  }

  function navigateToResult(result) {
    closePanel();

    // 优先匹配版本
    let selector = `.para[data-para="${result.paraId}"]`;
    if (result.edition === '敦煌本') {
      selector = `.para[data-para="${result.paraId}"][data-edition="dh"]`;
    }
    const paraEl = document.querySelector(selector) || document.querySelector(`.para[data-para="${result.paraId}"]`);
    if (!paraEl) return;

    const fold = paraEl.closest('.fold');
    if (fold) {
      fold.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }

    // 延迟高亮，等翻页动画完成
    setTimeout(() => highlightInElement(paraEl, result.query), 550);
  }
}

function highlightInElement(el, query) {
  clearSearchHighlights();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const idx = node.textContent.indexOf(query);
    if (idx === -1) continue;

    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + query.length);

    const mark = document.createElement('mark');
    mark.className = 'search-highlight';
    range.surroundContents(mark);
    break; // 只高亮第一个匹配
  }
}

function clearSearchHighlights() {
  document.querySelectorAll('mark.search-highlight').forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}
