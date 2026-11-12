# Aulia Care - local validation runner.
# Watches .validation/requests/<id>.txt. Each request holds a comma-separated list
# of steps; only the steps known to validate.ps1 are accepted. The result is written
# once to .validation/results/<id>.txt (never rewritten), and the logs go to
# .validation/run-<id>/. Stop with Ctrl+C or by closing the terminal.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$requests = Join-Path $root '.validation\requests'
$results = Join-Path $root '.validation\results'
New-Item -ItemType Directory -Force $requests, $results | Out-Null
$validate = Join-Path $root 'scripts\dev\validate.ps1'
$allowed = @('lint','typecheck','unit','integration','e2e','build','prisma')

Write-Host "Aulia validation runner : en attente de .validation\requests\*.txt (Ctrl+C pour arreter)"
while ($true) {
  foreach ($file in (Get-ChildItem $requests -Filter '*.txt' | Sort-Object Name)) {
    $id = $file.BaseName
    if ($id -notmatch '^[A-Za-z0-9_-]{1,64}$') { Remove-Item $file.FullName -Force; continue }
    $steps = ((Get-Content $file.FullName -Raw) -replace '\s', '').Trim(',')
    Remove-Item $file.FullName -Force
    $resultFile = Join-Path $results "$id.txt"
    $invalid = @($steps -split ',' | Where-Object { $_ -and ($allowed -notcontains $_) })
    if ($invalid.Count -gt 0) {
      [IO.File]::WriteAllText($resultFile, "REFUSED etapes inconnues: $($invalid -join ',')")
      continue
    }
    $runDir = Join-Path $root ".validation\run-$id"
    Write-Host "=== $(Get-Date -Format T) [$id] : $steps"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $validate -Steps $steps -RunDir $runDir
    $code = $LASTEXITCODE
    [IO.File]::WriteAllText($resultFile, "DONE code=$code run=run-$id finished=$(Get-Date -Format o)")
    Write-Host "=== [$id] termine (echecs=$code)"
  }
  Start-Sleep -Seconds 3
}
