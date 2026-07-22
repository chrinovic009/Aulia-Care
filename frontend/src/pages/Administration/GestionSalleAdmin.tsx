import { useEffect, useMemo, useState } from "react";
import { Bed, DoorOpen, Hospital, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { apiFetch } from "../../config/api";
import { Modal } from "../../components/ui/modal";
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
  const [editingRoom, setEditingRoom] = useState<RoomRecord | null>(null);
  const [editingOperatingRoom, setEditingOperatingRoom] = useState<RoomPayload['operatingRooms'][number] | null>(null);
  const [deleteRoomTarget, setDeleteRoomTarget] = useState<RoomRecord | null>(null);
  const [deleteOperatingRoomTarget, setDeleteOperatingRoomTarget] = useState<RoomPayload['operatingRooms'][number] | null>(null);
  const [roomEditForm, setRoomEditForm] = useState({ number: "", serviceUnitId: "", status: "AVAILABLE" });
  const [operatingRoomEditForm, setOperatingRoomEditForm] = useState({ name: "", location: "", capacity: "1", active: true });

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

  const openRoomEditModal = (room: RoomRecord) => {
    setEditingRoom(room);
    setRoomEditForm({ number: room.number || "", serviceUnitId: room.serviceUnit?.name ? (units.find((unit) => unit.name === room.serviceUnit?.name)?.id || "") : "", status: room.status || "AVAILABLE" });
  };

  const closeRoomEditModal = () => {
    setEditingRoom(null);
    setRoomEditForm({ number: "", serviceUnitId: "", status: "AVAILABLE" });
  };

  const saveRoom = async () => {
    if (!editingRoom) return;
    await apiFetch(`/administration/rooms/${editingRoom.id}`, { method: "PATCH", body: JSON.stringify(roomEditForm) });
    closeRoomEditModal();
    await reload();
  };

  const confirmDeleteRoom = async () => {
    if (!deleteRoomTarget) return;
    await apiFetch(`/administration/rooms/${deleteRoomTarget.id}`, { method: "DELETE" });
    setDeleteRoomTarget(null);
    await reload();
  };

  const openOperatingRoomEditModal = (room: NonNullable<RoomPayload['operatingRooms']>[number]) => {
    setEditingOperatingRoom(room);
    setOperatingRoomEditForm({ name: room.name || "", location: room.location || "", capacity: String(room.capacity || 1), active: Boolean(room.active) });
  };

  const closeOperatingRoomEditModal = () => {
    setEditingOperatingRoom(null);
    setOperatingRoomEditForm({ name: "", location: "", capacity: "1", active: true });
  };

  const saveOperatingRoom = async () => {
    if (!editingOperatingRoom) return;
    await apiFetch(`/administration/operating-rooms/${editingOperatingRoom.id}`, { method: "PATCH", body: JSON.stringify({ ...operatingRoomEditForm, capacity: Number(operatingRoomEditForm.capacity || 1) }) });
    closeOperatingRoomEditModal();
    await reload();
  };

  const confirmDeleteOperatingRoom = async () => {
    if (!deleteOperatingRoomTarget) return;
    await apiFetch(`/administration/operating-rooms/${deleteOperatingRoomTarget.id}`, { method: "DELETE" });
    setDeleteOperatingRoomTarget(null);
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
          headers={["Salle", "Departement", "Unite", "Lits", "Patient assigne", "Disponibles", "Statut", "Actions"]}
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
              <div key="actions" className="flex gap-2">
                <button onClick={() => openRoomEditModal(room)} className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100" title="Modifier"><Pencil size={16} /></button>
                <button onClick={() => setDeleteRoomTarget(room)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Supprimer"><Trash2 size={16} /></button>
              </div>,
            ];
          })}
        />
      </Panel>

      <Panel title="Blocs operatoires" subtitle="Gestion des salles de chirurgie et activite planifiee.">
        <DataTable
          headers={["Bloc", "Localisation", "Capacite", "Interventions recentes", "Statut", "Actions"]}
          rows={(payload.operatingRooms || []).map((room) => [
            room.name,
            room.location || "-",
            room.capacity,
            room.surgeries?.slice(0, 3).map((surgery) => surgery.procedureName || surgery.status).join(", ") || "-",
            <StatusBadge key="status" label={room.active ? "Actif" : "Inactif"} tone={room.active ? "green" : "amber"} />,
            <div key="actions" className="flex gap-2">
              <button onClick={() => openOperatingRoomEditModal(room)} className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100" title="Modifier"><Pencil size={16} /></button>
              <button onClick={() => setDeleteOperatingRoomTarget(room)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Supprimer"><Trash2 size={16} /></button>
            </div>,
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

      <Modal isOpen={Boolean(editingRoom)} onClose={closeRoomEditModal} className="max-w-xl p-0">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Modifier la salle</h3>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Numéro</label>
              <input value={roomEditForm.number} onChange={(event) => setRoomEditForm((current) => ({ ...current, number: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Unité de service</label>
              <select value={roomEditForm.serviceUnitId} onChange={(event) => setRoomEditForm((current) => ({ ...current, serviceUnitId: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm">
                <option value="">Sélectionner</option>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.department?.name ? `${unit.department.name} - ` : ""}{unit.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Statut</label>
              <select value={roomEditForm.status} onChange={(event) => setRoomEditForm((current) => ({ ...current, status: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm">
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="OCCUPIED">OCCUPIED</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={closeRoomEditModal} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
            <button onClick={saveRoom} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Enregistrer</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleteRoomTarget)} onClose={() => setDeleteRoomTarget(null)} className="max-w-lg p-0">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Confirmer la suppression</h3>
          <p className="mt-2 text-sm text-slate-500">Voulez-vous vraiment supprimer la salle <span className="font-semibold text-slate-800">{deleteRoomTarget?.number}</span> ?</p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setDeleteRoomTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Non</button>
            <button onClick={confirmDeleteRoom} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Oui, supprimer</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(editingOperatingRoom)} onClose={closeOperatingRoomEditModal} className="max-w-xl p-0">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Modifier le bloc opératoire</h3>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nom</label>
              <input value={operatingRoomEditForm.name} onChange={(event) => setOperatingRoomEditForm((current) => ({ ...current, name: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Localisation</label>
              <input value={operatingRoomEditForm.location} onChange={(event) => setOperatingRoomEditForm((current) => ({ ...current, location: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Capacité</label>
              <input value={operatingRoomEditForm.capacity} onChange={(event) => setOperatingRoomEditForm((current) => ({ ...current, capacity: event.target.value }))} type="number" min="1" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={operatingRoomEditForm.active} onChange={(event) => setOperatingRoomEditForm((current) => ({ ...current, active: event.target.checked }))} /> Actif</label>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={closeOperatingRoomEditModal} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
            <button onClick={saveOperatingRoom} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Enregistrer</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleteOperatingRoomTarget)} onClose={() => setDeleteOperatingRoomTarget(null)} className="max-w-lg p-0">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Confirmer la suppression</h3>
          <p className="mt-2 text-sm text-slate-500">Voulez-vous vraiment supprimer le bloc opératoire <span className="font-semibold text-slate-800">{deleteOperatingRoomTarget?.name}</span> ?</p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setDeleteOperatingRoomTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Non</button>
            <button onClick={confirmDeleteOperatingRoom} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Oui, supprimer</button>
          </div>
        </div>
      </Modal>
    </AdminPageShell>
  );
}
