import { CLINICAL_AI_CONTRACT_VERSION, ClinicalAIRequest } from './clinical-ai.contract';
import { CONNECTED_CARE_CONTRACT_VERSION, DeviceObservation } from './connected-care.contract';

const nonEmpty = (value: unknown, maximum = 10_000) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const isoDate = (value: unknown) =>
  typeof value === 'string' && nonEmpty(value, 64) && !Number.isNaN(new Date(value).getTime());

/** Runtime validation is required because TypeScript interfaces disappear at HTTP boundaries. */
export function isClinicalAIRequest(value: unknown): value is ClinicalAIRequest {
  const request = value as ClinicalAIRequest | undefined;
  return Boolean(
    request
    && request.contractVersion === CLINICAL_AI_CONTRACT_VERSION
    && nonEmpty(request.tenantId, 200)
    && nonEmpty(request.requestId, 200)
    && nonEmpty(request.idempotencyKey, 500)
    && ['STRUCTURE_ENCOUNTER', 'SUMMARIZE_ENCOUNTER', 'DETECT_RISKS'].includes(request.purpose)
    && request.subject && typeof request.subject === 'object'
    && request.encounter && typeof request.encounter === 'object'
    && nonEmpty(request.encounter.language, 20)
    && (!request.encounter.transcript || typeof request.encounter.transcript === 'string')
    && (!request.encounter.clinicalText || typeof request.encounter.clinicalText === 'string')
    && (!request.observations || (Array.isArray(request.observations) && request.observations.length <= 100))
    && (!request.allergies || (Array.isArray(request.allergies) && request.allergies.length <= 100)),
  );
}

export function isDeviceObservation(value: unknown): value is DeviceObservation {
  const observation = value as DeviceObservation | undefined;
  return Boolean(
    observation
    && observation.contractVersion === CONNECTED_CARE_CONTRACT_VERSION
    && nonEmpty(observation.idempotencyKey, 500)
    && observation.subject
    && nonEmpty(observation.subject.tenantId, 200)
    && nonEmpty(observation.subject.externalPatientId, 200)
    && nonEmpty(observation.subject.consentId, 200)
    && nonEmpty(observation.deviceExternalId, 500)
    && nonEmpty(observation.source, 200)
    && nonEmpty(observation.metric, 100)
    && Number.isFinite(Number(observation.value))
    && nonEmpty(observation.unit, 100)
    && isoDate(observation.measuredAt)
    && isoDate(observation.receivedAt)
    && ['GOOD', 'SUSPECT', 'INVALID', 'UNKNOWN'].includes(observation.quality),
  );
}
