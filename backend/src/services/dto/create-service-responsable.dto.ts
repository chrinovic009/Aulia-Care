import { IsNotEmpty, IsBoolean } from 'class-validator';

export class CreateServiceResponsableDto {
  @IsNotEmpty()
  serviceId: string;

  @IsNotEmpty()
  userId: string;

  @IsBoolean()
  principal: boolean;

  active?: boolean;
}
