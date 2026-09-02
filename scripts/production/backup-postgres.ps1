param(
    [string]$EnvFile = ".env.prod",
    [string]$ContainerName = "aulia-care-prod-postgres-1",
    [string]$BackupDirectory = ".\backups\postgres",
    [string]$RecipientFile = "$env:USERPROFILE\.aulia-care\keys\backup-recipient.txt",
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

function Remove-ExpiredBackups {
    param(
        [string]$Directory,
        [datetime]$Limit
    )

    $patterns = @(
        "aulia-care-*.dump",
        "aulia-care-*.dump.sha256",
        "aulia-care-*.dump.age",
        "aulia-care-*.dump.age.sha256"
    )

    foreach ($pattern in $patterns) {
        Get-ChildItem `
            -Path $Directory `
            -Filter $pattern `
            -File `
            -ErrorAction SilentlyContinue |
            Where-Object {
                $_.LastWriteTime -lt $Limit
            } |
            Remove-Item -Force
    }
}

if (-not (Test-Path $EnvFile)) {
    throw "Fichier d'environnement introuvable : $EnvFile"
}

if (-not (Test-Path $RecipientFile)) {
    throw "Cle publique age introuvable : $RecipientFile"
}

$ageCommand = Get-Command age -ErrorAction SilentlyContinue

if (-not $ageCommand) {
    throw "La commande 'age' est introuvable dans le PATH."
}

New-Item `
    -ItemType Directory `
    -Force `
    -Path $BackupDirectory |
    Out-Null

$backupDirectoryFullPath = (
    Resolve-Path $BackupDirectory
).Path

$postgresUser = Get-EnvValue `
    -Path $EnvFile `
    -Name "POSTGRES_USER"

$postgresDatabase = Get-EnvValue `
    -Path $EnvFile `
    -Name "POSTGRES_DB"

$recipient = (
    Get-Content `
        -Path $RecipientFile `
        -ErrorAction Stop |
        Select-Object -First 1
).Trim()

if ([string]::IsNullOrWhiteSpace($recipient)) {
    throw "La cle publique age est vide."
}

if ($recipient -notmatch "^age1") {
    throw "Le fichier recipient ne contient pas une cle publique age valide."
}

$running = docker inspect `
    --format '{{.State.Running}}' `
    $ContainerName 2>$null

if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
    throw "Le conteneur PostgreSQL '$ContainerName' n'est pas actif."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

$fileName = "aulia-care-$timestamp.dump"

$localBackup = Join-Path `
    $backupDirectoryFullPath `
    $fileName

$checksumFile = "$localBackup.sha256"

$encryptedFile = "$localBackup.age"

$encryptedChecksumFile = "$encryptedFile.sha256"

$containerBackup = "/tmp/$fileName"

Write-Host "Aulia Care PostgreSQL Backup"
Write-Host "Database    : $postgresDatabase"
Write-Host "Destination : $localBackup"
Write-Host "Encryption  : age"

try {
    Write-Host ""
    Write-Host "[1/7] Creation du dump PostgreSQL..."

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

    Write-Host "[2/7] Copie du dump vers l'hote..."

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

    Write-Host "[3/7] Verification du catalogue PostgreSQL..."

    docker run `
        --rm `
        -v "${backupDirectoryFullPath}:/backups:ro" `
        postgres:16-alpine `
        pg_restore `
        --list `
        "/backups/$fileName" |
        Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "La verification pg_restore a echoue."
    }

    Write-Host "[4/7] Generation du checksum SHA256 du dump..."

    $hash = Get-FileHash `
        -Path $localBackup `
        -Algorithm SHA256

    "$($hash.Hash)  $fileName" |
        Set-Content `
            -Path $checksumFile `
            -Encoding ascii

    if (-not (Test-Path $checksumFile)) {
        throw "Le fichier de checksum du dump n'a pas ete cree."
    }

    Write-Host "[5/7] Chiffrement age..."

    age `
        -r $recipient `
        -o $encryptedFile `
        $localBackup

    if ($LASTEXITCODE -ne 0) {
        throw "Le chiffrement age a echoue."
    }

    if (-not (Test-Path $encryptedFile)) {
        throw "Le fichier chiffre n'a pas ete cree."
    }

    $encryptedInfo = Get-Item $encryptedFile

    if ($encryptedInfo.Length -le 0) {
        throw "Le fichier chiffre est vide."
    }

    Write-Host "[6/7] Generation du checksum SHA256 du fichier chiffre..."

    $encryptedHash = Get-FileHash `
        -Path $encryptedFile `
        -Algorithm SHA256

    "$($encryptedHash.Hash)  $($encryptedInfo.Name)" |
        Set-Content `
            -Path $encryptedChecksumFile `
            -Encoding ascii

    if (-not (Test-Path $encryptedChecksumFile)) {
        throw "Le checksum du fichier chiffre n'a pas ete cree."
    }

    Write-Host "[7/7] Application de la retention..."

    $limit = (Get-Date).AddDays(-$RetentionDays)

    Remove-ExpiredBackups `
        -Directory $backupDirectoryFullPath `
        -Limit $limit

    Write-Host ""
    Write-Host "BACKUP SUCCESS"
    Write-Host "Database          : $postgresDatabase"
    Write-Host "Dump              : $($backupInfo.Name)"
    Write-Host "Dump size         : $($backupInfo.Length) bytes"
    Write-Host "Dump SHA256       : $($hash.Hash)"
    Write-Host "Encrypted         : $($encryptedInfo.Name)"
    Write-Host "Encrypted size    : $($encryptedInfo.Length) bytes"
    Write-Host "Encrypted SHA256  : $($encryptedHash.Hash)"
    Write-Host "Recipient         : $RecipientFile"
    Write-Host "Retention         : $RetentionDays days"
}
catch {
    Write-Error $_

    if (Test-Path $encryptedFile) {
        Remove-Item `
            -Path $encryptedFile `
            -Force `
            -ErrorAction SilentlyContinue
    }

    if (Test-Path $encryptedChecksumFile) {
        Remove-Item `
            -Path $encryptedChecksumFile `
            -Force `
            -ErrorAction SilentlyContinue
    }

    throw
}
finally {
    docker exec `
        $ContainerName `
        rm -f $containerBackup 2>$null |
        Out-Null
}