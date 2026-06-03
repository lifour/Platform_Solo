/**
 * toggles.js — 顶栏功能按钮接线
 *
 * 对照模式、注音模式、下载功能的按钮点击处理。
 */
import { store } from './store.js';
import { applyCompareMode } from './settings.js';
import { rerender } from './render.js';

export function setupToggles() {
  const compareBtn = document.getElementById('compare-btn');
  const pinyinBtn = document.getElementById('pinyin-btn');
  const downloadBtn = document.getElementById('download-zongbao-btn');

  // 对照按钮
  if (compareBtn) {
    if (!store.get('dunhuangAvailable')) {
      compareBtn.disabled = true;
      compareBtn.title = '敦煌本数据未载入';
    }
    compareBtn.addEventListener('click', () => {
      if (!store.get('dunhuangAvailable')) return;
      applyCompareMode(!store.get('compareMode'));
      const compareCheckbox = document.getElementById('setting-compare-mode');
      if (compareCheckbox) compareCheckbox.checked = store.get('compareMode');
      rerender();
    });
  }

  // 注音按钮
  if (pinyinBtn) {
    if (!store.get('pinyinAvailable')) {
      pinyinBtn.disabled = true;
      pinyinBtn.title = '拼音数据未载入';
    }
    pinyinBtn.addEventListener('click', () => {
      if (!store.get('pinyinAvailable')) return;
      const newMode = !store.get('pinyinMode');
      store.set('pinyinMode', newMode);
      pinyinBtn.classList.toggle('active', newMode);
      rerender();
    });
  }

  // 下载按钮
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const link = document.createElement('a');
      link.href = 'data/zongbao.json';
      link.download = 'liuzu-dashi-fabao-tanjing-zongbao.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }
}
