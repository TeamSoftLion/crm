import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateTeachingAssignmentDto {
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;

  @IsOptional()
  @IsEnum(['LEAD', 'ASSISTANT', 'SUBSTITUTE'] as const)
  role?: 'LEAD' | 'ASSISTANT' | 'SUBSTITUTE';

  @IsOptional() @IsBoolean() inheritSchedule?: boolean;

  @IsOptional()
  @IsEnum(['ODD', 'EVEN'] as const)
  daysPatternOverride?: 'ODD' | 'EVEN';

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  startTimeOverride?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  endTimeOverride?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  deactivateReason?: string;
}
