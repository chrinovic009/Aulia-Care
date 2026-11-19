import 'dotenv/config';
import { AuditAction, PrismaClient, RoleSlug } from '@prisma/client';

function readArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) {
    throw new Error(`Argument requis : ${name} <valeur>.`);
  }
  return value;
}

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Cette réparation de données historiques est réservée à la procédure de maintenance production.');
  }

  const companyId = readArgument('--company-id');
  const clinicId = readArgument('--clinic-id');
  const actorId = readArgument('--actor-id');
  const confirmation = readArgument('--confirm');
  if (confirmation !== 'ASSIGN_SUBSCRIPTION_COMPANY_TO_CLINIC') {
    throw new Error('Confirmation exacte requise : --confirm ASSIGN_SUBSCRIPTION_COMPANY_TO_CLINIC.');
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const [company, clinic, actor] = await Promise.all([
        tx.subscriptionCompany.findUnique({
          where: { id: companyId },
          select: { id: true, clinicId: true, deletedAt: true },
        }),
        tx.clinic.findUnique({
          where: { id: clinicId },
          select: { id: true, deletedAt: true },
        }),
        tx.user.findFirst({
          where: {
            id: actorId,
            primaryRole: RoleSlug.DEV,
            clinicId: null,
            status: 'ACTIVE',
            deletedAt: null,
          },
          select: { id: true },
        }),
      ]);

      if (!actor) throw new Error('Le demandeur doit être un compte DEV plateforme actif, hors établissement.');
      if (!clinic || clinic.deletedAt) throw new Error('Établissement cible introuvable ou archivé.');
      if (!company || company.deletedAt) throw new Error('Contrat d’abonnement introuvable ou archivé.');
      if (company.clinicId) throw new Error('Ce contrat est déjà rattaché à un établissement ; aucun écrasement n’est autorisé.');

      await tx.subscriptionCompany.update({
        where: { id: company.id },
        data: { clinicId: clinic.id },
      });
      await tx.auditTrail.create({
        data: {
          actorId: actor.id,
          entity: 'SubscriptionCompany',
          entityId: company.id,
          action: AuditAction.UPDATE,
          before: { clinicId: null },
          after: {
            clinicId: clinic.id,
            event: 'SUBSCRIPTION_COMPANY_LEGACY_TENANT_ASSIGNED',
            source: 'assign-subscription-company-clinic',
          },
        },
      });
    });
    console.log('Contrat historique rattaché à l’établissement explicitement choisi. Relancez audit:tenant-integrity pour vérification.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
