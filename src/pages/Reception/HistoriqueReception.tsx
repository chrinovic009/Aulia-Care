import { useMemo, useState, useEffect } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const initialAdmissions = [
  {
    id: "ADM-2026-0041",
    patient: "Grâce Ilunga",
    service: "Consultation générale",
    doctor: "Dr Mukendi",
    entryDate: "12 Mai",
    exitDate: "16 Mai",
    entryHour: 9,
    reason: "Douleur thoracique",
    status: "Terminée",
    insurance: "Assurance Santé Plus",
  },
  {
    id: "ADM-2026-0062",
    patient: "Patrick Sefu",
    service: "Services chirurgicaux",
    doctor: "Dr Kabasele",
    entryDate: "03 Mai",
    exitDate: "10 Mai",
    entryHour: 16,
    reason: "Appendicite",
    status: "Archivées",
    insurance: "Assurance Clinique",
  },
  {
    id: "ADM-2026-0084",
    patient: "Amina Mputu",
    service: "Diagnostic et imagerie",
    doctor: "Dr Okapi",
    entryDate: "09 Mai",
    exitDate: "13 Mai",
    entryHour: 11,
    reason: "Fièvre persistante",
    status: "Transférée",
    insurance: "Assurance Jeunesse",
  },
  {
    id: "ADM-2026-0101",
    patient: "Jean Kabila",
    service: "Soins d'urgence",
    doctor: "Dr Ndala",
    entryDate: "15 Mai",
    exitDate: "16 Mai",
    entryHour: 3,
    reason: "Traumatisme abdominal",
    status: "En observation",
    insurance: "Assurance Plus",
  },
  {
    id: "ADM-2026-0115",
    patient: "Mireille Kamba",
    service: "Soins de maternité",
    doctor: "Dr Mwamba",
    entryDate: "05 Mai",
    exitDate: "12 Mai",
    entryHour: 14,
    reason: "Suivi post-natal",
    status: "Terminée",
    insurance: "Assurance Clinique",
  },
  {
    id: "ADM-2026-0126",
    patient: "Élie Mbala",
    service: "Soutien aux patients",
    doctor: "Dr Kitenge",
    entryDate: "18 Mai",
    exitDate: "19 Mai",
    entryHour: 10,
    reason: "Orientation sociale",
    status: "Terminée",
    insurance: "Assurance Santé Plus",
  },
];

const frequentAdmissions = [
  { patient: "Patrick Sefu", count: 5 },
  { patient: "Grâce Ilunga", count: 4 },
];

const stats = {
  total: 12482,
  month: 328,
  rehospitalizations: 46,
  averageStay: 4.3,
  rehospitalizationChange: 8,
};

const statusStyles: Record<string, string> = {
  Terminée: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Transférée: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  "En observation": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Annulée: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Archivées: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
};

const admissionTimeline = [
  { date: "12 Mai", note: "Admission" },
  { date: "13 Mai", note: "Examens" },
  { date: "14 Mai", note: "Chirurgie" },
  { date: "16 Mai", note: "Sortie" },
];

export default function HistoriqueReception() {
  const [search, setSearch] = useState("");
  const [selectedAdmission, setSelectedAdmission] = useState<typeof initialAdmissions[number] | null>(null);
  const [admissionsState, setAdmissionsState] = useState<typeof initialAdmissions>(initialAdmissions);
  const [archives, setArchives] = useState<Array<{ date: string; batchIndex: number; items: typeof initialAdmissions }>>([]);
  const [viewingArchive, setViewingArchive] = useState(false);
  const [selectedArchiveDate, setSelectedArchiveDate] = useState<string | null>(null);
  const [selectedArchiveIndex, setSelectedArchiveIndex] = useState<number>(0);
  const [selectedFrequent, setSelectedFrequent] = useState<string | null>(null);

  // Auto-archive batches of 10 oldest when admissionsState grows beyond 10
  useEffect(() => {
    if (admissionsState.length <= 10) return;
    const newArchives: typeof archives = [];
    let remaining = [...admissionsState];
    while (remaining.length > 10) {
      const batch = remaining.slice(0, 10);
      remaining = remaining.slice(10);
      newArchives.push({ date: new Date().toISOString().slice(0, 10), batchIndex: archives.length + newArchives.length + 1, items: batch });
    }
    if (newArchives.length) {
      setArchives((prev) => [...prev, ...newArchives]);
      setAdmissionsState(remaining);
    }
  }, [admissionsState, archives.length]);

  const filteredAdmissions = useMemo(
    () =>
      admissionsState.filter((item) =>
        [item.id, item.patient, item.service, item.doctor, item.reason]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [search, admissionsState]
  );

  // When viewing an archive, compute items to display
  const displayedAdmissions = useMemo(() => {
    if (!viewingArchive || !selectedArchiveDate) return filteredAdmissions;
    const groups = archives.filter((a) => a.date === selectedArchiveDate);
    if (!groups.length) return [];
    const group = groups[selectedArchiveIndex] || groups[0];
    return group.items.filter((item) =>
      [item.id, item.patient, item.service, item.doctor, item.reason]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [viewingArchive, selectedArchiveDate, selectedArchiveIndex, archives, filteredAdmissions, search]);

  return (
    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      <PageMeta
        title="Historique admissions Réception | D7 Clinique"
        description="Accédez à l'historique administratif des admissions depuis la réception."
      />
      <PageBreadcrumb pageTitle="Historique admissions" />

      <div className="space-y-6">

        <div className="grid gap-4 xl:grid-cols-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Admissions totales</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats.total.toLocaleString()}</p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Ce mois-ci</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats.month}</p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Réhospitalisations</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats.rehospitalizations}</p>
            <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              +{stats.rehospitalizationChange}%
            </span>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Durée moyenne séjour</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats.averageStay} jours</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Historique des admissions</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Retrouvez rapidement un dossier ou un séjour passé.</p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex max-w-md items-center gap-2 rounded-3xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <span className="text-slate-400">🔎</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nom, téléphone, ID admission, médecin..."
                    className="w-full rounded-2xl border-none bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-500">Archives:</label>
                  <select className="rounded-xl border px-2 py-1" value={selectedArchiveDate ?? ""} onChange={(e) => { setSelectedArchiveDate(e.target.value || null); setSelectedArchiveIndex(0); setViewingArchive(!!e.target.value); }}>
                    <option value="">-- Sélectionner une date --</option>
                    {Array.from(new Set(archives.map((a) => a.date))).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {selectedArchiveDate && (
                    <select className="rounded-xl border px-2 py-1" value={selectedArchiveIndex} onChange={(e) => setSelectedArchiveIndex(Number(e.target.value))}>
                      {(archives.filter((a) => a.date === selectedArchiveDate) || []).map((g, i) => (
                        <option key={g.batchIndex} value={i}>Archive groupe {i + 1}</option>
                      ))}
                    </select>
                  )}
                  <button onClick={() => { setViewingArchive(false); setSelectedArchiveDate(null); }} className="rounded-xl border px-3 py-1">Vue actuelle</button>
                  <button onClick={() => printHistory(displayedAdmissions)} className="ml-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">🖨️ Imprimer historique</button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="py-3 px-3">ID</th>
                    <th className="py-3 px-3">Patient</th>
                    <th className="py-3 px-3">Service</th>
                    <th className="py-3 px-3">Médecin</th>
                    <th className="py-3 px-3">Date entrée</th>
                    <th className="py-3 px-3">Date sortie</th>
                    <th className="py-3 px-3">Motif</th>
                    <th className="py-3 px-3">Statut</th>
                    <th className="py-3 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedAdmissions.map((item) => (
                    <tr key={item.id} className="border-b border-slate-200 dark:border-slate-700">
                      <td className="py-3 px-3 text-slate-900 dark:text-white">{item.id}</td>
                      <td className="py-3 px-3 text-slate-900 dark:text-white">{item.patient}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.service}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.doctor}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.entryDate}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.exitDate}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.reason}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>{item.status}</span>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => setSelectedAdmission(item)}
                          className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Détails
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">Admissions fréquentes</h4>
              <div className="mt-4 space-y-3">
                {frequentAdmissions.map((item) => (
                  <button key={item.patient} onClick={() => setSelectedFrequent(item.patient)} className="w-full text-left rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center justify-between text-slate-900 dark:text-white">
                      <span>{item.patient}</span>
                      <span className="font-semibold">{item.count}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">Graphiques utiles</h4>
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-white">Admissions par mois</p>
                  <MonthlyBarChart />
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-white">Répartition par service</p>
                  <ServicePieChart admissions={admissionsState} />
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-white">Heures d'admission</p>
                  <HoursAreaChart admissions={admissionsState} />
                </div>
              </div>
            </div>
          </aside>
        </div>

        {selectedAdmission && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Admission {selectedAdmission.id}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Résumé administratif et facturation.</p>
              </div>
              <button
                onClick={() => setSelectedAdmission(null)}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Fermer
              </button>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Patient</p>
                  <p className="mt-2 font-semibold text-slate-900 dark:text-white">{selectedAdmission.patient}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Service</p>
                    <p className="mt-2 font-semibold text-slate-900 dark:text-white">{selectedAdmission.service}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Médecin</p>
                    <p className="mt-2 font-semibold text-slate-900 dark:text-white">{selectedAdmission.doctor}</p>
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Séjour</p>
                  <p className="mt-2 text-slate-900 dark:text-white">{selectedAdmission.entryDate} → {selectedAdmission.exitDate}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Assurance</p>
                  <p className="mt-2 text-slate-900 dark:text-white">{selectedAdmission.insurance}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Facturation</p>
                  <div className="mt-2 space-y-2 text-slate-900 dark:text-white">
                    <p>Total payé : 8 400€</p>
                    <p>Reste à payer : 1 200€</p>
                    <p>Assurance : {selectedAdmission.insurance}</p>
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Documents</p>
                  <div className="mt-3 grid gap-2">
                    {[
                      "Fiche admission",
                      "Ordonnance",
                      "Rapport sortie",
                    ].map((doc) => (
                      <button key={doc} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                        {doc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <h4 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Chronologie</h4>
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {admissionTimeline.map((item) => (
                  <div key={item.date} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                    <p className="font-semibold text-slate-900 dark:text-white">{item.date}</p>
                    <p className="mt-1">{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {selectedFrequent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Dossiers de {selectedFrequent}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Historique des admissions fréquentes et recommandations IA.</p>
                </div>
                <button onClick={() => setSelectedFrequent(null)} className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  Fermer
                </button>
              </div>
              <div className="space-y-3">
                {admissionsState.filter((a) => a.patient === selectedFrequent).map((record) => (
                  <div key={record.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{record.id} — {record.service}</p>
                        <p className="text-sm text-slate-500">{record.entryDate} à {record.entryHour}h • {record.reason}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[record.status]}`}>{record.status}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white">Suggestion IA</p>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{generateAISuggestion(selectedFrequent, admissionsState)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Helper components ---
function MonthlyBarChart() {
  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const values = [30, 20, 15, 18, 22, 0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...values, 1);
  return (
    <div className="mt-3">
      <svg width="100%" height="120" viewBox="0 0 360 120" preserveAspectRatio="none">
        {values.map((value, i) => {
          const barWidth = 22;
          const gap = 8;
          const x = i * (barWidth + gap);
          const barHeight = (value / max) * 80;
          return (
            <g key={months[i]}>
              <rect x={x} y={100 - barHeight} width={barWidth} height={barHeight} rx="4" fill="#2563eb" />
              <text x={x + barWidth / 2} y={115} textAnchor="middle" fontSize="8" fill="#64748b">{months[i]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ServicePieChart({ admissions }: { admissions: typeof initialAdmissions }) {
  const serviceCategories = [
    "Consultation générale",
    "Diagnostic et imagerie",
    "Soins de maternité",
    "Services chirurgicaux",
    "Soins d'urgence",
    "Soutien aux patients",
  ];
  const counts: Record<string, number> = serviceCategories.reduce((acc, category) => {
    acc[category] = 0;
    return acc;
  }, {} as Record<string, number>);
  admissions.forEach((a) => {
    if (counts[a.service] !== undefined) counts[a.service] += 1;
  });
  const entries = Object.entries(counts);
  const total = Math.max(entries.reduce((sum, [, value]) => sum + value, 0), 1);
  let angle = 0;
  const colors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#14b8a6"];
  return (
    <div className="mt-3 flex items-center gap-3">
      <svg width="120" height="120" viewBox="0 0 32 32" className="shrink-0">
        {entries.map(([category, value], index) => {
          const slice = (value / total) * 2 * Math.PI;
          const x1 = 16 + 15 * Math.cos(angle);
          const y1 = 16 + 15 * Math.sin(angle);
          angle += slice;
          const x2 = 16 + 15 * Math.cos(angle);
          const y2 = 16 + 15 * Math.sin(angle);
          const large = slice > Math.PI ? 1 : 0;
          return (
            <path key={category} d={`M16 16 L ${x1} ${y1} A 15 15 0 ${large} 1 ${x2} ${y2} z`} fill={colors[index % colors.length]} />
          );
        })}
      </svg>
      <div className="text-sm space-y-1">
        {entries.map(([category, value], index) => (
          <div key={category} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
            <span>{category} • {value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoursAreaChart({ admissions }: { admissions: typeof initialAdmissions }) {
  const hours = new Array(24).fill(0);
  admissions.forEach((item) => {
    const hour = typeof item.entryHour === "number" ? item.entryHour : 0;
    hours[hour % 24] += 1;
  });
  const max = Math.max(...hours, 1);
  const points = hours.map((count, i) => `${(i / 23) * 300},${80 - (count / max) * 70}`).join(" ");
  return (
    <div className="mt-3">
      <svg width="100%" height="100" viewBox="0 0 300 100" preserveAspectRatio="none">
        <polyline fill="none" stroke="#7c3aed" strokeWidth={2} points={points} />
        {hours.map((_, i) => (
          <text key={i} x={(i / 23) * 300} y={96} fontSize="6" fill="#64748b" textAnchor="middle">{i}</text>
        ))}
      </svg>
    </div>
  );
}

// --- Print helper & AI suggestion ---
function printHistory(items: typeof initialAdmissions) {
  const htmlRows = items.map((it) => `<tr><td style="padding:8px;border:1px solid #ddd">${it.id}</td><td style="padding:8px;border:1px solid #ddd">${it.patient}</td><td style="padding:8px;border:1px solid #ddd">${it.service}</td><td style="padding:8px;border:1px solid #ddd">${it.doctor}</td><td style="padding:8px;border:1px solid #ddd">${it.entryDate}</td><td style="padding:8px;border:1px solid #ddd">${it.exitDate}</td><td style="padding:8px;border:1px solid #ddd">${it.reason}</td><td style="padding:8px;border:1px solid #ddd">${it.status}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Historique admissions</title><style>body{font-family:Inter,Arial,Helvetica,sans-serif;padding:24px}h1{font-size:20px;margin-bottom:4px}p{color:#6b7280}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #e5e7eb;padding:8px;text-align:left}th{background:#f3f4f6}</style></head><body><h1>Historique des admissions</h1><p>Export généré le ${new Date().toLocaleString()}</p><table><thead><tr><th>ID</th><th>Patient</th><th>Service</th><th>Médecin</th><th>Date entrée</th><th>Date sortie</th><th>Motif</th><th>Statut</th></tr></thead><tbody>${htmlRows}</tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.print();
}

function generateAISuggestion(patient: string, admissions: typeof initialAdmissions) {
  const records = admissions.filter((a) => a.patient === patient);
  if (records.length >= 4) return "Suggestion IA: Patient à réhospitalisations fréquentes — envisager une consultation de suivi chronologique et vérification assurance.";
  if (records.some((r) => r.status === 'Transférée' || r.status === 'En observation')) return "Suggestion IA: Prioriser les contrôles pré-opératoires et planifier suivi rapproché.";
  return "Suggestion IA: Dossier stable — vérifier les documents administratifs et proposer réadmission rapide si nécessaire.";
}
