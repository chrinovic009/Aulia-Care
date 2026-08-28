import { BadRequestException, Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { UpdatePlatformLayersDto } from './dto/update-platform-layers.dto';
import { LayerActor, PlatformLayersService } from './platform-layers.service';

@Controller('platform/layers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlatformLayersController {
  constructor(private readonly layers: PlatformLayersService) {}

  @Get()
  get(@CurrentUser() actor: LayerActor) {
    return this.layers.getSnapshotForActor(actor);
  }

  @Put()
  @Roles('DEV')
  update(@Body() _dto: UpdatePlatformLayersDto, @CurrentUser() _actor: LayerActor) {
    throw new BadRequestException('Configurez les couches via le workflow DEV de provisioning de l’établissement.');
  }
}
