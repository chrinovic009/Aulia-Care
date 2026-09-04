import { Body, Controller, Get, Param, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ConfigureClinicLayersDto } from './dto/configure-clinic-layers.dto';
import { CreateProvisionedClinicDto } from './dto/create-provisioned-clinic.dto';
import { CreateProvisionedSuperAdminDto } from './dto/create-provisioned-super-admin.dto';
import { UpdateProvisionedClinicDto } from './dto/update-provisioned-clinic.dto';
import { PlatformProvisioningService } from './platform-provisioning.service';

/** Platform-only provisioning.  No client-provided clinic id is ever accepted
 * when a hospital user is created; the id comes from this controlled route. */
@Controller('platform/provisioning')
// PlatformProvisioningService resolves the actor from the database and
// enforces the DEV-without-clinic invariant. Keeping that single check avoids
// a stale JWT role producing Nest's generic “Forbidden resource” response.
@UseGuards(JwtAuthGuard)
export class PlatformProvisioningController {
  constructor(private readonly provisioning: PlatformProvisioningService) {}

  @Post('clinics')
  createClinic(@Request() req: { user?: { userId?: string } }, @Body() dto: CreateProvisionedClinicDto) {
    return this.provisioning.createClinic(req.user?.userId, dto);
  }

  @Get('clinics')
  listClinics(@Request() req: { user?: { userId?: string } }) {
    return this.provisioning.listClinics(req.user?.userId);
  }

  @Get('clinics/:clinicId')
  getClinic(@Request() req: { user?: { userId?: string } }, @Param('clinicId') clinicId: string) {
    return this.provisioning.getClinic(req.user?.userId, clinicId);
  }

  @Patch('clinics/:clinicId')
  updateClinic(@Request() req: { user?: { userId?: string } }, @Param('clinicId') clinicId: string, @Body() dto: UpdateProvisionedClinicDto) {
    return this.provisioning.updateClinic(req.user?.userId, clinicId, dto);
  }

  @Put('clinics/:clinicId/layers')
  configureLayers(@Request() req: { user?: { userId?: string } }, @Param('clinicId') clinicId: string, @Body() dto: ConfigureClinicLayersDto) {
    return this.provisioning.configureLayers(req.user?.userId, clinicId, dto);
  }

  @Post('clinics/:clinicId/super-admin')
  createSuperAdmin(@Request() req: { user?: { userId?: string } }, @Param('clinicId') clinicId: string, @Body() dto: CreateProvisionedSuperAdminDto) {
    return this.provisioning.createSuperAdmin(req.user?.userId, clinicId, dto);
  }

  @Post('clinics/:clinicId/activate')
  activate(@Request() req: { user?: { userId?: string } }, @Param('clinicId') clinicId: string) {
    return this.provisioning.activateClinic(req.user?.userId, clinicId);
  }
}
