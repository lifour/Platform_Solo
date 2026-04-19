六祖坛经 · 阅藏

本仓库为本地静态站点项目，提供经文阅读器（宗宝本 + 敦煌本对照），支持拼音注音切换、全文搜索与术语工具提示。

快速开始

1. 安装依赖：

```bash
npm install
```

2. 本地运行：

```bash
# 在项目根运行本地静态服务：
npx serve . -l 3000
# 若端口被占用，serve 会自动选择其它端口
```
Vercel 自动部署

本项目已连接到 Vercel。以后在 VS Code 修改代码后，按下面命令提交并推送到远程：

```bash
git add . && git commit -m "修了一个bug" && git push
```

Vercel 会自动检测到推送并重新部署，无需手动管理服务器。

说明：项目已移除 `gh-pages` 部署配置并以 Vercel 为首选托管方式。若你需要我恢复 `gh-pages` 部署，请告知。