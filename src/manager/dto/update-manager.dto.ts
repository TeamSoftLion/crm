import {
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class UpdateManagerDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsPhoneNumber('UZ') phone?: string;
  @IsOptional() @IsString() password?: string;

  @IsOptional() @IsUrl() photoUrl?: string;
  @IsOptional() @IsNumber() @Min(0) monthlySalary?: number;
}
