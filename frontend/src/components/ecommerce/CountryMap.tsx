interface CountryMapProps {
  mapColor?: string;
  markers?: Array<{
    latLng: [number, number];
    name: string;
    style?: Record<string, unknown>;
  }>;
}

const defaultMarkers: NonNullable<CountryMapProps['markers']> = [
  { latLng: [-10.718, 25.468], name: 'Hôpital Kolwezi - Aéroport' },
  { latLng: [-11.672, 27.483], name: 'Patient - Joli Site (Gouvernorat)' },
];

/**
 * Lightweight, dependency-free location overview. The former vector-map
 * dependency does not support React 19; keep marker information visible
 * instead of shipping a broken map widget.
 */
const CountryMap: React.FC<CountryMapProps> = ({ mapColor = '#0D9488', markers = defaultMarkers }) => (
  <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900" aria-label="Emplacements">
    <div className="mb-3 h-2 rounded-full" style={{ backgroundColor: mapColor }} />
    <ul className="space-y-2">
      {markers.map((marker) => (
        <li key={`${marker.name}-${marker.latLng.join(':')}`} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: mapColor }} aria-hidden="true" />
          <span>{marker.name} <span className="text-xs text-slate-500">({marker.latLng[0]}, {marker.latLng[1]})</span></span>
        </li>
      ))}
    </ul>
  </section>
);

export default CountryMap;
