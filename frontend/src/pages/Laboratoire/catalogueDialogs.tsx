import { Modal } from "../../components/ui/modal";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
export type ErrorModalState = { title: string; message: string };


export function ActionButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onEdit} className="rounded-lg border border-slate-200 p-2 text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700" title="Modifier">
        <Pencil size={16} />
      </button>
      <button type="button" onClick={onDelete} className="rounded-lg border border-slate-200 p-2 text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700" title="Supprimer">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function ConfirmDeleteModal({ open, title, description, onClose, onConfirm, isDeleting }: { open: boolean; title: string; description: string; onClose: () => void; onConfirm: () => void; isDeleting: boolean }) {
  if (!open) return null;
  return (
    <Modal isOpen={open} onClose={onClose} className="max-w-lg border border-rose-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-rose-100 p-3 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Annuler</button>
          <button type="button" disabled={isDeleting} onClick={onConfirm} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{isDeleting ? "Suppression..." : "Oui, supprimer"}</button>
        </div>
      </div>
    </Modal>
  );
}

export function ErrorModal({ open, error, onClose }: { open: boolean; error: ErrorModalState | null; onClose: () => void }) {
  if (!open || !error) return null;
  return (
    <Modal isOpen={open} onClose={onClose} className="max-w-lg border border-amber-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{error.title}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error.message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Fermer</button>
        </div>
      </div>
    </Modal>
  );
}

export function EditSectionModal({ open, value, onChange, onCancel, onSave, isSaving }: { open: boolean; value: { id: string; name: string; description: string; order: string; active: boolean } | null; onChange: (value: { id: string; name: string; description: string; order: string; active: boolean }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean }) {
  if (!open || !value) return null;
  return (
    <Modal isOpen={open} onClose={onCancel} className="max-w-2xl border border-slate-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modifier la section</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="block text-slate-700">Nom</span>
            <input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="block text-slate-700">Description</span>
            <input value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Ordre</span>
            <input type="number" min="0" value={value.order} onChange={(event) => onChange({ ...value, order: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={value.active} onChange={(event) => onChange({ ...value, active: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Active
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
          <button type="button" disabled={isSaving} onClick={onSave} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function EditCategoryModal({ open, value, onChange, onCancel, onSave, isSaving, sections }: { open: boolean; value: { id: string; sectionId: string; name: string; code: string; description: string; order: string; active: boolean } | null; onChange: (value: { id: string; sectionId: string; name: string; code: string; description: string; order: string; active: boolean }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; sections: Array<{ id: string; name: string }> }) {
  if (!open || !value) return null;
  return (
    <Modal isOpen={open} onClose={onCancel} className="max-w-2xl border border-slate-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modifier la catégorie</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-slate-700">Section</span>
            <select value={value.sectionId} onChange={(event) => onChange({ ...value, sectionId: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">Sélectionner</option>
              {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Nom</span>
            <input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Code</span>
            <input value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Description</span>
            <input value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Ordre</span>
            <input type="number" min="0" value={value.order} onChange={(event) => onChange({ ...value, order: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={value.active} onChange={(event) => onChange({ ...value, active: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Active
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
          <button type="button" disabled={isSaving} onClick={onSave} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function EditTestModal({ open, value, onChange, onCancel, onSave, isSaving, categories, sections }: { open: boolean; value: { id: string; code: string; name: string; categoryId: string; sectionId: string; description: string; price: string; turnaroundTimeMinutes: string; resultType: string; unit: string; referenceRange: string; genderRestriction: string; minAge: string; maxAge: string; active: boolean } | null; onChange: (value: { id: string; code: string; name: string; categoryId: string; sectionId: string; description: string; price: string; turnaroundTimeMinutes: string; resultType: string; unit: string; referenceRange: string; genderRestriction: string; minAge: string; maxAge: string; active: boolean }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; categories: Array<{ id: string; name: string }>; sections: Array<{ id: string; name: string }> }) {
  if (!open || !value) return null;
  return (
    <Modal isOpen={open} onClose={onCancel} className="max-w-4xl border border-slate-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modifier l’examen</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-slate-700">Section</span>
            <select value={value.sectionId} onChange={(event) => onChange({ ...value, sectionId: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">Sélectionner</option>
              {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Catégorie</span>
            <select value={value.categoryId} onChange={(event) => onChange({ ...value, categoryId: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">Sélectionner</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Code</span>
            <input value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Nom</span>
            <input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Prix</span>
            <input type="number" min="0" step="0.01" value={value.price} onChange={(event) => onChange({ ...value, price: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Délai (min)</span>
            <input type="number" min="0" value={value.turnaroundTimeMinutes} onChange={(event) => onChange({ ...value, turnaroundTimeMinutes: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Type résultat</span>
            <select value={value.resultType} onChange={(event) => onChange({ ...value, resultType: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="NUMERIC">NUMERIC</option>
              <option value="TEXT">TEXT</option>
              <option value="SIMPLE">SIMPLE</option>
              <option value="MULTI_PARAMETER">MULTI_PARAMETER</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Genre</span>
            <select value={value.genderRestriction} onChange={(event) => onChange({ ...value, genderRestriction: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="ALL">ALL</option>
              <option value="MALE">MALE</option>
              <option value="FEMALE">FEMALE</option>
              <option value="UNSPECIFIED">UNSPECIFIED</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Unité</span>
            <input value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Référence</span>
            <input value={value.referenceRange} onChange={(event) => onChange({ ...value, referenceRange: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Âge min</span>
            <input type="number" min="0" value={value.minAge} onChange={(event) => onChange({ ...value, minAge: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Âge max</span>
            <input type="number" min="0" value={value.maxAge} onChange={(event) => onChange({ ...value, maxAge: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="block text-slate-700">Description</span>
            <input value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={value.active} onChange={(event) => onChange({ ...value, active: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Active
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
          <button type="button" disabled={isSaving} onClick={onSave} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function EditParameterModal({ open, value, onChange, onCancel, onSave, isSaving, tests }: { open: boolean; value: { id: string; labTestId: string; code: string; name: string; unit: string; resultType: string; referenceRange: string; minValue: string; maxValue: string; order: string; active: boolean } | null; onChange: (value: { id: string; labTestId: string; code: string; name: string; unit: string; resultType: string; referenceRange: string; minValue: string; maxValue: string; order: string; active: boolean }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; tests: Array<{ id: string; name: string }> }) {
  if (!open || !value) return null;
  return (
    <Modal isOpen={open} onClose={onCancel} className="max-w-2xl border border-slate-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modifier le paramètre</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-slate-700">Examen</span>
            <select value={value.labTestId} onChange={(event) => onChange({ ...value, labTestId: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">Sélectionner</option>
              {tests.map((test) => <option key={test.id} value={test.id}>{test.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Code</span>
            <input value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Nom</span>
            <input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Type résultat</span>
            <select value={value.resultType} onChange={(event) => onChange({ ...value, resultType: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="NUMERIC">NUMERIC</option>
              <option value="TEXT">TEXT</option>
              <option value="SIMPLE">SIMPLE</option>
              <option value="MULTI_PARAMETER">MULTI_PARAMETER</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Unité</span>
            <input value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Référence</span>
            <input value={value.referenceRange} onChange={(event) => onChange({ ...value, referenceRange: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Min</span>
            <input type="number" step="0.01" value={value.minValue} onChange={(event) => onChange({ ...value, minValue: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Max</span>
            <input type="number" step="0.01" value={value.maxValue} onChange={(event) => onChange({ ...value, maxValue: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Ordre</span>
            <input type="number" min="0" value={value.order} onChange={(event) => onChange({ ...value, order: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={value.active} onChange={(event) => onChange({ ...value, active: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Active
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
          <button type="button" disabled={isSaving} onClick={onSave} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function EditSampleTypeModal({ open, value, onChange, onCancel, onSave, isSaving, tests }: { open: boolean; value: { id: string; name: string; description: string; active: boolean; linkedTestIds: string[]; initialLinkedTestIds: string[]; associatedRequirements: Array<{ id: string; labTestId: string }> } | null; onChange: (value: { id: string; name: string; description: string; active: boolean; linkedTestIds: string[]; initialLinkedTestIds: string[]; associatedRequirements: Array<{ id: string; labTestId: string }> }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; tests: Array<{ id: string; name: string }> }) {
  if (!open || !value) return null;

  const selectedTests = new Set(value.linkedTestIds);

  return (
    <Modal isOpen={open} onClose={onCancel} className="max-w-3xl border border-slate-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modifier le type d’échantillon</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="block text-slate-700">Nom</span>
            <input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="block text-slate-700">Description</span>
            <input value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={value.active} onChange={(event) => onChange({ ...value, active: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Active
          </label>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Examens liés</h4>
            <span className="text-xs text-slate-500 dark:text-slate-300">{value.linkedTestIds.length} sélectionné(s)</span>
          </div>

          {tests.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun examen disponible pour lier cet échantillon.</p>
          ) : (
            <div className="grid max-h-60 gap-2 overflow-auto pr-1 md:grid-cols-2">
              {tests.map((test) => (
                <label key={test.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={selectedTests.has(test.id)}
                    onChange={(event) => {
                      const nextIds = event.target.checked
                        ? [...value.linkedTestIds, test.id]
                        : value.linkedTestIds.filter((id) => id !== test.id);
                      onChange({ ...value, linkedTestIds: nextIds });
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                  <span>{test.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
          <button type="button" disabled={isSaving} onClick={onSave} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function EditSampleRequirementModal({ open, value, onChange, onCancel, onSave, isSaving, tests, sampleTypes }: { open: boolean; value: { id: string; labTestId: string; labSampleTypeId: string; volumeRequired: string; volumeUnit: string; storageCondition: string; maxAgeMinutes: string; instructions: string } | null; onChange: (value: { id: string; labTestId: string; labSampleTypeId: string; volumeRequired: string; volumeUnit: string; storageCondition: string; maxAgeMinutes: string; instructions: string }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; tests: Array<{ id: string; name: string }>; sampleTypes: Array<{ id: string; name: string }> }) {
  if (!open || !value) return null;
  return (
    <Modal isOpen={open} onClose={onCancel} className="max-w-3xl border border-slate-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modifier l’exigence d’échantillon</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-slate-700">Examen</span>
            <select value={value.labTestId} onChange={(event) => onChange({ ...value, labTestId: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">Sélectionner</option>
              {tests.map((test) => <option key={test.id} value={test.id}>{test.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Type d’échantillon</span>
            <select value={value.labSampleTypeId} onChange={(event) => onChange({ ...value, labSampleTypeId: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">Sélectionner</option>
              {sampleTypes.map((sampleType) => <option key={sampleType.id} value={sampleType.id}>{sampleType.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Volume requis</span>
            <input type="number" min="0" step="0.1" value={value.volumeRequired} onChange={(event) => onChange({ ...value, volumeRequired: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Unité</span>
            <input value={value.volumeUnit} onChange={(event) => onChange({ ...value, volumeUnit: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Condition stockage</span>
            <input value={value.storageCondition} onChange={(event) => onChange({ ...value, storageCondition: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Temps maximum (min)</span>
            <input type="number" min="0" value={value.maxAgeMinutes} onChange={(event) => onChange({ ...value, maxAgeMinutes: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="block text-slate-700">Instructions</span>
            <input value={value.instructions} onChange={(event) => onChange({ ...value, instructions: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
          <button type="button" disabled={isSaving} onClick={onSave} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function EditConsumableModal({ open, value, onChange, onCancel, onSave, isSaving }: { open: boolean; value: { id: string; name: string; code: string; description: string; unit: string; active: boolean } | null; onChange: (value: { id: string; name: string; code: string; description: string; unit: string; active: boolean }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean }) {
  if (!open || !value) return null;
  return (
    <Modal isOpen={open} onClose={onCancel} className="max-w-2xl border border-slate-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modifier le consommable</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-slate-700">Nom</span>
            <input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Code</span>
            <input value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Unité</span>
            <input value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Description</span>
            <input value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={value.active} onChange={(event) => onChange({ ...value, active: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Active
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
          <button type="button" disabled={isSaving} onClick={onSave} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function EditConsumableRequirementModal({ open, value, onChange, onCancel, onSave, isSaving, tests, consumables }: { open: boolean; value: { id: string; labTestId: string; labConsumableId: string; quantity: string; unit: string } | null; onChange: (value: { id: string; labTestId: string; labConsumableId: string; quantity: string; unit: string }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; tests: Array<{ id: string; name: string }>; consumables: Array<{ id: string; name: string }> }) {
  if (!open || !value) return null;
  return (
    <Modal isOpen={open} onClose={onCancel} className="max-w-2xl border border-slate-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modifier l’association consommable</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-slate-700">Examen</span>
            <select value={value.labTestId} onChange={(event) => onChange({ ...value, labTestId: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">Sélectionner</option>
              {tests.map((test) => <option key={test.id} value={test.id}>{test.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Consommable</span>
            <select value={value.labConsumableId} onChange={(event) => onChange({ ...value, labConsumableId: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">Sélectionner</option>
              {consumables.map((consumable) => <option key={consumable.id} value={consumable.id}>{consumable.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Quantité</span>
            <input type="number" min="0" step="0.01" value={value.quantity} onChange={(event) => onChange({ ...value, quantity: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Unité</span>
            <input value={value.unit} onChange={(event) => onChange({ ...value, unit: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
          <button type="button" disabled={isSaving} onClick={onSave} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function EditStockModal({ open, value, onChange, onCancel, onSave, isSaving }: { open: boolean; value: { id: string; quantity: string; minimumLevel: string; criticalLevel: string; location: string } | null; onChange: (value: { id: string; quantity: string; minimumLevel: string; criticalLevel: string; location: string }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean }) {
  if (!open || !value) return null;
  return (
    <Modal isOpen={open} onClose={onCancel} className="max-w-2xl border border-slate-200 p-0 shadow-2xl">
      <div className="rounded-3xl bg-white p-6 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Modifier le stock</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-slate-700">Quantité</span>
            <input type="number" min="0" step="0.01" value={value.quantity} onChange={(event) => onChange({ ...value, quantity: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Seuil minimum</span>
            <input type="number" min="0" step="0.01" value={value.minimumLevel} onChange={(event) => onChange({ ...value, minimumLevel: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Seuil critique</span>
            <input type="number" min="0" step="0.01" value={value.criticalLevel} onChange={(event) => onChange({ ...value, criticalLevel: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-700">Localisation</span>
            <input value={value.location} onChange={(event) => onChange({ ...value, location: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
          <button type="button" disabled={isSaving} onClick={onSave} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

