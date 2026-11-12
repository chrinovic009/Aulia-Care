import { useEffect, useState, useSyncExternalStore } from "react";
import { discardEntry, flushQueue, queuedEntries, subscribeToQueue, type QueuedEntry } from "./offlineQueue";

let snapshot: { online: boolean; entries: QueuedEntry[] } = { online: true, entries: [] };
const read = () => {
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  const entries = queuedEntries();
  if (online !== snapshot.online || JSON.stringify(entries) !== JSON.stringify(snapshot.entries)) snapshot = { online, entries };
  return snapshot;
};

const time = (value: string) => new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Connection state and entries waiting on this device. Hidden when everything is sent. */
export function OfflineStatusBanner() {
  const { online, entries } = useSyncExternalStore(subscribeToQueue, read, read);
  const [open, setOpen] = useState(false);
  const pending = entries.filter((entry) => entry.status === "PENDING");
  const rejected = entries.filter((entry) => entry.status === "REJECTED");
  useEffect(() => { if (rejected.length) setOpen(true); }, [rejected.length]);
  if (online && !entries.length) return null;

  const tone = !online ? "border-amber-300 bg-amber-50 text-amber-900" : rejected.length ? "border-red-300 bg-red-50 text-red-800" : "border-aulia-teal/30 bg-aulia-mist text-aulia-navy";
  return (
    <div className={`mx-4 mt-3 rounded-xl border px-4 py-2 text-sm ${tone}`} role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <strong>{online ? "Connexion rétablie" : "Hors ligne"}</strong>
          {" · "}
          {pending.length ? `${pending.length} saisie(s) en attente d’envoi sur cet appareil` : "aucune saisie en attente"}
          {rejected.length ? ` · ${rejected.length} refusée(s) à vérifier` : ""}
          {!online && " — les signes vitaux et événements de soins restent saisissables, ils seront envoyés automatiquement."}
        </p>
        <div className="flex gap-3">
          {online && pending.length > 0 && <button type="button" className="font-bold underline" onClick={() => void flushQueue()}>Envoyer maintenant</button>}
          {entries.length > 0 && <button type="button" className="font-bold underline" onClick={() => setOpen((value) => !value)}>{open ? "Masquer" : "Détails"}</button>}
        </div>
      </div>
      {open && entries.length > 0 && (
        <ul className="mt-2 space-y-1">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{time(entry.createdAt)} · {entry.label}{entry.status === "REJECTED" ? ` — refusée : ${entry.error}` : ""}</span>
              {entry.status === "REJECTED" && (
                <button type="button" className="text-xs font-bold underline" onClick={() => { if (window.confirm("Retirer cette saisie refusée ? Ressaisissez-la si nécessaire.")) discardEntry(entry.id); }}>Retirer</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
