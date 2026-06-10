import { useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { DownloadIcon, FileIcon, } from "../../icons";

const timelineEvents = [
  { date: "12 Mai 2026", title: "Consultation générale", type: "consultation", details: "Dr Mukendi" },
  { date: "15 Mai 2026", title: "Hospitalisation", type: "hospitalisation", details: "Admis à l'hôpital" },
  { date: "18 Mai 2026", title: "Début traitement antibiotique", type: "traitement", details: "Amoxicilline 250mg" },
  { date: "21 Mai 2026", title: "Évolution stable", type: "suivi", details: "État satisfaisant" },
];

const consultations = [
  { doctor: "Dr Mukendi", specialty: "Médecine interne", date: "14 Avril 2026", notes: "Patient réagit bien au traitement." },
  { doctor: "Dr Adèle Sanda", specialty: "Cardiologie", date: "8 Avril 2026", notes: "Tension artérielle normale." },
  { doctor: "Dr Jean Dupré", specialty: "Généraliste", date: "1 Avril 2026", notes: "Suivi médical régulier." },
];

const prescriptions = [
  { name: "Amoxicilline", dosage: "500mg", duration: "7 jours", status: "Terminé" },
  { name: "Ibuprofène", dosage: "200mg", duration: "15 jours", status: "Terminé" },
  { name: "Paracétamol", dosage: "500mg", duration: "10 jours", status: "Terminé" },
];

const exams = [
  { name: "Analyse sanguine", date: "10 Mai 2026", status: "Normal", downloadable: true },
  { name: "Scanner thoracique", date: "8 Mai 2026", status: "Aucune anomalie", downloadable: true },
  { name: "IRM", date: "5 Mai 2026", status: "À étudier", downloadable: true },
];

const hospitalizations = [
  { period: "15 - 20 Mai 2026", reason: "Suivi post-intervention", duration: "5 jours", notes: "Récupération satisfaisante" },
];

const symptoms = [
  { date: "20 Mai 2026", symptom: "Fatigue légère", intensity: "Faible" },
  { date: "18 Mai 2026", symptom: "Douleur thoracique modérée", intensity: "Modéré" },
  { date: "15 Mai 2026", symptom: "Fièvre disparue", intensity: "Absent" },
];

const documents = [
  { name: "Ordonnance du 12 Mai", type: "PDF" },
  { name: "Résultats analyses sanguines", type: "PDF" },
  { name: "Rapport d'hospitalisation", type: "PDF" },
];

const HistoriqueMedical = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const filteredTimeline = useMemo(
    () =>
      timelineEvents.filter((event) =>
        (event.title + " " + event.details).toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [searchTerm]
  );

  const filteredConsultations = useMemo(
    () =>
      consultations.filter((c) =>
        (c.doctor + " " + c.specialty + " " + c.notes).toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [searchTerm]
  );

  const filteredExams = useMemo(
    () =>
      exams.filter((e) =>
        (e.name + " " + e.status).toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [searchTerm]
  );

  return (
    <div>
      <PageMeta
        title="Historique Médical | D7 Clinique"
        description="Toute la mémoire médicale du patient : timeline, consultations, prescriptions, examens, hospitalisations."
      />
      <PageBreadcrumb pageTitle="Historique Médical" />

      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        {/* Recherche */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-slate-50 p-5 dark:border-gray-800 dark:bg-slate-950">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher dans votre historique : traitement, examen, consultation..."
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-800 dark:bg-slate-900 dark:text-gray-200 dark:focus:border-blue-400 dark:focus:ring-blue-500/20"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          {/* Colonne principale */}
          <div className="space-y-6">
            {/* Timeline médicale */}
            <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Timeline médicale</h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Votre parcours médical en un coup d'œil.</p>

              <div className="mt-6 space-y-4">
                {filteredTimeline.map((event) => (
                  <button
                    key={event.date}
                    onClick={() => setExpandedEvent(expandedEvent === event.date ? null : event.date)}
                    className="w-full rounded-3xl border border-gray-200 bg-white px-6 py-4 text-left transition hover:border-blue-300 hover:bg-blue-50 dark:border-gray-800 dark:bg-slate-900 dark:hover:border-blue-500/40 dark:hover:bg-slate-950"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`inline-flex h-12 w-12 items-center justify-center rounded-full font-semibold ${
                          event.type === "consultation"
                            ? "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-200"
                            : event.type === "hospitalisation"
                            ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-200"
                            : event.type === "traitement"
                            ? "bg-green-100 text-green-600 dark:bg-emerald-950/40 dark:text-emerald-200"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {event.type === "consultation" ? "🏥" : event.type === "hospitalisation" ? "🏨" : event.type === "traitement" ? "💊" : "✓"}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-gray-900 dark:text-white">{event.title}</p>
                          <span className="text-sm text-gray-500 dark:text-gray-400">{event.date}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{event.details}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Historique Consultations */}
            <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Historique des consultations</h2>
              <div className="mt-6 space-y-4">
                {filteredConsultations.map((c, idx) => (
                  <div key={idx} className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{c.doctor}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{c.specialty}</p>
                        <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{c.notes}</p>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{c.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Anciennes prescriptions */}
            <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Anciennes prescriptions</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {prescriptions.map((p, idx) => (
                  <div key={idx} className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{p.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{p.dosage}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{p.duration}</p>
                      </div>
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Résultats d'examens */}
            <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Résultats d'examens</h2>
              <div className="mt-6 space-y-3">
                {filteredExams.map((exam, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-4 rounded-3xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-slate-900">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{exam.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{exam.date}</p>
                      <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                        {exam.status}
                      </span>
                    </div>
                    {exam.downloadable && (
                      <button className="inline-flex items-center justify-center rounded-2xl bg-blue-100 p-3 text-blue-600 transition hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60">
                        <DownloadIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Historique symptômes */}
            <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Historique symptômes</h2>
              <div className="mt-6 space-y-3">
                {symptoms.map((s, idx) => (
                  <div key={idx} className="rounded-3xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{s.symptom}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{s.date}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          s.intensity === "Faible"
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-200"
                            : s.intensity === "Modéré"
                            ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200"
                            : "bg-green-100 text-green-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                        }`}
                      >
                        {s.intensity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Hospitalisations */}
            <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Historique hospitalisation</h3>
              <div className="mt-4 space-y-3">
                {hospitalizations.map((h, idx) => (
                  <div key={idx} className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900/30 dark:bg-red-950/20">
                    <p className="font-semibold text-red-900 dark:text-red-100">{h.period}</p>
                    <p className="mt-2 text-red-800 dark:text-red-200">{h.reason}</p>
                    <p className="mt-2 text-xs text-red-700 dark:text-red-300">Durée : {h.duration}</p>
                    <p className="mt-2 text-xs text-red-700 dark:text-red-300">{h.notes}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Évolution santé - Graphiques */}
            <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Évolution santé</h3>
              <div className="mt-6 space-y-4">
                {[
                  { label: "Douleur", value: 35 },
                  { label: "Température", value: 40 },
                  { label: "Récupération", value: 80 },
                  { label: "Sommeil", value: 75 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{item.value}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-900">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Notes médicales importantes */}
            <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Notes médicales</h3>
              <div className="mt-4 rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-200">
                <p className="font-semibold">Patient réagit bien au traitement.</p>
                <p className="mt-2">Continuer le suivi régulier et respecter le programme de récupération.</p>
              </div>
            </section>

            {/* Documents téléchargeables */}
            <section className="rounded-3xl border border-gray-200 bg-slate-50 p-6 dark:border-gray-800 dark:bg-slate-950">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Documents</h3>
              <div className="mt-4 space-y-2">
                {documents.map((doc, idx) => (
                  <a
                    key={idx}
                    href="#"
                    className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-gray-800 dark:bg-slate-900 dark:hover:border-blue-500/40 dark:hover:bg-slate-950"
                  >
                    <div className="flex items-center gap-3">
                      <FileIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-200">{doc.name}</span>
                    </div>
                    <DownloadIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  </a>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoriqueMedical;
