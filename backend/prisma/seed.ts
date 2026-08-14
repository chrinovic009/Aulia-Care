import { PrismaClient, RoleSlug, ImagingModality } from "@prisma/client";

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

const imagingCatalogueSeed = [
  {
    code: "XRAY_CHEST",
    name: "Radiographie du Thorax",
    modality: ImagingModality.XRAY,
    description: "Radiographie de la cage thoracique pour évaluation pulmonaire et cardiaque.",
    preparationInstructions: "Aucun préparation particulière.",
    category: "Radiologie conventionnelle",
    availableIncidences: ["Face", "Profil"],
    supportsContrast: false,
    price: 45000,
    turnaroundTimeMinutes: 30,
    active: true,
  },
  {
    code: "XRAY_ABDOMEN_SIMPLE",
    name: "Radiographie de l'abdomen sans préparation",
    modality: ImagingModality.XRAY,
    description: "Radiographie de l'abdomen pour recherche d'iléus, calculs ou occlusions.",
    preparationInstructions: "Aucun préparation particulière.",
    category: "Radiologie conventionnelle",
    availableIncidences: ["Face", "Profil"],
    supportsContrast: false,
    price: 50000,
    turnaroundTimeMinutes: 30,
    active: true,
  },
  {
    code: "US_ABDOMEN",
    name: "Échographie abdominale",
    modality: ImagingModality.ULTRASOUND,
    description: "Échographie abdominale pour évaluation des organes abdominaux et voies biliaires.",
    preparationInstructions: "Jeûne de 6 heures avant l'examen.",
    category: "Échographie/Doppler",
    availableIncidences: ["Longitudinal", "Transversal"],
    supportsContrast: false,
    price: 90000,
    turnaroundTimeMinutes: 45,
    active: true,
  },
  {
    code: "US_DOPPLER_ARTERIAL",
    name: "Échographie Doppler artériel",
    modality: ImagingModality.ULTRASOUND,
    description: "Évaluation du flux artériel et détection de sténoses ou occlusions.",
    preparationInstructions: "Aucun préparation particulière.",
    category: "Échographie/Doppler",
    availableIncidences: ["Longitudinal", "Transversal"],
    supportsContrast: false,
    price: 100000,
    turnaroundTimeMinutes: 45,
    active: true,
  },
  {
    code: "CT_BRAIN",
    name: "Scanner cérébral",
    modality: ImagingModality.CT,
    description: "Scanner encéphalique pour recherche de lésions, hémorragies ou infarctus.",
    preparationInstructions: "Ne pas manger 4h avant l'examen si injection prévue.",
    category: "TDM/Scanner",
    availableIncidences: ["Axial", "Coronal", "Sagittal"],
    supportsContrast: true,
    price: 150000,
    turnaroundTimeMinutes: 90,
    active: true,
  },
  {
    code: "CT_ABDOMINAL",
    name: "Scanner abdominal avec injection",
    modality: ImagingModality.CT,
    description: "Scanner abdominal pour évaluation viscérale et vasculaire avec injection de produit de contraste.",
    preparationInstructions: "Jeûne 4h avant l'examen. Hydratation recommandée.",
    category: "TDM/Scanner",
    availableIncidences: ["Axial", "Coronal", "Sagittal"],
    supportsContrast: true,
    price: 180000,
    turnaroundTimeMinutes: 100,
    active: true,
  },
  {
    code: "MRI_BRAIN",
    name: "IRM cérébrale",
    modality: ImagingModality.MRI,
    description: "Imagerie par résonance magnétique cérébrale pour pathologies neurologiques.",
    preparationInstructions: "Retirer tous les objets métalliques.",
    category: "IRM",
    availableIncidences: ["Axial", "Coronal", "Sagittal"],
    supportsContrast: true,
    price: 180000,
    turnaroundTimeMinutes: 120,
    active: true,
  },
  {
    code: "MRI_SPINE",
    name: "IRM rachidienne",
    modality: ImagingModality.MRI,
    description: "Imagerie de la colonne vertébrale pour évaluation des disques, moelle et racines nerveuses.",
    preparationInstructions: "Retirer tous les objets métalliques.",
    category: "IRM",
    availableIncidences: ["Sagittal", "Axial", "Coronal"],
    supportsContrast: true,
    price: 200000,
    turnaroundTimeMinutes: 130,
    active: true,
  },
  {
    code: "NUCLEAR_BONE",
    name: "Scintigraphie osseuse",
    modality: ImagingModality.OTHER,
    description: "Scintigraphie osseuse pour recherche de métastases, fractures de stress ou inflammations.",
    preparationInstructions: "Hydrater abondamment avant et après l'examen.",
    category: "Scintigraphie/Médecine nucléaire",
    availableIncidences: ["Corps entier", "Segmentaire"],
    supportsContrast: false,
    price: 220000,
    turnaroundTimeMinutes: 180,
    active: true,
  },
  {
    code: "ENDOSCOPY_GASTRO",
    name: "Endoscopie digestive haute",
    modality: ImagingModality.OTHER,
    description: "Endoscopie œsogastroduodénale pour examen de l'œsophage, estomac et duodénum.",
    preparationInstructions: "Nécessite jeûne de 8 heures.",
    category: "Endoscopie",
    availableIncidences: ["Direct"],
    supportsContrast: false,
    price: 250000,
    turnaroundTimeMinutes: 90,
    active: true,
  },
  {
    code: "ECG_STANDARD",
    name: "ECG standard 12 dérivations",
    modality: ImagingModality.OTHER,
    description: "Enregistrement électrocardiographique standard pour analyse du rythme et conduction.",
    preparationInstructions: "Aucun préparation particulière.",
    category: "Examens fonctionnels",
    availableIncidences: ["12 dérivations"],
    supportsContrast: false,
    price: 30000,
    turnaroundTimeMinutes: 20,
    active: true,
  },
  {
    code: "EEG_STANDARD",
    name: "EEG standard",
    modality: ImagingModality.OTHER,
    description: "Enregistrement électroencéphalographique standard pour détection d'activité épileptique.",
    preparationInstructions: "Ne pas se coucher si possible et éviter les somnifères.",
    category: "Examens fonctionnels",
    availableIncidences: ["Standard"],
    supportsContrast: false,
    price: 60000,
    turnaroundTimeMinutes: 60,
    active: true,
  },
];

const imagingMachineSeed = [
  { name: "IRM 1.5T", roomNumber: "IRM-01", isOperational: true },
  { name: "Scanner 64 barrettes", roomNumber: "CT-01", isOperational: true },
  { name: "Échographe mobile", roomNumber: "US-01", isOperational: true },
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

  console.log("⏳ Seed du catalogue d'imagerie et des machines...");
  for (const item of imagingCatalogueSeed) {
    await prisma.imagingCatalogue.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        description: item.description,
        preparationInstructions: item.preparationInstructions,
        category: item.category,
        availableIncidences: item.availableIncidences,
        supportsContrast: item.supportsContrast,
        price: item.price,
        turnaroundTimeMinutes: item.turnaroundTimeMinutes,
        active: item.active,
      },
      create: item,
    });
  }

  for (const machine of imagingMachineSeed) {
    await prisma.imagingMachine.upsert({
      where: { name: machine.name },
      update: {
        roomNumber: machine.roomNumber,
        isOperational: machine.isOperational,
      },
      create: machine,
    });
  }

  console.log("✅ Seed terminé (roles, imagerie, machines)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });