import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { Modal } from "../../components/ui/modal";
import { AdminPageShell, DataTable, Panel, StatCard } from "../Administration/adminUi";
import {
  fetchLaboratoryCatalogue,
  LabCataloguePayload,
  createLabCategory,
  createLabConsumable,
  createLabConsumableStock,
  createLabTest,
  createLabTestConsumableRequirement,
  createLabTestParameter,
  createLabSampleType,
  createLabSection,
  createLabTestSampleRequirement,
  fetchLaboratorySettings,
  updateLaboratorySettings,
  deleteLabCatalogueItem,
  updateLabCatalogueItem,
  type LabCatalogueKind,
} from "../../api/laboratory";
import { AlertTriangle, ClipboardList, FlaskConical, Layers, Microscope, Package, Pencil, Trash2 } from "lucide-react";

const NFS_PARAMETERS: Array<{ code: string; name: string; unit: string; reference: string }> = [
  { code: 'GB', name: 'Globules Blancs', reference: '4000-12000', unit: '10^3/µL' },
  { code: 'NEUT', name: 'Neutrophiles', reference: '50-70', unit: '%' },
  { code: 'LYMPH', name: 'Lymphocytes', reference: '20-60', unit: '%' },
  { code: 'MONO', name: 'Monocytes', reference: '3-12', unit: '%' },
  { code: 'EOS', name: 'Éosinophiles', reference: '0.5-5', unit: '%' },
  { code: 'BASO', name: 'Basophiles', reference: '0.0-1.0', unit: '%' },
  { code: 'RDW', name: 'Globules Rouges', reference: '4.5-5.5 (H) / 4.0-5.0 (F)', unit: '%' },
  { code: 'HB', name: 'Hémoglobine', reference: '12-16', unit: 'g/dL' },
  { code: 'HCT', name: 'Hématocrite', reference: '35-49', unit: '%' },
  { code: 'MCV', name: 'VGM', reference: '80-100', unit: 'fL' },
  { code: 'CCM', name: 'CCM', reference: '27-34', unit: 'pg' },
  { code: 'MCHC', name: 'CCMH', reference: '31-37', unit: 'g/dL' },
  { code: 'PS', name: 'Plaquettes Sanguines', reference: '100-300', unit: '10^3/µL' },
  { code: 'VPM', name: 'VPM', reference: '6.5-12', unit: 'fL' },
  { code: 'PTC', name: 'PTC', reference: '0.108-0.282', unit: '%' },
];

const tabs = [
  "Sections",
  "Catégories",
  "Examens",
  "Paramètres",
  "Échantillons",
  "Exigences",
  "Consommables",
  "Stock",
];

type ErrorModalState = { title: string; message: string };

type DeleteTarget = {
  kind: LabCatalogueKind;
  id: string;
  label: string;
};

function ActionButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
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

function ConfirmDeleteModal({ open, title, description, onClose, onConfirm, isDeleting }: { open: boolean; title: string; description: string; onClose: () => void; onConfirm: () => void; isDeleting: boolean }) {
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

function ErrorModal({ open, error, onClose }: { open: boolean; error: ErrorModalState | null; onClose: () => void }) {
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

function EditSectionModal({ open, value, onChange, onCancel, onSave, isSaving }: { open: boolean; value: { id: string; name: string; description: string; order: string; active: boolean } | null; onChange: (value: { id: string; name: string; description: string; order: string; active: boolean }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean }) {
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

function EditCategoryModal({ open, value, onChange, onCancel, onSave, isSaving, sections }: { open: boolean; value: { id: string; sectionId: string; name: string; code: string; description: string; order: string; active: boolean } | null; onChange: (value: { id: string; sectionId: string; name: string; code: string; description: string; order: string; active: boolean }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; sections: Array<{ id: string; name: string }> }) {
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

function EditTestModal({ open, value, onChange, onCancel, onSave, isSaving, categories, sections }: { open: boolean; value: { id: string; code: string; name: string; categoryId: string; sectionId: string; description: string; price: string; turnaroundTimeMinutes: string; resultType: string; unit: string; referenceRange: string; genderRestriction: string; minAge: string; maxAge: string; active: boolean } | null; onChange: (value: { id: string; code: string; name: string; categoryId: string; sectionId: string; description: string; price: string; turnaroundTimeMinutes: string; resultType: string; unit: string; referenceRange: string; genderRestriction: string; minAge: string; maxAge: string; active: boolean }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; categories: Array<{ id: string; name: string }>; sections: Array<{ id: string; name: string }> }) {
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

function EditParameterModal({ open, value, onChange, onCancel, onSave, isSaving, tests }: { open: boolean; value: { id: string; labTestId: string; code: string; name: string; unit: string; resultType: string; referenceRange: string; minValue: string; maxValue: string; order: string; active: boolean } | null; onChange: (value: { id: string; labTestId: string; code: string; name: string; unit: string; resultType: string; referenceRange: string; minValue: string; maxValue: string; order: string; active: boolean }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; tests: Array<{ id: string; name: string }> }) {
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

function EditSampleTypeModal({ open, value, onChange, onCancel, onSave, isSaving, tests }: { open: boolean; value: { id: string; name: string; description: string; active: boolean; linkedTestIds: string[]; initialLinkedTestIds: string[]; associatedRequirements: Array<{ id: string; labTestId: string }> } | null; onChange: (value: { id: string; name: string; description: string; active: boolean; linkedTestIds: string[]; initialLinkedTestIds: string[]; associatedRequirements: Array<{ id: string; labTestId: string }> }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; tests: Array<{ id: string; name: string }> }) {
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

function EditSampleRequirementModal({ open, value, onChange, onCancel, onSave, isSaving, tests, sampleTypes }: { open: boolean; value: { id: string; labTestId: string; labSampleTypeId: string; volumeRequired: string; volumeUnit: string; storageCondition: string; maxAgeMinutes: string; instructions: string } | null; onChange: (value: { id: string; labTestId: string; labSampleTypeId: string; volumeRequired: string; volumeUnit: string; storageCondition: string; maxAgeMinutes: string; instructions: string }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; tests: Array<{ id: string; name: string }>; sampleTypes: Array<{ id: string; name: string }> }) {
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

function EditConsumableModal({ open, value, onChange, onCancel, onSave, isSaving }: { open: boolean; value: { id: string; name: string; code: string; description: string; unit: string; active: boolean } | null; onChange: (value: { id: string; name: string; code: string; description: string; unit: string; active: boolean }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean }) {
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

function EditConsumableRequirementModal({ open, value, onChange, onCancel, onSave, isSaving, tests, consumables }: { open: boolean; value: { id: string; labTestId: string; labConsumableId: string; quantity: string; unit: string } | null; onChange: (value: { id: string; labTestId: string; labConsumableId: string; quantity: string; unit: string }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean; tests: Array<{ id: string; name: string }>; consumables: Array<{ id: string; name: string }> }) {
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

function EditStockModal({ open, value, onChange, onCancel, onSave, isSaving }: { open: boolean; value: { id: string; quantity: string; minimumLevel: string; criticalLevel: string; location: string } | null; onChange: (value: { id: string; quantity: string; minimumLevel: string; criticalLevel: string; location: string }) => void; onCancel: () => void; onSave: () => void; isSaving: boolean }) {
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

export default function CatalogueLab() {
  const { currentUser } = useAuth();
  const [catalogue, setCatalogue] = useState<LabCataloguePayload | null>(null);
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [technicianDirectRelease, setTechnicianDirectRelease] = useState(false);
  const [catalogueMessage, setCatalogueMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [errorModal, setErrorModal] = useState<ErrorModalState | null>(null);
  const [editingSection, setEditingSection] = useState<{ id: string; name: string; description: string; order: string; active: boolean } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ id: string; sectionId: string; name: string; code: string; description: string; order: string; active: boolean } | null>(null);
  const [editingTest, setEditingTest] = useState<{ id: string; code: string; name: string; categoryId: string; sectionId: string; description: string; price: string; turnaroundTimeMinutes: string; resultType: string; unit: string; referenceRange: string; genderRestriction: string; minAge: string; maxAge: string; active: boolean } | null>(null);
  const [editingParameter, setEditingParameter] = useState<{ id: string; labTestId: string; code: string; name: string; unit: string; resultType: string; referenceRange: string; minValue: string; maxValue: string; order: string; active: boolean } | null>(null);
  const [editingSampleType, setEditingSampleType] = useState<{ id: string; name: string; description: string; active: boolean; linkedTestIds: string[]; initialLinkedTestIds: string[]; associatedRequirements: Array<{ id: string; labTestId: string }> } | null>(null);
  const [editingSampleRequirement, setEditingSampleRequirement] = useState<{ id: string; labTestId: string; labSampleTypeId: string; volumeRequired: string; volumeUnit: string; storageCondition: string; maxAgeMinutes: string; instructions: string } | null>(null);
  const [editingConsumable, setEditingConsumable] = useState<{ id: string; name: string; code: string; description: string; unit: string; active: boolean } | null>(null);
  const [editingConsumableRequirement, setEditingConsumableRequirement] = useState<{ id: string; labTestId: string; labConsumableId: string; quantity: string; unit: string } | null>(null);
  const [editingStock, setEditingStock] = useState<{ id: string; quantity: string; minimumLevel: string; criticalLevel: string; location: string } | null>(null);

  const [sectionForm, setSectionForm] = useState({ name: '', description: '', order: '0', active: true });
  const [categoryForm, setCategoryForm] = useState({ sectionId: '', name: '', code: '', description: '', order: '0', active: true });
  const [testForm, setTestForm] = useState({ code: '', name: '', categoryId: '', sectionId: '', description: '', price: '0', turnaroundTimeMinutes: '30', resultType: 'MULTI_PARAMETER', unit: '', referenceRange: '', genderRestriction: 'ALL', minAge: '', maxAge: '', active: true });
  const [parameterSuggestions, setParameterSuggestions] = useState<Array<{ code: string; name: string; unit: string; reference: string }>>([]);
  const [parameterForm, setParameterForm] = useState({ labTestId: '', code: '', name: '', unit: '', resultType: 'NUMERIC', referenceRange: '', minValue: '', maxValue: '', order: '0', active: true });
  const [sampleTypeForm, setSampleTypeForm] = useState({ name: '', description: '', active: true });
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showTestForm, setShowTestForm] = useState(false);
  const [showParameterForm, setShowParameterForm] = useState(false);
  const [showSampleTypeForm, setShowSampleTypeForm] = useState(false);
  const [showSampleRequirementForm, setShowSampleRequirementForm] = useState(false);
  const [showConsumableForm, setShowConsumableForm] = useState(false);
  const [showConsumableRequirementForm, setShowConsumableRequirementForm] = useState(false);
  const [showStockForm, setShowStockForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sampleRequirementForm, setSampleRequirementForm] = useState({ labTestId: '', labSampleTypeId: '', volumeRequired: '', volumeUnit: 'mL', storageCondition: '', maxAgeMinutes: '', instructions: '' });
  const [consumableForm, setConsumableForm] = useState({ name: '', code: '', description: '', unit: '', active: true });
  const [consumableRequirementForm, setConsumableRequirementForm] = useState({ labTestId: '', sectionId: '', labConsumableId: '', quantity: '1', unit: '' });
  const [stockForm, setStockForm] = useState({ labConsumableId: '', quantity: '0', minimumLevel: '', criticalLevel: '', location: '' });

  useEffect(() => {
    loadCatalogue();
  }, []);

  const loadCatalogue = async () => {
    setIsLoading(true);
    try {
      const [data, settings] = await Promise.all([
        fetchLaboratoryCatalogue(),
        fetchLaboratorySettings().catch(() => ({ technicianDirectRelease: false })),
      ]);
      setCatalogue(data);
      setTechnicianDirectRelease(settings.technicianDirectRelease);
    } catch (err) {
      console.error("Impossible de charger le catalogue laboratoire", err);
      setCatalogue(null);
    } finally {
      setIsLoading(false);
    }
  };

  const totalSections = catalogue?.sections.length ?? 0;
  const totalCategories = catalogue?.categories.length ?? 0;
  const totalTests = catalogue?.tests.length ?? 0;
  const totalSampleTypes = catalogue?.sampleTypes.length ?? 0;
  const totalConsumables = catalogue?.consumables.length ?? 0;
  const isLabManager = currentUser?.primaryRole === "LAB_MANAGER";
  const isNfsTest = /(^|\s)(nfs|h[eé]mogramme|num[eé]ration formule sanguine)(\s|$)/i.test(testForm.name);

  const toggleCatalogueItem = async (kind: LabCatalogueKind, item: { id: string; active: boolean }, label: string) => {
    if (!isLabManager) return;
    try {
      await updateLabCatalogueItem(kind, item.id, { active: !item.active });
      setCatalogueMessage(`${label} ${item.active ? "désactivé" : "activé"}.`);
      await loadCatalogue();
    } catch (error) {
      setCatalogueMessage(error instanceof Error ? error.message : `Impossible de modifier ${label}.`);
      setErrorModal({ title: 'Modification impossible', message: error instanceof Error ? error.message : `Impossible de modifier ${label}.` });
    }
  };

  const lowStockConsumables = useMemo(() => {
    if (!catalogue) return [];
    return catalogue.consumables.filter((consumable) =>
      consumable.stock.some((stockLine) => {
        const quantity = Number(stockLine.quantity ?? 0);
        const minimum = Number(stockLine.minimumLevel ?? 0);
        const critical = Number(stockLine.criticalLevel ?? 0);
        return (minimum > 0 && quantity <= minimum) || (critical > 0 && quantity <= critical);
      }),
    );
  }, [catalogue]);

  const filterText = searchQuery.trim().toLowerCase();
  const matchesSearch = useCallback((fields: Array<string | number | undefined | null>) => {
    if (!filterText) return true;
    return fields.some((field) => String(field || '').toLowerCase().includes(filterText));
  }, [filterText]);

  const stockRows = useMemo(() => {
    if (!catalogue) return [];
    return catalogue.consumables.flatMap((consumable) =>
      consumable.stock.map((stockLine) => ({ consumable, stockLine })),
    );
  }, [catalogue]);

  const filteredSections = useMemo(
    () => catalogue?.sections.filter((section) => matchesSearch([section.name, section.description])) ?? [],
    [catalogue, matchesSearch],
  );

  const filteredCategories = useMemo(
    () => catalogue?.categories.filter((category) =>
      matchesSearch([category.name, category.code, category.description]),
    ) ?? [],
    [catalogue, matchesSearch],
  );

  const filteredTests = useMemo(
    () => catalogue?.tests.filter((test) =>
      matchesSearch([test.code, test.name, test.description, test.category?.name, test.unit, test.referenceRange]),
    ) ?? [],
    [catalogue, matchesSearch],
  );

  const filteredParameters = useMemo(
    () => catalogue?.tests.flatMap((test) =>
      (test.parameterTemplates || []).map((parameter) => ({ ...parameter, labTest: { id: test.id, name: test.name } }))
    ).filter((parameter) => matchesSearch([parameter.code, parameter.name, parameter.unit, parameter.resultType, parameter.referenceRange])) ?? [],
    [catalogue, matchesSearch],
  );

  const filteredSampleTypes = useMemo(
    () => catalogue?.sampleTypes.filter((sampleType) =>
      matchesSearch([sampleType.name, sampleType.description]),
    ) ?? [],
    [catalogue, matchesSearch],
  );

  const filteredSampleRequirements = useMemo(
    () => catalogue?.tests.flatMap((test) =>
      (test.sampleRequirements || []).map((requirement) => ({ ...requirement, labTest: { id: test.id, name: test.name } }))
    ).filter((requirement) => matchesSearch([requirement.labTest?.name, requirement.labSampleType?.name, requirement.volumeRequired, requirement.volumeUnit, requirement.storageCondition, requirement.instructions])) ?? [],
    [catalogue, matchesSearch],
  );

  const filteredConsumables = useMemo(
    () => catalogue?.consumables.filter((consumable) =>
      matchesSearch([consumable.name, consumable.code, consumable.description, consumable.unit]),
    ) ?? [],
    [catalogue, matchesSearch],
  );

  const filteredStockRows = useMemo(
    () => stockRows.filter(({ consumable }) =>
      matchesSearch([consumable.name, consumable.code, consumable.unit]),
    ),
    [stockRows, matchesSearch],
  );

  const filteredCategoriesBySection = useMemo(
    () => catalogue?.categories.filter((category) => category.sectionId === testForm.sectionId) ?? [],
    [catalogue, testForm.sectionId],
  );

  const filteredSampleTypesBySelectedTest = useMemo(() => {
    if (!sampleRequirementForm.labTestId) return [];
    const selectedTest = catalogue?.tests.find((test) => test.id === sampleRequirementForm.labTestId);
    const sampleTypes = selectedTest?.sampleRequirements?.map((requirement) => requirement.labSampleType ?? null).filter((type): type is { id: string; name: string } => Boolean(type)) ?? [];
    const uniqueSampleTypes = sampleTypes.reduce<Array<{ id: string; name: string }>>((acc, sampleType) => {
      if (!acc.some((item) => item.id === sampleType.id)) acc.push(sampleType);
      return acc;
    }, []);
    return uniqueSampleTypes;
  }, [catalogue, sampleRequirementForm.labTestId]);

  const formatStockStatus = (quantity: string, minimumLevel?: string | null, criticalLevel?: string | null) => {
    const qty = Number(quantity || '0');
    const min = Number(minimumLevel || '0');
    const critical = Number(criticalLevel || '0');
    if (critical > 0 && qty <= critical) return 'Critique';
    if (min > 0 && qty <= min) return 'Alerte';
    return 'Suffisant';
  };

  const printStockReport = () => {
    if (!catalogue) return;
    const rows = filteredStockRows.length > 0 ? filteredStockRows : stockRows;
    const responsibleName = currentUser?.displayName || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ") || "Responsable laboratoire";
    const html = `
      <html>
        <head>
          <title>État du stock laboratoire</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            .page { max-width: 960px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .logo { width: 56px; height: 56px; object-fit: contain; }
            .title { font-size: 24px; font-weight: 700; margin: 0; }
            .subtitle { margin: 8px 0 0; color: #4b5563; font-size: 14px; }
            .responsible { margin-top: 12px; font-size: 13px; font-weight: 600; color: #111827; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; vertical-align: top; font-size: 12px; }
            th { background: #f8fafc; font-weight: 700; }
            .status-critique { color: #b91c1c; font-weight: 700; }
            .status-alerte { color: #b45309; font-weight: 700; }
            .status-suffisant { color: #047857; font-weight: 700; }
            .footer { margin-top: 24px; font-size: 12px; color: #6b7280; border-top: 1px solid #d1d5db; padding-top: 12px; }
            .signature { margin-top: 36px; display: flex; justify-content: space-between; gap: 20px; }
            .signature-block { width: 45%; text-align: left; }
            .signature-line { margin-top: 60px; border-top: 1px solid #111827; width: 100%; }
            @media print { body { margin: 0; } .page { padding: 18mm; } }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="brand">
                <img src="/images/favicon.png" alt="Logo clinique" class="logo" />
                <div>
                  <div class="title">ÉTAT DE STOCK DU LABORATOIRE</div>
                  <div class="subtitle">Service de laboratoire - D7 Clinique</div>
                  <div class="subtitle">Imprimé le ${new Date().toLocaleDateString('fr-FR')}</div>
                </div>
              </div>
              <div style="text-align:right; font-size:12px; color:#4b5563;">
                <div>Document administratif</div>
                <div>Etat du stock consommables</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Consommable</th>
                  <th>Code</th>
                  <th>Quantité</th>
                  <th>Unité</th>
                  <th>Minimum</th>
                  <th>Critique</th>
                  <th>Localisation</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(({ consumable, stockLine }) => {
                  const status = formatStockStatus(stockLine.quantity, stockLine.minimumLevel, stockLine.criticalLevel);
                  const statusClass = status === 'Critique' ? 'status-critique' : status === 'Alerte' ? 'status-alerte' : 'status-suffisant';
                  return `
                    <tr>
                      <td>${consumable.name}</td>
                      <td>${consumable.code || '—'}</td>
                      <td>${stockLine.quantity}</td>
                      <td>${consumable.unit || '—'}</td>
                      <td>${stockLine.minimumLevel || '—'}</td>
                      <td>${stockLine.criticalLevel || '—'}</td>
                      <td>${stockLine.location || '—'}</td>
                      <td class="${statusClass}">${status}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div class="responsible">Responsable laboratoire: ${responsibleName}</div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  const showSuccess = (message: string) => {
    setCatalogueMessage(message);
  };

  const showError = (title: string, message: string) => {
    setErrorModal({ title, message });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !isLabManager) return;
    setIsSaving(true);
    try {
      await deleteLabCatalogueItem(deleteTarget.kind, deleteTarget.id);
      setCatalogueMessage(`${deleteTarget.label} supprimé.`);
      await loadCatalogue();
    } catch (error) {
      setErrorModal({ title: 'Suppression impossible', message: error instanceof Error ? error.message : `Impossible de supprimer ${deleteTarget.label}.` });
    } finally {
      setIsSaving(false);
      setDeleteTarget(null);
    }
  };

  const handleEditSection = (section: { id: string; name: string; description?: string | null; order: number; active: boolean }) => {
    setEditingSection({ id: section.id, name: section.name, description: section.description || '', order: String(section.order ?? 0), active: section.active });
  };

  const handleSaveSection = async () => {
    if (!editingSection) return;
    if (!editingSection.name.trim()) {
      showError('Validation', 'Le nom de la section est requis.');
      return;
    }
    setIsSaving(true);
    try {
      await updateLabCatalogueItem('sections', editingSection.id, {
        name: editingSection.name,
        description: editingSection.description,
        order: editingSection.order,
        active: editingSection.active,
      });
      setEditingSection(null);
      await loadCatalogue();
      showSuccess('Section mise à jour.');
    } catch (error) {
      showError('Modification impossible', error instanceof Error ? error.message : 'Impossible de mettre à jour la section.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCategory = (category: { id: string; sectionId?: string | null; name: string; code?: string | null; description?: string | null; order: number; active: boolean }) => {
    setEditingCategory({ id: category.id, sectionId: category.sectionId || '', name: category.name, code: category.code || '', description: category.description || '', order: String(category.order ?? 0), active: category.active });
  };

  const handleSaveCategory = async () => {
    if (!editingCategory) return;
    if (!editingCategory.name.trim()) {
      showError('Validation', 'Le nom de la catégorie est requis.');
      return;
    }
    setIsSaving(true);
    try {
      await updateLabCatalogueItem('categories', editingCategory.id, {
        sectionId: editingCategory.sectionId || undefined,
        name: editingCategory.name,
        code: editingCategory.code,
        description: editingCategory.description,
        order: editingCategory.order,
        active: editingCategory.active,
      });
      setEditingCategory(null);
      await loadCatalogue();
      showSuccess('Catégorie mise à jour.');
    } catch (error) {
      showError('Modification impossible', error instanceof Error ? error.message : 'Impossible de mettre à jour la catégorie.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditTest = (test: { id: string; code: string; name: string; categoryId: string; sectionId?: string | null; description?: string | null; price: string; turnaroundTimeMinutes?: number | null; resultType: string; unit?: string | null; referenceRange?: string | null; genderRestriction?: string | null; minAge?: number | null; maxAge?: number | null; active: boolean }) => {
    setEditingTest({ id: test.id, code: test.code, name: test.name, categoryId: test.categoryId, sectionId: test.sectionId || '', description: test.description || '', price: String(test.price ?? 0), turnaroundTimeMinutes: String(test.turnaroundTimeMinutes ?? ''), resultType: test.resultType, unit: test.unit || '', referenceRange: test.referenceRange || '', genderRestriction: test.genderRestriction || 'ALL', minAge: test.minAge != null ? String(test.minAge) : '', maxAge: test.maxAge != null ? String(test.maxAge) : '', active: test.active });
  };

  const handleSaveTest = async () => {
    if (!editingTest) return;
    if (!editingTest.code.trim() || !editingTest.name.trim() || !editingTest.categoryId) {
      showError('Validation', 'Code, nom et catégorie sont requis.');
      return;
    }
    setIsSaving(true);
    try {
      await updateLabCatalogueItem('tests', editingTest.id, {
        code: editingTest.code,
        name: editingTest.name,
        categoryId: editingTest.categoryId,
        sectionId: editingTest.sectionId || undefined,
        description: editingTest.description,
        price: editingTest.price,
        turnaroundTimeMinutes: editingTest.turnaroundTimeMinutes,
        resultType: editingTest.resultType,
        unit: editingTest.unit,
        referenceRange: editingTest.referenceRange,
        genderRestriction: editingTest.genderRestriction,
        minAge: editingTest.minAge,
        maxAge: editingTest.maxAge,
        active: editingTest.active,
      });
      setEditingTest(null);
      await loadCatalogue();
      showSuccess('Examen mis à jour.');
    } catch (error) {
      showError('Modification impossible', error instanceof Error ? error.message : 'Impossible de mettre à jour l\'examen.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditParameter = (parameter: { id: string; labTestId?: string | null; labTest?: { id: string; name: string } | null; code: string; name: string; unit?: string | null; resultType: string; referenceRange?: string | null; minValue?: string | null; maxValue?: string | null; order: number; active: boolean }) => {
    setEditingParameter({ id: parameter.id, labTestId: parameter.labTestId || parameter.labTest?.id || '', code: parameter.code, name: parameter.name, unit: parameter.unit || '', resultType: parameter.resultType, referenceRange: parameter.referenceRange || '', minValue: parameter.minValue || '', maxValue: parameter.maxValue || '', order: String(parameter.order ?? 0), active: parameter.active });
  };

  const handleSaveParameter = async () => {
    if (!editingParameter) return;
    if (!editingParameter.labTestId || !editingParameter.code.trim() || !editingParameter.name.trim()) {
      showError('Validation', 'Examen, code et nom sont requis.');
      return;
    }
    setIsSaving(true);
    try {
      await updateLabCatalogueItem('test-parameters', editingParameter.id, {
        labTestId: editingParameter.labTestId,
        code: editingParameter.code,
        name: editingParameter.name,
        unit: editingParameter.unit,
        resultType: editingParameter.resultType,
        referenceRange: editingParameter.referenceRange,
        minValue: editingParameter.minValue,
        maxValue: editingParameter.maxValue,
        order: editingParameter.order,
        active: editingParameter.active,
      });
      setEditingParameter(null);
      await loadCatalogue();
      showSuccess('Paramètre mis à jour.');
    } catch (error) {
      showError('Modification impossible', error instanceof Error ? error.message : 'Impossible de mettre à jour le paramètre.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSampleType = (sampleType: { id: string; name: string; description?: string | null; active: boolean; sampleRequirements?: Array<{ id: string; labTestId: string }> }) => {
    const linkedTestIds = sampleType.sampleRequirements?.map((requirement) => requirement.labTestId) ?? [];
    setEditingSampleType({
      id: sampleType.id,
      name: sampleType.name,
      description: sampleType.description || '',
      active: sampleType.active,
      linkedTestIds,
      initialLinkedTestIds: [...linkedTestIds],
      associatedRequirements: sampleType.sampleRequirements ?? [],
    });
  };

  const handleSaveSampleType = async () => {
    if (!editingSampleType) return;
    if (!editingSampleType.name.trim()) {
      showError('Validation', 'Le nom du type d\'échantillon est requis.');
      return;
    }

    setIsSaving(true);
    try {
      await updateLabCatalogueItem('sample-types', editingSampleType.id, {
        name: editingSampleType.name,
        description: editingSampleType.description,
        active: editingSampleType.active,
      });

      const selectedIds = new Set(editingSampleType.linkedTestIds);
      const initialIds = new Set(editingSampleType.initialLinkedTestIds);

      const idsToLink = [...selectedIds].filter((testId) => !initialIds.has(testId));
      const requirementsToUnlink = (editingSampleType.associatedRequirements ?? []).filter((requirement) => !selectedIds.has(requirement.labTestId));

      for (const testId of idsToLink) {
        await createLabTestSampleRequirement({
          labTestId: testId,
          labSampleTypeId: editingSampleType.id,
        });
      }

      for (const requirement of requirementsToUnlink) {
        await deleteLabCatalogueItem('sample-requirements', requirement.id);
      }

      setEditingSampleType(null);
      await loadCatalogue();
      showSuccess('Type d\'échantillon mis à jour avec les examens associés.');
    } catch (error) {
      showError('Modification impossible', error instanceof Error ? error.message : 'Impossible de mettre à jour l\'échantillon.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSampleRequirement = (requirement: { id: string; labTestId?: string | null; labTest?: { id: string; name: string } | null; labSampleTypeId: string; volumeRequired?: string | null; volumeUnit?: string | null; storageCondition?: string | null; maxAgeMinutes?: number | null; instructions?: string | null }) => {
    setEditingSampleRequirement({ id: requirement.id, labTestId: requirement.labTestId || requirement.labTest?.id || '', labSampleTypeId: requirement.labSampleTypeId, volumeRequired: requirement.volumeRequired || '', volumeUnit: requirement.volumeUnit || '', storageCondition: requirement.storageCondition || '', maxAgeMinutes: requirement.maxAgeMinutes != null ? String(requirement.maxAgeMinutes) : '', instructions: requirement.instructions || '' });
  };

  const handleEditConsumable = (consumable: { id: string; name: string; code?: string | null; description?: string | null; unit?: string | null; active: boolean }) => {
    setEditingConsumable({ id: consumable.id, name: consumable.name, code: consumable.code || '', description: consumable.description || '', unit: consumable.unit || '', active: consumable.active });
  };

  const handleSaveConsumable = async () => {
    if (!editingConsumable) return;
    if (!editingConsumable.name.trim() || !editingConsumable.code.trim() || !editingConsumable.unit.trim()) {
      showError('Validation', 'Nom, code et unité sont requis.');
      return;
    }
    setIsSaving(true);
    try {
      await updateLabCatalogueItem('consumables', editingConsumable.id, {
        name: editingConsumable.name,
        code: editingConsumable.code,
        description: editingConsumable.description,
        unit: editingConsumable.unit,
        active: editingConsumable.active,
      });
      setEditingConsumable(null);
      await loadCatalogue();
      showSuccess('Consommable mis à jour.');
    } catch (error) {
      showError('Modification impossible', error instanceof Error ? error.message : 'Impossible de mettre à jour le consommable.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSampleRequirement = async () => {
    if (!editingSampleRequirement) return;
    if (!editingSampleRequirement.labTestId || !editingSampleRequirement.labSampleTypeId) {
      showError('Validation', 'Examen et type d\'échantillon sont requis.');
      return;
    }
    setIsSaving(true);
    try {
      await updateLabCatalogueItem('sample-requirements', editingSampleRequirement.id, {
        labTestId: editingSampleRequirement.labTestId,
        labSampleTypeId: editingSampleRequirement.labSampleTypeId,
        volumeRequired: editingSampleRequirement.volumeRequired,
        volumeUnit: editingSampleRequirement.volumeUnit,
        storageCondition: editingSampleRequirement.storageCondition,
        maxAgeMinutes: editingSampleRequirement.maxAgeMinutes,
        instructions: editingSampleRequirement.instructions,
      });
      setEditingSampleRequirement(null);
      await loadCatalogue();
      showSuccess('Exigence d\'échantillon mise à jour.');
    } catch (error) {
      showError('Modification impossible', error instanceof Error ? error.message : 'Impossible de mettre à jour l\'exigence.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditConsumableRequirement = (requirement: { id: string; labTestId: string; labConsumableId: string; quantity: string; unit?: string | null }) => {
    setEditingConsumableRequirement({ id: requirement.id, labTestId: requirement.labTestId, labConsumableId: requirement.labConsumableId, quantity: String(requirement.quantity ?? ''), unit: requirement.unit || '' });
  };

  const handleSaveConsumableRequirement = async () => {
    if (!editingConsumableRequirement) return;
    if (!editingConsumableRequirement.labTestId || !editingConsumableRequirement.labConsumableId || !editingConsumableRequirement.quantity) {
      showError('Validation', 'Examen, consommable et quantité sont requis.');
      return;
    }
    setIsSaving(true);
    try {
      await updateLabCatalogueItem('consumable-requirements', editingConsumableRequirement.id, {
        labTestId: editingConsumableRequirement.labTestId,
        labConsumableId: editingConsumableRequirement.labConsumableId,
        quantity: editingConsumableRequirement.quantity,
        unit: editingConsumableRequirement.unit,
      });
      setEditingConsumableRequirement(null);
      await loadCatalogue();
      showSuccess('Association consommable mise à jour.');
    } catch (error) {
      showError('Modification impossible', error instanceof Error ? error.message : 'Impossible de mettre à jour l\'association.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditStock = (stock: { id: string; quantity: string; minimumLevel?: string | null; criticalLevel?: string | null; location?: string | null }) => {
    setEditingStock({ id: stock.id, quantity: String(stock.quantity ?? ''), minimumLevel: stock.minimumLevel || '', criticalLevel: stock.criticalLevel || '', location: stock.location || '' });
  };

  const handleSaveStock = async () => {
    if (!editingStock) return;
    setIsSaving(true);
    try {
      await updateLabCatalogueItem('stock', editingStock.id, {
        quantity: editingStock.quantity,
        minimumLevel: editingStock.minimumLevel,
        criticalLevel: editingStock.criticalLevel,
        location: editingStock.location,
      });
      setEditingStock(null);
      await loadCatalogue();
      showSuccess('Stock mis à jour.');
    } catch (error) {
      showError('Modification impossible', error instanceof Error ? error.message : 'Impossible de mettre à jour le stock.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleTechnicianDirectRelease = async (enabled: boolean) => {
    setTechnicianDirectRelease(enabled);
    try {
      const settings = await updateLaboratorySettings({ technicianDirectRelease: enabled });
      setTechnicianDirectRelease(settings.technicianDirectRelease);
      showSuccess(
        settings.technicianDirectRelease
          ? "Les techniciens peuvent envoyer directement les resultats valides."
          : "Les resultats techniciens passeront par la validation du responsable.",
      );
    } catch (error) {
      console.error(error);
      setTechnicianDirectRelease(!enabled);
      showError('Modification impossible', 'Impossible de modifier la politique d\'envoi des résultats.');
    }
  };

  const handleCreateSection = async () => {
    if (!sectionForm.name.trim()) {
      showError('Validation', 'Le nom de la section est requis.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabSection({
        name: sectionForm.name,
        description: sectionForm.description || undefined,
        order: sectionForm.order !== '' ? String(sectionForm.order) : undefined,
        active: sectionForm.active,
      });
      setSectionForm({ name: '', description: '', order: '0', active: true });
      setShowSectionForm(false);
      await loadCatalogue();
      showSuccess('Section créée avec succès.');
    } catch (error) {
      console.error(error);
      showError('Création impossible', 'Impossible de créer la section.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryForm.name.trim()) {
      showError('Validation', 'Le nom de la catégorie est requis.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabCategory({
        sectionId: categoryForm.sectionId || undefined,
        name: categoryForm.name,
        code: categoryForm.code || undefined,
        description: categoryForm.description || undefined,
        order: categoryForm.order !== '' ? String(categoryForm.order) : undefined,
        active: categoryForm.active,
      });
      setCategoryForm({ sectionId: '', name: '', code: '', description: '', order: '0', active: true });
      setShowCategoryForm(false);
      await loadCatalogue();
      showSuccess('Catégorie créée avec succès.');
    } catch (error) {
      console.error(error);
      showError('Création impossible', 'Impossible de créer la catégorie.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateTest = async () => {
    if (!testForm.code.trim() || !testForm.name.trim() || !testForm.categoryId) {
      showError('Validation', 'Code, nom et catégorie sont requis pour l\'examen.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabTest({
        code: testForm.code,
        name: testForm.name,
        categoryId: testForm.categoryId,
        sectionId: testForm.sectionId || undefined,
        description: testForm.description || undefined,
        price: Number(testForm.price),
        turnaroundTimeMinutes: testForm.turnaroundTimeMinutes !== '' ? Number(testForm.turnaroundTimeMinutes) : undefined,
        resultType: isNfsTest ? 'MULTI_PARAMETER' : testForm.resultType,
        unit: isNfsTest ? undefined : testForm.unit || undefined,
        referenceRange: isNfsTest ? undefined : testForm.referenceRange || undefined,
        genderRestriction: isNfsTest ? 'ALL' : testForm.genderRestriction,
        minAge: isNfsTest ? undefined : testForm.minAge !== '' ? Number(testForm.minAge) : undefined,
        maxAge: isNfsTest ? undefined : testForm.maxAge !== '' ? Number(testForm.maxAge) : undefined,
        active: testForm.active,
      });
      setTestForm({ code: '', name: '', categoryId: '', sectionId: '', description: '', price: '0', turnaroundTimeMinutes: '30', resultType: 'MULTI_PARAMETER', unit: '', referenceRange: '', genderRestriction: 'ALL', minAge: '', maxAge: '', active: true });
      setShowTestForm(false);
      await loadCatalogue();
      showSuccess('Examen créé avec succès.');
    } catch (error) {
      console.error(error);
      showError('Création impossible', 'Impossible de créer l\'examen.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateParameter = async () => {
    if (!parameterForm.labTestId || !parameterForm.code.trim() || !parameterForm.name.trim()) {
      showError('Validation', 'Test, code et nom sont requis pour le paramètre.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabTestParameter({
        labTestId: parameterForm.labTestId,
        code: parameterForm.code,
        name: parameterForm.name,
        unit: parameterForm.unit || undefined,
        resultType: parameterForm.resultType,
        referenceRange: parameterForm.referenceRange || undefined,
        minValue: parameterForm.minValue || undefined,
        maxValue: parameterForm.maxValue || undefined,
        order: parameterForm.order !== '' ? Number(parameterForm.order) : undefined,
        active: parameterForm.active,
      });
      setParameterForm({ labTestId: '', code: '', name: '', unit: '', resultType: 'NUMERIC', referenceRange: '', minValue: '', maxValue: '', order: '0', active: true });
      setShowParameterForm(false);
      await loadCatalogue();
      showSuccess('Paramètre créé avec succès.');
    } catch (error) {
      console.error(error);
      showError('Création impossible', 'Impossible de créer le paramètre.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSampleType = async () => {
    if (!sampleTypeForm.name.trim()) {
      showError('Validation', 'Le nom du type d\'échantillon est requis.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabSampleType({
        name: sampleTypeForm.name,
        description: sampleTypeForm.description || undefined,
        active: sampleTypeForm.active,
      });

      setSampleTypeForm({ name: '', description: '', active: true });
      setShowSampleTypeForm(false);
      await loadCatalogue();
      showSuccess('Type d\'échantillon créé avec succès. Vous pouvez maintenant le relier à un ou plusieurs examens via les exigences.');
    } catch (error) {
      console.error(error);
      showError('Création impossible', 'Impossible de créer le type d\'échantillon.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSampleRequirement = async () => {
    if (!sampleRequirementForm.labTestId || !sampleRequirementForm.labSampleTypeId) {
      showError('Validation', 'Test et type d\'échantillon sont requis.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabTestSampleRequirement({
        labTestId: sampleRequirementForm.labTestId,
        labSampleTypeId: sampleRequirementForm.labSampleTypeId,
        volumeRequired: sampleRequirementForm.volumeRequired !== '' ? Number(sampleRequirementForm.volumeRequired) : undefined,
        volumeUnit: sampleRequirementForm.volumeUnit || undefined,
        storageCondition: sampleRequirementForm.storageCondition || undefined,
        maxAgeMinutes: sampleRequirementForm.maxAgeMinutes !== '' ? Number(sampleRequirementForm.maxAgeMinutes) : undefined,
        instructions: sampleRequirementForm.instructions || undefined,
      });
      setSampleRequirementForm({ labTestId: '', labSampleTypeId: '', volumeRequired: '', volumeUnit: 'mL', storageCondition: '', maxAgeMinutes: '', instructions: '' });
      setShowSampleRequirementForm(false);
      await loadCatalogue();
      showSuccess('Exigence d échantillon créée avec succès.');
    } catch (error) {
      console.error(error);
      showError('Création impossible', 'Impossible de créer l\'exigence d\'échantillon.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateConsumable = async () => {
    if (!consumableForm.name.trim() || !consumableForm.code.trim() || !consumableForm.unit.trim()) {
      showError('Validation', 'Nom, code et unité sont requis.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabConsumable({
        name: consumableForm.name,
        code: consumableForm.code,
        description: consumableForm.description || undefined,
        unit: consumableForm.unit,
        active: consumableForm.active,
      });
      setConsumableForm({ name: '', code: '', description: '', unit: '', active: true });
      setShowConsumableForm(false);
      await loadCatalogue();
      showSuccess('Consommable créé avec succès.');
    } catch (error) {
      console.error(error);
      showError('Création impossible', 'Impossible de créer le consommable.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateConsumableRequirement = async () => {
    if (!consumableRequirementForm.labConsumableId || !consumableRequirementForm.quantity) {
      showError('Validation', 'Consommable et quantité sont requis.');
      return;
    }
    if (!consumableRequirementForm.labTestId && !consumableRequirementForm.sectionId) {
      showError('Validation', 'Sélectionnez un examen ou une section.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabTestConsumableRequirement({
        labTestId: consumableRequirementForm.labTestId || undefined,
        sectionId: consumableRequirementForm.sectionId || undefined,
        labConsumableId: consumableRequirementForm.labConsumableId,
        quantity: Number(consumableRequirementForm.quantity),
        unit: consumableRequirementForm.unit || undefined,
      });
      setConsumableRequirementForm({ labTestId: '', sectionId: '', labConsumableId: '', quantity: '1', unit: '' });
      setShowConsumableRequirementForm(false);
      await loadCatalogue();
      showSuccess('Consommable associé avec succès.');
    } catch (error) {
      console.error(error);
      showError('Création impossible', 'Impossible de créer l\'exigence de consommable.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateStock = async () => {
    if (!stockForm.labConsumableId || !stockForm.quantity) {
      showError('Validation', 'Consommable et quantité sont requis.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabConsumableStock({
        labConsumableId: stockForm.labConsumableId,
        quantity: Number(stockForm.quantity),
        minimumLevel: stockForm.minimumLevel !== '' ? Number(stockForm.minimumLevel) : undefined,
        criticalLevel: stockForm.criticalLevel !== '' ? Number(stockForm.criticalLevel) : undefined,
        location: stockForm.location || undefined,
      });
      setStockForm({ labConsumableId: '', quantity: '0', minimumLevel: '', criticalLevel: '', location: '' });
      setShowStockForm(false);
      await loadCatalogue();
      showSuccess('Stock enregistré avec succès.');
    } catch (error) {
      console.error(error);
      showError('Création impossible', 'Impossible d\'enregistrer le stock.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminPageShell
      title="Catalogue laboratoire"
      subtitle="Supervision complète du catalogue de services et des définitions d'examens."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadCatalogue}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Actualiser
          </button>
          {activeTab === "Stock" ? (
            <button
              type="button"
              onClick={printStockReport}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Imprimer état de stock
            </button>
          ) : null}
        </div>
      }
    >

      {catalogueMessage && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{catalogueMessage}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={<Layers size={20} />} label="Sections actives" value={totalSections} tone="blue" />
        <StatCard icon={<ClipboardList size={20} />} label="Catégories actives" value={totalCategories} tone="slate" />
        <StatCard icon={<Microscope size={20} />} label="Examens actifs" value={totalTests} tone="green" />
        <StatCard icon={<FlaskConical size={20} />} label="Types d'échantillons" value={totalSampleTypes} tone="amber" />
        <StatCard icon={<Package size={20} />} label="Consommables référencés" value={totalConsumables} tone="violet" />
      </div>

      <Panel title="Politique de validation" subtitle="Le responsable laboratoire decide si les techniciens peuvent publier directement les resultats.">
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {technicianDirectRelease ? "Envoi direct technicien autorise" : "Validation responsable obligatoire"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {technicianDirectRelease
                ? "Un resultat saisi par un technicien peut etre transmis au medecin demandeur sans attente de validation biologique."
                : "Chaque resultat technique est transmis au responsable laboratoire pour validation, correction ou refus avant publication."}
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>Validation responsable</span>
            <input
              type="checkbox"
              checked={technicianDirectRelease}
              onChange={(event) => handleToggleTechnicianDirectRelease(event.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Envoi direct</span>
          </label>
        </div>
      </Panel>

      <Panel title="Sections du catalogue" subtitle="Naviguez par domaine et inspectez la structure du catalogue." >
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <label className="block w-full min-w-[220px]">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Rechercher sections, examens, consommables, échantillons..."
                className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500">Chargement du catalogue...</p>
          ) : !catalogue ? (
            <p className="text-sm text-red-600">Impossible de récupérer les données du catalogue.</p>
          ) : (
            <div className="space-y-6">
              {activeTab === "Sections" && (
                <div className="space-y-6">
                  <DataTable
                    headers={["Section", "Description", "Catégories", "Examens", "Statut", "Actions"]}
                    rows={filteredSections.map((section) => [
                      section.name,
                      section.description || "-",
                      section.categories.length,
                      section.tests.length,
                      section.active ? "Active" : "Inactive",
                      isLabManager ? <div className="flex gap-2"><button onClick={() => toggleCatalogueItem('sections', section, section.name)} className="text-xs text-blue-700">{section.active ? "Désactiver" : "Activer"}</button><ActionButtons onEdit={() => handleEditSection(section)} onDelete={() => setDeleteTarget({ kind: 'sections', id: section.id, label: section.name })} /></div> : "—",
                    ])}
                  />

                  <button
                    type="button"
                    onClick={() => setShowSectionForm((current) => !current)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showSectionForm ? 'Masquer le formulaire de section' : 'Ajouter une section'}
                  </button>
                  {showSectionForm && (
                    <Panel title="Ajouter une section">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm">
                          <span className="block text-slate-700">Nom</span>
                          <input
                            required
                            value={sectionForm.name}
                            onChange={(event) => setSectionForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Ex: Biochimie"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Description</span>
                          <input
                            value={sectionForm.description}
                            onChange={(event) => setSectionForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder="Description (optionnel)"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Ordre</span>
                          <input
                            required
                            value={sectionForm.order}
                            onChange={(event) => setSectionForm((current) => ({ ...current, order: event.target.value }))}
                            type="number"
                            min="0"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleCreateSection}
                            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Enregistrer
                          </button>
                        </div>
                      </div>
                    </Panel>
                  )}
                </div>
              )}

              {activeTab === "Catégories" && (
                <div className="space-y-6">
                  <DataTable
                    headers={["Catégorie", "Section", "Code", "Examens", "Statut", "Actions"]}
                    rows={filteredCategories.map((category) => [
                      category.name,
                      category.section?.name || "Hors section",
                      category.code || "-",
                      category.tests.length,
                      category.active ? "Active" : "Inactive",
                      isLabManager ? <div className="flex gap-2"><button onClick={() => toggleCatalogueItem('categories', category, category.name)} className="text-xs text-blue-700">{category.active ? "Désactiver" : "Activer"}</button><ActionButtons onEdit={() => handleEditCategory(category)} onDelete={() => setDeleteTarget({ kind: 'categories', id: category.id, label: category.name })} /></div> : "—",
                    ])}
                  />

                  <button
                    type="button"
                    onClick={() => setShowCategoryForm((current) => !current)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showCategoryForm ? 'Masquer le formulaire de catégorie' : 'Ajouter une catégorie'}
                  </button>

                  {showCategoryForm && (
                    <Panel title="Ajouter une catégorie">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm">
                          <span className="block text-slate-700">Section</span>
                          <select
                            required
                            value={categoryForm.sectionId}
                            onChange={(event) => setCategoryForm((current) => ({ ...current, sectionId: event.target.value }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
                            {catalogue.sections.map((section) => (
                              <option key={section.id} value={section.id}>{section.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Nom</span>
                          <input
                            required
                            value={categoryForm.name}
                            onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Ex: Chimie clinique"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Code</span>
                          <input
                            required
                            value={categoryForm.code}
                            onChange={(event) => setCategoryForm((current) => ({ ...current, code: event.target.value }))}
                            placeholder="Ex: BIO"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Description</span>
                          <input
                            value={categoryForm.description}
                            onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder="Description (optionnel)"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Ordre</span>
                          <input
                            required
                            value={categoryForm.order}
                            onChange={(event) => setCategoryForm((current) => ({ ...current, order: event.target.value }))}
                            type="number"
                            min="0"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleCreateCategory}
                            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Enregistrer
                          </button>
                        </div>
                      </div>
                    </Panel>
                  )}
                </div>
              )}

              {activeTab === "Examens" && (
                <div className="space-y-6">
                  <DataTable
                    headers={["Code", "Examen", "Section", "Catégorie", "Type résultat", "Prix", "TAT", "Actif", "Actions"]}
                    rows={filteredTests.map((test) => [
                      test.code,
                      test.name,
                      test.section?.name || "-",
                      test.category?.name || "-",
                      test.resultType,
                      `${Number(test.price || "0").toLocaleString("fr-FR", { style: "currency", currency: "CDF" })}`,
                      test.turnaroundTimeMinutes ? `${test.turnaroundTimeMinutes} min` : "-",
                      test.active ? "Oui" : "Non",
                      isLabManager ? <div className="flex gap-2"><button onClick={() => toggleCatalogueItem('tests', test, test.name)} className="text-xs text-blue-700">{test.active ? "Désactiver" : "Activer"}</button><ActionButtons onEdit={() => handleEditTest(test)} onDelete={() => setDeleteTarget({ kind: 'tests', id: test.id, label: test.name })} /></div> : "—",
                    ])}
                  />

                  <button
                    type="button"
                    onClick={() => setShowTestForm((current) => !current)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showTestForm ? 'Masquer le formulaire d examen' : 'Ajouter un examen'}
                  </button>

                  {showTestForm && (
                    <Panel title="Ajouter un examen">

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm">
                          <span className="block text-slate-700">Section</span>
                          <select
                            required
                            value={testForm.sectionId}
                            onChange={(event) => setTestForm((current) => ({ ...current, sectionId: event.target.value, categoryId: '' }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
                            {catalogue.sections.map((section) => (
                              <option key={section.id} value={section.id}>{section.name}</option>
                            ))}
                          </select>
                        </label>

                        <label className="block text-sm">
                          <span className="block text-slate-700">Catégorie</span>
                          <select
                            required
                            value={testForm.categoryId}
                            onChange={(event) => setTestForm((current) => ({ ...current, categoryId: event.target.value }))}
                            disabled={!testForm.sectionId}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
                            {filteredCategoriesBySection.map((category) => (
                              <option key={category.id} value={category.id}>{category.name}</option>
                            ))}
                          </select>
                        </label>

                        <label className="block text-sm">
                          <span className="block text-slate-700">Code</span>
                          <input
                            required
                            value={testForm.code}
                            onChange={(event) => setTestForm((current) => ({ ...current, code: event.target.value }))}
                            placeholder="Ex: BIO001"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>

                        <label className="block text-sm">
                          <span className="block text-slate-700">Nom</span>
                          <input
                            required
                            value={testForm.name}
                            onChange={(event) => {
                              const value = event.target.value;
                              setTestForm((current) => ({ ...current, name: value }));
                              const isNfs = /(^|\s)(nfs|h[eé]mogramme|num[eé]ration formule sanguine)(\s|$)/i.test(value);
                              setParameterSuggestions(isNfs ? NFS_PARAMETERS : []);
                            }}
                            placeholder="Ex: Dosage de glucose"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        {parameterSuggestions.length > 0 ? (
                          <div className="md:col-span-2 mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                            <p className="font-medium text-slate-800">NFS détectée — paramètres pré-remplis :</p>
                            <ul className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2">
                              {parameterSuggestions.map((p) => (
                                <li key={p.code} className="rounded-md bg-white p-2 shadow-sm">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold">{p.code}</span>
                                    <span className="text-slate-500">{p.unit}</span>
                                  </div>
                                  <div className="mt-1 text-slate-800">{p.name}</div>
                                  <div className="mt-1 text-xs text-slate-500">Réf: {p.reference}</div>
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-xs text-slate-500">Remarque: l examen NFS est facturé comme un examen unique; les paramètres seront créés automatiquement côté serveur.</p>
                          </div>
                        ) : null}

                        <label className="block text-sm">
                          <span className="block text-slate-700">Prix</span>
                          <input
                            required
                            value={testForm.price}
                            onChange={(event) => setTestForm((current) => ({ ...current, price: event.target.value }))}
                            type="number"
                            min="0"
                            step="0.01"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>

                        <label className="block text-sm">
                          <span className="block text-slate-700">Délai (min)</span>
                          <input
                            required
                            value={testForm.turnaroundTimeMinutes}
                            onChange={(event) => setTestForm((current) => ({ ...current, turnaroundTimeMinutes: event.target.value }))}
                            type="number"
                            min="0"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>

                        {!isNfsTest ? (
                          <>
                            <label className="block text-sm">
                              <span className="block text-slate-700">Type résultat</span>
                              <select
                                required
                                value={testForm.resultType}
                                onChange={(event) => setTestForm((current) => ({ ...current, resultType: event.target.value }))}
                                className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              >
                                <option value="NUMERIC">NUMERIC</option>
                                <option value="TEXT">TEXT</option>
                                <option value="SIMPLE">SIMPLE</option>
                                <option value="MULTI_PARAMETER">MULTI_PARAMETER</option>
                              </select>
                            </label>
                            <label className="block text-sm">
                              <span className="block text-slate-700">Genre</span>
                              <select
                                required
                                value={testForm.genderRestriction}
                                onChange={(event) => setTestForm((current) => ({ ...current, genderRestriction: event.target.value }))}
                                className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              >
                                <option value="ALL">ALL</option>
                                <option value="MALE">MALE</option>
                                <option value="FEMALE">FEMALE</option>
                                <option value="UNSPECIFIED">UNSPECIFIED</option>
                              </select>
                            </label>
                            <label className="block text-sm">
                              <span className="block text-slate-700">Unité</span>
                              <input
                                required
                                value={testForm.unit}
                                onChange={(event) => setTestForm((current) => ({ ...current, unit: event.target.value }))}
                                placeholder="mg/dL"
                                className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              />
                            </label>
                            <label className="block text-sm">
                              <span className="block text-slate-700">Référence</span>
                              <input
                                required
                                value={testForm.referenceRange}
                                onChange={(event) => setTestForm((current) => ({ ...current, referenceRange: event.target.value }))}
                                placeholder="Ex: 70-100"
                                className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              />
                            </label>
                            <label className="block text-sm">
                              <span className="block text-slate-700">Âge minimum</span>
                              <input
                                required
                                value={testForm.minAge}
                                onChange={(event) => setTestForm((current) => ({ ...current, minAge: event.target.value }))}
                                type="number"
                                min="0"
                                className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              />
                            </label>
                            <label className="block text-sm">
                              <span className="block text-slate-700">Âge maximum</span>
                              <input
                                required
                                value={testForm.maxAge}
                                onChange={(event) => setTestForm((current) => ({ ...current, maxAge: event.target.value }))}
                                type="number"
                                min="0"
                                className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              />
                            </label>
                          </>
                        ) : null}

                        <label className="block text-sm md:col-span-2">
                          <span className="block text-slate-700">Description</span>
                          <input
                            value={testForm.description}
                            onChange={(event) => setTestForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder="Description (optionnel)"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>

                        <div className="flex items-end md:col-span-2">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleCreateTest}
                            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Enregistrer
                          </button>
                        </div>
                        
                      </div>
                    </Panel>
                  )}
                </div>
              )}

              {activeTab === "Paramètres" && (
                <div className="space-y-6">
                  <DataTable
                    headers={["Examen", "Paramètre", "Code", "Type résultat", "Unité", "Référence", "Statut", "Actions"]}
                    rows={filteredParameters.map((parameter) => [
                      parameter.labTest?.name || "-",
                      parameter.name,
                      parameter.code,
                      parameter.resultType,
                      parameter.unit || "-",
                      parameter.referenceRange || "-",
                      parameter.active ? "Active" : "Inactive",
                      isLabManager ? <ActionButtons onEdit={() => handleEditParameter(parameter)} onDelete={() => setDeleteTarget({ kind: 'test-parameters', id: parameter.id, label: parameter.name })} /> : "—",
                    ])}
                  />

                  <button
                    type="button"
                    onClick={() => setShowParameterForm((current) => !current)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showParameterForm ? 'Masquer le formulaire de paramètre' : 'Ajouter un paramètre'}
                  </button>

                  {showParameterForm && (
                    <Panel title="Ajouter un paramètre">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm">
                          <span className="block text-slate-700">Examen</span>
                          <select
                            required
                            value={parameterForm.labTestId}
                            onChange={(event) => setParameterForm((current) => ({ ...current, labTestId: event.target.value }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
                            {catalogue.tests.map((test) => (
                              <option key={test.id} value={test.id}>{test.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Code</span>
                          <input
                            required
                            value={parameterForm.code}
                            onChange={(event) => setParameterForm((current) => ({ ...current, code: event.target.value }))}
                            placeholder="Ex: GLU"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Nom</span>
                          <input
                            required
                            value={parameterForm.name}
                            onChange={(event) => setParameterForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Ex: Glucose"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Type résultat</span>
                          <select
                            required
                            value={parameterForm.resultType}
                            onChange={(event) => setParameterForm((current) => ({ ...current, resultType: event.target.value }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="NUMERIC">NUMERIC</option>
                            <option value="TEXT">TEXT</option>
                            <option value="SIMPLE">SIMPLE</option>
                            <option value="MULTI_PARAMETER">MULTI_PARAMETER</option>
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Unité</span>
                          <input
                            required
                            value={parameterForm.unit}
                            onChange={(event) => setParameterForm((current) => ({ ...current, unit: event.target.value }))}
                            placeholder="mg/dL"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Référence</span>
                          <input
                            required
                            value={parameterForm.referenceRange}
                            onChange={(event) => setParameterForm((current) => ({ ...current, referenceRange: event.target.value }))}
                            placeholder="Ex: 70-100"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Min</span>
                          <input
                            required
                            value={parameterForm.minValue}
                            onChange={(event) => setParameterForm((current) => ({ ...current, minValue: event.target.value }))}
                            type="number"
                            step="0.01"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Max</span>
                          <input
                            required
                            value={parameterForm.maxValue}
                            onChange={(event) => setParameterForm((current) => ({ ...current, maxValue: event.target.value }))}
                            type="number"
                            step="0.01"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Ordre</span>
                          <input
                            required
                            value={parameterForm.order}
                            onChange={(event) => setParameterForm((current) => ({ ...current, order: event.target.value }))}
                            type="number"
                            min="0"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <div className="flex items-end md:col-span-2">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleCreateParameter}
                            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Enregistrer
                          </button>
                        </div>
                      </div>
                    </Panel>
                  )}
                </div>
              )}

              {activeTab === "Échantillons" && (
                <div className="space-y-6">
                  <DataTable
                    headers={["Type d'échantillon", "Description", "Actif", "Exigences", "Actions"]}
                    rows={filteredSampleTypes.map((sampleType) => [
                      sampleType.name,
                      sampleType.description || "-",
                      sampleType.active ? "Oui" : "Non",
                      sampleType.sampleRequirements.length,
                      isLabManager ? <div className="flex gap-2"><button onClick={() => toggleCatalogueItem('sample-types', sampleType, sampleType.name)} className="text-xs text-blue-700">{sampleType.active ? "Désactiver" : "Activer"}</button><ActionButtons onEdit={() => handleEditSampleType(sampleType)} onDelete={() => setDeleteTarget({ kind: 'sample-types', id: sampleType.id, label: sampleType.name })} /></div> : "—",
                    ])}
                  />

                  <button
                    type="button"
                    onClick={() => setShowSampleTypeForm((current) => !current)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showSampleTypeForm ? 'Masquer le formulaire de type d échantillon' : 'Ajouter un type d échantillon'}
                  </button>

                  {showSampleTypeForm && (
                    <Panel title="Ajouter un type d'échantillon">
                      <div className="space-y-4">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          Un échantillon est un type réutilisable. Il est ensuite relié à un ou plusieurs examens depuis l’onglet Exigences.
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="block text-sm md:col-span-2">
                            <span className="block text-slate-700">Nom</span>
                            <input
                              required
                              value={sampleTypeForm.name}
                              onChange={(event) => setSampleTypeForm((current) => ({ ...current, name: event.target.value }))}
                              placeholder="Ex: Sang veineux"
                              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                          </label>
                          <label className="block text-sm md:col-span-2">
                            <span className="block text-slate-700">Description</span>
                            <input
                              value={sampleTypeForm.description}
                              onChange={(event) => setSampleTypeForm((current) => ({ ...current, description: event.target.value }))}
                              placeholder="Description (optionnel)"
                              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                          </label>
                          <div className="flex items-end">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={handleCreateSampleType}
                              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Enregistrer
                            </button>
                          </div>
                        </div>
                      </div>
                    </Panel>
                  )}
                </div>
              )}

              {activeTab === "Exigences" && (
                <div className="space-y-6">
                  <DataTable
                    headers={["Examen", "Échantillon", "Volume", "Condition stockage", "Temps max", "Instructions", "Actions"]}
                    rows={filteredSampleRequirements.map((requirement) => [
                      requirement.labTest?.name || "-",
                      requirement.labSampleType?.name || "-",
                      requirement.volumeRequired ? `${Number(requirement.volumeRequired).toLocaleString("fr-FR")} ${requirement.volumeUnit || "mL"}` : "-",
                      requirement.storageCondition || "-",
                      requirement.maxAgeMinutes ? `${requirement.maxAgeMinutes} min` : "-",
                      requirement.instructions || "-",
                      isLabManager ? <ActionButtons onEdit={() => handleEditSampleRequirement(requirement)} onDelete={() => setDeleteTarget({ kind: 'sample-requirements', id: requirement.id, label: `${requirement.labTest?.name || 'Exigence'}` })} /> : "—",
                    ])}
                  />

                  <button
                    type="button"
                    onClick={() => setShowSampleRequirementForm((current) => !current)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showSampleRequirementForm ? 'Masquer le formulaire d exigence' : 'Ajouter une exigence d échantillon'}
                  </button>

                  {showSampleRequirementForm && (
                    <Panel title="Ajouter une exigence d'échantillon">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm">
                          <span className="block text-slate-700">Examen</span>
                          <select
                            required
                            value={sampleRequirementForm.labTestId}
                            onChange={(event) => setSampleRequirementForm((current) => ({ ...current, labTestId: event.target.value, labSampleTypeId: '' }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
                            {catalogue.tests.map((test) => (
                              <option key={test.id} value={test.id}>{test.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Type d'échantillon</span>
                          <select
                            required
                            value={sampleRequirementForm.labSampleTypeId}
                            onChange={(event) => setSampleRequirementForm((current) => ({ ...current, labSampleTypeId: event.target.value }))}
                            disabled={!sampleRequirementForm.labTestId}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
                            {filteredSampleTypesBySelectedTest.map((sampleType) => (
                              <option key={sampleType.id} value={sampleType.id}>{sampleType.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Volume requis</span>
                          <input
                            required
                            value={sampleRequirementForm.volumeRequired}
                            onChange={(event) => setSampleRequirementForm((current) => ({ ...current, volumeRequired: event.target.value }))}
                            type="number"
                            min="0"
                            step="0.1"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Unité</span>
                          <input
                            required
                            value={sampleRequirementForm.volumeUnit}
                            onChange={(event) => setSampleRequirementForm((current) => ({ ...current, volumeUnit: event.target.value }))}
                            placeholder="mL"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Condition stockage</span>
                          <input
                            required
                            value={sampleRequirementForm.storageCondition}
                            onChange={(event) => setSampleRequirementForm((current) => ({ ...current, storageCondition: event.target.value }))}
                            placeholder="Refrigerer"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Temps maximum (min)</span>
                          <input
                            required
                            value={sampleRequirementForm.maxAgeMinutes}
                            onChange={(event) => setSampleRequirementForm((current) => ({ ...current, maxAgeMinutes: event.target.value }))}
                            type="number"
                            min="0"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm md:col-span-2">
                          <span className="block text-slate-700">Instructions</span>
                          <input
                            required
                            value={sampleRequirementForm.instructions}
                            onChange={(event) => setSampleRequirementForm((current) => ({ ...current, instructions: event.target.value }))}
                            placeholder="Ex: Prelever le matin"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <div className="flex items-end md:col-span-2">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleCreateSampleRequirement}
                            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Enregistrer
                          </button>
                        </div>
                      </div>
                    </Panel>
                  )}
                </div>
              )}

              {activeTab === "Consommables" && (
                <div className="space-y-6">
                  <DataTable
                    headers={["Consommable", "Code", "Unité", "Stock total", "Nb tests associés", "Actions"]}
                    rows={filteredConsumables.map((consumable) => [
                      consumable.name,
                      consumable.code,
                      consumable.unit,
                      consumable.stock.reduce((sum, stockLine) => sum + Number(stockLine.quantity || 0), 0).toLocaleString("fr-FR"),
                      catalogue.tests.filter((test) =>
                        test.consumableRequirements.some((requirement) => requirement.labConsumableId === consumable.id),
                      ).length,
                      isLabManager ? <div className="flex gap-2"><button onClick={() => toggleCatalogueItem('consumables', consumable, consumable.name)} className="text-xs text-blue-700">{consumable.active ? "Désactiver" : "Activer"}</button><ActionButtons onEdit={() => handleEditConsumable(consumable)} onDelete={() => setDeleteTarget({ kind: 'consumables', id: consumable.id, label: consumable.name })} /></div> : "—",
                    ])}
                  />

                  <button
                    type="button"
                    onClick={() => setShowConsumableForm((current) => !current)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showConsumableForm ? 'Masquer le formulaire consommable' : 'Ajouter un consommable'}
                  </button>

                  {showConsumableForm && (
                    <Panel title="Ajouter un consommable">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm">
                          <span className="block text-slate-700">Nom</span>
                          <input
                            required
                            value={consumableForm.name}
                            onChange={(event) => setConsumableForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Ex: Tubes EDTA"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Code</span>
                          <input
                            required
                            value={consumableForm.code}
                            onChange={(event) => setConsumableForm((current) => ({ ...current, code: event.target.value }))}
                            placeholder="Ex: TUBE_EDTA"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Unité</span>
                          <input
                            required
                            value={consumableForm.unit}
                            onChange={(event) => setConsumableForm((current) => ({ ...current, unit: event.target.value }))}
                            placeholder="Ex: pièce"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm md:col-span-2">
                          <span className="block text-slate-700">Description</span>
                          <input
                            value={consumableForm.description}
                            onChange={(event) => setConsumableForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder="Description (optionnel)"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <div className="flex items-end md:col-span-2">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleCreateConsumable}
                            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Enregistrer
                          </button>
                        </div>
                      </div>
                    </Panel>
                  )}

                  <DataTable
                    headers={["Examen", "Consommable", "Quantité", "Unité", "Actions"]}
                    rows={catalogue.tests.flatMap((test) =>
                      (test.consumableRequirements || []).map((requirement) => [
                        test.name,
                        requirement.labConsumable?.name || '-',
                        requirement.quantity,
                        requirement.unit || '-',
                        isLabManager ? <ActionButtons onEdit={() => handleEditConsumableRequirement({ id: requirement.id, labTestId: test.id, labConsumableId: requirement.labConsumableId, quantity: requirement.quantity, unit: requirement.unit || '' })} onDelete={() => setDeleteTarget({ kind: 'consumable-requirements', id: requirement.id, label: `${test.name} / ${requirement.labConsumable?.name || 'consommable'}` })} /> : '—',
                      ])
                    )}
                  />

                  <button
                    type="button"
                    onClick={() => setShowConsumableRequirementForm((current) => !current)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showConsumableRequirementForm ? 'Masquer le formulaire d association de consommable' : 'Associer consommable à une section'}
                  </button>

                  {showConsumableRequirementForm && (
                    <Panel title="Associer consommable à une section">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm">
                          <span className="block text-slate-700">Section</span>
                          <select
                            value={consumableRequirementForm.sectionId}
                            onChange={(event) => setConsumableRequirementForm((current) => ({ ...current, sectionId: event.target.value, labTestId: '' }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Sélectionner une section</option>
                            {catalogue.sections.map((section) => (
                              <option key={section.id} value={section.id}>{section.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Examen (optionnel)</span>
                          <select
                            value={consumableRequirementForm.labTestId}
                            onChange={(event) => setConsumableRequirementForm((current) => ({ ...current, labTestId: event.target.value, sectionId: '' }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Sélectionner un examen</option>
                            {catalogue.tests.map((test) => (
                              <option key={test.id} value={test.id}>{test.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Consommable</span>
                          <select
                            required
                            value={consumableRequirementForm.labConsumableId}
                            onChange={(event) => setConsumableRequirementForm((current) => ({ ...current, labConsumableId: event.target.value }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
                            {catalogue.consumables.map((consumable) => (
                              <option key={consumable.id} value={consumable.id}>{consumable.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Quantité</span>
                          <input
                            required
                            value={consumableRequirementForm.quantity}
                            onChange={(event) => setConsumableRequirementForm((current) => ({ ...current, quantity: event.target.value }))}
                            type="number"
                            min="0"
                            step="0.01"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Unité</span>
                          <input
                            required
                            value={consumableRequirementForm.unit}
                            onChange={(event) => setConsumableRequirementForm((current) => ({ ...current, unit: event.target.value }))}
                            placeholder="Ex: pièce"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <div className="flex items-end md:col-span-2">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleCreateConsumableRequirement}
                            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Enregistrer
                          </button>
                        </div>
                      </div>
                    </Panel>
                  )}
                </div>
              )}

              {activeTab === "Stock" && (
                <div className="space-y-6">
                  <Panel title="Consommables proches du seuil critique">
                    {lowStockConsumables.length === 0 ? (
                      <p className="text-sm text-slate-500">Aucun consommable en dessous du seuil défini.</p>
                    ) : (
                      <DataTable
                        headers={["Consommable", "Stock total", "Minimum", "Critique", "Localisations"]}
                        rows={lowStockConsumables.map((consumable) => [
                          consumable.name,
                          consumable.stock.reduce((sum, line) => sum + Number(line.quantity || 0), 0).toLocaleString("fr-FR"),
                          consumable.stock.map((line) => line.minimumLevel ?? "-").join(", "),
                          consumable.stock.map((line) => line.criticalLevel ?? "-").join(", "),
                          consumable.stock.map((line) => line.location || "-").join(", "),
                        ])}
                      />
                    )}
                  </Panel>

                  <DataTable
                    headers={["Consommable", "Quantité", "Minimum", "Critique", "Localisation", "Actions"]}
                    rows={stockRows.map(({ consumable, stockLine }) => [
                      consumable.name,
                      stockLine.quantity,
                      stockLine.minimumLevel ?? '-',
                      stockLine.criticalLevel ?? '-',
                      stockLine.location ?? '-',
                      isLabManager ? <ActionButtons onEdit={() => handleEditStock({ id: stockLine.id, quantity: String(stockLine.quantity ?? ''), minimumLevel: stockLine.minimumLevel ?? '', criticalLevel: stockLine.criticalLevel ?? '', location: stockLine.location ?? '' })} onDelete={() => setDeleteTarget({ kind: 'stock', id: stockLine.id, label: `${consumable.name} (${stockLine.location || 'stock'})` })} /> : '—',
                    ])}
                  />

                  <button
                    type="button"
                    onClick={() => setShowStockForm((current) => !current)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showStockForm ? 'Masquer le formulaire de stock' : 'Ajouter un stock consommable'}
                  </button>

                  {showStockForm && (
                    <Panel title="Ajouter un stock consommable">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm">
                          <span className="block text-slate-700">Consommable</span>
                          <select
                            required
                            value={stockForm.labConsumableId}
                            onChange={(event) => setStockForm((current) => ({ ...current, labConsumableId: event.target.value }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
                            {catalogue.consumables.map((consumable) => (
                              <option key={consumable.id} value={consumable.id}>{consumable.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Quantité</span>
                          <input
                            required
                            value={stockForm.quantity}
                            onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))}
                            type="number"
                            min="0"
                            step="0.01"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Seuil minimum</span>
                          <input
                            required
                            value={stockForm.minimumLevel}
                            onChange={(event) => setStockForm((current) => ({ ...current, minimumLevel: event.target.value }))}
                            type="number"
                            min="0"
                            step="0.01"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Seuil critique</span>
                          <input
                            required
                            value={stockForm.criticalLevel}
                            onChange={(event) => setStockForm((current) => ({ ...current, criticalLevel: event.target.value }))}
                            type="number"
                            min="0"
                            step="0.01"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm md:col-span-2">
                          <span className="block text-slate-700">Localisation</span>
                          <input
                            required
                            value={stockForm.location}
                            onChange={(event) => setStockForm((current) => ({ ...current, location: event.target.value }))}
                            placeholder="Ex: Stock principal"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <div className="flex items-end md:col-span-2">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleCreateStock}
                            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Enregistrer
                          </button>
                        </div>
                      </div>
                    </Panel>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      <EditSectionModal open={Boolean(editingSection)} value={editingSection} onChange={(next) => setEditingSection(next)} onCancel={() => setEditingSection(null)} onSave={handleSaveSection} isSaving={isSaving} />
      <EditCategoryModal open={Boolean(editingCategory)} value={editingCategory} onChange={(next) => setEditingCategory(next)} onCancel={() => setEditingCategory(null)} onSave={handleSaveCategory} isSaving={isSaving} sections={(catalogue?.sections ?? []).map((section) => ({ id: section.id, name: section.name }))} />
      <EditTestModal open={Boolean(editingTest)} value={editingTest} onChange={(next) => setEditingTest(next)} onCancel={() => setEditingTest(null)} onSave={handleSaveTest} isSaving={isSaving} categories={(catalogue?.categories ?? []).map((category) => ({ id: category.id, name: category.name }))} sections={(catalogue?.sections ?? []).map((section) => ({ id: section.id, name: section.name }))} />
      <EditParameterModal open={Boolean(editingParameter)} value={editingParameter} onChange={(next) => setEditingParameter(next)} onCancel={() => setEditingParameter(null)} onSave={handleSaveParameter} isSaving={isSaving} tests={(catalogue?.tests ?? []).map((test) => ({ id: test.id, name: test.name }))} />
      <EditSampleTypeModal
        open={Boolean(editingSampleType)}
        value={editingSampleType}
        onChange={(next) => setEditingSampleType(next)}
        onCancel={() => setEditingSampleType(null)}
        onSave={handleSaveSampleType}
        isSaving={isSaving}
        tests={(catalogue?.tests ?? []).map((test) => ({ id: test.id, name: test.name }))}
      />
      <EditSampleRequirementModal open={Boolean(editingSampleRequirement)} value={editingSampleRequirement} onChange={(next) => setEditingSampleRequirement(next)} onCancel={() => setEditingSampleRequirement(null)} onSave={handleSaveSampleRequirement} isSaving={isSaving} tests={(catalogue?.tests ?? []).map((test) => ({ id: test.id, name: test.name }))} sampleTypes={(catalogue?.sampleTypes ?? []).map((sampleType) => ({ id: sampleType.id, name: sampleType.name }))} />
      <EditConsumableModal open={Boolean(editingConsumable)} value={editingConsumable} onChange={(next) => setEditingConsumable(next)} onCancel={() => setEditingConsumable(null)} onSave={handleSaveConsumable} isSaving={isSaving} />
      <EditConsumableRequirementModal open={Boolean(editingConsumableRequirement)} value={editingConsumableRequirement} onChange={(next) => setEditingConsumableRequirement(next)} onCancel={() => setEditingConsumableRequirement(null)} onSave={handleSaveConsumableRequirement} isSaving={isSaving} tests={(catalogue?.tests ?? []).map((test) => ({ id: test.id, name: test.name }))} consumables={(catalogue?.consumables ?? []).map((consumable) => ({ id: consumable.id, name: consumable.name }))} />
      <EditStockModal open={Boolean(editingStock)} value={editingStock} onChange={(next) => setEditingStock(next)} onCancel={() => setEditingStock(null)} onSave={handleSaveStock} isSaving={isSaving} />

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title="Supprimer cet élément ?"
        description={`Cette action supprimera définitivement ${deleteTarget?.label || 'l’élément sélectionné'} du catalogue.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isSaving}
      />

      <ErrorModal open={Boolean(errorModal)} error={errorModal} onClose={() => setErrorModal(null)} />
    </AdminPageShell>
  );
}
