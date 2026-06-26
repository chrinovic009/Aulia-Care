import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { useAuth, type RoleSlug } from "../context/AuthContext";

type GuideDefinition = {
  title: string;
  description: string;
  route: string;
  tabs: string[];
  workflow: string[];
  tips: string[];
};

const roleLabels: Record<RoleSlug, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN: "Administration clinique",
  RECEPTIONIST: "Réception",
  NURSE: "Infirmier",
  PHYSICIAN: "Médecin",
  LAB_TECHNICIAN: "Technicien de laboratoire",
  LAB_MANAGER: "Responsable laboratoire",
  RADIOLOGIST: "Radiologue",
  SURGEON: "Chirurgien",
  ANESTHESIOLOGIST: "Anesthésiste",
  PHARMACIST: "Pharmacie",
  PATIENT: "Patient",
  CASHIER: "Caissier",
};

const guideByRole: Record<RoleSlug, GuideDefinition> = {
  SUPER_ADMIN: {
    title: "Super administrateur",
    description: "Gérez la configuration globale, les profils utilisateur et la supervision de l’établissement.",
    route: "/admin",
    tabs: ["Tableau de bord", "Profils", "Paramètres et sécurité", "Rapports globaux"],
    workflow: [
      "Consultez la synthèse opérationnelle depuis le tableau de bord.",
      "Vérifiez les accès, les rôles et les statuts des comptes.",
      "Suivez les indicateurs de l’établissement et validez les opérations sensibles.",
    ],
    tips: ["Validez les changements de rôle avant toute mise en production.", "Consultez régulièrement les rapports pour anticiper les anomalies."],
  },
  ADMIN: {
    title: "Administration clinique",
    description: "Pilotez le personnel, les services, les départements, les salles et les stocks de l’infrastructure.",
    route: "/administration",
    tabs: ["Tableau de bord", "Personnel", "Services", "Départements", "Salles", "Rapports", "Stock", "Profil"],
    workflow: [
      "Centralisez les demandes de personnel et les affectations de services.",
      "Vérifiez les disponibilités et les ressources avant chaque planification.",
      "Contrôlez les stocks de consommation et les rapports de gestion hebdomadaires.",
    ],
    tips: ["Assurez la cohérence entre les départements, les salles et les services.", "Mettez à jour les stocks dès l’arrivée de nouvelles fournitures."],
  },
  RECEPTIONIST: {
    title: "Réception",
    description: "Acceptez les patients, gérez les rendez-vous, les admissions et la première prise en charge.",
    route: "/reception",
    tabs: ["Tableau de bord", "Patients", "Admission", "Rendez-vous", "Hospitalisations", "Messages", "Historique", "Profil"],
    workflow: [
      "Créez ou mettez à jour les dossiers patients lors de l’accueil.",
      "Planifiez les rendez-vous et confirmez les disponibilités.",
      "Suivez les admissions, les hospitalisations et les communications internes.",
    ],
    tips: ["Vérifiez les coordonnées et la couverture sociale au moment de l’inscription.", "Signalez rapidement tout retard ou conflit de planning."],
  },
  NURSE: {
    title: "Infirmier",
    description: "Suivez les patients assignés, réalisez les rounds, les soins et la surveillance clinique.",
    route: "/nurse",
    tabs: ["Tableau de bord", "Patients assignés", "Rounds", "Hospitalisations", "Messages", "Profil"],
    workflow: [
      "Consultez la liste des patients affectés avant chaque tournée.",
      "Enregistrez les observations, les soins et les anomalies détectées.",
      "Suivez les hospitalisations et partagez les informations avec l’équipe médicale.",
    ],
    tips: ["Documentez chaque action de manière claire et chronologique.", "Signalez tout changement d’état clinique immédiatement."],
  },
  PHYSICIAN: {
    title: "Médecin",
    description: "Consultez les dossiers, prescrivez, planifiez les examens et suivez les hospitalisations.",
    route: "/doctor",
    tabs: ["Tableau de bord", "Patients", "Consultations", "Ordonnances", "Examens", "Hospitalisations", "Bloc opératoire", "Messages"],
    workflow: [
      "Ouvrez le dossier du patient et confirmez l’anamnèse avant toute décision.",
      "Rédigez les prescriptions et les ordres d’examens associés.",
      "Suivez les résultats et la progression thérapeutique dans les services concernés.",
    ],
    tips: ["Cochez systématiquement les examens associés à l’ordonnance.", "Utilisez les messages pour transmettre rapidement les mises à jour."],
  },
  LAB_TECHNICIAN: {
    title: "Technicien de laboratoire",
    description: "Traitez les échantillons, suivez les demandes et validez les résultats techniques.",
    route: "/laboratoire",
    tabs: ["Tableau de bord", "Activité", "Validations", "Messages", "Profil"],
    workflow: [
      "Consultez les examens en attente dans l’activité du laboratoire.",
      "Traitez les demandes et documentez l’état de chaque prélèvement.",
      "Validez les résultats et transmettez les informations au médecin ou au gestionnaire.",
    ],
    tips: ["Respectez la traçabilité de chaque prélèvement.", "Vérifiez les identifiants patients avant toute validation."],
  },
  LAB_MANAGER: {
    title: "Responsable laboratoire",
    description: "Supervisez l’activité technique, les affectations et le catalogue des examens.",
    route: "/laboratoire",
    tabs: ["Tableau de bord", "Activité", "Validations", "Techniciens", "Gestion", "Catalogue", "Messages", "Profil"],
    workflow: [
      "Suivez les performances et les charges de travail des techniciens.",
      "Répartissez les examens et gérez les priorités en fonction du volume.",
      "Validez les résultats et assurez la disponibilité du catalogue de tests.",
    ],
    tips: ["Utilisez les métriques de charge pour répartir équitablement le travail.", "Maintenez le catalogue à jour pour limiter les erreurs de saisie."],
  },
  RADIOLOGIST: {
    title: "Radiologue",
    description: "Consultez et validez les examens d’imagerie selon les protocoles de l’établissement.",
    route: "/radiologie",
    tabs: ["Tableau de bord", "Examens", "Résultats", "Messages"],
    workflow: [
      "Vérifiez les examens à traiter et les priorités de lecture.",
      "Rédigez le rapport d’imagerie et partagez-le avec le prescripteur.",
    ],
    tips: ["Conservez un format de rapport standardisé.", "Mettez à jour la disponibilité des résultats rapidement."],
  },
  SURGEON: {
    title: "Chirurgien",
    description: "Pilotez les interventions, les blocs opératoires et les suivis postopératoires.",
    route: "/surgery",
    tabs: ["Programme opératoire", "Patients", "Planning", "Résultats"],
    workflow: [
      "Confirmez les interventions prévues et les disponibilités de salle.",
      "Consultez les dossiers et les prescriptions associées avant chaque intervention.",
    ],
    tips: ["Vérifiez la disponibilité de l’équipe et les consignes préopératoires."],
  },
  ANESTHESIOLOGIST: {
    title: "Anesthésiste",
    description: "Supervisez la préparation anesthésique et les consignes peropératoires.",
    route: "/anesthesiologist",
    tabs: ["Planning", "Patients", "Suivi", "Messages"],
    workflow: [
      "Vérifiez les patients programmés et leurs risques anesthésiques.",
      "Validez les consignes et la préparation avant l’intervention.",
    ],
    tips: ["Mettez à jour les alertes de sécurité avant chaque procédure."],
  },
  PHARMACIST: {
    title: "Pharmacie",
    description: "Traitez les ordonnances, préparez les délivrances et gérez les stocks pharmaceutiques.",
    route: "/pharmacie",
    tabs: ["Tableau de bord", "Ordonnances", "Délivrance", "Historique", "Stock", "Messages", "Profil"],
    workflow: [
      "Consultez les ordonnances en attente et vérifiez la conformité.",
      "Préparez les médicaments et finalisez la délivrance au patient.",
      "Suivez les déstockages et les historiques de distribution.",
    ],
    tips: ["Contrôlez la traçabilité des ordonnances avant toute délivrance.", "Mettez à jour les stocks dès qu’une ligne est distribuée."],
  },
  PATIENT: {
    title: "Patient",
    description: "Consultez votre dossier, vos rendez-vous, vos traitements et vos résultats en ligne.",
    route: "/dossier-medical",
    tabs: ["Dossier médical", "Traitements", "Rendez-vous", "Examens", "Hospitalisation", "Suivi quotidien", "Messages", "Historique"],
    workflow: [
      "Accédez à votre dossier et vérifiez vos informations personnelles.",
      "Consultez vos traitements et vos prochains rendez-vous.",
      "Suivez les résultats d’examens et communiquez avec l’équipe médicale.",
    ],
    tips: ["Mettez à jour vos coordonnées si elles changent.", "Consultez régulièrement vos résultats et vos prescriptions."],
  },
  CASHIER: {
    title: "Caissier",
    description: "Gérez les facturations, les paiements et l’historique des encaissements.",
    route: "/caissier",
    tabs: ["Tableau de bord", "Facturation", "Historique", "Messages", "Profil"],
    workflow: [
      "Consultez les prestations à facturer et les montants à encaisser.",
      "Validez les paiements et archivez les justificatifs.",
      "Suivez les historiques de transactions avec la comptabilité.",
    ],
    tips: ["Vérifiez les montants avant validation finale.", "Conservez les justificatifs pour toute réclamation."],
  },
};

const interfaceSummaries = [
  {
    role: "Infirmier",
    scope: "Soins, rounds et suivi clinique",
    details: ["Consultez les patients assignés avant chaque ronde.", "Enregistrez les progrès de soins et les observations."],
  },
  {
    role: "Laboratoire",
    scope: "Analyses, validations et supervision",
    details: ["Suivez les examens en attente et leur état d’avancement.", "Assurez la traçabilité de chaque échantillon."],
  },
  {
    role: "Médecin",
    scope: "Dossiers, prescriptions et examens",
    details: ["Renseignez les ordonnances et les examens associés.", "Consultez les résultats pour ajuster le traitement."],
  },
  {
    role: "Patient",
    scope: "Accès à ses données et suivi",
    details: ["Consultez les rendez-vous, traitements et résultats.", "Communiquez avec votre équipe via les messages."],
  },
  {
    role: "Pharmacie",
    scope: "Traitement des ordonnances",
    details: ["Validez l’ordonnance avant toute délivrance.", "Maintenez l’historique et les stocks à jour."],
  },
  {
    role: "Réception",
    scope: "Accueil, rendez-vous et admissions",
    details: ["Planifiez les consultations et gérez les admissions.", "Suivez les hospitalisations et communications internes."],
  },
  {
    role: "Super-admin",
    scope: "Administration globale",
    details: ["Gérez les profils et la sécurité des comptes.", "Surveillez les performances de l’organisation."],
  },
  {
    role: "Urgences",
    scope: "Prise en charge rapide et coordination",
    details: ["Priorisez les patients selon la gravité.", "Coordonnez la réception, l’infirmerie et le suivi médical."],
  },
  {
    role: "Administration",
    scope: "Personnel, services et logistique",
    details: ["Organisez les équipes et les ressources.", "Pilotage des salles, départements et stocks."],
  },
  {
    role: "Caissier",
    scope: "Facturation et encaissements",
    details: ["Facturez les prestations et validez les paiements.", "Archivez les justificatifs et suivez l’historique."],
  },
];

export default function Guide() {
  const { currentUser } = useAuth();
  const role = (currentUser?.primaryRole ?? currentUser?.role ?? "PATIENT") as RoleSlug;
  const guide = guideByRole[role] ?? guideByRole.PATIENT;

  return (
    <div>
      <PageMeta
        title={`Guide d'utilisation | ${guide.title}`}
        description="Guide d'utilisation détaillé et adapté au rôle connecté sur la plateforme clinique."
      />
      <PageBreadcrumb pageTitle="Guide d'utilisation" />
      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="mx-auto w-full max-w-[1100px] space-y-8">
          <section className="rounded-2xl border border-brand-100 bg-brand-50/60 p-6">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">
              Guide adapté à votre profil
            </p>
            <h3 className="mb-3 text-2xl font-semibold text-gray-900 dark:text-white">
              {guide.title}
            </h3>
            <p className="mb-4 text-sm text-gray-700 sm:text-base">
              {guide.description}
            </p>
            <div className="rounded-xl border border-brand-200 bg-white p-4 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">Rôle détecté</p>
              <p className="mt-1">{roleLabels[role] ?? role}</p>
              <p className="mt-3">Accès principal : <span className="font-semibold text-brand-600">{guide.route}</span></p>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-gray-200 p-6">
              <h4 className="mb-4 text-lg font-semibold text-gray-900">Onglets et usage principal</h4>
              <ul className="space-y-3 text-sm text-gray-700">
                {guide.tabs.map((tab) => (
                  <li key={tab} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    {tab}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gray-200 p-6">
              <h4 className="mb-4 text-lg font-semibold text-gray-900">Workflow recommandé</h4>
              <ol className="space-y-3 text-sm text-gray-700">
                {guide.workflow.map((step, index) => (
                  <li key={step} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="mr-2 font-semibold text-brand-600">{index + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 p-6">
            <h4 className="mb-4 text-lg font-semibold text-gray-900">Bonnes pratiques</h4>
            <ul className="grid gap-3 text-sm text-gray-700 md:grid-cols-2">
              {guide.tips.map((tip) => (
                <li key={tip} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  {tip}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-gray-200 p-6">
            <h4 className="mb-4 text-lg font-semibold text-gray-900">Guide rapide par interface</h4>
            <div className="grid gap-4 md:grid-cols-2">
              {interfaceSummaries.map((item) => (
                <div key={item.role} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <h5 className="font-semibold text-gray-900">{item.role}</h5>
                  <p className="mt-1 text-sm text-brand-600">{item.scope}</p>
                  <ul className="mt-3 space-y-2 text-sm text-gray-700">
                    {item.details.map((detail) => (
                      <li key={detail} className="leading-6">• {detail}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
