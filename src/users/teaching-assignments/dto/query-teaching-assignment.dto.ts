import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  Min,
} from 'class-validator';

export class QueryTeachingAssignmentDto {
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() groupId?: string;

  @IsOptional()
  @IsEnum(['LEAD', 'ASSISTANT', 'SUBSTITUTE'] as const)
  role?: 'LEAD' | 'ASSISTANT' | 'SUBSTITUTE';

  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional() @IsDateString() from?: string; // davr filtri (start)
  @IsOptional() @IsDateString() to?: string; // davr filtri (end)

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
