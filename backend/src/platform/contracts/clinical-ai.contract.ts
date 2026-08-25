/**
 * Public, versioned boundary for Aulia Care IA.
 *
 * This file is intentionally framework and persistence agnostic: it must never
 * import Prisma, Nest controllers, Core DTOs or frontend types. It can be
 * copied unchanged into an independent IA deployment or a third-party SIH.
 */
export const CLINICAL_AI_CONTRACT_VERSION = '1.0';
export const CLINICAL_AI_DISCLAIMER =
  'À vérifier par un clinicien habilité avant toute décision médicale.' as const;

export type ClinicalAIRequest = {
  contractVersion: typeof CLINICAL_AI_CONTRACT_VERSION;
  tenantId: string;
  requestId: string;
  idempotencyKey: string;
  purpose: 'STRUCTURE_ENCOUNTER' | 'SUMMARIZE_ENCOUNTER' | 'DETECT_RISKS';
  subject: {
    externalPatientId?: string;
    ageYears?: number;
    sex?: string;
  };
  encounter: {
    externalEncounterId?: string;
    language: string;
    transcript?: string;
    clinicalText?: string;
  };
  observations?: Array<{
    code?: string;
    label: string;
    value: string | number;
    unit?: string;
    observedAt?: string;
  }>;
  allergies?: Array<{ code?: string; label: string }>;
};

export type ClinicalAISuggestion = {
  kind: 'SUMMARY' | 'STRUCTURE' | 'RISK' | 'DECISION_SUPPORT';
  label: string;
  rationale: string;
  urgency?: 'ROUTINE' | 'PRIORITY' | 'IMMEDIATE_REVIEW';
  confidence?: number;
};

export type ClinicalAIResponse = {
  contractVersion: typeof CLINICAL_AI_CONTRACT_VERSION;
  requestId: string;
  generatedAt: string;
  provider: { name: string; model?: string; version?: string };
  disclaimer: typeof CLINICAL_AI_DISCLAIMER;
  suggestions: ClinicalAISuggestion[];
};

/** Provider implemented by a local engine or a remote accredited provider. */
export interface ClinicalAIProvider {
  structureEncounter(request: ClinicalAIRequest): Promise<ClinicalAIResponse>;
  summarizeEncounter(request: ClinicalAIRequest): Promise<ClinicalAIResponse>;
  detectRisks(request: ClinicalAIRequest): Promise<ClinicalAIResponse>;
}

/** Client used by Core. It has the same stable boundary as an external caller. */
export interface ClinicalAIClient {
  execute(request: ClinicalAIRequest): Promise<ClinicalAIResponse>;
}

/** Nest injection token, exported without coupling callers to an implementation. */
export const CLINICAL_AI_CLIENT = Symbol('aulia.clinical-ai.client.v1');
