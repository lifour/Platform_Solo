@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0" > nul

echo ========================================
echo   Platform Solo Sutra - Dev Server
echo ========================================
echo.

echo Stopping existing Node/Vite processes...
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo Installing dependencies...
call npm install

echo.
echo Starting Vite dev server on port 5173...
start "Platform Solo" cmd /k "npx vite --host 0.0.0.0 --port 5173"

timeout /t 3 /nobreak >nul

echo.
echo Launch completed!
echo.
echo   Local:    http://localhost:5173
echo.
timeout /t 2 /nobreak >nul
exit /b 0
