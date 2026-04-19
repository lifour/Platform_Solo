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