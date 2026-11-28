import { Injectable } from '@nestjs/common';
import { RoleSlug } from '@prisma/client';
import { AuthenticatedActor, ClinicContextService } from '../core/clinic-context.service';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';

export type BadgeKey =
  | 'messages' | 'hrSelf' | 'hrAdmin' | 'hrFinance' | 'nurseRounds' | 'nursePatients' | 'doctorPatients' | 'doctorDrafts'
  | 'doctorReferrals' | 'labActivity' | 'labValidations' | 'radiologyQueue' | 'pharmacyDispense' | 'stockLow'
  | 'cashierBilling' | 'receptionAppointments' | 'units';
export type Badge = { count: number; tone: 'info' | 'danger'; label: string };

const DAY = 86_400_000;

/**
 * Counters shown on the menu tabs: what is waiting for the connected person
 * (unread messages, replacements asked of them, patients not yet taken in
 * charge, results to validate, stock below its threshold…). Each counter only
 * looks at what the person's role may see; a failing counter is simply absent.
 */
@Injectable()
export class NavigationBadgesService {
  constructor(private readonly prisma: PrismaService, private readonly clinicContext: ClinicContextService, private readonly messages: MessagesService) {}

  async badges(actorInput?: AuthenticatedActor): Promise<Partial<Record<BadgeKey, Badge>>> {
    const actor = await this.clinicContext.requireOperationalActor(actorInput);
    const roles = new Set<RoleSlug>([...(actor.primaryRole ? [actor.primaryRole] : []), ...actor.roles]);
    const has = (...wanted: RoleSlug[]) => wanted.some((role) => roles.has(role));
    const clinicId = actor.clinicId;
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY);
    const tasks: Array<[BadgeKey, () => Promise<number>, Badge['tone'], string]> = [];
    const add = (key: BadgeKey, count: () => Promise<number>, label: string, tone: Badge['tone'] = 'info') => tasks.push([key, count, tone, label]);

    if (!has(RoleSlug.PATIENT, RoleSlug.DEV)) {
      add('messages', async () => (await this.messages.findUnread(actor.id)).length, 'message(s) non lu(s)');
      add('hrSelf', () => this.prisma.replacementRequest.count({ where: { clinicId, status: 'PENDING_COLLEAGUE', replacer: { userId: actor.id } } }), 'demande(s) de remplacement à votre attention');
    }
    if (has(RoleSlug.ADMIN, RoleSlug.SUPER_ADMIN)) {
      add('hrAdmin', async () => (await this.prisma.leaveRequest.count({ where: { status: 'PENDING', employee: { clinicId } } })) + (await this.prisma.replacementRequest.count({ where: { clinicId, status: 'PENDING_ADMIN' } })), 'demande(s) RH non traitée(s)');
    }
    if (has(RoleSlug.FINANCE)) {
      add('hrFinance', () => this.prisma.payroll.count({ where: { status: { not: 'PAID' }, dueDate: { lt: now }, employee: { clinicId } } }), 'paie(s) en retard', 'danger');
    }
    if (has(RoleSlug.NURSE)) {
      add('nurseRounds', async () => (await this.prisma.nursingCareTask.findMany({ where: { assignedNurseId: actor.id, status: 'PENDING', dueAt: { lte: now }, hospitalization: { clinicId } }, distinct: ['hospitalizationId'], select: { hospitalizationId: true } })).length, 'patient(s) non pris en charge');
      add('nursePatients', () => this.prisma.patient.count({ where: { clinicId, deletedAt: null, workflowStatus: 'EN_ATTENTE_INFIRMERIE' } }), 'patient(s) en attente des constantes');
    }
    if (has(RoleSlug.PHYSICIAN)) {
      add('doctorPatients', () => this.prisma.patient.count({ where: { clinicId, deletedAt: null, workflowStatus: 'EN_ATTENTE_MEDECIN', consultations: { some: { providerId: actor.id, deletedAt: null, status: { in: ['DRAFT', 'IN_PROGRESS'] } } } } }), 'patient(s) en attente de consultation');
      add('doctorDrafts', () => this.prisma.consultation.count({ where: { providerId: actor.id, deletedAt: null, status: 'IN_PROGRESS' } }), 'consultation(s) en cours');
      add('doctorReferrals', () => this.prisma.consultationReferral.count({ where: { clinicId, recipientId: actor.id, status: 'REQUESTED' } }), 'avis demandé(s)');
    }
    if (has(RoleSlug.LAB_TECHNICIAN, RoleSlug.LAB_MANAGER)) {
      add('labActivity', () => this.prisma.labRequest.count({ where: { clinicId, deletedAt: null, status: { in: ['REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS'] }, requestedAt: { gte: since } } }), 'analyse(s) à traiter');
      add('labValidations', () => this.prisma.labRequest.count({ where: { clinicId, deletedAt: null, status: { in: ['TECHNICAL_VALIDATION', 'BIOLOGICAL_VALIDATION'] } } }), 'résultat(s) à valider');
    }
    if (has(RoleSlug.RADIOLOGIST)) {
      add('radiologyQueue', () => this.prisma.imagingRequest.count({ where: { clinicId, deletedAt: null, status: { in: ['REQUESTED', 'SCHEDULED'] }, createdAt: { gte: since } } }), 'examen(s) en attente');
    }
    if (has(RoleSlug.PHARMACIST)) {
      add('pharmacyDispense', () => this.prisma.prescription.count({ where: { clinicId, deletedAt: null, status: { in: ['PRESCRIBED', 'PARTIALLY_DISPENSED'] }, createdAt: { gte: since } } }), 'ordonnance(s) à délivrer');
    }
    if (has(RoleSlug.PHARMACIST, RoleSlug.ADMIN)) {
      add('stockLow', () => this.lowStockCount(clinicId), 'médicament(s) sous le seuil', 'danger');
    }
    if (has(RoleSlug.CASHIER)) {
      add('cashierBilling', () => this.prisma.invoice.count({ where: { clinicId, deletedAt: null, status: { in: ['PENDING', 'ISSUED', 'PARTIALLY_PAID'] }, createdAt: { gte: since } } }), 'facture(s) à encaisser');
    }
    if (has(RoleSlug.RECEPTIONIST)) {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      add('receptionAppointments', () => this.prisma.appointment.count({ where: { clinicId, deletedAt: null, status: { in: ['SCHEDULED', 'CONFIRMED'] }, scheduledAt: { gte: start, lt: new Date(start.getTime() + DAY) } } }), 'rendez-vous du jour à accueillir');
    }
    add('units', () => this.prisma.careTask.count({ where: { clinicId, status: { in: ['REQUESTED', 'RECEIVED'] }, careUnit: { assignments: { some: { userId: actor.id, active: true } } } } }), 'tâche(s) reçue(s) dans vos unités');

    const result: Partial<Record<BadgeKey, Badge>> = {};
    await Promise.all(tasks.map(async ([key, count, tone, label]) => {
      try {
        const value = await count();
        if (value > 0) result[key] = { count: value, tone, label };
      } catch {
        // A counter must never break the menu.
      }
    }));
    return result;
  }

  /** Medications whose stock (lots, or stock lines when there are no lots) is at or below their low-stock level. */
  async lowStockCount(clinicId: string) {
    const [lots, lines] = await Promise.all([
      this.prisma.stockLot.groupBy({ by: ['medicationId'], where: { clinicId }, _sum: { quantity: true } }),
      this.prisma.medicationStock.findMany({ where: { clinicId, deletedAt: null }, select: { medicationId: true, quantity: true, lowStockLevel: true } }),
    ]);
    const levels = new Map<string, { level: number; quantity: number }>();
    for (const line of lines) {
      const current = levels.get(line.medicationId) ?? { level: 0, quantity: 0 };
      levels.set(line.medicationId, { level: Math.max(current.level, line.lowStockLevel), quantity: current.quantity + line.quantity });
    }
    const fromLots = new Map(lots.map((lot) => [lot.medicationId, lot._sum.quantity ?? 0]));
    let low = 0;
    for (const medicationId of new Set([...levels.keys(), ...fromLots.keys()])) {
      const quantity = fromLots.get(medicationId) ?? levels.get(medicationId)?.quantity ?? 0;
      if (quantity <= (levels.get(medicationId)?.level ?? 10)) low += 1;
    }
    return low;
  }
}
