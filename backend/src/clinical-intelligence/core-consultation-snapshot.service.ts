import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CLINICAL_AI_CONTRACT_VERSION, ClinicalAIRequest } from '../platform/contracts/clinical-ai.contract';

type Actor = { userId?: string; role?: string };

/**
 * Core-side adapter. It is the only component allowed to translate Core records
 * to the IA contract. The IA engine never receives a Prisma client or a Core ID.
 */
@Injectable()
export class CoreConsultationSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async forClinicalAI(consultationId: string, actor: Actor): Promise<ClinicalAIRequest> {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        patient: {
          include: {
            vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 10 },
            medicalHistories: { orderBy: { eventDate: 'desc' }, take: 10 },
          },
        },
      },
    });
    if (!consultation || consultation.deletedAt) throw new NotFoundException('Consultation introuvable.');
    if (actor.role === 'PHYSICIAN' && consultation.providerId && consultation.providerId !== actor.userId) {
      throw new ForbiddenException('Cette consultation n’est pas attribuée à ce médecin.');
    }

    const birth = consultation.patient.dateOfBirth;
    const ageYears = birth ? Math.max(0, Math.floor((Date.now() - birth.getTime()) / 31_557_600_000)) : undefined;
    const histories = consultation.patient.medicalHistories.map((history) => history.details).filter(Boolean).join('\n');
    const clinicalText = [consultation.chiefComplaint, consultation.clinicalSummary, histories].filter(Boolean).join('\n');

    return {
      contractVersion: CLINICAL_AI_CONTRACT_VERSION,
      tenantId: consultation.patient.clinicId || 'local-unassigned-clinic',
      requestId: randomUUID(),
      idempotencyKey: `consultation:${consultation.id}:updated:${consultation.updatedAt.toISOString()}`,
      purpose: 'DETECT_RISKS',
      subject: { externalPatientId: consultation.patient.id, ageYears, sex: consultation.patient.gender || undefined },
      encounter: { externalEncounterId: consultation.id, language: 'fr', clinicalText },
      observations: consultation.patient.vitalSigns.map((vital) => ({
        code: vital.type,
        label: vital.type,
        value: vital.value,
        unit: vital.unit,
        observedAt: vital.recordedAt.toISOString(),
      })),
    };
  }
}
