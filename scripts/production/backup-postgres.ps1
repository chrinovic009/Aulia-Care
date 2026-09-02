param(
    [string]$EnvFile = ".env.prod",
    [string]$ContainerName = "aulia-care-prod-postgres-1",
    [string]$BackupDirectory = ".\backups\postgres",
    [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

function Get-EnvValue {
    param(
        [string]$Path,
        [string]$Name
    )

    $line = Get-Content $Path |
        Where-Object {
            $_ -match "^\s*$([regex]::Escape($Name))="
        } |
        Select-Object -First 1

    if (-not $line) {
        throw "Variable '$Name' absente de $Path."
    }

    $value = $line -replace "^\s*$([regex]::Escape($Name))=", ""

    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Variable '$Name' vide dans $Path."
    }

    return $value.Trim()
}

if (-not (Test-Path $EnvFile)) {
    throw "Fichier d'environnement introuvable : $EnvFile"
}

New-Item `
    -ItemType Directory `
    -Force `
    -Path $BackupDirectory |
    Out-Null

$postgresUser = Get-EnvValue `
    -Path $EnvFile `
    -Name "POSTGRES_USER"

$postgresDatabase = Get-EnvValue `
    -Path $EnvFile `
    -Name "POSTGRES_DB"

$running = docker inspect `
    --format '{{.State.Running}}' `
    $ContainerName 2>$null

if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
    throw "Le conteneur PostgreSQL '$ContainerName' n'est pas actif."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

$fileName = "aulia-care-$timestamp.dump"

$localBackup = Join-Path `
    $BackupDirectory `
    $fileName

$containerBackup = "/tmp/$fileName"

Write-Host "Aulia Care PostgreSQL Backup"
Write-Host "Database : $postgresDatabase"
Write-Host "Destination : $localBackup"

try {
    Write-Host ""
    Write-Host "[1/4] Creation du dump..."

    docker exec `
        $ContainerName `
        pg_dump `
        -U $postgresUser `
        -d $postgresDatabase `
        -Fc `
        -f $containerBackup

    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump a echoue."
    }

    Write-Host "[2/4] Copie du dump vers l'hote..."

    docker cp `
        "${ContainerName}:${containerBackup}" `
        $localBackup

    if ($LASTEXITCODE -ne 0) {
        throw "docker cp a echoue."
    }

    if (-not (Test-Path $localBackup)) {
        throw "Le fichier de sauvegarde n'existe pas apres la copie."
    }

    $backupInfo = Get-Item $localBackup

    if ($backupInfo.Length -le 0) {
        throw "Le fichier de sauvegarde est vide."
    }

    Write-Host "[3/4] Verification du catalogue PostgreSQL..."

    docker run `
        --rm `
        -v "${PWD}\backups\postgres:/backups:ro" `
        postgres:16-alpine `
        pg_restore `
        --list `
        "/backups/$fileName" |
        Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "La verification pg_restore a echoue."
    }

    Write-Host "[4/4] Application de la retention..."

    $limit = (Get-Date).AddDays(-$RetentionDays)

    Get-ChildItem `
        -Path $BackupDirectory `
        -Filter "aulia-care-*.dump" `
        -File |
        Where-Object {
            $_.LastWriteTime -lt $limit
        } |
        Remove-Item -Force

    $hash = Get-FileHash `
        -Path $localBackup `
        -Algorithm SHA256

    Write-Host ""
    Write-Host "BACKUP SUCCESS"
    Write-Host "File   : $($backupInfo.Name)"
    Write-Host "Size   : $($backupInfo.Length) bytes"
    Write-Host "SHA256 : $($hash.Hash)"
    Write-Host "Retention : $RetentionDays days"
}
finally {
    docker exec `
        $ContainerName `
        rm -f $containerBackup 2>$null |
        Out-Null
}