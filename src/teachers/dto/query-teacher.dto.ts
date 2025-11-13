import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsOptional,
  IsString,
  IsInt,
  Min,
} from 'class-validator';

export class QueryTeacherDto {
  @IsOptional()
  @IsString()
  search?: string; // ism/fam/telefon

  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;
}
