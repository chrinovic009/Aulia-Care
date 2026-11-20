import { useEffect, useState } from "react";
import { LoaderCircle, ScanLine, Send, ShieldCheck, X } from "lucide-react";
import { fetchAvailableImaging, sendImagingMessage, type MessageContact, type SharedImaging, type StoredMessage } from "../../api/messages";

export default function ImagingPicker({ contact, onClose, onSent }: {
  contact: MessageContact;
  onClose: () => void;
  onSent: (message: StoredMessage) => void;
}) {
  const [items, setItems] = useState<SharedImaging[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [caption, setCaption] = useState("");
  const [authorizePatient, setAuthorizePatient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const forPatient = contact.role === "PATIENT";

  useEffect(() => {
    let active = true;
    fetchAvailableImaging(contact.id)
      .then(data => { if (active) setItems(data); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Impossible de charger les imageries autorisées."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [contact.id]);

  const submit = async () => {
    if (!selectedId || sending || (forPatient && !authorizePatient)) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendImagingMessage(contact.id, { imagingRequestId: selectedId, caption, authorizePatient });
      onSent(sent);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L’imagerie n’a pas été partagée.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="imaging-picker-title" className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        <header className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-700 sm:p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200"><ScanLine className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="imaging-picker-title" className="font-bold text-slate-900 dark:text-white">Partager une imagerie</h2>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">Avec {contact.name}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer"><X className="h-5 w-5" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="mb-4 flex gap-2 rounded-2xl bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-950/60 dark:text-teal-100">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{forPatient
              ? "Seules les imageries de ce patient avec compte rendu vérifié sont proposées. Votre autorisation sera enregistrée."
              : "Seuls le médecin demandeur et le radiologue rattachés à l’examen peuvent recevoir ce partage."}</p>
          </div>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Chargement des examens autorisés…</p>
            : items.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Aucune imagerie partageable avec ce contact.</p>
            : <div className="space-y-2">{items.map(item => (
              <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedId === item.id ? "border-[#00a884] bg-emerald-50 ring-2 ring-[#00a884]/15 dark:bg-emerald-950/30" : "border-slate-200 hover:border-teal-300 dark:border-slate-700"}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><ScanLine className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900 dark:text-white">{item.examName}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.patientName} · {item.modality} · {item.bodyPart}</span>
                  <span className="mt-1 block text-[11px] text-slate-400">{item.hasPreview ? "Aperçu PACS disponible" : "Référence PACS sans aperçu"}</span>
                </span>
                <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${item.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{item.verified ? "Vérifié" : "Non vérifié"}</span>
              </button>
            ))}</div>}

          <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">Commentaire facultatif
            <textarea value={caption} onChange={event => setCaption(event.target.value)} maxLength={2000} rows={2} className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 font-normal outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/15 dark:border-slate-700 dark:bg-slate-950" placeholder="Précisez la raison du partage…" />
          </label>
          {forPatient && (
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <input type="checkbox" checked={authorizePatient} onChange={event => setAuthorizePatient(event.target.checked)} className="mt-1 h-4 w-4 accent-[#00a884]" />
              <span>J’autorise explicitement le partage de cet examen vérifié avec ce patient dans cette conversation privée.</span>
            </label>
          )}
          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-100" role="alert">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-700">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Annuler</button>
          <button type="button" onClick={submit} disabled={!selectedId || sending || (forPatient && !authorizePatient)} className="flex items-center gap-2 rounded-full bg-[#00a884] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#008f72] disabled:cursor-not-allowed disabled:opacity-40">
            {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Partager
          </button>
        </footer>
      </section>
    </div>
  );
}
