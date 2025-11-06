import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ArrayNotEmpty,
  ArrayUnique,
} from 'class-validator';
import { DayOfWeek } from '@prisma/client';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class GroupScheduleInput {
  /**
   * mode:
   *  - ODD  -> MON,WED,FRI
   *  - EVEN -> TUE,THU,SAT
   *  - CUSTOM -> "days" majburiy
   */
  @IsEnum(['ODD', 'EVEN', 'CUSTOM'] as any)
  mode: 'ODD' | 'EVEN' | 'CUSTOM';

  @IsString()
  @Matches(HHMM)
  startTime: string;

  @IsString()
  @Matches(HHMM)
  endTime: string;

  @ValidateIf((o) => o.mode === 'CUSTOM')
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(DayOfWeek, { each: true })
  @IsOptional()
  days?: DayOfWeek[];
}
