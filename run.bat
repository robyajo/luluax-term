@echo off
title LuluaX-Term Launcher
echo ========================================================
echo           Starting LuluaX-Term Terminal Client          
echo ========================================================
echo.

cd /d "%~dp0"

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Start Server in background
echo [1/2] Starting local terminal backend server...
start "LuluaX-Term Server" /b node server.js

:: Wait for server to initialize
timeout /t 2 /nobreak >nul

:: Launch Desktop App Window
echo [2/2] Opening LuluaX-Term Application Window...
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:3980 --window-size=1200,800
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://127.0.0.1:3980 --window-size=1200,800
) else (
    start http://127.0.0.1:3980
)

echo.
echo LuluaX-Term is running at http://127.0.0.1:3980
echo Close the server window to exit.
