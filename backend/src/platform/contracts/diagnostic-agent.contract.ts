/**
 * Public, versioned boundary for Aulia Care Diagnostic Agent.
 *
 * This file is intentionally framework and persistence agnostic: it must never
 * import Prisma, Nest controllers, Core DTOs or frontend types. It can be
 * copied unchanged into an independent IA deployment or a third-party SIH.
 */
export const DIAGNOSTIC_AGENT_CONTRACT_VERSION = '1.0';
export const DIAGNOSTIC_AGENT_DISCLAIMER =
  'À vérifier par un clinicien habilité avant toute décision médicale.' as const;

export type DiagnosticAgentRequest = {
  contractVersion: typeof DIAGNOSTIC_AGENT_CONTRACT_VERSION;
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

export type DiagnosticAgentSuggestion = {
  kind: 'SUMMARY' | 'STRUCTURE' | 'RISK' | 'DECISION_SUPPORT';
  label: string;
  rationale: string;
  urgency?: 'ROUTINE' | 'PRIORITY' | 'IMMEDIATE_REVIEW';
  confidence?: number;
};

export type DiagnosticAgentResponse = {
  contractVersion: typeof DIAGNOSTIC_AGENT_CONTRACT_VERSION;
  requestId: string;
  generatedAt: string;
  provider: { name: string; model?: string; version?: string };
  disclaimer: typeof DIAGNOSTIC_AGENT_DISCLAIMER;
  suggestions: DiagnosticAgentSuggestion[];
};

/** Provider implemented by a local engine or a remote accredited provider. */
export interface DiagnosticAgentProvider {
  structureEncounter(request: DiagnosticAgentRequest): Promise<DiagnosticAgentResponse>;
  summarizeEncounter(request: DiagnosticAgentRequest): Promise<DiagnosticAgentResponse>;
  detectRisks(request: DiagnosticAgentRequest): Promise<DiagnosticAgentResponse>;
}

/** Client used by Core. It has the same stable boundary as an external caller. */
export interface DiagnosticAgentClient {
  execute(request: DiagnosticAgentRequest): Promise<DiagnosticAgentResponse>;
}

/** Nest injection token, exported without coupling callers to an implementation. */
export const DIAGNOSTIC_AGENT_CLIENT = Symbol('aulia.diagnostic-agent.client.v1');
