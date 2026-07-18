/**
 * reader.js — 朗读功能
 *
 * 使用 tts.js 双引擎（Web Speech API / Capacitor 原生 TTS）
 * 底部控制条、句子高亮跟踪、语速调节
 */

import { speak as ttsSpeak, stop as ttsStop, pause as ttsPause, resume as ttsResume } from './tts.js';

const SENTENCE_SPLIT = /[。！？」）\n]/;
let sentences = [];
let currentIdx = 0;
let isPlaying = false;
let isPaused = false;
let _speaking = false;

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
    if (isPlaying || isPaused) {
      if (visiblePara) readFromParagraph(visiblePara);
      else showReaderBar();
      return;
    }
    if (visiblePara) readFromParagraph(visiblePara);
    else startReading();
  });

  if (playBtn) playBtn.addEventListener('click', togglePlay);
  if (prevBtn) prevBtn.addEventListener('click', prevSentence);
  if (nextBtn) nextBtn.addEventListener('click', nextSentence);
  if (closeBtn) closeBtn.addEventListener('click', stopReading);
  if (speedSelect) speedSelect.addEventListener('change', updateSpeed);

  document.querySelector('.scroll-container')?.addEventListener('click', (e) => {
    const para = e.target.closest('.para');
    if (!para || e.target.closest('.term')) return;
    const bar = document.getElementById('reader-bar');
    if (!bar || bar.hidden) return;
    e.stopPropagation();
    readFromParagraph(para);
  });

  const progressBar = document.getElementById('reader-progress');
  if (progressBar) {
    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const idx = Math.floor(((e.clientX - rect.left) / rect.width) * sentences.length);
      if (idx >= 0 && idx < sentences.length) {
        currentIdx = idx;
        ttsStop();
        if (isPlaying || isPaused) speak();
        else { clearHighlights(); highlightSentence(sentences[currentIdx]?.el, sentences[currentIdx]?.text); updateProgress(); }
      }
    });
  }
}

function showReaderBar() { const bar = document.getElementById('reader-bar'); if (bar) bar.hidden = false; }
function hideReaderBar() { const bar = document.getElementById('reader-bar'); if (bar) bar.hidden = true; }

export function startReading() {
  const container = document.querySelector('.scroll-container');
  if (!container) return;
  const p = findVisibleParagraph(container);
  if (p) readFromParagraph(p);
}

export function readFromParagraph(paraEl) {
  if (!paraEl) return;
  const container = document.querySelector('.scroll-container');
  if (!container) return;
  clearHighlights();
  sentences = splitParagraphs(container);
  currentIdx = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].el === paraEl) { currentIdx = i; break; }
  }
  showReaderBar();
  isPlaying = false; isPaused = false;
  ttsStop();
  speak();
}

async function speak() {
  if (!sentences.length || currentIdx >= sentences.length) { stopReading(); return; }
  const s = sentences[currentIdx];
  if (!s || !s.text.trim()) { nextSentence(); return; }

  clearHighlights();
  highlightSentence(s.el, s.text);
  isPlaying = true; isPaused = false;
  _speaking = true;
  updatePlayButton();
  updateStatus();
  s.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateProgress();

  try {
    await ttsSpeak(s.text, {
      rate: parseFloat(document.getElementById('reader-speed')?.value || '1'),
      pitch: 0.8,
      volume: 0.8,
      lang: 'zh-CN',
    });
  } catch (_) {
    updateStatus('朗读不可用');
    isPlaying = false;
    updatePlayButton();
    _speaking = false;
    return;
  }

  _speaking = false;
  if (isPlaying) nextSentence();
}

function togglePlay() {
  if (isPaused) {
    isPaused = false; isPlaying = true;
    ttsResume();
    updatePlayButton(); updateStatus();
  } else if (isPlaying) {
    isPaused = true; isPlaying = false;
    ttsPause();
    updatePlayButton(); updateStatus('已暂停');
  }
}

function prevSentence() {
  if (currentIdx > 0) currentIdx--;
  else currentIdx = 0;
  ttsStop(); _speaking = false;
  if (isPlaying || isPaused) speak();
  else highlightSentence(sentences[currentIdx]?.el, sentences[currentIdx]?.text);
}

function nextSentence() {
  if (_speaking) return;
  if (currentIdx < sentences.length - 1) currentIdx++;
  else { stopReading(); return; }
  ttsStop();
  if (isPlaying || isPaused) speak();
  else highlightSentence(sentences[currentIdx]?.el, sentences[currentIdx]?.text);
}

function updateSpeed() {
  // 语速在下次 speak 时生效（从 speed-select 读取）
}

export function stopReading() {
  ttsStop(); _speaking = false;
  isPlaying = false; isPaused = false;
  clearHighlights();
  hideReaderBar();
  updatePlayButton();
}

function updatePlayButton() {
  const btn = document.getElementById('reader-play');
  if (btn) btn.textContent = isPlaying ? '⏸' : '▶';
}

function updateStatus(text) {
  const el = document.getElementById('reader-status');
  if (!el) return;
  if (text) { el.textContent = text; return; }
  const s = sentences[currentIdx];
  el.textContent = s ? s.text.slice(0, 30) + (s.text.length > 30 ? '…' : '') : '已就绪';
}

function updateProgress() {
  const fill = document.getElementById('reader-progress-fill');
  const label = document.getElementById('reader-progress-label');
  if (fill) fill.style.width = (sentences.length > 0 ? (currentIdx / sentences.length) * 100 : 0) + '%';
  if (label) label.textContent = (currentIdx + 1) + '/' + sentences.length;
}

// ---- 段落与句子处理 ----

function findVisibleParagraph(container) {
  const scrollCenter = container.scrollLeft + container.clientWidth / 2;
  const scrollTop = container.scrollTop + container.clientHeight / 3;
  let best = null, bestDist = Infinity;
  container.querySelectorAll('.para').forEach(p => {
    const rect = p.getBoundingClientRect();
    const dist = Math.abs(rect.left + rect.width / 2 - scrollCenter) + Math.abs(rect.top + rect.height / 2 - scrollTop);
    if (dist < bestDist) { bestDist = dist; best = p; }
  });
  return best;
}

function splitParagraphs(container) {
  const result = [];
  container.querySelectorAll('.para').forEach(p => {
    (splitText(p.textContent || '')).forEach(part => {
      if (part.trim()) result.push({ el: p, text: part.trim() });
    });
  });
  return result;
}

function splitText(text) {
  const result = []; let last = 0;
  for (let i = 0; i < text.length; i++) {
    if (SENTENCE_SPLIT.test(text[i])) { result.push(text.slice(last, i + 1)); last = i + 1; }
  }
  if (last < text.length) result.push(text.slice(last));
  return result.filter(s => s.trim());
}

// ---- 高亮 ----

let _activePara = null;

function highlightSentence(paraEl, _text) {
  clearHighlights();
  if (!paraEl) return;
  paraEl.classList.add('read-active');
  _activePara = paraEl;
  paraEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearHighlights() {
  if (_activePara) {
    _activePara.classList.remove('read-active');
    _activePara = null;
  }
  document.querySelectorAll('mark.read-highlight').forEach(m => {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });
}
