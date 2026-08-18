import { FormEvent, useEffect, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import AuliaCodeScanner from "../../components/common/AuliaCodeScanner";
import { fetchReceptionWatchDashboard, pairWatchAtReception, ReceptionWatchDashboard } from "../../api/wearables";
import { apiFetch } from "../../config/api";

type PatientChoice = { id: string; firstName: string; lastName: string };

const cdf = (value: string | number) => new Intl.NumberFormat("fr-CD", { style: "currency", currency: "CDF", maximumFractionDigits: 0 }).format(Number(value || 0));
const watchName = (brand: string) => brand === "APPLE" ? "Apple Watch" : "Samsung Galaxy Watch";

export default function MontresReception() {
  const [data, setData] = useState<ReceptionWatchDashboard | null>(null);
  const [message, setMessage] = useState("");
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<PatientChoice[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientChoice | null>(null);
  const [assetCode, setAssetCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  const load = async () => {
    try { setData(await fetchReceptionWatchDashboard()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Impossible de charger le parc de montres."); }
  };
  useEffect(() => { void load(); }, []);

  const closePairing = () => {
    setIsPairingOpen(false); setIsScanning(false); setSelectedPatient(null);
    setPatients([]); setQuery(""); setAssetCode("");
  };
  const searchPatients = async () => {
    if (query.trim().length < 2) { setMessage("Saisissez au moins deux lettres du nom du patient."); return; }
    try { setPatients(await apiFetch<PatientChoice[]>(`/patients/search?name=${encodeURIComponent(query.trim())}`)); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Recherche impossible."); }
  };
  const pair = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPatient || !assetCode) { setMessage("Sélectionnez le patient puis scannez le QR code Aulia de la montre."); return; }
    try {
      await pairWatchAtReception(selectedPatient.id, assetCode);
      closePairing(); await load();
      setMessage("Montre Aulia associée. L’abonnement mensuel est créé ; la montre sera active après règlement.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Association refusée."); }
  };
  const beginFromInventory = (serialNumber: string) => { setAssetCode(serialNumber); setIsPairingOpen(true); };

  return <div className="mx-auto max-w-7xl space-y-6">
    <PageMeta title="Distribution des montres | Réception" description="Distribution sécurisée des montres Aulia Care." />
    <section className="aulia-card p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-aulia-teal">Distribution contrôlée</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Distribuer une montre Aulia</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Choisissez le patient, puis scannez le QR code de l’appareil. Seules les montres Aulia reçues et disponibles dans l’inventaire peuvent être attribuées.</p>
    </div><button type="button" onClick={() => setIsPairingOpen(true)} className="rounded-xl bg-aulia-navy px-4 py-3 text-sm font-semibold text-white">Connecter une montre</button></div></section>
    {message ? <div className="rounded-2xl bg-aulia-mist px-4 py-3 text-sm text-aulia-navy dark:bg-aulia-teal/10 dark:text-aulia-mist">{message}</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["En stock", data?.summary.available || 0], ["Déjà distribuées", data?.summary.assigned || 0], ["Abonnements à régler", data?.summary.subscriptionsDue || 0], ["Parc reçu", data?.summary.totalDevices || 0]].map(([label, value]) => <article key={String(label)} className="aulia-card p-5"><p className="text-sm text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-3xl font-semibold text-aulia-navy dark:text-white">{value}</p></article>)}</section>
    <section className="aulia-card overflow-hidden"><div className="border-b border-slate-200 p-5 dark:border-slate-800"><h2 className="font-semibold text-slate-900 dark:text-white">Montres prêtes à distribuer</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Les 10 premières montres disponibles sont affichées. Elles restent dans l’inventaire jusqu’à l’attribution.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr><th className="px-5 py-3">Référence Aulia</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Plateforme</th><th className="px-5 py-3" /></tr></thead><tbody>{data?.availableDevices.length ? data.availableDevices.map((device) => <tr key={device.serialNumber} className="border-t border-slate-100 dark:border-slate-800"><td className="px-5 py-4 font-mono text-xs text-slate-700 dark:text-slate-200">{device.serialNumber}</td><td className="px-5 py-4">{watchName(device.lot.manufacturer)}</td><td className="px-5 py-4 text-slate-500 dark:text-slate-400">{device.platform}</td><td className="px-5 py-4"><button type="button" onClick={() => beginFromInventory(device.serialNumber)} className="font-semibold text-aulia-teal">Attribuer</button></td></tr>) : <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">Aucune montre disponible. La réception ne peut distribuer que le stock enregistré par l’administration.</td></tr>}</tbody></table></div></section>
    <section className="aulia-card overflow-hidden"><div className="border-b border-slate-200 p-5 dark:border-slate-800"><h2 className="font-semibold text-slate-900 dark:text-white">Suivi des abonnements</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr><th className="px-5 py-3">Patient</th><th className="px-5 py-3">Montre</th><th className="px-5 py-3">État</th><th className="px-5 py-3">Jours restants</th><th className="px-5 py-3">Mensualité</th></tr></thead><tbody>{data?.subscriptions.items.length ? data.subscriptions.items.map((item) => <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-5 py-4 font-medium text-slate-900 dark:text-white">{item.patient.firstName} {item.patient.lastName}</td><td className="px-5 py-4">{watchName(item.inventoryDevice.lot.manufacturer)}</td><td className="px-5 py-4">{item.status === "ACTIVE" ? "Active" : item.status === "OVERDUE" ? "À régulariser" : "En attente de paiement"}</td><td className="px-5 py-4">{item.daysRemaining}</td><td className="px-5 py-4">{cdf(item.amount)}</td></tr>) : <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">Aucun abonnement patient.</td></tr>}</tbody></table></div></section>
    {isPairingOpen ? <div className="fixed inset-0 z-[100000] grid place-items-center overflow-y-auto bg-slate-950/60 p-4"><form onSubmit={pair} className="my-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6 dark:bg-slate-900"><p className="text-xs font-bold uppercase tracking-[.18em] text-aulia-teal">Connexion sécurisée</p><h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Connecter une montre Aulia</h2><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">1. Sélectionnez le patient. 2. Ouvrez le scanner. 3. Cadrez le QR code Aulia. Aucun code technique ne doit être saisi manuellement.</p><div className="mt-5 flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom du patient" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><button type="button" onClick={() => void searchPatients()} className="rounded-xl border border-aulia-teal/30 px-4 text-sm font-semibold text-aulia-teal">Rechercher</button></div>{patients.length ? <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">{patients.map((patient) => <button type="button" key={patient.id} onClick={() => { setSelectedPatient(patient); setAssetCode(""); setIsScanning(false); }} className={`block w-full px-4 py-3 text-left text-sm ${selectedPatient?.id === patient.id ? "bg-aulia-mist text-aulia-navy dark:bg-aulia-teal/15 dark:text-white" : "text-slate-700 dark:text-slate-200"}`}>{patient.firstName} {patient.lastName}</button>)}</div> : null}{selectedPatient ? <p className="mt-3 text-sm font-medium text-aulia-teal">Patient choisi : {selectedPatient.firstName} {selectedPatient.lastName}</p> : null}{!assetCode && !isScanning ? <button type="button" disabled={!selectedPatient} onClick={() => setIsScanning(true)} className="mt-4 w-full rounded-xl bg-aulia-teal px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">Scanner la montre Aulia</button> : null}{isScanning ? <div className="mt-4"><AuliaCodeScanner onDetected={(code) => { setAssetCode(code); setIsScanning(false); }} onClose={() => setIsScanning(false)} /></div> : null}{assetCode ? <div className="mt-4 rounded-xl bg-aulia-mist p-3 text-sm text-aulia-navy dark:bg-aulia-teal/10 dark:text-aulia-mist"><span className="font-semibold">Montre Aulia détectée.</span> Elle sera vérifiée par le serveur avant toute attribution.</div> : null}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={closePairing} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700 dark:text-white">Annuler</button><button disabled={!selectedPatient || !assetCode} className="rounded-xl bg-aulia-navy px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">Vérifier et connecter</button></div></form></div> : null}
  </div>;
}
