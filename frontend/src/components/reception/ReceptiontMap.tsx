interface CountryMapProps {
  mapColor?: string;
  markers?: Array<{
    latLng: [number, number];
    name: string;
    style?: Record<string, unknown>;
  }>;
}

/** Dependency-free fallback compatible with the React version used by Aulia. */
const CountryMap: React.FC<CountryMapProps> = ({ mapColor = '#0D9488', markers = [] }) => (
  <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900" aria-label="Emplacements réception">
    <div className="mb-3 h-2 rounded-full" style={{ backgroundColor: mapColor }} />
    {markers.length === 0 ? (
      <p className="text-sm text-slate-500">Aucun emplacement à afficher.</p>
    ) : (
      <ul className="space-y-2">
        {markers.map((marker) => <li key={`${marker.name}-${marker.latLng.join(':')}`} className="text-sm text-slate-700 dark:text-slate-200">{marker.name}</li>)}
      </ul>
    )}
  </section>
);

export default CountryMap;
