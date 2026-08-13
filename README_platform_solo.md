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

构建与安装（本地调试）

要在连接的 Android 设备上安装调试 APK：

```powershell
Set-Location 'C:\work\Platform_Solo\android'
C:\SDK\platform-tools\adb.exe install -r .\app\build\outputs\apk\debug\app-debug.apk
```

## 每次修改代码后如何同步到 Android

完整流程分三步，在项目根目录（`C:\work\Platform_Solo`）的 PowerShell 终端执行：

**第一步：打包前端代码**

```powershell
npm run build
```

Vite 会把 `index.html`、`js/`、`css/`、`data/`、`fonts/` 打包输出到 `dist/`。

**第二步：同步到 Android 工程**

```powershell
npx cap copy android
```

将 `dist/` 的内容复制到 `android\app\src\main\assets\public\`，几秒钟完成。

**第三步（仅分发 APK 时需要）：编译生成 APK**

```powershell
cd android
.\gradlew assembleDebug
```

编译完成后 APK 位于：

```
android\app\build\outputs\apk\debug\app-debug.apk
```

**安装到已连接的 Android 设备：**

```powershell
C:\SDK\platform-tools\adb.exe install -r .\app\build\outputs\apk\debug\app-debug.apk
```

> 日常调试只需执行第一步 + 第二步，第三步只在需要把 APK 发给别人时才跑。
