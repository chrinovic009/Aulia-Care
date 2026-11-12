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
$pidFile = Join-Path $demo 'pids.txt'
function Log([string]$message) { "$(Get-Date -Format T) $message" | Out-File -Append $status -Encoding utf8 }

function Stop-Demo {
  if (Test-Path $pidFile) {
    foreach ($processId in (Get-Content $pidFile)) { if ($processId) { taskkill /T /F /PID $processId *> $null } }
    Remove-Item $pidFile -Force
  }
  docker rm -f $container *> $null
}

if ($Action -eq 'stop') {
  Stop-Demo
  "ARRETE $(Get-Date -Format o)" | Out-File $status -Encoding utf8
  exit 0
}

"DEMARRAGE $(Get-Date -Format o)" | Out-File $status -Encoding utf8
Stop-Demo
docker run -d --name $container -p '127.0.0.1:55442:5432' -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=aulia_demo postgres:16-alpine *> (Join-Path $demo 'docker.log')
if ($LASTEXITCODE -ne 0) { Log 'ECHEC docker run (Docker Desktop est-il démarré ?)'; exit 1 }
$ready = $false
for ($i = 0; $i -lt 60; $i++) { docker exec $container pg_isready -U postgres -h 127.0.0.1 *> $null; if ($LASTEXITCODE -eq 0) { $ready = $true; break }; Start-Sleep 1 }
if (-not $ready) { Log 'ECHEC PostgreSQL ne répond pas'; exit 1 }
Start-Sleep 2

# Development settings of the project, then the demo database and local URLs.
foreach ($line in Get-Content (Join-Path $root 'backend\.env')) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim().Trim('"'), 'Process') }
}
$bytes = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password = 'Demo-' + ([Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', 'x').Replace('/', 'y'))
$settings = @{
  DATABASE_URL = 'postgresql://postgres@127.0.0.1:55442/aulia_demo?schema=public'
  NODE_ENV = 'development'; PORT = '3100'; REDIS_URL = ''; CORS_ORIGIN = 'http://localhost:5190'
  AULIA_APP_MODE = 'demo'; AULIA_DEMO_DATABASE_NAME = 'aulia_demo'; AULIA_DEMO_SEED_CONFIRM = 'SEED_PUBLIC_CORE_DEMO'
  AULIA_DEMO_SEED_PROFILE = 'FULL'; AULIA_DEMO_PASSWORD = $password; AULIA_BACKEND_URL = 'http://localhost:3100'
}
foreach ($key in $settings.Keys) { [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process') }

Push-Location (Join-Path $root 'backend')
foreach ($command in @('npx prisma migrate deploy --schema prisma/schema.prisma', 'npm run demo:provision-sentinel', 'npm run demo:seed')) {
  $name = ($command -split ' ')[-1] -replace '[^A-Za-z0-9-]', ''
  cmd /c "$command > `"$demo\$name.log`" 2>&1"
  if ($LASTEXITCODE -ne 0) { Log "ECHEC $command (voir $name.log)"; Pop-Location; exit 1 }
  Log "OK $command"
}
Pop-Location

$backend = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "npm run dev > `"$demo\backend.log`" 2>&1" -WorkingDirectory (Join-Path $root 'backend') -WindowStyle Hidden -PassThru
$frontend = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "npx vite --config vite.config.ts --port 5190 --strictPort > `"$demo\frontend.log`" 2>&1" -WorkingDirectory (Join-Path $root 'frontend') -WindowStyle Hidden -PassThru
@($backend.Id, $frontend.Id) | Out-File $pidFile -Encoding ascii

$up = @{ backend = $false; frontend = $false }
for ($i = 0; $i -lt 90 -and -not ($up.backend -and $up.frontend); $i++) {
  Start-Sleep 2
  try { if ((Invoke-WebRequest 'http://localhost:3100/api/health' -UseBasicParsing -TimeoutSec 3).StatusCode -lt 500) { $up.backend = $true } } catch { }
  try { if ((Invoke-WebRequest 'http://localhost:5190/' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $up.frontend = $true } } catch { }
}
"Comptes : demo.admin, demo.infirmier, demo.medecin, demo.reception, demo.pharmacie (même mot de passe)`r`nMot de passe : $password" |
  Out-File (Join-Path $demo 'credentials.txt') -Encoding utf8
if ($up.backend -and $up.frontend) { Log 'PRET http://localhost:5190'; exit 0 }
Log "ECHEC démarrage backend=$($up.backend) frontend=$($up.frontend) (voir backend.log / frontend.log)"
exit 1
