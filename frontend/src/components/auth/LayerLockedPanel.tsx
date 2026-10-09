import { LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  AULIA_LAYER_LABEL,
  type AuliaLayer,
} from '../../config/auliaCapabilities';

export function LayerLockedPanel({ required }: { required: AuliaLayer[] }) {
  const navigate = useNavigate();
  const labels = required.map((layer) => AULIA_LAYER_LABEL[layer]).join(' + ');
  return (
    <main className="grid min-h-[70vh] place-items-center px-5 text-center">
      <section className="max-w-md rounded-3xl border border-amber-300/70 bg-white p-7 shadow-sm dark:border-amber-400/30 dark:bg-slate-900">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
          <LockKeyhole className="size-6" />
        </span>
        <p className="mt-5 text-sm font-semibold text-aulia-teal">Fonctionnalité visible, accès verrouillé</p>
        <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Cette fonctionnalité n’est pas incluse</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {labels} n’est pas activé pour cet établissement. Seule l’administration plateforme peut modifier cette licence.
        </p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-6 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Retour
        </button>
      </section>
    </main>
  );
}
