import type { CareEvent } from "../../../api/careWorkflow";

export type PartogramSettings = { alertLineFromCm?: number; alertRateCmPerHour?: number; actionLineOffsetHours?: number; validated?: boolean };
/** Placeholder reference lines until the establishment sets and validates its own protocol. */
export const DEFAULT_PARTOGRAM: Required<PartogramSettings> = { alertLineFromCm: 4, alertRateCmPerHour: 1, actionLineOffsetHours: 4, validated: false };

const num = (value: unknown) => { const n = Number(String(value ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

/**
 * Draws what midwives documented (cervical dilation, fetal heart rate) against
 * the reference lines configured by the establishment. It flags nothing and
 * decides nothing: reading the chart stays a clinical act.
 */
export function PartogramChart({ entries, settings }: { entries: CareEvent[]; settings?: PartogramSettings }) {
  const conf = { ...DEFAULT_PARTOGRAM, ...(settings ?? {}) };
  const points = entries
    .map((event) => ({ at: new Date(event.occurredAt).getTime(), dilation: num(event.payload?.cervicalDilation), fhr: num(event.payload?.fetalHeartRate) }))
    .sort((a, b) => a.at - b.at);
  if (!points.length) return <p className="text-sm text-slate-500">Aucune mesure : la courbe apparaît dès la première saisie.</p>;
  const start = points[0].at;
  const hours = Math.max(12, Math.ceil((points[points.length - 1].at - start) / 3_600_000) + 2);
  const W = 640, H = 260, L = 36, B = 24, T = 10;
  const x = (h: number) => L + (h / hours) * (W - L - 10);
  const yD = (cm: number) => T + (1 - cm / 10) * (H - T - B);
  const firstActive = points.find((point) => point.dilation !== null && point.dilation >= conf.alertLineFromCm);
  const alertStartH = firstActive ? (firstActive.at - start) / 3_600_000 : null;
  const alertEndH = alertStartH !== null ? alertStartH + (10 - conf.alertLineFromCm) / conf.alertRateCmPerHour : null;
  const dil = points.filter((point) => point.dilation !== null);
  const fhr = points.filter((point) => point.fhr !== null);
  const yF = (bpm: number) => 8 + (1 - (bpm - 80) / 120) * 92;
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" role="img" aria-label="Partogramme : dilatation du col">
        {Array.from({ length: 11 }, (_, cm) => <g key={cm}><line x1={L} x2={W - 10} y1={yD(cm)} y2={yD(cm)} stroke="#e2e8f0" /><text x={L - 6} y={yD(cm) + 4} fontSize="10" textAnchor="end" fill="#64748b">{cm}</text></g>)}
        {Array.from({ length: hours + 1 }, (_, h) => <g key={h}><line x1={x(h)} x2={x(h)} y1={T} y2={H - B} stroke="#f1f5f9" /><text x={x(h)} y={H - 8} fontSize="10" textAnchor="middle" fill="#64748b">{h}h</text></g>)}
        {alertStartH !== null && alertEndH !== null && (
          <>
            <line x1={x(alertStartH)} y1={yD(conf.alertLineFromCm)} x2={x(alertEndH)} y2={yD(10)} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth="2" />
            <line x1={x(alertStartH + conf.actionLineOffsetHours)} y1={yD(conf.alertLineFromCm)} x2={x(alertEndH + conf.actionLineOffsetHours)} y2={yD(10)} stroke="#dc2626" strokeDasharray="6 4" strokeWidth="2" />
          </>
        )}
        <polyline fill="none" stroke="#0d9488" strokeWidth="2.5" points={dil.map((p) => `${x((p.at - start) / 3_600_000)},${yD(p.dilation!)}`).join(" ")} />
        {dil.map((p, i) => <circle key={i} cx={x((p.at - start) / 3_600_000)} cy={yD(p.dilation!)} r="4" fill="#0d9488" />)}
        <text x={L + 4} y={T + 12} fontSize="11" fill="#0A1D3A">Dilatation (cm)</text>
      </svg>
      {fhr.length > 0 && (
        <svg viewBox={`0 0 ${W} 110`} className="w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" role="img" aria-label="Rythme cardiaque fœtal">
          {[80, 110, 160, 200].map((bpm) => <g key={bpm}><line x1={L} x2={W - 10} y1={yF(bpm)} y2={yF(bpm)} stroke="#e2e8f0" /><text x={L - 6} y={yF(bpm) + 4} fontSize="10" textAnchor="end" fill="#64748b">{bpm}</text></g>)}
          <polyline fill="none" stroke="#2563eb" strokeWidth="2" points={fhr.map((p) => `${x((p.at - start) / 3_600_000)},${yF(p.fhr!)}`).join(" ")} />
          {fhr.map((p, i) => <circle key={i} cx={x((p.at - start) / 3_600_000)} cy={yF(p.fhr!)} r="3" fill="#2563eb" />)}
          <text x={L + 4} y={16} fontSize="11" fill="#0A1D3A">BCF (/min)</text>
        </svg>
      )}
      <p className="text-xs text-slate-500">
        Lignes de référence {conf.validated ? "du protocole de l’établissement" : "par défaut, à faire valider par l’établissement"} : alerte (orange) à {conf.alertRateCmPerHour} cm/h dès {conf.alertLineFromCm} cm,
        action (rouge) {conf.actionLineOffsetHours} h plus tard. La lecture du partogramme reste celle de la sage-femme ou du médecin.
      </p>
    </div>
  );
}
