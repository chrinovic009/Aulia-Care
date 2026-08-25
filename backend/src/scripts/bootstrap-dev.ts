import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient, RoleSlug } from '@prisma/client';

/**
 * One-time local provisioning. It deliberately has no public HTTP equivalent:
 * exposing creation of the DEV role would allow taking over an installation.
 */
async function bootstrap() {
  const email = String(process.env.AULIA_DEV_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.AULIA_DEV_BOOTSTRAP_PASSWORD || '');
  const username = String(process.env.AULIA_DEV_BOOTSTRAP_USERNAME || 'aulia-dev').trim().toLowerCase();
  if (!email || !password || password.length < 16) {
    throw new Error('Définissez AULIA_DEV_BOOTSTRAP_EMAIL et un AULIA_DEV_BOOTSTRAP_PASSWORD d’au moins 16 caractères dans backend/.env avant cette opération unique.');
  }

  const resetRequested = process.env.AULIA_DEV_BOOTSTRAP_RESET === 'true';
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findFirst({
      where: { primaryRole: RoleSlug.DEV, deletedAt: null },
      select: { id: true, username: true, email: true, status: true },
    });
    if (existing && !resetRequested) {
      console.log(`Compte DEV déjà existant — identifiant : ${existing.username} ; e-mail : ${existing.email} ; état : ${existing.status}.`);
      console.log('Le mot de passe n’est jamais affiché. Pour le remplacer, ajoutez temporairement AULIA_DEV_BOOTSTRAP_RESET=true dans backend/.env et relancez cette commande.');
      return;
    }
    if (existing && resetRequested) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await bcrypt.hash(password, 12), status: 'ACTIVE' },
      });
      console.log(`Mot de passe DEV remplacé — identifiant : ${existing.username}. Retirez immédiatement AULIA_DEV_BOOTSTRAP_PASSWORD et AULIA_DEV_BOOTSTRAP_RESET du fichier .env.`);
      return;
    }

    const role = await prisma.role.upsert({
      where: { slug: RoleSlug.DEV },
      create: { slug: RoleSlug.DEV, name: 'Développeur d’installation', description: 'Configure les couches produit de cette installation.' },
      update: { name: 'Développeur d’installation' },
    });
    const user = await prisma.user.create({
      data: {
        email,
        username,
        displayName: 'Développeur Aulia Care',
        firstName: 'Développeur',
        lastName: 'Aulia Care',
        passwordHash: await bcrypt.hash(password, 12),
        primaryRole: RoleSlug.DEV,
        roles: { create: { roleId: role.id, active: true } },
      },
      select: { id: true, email: true, username: true },
    });
    console.log(`Compte DEV créé — identifiant : ${user.username} ; e-mail : ${user.email}. Connectez-vous, configurez les couches dans /dev/couches, puis retirez AULIA_DEV_BOOTSTRAP_PASSWORD du fichier .env.`);
  } finally {
    await prisma.$disconnect();
  }
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
