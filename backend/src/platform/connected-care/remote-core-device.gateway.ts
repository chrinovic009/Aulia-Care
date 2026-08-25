import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeviceGatewayPort, DeviceIngestionResult, DeviceObservation } from '../contracts/connected-care.contract';

/**
 * Connected Care → Core HTTP adapter.  It has no Core import and Core repeats
 * tenant, device, consent and idempotence checks; the gateway is not trusted.
 */
@Injectable()
export class RemoteCoreDeviceGateway implements DeviceGatewayPort {
  constructor(private readonly config: ConfigService) {}

  async ingest(observation: DeviceObservation): Promise<DeviceIngestionResult> {
    const coreUrl = this.config.get<string>('AULIA_CORE_CONNECTED_CARE_URL')?.trim();
    const secret = this.config.get<string>('CONNECTED_CARE_INGESTION_SECRET');
    if (!coreUrl || !secret) throw new ServiceUnavailableException('Le lien sécurisé vers Aulia Care Core n’est pas configuré.');
    let response: Response;
    try {
      response = await fetch(`${coreUrl.replace(/\/$/, '')}/connected-care/v1/observations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-aulia-integration-key': secret },
        body: JSON.stringify(observation),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ServiceUnavailableException('Aulia Care Core est momentanément inaccessible.');
    }
    if (!response.ok) throw new ServiceUnavailableException('Aulia Care Core a refusé l’observation.');
    return response.json() as Promise<DeviceIngestionResult>;
  }
}
