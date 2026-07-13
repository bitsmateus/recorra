# ============================================================
# Recorra — setup automático (Windows / PowerShell)
# Rode UMA vez: abra o PowerShell nesta pasta e execute:
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n=== 1/6  Subindo Postgres + Redis (Docker) ===" -ForegroundColor Cyan
docker compose up -d

Write-Host "`n=== 2/6  Aguardando o Postgres ficar pronto ===" -ForegroundColor Cyan
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  $out = (docker compose exec -T postgres pg_isready -U recorra 2>&1 | Out-String)
  if ($out -match "accepting connections") { $ok = $true; break }
  Start-Sleep -Seconds 2
  Write-Host "  ...aguardando ($($i+1))"
}
if (-not $ok) {
  Write-Host "  Aviso: pg_isready não confirmou, mas seguindo mesmo assim (o Postgres pode já estar no ar)." -ForegroundColor Yellow
} else {
  Write-Host "  Postgres pronto." -ForegroundColor Green
}

Write-Host "`n=== 3/6  Instalando dependências do backend (npm install) ===" -ForegroundColor Cyan
npm install

Write-Host "`n=== 4/6  Migrations + Prisma Client ===" -ForegroundColor Cyan
npx prisma migrate dev --name init

Write-Host "`n=== 5/6  Aplicando RLS (segurança por tenant) ===" -ForegroundColor Cyan
Get-Content prisma\rls.sql | docker compose exec -T postgres psql -U recorra -d recorra

Write-Host "`n=== 6/6  Seed (tenant demo + réguas + superadmin) ===" -ForegroundColor Cyan
npm run prisma:seed

Write-Host "`nInstalando dependências do painel (recorra-web)..." -ForegroundColor Cyan
Push-Location ..\recorra-web
npm install
Pop-Location

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " SETUP CONCLUÍDO!" -ForegroundColor Green
Write-Host " Agora rode:  powershell -ExecutionPolicy Bypass -File .\start-dev.ps1" -ForegroundColor Green
Write-Host ""
Write-Host " Logins (após subir):" -ForegroundColor Yellow
Write-Host "   Painel:     http://localhost:3001   admin@demo.com / recorra123"
Write-Host "   Superadmin: http://localhost:3001/admin   super@recorra.com.br / recorra123"
Write-Host "============================================================" -ForegroundColor Green
