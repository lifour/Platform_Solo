# 六祖坛经 · 阅藏 Web

以经折装阅读为核心的《六祖坛经》Web 应用，视觉和交互与 TanJing iOS App 保持一致。支持藏经阁、宗宝本与敦煌本对照、拼音、繁简、全文搜索、阅读笔记、排版设置和阅读进度恢复。

## 本地开发

```bash
npm install
npm run dev
```

生产构建与项目检查：

```bash
npm run check
npm run build
```

## 项目结构

- `index.html`：应用语义结构
- `css/sutra.css`：阅读器及响应式界面
- `js/main.js`：渲染、搜索、导航和本地状态
- `data/`：经文、拼音、词典及云端经库目录
- `fonts/`、`icons/`：本地字体和界面图标
- `android/`：Capacitor Android 容器

`dist/`、`node_modules/` 和 Capacitor 同步产物不纳入版本控制。
