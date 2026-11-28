import { useEffect, useRef, useState } from "react";
import { searchClinicalCodes, type ClinicalCode } from "../../api/terminology";

/**
 * CIM-10 (ICD-10) picker: the doctor types a code or words, and chooses from
 * the installation's official list. A free text that matches no code stays
 * visible but is flagged as "non codé", so statistics only count real codes.
 */
export function Icd10Picker({
  label = "Code CIM-10",
  code,
  display,
  onChange,
  disabled,
}: {
  label?: string;
  code: string;
  display?: string;
  onChange: (next: { code: string; display: string }) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(code ? `${code}${display ? ` — ${display}` : ""}` : "");
  const [results, setResults] = useState<ClinicalCode[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [coded, setCoded] = useState(Boolean(code));
  const ticket = useRef(0);

  useEffect(() => {
    if (!open) return;
    const text = query.trim();
    if (text.length < 2) { setResults([]); return; }
    const mine = ++ticket.current;
    const timer = window.setTimeout(() => {
      searchClinicalCodes(text)
        .then((rows) => { if (mine === ticket.current) { setResults(rows); setError(""); } })
        .catch(() => { if (mine === ticket.current) setError("Recherche CIM-10 indisponible."); });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const choose = (item: ClinicalCode) => {
    setQuery(`${item.code} — ${item.display}`);
    setCoded(true);
    setOpen(false);
    onChange({ code: item.code, display: item.display });
  };

  return (
    <div className="relative block text-sm">
      <label className="mb-1 block font-medium text-slate-600 dark:text-slate-300" htmlFor="icd10-picker">{label}</label>
      <input
        id="icd10-picker"
        value={query}
        disabled={disabled}
        placeholder="Ex. J18 ou pneumonie"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (coded) { setCoded(false); onChange({ code: "", display: "" }); }
        }}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-aulia-teal disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />
      <p className={`mt-1 text-xs ${coded ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
        {coded ? "Diagnostic codé (CIM-10)" : query.trim() ? "Non codé : choisissez un code dans la liste" : "Choisissez un code dans la liste CIM-10"}
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && results.length > 0 && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {results.map((item) => (
            <li key={item.code}>
              <button
                type="button"
                role="option"
                aria-selected={item.code === code}
                onMouseDown={(event) => { event.preventDefault(); choose(item); }}
                className="flex w-full gap-2 px-3 py-2 text-left hover:bg-aulia-mist dark:hover:bg-slate-800"
              >
                <span className="font-mono font-semibold text-aulia-navy dark:text-white">{item.code}</span>
                <span className="text-slate-700 dark:text-slate-200">{item.display}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
