@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: ============================================================================
::  Larp Tool — automated Vencord custom build + plugin install
::
::  Usage:
::    auto-setup.bat              Full setup (clone, deps, build, inject)
::    auto-setup.bat rebuild      Sync plugin + rebuild only
::    auto-setup.bat inject       Sync plugin + rebuild + inject
::
::  Optional environment overrides (set before running):
::    VENCORD_DIR=C:\path\to\Vencord
::    NOINJECT=1                     Skip "pnpm inject" at the end
:: ============================================================================

set "PLUGIN_SRC=%~dp0larp\index.tsx"
set "PLUGIN_NAME=larp"
set "VENCORD_REPO=https://github.com/Vendicated/Vencord"

if not defined VENCORD_DIR set "VENCORD_DIR=%LOCALAPPDATA%\Vencord-custom"
set "USERPLUGIN_DIR=%VENCORD_DIR%\src\userplugins\%PLUGIN_NAME%"
set "MODE=%~1"
if not defined MODE set "MODE=setup"

title Larp Tool — Vencord Setup

echo.
echo ============================================================
echo   Larp Tool — Vencord custom build setup
echo ============================================================
echo   Plugin:  %PLUGIN_SRC%
echo   Vencord: %VENCORD_DIR%
echo   Mode:    %MODE%
echo ============================================================
echo.

if /I "%MODE%"=="help" goto :show_help
if /I "%MODE%"=="/?" goto :show_help
if /I "%MODE%"=="-h" goto :show_help

if not exist "%PLUGIN_SRC%" (
    echo [ERROR] Plugin file not found: %PLUGIN_SRC%
    exit /b 1
)

call :require_cmd git "https://git-scm.com/download/win"
call :require_cmd node "https://nodejs.org/"

call :ensure_pnpm
if errorlevel 1 exit /b 1

if /I not "%MODE%"=="rebuild" if /I not "%MODE%"=="inject" (
    call :clone_vencord
    if errorlevel 1 exit /b 1
)

call :install_plugin
if errorlevel 1 exit /b 1

call :install_deps
if errorlevel 1 exit /b 1

call :build_vencord
if errorlevel 1 exit /b 1

if /I "%MODE%"=="inject" set "NOINJECT="
if defined NOINJECT goto :skip_inject
if /I "%MODE%"=="rebuild" goto :skip_inject

call :inject_vencord

:skip_inject
echo.
echo ============================================================
echo   Done!
echo ============================================================
echo.
echo   Your custom Vencord build is in:
echo     %VENCORD_DIR%\dist
echo.
echo   Next steps:
echo     1. If you skipped inject, run:  auto-setup.bat inject
echo     2. Restart Discord completely
echo     3. Open Vencord Settings ^> Plugins and enable "Larp Tool"
echo     4. Press Ctrl+B in Discord to open the tool
echo.
echo   After editing larp\index.tsx, run:
echo     auto-setup.bat rebuild
echo.
exit /b 0

:show_help
echo Usage:
echo   auto-setup.bat              Full setup (default)
echo   auto-setup.bat rebuild      Copy plugin and rebuild only
echo   auto-setup.bat inject       Rebuild and launch Vencord installer
echo.
echo Environment variables:
echo   VENCORD_DIR   Where to clone/build Vencord (default: %%LOCALAPPDATA%%\Vencord-custom)
echo   NOINJECT=1    Skip the inject step on full setup
exit /b 0

:require_cmd
where %~1 >nul 2>&1
if not errorlevel 1 exit /b 0
echo [ERROR] %~1 is not installed or not on PATH.
echo         Download: %~2
exit /b 1

:ensure_pnpm
where pnpm >nul 2>&1
if not errorlevel 1 (
    echo [OK] pnpm found
    exit /b 0
)

echo [..] pnpm not found — enabling via corepack...
where corepack >nul 2>&1
if errorlevel 1 (
    echo [ERROR] corepack is missing. Reinstall Node.js from https://nodejs.org/
    exit /b 1
)

corepack enable >nul 2>&1
corepack prepare pnpm@latest --activate
if errorlevel 1 (
    echo [ERROR] Failed to activate pnpm via corepack.
    echo         Try manually:  corepack enable ^&^& corepack prepare pnpm@latest --activate
    exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pnpm still not available after corepack setup.
    exit /b 1
)

echo [OK] pnpm ready
exit /b 0

:clone_vencord
if exist "%VENCORD_DIR%\.git" (
    echo [OK] Vencord repo already exists at %VENCORD_DIR%
    exit /b 0
)

echo [..] Cloning Vencord into %VENCORD_DIR% ...
if not exist "%VENCORD_DIR%" mkdir "%VENCORD_DIR%"
git clone "%VENCORD_REPO%" "%VENCORD_DIR%"
if errorlevel 1 (
    echo [ERROR] git clone failed.
    exit /b 1
)
echo [OK] Vencord cloned
exit /b 0

:install_plugin
echo [..] Installing plugin into userplugins...

if not exist "%VENCORD_DIR%\src" (
    echo [ERROR] Vencord source not found at %VENCORD_DIR%
    echo         Run without "rebuild" first, or set VENCORD_DIR correctly.
    exit /b 1
)

if not exist "%VENCORD_DIR%\src\userplugins" mkdir "%VENCORD_DIR%\src\userplugins"
if not exist "%USERPLUGIN_DIR%" mkdir "%USERPLUGIN_DIR%"

copy /Y "%PLUGIN_SRC%" "%USERPLUGIN_DIR%\index.tsx" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy plugin to %USERPLUGIN_DIR%
    exit /b 1
)

echo [OK] Plugin installed at %USERPLUGIN_DIR%\index.tsx
exit /b 0

:install_deps
echo [..] Installing Vencord dependencies (pnpm install --frozen-lockfile)...
pushd "%VENCORD_DIR%"
call pnpm install --frozen-lockfile
set "ERR=!ERRORLEVEL!"
popd
if not "!ERR!"=="0" (
    echo [WARN] frozen lockfile install failed — retrying without --frozen-lockfile...
    pushd "%VENCORD_DIR%"
    call pnpm install
    set "ERR=!ERRORLEVEL!"
    popd
)
if not "!ERR!"=="0" (
    echo [ERROR] pnpm install failed.
    exit /b 1
)
echo [OK] Dependencies installed
exit /b 0

:build_vencord
echo [..] Building Vencord (pnpm build)...
pushd "%VENCORD_DIR%"
call pnpm build
set "ERR=!ERRORLEVEL!"
popd
if not "!ERR!"=="0" (
    echo [ERROR] pnpm build failed.
    exit /b 1
)
echo [OK] Build complete — output in %VENCORD_DIR%\dist
exit /b 0

:inject_vencord
echo [..] Launching Vencord installer (pnpm inject)...
echo      Select your Discord install in the GUI that opens.
echo.
pushd "%VENCORD_DIR%"
call pnpm inject
set "ERR=!ERRORLEVEL!"
popd
if not "!ERR!"=="0" (
    echo [WARN] pnpm inject exited with code !ERR! — you can rerun: auto-setup.bat inject
    exit /b 0
)
echo [OK] Inject step finished
exit /b 0
