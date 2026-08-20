import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  fetchHospitalizationById,
  fetchHospitalizationRooms,
  fetchHospitalizationStats,
  fetchHospitalizationsFromDatabase,
  fetchHospitalizationTimeline,
  HospitalizationRecord,
  HospitalizationRoomInventoryItem,
  HospitalizationStats,
  HospitalizationTimelineEvent,
} from "../../api/reception";

import { formatPatientDossierId } from "../../utils/formatId";
import { useRealtime } from "../../context/RealtimeContext";
import { ClientPagination, useClientPagination } from "../../components/common/ClientPagination";
import { documentIdentityLine, documentLegalLine, documentLogoUrl, getClinicDocumentBranding } from "../../utils/clinicDocumentBranding";

const statusStyles: Record<string, string> = {
  ADMITTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  TRANSFERRED: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  DISCHARGED: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
};

const roomStatusStyles: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  OCCUPIED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  CLEANING: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  MAINTENANCE: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
};

function formatPatientName(patient?: HospitalizationRecord['patient']) {
  if (!patient) return '—';
  return [patient.firstName, patient.lastName].filter(Boolean).join(' ') || '—';
}

function getDoctorName(record: HospitalizationRecord) {
  return record.physician?.displayName || [record.physician?.firstName, record.physician?.lastName].filter(Boolean).join(' ') || '—';
}

function getRoomLabel(record: HospitalizationRecord) {
  return record.bed?.room?.number || record.bedNumber || '—';
}

const escapePrintHtml = (value: unknown) => String(value ?? "—")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");

async function printHospitalizationRecord(record: HospitalizationRecord, timeline: HospitalizationTimelineEvent[]) {
  const printWindow = window.open("", "_blank", "width=900,height=760");
  if (!printWindow) return;
  try { printWindow.opener = null; } catch { /* best effort */ }
  const clinic = await getClinicDocumentBranding();
  const identity = documentIdentityLine(clinic);
  const legal = documentLegalLine(clinic);
  const patientName = escapePrintHtml(formatPatientName(record.patient));
  const admittedAt = record.admittedAt ? new Date(record.admittedAt).toLocaleString("fr-FR") : "—";
  const events = timeline.length
    ? timeline.map((event) => `<li><strong>${escapePrintHtml(new Date(event.date).toLocaleString("fr-FR"))}</strong> — ${escapePrintHtml(event.event)}</li>`).join("")
    : "<li>Aucun événement documenté.</li>";
  printWindow.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche d'hospitalisation</title><style>body{font-family:Arial,sans-serif;color:#0f172a;padding:26px;line-height:1.45}.header{display:flex;gap:14px;border-bottom:2px solid #0D9488;padding-bottom:15px;margin-bottom:22px}.logo{height:56px;width:56px;object-fit:contain}.name{font-size:22px;font-weight:800;color:#0D9488}.muted{color:#475569;font-size:12px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cell{border:1px solid #cbd5e1;border-radius:8px;padding:12px}.label{font-size:11px;color:#64748b;text-transform:uppercase}.value{font-weight:700;margin-top:4px}ul{padding-left:20px}@media print{body{padding:12mm}}</style></head><body><header class="header"><img class="logo" src="${documentLogoUrl(clinic)}" alt="Logo établissement"><div><div class="name">${escapePrintHtml(clinic.name)}</div><div class="muted">${escapePrintHtml(identity || "Établissement de santé")}</div><div class="muted">${escapePrintHtml(legal)}</div><h2>Fiche officielle d'hospitalisation</h2></div></header><section class="grid"><div class="cell"><div class="label">Patient</div><div class="value">${patientName}</div></div><div class="cell"><div class="label">Dossier</div><div class="value">${escapePrintHtml(formatPatientDossierId(record.patient?.id, record.patient?.externalId, { truncateTo: 8 }))}</div></div><div class="cell"><div class="label">Admission</div><div class="value">${escapePrintHtml(admittedAt)}</div></div><div class="cell"><div class="label">Statut</div><div class="value">${escapePrintHtml(record.status)}</div></div><div class="cell"><div class="label">Service / chambre</div><div class="value">${escapePrintHtml(record.ServiceUnit?.name)} — ${escapePrintHtml(getRoomLabel(record))}</div></div><div class="cell"><div class="label">Médecin référent</div><div class="value">${escapePrintHtml(getDoctorName(record))}</div></div></section><section><h3>Motif d'admission</h3><p>${escapePrintHtml(record.admissionReason)}</p><h3>Chronologie du séjour</h3><ul>${events}</ul></section><footer class="muted">Document généré le ${escapePrintHtml(new Date().toLocaleString("fr-FR"))}</footer><script>window.onload=()=>window.print()</script></body></html>`);
  printWindow.document.close();
}

function HospitalizationDetails(props: {
  hospitalization: HospitalizationRecord;
  timeline: HospitalizationTimelineEvent[];
  onClose: () => void;
}) {
  const { hospitalization, timeline, onClose } = props;

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Détails : {formatPatientName(hospitalization.patient)}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Coordination administrative et timeline de séjour.</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          Fermer
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Chambre</p>
              <p className="mt-2 font-semibold text-slate-900 dark:text-white">{getRoomLabel(hospitalization)}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Service</p>
              <p className="mt-2 font-semibold text-slate-900 dark:text-white">{hospitalization.ServiceUnit?.name || '—'}</p>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Médecin référent</p>
            <p className="mt-2 font-semibold text-slate-900 dark:text-white">{getDoctorName(hospitalization)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Statut</p>
            <p className="mt-2 font-semibold text-slate-900 dark:text-white">{hospitalization.status || '—'}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Motif admission</p>
            <p className="mt-2 text-slate-900 dark:text-white">{hospitalization.admissionReason || '—'}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Info administrative</p>
            <p className="mt-2 text-slate-900 dark:text-white">Dossier : {formatPatientDossierId(hospitalization.patient?.id, hospitalization.patient?.externalId, { truncateTo: 8 })}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Téléphone : {hospitalization.patient?.phone || '—'}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Adresse : {hospitalization.patient?.address || hospitalization.patient?.city || '—'}</p>
          </div>
          <div className="grid gap-2">
            <a href={`mailto:${hospitalization.patient?.email ?? ''}`} className={`rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 ${!hospitalization.patient?.email ? 'opacity-50 pointer-events-none' : ''}`}>
              Contacter famille
            </a>
            <button
              onClick={() => void printHospitalizationRecord(hospitalization, timeline)}
              className="rounded-2xl border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Imprimer fiche d'hospitalisation
            </button>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <h4 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Timeline d'hospitalisation</h4>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            {timeline.length > 0 ? (
              timeline.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="font-semibold text-slate-900 dark:text-white">{new Date(item.date).toLocaleString('fr-FR')}</p>
                  <p className="mt-1">{item.event}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm text-slate-700 dark:text-slate-200">Aucun événement disponible pour cette hospitalisation.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HospitalisationReception() {
  const { socket } = useRealtime();
  const [hospitalizations, setHospitalizations] = useState<HospitalizationRecord[]>([]);
  const [selectedHospitalization, setSelectedHospitalization] = useState<HospitalizationRecord | null>(null);
  const [timeline, setTimeline] = useState<HospitalizationTimelineEvent[]>([]);
  const [stats, setStats] = useState<HospitalizationStats | null>(null);
  const [rooms, setRooms] = useState<HospitalizationRoomInventoryItem[]>([]);
  const [modal, setModal] = useState<null | 'search'>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState<'all' | 'available' | 'occupied' | 'cleaning'>('all');
  const [viewFilter, setViewFilter] = useState<'all' | 'admissions' | 'discharges' | 'services'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPageData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [hospitalizationsData, statsData, roomsData] = await Promise.all([
        fetchHospitalizationsFromDatabase(),
        fetchHospitalizationStats(),
        fetchHospitalizationRooms(),
      ]);

      setHospitalizations(hospitalizationsData);
      setStats(statsData);
      setRooms(roomsData);
    } catch (e) {
      setError((e as Error)?.message || 'Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPageData();
  }, []);

  useEffect(() => {
    const refresh = () => { void loadPageData(); };
    socket?.on('hospitalization.created', refresh);
    socket?.on('realtime.update', refresh);
    return () => {
      socket?.off('hospitalization.created', refresh);
      socket?.off('realtime.update', refresh);
    };
  }, [socket]);

  const handleSelectHospitalization = async (id: string) => {
    try {
      const [detail, timelineData] = await Promise.all([fetchHospitalizationById(id), fetchHospitalizationTimeline(id)]);
      setSelectedHospitalization(detail);
      setTimeline(timelineData);
    } catch (e) {
      // Error handling omitted for simplicity
    }
  };

  const filteredRooms = useMemo(() => {
    if (roomFilter === 'all') return rooms;
    if (roomFilter === 'available') return rooms.filter((room) => room.status === 'AVAILABLE');
    if (roomFilter === 'occupied') return rooms.filter((room) => room.status === 'OCCUPIED');
    if (roomFilter === 'cleaning') return rooms.filter((room) => room.status === 'CLEANING');
    return rooms;
  }, [rooms, roomFilter]);

  const filteredHospitalizations = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return hospitalizations.filter((record) => {
      const matchesSearch = !query || [
        formatPatientName(record.patient),
        record.patient?.phone,
        getRoomLabel(record),
        record.ServiceUnit?.name,
      ].filter(Boolean).join(' ').toLocaleLowerCase().includes(query);
      if (!matchesSearch) return false;
      if (viewFilter === 'admissions') return record.status === 'ADMITTED' || record.status === 'TRANSFERRED';
      if (viewFilter === 'discharges') return record.status === 'DISCHARGED';
      if (viewFilter === 'services') return Boolean(record.ServiceUnit?.name);
      return true;
    });
  }, [hospitalizations, searchQuery, viewFilter]);
  const hospitalizationPagination = useClientPagination(filteredHospitalizations, 10);
  const roomPagination = useClientPagination(filteredRooms, 10);

  const alerts = useMemo(() => {
    if (!stats) return ['Données de capacité indisponibles'];
    const items: string[] = [];
    if (stats.availableRooms === 0) items.push('Aucune chambre disponible');
    if (stats.capacityRate >= 90) items.push('Capacité élevée');
    if (stats.emergencyAdmissions > 0) items.push(`Admissions urgentes : ${stats.emergencyAdmissions}`);
    if (!items.length) items.push('Aucun signalement important');
    return items;
  }, [stats]);

  return (
    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      <PageMeta
        title="Hospitalisations Réception | Aulia Care"
        description="Gérez le flux administratif des hospitalisations depuis la réception."
      />
      <PageBreadcrumb pageTitle="Hospitalisations" />

      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <button onClick={() => setModal('search')} className="rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <div className="mb-2 text-lg">🔍</div>
            Rechercher un patient hospitalisé
          </button>
          <button onClick={() => setRoomFilter('available')} className="rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <div className="mb-2 text-lg">🛏️</div>
            Voir chambres disponibles
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-4">

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Patients hospitalisés</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats?.hospitalized ?? '—'}</p>
            <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              Données temps réel
            </span>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Chambres disponibles</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats?.availableRooms ?? '—'}</p>
            <span className="mt-3 inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-900 dark:text-sky-200">
              Capacité {stats?.capacityRate ?? '—'}%
            </span>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Admissions aujourd'hui</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats?.admissionsToday ?? '—'}</p>
            <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Urgences : {stats?.emergencyAdmissions ?? '—'}
            </span>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Lits libres</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats ? stats.totalBeds - stats.occupiedBeds : '—'}</p>
            <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
              Sur {stats?.totalBeds ?? '—'} lits
            </span>
          </div>
          
        </div>

        {loading ? <p className="text-sm text-slate-500">Actualisation des données hospitalières…</p> : null}
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Flux hospitalisation</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Vue administrative des admissions, services et sorties.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {hospitalizations.length} dossiers actifs
              </span>
            </div>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <input value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} placeholder="Recherche patient, chambre ou service" className="rounded-md border border-gray-300 px-3 py-2 text-sm w-64" />
                <select value={viewFilter} onChange={(e)=>setViewFilter(e.target.value as any)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="all">Tous</option>
                  <option value="admissions">Admissions</option>
                  <option value="discharges">Sorties</option>
                  <option value="services">Services</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={()=>setRoomFilter('all')} className={`px-3 py-1 rounded text-sm ${roomFilter==='all'?'bg-slate-200':'border'}`}>Tous</button>
                <button onClick={()=>setRoomFilter('available')} className={`px-3 py-1 rounded text-sm ${roomFilter==='available'?'bg-emerald-100':'border'}`}>Disponibles</button>
                <button onClick={()=>setRoomFilter('occupied')} className={`px-3 py-1 rounded text-sm ${roomFilter==='occupied'?'bg-red-100':'border'}`}>Occupées</button>
                <button onClick={()=>setRoomFilter('cleaning')} className={`px-3 py-1 rounded text-sm ${roomFilter==='cleaning'?'bg-amber-100':'border'}`}>Nettoyage</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="py-3 px-3">Patient</th>
                    <th className="py-3 px-3">Chambre</th>
                    <th className="py-3 px-3">Service</th>
                    <th className="py-3 px-3">Médecin</th>
                    <th className="py-3 px-3">Date admission</th>
                    <th className="py-3 px-3">Statut</th>
                    <th className="py-3 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {hospitalizationPagination.pageItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-200 dark:border-slate-700">
                      <td className="py-3 px-3 text-slate-900 dark:text-white">{formatPatientName(item.patient)}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{getRoomLabel(item)}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.ServiceUnit?.name || '—'}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{getDoctorName(item)}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.admittedAt ? new Date(item.admittedAt).toLocaleDateString('fr-FR') : '—'}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.status ?? 'ADMITTED'] ?? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>{item.status || 'ADMITTED'}</span>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => handleSelectHospitalization(item.id)}
                          className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Voir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ClientPagination
              page={hospitalizationPagination.page}
              totalItems={filteredHospitalizations.length}
              totalPages={hospitalizationPagination.totalPages}
              onPageChange={hospitalizationPagination.setPage}
              label="hospitalisations"
            />
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">Gestion des chambres</h4>
              <div className="mt-4 space-y-3">
                {roomPagination.pageItems.map((room) => (
                  <div key={room.id} className="flex items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{room.number}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{room.service}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{room.occupiedBeds}/{room.totalBeds}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${roomStatusStyles[room.status] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>{room.status}</span>
                    </div>
                  </div>
                ))}
              </div>
              <ClientPagination
                page={roomPagination.page}
                totalItems={filteredRooms.length}
                totalPages={roomPagination.totalPages}
                onPageChange={roomPagination.setPage}
                label="chambres"
              />
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">Alertes importantes</h4>
              <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {alerts.map((alert) => (
                  <li key={alert} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    {alert}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        {modal === 'search' && (
          <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-24">
            <div className="w-full max-w-4xl rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recherche patient</h3>
                <button onClick={()=>setModal(null)} className="text-sm text-slate-600">Fermer</button>
              </div>
              <input autoFocus value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} placeholder="Tapez nom, téléphone, chambre..." className="mt-3 w-full rounded border px-3 py-2" />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="py-2 px-2">Patient</th>
                      <th className="py-2 px-2">Chambre</th>
                      <th className="py-2 px-2">Service</th>
                      <th className="py-2 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHospitalizations.map((h) => (
                      <tr key={h.id} className="border-t">
                        <td className="py-2 px-2">{formatPatientName(h.patient)}</td>
                        <td className="py-2 px-2">{getRoomLabel(h)}</td>
                        <td className="py-2 px-2">{h.ServiceUnit?.name || '—'}</td>
                        <td className="py-2 px-2"><button onClick={() => { handleSelectHospitalization(h.id); setModal(null); }} className="rounded px-2 py-1 bg-slate-100">Choisir</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}


        {selectedHospitalization && (
          <HospitalizationDetails hospitalization={selectedHospitalization} timeline={timeline} onClose={() => setSelectedHospitalization(null)} />
        )}
      </div>
    </div>
  );
}
