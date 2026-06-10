
import PageMeta from "../../components/common/PageMeta";
import ReceptionMetrics from "../../components/reception/ReceptionMetrics";
import ReceptionSalesChart from "../../components/reception/ReceptionSalesChart";
import ReceptionTarget from "../../components/reception/ReceptionTarget";
import ReceptionChart from "../../components/reception/ReceptionChart";

import ReceptionOrders from "../../components/reception/ReceptionOrders";
import ReceptionCard from "../../components/reception/ReceptionCard";

export default function Home() {
  return (
    <>
      <PageMeta
        title="D7 Reception - Clinic Dashboard"
        description="Bienvenue sur le tableau de bord de D7 Clinique, votre centre de pilotage pour suivre les opérations de la clinique. Accédez aux données en temps réel sur les rendez-vous, les dossiers patients, les performances financières et les indicateurs clés pour mieux gérer votre établissement."
      />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 space-y-6 xl:col-span-7">
          <ReceptionMetrics />

          <ReceptionSalesChart />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <ReceptionTarget />
        </div>

        <div className="col-span-12">
          <ReceptionChart />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <ReceptionCard />
        </div>

        <div className="col-span-12 xl:col-span-7">
          <ReceptionOrders />
        </div>
      </div>
    </>
  );
}
