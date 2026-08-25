/** Versioned boundary for Aulia Connected Care. */
export const CONNECTED_CARE_CONTRACT_VERSION = '1.0';

export type ConnectedPurpose = 'WEARABLES' | 'TELEHEALTH' | 'MESSAGING' | 'LOCATION';

export type ConnectedSubject = {
  tenantId: string;
  externalPatientId: string;
  consentId: string;
};

export type DeviceObservation = {
  contractVersion: typeof CONNECTED_CARE_CONTRACT_VERSION;
  idempotencyKey: string;
  subject: ConnectedSubject;
  deviceExternalId: string;
  source: string;
  metric: string;
  value: number;
  unit: string;
  measuredAt: string;
  receivedAt: string;
  quality: 'GOOD' | 'SUSPECT' | 'INVALID' | 'UNKNOWN';
};

export type DeviceIngestionResult = {
  accepted: boolean;
  reason?: string;
  referenceId?: string;
};

export interface DeviceGatewayPort {
  ingest(observation: DeviceObservation): Promise<DeviceIngestionResult>;
}

export interface PatientDirectoryPort {
  resolveSubject(subject: ConnectedSubject): Promise<{ active: boolean; displayName?: string }>;
}

export interface ConsentPort {
  hasActiveConsent(subject: ConnectedSubject, purpose: ConnectedPurpose): Promise<boolean>;
}

export const CONNECTED_CARE_GATEWAY = Symbol('aulia.connected-care.gateway.v1');
