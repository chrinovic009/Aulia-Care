import { ApiError, apiFetch } from "../config/api";

/**
 * Offline queue for critical clinical entries (vital signs, care events).
 *
 * An entry that cannot reach the server is kept on this device with the time it
 * was made and an idempotency key, then sent again as soon as the connection is
 * back. The server applies a key only once, so a replay can never duplicate an
 * entry. Entries refused by the server stay listed until someone reviews them.
 */
export type QueuedEntry = {
  id: string;
  userId: string;
  label: string;
  endpoint: string;
  method: string;
  body: string | null;
  createdAt: string;
  attempts: number;
  status: "PENDING" | "REJECTED";
  error?: string;
};

export type QueuedResult = { queued: true; entryId: string };
export const isQueued = (value: unknown): value is QueuedResult => Boolean(value && typeof value === "object" && (value as QueuedResult).queued === true);

const STORAGE_KEY = "aulia.offlineQueue.v1";
const CHANGE_EVENT = "aulia:offline-queue";
const RETRY_MS = 30_000;
let currentUserId: string | null = null;
let flushing: Promise<void> | null = null;

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

function readAll(): QueuedEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeAll(entries: QueuedEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage full or unavailable: the entry stays in memory only for this call */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Entries of the signed-in person only: a shared workstation never replays someone else's work. */
export function queuedEntries(): QueuedEntry[] {
  return currentUserId ? readAll().filter((entry) => entry.userId === currentUserId) : [];
}

export function subscribeToQueue(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function discardEntry(entryId: string) {
  writeAll(readAll().filter((entry) => entry.id !== entryId));
}

const isNetworkFailure = (error: unknown) => !(error instanceof ApiError);

/**
 * Sends a critical write; if the network is unavailable, keeps it for later and
 * returns `{ queued: true }` instead of failing. Server refusals are thrown as usual.
 */
export async function sendOrQueue<T>(label: string, endpoint: string, init: RequestInit & { method: string }): Promise<T | QueuedResult> {
  const id = newKey();
  const entry: QueuedEntry = {
    id,
    userId: currentUserId ?? "",
    label,
    endpoint,
    method: init.method.toUpperCase(),
    body: typeof init.body === "string" ? init.body : null,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "PENDING",
  };
  const enqueue = (): QueuedResult => {
    writeAll([...readAll(), entry]);
    return { queued: true, entryId: id };
  };
  if (typeof navigator !== "undefined" && navigator.onLine === false && currentUserId) return enqueue();
  try {
    return await apiFetch<T>(endpoint, { ...init, headers: { ...(init.headers as Record<string, string>), "Idempotency-Key": id } }, 15_000, true);
  } catch (error) {
    if (isNetworkFailure(error) && currentUserId) return enqueue();
    throw error;
  }
}

/** Sends pending entries in the order they were made; stops at the first network failure. */
export function flushQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const entry of queuedEntries().filter((item) => item.status === "PENDING")) {
      try {
        await apiFetch(entry.endpoint, { method: entry.method, body: entry.body ?? undefined, headers: { "Idempotency-Key": entry.id, "X-Aulia-Offline-Replay": "1" } }, 15_000, true);
        writeAll(readAll().filter((item) => item.id !== entry.id));
      } catch (error) {
        if (isNetworkFailure(error)) break;
        const status = (error as ApiError).status;
        if (status === 401 || status === 409 && (error as ApiError).body?.message?.includes("en cours") || status >= 500) {
          writeAll(readAll().map((item) => item.id === entry.id ? { ...item, attempts: item.attempts + 1 } : item));
          break;
        }
        const message = typeof (error as ApiError).body?.message === "string" ? (error as ApiError).body.message : `Refusé par le serveur (${status}).`;
        writeAll(readAll().map((item) => item.id === entry.id ? { ...item, attempts: item.attempts + 1, status: "REJECTED", error: message } : item));
      }
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

let timer: number | undefined;
/** Called when the signed-in person changes (null at sign-out). */
export function bindOfflineQueue(userId: string | null) {
  currentUserId = userId;
  window.dispatchEvent(new Event(CHANGE_EVENT));
  if (timer) window.clearInterval(timer);
  timer = undefined;
  if (!userId) return;
  void flushQueue();
  timer = window.setInterval(() => { if (navigator.onLine !== false) void flushQueue(); }, RETRY_MS);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { void flushQueue(); });
}
