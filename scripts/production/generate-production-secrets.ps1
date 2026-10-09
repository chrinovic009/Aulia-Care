[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

if (Test-Path -LiteralPath $OutputPath) {
    throw "Refus : le fichier de secrets existe déjà : $OutputPath"
}

function New-UrlSafeSecret {
    param([int]$Bytes = 48)

    $buffer = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    return [Convert]::ToBase64String($buffer).
        TrimEnd('=').
        Replace('+', '-').
        Replace('/', '_')
}

$directory = Split-Path -Parent $OutputPath
if ($directory) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$values = [ordered]@{
    POSTGRES_PASSWORD                = New-UrlSafeSecret
    REDIS_PASSWORD                   = New-UrlSafeSecret
    JWT_SECRET                       = New-UrlSafeSecret
    JWT_REFRESH_SECRET               = New-UrlSafeSecret
    DIAGNOSTIC_AGENT_SERVICE_SECRET  = New-UrlSafeSecret
    CONNECTED_CARE_INGESTION_SECRET  = New-UrlSafeSecret
    CONNECTED_CARE_GATEWAY_SECRET    = New-UrlSafeSecret
}

$lines = @(
    '# Generated locally for one Aulia Care production installation.',
    '# Keep this file outside Git and copy values into the approved secret store only.',
    '# Generated: ' + (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'),
    ''
)

foreach ($entry in $values.GetEnumerator()) {
    $lines += "$($entry.Key)=$($entry.Value)"
}

[System.IO.File]::WriteAllLines($OutputPath, $lines, [System.Text.UTF8Encoding]::new($false))

# Restrict the file to the account that generated it when Windows ACLs are available.
try {
    & icacls $OutputPath /inheritance:r /grant:r "$env:USERNAME:(R,W)" | Out-Null
} catch {
    Write-Warning 'ACL Windows non modifiée automatiquement. Limitez manuellement l’accès au fichier de secrets.'
}

Write-Host 'Secrets de production générés dans un fichier local protégé.'
Write-Host 'Aucune valeur secrète n’est affichée. Transférez-les vers le gestionnaire de secrets approuvé, puis supprimez ce fichier local de façon contrôlée.'
