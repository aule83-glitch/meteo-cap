# MeteoCAP — uruchomienie bez Dockera (Windows PowerShell)
# Wymagania: Python 3.10+, Node.js 18+
# Sprawdz: python --version  i  node --version

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " MeteoCAP — Start bez Dockera" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $rootDir "backend"
$frontendDir = Join-Path $rootDir "frontend"

# Sprawdz Python
try {
    $pyVer = python --version 2>&1
    Write-Host "[OK] $pyVer" -ForegroundColor Green
} catch {
    Write-Host "[BLAD] Python nie znaleziony. Pobierz z https://python.org" -ForegroundColor Red
    exit 1
}

# Sprawdz Node
try {
    $nodeVer = node --version 2>&1
    Write-Host "[OK] Node $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "[BLAD] Node.js nie znaleziony. Pobierz z https://nodejs.org (wersja 18 LTS)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Instalowanie zaleznosci backendu..." -ForegroundColor Yellow
Set-Location $backendDir
python -m pip install -r requirements.txt --quiet

Write-Host "Instalowanie zaleznosci frontendu..." -ForegroundColor Yellow
Set-Location $frontendDir
npm install --legacy-peer-deps --silent

Write-Host ""
Write-Host "Uruchamianie backendu (port 8000)..." -ForegroundColor Yellow

# Uruchom backend w osobnym oknie
$backendCmd = "Set-Location '$backendDir'; `$env:PYTHONPATH='$backendDir'; python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 3

Write-Host "Uruchamianie frontendu (port 3000)..." -ForegroundColor Yellow

# Uruchom frontend w osobnym oknie
$frontendCmd = "Set-Location '$frontendDir'; `$env:REACT_APP_API_URL='http://localhost:8000/api'; `$env:NODE_OPTIONS='--openssl-legacy-provider'; npm start"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Uruchomiono! Otworz przegladarke:" -ForegroundColor Green
Write-Host " http://localhost:3000" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Aby zatrzymac: zamknij oba okna PowerShell" -ForegroundColor Gray
Write-Host ""
