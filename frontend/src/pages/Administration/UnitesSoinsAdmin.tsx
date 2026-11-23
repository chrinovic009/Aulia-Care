import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";
import {
  adminCreateUnit, adminListUnits, adminUnitAssignments, adminUpdateUnit, adminUpsertAssignment, KIND_LABELS, PRIORITY_LABELS,
  type CarePriority, type CareUnit, type CareUnitKind, type CareUnitRole, type TriageLevel, type UnitAssignment, type UnitSettings,
} from "../../api/careWorkflow";
import { DEFAULT_TRIAGE_SCALE } from "../Unites/urgences/emergencySettings";
import { AMBULANCE_DEFAULT_SETTINGS } from "../Unites/ambulance/AmbulanceModule";
import { MATERNITY_DEFAULT_SETTINGS } from "../Unites/maternite/MaterniteModule";
import { SURGERY_DEFAULT_SETTINGS } from "../Unites/chirurgie/ChirurgieModule";
import { DIALYSIS_DEFAULT_SETTINGS } from "../Unites/dialyse/DialyseModule";
import { Badge, Button, Card, Empty, Field, inputClass } from "../Unites/ui";

type StaffUser = { id: string; firstName: string; lastName: string; primaryRole?: string; status?: string };
const STAFF_ROLES = ["NURSE", "PHYSICIAN", "SURGEON", "ANESTHESIOLOGIST", "MIDWIFE", "PARAMEDIC", "DISPATCHER", "RECEPTIONIST", "LAB_TECHNICIAN", "LAB_MANAGER", "RADIOLOGIST", "PHARMACIST"];
const ROLE_LABELS: Record<CareUnitRole, string> = { LEAD: "Responsable", MEMBER: "Membre", READ_ONLY: "Consultation seule" };

/** Default settings proposed when a unit is created; everything stays editable. */
const defaultSettings = (kind: CareUnitKind): UnitSettings => kind === "EMERGENCY"
  ? {
    stages: ["ARRIVAL", "WAITING", "IN_CARE", "DISPOSITION"],
    triageScale: DEFAULT_TRIAGE_SCALE, triageScaleValidated: false,
    locations: ["Box 1", "Box 2", "Box 3", "Déchocage", "Fauteuil 1"],
    closureRequirements: [{ eventType: "ORIENTATION", label: "Décision d’orientation" }],
  }
  : kind === "AMBULANCE" ? { ...AMBULANCE_DEFAULT_SETTINGS, locations: [] }
  : kind === "SURGERY" ? { ...SURGERY_DEFAULT_SETTINGS, locations: [] }
  : kind === "DIALYSIS" ? { ...DIALYSIS_DEFAULT_SETTINGS, locations: ["Poste 1", "Poste 2", "Poste 3", "Poste 4"] }
  : kind === "MATERNITY" ? { ...MATERNITY_DEFAULT_SETTINGS, locations: ["Salle de pré-travail", "Salle d’accouchement 1", "Chambre 1"] }
  : {};

export default function UnitesSoinsAdmin() {
  const [units, setUnits] = useState<Array<CareUnit & { _count?: { assignments: number } }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState({ kind: "EMERGENCY" as CareUnitKind, code: "", name: "" });
  const load = () => adminListUnits().then(setUnits).catch(() => setUnits([]));
  useEffect(() => { void load(); }, []);
  const create = async () => {
    try {
      const unit = await adminCreateUnit({ kind: draft.kind, code: draft.code.trim().toUpperCase(), name: draft.name.trim(), settings: defaultSettings(draft.kind) });
      setDraft({ kind: "EMERGENCY", code: "", name: "" });
      await load();
      setSelected(unit.id);
    } catch { /* reported globally */ }
  };
  const unit = units.find((item) => item.id === selected) ?? null;
  return (
    <>
      <PageMeta title="Unités de soins | Aulia Care" description="Unités de soins, protocoles et affectations du personnel" />
      <PageBreadcrumb pageTitle="Unités de soins" />
      <div className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <Card title="Nouvelle unité">
            <div className="grid gap-2">
              <Field label="Type">
                <select className={inputClass} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as CareUnitKind })}>
                  {(Object.keys(KIND_LABELS) as CareUnitKind[]).map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
                </select>
              </Field>
              <Field label="Code"><input className={inputClass} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} placeholder="URG" /></Field>
              <Field label="Nom"><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Urgences adultes" /></Field>
              <Button disabled={!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(draft.code) || draft.name.trim().length < 2} onClick={() => void create()}>Créer l’unité</Button>
            </div>
          </Card>
          <Card title="Unités de l’établissement">
            {!units.length ? <Empty>Aucune unité.</Empty> : (
              <ul className="space-y-1">
                {units.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => setSelected(item.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selected === item.id ? "bg-aulia-mist dark:bg-aulia-teal/10" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}>
                      <span><strong>{item.name}</strong> <span className="text-xs text-slate-500">{item.code} · {KIND_LABELS[item.kind]}</span></span>
                      <span className="flex gap-1">{item.active === false && <Badge tone="red">inactive</Badge>}<Badge>{item._count?.assignments ?? 0} pers.</Badge></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        {unit ? <UnitEditor key={unit.id} unit={unit} onSaved={() => void load()} /> : <Empty>Choisissez une unité pour régler son fonctionnement et affecter le personnel.</Empty>}
      </div>
    </>
  );
}

function UnitEditor({ unit, onSaved }: { unit: CareUnit; onSaved: () => void }) {
  const settings = unit.settings ?? {};
  const [name, setName] = useState(unit.name);
  const [locations, setLocations] = useState((settings.locations ?? []).join("\n"));
  const [billingPolicy, setBillingPolicy] = useState(String(settings.billingPolicy ?? "BILL_AFTER"));
  const [scale, setScale] = useState<TriageLevel[]>(settings.triageScale ?? []);
  const validated = Boolean(settings.triageScaleValidated);
  const save = async (patch: Partial<UnitSettings> & { active?: boolean }) => {
    const { active, ...rest } = patch;
    try {
      await adminUpdateUnit(unit.id, {
        name: name.trim(), ...(active !== undefined ? { active } : {}),
        settings: { ...settings, billingPolicy, locations: locations.split("\n").map((line) => line.trim()).filter(Boolean), ...(unit.kind === "EMERGENCY" ? { triageScale: scale } : {}), ...rest },
      });
      onSaved();
    } catch { /* reported globally */ }
  };
  const editLevel = (index: number, patch: Partial<TriageLevel>) => { setScale((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row))); };
  return (
    <div className="space-y-4">
      <Card title={`${unit.name} · ${KIND_LABELS[unit.kind]}`} actions={<Button small tone={unit.active === false ? "secondary" : "danger"} onClick={() => void save({ active: unit.active === false })}>{unit.active === false ? "Réactiver" : "Désactiver"}</Button>}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nom"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Box, lits, salles (un par ligne)"><textarea className={inputClass} rows={5} value={locations} onChange={(e) => setLocations(e.target.value)} /></Field>
          <Field label="Examens demandés par l’unité (laboratoire, imagerie)" hint="Facturer après les soins convient aux urgences ; le paiement préalable bloque l’examen tant que la caisse n’est pas réglée (sauf patient couvert par un abonnement).">
            <select className={inputClass} value={billingPolicy} onChange={(e) => setBillingPolicy(e.target.value)}>
              <option value="BILL_AFTER">Facturer après les soins (suivi par la finance)</option>
              <option value="PAY_FIRST">Paiement préalable à la caisse</option>
            </select>
          </Field>
        </div>
        {unit.kind === "EMERGENCY" && (
          <div className="mt-4">
            <h4 className="text-sm font-bold">Protocole de tri de l’établissement</h4>
            <p className="mb-2 text-xs text-slate-500">Reportez ici l’échelle officielle adoptée par votre direction médicale. Aulia Care ne choisit jamais le niveau : il l’enregistre et suit les délais cibles.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="p-1 text-left">Code</th><th className="p-1 text-left">Libellé</th><th className="p-1">Couleur</th><th className="p-1">Priorité</th><th className="p-1">Délai cible (min)</th><th /></tr></thead>
                <tbody>
                  {scale.map((level, index) => (
                    <tr key={index}>
                      <td className="p-1"><input className={inputClass} value={level.code} onChange={(e) => editLevel(index, { code: e.target.value })} /></td>
                      <td className="p-1"><input className={inputClass} value={level.label} onChange={(e) => editLevel(index, { label: e.target.value })} /></td>
                      <td className="p-1"><input type="color" value={level.color ?? "#475569"} onChange={(e) => editLevel(index, { color: e.target.value })} /></td>
                      <td className="p-1">
                        <select className={inputClass} value={level.priority ?? "ROUTINE"} onChange={(e) => editLevel(index, { priority: e.target.value as CarePriority })}>
                          {(Object.keys(PRIORITY_LABELS) as CarePriority[]).map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
                        </select>
                      </td>
                      <td className="p-1"><input className={inputClass} type="number" min={0} value={level.maxWaitMinutes ?? ""} onChange={(e) => editLevel(index, { maxWaitMinutes: e.target.value === "" ? undefined : Number(e.target.value) })} /></td>
                      <td className="p-1"><Button small tone="ghost" onClick={() => setScale((rows) => rows.filter((_, i) => i !== index))}>Retirer</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button small tone="secondary" onClick={() => setScale((rows) => [...rows, { code: String(rows.length + 1), label: "", priority: "ROUTINE" }])}>Ajouter un niveau</Button>
              <span className={`text-sm ${validated ? "text-emerald-700" : "text-amber-700"}`}>{validated ? "Échelle validée par un responsable médical de l’unité." : "Non validée : un médecin responsable de l’unité la valide depuis l’unité (bandeau « Relire et valider »). Toute modification ici retire la validation."}</span>
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end"><Button onClick={() => void save({})}>Enregistrer les réglages</Button></div>
      </Card>
      <Assignments unitId={unit.id} />
    </div>
  );
}

function Assignments({ unitId }: { unitId: string }) {
  const [rows, setRows] = useState<UnitAssignment[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [draft, setDraft] = useState({ userId: "", unitRole: "MEMBER" as CareUnitRole });
  const load = () => adminUnitAssignments(unitId).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    void load();
    void apiFetch<StaffUser[]>("/users").then((users) => setStaff(users.filter((user) => STAFF_ROLES.includes(String(user.primaryRole)) && user.status !== "INACTIVE"))).catch(() => setStaff([]));
  }, [unitId]); // eslint-disable-line react-hooks/exhaustive-deps
  const upsert = async (userId: string, unitRole: CareUnitRole, active: boolean) => {
    try { await adminUpsertAssignment(unitId, { userId, unitRole, active }); await load(); } catch { /* reported globally */ }
  };
  const assigned = new Set(rows.filter((row) => row.active).map((row) => row.userId));
  return (
    <Card title="Personnel affecté">
      <div className="mb-3 grid gap-2 md:grid-cols-[2fr_1fr_auto]">
        <select className={inputClass} value={draft.userId} onChange={(e) => setDraft({ ...draft, userId: e.target.value })}>
          <option value="">Choisir une personne…</option>
          {staff.filter((user) => !assigned.has(user.id)).map((user) => <option key={user.id} value={user.id}>{user.lastName} {user.firstName} · {user.primaryRole}</option>)}
        </select>
        <select className={inputClass} value={draft.unitRole} onChange={(e) => setDraft({ ...draft, unitRole: e.target.value as CareUnitRole })}>
          {(Object.keys(ROLE_LABELS) as CareUnitRole[]).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </select>
        <Button disabled={!draft.userId} onClick={() => { void upsert(draft.userId, draft.unitRole, true); setDraft({ userId: "", unitRole: "MEMBER" }); }}>Affecter</Button>
      </div>
      {!rows.length ? <Empty>Personne n’est affecté : l’unité est inutilisable tant qu’aucun soignant n’y est rattaché.</Empty> : (
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className={row.active ? "" : "text-slate-400 line-through"}>{row.user.lastName} {row.user.firstName} <span className="text-xs text-slate-500">· {row.user.primaryRole}</span></span>
              <span className="flex items-center gap-2">
                <select className={`${inputClass} w-auto`} value={row.unitRole} disabled={!row.active} onChange={(e) => void upsert(row.userId, e.target.value as CareUnitRole, true)}>
                  {(Object.keys(ROLE_LABELS) as CareUnitRole[]).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                </select>
                <Button small tone={row.active ? "ghost" : "secondary"} onClick={() => void upsert(row.userId, row.unitRole, !row.active)}>{row.active ? "Retirer" : "Réaffecter"}</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
