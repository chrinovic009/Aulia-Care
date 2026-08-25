import {
  CONNECTED_CARE_CONTRACT_VERSION,
  ConnectedPurpose,
  ConsentPort,
  DeviceGatewayPort,
  DeviceIngestionResult,
  DeviceObservation,
  PatientDirectoryPort,
} from '../contracts/connected-care.contract';

/**
 * Portable Connected Care application service. It is usable in a separate
 * process because it only depends on ports supplied by its host.
 */
export class ConnectedCareRuntime {
  constructor(
    private readonly directory: PatientDirectoryPort,
    private readonly consent: ConsentPort,
    private readonly gateway: DeviceGatewayPort,
  ) {}

  async receiveObservation(observation: DeviceObservation): Promise<DeviceIngestionResult> {
    if (observation.contractVersion !== CONNECTED_CARE_CONTRACT_VERSION) {
      return { accepted: false, reason: 'Unsupported Connected Care contract version.' };
    }
    if (!observation.idempotencyKey || !observation.deviceExternalId || !observation.subject?.tenantId) {
      return { accepted: false, reason: 'Incomplete authorised observation.' };
    }
    const subject = await this.directory.resolveSubject(observation.subject);
    if (!subject.active) return { accepted: false, reason: 'Unknown or inactive subject.' };
    const consented = await this.consent.hasActiveConsent(observation.subject, 'WEARABLES' as ConnectedPurpose);
    if (!consented) return { accepted: false, reason: 'No active wearable consent.' };
    return this.gateway.ingest(observation);
  }
}
