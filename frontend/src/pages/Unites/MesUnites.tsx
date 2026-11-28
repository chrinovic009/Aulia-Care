import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageMeta from "../../components/common/PageMeta";
import DashboardWelcome from "../../components/common/DashboardWelcome";
import { fetchMyUnits, KIND_LABELS, type CareUnit, type CareUnitRole } from "../../api/careWorkflow";
import { Card, Empty } from "./ui";

const ROLE_LABELS: Record<CareUnitRole, string> = { LEAD: "Responsable", MEMBER: "Membre", READ_ONLY: "Consultation seule" };

/** Units the signed-in person is assigned to (rights come from the assignment, not only from the role). */
export default function MesUnites() {
  const [units, setUnits] = useState<Array<{ unitRole: CareUnitRole; careUnit: CareUnit }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void fetchMyUnits().then(setUnits).catch(() => setError("Vos unités n’ont pas pu être chargées.")); }, []);
  return (
    <>
      <PageMeta title="Mes unités de soins | Aulia Care" description="Unités de soins auxquelles vous êtes affecté" />
      <div className="space-y-4 p-4">
        <DashboardWelcome eyebrow="Aulia Care · Unités de soins" description="Retrouvez vos unités et accédez rapidement aux espaces de travail qui vous sont attribués." actionLabel="Voir mes affectations" to="/unites#mes-unites" />
        <h2 className="text-2xl font-bold text-aulia-navy dark:text-white">Mes unités de soins</h2>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {units && !units.length && <Empty>Vous n’êtes affecté à aucune unité. Demandez à l’administration de l’établissement de vous affecter (Administration › Unités de soins).</Empty>}
        <div id="mes-unites" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {units?.map(({ careUnit, unitRole }) => (
            <Link key={careUnit.id} to={`/unites/${careUnit.id}`}>
              <Card className="h-full transition hover:border-aulia-teal">
                <p className="text-xs font-semibold uppercase tracking-wide text-aulia-teal">{KIND_LABELS[careUnit.kind]}</p>
                <p className="mt-1 text-lg font-bold text-aulia-navy dark:text-white">{careUnit.name}</p>
                <p className="text-sm text-slate-500">{careUnit.code} · {ROLE_LABELS[unitRole]}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
