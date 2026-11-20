import { useRef, useState } from "react";
import { FileImage, LoaderCircle, Plus, Save, ShieldCheck, X } from "lucide-react";
import type { ImagingReport, ImagingRequestItem } from "../../api/imaging";
import { saveImagingReport, uploadImagingPreview } from "../../api/imaging";
import { buildUrl } from "../../config/api";

type Props = {
  item: ImagingRequestItem;
  onClose: () => void;
  onChanged: () => Promise<void>;
};

export default function ReportEditor({ item, onClose, onChanged }: Props) {
  const [report, setReport] = useState<ImagingReport | null>(item.report || null);
  const [findings, setFindings] = useState(item.report?.findings || "");
  const [impression, setImpression] = useState(item.report?.impression || "");
  const [recommendations, setRecommendations] = useState(item.report?.recommendations || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const verified = Boolean(report?.verified);

  const save = async (shouldVerify: boolean) => {
    if (!findings.trim() || !impression.trim()) {
      setError("Les constatations et la conclusion sont obligatoires.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveImagingReport(item.id, { findings, impression, recommendations, verified: shouldVerify });
      setReport(saved);
      setNotice(shouldVerify ? "Compte rendu validé. Les aperçus sont maintenant en lecture seule." : "Brouillon enregistré. Vous pouvez ajouter un aperçu.");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement du compte rendu impossible.");
    } finally {
      setSaving(false);
    }
  };

  const addPreview = async (file: File | undefined) => {
    if (!file || !report || verified) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await uploadImagingPreview(item.id, file);
      setReport(updated);
      setNotice("Aperçu ajouté au compte rendu.");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ajout de l’aperçu impossible.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="imaging-report-title">
      <section className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-aulia-teal">Compte rendu radiologique</p>
            <h2 id="imaging-report-title" className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{item.patient.lastName} {item.patient.firstName}</h2>
            <p className="mt-1 text-sm text-slate-500">{item.imagingCatalogue?.name || item.bodyPart} · {item.modality}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer le compte rendu"><X className="h-5 w-5" /></button>
        </header>

        <div className="overflow-y-auto p-4 sm:p-5">
          {verified && <p className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><ShieldCheck className="h-4 w-4" /> Compte rendu validé : contenu et aperçus en lecture seule.</p>}
          {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
          {notice && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-200">{notice}</p>}

          <div className="grid gap-4">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Constatations *
              <textarea aria-label="Constatations" rows={5} value={findings} disabled={verified} onChange={(event) => setFindings(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800" />
            </label>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Conclusion *
              <textarea aria-label="Conclusion" rows={3} value={impression} disabled={verified} onChange={(event) => setImpression(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800" />
            </label>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recommandations
              <textarea aria-label="Recommandations" rows={2} value={recommendations} disabled={verified} onChange={(event) => setRecommendations(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800" />
            </label>
          </div>

          <section className="mt-6 rounded-2xl border border-slate-200 p-4 dark:border-slate-800" aria-labelledby="preview-section-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 id="preview-section-title" className="font-semibold text-slate-900 dark:text-white">Aperçus de l’examen</h3>
                <p className="mt-1 text-xs text-slate-500">JPEG, PNG ou WebP · 8 Mo maximum · 12 aperçus au plus</p>
              </div>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choisir un aperçu radiologique" onChange={(event) => void addPreview(event.target.files?.[0])} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={!report || verified || uploading} title={!report ? "Enregistrez d’abord le brouillon" : verified ? "Le compte rendu validé est verrouillé" : "Ajouter un aperçu"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-aulia-teal px-4 py-2 text-sm font-bold text-white hover:bg-[#087c73] disabled:cursor-not-allowed disabled:opacity-50">
                {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {uploading ? "Ajout en cours…" : "Ajouter un aperçu"}
              </button>
            </div>
            {!report && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Enregistrez d’abord un brouillon du compte rendu pour activer l’ajout.</p>}
            {report && (report.imagePaths?.length || 0) === 0 && <p className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-300"><FileImage className="h-4 w-4" /> Aucun aperçu rattaché.</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {report?.imagePaths?.map((_, index) => (
                <figure key={`${report.id}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-800">
                  <img src={buildUrl(`/imaging/${item.id}/report/previews/${index}`)} alt={`Aperçu ${index + 1} de l’examen ${item.imagingCatalogue?.name || item.bodyPart}`} className="max-h-72 w-full object-contain" loading="lazy" />
                  <figcaption className="bg-white px-3 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-300">Aperçu {index + 1} · accès clinique journalisé</figcaption>
                </figure>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Fermer</button>
          {!verified && <button type="button" disabled={saving || uploading} onClick={() => void save(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-aulia-teal px-4 py-2 text-sm font-bold text-aulia-teal disabled:opacity-50"><Save className="h-4 w-4" /> Enregistrer le brouillon</button>}
          {!verified && <button type="button" disabled={saving || uploading} onClick={() => void save(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-aulia-teal px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" /> Enregistrer et valider</button>}
        </footer>
      </section>
    </div>
  );
}
