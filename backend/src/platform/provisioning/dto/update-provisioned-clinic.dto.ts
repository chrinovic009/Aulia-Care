import { PartialType } from '@nestjs/mapped-types';
import { CreateProvisionedClinicDto } from './create-provisioned-clinic.dto';

export class UpdateProvisionedClinicDto extends PartialType(CreateProvisionedClinicDto) {}
