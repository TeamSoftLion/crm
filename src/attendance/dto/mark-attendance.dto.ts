import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MarkItemDto {
  @IsString() studentId: string;
  @IsEnum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const)
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  @IsOptional() @IsString() note?: string;
}

export class MarkAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkItemDto)
  items: MarkItemDto[];
  @IsOptional() lock?: boolean; // true bo‘lsa varaqni LOCKED qiladi
}
