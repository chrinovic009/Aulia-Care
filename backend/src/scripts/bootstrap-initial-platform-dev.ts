import 'dotenv/config';

import * as bcrypt from 'bcrypt';

import {
  AuditAction,
  Prisma,
  PrismaClient,
  RoleSlug,
} from '@prisma/client';

const BOOTSTRAP_ADVISORY_LOCK = 20_260_908;

type BootstrapConfig = {
  email: string;
  username: string;
  password: string;
  approvalToken: string;
  approvalTokenHash: string;
};

function readRequiredEnvironment(name: string): string {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    throw new Error(`Variable de sécurité requise absente : ${name}.`);
  }

  return value;
}

export function readInitialPlatformDevBootstrapConfig(): BootstrapConfig {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      'Ce bootstrap initial est réservé à NODE_ENV=production. Utilisez bootstrap:dev uniquement en développement local.',
    );
  }

  if (process.env.AULIA_INITIAL_DEV_BOOTSTRAP_ENABLED !== 'true') {
    throw new Error(
      'Bootstrap initial refusé : AULIA_INITIAL_DEV_BOOTSTRAP_ENABLED=true est requis temporairement.',
    );
  }

  if (
    process.env.AULIA_INITIAL_DEV_BOOTSTRAP_CONFIRM !==
    'CREATE_INITIAL_PLATFORM_DEV'
  ) {
    throw new Error(
      'Bootstrap initial refusé : confirmation explicite manquante.',
    );
  }

  const email = readRequiredEnvironment(
    'AULIA_INITIAL_DEV_BOOTSTRAP_EMAIL',
  ).toLowerCase();

  const username = readRequiredEnvironment(
    'AULIA_INITIAL_DEV_BOOTSTRAP_USERNAME',
  ).toLowerCase();

  const password = readRequiredEnvironment(
    'AULIA_INITIAL_DEV_BOOTSTRAP_PASSWORD',
  );

  const approvalToken = readRequiredEnvironment(
    'AULIA_INITIAL_DEV_BOOTSTRAP_TOKEN',
  );

  const approvalTokenHash = readRequiredEnvironment(
    'AULIA_INITIAL_DEV_BOOTSTRAP_TOKEN_HASH',
  );

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      'Adresse e-mail du compte plateforme DEV invalide.',
    );
  }

  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
    throw new Error(
      'Identifiant DEV invalide : 3 à 64 caractères minuscules, chiffres, . _ ou -.',
    );
  }

  if (password.length < 16) {
    throw new Error(
      'Le mot de passe initial DEV doit contenir au moins 16 caractères.',
    );
  }

  if (
    approvalToken.length < 32 ||
    !approvalTokenHash.startsWith('$2')
  ) {
    throw new Error(
      'Jeton d’approbation de bootstrap invalide. Générez une nouvelle paire avec generate:initial-dev-bootstrap-token.',
    );
  }

  return {
    email,
    username,
    password,
    approvalToken,
    approvalTokenHash,
  };
}

async function bootstrapInitialPlatformDev() {
  const config = readInitialPlatformDevBootstrapConfig();

  const isApproved = await bcrypt.compare(
    config.approvalToken,
    config.approvalTokenHash,
  );

  if (!isApproved) {
    throw new Error(
      'Jeton d’approbation de bootstrap invalide. Aucun compte n’a été créé.',
    );
  }

  const prisma = new PrismaClient();

  try {
    const user = await prisma.$transaction(
      async (tx) => {
        // The role is not globally unique. PostgreSQL advisory locking makes
        // two concurrent emergency-console invocations deterministic.
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK})`,
        );

        const existing = await tx.user.findFirst({
          where: {
            primaryRole: RoleSlug.DEV,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        });

        if (existing) {
          throw new Error(
            'Bootstrap initial refusé : un compte plateforme DEV existe déjà. Utilisez le workflow d’administration approuvé, jamais ce bootstrap.',
          );
        }

        const role = await tx.role.upsert({
          where: {
            slug: RoleSlug.DEV,
          },
          create: {
            slug: RoleSlug.DEV,
            name: 'Développeur plateforme',
            description:
              'Provisionne les établissements et leurs licences.',
          },
          update: {
            name: 'Développeur plateforme',
            description:
              'Provisionne les établissements et leurs licences.',
          },
        });

        const created = await tx.user.create({
          data: {
            email: config.email,
            username: config.username,
            displayName: 'Développeur plateforme Aulia Care',
            firstName: 'Développeur',
            lastName: 'Aulia Care',
            passwordHash: await bcrypt.hash(config.password, 12),
            primaryRole: RoleSlug.DEV,
            clinicId: null,
            roles: {
              create: {
                roleId: role.id,
                active: true,
              },
            },
          },
          select: {
            id: true,
            username: true,
            email: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: created.id,
            action: AuditAction.CREATE,
            entity: 'PlatformBootstrap',
            entityId: created.id,
            summary:
              'Compte plateforme DEV initial créé par bootstrap hors ligne à usage unique.',
            metadata: {
              workflow: 'INITIAL_PLATFORM_DEV_BOOTSTRAP',
              role: RoleSlug.DEV,
              approvalTokenVerified: true,
            },
          },
        });

        return created;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    console.log(
      `Compte plateforme DEV initial créé : ${user.username} (${user.email}).`,
    );

    console.log(
      'Supprimez immédiatement AULIA_INITIAL_DEV_BOOTSTRAP_* du gestionnaire de secrets puis redémarrez les services.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  bootstrapInitialPlatformDev().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : error,
    );

    process.exitCode = 1;
  });
}