import { PrismaClient, RoleSlug } from "@prisma/client";

const prisma = new PrismaClient();

const roleData = [
  {
    slug: RoleSlug.RECEPTIONIST,
    name: "Réceptionniste",
    description: "Accueille les patients et gère les enregistrements."
  },
  {
    slug: RoleSlug.NURSE,
    name: "Infirmier",
    description: "Assure les soins et le suivi des patients."
  },
  {
    slug: RoleSlug.PHYSICIAN,
    name: "Médecin",
    description: "Consultations et diagnostics médicaux."
  }
];

async function main() {
  console.log("⏳ Seed des rôles...");

  for (const role of roleData) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: {
        name: role.name,
        description: role.description
      },
      create: {
        slug: role.slug,
        name: role.name,
        description: role.description
      }
    });
  }

  console.log("✅ Seed terminé (roles uniquement)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });