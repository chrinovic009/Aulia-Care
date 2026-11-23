#!/bin/sh
# Realigns the password of the PostgreSQL role "aulia" in the Docker volume with
# POSTGRES_PASSWORD from the root .env (the volume keeps the password it was
# created with). Run inside the postgres container, which knows the variable:
#   Get-Content scripts\dev\sync-postgres-password.sh -Raw | docker compose exec -T postgres sh
set -e
[ -n "$POSTGRES_PASSWORD" ] || { echo "POSTGRES_PASSWORD absent du conteneur"; exit 1; }
printf "ALTER USER aulia PASSWORD :'pw';\\n" | psql -U aulia -d aulia_care -v ON_ERROR_STOP=1 -v pw="$POSTGRES_PASSWORD"
echo "Mot de passe de la base realigne sur .env"
