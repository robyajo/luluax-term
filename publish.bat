@echo off
setlocal enabledelayedexpansion
title LuluaX-Term — Release Publisher
echo ========================================================
echo   LuluaX-Term — GitHub Releases Publisher with Bumper   
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. Check GitHub Token
if "%GH_TOKEN%"=="" (
    if "%GITHUB_TOKEN%"=="" (
        echo [ERROR] GH_TOKEN or GITHUB_TOKEN environment variable is not set!
        echo Please set your GitHub Personal Access Token before publishing:
        echo   set GH_TOKEN=ghp_your_token_here
        pause
        exit /b 1
    ) else (
        set GH_TOKEN=%GITHUB_TOKEN%
    )
)

:: 2. Read Current Version
for /f "tokens=*" %%v in ('node -p "require('./package.json').version"') do set CURRENT_VER=%%v
echo Versi saat ini: v%CURRENT_VER%

:: 3. Determine New Version
set INPUT_VER=%1

if "%INPUT_VER%"=="" (
    echo.
    echo Pilihan peningkatan versi:
    echo   1) Auto Patch Bump [Default] (1.0.1 -> 1.0.2; atau rollover 1.0.100 -> 1.1.0)
    echo   2) Minor Bump (Fitur Baru)
    echo   3) Major Bump (Perubahan Besar)
    echo   4) Ketik Versi Sendiri Secara Manual
    set /p CHOICE="Pilihan Anda [1-4, Enter=1]: "
    if "!CHOICE!"=="" set CHOICE=1
    if "!CHOICE!"=="1" set BUMP_TYPE=patch
    if "!CHOICE!"=="2" set BUMP_TYPE=minor
    if "!CHOICE!"=="3" set BUMP_TYPE=major
    if "!CHOICE!"=="4" (
        set /p NEW_VER="Ketik versi baru (misal 1.1.0): "
    )
) else (
    set BUMP_TYPE=%INPUT_VER%
)

if "%NEW_VER%"=="" (
    for /f "tokens=*" %%v in ('node -e "const cur='%CURRENT_VER%'; const t='%BUMP_TYPE%'; function bump(c, b) { if (b && /^\d+\.\d+\.\d+$/.test(b)) return b; const [M, m, p] = c.split('.').map(Number); if (b === 'major') return (M + 1) + '.0.0'; if (b === 'minor') return M + '.' + (m + 1) + '.0'; if (p >= 99) return M + '.' + (m + 1) + '.0'; return M + '.' + m + '.' + (p + 1); } console.log(bump(cur, t));"') do set NEW_VER=%%v
)

echo.
echo ========================================================
echo  Versi baru yang akan dirilis: v%NEW_VER%
echo ========================================================
echo.

:: 4. Update package.json
node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); pkg.version = '%NEW_VER%'; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');"

:: 5. Compile TypeScript
echo [1/3] Mengompilasi TypeScript (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Kompilasi TypeScript gagal!
    pause
    exit /b 1
)

:: 6. Build and Publish
echo.
echo [2/3] Memaketkan installer dan mengunggah ke GitHub Releases...
taskkill /F /IM "LuluaX-Term.exe" >nul 2>nul
taskkill /F /IM "LuluaX-Term 1*.exe" >nul 2>nul
taskkill /F /IM "LuluaX-Term Setup*.exe" >nul 2>nul

call npx electron-builder --win nsis portable --publish always
if %errorlevel% neq 0 (
    echo [ERROR] Packaging & publish gagal!
    pause
    exit /b 1
)

:: 7. Git Commit & Tag
echo.
echo [3/3] Menyimpan tag rilis ke Git...
git add package.json
git commit -m "chore(release): bump version to v%NEW_VER%"
git tag -a "v%NEW_VER%" -m "Release v%NEW_VER%" -f
git push origin main --tags

echo.
echo ========================================================
echo  PUBLISH SUKSES! Versi v%NEW_VER% telah rilis di GitHub!
echo  Pengguna akan otomatis menerima update tanpa uninstall.
echo ========================================================
pause
