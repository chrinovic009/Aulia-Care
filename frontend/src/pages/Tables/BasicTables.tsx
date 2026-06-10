import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import BasicTableOne from "../../components/tables/BasicTables/BasicTableOne";

export default function BasicTables() {
  return (
    <>
      <PageMeta
        title="Hospitalisation - D7 Clinique"
        description="Découvrez les fonctionnalités de base de notre application de gestion hospitalière, conçue pour améliorer l'efficacité et la qualité des soins. Notre plateforme intuitive offre une gestion complète des dossiers médicaux, des rendez-vous, des traitements et bien plus encore, pour une expérience optimale tant pour les patients que pour le personnel médical."
      />
      <PageBreadcrumb pageTitle="Examens & Résultats" />
      <div className="space-y-6">
        <ComponentCard title="Examens & resultats récents">
          <BasicTableOne />
        </ComponentCard>
      </div>
    </>
  );
}

