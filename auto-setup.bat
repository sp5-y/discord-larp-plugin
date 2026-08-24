@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: Larp Tool - full Vencord setup per https://docs.vencord.dev/installing/
::
::   auto-setup.bat              clone, plugin, build, patch Discord
::   auto-setup.bat rebuild      copy plugin + rebuild only
::   auto-setup.bat inject       rebuild + patch Discord
::
::   VENCORD_DIR, DISCORD_BRANCH=auto|stable|ptb|canary, DISCORD_LOCATION
::   NOINJECT=1, KEEP_DISCORD_OPEN=1

set "ROOT=%~dp0"
set "PLUGIN_SRC=%ROOT%larp\index.tsx"
set "PLUGIN_NAME=larp"
set "VENCORD_REPO=https://github.com/Vendicated/Vencord"
set "EXITCODE=0"

if not defined VENCORD_DIR set "VENCORD_DIR=%LOCALAPPDATA%\Vencord-custom"
set "USERPLUGIN_DIR=%VENCORD_DIR%\src\userplugins\%PLUGIN_NAME%"
set "MODE=%~1"
if not defined MODE set "MODE=setup"
if not defined DISCORD_BRANCH set "DISCORD_BRANCH=auto"

title Larp Tool - Vencord Setup
goto :main

:finish
echo.
echo ============================================================
echo   Done!
echo ============================================================
echo   Build: %VENCORD_DIR%\dist
echo.
if /I "%MODE%"=="rebuild" (
    echo   Rebuild only - Discord was NOT patched.
    echo   Run: auto-setup.bat inject
) else if defined NOINJECT (
    echo   Build only ^(NOINJECT=1^). Run: auto-setup.bat inject
) else (
    echo   Next steps:
    echo     1. Restart Discord completely
    echo     2. Vencord Settings ^> Plugins ^> enable "Larp Tool"
    echo     3. Ctrl+B to open
)
echo.
echo   After editing larp\index.tsx:  auto-setup.bat rebuild
echo.
pause
exit /b %EXITCODE%

:failed
echo.
echo [FAILED] setup did not complete.
echo.
pause
exit /b 1

:main
echo.
echo ============================================================
echo   Larp Tool - Vencord auto setup
echo ============================================================
echo   Plugin:  %PLUGIN_SRC%
echo   Vencord: %VENCORD_DIR%
echo   Mode:    %MODE%
if defined DISCORD_LOCATION (echo   Discord: %DISCORD_LOCATION%) else (echo   Discord branch: %DISCORD_BRANCH%)
echo ============================================================
echo.

if /I "%MODE%"=="help" goto :show_help
if /I "%MODE%"=="/?" goto :show_help
if /I "%MODE%"=="-h" goto :show_help

if not exist "%PLUGIN_SRC%" (
    echo [ERROR] Plugin not found: %PLUGIN_SRC%
    goto :failed
)

call :require_cmd git "https://git-scm.com/download/win" || goto :failed
call :require_cmd node "https://nodejs.org/" || goto :failed
call :ensure_pnpm || goto :failed

if /I not "%MODE%"=="rebuild" if /I not "%MODE%"=="inject" (
    call :clone_or_update_vencord || goto :failed
)

call :install_plugin || goto :failed
call :install_deps || goto :failed
call :build_vencord || goto :failed

if /I "%MODE%"=="inject" set "NOINJECT="
if defined NOINJECT goto :finish
if /I "%MODE%"=="rebuild" goto :finish

call :patch_discord || goto :failed
goto :finish

:show_help
echo.
echo Usage:
echo   auto-setup.bat              Clone Vencord, install plugin, build, patch Discord
echo   auto-setup.bat rebuild      Copy larp\index.tsx and rebuild (no patch)
echo   auto-setup.bat inject       Rebuild and patch Discord
echo.
echo Environment:
echo   VENCORD_DIR         Vencord folder (default: %%LOCALAPPDATA%%\Vencord-custom)
echo   DISCORD_BRANCH      auto ^| stable ^| ptb ^| canary
echo   DISCORD_LOCATION    Custom Discord install path
echo   NOINJECT=1          Skip patching Discord
echo.
pause
exit /b 0

:require_cmd
where %~1 >nul 2>&1
if not errorlevel 1 exit /b 0
echo [ERROR] %~1 not on PATH - %~2
exit /b 1

:ensure_pnpm
where pnpm >nul 2>&1
if not errorlevel 1 (
    echo [OK] pnpm
    exit /b 0
)

echo [..] pnpm missing - installing via npm (this can take 1-2 minutes)...
where npm >nul 2>&1 || (
    echo [ERROR] npm not found. Reinstall Node.js from https://nodejs.org/
    exit /b 1
)

call npm install -g pnpm@9
if errorlevel 1 (
    echo [WARN] npm global install failed, trying corepack...
    where corepack >nul 2>&1 || (
        echo [ERROR] could not install pnpm
        exit /b 1
    )
    echo [..] corepack enable...
    call corepack enable
    echo [..] corepack prepare pnpm@9.15.0 --activate
    call corepack prepare pnpm@9.15.0 --activate
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pnpm still not available after install
    echo         Try manually: npm install -g pnpm@9
    exit /b 1
)

echo [OK] pnpm ready
pnpm --version
exit /b 0

:clone_or_update_vencord
if exist "%VENCORD_DIR%\.git" (
    echo [..] updating Vencord repo...
    pushd "%VENCORD_DIR%"
    set "GIT_ASK_YESNO=false"
    set "GIT_TERMINAL_PROMPT=0"
    call git -c core.fsmonitor=false -c gc.auto=0 fetch --prune --quiet
    call git -c core.fsmonitor=false -c gc.auto=0 merge --ff-only origin/main
    set "ERR=!ERRORLEVEL!"
    if not "!ERR!"=="0" (
        echo [WARN] ff-only merge failed, trying pull...
        call git -c core.fsmonitor=false -c gc.auto=0 pull --ff-only --no-rebase
        set "ERR=!ERRORLEVEL!"
    )
    popd
    if not "!ERR!"=="0" echo [WARN] git update failed, using existing copy
    echo [OK] Vencord at %VENCORD_DIR%
    exit /b 0
)
echo [..] cloning Vencord...
if not exist "%VENCORD_DIR%" mkdir "%VENCORD_DIR%"
git clone "%VENCORD_REPO%" "%VENCORD_DIR%"
if errorlevel 1 (
    echo [ERROR] git clone failed
    exit /b 1
)
echo [OK] cloned to %VENCORD_DIR%
exit /b 0

:install_plugin
echo [..] copying plugin to src\userplugins\%PLUGIN_NAME%\
if not exist "%VENCORD_DIR%\src" (
    echo [ERROR] %VENCORD_DIR%\src missing
    exit /b 1
)
if not exist "%VENCORD_DIR%\src\userplugins" mkdir "%VENCORD_DIR%\src\userplugins"
if not exist "%USERPLUGIN_DIR%" mkdir "%USERPLUGIN_DIR%"
copy /Y "%PLUGIN_SRC%" "%USERPLUGIN_DIR%\index.tsx" >nul || exit /b 1
echo [OK] %USERPLUGIN_DIR%\index.tsx
exit /b 0

:install_deps
echo [..] pnpm install --frozen-lockfile
pushd "%VENCORD_DIR%"
call pnpm install --frozen-lockfile
set "ERR=!ERRORLEVEL!"
popd
if not "!ERR!"=="0" (
    echo [WARN] retrying without --frozen-lockfile...
    pushd "%VENCORD_DIR%"
    call pnpm install
    set "ERR=!ERRORLEVEL!"
    popd
)
if not "!ERR!"=="0" (
    echo [ERROR] pnpm install failed
    exit /b 1
)
echo [OK] deps installed
exit /b 0

:build_vencord
echo [..] pnpm build
pushd "%VENCORD_DIR%"
call pnpm build
set "ERR=!ERRORLEVEL!"
popd
if not "!ERR!"=="0" (
    echo [ERROR] pnpm build failed
    exit /b 1
)
echo [OK] %VENCORD_DIR%\dist
exit /b 0

:patch_discord
echo [..] patching Discord (non-interactive)...
if not defined KEEP_DISCORD_OPEN (
    echo      closing Discord...
    taskkill /IM Discord.exe /F >nul 2>&1
    taskkill /IM DiscordCanary.exe /F >nul 2>&1
    taskkill /IM DiscordPTB.exe /F >nul 2>&1
    ping -n 3 127.0.0.1 >nul
)
pushd "%VENCORD_DIR%"
if defined DISCORD_LOCATION (
    echo      target: %DISCORD_LOCATION%
    echo [..] trying uninstall first ^(safe to ignore rename errors^)...
    call node scripts/runInstaller.mjs -- --uninstall --location "%DISCORD_LOCATION%" >nul 2>&1
    echo [..] installing custom build...
    call node scripts/runInstaller.mjs -- --install --location "%DISCORD_LOCATION%"
) else (
    echo      branch: %DISCORD_BRANCH%
    echo [..] trying uninstall first ^(safe to ignore rename errors^)...
    call node scripts/runInstaller.mjs -- --uninstall --branch %DISCORD_BRANCH% >nul 2>&1
    echo [..] installing custom build...
    call node scripts/runInstaller.mjs -- --install --branch %DISCORD_BRANCH%
)
set "ERR=!ERRORLEVEL!"
popd
if not "!ERR!"=="0" (
    echo [ERROR] patch failed - try: set DISCORD_BRANCH=stable
    exit /b 1
)
echo [OK] Discord patched with your custom build
exit /b 0
