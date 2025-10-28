import {
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateTeacherDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsPhoneNumber('UZ') phone: string;
  @IsString() password: string;
  @IsOptional() @IsUrl() photoUrl?: string;
  @ValidateIf((o) => o.percentShare == null)
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlySalary?: number;

  @ValidateIf((o) => o.monthlySalary == null)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentShare?: number;
}
