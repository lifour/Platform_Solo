六祖坛经 · 阅藏

本仓库为本地静态站点项目，提供经文阅读器（宗宝本 + 敦煌本对照），支持拼音注音切换、全文搜索与术语工具提示

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

```bash
# 1) 同步 web 资源到 Android 项目
Set-Location 'C:\work\Platform_Solo'
npx cap copy android

# 2) 在 android 目录构建 Debug APK
Set-Location 'C:\work\Platform_Solo\android'
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_SDK_ROOT='C:\SDK'
$env:ANDROID_HOME='C:\SDK'
$env:PATH += ';C:\Program Files\Android\Android Studio\jbr\bin;C:\SDK\platform-tools'
.\gradlew clean assembleDebug --no-daemon --stacktrace

# 3) 列出并安装 APK 到已连接设备
Get-ChildItem .\app\build\outputs\apk\debug -File
C:\SDK\platform-tools\adb.exe devices
C:\SDK\platform-tools\adb.exe install -r .\app\build\outputs\apk\debug\app-debug.apk
```