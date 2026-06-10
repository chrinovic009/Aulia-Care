import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import { Calendar, Clock, Heart, AlertCircle, CheckCircle2, Clock3 } from "lucide-react";

export default function Hospitalisation() {
  // Current hospitalization data
  const hospitalization = {
    admissionDate: "12 mai 2026",
    currentDuration: "4 jours",
    service: "Médecine interne",
    status: "Stable",
    building: "Bâtiment A",
    room: "204",
    bed: "B",
    floor: "1ère étage",
  };

  // Medical team
  const medicalTeam = [
    {
      role: "Médecin référent",
      name: "Dr. Jean Mukendi",
      specialty: "Médecine interne",
      image: "/images/user/user-17.jpg",
    },
    {
      role: "Infirmière coordinatrice",
      name: "Sarah Ilunga",
      specialty: "Soins généraux",
      image: "/images/user/user-22.jpg",
    },
    {
      role: "Cardiologue consultant",
      name: "Dr. Kasongo",
      specialty: "Cardiologie",
      image: "/images/user/user-23.jpg",
    },
    {
      role: "Infirmier de nuit",
      name: "Marc Tshimanga",
      specialty: "Surveillance",
      image: "/images/user/user-24.jpg",
    },
  ];

  // Care follow-up timeline
  const careFollowUp = [
    {
      time: "08h00",
      activity: "Antibiotique administré",
      status: "Effectué",
      type: "treatment",
    },
    {
      time: "10h30",
      activity: "Tension vérifiée",
      status: "Effectué",
      type: "checkup",
    },
    {
      time: "13h00",
      activity: "Consultation médecin",
      status: "Effectué",
      type: "consultation",
    },
    {
      time: "16h00",
      activity: "Prélèvement sanguin",
      status: "Prévu",
      type: "exam",
    },
    {
      time: "19h00",
      activity: "Prise de médicaments (19h)",
      status: "Prévu",
      type: "treatment",
    },
  ];

  // Medical timeline
  const medicalTimeline = [
    {
      date: "12 mai 2026",
      event: "Admission à l'hôpital",
      details: "Entrée aux urgences, diagnostic initial",
    },
    {
      date: "12 mai 2026 - 16h30",
      event: "Analyse sanguine complète",
      details: "Résultats reçus - paramètres dans la norme",
    },
    {
      date: "13 mai 2026",
      event: "Scanner thoracique",
      details: "Aucune anomalie détectée",
    },
    {
      date: "14 mai 2026",
      event: "Consultation cardiologue",
      details: "Suivi spécialisé - pas de complications",
    },
    {
      date: "15 mai 2026",
      event: "Amélioration observée",
      details: "Signaux vitaux stables, reprise partielle",
    },
    {
      date: "16 mai 2026",
      event: "Aujourd'hui",
      details: "Surveillance continue - bonne évolution",
    },
  ];

  // Pending exams
  const pendingExams = [
    {
      exam: "IRM abdominale",
      scheduledFor: "17 mai 2026 à 09h00",
      reason: "Suivi prévu",
      priority: "Normal",
    },
    {
      exam: "Analyse d'urine",
      scheduledFor: "17 mai 2026 à 14h00",
      reason: "Bilan de routine",
      priority: "Normal",
    },
  ];

  // Medical instructions
  const medicalInstructions = [
    {
      title: "Repos strict",
      description: "Rester au lit sauf autorisation de se lever",
      icon: "🛏️",
    },
    {
      title: "Alimentation légère",
      description: "Régime adapté - pas de sucre, pas de gras",
      icon: "🍎",
    },
    {
      title: "Hydratation",
      description: "Boire au minimum 1.5L d'eau par jour",
      icon: "💧",
    },
    {
      title: "Pas d'effort physique",
      description: "Éviter tout effort pendant 7 jours",
      icon: "⚠️",
    },
  ];

  const getStatusColor = (status: string) => {
    if (status === "Effectué") return "success";
    if (status === "Prévu") return "warning";
    if (status === "Retardé") return "error";
    return "primary";
  };

  const getStatusIcon = (status: string) => {
    if (status === "Effectué") return <CheckCircle2 className="w-5 h-5" />;
    if (status === "Prévu") return <Clock3 className="w-5 h-5" />;
    if (status === "Retardé") return <AlertCircle className="w-5 h-5" />;
    return null;
  };

  return (
    <>
      <PageMeta
        title="Hospitalisation - D7 Clinique"
        description="Suivi en temps réel de votre séjour médical. Informations sur votre chambre, l'équipe médicale, vos soins et votre timeline médicale."
      />

      <div className="space-y-6">
        {/* 1. État d'hospitalisation */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-4">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-6 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <h2 className="mb-6 text-lg font-semibold text-gray-800 dark:text-white/90">
                État d'hospitalisation
              </h2>

              <div className="space-y-5">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Statut</span>
                  <Badge color="success" size="md">
                    {hospitalization.status}
                  </Badge>
                </div>

                {/* Admission Date */}
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-theme-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Date d'admission</p>
                    <p className="font-medium text-gray-800 dark:text-white/90">
                      {hospitalization.admissionDate}
                    </p>
                  </div>
                </div>

                {/* Duration */}
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-theme-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Durée actuelle</p>
                    <p className="font-medium text-gray-800 dark:text-white/90">
                      {hospitalization.currentDuration}
                    </p>
                  </div>
                </div>

                {/* Service */}
                <div className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-theme-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Service</p>
                    <p className="font-medium text-gray-800 dark:text-white/90">
                      {hospitalization.service}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Chambre & Service */}
          <div className="col-span-12 lg:col-span-4">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-6 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <h2 className="mb-6 text-lg font-semibold text-gray-800 dark:text-white/90">
                Votre localisation
              </h2>

              <div className="space-y-4">
                <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/30">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Bâtiment</p>
                  <p className="text-xl font-bold text-gray-800 dark:text-white/90">
                    {hospitalization.building}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/30">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Étage</p>
                    <p className="text-lg font-bold text-gray-800 dark:text-white/90">
                      {hospitalization.floor}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/30">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Chambre</p>
                    <p className="text-lg font-bold text-gray-800 dark:text-white/90">
                      {hospitalization.room}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/30">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Lit</p>
                  <p className="text-lg font-bold text-gray-800 dark:text-white/90">
                    Lit {hospitalization.bed}
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <button className="w-full rounded-lg bg-theme-500/10 px-4 py-2 text-sm font-medium text-theme-600 hover:bg-theme-500/20 dark:text-theme-400 transition">
                    📞 Appeler le personnel
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Access Card */}
          <div className="col-span-12 lg:col-span-4">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-6 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <h2 className="mb-6 text-lg font-semibold text-gray-800 dark:text-white/90">
                Assistance rapide
              </h2>

              <div className="space-y-3">
                <button className="w-full rounded-lg bg-red-50 px-4 py-3 text-left hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 transition">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">🚨 Urgence</p>
                  <p className="text-xs text-red-500 dark:text-red-300 mt-1">
                    Appelez l'infirmière
                  </p>
                </button>
                <button className="w-full rounded-lg bg-blue-50 px-4 py-3 text-left hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 transition">
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">📞 Contact équipe</p>
                  <p className="text-xs text-blue-500 dark:text-blue-300 mt-1">
                    Questions générales
                  </p>
                </button>
                <button className="w-full rounded-lg bg-green-50 px-4 py-3 text-left hover:bg-green-100 dark:bg-green-500/10 dark:hover:bg-green-500/20 transition">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    📋 Mes visites
                  </p>
                  <p className="text-xs text-green-500 dark:text-green-300 mt-1">
                    Horaires & accompagnants
                  </p>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Équipe médicale */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Équipe médicale
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Les professionnels qui s'occupent de vous
            </p>
          </div>

          <div className="grid grid-cols-12 gap-6 p-6">
            {medicalTeam.map((member, index) => (
              <div key={index} className="col-span-12 sm:col-span-6 lg:col-span-3">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/30">
                  <div className="mb-3 flex justify-center">
                    <div className="w-16 h-16 overflow-hidden rounded-full border-2 border-white dark:border-gray-800">
                      <img
                        src={member.image}
                        alt={member.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-theme-600 dark:text-theme-400 text-center mb-1">
                    {member.role}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90 text-center">
                    {member.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                    {member.specialty}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Suivi des soins */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Suivi des soins d'aujourd'hui
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Activités médicales et traitements
            </p>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              {careFollowUp.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 rounded-lg border border-gray-100 p-4 dark:border-gray-800"
                >
                  <div className="flex-shrink-0">
                    {getStatusIcon(item.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-semibold text-gray-800 dark:text-white/90">
                        {item.time}
                      </p>
                      <Badge size="sm" color={getStatusColor(item.status)}>
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {item.activity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 5. Timeline médicale */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Timeline médicale
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Chronologie de votre séjour
            </p>
          </div>

          <div className="p-6">
            <div className="space-y-6">
              {medicalTimeline.map((item, index) => (
                <div key={index} className="flex gap-4">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-theme-500 ring-4 ring-theme-500/20"></div>
                    {index !== medicalTimeline.length - 1 && (
                      <div className="w-0.5 h-12 bg-gradient-to-b from-theme-200 to-gray-200 dark:from-theme-800 dark:to-gray-800"></div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="pt-0.5 pb-6">
                    <p className="text-sm font-semibold text-theme-600 dark:text-theme-400">
                      {item.date}
                    </p>
                    <p className="text-base font-semibold text-gray-800 dark:text-white/90 mt-1">
                      {item.event}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {item.details}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 6. Examens en attente */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Examens prévus
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tests médicaux à venir
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Examen
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Date et heure
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Raison
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Priorité
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendingExams.map((exam, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                  >
                    <td className="px-6 py-4 text-sm text-gray-800 dark:text-white/90">
                      {exam.exam}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {exam.scheduledFor}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {exam.reason}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <Badge size="sm" color="info">
                        {exam.priority}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 7. Consignes médicales */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Consignes médicales
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              À respecter pendant votre séjour
            </p>
          </div>

          <div className="grid grid-cols-12 gap-4 p-6">
            {medicalInstructions.map((instruction, index) => (
              <div key={index} className="col-span-12 sm:col-span-6 lg:col-span-3">
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10">
                  <p className="mb-3 text-2xl">{instruction.icon}</p>
                  <p className="font-semibold text-gray-800 dark:text-white/90 text-sm mb-2">
                    {instruction.title}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    {instruction.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
