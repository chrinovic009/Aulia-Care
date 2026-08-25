import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { DeviceObservation } from '../contracts/connected-care.contract';
import { isDeviceObservation } from '../contracts/contract-validation';
import { ConnectedCareServiceGuard } from './connected-care-service.guard';
import { RemoteCoreDeviceGateway } from './remote-core-device.gateway';

/** Independently deployable Connected Care ingress. */
@Controller('api/v1/connected-care')
@UseGuards(ConnectedCareServiceGuard)
export class ConnectedCareStandaloneController {
  constructor(private readonly core: RemoteCoreDeviceGateway) {}

  @Post('observations')
  ingest(@Body() observation: DeviceObservation) {
    if (!isDeviceObservation(observation)) throw new BadRequestException('Contrat Connected Care invalide ou non compatible.');
    return this.core.ingest(observation);
  }
}
