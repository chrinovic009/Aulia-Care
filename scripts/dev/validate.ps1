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
    default       { $null }
  }
  if (-not $command) { "$step : ETAPE INCONNUE" | Out-File -Append $summary -Encoding utf8; $failed++; continue }
  if ($step -eq 'e2e' -or $step -eq 'integration') {
    Import-DotEnv (Join-Path $root 'backend/.env')
    # Optional local override (not versioned), e.g. the Docker development database.
    Import-DotEnv (Join-Path $root '.validation/e2e.env')
  }

  $log = Join-Path $out "$step.log"
  $watch = [Diagnostics.Stopwatch]::StartNew()
  cmd /c "$command > `"$log`" 2>&1"
  $code = $LASTEXITCODE
  $status = if ($code -eq 0) { 'OK' } else { "ECHEC (code $code)"; $failed++ }
  "$step : $status en $([int]$watch.Elapsed.TotalSeconds) s" | Out-File -Append $summary -Encoding utf8
}

"FIN $(Get-Date -Format o) echecs=$failed" | Out-File -Append $summary -Encoding utf8
exit $failed
