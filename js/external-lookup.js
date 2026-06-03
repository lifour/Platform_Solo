/**
 * external-lookup.js — 查词/查字信息面板（本地数据 + 外部链接）
 *
 * 查字：展示本地 pinyin 数据 + 链接到 zdic.net
 * 查词：展示 glossary 术语解释 + 链接到 putixia.org
 * 不再使用 iframe 内嵌页面。
 */

import { store } from './store.js';

/**
 * 查单个汉字（展示拼音 + 链接到 zdic.net）
 */
export function lookupCharacter(char) {
  const pinyinMap = store.get('pinyinMap') || {};
  const pinyin = pinyinMap[char] || '';
  const url = `https://zdic.net/hans/${encodeURIComponent(char)}`;

  showLookupPanel({
    title: `查字：${char}`,
    char,
    pinyin,
    meaning: '',
    glossary: '',
    notFound: !pinyin ? '本地暂无此字拼音数据。' : '',
    externalUrl: url,
  });
}

/**
 * 查佛学术语（展示 glossary 解释 + 尝试从 putixia.org 获取补充内容）
 */
export function lookupTerm(term) {
  const glossaryMap = store.get('glossaryMap') || {};
  const data = glossaryMap[term];
  const url = `https://www.putixia.org/?s=${encodeURIComponent(term)}`;

  // 先展示本地数据
  showLookupPanel({
    title: `查词：${term}`,
    char: '',
    pinyin: data ? data.pinyin : '',
    meaning: data ? data.meaning : '',
    glossary: '',
    notFound: '',
    externalUrl: url,
    source: 'glossary',
  });

  // 如果本地没有，尝试从 putixia.org 在线获取
  if (!data) {
    fetchPutixia(term, url);
  }
}

/**
 * 从 putixia.org 在线获取术语解释（通过 CORS 代理）
 */
async function fetchPutixia(term, fallbackUrl) {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent('https://www.putixia.org/?s=' + encodeURIComponent(term))}`;
  try {
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();

    // 提取搜索结果片段
    const snippet = extractSnippet(html);
    if (snippet) {
      const meaningEl = document.getElementById('lookup-meaning');
      const notFoundEl = document.getElementById('lookup-not-found');
      if (meaningEl) {
        meaningEl.innerHTML = '<strong style="color:var(--accent-gold)">📖 菩提下词典</strong><br>' + snippet;
        meaningEl.style.display = 'block';
      }
      if (notFoundEl) notFoundEl.style.display = 'none';
    } else {
      showNotFound(term, fallbackUrl);
    }
  } catch (_) {
    // 代理失败，显示 fallback
    showNotFound(term, fallbackUrl);
  }
}

function extractSnippet(html) {
  // 提取 putixia.org 搜索结果的文本片段
  // WordPress 主题通常在 <article> 或 .entry-content 中
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const content = articleMatch ? articleMatch[1] : html;

  // 提取段落文本
  const pMatches = content.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  if (pMatches) {
    const texts = pMatches
      .map(p => p.replace(/<[^>]+>/g, '').trim())
      .filter(t => t.length > 10)
      .slice(0, 3);
    if (texts.length > 0) return texts.join('<br><br>');
  }

  // 提取纯文本前 500 字
  const plain = content.replace(/<[^>]+>/g, '').trim();
  if (plain.length > 20) return plain.slice(0, 500);

  return null;
}

function showNotFound(term, url) {
  const notFoundEl = document.getElementById('lookup-not-found');
  if (notFoundEl) {
    notFoundEl.innerHTML =
      '本地暂无此词解释。<br>' +
      '<a href="' + url + '" target="_blank" rel="noopener" ' +
      'style="color:var(--accent-gold);text-decoration:underline;display:inline-block;margin-top:0.5rem;">' +
      '在菩提下词典查看 ↗</a>';
    notFoundEl.style.display = 'block';
  }
}

/**
 * 在 tooltip 浮层追加"查更多"链接
 */
export function enhanceTooltipWithLookup(tooltipEl, term) {
  if (!tooltipEl) return;
  let lookupRow = tooltipEl.querySelector('.tooltip-lookup');
  if (!lookupRow) {
    lookupRow = document.createElement('button');
    lookupRow.className = 'tooltip-lookup';
    lookupRow.textContent = '查更多 →';
    tooltipEl.appendChild(lookupRow);
    // 防止触控时 tooltip 消失
    lookupRow.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
  }
  lookupRow.onclick = (e) => { e.stopPropagation(); lookupTerm(term); };
}

/** 关闭查词面板 */
export function closeLookupPanel() {
  const panel = document.getElementById('lookup-panel');
  if (panel) panel.hidden = true;
}

// ---- 内部实现 ----

function showLookupPanel({ title, char, pinyin, meaning, glossary, notFound, externalUrl }) {
  const panel = document.getElementById('lookup-panel');
  const titleEl = document.getElementById('lookup-title');
  const charEl = document.getElementById('lookup-char');
  const pinyinEl = document.getElementById('lookup-pinyin');
  const meaningEl = document.getElementById('lookup-meaning');
  const glossaryEl = document.getElementById('lookup-glossary');
  const notFoundEl = document.getElementById('lookup-not-found');
  const externalLink = document.getElementById('lookup-external-link');

  if (!panel) return;

  // 标题
  if (titleEl) titleEl.textContent = title;
  if (externalLink && externalUrl) externalLink.href = externalUrl;

  // 汉字
  if (charEl) {
    charEl.textContent = char;
    charEl.style.display = char ? 'block' : 'none';
  }

  // 朗读按钮
  const speakBtn = document.getElementById('lookup-speak');
  if (speakBtn) {
    // 显示/隐藏：有字或词时才显示
    speakBtn.style.display = (char || pinyin || meaning) ? '' : 'none';
    // 移除旧监听，添加新监听
    const newBtn = speakBtn.cloneNode(true);
    speakBtn.parentNode.replaceChild(newBtn, speakBtn);
    newBtn.addEventListener('click', () => {
      const text = char || title.replace(/^查[词字]：/, '');
      if (text) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = 1.0;
        u.pitch = 1.0;
        u.volume = 1.0;
        window.speechSynthesis.speak(u);
      }
    });
  }

  // 拼音
  if (pinyinEl) {
    pinyinEl.textContent = pinyin || '';
    pinyinEl.style.display = pinyin ? 'block' : 'none';
  }

  // 字义 / 基础信息
  if (meaningEl) {
    meaningEl.textContent = meaning || '';
    meaningEl.style.display = meaning ? 'block' : 'none';
  }

  // 术语解释
  if (glossaryEl) {
    glossaryEl.textContent = glossary || '';
    glossaryEl.style.display = glossary ? 'block' : 'none';
  }

  // 未找到提示
  if (notFoundEl) {
    if (notFound) {
      notFoundEl.innerHTML = notFound + '<br><br><a href="' + externalUrl + '" target="_blank" rel="noopener" style="color:var(--accent-gold);text-decoration:underline;">查看网络解释 ↗</a>';
      notFoundEl.style.display = 'block';
    } else {
      notFoundEl.style.display = 'none';
    }
  }

  panel.hidden = false;
}
