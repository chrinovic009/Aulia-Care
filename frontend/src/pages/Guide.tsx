import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";

export default function Guide() {
  return (
    <div>
      <PageMeta
        title="Guide d'utilisation | Clinique"
        description="Guide d'utilisation pour la plateforme de gestion patient."
      />
      <PageBreadcrumb pageTitle="Guide d'utilisation" />
      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="mx-auto w-full max-w-[830px]">
          <h3 className="mb-4 font-semibold text-gray-800 text-theme-xl dark:text-white/90 sm:text-2xl">
            Bienvenue dans le guide d'utilisation
          </h3>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 sm:text-base">
            Retrouvez ici les principales instructions pour utiliser la plateforme,
            gérer votre dossier médical, prendre rendez-vous, consulter vos résultats
            et suivre vos traitements.
          </p>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              1. Tableau de bord : accédez aux informations clés et aux actions rapides.
            </p>
            <p>
              2. Dossier médical : consultez votre historique, vos diagnostics et
              documents.
            </p>
            <p>
              3. Rendez-vous : planifiez, modifiez et suivez vos consultations.
            </p>
            <p>
              4. Examens et résultats : visualisez vos analyses et rapports médicaux.
            </p>
            <p>
              5. Messages : communiquez avec votre équipe médicale en toute sécurité.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
