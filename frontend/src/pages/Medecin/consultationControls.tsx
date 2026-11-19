import type React from "react";

export function Step({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-base font-bold text-aulia-navy dark:text-white">
          {title}
        </h4>
        <p className="mt-1 text-sm text-slate-500">{hint}</p>
      </div>
      {children}
    </div>
  );
}
export function Entry({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <h5 className="mb-3 text-sm font-bold text-slate-800 dark:text-white">
        {title}
      </h5>
      {children}
    </section>
  );
}
export function Grid({
  children,
  extra = "",
}: {
  children: React.ReactNode;
  extra?: string;
}) {
  return <div className={`grid gap-3 md:grid-cols-2 ${extra}`}>{children}</div>;
}
export function Add({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 rounded-lg bg-aulia-navy px-3 py-2 text-xs font-bold text-white dark:bg-aulia-teal"
    >
      {children}
    </button>
  );
}
export function Rows<T>({
  items,
  label,
  onRemove,
}: {
  items: T[];
  label: (item: T) => string;
  onRemove: (index: number) => void;
}) {
  return items.length ? (
    <div className="mt-3 space-y-2">
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <span>{label(item)}</span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="shrink-0 font-semibold text-red-600"
          >
            Retirer
          </button>
        </div>
      ))}
    </div>
  ) : null;
}
export function Pager({
  labels,
  page,
  setPage,
}: {
  labels: string[];
  page: number;
  setPage: (value: number) => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!page}
          onClick={() => setPage(page - 1)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-slate-700"
        >
          ←
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-bold text-aulia-navy dark:text-white">
            {labels[page]}
          </p>
          <p className="text-xs text-slate-500">
            {page + 1} / {labels.length}
          </p>
        </div>
        <button
          type="button"
          disabled={page === labels.length - 1}
          onClick={() => setPage(page + 1)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-slate-700"
        >
          →
        </button>
      </div>
      <div className="mt-2 flex min-w-0 gap-1">
        {labels.map((label, index) => (
          <button
            type="button"
            aria-label={label}
            key={label}
            onClick={() => setPage(index)}
            className={`h-1.5 min-w-0 flex-1 rounded-full ${page === index ? "bg-aulia-teal" : "bg-slate-300 dark:bg-slate-700"}`}
          />
        ))}
      </div>
    </div>
  );
}
export function VitalCards({
  vitals,
  bmi,
}: {
  vitals: Map<string, string>;
  bmi: string;
}) {
  const cards: Array<[string, string]> = [
    ["PA", vitals.get("BLOOD_PRESSURE") || "—"],
    ["FC", vitals.get("HEART_RATE") || "—"],
    ["FR", vitals.get("RESPIRATORY_RATE") || "—"],
    ["SpO₂", vitals.get("OXYGEN_SATURATION") || "—"],
    ["Température", vitals.get("TEMPERATURE") || "—"],
    ["Poids", vitals.get("WEIGHT") || "—"],
    ["Taille", vitals.get("HEIGHT") || "—"],
    ["IMC", bmi],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([label, reading]) => (
        <div
          key={label}
          className="rounded-xl border border-aulia-teal/15 bg-aulia-mist/50 p-3 dark:bg-aulia-teal/10"
        >
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 font-bold text-aulia-navy dark:text-white">
            {reading}
          </p>
        </div>
      ))}
    </div>
  );
}
export function ExamText({
  title,
  value,
  onChange,
  suggestions = [],
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
}) {
  return (
    <Entry title={title}>
      <Suggest
        label="Constats et précisions"
        value={value}
        onChange={onChange}
        suggestions={suggestions}
      />
    </Entry>
  );
}
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
      {children}
    </div>
  );
}
export function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  multiline,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const css =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-aulia-teal disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800";
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
        {label}
      </span>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={css}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={css}
        />
      )}
    </label>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-aulia-teal disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
      >
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Suggest({
  label,
  value,
  onChange,
  suggestions,
  type,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  type?: string;
}) {
  return (
    <div>
      <Text label={label} value={value} onChange={onChange} type={type} />
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() =>
                onChange(
                  value
                    ? `${value}${value.includes(item) ? "" : `, ${item}`}`
                    : item,
                )
              }
              className="rounded-full border border-aulia-teal/25 px-2 py-1 text-xs font-medium text-aulia-teal hover:bg-aulia-mist dark:hover:bg-aulia-teal/15"
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function MultiChoice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  const selected = value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const toggle = (option: string) =>
    onChange(
      selected.includes(option)
        ? selected.filter((x) => x !== option).join(", ")
        : [...selected, option].join(", "),
    );
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            onClick={() => toggle(option)}
            className={`rounded-full border px-2 py-1 text-xs font-medium ${selected.includes(option) ? "border-aulia-teal bg-aulia-teal text-white" : "border-aulia-teal/25 text-aulia-teal"}`}
          >
            {option}
          </button>
        ))}
      </div>
      <Text label="Autre type / précision" value={value} onChange={onChange} />
    </div>
  );
}
