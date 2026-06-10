import PageMeta from "../../components/common/PageMeta";
import Badge from "../../components/ui/badge/Badge";
import {
  User,
  Calendar,
  Heart,
  ShieldCheck,
  Activity,
  FileText,
  Clock,
  AlertTriangle,
  FileDown,
  Share2,
  QrCode,
  FolderOpen,
  Stethoscope,
  Download,
} from "lucide-react";

const patient = {
  fullName: "Chrinovic Nyembo",
  birthDate: "15 Janvier 2024",
  gender: "Masculin",
  bloodGroup: "O+",
  weight: "72 kg",
  height: "178 cm",
  emergencyContact: "+243 84 862 1712",
};

const currentStatus = {
  condition: "Stable",
  diagnosis: "Paludisme sévère",
  doctor: "Dr Mukendi",
  treatmentActive: true,
  adherence: 92,
};

const medicalHistory = [
  { year: "2024", event: "Hypertension contrôlée" },
  { year: "2025", event: "Hospitalisation respiratoire" },
  { year: "2026", event: "Bilan général renforcé" },
];

const allergies = [
  {
    name: "Pénicilline",
    description: "Réaction cutanée et gonflement des voies respiratoires",
  },
];

const chronicConditions = ["Diabète type 2", "Hypertension", "Asthme"];

const treatments = [
  {
    name: "Amoxicilline",
    dose: "500 mg",
    frequency: "3x/jour",
    adherence: "92% suivi confirmé",
  },
  {
    name: "Metroprolol",
    dose: "50 mg",
    frequency: "2x/jour",
    adherence: "88% suivi confirmé",
  },
];

const exams = [
  {
    name: "Analyse sanguine",
    date: "10 mai 2026",
    status: "Terminé",
    result: true,
  },
  {
    name: "Scanner abdominal",
    date: "14 mai 2026",
    status: "En attente",
    result: false,
  },
  {
    name: "Radio pulmonaire",
    date: "16 mai 2026",
    status: "Terminé",
    result: true,
  },
];

const prescriptions = [
  {
    title: "Ordonnance - 12 mai 2026",
    description: "Traitement antibiotique et suivi de la fièvre.",
    premium: false,
  },
  {
    title: "Ordonnance - 05 avril 2026",
    description: "Thérapie de l’hypertension et contrôle tensionnel.",
    premium: true,
  },
];

const consultations = [
  {
    date: "15 mai 2026",
    specialty: "Cardiologie",
    summary: "Suivi du rythme cardiaque et ajustement du traitement.",
  },
  {
    date: "10 mai 2026",
    specialty: "Médecine générale",
    summary: "Bilan complet et recommandations pour l’hydratation.",
  },
];

const hospitalizations = [
  {
    date: "Mai 2026",
    service: "Médecine interne",
    duration: "4 jours",
  },
];

const vaccinations = [
  {
    vaccine: "COVID-19",
    date: "02 février 2026",
    validity: "Valide jusqu’au 02 février 2027",
  },
  {
    vaccine: "Fièvre jaune",
    date: "18 mars 2025",
    validity: "Valide",
  },
  {
    vaccine: "Tétanos",
    date: "01 avril 2023",
    validity: "Renouvellement conseillé en 2028",
  },
];

const documents = [
  { label: "Résultats labo - avril 2026", type: "PDF" },
  { label: "Radio pulmonaire", type: "Radiographie" },
  { label: "Ordonnance", type: "PDF" },
  { label: "Rapport de consultation", type: "PDF" },
];

const formatStatusBadge = (status: string) => {
  if (status === "Terminé") return <Badge color="success">Terminé</Badge>;
  if (status === "En attente") return <Badge color="warning">En attente</Badge>;
  return <Badge color="light">À jour</Badge>;
};

export default function DossierMedical() {
  return (
    <>
      <PageMeta
        title="Dossier médical - D7 Clinique"
        description="Un dossier médical clair et sécurisé pour suivre votre historique, vos traitements, vos examens et vos documents importants."
      />

      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Dossier médical
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                Votre santé centralisée en un seul espace. Accédez à votre état actuel,
                vos traitements, vos documents et votre historique de façon claire et sécurisée.
              </p>
            </div>
            <Badge variant="solid" color="primary">
              Sécurisé et accessible
            </Badge>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-theme-500">Informations générales</p>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Votre profil patient
                </h2>
              </div>
              <Badge color="info">Vue synthétique</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-theme-500" />
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Nom complet</p>
                </div>
                <p className="mt-2 text-base font-medium text-gray-900 dark:text-white">
                  {patient.fullName}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-theme-500" />
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Date de naissance</p>
                </div>
                <p className="mt-2 text-base font-medium text-gray-900 dark:text-white">
                  {patient.birthDate}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-theme-500" />
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Groupe sanguin</p>
                </div>
                <p className="mt-2 text-base font-medium text-gray-900 dark:text-white">
                  {patient.bloodGroup}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <Heart className="h-5 w-5 text-theme-500" />
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Sexe</p>
                </div>
                <p className="mt-2 text-base font-medium text-gray-900 dark:text-white">
                  {patient.gender}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-theme-500" />
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Poids</p>
                </div>
                <p className="mt-2 text-base font-medium text-gray-900 dark:text-white">
                  {patient.weight}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <Stethoscope className="h-5 w-5 text-theme-500" />
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Taille</p>
                </div>
                <p className="mt-2 text-base font-medium text-gray-900 dark:text-white">
                  {patient.height}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-theme-500" />
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Contact urgence</p>
                </div>
                <p className="mt-2 text-base font-medium text-gray-900 dark:text-white">
                  {patient.emergencyContact}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-theme-500">État médical actuel</p>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Votre suivi en un coup d’œil
                </h2>
              </div>
              <Badge color={currentStatus.condition === "Stable" ? "success" : "warning"}>
                {currentStatus.condition}
              </Badge>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <p className="text-xs text-gray-500 uppercase tracking-[0.2em]">Diagnostic actuel</p>
                <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                  {currentStatus.diagnosis}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-white/[0.05] dark:bg-white/[0.02]">
                  <p className="text-xs text-gray-500 uppercase tracking-[0.2em]">Médecin référent</p>
                  <p className="mt-2 font-medium text-gray-900 dark:text-white">
                    {currentStatus.doctor}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-white/[0.05] dark:bg-white/[0.02]">
                  <p className="text-xs text-gray-500 uppercase tracking-[0.2em]">Traitement actif</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {currentStatus.treatmentActive ? "Oui" : "Non"}
                    </span>
                    <Badge color={currentStatus.treatmentActive ? "success" : "light"}>
                      {currentStatus.treatmentActive ? "Actif" : "Aucun"}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 uppercase tracking-[0.2em]">Statut adhérence</p>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {currentStatus.adherence}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-theme-500"
                    style={{ width: `${currentStatus.adherence}%` }}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-theme-500">Antécédents médicaux</p>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Événements passés importants
                </h2>
              </div>
              <Badge color="light">Timeline</Badge>
            </div>

            <div className="space-y-4">
              {medicalHistory.map((item) => (
                <div key={item.year} className="flex gap-4 rounded-3xl border border-gray-100 bg-gray-50 p-5 dark:border-white/[0.05] dark:bg-white/[0.02]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-theme-500/10 text-theme-500">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {item.year}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {item.event}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm dark:border-red-500/20 dark:bg-red-500/10">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-red-600">Allergies</p>
                  <h2 className="text-lg font-semibold text-red-900 dark:text-white">
                    À prendre en compte
                  </h2>
                </div>
                <Badge color="error">Critique</Badge>
              </div>
              {allergies.map((item) => (
                <div key={item.name} className="rounded-3xl border border-red-100 bg-white p-4 dark:border-red-400/20 dark:bg-white/5">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <p className="font-medium text-red-900 dark:text-white">Allergie à la {item.name}</p>
                  </div>
                  <p className="mt-2 text-sm text-red-700 dark:text-red-200">{item.description}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-theme-500">Maladies chroniques</p>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Suivi long terme
                  </h2>
                </div>
                <Badge color="dark">Stables</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {chronicConditions.map((condition) => (
                  <Badge key={condition} color="light">{condition}</Badge>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-theme-500">Traitements actifs</p>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Ce que vous prenez aujourd’hui
                </h2>
              </div>
              <Badge color="success">Adhérence élevée</Badge>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-gray-100 dark:border-white/[0.05]">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-white/10">
                <thead className="bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-3">Médicament</th>
                    <th className="px-4 py-3">Dose</th>
                    <th className="px-4 py-3">Fréquence</th>
                    <th className="px-4 py-3">Adhérence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-white/5 dark:bg-transparent">
                  {treatments.map((item) => (
                    <tr key={item.name}>
                      <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">{item.name}</td>
                      <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{item.dose}</td>
                      <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{item.frequency}</td>
                      <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{item.adherence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-theme-500">Examens médicaux</p>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Résultats & accès rapide
                </h2>
              </div>
              <Badge color="info">Interprétation requise</Badge>
            </div>
            <div className="space-y-4">
              {exams.map((exam) => (
                <div key={exam.name} className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{exam.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{exam.date}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {formatStatusBadge(exam.status)}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Résultat {exam.result ? "disponible" : "en cours"}
                    </p>
                    <button className="inline-flex items-center gap-2 rounded-full bg-theme-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-theme-600">
                      <Download className="h-4 w-4" /> Télécharger PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-theme-500">Ordonnances</p>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Vos prescriptions récentes
                </h2>
              </div>
              <Badge color="primary">Partage rapide</Badge>
            </div>
            <div className="space-y-4">
              {prescriptions.map((item) => (
                <div key={item.title} className="rounded-3xl border border-gray-100 bg-gray-50 p-5 dark:border-white/[0.05] dark:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{item.title}</p>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{item.description}</p>
                    </div>
                    <Badge color={item.premium ? "warning" : "success"}>
                      {item.premium ? "Premium" : "Standard"}
                    </Badge>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button className="inline-flex items-center gap-2 rounded-full bg-theme-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-theme-600">
                      <QrCode className="h-4 w-4" /> QR pharmacie
                    </button>
                    <button className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">
                      <Share2 className="h-4 w-4" /> Partager
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-theme-500">Historique consultations</p>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Derniers rendez-vous
                  </h2>
                </div>
                <Badge color="info">Résumé</Badge>
              </div>
              <div className="space-y-4">
                {consultations.map((item) => (
                  <div key={item.date} className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.date}</p>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">{item.specialty}</p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{item.summary}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-theme-500">Hospitalisations</p>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Archives de séjour
                  </h2>
                </div>
                <Badge color="dark">Archive</Badge>
              </div>
              <div className="space-y-4">
                {hospitalizations.map((item) => (
                  <div key={item.date} className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{item.date}</p>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{item.service}</p>
                      </div>
                      <Badge color="light">{item.duration}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-theme-500">Vaccinations</p>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Votre calendrier vaccinal
                </h2>
              </div>
              <Badge color="success">À jour</Badge>
            </div>
            <div className="space-y-4">
              {vaccinations.map((item) => (
                <div key={item.vaccine} className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{item.vaccine}</p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{item.date}</p>
                    </div>
                    <Badge color="light">{item.validity}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-theme-500">Documents médicaux</p>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Centre de fichiers sécurisés
                </h2>
              </div>
              <Badge color="info">PDF & images</Badge>
            </div>
            <div className="space-y-4">
              {documents.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-theme-500" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.type}</p>
                    </div>
                  </div>
                  <button className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:bg-gray-900 dark:text-white">
                    <FileDown className="h-4 w-4" /> Télécharger
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
