import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  findAll() {
    return this.paymentsService.findAll();
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  create(@Body() createPaymentDto: CreatePaymentDto, @Request() req: any) {
    return this.paymentsService.createPayment(createPaymentDto, req.user?.userId);
  }
}
