import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NavigationBadgesService } from './navigation-badges.service';

@UseGuards(JwtAuthGuard)
@Controller('navigation')
export class NavigationController {
  constructor(private readonly badges: NavigationBadgesService) {}

  /** Counters of the connected person's menu tabs. */
  @Get('badges')
  get(@Request() req: { user?: { userId?: string } }) {
    return this.badges.badges(req.user);
  }
}
