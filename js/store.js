/**
 * store.js — 集中式状态管理（事件订阅/发布）
 *
 * 所有模块通过 `store` 单例读写全局状态。
 * store.set(key, value) 自动触发 `${key}:changed` 事件。
 *
 * 使用示例：
 *   import { store } from './store.js';
 *   store.set('compareMode', true);
 *   store.on('compareMode:changed', (val) => render());
 */
class Store {
  constructor() {
    this._state = {};
    this._listeners = {};
  }

  /** 返回全部状态（只读引用） */
  get state() {
    return this._state;
  }

  /** 读取单个键 */
  get(key) {
    return this._state[key];
  }

  /** 设置单个键，自动触发 ${key}:changed 事件 */
  set(key, value) {
    const old = this._state[key];
    if (old === value) return;
    this._state[key] = value;
    this.emit(`${key}:changed`, value, old);
  }

  /** 批量更新（触发每个变更键的事件） */
  update(partial) {
    for (const [key, value] of Object.entries(partial)) {
      const old = this._state[key];
      if (old === value) continue;
      this._state[key] = value;
      this.emit(`${key}:changed`, value, old);
    }
  }

  /** 订阅事件 */
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    return () => this.off(event, callback); // 返回取消函数
  }

  /** 一次性订阅 */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    return this.on(event, wrapper);
  }

  /** 取消订阅 */
  off(event, callback) {
    const cbs = this._listeners[event];
    if (!cbs) return;
    const idx = cbs.indexOf(callback);
    if (idx !== -1) cbs.splice(idx, 1);
  }

  /** 内部：触发事件 */
  emit(event, ...args) {
    const cbs = this._listeners[event];
    if (cbs) cbs.slice().forEach(fn => fn(...args));
  }

  /** 移除某事件全部监听器 */
  clear(event) {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
  }
}

export const store = new Store();
