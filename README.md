六祖坛经 · 阅藏

本仓库为本地静态站点项目，提供经文阅读器（宗宝本 + 敦煌本对照），支持拼音注音切换、全文搜索与术语工具提示。

快速开始

1. 安装依赖：

```bash
npm install
```

2. 本地运行：

```bash
npx serve . -l 3000
# 若端口被占用，serve 会自动选择其它端口
```

部署到 GitHub

如果你希望将代码推送并使用 GitHub Pages 托管（本项目已配置 `deploy` 脚本指向 `https://github.com/lifour/Platform_Solo.git`），可按下列步骤操作：

```bash
# 添加远程仓库（如果尚未添加）
git remote add origin https://github.com/lifour/Platform_Solo.git
git branch -M main
git push -u origin main

# 发布到 GitHub Pages
npm run deploy
```

Vercel 自动部署（已连接）

如果项目已连接到 Vercel，则在 VS Code 修改并推送后，Vercel 会自动重新部署：

```bash
git add . && git commit -m "修了一个bug" && git push
```

说明：项目已移除 `gh-pages` 自动部署配置并推荐使用 Vercel。若需保留 gh-pages 可恢复相关脚本与依赖，但当前首选 Vercel。 
六祖坛经 · 阅藏

本仓库为本地静态站点项目，提供经文阅读器（宗宝本 + 敦煌本对照），支持拼音注音切换、全文搜索与术语工具提示。

快速开始

1. 安装依赖：

```bash
npm install
```

2. 本地运行：

```bash
npx serve . -l 3000
# 若端口被占用，serve 会自动选择其它端口
```

部署到 GitHub

如果你希望将代码推送并使用 GitHub Pages 托管（本项目已配置 `deploy` 脚本指向 `https://github.com/lifour/Platform_Solo.git`），可按下列步骤操作：

```bash
# 添加远程仓库（如果尚未添加）
git remote add origin https://github.com/lifour/Platform_Solo.git
git branch -M main
git push -u origin main

# 发布到 GitHub Pages
npm run deploy
```