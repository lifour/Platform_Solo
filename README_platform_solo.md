六祖坛经 · 阅藏

本仓库为本地静态站点项目，提供经文阅读器（宗宝本 + 敦煌本对照），支持拼音注音切换、全文搜索与术语工具提示。

快速开始

1. 安装依赖：

```bash
npm install
```

2. 本地运行：

```bash
npx serve src -l 3000
# 若端口被占用，serve 会自动选择其它端口
```

将仓库推送到 GitHub

1. 在 https://github.com/new 创建一个新仓库（例如 `platform-solo`）。
2. 在本地添加远程并推送（可选 ssh 或 https）：

SSH:
```bash
git remote add origin git@github.com:YOUR_USERNAME/REPO_NAME.git
git push -u origin master
```

HTTPS:
```bash
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git push -u origin master
```

如果你希望我也为你在 GitHub 上创建仓库（需要提供一个 GitHub personal access token），告诉我即可。