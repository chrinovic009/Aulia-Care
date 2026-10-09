[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$EncryptedBackupPath,

    [Parameter(Mandatory = $true)]
    [string]$IdentityFile
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $EncryptedBackupPath)) {
    throw "Sauvegarde chiffrée introuvable : $EncryptedBackupPath"
}
if (-not (Test-Path -LiteralPath $IdentityFile)) {
    throw "Clé privée age introuvable : $IdentityFile"
}
if (-not (Get-Command age -ErrorAction SilentlyContinue)) {
    throw 'La commande age est requise pour tester une restauration chiffrée.'
}

$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$containerName = "aulia-care-restore-test-$suffix"
$volumeName = "aulia-care-restore-test-$suffix"
$temporaryDump = Join-Path ([System.IO.Path]::GetTempPath()) "aulia-care-restore-test-$suffix.dump"
$passwordBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
$databasePassword = [Convert]::ToBase64String($passwordBytes)

try {
    Write-Host '[1/5] Déchiffrement local de la sauvegarde dans un fichier temporaire...'
    age -d -i $IdentityFile -o $temporaryDump $EncryptedBackupPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporaryDump)) {
        throw 'Déchiffrement de la sauvegarde impossible.'
    }

    Write-Host '[2/5] Démarrage d’un PostgreSQL isolé et éphémère...'
    docker volume create $volumeName | Out-Null
    docker run -d --name $containerName `
        -e POSTGRES_USER=aulia_restore `
        -e POSTGRES_PASSWORD=$databasePassword `
        -e POSTGRES_DB=aulia_restore `
        -v "${volumeName}:/var/lib/postgresql/data" `
        postgres:16-alpine | Out-Null

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        docker exec $containerName pg_isready -U aulia_restore -d aulia_restore | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'PostgreSQL de restauration ne répond pas.' }

    Write-Host '[3/5] Copie et restauration dans la base isolée...'
    docker cp $temporaryDump "${containerName}:/tmp/restore.dump"
    if ($LASTEXITCODE -ne 0) { throw 'Copie du dump vers le conteneur de test impossible.' }
    docker exec $containerName pg_restore --exit-on-error -U aulia_restore -d aulia_restore /tmp/restore.dump
    if ($LASTEXITCODE -ne 0) { throw 'La restauration PostgreSQL a échoué.' }

    Write-Host '[4/5] Vérification du schéma restauré...'
    $tableCount = docker exec $containerName psql -U aulia_restore -d aulia_restore -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
    if ($LASTEXITCODE -ne 0 -or [int]$tableCount -le 0) {
        throw 'La restauration ne contient aucune table applicative.'
    }

    Write-Host "[5/5] RESTORE TEST PASS - ${tableCount} tables restored in an isolated environment."
}
finally {
    if (Test-Path -LiteralPath $temporaryDump) {
        Remove-Item -LiteralPath $temporaryDump -Force -ErrorAction SilentlyContinue
    }
    docker rm -f $containerName 2>$null | Out-Null
    docker volume rm $volumeName 2>$null | Out-Null
}
