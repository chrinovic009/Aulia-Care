import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import type { BadgeKey } from "./navigationMeta";

export type NavBadge = { count: number; tone: "info" | "danger"; label: string };
export type NavBadges = Partial<Record<BadgeKey, NavBadge>>;

/** Menu counters: refreshed every minute, when the window regains focus, and on demand (event "aulia:badges-refresh"). */
export function useNavBadges(enabled: boolean): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({});
  useEffect(() => {
    if (!enabled) { setBadges({}); return; }
    let alive = true;
    const load = () => apiFetch<NavBadges>("/navigation/badges").then((next) => { if (alive) setBadges(next ?? {}); }).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 60_000);
    const onFocus = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("aulia:badges-refresh", load);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("aulia:badges-refresh", load);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled]);
  return badges;
}

/** Ask the menu to refresh its counters right away (after reading messages, deciding a request…). */
export const refreshNavBadges = () => window.dispatchEvent(new Event("aulia:badges-refresh"));
