import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import InputGroup from "../../components/form/form-elements/InputGroup";
import PageMeta from "../../components/common/PageMeta";

export default function FormElements() {
  return (
    <div>
      <PageMeta
        title="Paiement - D7 Clinique"
        description="Effectuez le paiement de votre facture sanitaire en toute simplicité avec D7 Clinique. Choisissez votre traitement, saisissez votre numéro de téléphone et sélectionnez votre réseau pour un paiement rapide et sécurisé."
      />
      <PageBreadcrumb pageTitle="Paiement" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <InputGroup />
        </div>
      </div>
    </div>
  );
}
