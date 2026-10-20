@echo off
title LuluaX-Term (Development Mode)
echo ========================================================
echo       LuluaX-Term — Windows Development Launcher        
echo ========================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo [1/2] Starting backend terminal server on port 3980...
start "LuluaX-Term Server" /b node server.js

timeout /t 2 /nobreak >nul

echo [2/2] Opening application window...
if exist "node_modules\electron" (
    start "" npx electron electron-main.js
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:3980 --window-size=1240,820
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://127.0.0.1:3980 --window-size=1240,820
) else (
    start http://127.0.0.1:3980
)

echo.
echo LuluaX-Term dev server is running at http://127.0.0.1:3980
