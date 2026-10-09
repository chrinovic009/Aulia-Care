import { useEffect, useMemo, useState } from "react";
import { DollarSign, RefreshCw, Stethoscope } from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, Panel, StatCard } from "../Administration/adminUi";

type Service = { id: string; name: string; tarifs?: Array<{ prix?: string | number }> };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Reception configures billable admission fees only. Administrative units are
 * managed centrally and must never be exposed as patient-facing services. */
export default function CreateReceptionService() {
  const [fees, setFees] = useState({ general: "", specialist: "" });
  const [message, setMessage] = useState<string | null>(null);
  const load = async () => {
    const data = await apiFetch<Service[]>("/services").catch(() => []);
    const general = data.find((service) => normalize(service.name).includes("consultation generale"));
    const specialist = data.find((service) => normalize(service.name).includes("consultation specialiste"));
    setFees({ general: general?.tarifs?.[0]?.prix ? String(general.tarifs[0].prix) : "", specialist: specialist?.tarifs?.[0]?.prix ? String(specialist.tarifs[0].prix) : "" });
  };
  useEffect(() => { void load(); }, []);
  const configured = useMemo(() => [fees.general, fees.specialist].filter((value) => Number(value) > 0).length, [fees]);
  const saveFee = async (kind: "GENERAL" | "SPECIALIST") => {
    const price = kind === "GENERAL" ? fees.general : fees.specialist;
    await apiFetch("/services/reception-admission-fees", { method: "POST", body: JSON.stringify({ kind, price: Number(price) }) });
    setMessage(`Le tarif CDF de la consultation ${kind === "GENERAL" ? "généraliste" : "spécialiste"} est enregistré.`);
    await load();
  };
  return <AdminPageShell title="Services et tarifs d’admission" subtitle="La réception fixe les frais d’admission. Les unités administratives ne sont ni créées ni affichées ici." actions={<button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><RefreshCw size={16} /> Actualiser</button>}>
    <div className="grid gap-3 md:grid-cols-3"><StatCard icon={<Stethoscope size={20} />} label="Tarifs admission configurés" value={`${configured}/2`} tone="green" /><StatCard icon={<DollarSign size={20} />} label="Généraliste" value={fees.general ? `${Number(fees.general).toLocaleString("fr-CD")} CDF` : "À définir"} tone="blue" /><StatCard icon={<DollarSign size={20} />} label="Spécialiste" value={fees.specialist ? `${Number(fees.specialist).toLocaleString("fr-CD")} CDF` : "À définir"} tone="violet" /></div>
    {message ? <div className="rounded-xl border border-aulia-teal/25 bg-aulia-mist p-4 text-sm text-aulia-navy dark:bg-aulia-teal/10 dark:text-white">{message}</div> : null}
    <Panel title="Frais d’admission facturables" subtitle="Les deux tarifs appliqués automatiquement lors de l’admission patient."><div className="grid gap-4 sm:grid-cols-2">{(["GENERAL", "SPECIALIST"] as const).map((kind) => { const label = kind === "GENERAL" ? "Consultation généraliste" : "Consultation spécialiste"; const key = kind === "GENERAL" ? "general" : "specialist"; return <section key={kind} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><p className="font-semibold text-slate-900 dark:text-white">{label}</p><p className="mt-1 text-xs text-slate-500">Frais d’admission en francs congolais.</p><label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">Tarif CDF<input type="number" min="1" step="1" value={fees[key]} onChange={(event) => setFees((current) => ({ ...current, [key]: event.target.value }))} placeholder="Ex. 10 000" className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-aulia-teal focus:ring-2 focus:ring-aulia-teal/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white" /></label><button disabled={Number(fees[key]) <= 0} onClick={() => void saveFee(kind)} className="mt-3 w-full rounded-lg bg-aulia-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-aulia-teal/90 disabled:opacity-50">Enregistrer ce tarif</button></section>; })}</div></Panel>
  </AdminPageShell>;
}
