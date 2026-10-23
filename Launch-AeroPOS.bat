@echo off
chcp 65001 >nul
setlocal

title Bharathi Homelings - Supermarket System

echo.
echo ============================================================
echo              Bharathi Homelings Supermarket System
echo ============================================================
echo.

REM ------------------------------------------------------------
REM PROJECT DIRECTORY (AUTO-DETECT & FALLBACK)
REM ------------------------------------------------------------

set "DEFAULT_PROJECT_DIR=C:\Users\Ramna\.gemini\antigravity-ide\scratch\supermarket-system"

if exist "%~dp0server\package.json" (
    set "ROOT=%~dp0"
) else if exist "%DEFAULT_PROJECT_DIR%\server\package.json" (
    set "ROOT=%DEFAULT_PROJECT_DIR%"
) else (
    set "ROOT=%~dp0"
)

if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

cd /d "%ROOT%"
set "SERVER=%ROOT%\server"
set "CLIENT=%ROOT%\client"

echo Project:
echo %ROOT%
echo.

REM ------------------------------------------------------------
REM CHECK NODE
REM ------------------------------------------------------------

echo [1/6] Checking Node.js...

where node >nul 2>&1

if errorlevel 1 (
    echo.
    echo ERROR: Node.js is not installed or not in PATH.
    echo.
    echo Install Node.js LTS from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1

if errorlevel 1 (
    echo.
    echo ERROR: npm is not installed or not in PATH.
    echo.
    pause
    exit /b 1
)

node -v
call npm -v

echo Node.js and npm OK.
echo.

REM ------------------------------------------------------------
REM CHECK SERVER
REM ------------------------------------------------------------

echo [2/6] Checking server...

if not exist "%SERVER%\package.json" (
    echo.
    echo ERROR: Server package.json not found.
    echo.
    echo Expected:
    echo %SERVER%\package.json
    echo.
    pause
    exit /b 1
)

echo Server found.
echo.

REM ------------------------------------------------------------
REM CHECK CLIENT
REM ------------------------------------------------------------

echo [3/6] Checking client...

if not exist "%CLIENT%\package.json" (
    echo.
    echo ERROR: Client package.json not found.
    echo.
    echo Expected:
    echo %CLIENT%\package.json
    echo.
    pause
    exit /b 1
)

echo Client found.
echo.

REM ------------------------------------------------------------
REM SERVER DEPENDENCIES
REM ------------------------------------------------------------

echo [4/6] Checking server dependencies...

if not exist "%SERVER%\node_modules" (
    echo Installing server dependencies...
    echo.

    cd /d "%SERVER%"

    call npm install

    if errorlevel 1 (
        echo.
        echo ERROR: Server npm install failed.
        echo.
        pause
        exit /b 1
    )

    cd /d "%ROOT%"
)

echo Server dependencies OK.
echo.

REM ------------------------------------------------------------
REM CLIENT DEPENDENCIES
REM ------------------------------------------------------------

echo [5/6] Checking client dependencies...

if not exist "%CLIENT%\node_modules" (
    echo Installing client dependencies...
    echo.

    cd /d "%CLIENT%"

    call npm install

    if errorlevel 1 (
        echo.
        echo ERROR: Client npm install failed.
        echo.
        pause
        exit /b 1
    )

    cd /d "%ROOT%"
)

echo Client dependencies OK.
echo.

REM ------------------------------------------------------------
REM ENV CHECK
REM ------------------------------------------------------------

echo [6/6] Checking configuration...

if not exist "%SERVER%\.env" (
    if not exist "%ROOT%\.env" (
        echo.
        echo WARNING:
        echo server\.env was not found.
        echo.
        echo Your backend may fail to connect to PostgreSQL.
        echo.
        if exist "%SERVER%\.env.example" (
            echo Found:
            echo server\.env.example
            echo.
            echo Copying server\.env.example to server\.env...
            copy "%SERVER%\.env.example" "%SERVER%\.env" >nul
        ) else if exist "%ROOT%\.env.example" (
            echo Found:
            echo .env.example
            echo.
            echo Copying .env.example to server\.env...
            copy "%ROOT%\.env.example" "%SERVER%\.env" >nul
        )
        echo.
    ) else (
        echo Root .env found.
    )
) else (
    echo server\.env found.
)

REM ------------------------------------------------------------
REM CLEANUP OLD APP PROCESSES ON OUR PORTS
REM ------------------------------------------------------------

echo.
echo ============================================================
echo              CLEANING OLD APP PROCESSES
echo ============================================================
echo.
echo Closing any previous server/frontend processes on ports 5000 and 5173...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(5000, 5173); foreach ($p in $ports) { $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue; if ($conns) { foreach ($c in $conns) { try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch {} } } }"

echo Cleanup complete.
echo.

REM ------------------------------------------------------------
REM START BACKEND
REM ------------------------------------------------------------

echo.
echo ============================================================
echo              STARTING BACKEND
echo ============================================================
echo.
echo Server folder:
echo %SERVER%
echo.
echo Starting npm run dev...
echo.

start "Bharathi Homelings Backend" /d "%SERVER%" cmd /k "title Bharathi Homelings Backend && call npm run dev"

REM Give backend a few seconds to start
timeout /t 6 /nobreak >nul 2>&1 || ping 127.0.0.1 -n 7 >nul

REM ------------------------------------------------------------
REM START FRONTEND
REM ------------------------------------------------------------

echo.
echo ============================================================
echo              STARTING FRONTEND
echo ============================================================
echo.
echo Client folder:
echo %CLIENT%
echo.
echo Starting npm run dev...
echo.

start "Bharathi Homelings Frontend" /d "%CLIENT%" cmd /k "title Bharathi Homelings Frontend && call npm run dev"

REM Give Vite time to start
timeout /t 6 /nobreak >nul 2>&1 || ping 127.0.0.1 -n 7 >nul

REM ------------------------------------------------------------
REM START NGROK (OPTIONAL)
REM ------------------------------------------------------------

echo.
echo ============================================================
echo                  STARTING NGROK TUNNEL
echo ============================================================
echo.

where ngrok >nul 2>&1

if errorlevel 1 (
    echo NGROK was not found in PATH.
    echo.
    echo To expose this app publicly, install ngrok and make sure:
    echo   ngrok is available in PATH
    echo   your auth token is configured with: ngrok authtoken <token>
    echo.
    echo Then run this command manually:
    echo   ngrok http 5173
    echo.
) else (
    echo Starting ngrok for http://localhost:5173...
    echo.
    start "Bharathi Homelings Ngrok" cmd /k "title Bharathi Homelings Ngrok && ngrok http 5173"
    echo Ngrok tunnel has been launched.
    echo Open the ngrok window to copy the public HTTPS URL.
    echo.
)

REM ------------------------------------------------------------
REM OPEN BROWSER
REM ------------------------------------------------------------

echo.
echo ============================================================
echo              OPENING BHARATHI HOMELINGS
echo ============================================================
echo.

start "" "http://localhost:5173"

echo.
echo ============================================================
echo          BHARATHI HOMELINGS STARTED SUCCESSFULLY
echo ============================================================
echo.
echo Frontend:
echo   http://localhost:5173
echo.
echo Backend:
echo   http://localhost:5000
echo.
echo Health:
echo   http://localhost:5000/api/health
echo.
echo Default Credentials:
echo   Super Admin  : admin / Admin@123
echo   Cashier POS  : cashier / Cashier@123
echo.
echo ============================================================
echo.
echo You should now have these windows open:
echo.
echo   1. Bharathi Homelings Backend
echo   2. Bharathi Homelings Frontend
echo.
echo DO NOT close those two windows while using the system.
echo.
echo Close this launcher window when finished.
echo.

pause