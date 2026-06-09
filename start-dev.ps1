param(
    [string]$FrontendHost = "127.0.0.1",
    [int]$FrontendPort = 3000,
    [string]$BackendHost = "127.0.0.1",
    [int]$BackendPort = 8000
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $root "frontend"
$backendDir = Join-Path $root "backend"
$venvPython = Join-Path $backendDir "venv\Scripts\python.exe"

if (-not (Test-Path $frontendDir)) {
    throw "Frontend papka topilmadi: $frontendDir"
}

if (-not (Test-Path $backendDir)) {
    throw "Backend papka topilmadi: $backendDir"
}

if (-not (Test-Path $venvPython)) {
    throw "Backend virtualenv topilmadi: $venvPython"
}

$frontendNodeModules = Join-Path $frontendDir "node_modules"
if (-not (Test-Path $frontendNodeModules)) {
    Write-Host "node_modules topilmadi, npm install ishlatilmoqda..."
    npm --prefix $frontendDir install
}

$backendCommand = "cd `"$backendDir`"; & `"$venvPython`" -m uvicorn main:app --host $BackendHost --port $BackendPort"
$frontendCommand = "cd `"$frontendDir`"; npm run dev -- --hostname $FrontendHost --port $FrontendPort"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null

$frontendUrl = "http://$FrontendHost`:$FrontendPort/login"
Write-Host "Frontend ishga tushmoqda: $frontendUrl"
Start-Sleep -Seconds 4
Start-Process $frontendUrl

Write-Host "Tayyor. Agar ochilmasa, terminal oynalaridagi xatoni tekshiring."
