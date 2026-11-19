import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MedicationIdentity, SafetyAlert, evaluatePrescriptionSafety } from './domain/prescription-safety';

type Reader = {
  allergy: { findMany: (args: any) => Promise<any[]> };
  drugInteractionRule: { findMany: (args: any) => Promise<any[]> };
  prescription: { findMany: (args: any) => Promise<any[]> };
};

/** A treatment without a duration is considered in progress for this many days. */
export const DEFAULT_TREATMENT_DAYS = 30;
const DAY_MS = 86_400_000;
const LOOKBACK_DAYS = 365;

/** Medications of the patient's non-cancelled prescriptions in this clinic whose duration has not elapsed. */
export async function currentMedications(db: Reader, clinicId: string, patientId: string, now = new Date()): Promise<MedicationIdentity[]> {
  const prescriptions = await db.prescription.findMany({
    where: {
      clinicId,
      patientId,
      deletedAt: null,
      status: { not: 'CANCELLED' },
      prescribingDate: { gte: new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS) },
    },
    select: {
      prescribingDate: true,
      lineItems: {
        select: { durationDays: true, medication: { select: { id: true, name: true, activeSubstance: true, atcCode: true } } },
      },
    },
  });
  const byId = new Map<string, MedicationIdentity>();
  for (const prescription of prescriptions) {
    for (const line of prescription.lineItems ?? []) {
      if (!line.medication) continue;
      const days = Number(line.durationDays) > 0 ? Number(line.durationDays) : DEFAULT_TREATMENT_DAYS;
      const endsAt = new Date(prescription.prescribingDate).getTime() + days * DAY_MS;
      if (endsAt > now.getTime()) byId.set(line.medication.id, line.medication);
    }
  }
  return [...byId.values()];
}

/** Runs the safety rules of the patient's clinic against what is about to be prescribed. */
export async function evaluateForPatient(db: Reader, input: { clinicId: string; patientId: string; prescribed: MedicationIdentity[] }) {
  const [allergies, rules, current] = await Promise.all([
    db.allergy.findMany({
      where: { patientId: input.patientId, patient: { clinicId: input.clinicId }, resolved: false, deletedAt: null },
      select: { id: true, substance: true, severity: true, reaction: true },
    }),
    db.drugInteractionRule.findMany({
      where: { clinicId: input.clinicId, status: 'ACTIVE' },
      select: { id: true, substanceA: true, substanceB: true, severity: true, effect: true, recommendation: true, source: true },
    }),
    currentMedications(db, input.clinicId, input.patientId),
  ]);
  const prescribedIds = new Set(input.prescribed.map((medication) => medication.id));
  return evaluatePrescriptionSafety({
    allergies,
    rules,
    prescribed: input.prescribed,
    current: current.filter((medication) => !prescribedIds.has(medication.id)),
  });
}

export const PRESCRIPTION_SAFETY_ALERTS = 'PRESCRIPTION_SAFETY_ALERTS';

/**
 * Blocks the prescription while a blocking alert has no written justification.
 * Non-blocking alerts never stop the prescriber; every alert shown is recorded.
 */
export function assertPrescribable(evaluation: { alerts: SafetyAlert[]; blocking: boolean }, overrideReason?: string | null) {
  const reason = overrideReason?.trim() || null;
  if (evaluation.blocking && (!reason || reason.length < 10)) {
    throw new ConflictException({
      code: PRESCRIPTION_SAFETY_ALERTS,
      message: 'Alertes de sécurité : une justification écrite (10 caractères minimum) est nécessaire pour prescrire malgré tout.',
      alerts: evaluation.alerts,
    });
  }
  return reason;
}

export function overrideRows(
  alerts: SafetyAlert[],
  context: { clinicId: string; prescriptionId: string; prescriberId: string; reason: string | null },
): Prisma.PrescriptionSafetyOverrideCreateManyInput[] {
  return alerts.map((alert) => ({
    clinicId: context.clinicId,
    prescriptionId: context.prescriptionId,
    prescriberId: context.prescriberId,
    kind: alert.kind,
    blocking: alert.blocking,
    severity: alert.severity,
    message: alert.message,
    detail: {
      medicationIds: alert.medicationIds,
      allergyId: alert.allergyId ?? null,
      ruleId: alert.ruleId ?? null,
      source: alert.source ?? null,
    } as Prisma.InputJsonValue,
    reason: context.reason,
  }));
}
