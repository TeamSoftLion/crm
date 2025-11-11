import {
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  IsNumberString,
  Matches,
} from 'class-validator';

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsNumberString()
  monthlySalary?: string;

  @IsOptional()
  @Matches(/^\d{1,3}(\.\d{1,2})?$/)
  percentShare?: string;
}
