-- Migration: add Service, ServiceTarif, ServiceResponsable
-- NOTE: It's recommended to run `npx prisma migrate dev` to generate an official migration.

BEGIN;

-- Ensure uuid extension (Postgres)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "Service" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ServiceTarif" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "serviceId" uuid NOT NULL REFERENCES "Service"(id) ON DELETE CASCADE,
  prix numeric(12,2) NOT NULL DEFAULT 0,
  "dateDebut" timestamptz NOT NULL DEFAULT now(),
  "dateFin" timestamptz,
  actif boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ServiceResponsable" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "serviceId" uuid NOT NULL REFERENCES "Service"(id) ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  principal boolean NOT NULL DEFAULT false,
  actif boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

COMMIT;
