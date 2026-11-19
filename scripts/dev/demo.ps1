# Aulia Care - disposable local demo for manual testing in a browser.
# start : fresh PostgreSQL container (port 55442), migrations, demo seed, backend on
#         http://localhost:3100 and frontend on http://localhost:5190.
# stop  : stops both servers and removes the container.
# Demo accounts share one random password written to .validation\demo\credentials.txt
# (git-ignored). Never point this script at a real database.
param([ValidateSet('start', 'stop')][string]$Action = 'start')

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$demo = Join-Path $root '.validation\demo'
New-Item -ItemType Directory -Force $demo | Out-Null
$status = Join-Path $demo 'status.txt'
$container = 'aulia-care-demo-pg'
$redis = 'aulia-care-demo-redis'
$pidFile = Join-Path $demo 'pids.txt'
function Log([string]$message) {
  for ($try = 0; $try -lt 5; $try++) { try { [IO.File]::AppendAllText($status, "$(Get-Date -Format T) $message`r`n"); return } catch { Start-Sleep -Milliseconds 300 } }
}

function Stop-Demo {
  # Whatever still listens on the demo ports (including servers of an earlier run).
  foreach ($port in 3100, 5190) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { taskkill /T /F /PID $_.OwningProcess *> $null }
  }
  if (Test-Path $pidFile) {
    foreach ($processId in (Get-Content $pidFile)) { if ($processId) { taskkill /T /F /PID $processId *> $null } }
    Remove-Item $pidFile -Force
  }
  docker rm -f $container *> $null
  docker rm -f $redis *> $null
}

if ($Action -eq 'stop') {
  Stop-Demo
  "ARRETE $(Get-Date -Format o)" | Out-File $status -Encoding utf8
  exit 0
}

try { [IO.File]::WriteAllText($status, "DEMARRAGE $(Get-Date -Format o)`r`n") } catch { }
Stop-Demo
docker run -d --name $container -p '127.0.0.1:55442:5432' -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=aulia_demo postgres:16-alpine *> (Join-Path $demo 'docker.log')
if ($LASTEXITCODE -ne 0) { Log 'ECHEC docker run (Docker Desktop est-il démarré ?)'; exit 1 }
docker run -d --name $redis -p '127.0.0.1:56379:6379' redis:7-alpine *>> (Join-Path $demo 'docker.log')
if ($LASTEXITCODE -ne 0) { Log 'ECHEC docker run redis'; exit 1 }
$ready = $false
for ($i = 0; $i -lt 60; $i++) { docker exec $container pg_isready -U postgres -h 127.0.0.1 *> $null; if ($LASTEXITCODE -eq 0) { $ready = $true; break }; Start-Sleep 1 }
if (-not $ready) { Log 'ECHEC PostgreSQL ne répond pas'; exit 1 }
Start-Sleep 2

# Development settings of the project, then the demo database and local URLs.
foreach ($line in Get-Content (Join-Path $root 'backend\.env')) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim().Trim('"'), 'Process') }
}
$bytes = New-Object byte[] 18; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose()
$password = 'Demo-' + ([Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', 'x').Replace('/', 'y'))
$settings = @{
  DATABASE_URL = 'postgresql://postgres@127.0.0.1:55442/aulia_demo?schema=public'
  NODE_ENV = 'development'; PORT = '3100'; REDIS_URL = 'redis://127.0.0.1:56379'; CORS_ORIGIN = 'http://localhost:5190'
  AULIA_APP_MODE = 'demo'; AULIA_DEMO_DATABASE_NAME = 'aulia_demo'; AULIA_DEMO_SEED_CONFIRM = 'SEED_PUBLIC_CORE_DEMO'
  AULIA_DEMO_SEED_PROFILE = 'FULL'; AULIA_DEMO_PASSWORD = $password; AULIA_BACKEND_URL = 'http://localhost:3100'; AULIA_DEV_HTTP = '1'
}
foreach ($key in $settings.Keys) { [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process') }

Push-Location (Join-Path $root 'backend')
$confirmations = @{ 'npm run demo:provision-sentinel' = 'PROVISION_DEMO_SENTINEL'; 'npm run demo:seed' = 'SEED_PUBLIC_CORE_DEMO' }
foreach ($command in @('npx prisma migrate deploy --schema prisma/schema.prisma', 'npm run demo:provision-sentinel', 'npm run demo:seed')) {
  if ($confirmations.ContainsKey($command)) { $env:AULIA_DEMO_SEED_CONFIRM = $confirmations[$command] }
  $name = ($command -split ' ')[-1] -replace '[^A-Za-z0-9-]', ''
  cmd /c "$command > `"$demo\$name.log`" 2>&1"
  if ($LASTEXITCODE -ne 0) { Log "ECHEC $command (voir $name.log)"; Pop-Location; exit 1 }
  Log "OK $command"
}
Pop-Location

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backend = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "npm run dev > `"$demo\backend-$stamp.log`" 2>&1" -WorkingDirectory (Join-Path $root 'backend') -WindowStyle Hidden -PassThru
$frontend = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "npx vite --config vite.config.ts --port 5190 --strictPort > `"$demo\frontend-$stamp.log`" 2>&1" -WorkingDirectory (Join-Path $root 'frontend') -WindowStyle Hidden -PassThru
@($backend.Id, $frontend.Id) | Out-File $pidFile -Encoding ascii

$up = @{ backend = $false; frontend = $false }
for ($i = 0; $i -lt 90 -and -not ($up.backend -and $up.frontend); $i++) {
  Start-Sleep 2
  try { $tcp = New-Object Net.Sockets.TcpClient; $tcp.Connect('127.0.0.1', 3100); $up.backend = $tcp.Connected; $tcp.Close() } catch { }
  try { $tcp = New-Object Net.Sockets.TcpClient; $tcp.Connect('127.0.0.1', 5190); $up.frontend = $tcp.Connected; $tcp.Close() } catch { }
}
"Comptes : demo.superadmin, demo.admin, demo.finance, demo.caisse, demo.reception, demo.infirmier, demo.medecin, demo.labo, demo.radio, demo.pharmacie, demo.urgences, demo.ambulancier, demo.chirurgien, demo.sagefemme, demo.nephro, demo.patient (même mot de passe)`r`nMot de passe : $password" |
  Out-File (Join-Path $demo 'credentials.txt') -Encoding utf8
if ($up.backend -and $up.frontend) {
  Log 'PRET http://localhost:5190 (frontend) / http://localhost:3100 (API)'
  # Guided tour (video demo): requested by creating .validation\tour-request.txt.
  $tourRequest = Join-Path $root '.validation\tour-request.txt'
  if (Test-Path $tourRequest) {
    Remove-Item $tourRequest -Force
    New-Item -ItemType Directory -Force (Join-Path $root '.validation\tour') | Out-Null
    Log 'VISITE en cours (scripts\dev\tour\tour.mjs)'
    cmd /c "node scripts\dev\tour\tour.mjs > `"$root\.validation\tour\run.log`" 2>&1"
    if ($LASTEXITCODE -ne 0) { Log "ECHEC visite (voir .validation\tour\run.log)"; exit 1 }
    Log 'VISITE terminee'
  }
  exit 0
}
Log "ECHEC démarrage backend=$($up.backend) frontend=$($up.frontend) (voir backend-$stamp.log / frontend-$stamp.log)"
exit 1
