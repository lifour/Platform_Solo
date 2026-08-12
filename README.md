# Platform_Solo · 阅藏

佛经数字阅读器。支持《六祖坛经》（宗宝本 + 敦煌本对照）、《无门关》、《文明之光》，拼音注音、术语查词、高亮标注、笔记、朗读。

---

## 一、环境准备（一次性的）

### 1. 安装 VS Code
https://code.visualstudio.com/

### 2. 安装 Git
https://git-scm.com/download/win

### 3. 安装 Node.js 20+
https://nodejs.org/ （选 LTS 版本）

### 4. 克隆项目
打开终端（PowerShell 或 Git Bash）：
```bash
git clone https://github.com/lifour/Platform_Solo.git
cd Platform_Solo
npm install
```

---

## 二、日常开发流程

### 每次开始工作前

**对 AI 这样说：**
> 我要开始开发 Platform_Solo 项目了。帮我拉最新代码，启动本地预览。

AI 会执行：
```bash
git pull
npm run dev
```

浏览器打开 `http://localhost:5173`，改代码自动刷新。

### 开发中

让 AI 帮你写代码 —— 直接描述你想要的效果：

> 把搜索栏的背景色改成白色

> 在顶栏加一个新按钮，点击后显示"收藏"面板

> 有一个 bug：点击搜索结果后页面不会跳转到对应位置，帮我修复

AI 会帮你找到对应文件、写出代码、解释改了什么。**你在浏览器里确认效果**。

### 完成一个功能后

**对 AI 这样说：**
> 这个功能做完了，帮我提交代码。

AI 会执行：
```bash
git add .
git commit -m "描述你做了什么"
git push
```

### 每天凌晨 4 点服务器自动更新

push 之后不需要任何操作，网站 `https://sutra.onemooring.xyz` 自动同步。

---

## 三、常用 AI 指令模板

| 场景 | 对 AI 说的话 |
|------|-------------|
| 开始工作 | "帮我拉代码，启动项目" |
| 改样式 | "把 xxx 的颜色改成 yyy" |
| 加功能 | "在 xxx 页面加一个按钮，点击后弹出 yyy" |
| 修 bug | "有一个问题：xxx，帮我找出原因并修复" |
| 看不懂代码 | "这段代码是做什么的，解释一下" |
| 看项目结构 | "这个项目有哪些文件，各自负责什么" |
| 提交代码 | "帮我提交代码，消息写 xxx" |
| 打包 APK | "帮我打包安卓 APK" |

---

## 四、项目结构

```
Platform_Solo/
├── index.html           # 主页面
├── js/                  # JavaScript 代码
│   ├── app.js           # 应用入口（初始化）
│   ├── search.js        # 全文搜索
│   ├── search-engine.js # 模糊搜索索引
│   ├── render.js        # 经文渲染
│   ├── reader.js        # 朗读功能
│   ├── tts.js           # 朗读引擎（跨平台）
│   ├── external-lookup.js  # 查字/查词
│   ├── tooltip.js       # 术语悬浮提示
│   ├── selection-toolbar.js # 划词工具栏
│   ├── highlight.js     # 高亮标注
│   ├── notes.js         # 笔记
│   ├── bookmarks.js     # 书签
│   ├── settings.js      # 设置
│   ├── data.js          # 数据加载
│   ├── store.js         # 状态管理
│   ├── pagination.js    # 翻页模式
│   ├── scroll.js        # 滚动控制
│   ├── db.js            # IndexedDB 本地存储
│   └── ...
├── css/                 # 样式文件
├── data/                # 经文数据（JSON 格式）
│   ├── zongbao.json     # 宗宝本
│   ├── dunhuang.json    # 敦煌本
│   ├── wumenguan.json   # 无门关
│   ├── glossary.json    # 佛学术语词典
│   └── pinyin.json      # 拼音映射
├── fonts/               # 字体文件
├── release/             # 打包好的 APK
├── start.bat            # Windows 一键启动
├── Dockerfile           # Docker 部署配置
├── nginx.conf           # Nginx 配置
└── docker-compose.yml   # Docker 编排
```

---

## 五、打包安卓 APK

**需要先装 Android Studio**（一次性的）。装好后对 AI 说：

> 帮我打包 APK

AI 会执行 `npm run release`，生成的文件在 `release/` 目录。

---

## 六、遇到问题怎么办

1. **把报错信息发给 AI**，大部分问题 AI 能直接解决
2. **常见问题**：
   - `npm install` 报错 → 删 `node_modules` 文件夹重新 `npm install`
   - 页面打不开 → 确认 `npm run dev` 在运行
   - git push 报错 → 先 `git pull` 再 `git push`

---

## 七、线上地址

- 网页版：`https://sutra.onemooring.xyz`
- 服务器：腾讯云 Ubuntu，每天 4 点自动从 main 分支部署
