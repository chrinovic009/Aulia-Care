import { useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useTheme } from "../../context/ThemeContext";

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
  clinicalState: ClinicalState;
  currentTreatments?: string[];
  nurseInCharge?: string;
  notes?: string;
  dischargePlanned?: boolean;
  dischargeStage?: "prêt" | "attente medecin" | "attente paiement" | "attente ordonnance" | null;
  dischargedAt?: string | null;
};

const sample: Hospitalisation[] = [
  { id: "H-001", patientName: "Marie K.", age: 54, sex: "F", room: "12", bed: "A", service: "Cardio", admittedAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(), clinicalState: "Surveillance", currentTreatments: ["Perfusion"], nurseInCharge: "Infirmière A", notes: "Suivi tension", dischargePlanned: false, dischargeStage: null },
  { id: "H-002", patientName: "Luc D.", age: 68, sex: "M", room: "7", bed: "B", service: "Chirurgie", admittedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(), clinicalState: "Stable", currentTreatments: ["Antibiothérapie"], nurseInCharge: "Infirmière B", notes: "Post-op J2", dischargePlanned: true, dischargeStage: "prêt" },
  { id: "H-003", patientName: "Paul M.", age: 44, sex: "M", room: "3", bed: "A", service: "Réanimation", admittedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(), clinicalState: "Critique", currentTreatments: ["Ventilation", "Vasopresseur"], nurseInCharge: "Infirmière C", notes: "Instable", dischargePlanned: false, dischargeStage: null },
];

export default function HospitalisationsSuivi() {
  const [items, setItems] = useState<Hospitalisation[]>(sample);
  const [query, setQuery] = useState("");
  const [filterState, setFilterState] = useState<ClinicalState | "Tous">("Tous");
  const [viewMode, setViewMode] = useState<"cards" | "rooms">("cards");
  const [selected, setSelected] = useState<Hospitalisation | null>(null);
  const [panelMode, setPanelMode] = useState<"dossier" | "historique" | "observation" | "transfer" | "discharge">("dossier");

  // Form states for inline forms
  const [observationText, setObservationText] = useState("");
  const [transferRoom, setTransferRoom] = useState("");
  const [transferBed, setTransferBed] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [dischargeStageSel, setDischargeStageSel] = useState<Hospitalisation['dischargeStage']>(null);
  const [dischargeNote, setDischargeNote] = useState("");
  useTheme();

  const stats = useMemo(() => {
    const total = items.length;
    const bedsOccupied = items.filter(i => !!i.room).length;
    const critical = items.filter(i => i.clinicalState === "Critique").length;
    const stable = items.filter(i => i.clinicalState === "Stable").length;
    const discharges = items.filter(i => i.dischargePlanned).length;
    return { total, bedsOccupied, critical, stable, discharges };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterState !== "Tous" && i.clinicalState !== filterState) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return [i.patientName, i.room, i.service, i.nurseInCharge].some(s => (s || "").toLowerCase().includes(q));
    });
  }, [items, filterState, query]);

  const byRooms = useMemo(() => {
    const map = new Map<string, Hospitalisation[]>();
    items.forEach(i => {
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

  const submitObservation = () => {
    if (!selected || !observationText) return;
    setItems(prev => prev.map(p => p.id === selected.id ? { ...p, notes: (p.notes ? p.notes + '\n' : '') + observationText } : p));
    setObservationText("");
    setPanelMode('dossier');
  };

  const submitTransfer = () => {
    if (!selected || !transferRoom) return;
    setItems(prev => prev.map(p => p.id === selected.id ? { ...p, room: transferRoom, bed: transferBed, notes: (p.notes ? p.notes + '\n' : '') + `Transfert: ${transferReason || 'sans raison'}` } : p));
    setTransferRoom(""); setTransferBed(""); setTransferReason("");
    setPanelMode('dossier');
  };

  const submitDischarge = () => {
    if (!selected) return;
    setItems(prev => prev.map(p => p.id === selected.id ? { ...p, dischargePlanned: true, dischargeStage: dischargeStageSel, notes: (p.notes ? p.notes + '\n' : '') + (dischargeNote || '') } : p));
    setDischargeStageSel(null); setDischargeNote("");
    setPanelMode('dossier');
  };

  const [dischargeModalOpen, setDischargeModalOpen] = useState(false);
  const [modalDischarge, setModalDischarge] = useState<Hospitalisation | null>(null);

  const openDischargeModal = (h: Hospitalisation) => {
    setModalDischarge(h);
    setDischargeModalOpen(true);
  };

  const finalizeDischarge = (id: string) => {
    const now = new Date().toISOString();
    setItems(prev => prev.map(p => p.id === id ? { ...p, dischargedAt: now, dischargePlanned: false } : p));
    if (modalDischarge && modalDischarge.id === id) {
      setModalDischarge(prev => prev ? { ...prev, dischargedAt: now, dischargePlanned: false } : prev);
      setDischargeModalOpen(false);
    }
  };

  const formatSince = (iso?: string | null) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `Sortie depuis ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Sortie depuis ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Sortie depuis ${days} j`;
  };

  return (
    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      <PageMeta title="Hospitalisations suivies | D7 Clinique" description="Vue de supervision des hospitalisations pour l'infirmière" />
      <PageBreadcrumb pageTitle="Hospitalisations suivies" />

      {/* Summary cards */}
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

      {/* Controls */}
      <div className="mt-6 flex items-center gap-3">
        <input placeholder="Rechercher patient, chambre, service, infirmier" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 rounded-2xl border px-4 py-2" />
        <select value={filterState} onChange={(e) => setFilterState(e.target.value as any)} className="rounded-2xl border px-3 py-2">
          <option value="Tous">Tous</option>
          <option value="Stable">Stable</option>
          <option value="Surveillance">Surveillance</option>
          <option value="Critique">Critique</option>
          <option value="Isolement">Isolement</option>
        </select>
        <div className="rounded-2xl border px-3 py-2">
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={viewMode === 'cards'} onChange={() => setViewMode('cards')} />
            <span className="text-sm">Cartes</span>
          </label>
          <label className="inline-flex items-center gap-2 ml-3">
            <input type="radio" checked={viewMode === 'rooms'} onChange={() => setViewMode('rooms')} />
            <span className="text-sm">Par chambre</span>
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* Left: main list / rooms */}
        <div>
          {viewMode === 'cards' && (
            <div className="space-y-4">
              {filtered.length === 0 && <div className="rounded-2xl p-6 bg-white">Aucune hospitalisation trouvée.</div>}
              {filtered.map(h => (
                <div key={h.id} className="rounded-2xl border bg-white p-4 flex items-start gap-4">
                  <div className="w-14 shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-800">{getInitials(h.patientName)}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{h.patientName} <span className="text-sm text-slate-500">{h.age ? `· ${h.age} ans` : ''} {h.sex ? `· ${h.sex}` : ''}</span></div>
                        <div className="text-xs text-slate-500">{h.service} · Chambre {h.room} · Lit {h.bed || '—'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-500">{formatDuration(h.admittedAt)}</div>
                        <div className="mt-1 inline-flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${h.clinicalState === 'Critique' ? 'bg-red-100 text-red-700' : h.clinicalState === 'Surveillance' ? 'bg-amber-100 text-amber-700' : h.clinicalState === 'Isolement' ? 'bg-slate-100 text-slate-800' : 'bg-emerald-100 text-emerald-700'}`}>{h.clinicalState}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-4">
                      <div className="text-sm text-slate-600">
                        <div className="font-semibold">Traitements</div>
                        <div className="mt-1 text-xs">{h.currentTreatments && h.currentTreatments.length ? h.currentTreatments.join(' · ') : '—'}</div>
                      </div>

                      <div className="text-sm text-slate-600">
                        <div className="font-semibold">Infirmier</div>
                        <div className="mt-1 text-xs">{h.nurseInCharge || '—'}</div>
                      </div>

                        <div className="flex gap-2">
                        <button onClick={() => { setSelected(h); setPanelMode('dossier'); }} className="rounded-2xl border px-3 py-2 text-sm">Voir dossier</button>
                        <button onClick={() => { setSelected(h); setPanelMode('historique'); }} className="rounded-2xl border px-3 py-2 text-sm">Historique</button>
                        <button onClick={() => { setSelected(h); setPanelMode('observation'); setObservationText(''); }} className="rounded-2xl border px-3 py-2 text-sm">Ajouter observation</button>
                        <button onClick={() => { setSelected(h); setPanelMode('transfer'); setTransferRoom(h.room || ''); setTransferBed(h.bed || ''); }} className="rounded-2xl border px-3 py-2 text-sm">Transférer</button>
                        <button onClick={() => { setSelected(h); setPanelMode('discharge'); setDischargeStageSel(h.dischargeStage || 'prêt'); }} className="rounded-2xl border px-3 py-2 text-sm">Préparer sortie</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'rooms' && (
            <div className="space-y-4">
              {byRooms.map(([room, list]) => (
                <div key={room} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Chambre {room}</div>
                    <div className="text-sm text-slate-500">{list.length} occupé{list.length>1?'s':''}</div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {list.map(h => (
                      <div key={h.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-800">{getInitials(h.patientName)}</div>
                          <div>
                            <div className="font-semibold">{h.patientName}</div>
                            <div className="text-xs text-slate-500">{h.currentTreatments && h.currentTreatments.length ? h.currentTreatments.join(' · ') : '—'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${h.clinicalState === 'Critique' ? 'bg-red-100 text-red-700' : h.clinicalState === 'Surveillance' ? 'bg-amber-100 text-amber-700' : h.clinicalState === 'Isolement' ? 'bg-slate-100 text-slate-800' : 'bg-emerald-100 text-emerald-700'}`}>{h.clinicalState}</span>
                          <button onClick={() => { setSelected(h); setPanelMode('dossier'); }} className="rounded-2xl border px-3 py-1 text-sm">Détails</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: detail / discharges */}
        <div>
          <div className="rounded-3xl border bg-white p-4">
            {!selected && <div className="text-slate-500">Sélectionnez une hospitalisation pour voir les détails.</div>}
            {selected && (
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Patient</p>
                    <h3 className="mt-1 text-lg font-semibold">{selected.patientName}</h3>
                    <p className="text-sm text-slate-500">{selected.service} · Chambre {selected.room} · Lit {selected.bed || '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Admis</p>
                    <p className="font-semibold">{formatDuration(selected.admittedAt)}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {panelMode === 'dossier' && (
                    <>
                      <div>
                        <p className="text-xs text-slate-500">État clinique</p>
                        <div className="mt-1 font-semibold">{selected.clinicalState}</div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Traitements en cours</p>
                        <div className="mt-1 text-sm">{selected.currentTreatments && selected.currentTreatments.length ? selected.currentTreatments.join(', ') : '—'}</div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Infirmier responsable</p>
                        <div className="mt-1 text-sm">{selected.nurseInCharge || '—'}</div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button onClick={() => setPanelMode('dossier')} className="flex-1 rounded-2xl border px-3 py-2">Voir dossier</button>
                        <button onClick={() => setPanelMode('historique')} className="flex-1 rounded-2xl border px-3 py-2">Historique</button>
                        <button onClick={() => { setPanelMode('observation'); setObservationText(''); }} className="flex-1 rounded-2xl border px-3 py-2">Ajouter observation</button>
                      </div>
                      <div className="mt-3 text-sm whitespace-pre-wrap text-slate-700">
                        <p className="text-xs text-slate-500">Notes</p>
                        <div className="mt-1">{selected.notes || '—'}</div>
                      </div>
                    </>
                  )}

                  {panelMode === 'historique' && (
                    <div>
                      <p className="text-xs text-slate-500">Historique rapide</p>
                      <div className="mt-2 max-h-40 overflow-auto text-sm text-slate-700 whitespace-pre-wrap">{selected.notes || 'Aucune observation historique'}</div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => setPanelMode('dossier')} className="rounded-2xl border px-3 py-2">Retour</button>
                      </div>
                    </div>
                  )}

                  {panelMode === 'observation' && (
                    <div>
                      <p className="text-xs text-slate-500">Ajouter observation rapide</p>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {['Patient stable','Douleur modérée','Risque infection'].map(s => (
                          <button key={s} onClick={() => setObservationText(s)} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{s}</button>
                        ))}
                      </div>
                      <textarea value={observationText} onChange={e=>setObservationText(e.target.value)} rows={4} className="w-full mt-2 rounded-2xl border p-3" />
                      <div className="mt-3 flex gap-2">
                        <button onClick={submitObservation} className="flex-1 rounded-2xl bg-slate-900 text-white px-3 py-2">Enregistrer</button>
                        <button onClick={() => setPanelMode('dossier')} className="flex-1 rounded-2xl border px-3 py-2">Annuler</button>
                      </div>
                    </div>
                  )}

                  {panelMode === 'transfer' && (
                    <div>
                      <p className="text-xs text-slate-500">Transfert de patient</p>
                      <div className="mt-2">
                        <label className="text-xs">Nouvelle chambre</label>
                        <input value={transferRoom} onChange={e=>setTransferRoom(e.target.value)} className="w-full rounded-2xl border px-3 py-2 mt-1" />
                      </div>
                      <div className="mt-2">
                        <label className="text-xs">Lit</label>
                        <input value={transferBed} onChange={e=>setTransferBed(e.target.value)} className="w-full rounded-2xl border px-3 py-2 mt-1" />
                      </div>
                      <div className="mt-2">
                        <label className="text-xs">Raison</label>
                        <input value={transferReason} onChange={e=>setTransferReason(e.target.value)} className="w-full rounded-2xl border px-3 py-2 mt-1" />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={submitTransfer} className="flex-1 rounded-2xl bg-slate-900 text-white px-3 py-2">Transférer</button>
                        <button onClick={() => setPanelMode('dossier')} className="flex-1 rounded-2xl border px-3 py-2">Annuler</button>
                      </div>
                    </div>
                  )}

                  {panelMode === 'discharge' && (
                    <div>
                      <p className="text-xs text-slate-500">Préparer sortie</p>
                      <div className="mt-2">
                        <label className="text-xs">Étape</label>
                        <select value={dischargeStageSel || ''} onChange={e=>setDischargeStageSel(e.target.value as any)} className="w-full rounded-2xl border px-3 py-2 mt-1">
                          <option value="prêt">prêt</option>
                          <option value="attente medecin">attente medecin</option>
                          <option value="attente paiement">attente paiement</option>
                          <option value="attente ordonnance">attente ordonnance</option>
                        </select>
                      </div>
                      <div className="mt-2">
                        <label className="text-xs">Note</label>
                        <input value={dischargeNote} onChange={e=>setDischargeNote(e.target.value)} className="w-full rounded-2xl border px-3 py-2 mt-1" />
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

          <div className="mt-4 rounded-3xl border bg-white p-4">
            <p className="text-sm font-semibold">Sorties prévues</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {items.filter(i => i.dischargePlanned).length === 0 && <div className="text-slate-500">Aucune sortie prévue</div>}
              {items.filter(i => i.dischargePlanned).map(i => (
                <div key={i.id} className="rounded-lg bg-slate-50 p-2 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{i.patientName}</div>
                    <div className="text-xs text-slate-500">{i.dischargeStage || 'prêt'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openDischargeModal(i)} className="rounded-2xl border px-3 py-1 text-sm">Vérifier</button>
                    {!i.dischargedAt ? (
                      <button onClick={() => finalizeDischarge(i.id)} className="rounded-2xl border px-3 py-1 text-sm">Finaliser</button>
                    ) : (
                      <div className="text-sm text-slate-600">{formatSince(i.dischargedAt)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
      
      {/* Discharge verify modal */}
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
