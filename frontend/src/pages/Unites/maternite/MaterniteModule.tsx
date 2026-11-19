import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ageLabel, changeEpisodeStatus, fetchEpisode, fetchResources, genderLabel, openEpisode, patientName, recordCareEvent, timeLabel, updateEpisode, updateResource,
  type CareEpisode, type CareEvent, type CareResource, type PatientSummary, type Worklist,
} from "../../../api/careWorkflow";
import { isQueued } from "../../../offline/offlineQueue";
import { ResourcesBoard } from "../ResourcesBoard";
import { canWrite, HistoryList, PatientSearch, TransferDialog } from "../shared";
import { Badge, Button, Card, Dialog, Empty, Field, inputClass, PriorityBadge, Stat } from "../ui";
import { createPregnancy, fetchPregnancies, fetchUnitEvents, registerDelivery, updatePregnancy, type Pregnancy } from "./maternityApi";
import { PartogramChart, type PartogramSettings } from "./Partogram";

export const MATERNITY_TABS = [
  { id: "overview", label: "Vue d’ensemble" }, { id: "prenatal", label: "Consultations prénatales" }, { id: "pregnancies", label: "Grossesses" },
  { id: "admissions", label: "Admissions" }, { id: "labour", label: "Travail & accouchement" }, { id: "rooms", label: "Salle d’accouchement" },
  { id: "newborns", label: "Nouveau-nés" }, { id: "postpartum", label: "Suites de couches" }, { id: "neonatal", label: "Soins néonatals" },
  { id: "discharge", label: "Sorties & orientations" }, { id: "registers", label: "Registres & statistiques" },
] as const;
export type MaternityTab = (typeof MATERNITY_TABS)[number]["id"];
export const MATERNITY_STAGES: Record<string, string> = { ADMITTED: "Admise", LABOUR: "En travail", POSTPARTUM: "Suites de couches", NEWBORN: "Nouveau-né" };
export const MATERNITY_DEFAULT_SETTINGS = { stages: Object.keys(MATERNITY_STAGES), partogram: { alertLineFromCm: 4, alertRateCmPerHour: 1, actionLineOffsetHours: 4, validated: false } };

type Props = { worklist: Worklist; tab: MaternityTab; reload: () => void; openDossier: (episodeId: string) => void };
type FieldDef = { key: string; label: string; options?: string[]; long?: boolean };

const dateLabel = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");
const daysUntil = (iso?: string | null) => (iso ? Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);
const yesNo = ["Oui", "Non"];

/** Generic offline-capable form for one documented observation (prenatal visit, partogram, postpartum, newborn...). */
function EventForm({ title, fields, onSubmit, submitLabel = "Enregistrer", onClose }: {
  title: string; fields: FieldDef[]; onSubmit: (values: Record<string, string>) => Promise<void>; submitLabel?: string; onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const filled = Object.values(values).some((value) => value.trim());
  return (
    <Dialog title={title} onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-3">
        {fields.map((field) => (
          <div key={field.key} className={field.long ? "md:col-span-3" : ""}>
            <Field label={field.label}>
              {field.options ? (
                <select className={inputClass} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}>
                  <option value="">—</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.long ? (
                <textarea className={inputClass} rows={2} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
              ) : (
                <input className={inputClass} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
              )}
            </Field>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Valeurs saisies telles que mesurées ; horodaté et signé. Disponible hors ligne.</p>
      <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button><Button disabled={!filled} onClick={() => void onSubmit(Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])))}>{submitLabel}</Button></div>
    </Dialog>
  );
}

const summaryOf = (fields: FieldDef[], values: Record<string, string>) => fields.filter((field) => values[field.key]).map((field) => `${field.label} : ${values[field.key]}`).join(" · ");

const PRENATAL_FIELDS: FieldDef[] = [
  { key: "gestationalAge", label: "Terme (SA), tel qu’établi" }, { key: "weight", label: "Poids (kg)" }, { key: "bloodPressure", label: "TA (mmHg)" },
  { key: "fundalHeight", label: "Hauteur utérine (cm)" }, { key: "fetalHeart", label: "BCF (/min)" }, { key: "fetalMovements", label: "Mouvements actifs", options: yesNo },
  { key: "presentation", label: "Présentation", options: ["Céphalique", "Siège", "Transverse", "Non déterminée"] }, { key: "oedema", label: "Œdèmes", options: ["Absents", "Présents"] },
  { key: "urineDipstick", label: "Bandelette urinaire (résultat lu)" }, { key: "supplements", label: "Supplémentation donnée (fer, acide folique…)" },
  { key: "preventiveTreatment", label: "Traitement préventif / vaccin donné" }, { key: "examsRequested", label: "Examens demandés" },
  { key: "nextVisit", label: "Prochain rendez-vous" }, { key: "notes", label: "Remarques", long: true },
];
const PARTOGRAM_FIELDS: FieldDef[] = [
  { key: "cervicalDilation", label: "Dilatation du col (cm)" }, { key: "descent", label: "Descente de la tête (5e)" }, { key: "contractions", label: "Contractions / 10 min" },
  { key: "contractionDuration", label: "Durée des contractions (s)" }, { key: "fetalHeartRate", label: "BCF (/min)" }, { key: "liquor", label: "Liquide amniotique", options: ["Intact", "Clair", "Teinté", "Méconial", "Sanglant", "Absent"] },
  { key: "moulding", label: "Chevauchement", options: ["0", "+", "++", "+++"] }, { key: "bloodPressure", label: "TA maternelle" }, { key: "pulse", label: "Pouls maternel" },
  { key: "temperature", label: "T° maternelle" }, { key: "oxytocin", label: "Ocytocine (dose, débit)" }, { key: "drugs", label: "Médicaments / perfusions" },
  { key: "notes", label: "Remarques", long: true },
];
const DELIVERY_FIELDS: FieldDef[] = [
  { key: "mode", label: "Mode d’accouchement", options: ["Voie basse spontanée", "Voie basse instrumentale", "Césarienne"] },
  { key: "presentation", label: "Présentation", options: ["Céphalique", "Siège", "Autre"] }, { key: "placenta", label: "Délivrance", options: ["Complète", "Incomplète", "Manuelle"] },
  { key: "bloodLossMl", label: "Pertes sanguines mesurées (ml)" }, { key: "perineum", label: "Périnée", options: ["Intact", "Déchirure 1er degré", "Déchirure 2e degré", "Déchirure 3e/4e degré", "Épisiotomie"] },
  { key: "uterotonic", label: "Utérotonique au 3e temps", options: yesNo }, { key: "complications", label: "Complications" }, { key: "notes", label: "Remarques", long: true },
];
const NEWBORN_FIELDS: FieldDef[] = [
  { key: "weightGrams", label: "Poids (g)" }, { key: "lengthCm", label: "Taille (cm)" }, { key: "headCm", label: "Périmètre crânien (cm)" },
  { key: "apgar1", label: "Apgar 1 min (évalué)" }, { key: "apgar5", label: "Apgar 5 min (évalué)" }, { key: "apgar10", label: "Apgar 10 min (évalué)" },
  { key: "resuscitation", label: "Réanimation", options: ["Aucune", "Stimulation", "Ventilation au masque", "Réanimation avancée"] },
  { key: "skinToSkin", label: "Peau à peau", options: yesNo }, { key: "notes", label: "Remarques", long: true },
];
const POSTPARTUM_FIELDS: FieldDef[] = [
  { key: "bloodPressure", label: "TA" }, { key: "pulse", label: "Pouls" }, { key: "temperature", label: "T°" }, { key: "uterus", label: "Globe utérin", options: ["Bien formé", "Mou", "Non évalué"] },
  { key: "bleeding", label: "Saignements", options: ["Normaux", "Abondants", "Absents"] }, { key: "perineum", label: "Périnée / cicatrice" },
  { key: "breastfeeding", label: "Allaitement", options: ["Maternel exclusif", "Mixte", "Artificiel", "Difficultés"] }, { key: "pain", label: "Douleur (0-10)" },
  { key: "urination", label: "Mictions", options: ["Normales", "Difficiles", "Absentes"] }, { key: "notes", label: "Remarques", long: true },
];
const NEONATAL_FIELDS: FieldDef[] = [
  { key: "temperature", label: "T° (°C)" }, { key: "weightGrams", label: "Poids (g)" }, { key: "feeding", label: "Alimentation", options: ["Sein", "Mixte", "Lait artificiel", "Difficultés"] },
  { key: "cord", label: "Cordon", options: ["Propre", "Suintant", "Rouge / inflammatoire"] }, { key: "jaundice", label: "Ictère", options: ["Absent", "Présent"] },
  { key: "vitaminK", label: "Vitamine K administrée", options: yesNo }, { key: "eyeCare", label: "Soins oculaires", options: yesNo },
  { key: "vaccines", label: "Vaccins administrés (selon calendrier)" }, { key: "stools", label: "Selles / urines" }, { key: "notes", label: "Remarques", long: true },
];

export function MaterniteModule({ worklist, tab, reload, openDossier }: Props) {
  const { unit, unitRole, episodes } = worklist;
  const writable = canWrite(unitRole);
  const partogramSettings = (unit.settings as { partogram?: PartogramSettings } | null)?.partogram;
  const [pregnancies, setPregnancies] = useState<Pregnancy[]>([]);
  const [resources, setResources] = useState<CareResource[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<null | { kind: "prenatal" | "partogram" | "postpartum" | "neonatal" | "newbornExam"; target: CareEpisode | Pregnancy }>(null);
  const [deliveryTarget, setDeliveryTarget] = useState<CareEpisode | null>(null);
  const [pregnancyDialog, setPregnancyDialog] = useState<Pregnancy | "new" | null>(null);
  const [transferTarget, setTransferTarget] = useState<CareEpisode | null>(null);
  const [partogramOf, setPartogramOf] = useState<CareEpisode | null>(null);

  const loadAux = useCallback(() => {
    void fetchPregnancies(unit.id).then(setPregnancies).catch(() => undefined);
    void fetchResources(unit.id).then(setResources).catch(() => undefined);
  }, [unit.id]);
  useEffect(() => { loadAux(); }, [loadAux, worklist.generatedAt]);
  const refresh = () => { reload(); loadAux(); };

  const stageOf = (stage: string) => episodes.filter((episode) => (episode.stage ?? "ADMITTED") === stage);
  const admitted = stageOf("ADMITTED"), labour = stageOf("LABOUR"), postpartum = stageOf("POSTPARTUM"), newborns = stageOf("NEWBORN");
  const ongoing = pregnancies.filter((item) => item.status === "ONGOING");
  const dueSoon = ongoing.filter((item) => { const d = daysUntil(item.expectedDeliveryDate); return d !== null && d <= 14; });

  const documentEvent = async (episodeOrPatient: { episodeId?: string; patientId?: string }, type: string, label: string, values: Record<string, string>, fields: FieldDef[], extra?: Record<string, unknown>) => {
    try {
      const saved = await recordCareEvent({ careUnitId: unit.id, ...episodeOrPatient, type, summary: summaryOf(fields, values) || label, payload: { ...values, ...(extra ?? {}) } }, label);
      setNotice(isQueued(saved) ? "Hors ligne : saisie gardée sur l’appareil, envoyée au retour du réseau." : `${label} enregistré(e).`);
      setForm(null); refresh();
    } catch { /* reported globally */ }
  };
  const moveStage = async (episode: CareEpisode, stage: string) => {
    try { await updateEpisode(episode.id, { version: episode.version, stage }); refresh(); } catch { /* reported globally */ }
  };

  const row = (episode: CareEpisode, actions?: React.ReactNode) => (
    <li key={episode.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openDossier(episode.id)}>
        <p className="font-semibold">{patientName(episode.patient)} <span className="text-xs font-normal text-slate-500">{[genderLabel(episode.patient.gender), ageLabel(episode.patient)].filter(Boolean).join(" · ")}</span></p>
        <p className="text-xs text-slate-500">{MATERNITY_STAGES[episode.stage ?? ""] ?? episode.stage} · depuis {timeLabel(episode.startedAt ?? episode.createdAt)}{episode.locationLabel ? ` · ${episode.locationLabel}` : ""}{episode.reason ? ` · ${episode.reason}` : ""}</p>
      </button>
      <div className="flex flex-wrap items-center gap-1"><PriorityBadge priority={episode.priority} />{writable && actions}</div>
    </li>
  );
  const list = (items: CareEpisode[], empty: string, actions?: (episode: CareEpisode) => React.ReactNode) =>
    items.length ? <ul className="space-y-2">{items.map((episode) => row(episode, actions?.(episode)))}</ul> : <Empty>{empty}</Empty>;

  const pregnancyRow = (pregnancy: Pregnancy, actions?: React.ReactNode) => {
    const d = daysUntil(pregnancy.expectedDeliveryDate);
    return (
      <li key={pregnancy.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
        <div>
          <p className="font-semibold">{patientName(pregnancy.patient)} {pregnancy.riskLevel && <Badge tone={/haut|élevé|eleve/i.test(pregnancy.riskLevel) ? "red" : "slate"}>{pregnancy.riskLevel}</Badge>}</p>
          <p className="text-xs text-slate-500">
            G{pregnancy.gravida ?? "?"} P{pregnancy.parity ?? "?"} · DDR {dateLabel(pregnancy.lastMenstrualPeriod)} · terme prévu {dateLabel(pregnancy.expectedDeliveryDate)}
            {d !== null && pregnancy.status === "ONGOING" ? ` (${d >= 0 ? `dans ${d} j` : `dépassé de ${-d} j`})` : ""}{pregnancy.bloodGroup ? ` · ${pregnancy.bloodGroup}` : ""}
            {pregnancy.status !== "ONGOING" ? ` · ${pregnancy.outcome ?? pregnancy.status}` : ""}
          </p>
        </div>
        {writable && <div className="flex flex-wrap gap-1">{actions}</div>}
      </li>
    );
  };

  let content: React.ReactNode = null;
  switch (tab) {
    case "overview":
      content = (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Grossesses suivies" value={ongoing.length} />
            <Stat label="Terme ≤ 14 jours" value={dueSoon.length} tone={dueSoon.length ? "amber" : undefined} />
            <Stat label="Admises" value={admitted.length} />
            <Stat label="En travail" value={labour.length} tone={labour.length ? "amber" : undefined} />
            <Stat label="Suites de couches" value={postpartum.length} />
            <Stat label="Nouveau-nés présents" value={newborns.length} />
          </div>
          <Card title="En travail">{list(labour, "Aucune parturiente en travail.", (episode) => <Button small onClick={() => setPartogramOf(episode)}>Partogramme</Button>)}</Card>
          {dueSoon.length > 0 && <Card title="Termes proches (dates saisies)"><ul className="space-y-2">{dueSoon.map((item) => pregnancyRow(item))}</ul></Card>}
        </div>
      );
      break;
    case "prenatal":
      content = (
        <Card title={`Consultations prénatales — grossesses suivies (${ongoing.length})`}>
          {notice && <p className="mb-2 text-sm text-aulia-navy dark:text-aulia-mist">{notice}</p>}
          {!ongoing.length ? <Empty>Aucune grossesse suivie. Ouvrez un suivi dans l’onglet Grossesses.</Empty> : (
            <ul className="space-y-2">{ongoing.map((item) => pregnancyRow(item, <>
              <Button small onClick={() => setForm({ kind: "prenatal", target: item })}>Nouvelle CPN</Button>
            </>))}</ul>
          )}
          <PrenatalHistory unitId={unit.id} pregnancies={ongoing} />
        </Card>
      );
      break;
    case "pregnancies":
      content = (
        <Card title="Grossesses" actions={writable ? <Button small onClick={() => setPregnancyDialog("new")}>Ouvrir un suivi</Button> : undefined}>
          {!pregnancies.length ? <Empty>Aucun suivi de grossesse.</Empty> : (
            <ul className="space-y-2">{pregnancies.map((item) => pregnancyRow(item, item.status === "ONGOING" ? <Button small tone="secondary" onClick={() => setPregnancyDialog(item)}>Mettre à jour / clôturer</Button> : null))}</ul>
          )}
        </Card>
      );
      break;
    case "admissions":
      content = (
        <div className="grid gap-4 xl:grid-cols-2">
          <AdmissionForm unitId={unit.id} pregnancies={ongoing} disabled={!writable} onDone={refresh} />
          <Card title={`Admises (${admitted.length})`}>{list(admitted, "Aucune admission en attente.", (episode) => <Button small onClick={() => void moveStage(episode, "LABOUR")}>Début du travail</Button>)}</Card>
        </div>
      );
      break;
    case "labour":
      content = (
        <div className="space-y-4">
          {notice && <p className="rounded-lg bg-aulia-mist p-2 text-sm text-aulia-navy">{notice}</p>}
          <Card title={`En travail (${labour.length})`}>{list(labour, "Aucune parturiente en travail.", (episode) => <>
            <Button small tone="secondary" onClick={() => setForm({ kind: "partogram", target: episode })}>Mesure partogramme</Button>
            <Button small tone="secondary" onClick={() => setPartogramOf(episode)}>Voir la courbe</Button>
            <Button small onClick={() => setDeliveryTarget(episode)}>Accouchement</Button>
          </>)}</Card>
        </div>
      );
      break;
    case "rooms":
      content = (
        <div className="space-y-4">
          <ResourcesBoard unitId={unit.id} kind="ROOM" title="Salles et tables d’accouchement" resources={resources} role={unitRole} reload={loadAux} detailFields={[{ key: "type", label: "Type (salle, table, box)" }]} />
          <Card title="Installer une parturiente">
            {!labour.length ? <Empty>Aucune parturiente en travail.</Empty> : (
              <ul className="space-y-2 text-sm">
                {labour.map((episode) => {
                  const free = resources.filter((item) => item.kind === "ROOM" && item.status === "AVAILABLE");
                  const engaged = episode.resources?.filter((item) => item.kind === "ROOM") ?? [];
                  return (
                    <li key={episode.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{patientName(episode.patient)} {engaged.length ? <Badge tone="teal">{engaged.map((item) => item.code).join(", ")}</Badge> : null}</span>
                      {writable && !engaged.length && free.length > 0 && (
                        <select className={`${inputClass} w-auto`} value="" onChange={(e) => { const room = free.find((item) => item.id === e.target.value); if (room) void updateResource(room.id, { version: room.version, assignedEpisodeId: episode.id }).then(refresh).catch(() => undefined); }}>
                          <option value="">Attribuer une salle…</option>{free.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.label}</option>)}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      );
      break;
    case "newborns":
      content = <Card title={`Nouveau-nés (${newborns.length})`}>{list(newborns, "Aucun nouveau-né présent.", (episode) => <>
        <Button small tone="secondary" onClick={() => setForm({ kind: "newbornExam", target: episode })}>Examen du nouveau-né</Button>
        <Button small tone="secondary" onClick={() => setTransferTarget(episode)}>Transférer en néonatologie</Button>
      </>)}</Card>;
      break;
    case "postpartum":
      content = <Card title={`Suites de couches (${postpartum.length})`}>{notice && <p className="mb-2 text-sm">{notice}</p>}{list(postpartum, "Aucune accouchée.", (episode) => <Button small onClick={() => setForm({ kind: "postpartum", target: episode })}>Surveillance</Button>)}</Card>;
      break;
    case "neonatal":
      content = <Card title={`Soins néonatals (${newborns.length})`}>{notice && <p className="mb-2 text-sm">{notice}</p>}{list(newborns, "Aucun nouveau-né.", (episode) => <Button small onClick={() => setForm({ kind: "neonatal", target: episode })}>Soins</Button>)}</Card>;
      break;
    case "discharge":
      content = (
        <div className="space-y-4">
          <Card title="Mères">{list([...postpartum, ...admitted], "Aucune patiente.", (episode) => <>
            <Button small tone="secondary" onClick={() => setTransferTarget(episode)}>Transférer</Button>
            <DischargeButton episode={episode} onDone={refresh} />
          </>)}</Card>
          <Card title="Nouveau-nés">{list(newborns, "Aucun nouveau-né.", (episode) => <DischargeButton episode={episode} onDone={refresh} />)}</Card>
          <HistoryList unitId={unit.id} onOpen={openDossier} />
        </div>
      );
      break;
    case "registers":
      content = <Registers unitId={unit.id} />;
      break;
  }

  const target = form?.target as { id: string; patientId: string; patient: PatientSummary };
  return (
    <>
      {content}
      {form?.kind === "prenatal" && <EventForm title={`Consultation prénatale — ${patientName(target.patient)}`} fields={PRENATAL_FIELDS} onClose={() => setForm(null)}
        onSubmit={(values) => documentEvent({ patientId: target.patientId }, "PRENATAL_VISIT", "Consultation prénatale", values, PRENATAL_FIELDS, { pregnancyId: target.id })} />}
      {form?.kind === "partogram" && <EventForm title={`Partogramme — ${patientName(target.patient)}`} fields={PARTOGRAM_FIELDS} onClose={() => setForm(null)}
        onSubmit={(values) => documentEvent({ episodeId: target.id }, "PARTOGRAM_ENTRY", "Mesure de partogramme", values, PARTOGRAM_FIELDS)} />}
      {form?.kind === "postpartum" && <EventForm title={`Suites de couches — ${patientName(target.patient)}`} fields={POSTPARTUM_FIELDS} onClose={() => setForm(null)}
        onSubmit={(values) => documentEvent({ episodeId: target.id }, "POSTPARTUM_CHECK", "Surveillance post-partum", values, POSTPARTUM_FIELDS)} />}
      {form?.kind === "neonatal" && <EventForm title={`Soins néonatals — ${patientName(target.patient)}`} fields={NEONATAL_FIELDS} onClose={() => setForm(null)}
        onSubmit={(values) => documentEvent({ episodeId: target.id }, "NEWBORN_CARE", "Soins néonatals", values, NEONATAL_FIELDS)} />}
      {form?.kind === "newbornExam" && <EventForm title={`Examen du nouveau-né — ${patientName(target.patient)}`} fields={NEWBORN_FIELDS} onClose={() => setForm(null)}
        onSubmit={(values) => documentEvent({ episodeId: target.id }, "NEWBORN_ASSESSMENT", "Examen du nouveau-né", values, NEWBORN_FIELDS)} />}
      {deliveryTarget && <DeliveryDialog episode={deliveryTarget} unitId={unit.id} onClose={() => setDeliveryTarget(null)} onDone={(message) => { setDeliveryTarget(null); setNotice(message); refresh(); }} />}
      {pregnancyDialog && <PregnancyDialog unitId={unit.id} pregnancy={pregnancyDialog === "new" ? null : pregnancyDialog} onClose={() => setPregnancyDialog(null)} onDone={() => { setPregnancyDialog(null); refresh(); }} />}
      {transferTarget && <TransferDialog episode={transferTarget} unit={unit} preset={{ toKind: transferTarget.stage === "NEWBORN" ? "NEONATAL" : undefined }} onClose={() => setTransferTarget(null)} onDone={() => { setTransferTarget(null); refresh(); }} />}
      {partogramOf && <PartogramDialog episode={partogramOf} settings={partogramSettings} onClose={() => setPartogramOf(null)} />}
    </>
  );
}

function PrenatalHistory({ unitId, pregnancies }: { unitId: string; pregnancies: Pregnancy[] }) {
  const [patientId, setPatientId] = useState("");
  const [events, setEvents] = useState<CareEvent[]>([]);
  useEffect(() => {
    if (!patientId) { setEvents([]); return; }
    void fetchUnitEvents(unitId, { types: ["PRENATAL_VISIT"], patientId, from: new Date(Date.now() - 300 * 86_400_000).toISOString() }).then(setEvents).catch(() => setEvents([]));
  }, [unitId, patientId]);
  if (!pregnancies.length) return null;
  return (
    <div className="mt-4">
      <Field label="Historique des consultations prénatales">
        <select className={inputClass} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
          <option value="">Choisir une patiente…</option>{pregnancies.map((item) => <option key={item.id} value={item.patientId}>{patientName(item.patient)}</option>)}
        </select>
      </Field>
      {patientId && (events.length ? (
        <ol className="mt-2 space-y-1 text-sm">{[...events].reverse().map((event) => <li key={event.id} className="rounded-lg border border-slate-100 p-2 dark:border-slate-800"><span className="text-xs text-slate-500">{timeLabel(event.occurredAt)}</span><p>{event.summary}</p></li>)}</ol>
      ) : <p className="mt-2 text-sm text-slate-500">Aucune consultation prénatale enregistrée.</p>)}
    </div>
  );
}

function PregnancyDialog({ unitId, pregnancy, onClose, onDone }: { unitId: string; pregnancy: Pregnancy | null; onClose: () => void; onDone: () => void }) {
  const [patient, setPatient] = useState<PatientSummary | null>(pregnancy?.patient ?? null);
  const [values, setValues] = useState({
    lastMenstrualPeriod: pregnancy?.lastMenstrualPeriod?.slice(0, 10) ?? "", expectedDeliveryDate: pregnancy?.expectedDeliveryDate?.slice(0, 10) ?? "",
    gravida: pregnancy?.gravida?.toString() ?? "", parity: pregnancy?.parity?.toString() ?? "", riskLevel: pregnancy?.riskLevel ?? "",
    riskFactors: pregnancy?.riskFactors ?? "", bloodGroup: pregnancy?.bloodGroup ?? "", notes: pregnancy?.notes ?? "", outcome: "",
  });
  const set = (key: keyof typeof values, value: string) => setValues({ ...values, [key]: value });
  const fields = {
    ...(values.lastMenstrualPeriod ? { lastMenstrualPeriod: new Date(values.lastMenstrualPeriod).toISOString() } : {}),
    ...(values.expectedDeliveryDate ? { expectedDeliveryDate: new Date(values.expectedDeliveryDate).toISOString() } : {}),
    ...(values.gravida ? { gravida: Number(values.gravida) } : {}), ...(values.parity ? { parity: Number(values.parity) } : {}),
    riskLevel: values.riskLevel, riskFactors: values.riskFactors, bloodGroup: values.bloodGroup, notes: values.notes,
  };
  const save = async (close?: boolean) => {
    try {
      if (pregnancy) await updatePregnancy(unitId, pregnancy.id, { version: pregnancy.version, ...fields, ...(close ? { status: "ENDED" as const, outcome: values.outcome.trim() } : {}) });
      else if (patient) await createPregnancy(unitId, { patientId: patient.id, ...fields });
      onDone();
    } catch { /* reported globally */ }
  };
  return (
    <Dialog title={pregnancy ? `Grossesse — ${patientName(pregnancy.patient)}` : "Ouvrir un suivi de grossesse"} onClose={onClose} wide>
      {!patient ? <Field label="Patiente (dossier existant)"><PatientSearch onPick={setPatient} /></Field> : <p className="mb-3 text-sm">Patiente : <strong>{patientName(patient)}</strong></p>}
      {patient && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="DDR"><input type="date" className={inputClass} value={values.lastMenstrualPeriod} onChange={(e) => set("lastMenstrualPeriod", e.target.value)} /></Field>
            <Field label="Terme prévu (établi par vous)"><input type="date" className={inputClass} value={values.expectedDeliveryDate} onChange={(e) => set("expectedDeliveryDate", e.target.value)} /></Field>
            <Field label="Gestité"><input type="number" min={0} className={inputClass} value={values.gravida} onChange={(e) => set("gravida", e.target.value)} /></Field>
            <Field label="Parité"><input type="number" min={0} className={inputClass} value={values.parity} onChange={(e) => set("parity", e.target.value)} /></Field>
            <Field label="Niveau de risque retenu"><select className={inputClass} value={values.riskLevel} onChange={(e) => set("riskLevel", e.target.value)}><option value="">—</option><option>Faible</option><option>Modéré</option><option>Haut risque</option></select></Field>
            <Field label="Groupe sanguin / Rhésus"><input className={inputClass} value={values.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} placeholder="O+" /></Field>
            <div className="md:col-span-2"><Field label="Facteurs de risque"><input className={inputClass} value={values.riskFactors} onChange={(e) => set("riskFactors", e.target.value)} /></Field></div>
            <div className="md:col-span-4"><Field label="Remarques"><textarea className={inputClass} rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div>
          </div>
          {pregnancy && <div className="mt-3"><Field label="Issue (pour clôturer sans accouchement ici : fausse couche, transfert, perdue de vue…)"><input className={inputClass} value={values.outcome} onChange={(e) => set("outcome", e.target.value)} /></Field></div>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button tone="ghost" onClick={onClose}>Annuler</Button>
            {pregnancy && <Button tone="danger" disabled={values.outcome.trim().length < 3} onClick={() => void save(true)}>Clôturer le suivi</Button>}
            <Button onClick={() => void save()}>{pregnancy ? "Enregistrer" : "Ouvrir le suivi"}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function AdmissionForm({ unitId, pregnancies, disabled, onDone }: { unitId: string; pregnancies: Pregnancy[]; disabled: boolean; onDone: () => void }) {
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState("ADMITTED");
  const submit = async () => {
    if (!patient) return;
    try { await openEpisode({ careUnitId: unitId, patientId: patient.id, reason: reason.trim() || undefined, stage, start: true }); setPatient(null); setReason(""); onDone(); } catch { /* reported globally */ }
  };
  return (
    <Card title="Admettre une patiente">
      {patient ? (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-aulia-mist p-3 text-sm dark:bg-aulia-teal/10"><strong>{patientName(patient)}</strong><Button small tone="ghost" onClick={() => setPatient(null)}>Changer</Button></div>
      ) : (
        <>
          {pregnancies.length > 0 && (
            <Field label="Grossesse suivie">
              <select className={inputClass} value="" onChange={(e) => { const item = pregnancies.find((p) => p.patientId === e.target.value); if (item) setPatient(item.patient); }}>
                <option value="">Choisir…</option>{pregnancies.map((item) => <option key={item.id} value={item.patientId}>{patientName(item.patient)} · terme {dateLabel(item.expectedDeliveryDate)}</option>)}
              </select>
            </Field>
          )}
          <div className="mt-2"><Field label="Ou rechercher un dossier"><PatientSearch onPick={setPatient} /></Field></div>
        </>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Motif d’admission"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contractions, rupture de la poche, césarienne programmée…" /></Field>
        <Field label="Étape"><select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value)}><option value="ADMITTED">Admise (pré-travail, surveillance)</option><option value="LABOUR">En travail</option></select></Field>
      </div>
      <div className="mt-4 flex justify-end"><Button disabled={disabled || !patient} onClick={() => void submit()}>Admettre</Button></div>
    </Card>
  );
}

function DeliveryDialog({ episode, unitId, onClose, onDone }: { episode: CareEpisode; unitId: string; onClose: () => void; onDone: (message: string) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [birthAt, setBirthAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [babies, setBabies] = useState<Array<{ sex: "MALE" | "FEMALE" | "UNKNOWN"; firstName: string; values: Record<string, string> }>>([{ sex: "UNKNOWN", firstName: "", values: {} }]);
  const [saving, setSaving] = useState(false);
  const [operationId] = useState(() => crypto.randomUUID());
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const at = new Date(birthAt).toISOString();
      const fresh = await fetchEpisode(episode.id);
      await registerDelivery(unitId, {
        motherEpisodeId: episode.id, version: fresh.version, operationId, birthAt: at,
        summary: `Accouchement — ${summaryOf(DELIVERY_FIELDS, values) || "voir détails"} · ${babies.length} naissance(s)`,
        details: values, babies: babies.map(baby => ({ sex: baby.sex, firstName: baby.firstName.trim() || undefined, measurements: baby.values })),
      });
      onDone(`Accouchement et ${babies.length} naissance(s) enregistrés : chaque nouveau-né a son propre dossier, relié à celui de la mère.`);
    } catch { /* reported globally */ } finally { setSaving(false); }
  };
  const field = (def: FieldDef, value: string, onChange: (v: string) => void) => def.options ? (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{def.options.map((option) => <option key={option}>{option}</option>)}</select>
  ) : def.long ? <textarea className={inputClass} rows={2} value={value} onChange={(e) => onChange(e.target.value)} /> : <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />;
  return (
    <Dialog title={`Accouchement — ${patientName(episode.patient)}`} onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Date et heure de naissance"><input type="datetime-local" className={inputClass} value={birthAt} onChange={(e) => setBirthAt(e.target.value)} /></Field>
        {DELIVERY_FIELDS.map((def) => <div key={def.key} className={def.long ? "md:col-span-3" : ""}><Field label={def.label}>{field(def, values[def.key] ?? "", (v) => setValues({ ...values, [def.key]: v }))}</Field></div>)}
      </div>
      {babies.map((baby, index) => (
        <div key={index} className="mt-4 rounded-xl border border-aulia-teal/30 p-3">
          <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-bold">Nouveau-né {babies.length > 1 ? index + 1 : ""}</h4>{babies.length > 1 && <Button small tone="ghost" onClick={() => setBabies(babies.filter((_, i) => i !== index))}>Retirer</Button>}</div>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Sexe"><select className={inputClass} value={baby.sex} onChange={(e) => setBabies(babies.map((b, i) => i === index ? { ...b, sex: e.target.value as typeof b.sex } : b))}><option value="UNKNOWN">À préciser</option><option value="FEMALE">Fille</option><option value="MALE">Garçon</option></select></Field>
            <Field label="Prénom (facultatif)"><input className={inputClass} value={baby.firstName} onChange={(e) => setBabies(babies.map((b, i) => i === index ? { ...b, firstName: e.target.value } : b))} /></Field>
            {NEWBORN_FIELDS.filter((def) => !def.long).map((def) => <Field key={def.key} label={def.label}>{field(def, baby.values[def.key] ?? "", (v) => setBabies(babies.map((b, i) => i === index ? { ...b, values: { ...b.values, [def.key]: v } } : b)))}</Field>)}
          </div>
        </div>
      ))}
      <Button small tone="secondary" onClick={() => setBabies([...babies, { sex: "UNKNOWN", firstName: "", values: {} }])}>Ajouter un nouveau-né (grossesse multiple)</Button>
      <p className="mt-2 text-xs text-slate-500">Les scores (Apgar…) sont ceux que vous évaluez. L’accouchement exige le réseau : il crée le dossier de chaque nouveau-né.</p>
      <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button><Button disabled={saving || !values.mode} onClick={() => void submit()}>{saving ? "Enregistrement…" : "Enregistrer l’accouchement"}</Button></div>
    </Dialog>
  );
}

function PartogramDialog({ episode, settings, onClose }: { episode: CareEpisode; settings?: PartogramSettings; onClose: () => void }) {
  const [entries, setEntries] = useState<CareEvent[] | null>(null);
  useEffect(() => { void fetchEpisode(episode.id).then((detail) => setEntries(detail.events.filter((event) => event.type === "PARTOGRAM_ENTRY" && !detail.events.some((other) => other.correctsEventId === event.id)))).catch(() => setEntries([])); }, [episode.id]);
  return (
    <Dialog title={`Partogramme — ${patientName(episode.patient)}`} onClose={onClose} wide>
      {!entries ? <p className="text-sm text-slate-500">Chargement…</p> : (
        <>
          <PartogramChart entries={entries} settings={settings} />
          <ol className="mt-3 max-h-60 space-y-1 overflow-y-auto text-xs">{[...entries].reverse().map((event) => <li key={event.id}><strong>{timeLabel(event.occurredAt)}</strong> — {event.summary}</li>)}</ol>
        </>
      )}
    </Dialog>
  );
}

function DischargeButton({ episode, onDone }: { episode: CareEpisode; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("HOME");
  const [note, setNote] = useState("");
  const submit = async () => {
    try {
      const fresh = await fetchEpisode(episode.id);
      await changeEpisodeStatus(episode.id, { version: fresh.version, status: "COMPLETED", outcome, reason: note.trim() || undefined });
      setOpen(false); onDone();
    } catch { /* reported globally */ }
  };
  return (
    <>
      <Button small tone="danger" onClick={() => setOpen(true)}>Sortie</Button>
      {open && (
        <Dialog title={`Sortie — ${patientName(episode.patient)}`} onClose={() => setOpen(false)}>
          <Field label="Issue"><select className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="HOME">Retour à domicile</option><option value="TRANSFER_INTERNAL">Transfert vers une autre unité</option><option value="TRANSFER_EXTERNAL">Transfert vers un autre établissement</option>
            <option value="LEFT_AGAINST_ADVICE">Sortie contre avis</option><option value="DECEASED">Décès</option>
          </select></Field>
          <div className="mt-3"><Field label="Consignes de sortie / rendez-vous"><textarea className={inputClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
          <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button tone="danger" onClick={() => void submit()}>Confirmer la sortie</Button></div>
        </Dialog>
      )}
    </>
  );
}

function Registers({ unitId }: { unitId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [events, setEvents] = useState<Array<CareEvent & { patient?: PatientSummary }>>([]);
  useEffect(() => {
    void fetchUnitEvents(unitId, { types: ["DELIVERY", "BIRTH"], from: new Date(from).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() }).then(setEvents).catch(() => setEvents([]));
  }, [unitId, from, to]);
  const deliveries = events.filter((event) => event.type === "DELIVERY");
  const births = events.filter((event) => event.type === "BIRTH");
  const stats = useMemo(() => {
    const mode = (label: string) => deliveries.filter((event) => event.payload?.mode === label).length;
    const weights = births.map((event) => Number((event.payload?.measurements as Record<string, unknown> | undefined)?.weightGrams)).filter((value) => Number.isFinite(value) && value > 0);
    return {
      deliveries: deliveries.length, vaginal: mode("Voie basse spontanée"), instrumental: mode("Voie basse instrumentale"), caesarean: mode("Césarienne"),
      births: births.length, girls: births.filter((event) => event.payload?.sex === "FEMALE").length, boys: births.filter((event) => event.payload?.sex === "MALE").length,
      lowWeight: weights.filter((value) => value < 2500).length, weighed: weights.length,
    };
  }, [deliveries, births]);
  const exportCsv = () => {
    const rows = [["Date", "Type", "Patiente", "Détail"], ...events.map((event) => [timeLabel(event.occurredAt), event.type === "DELIVERY" ? "Accouchement" : "Naissance", patientName(event.patient), event.summary])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" })), download: `registre-maternite-${from}-${to}.csv` });
    link.click();
  };
  return (
    <div className="space-y-4">
      <Card title="Période" actions={<Button small tone="secondary" onClick={exportCsv}>Exporter le registre (CSV)</Button>}>
        <div className="flex flex-wrap gap-3">
          <Field label="Du"><input type="date" className={inputClass} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Au"><input type="date" className={inputClass} value={to} max={today} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Accouchements" value={stats.deliveries} />
        <Stat label="Voie basse" value={stats.vaginal + stats.instrumental} />
        <Stat label="Césariennes" value={`${stats.caesarean}${stats.deliveries ? ` (${Math.round((stats.caesarean / stats.deliveries) * 100)} %)` : ""}`} />
        <Stat label="Naissances" value={stats.births} />
        <Stat label="Filles / garçons" value={`${stats.girls} / ${stats.boys}`} />
        <Stat label="Poids saisi < 2 500 g" value={`${stats.lowWeight}${stats.weighed ? ` / ${stats.weighed}` : ""}`} />
      </div>
      <Card title="Registre des accouchements et naissances">
        {!events.length ? <Empty>Aucun accouchement sur la période.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">Patiente</th><th className="p-2">Détail</th><th className="p-2">Par</th></tr></thead>
              <tbody>{events.map((event) => (
                <tr key={event.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-2">{timeLabel(event.occurredAt)}</td><td className="p-2">{event.type === "DELIVERY" ? "Accouchement" : "Naissance"}</td>
                  <td className="p-2">{patientName(event.patient)}</td><td className="p-2">{event.summary}</td><td className="p-2 text-xs">{event.author ? `${event.author.firstName ?? ""} ${event.author.lastName ?? ""}` : ""}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
