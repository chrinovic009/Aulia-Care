# Copie la sauvegarde chiffree la plus recente (.age + .sha256) hors du serveur
# (disque externe, NAS, dossier synchronise). La copie est verifiee par empreinte.
# La cle PRIVEE age ne doit jamais se trouver sur ce serveur.
param(
    [string]$BackupDirectory = ".\backups\postgres",
    [string]$OffsiteDirectory = $env:AULIA_BACKUP_OFFSITE_DIR
)
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
if (-not $OffsiteDirectory) { throw "Definir AULIA_BACKUP_OFFSITE_DIR (dossier hors serveur)." }
if (-not (Test-Path $OffsiteDirectory)) { throw "Destination hors site inaccessible : $OffsiteDirectory" }
$newest = Get-ChildItem $BackupDirectory -Filter "aulia-care-*.dump.age" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $newest) { throw "Aucune sauvegarde chiffree a copier." }
$checksum = "$($newest.FullName).sha256"
if (-not (Test-Path $checksum)) { throw "Empreinte absente pour $($newest.Name)." }
Copy-Item $newest.FullName -Destination $OffsiteDirectory -Force
Copy-Item $checksum -Destination $OffsiteDirectory -Force
$expected = ((Get-Content $checksum -Raw).Trim() -split '\s+')[0]
$actual = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $OffsiteDirectory $newest.Name)).Hash
if ($actual.ToLower() -ne $expected.ToLower()) { throw "Copie hors site corrompue : empreinte differente." }
Write-Host "Copie hors site verifiee : $($newest.Name)"
