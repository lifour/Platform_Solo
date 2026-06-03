/**
 * reader.js — 朗读功能（Web Speech API）
 *
 * 点击顶栏 🎙️ → 从当前可见段落开始朗读
 * 底部控制条支持：播放/暂停、上一句/下一句、语速调节
 * 正在朗读的句子高亮跟踪
 */

const SENTENCE_SPLIT = /[。！？」）\n]/;
let sentences = [];
let currentIdx = 0;
let isPlaying = false;
let isPaused = false;
let utterance = null;
let preferredVoice = null;

// 异步加载语音列表
function loadVoices() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    preferredVoice = voices.find(v =>
      v.lang.startsWith('zh') && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Tingting') || v.name.includes('Yue') || v.name.includes('Mei'))
    ) || voices.find(v => v.lang.startsWith('zh')) || voices[0];
  }
}
loadVoices();
if (window.speechSynthesis.onvoiceschanged !== undefined) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

/**
 * 初始化朗读功能
 */
export function setupReader() {
  const btn = document.getElementById('read-btn');
  const playBtn = document.getElementById('reader-play');
  const prevBtn = document.getElementById('reader-prev');
  const nextBtn = document.getElementById('reader-next');
  const closeBtn = document.getElementById('reader-close');
  const speedSelect = document.getElementById('reader-speed');

  if (!btn) return;

  btn.addEventListener('click', () => {
    const container = document.querySelector('.scroll-container');
    if (!container) return;
    const visiblePara = findVisibleParagraph(container);
    // 如果正在朗读，跳转到当前可见段落重新开始
    if (isPlaying || isPaused) {
      if (visiblePara) readFromParagraph(visiblePara);
      else { showReaderBar(); }
      return;
    }
    if (visiblePara) readFromParagraph(visiblePara);
    else startReading();
  });

  if (playBtn) playBtn.addEventListener('click', togglePlay);
  if (prevBtn) prevBtn.addEventListener('click', prevSentence);
  if (nextBtn) nextBtn.addEventListener('click', nextSentence);
  if (closeBtn) closeBtn.addEventListener('click', stopReading);

  // 进度条点击跳转
  const progressBar = document.getElementById('reader-progress');
  if (progressBar) {
    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const idx = Math.floor(pct * sentences.length);
      if (idx >= 0 && idx < sentences.length) {
        currentIdx = idx;
        window.speechSynthesis.cancel();
        if (isPlaying || isPaused) speak();
        else {
          clearHighlights();
          highlightSentence(sentences[currentIdx]?.el, sentences[currentIdx]?.text);
          updateProgress();
        }
      }
    });
  }
  if (speedSelect) speedSelect.addEventListener('change', updateSpeed);

  // 点击段落 → 从该段开始读
  document.querySelector('.scroll-container')?.addEventListener('click', (e) => {
    const para = e.target.closest('.para');
    if (!para) return;
    // 忽略术语点击（术语有独立操作栏）
    if (e.target.closest('.term')) return;
    // 只有朗读条显示时才触发
    const bar = document.getElementById('reader-bar');
    if (!bar || bar.hidden) return;
    e.stopPropagation();
    readFromParagraph(para);
  });
}

function showReaderBar() {
  const bar = document.getElementById('reader-bar');
  if (bar) bar.hidden = false;
}

function hideReaderBar() {
  const bar = document.getElementById('reader-bar');
  if (bar) bar.hidden = true;
}

/**
 * 开始朗读：从当前可见的第一个段落开始
 */
export function startReading() {
  const container = document.querySelector('.scroll-container');
  if (!container) return;

  const visiblePara = findVisibleParagraph(container);
  if (!visiblePara) return;

  // 重置高亮
  clearHighlights();

  // 按句子拆分段落
  sentences = splitParagraphs(container);
  currentIdx = 0;

  // 找到可见段落对应的句子起始
  const paraText = visiblePara.textContent || '';
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].text.includes(paraText.slice(0, 10))) {
      currentIdx = i;
      break;
    }
  }

  showReaderBar();
  updateStatus();
  speak();
}

/**
 * 从指定段落开始朗读
 */
export function readFromParagraph(paraEl) {
  if (!paraEl) return;
  const container = document.querySelector('.scroll-container');
  if (!container) return;

  clearHighlights();
  sentences = splitParagraphs(container);

  // 找到该段落在句子列表中的位置
  const paraText = paraEl.textContent || '';
  currentIdx = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].el === paraEl) {
      currentIdx = i;
      break;
    }
  }

  showReaderBar();
  isPlaying = false;
  isPaused = false;
  if (utterance) window.speechSynthesis.cancel();
  speak();
}

/**
 * 朗读当前句子
 */
function speak() {
  if (!sentences.length || currentIdx >= sentences.length) {
    stopReading();
    return;
  }

  const s = sentences[currentIdx];
  if (!s || !s.text.trim()) {
    nextSentence();
    return;
  }

  // 高亮当前句子
  clearHighlights();
  highlightSentence(s.el, s.text);

  // Web Speech API — 柔和参数
  window.speechSynthesis.cancel();

  utterance = new SpeechSynthesisUtterance(s.text);
  utterance.lang = 'zh-CN';
  utterance.rate = parseFloat(document.getElementById('reader-speed')?.value || '1');
  utterance.pitch = 0.6; // 降调，更柔和
  utterance.volume = 0.7;  // 略微降低音量

  if (preferredVoice) utterance.voice = preferredVoice;

  utterance.onend = () => {
    if (isPlaying) nextSentence();
  };
  utterance.onerror = (e) => {
    if (e.error !== 'canceled') {
      updateStatus('朗读出错');
      isPlaying = false;
      updatePlayButton();
    }
  };

  isPlaying = true;
  isPaused = false;
  updatePlayButton();
  updateStatus();

  // 滚动到当前句子
  s.el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  updateProgress();
  window.speechSynthesis.speak(utterance);
}

function togglePlay() {
  if (isPaused) {
    // 恢复
    isPaused = false;
    isPlaying = true;
    window.speechSynthesis.resume();
    updatePlayButton();
    updateStatus();
  } else if (isPlaying) {
    // 暂停
    isPaused = true;
    isPlaying = false;
    window.speechSynthesis.pause();
    updatePlayButton();
    updateStatus('已暂停');
  }
}

function prevSentence() {
  if (currentIdx > 0) currentIdx--;
  else currentIdx = 0;
  window.speechSynthesis.cancel();
  if (isPlaying || isPaused) speak();
  else highlightSentence(sentences[currentIdx]?.el, sentences[currentIdx]?.text);
}

function nextSentence() {
  if (currentIdx < sentences.length - 1) currentIdx++;
  else { stopReading(); return; }
  window.speechSynthesis.cancel();
  if (isPlaying || isPaused) speak();
  else highlightSentence(sentences[currentIdx]?.el, sentences[currentIdx]?.text);
}

function updateSpeed() {
  if (utterance && (isPlaying || isPaused)) {
    const rate = parseFloat(document.getElementById('reader-speed')?.value || '1');
    utterance.rate = rate;
    // 需要重新开始
    if (isPlaying) {
      window.speechSynthesis.cancel();
      speak();
    }
  }
}

export function stopReading() {
  window.speechSynthesis.cancel();
  isPlaying = false;
  isPaused = false;
  utterance = null;
  clearHighlights();
  hideReaderBar();
  updatePlayButton();
}

function updateProgress() {
  const fill = document.getElementById('reader-progress-fill');
  const label = document.getElementById('reader-progress-label');
  if (fill) fill.style.width = (sentences.length > 0 ? (currentIdx / sentences.length) * 100 : 0) + '%';
  if (label) label.textContent = (currentIdx + 1) + '/' + sentences.length;
}

function updatePlayButton() {
  const btn = document.getElementById('reader-play');
  if (!btn) return;
  btn.textContent = isPlaying ? '⏸' : '▶';
}

function updateStatus(text) {
  const el = document.getElementById('reader-status');
  if (!el) return;
  if (text) { el.textContent = text; return; }
  const s = sentences[currentIdx];
  if (s) el.textContent = s.text.slice(0, 30) + (s.text.length > 30 ? '…' : '');
  else el.textContent = '已就绪';
}

// ---- 段落与句子处理 ----

function findVisibleParagraph(container) {
  const scrollCenter = container.scrollLeft + container.clientWidth / 2;
  const scrollTop = container.scrollTop + container.clientHeight / 3;
  let best = null, bestDist = Infinity;

  container.querySelectorAll('.para').forEach(p => {
    const rect = p.getBoundingClientRect();
    const pCenter = rect.left + rect.width / 2;
    const pMid = rect.top + rect.height / 2;
    const dist = Math.abs(pCenter - scrollCenter) + Math.abs(pMid - scrollTop);
    if (dist < bestDist) { bestDist = dist; best = p; }
  });
  return best;
}

function splitParagraphs(container) {
  const result = [];
  container.querySelectorAll('.para').forEach(p => {
    const text = p.textContent || '';
    // 按句子分割
    const parts = splitText(text);
    parts.forEach(part => {
      if (part.trim()) result.push({ el: p, text: part.trim() });
    });
  });
  return result;
}

function splitText(text) {
  const result = [];
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    if (SENTENCE_SPLIT.test(text[i])) {
      result.push(text.slice(last, i + 1));
      last = i + 1;
    }
  }
  if (last < text.length) result.push(text.slice(last));
  return result.filter(s => s.trim());
}

// ---- 高亮 ----

function highlightSentence(paraEl, text) {
  if (!paraEl || !text) return;
  const full = paraEl.textContent || '';
  const idx = full.indexOf(text);
  if (idx === -1) return;

  const walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode = null, startOff = 0;
  let endNode = null, endOff = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const len = node.textContent.length;
    const nodeEnd = offset + len;

    if (!startNode && idx < nodeEnd) { startNode = node; startOff = idx - offset; }
    if (!endNode && idx + text.length <= nodeEnd) { endNode = node; endOff = idx + text.length - offset; break; }
    offset = nodeEnd;
  }
  if (!startNode || !endNode) return;

  try {
    const range = document.createRange();
    range.setStart(startNode, Math.max(0, startOff));
    range.setEnd(endNode, Math.max(0, endOff));
    const mark = document.createElement('mark');
    mark.className = 'read-highlight';
    range.surroundContents(mark);
    // 滚动到高亮位置
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (_) {}
}

function clearHighlights() {
  document.querySelectorAll('mark.read-highlight').forEach(m => {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });
}
