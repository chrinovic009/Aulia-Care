# Aulia Care - validation locale reproductible.
# Usage : powershell -ExecutionPolicy Bypass -File scripts/dev/validate.ps1 -Steps lint,typecheck,unit
# Chaque etape ecrit son journal dans .validation/<etape>.log et une ligne dans .validation/summary.txt.
param([string]$Steps = 'lint,typecheck,unit', [string]$RunDir = '')
# -Steps request : read the step list from .validation/request.txt (only the known steps below run).

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
if ($Steps -eq 'request') {
  $requestFile = Join-Path $root '.validation\request.txt'
  $Steps = if (Test-Path $requestFile) { (Get-Content $requestFile -Raw).Trim() } else { 'lint,typecheck,unit' }
}
# One fresh folder per run: a log still opened by an editor or a previous run
# can never block or mix with the new results.
$out = if ($RunDir) { $RunDir } else { Join-Path $root ('.validation\run-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
New-Item -ItemType Directory -Force $out | Out-Null
$summary = Join-Path $out 'summary.txt'
try { Set-Content -Path (Join-Path $root '.validation\latest.txt') -Value $out -Encoding utf8 } catch { }

$branch = (git branch --show-current)
$commit = (git rev-parse --short HEAD)
"DEBUT $(Get-Date -Format o) branche=$branch commit=$commit etapes=$Steps" | Out-File $summary -Encoding utf8

function Import-DotEnv([string]$path) {
  if (-not (Test-Path $path)) { return }
  foreach ($line in Get-Content $path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $value = $Matches[2].Trim().Trim('"')
      [Environment]::SetEnvironmentVariable($Matches[1], $value, 'Process')
    }
  }
}


function Invoke-PgCtl([string]$pgCtl, [string[]]$arguments, [string]$logBase) {
  $process = Start-Process -FilePath $pgCtl -ArgumentList $arguments -NoNewWindow -PassThru `
    -RedirectStandardOutput "$logBase.out.log" -RedirectStandardError "$logBase.err.log"
  $null = $process.Handle
  $process.WaitForExit()
  return $process.ExitCode
}

# Preferred: a throw-away PostgreSQL 16 container (Windows application-control
# policies can block plpgsql.dll in a native install). Trust auth, loopback only.
function Start-DockerE2ECluster {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) { return $null }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { "docker: daemon indisponible" | Out-File -Append (Join-Path $out 'pg-cluster.log') -Encoding utf8; return $null }
  $name = 'aulia-care-e2e-pg'
  $port = if ($env:AULIA_E2E_DOCKER_PORT) { $env:AULIA_E2E_DOCKER_PORT } else { '55441' }
  docker rm -f $name *> $null
  $runOutput = docker run -d --rm --name $name -p "127.0.0.1:${port}:5432" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=postgres postgres:16-alpine 2>&1
  "docker run exit=$LASTEXITCODE $runOutput" | Out-File -Append (Join-Path $out 'pg-cluster.log') -Encoding utf8
  if ($LASTEXITCODE -ne 0) { return $null }
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    docker exec $name pg_isready -U postgres -h 127.0.0.1 *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  "docker ready=$ready" | Out-File -Append (Join-Path $out 'pg-cluster.log') -Encoding utf8
  if (-not $ready) { docker rm -f $name *> $null; return $null }
  [Environment]::SetEnvironmentVariable('DATABASE_URL', "postgresql://postgres@127.0.0.1:$port/aulia_care?schema=public", 'Process')
  return @{ Docker = $name }
}

# Disposable PostgreSQL cluster for e2e tests: created outside the repository,
# trust authentication on 127.0.0.1 only, its own port. Developer data is never used.
function Start-E2ECluster {
  $pgBin = if ($env:AULIA_PG_BIN) { $env:AULIA_PG_BIN } else { 'C:\Program Files\PostgreSQL\16\bin' }
  if (-not (Test-Path (Join-Path $pgBin 'pg_ctl.exe'))) { return $null }
  $pgData = Join-Path $env:TEMP 'aulia-care-e2e-pg'
  $port = if ($env:AULIA_E2E_PG_PORT) { $env:AULIA_E2E_PG_PORT } else { '55440' }
  if (-not (Test-Path (Join-Path $pgData 'PG_VERSION'))) {
    # initdb is unreliable under restricted Windows tokens: start from an existing
    # trust-only test cluster of this project when one is available.
    $template = Get-ChildItem $root -Directory -Filter '.tmp-core-pg-*' -ErrorAction SilentlyContinue |
      Where-Object { (Test-Path (Join-Path $_.FullName 'PG_VERSION')) -and -not (Test-Path (Join-Path $_.FullName 'postmaster.pid')) } |
      Select-Object -First 1
    if ($template) {
      "template=$($template.FullName)" | Out-File -Append (Join-Path $out 'pg-cluster.log') -Encoding utf8
      Copy-Item $template.FullName $pgData -Recurse
    } else {
      $initdb = Join-Path $pgBin 'initdb.exe'
      $initOutput = & $initdb -D $pgData -U aulia -A trust -E UTF8 --locale=C 2>&1
      "initdb exit=$LASTEXITCODE" | Out-File -Append (Join-Path $out 'pg-cluster.log') -Encoding utf8
      $initOutput | Out-File -Append (Join-Path $out 'pg-cluster.log') -Encoding utf8
    }
  }
  "pgBin=$pgBin pgData=$pgData port=$port" | Out-File -Append (Join-Path $out 'pg-cluster.log') -Encoding utf8
  $pgCtl = Join-Path $pgBin 'pg_ctl.exe'
  # Start-Process with file redirection and WaitForExit on pg_ctl only: the
  # postgres server it spawns must never hold a pipe this script waits on.
  $status = Invoke-PgCtl $pgCtl @('-D', "`"$pgData`"", 'status') (Join-Path $out 'pg-status')
  if ($status -ne 0) {
    $started = Invoke-PgCtl $pgCtl @('-D', "`"$pgData`"", '-o', "`"-p $port -h 127.0.0.1`"", '-l', "`"$pgData\server.log`"", '-w', '-t', '60', 'start') (Join-Path $out 'pg-start')
    "pg_ctl start exit=$started" | Out-File -Append (Join-Path $out 'pg-cluster.log') -Encoding utf8
  }
  if (Test-Path (Join-Path $pgData 'server.log')) { Get-Content (Join-Path $pgData 'server.log') -Tail 20 | Out-File -Append (Join-Path $out 'pg-cluster.log') -Encoding utf8 }
  [Environment]::SetEnvironmentVariable('DATABASE_URL', "postgresql://postgres@127.0.0.1:$port/aulia_care?schema=public", 'Process')
  return @{ Bin = $pgBin; Data = $pgData }
}

function Stop-E2ECluster($cluster) {
  if ($cluster -and $cluster.Docker) { docker rm -f $cluster.Docker *> $null; return }
  if ($cluster) { $null = Invoke-PgCtl (Join-Path $cluster.Bin 'pg_ctl.exe') @('-D', "`"$($cluster.Data)`"", '-m', 'fast', '-w', 'stop') (Join-Path $out 'pg-stop') }
}

$failed = 0
foreach ($step in ($Steps -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
  $command = switch ($step) {
    'lint'        { 'npm run lint' }
    'typecheck'   { 'npm run typecheck' }
    'unit'        { 'npm run test:unit' }
    'integration' { 'npm run test:integration' }
    'e2e'         { 'npm run test:isolated -w @aulia-care/backend' }
    'build'       { 'npm run build' }
    'prisma'      { 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\prisma-migration.ps1' }
    # Guided tour of the running demo (start it first with the 'demo' request).
    'tour'        { 'node scripts\dev\tour\tour.mjs' }
    default       { $null }
  }
  if (-not $command) { "$step : ETAPE INCONNUE" | Out-File -Append $summary -Encoding utf8; $failed++; continue }
  $cluster = $null
  if ($step -eq 'e2e' -or $step -eq 'integration') {
    Import-DotEnv (Join-Path $root 'backend/.env')
    # Optional local override (not versioned), e.g. the Docker development database.
    Import-DotEnv (Join-Path $root '.validation/e2e.env')
    if ($step -eq 'e2e' -and $env:AULIA_E2E_USE_DEV_DATABASE -ne '1') {
      $cluster = Start-DockerE2ECluster
      if (-not $cluster) { $cluster = Start-E2ECluster }
    }
  }

  $log = Join-Path $out "$step.log"
  $watch = [Diagnostics.Stopwatch]::StartNew()
  cmd /c "$command > `"$log`" 2>&1"
  $code = $LASTEXITCODE
  Stop-E2ECluster $cluster
  $status = if ($code -eq 0) { 'OK' } else { "ECHEC (code $code)"; $failed++ }
  "$step : $status en $([int]$watch.Elapsed.TotalSeconds) s" | Out-File -Append $summary -Encoding utf8
}

"FIN $(Get-Date -Format o) echecs=$failed" | Out-File -Append $summary -Encoding utf8
exit $failed
