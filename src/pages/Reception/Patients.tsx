import { useMemo, useRef, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

type FamilyContact = {
  name: string;
  relation: string;
  phone: string;
};

type InsuranceInfo = {
  company: string;
  policyNumber: string;
  expiryDate: string;
  coverageType: string;
  status: "Active" | "Suspendue" | "En attente validation";
};

type Patient = {
  id: string;
  name: string;
  phone: string;
  status: string;
  insurance: string;
  gender: string;
  age: number;
  birthDate: string;
  address: string;
  profession: string;
  alerts: string[];
  family: FamilyContact[];
  insuranceInfo: InsuranceInfo;
  history: { date: string; event: string }[];
};

const PATIENTS: Patient[] = [
  {
    id: "SI-00231",
    name: "Sarah Ilunga",
    phone: "+243 81 234 5678",
    status: "En attente",
    insurance: "Validée",
    gender: "Femme",
    age: 29,
    birthDate: "12/03/1997",
    address: "Av. Kasa-Vubu, Kinshasa",
    profession: "Infirmière",
    alerts: ["Allergie pénicilline", "Hypertension"],
    family: [
      { name: "Jean Ilunga", relation: "Père", phone: "+243 81 998 7766" },
      { name: "Grâce Mbayo", relation: "Sœur", phone: "+243 82 445 3322" },
    ],
    insuranceInfo: {
      company: "Afripolice",
      policyNumber: "POL-452183",
      expiryDate: "12/11/2026",
      coverageType: "Couverture totale",
      status: "Active",
    },
    history: [
      { date: "12 Mai", event: "Consultation générale" },
      { date: "14 Mai", event: "Radiologie" },
      { date: "16 Mai", event: "Hospitalisation" },
    ],
  },
  {
    id: "DM-00509",
    name: "David Mbuyi",
    phone: "+243 99 565 1234",
    status: "En cours",
    insurance: "Suspendue",
    gender: "Homme",
    age: 42,
    birthDate: "08/07/1983",
    address: "Quartier Limete, Kinshasa",
    profession: "Comptable",
    alerts: ["Diabète"],
    family: [
      { name: "Marie Mbuyi", relation: "Épouse", phone: "+243 81 431 2278" },
    ],
    insuranceInfo: {
      company: "SecurAssur",
      policyNumber: "POL-882300",
      expiryDate: "02/02/2025",
      coverageType: "Hospitalisation + Consultations",
      status: "Suspendue",
    },
    history: [
      { date: "10 Mai", event: "Suivi diabète" },
      { date: "13 Mai", event: "Prise de sang" },
    ],
  },
  {
    id: "FN-00742",
    name: "Fatou Ndala",
    phone: "+243 81 220 9900",
    status: "Actif",
    insurance: "En vérification",
    gender: "Femme",
    age: 35,
    birthDate: "21/11/1988",
    address: "Gombe, Kinshasa",
    profession: "Enseignante",
    alerts: ["Asthme"],
    family: [
      { name: "Pierre Ndala", relation: "Frère", phone: "+243 82 555 1188" },
    ],
    insuranceInfo: {
      company: "VitalCare",
      policyNumber: "POL-990177",
      expiryDate: "20/09/2026",
      coverageType: "Consultation + Urgence",
      status: "En attente validation",
    },
    history: [
      { date: "11 Mai", event: "Consultation asthme" },
      { date: "15 Mai", event: "Spirométrie" },
    ],
  },
];

const statusBadge = (status: string) => {
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold";
  switch (status) {
    case "Validée":
      return `${base} bg-emerald-100 text-emerald-700`;
    case "Suspendue":
      return `${base} bg-red-100 text-red-700`;
    case "En vérification":
    case "En attente":
      return `${base} bg-amber-100 text-amber-700`;
    default:
      return `${base} bg-slate-100 text-slate-700`;
  }
};

const badgeFromInsuranceStatus = (status: InsuranceInfo["status"]) => {
  switch (status) {
    case "Active":
      return "bg-emerald-100 text-emerald-700";
    case "Suspendue":
      return "bg-red-100 text-red-700";
    case "En attente validation":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

export default function ReceptionPatients() {
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>(PATIENTS);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(PATIENTS[0].id);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContact, setNewContact] = useState<Partial<FamilyContact>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [insuranceForm, setInsuranceForm] = useState<Partial<InsuranceInfo>>({});

  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billingForm, setBillingForm] = useState<any>({
    invoiceNumber: `INV-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: "Cash",
    items: [{ desc: "", qty: 1, unitPrice: 0 }],
    note: "",
  });

  const computeBillingTotal = () => {
    return (billingForm.items || []).reduce((sum: number, it: any) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  };
  const addBillingItem = () => setBillingForm((f: any) => ({ ...f, items: [...(f.items || []), { desc: "", qty: 1, unitPrice: 0 }] }));
  const updateBillingItem = (idx: number, key: string, value: any) =>
    setBillingForm((f: any) => {
      const items = [...(f.items || [])];
      items[idx] = { ...items[idx], [key]: value };
      return { ...f, items };
    });
  const removeBillingItem = (idx: number) => setBillingForm((f: any) => ({ ...f, items: (f.items || []).filter((_: any, i: number) => i !== idx) }));

  const [showConsultModal, setShowConsultModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showHospitalizeModal, setShowHospitalizeModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

  const generateInsurancePDF = () => {
    const info = selectedPatient.insuranceInfo;
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Fiche Assurance - ${selectedPatient.name}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827 }
            .card { border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px }
            h1 { font-size: 20px; margin-bottom: 8px }
            table { width:100%; border-collapse: collapse; margin-top: 12px }
            td, th { border: 1px solid #e5e7eb; padding: 8px; text-align:left }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Carte assurance — ${selectedPatient.name}</h1>
            <p><strong>ID Patient:</strong> ${selectedPatient.id}</p>
            <table>
              <tr><th>Compagnie</th><td>${info.company}</td></tr>
              <tr><th>Numéro police</th><td>${info.policyNumber}</td></tr>
              <tr><th>Date expiration</th><td>${info.expiryDate}</td></tr>
              <tr><th>Type couverture</th><td>${info.coverageType}</td></tr>
              <tr><th>État</th><td>${info.status}</td></tr>
            </table>
          </div>
        </body>
      </html>
    `;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    // Give browser a moment then trigger print which user can save as PDF
    setTimeout(() => w.print(), 300);
  };

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  const filteredPatients = useMemo(
    () =>
      patients.filter((patient) =>
        [patient.id, patient.name, patient.phone]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [search, patients]
  );

  return (
    <>
      <PageMeta
        title="Patients | Réception - D7 Clinique"
        description="Gestion des patients avec recherche intelligente, fiche patient dynamique, assurance et alertes médicales."
      />
      <PageBreadcrumb pageTitle="Patients" />

      <div className="space-y-6">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-slate-950">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Patients</h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Rechercher rapidement un patient, consulter son dossier et agir en un clic.</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-gray-800 dark:bg-slate-900">
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300">Rechercher par nom, téléphone, ID patient...</label>

              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-slate-950">
                <span className="text-lg">🔍</span>

                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par nom, téléphone, ID patient..."
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                />
              </div>

            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Liste patients</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Cliquez sur un patient pour afficher sa fiche complète à droite.</p>
              </div>
              <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{filteredPatients.length} résultats</div>
            </div>

            <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 dark:border-gray-800">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-gray-800">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Nom</th>
                    <th className="px-4 py-3 font-medium">Téléphone</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 font-medium">Assurance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-800 dark:bg-slate-950">
                  {filteredPatients.map((patient) => (
                    <tr
                      key={patient.id}
                      className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-900 ${patient.id === selectedPatient.id ? "bg-slate-100 dark:bg-slate-900" : ""}`}
                      onClick={() => setSelectedPatientId(patient.id)}
                    >
                      <td className="px-4 py-4 font-medium text-slate-800 dark:text-white">{patient.id}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{patient.name}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{patient.phone}</td>
                      <td className="px-4 py-4">
                        <span className={statusBadge(patient.status)}>{patient.status}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={statusBadge(patient.insurance)}>{patient.insurance}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-slate-950">
            <div className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Fiche patient</p>
                  <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{selectedPatient.name}</h2>
                </div>
                <div className="rounded-3xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-950 dark:text-white">{selectedPatient.id}</div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-950">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Informations personnelles</h3>
                  <dl className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <dt>Sexe</dt>
                      <dd>{selectedPatient.gender}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Âge</dt>
                      <dd>{selectedPatient.age} ans</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Date de naissance</dt>
                      <dd>{selectedPatient.birthDate}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Téléphone</dt>
                      <dd>{selectedPatient.phone}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Adresse</dt>
                      <dd>{selectedPatient.address}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Profession</dt>
                      <dd>{selectedPatient.profession}</dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-950">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Alertes médicales</h3>
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/20 dark:text-red-200">Prioritaire</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {selectedPatient.alerts.map((alert) => (
                      <div key={alert} className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700/40 dark:bg-red-950/40 dark:text-red-200">{alert}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-gray-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Contacts famille</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Très important médicalement.</p>
                </div>
                <button
                  onClick={() => {
                    setNewContact({});
                    setShowAddContactModal(true);
                  }}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  ➕ Ajouter contact
                </button>
              </div>

              <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 dark:border-gray-800">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-gray-800">
                  <thead className="bg-white text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Nom</th>
                      <th className="px-4 py-3">Relation</th>
                      <th className="px-4 py-3">Téléphone</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-950 dark:divide-gray-800">
                    {selectedPatient.family.map((contact) => (
                      <tr key={contact.phone}>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{contact.name}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{contact.relation}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 flex items-center justify-between">
                          <span>{contact.phone}</span>
                          <span className="flex items-center gap-2">
                            <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} aria-label={`Appeler ${contact.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">📞</a>
                            <button
                              onClick={() => {
                                const useWhatsApp = window.confirm("Ouvrir WhatsApp pour discuter ? OK = WhatsApp, Annuler = SMS");
                                const digits = contact.phone.replace(/\D/g, "");
                                if (useWhatsApp) {
                                  window.open(`https://wa.me/${digits}`, "_blank");
                                } else {
                                  window.location.href = `sms:${digits}`;
                                }
                              }}
                              aria-label={`Envoyer message à ${contact.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                            >
                              ✉️
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Assurance</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Carte dédiée et état de couverture.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeFromInsuranceStatus(selectedPatient.insuranceInfo.status)}`}>{selectedPatient.insuranceInfo.status}</span>
              </div>

              <div className="mt-5 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-slate-900">
                <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-white">Compagnie</span>
                  <span>{selectedPatient.insuranceInfo.company}</span>
                </div>
                <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-white">Numéro police</span>
                  <span>{selectedPatient.insuranceInfo.policyNumber}</span>
                </div>
                <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-white">Date expiration</span>
                  <span>{selectedPatient.insuranceInfo.expiryDate}</span>
                </div>
                <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-white">Type couverture</span>
                  <span>{selectedPatient.insuranceInfo.coverageType}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={generateInsurancePDF} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">Télécharger PDF</button>
                <button onClick={() => { setInsuranceForm(selectedPatient.insuranceInfo); setShowInsuranceModal(true); }} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">Modifier</button>
                <input ref={fileInputRef} type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) alert(`Document sélectionné : ${f.name} (simulation de scan)`); }} className="hidden" />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-gray-800 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Historique rapide</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {selectedPatient.history.map((entry) => (
                  <div key={`${entry.date}-${entry.event}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-slate-950">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 dark:text-white">{entry.date}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{entry.event}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-950">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Actions d’orientation</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button onClick={() => setShowConsultModal(true)} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">Envoyer vers consultation</button>
                <button onClick={() => setShowAppointmentModal(true)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">Créer rendez-vous</button>
                <button onClick={() => setShowHospitalizeModal(true)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">Hospitaliser</button>
                <button onClick={() => setShowBillingModal(true)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">Facturation</button>
                <button onClick={() => setShowEmergencyModal(true)} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-900/40">Urgence</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Add Contact Modal */}
      {showAddContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Ajouter un contact famille</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm text-slate-700 dark:text-slate-300">Nom</label>
                <input value={newContact.name || ""} onChange={(e) => setNewContact((s) => ({ ...s, name: e.target.value }))} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-slate-700 dark:text-slate-300">Relation</label>
                <input value={newContact.relation || ""} onChange={(e) => setNewContact((s) => ({ ...s, relation: e.target.value }))} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-slate-700 dark:text-slate-300">Téléphone</label>
                <input value={newContact.phone || ""} onChange={(e) => setNewContact((s) => ({ ...s, phone: e.target.value }))} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowAddContactModal(false)} className="rounded-2xl border px-4 py-2 text-sm font-semibold">Annuler</button>
              <button onClick={() => {
                if (!newContact.name || !newContact.phone) { alert("Remplissez le nom et le téléphone"); return; }
                const contact: FamilyContact = { name: newContact.name!, relation: newContact.relation || "", phone: newContact.phone! };
                setPatients((prev) => prev.map((p) => (p.id === selectedPatient.id ? { ...p, family: [...p.family, contact] } : p)));
                setShowAddContactModal(false);
              }} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {/* Insurance Edit Modal */}
      {showInsuranceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modifier assurance — {selectedPatient.name}</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Compagnie</label>
              <input value={insuranceForm.company || ""} onChange={(e) => setInsuranceForm((s) => ({ ...s, company: e.target.value }))} className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Numéro police</label>
              <input value={insuranceForm.policyNumber || ""} onChange={(e) => setInsuranceForm((s) => ({ ...s, policyNumber: e.target.value }))} className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Date expiration</label>
              <input value={insuranceForm.expiryDate || ""} onChange={(e) => setInsuranceForm((s) => ({ ...s, expiryDate: e.target.value }))} className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Type couverture</label>
              <input value={insuranceForm.coverageType || ""} onChange={(e) => setInsuranceForm((s) => ({ ...s, coverageType: e.target.value }))} className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">État</label>
              <select value={insuranceForm.status || "Active"} onChange={(e) => setInsuranceForm((s) => ({ ...s, status: e.target.value as InsuranceInfo["status"] }))} className="w-full rounded-md border px-3 py-2">
                <option value="Active">Active</option>
                <option value="Suspendue">Suspendue</option>
                <option value="En attente validation">En attente validation</option>
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowInsuranceModal(false)} className="rounded-2xl border px-4 py-2">Annuler</button>
              <button onClick={() => {
                setPatients((prev) => prev.map((p) => p.id === selectedPatient.id ? { ...p, insuranceInfo: { company: insuranceForm.company || "", policyNumber: insuranceForm.policyNumber || "", expiryDate: insuranceForm.expiryDate || "", coverageType: insuranceForm.coverageType || "", status: (insuranceForm.status as InsuranceInfo["status"]) || "Active" } } : p));
                setShowInsuranceModal(false);
              }} className="rounded-2xl bg-slate-900 px-4 py-2 text-white">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Billing & Action Modals */}
      {showBillingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-900">
            <h3 className="text-lg font-semibold">Facturation — {selectedPatient.name}</h3>
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Facture #</label>
                  <input value={billingForm.invoiceNumber} onChange={(e) => setBillingForm((s: any) => ({ ...s, invoiceNumber: e.target.value }))} className="w-full rounded-md border px-3 py-2" />
                </div>
                <div>
                  <label className="text-sm">Date</label>
                  <input type="date" value={billingForm.date} onChange={(e) => setBillingForm((s: any) => ({ ...s, date: e.target.value }))} className="w-full rounded-md border px-3 py-2" />
                </div>
              </div>

              <label className="text-sm">Moyen paiement</label>
              <select value={billingForm.paymentMethod} onChange={(e) => setBillingForm((s: any) => ({ ...s, paymentMethod: e.target.value }))} className="w-full rounded-md border px-3 py-2">
                <option>Cash</option>
                <option>Carte</option>
                <option>Assurance</option>
                <option>Mobile Money</option>
              </select>

              <label className="text-sm">Lignes de facturation</label>
              <div className="space-y-2">
                {(billingForm.items || []).map((it: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-6 gap-2 items-center">
                    <input value={it.desc} onChange={(e) => updateBillingItem(idx, "desc", e.target.value)} placeholder="Description" className="col-span-3 rounded-md border px-2 py-1" />
                    <input type="number" value={it.qty} onChange={(e) => updateBillingItem(idx, "qty", Number(e.target.value))} className="col-span-1 rounded-md border px-2 py-1" />
                    <input type="number" value={it.unitPrice} onChange={(e) => updateBillingItem(idx, "unitPrice", Number(e.target.value))} className="col-span-1 rounded-md border px-2 py-1" />
                    <button onClick={() => removeBillingItem(idx)} className="col-span-1 rounded-md bg-red-50 text-red-700 px-2 py-1">Suppr</button>
                  </div>
                ))}
                <button onClick={addBillingItem} className="rounded-2xl border px-3 py-1 w-full text-sm">Ajouter une ligne</button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Note</label>
                  <textarea value={billingForm.note} onChange={(e) => setBillingForm((s: any) => ({ ...s, note: e.target.value }))} className="w-full rounded-md border px-3 py-2" />
                </div>
                <div className="rounded-md border p-3">
                  <div className="flex justify-between"><span>Sous-total</span><span>{computeBillingTotal().toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Assurance couvre</span><span>{"0.00"}</span></div>
                  <div className="flex justify-between font-semibold"><span>Total dû</span><span>{computeBillingTotal().toFixed(2)}</span></div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowBillingModal(false)} className="rounded-2xl border px-4 py-2">Annuler</button>
              <button onClick={() => {
                const total = computeBillingTotal();
                setPatients((prev) => prev.map((p) => p.id === selectedPatient.id ? { ...p, history: [{ date: new Date().toLocaleDateString('fr-FR'), event: `Facture ${billingForm.invoiceNumber} : ${total.toFixed(2)} USD` }, ...p.history] } : p));
                alert(`Facturation créée (simulation) — Total: ${total.toFixed(2)}`);
                setShowBillingModal(false);
              }} className="rounded-2xl bg-slate-900 px-4 py-2 text-white">Facturer</button>
            </div>
          </div>
        </div>
      )}

      {showConsultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-900">
            <h3 className="text-lg font-semibold">Envoyer vers consultation — {selectedPatient.name}</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Service / Département</label>
              <input id="consult-dept" className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Urgence</label>
              <select id="consult-priority" className="w-full rounded-md border px-3 py-2"><option>Normal</option><option>Urgent</option></select>
              <label className="text-sm">Médecin référent</label>
              <input id="consult-doctor" className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Notes</label>
              <textarea id="consult-notes" className="w-full rounded-md border px-3 py-2" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowConsultModal(false)} className="rounded-2xl border px-4 py-2">Annuler</button>
              <button onClick={() => {
                const dept = (document.getElementById('consult-dept') as HTMLInputElement).value;
                const priority = (document.getElementById('consult-priority') as HTMLSelectElement).value;
                setPatients((prev) => prev.map((p) => p.id === selectedPatient.id ? { ...p, history: [{ date: new Date().toLocaleDateString('fr-FR'), event: `Envoyé vers consultation ${dept} (${priority})` }, ...p.history] } : p));
                alert('Consultation envoyée (simulation)');
                setShowConsultModal(false);
              }} className="rounded-2xl bg-slate-900 px-4 py-2 text-white">Envoyer</button>
            </div>
          </div>
        </div>
      )}

      {showAppointmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-900">
            <h3 className="text-lg font-semibold">Créer rendez-vous — {selectedPatient.name}</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Date & Heure</label>
              <input id="appt-datetime" type="datetime-local" className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Type</label>
              <input id="appt-type" className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Médecin</label>
              <input id="appt-doctor" className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Notes</label>
              <textarea id="appt-notes" className="w-full rounded-md border px-3 py-2" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowAppointmentModal(false)} className="rounded-2xl border px-4 py-2">Annuler</button>
              <button onClick={() => {
                const dt = (document.getElementById('appt-datetime') as HTMLInputElement).value;
                const type = (document.getElementById('appt-type') as HTMLInputElement).value;
                setPatients((prev) => prev.map((p) => p.id === selectedPatient.id ? { ...p, history: [{ date: new Date().toLocaleDateString('fr-FR'), event: `Rendez-vous ${type} le ${dt}` }, ...p.history] } : p));
                alert('Rendez-vous créé (simulation)');
                setShowAppointmentModal(false);
              }} className="rounded-2xl bg-slate-900 px-4 py-2 text-white">Créer</button>
            </div>
          </div>
        </div>
      )}

      {showHospitalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-900">
            <h3 className="text-lg font-semibold">Hospitaliser — {selectedPatient.name}</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Unité / Service</label>
              <input id="hosp-unit" className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">N° lit</label>
              <input id="hosp-bed" className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Date admission</label>
              <input id="hosp-date" type="date" className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Motif</label>
              <textarea id="hosp-reason" className="w-full rounded-md border px-3 py-2" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowHospitalizeModal(false)} className="rounded-2xl border px-4 py-2">Annuler</button>
              <button onClick={() => {
                const unit = (document.getElementById('hosp-unit') as HTMLInputElement).value;
                const bed = (document.getElementById('hosp-bed') as HTMLInputElement).value;
                setPatients((prev) => prev.map((p) => p.id === selectedPatient.id ? { ...p, history: [{ date: new Date().toLocaleDateString('fr-FR'), event: `Hospitalisé en ${unit} - lit ${bed}` }, ...p.history] } : p));
                alert('Hospitalisation enregistrée (simulation)');
                setShowHospitalizeModal(false);
              }} className="rounded-2xl bg-slate-900 px-4 py-2 text-white">Hospitaliser</button>
            </div>
          </div>
        </div>
      )}

      {showEmergencyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-900">
            <h3 className="text-lg font-semibold">Urgence — {selectedPatient.name}</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Priorité</label>
              <select id="em-priority" className="w-full rounded-md border px-3 py-2"><option>Rouge</option><option>Orange</option><option>Jaune</option></select>
              <label className="text-sm">Départements à notifier (virgule)</label>
              <input id="em-depts" className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Notes</label>
              <textarea id="em-notes" className="w-full rounded-md border px-3 py-2" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowEmergencyModal(false)} className="rounded-2xl border px-4 py-2">Annuler</button>
              <button onClick={() => {
                const prio = (document.getElementById('em-priority') as HTMLSelectElement).value;
                const depts = (document.getElementById('em-depts') as HTMLInputElement).value;
                setPatients((prev) => prev.map((p) => p.id === selectedPatient.id ? { ...p, history: [{ date: new Date().toLocaleDateString('fr-FR'), event: `Urgence ${prio} - Notifier: ${depts}` }, ...p.history] } : p));
                alert('Alerte urgence envoyée (simulation)');
                setShowEmergencyModal(false);
              }} className="rounded-2xl bg-red-600 px-4 py-2 text-white">Confirmer</button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
