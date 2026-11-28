# Enregistre les taches planifiees Windows d'exploitation (a lancer une fois, en administrateur) :
#  - Aulia Care - Sauvegarde : chaque nuit a 02:15 (sauvegarde chiffree puis copie hors site verifiee)
#  - Aulia Care - Surveillance : toutes les 15 minutes (sante API, sauvegarde, cle, copie hors site, disque)
# Les alertes partent vers AULIA_ALERT_WEBHOOK_URL (HTTPS) si defini, sinon dans ALERTE.txt.
param(
    [string]$HealthTarget = "https://127.0.0.1",
    [string]$StatusDirectory = "$env:USERPROFILE\.aulia-care\monitoring"
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backup = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $root -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"& '$root\scripts\production\run-backup-postgres.ps1'; if (`$LASTEXITCODE -eq 0) { & '$root\scripts\production\copy-backup-offsite.ps1' }`""
Register-ScheduledTask -TaskName "Aulia Care - Sauvegarde" -Action $backup -Trigger (New-ScheduledTaskTrigger -Daily -At "02:15") -RunLevel Highest -Force | Out-Null
$monitor = New-ScheduledTaskAction -Execute "node.exe" -WorkingDirectory $root -Argument "scripts\production\operations.mjs monitor $HealthTarget backups\postgres `"$StatusDirectory`""
$every15 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName "Aulia Care - Surveillance" -Action $monitor -Trigger $every15 -RunLevel Highest -Force | Out-Null
Write-Host "Taches enregistrees. Etat courant : $StatusDirectory\operations-status.json"
