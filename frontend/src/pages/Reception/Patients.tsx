import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { fetchPatientsFromDatabase, updatePatientRecord, fetchServices } from "../../api/reception";

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
  nationality?: string;
  alerts: string[];
  family: FamilyContact[];
  insuranceInfo: InsuranceInfo;
  history: { date: string; event: string }[];
  workflowStatus?: string;
  assignedNurseId?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
};

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
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigationState = location.state as { patientId?: string; openAppointment?: boolean } | undefined;
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContact, setNewContact] = useState<Partial<FamilyContact>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [insuranceForm, setInsuranceForm] = useState<Partial<InsuranceInfo>>({});

  // billing removed: payments are handled in the billing module/caissier

  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  
  const [appointmentTypes, setAppointmentTypes] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedApptType, setSelectedApptType] = useState<string>("");

  // Helper: compute age from birthDate (ISO or dd/mm/yyyy tolerant)
  const computeAgeFromBirthDate = (bd?: string) => {
    if (!bd) return 0;
    let d: Date | null = null;
    // try ISO
    const iso = new Date(bd);
    if (!isNaN(iso.getTime())) d = iso;
    // try dd/mm/yyyy
    if (!d) {
      const parts = bd.split(/[-\/]/).map((p) => parseInt(p, 10));
      if (parts.length === 3) {
        const [d1, m1, y1] = parts;
        if (y1 > 31) d = new Date(y1, (m1 || 1) - 1, d1);
      }
    }
    if (!d) return 0;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
  };

  const formatBirthDateForDisplay = (value?: string) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
    }
    const parts = value.split(/[-\/]/).map((p) => p.trim());
    if (parts.length === 3) {
      let [d, m, y] = parts;
      if (parts[0].length === 4) {
        y = parts[0];
        m = parts[1];
        d = parts[2];
      }
      return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    }
    return value;
  };

  const [selectedApptDoctor, setSelectedApptDoctor] = useState<string>("");

  const EMPTY_PATIENT: Patient = {
    id: "",
    name: "—",
    phone: "",
    status: "",
    insurance: "",
    gender: "",
    age: 0,
    birthDate: "",
    address: "",
    profession: "",
    nationality: "",
    alerts: [],
    family: [],
    insuranceInfo: { company: "", policyNumber: "", expiryDate: "", coverageType: "", status: "En attente validation" },
    history: [],
  };

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

  const generatePatientFilePDF = () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Fiche Patient - ${selectedPatient.name}</title>
          <style>
            @media print {
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: "Calibri", Arial, sans-serif; font-size: 11pt; line-height: 1.3; color: #333; }
              .page { page-break-after: always; min-height: 29.7cm; position: relative; padding: 1.5cm; }
              .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
              .clinic-logo { font-weight: bold; font-size: 16pt; color: #b41d1d; }
              .clinic-tagline { font-size: 9pt; color: #666; margin-top: 4px; }
              .clinic-contact { font-size: 8pt; color: #666; margin-top: 4px; }
              .section { margin-bottom: 16px; }
              .section-title { font-weight: bold; font-size: 11pt; border-bottom: 1px solid #999; padding-bottom: 4px; margin-bottom: 8px; }
              table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 8px; }
              td, th { border: 1px solid #ccc; padding: 6px 4px; text-align: left; }
              th { background-color: #f0f0f0; font-weight: bold; }
              .label { font-weight: bold; width: 30%; }
              .value { width: 70%; }
              .footer { position: absolute; bottom: 1.5cm; left: 1.5cm; right: 1.5cm; border-top: 1px solid #999; padding-top: 8px; text-align: center; font-size: 8pt; color: #666; }
              .patient-header { display: flex; justify-content: space-between; margin-bottom: 12px; }
              .patient-name { font-size: 14pt; font-weight: bold; color: #1e8a58; }
              .patient-id { font-size: 9pt; color: #666; }
            }
            body { font-family: "Calibri", Arial, sans-serif; font-size: 11pt; color: #333; }
            .page { min-height: 29.7cm; padding: 1.5cm; border: 1px solid #ddd; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
            .clinic-logo { font-weight: bold; font-size: 16pt; color: #b41d1d; }
            .clinic-tagline { font-size: 9pt; color: #666; margin-top: 4px; }
            .clinic-contact { font-size: 8pt; color: #666; margin-top: 4px; }
            .section { margin-bottom: 16px; }
            .section-title { font-weight: bold; font-size: 11pt; border-bottom: 1px solid #999; padding-bottom: 4px; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 8px; }
            td, th { border: 1px solid #ccc; padding: 6px 4px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .label { font-weight: bold; width: 30%; }
            .value { width: 70%; }
            .footer { border-top: 1px solid #999; padding-top: 8px; text-align: center; font-size: 8pt; color: #666; margin-top: 20px; }
            .patient-header { display: flex; justify-content: space-between; margin-bottom: 12px; }
            .patient-name { font-size: 14pt; font-weight: bold; color: #1e8a58; }
            .patient-id { font-size: 9pt; color: #666; }
          </style>
        </head>
        <body>
          <div class="page">
            <!-- Header -->
            <div class="header">
              <img src="../../../public/images/favicon.png" alt="" width="40">
              <div class="clinic-logo">D7 CLINIC</div>
              <div class="clinic-tagline">Centre de santé intégré - Service de qualité</div>
              <div class="clinic-contact">Zone de santé : Dilala | Tel : +243987299227 | Email : fondationd7clinic@gmail.com</div>
            </div>

            <!-- Patient Header -->
            <div class="patient-header">
              <div>
                <div class="patient-name">${selectedPatient.name}</div>
                <div class="patient-id">ID Patient: ${selectedPatient.id}</div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: bold; font-size: 12pt;">FICHE PATIENT</div>
                <div style="font-size: 9pt; color: #666;">Établie le: ${new Date().toLocaleDateString('fr-FR')}</div>
              </div>
            </div>

            <!-- Informations Personnelles -->
            <div class="section">
              <div class="section-title">Informations Personnelles</div>
              <table>
                <tr><td class="label">Sexe</td><td class="value">${selectedPatient.gender || '—'}</td></tr>
                <tr><td class="label">Âge</td><td class="value">${selectedPatient.age || 0} ans</td></tr>
                <tr><td class="label">Date de naissance</td><td class="value">${selectedPatient.birthDate || '—'}</td></tr>
                <tr><td class="label">Téléphone</td><td class="value">${selectedPatient.phone || '—'}</td></tr>
                <tr><td class="label">Adresse</td><td class="value">${selectedPatient.address || '—'}</td></tr>
                <tr><td class="label">Profession</td><td class="value">${selectedPatient.profession || '—'}</td></tr>
                <tr><td class="label">Nationalité</td><td class="value">${selectedPatient.nationality || '—'}</td></tr>
              </table>
            </div>

            <!-- Contacts Famille -->
            ${selectedPatient.family && selectedPatient.family.length > 0 ? `
            <div class="section">
              <div class="section-title">Contacts Famille</div>
              <table>
                <thead>
                  <tr><th>Nom</th><th>Relation</th><th>Téléphone</th></tr>
                </thead>
                <tbody>
                  ${selectedPatient.family.map(c => `<tr><td>${c.name || '—'}</td><td>${c.relation || '—'}</td><td>${c.phone || '—'}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
            ` : ''}

            <!-- Assurance -->
            ${selectedPatient.insuranceInfo?.company ? `
            <div class="section">
              <div class="section-title">Information Assurance</div>
              <table>
                <tr><td class="label">Compagnie</td><td class="value">${selectedPatient.insuranceInfo.company}</td></tr>
                <tr><td class="label">Numéro Police</td><td class="value">${selectedPatient.insuranceInfo.policyNumber || '—'}</td></tr>
                <tr><td class="label">Date Expiration</td><td class="value">${selectedPatient.insuranceInfo.expiryDate || '—'}</td></tr>
                <tr><td class="label">Type Couverture</td><td class="value">${selectedPatient.insuranceInfo.coverageType || '—'}</td></tr>
                <tr><td class="label">État</td><td class="value">${selectedPatient.insuranceInfo.status || '—'}</td></tr>
              </table>
            </div>
            ` : ''}

            <!-- Historique -->
            ${selectedPatient.history && selectedPatient.history.length > 0 ? `
            <div class="section">
              <div class="section-title">Historique Médical</div>
              <table>
                <thead>
                  <tr><th>Date</th><th>Événement</th></tr>
                </thead>
                <tbody>
                  ${selectedPatient.history.map(h => `<tr><td>${h.date}</td><td>${h.event}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
            ` : ''}

            <!-- Footer -->
            <div class="footer">
              <div style="margin-bottom: 4px;">N°7 Avenue de l'aéroport coin Avenue D7 | Commune de Dilala | Q/RVA3 | Kolwezi</div>
            </div>
          </div>
        </body>
      </html>
    `;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const selectedPatient = (patients && patients.length > 0)
    ? (patients.find((p) => p.id === selectedPatientId) || patients[0])
    : EMPTY_PATIENT;

  useEffect(() => {
    (async () => {
      try {
        const ps = await fetchPatientsFromDatabase();
        console.log('Raw API Response:', ps);
        
        const ensurePatientDefaults = (p: any): Patient => {
          // Map API fields: API returns dateOfBirth, firstName, lastName, etc.
          const birthDateStr = p.dateOfBirth ?? p.dob ?? p.birthDate ?? '';
          const calculatedAge = computeAgeFromBirthDate(birthDateStr);
          
          // Extract admission metadata from MedicalHistory if available
          let profession = '';
          let family: FamilyContact[] = [];
          if (p.medicalHistories && p.medicalHistories.length > 0) {
            try {
              const metadata = JSON.parse(p.medicalHistories[0].details || '{}');
              profession = metadata.profession || '';
              family = metadata.familyContacts || [];
            } catch (e) {
              console.warn('Failed to parse admission metadata:', e);
            }
          }
          
          console.log('Patient mapping:', {
            originalId: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            gender: p.gender,
            dateOfBirth: p.dateOfBirth,
            calculatedAge,
            address: p.address,
            profession,
            nationality: p.nationality,
            medicalHistories: p.medicalHistories,
          });
          
          return {
            id: p.id ?? p.patientId ?? 'unknown',
            name: (p.name ?? `${p.firstName || ''} ${p.lastName || ''}`.trim()) || '—',
            phone: p.phone ?? p.phoneNumber ?? '',
            status: p.status ?? '',
            insurance: (p.insurance && typeof p.insurance === 'string') ? p.insurance : (p.insurance?.company ? 'Validée' : '') || '',
            gender: p.gender ?? '',
            age: calculatedAge || p.age || 0,
            birthDate: formatBirthDateForDisplay(birthDateStr),
            address: p.address ?? '',
            profession: profession || p.profession || '',
            nationality: p.nationality ?? '',
            alerts: p.alerts ?? [],
            family: family && family.length > 0 ? family : (p.family ?? p.contacts ?? []),
            insuranceInfo: p.insuranceInfo ?? (p.insurance ? { company: p.insurance.company || '', policyNumber: p.insurance.policy || '', expiryDate: '', coverageType: p.insurance.coverageType || '', status: p.insurance.status || 'En attente validation' } : { company: '', policyNumber: '', expiryDate: '', coverageType: '', status: 'En attente validation' }),
            history: p.history ?? [],
            workflowStatus: p.workflowStatus ?? p.status ?? '',
            assignedNurseId: p.assignedNurseId ?? p.doctor ?? undefined,
          };
        };

        if (ps && ps.length > 0) {
          const normalized = (ps as any[]).map(ensurePatientDefaults);
          console.log('Normalized patients:', normalized);
          setPatients(normalized);
          const requestedPatient = navigationState?.patientId
            ? normalized.find((patient) => patient.id === navigationState.patientId)
            : null;
          setSelectedPatientId((requestedPatient || normalized[0]).id);
          if (requestedPatient && navigationState?.openAppointment) {
            setShowAppointmentModal(true);
          }
        } else {
          // No patients from backend: use empty list and clear selection
          setPatients([]);
          setSelectedPatientId("");
        }
        // After loading, ensure ages are synchronized with birthDate and persist to DB if mismatch
        try {
          for (const p of (ps && ps.length > 0 ? (ps as any[]) : [])) {
            const normalizedP = ensurePatientDefaults(p);
            const calc = computeAgeFromBirthDate(normalizedP.birthDate);
            if (calc && calc !== normalizedP.age) {
              // update backend record age (best-effort, cast to any to allow flexible payload)
              try {
                await updatePatientRecord({ id: normalizedP.id, age: calc } as any);
              } catch {}
            }
          }
        } catch {}
      } catch (e) {
        // backend error: leave list empty and no selection
        setPatients([]);
        setSelectedPatientId("");
      }

      // load infirmiers and appointment types/doctors in background
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
        // nurse list not needed by reception actions (view-only), skipping

        const services = await fetchServices();
        setAppointmentTypes(services || []);

        const docs = await fetch(`${API_BASE_URL}/users?role=PHYSICIAN`, { credentials: 'include' }).then((r) => r.ok ? r.json() : [] ).catch(() => []);
        const docsAlt = await fetch(`${API_BASE_URL}/users?role=MEDECIN`, { credentials: 'include' }).then((r) => r.ok ? r.json() : [] ).catch(() => []);
        setDoctors((Array.isArray(docs) ? docs : []).concat(Array.isArray(docsAlt) ? docsAlt : []));
      } catch (e) {}
    })();
  }, [navigationState?.openAppointment, navigationState?.patientId]);

  const handleAddContact = async (contact: FamilyContact) => {
    if (!selectedPatient?.id) return alert('Aucun patient sélectionné');
    try {
      // Backend does not expose a contacts array; persist into emergencyContact/Phone as best-effort
      const payload: any = { id: selectedPatient.id };
      if (!selectedPatient.emergencyContact) payload.emergencyContact = contact.name;
      if (!selectedPatient.emergencyPhone) payload.emergencyPhone = contact.phone;
      const bothExist = selectedPatient.emergencyContact && selectedPatient.emergencyPhone;
      if (bothExist) {
        alert("Le backend actuel ne prend en charge qu'un contact d'urgence. Contactez l'administrateur pour ajouter plusieurs contacts. Le contact sera ajouté localement en attendant.");
      }
      if (Object.keys(payload).length > 1) {
        await updatePatientRecord(payload as any);
      }
      // update local UI list for immediate feedback
      setPatients((prev) => prev.map((p) => (p.id === selectedPatient.id ? { ...p, family: [...p.family, contact], emergencyContact: payload.emergencyContact ?? p.emergencyContact, emergencyPhone: payload.emergencyPhone ?? p.emergencyPhone } : p)));
      setShowAddContactModal(false);
      return;
    } catch (e) {
      console.error('Failed to save contact to backend', e);
      // fallback: local update
      setPatients((prev) => prev.map((p) => (p.id === selectedPatient.id ? { ...p, family: [...p.family, contact] } : p)));
      setShowAddContactModal(false);
    }
  };

  const handleCreateAppointment = async (opts: { datetime: string; type: string; doctorId?: string; notes?: string }) => {
    if (!selectedPatient?.id) return alert('Aucun patient sélectionné');
    const { datetime, type, doctorId, notes } = opts;
    const selectedService = appointmentTypes.find((item: any) => {
      const id = item.id || "";
      const name = item.name || item.title || "";
      return id === type || name === type;
    });
    const payload = {
      patientId: selectedPatient.id,
      requestedById: currentUser?.id || undefined,
      serviceUnitId: selectedService?.id || undefined,
      scheduledAt: datetime,
      reason: [notes || type || "Nouvelle visite", doctorId ? `Medecin: ${doctorId}` : ""].filter(Boolean).join(" - "),
      status: "SCHEDULED",
      durationMinutes: 30,
    };
    try {
      const api = await import('../../api/reception');
      const created = await api.createAppointmentInDatabase(payload);
      // update patient history on backend
      try {
        const ev = { date: new Date().toLocaleDateString('fr-FR'), event: `Rendez-vous ${type} le ${datetime} ${doctorId ? `avec ${doctorId}` : ''}` };
        await updatePatientRecord({ id: selectedPatient.id, history: [ev, ...(selectedPatient.history || [])] } as any);
        setPatients((prev) => prev.map((p) => (p.id === selectedPatient.id ? { ...p, history: [ev, ...(p.history || [])] } : p)));
      } catch (e) {
        // best-effort
      }
      alert('Rendez-vous créé');
      setShowAppointmentModal(false);
      return created;
    } catch (e) {
      console.error('Appointment create error', e);
      alert('Impossible de créer le rendez-vous (erreur serveur).');
    }
  };

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
                  {filteredPatients.map((patient, idx) => (
                    <tr
                      key={patient.id}
                      className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-900 ${patient.id === selectedPatient.id ? "bg-slate-100 dark:bg-slate-900" : ""}`}
                      onClick={() => setSelectedPatientId(patient.id)}
                    >
                      <td className="px-4 py-4 font-medium text-slate-800 dark:text-white">{idx + 1}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{patient.name}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{patient.phone}</td>
                      <td className="px-4 py-4">
                        <span className={statusBadge(patient.workflowStatus || patient.status)}>{patient.workflowStatus || patient.status}</span>
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
                  <div className="rounded-3xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-950 dark:text-white">{selectedPatient.name.charAt(0)}</div>
              </div>

              <div className="mt-6 grid gap-4 ">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-slate-950">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Informations personnelles</h3>
                  <dl className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <dt>Sexe</dt>
                      <dd>{selectedPatient.gender || '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Âge</dt>
                      <dd>{selectedPatient.age || 0} ans</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Date de naissance</dt>
                      <dd>{formatBirthDateForDisplay(selectedPatient.birthDate) || '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Téléphone</dt>
                      <dd>{selectedPatient.phone || '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Adresse</dt>
                      <dd>{selectedPatient.address || '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Profession</dt>
                      <dd>{selectedPatient.profession || '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Nationalité</dt>
                      <dd>{selectedPatient.nationality || '—'}</dd>
                    </div>
                  </dl>
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

            {selectedPatient.insuranceInfo?.company && (
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
            )}

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
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <button onClick={() => setShowAppointmentModal(true)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">Créer rendez-vous</button>
                <button onClick={generatePatientFilePDF} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">🖨️ Imprimer fiche</button>
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
              <button onClick={async () => {
                if (!newContact.name || !newContact.phone) { alert("Remplissez le nom et le téléphone"); return; }
                const contact: FamilyContact = { name: newContact.name!, relation: newContact.relation || "", phone: newContact.phone! };
                await handleAddContact(contact);
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

      {showAppointmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-900">
            <h3 className="text-lg font-semibold">Créer rendez-vous — {selectedPatient?.name}</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">Date & Heure</label>
              <input id="appt-datetime" type="datetime-local" className="w-full rounded-md border px-3 py-2" />
              <label className="text-sm">Type</label>
              <select id="appt-type" value={selectedApptType} onChange={(e) => setSelectedApptType(e.target.value)} className="w-full rounded-md border px-3 py-2">
                <option value="">Sélectionner un type</option>
                {appointmentTypes.map((t: any) => (<option key={t.id || t.name} value={t.id || t.name}>{t.name || t.title}</option>))}
              </select>
              <label className="text-sm">Médecin</label>
              <select id="appt-doctor" value={selectedApptDoctor} onChange={(e) => setSelectedApptDoctor(e.target.value)} className="w-full rounded-md border px-3 py-2">
                <option value="">Sélectionner un médecin</option>
                {doctors.map((d: any) => (<option key={d.id} value={d.id}>{d.firstName ? `${d.firstName} ${d.lastName || ''}` : d.displayName || d.username}</option>))}
              </select>
              <label className="text-sm">Notes</label>
              <textarea id="appt-notes" className="w-full rounded-md border px-3 py-2" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowAppointmentModal(false)} className="rounded-2xl border px-4 py-2">Annuler</button>
              <button onClick={async () => {
                const dt = (document.getElementById('appt-datetime') as HTMLInputElement).value;
                const type = selectedApptType || (document.getElementById('appt-type') as HTMLSelectElement).value;
                const docId = selectedApptDoctor || (document.getElementById('appt-doctor') as HTMLSelectElement).value;
                const notes = (document.getElementById('appt-notes') as HTMLTextAreaElement).value;
                await handleCreateAppointment({ datetime: dt, type, doctorId: docId, notes });
              }} className="rounded-2xl bg-slate-900 px-4 py-2 text-white">Créer</button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
