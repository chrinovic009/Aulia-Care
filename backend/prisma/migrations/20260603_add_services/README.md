This is a placeholder SQL migration adding Service, ServiceTarif and ServiceResponsable tables.

Recommended workflow:

1. Install Prisma CLI if not installed: `npm install -D prisma @prisma/client`
2. Update `schema.prisma` (already updated in this repo).
3. Run: `npx prisma migrate dev --name add_services` to let Prisma generate a proper migration and update the migration history.

If you prefer to apply the provided SQL directly, run it against your Postgres database, but ensure you have backups and that the UUID extension `pgcrypto` is available.
