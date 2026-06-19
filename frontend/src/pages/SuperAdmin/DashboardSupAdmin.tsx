import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../config/api";

const tabs = ["Vue globale", "Finances", "Performances", "Alertes", "Rapports"];

export default function DashboardSupAdmin() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [patients, setPatients] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [hospitalizations, setHospitalizations] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);

  const load = async () => {
    try {
      // Fetch consolidated dashboard and reports from backend (no localStorage)
      const [dashboardData, reportsData, usersData] = await Promise.all([
        apiFetch<any>("/administration/dashboard").catch(() => ({})),
        apiFetch<any>("/administration/reports").catch(() => ({})),
        apiFetch<any[]>("/users").catch(() => []),
      ]);

      // Use dashboard top-level payload when available
      if (dashboardData && Object.keys(dashboardData).length) {
        // dashboard payload contains recent lists and performanceByService
        setPatients(dashboardData.patients || []);
        setServices(dashboardData.performanceByService || []);
        setPayments(dashboardData.recent?.payments || []);
        setInvoices(dashboardData.recent?.invoices || []);
        setHospitalizations(dashboardData.recent?.hospitalizations || []);
        setMedications(reportsData.stocks || reportsData.medications || []);
      } else {
        // Fallback to reports for data when dashboard not available
        setPatients(reportsData.patients || []);
        setServices(reportsData.services || []);
        setPayments(reportsData.payments || []);
        setInvoices(reportsData.invoices || []);
        setHospitalizations(reportsData.hospitalizations || []);
        setMedications(reportsData.stocks || reportsData.medications || []);
      }

      setUsers(usersData || []);
    } catch (err) {
      // keep previous state on error
      console.error("Error loading superadmin dashboard:", err);
    }
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("d7:patient.created", handler);
    window.addEventListener("d7:patient.updated", handler);
    window.addEventListener("d7:notification.created", handler);
    return () => {
      window.removeEventListener("d7:patient.created", handler);
      window.removeEventListener("d7:patient.updated", handler);
      window.removeEventListener("d7:notification.created", handler);
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);

  const metrics = useMemo(() => {
    const paymentsToday = payments.filter((payment) => (payment.paidAt || payment.createdAt || "").slice(0, 10) === today);
    const paymentsMonth = payments.filter((payment) => (payment.paidAt || payment.createdAt || "").slice(0, 7) === month);
    const workflow = (status: string) => patients.filter((patient) => patient.workflowStatus === status).length;
    return {
      patientsToday: patients.filter((patient) => (patient.createdAt || "").slice(0, 10) === today).length,
      patientsMonth: patients.filter((patient) => (patient.createdAt || "").slice(0, 7) === month).length,
      consultationsToday: patients.filter((patient) => (patient.consultations || []).some((item: any) => (item.createdAt || "").slice(0, 10) === today)).length,
      hospitalized: hospitalizations.filter((item) => item.status === "ADMITTED").length,
      revenueToday: paymentsToday.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      revenueMonth: paymentsMonth.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      unpaid: invoices.reduce((sum, invoice) => sum + Number(invoice.balanceDue || 0), 0),
      workflow,
    };
  }, [hospitalizations, invoices, month, patients, payments, today]);

  // Helper: aggregate amounts by month key YYYY-MM
  function aggregateByMonth(items: any[], dateKey: string, amountKey: string) {
    const map: Record<string, number> = {};
    items.forEach((it) => {
      const d = (it[dateKey] || it.createdAt || it.paidAt || it.issuedAt || "").slice(0, 7);
      if (!d) return;
      map[d] = (map[d] || 0) + Number(it[amountKey] || it.totalAmount || it.amount || 0);
    });
    // return sorted array of {month, value}
    return Object.keys(map)
      .sort()
      .map((k) => ({ month: k, value: map[k] }));
  }

  function getLastMonths(count = 12) {
    const res: string[] = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      res.push(d.toISOString().slice(0, 7));
    }
    return res;
  }

  function buildSeriesForMonths(mapData: Array<{ month: string; value: number }>, months: string[]) {
    const byMonth: Record<string, number> = {};
    mapData.forEach((m) => { byMonth[m.month] = m.value; });
    return months.map((m) => ({ month: m, value: byMonth[m] || 0 }));
  }

  const months = useMemo(() => getLastMonths(12), []);
  const revenueSeries = useMemo(() => buildSeriesForMonths(aggregateByMonth(invoices, "issuedAt", "totalAmount"), months), [invoices, months]);
  const paymentsSeries = useMemo(() => buildSeriesForMonths(aggregateByMonth(payments, "paidAt", "amount"), months), [payments, months]);
  const criticalAlerts = [
    ...medications.filter((item) => Number(item.stockQuantity || item.quantity || 0) <= Number(item.criticalLevel || 3)).map((item) => `Stock critique: ${item.name}`),
    ...invoices.filter((invoice) => Number(invoice.balanceDue || 0) > 1000).map((invoice) => `Facture impayee importante: ${Number(invoice.balanceDue).toLocaleString("fr-FR")}`),
    ...services.filter((service) => !service.responsables?.length).map((service) => `Service sans responsable: ${service.name}`),
  ];

  const roleLabels: Record<string, string> = {
    PHYSICIAN: "Médecins",
    NURSE: "Infirmiers",
    PHARMACIST: "Pharmaciens",
    RECEPTIONIST: "Réceptionnistes",
    CASHIER: "Caissiers",
    ADMIN: "Administrateurs",
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase text-slate-500">DG de l'hopital</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Vue strategique D7 Clinic</h1>
        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === tab ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
              {tab}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        {/* Print helper */}
        <script dangerouslySetInnerHTML={{ __html: `function __d7_print(html){ const w = window.open('','_blank'); w.document.write('<html><head><title>Impression</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}</style></head><body>'+html+'</body></html>'); w.document.close(); w.focus(); w.print(); w.close(); }` }} />
        
        {activeTab === "Vue globale" && (
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Patients aujourd'hui" value={metrics.patientsToday} />
            <Metric label="Patients ce mois" value={metrics.patientsMonth} />
            <Metric label="Consultations aujourd'hui" value={metrics.consultationsToday} />
            <Metric label="Hospitalises" value={metrics.hospitalized} />
            <Metric label="En attente caisse" value={metrics.workflow("EN_ATTENTE_DE_PAIEMENT")} tone="amber" />
            <Metric label="En attente infirmier" value={metrics.workflow("EN_ATTENTE_INFIRMERIE")} tone="blue" />
            <Metric label="En attente medecin" value={metrics.workflow("EN_ATTENTE_MEDECIN")} tone="blue" />
            <Metric label="Pharmacie" value={metrics.workflow("EN_PHARMACIE")} tone="green" />
          </div>
        )}

        {activeTab === "Finances" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Encaisse aujourd'hui" value={`${metrics.revenueToday.toLocaleString("fr-FR")} USD`} tone="green" />
              <Metric label="Encaisse ce mois" value={`${metrics.revenueMonth.toLocaleString("fr-FR")} USD`} tone="green" />
              <Metric label="Factures impayees" value={`${metrics.unpaid.toLocaleString("fr-FR")} USD`} tone="red" />
            </div>

            <div id="finances-panel" className="grid gap-4 lg:grid-cols-2">
              <div id="finances-curves" className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Courbes: revenus / paiements (mois)</h3>
                  <button onClick={() => printSection('finances-curves')} className="text-xs rounded border px-2 py-1">Imprimer</button>
                </div>
                <LineChart series={[{ name: 'Revenus', data: revenueSeries }, { name: 'Paiements', data: paymentsSeries }]} />
              </div>

              <div id="finances-payments" className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Paiements patients vs assurances</h3>
                  <button onClick={() => printSection('finances-payments')} className="text-xs rounded border px-2 py-1">Imprimer</button>
                </div>
                <PieChart data={aggregatePaymentsByMethod(payments)} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "Performances" && (
          <div className="space-y-4">
            <div id="performance-panel" className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Performance par service</h3>
                <button onClick={() => printSection('performance-panel')} className="text-xs rounded border px-2 py-1">Imprimer</button>
              </div>
              <BarChart labels={services.map((s:any)=>s.name || '---')} values={services.map((s:any)=>Number((s.patientCount || (s.patients ? s.patients.length : 0)) + (s.staffCount || (s.staff ? s.staff.length : 0)) || 0))} />
            </div>

            <Table
              headers={["Role", "Nombre utilisateurs"]}
              rows={[
                "ADMIN",
                "PHYSICIAN",
                "NURSE",
                "PHARMACIST",
                "RECEPTIONIST",
                "CASHIER",
              ].map((role) => [
                roleLabels[role],
                users.filter((user) => user.primaryRole === role).length,
              ])}
            />
          </div>
        )}

        {activeTab === "Alertes" && (
          <div className="space-y-2">
            {criticalAlerts.length === 0 ? <p className="text-sm text-slate-500">Aucune alerte critique.</p> : criticalAlerts.map((alert) => <div key={alert} className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{alert}</div>)}
          </div>
        )}

        {/* Additional sections per request: RH, Pharmacie, Infrastructures, Rapports */}
        {activeTab === "Rapports" && (
          <div className="space-y-4">
            <div id="rh-panel" className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Ressources humaines</h3>
                <button onClick={() => printSection('rh-panel')} className="text-xs rounded border px-2 py-1">Imprimer</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Effectifs totaux" value={users.length} />
                <Metric label="Présences (aujourd'hui)" value={users.filter(u=>u.presentToday).length || 0} />
                <Metric label="Masse salariale" value={`${computePayrollEstimate(users)} USD`} />
              </div>
              <div className="mt-4">
                <h4 className="font-medium mb-2">Répartition du personnel</h4>
                <PieChart data={Object.entries(groupByRole(users)).map(([k,v])=>({ label:k, value:v }))} />
              </div>
            </div>

            <div id="pharmacy-panel" className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Pharmacie & stock</h3>
                <button onClick={() => printSection('pharmacy-panel')} className="text-xs rounded border px-2 py-1">Imprimer</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <h4 className="font-medium">Stocks critiques</h4>
                  <ul className="list-disc ml-5 mt-2 text-sm text-slate-700">{medications.filter((m)=>Number(m.stockQuantity||m.quantity||0) <= Number(m.criticalLevel||3)).map(m=> <li key={m.id||m.name}>{m.name} — {m.stockQuantity||m.quantity||0}</li>)}</ul>
                </div>
                <div>
                  <h4 className="font-medium">Consommation (derniers mois)</h4>
                  <BarChart labels={paymentsSeries.map((p:any)=>p.month)} values={paymentsSeries.map((p:any)=>p.value)} />
                </div>
              </div>
            </div>

            <div id="infra-panel" className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Infrastructures</h3>
                <button onClick={() => printSection('infra-panel')} className="text-xs rounded border px-2 py-1">Imprimer</button>
              </div>
              <p className="text-sm">Capacité totale salles & lits: {hospitalizations.length}</p>
              <p className="text-sm">Utilisation (hospitalisations en cours): {metrics.hospitalized}</p>
            </div>
          </div>
        )}

        {activeTab === "Alertes" && (
          <div className="space-y-2">
            {criticalAlerts.length === 0 ? <p className="text-sm text-slate-500">Aucune alerte critique.</p> : criticalAlerts.map((alert) => <div key={alert} className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{alert}</div>)}
          </div>
        )}

        {activeTab === "Rapports" && (
          <Table headers={["Rapport", "Base"]} rows={[
            ["Journalier", "Patients, paiements, consultations"],
            ["Hebdomadaire", "Activite par service"],
            ["Mensuel", "Revenus, hospitalisations, stock"],
            ["Annuel", "Performance globale"],
          ]} />
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "amber" | "blue" | "green" | "red" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    amber: "text-amber-700 dark:text-amber-300",
    blue: "text-blue-700 dark:text-blue-300",
    green: "text-emerald-700 dark:text-emerald-300",
    red: "text-red-700 dark:text-red-300",
  };
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p></div>;
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{headers.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2">{cell}</td>)}</tr>)}</tbody></table>;
}

// Simple SVG LineChart: expects series: [{name, data: [{month, value}]}]
function LineChart({ series, width = 600, height = 160 }: { series: Array<{ name: string; data: Array<{ month: string; value: number }> }>; width?: number; height?: number }) {
  const allMonths = Array.from(new Set(series.flatMap(s => s.data.map(d => d.month)))).sort();
  const max = Math.max(1, ...series.flatMap(s => s.data.map(d => d.value)));
  const pointsFor = (data: any[]) => data.map(d => ({ x: (allMonths.indexOf(d.month) / Math.max(1, allMonths.length - 1)) * (width - 40) + 20, y: height - (d.value / max) * (height - 30) - 10 }));
  const pathFor = (pts: any[]) => pts.map((p, i) => `${i===0? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
      <rect x={0} y={0} width={width} height={height} fill="#fff0" />
      {series.map((s, idx) => {
        const pts = pointsFor(s.data);
        const colors = ['#0ea5e9','#10b981','#f59e0b','#ef4444'];
        return <path key={s.name} d={pathFor(pts)} fill="none" stroke={colors[idx % colors.length]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
      })}
    </svg>
  );
}

function BarChart({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(1, ...values);
  const width = Math.max(300, labels.length * 36);
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} 140`} className="w-full h-32">
        {values.map((v, i) => {
          const x = i * 36 + 8;
          const h = (v / max) * 90;
          return <rect key={i} x={x} y={110 - h} width={28} height={h} fill="#2563eb" rx={4} />;
        })}
        {/* labels */}
        {labels.map((l, i) => {
          const x = i * 36 + 8 + 14;
          return <text key={i} x={x} y={128} fontSize={10} fill="#475569" textAnchor="middle">{l.length > 10 ? l.slice(0,10)+'…' : l}</text>;
        })}
      </svg>
    </div>
  );
}

function PieChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const total = Math.max(1, data.reduce((s, d) => s + d.value, 0));
  let angle = 0;
  const cx = 60, cy = 60, r = 50;
  const slices = data.map((d, i) => {
    const portion = d.value / total;
    const start = angle;
    const end = angle + portion * Math.PI * 2;
    angle = end;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = end - start > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    const colors = ['#ef4444','#f59e0b','#10b981','#0ea5e9','#8b5cf6','#64748b'];
    return <path key={d.label} d={path} fill={colors[i % colors.length]} stroke="#fff" strokeWidth={0.5} />;
  });
  return (
    <div className="flex items-center gap-4">
      <svg width={120} height={120} viewBox={`0 0 120 120`}>{slices}</svg>
      <div className="text-sm">
        {data.map(d => <div key={d.label} className="flex items-center gap-2"><span className="font-medium">{d.label}:</span> <span>{d.value.toLocaleString("fr-FR")}</span></div>)}
      </div>
    </div>
  );
}

function aggregatePaymentsByMethod(payments: any[]) {
  const map: Record<string, number> = {};
  payments.forEach(p => { const m = (p.method || p.paymentMethod || (p.invoice && p.invoice.payerType) || 'Unknown'); map[m] = (map[m] || 0) + Number(p.amount || 0); });
  return Object.keys(map).map(k => ({ label: k, value: map[k] }));
}

function groupByRole(users: any[]) {
  const mapping: Record<string, string> = {
    ADMIN: 'Administrateur',
    RECEPTIONIST: 'Receptionniste',
    NURSE: 'Infirmier',
    PHYSICIAN: 'Medecin',
    CASHIER: 'Caissier',
    PATIENT: 'Patient',
  };
  const map: Record<string, number> = {};
  users.forEach(u => {
    const r = (u.primaryRole || 'UNKNOWN');
    if (r === 'SUPER_ADMIN') return; // exclude super admin
    const label = mapping[r] || r;
    map[label] = (map[label] || 0) + 1;
  });
  return map;
}

function computePayrollEstimate(users: any[]) {
  // Best-effort: sum salaries if present, otherwise estimate 0
  return users.reduce((s, u) => s + Number(u.salary || 0), 0).toLocaleString('fr-FR');
}

  function printSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const html = `
      <div>
        <h1>${document.title || 'D7 Clinique'} - Impression</h1>
        ${el.innerHTML}
      </div>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Impression</title><style>body{font-family:Inter,Arial,Helvetica,sans-serif;padding:20px;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}.metric{margin-bottom:12px}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    // Delay print slightly to allow rendering
    setTimeout(() => { w.print(); w.close(); }, 300);
  }
