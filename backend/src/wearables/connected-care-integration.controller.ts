import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { DeviceObservation } from '../platform/contracts/connected-care.contract';
import { isDeviceObservation } from '../platform/contracts/contract-validation';
import { ConnectedCareIntegrationGuard } from './connected-care-integration.guard';
import { CoreConnectedCareService } from './core-connected-care.service';

/** Versioned, server-to-server boundary used by an independently deployed gateway. */
@Controller('connected-care/v1')
@UseGuards(ConnectedCareIntegrationGuard)
export class ConnectedCareIntegrationController {
  constructor(private readonly connectedCare: CoreConnectedCareService) {}

  @Post('observations')
  async ingestObservation(@Body() observation: DeviceObservation) {
    if (!isDeviceObservation(observation)) throw new BadRequestException('Contrat Connected Care invalide ou non compatible.');
    const subject = await this.connectedCare.resolveSubject(observation.subject);
    if (!subject.active) return { accepted: false, reason: 'Unknown or inactive subject.' };
    const consented = await this.connectedCare.hasActiveConsent(observation.subject, 'WEARABLES');
    if (!consented) return { accepted: false, reason: 'No active wearable consent.' };
    return this.connectedCare.ingest(observation);
  }
}
