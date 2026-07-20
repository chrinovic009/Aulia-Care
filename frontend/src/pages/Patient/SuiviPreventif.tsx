import { useEffect, useMemo, useState } from 'react';
import { fetchMyPatientProfile, fetchWearableDashboard, WearableDashboard } from '../../api/patient';

const label: Record<string, string> = { HEART_RATE_BPM: 'Fréquence cardiaque', BLOOD_PRESSURE_SYSTOLIC_MMHG: 'Tension systolique', BLOOD_PRESSURE_DIASTOLIC_MMHG: 'Tension diastolique', BLOOD_GLUCOSE_MG_DL: 'Glycémie', SPO2_PERCENT: 'Saturation en oxygène', WEIGHT_KG: 'Poids', BODY_FAT_PERCENT: 'Masse grasse' };

export default function SuiviPreventif() {
  const [data, setData] = useState<WearableDashboard | null>(null);
  const [error, setError] = useState('');
  const load = async () => {
    try { const profile = await fetchMyPatientProfile(); setData(await fetchWearableDashboard(profile.id)); setError(''); }
    catch (e: any) { setError(e?.message || 'Le suivi connecté est indisponible.'); }
  };
  useEffect(() => { load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer); }, []);
  const latest = useMemo(() => data?.wearableDevices.flatMap((device) => device.measurements).sort((a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt)) || [], [data]);
  const location = data?.wearableDevices.flatMap((device) => device.emergencyLocations).sort((a, b) => +new Date(b.capturedAt) - +new Date(a.capturedAt))[0];
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Suivi préventif connecté</h1><p className="mt-1 text-sm text-slate-500">Vos données de montre sont des indicateurs de suivi ; une alerte doit toujours être évaluée par un soignant.</p></div>{error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{latest.slice(0, 8).map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">{label[item.metric] || item.metric}</p><p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{item.value} <span className="text-sm">{item.unit}</span></p><p className="mt-2 text-xs text-slate-500">{new Date(item.measuredAt).toLocaleString('fr-FR')} · {item.quality}</p></div>)}</div>{!latest.length && !error && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Aucune mesure transmise par une montre active pour le moment.</div>}{location && <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">Dernière position d’urgence</h2><p className="mt-2 text-sm text-slate-500">Précision : {location.accuracyMeters ?? '-'} m · {new Date(location.capturedAt).toLocaleString('fr-FR')}</p><a className="mt-3 inline-block text-sm font-medium text-sky-700 underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}`}>Ouvrir la carte sécurisée</a></section>}</div>;
}
