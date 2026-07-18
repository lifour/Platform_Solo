/**
 * settings.js — 设置管理与持久化
 *
 * 负责：
 * 1. 显示模式、对照模式、界面语言的持久化
 * 2. 字体大小/行距/字体风格的读写
 * 3. 设置面板的 UI 事件接线
 */

import { store } from './store.js';
import { UI_STRINGS, toTraditional } from './ui-language.js';
import { rerender } from './render.js';
import { updateScrollPadding } from './scroll.js';

const TRADITIONAL_PREF_KEY = 'ui_traditional_v2';
const COMPARE_MODE_PREF_KEY = 'ui_compare_mode';
const DEFAULT_EDITION_MIGRATION_KEY = 'ui_default_edition_v1';

// ---- 显示模式 ----

export function applyDisplayMode(mode) {
  const actual = mode === 'paged' ? 'paged' : 'scroll';
  store.set('displayMode', actual);
  document.body.classList.toggle('mode-scroll', actual === 'scroll');
  document.body.classList.toggle('mode-paged', actual === 'paged');
  try { localStorage.setItem('ui_display_mode', actual); } catch (_) {}
}

export function initDisplayMode() {
  let saved = 'scroll';
  try { const stored = localStorage.getItem('ui_display_mode'); if (stored) saved = stored; } catch (_) {}
  applyDisplayMode(saved);
}

// ---- 对照模式 ----

export function applyCompareMode(enabled) {
  const val = !!enabled;
  store.set('compareMode', val);
  try { localStorage.setItem(COMPARE_MODE_PREF_KEY, val ? '1' : '0'); } catch (_) {}
  const cb = document.getElementById('compare-btn');
  if (cb) cb.classList.toggle('active', val);
}

export function initCompareMode() {
  let val = false;
  try {
    const migrated = localStorage.getItem(DEFAULT_EDITION_MIGRATION_KEY);
    if (migrated !== '1') {
      localStorage.setItem(COMPARE_MODE_PREF_KEY, '0');
      localStorage.setItem(DEFAULT_EDITION_MIGRATION_KEY, '1');
    } else {
      const stored = localStorage.getItem(COMPARE_MODE_PREF_KEY);
      if (stored !== null) val = (stored === '1' || stored === 'true');
    }
  } catch (_) {}
  applyCompareMode(val);
}

// ---- 界面语言 ----

export function applyUILanguage(useTraditional) {
  store.set('useTraditional', useTraditional);
  const conv = s => useTraditional ? toTraditional(s) : s;
  try {
    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const setTitle = (id, title) => { const el = document.getElementById(id); if (el) { el.title = title; el.setAttribute('aria-label', title); } };

    const titleEl = document.querySelector('.topbar-title');
    if (titleEl) titleEl.textContent = conv(UI_STRINGS.topbarTitle);

    const ab = document.getElementById('actions-menu-btn');
    if (ab) { ab.textContent = UI_STRINGS.actionsBtnText; ab.title = conv(UI_STRINGS.actionsBtnTitle); ab.setAttribute('aria-label', conv(UI_STRINGS.actionsBtnTitle)); }

    const cb = document.getElementById('compare-btn');
    if (cb) { cb.textContent = conv(UI_STRINGS.compareBtnText); cb.title = conv(UI_STRINGS.compareBtnTitle); }

    const pb = document.getElementById('pinyin-btn');
    if (pb) { pb.textContent = conv(UI_STRINGS.pinyinBtnText); pb.title = conv(UI_STRINGS.pinyinBtnTitle); }

    const ss = document.getElementById('top-search-settings');
    if (ss) { ss.textContent = conv(UI_STRINGS.settingsBtnText); ss.title = conv(UI_STRINGS.settingsBtnText); ss.setAttribute('aria-label', conv(UI_STRINGS.settingsBtnText)); }

    const si = document.getElementById('search-input');
    if (si) si.placeholder = conv(UI_STRINGS.searchPlaceholder);

    const sp = document.querySelector('.side-panel-title');
    if (sp) sp.textContent = conv(UI_STRINGS.sidePanelTitle);

    const msi = document.getElementById('mobile-search-input');
    if (msi) msi.placeholder = conv(UI_STRINGS.mobileSearchPlaceholder);

    const mch = document.querySelector('.mobile-chapter-heading');
    if (mch) mch.textContent = conv(UI_STRINGS.mobileChapterHeading);

    const st = document.querySelector('.settings-title');
    if (st) st.textContent = conv(UI_STRINGS.settingsTitle);

    const displaySelect = document.getElementById('display-mode-select');
    if (displaySelect) {
      const opt0 = displaySelect.querySelector('option[value="scroll"]');
      if (opt0) opt0.textContent = conv(UI_STRINGS.displayModeScroll);
      const opt1 = displaySelect.querySelector('option[value="paged"]');
      if (opt1) opt1.textContent = conv(UI_STRINGS.displayModePaged);
    }

    const resetBtn = document.getElementById('settings-reset');
    if (resetBtn) resetBtn.textContent = conv(UI_STRINGS.settingsReset);

    const compareLabel = document.querySelector('label.checkbox-label');
    if (compareLabel) {
      const inp = compareLabel.querySelector('input');
      compareLabel.textContent = '';
      if (inp) compareLabel.appendChild(inp);
      compareLabel.appendChild(document.createTextNode(' ' + conv(UI_STRINGS.compareModeLabel)));
    }

    const chapterSelect = document.getElementById('chapter-select');
    if (chapterSelect) {
      const opt = chapterSelect.querySelector('option[value=""]');
      if (opt) opt.textContent = conv(UI_STRINGS.chapterPlaceholder);
    }
  } catch (_) { /* ignore UI update errors */ }

  if (store.get('hasRendered')) rerender();
}

export function initUILanguage() {
  let useTrad = false;
  try { useTrad = localStorage.getItem(TRADITIONAL_PREF_KEY) === '1'; } catch (_) {}
  applyUILanguage(useTrad);
  try {
    const chk = document.getElementById('setting-traditional-mode');
    if (chk) chk.checked = useTrad;
  } catch (_) {}
}

// ---- 字体/行距 ----

const DEFAULT_FONT_PX = 18;
const DEFAULT_LINE_HEIGHT = 2;
const SETTINGS_KEYS = { fontPx: 'ui_font_px', lineHeight: 'ui_line_height', fontFamily: 'ui_font_family' };

function applySettings(fontPx, lineHeight) {
  document.documentElement.style.setProperty('--base-font-size', fontPx + 'px');
  document.documentElement.style.setProperty('--base-line-height', lineHeight);
  store.set('fontSize', fontPx);
  store.state._lineHeight = lineHeight;

  // 同步更新 UI 数值标签
  const fv = document.getElementById('font-size-value');
  const lv = document.getElementById('line-height-value');
  const fr = document.getElementById('font-size-range');
  const lr = document.getElementById('line-height-range');
  if (fv) fv.textContent = fontPx + 'px';
  if (lv) lv.textContent = lineHeight.toFixed(2);
  if (fr) fr.value = fontPx;
  if (lr) lr.value = lineHeight;

  // 字体变化会影响顶栏高度，同步更新滚动内边距
  setTimeout(() => updateScrollPadding(), 50);

  try {
    localStorage.setItem(SETTINGS_KEYS.fontPx, fontPx.toString());
    localStorage.setItem(SETTINGS_KEYS.lineHeight, lineHeight.toString());
  } catch (_) {}
}

/**
 * 初始化设置面板事件绑定
 */
export function setupSettingsPanel() {
  // ---- DOM refs ----
  const fontSizeRange = document.getElementById('font-size-range');
  const fontSizeDecr = document.getElementById('font-size-decr');
  const fontSizeIncr = document.getElementById('font-size-incr');
  const fontSizeValue = document.getElementById('font-size-value');
  const fontSelect = document.getElementById('font-select');
  const lineHeightRange = document.getElementById('line-height-range');
  const lineHeightDecr = document.getElementById('line-height-decr');
  const lineHeightIncr = document.getElementById('line-height-incr');
  const lineHeightValue = document.getElementById('line-height-value');
  const settingsReset = document.getElementById('settings-reset');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsBack = document.getElementById('settings-back');
  const topSettingsBtn = document.getElementById('top-search-settings');
  const panelOverlay = document.getElementById('panel-overlay');
  const displaySelect = document.getElementById('display-mode-select');
  const compareCheckbox = document.getElementById('setting-compare-mode');
  const tradChk = document.getElementById('setting-traditional-mode');

  // ---- 字体 ----
  (function initFont() {
    let f = DEFAULT_FONT_PX, lh = DEFAULT_LINE_HEIGHT;
    try {
      const sf = localStorage.getItem(SETTINGS_KEYS.fontPx);
      const sl = localStorage.getItem(SETTINGS_KEYS.lineHeight);
      if (sf) f = parseInt(sf, 10);
      if (sl) lh = parseFloat(sl);
    } catch (_) {}
    applySettings(f, lh);
  })();

  if (fontSizeRange) {
    fontSizeRange.addEventListener('input', () => {
      applySettings(parseInt(fontSizeRange.value, 10), parseFloat(lineHeightRange?.value || DEFAULT_LINE_HEIGHT));
    });
  }
  if (lineHeightRange) {
    lineHeightRange.addEventListener('input', () => {
      applySettings(parseInt(fontSizeRange?.value || DEFAULT_FONT_PX, 10), parseFloat(lineHeightRange.value));
    });
  }
  if (fontSizeDecr) fontSizeDecr.addEventListener('click', () => {
    const v = Math.max(12, parseInt(fontSizeRange?.value || DEFAULT_FONT_PX, 10) - 1);
    applySettings(v, parseFloat(lineHeightRange?.value || DEFAULT_LINE_HEIGHT));
  });
  if (fontSizeIncr) fontSizeIncr.addEventListener('click', () => {
    const v = Math.min(28, parseInt(fontSizeRange?.value || DEFAULT_FONT_PX, 10) + 1);
    applySettings(v, parseFloat(lineHeightRange?.value || DEFAULT_LINE_HEIGHT));
  });
  if (lineHeightDecr) lineHeightDecr.addEventListener('click', () => {
    const v = Math.max(1, parseFloat(lineHeightRange?.value || DEFAULT_LINE_HEIGHT) - 0.05);
    applySettings(parseInt(fontSizeRange?.value || DEFAULT_FONT_PX, 10), parseFloat(v.toFixed(2)));
  });
  if (lineHeightIncr) lineHeightIncr.addEventListener('click', () => {
    const v = Math.min(2.6, parseFloat(lineHeightRange?.value || DEFAULT_LINE_HEIGHT) + 0.05);
    applySettings(parseInt(fontSizeRange?.value || DEFAULT_FONT_PX, 10), parseFloat(v.toFixed(2)));
  });

  // ---- 字体选择 ----
  if (fontSelect) {
    try {
      const storedFont = localStorage.getItem(SETTINGS_KEYS.fontFamily);
      if (storedFont) fontSelect.value = storedFont;
      fontSelect.addEventListener('change', () => {
        const val = fontSelect.value;
        document.documentElement.style.setProperty('--font-main', val);
        try { localStorage.setItem(SETTINGS_KEYS.fontFamily, val); } catch (_) {}
      });
      if (storedFont) document.documentElement.style.setProperty('--font-main', storedFont);
    } catch (_) {}
  }

  // ---- 显示模式 ----
  if (displaySelect) {
    displaySelect.value = store.get('displayMode');
    displaySelect.addEventListener('change', () => applyDisplayMode(displaySelect.value));
  }

  // ---- 对照模式 checkbox ----
  if (compareCheckbox) {
    compareCheckbox.checked = !!store.get('compareMode');
    compareCheckbox.addEventListener('change', () => {
      applyCompareMode(compareCheckbox.checked);
      rerender();
    });
  }

  // ---- 繁体 UI toggle ----
  if (tradChk) {
    try { tradChk.checked = localStorage.getItem(TRADITIONAL_PREF_KEY) === '1'; } catch (_) {}
    tradChk.addEventListener('change', () => {
      const v = !!tradChk.checked;
      try {
        localStorage.setItem(TRADITIONAL_PREF_KEY, v ? '1' : '0');
        localStorage.removeItem('ui_traditional');
      } catch (_) {}
      applyUILanguage(v);
    });
  }

  // ---- 面板打开/关闭 ----
  if (settingsBack) {
    settingsBack.addEventListener('click', () => {
      if (settingsPanel) settingsPanel.hidden = true;
      if (panelOverlay) panelOverlay.hidden = true;
    });
  }
  if (topSettingsBtn) {
    topSettingsBtn.addEventListener('click', () => {
      if (settingsPanel) settingsPanel.hidden = false;
      if (panelOverlay) panelOverlay.hidden = false;
    });
  }

  // ---- 恢复默认 ----
  if (settingsReset) {
    settingsReset.addEventListener('click', () => {
      applySettings(DEFAULT_FONT_PX, DEFAULT_LINE_HEIGHT);
    });
  }
}
