import { PrismaService } from '../prisma/prisma.service';
import { formatDuration, lateMinutes } from '../hr/domain/hr-rules';

export const REPORT_SERVICES = {
  RECEPTION: 'Réception', CASHIER: 'Caisse', NURSING: 'Soins infirmiers', MEDICAL: 'Médecins', LABORATORY: 'Laboratoire',
  IMAGING: 'Imagerie', PHARMACY: 'Pharmacie', CARE_UNITS: 'Unités de soins', FINANCE: 'Finance', HUMAN_RESOURCES: 'Ressources humaines',
} as const;
export type ReportService = keyof typeof REPORT_SERVICES;
export const isReportService = (value: unknown): value is ReportService => typeof value === 'string' && value in REPORT_SERVICES;

export type Metric = { key: string; label: string; value: number; format: 'count' | 'money' | 'duration'; tone?: 'good' | 'warn' | 'bad' };
export type Section = { title: string; columns: string[]; rows: Array<Array<string | number>> };
export type ReportData = { metrics: Metric[]; sections: Section[]; highlights: string[] };

type Window = { clinicId: string; start: Date; end: Date; currency: string; graceMinutes: number; timeZone: string };
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
const count = (key: string, label: string, value: number, tone?: Metric['tone']): Metric => ({ key, label, value, format: 'count', tone });
const amount = (key: string, label: string, value: number, tone?: Metric['tone']): Metric => ({ key, label, value: money(value), format: 'money', tone });
const person = (user: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null | undefined) => (user ? user.displayName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '—');
const groupCount = <T,>(rows: T[], key: (row: T) => string) => [...rows.reduce((map, row) => map.set(key(row), (map.get(key(row)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

/**
 * Builds the report of one service for one day of one establishment, from
 * what was really recorded that day. Every figure is a count or an amount the
 * administration can trace back to the records.
 */
export async function buildReport(prisma: PrismaService, service: ReportService, w: Window): Promise<ReportData> {
  const range = { gte: w.start, lt: w.end };
  const time = (date: Date | null | undefined) => (date ? new Intl.DateTimeFormat('fr-FR', { timeZone: w.timeZone, hour: '2-digit', minute: '2-digit' }).format(date) : '—');
  const clinicId = w.clinicId;
  switch (service) {
    case 'RECEPTION': {
      const [patients, appointments, visits, admissions] = await Promise.all([
        prisma.patient.findMany({ where: { clinicId, createdAt: range }, select: { firstName: true, lastName: true, createdAt: true, service: { select: { name: true } } } }),
        prisma.appointment.findMany({ where: { clinicId, scheduledAt: range, deletedAt: null }, select: { status: true } }),
        prisma.patientVisit.count({ where: { clinicId, createdAt: range } }),
        prisma.hospitalization.count({ where: { clinicId, admittedAt: range } }),
      ]);
      const by = (status: string) => appointments.filter((row) => row.status === status).length;
      return {
        metrics: [count('patients', 'Nouveaux patients', patients.length), count('visits', 'Passages enregistrés', visits), count('appointments', 'Rendez-vous prévus', appointments.length),
          count('checkedIn', 'Rendez-vous honorés', by('CHECKED_IN') + by('COMPLETED'), 'good'), count('noShow', 'Absents au rendez-vous', by('NO_SHOW'), by('NO_SHOW') ? 'warn' : undefined), count('admissions', 'Hospitalisations', admissions)],
        sections: [
          { title: 'Nouveaux patients', columns: ['Heure', 'Patient', 'Service'], rows: patients.map((row) => [time(row.createdAt), `${row.firstName} ${row.lastName}`, row.service?.name ?? '—']) },
          { title: 'Rendez-vous par statut', columns: ['Statut', 'Nombre'], rows: groupCount(appointments, (row) => row.status) },
        ],
        highlights: [`${patients.length} nouveau(x) patient(s) et ${visits} passage(s).`, ...(by('NO_SHOW') ? [`${by('NO_SHOW')} patient(s) ne sont pas venus à leur rendez-vous.`] : [])],
      };
    }
    case 'CASHIER': {
      const [payments, invoices] = await Promise.all([
        prisma.payment.findMany({ where: { clinicId, paidAt: range }, select: { amount: true, method: true, paidAt: true } }),
        prisma.invoice.findMany({ where: { clinicId, createdAt: range, deletedAt: null }, select: { type: true, status: true, totalAmount: true, balanceDue: true } }),
      ]);
      const collected = payments.reduce((sum, row) => sum + Number(row.amount), 0);
      const outstanding = invoices.filter((row) => !['PAID', 'CANCELLED', 'COVERED'].includes(row.status)).reduce((sum, row) => sum + Number(row.balanceDue ?? 0), 0);
      const byMethod = [...payments.reduce((map, row) => map.set(row.method, (map.get(row.method) ?? 0) + Number(row.amount)), new Map<string, number>())];
      const byType = [...invoices.reduce((map, row) => map.set(row.type, [(map.get(row.type)?.[0] ?? 0) + 1, (map.get(row.type)?.[1] ?? 0) + Number(row.totalAmount)]), new Map<string, number[]>())];
      return {
        metrics: [count('payments', 'Encaissements', payments.length), amount('collected', `Montant encaissé (${w.currency})`, collected, 'good'), count('invoices', 'Factures émises', invoices.length),
          amount('outstanding', `Reste dû des factures du jour (${w.currency})`, outstanding, outstanding ? 'warn' : undefined)],
        sections: [
          { title: 'Encaissements par mode', columns: ['Mode', `Montant (${w.currency})`], rows: byMethod.map(([method, total]) => [method, money(total)]) },
          { title: 'Factures par type', columns: ['Type', 'Nombre', `Montant (${w.currency})`], rows: byType.map(([type, [n, total]]) => [type, n, money(total)]) },
        ],
        highlights: [`${money(collected).toLocaleString('fr-FR')} ${w.currency} encaissés en ${payments.length} paiement(s).`],
      };
    }
    case 'NURSING': {
      const [vitals, tasks, administrations, observations] = await Promise.all([
        prisma.vitalSign.count({ where: { recordedAt: range, patient: { clinicId } } }),
        prisma.nursingCareTask.findMany({ where: { dueAt: range, hospitalization: { clinicId } }, select: { status: true, title: true, assignedNurse: { select: { displayName: true, firstName: true, lastName: true } } } }),
        prisma.medicationAdministration.findMany({ where: { createdAt: range, hospitalization: { clinicId } }, select: { status: true } }),
        prisma.medicalHistory.count({ where: { createdAt: range, kind: { in: ['NURSE_OBSERVATION', 'NURSE_PROBLEM', 'NURSE_ROUND_DONE'] }, patient: { clinicId } } }),
      ]);
      const done = tasks.filter((row) => row.status === 'COMPLETED').length;
      const missed = tasks.filter((row) => ['MISSED', 'PENDING'].includes(row.status)).length;
      return {
        metrics: [count('vitals', 'Constantes relevées', vitals), count('tasks', 'Soins planifiés', tasks.length), count('done', 'Soins réalisés', done, 'good'), count('missed', 'Soins non réalisés', missed, missed ? 'bad' : undefined),
          count('administrations', 'Administrations de médicaments', administrations.length), count('observations', 'Observations et tournées', observations)],
        sections: [
          { title: 'Soins par infirmier', columns: ['Infirmier', 'Soins'], rows: groupCount(tasks, (row) => person(row.assignedNurse)) },
          { title: 'Soins par statut', columns: ['Statut', 'Nombre'], rows: groupCount(tasks, (row) => row.status) },
        ],
        highlights: [`${done} soin(s) réalisé(s) sur ${tasks.length} planifié(s).`, ...(missed ? [`${missed} soin(s) non réalisé(s) ou encore en attente.`] : [])],
      };
    }
    case 'MEDICAL': {
      const [consultations, prescriptions, labs, imaging, diagnoses] = await Promise.all([
        prisma.consultation.findMany({ where: { clinicId, updatedAt: range, status: { in: ['FINALIZED', 'IN_PROGRESS'] }, deletedAt: null }, select: { status: true, provider: { select: { displayName: true, firstName: true, lastName: true } } } }),
        prisma.prescription.count({ where: { clinicId, createdAt: range, deletedAt: null } }),
        prisma.labRequest.count({ where: { clinicId, requestedAt: range, deletedAt: null } }),
        prisma.imagingRequest.count({ where: { clinicId, createdAt: range, deletedAt: null } }),
        prisma.diagnosis.findMany({ where: { recordedAt: range, codeSystem: 'ICD10', deletedAt: null, patient: { clinicId } }, select: { code: true, description: true } }),
      ]);
      const finalized = consultations.filter((row) => row.status === 'FINALIZED');
      return {
        metrics: [count('consultations', 'Consultations clôturées', finalized.length, 'good'), count('inProgress', 'Consultations en cours', consultations.length - finalized.length),
          count('prescriptions', 'Ordonnances', prescriptions), count('labs', 'Examens de laboratoire demandés', labs), count('imaging', 'Examens d’imagerie demandés', imaging), count('diagnoses', 'Diagnostics codés (CIM-10)', diagnoses.length)],
        sections: [
          { title: 'Consultations par médecin', columns: ['Médecin', 'Consultations'], rows: groupCount(finalized, (row) => person(row.provider)) },
          { title: 'Diagnostics les plus fréquents', columns: ['Code', 'Libellé', 'Nombre'], rows: groupCount(diagnoses, (row) => `${row.code}|${row.description}`).slice(0, 15).map(([key, n]) => [...key.split('|'), n]) },
        ],
        highlights: [`${finalized.length} consultation(s) clôturée(s), ${prescriptions} ordonnance(s).`],
      };
    }
    case 'LABORATORY': {
      const [requests, results, alerts, pending] = await Promise.all([
        prisma.labRequest.findMany({ where: { clinicId, requestedAt: range, deletedAt: null }, select: { status: true, priority: true } }),
        prisma.labResult.findMany({ where: { reportedAt: range, labRequest: { clinicId } }, select: { resultStatus: true, resultName: true } }),
        prisma.labCriticalAlert.count({ where: { createdAt: range, patient: { clinicId } } }),
        prisma.labRequest.count({ where: { clinicId, deletedAt: null, status: { in: ['REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS', 'TECHNICAL_VALIDATION', 'BIOLOGICAL_VALIDATION'] } } }),
      ]);
      const urgent = requests.filter((row) => row.priority === 'URGENT').length;
      return {
        metrics: [count('requests', 'Demandes reçues', requests.length), count('urgent', 'Dont urgentes', urgent, urgent ? 'warn' : undefined), count('results', 'Résultats saisis', results.length, 'good'),
          count('alerts', 'Valeurs critiques signalées', alerts, alerts ? 'bad' : undefined), count('pending', 'Demandes en cours (fin de journée)', pending)],
        sections: [
          { title: 'Analyses les plus demandées', columns: ['Analyse', 'Résultats'], rows: groupCount(results, (row) => row.resultName).slice(0, 15) },
          { title: 'Demandes par statut', columns: ['Statut', 'Nombre'], rows: groupCount(requests, (row) => row.status) },
        ],
        highlights: [`${requests.length} demande(s), ${results.length} résultat(s) saisi(s).`, ...(alerts ? [`${alerts} valeur(s) critique(s) signalée(s).`] : [])],
      };
    }
    case 'IMAGING': {
      const [requests, reports] = await Promise.all([
        prisma.imagingRequest.findMany({ where: { clinicId, createdAt: range, deletedAt: null }, select: { status: true, modality: true } }),
        prisma.imagingReport.findMany({ where: { reportedAt: range, imagingRequest: { clinicId } }, select: { verified: true } }),
      ]);
      const verified = reports.filter((row) => row.verified).length;
      return {
        metrics: [count('requests', 'Examens demandés', requests.length), count('completed', 'Examens réalisés', requests.filter((row) => ['COMPLETED', 'VERIFIED'].includes(row.status)).length, 'good'),
          count('reports', 'Comptes rendus rédigés', reports.length), count('verified', 'Comptes rendus vérifiés', verified), count('toVerify', 'Comptes rendus à vérifier', reports.length - verified, reports.length - verified ? 'warn' : undefined)],
        sections: [{ title: 'Examens par modalité', columns: ['Modalité', 'Nombre'], rows: groupCount(requests, (row) => String(row.modality)) }],
        highlights: [`${requests.length} examen(s) demandé(s), ${reports.length} compte(s) rendu(s).`],
      };
    }
    case 'PHARMACY': {
      const [dispenses, prescriptions] = await Promise.all([
        prisma.pharmacyDispense.findMany({ where: { clinicId, dispensedAt: range }, select: { status: true, lines: { select: { quantity: true, medication: { select: { name: true } } } } } }),
        prisma.prescription.count({ where: { clinicId, createdAt: range, deletedAt: null } }),
      ]);
      const lines = dispenses.flatMap((row) => row.lines);
      const units = lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
      const top = [...lines.reduce((map, line) => map.set(line.medication?.name ?? '—', (map.get(line.medication?.name ?? '—') ?? 0) + Number(line.quantity ?? 0)), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 15);
      return {
        metrics: [count('prescriptions', 'Ordonnances reçues', prescriptions), count('dispenses', 'Délivrances', dispenses.length, 'good'), count('units', 'Unités délivrées', units)],
        sections: [{ title: 'Médicaments les plus délivrés', columns: ['Médicament', 'Unités'], rows: top }],
        highlights: [`${dispenses.length} délivrance(s), ${units} unité(s).`],
      };
    }
    case 'CARE_UNITS': {
      const [opened, closed, transfers, events] = await Promise.all([
        prisma.careEpisode.findMany({ where: { clinicId, startedAt: range }, select: { careUnit: { select: { name: true } } } }),
        prisma.careEpisode.count({ where: { clinicId, endedAt: range } }),
        prisma.careTransfer.count({ where: { clinicId, sentAt: range } }),
        prisma.careEvent.count({ where: { clinicId, occurredAt: range } }),
      ]);
      return {
        metrics: [count('opened', 'Prises en charge ouvertes', opened.length), count('closed', 'Prises en charge clôturées', closed, 'good'), count('transfers', 'Transferts entre unités', transfers), count('events', 'Événements de soins tracés', events)],
        sections: [{ title: 'Prises en charge par unité', columns: ['Unité', 'Ouvertes'], rows: groupCount(opened, (row) => row.careUnit.name) }],
        highlights: [`${opened.length} prise(s) en charge ouverte(s), ${closed} clôturée(s), ${transfers} transfert(s).`],
      };
    }
    case 'FINANCE': {
      const [payments, payrolls] = await Promise.all([
        prisma.payment.aggregate({ where: { clinicId, paidAt: range }, _sum: { amount: true }, _count: true }),
        prisma.payroll.findMany({ where: { paidAt: range, employee: { clinicId } }, select: { netAmount: true, currency: true } }),
      ]);
      const paid = payrolls.reduce((sum, row) => sum + Number(row.netAmount), 0);
      return {
        metrics: [amount('revenue', `Recettes (${w.currency})`, Number(payments._sum.amount ?? 0), 'good'), count('payments', 'Paiements reçus', payments._count), count('payrolls', 'Salaires payés', payrolls.length), amount('payrollAmount', 'Montant des salaires payés', paid)],
        sections: [],
        highlights: [`${money(payments._sum.amount ?? 0).toLocaleString('fr-FR')} ${w.currency} de recettes.`],
      };
    }
    case 'HUMAN_RESOURCES': {
      const [attendances, leaves, pending] = await Promise.all([
        prisma.attendance.findMany({ where: { employee: { clinicId }, OR: [{ plannedStartAt: range }, { plannedStartAt: null, clockInAt: range }] }, select: { status: true, plannedStartAt: true, clockInAt: true, justified: true, employee: { select: { firstName: true, lastName: true } } } }),
        prisma.leaveRequest.count({ where: { employee: { clinicId }, status: 'APPROVED', startDate: { lte: w.end }, endDate: { gte: w.start } } }),
        prisma.leaveRequest.count({ where: { employee: { clinicId }, status: 'PENDING' } }),
      ]);
      const late = attendances.map((row) => ({ row, minutes: lateMinutes(row.plannedStartAt, row.clockInAt, w.graceMinutes) })).filter((item) => item.minutes > 0).sort((a, b) => b.minutes - a.minutes);
      const totalLate = late.reduce((sum, item) => sum + item.minutes, 0);
      const absent = attendances.filter((row) => row.status === 'ABSENT').length;
      return {
        metrics: [count('present', 'Pointages', attendances.filter((row) => row.clockInAt).length, 'good'), count('late', 'Arrivées en retard', late.length, late.length ? 'warn' : undefined),
          { key: 'lateMinutes', label: 'Retards cumulés', value: totalLate, format: 'duration', tone: totalLate ? 'warn' : undefined }, count('absent', 'Absences enregistrées', absent, absent ? 'bad' : undefined),
          count('onLeave', 'Employés en congé', leaves), count('pendingLeave', 'Demandes RH en attente', pending)],
        sections: [{ title: 'Retards du jour', columns: ['Employé', 'Prévu', 'Arrivé', 'Retard', 'Justifié'], rows: late.map(({ row, minutes }) => [`${row.employee.firstName} ${row.employee.lastName}`, time(row.plannedStartAt), time(row.clockInAt), formatDuration(minutes), row.justified ? 'oui' : 'non']) }],
        highlights: [late.length ? `${late.length} retard(s), ${formatDuration(totalLate)} au total.` : 'Aucun retard.'],
      };
    }
  }
}
