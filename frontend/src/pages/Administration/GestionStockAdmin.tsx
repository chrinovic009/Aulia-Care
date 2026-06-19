import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, PackageCheck, Truck } from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, DataTable, Panel, StatCard, StatusBadge, formatDate, formatMoney } from "./adminUi";

type StockPayload = {
  medications?: Array<{ id: string; code: string; name: string; unit?: string; strength?: string; manufacturer?: string }>;
  stocks?: Array<{ id: string; medicationId: string; batchNumber?: string; quantity: number; lowStockLevel: number; criticalLevel: number; purchasePrice?: string | number; expiryDate?: string }>;
  suppliers?: Array<{ id: string; name: string; phone?: string; email?: string; status?: string }>;
  movements?: Array<{ id: string; medicationId: string; type: string; quantity: number; unitPrice?: string | number; reason?: string; createdAt: string }>;
  lots?: Array<{ id: string; medicationId: string; batchNumber: string; quantity: number; purchasePrice?: string | number; expiryDate?: string; receivedAt?: string; medication?: { name?: string; strength?: string } }>;
  transactions?: Array<{ id: string; type: string; quantity: number; createdAt: string; medication?: { name?: string }; lot?: { batchNumber?: string }; performedBy?: { displayName?: string } }>;
  purchaseOrders?: Array<{ id: string; orderNumber: string; status: string; totalAmount?: string | number; orderedAt?: string; supplier?: { name?: string }; lines?: unknown[] }>;
  goodsReceipts?: Array<{ id: string; status: string; receivedAt?: string; supplier?: { name?: string }; lines?: unknown[] }>;
  dispenses?: Array<{ id: string; status: string; dispensedAt?: string; prescription?: { patient?: { firstName?: string; lastName?: string } }; lines?: unknown[] }>;
};

export default function GestionStockAdmin() {
  const [payload, setPayload] = useState<StockPayload>({});
  const [isLoading, setIsLoading] = useState(true);

  const load = () => apiFetch<StockPayload>("/administration/stock")
      .then(setPayload)
      .catch(() => setPayload({}))
      .finally(() => setIsLoading(false));
  useEffect(() => {
    load();
    window.addEventListener("d7:administrationUpdated", load);
    return () => window.removeEventListener("d7:administrationUpdated", load);
  }, []);

  const medications = payload.medications || [];
  const stocks = payload.stocks || [];
  const suppliers = payload.suppliers || [];
  const movements = payload.movements || [];
  const lots = payload.lots || [];
  const transactions = payload.transactions || [];
  const medicationById = new Map(medications.map((medication) => [medication.id, medication]));

  const metrics = useMemo(() => ({
    catalog: medications.length,
    lots: lots.length || stocks.length,
    low: [...stocks.filter((stock) => stock.quantity <= stock.lowStockLevel), ...lots.filter((lot) => lot.quantity <= 10)].length,
    suppliers: suppliers.length,
  }), [medications.length, stocks, suppliers.length]);

  return (
    <AdminPageShell title="Stock" subtitle="Vue administrative du stock pharmaceutique, lots, alertes et fournisseurs.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Boxes size={20} />} label="Catalogue" value={metrics.catalog} />
        <StatCard icon={<PackageCheck size={20} />} label="Lots suivis" value={metrics.lots} tone="blue" />
        <StatCard icon={<AlertTriangle size={20} />} label="Alertes stock" value={metrics.low} tone={metrics.low ? "red" : "green"} />
        <StatCard icon={<Truck size={20} />} label="Fournisseurs" value={metrics.suppliers} tone="violet" />
      </div>

      <Panel title="Lots et niveaux de stock">
        <DataTable
          headers={["Medicament", "Lot", "Quantite", "Seuil", "Prix achat", "Expiration", "Statut"]}
          empty={isLoading ? "Chargement du stock..." : "Aucun lot de stock enregistre."}
          rows={(lots.length ? lots : stocks).map((stock: any) => {
            const medication = medicationById.get(stock.medicationId);
            const critical = stock.quantity <= (stock.criticalLevel || 3);
            const low = stock.quantity <= (stock.lowStockLevel || 10);
            return [
              stock.medication?.name || (medication ? `${medication.name} ${medication.strength || ""}` : stock.medicationId),
              stock.batchNumber || "-",
              stock.quantity,
              `${stock.criticalLevel}/${stock.lowStockLevel}`,
              stock.purchasePrice ? formatMoney(stock.purchasePrice) : "-",
              formatDate(stock.expiryDate),
              critical ? <StatusBadge key="status" label="Critique" tone="red" /> : low ? <StatusBadge key="status" label="Bas" tone="amber" /> : <StatusBadge key="status" label="Normal" tone="green" />,
            ];
          })}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Fournisseurs">
          <DataTable
            headers={["Nom", "Telephone", "Email", "Statut"]}
            rows={suppliers.map((supplier) => [
              supplier.name,
              supplier.phone || "-",
              supplier.email || "-",
              <StatusBadge key="status" label={supplier.status || "ACTIVE"} tone={supplier.status === "ACTIVE" ? "green" : "amber"} />,
            ])}
          />
        </Panel>

        <Panel title="Mouvements recents">
          <DataTable
            headers={["Medicament", "Type", "Quantite", "Motif", "Date"]}
            rows={(transactions.length ? transactions : movements).slice(0, 20).map((movement: any) => [
              movement.medication?.name || medicationById.get(movement.medicationId)?.name || movement.medicationId,
              movement.type,
              movement.quantity,
              movement.lot?.batchNumber || movement.reason || movement.performedBy?.displayName || "-",
              formatDate(movement.createdAt),
            ])}
          />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Bons de commande">
          <DataTable headers={["Numero", "Fournisseur", "Lignes", "Montant", "Statut"]} rows={(payload.purchaseOrders || []).map((order) => [
            order.orderNumber,
            order.supplier?.name || "-",
            order.lines?.length || 0,
            order.totalAmount ? formatMoney(order.totalAmount) : "-",
            <StatusBadge key="status" label={order.status} tone={order.status === "PAID" || order.status === "RECEIVED" ? "green" : "amber"} />,
          ])} />
        </Panel>
        <Panel title="Receptions">
          <DataTable headers={["Fournisseur", "Lignes", "Date", "Statut"]} rows={(payload.goodsReceipts || []).map((receipt) => [
            receipt.supplier?.name || "-",
            receipt.lines?.length || 0,
            formatDate(receipt.receivedAt),
            <StatusBadge key="status" label={receipt.status} tone="green" />,
          ])} />
        </Panel>
        <Panel title="Dispenses">
          <DataTable headers={["Patient", "Lignes", "Date", "Statut"]} rows={(payload.dispenses || []).map((dispense) => [
            [dispense.prescription?.patient?.firstName, dispense.prescription?.patient?.lastName].filter(Boolean).join(" ") || "-",
            dispense.lines?.length || 0,
            formatDate(dispense.dispensedAt),
            <StatusBadge key="status" label={dispense.status} tone="blue" />,
          ])} />
        </Panel>
      </div>
    </AdminPageShell>
  );
}
