import { PrismaClient, RoleSlug } from "@prisma/client";

const prisma = new PrismaClient();

const roleData = [
  {
    slug: RoleSlug.RECEPTIONIST,
    name: "Réceptionniste",
    description: "Accueille les patients, enregistre les informations et oriente vers les services médicaux."
  },
  {
    slug: RoleSlug.NURSE,
    name: "Infirmier",
    description: "Gère les soins infirmiers, les constantes vitales et les suivis des patients hospitalisés."
  },
  {
    slug: RoleSlug.PHYSICIAN,
    name: "Médecin",
    description: "Assure les consultations, le diagnostic et les prescriptions médicales."
  }
];

const usersData = [
  {
    email: "failakeren04@gmail.com",
    username: "d7fk01",
    displayName: "Keren Faila",
    firstName: "Keren",
    lastName: "Faila",
    passwordHash: "d7-12026",
    primaryRole: RoleSlug.RECEPTIONIST,
    phone: "+243991666646",
    whatsappUrl: "https://wa.me/243991666646",
    facebookUrl: "https://www.facebook.com/miss_fnk",
    instagramUrl: "https://www.instagram.com/miss_fnk",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Lualaba",
    addressCity: "Kolwezi",
    addressNeighborhood: "Joli Site",
    addressStreet: "Avenue John Kahozi",
    bio: "Réceptionniste attentive et fiable, experte dans l’organisation des flux patients et la gestion des urgences administratives.",
  },
  {
    email: "matendagedeon@gmail.com",
    username: "d7mg02",
    displayName: "Gédéon MATENDA",
    firstName: "Gédéon",
    lastName: "MATENDA",
    passwordHash: "d7-22026",
    primaryRole: RoleSlug.NURSE,
    phone: "+243971462456",
    whatsappUrl: "https://wa.me/243971462456",
    facebookUrl: "https://www.facebook.com/bro_ged",
    instagramUrl: "https://www.instagram.com/bro_ged",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Lualaba",
    addressCity: "Kolwezi",
    addressNeighborhood: "Joli Site",
    addressStreet: "Avenue Kazembe",
    bio: "Infirmier professionnel engagé, spécialisé dans le suivi des constantes vitales et l’accompagnement des patients hospitalisés.",
  },
  {
    email: "nagedegemwehu@gmail.com",
    username: "d7nm03",
    displayName: "Nadège Mwehu",
    firstName: "Nadège",
    lastName: "Mwehu",
    passwordHash: "d7-32026",
    primaryRole: RoleSlug.PHYSICIAN,
    specialty: "Généraliste",
    phone: "+243994652587",
    whatsappUrl: "https://wa.me/243994652587",
    facebookUrl: "https://www.facebook.com/nadege_m",
    instagramUrl: "https://www.instagram.com/nadege_m",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Kalubwe",
    addressStreet: "Avenue Double Poto",
    bio: "Médecin généraliste expérimentée, dédiée à un diagnostic précis et à un suivi bienveillant des patients."
  },
  {
    email: "jeankaseba@gmail.com",
    username: "d7jk04",
    displayName: "Jean Kaseba",
    firstName: "Jean",
    lastName: "Kaseba",
    passwordHash: "d7-42026",
    primaryRole: RoleSlug.PHYSICIAN,
    specialty: "Cardiologue",
    phone: "+243983450112",
    whatsappUrl: "https://wa.me/243983450112",
    facebookUrl: "https://www.facebook.com/jean.kaseba",
    instagramUrl: "https://www.instagram.com/jean.kaseba",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Hippodrome",
    addressStreet: "Avenue du 30 Juin",
    bio: "Cardiologue rigoureux, spécialisé dans le diagnostic des pathologies cardiovasculaires et la coordination avec le bloc opératoire."
  },
  {
    email: "chantal.mumbashi@gmail.com",
    username: "d7cm05",
    displayName: "Chantal Mumbashi",
    firstName: "Chantal",
    lastName: "Mumbashi",
    passwordHash: "d7-52026",
    primaryRole: RoleSlug.PHYSICIAN,
    specialty: "Pédiatre",
    phone: "+243993215478",
    whatsappUrl: "https://wa.me/243993215478",
    facebookUrl: "https://www.facebook.com/chantal.mumbashi",
    instagramUrl: "https://www.instagram.com/chantal.mumbashi",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Kimpanzu",
    addressStreet: "Avenue des Acacias",
    bio: "Pédiatre attentive, passionnée par le suivi des enfants et par le soutien des familles pendant les consultations."
  },
  {
    email: "alain.tshibanda@gmail.com",
    username: "d7at06",
    displayName: "Alain Tshibanda",
    firstName: "Alain",
    lastName: "Tshibanda",
    passwordHash: "d7-62026",
    primaryRole: RoleSlug.PHYSICIAN,
    specialty: "Gynécologue",
    phone: "+243990987654",
    whatsappUrl: "https://wa.me/243990987654",
    facebookUrl: "https://www.facebook.com/alain.tshibanda",
    instagramUrl: "https://www.instagram.com/alain.tshibanda",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Kasenyi",
    addressStreet: "Avenue Mandela",
    bio: "Gynécologue très expérimenté, reconnu pour son accompagnement rigoureux des patientes et ses bilans médicaux complets."
  },
  {
    email: "rose.lunda@gmail.com",
    username: "d7rl07",
    displayName: "Rose Lunda",
    firstName: "Rose",
    lastName: "Lunda",
    passwordHash: "d7-72026",
    primaryRole: RoleSlug.PHYSICIAN,
    specialty: "Orthopédiste",
    phone: "+243989321475",
    whatsappUrl: "https://wa.me/243989321475",
    facebookUrl: "https://www.facebook.com/rose.lunda",
    instagramUrl: "https://www.instagram.com/rose.lunda",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Kafubu",
    addressStreet: "Avenue Laurent-Désiré Kabila",
    bio: "Orthopédiste engagée, spécialisée dans la prise en charge des traumas musculo-squelettiques et le suivi post-opératoire."
  },
  {
    email: "luc.mwamba@gmail.com",
    username: "d7lm08",
    displayName: "Luc Mwamba",
    firstName: "Luc",
    lastName: "Mwamba",
    passwordHash: "d7-82026",
    primaryRole: RoleSlug.PHYSICIAN,
    specialty: "Radiologue",
    phone: "+243986321974",
    whatsappUrl: "https://wa.me/243986321974",
    facebookUrl: "https://www.facebook.com/luc.mwamba",
    instagramUrl: "https://www.instagram.com/luc.mwamba",
    nationality: "Congolaise",
    addressCountry: "République Démocratique du Congo",
    addressProvince: "Haut-Katanga",
    addressCity: "Lubumbashi",
    addressNeighborhood: "Kenya",
    addressStreet: "Avenue de l’Indépendance",
    bio: "Radiologue spécialisé en imagerie diagnostique, expert dans l’interprétation des scanners et des examens radiologiques."
  }
];

async function main() {
  console.log("⏳ Seed des rôles et des utilisateurs D7 Clinique...");

  for (const role of roleData) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: { name: role.name, description: role.description },
      create: {
        slug: role.slug,
        name: role.name,
        description: role.description
      }
    });
  }

  for (const user of usersData) {
    const createdUser = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        username: user.username,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        passwordHash: user.passwordHash,
        primaryRole: user.primaryRole,
        specialty: user.specialty,
        bio: user.bio,
        profilePhotoUrl: user.profilePhotoUrl,
        phone: user.phone,
        whatsappUrl: user.whatsappUrl,
        facebookUrl: user.facebookUrl,
        instagramUrl: user.instagramUrl,
        nationality: user.nationality,
        addressCountry: user.addressCountry,
        addressProvince: user.addressProvince,
        addressCity: user.addressCity,
        addressNeighborhood: user.addressNeighborhood,
        addressStreet: user.addressStreet
      },
      create: {
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        passwordHash: user.passwordHash,
        status: "ACTIVE",
        primaryRole: user.primaryRole,
        specialty: user.specialty,
        bio: user.bio,
        profilePhotoUrl: user.profilePhotoUrl,
        phone: user.phone,
        whatsappUrl: user.whatsappUrl,
        facebookUrl: user.facebookUrl,
        instagramUrl: user.instagramUrl,
        nationality: user.nationality,
        addressCountry: user.addressCountry,
        addressProvince: user.addressProvince,
        addressCity: user.addressCity,
        addressNeighborhood: user.addressNeighborhood,
        addressStreet: user.addressStreet
      }
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: createdUser.id,
          roleId: (await prisma.role.findUnique({ where: { slug: user.primaryRole } }))!.id
        }
      },
      update: { active: true },
      create: {
        userId: createdUser.id,
        roleId: (await prisma.role.findUnique({ where: { slug: user.primaryRole } }))!.id,
        active: true
      }
    });
  }

  console.log("✅ Seed terminé. Utilisateurs créés :", usersData.map((u) => u.username).join(", ") );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
