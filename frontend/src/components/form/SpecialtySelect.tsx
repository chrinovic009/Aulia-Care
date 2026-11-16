import { useEffect, useState } from "react";
import { fetchMedicalSpecialties, type SpecialtyGroup } from "../../api/reference";

/** Grouped drop-down of the establishment's medical specialties. A legacy free-text value stays selectable. */
export function SpecialtySelect({ value, onChange, className, required }: { value: string; onChange: (value: string) => void; className?: string; required?: boolean }) {
  const [groups, setGroups] = useState<SpecialtyGroup[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => { void fetchMedicalSpecialties().then(setGroups).catch(() => setError(true)); }, []);
  const known = groups.some((group) => group.specialties.some((item) => item.label === value));
  return (
    <>
      <select className={className} value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choisir la spécialité…</option>
        {value && !known && groups.length > 0 && <option value={value}>{value} (ancienne saisie, à remplacer)</option>}
        {groups.map((group, index) => (
          <optgroup key={group.code} label={`${index + 1}. ${group.label}`}>
            {group.specialties.map((item) => <option key={`${group.code}-${item.label}`} value={item.label} title={item.domain}>{item.label}</option>)}
          </optgroup>
        ))}
      </select>
      {error && <span className="mt-1 block text-xs text-red-600">La liste des spécialités n’a pas pu être chargée.</span>}
    </>
  );
}
