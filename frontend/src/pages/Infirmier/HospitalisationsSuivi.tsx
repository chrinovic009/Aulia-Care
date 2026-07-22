import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { fetchNurseHospitalizations, recordNurseRound } from "../../api/nurse";

type ClinicalState = "Stable" | "Surveillance" | "Critique" | "Isolement";

type Hospitalisation = {
  id: string;
  patientName: string;
  age?: number;
  sex?: "M" | "F" | "Autre";
  avatarUrl?: string;
  room: string;
  bed?: string;
  service: string;
  admittedAt: string; // ISO
  status?: string;
  clinicalState: ClinicalState;
  currentTreatments?: string[];
  nurseInCharge?: string;
  nurseInChargeId?: string;
  notes?: string;
  dischargePlanned?: boolean;
  dischargeStage?: "prêt" | "attente medecin" | "attente paiement" | "attente ordonnance" | null;
  dischargedAt?: string | null;
  access?: { canWrite: boolean; reason: string };
};

const mapHospitalizationRecord = (record: any): Hospitalisation => {
  const patientName = [record.patient?.firstName, record.patient?.lastName].filter(Boolean).join(" ") || "Patient inconnu";
  const admittedAt = record.admittedAt || record.createdAt || new Date().toISOString();
  const room = record.bed?.room?.number || record.bedNumber || "—";
  const bed = record.bed?.code || record.bedNumber || "—";
  const service = record.ServiceUnit?.name || "—";
  const status = record.status || "ADMITTED";
  let clinicalState: ClinicalState = "Stable";

  if (status === "TRANSFERRED") clinicalState = "Surveillance";
  else if (status === "DISCHARGED") clinicalState = "Stable";
  else if (/critique|critical/i.test(record.admissionReason || "")) clinicalState = "Critique";
  else if (/isolement|isolation/i.test(record.admissionReason || "")) clinicalState = "Isolement";
  else clinicalState = "Surveillance";

  const age = record.patient?.dateOfBirth ? Math.floor((Date.now() - new Date(record.patient.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : undefined;
  const sex = record.patient?.gender || "Autre";

  return {
    id: record.id,
    patientName,
    age,
    sex,
    room,
    bed,
    service,
    admittedAt,
    status,
    clinicalState,
    currentTreatments: (record.Consultation || []).flatMap((consultation: any) => (consultation.prescriptions || []).flatMap((prescription: any) => (prescription.lineItems || []).map((line: any) => line.medication?.name || line.dosage).filter(Boolean))).slice(0, 8),
    nurseInCharge: record.nurseInCharge?.displayName || "—",
    nurseInChargeId: record.nurseInCharge?.id,
    notes: record.admissionReason || "Aucune note disponible",
    dischargePlanned: record.status === "DISCHARGED",
    dischargeStage: record.status === "DISCHARGED" ? "prêt" : null,
    dischargedAt: record.dischargedAt || null,
    access: record.access,
  };
};

export default function HospitalisationsSuivi() {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<Hospitalisation[]>([]);
  const [query, setQuery] = useState("");
  const [filterState, setFilterState] = useState<ClinicalState | "Tous">("Tous");
  const [viewMode, setViewMode] = useState<"cards" | "rooms">("cards");
  const [selected, setSelected] = useState<Hospitalisation | null>(null);
  const [panelMode, setPanelMode] = useState<"dossier" | "historique" | "observation" | "transfer" | "discharge">("dossier");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [observationText, setObservationText] = useState("");
  const [transferRoom, setTransferRoom] = useState("");
  const [transferBed, setTransferBed] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [dischargeStageSel, setDischargeStageSel] = useState<Hospitalisation['dischargeStage']>(null);
  const [dischargeNote, setDischargeNote] = useState("");

  useTheme();

  const loadHospitalizations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const records = await fetchNurseHospitalizations();
      setItems(records.map(mapHospitalizationRecord));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les hospitalisations.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadHospitalizations();
    const interval = window.setInterval(() => void loadHospitalizations(), 30_000);
    const refresh = () => void loadHospitalizations();
    window.addEventListener("d7:hospitalization.updated", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("d7:hospitalization.updated", refresh);
    };
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const bedsOccupied = items.filter((i) => !!i.room).length;
    const critical = items.filter((i) => i.clinicalState === "Critique").length;
    const stable = items.filter((i) => i.clinicalState === "Stable").length;
    const discharges = items.filter((i) => i.dischargePlanned).length;
    return { total, bedsOccupied, critical, stable, discharges };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filterState !== "Tous" && i.clinicalState !== filterState) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return [i.patientName, i.room, i.service, i.nurseInCharge].some((s) => (s || "").toLowerCase().includes(q));
    });
  }, [items, filterState, query]);

  const byRooms = useMemo(() => {
    const map = new Map<string, Hospitalisation[]>();
    items.forEach((i) => {
      const r = i.room || "—";
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(i);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const formatDuration = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / (24 * 3600 * 1000));
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return "Hier";
    return `Admis il y a ${days} jours`;
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const submitObservation = async () => {
    if (!selected || !observationText) return;
    try {
      await recordNurseRound(selected.id, { action: "observation", observation: observationText });
      setObservationText("");
      setPanelMode("dossier");
      await loadHospitalizations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer l'observation.");
    }
  };

  const submitTransfer = () => {
    if (!selected || !transferRoom) return;
    setItems((prev) =>
      prev.map((p) =>
        p.id === selected.id
          ? {
              ...p,
              room: transferRoom,
              bed: transferBed,
              notes: (p.notes ? p.notes + "\n" : "") + `Transfert: ${transferReason || "sans raison"}`,
            }
          : p,
      ),
    );
    setTransferRoom("");
    setTransferBed("");
    setTransferReason("");
    setPanelMode("dossier");
  };

  const submitDischarge = () => {
    if (!selected) return;
    setItems((prev) =>
      prev.map((p) =>
        p.id === selected.id
          ? {
              ...p,
              dischargePlanned: true,
              dischargeStage: dischargeStageSel,
              notes: (p.notes ? p.notes + "\n" : "") + (dischargeNote || ""),
            }
          : p,
      ),
    );
    setDischargeStageSel(null);
    setDischargeNote("");
    setPanelMode("dossier");
  };

  const [dischargeModalOpen, setDischargeModalOpen] = useState(false);
  const [modalDischarge, setModalDischarge] = useState<Hospitalisation | null>(null);

  const openDischargeModal = (h: Hospitalisation) => {
    setModalDischarge(h);
    setDischargeModalOpen(true);
  };

  const finalizeDischarge = (id: string) => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, dischargedAt: now, dischargePlanned: false } : p)));
    if (modalDischarge && modalDischarge.id === id) {
      setModalDischarge((prev) => (prev ? { ...prev, dischargedAt: now, dischargePlanned: false } : prev));
      setDischargeModalOpen(false);
    }
  };

  const formatSince = (iso?: string | null) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `Sortie depuis ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Sortie depuis ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Sortie depuis ${days} j`;
  };

  const canEditSelected = selected ? currentUser?.primaryRole === "ADMIN" || currentUser?.primaryRole === "SUPER_ADMIN" || Boolean(selected.access?.canWrite) : false;

  return (
    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      <PageMeta title="Hospitalisations suivies | D7 Clinique" description="Vue de supervision des hospitalisations pour l'infirmière" />
      <PageBreadcrumb pageTitle="Hospitalisations suivies" />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-3xl border bg-white p-4">
          <p className="text-xs text-slate-500">Hospitalisés</p>
          <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-3xl border bg-white p-4">
          <p className="text-xs text-slate-500">Lits occupés</p>
          <p className="mt-2 text-2xl font-semibold">{stats.bedsOccupied}</p>
        </div>
        <div className="rounded-3xl border bg-white p-4">
          <p className="text-xs text-slate-500">Critiques</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{stats.critical}</p>
        </div>
        <div className="rounded-3xl border bg-white p-4">
          <p className="text-xs text-slate-500">Stables</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">{stats.stable}</p>
        </div>
        <div className="rounded-3xl border bg-white p-4">
          <p className="text-xs text-slate-500">Sorties prévues</p>
          <p className="mt-2 text-2xl font-semibold text-amber-700">{stats.discharges}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <input
          placeholder="Rechercher patient, chambre, service, infirmier"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white lg:w-1/2"
        />
        <select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value as any)}
          className="rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        >
          <option value="Tous">Tous</option>
          <option value="Stable">Stable</option>
          <option value="Surveillance">Surveillance</option>
          <option value="Critique">Critique</option>
          <option value="Isolement">Isolement</option>
        </select>
        <div className="rounded-2xl border px-3 py-2 bg-white dark:bg-slate-900">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" checked={viewMode === "cards"} onChange={() => setViewMode("cards")} />
            <span>Cartes</span>
          </label>
          <label className="inline-flex items-center gap-2 ml-3 text-sm">
            <input type="radio" checked={viewMode === "rooms"} onChange={() => setViewMode("rooms")} />
            <span>Par chambre</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div>
          {isLoading ? (
            <div className="rounded-3xl border bg-white p-6 text-center text-slate-500">Chargement des hospitalisations...</div>
          ) : viewMode === "cards" ? (
            <div className="space-y-4">
              {filtered.length === 0 ? (
                <div className="rounded-2xl p-6 bg-white">Aucune hospitalisation trouvée.</div>
              ) : (
                filtered.map((h) => (
                  <div key={h.id} className="rounded-2xl border bg-white p-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-800">{getInitials(h.patientName)}</div>
                      <div>
                        <div className="font-semibold">{h.patientName} <span className="text-sm text-slate-500">{h.age ? `· ${h.age} ans` : ''} {h.sex ? `· ${h.sex}` : ''}</span></div>
                        <div className="text-xs text-slate-500">{h.service} · Chambre {h.room} · Lit {h.bed || '—'}</div>
                      </div>
                    </div>
                    <div className="space-y-3 sm:flex-1">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Statut clinique</p>
                          <p className="mt-1 font-semibold text-slate-900">{h.clinicalState}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Infirmier en charge</p>
                          <p className="mt-1 font-semibold text-slate-900">{h.nurseInCharge}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Admis</p>
                          <p className="mt-1 font-semibold text-slate-900">{formatDuration(h.admittedAt)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => { setSelected(h); setPanelMode("dossier"); }} className="rounded-2xl border px-3 py-2 text-sm">Voir dossier</button>
                        <button onClick={() => { setSelected(h); setPanelMode("historique"); }} className="rounded-2xl border px-3 py-2 text-sm">Historique</button>
                        <button
                          disabled={!currentUser || (currentUser.primaryRole !== 'ADMIN' && currentUser.primaryRole !== 'SUPER_ADMIN' && currentUser.id !== h.nurseInChargeId)}
                          onClick={() => { setSelected(h); setPanelMode("observation"); setObservationText(""); }}
                          className={`rounded-2xl border px-3 py-2 text-sm ${!currentUser || (currentUser.primaryRole !== 'ADMIN' && currentUser.primaryRole !== 'SUPER_ADMIN' && currentUser.id !== h.nurseInChargeId) ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          Ajouter observation
                        </button>
                        <button
                          disabled={!currentUser || (currentUser.primaryRole !== 'ADMIN' && currentUser.primaryRole !== 'SUPER_ADMIN' && currentUser.id !== h.nurseInChargeId)}
                          onClick={() => { setSelected(h); setPanelMode("transfer"); setTransferRoom(h.room || ""); setTransferBed(h.bed || ""); }}
                          className={`rounded-2xl border px-3 py-2 text-sm ${!currentUser || (currentUser.primaryRole !== 'ADMIN' && currentUser.primaryRole !== 'SUPER_ADMIN' && currentUser.id !== h.nurseInChargeId) ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          Transférer
                        </button>
                        <button
                          disabled={!currentUser || (currentUser.primaryRole !== 'ADMIN' && currentUser.primaryRole !== 'SUPER_ADMIN' && currentUser.id !== h.nurseInChargeId)}
                          onClick={() => { setSelected(h); setPanelMode("discharge"); setDischargeStageSel(h.dischargeStage || 'prêt'); }}
                          className={`rounded-2xl border px-3 py-2 text-sm ${!currentUser || (currentUser.primaryRole !== 'ADMIN' && currentUser.primaryRole !== 'SUPER_ADMIN' && currentUser.id !== h.nurseInChargeId) ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          Préparer sortie
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {byRooms.map(([room, list]) => (
                <div key={room} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Chambre {room}</div>
                    <div className="text-sm text-slate-500">{list.length} occupé{list.length > 1 ? 's' : ''}</div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {list.map((h) => (
                      <div key={h.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-800">{getInitials(h.patientName)}</div>
                          <div>
                            <div className="font-semibold">{h.patientName}</div>
                            <div className="text-xs text-slate-500">{h.currentTreatments?.length ? h.currentTreatments.join(' · ') : '—'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setSelected(h); setPanelMode("dossier"); }} className="rounded-2xl border px-3 py-1 text-sm">Voir</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="rounded-3xl border bg-white p-4">
            {!selected ? (
              <div className="text-slate-500">Sélectionnez une hospitalisation pour voir le détail.</div>
            ) : (
              <div>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Patient</p>
                    <h3 className="mt-1 text-xl font-semibold">{selected.patientName}</h3>
                    <p className="text-sm text-slate-500">Chambre {selected.room} · Lit {selected.bed || '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Nurse</p>
                    <p className="font-semibold">{selected.nurseInCharge}</p>
                  </div>
                </div>

                {!canEditSelected && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 mb-4">
                    Accès en lecture seule. Vous n'êtes pas l'infirmière en charge de cette hospitalisation.
                  </div>
                )}

                <div className="grid gap-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Statut clinique</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{selected.clinicalState}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Service</p>
                    <p className="mt-2 font-semibold text-slate-900">{selected.service}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Admis</p>
                    <p className="mt-2 font-semibold text-slate-900">{formatDuration(selected.admittedAt)}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500">Actions</p>
                      <p className="mt-1 text-sm text-slate-700">Modifications réservées au personnel en charge.</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => setPanelMode("dossier")}
                      className="rounded-2xl border px-3 py-2 text-sm"
                    >
                      Retour
                    </button>
                    <button
                      onClick={() => setPanelMode("historique")}
                      className="rounded-2xl border px-3 py-2 text-sm"
                    >
                      Historique
                    </button>
                    <button
                      onClick={() => setPanelMode("observation")}
                      disabled={!canEditSelected}
                      className={`rounded-2xl border px-3 py-2 text-sm ${!canEditSelected ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      Ajouter observation
                    </button>
                    <button
                      onClick={() => {
                        setPanelMode("transfer");
                        setTransferRoom(selected.room || "");
                        setTransferBed(selected.bed || "");
                      }}
                      disabled={!canEditSelected}
                      className={`rounded-2xl border px-3 py-2 text-sm ${!canEditSelected ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      Transférer
                    </button>
                    <button
                      onClick={() => {
                        setPanelMode("discharge");
                        setDischargeStageSel(selected.dischargeStage || 'prêt');
                      }}
                      disabled={!canEditSelected}
                      className={`rounded-2xl border px-3 py-2 text-sm ${!canEditSelected ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      Préparer sortie
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border bg-white p-4">
                  {panelMode === "dossier" && (
                    <div>
                      <p className="text-xs text-slate-500">Résumé rapide</p>
                      <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{selected.notes || 'Aucune observation historique'}</div>
                    </div>
                  )}

                  {panelMode === "historique" && (
                    <div>
                      <p className="text-xs text-slate-500">Historique rapide</p>
                      <div className="mt-2 max-h-40 overflow-auto text-sm text-slate-700 whitespace-pre-wrap">{selected.notes || 'Aucune observation historique'}</div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => setPanelMode('dossier')} className="rounded-2xl border px-3 py-2">Retour</button>
                      </div>
                    </div>
                  )}

                  {panelMode === "observation" && (
                    <div>
                      <p className="text-xs text-slate-500">Ajouter observation rapide</p>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {['Patient stable', 'Douleur modérée', 'Risque infection'].map((s) => (
                          <button key={s} onClick={() => setObservationText(s)} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{s}</button>
                        ))}
                      </div>
                      <textarea value={observationText} onChange={(e) => setObservationText(e.target.value)} rows={4} className="w-full mt-2 rounded-2xl border p-3" />
                      <div className="mt-3 flex gap-2">
                        <button onClick={submitObservation} className="flex-1 rounded-2xl bg-slate-900 text-white px-3 py-2">Enregistrer</button>
                        <button onClick={() => setPanelMode('dossier')} className="flex-1 rounded-2xl border px-3 py-2">Annuler</button>
                      </div>
                    </div>
                  )}

                  {panelMode === "transfer" && (
                    <div>
                      <p className="text-xs text-slate-500">Transfert de patient</p>
                      <div className="mt-2">
                        <label className="text-xs">Nouvelle chambre</label>
                        <input value={transferRoom} onChange={(e) => setTransferRoom(e.target.value)} className="w-full rounded-2xl border px-3 py-2 mt-1" />
                      </div>
                      <div className="mt-2">
                        <label className="text-xs">Lit</label>
                        <input value={transferBed} onChange={(e) => setTransferBed(e.target.value)} className="w-full rounded-2xl border px-3 py-2 mt-1" />
                      </div>
                      <div className="mt-2">
                        <label className="text-xs">Raison</label>
                        <input value={transferReason} onChange={(e) => setTransferReason(e.target.value)} className="w-full rounded-2xl border px-3 py-2 mt-1" />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={submitTransfer} className="flex-1 rounded-2xl bg-slate-900 text-white px-3 py-2">Transférer</button>
                        <button onClick={() => setPanelMode('dossier')} className="flex-1 rounded-2xl border px-3 py-2">Annuler</button>
                      </div>
                    </div>
                  )}

                  {panelMode === "discharge" && (
                    <div>
                      <p className="text-xs text-slate-500">Préparer sortie</p>
                      <div className="mt-2">
                        <label className="text-xs">Étape</label>
                        <select value={dischargeStageSel || ''} onChange={(e) => setDischargeStageSel(e.target.value as any)} className="w-full rounded-2xl border px-3 py-2 mt-1">
                          <option value="prêt">prêt</option>
                          <option value="attente medecin">attente medecin</option>
                          <option value="attente paiement">attente paiement</option>
                          <option value="attente ordonnance">attente ordonnance</option>
                        </select>
                      </div>
                      <div className="mt-2">
                        <label className="text-xs">Note</label>
                        <input value={dischargeNote} onChange={(e) => setDischargeNote(e.target.value)} className="w-full rounded-2xl border px-3 py-2 mt-1" />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={submitDischarge} className="flex-1 rounded-2xl bg-amber-600 text-white px-3 py-2">Planifier sortie</button>
                        <button onClick={() => setPanelMode('dossier')} className="flex-1 rounded-2xl border px-3 py-2">Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {dischargeModalOpen && modalDischarge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500">Sortie prévue</p>
                <h3 className="mt-1 text-lg font-semibold">{modalDischarge.patientName}</h3>
                <p className="text-sm text-slate-500">{modalDischarge.service} · Chambre {modalDischarge.room}</p>
              </div>
              <button onClick={() => setDischargeModalOpen(false)} className="rounded-2xl border px-3 py-2">Fermer</button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div>
                <p className="text-xs text-slate-500">Étape</p>
                <div className="font-semibold">{modalDischarge.dischargeStage || 'prêt'}</div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Notes</p>
                <div className="mt-1 whitespace-pre-wrap">{modalDischarge.notes || '—'}</div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={() => finalizeDischarge(modalDischarge.id)} className="flex-1 rounded-2xl bg-amber-600 text-white px-4 py-2">Finaliser</button>
              <button onClick={() => setDischargeModalOpen(false)} className="flex-1 rounded-2xl border px-4 py-2">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
