import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GovernanceService } from './governance.service';
import { ReferralDto, DecisionDto, DirectorGrantDto, PolicyDto } from './governance.dto';
@Controller('medical-governance') @UseGuards(JwtAuthGuard,RolesGuard)
export class GovernanceController {
 constructor(private readonly service:GovernanceService){}
 @Get('physicians') @Roles('PHYSICIAN','ADMIN','SUPER_ADMIN') physicians(@Request() r:any){return this.service.physicians(r.user.userId);}
 @Put('director') @Roles('ADMIN','SUPER_ADMIN') grant(@Request() r:any,@Body() d:DirectorGrantDto){return this.service.grant(r.user.userId,d);}
 @Get('policies') @Roles('MEDICAL_DIRECTOR') policies(@Request() r:any){return this.service.policies(r.user.userId);}
 @Put('policies') @Roles('MEDICAL_DIRECTOR') approve(@Request() r:any,@Body() d:PolicyDto){return this.service.approve(r.user.userId,d);}
 @Get('referrals') @Roles('PHYSICIAN') list(@Request() r:any){return this.service.list(r.user.userId);}
 @Post('referrals') @Roles('PHYSICIAN') create(@Request() r:any,@Body() d:ReferralDto){return this.service.create(r.user.userId,d);}
 @Get('referrals/:id/source') @Roles('PHYSICIAN') source(@Request() r:any,@Param('id') id:string){return this.service.source(r.user.userId,id);}
 @Post('referrals/:id/decision') @Roles('PHYSICIAN') decide(@Request() r:any,@Param('id') id:string,@Body() d:DecisionDto){return this.service.decide(r.user.userId,id,d);}
 @Post('referrals/:id/open') @Roles('PHYSICIAN') open(@Request() r:any,@Param('id') id:string){return this.service.open(r.user.userId,id);}
}
