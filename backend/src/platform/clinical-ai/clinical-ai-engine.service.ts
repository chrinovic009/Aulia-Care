import { Injectable } from '@nestjs/common';
import {
  CLINICAL_AI_CONTRACT_VERSION,
  CLINICAL_AI_DISCLAIMER,
  ClinicalAIProvider,
  ClinicalAIRequest,
  ClinicalAIResponse,
  ClinicalAISuggestion,
} from '../contracts/clinical-ai.contract';

const normalise = (value?: string) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

/**
 * A portable, deterministic Clinical AI provider.
 *
 * It deliberately has no database, HTTP or Core import.  A hospital can deploy
 * it with only the platform contracts, or replace it with an accredited remote
 * provider without changing Core.
 */
@Injectable()
export class ClinicalAIEngineService implements ClinicalAIProvider {
  async execute(request: ClinicalAIRequest): Promise<ClinicalAIResponse> {
    switch (request.purpose) {
      case 'STRUCTURE_ENCOUNTER':
        return this.structureEncounter(request);
      case 'SUMMARIZE_ENCOUNTER':
        return this.summarizeEncounter(request);
      default:
        return this.detectRisks(request);
    }
  }

  async structureEncounter(request: ClinicalAIRequest): Promise<ClinicalAIResponse> {
    const text = String(request.encounter.transcript || request.encounter.clinicalText || '').trim();
    const suggestions: ClinicalAISuggestion[] = text
      ? [{
          kind: 'STRUCTURE',
          label: 'Texte clinique reçu : à relire et structurer par le médecin',
          rationale: 'Le moteur ne modifie jamais le dossier clinique et ne valide aucune information.',
          confidence: 0,
        }]
      : [];
    return this.response(request, suggestions);
  }

  async summarizeEncounter(request: ClinicalAIRequest): Promise<ClinicalAIResponse> {
    const text = String(request.encounter.clinicalText || request.encounter.transcript || '').trim();
    const suggestions: ClinicalAISuggestion[] = text
      ? [{
          kind: 'SUMMARY',
          label: text.length > 480 ? `${text.slice(0, 477).trim()}...` : text,
          rationale: 'Résumé extractif automatique, sans interprétation diagnostique.',
          confidence: 0.5,
        }]
      : [];
    return this.response(request, suggestions);
  }

  async detectRisks(request: ClinicalAIRequest): Promise<ClinicalAIResponse> {
    const text = normalise(`${request.encounter.transcript || ''} ${request.encounter.clinicalText || ''}`);
    const suggestions: ClinicalAISuggestion[] = [];

    if (/epigas|estomac|douleur.*dos|brulure/.test(text)) {
      suggestions.push(
        this.decision('Syndrome douloureux épigastrique à évaluer', 'Termes localisés dans l’anamnèse ; confirmation clinique indispensable.', 'PRIORITY'),
        this.exam('NFS', 'Suggestion issue du texte clinique ; le prescripteur vérifie l’indication.'),
        this.exam('Lipase', 'Suggestion issue du texte clinique ; le prescripteur vérifie l’indication.'),
        this.exam('Bilan hépatique', 'Suggestion issue du texte clinique ; le prescripteur vérifie l’indication.'),
      );
    }
    if (/fievre|toux|dyspn|essouff/.test(text)) {
      suggestions.push(
        this.decision('Cause infectieuse ou respiratoire à évaluer', 'Symptômes déclarés compatibles ; examen clinique requis.', 'PRIORITY'),
        this.exam('NFS', 'Suggestion issue du texte clinique ; le prescripteur vérifie l’indication.'),
        this.exam('CRP', 'Suggestion issue du texte clinique ; le prescripteur vérifie l’indication.'),
      );
    }
    if (/diab|glycem/.test(text)) {
      suggestions.push(
        this.decision('Équilibre glycémique à vérifier', 'Antécédent ou symptôme lié à la glycémie.', 'ROUTINE'),
        this.exam('Glycémie', 'Suggestion issue du texte clinique ; le prescripteur vérifie l’indication.'),
        this.exam('HbA1c', 'Suggestion issue du texte clinique ; le prescripteur vérifie l’indication.'),
      );
    }

    for (const observation of request.observations || []) {
      const numeric = Number(observation.value);
      const label = normalise(observation.label);
      if ((label.includes('oxygen') || label.includes('spo2') || label.includes('saturation')) && numeric < 90) {
        suggestions.unshift(this.risk('Constante vitale critique à confirmer immédiatement', `${observation.label} enregistrée à ${observation.value}${observation.unit || ''}. Reprendre une mesure et évaluer le patient sans délai.`));
      }
      if ((label.includes('heart') || label.includes('cardiaque') || label.includes('frequence cardiaque')) && (numeric < 40 || numeric > 130)) {
        suggestions.unshift(this.risk('Fréquence cardiaque critique à confirmer immédiatement', `${observation.label} enregistrée à ${observation.value}${observation.unit || ''}. Reprendre une mesure et évaluer le patient sans délai.`));
      }
    }
    return this.response(request, this.uniqueSuggestions(suggestions));
  }

  private response(request: ClinicalAIRequest, suggestions: ClinicalAISuggestion[]): ClinicalAIResponse {
    return {
      contractVersion: CLINICAL_AI_CONTRACT_VERSION,
      requestId: request.requestId,
      generatedAt: new Date().toISOString(),
      provider: { name: 'Aulia deterministic safety engine', version: CLINICAL_AI_CONTRACT_VERSION },
      disclaimer: CLINICAL_AI_DISCLAIMER,
      suggestions,
    };
  }

  private decision(label: string, rationale: string, urgency: 'ROUTINE' | 'PRIORITY'): ClinicalAISuggestion {
    return { kind: 'DECISION_SUPPORT', label, rationale, urgency, confidence: 0.3 };
  }

  private exam(name: string, rationale: string): ClinicalAISuggestion {
    return { kind: 'DECISION_SUPPORT', label: `EXAM:${name}`, rationale, urgency: 'ROUTINE', confidence: 0.2 };
  }

  private risk(label: string, rationale: string): ClinicalAISuggestion {
    return { kind: 'RISK', label, rationale, urgency: 'IMMEDIATE_REVIEW', confidence: 0.7 };
  }

  private uniqueSuggestions(suggestions: ClinicalAISuggestion[]) {
    return suggestions.filter((suggestion, index) => suggestions.findIndex((item) => item.label === suggestion.label) === index);
  }
}
