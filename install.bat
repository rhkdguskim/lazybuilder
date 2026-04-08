@echo off
echo =========================================
echo   LazyBuild / BuilderCLI Installer
echo =========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo   Install Node.js ^>= 20 from https://nodejs.org/
    exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_VER=%%a
set NODE_VER=%NODE_VER:v=%
echo [OK] Node.js found

:: Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed.
    exit /b 1
)
echo [OK] npm found

:: Install dependencies
echo.
echo [1/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    exit /b 1
)

:: Build
echo.
echo [2/3] Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    exit /b 1
)

:: Global link
echo.
echo [3/3] Linking global commands...
call npm link
if %errorlevel% neq 0 (
    echo [ERROR] npm link failed. Try running as Administrator.
    exit /b 1
)

echo.
echo =========================================
echo   Installation complete!
echo =========================================
echo.
echo   You can now run:
echo     buildercli    - start the TUI
echo     lazybuild     - start the TUI (alias)
echo.
echo   Or run in dev mode:
echo     npm run dev
echo.
