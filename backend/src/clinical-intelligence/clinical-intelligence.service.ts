import { Inject, Injectable } from '@nestjs/common';
import { CLINICAL_AI_CLIENT, ClinicalAIClient, ClinicalAISuggestion } from '../platform/contracts/clinical-ai.contract';
import { CoreConsultationSnapshotService } from './core-consultation-snapshot.service';

/**
 * Core adapter for the clinician-facing endpoint. It maps a Core consultation to
 * a minimised contract and calls IA as any external client would.
 */
@Injectable()
export class ClinicalIntelligenceService {
  constructor(
    private readonly snapshots: CoreConsultationSnapshotService,
    @Inject(CLINICAL_AI_CLIENT) private readonly clinicalAI: ClinicalAIClient,
  ) {}

  async suggestionsForConsultation(id: string, actor: { userId?: string; role?: string }) {
    const request = await this.snapshots.forClinicalAI(id, actor);
    const response = await this.clinicalAI.execute(request);
    const hypotheses = response.suggestions
      .filter((item) => item.kind === 'RISK' || (item.kind === 'DECISION_SUPPORT' && !item.label.startsWith('EXAM:')))
      .map((item) => this.legacySuggestion(item));
    const suggestedExams = response.suggestions
      .filter((item) => item.label.startsWith('EXAM:'))
      .map((item) => item.label.slice('EXAM:'.length));

    return {
      consultationId: id,
      generatedAt: response.generatedAt,
      contractVersion: response.contractVersion,
      disclaimer: response.disclaimer,
      hypotheses,
      suggestedExams: [...new Set(suggestedExams)],
      requiresImmediateReview: response.suggestions.some((item) => item.urgency === 'IMMEDIATE_REVIEW'),
    };
  }

  private legacySuggestion(item: ClinicalAISuggestion) {
    return {
      label: item.label,
      rationale: item.rationale,
      urgency: item.urgency === 'IMMEDIATE_REVIEW' ? 'PRIORITY' : item.urgency || 'ROUTINE',
      confidence: item.confidence,
    };
  }
}
