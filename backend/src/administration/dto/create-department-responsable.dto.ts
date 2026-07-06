import { IsNotEmpty, IsBoolean } from 'class-validator';

export class CreateDepartmentResponsableDto {
  @IsNotEmpty()
  departmentId: string;

  @IsNotEmpty()
  userId: string;

  @IsBoolean()
  principal: boolean;

  active?: boolean;
}
