import { useMemo } from "react";
import { useLocation } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const pageTitles: Record<string, string> = {
  "/reception/patients": "Patients",
  "/reception/admission": "Nouvelle admission",
  "/reception/rendez-vous": "Rendez-vous",
  "/reception/file-attente": "File d'attente",
  "/reception/hospitalisations": "Hospitalisations",
  "/reception/dossiers": "Dossiers patients",
  "/reception/messages": "Messages internes",
  "/reception/paiements": "Facturation & paiements",
  "/reception/urgences": "Urgences & alertes",
  "/reception/historique": "Historique admissions",
  "/reception/profile": "Compte réception",
};

export default function ReceptionPage() {
  const location = useLocation();
  const pageTitle = useMemo(
    () => pageTitles[location.pathname] || "Réception",
    [location.pathname]
  );

  return (
    <>
      <PageMeta
        title={`${pageTitle} | Réception - D7 Clinique`}
        description="Interface réception en cours de construction. Chaque section sera déployée progressivement pour le suivi et l'accueil des patients."
      />
      <PageBreadcrumb pageTitle={pageTitle} />

      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="rounded-3xl border border-gray-200 bg-slate-50 p-8 dark:border-gray-800 dark:bg-slate-950">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{pageTitle}</h1>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            Cette page sert d’espace de travail temporaire pour la réception. Les fonctionnalités spécifiques seront ajoutées bientôt.
          </p>
          <div className="mt-8 rounded-3xl border border-dashed border-gray-300 bg-white p-6 text-gray-700 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200">
            <p className="text-sm leading-7">
              Vous êtes sur l’interface réception. Les autres sections de réception utiliseront la même structure de template et resteront cohérentes avec le tableau de bord de la réception.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
