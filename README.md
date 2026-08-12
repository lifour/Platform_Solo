# Platform_Solo · 阅藏

佛经数字阅读器。支持《六祖坛经》（宗宝本 + 敦煌本对照）、《无门关》、《文明之光》，拼音注音、术语查词、高亮标注、笔记、朗读。

---

## 欢迎加入！

这是你和 lifour 一起开发的佛经阅读器。不用担心不会编程 —— 交给 AI 就行，你只需要告诉 AI 你想要什么。

### 第一步：让 lifour 给你开通权限

1. 去 [GitHub](https://github.com) 注册一个免费账号（用邮箱就行）
2. 把你的 GitHub 用户名发给 lifour
3. lifour 会邀请你加入项目，你点邮件里的链接接受邀请

完成这一步你就能访问代码了。

---

## 一、安装环境（只做一次）

| 工具 | Mac 下载 | Windows 下载 | 说明 |
|------|---------|-------------|------|
| AI 编程工具 | Codex / Cursor / Claude Code 选一个 | 同左 | 帮你写代码的 AI |
| Git | [下载](https://git-scm.com/download/mac) | [下载](https://git-scm.com/download/win) | 代码版本管理 |
| Node.js 20+ | [下载](https://nodejs.org/) 选 LTS `.pkg` 版 | [下载](https://nodejs.org/) 选 LTS | 运行环境 |

装好后，打开终端（Mac 在"启动台 → 其他 → 终端"，Windows 搜索"PowerShell"），依次粘贴以下命令：

```bash
cd ~/Documents                           # Mac 用这行
# cd C:\                               # Windows 用这行（去掉前面的 #）
git clone https://github.com/lifour/Platform_Solo.git
cd Platform_Solo
npm install
```

看到 `added xxx packages` 就说明安装成功了。以后不用再装。

---

## 二、启动项目

**告诉 AI：**
> 启动项目

AI 会帮你执行：
```bash
git pull          # 拉最新代码
npm run dev       # 启动
```

浏览器打开 `http://localhost:5173` 就能看到经文阅读器了。**改任何代码保存后页面自动刷新**，不需要手动刷新。

---

## 三、日常开发（就是这样循环）

### 1. 开始今天的工作

> 我要开始开发了，拉代码，启动项目。

### 2. 告诉 AI 你想要什么

> 把标题改成红色

> 在搜索框右边加一个"清空"按钮

> 查词面板弹出来之后马上又消失了，帮我修

### 3. 在浏览器确认效果

改对了就继续，不对就告诉 AI 哪里不对。

### 4. 完成后提交

> 提交代码，消息写：修复了查词面板闪烁的 bug

你的改动就同步到仓库了。每天凌晨 4 点服务器自动更新，线上就能看到效果。

---

## 四、常用 AI 指令速查

| 我想做什么 | 对 AI 说 |
|-----------|---------|
| 开始工作 | "拉代码，启动项目" |
| 改样式 | "把 xxx 的颜色改成 yyy" |
| 加功能 | "在 xxx 加一个按钮，点击后 yyy" |
| 修 bug | "有一个问题：xxx，帮我修" |
| 看不懂代码 | "这段代码是做什么的" |
| 了解项目结构 | "这个项目有哪些文件" |
| 提交代码 | "提交代码，消息：xxx" |
| 打包 APK | "打包安卓 APK"（仅 Windows） |

---

## 五、在手机上测试

电脑和手机连**同一个 WiFi**，然后手机浏览器打开电脑上 `npm run dev` 显示的地址（类似 `http://192.168.1.5:5173`）。

电脑上改代码，手机刷新就能看到。不需要打包。

---

## 六、Mac 和 Windows 有区别吗？

**没有。** 所有命令、代码、样式、浏览器效果完全一样。唯一区别是启动方式：

| 系统 | 启动 |
|------|------|
| Windows | 双击 `start.bat` 或终端输入 `npm run dev` |
| Mac | 终端输入 `bash start.sh` 或 `npm run dev` |

---

## 七、项目有哪些文件

```
Platform_Solo/
├── index.html           # 主页面
├── js/                  # JavaScript 代码
│   ├── app.js           # 应用入口
│   ├── search.js        # 全文搜索
│   ├── render.js        # 经文渲染
│   ├── reader.js        # 朗读功能
│   ├── tts.js           # 朗读引擎
│   ├── external-lookup.js  # 查字/查词
│   ├── tooltip.js       # 术语提示
│   ├── selection-toolbar.js # 划词工具栏
│   ├── highlight.js     # 高亮标注
│   ├── notes.js         # 笔记
│   ├── bookmarks.js     # 书签
│   ├── settings.js      # 设置
│   ├── store.js         # 状态管理
│   └── ...
├── css/                 # 样式
├── data/                # 经文数据
│   ├── zongbao.json     # 宗宝本
│   ├── dunhuang.json    # 敦煌本
│   ├── glossary.json    # 术语词典
│   └── pinyin.json      # 拼音
├── fonts/               # 字体
├── start.bat            # Windows 启动
├── start.sh             # Mac 启动
└── release/             # APK
```

---

## 八、遇到问题

**把报错信息复制发给 AI**，大部分能直接解决。

几条常见情况：
- `npm install` 报错 → 删掉 `node_modules` 文件夹，重新 `npm install`
- 页面打不开 → 确认 `npm run dev` 在运行
- `git push` 报错 → 先 `git pull` 再 `git push`
- Mac 提示没有权限 → 命令前面加 `sudo`

---

## 九、线上地址

- 网页版：`https://sutra.onemooring.xyz`
- 每天凌晨 4 点自动更新
