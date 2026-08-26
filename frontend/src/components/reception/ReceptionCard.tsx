import { useEffect, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { MoreDotIcon } from "../../icons";
import { fetchPatientsFromDatabase, type PatientRecord } from "../../api/reception";
import { usePlatformLayers } from "../../context/PlatformLayersContext";

type PatientWithAddress = PatientRecord & {
  address?: string | null;
};

type AddressCategory = {
  label: string;
  count: number;
  percentage: number;
};

export default function DemographicCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [addressCategories, setAddressCategories] = useState<AddressCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState(false);
  const { isEnabled } = usePlatformLayers();

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  const printReport = () => {
    const printWindow = window.open("", "aulia-provenance-print", "width=900,height=700");
    if (!printWindow) { setError("L’impression a été bloquée par le navigateur. Autorisez les fenêtres contextuelles puis réessayez."); return; }
    const rows = displayCategories.map((item) => `<tr><td>${item.label}</td><td>${item.count}</td><td>${item.percentage}%</td></tr>`).join("");
    printWindow.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de provenance — Aulia Care</title><style>body{font-family:Arial,sans-serif;color:#0A1D3A;padding:30px}h1{color:#0D9488}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #cbd5e1;padding:10px;text-align:left}th{background:#e6fffb}@media print{body{padding:0}}</style></head><body><h1>Aulia Care</h1><h2>Rapport officiel — provenance des patients</h2><p>Édité le ${new Intl.DateTimeFormat("fr-FR", { dateStyle:"long", timeStyle:"short" }).format(new Date())}</p><table><thead><tr><th>Zone de provenance</th><th>Patients</th><th>Part</th></tr></thead><tbody>${rows}</tbody></table><p>Document de synthèse fondé sur les adresses administratives disponibles.</p></body></html>`);
    printWindow.document.close(); printWindow.focus(); window.setTimeout(() => printWindow.print(), 250);
  };

  useEffect(() => {
    const loadAddressStats = async () => {
      try {
        setError(null);
        const patients = (await fetchPatientsFromDatabase()) as PatientWithAddress[];
        const categoryMap = new Map<string, { label: string; count: number }>();

        patients.forEach((patient) => {
          const address = (patient.address ?? "").trim();
          if (!address) return;

          const words = address.replace(/\s+/g, " ").split(" ").filter(Boolean);
          const twoWords = words.slice(0, 2).join(" ");
          if (!twoWords) return;

          const normalizedKey = twoWords.toLowerCase();
          const label = categoryMap.get(normalizedKey)?.label ??
            twoWords
              .split(" ")
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(" ");

          categoryMap.set(normalizedKey, {
            label,
            count: (categoryMap.get(normalizedKey)?.count ?? 0) + 1,
          });
        });

        const totalPatients = Array.from(categoryMap.values()).reduce((sum, item) => sum + item.count, 0);
        const categories = Array.from(categoryMap.values())
          .map((item) => ({
            ...item,
            percentage: totalPatients > 0 ? Math.round((item.count / totalPatients) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4);

        setAddressCategories(categories);
      } catch (err) {
        console.error("Impossible de charger les provenances depuis la base de données:", err);
        setError("Impossible de charger les provenances depuis la base de données.");
      }
    };

    loadAddressStats();
  }, []);

  const displayCategories = addressCategories.length > 0 ? addressCategories : [
    { label: "Aucune catégorie", count: 0, percentage: 0 },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      {/* HEADER */}
      <div className="flex justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Provenance des patients
          </h3>

          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            Répartition basée sur les adresses renseignées dans les dossiers accessibles.
          </p>
        </div>

        <div className="relative inline-block">
          <button className="dropdown-toggle" onClick={toggleDropdown}>
            <MoreDotIcon className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 size-6" />
          </button>

          <Dropdown
            isOpen={isOpen}
            onClose={closeDropdown}
            className="w-44 p-2"
          >
            <DropdownItem
              onItemClick={() => { closeDropdown(); if (!isEnabled("AI")) setUpgradeNotice(true); }}
              className="flex w-full rounded-lg text-left font-normal text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              {isEnabled("AI") ? "Voir les statistiques" : "🔒 Voir les statistiques"}
            </DropdownItem>

            <DropdownItem
              onItemClick={() => { closeDropdown(); printReport(); }}
              className="flex w-full rounded-lg text-left font-normal text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              Exporter le rapport
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {upgradeNotice ? <div className="fixed inset-0 z-[100000] grid place-items-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950"><p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Fonctionnalité Aulia AI</p><h2 className="mt-2 text-xl font-bold text-aulia-navy dark:text-white">Statistiques intelligentes indisponibles</h2><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">L’analyse avancée des zones de provenance et les suggestions associées nécessitent la couche Aulia Care AI.</p><button type="button" onClick={() => setUpgradeNotice(false)} className="mt-6 rounded-xl bg-aulia-teal px-4 py-2 font-semibold text-white">Retour</button></section></div> : null}

      {/* CONTENT */}
      <div className="mt-6 space-y-5">
        {displayCategories.map((category, index) => {
          const colorClasses = [
            "bg-blue-100 dark:bg-blue-500/10",
            "bg-emerald-100 dark:bg-emerald-500/10",
            "bg-orange-100 dark:bg-orange-500/10",
            "bg-rose-100 dark:bg-rose-500/10",
          ];

          const barClasses = [
            "bg-blue-500",
            "bg-emerald-500",
            "bg-orange-500",
            "bg-rose-500",
          ];

          const colorClass = colorClasses[index] ?? "bg-slate-100 dark:bg-slate-500/10";
          const barClass = barClasses[index] ?? "bg-slate-500";

          return (
            <div key={category.label} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colorClass}`}>
                  <div className={`h-4 w-4 rounded-full ${barClass}`}></div>
                </div>

                <div>
                  <p className="font-semibold text-gray-800 text-theme-sm dark:text-white/90">
                    {category.label}
                  </p>

                  <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                    {category.count} patients enregistrés
                  </span>
                </div>
              </div>

              <div className="flex w-full max-w-[160px] items-center gap-3">
                <div className="relative h-2 w-full rounded-sm bg-gray-200 dark:bg-gray-800">
                  <div className={`absolute left-0 top-0 h-full rounded-sm ${barClass}`} style={{ width: `${category.percentage}%` }}></div>
                </div>

                <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                  {category.percentage}%
                </p>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
