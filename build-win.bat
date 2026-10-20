@echo off
title LuluaX-Term Builder (Windows EXE)
echo ========================================================
echo         LuluaX-Term — Windows Executable Builder        
echo ========================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    pause
    exit /b 1
)

echo [1/2] Checking build tools and dependencies...
if not exist "node_modules\electron-builder" (
    echo Installing electron and electron-builder...
    call npm install -D electron electron-builder
)

:: Ensure previous instances are closed to avoid file lock
taskkill /F /IM "LuluaX-Term.exe" >nul 2>nul
taskkill /F /IM "LuluaX-Term 1.0.0.exe" >nul 2>nul

echo [2/2] Packaging into Windows portable single .exe and unpacked directory...
call npx electron-builder --win portable --dir

echo.
echo ========================================================
echo  BUILD SUCCESS!
echo  Portable EXE: dist\LuluaX-Term 1.0.0.exe
echo  Unpacked EXE: dist\win-unpacked\LuluaX-Term.exe
echo ========================================================
pause
