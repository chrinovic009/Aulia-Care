import { apiFetch } from "../config/api";

export type WatchManufacturer = "APPLE" | "SAMSUNG";

export type WatchPlan = { manufacturer: WatchManufacturer; monthlyPrice: string | number; currency: "CDF"; active: boolean };

export type WatchInventoryDashboard = {
  plans: WatchPlan[];
  summary: { totalDevices: number; available: number; assigned: number; subscriptionsDue: number };
  subscriptions: {
    items: Array<{
      id: string;
      status: "PENDING_PAYMENT" | "ACTIVE" | "OVERDUE" | "CANCELLED";
      periodEndAt: string;
      amount: string | number;
      currency: string;
      daysRemaining: number;
      patient: { firstName: string; lastName: string };
      wearableDevice: { displayName?: string | null; status: string };
      inventoryDevice: { serialNumber: string; lot: { manufacturer: WatchManufacturer } };
      invoice?: { status: string; balanceDue: string | number } | null;
    }>;
    total: number;
    page: number;
    limit: number;
  };
  lots: {
    items: Array<{ id: string; reference: string; manufacturer: WatchManufacturer; receivedAt: string; devices: Array<{ status: string }> }>;
    total: number;
    page: number;
    limit: number;
  };
};

export const fetchWatchInventory = (page = 1, limit = 10) =>
  apiFetch<WatchInventoryDashboard>(`/wearables/admin/inventory?page=${page}&limit=${limit}`);

export const saveWatchPlan = (manufacturer: WatchManufacturer, monthlyPrice: number, active = true) =>
  apiFetch<WatchPlan>(`/wearables/admin/plans/${manufacturer}`, { method: "PATCH", body: JSON.stringify({ monthlyPrice, active }) });

export const receiveWatchLot = (payload: {
  reference: string;
  paidAmount: number;
  note?: string;
  items: Array<{ manufacturer: WatchManufacturer; quantity: number }>;
}) => apiFetch("/wearables/admin/lots", { method: "POST", body: JSON.stringify(payload) });

export type ReceptionWatchDashboard = WatchInventoryDashboard & {
  availableDevices: Array<{ serialNumber: string; platform: string; lot: { manufacturer: WatchManufacturer } }>;
};

export const fetchReceptionWatchDashboard = (page = 1, limit = 10) =>
  apiFetch<ReceptionWatchDashboard>(`/wearables/reception/dashboard?page=${page}&limit=${limit}`);

export const pairWatchAtReception = (patientId: string, assetCode: string) =>
  apiFetch("/wearables/reception/pair", { method: "POST", body: JSON.stringify({ patientId, assetCode }) });
