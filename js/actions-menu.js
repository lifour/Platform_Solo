/**
 * actions-menu.js — 操作菜单接线
 *
 * 顶栏操作菜单按钮，包含统一标注面板入口。
 */
import { showAnnotationsPanel, hideAnnotationsPanel } from './annotations.js';

export function setupActionsMenu() {
  const menuBtn = document.getElementById('actions-menu-btn');
  const menuPanel = document.getElementById('actions-menu-panel');

  if (menuBtn && menuPanel) {
    function closeMenu() { menuPanel.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
    function openMenu() { menuPanel.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); }

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuPanel.hidden) openMenu();
      else closeMenu();
    });

    menuPanel.addEventListener('click', (e) => {
      e.stopPropagation();
      const actionButton = e.target.closest('button');
      if (actionButton && !actionButton.disabled) closeMenu();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.actions-menu')) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  // 菜单：搜索
  const menuSearch = document.getElementById('menu-search-btn');
  if (menuSearch) {
    menuSearch.addEventListener('click', () => {
      const searchBtn = document.getElementById('search-btn');
      if (searchBtn) searchBtn.click();
    });
  }

  // 菜单：朗读
  const menuRead = document.getElementById('menu-read-btn');
  if (menuRead) {
    menuRead.addEventListener('click', () => {
      const readBtn = document.getElementById('read-btn');
      if (readBtn) readBtn.click();
    });
  }

  // 统一标注面板入口
  const annoBtn = document.getElementById('annotations-btn');
  if (annoBtn) {
    annoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showAnnotationsPanel();
    });
  }

  // 标注面板返回
  const annoBack = document.getElementById('annotations-back');
  if (annoBack) {
    annoBack.addEventListener('click', () => hideAnnotationsPanel());
  }
}
