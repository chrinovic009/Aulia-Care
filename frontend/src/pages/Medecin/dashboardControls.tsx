import type React from "react";
export function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "blue" | "red" | "green" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    blue: "text-blue-700 dark:text-blue-300",
    red: "text-red-700 dark:text-red-300",
    green: "text-emerald-700 dark:text-emerald-300",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

export function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

export function Panel({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export function Item({ title, subtitle, text }: { title: string; subtitle: string; text: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
      <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      <p className="mt-2 whitespace-pre-line text-slate-600 dark:text-slate-300">{text}</p>
    </div>
  );
}

export function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/60">
      <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-white">{title}</h4>
      {children}
    </div>
  );
}

export function SuggestionInput({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const appendSuggestion = (suggestion: string) => {
    const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.map((part) => part.toLowerCase()).includes(suggestion.toLowerCase())) return;
    onChange([...parts, suggestion].join(", "));
  };

  return (
    <div>
      <FormTextArea label={label} value={value} onChange={onChange} />
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => appendSuggestion(suggestion)}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FormInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <input
        value={value}
        type={type}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        data-clinical-label={normalizeVoiceText(label)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
    </label>
  );
}

export function FormTextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        data-clinical-label={normalizeVoiceText(label)}
        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
    </label>
  );
}

export function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      >
        {options.map(([key, optionLabel]) => <option key={key} value={key}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

export function SaveFeedbackModal({ title, message, tone, onClose }: { title: string; message: string; tone: "success" | "warning" | "error"; onClose: () => void }) {
  const toneClasses = tone === "success"
    ? "border-aulia-teal/30 bg-aulia-mist text-aulia-navy dark:bg-aulia-teal/15 dark:text-aulia-mist"
    : tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100"
      : "border-red-300 bg-red-50 text-red-950 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100";
  return (
    <div className="fixed inset-0 z-[1000000] grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="consultation-save-title">
      <section className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${toneClasses}`}>
        <h2 id="consultation-save-title" className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm leading-6">{message}</p>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-aulia-teal px-4 py-2.5 text-sm font-bold text-white">Compris</button>
      </section>
    </div>
  );
}

export function ConfirmationModal({ title, message, confirmLabel, tone = "primary", onConfirm, onClose }: { title: string; message: string; confirmLabel: string; tone?: "danger" | "primary"; onConfirm: () => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-[1000000] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="consultation-confirm-title"><section className="w-full max-w-md rounded-2xl border border-aulia-teal/25 bg-white p-5 shadow-2xl dark:bg-slate-950"><p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Aulia Care · confirmation</p><h2 id="consultation-confirm-title" className="mt-2 text-lg font-bold text-aulia-navy dark:text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p><div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={onClose} className="order-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 sm:order-1">Annuler</button><button type="button" onClick={onConfirm} className={`order-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white sm:order-2 ${tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-aulia-teal hover:bg-[#087c73]"}`}>{confirmLabel}</button></div></section></div>;
}

export function ExitConsultationModal({ onCancel, onDiscard, onSave }: { onCancel: () => void; onDiscard: () => void; onSave: () => void }) {
  return <div className="fixed inset-0 z-[1000000] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="consultation-exit-title"><section className="w-full max-w-lg rounded-2xl border border-aulia-teal/25 bg-white p-5 shadow-2xl dark:bg-slate-950"><p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Aulia Care · consultation</p><h2 id="consultation-exit-title" className="mt-2 text-lg font-bold text-aulia-navy dark:text-white">Quitter la consultation ?</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Choisissez explicitement le sort de votre saisie clinique. Un brouillon reste privé au médecin auteur tant qu’il n’est pas signé.</p><div className="mt-5 grid gap-2"><button type="button" onClick={onSave} className="rounded-xl bg-aulia-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-[#087c73]">Quitter et enregistrer le brouillon</button><button type="button" onClick={onDiscard} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/30">Quitter sans enregistrer</button><button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">Annuler</button></div></section></div>;
}

export function Empty() {
  return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune donnee disponible.</p>;
}


const normalizeVoiceText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
