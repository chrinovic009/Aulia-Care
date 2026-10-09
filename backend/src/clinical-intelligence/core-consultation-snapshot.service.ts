import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  DIAGNOSTIC_AGENT_CONTRACT_VERSION,
  DiagnosticAgentRequest,
} from '../platform/contracts/diagnostic-agent.contract';

type Actor = { userId?: string; role?: string };

/**
 * Core-side adapter. It is the only component allowed to translate Core records
 * to the Diagnostic Agent contract. The agent never receives a Prisma client or a Core ID.
 */
@Injectable()
export class CoreConsultationSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async forDiagnosticAgent(consultationId: string, actor: Actor): Promise<DiagnosticAgentRequest> {
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
      contractVersion: DIAGNOSTIC_AGENT_CONTRACT_VERSION,
      tenantId: this.requireClinicId(consultation.patient.clinicId),
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

  private requireClinicId(clinicId: string | null): string {
    if (!clinicId) {
      throw new ForbiddenException(
        'La consultation doit être rattachée à un établissement avant toute analyse Diagnostic Agent.',
      );
    }
    return clinicId;
  }
}
