import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Explainable clinical decision support. Never diagnoses, prescribes, or replaces clinical judgment. */
@Injectable()
export class ClinicalIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}
  async suggestionsForConsultation(id: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id }, include: { patient: { include: { vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 10 }, medicalHistories: { orderBy: { eventDate: 'desc' }, take: 10 } } } } });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    const text = `${consultation.chiefComplaint || ''} ${consultation.clinicalSummary || ''} ${consultation.patient.medicalHistories.map((h) => h.details).join(' ')}`.toLowerCase();
    const hypotheses: Array<{ label: string; rationale: string; urgency: 'ROUTINE' | 'PRIORITY' }> = [];
    const exams = new Set<string>();
    if (/epigas|estomac|douleur.*dos|brulure/.test(text)) { hypotheses.push({ label: 'Syndrome douloureux épigastrique à évaluer', rationale: 'Termes localisés dans l’anamnèse; confirmation clinique indispensable.', urgency: 'PRIORITY' }); ['NFS', 'Lipase', 'Bilan hépatique'].forEach((x) => exams.add(x)); }
    if (/fievre|fièvre|toux|dyspn|essouff/.test(text)) { hypotheses.push({ label: 'Cause infectieuse ou respiratoire à évaluer', rationale: 'Symptômes déclarés compatibles; examen clinique requis.', urgency: 'PRIORITY' }); ['NFS', 'CRP', 'Saturation O2'].forEach((x) => exams.add(x)); }
    if (/diab|glycem|glycém/.test(text)) { hypotheses.push({ label: 'Équilibre glycémique à vérifier', rationale: 'Antécédent ou symptôme lié à la glycémie.', urgency: 'ROUTINE' }); ['Glycémie', 'HbA1c', 'Créatinine'].forEach((x) => exams.add(x)); }
    const criticalVital = consultation.patient.vitalSigns.find((v) => (v.type === 'OXYGEN_SATURATION' && Number(v.value) < 90) || (v.type === 'HEART_RATE' && (Number(v.value) < 40 || Number(v.value) > 130)));
    if (criticalVital) hypotheses.unshift({ label: 'Constante vitale critique à confirmer immédiatement', rationale: `${criticalVital.type} enregistré à ${criticalVital.value}${criticalVital.unit || ''}. Reprendre une mesure et évaluer le patient sans délai.`, urgency: 'PRIORITY' });
    return { consultationId: id, generatedAt: new Date().toISOString(), disclaimer: 'Aide à la décision explicable : le médecin confirme, adapte ou ignore chaque suggestion.', hypotheses, suggestedExams: [...exams], requiresImmediateReview: Boolean(criticalVital) };
  }
}
