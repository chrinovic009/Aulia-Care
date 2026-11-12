# Validates backend/prisma/schema.prisma and generates the SQL needed to go from
# the committed schema (HEAD) to the working-tree schema, without any database.
# Output: .validation/prisma/{base.prisma, migration.sql}
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$out = Join-Path $root '.validation\prisma'
New-Item -ItemType Directory -Force $out | Out-Null
$base = Join-Path $out 'base.prisma'
$baseRef = if ($env:AULIA_SCHEMA_BASE_REF) { $env:AULIA_SCHEMA_BASE_REF } else { 'HEAD' }
# cmd redirection keeps the exact bytes (no BOM, no re-encoding of accents).
cmd /c "git show ${baseRef}:backend/prisma/schema.prisma > `"$base`""
npx prisma validate --schema backend/prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx prisma migrate diff --from-schema-datamodel $base --to-schema-datamodel backend/prisma/schema.prisma --script --output (Join-Path $out 'migration.sql')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# Regenerate the client so typecheck and tests see the current schema.
npx prisma generate --schema backend/prisma/schema.prisma
exit $LASTEXITCODE
