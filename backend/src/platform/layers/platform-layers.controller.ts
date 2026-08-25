import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { UpdatePlatformLayersDto } from './dto/update-platform-layers.dto';
import { PlatformLayersService } from './platform-layers.service';

@Controller('platform/layers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlatformLayersController {
  constructor(private readonly layers: PlatformLayersService) {}

  @Get()
  get() {
    return this.layers.getSnapshot();
  }

  @Put()
  @Roles('DEV')
  update(@Body() dto: UpdatePlatformLayersDto, @CurrentUser() actor: any) {
    return this.layers.update(dto.layers, actor);
  }
}
