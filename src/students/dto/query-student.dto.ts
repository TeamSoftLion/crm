import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsOptional,
  IsString,
  IsInt,
  Min,
} from 'class-validator';

export class QueryStudentDto {
  @IsOptional()
  @IsString()
  search?: string; // ism/familiya/telefon bo‘yicha

  @IsOptional()
  @IsBooleanString()
  isActive?: string; // 'true' | 'false'

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
