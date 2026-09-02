$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (
    Join-Path $PSScriptRoot "..\.."
)

Set-Location $projectRoot

$logDirectory = Join-Path $projectRoot "backups\logs"

New-Item `
    -ItemType Directory `
    -Force `
    -Path $logDirectory |
    Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

$logFile = Join-Path `
    $logDirectory `
    "postgres-backup-$timestamp.log"

try {
    & (
        Join-Path `
            $projectRoot `
            "scripts\production\backup-postgres.ps1"
    ) *>&1 |
        Tee-Object `
            -FilePath $logFile

    if ($LASTEXITCODE -ne 0) {
        throw "Le script de backup PostgreSQL a echoue."
    }

    exit 0
}
catch {
    $_ | Out-String |
        Add-Content `
            -Path $logFile

    Write-Error $_

    exit 1
}