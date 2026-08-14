import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { createImagingMachine, fetchImagingMachines, ImagingMachine } from "../../api/imaging";

export default function EquipmentRadio() {
  const [machines, setMachines] = useState<ImagingMachine[]>([]);
  const [name, setName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [isOperational, setIsOperational] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadMachines = async () => {
    const data = await fetchImagingMachines().catch(() => []);
    setMachines(data || []);
  };

  useEffect(() => {
    loadMachines();
  }, []);

  const submit = async () => {
    if (!name.trim()) {
      setMessage("Le nom de l'équipement est requis.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await createImagingMachine({ name: name.trim(), roomNumber: roomNumber.trim() || undefined, isOperational });
      setName("");
      setRoomNumber("");
      setIsOperational(true);
      setMessage("Équipement ajouté avec succès.");
      await loadMachines();
      setShowForm(false);
    } catch (error: any) {
      setMessage(error?.message || "Impossible d'ajouter l'équipement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Radiologie | Équipements" description="Suivi des équipements et maintenance" />
      <PageBreadcrumb pageTitle="Équipements & Maintenance" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">État et maintenance des équipements</h1>
            <p className="mt-2 text-sm text-slate-300">Supervision du parc radiologique, alertes et interventions biomédicales.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
          >
            {showForm ? "Fermer" : "Ajouter un équipement"}
          </button>
        </div>
      </section>

      {showForm ? (
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Ajouter un nouvel équipement</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-700 dark:text-slate-300">
              Nom de l'équipement
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>
            <label className="block text-sm text-slate-700 dark:text-slate-300">
              Salle / Localisation
              <input
                value={roomNumber}
                onChange={(event) => setRoomNumber(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 md:col-span-2">
              <input
                type="checkbox"
                checked={isOperational}
                onChange={(event) => setIsOperational(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900"
              />
              En service
            </label>
          </div>
          {message ? <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">{message}</div> : null}
          <button
            type="button"
            disabled={loading}
            onClick={submit}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Enregistrement..." : "Enregistrer l'équipement"}
          </button>
        </section>
      ) : null}

      <section className="mt-5 rounded-xl bg-white p-6 shadow-sm dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Équipements enregistrés</h2>
        {machines.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Aucun équipement radiologique répertorié.</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {machines.map((machine) => (
              <div key={machine.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{machine.name}</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{machine.roomNumber || 'Localisation non renseignée'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${machine.isOperational ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}`}>
                    {machine.isOperational ? 'En service' : 'En panne'}
                  </span>
                </div>
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Mis à jour le {new Date(machine.updatedAt).toLocaleDateString('fr-FR')} à {new Date(machine.updatedAt).toLocaleTimeString('fr-FR')}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
