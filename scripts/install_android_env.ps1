<#
One-step helper to install Java (Temurin JDK 17) and Android Studio on Windows.
Usage (from project root as admin or user):
  powershell -ExecutionPolicy Bypass -File .\scripts\install_android_env.ps1

What it does:
- Attempts to install Temurin JDK 17 and Android Studio via winget (silent if supported).
- If winget fails, opens official download pages in the browser for manual download.
- After a successful JDK install, attempts to locate the installation folder and set `JAVA_HOME` (user environment) and add Java to PATH.
- Notes: Android Studio still requires interactive setup (SDK components) on first run.
#>

Set-StrictMode -Version Latest

function Write-Ok($msg){ Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Err($msg){ Write-Host "[ERR] $msg" -ForegroundColor Red }
function Write-Info($msg){ Write-Host "[..] $msg" -ForegroundColor Cyan }

# Ensure we run from repo root if possible
Push-Location -ErrorAction SilentlyContinue (Split-Path -Parent $MyInvocation.MyCommand.Definition) | Out-Null

$useWinget = $false
try{
    $wg = Get-Command winget -ErrorAction Stop
    $useWinget = $true
    Write-Info "winget found. Will try winget installs first."
}catch{
    Write-Info "winget not found. The script will open browser for manual downloads if needed."
}

# Try install Temurin JDK 17 via winget
$jdkInstalled = $false
if ($useWinget) {
    Write-Info "Installing Temurin JDK 17 via winget..."
    try {
        winget install --id EclipseAdoptium.Temurin.JDK.17 -e --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) { $jdkInstalled = $true; Write-Ok "Temurin JDK 17 installed via winget." }
    } catch {
        Write-Err "winget install for Temurin failed: $_"
    }
}

if (-not $jdkInstalled) {
    Write-Info "Could not install JDK automatically. Opening download pages for manual install..."
    Start-Process "https://github.com/adoptium/temurin17-binaries/releases/latest"
    Write-Info "Please download and run an appropriate Windows x64 installer (msi/exe)."
} else {
    # Find JDK install dir (common Eclipse Adoptium path)
    $possibleRoots = @(
        "$env:ProgramFiles\Eclipse Adoptium",
        "$env:ProgramFiles(x86)\Eclipse Adoptium",
        "$env:ProgramFiles\AdoptOpenJDK",
        "$env:ProgramFiles\Java"
    )
    $found = $null
    foreach ($r in $possibleRoots) {
        if (Test-Path $r) {
            $dirs = Get-ChildItem -Path $r -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'jdk-?17|17\.' } | Sort-Object Name -Descending
            if ($dirs -and $dirs.Count -gt 0) { $found = $dirs[0].FullName; break }
        }
    }
    if (-not $found) {
        # attempt searching Program Files for jdk-17
        $found = Get-ChildItem -Path "C:\Program Files" -Directory -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'jdk-?17|temurin-?17' } | Select-Object -First 1 -ExpandProperty FullName -ErrorAction SilentlyContinue
    }

    if ($found) {
        Write-Ok "Detected JDK install at: $found"
        try {
            setx JAVA_HOME $found | Out-Null
            # add bin to user PATH if not present
            $currentPath = [Environment]::GetEnvironmentVariable('PATH','User')
            if ($currentPath -notlike "*\$found\bin*") {
                $newPath = "$currentPath;$found\bin"
                setx PATH $newPath | Out-Null
            }
            Write-Ok "Set user JAVA_HOME and added JDK bin to user PATH. You may need to restart terminals."
        } catch {
            Write-Err "Failed to set JAVA_HOME: $_"
        }
    } else {
        Write-Err "Could not locate installed JDK automatically. Please install Temurin JDK 17 and set JAVA_HOME manually."
    }
}

# Try install Android Studio via winget
$asInstalled = $false
if ($useWinget) {
    Write-Info "Installing Android Studio via winget... (this may take a while)"
    try {
        winget install --id Google.AndroidStudio -e --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) { $asInstalled = $true; Write-Ok "Android Studio installed." }
    } catch {
        Write-Err "winget Android Studio install failed: $_"
    }
}

if (-not $asInstalled) {
    Write-Info "Unable to install Android Studio automatically. Opening download page for manual install..."
    Start-Process "https://developer.android.com/studio"
    Write-Info "Please download and run Android Studio installer (interactive). After install, open Android Studio and complete SDK setup."
} else {
    Write-Ok "Android Studio installed (please launch it once to finish SDK components)."
}

Write-Info 'Done. If Android Studio and JDK installed successfully, run from project root: npx cap copy android then open the project in Android Studio or run: cd android; .\gradlew assembleDebug to build a debug APK.'

Pop-Location -ErrorAction SilentlyContinue
