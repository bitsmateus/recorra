# ============================================================
# Recorra — sobe API + Worker + Painel (cada um em sua janela)
# Rode:  powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
# ============================================================

Set-Location $PSScriptRoot
$api = $PSScriptRoot
$web = Join-Path (Split-Path $PSScriptRoot -Parent) "recorra-web"

Write-Host "Garantindo Postgres + Redis no ar..." -ForegroundColor Cyan
docker compose up -d | Out-Null

# Garante dependencias do painel (caso o setup nao tenha chegado nessa etapa)
if (-not (Test-Path (Join-Path $web "node_modules"))) {
  Write-Host "Instalando dependencias do painel (primeira vez)..." -ForegroundColor Yellow
  Push-Location $web
  npm install
  Pop-Location
}

Write-Host "Abrindo API (porta 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$api`"; npm run start:dev"

Write-Host "Abrindo Worker (regua/fila/conciliacao)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$api`"; npm run worker:dev"

Write-Host "Abrindo Painel (porta 3001)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","cd `"$web`"; npm run dev"

Start-Sleep -Seconds 3
Write-Host "`nTudo iniciando em janelas separadas." -ForegroundColor Green
Write-Host "Abra:  http://localhost:3001   (login admin@demo.com / recorra123)" -ForegroundColor Yellow
Write-Host "Superadmin:  http://localhost:3001/admin   (super@recorra.com.br / recorra123)" -ForegroundColor Yellow
