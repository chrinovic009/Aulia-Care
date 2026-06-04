import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  findAll() {
    return this.servicesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.servicesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.servicesService.update(id, body);
  }

  @Post(':id/prices')
  addPrice(@Param('id') id: string, @Body() body: any) {
    return this.servicesService.addTarif({ ...body, serviceId: id });
  }

  @Post(':id/responsables')
  addResponsables(@Param('id') id: string, @Body() body: any) {
    const items = Array.isArray(body) ? body : [body];
    return this.servicesService.addResponsables(items.map((it) => ({ ...it, serviceId: id })));
  }
  @Post(':id/staff')
  addStaff(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const items = Array.isArray(body)
      ? body
      : [body];

    return this.servicesService.addStaff(
      items.map((it) => ({
        ...it,
        serviceId: id,
      })),
    );
  }
}
