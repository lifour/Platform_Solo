/**
 * tts.js — 跨平台朗读引擎
 *
 * 优先使用 Web Speech API（标准浏览器/部分 Android WebView），
 * 不支持时降级到 Capacitor TTS 原生插件（Android）。
 */
import { Capacitor } from '@capacitor/core';

let _webSpeechOk = false;

// 检测 Web Speech API 是否可用
try {
  _webSpeechOk = !!(window.speechSynthesis && window.speechSynthesis.getVoices);
} catch (_) {}

/**
 * 朗读文字
 */
export async function speak(text, options = {}) {
  const rate = options.rate || 0.85;
  const pitch = options.pitch || 0.8;
  const volume = options.volume || 0.8;
  const lang = options.lang || 'zh-CN';

  if (_webSpeechOk) {
    return speakWeb(text, rate, pitch, volume);
  }

  // 只在原生平台降级到 Capacitor TTS
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await TextToSpeech.speak({ text, lang: 'zh-CN', rate, pitch, volume });
    return 'capacitor';
  } catch (_) {
    // TTS 不可用时静默失败
  }
}

/**
 * 停止朗读
 */
export async function stop() {
  if (_webSpeechOk) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
    return;
  }
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await TextToSpeech.stop();
  } catch (_) {}
}

/**
 * 暂停
 */
export async function pause() {
  if (_webSpeechOk) {
    try { window.speechSynthesis.pause(); } catch (_) {}
    return;
  }
  if (!Capacitor.isNativePlatform()) return;
  try { await stop(); } catch (_) {}
}

/**
 * 恢复
 */
export async function resume() {
  if (_webSpeechOk) {
    try { window.speechSynthesis.resume(); } catch (_) {}
    return;
  }
}

/**
 * 获取可用语音列表（仅 Web Speech）
 */
export function getVoices() {
  if (!_webSpeechOk) return [];
  try { return window.speechSynthesis.getVoices(); } catch (_) { return []; }
}

/**
 * 设置语音变化回调
 */
export function onVoicesChanged(callback) {
  if (!_webSpeechOk) return;
  try { window.speechSynthesis.onvoiceschanged = callback; } catch (_) {}
}

/**
 * Web Speech API 朗读
 */
function speakWeb(text, rate, pitch, volume) {
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = rate;
      u.pitch = pitch;
      u.volume = volume;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    } catch (_) { resolve(); }
  });
}
