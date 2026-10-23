# ─────────────────────────────────────────────────────────────────────────────
# AeroPOS Supermarket System — PowerShell Launcher
# Run: Right-click → Run with PowerShell
# Or from terminal: powershell -ExecutionPolicy Bypass -File Start-AeroPOS.ps1
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Header {
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║    AeroPOS Supermarket Management System             ║" -ForegroundColor Cyan
    Write-Host "  ║    Launcher v1.0 — Production Ready                  ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step { param($msg) Write-Host "  [STEP] $msg" -ForegroundColor Yellow }
function Write-OK   { param($msg) Write-Host "  [ OK ] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  [WARN] $msg" -ForegroundColor DarkYellow }
function Write-Fail { param($msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "  [INFO] $msg" -ForegroundColor DarkCyan }

# ── Check Node.js ─────────────────────────────────────────────────────────────
Write-Header
Write-Step "Checking Node.js..."
try {
    $nodeVer = & node -v 2>&1
    Write-OK "Node.js $nodeVer detected."
} catch {
    Write-Fail "Node.js not found! Install from https://nodejs.org"
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Check npm ────────────────────────────────────────────────────────────────
$npmVer = & npm -v 2>&1
Write-OK "npm $npmVer detected."

# ── Install server dependencies ───────────────────────────────────────────────
$serverModules = Join-Path $ProjectRoot "server\node_modules"
if (-not (Test-Path $serverModules)) {
    Write-Step "Installing server dependencies..."
    Set-Location (Join-Path $ProjectRoot "server")
    & npm install --silent
    Set-Location $ProjectRoot
    Write-OK "Server dependencies installed."
} else {
    Write-OK "Server dependencies already installed."
}

# ── Install client dependencies ───────────────────────────────────────────────
$clientModules = Join-Path $ProjectRoot "client\node_modules"
if (-not (Test-Path $clientModules)) {
    Write-Step "Installing client dependencies..."
    Set-Location (Join-Path $ProjectRoot "client")
    & npm install --silent
    Set-Location $ProjectRoot
    Write-OK "Client dependencies installed."
} else {
    Write-OK "Client dependencies already installed."
}

# ── Check PostgreSQL ──────────────────────────────────────────────────────────
Write-Step "Checking PostgreSQL..."
$pgService = Get-Service -Name "*postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgService) {
    if ($pgService.Status -eq "Running") {
        Write-OK "PostgreSQL service is Running."
    } else {
        Write-Warn "PostgreSQL service exists but is not running: $($pgService.Status)"
        Write-Warn "Start it from Services (services.msc) or pgAdmin."
    }
} else {
    Write-Warn "No PostgreSQL service found via Service Manager — it may still be running."
}

# ── Read port from server/.env ────────────────────────────────────────────────
$envFile = Join-Path $ProjectRoot "server\.env"
$backendPort = 5000
$frontendPort = 5173
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile | Where-Object { $_ -match "^PORT=" }
    if ($envContent) { $backendPort = ($envContent -split "=")[1].Trim() }
}

# ── Launch Backend ────────────────────────────────────────────────────────────
Write-Host ""
Write-Step "Launching backend server on port $backendPort..."
$serverDir = Join-Path $ProjectRoot "server"
Start-Process "cmd.exe" -ArgumentList "/k title AeroPOS Backend && cd /d `"$serverDir`" && npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

# ── Launch Frontend ───────────────────────────────────────────────────────────
Write-Step "Launching frontend dev server on port $frontendPort..."
$clientDir = Join-Path $ProjectRoot "client"
Start-Process "cmd.exe" -ArgumentList "/k title AeroPOS Frontend && cd /d `"$clientDir`" && npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 4

# ── Open Browser ──────────────────────────────────────────────────────────────
Write-Step "Opening AeroPOS in browser..."
Start-Process "http://localhost:$frontendPort"

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║  ✓ AeroPOS is now running!                           ║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║  Frontend : http://localhost:$frontendPort               ║" -ForegroundColor Green
Write-Host "  ║  Backend  : http://localhost:$backendPort/api            ║" -ForegroundColor Green
Write-Host "  ║  Health   : http://localhost:$backendPort/api/health      ║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║  Default Login (new install):                        ║" -ForegroundColor Green
Write-Host "  ║    Username : admin                                  ║" -ForegroundColor Green
Write-Host "  ║    Password : Admin@123                              ║" -ForegroundColor Green
Write-Host "  ║                                                      ║" -ForegroundColor Green
Write-Host "  ║  Close the two CMD windows to stop the servers.      ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close this launcher"
