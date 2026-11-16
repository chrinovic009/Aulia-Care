import { useState } from "react";
import {
  createResource, patientName, RESOURCE_STATUS_LABELS, updateResource,
  type CareResource, type CareResourceKind, type CareUnitRole,
} from "../../api/careWorkflow";
import { Badge, Button, Card, Empty, Field, inputClass } from "./ui";

const TONES = { AVAILABLE: "green", ENGAGED: "teal", UNAVAILABLE: "red", MAINTENANCE: "amber", RETIRED: "slate" } as const;

/** Vehicles, crews, equipment, rooms or machines of a unit, with their live status. Shared by every unit module. */
export function ResourcesBoard({ unitId, kind, title, resources, role, reload, detailFields = [] }: {
  unitId: string; kind: CareResourceKind; title: string; resources: CareResource[]; role: CareUnitRole; reload: () => void;
  detailFields?: Array<{ key: string; label: string }>;
}) {
  const rows = resources.filter((item) => item.kind === kind);
  const [draft, setDraft] = useState<Record<string, string>>({ code: "", label: "" });
  const lead = role === "LEAD";
  const writable = role === "LEAD" || role === "MEMBER";
  const act = async (work: () => Promise<unknown>) => { try { await work(); reload(); } catch { /* reported globally */ } };
  const add = () => act(async () => {
    const details = Object.fromEntries(detailFields.map((field) => [field.key, (draft[field.key] ?? "").trim()]).filter(([, value]) => value));
    await createResource(unitId, { kind, code: draft.code.trim(), label: draft.label.trim(), details });
    setDraft({ code: "", label: "" });
  });
  const setStatus = (resource: CareResource, status: CareResource["status"]) => {
    const reason = status === "AVAILABLE" ? undefined : window.prompt("Motif (panne, entretien, absence…) :");
    if (status !== "AVAILABLE" && (!reason || reason.trim().length < 2)) return;
    void act(() => updateResource(resource.id, { version: resource.version, status, statusReason: reason?.trim() }));
  };
  return (
    <Card title={`${title} (${rows.length})`}>
      {!rows.length ? <Empty>Aucun élément enregistré.{lead ? " Ajoutez-en ci-dessous." : " Le responsable d’unité peut en ajouter."}</Empty> : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((resource) => (
            <li key={resource.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-semibold">{resource.code} · {resource.label} <Badge tone={TONES[resource.status]}>{RESOURCE_STATUS_LABELS[resource.status]}</Badge></p>
                <p className="text-xs text-slate-500">
                  {detailFields.map((field) => resource.details?.[field.key] ? `${field.label} : ${String(resource.details[field.key])}` : null).filter(Boolean).join(" · ")}
                  {resource.assignedEpisode ? ` · engagé pour ${patientName(resource.assignedEpisode.patient)}` : ""}
                  {resource.statusReason ? ` · ${resource.statusReason}` : ""}
                </p>
              </div>
              {writable && (
                <div className="flex flex-wrap gap-1">
                  {resource.status === "ENGAGED" && <Button small tone="ghost" onClick={() => void act(() => updateResource(resource.id, { version: resource.version, release: true }))}>Libérer</Button>}
                  {resource.status === "AVAILABLE" && <Button small tone="ghost" onClick={() => setStatus(resource, "UNAVAILABLE")}>Indisponible</Button>}
                  {resource.status === "AVAILABLE" && <Button small tone="ghost" onClick={() => setStatus(resource, "MAINTENANCE")}>Maintenance</Button>}
                  {(resource.status === "UNAVAILABLE" || resource.status === "MAINTENANCE") && <Button small tone="secondary" onClick={() => setStatus(resource, "AVAILABLE")}>Remettre disponible</Button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {lead && (
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <Field label="Code"><input className={inputClass} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></Field>
          <Field label="Libellé"><input className={inputClass} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></Field>
          {detailFields.map((field) => (
            <Field key={field.key} label={field.label}><input className={inputClass} value={draft[field.key] ?? ""} onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })} /></Field>
          ))}
          <div className="flex items-end"><Button disabled={!draft.code.trim() || draft.label.trim().length < 2} onClick={() => void add()}>Ajouter</Button></div>
        </div>
      )}
    </Card>
  );
}
