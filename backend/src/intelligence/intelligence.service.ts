import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const normalise = (value?: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async analyseConsultation(consultationId: string, transcript: string) {
    if (!transcript?.trim()) throw new BadRequestException('La transcription est requise.');
    const consultation = await this.prisma.consultation.findUnique({ where: { id: consultationId }, select: { patientId: true } });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    const text = normalise(transcript);
    const painLocation = /au-dessus de l'estomac|epigastr/.test(text) ? 'Épigastre' : /poitrine|thorax/.test(text) ? 'Thorax' : /tete|migraine/.test(text) ? 'Tête' : null;
    const onset = /depuis hier soir/.test(text) ? 'Depuis hier soir' : /depuis (\d+) (jour|heure|semaine)/.exec(text)?.[0] || null;
    const hypotheses = painLocation === 'Épigastre' ? ['Douleur digestive haute à évaluer', 'Pancréatite à exclure selon l’examen clinique'] : [];
    const suggestedExams = painLocation === 'Épigastre' ? ['NFS', 'Lipase', 'Bilan hépatique'] : [];
    const result = { transcript, extracted: { painLocation, onset }, hypotheses, suggestedExams, confidence: painLocation ? 0.72 : 0.25, safety: 'Suggestion non diagnostique : confirmation clinique obligatoire avant toute prescription ou demande d’examen.' };
    await this.prisma.medicalHistory.create({ data: { patientId: consultation.patientId, kind: 'AI_CLINICAL_ASSISTANCE', details: JSON.stringify(result) } });
    return result;
  }

  async findDuplicateCandidates(identity: any) {
    const firstName = normalise(identity?.firstName); const lastName = normalise(identity?.lastName);
    const email = normalise(identity?.email); const phone = String(identity?.phone || '').replace(/\D/g, '');
    if (!firstName && !lastName && !email && !phone) throw new BadRequestException('Au moins une donnée d’identité est requise.');
    const patients = await this.prisma.patient.findMany({ where: { deletedAt: null, OR: [email ? { email } : undefined, phone ? { phone: { contains: phone } } : undefined, firstName ? { firstName: { contains: firstName, mode: 'insensitive' } } : undefined, lastName ? { lastName: { contains: lastName, mode: 'insensitive' } } : undefined].filter(Boolean) as any }, take: 20 });
    return patients.map((patient) => { let score = 0; if (email && normalise(patient.email || '') === email) score += 0.55; if (phone && String(patient.phone || '').replace(/\D/g, '').endsWith(phone)) score += 0.3; if (firstName && normalise(patient.firstName) === firstName) score += 0.075; if (lastName && normalise(patient.lastName) === lastName) score += 0.075; return { patient, score, recommendation: score >= 0.85 ? 'VERIFY_EXISTING_RECORD' : 'MANUAL_REVIEW' }; }).sort((a, b) => b.score - a.score);
  }

  extractCompanyDocument(file: any) {
    if (!file?.buffer || !String(file?.mimetype || '').includes('pdf')) throw new BadRequestException('Un fichier PDF est requis.');
    // Provider boundary: replace this deterministic fallback with a secured OCR/LLM adapter in production.
    const text = file.buffer.toString('utf8').replace(/[^\x20-\x7EÀ-ÿ\n]/g, ' ');
    const companyName = /(?:entreprise|societe|société)\s*[:\-]\s*([^\n]+)/i.exec(text)?.[1]?.trim() || null;
    return { status: 'NEEDS_REVIEW', provider: 'LOCAL_FALLBACK', warning: 'PDF reçu. Vérifiez les données extraites avant import transactionnel.', draft: { company: { name: companyName, contractNumber: null }, employees: [] } };
  }
}
