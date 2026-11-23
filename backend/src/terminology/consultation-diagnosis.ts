import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeCode } from './clinical-codes';

/**
 * Records the ICD-10 (CIM-10) coded principal diagnosis of a consultation:
 * one per consultation, replaced (the previous one is kept, marked deleted)
 * when the doctor changes it. Unknown codes are refused.
 */
export async function recordConsultationDiagnosis(
  tx: Prisma.TransactionClient,
  input: { consultationId: string; patientId: string; code: string; recordedById?: string | null },
) {
  const code = normalizeCode('ICD10', input.code);
  const entry = await tx.clinicalCode.findUnique({ where: { system_code: { system: 'ICD10', code } } });
  if (!entry || entry.isChapter || !entry.active) throw new BadRequestException(`Code CIM-10 inconnu : ${input.code}. Choisissez-le dans la liste.`);
  const existing = await tx.diagnosis.findFirst({ where: { consultationId: input.consultationId, codeSystem: 'ICD10', deletedAt: null } });
  if (existing?.code === code) return existing;
  if (existing) await tx.diagnosis.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  return tx.diagnosis.create({
    data: { patientId: input.patientId, consultationId: input.consultationId, code, codeSystem: 'ICD10', description: entry.display, recordedById: input.recordedById ?? null },
  });
}

/** Reads the ICD-10 code chosen in the structured diagnosis of the consultation form. */
export function principalIcd10Code(diagnosis: unknown): string | null {
  if (!diagnosis || typeof diagnosis !== 'object') return null;
  const value = (diagnosis as { icd10?: { code?: unknown }; icd10Code?: unknown }).icd10?.code ?? (diagnosis as { icd10Code?: unknown }).icd10Code;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
