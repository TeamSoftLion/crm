import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateTeachingAssignmentDto {
  @IsString() teacherId: string;
  @IsString() groupId: string;

  @IsDateString() fromDate: string;
  @IsOptional() @IsDateString() toDate?: string;

  @IsEnum(['LEAD', 'ASSISTANT', 'SUBSTITUTE'] as const)
  role: 'LEAD' | 'ASSISTANT' | 'SUBSTITUTE' = 'LEAD';

  @IsBoolean() inheritSchedule: boolean = true;
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
}
