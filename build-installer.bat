@echo off
title LuluaX-Term Installer Builder (NSIS Setup)
echo ========================================================
echo     LuluaX-Term — Windows Setup Installer Builder       
echo ========================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    pause
    exit /b 1
)

:: Close instances
taskkill /F /IM "LuluaX-Term.exe" >nul 2>nul
taskkill /F /IM "LuluaX-Term 1.0.0.exe" >nul 2>nul
taskkill /F /IM "LuluaX-Term Setup*.exe" >nul 2>nul

echo Packaging full Windows Setup Installer with Installation Wizard and Shortcuts...
call npx electron-builder --win nsis --publish never

echo.
echo ========================================================
echo  BUILD SUCCESS!
echo  Installer created at: dist\LuluaX-Term Setup 1.0.0.exe
echo ========================================================
pause
