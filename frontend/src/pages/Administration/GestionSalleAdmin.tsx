import { useEffect, useMemo, useState } from "react";
import { Bed, DoorOpen, Hospital, Plus, ShieldAlert } from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, DataTable, Panel, StatCard, StatusBadge } from "./adminUi";

type RoomRecord = {
  id: string;
  number: string;
  status: string;
  serviceUnit?: { name?: string; department?: { name?: string } };
  beds?: Array<{ code: string; status: string; hospitalization?: { patient?: { firstName?: string; lastName?: string }; status?: string } | null }>;
};

type RoomPayload = {
  rooms?: RoomRecord[];
  operatingRooms?: Array<{ id: string; name: string; location?: string; capacity: number; active: boolean; surgeries?: Array<{ status?: string; procedureName?: string; scheduledAt?: string }> }>;
};

type ServiceUnit = { id: string; name: string; department?: { name?: string } };

export default function GestionSalleAdmin() {
  const [payload, setPayload] = useState<RoomPayload>({});
  const [units, setUnits] = useState<ServiceUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [roomForm, setRoomForm] = useState({ number: "", serviceUnitId: "" });
  const [bedForm, setBedForm] = useState({ roomId: "", code: "" });
  const [operatingForm, setOperatingForm] = useState({ name: "", location: "", capacity: "1" });

  useEffect(() => {
    const load = () => Promise.all([
      apiFetch<RoomPayload>("/administration/rooms").catch(() => ({})),
      apiFetch<ServiceUnit[]>("/administration/service-units").catch(() => []),
    ])
      .then(([roomsData, unitsData]) => {
        setPayload(roomsData);
        setUnits(unitsData);
      })
      .finally(() => setIsLoading(false));
    load();
    window.addEventListener("d7:administrationUpdated", load);
    return () => window.removeEventListener("d7:administrationUpdated", load);
  }, []);

  const reload = async () => {
    const [roomsData, unitsData] = await Promise.all([
      apiFetch<RoomPayload>("/administration/rooms").catch(() => ({})),
      apiFetch<ServiceUnit[]>("/administration/service-units").catch(() => []),
    ]);
    setPayload(roomsData);
    setUnits(unitsData);
  };

  const createRoom = async () => {
    if (!roomForm.number || !roomForm.serviceUnitId) return;
    await apiFetch("/administration/rooms", { method: "POST", body: JSON.stringify(roomForm) });
    setRoomForm({ number: "", serviceUnitId: "" });
    await reload();
  };

  const createBed = async () => {
    if (!bedForm.roomId || !bedForm.code) return;
    await apiFetch("/administration/beds", { method: "POST", body: JSON.stringify(bedForm) });
    setBedForm({ roomId: "", code: "" });
    await reload();
  };

  const createOperatingRoom = async () => {
    if (!operatingForm.name) return;
    await apiFetch("/administration/operating-rooms", { method: "POST", body: JSON.stringify({ ...operatingForm, capacity: Number(operatingForm.capacity || 1) }) });
    setOperatingForm({ name: "", location: "", capacity: "1" });
    await reload();
  };

  const metrics = useMemo(() => {
    const rooms = payload.rooms || [];
    const beds = rooms.flatMap((room) => room.beds || []);
    return {
      rooms: rooms.length,
      beds: beds.length,
      free: beds.filter((bed) => bed.status === "FREE").length,
      occupied: beds.filter((bed) => bed.status !== "FREE").length,
      operatingRooms: payload.operatingRooms?.length || 0,
    };
  }, [payload]);

  return (
    <AdminPageShell title="Salles" subtitle="Suivi des chambres, lits et disponibilites d'hospitalisation.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<DoorOpen size={20} />} label="Salles" value={metrics.rooms} />
        <StatCard icon={<Bed size={20} />} label="Lits" value={metrics.beds} tone="blue" />
        <StatCard icon={<Hospital size={20} />} label="Lits libres" value={metrics.free} tone="green" />
        <StatCard icon={<ShieldAlert size={20} />} label="Lits occupes/reserves" value={metrics.occupied} tone="amber" />
        <StatCard icon={<Hospital size={20} />} label="Blocs operatoires" value={metrics.operatingRooms} tone="violet" />
      </div>

      <Panel title="Occupation des salles" subtitle="Lecture directe des modeles Room et Bed.">
        <DataTable
          headers={["Salle", "Departement", "Unite", "Lits", "Patient assigne", "Disponibles", "Statut"]}
          empty={isLoading ? "Chargement des salles..." : "Aucune salle configuree."}
          rows={(payload.rooms || []).map((room) => {
            const beds = room.beds || [];
            const free = beds.filter((bed) => bed.status === "FREE").length;
            return [
              <span key="room" className="font-semibold text-slate-900 dark:text-white">{room.number}</span>,
              room.serviceUnit?.department?.name || "-",
              room.serviceUnit?.name || "-",
              beds.map((bed) => `${bed.code} (${bed.status})`).join(", ") || "-",
              beds.map((bed) => [bed.hospitalization?.patient?.firstName, bed.hospitalization?.patient?.lastName].filter(Boolean).join(" ")).filter(Boolean).join(", ") || "-",
              `${free}/${beds.length}`,
              <StatusBadge key="status" label={room.status || "AVAILABLE"} tone={room.status === "AVAILABLE" ? "green" : "amber"} />,
            ];
          })}
        />
      </Panel>

      <Panel title="Blocs operatoires" subtitle="Gestion des salles de chirurgie et activite planifiee.">
        <DataTable
          headers={["Bloc", "Localisation", "Capacite", "Interventions recentes", "Statut"]}
          rows={(payload.operatingRooms || []).map((room) => [
            room.name,
            room.location || "-",
            room.capacity,
            room.surgeries?.slice(0, 3).map((surgery) => surgery.procedureName || surgery.status).join(", ") || "-",
            <StatusBadge key="status" label={room.active ? "Actif" : "Inactif"} tone={room.active ? "green" : "amber"} />,
          ])}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Nouvelle salle">
          <div className="space-y-3">
            <input value={roomForm.number} onChange={(event) => setRoomForm((current) => ({ ...current, number: event.target.value }))} placeholder="Numero de salle" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <select value={roomForm.serviceUnitId} onChange={(event) => setRoomForm((current) => ({ ...current, serviceUnitId: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">Unite de service</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.department?.name ? `${unit.department.name} - ` : ""}{unit.name}</option>)}
            </select>
            <button onClick={createRoom} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={17} /> Ajouter la salle</button>
          </div>
        </Panel>

        <Panel title="Nouveau lit">
          <div className="space-y-3">
            <select value={bedForm.roomId} onChange={(event) => setBedForm((current) => ({ ...current, roomId: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">Salle</option>
              {(payload.rooms || []).map((room) => <option key={room.id} value={room.id}>{room.number}</option>)}
            </select>
            <input value={bedForm.code} onChange={(event) => setBedForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code du lit" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createBed} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={17} /> Ajouter le lit</button>
          </div>
        </Panel>

        <Panel title="Nouveau bloc operatoire">
          <div className="space-y-3">
            <input value={operatingForm.name} onChange={(event) => setOperatingForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom du bloc" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={operatingForm.location} onChange={(event) => setOperatingForm((current) => ({ ...current, location: event.target.value }))} placeholder="Localisation" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={operatingForm.capacity} onChange={(event) => setOperatingForm((current) => ({ ...current, capacity: event.target.value }))} type="number" placeholder="Capacite" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createOperatingRoom} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200"><Plus size={17} /> Ajouter le bloc</button>
          </div>
        </Panel>
      </div>
    </AdminPageShell>
  );
}
