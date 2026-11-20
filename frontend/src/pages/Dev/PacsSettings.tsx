import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import Button from '../../components/ui/button/Button';
import { apiFetch } from '../../config/api';

type Metadata = { enabled: boolean; previewUrlTemplate: string; hasToken: boolean };
export default function PacsSettings({ clinicId }: { clinicId: string }) {
  const [value, setValue] = useState<Metadata | null>(null);
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    apiFetch<Metadata>(`/platform/provisioning/clinics/${clinicId}/pacs`)
      .then(next => { if (!cancelled) setValue(next); })
      .catch(() => { if (!cancelled) setMessage('Configuration PACS indisponible.'); });
    return () => { cancelled = true; };
  }, [clinicId]);
  const save = async () => {
    if (!value || busy) return;
    setBusy(true); setMessage('');
    try {
      const next = await apiFetch<Metadata>(`/platform/provisioning/clinics/${clinicId}/pacs`, {
        method: 'PUT', body: JSON.stringify({ enabled: value.enabled, previewUrlTemplate: value.previewUrlTemplate, ...(token ? { token } : {}), clearToken }),
      });
      setValue(next); setToken(''); setClearToken(false);
      setMessage(next.enabled ? 'Configuration enregistrée. Connexion réelle à vérifier.' : 'PACS désactivé. Aperçus locaux conservés.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    {value ? <>
      <label className="flex items-center gap-3"><input type="checkbox" checked={value.enabled} disabled={busy} onChange={event => setValue({ ...value, enabled: event.target.checked })} /><span>PACS disponible dans cet établissement</span></label>
      <label className="block"><span>Adresse HTTPS des aperçus</span><input className="aulia-input mt-2" value={value.previewUrlTemplate} disabled={busy} maxLength={2048} placeholder="https://pacs.clinique.local/rendered/{studyUid}" onChange={event => setValue({ ...value, previewUrlTemplate: event.target.value })} /></label>
      <label className="block"><span>{value.hasToken ? 'Remplacer le jeton PACS' : 'Jeton PACS (facultatif)'}</span><input type="password" autoComplete="new-password" className="aulia-input mt-2" value={token} disabled={busy || clearToken} maxLength={4096} onChange={event => setToken(event.target.value)} /></label>
      <p className="text-sm">{value.hasToken ? 'Jeton enregistré et masqué.' : 'Aucun jeton enregistré.'}</p>
      {value.hasToken ? <label className="flex items-center gap-3"><input type="checkbox" checked={clearToken} disabled={busy} onChange={event => { setClearToken(event.target.checked); setToken(''); }} /><span>Supprimer le jeton enregistré</span></label> : null}
      <Button onClick={() => void save()} disabled={busy} startIcon={<Save className="h-4 w-4" />}>{busy ? 'Enregistrement…' : 'Enregistrer le PACS'}</Button>
    </> : <p>Chargement des réglages PACS…</p>}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </div>;
}