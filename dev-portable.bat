@echo off
title LuluaX-Term (Development Portable Review)
echo ========================================================
echo   LuluaX-Term — Build Portable and Launch for Review    
echo ========================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    pause
    exit /b 1
)

:: Close running instances to unlock binary
taskkill /F /IM "LuluaX-Term.exe" >nul 2>nul
taskkill /F /IM "LuluaX-Term 1.0.0.exe" >nul 2>nul

echo [1/2] Building standalone portable executable...
call npx electron-builder --win portable --publish never

if %errorlevel% neq 0 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo.
echo [2/2] Launching portable app for instant review...
if exist "dist\LuluaX-Term 1.0.0.exe" (
    start "" "dist\LuluaX-Term 1.0.0.exe"
    echo App launched! Check your taskbar / screen.
) else (
    echo Binary not found in dist!
)

exit /b 0
