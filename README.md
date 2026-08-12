# Platform_Solo · 阅藏

佛经数字阅读器。支持《六祖坛经》（宗宝本 + 敦煌本对照）、《无门关》、《文明之光》，拼音注音、术语查词、高亮标注、笔记、朗读。

> **协作伙伴：** lifour（Windows + 安卓），xxx（Mac + 苹果）

---

## 团队协作统一规范

### 第一步：授权伙伴访问仓库

伙伴需要先有权限才能拉代码和提交。**由 lifour 操作一次：**

1. 打开 https://github.com/lifour/Platform_Solo/settings/access
2. 点 **"Add people"**
3. 输入伙伴的 GitHub 用户名或邮箱
4. 选 **"Write"** 权限（可以读写代码）
5. 点 **"Add"** 发送邀请

伙伴在 GitHub 注册一个账号（用邮箱免费注册），然后接受邀请邮件即可。

### 开发是否有区别

Windows 和 Mac **开发没有任何区别**：

| 方面 | 是否有区别 | 说明 |
|------|-----------|------|
| 命令 | ❌ 完全相同 | `git pull`、`npm run dev`、`npm run build` 两边一样 |
| 代码 | ❌ 完全相同 | 同一套 HTML/CSS/JS，Git 统一管理 |
| 样式 | ❌ 完全相同 | 网页看的是浏览器，不是操作系统 |
| 字体 | ❌ 完全相同 | 项目自带霞鹜文楷，不依赖系统字体 |
| 浏览器预览 | ❌ 完全相同 | 都是 `localhost:5173` |
| 启动脚本 | ✅ 不同 | Windows 双击 `start.bat`，Mac 终端执行 `bash start.sh` |
| 打包 APK | ✅ 仅 Windows | Mac 不需要，直接用网页测试或等上线 |

两个系统日常用的命令完全一样：

```bash
git pull          # 拉取最新代码
npm install        # 安装依赖（首次或新增依赖时）
npm run dev        # 启动本地预览 → 浏览器打开 localhost:5173
npm run build      # 构建生产版本
```

**启动项目**：

| 系统 | 方式 |
|------|------|
| Windows | 双击 `start.bat`，自动安装依赖并启动 |
| Mac | 终端执行 `bash start.sh`，自动安装依赖并启动 |
| 或手敲 | 以上命令任意系统通用 |

**Git 已配置统一换行符**（`.gitattributes`），两个系统编辑同一文件不会冲突。

---

## 一、环境准备（一次性的）

### Mac 电脑

1. 选一个 AI 编程工具（Codex / Cursor / Claude Code 等都可以）
2. 安装 **Git**：https://git-scm.com/download/mac
3. 安装 **Node.js 20+**：https://nodejs.org/ （选 LTS，装 `.pkg` 版本）
4. 打开终端（在"启动台 → 其他 → 终端"），粘贴：
   ```bash
   cd ~/Documents
   git clone https://github.com/lifour/Platform_Solo.git
   cd Platform_Solo
   npm install
   ```

### Windows 电脑

1. 选一个 AI 编程工具（Codex / Claude Code 等都可以）
2. 安装 **Git**：https://git-scm.com/download/win
3. 安装 **Node.js 20+**：https://nodejs.org/ （选 LTS）
4. 打开终端（PowerShell）：
   ```bash
   git clone https://github.com/lifour/Platform_Solo.git
   cd Platform_Solo
   npm install
   ```

---

## 二、日常开发流程

### 每次开始前

**对 AI 说：**
> 我要开始开发 Platform_Solo 了。帮我拉最新代码，启动预览。

AI 会执行：
```bash
git pull
npm run dev
```

浏览器打开 `http://localhost:5173`，改代码自动刷新。

### 开发中

直接告诉 AI 你想要什么效果，AI 帮你写代码：

> 把搜索栏的背景色改成白色

> 在顶栏加一个新按钮，点击后显示"收藏"面板

> 有一个 bug：点击搜索结果后页面不会跳转，帮我修复

**你在浏览器里确认效果。**

### 完成一个功能后

**对 AI 说：**
> 这个功能做完了，帮我提交代码。

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
| 打包 APK | "帮我打包安卓 APK"（仅 Windows） |

---

## 四、在手机上测试

### 苹果手机 / 安卓手机 通用方法

1. 确保手机和电脑在**同一个 WiFi**
2. 电脑上 `npm run dev` 运行后，终端会显示局域网地址，类似：
   ```
   Local:   http://localhost:5173
   Network: http://192.168.1.5:5173
   ```
3. 手机浏览器打开 `http://192.168.1.5:5173`（换成你的实际 IP）
4. 电脑上改代码，手机刷新页面就能看到最新效果

### 安卓手机（额外选项）

可以打包成 APK 安装：

> 帮我打包安卓 APK

需要先安装 Android Studio（一次性的），生成的文件在 `release/` 目录。

### 苹果手机（额外选项）

苹果不装 APK。最方便的方式就是用网页版。上线后访问：
> `https://sutra.onemooring.xyz`

---

## 五、项目结构

```
Platform_Solo/
├── index.html           # 主页面
├── js/                  # JavaScript 代码
│   ├── app.js           # 应用入口（初始化）
│   ├── search.js        # 全文搜索
│   ├── search-engine.js # 模糊搜索索引（Fuse.js）
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
├── data/                # 经文数据（JSON）
│   ├── zongbao.json     # 宗宝本
│   ├── dunhuang.json    # 敦煌本
│   ├── wumenguan.json   # 无门关
│   ├── glossary.json    # 佛学术语词典
│   └── pinyin.json      # 拼音映射
├── fonts/               # 字体
├── release/             # 打包好的 APK
├── start.bat            # Windows 一键启动
├── Dockerfile           # Docker 部署
├── nginx.conf           # Nginx 配置
└── docker-compose.yml   # Docker 编排
```

---

## 六、遇到问题

1. **把报错信息复制发给 AI**，大部分问题 AI 能直接解决
2. 常见自救：
   - `npm install` 报错 → 删掉 `node_modules` 文件夹，重新 `npm install`
   - 页面打不开 → 确认 `npm run dev` 在运行
   - git push 报错 → 先 `git pull` 再 `git push`

---

## 七、线上地址

- 网页版：`https://sutra.onemooring.xyz`
- 每天凌晨 4 点自动部署 main 分支
