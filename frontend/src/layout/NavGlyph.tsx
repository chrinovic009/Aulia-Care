import type { ReactNode } from "react";
import { metaFor } from "./navigationMeta";
import type { NavBadges } from "./useNavBadges";

/** Icon of a menu tab (meaningful icon in a tinted halo) with its counter in superscript. */
export function NavGlyph({ path, fallback, badges, compact }: { path?: string; fallback: ReactNode; badges: NavBadges; compact?: boolean }) {
  const meta = metaFor(path);
  const badge = meta?.badge ? badges[meta.badge] : undefined;
  const Icon = meta?.icon;
  return (
    <span className="relative inline-flex shrink-0">
      {Icon ? (
        <span className={`aulia-nav-glyph inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br ${meta!.tint}`}>
          <Icon className="size-[18px]" strokeWidth={2.1} aria-hidden="true" />
        </span>
      ) : fallback}
      {badge && (
        <span
          key={badge.count}
          data-tone={badge.tone}
          title={`${badge.count} ${badge.label}`}
          aria-label={`${badge.count} ${badge.label}`}
          className={`aulia-nav-badge absolute -right-2 -top-2 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-5 text-white ring-2 ring-white dark:ring-gray-900 ${badge.tone === "danger" ? "bg-red-600" : "bg-aulia-teal"} ${compact ? "scale-90" : ""}`}
        >
          {badge.count > 99 ? "99+" : badge.count}
        </span>
      )}
    </span>
  );
}

/** The stock tab turns red while a medication is below its threshold. */
export const isAlertTab = (path: string | undefined, badges: NavBadges) => Boolean(metaFor(path)?.badge === "stockLow" && badges.stockLow);
