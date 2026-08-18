import { useEffect, useMemo, useState } from "react";

export function useClientPagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, pageSize, safePage],
  );

  return { page: safePage, pageItems, setPage, totalPages };
}

export function ClientPagination({
  page,
  totalItems,
  totalPages,
  pageSize = 10,
  onPageChange,
  label = "éléments",
}: {
  page: number;
  totalItems: number;
  totalPages: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  if (totalItems <= pageSize) return null;

  return (
    <nav className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800" aria-label={`Pagination des ${label}`}>
      <p className="text-slate-500 dark:text-slate-400">
        {Math.min((page - 1) * pageSize + 1, totalItems)}–{Math.min(page * pageSize, totalItems)} sur {totalItems} {label}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 transition hover:border-teal-500 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:border-teal-500 dark:hover:text-teal-300">Précédent</button>
        <span className="min-w-16 text-center font-semibold text-slate-700 dark:text-slate-200">{page} / {totalPages}</span>
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 transition hover:border-teal-500 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:border-teal-500 dark:hover:text-teal-300">Suivant</button>
      </div>
    </nav>
  );
}
