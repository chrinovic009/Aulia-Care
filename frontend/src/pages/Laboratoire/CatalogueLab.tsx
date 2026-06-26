import { useEffect, useMemo, useState } from "react";
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
} from "../../api/laboratory";
import { ClipboardList, FlaskConical, Layers, Microscope, Package } from "lucide-react";

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

export default function CatalogueLab() {
  const [catalogue, setCatalogue] = useState<LabCataloguePayload | null>(null);
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [sectionForm, setSectionForm] = useState({ name: '', description: '', order: '0', active: true });
  const [categoryForm, setCategoryForm] = useState({ sectionId: '', name: '', code: '', description: '', order: '0', active: true });
  const [testForm, setTestForm] = useState({ code: '', name: '', categoryId: '', sectionId: '', description: '', price: '0', turnaroundTimeMinutes: '30', resultType: 'MULTI_PARAMETER', unit: '', referenceRange: '', genderRestriction: 'ALL', minAge: '', maxAge: '', active: true });
  const [parameterForm, setParameterForm] = useState({ labTestId: '', code: '', name: '', unit: '', resultType: 'NUMERIC', referenceRange: '', minValue: '', maxValue: '', order: '0', active: true });
  const [sampleTypeForm, setSampleTypeForm] = useState({ labTestId: '', name: '', description: '', active: true });
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showTestForm, setShowTestForm] = useState(false);
  const [showParameterForm, setShowParameterForm] = useState(false);
  const [showSampleTypeForm, setShowSampleTypeForm] = useState(false);
  const [showSampleRequirementForm, setShowSampleRequirementForm] = useState(false);
  const [showConsumableForm, setShowConsumableForm] = useState(false);
  const [showConsumableRequirementForm, setShowConsumableRequirementForm] = useState(false);
  const [showStockForm, setShowStockForm] = useState(false);
  const [sampleRequirementForm, setSampleRequirementForm] = useState({ labTestId: '', labSampleTypeId: '', volumeRequired: '', volumeUnit: 'mL', storageCondition: '', maxAgeMinutes: '', instructions: '' });
  const [consumableForm, setConsumableForm] = useState({ name: '', code: '', description: '', unit: '', active: true });
  const [consumableRequirementForm, setConsumableRequirementForm] = useState({ labTestId: '', labConsumableId: '', quantity: '1', unit: '' });
  const [stockForm, setStockForm] = useState({ labConsumableId: '', quantity: '0', minimumLevel: '', criticalLevel: '', location: '' });

  useEffect(() => {
    loadCatalogue();
  }, []);

  const loadCatalogue = async () => {
    setIsLoading(true);
    try {
      const data = await fetchLaboratoryCatalogue();
      setCatalogue(data);
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

  const showSuccess = (message: string) => {
    window.alert(message);
  };

  const handleCreateSection = async () => {
    if (!sectionForm.name.trim()) {
      window.alert('Le nom de la section est requis.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabSection({
        name: sectionForm.name,
        description: sectionForm.description || undefined,
        order: sectionForm.order !== '' ? Number(sectionForm.order) : undefined,
        active: sectionForm.active,
      });
      setSectionForm({ name: '', description: '', order: '0', active: true });
      setShowSectionForm(false);
      await loadCatalogue();
      showSuccess('Section créée avec succès.');
    } catch (error) {
      console.error(error);
      window.alert('Impossible de créer la section.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryForm.name.trim()) {
      window.alert('Le nom de la catégorie est requis.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabCategory({
        sectionId: categoryForm.sectionId || undefined,
        name: categoryForm.name,
        code: categoryForm.code || undefined,
        description: categoryForm.description || undefined,
        order: categoryForm.order !== '' ? Number(categoryForm.order) : undefined,
        active: categoryForm.active,
      });
      setCategoryForm({ sectionId: '', name: '', code: '', description: '', order: '0', active: true });
      setShowCategoryForm(false);
      await loadCatalogue();
      showSuccess('Catégorie créée avec succès.');
    } catch (error) {
      console.error(error);
      window.alert('Impossible de créer la catégorie.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateTest = async () => {
    if (!testForm.code.trim() || !testForm.name.trim() || !testForm.categoryId) {
      window.alert('Code, nom et catégorie sont requis pour l examen.');
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
        resultType: testForm.resultType,
        unit: testForm.unit || undefined,
        referenceRange: testForm.referenceRange || undefined,
        genderRestriction: testForm.genderRestriction,
        minAge: testForm.minAge !== '' ? Number(testForm.minAge) : undefined,
        maxAge: testForm.maxAge !== '' ? Number(testForm.maxAge) : undefined,
        active: testForm.active,
      });
      setTestForm({ code: '', name: '', categoryId: '', sectionId: '', description: '', price: '0', turnaroundTimeMinutes: '30', resultType: 'MULTI_PARAMETER', unit: '', referenceRange: '', genderRestriction: 'ALL', minAge: '', maxAge: '', active: true });
      setShowTestForm(false);
      await loadCatalogue();
      showSuccess('Examen créé avec succès.');
    } catch (error) {
      console.error(error);
      window.alert('Impossible de créer l examen.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateParameter = async () => {
    if (!parameterForm.labTestId || !parameterForm.code.trim() || !parameterForm.name.trim()) {
      window.alert('Test, code et nom sont requis pour le paramètre.');
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
      window.alert('Impossible de créer le paramètre.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSampleType = async () => {
    if (!sampleTypeForm.labTestId) {
      window.alert('Vous devez sélectionner un examen pour l échantillon.');
      return;
    }
    if (!sampleTypeForm.name.trim()) {
      window.alert('Le nom du type d échantillon est requis.');
      return;
    }

    setIsSaving(true);
    try {
      const createdSampleType = await createLabSampleType({
        name: sampleTypeForm.name,
        description: sampleTypeForm.description || undefined,
        active: sampleTypeForm.active,
      });

      await createLabTestSampleRequirement({
        labTestId: sampleTypeForm.labTestId,
        labSampleTypeId: createdSampleType.id,
        volumeRequired: undefined,
        volumeUnit: undefined,
        storageCondition: undefined,
        maxAgeMinutes: undefined,
        instructions: undefined,
      });

      setSampleTypeForm({ labTestId: '', name: '', description: '', active: true });
      setShowSampleTypeForm(false);
      await loadCatalogue();
      showSuccess('Type d échantillon créé et lié à l examen avec succès.');
    } catch (error) {
      console.error(error);
      window.alert('Impossible de créer le type d échantillon.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSampleRequirement = async () => {
    if (!sampleRequirementForm.labTestId || !sampleRequirementForm.labSampleTypeId) {
      window.alert('Test et type d échantillon sont requis.');
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
      window.alert('Impossible de créer l exigence d échantillon.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateConsumable = async () => {
    if (!consumableForm.name.trim() || !consumableForm.code.trim() || !consumableForm.unit.trim()) {
      window.alert('Nom, code et unité sont requis.');
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
      window.alert('Impossible de créer le consommable.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateConsumableRequirement = async () => {
    if (!consumableRequirementForm.labTestId || !consumableRequirementForm.labConsumableId || !consumableRequirementForm.quantity) {
      window.alert('Test, consommable et quantité sont requis.');
      return;
    }

    setIsSaving(true);
    try {
      await createLabTestConsumableRequirement({
        labTestId: consumableRequirementForm.labTestId,
        labConsumableId: consumableRequirementForm.labConsumableId,
        quantity: Number(consumableRequirementForm.quantity),
        unit: consumableRequirementForm.unit || undefined,
      });
      setConsumableRequirementForm({ labTestId: '', labConsumableId: '', quantity: '1', unit: '' });
      setShowConsumableRequirementForm(false);
      await loadCatalogue();
      showSuccess('Consommable associé à l examen créé avec succès.');
    } catch (error) {
      console.error(error);
      window.alert('Impossible de créer l exigence de consommable.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateStock = async () => {
    if (!stockForm.labConsumableId || !stockForm.quantity) {
      window.alert('Consommable et quantité sont requis.');
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
      window.alert('Impossible d enregistrer le stock.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminPageShell
      title="Catalogue laboratoire"
      subtitle="Supervision complète du catalogue de services et des définitions d'examens."
      actions={
        <button
          onClick={loadCatalogue}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Actualiser
        </button>
      }
    >

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={<Layers size={20} />} label="Sections actives" value={totalSections} tone="blue" />
        <StatCard icon={<ClipboardList size={20} />} label="Catégories actives" value={totalCategories} tone="slate" />
        <StatCard icon={<Microscope size={20} />} label="Examens actifs" value={totalTests} tone="green" />
        <StatCard icon={<FlaskConical size={20} />} label="Types d'échantillons" value={totalSampleTypes} tone="amber" />
        <StatCard icon={<Package size={20} />} label="Consommables référencés" value={totalConsumables} tone="violet" />
      </div>

      <Panel title="Sections du catalogue" subtitle="Naviguez par domaine et inspectez la structure du catalogue." >
        <div className="space-y-4">
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

          {isLoading ? (
            <p className="text-sm text-slate-500">Chargement du catalogue...</p>
          ) : !catalogue ? (
            <p className="text-sm text-red-600">Impossible de récupérer les données du catalogue.</p>
          ) : (
            <div className="space-y-6">
              {activeTab === "Sections" && (
                <div className="space-y-6">
                  <DataTable
                    headers={["Section", "Description", "Catégories", "Examens", "Statut"]}
                    rows={catalogue.sections.map((section) => [
                      section.name,
                      section.description || "-",
                      section.categories.length,
                      section.tests.length,
                      section.active ? "Active" : "Inactive",
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
                    headers={["Catégorie", "Section", "Code", "Examens", "Statut"]}
                    rows={catalogue.categories.map((category) => [
                      category.name,
                      category.section?.name || "Hors section",
                      category.code || "-",
                      category.tests.length,
                      category.active ? "Active" : "Inactive",
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
                    headers={["Code", "Examen", "Section", "Catégorie", "Type résultat", "Prix", "TAT", "Actif"]}
                    rows={catalogue.tests.map((test) => [
                      test.code,
                      test.name,
                      test.section?.name || "-",
                      test.category?.name || "-",
                      test.resultType,
                      `${Number(test.price || "0").toLocaleString("fr-FR", { style: "currency", currency: "USD" })}`,
                      test.turnaroundTimeMinutes ? `${test.turnaroundTimeMinutes} min` : "-",
                      test.active ? "Oui" : "Non",
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
                            onChange={(event) => setTestForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Ex: Dosage de glucose"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Section</span>
                          <select
                            required
                            value={testForm.sectionId}
                            onChange={(event) => setTestForm((current) => ({ ...current, sectionId: event.target.value }))}
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
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
                            {catalogue.categories.map((category) => (
                              <option key={category.id} value={category.id}>{category.name}</option>
                            ))}
                          </select>
                        </label>
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
                    headers={["Examen", "Paramètre", "Code", "Type résultat", "Unité", "Référence", "Statut"]}
                    rows={catalogue.tests.flatMap((test) =>
                      test.parameterTemplates.map((parameter) => [
                        test.name,
                        parameter.name,
                        parameter.code,
                        parameter.resultType,
                        parameter.unit || "-",
                        parameter.referenceRange || "-",
                        parameter.active ? "Active" : "Inactive",
                      ]),
                    )}
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
                    headers={["Type d'échantillon", "Description", "Actif", "Exigences"]}
                    rows={catalogue.sampleTypes.map((sampleType) => [
                      sampleType.name,
                      sampleType.description || "-",
                      sampleType.active ? "Oui" : "Non",
                      sampleType.sampleRequirements.length,
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
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm">
                          <span className="block text-slate-700">Examen</span>
                          <select
                            required
                            value={sampleTypeForm.labTestId}
                            onChange={(event) => setSampleTypeForm((current) => ({ ...current, labTestId: event.target.value }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Sélectionner un examen</option>
                            {catalogue.tests.map((test) => (
                              <option key={test.id} value={test.id}>{test.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="block text-slate-700">Nom</span>
                          <input
                            required
                            value={sampleTypeForm.name}
                            onChange={(event) => setSampleTypeForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Ex: Sang veineux"
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        </label>
                        <label className="block text-sm">
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
                    </Panel>
                  )}
                </div>
              )}

              {activeTab === "Exigences" && (
                <div className="space-y-6">
                  <DataTable
                    headers={["Examen", "Échantillon", "Volume", "Condition stockage", "Âge max", "Instructions"]}
                    rows={catalogue.tests.flatMap((test) =>
                      test.sampleRequirements.map((requirement) => [
                        test.name,
                        requirement.labSampleType.name,
                        requirement.volumeRequired ? `${Number(requirement.volumeRequired).toLocaleString("fr-FR")} ${requirement.volumeUnit || "mL"}` : "-",
                        requirement.storageCondition || "-",
                        requirement.maxAgeMinutes ? `${requirement.maxAgeMinutes} min` : "-",
                        requirement.instructions || "-",
                      ]),
                    )}
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
                            onChange={(event) => setSampleRequirementForm((current) => ({ ...current, labTestId: event.target.value }))}
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
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
                            {catalogue.sampleTypes.map((sampleType) => (
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
                          <span className="block text-slate-700">Âge maximum (min)</span>
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
                    headers={["Consommable", "Code", "Unité", "Stock total", "Nb tests associés"]}
                    rows={catalogue.consumables.map((consumable) => [
                      consumable.name,
                      consumable.code,
                      consumable.unit,
                      consumable.stock.reduce((sum, stockLine) => sum + Number(stockLine.quantity || 0), 0).toLocaleString("fr-FR"),
                      catalogue.tests.filter((test) =>
                        test.consumableRequirements.some((requirement) => requirement.labConsumableId === consumable.id),
                      ).length,
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

                  <button
                    type="button"
                    onClick={() => setShowConsumableRequirementForm((current) => !current)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showConsumableRequirementForm ? 'Masquer le formulaire d association de consommable' : 'Associer consommable à un examen'}
                  </button>

                  {showConsumableRequirementForm && (
                    <Panel title="Associer consommable à un examen">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm">
                          <span className="block text-slate-700">Examen</span>
                          <select
                            required
                            value={consumableRequirementForm.labTestId}
                            onChange={(event) => setConsumableRequirementForm((current) => ({ ...current, labTestId: event.target.value }))}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Selectionner</option>
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
    </AdminPageShell>
  );
}
