import {
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class CreateManagerDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsPhoneNumber('UZ') phone: string;
  @IsString() password: string;

  @IsOptional() @IsUrl() photoUrl?: string;
  @IsNumber() @Min(0) monthlySalary: number;
}
