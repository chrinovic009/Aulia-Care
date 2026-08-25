import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CLINICAL_AI_CLIENT, CLINICAL_AI_CONTRACT_VERSION, ClinicalAIClient } from '../platform/contracts/clinical-ai.contract';

const normalise = (value?: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Core automation adapter. It may prepare an IA request, but never stores a
 * model output in a clinical record: a clinician must explicitly review it.
 */
@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLINICAL_AI_CLIENT) private readonly clinicalAI: ClinicalAIClient,
  ) {}

  async analyseConsultation(consultationId: string, transcript: string) {
    if (!transcript?.trim()) throw new BadRequestException('La transcription est requise.');
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: {
        id: true,
        patientId: true,
        updatedAt: true,
        patient: { select: { clinicId: true, dateOfBirth: true, gender: true } },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');

    const text = normalise(transcript);
    const painLocation = /au-dessus de l'estomac|epigastr/.test(text) ? 'Épigastre' : /poitrine|thorax/.test(text) ? 'Thorax' : /tete|migraine/.test(text) ? 'Tête' : null;
    const onset = /depuis hier soir/.test(text) ? 'Depuis hier soir' : /depuis (\d+) (jour|heure|semaine)/.exec(text)?.[0] || null;
    const ageYears = consultation.patient.dateOfBirth
      ? Math.max(0, Math.floor((Date.now() - consultation.patient.dateOfBirth.getTime()) / 31_557_600_000))
      : undefined;
    const response = await this.clinicalAI.execute({
      contractVersion: CLINICAL_AI_CONTRACT_VERSION,
      tenantId: consultation.patient.clinicId || 'local-unassigned-clinic',
      requestId: randomUUID(),
      idempotencyKey: `transcript:${consultation.id}:updated:${consultation.updatedAt.toISOString()}`,
      purpose: 'DETECT_RISKS',
      subject: { externalPatientId: consultation.patientId, ageYears, sex: consultation.patient.gender || undefined },
      encounter: { externalEncounterId: consultation.id, language: 'fr', transcript },
    });
    return {
      transcript,
      extracted: { painLocation, onset },
      suggestions: response.suggestions,
      confidence: response.suggestions.length ? 0.3 : 0,
      safety: response.disclaimer,
      persisted: false,
    };
  }

  async findDuplicateCandidates(identity: any) {
    const firstName = normalise(identity?.firstName); const lastName = normalise(identity?.lastName);
    const email = normalise(identity?.email); const phone = String(identity?.phone || '').replace(/\D/g, '');
    if (!firstName && !lastName && !email && !phone) throw new BadRequestException('Au moins une donnée d’identité est requise.');
    const patients = await this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        OR: [
          email ? { email } : undefined,
          phone ? { phone: { contains: phone } } : undefined,
          firstName ? { firstName: { contains: firstName, mode: 'insensitive' } } : undefined,
          lastName ? { lastName: { contains: lastName, mode: 'insensitive' } } : undefined,
        ].filter(Boolean) as any,
      },
      take: 20,
    });
    return patients.map((patient) => {
      let score = 0;
      if (email && normalise(patient.email || '') === email) score += 0.55;
      if (phone && String(patient.phone || '').replace(/\D/g, '').endsWith(phone)) score += 0.3;
      if (firstName && normalise(patient.firstName) === firstName) score += 0.075;
      if (lastName && normalise(patient.lastName) === lastName) score += 0.075;
      return { patient, score, recommendation: score >= 0.85 ? 'VERIFY_EXISTING_RECORD' : 'MANUAL_REVIEW' };
    }).sort((a, b) => b.score - a.score);
  }

  extractCompanyDocument(file: any) {
    if (!file?.buffer || !String(file?.mimetype || '').includes('pdf')) throw new BadRequestException('Un fichier PDF est requis.');
    const text = file.buffer.toString('utf8').replace(/[^\x20-\x7EÀ-ÿ\n]/g, ' ');
    const companyName = /(?:entreprise|societe|société)\s*[:-]\s*([^\n]+)/i.exec(text)?.[1]?.trim() || null;
    return { status: 'NEEDS_REVIEW', provider: 'LOCAL_FALLBACK', warning: 'PDF reçu. Vérifiez les données extraites avant import transactionnel.', draft: { company: { name: companyName, contractNumber: null }, employees: [] } };
  }
}
