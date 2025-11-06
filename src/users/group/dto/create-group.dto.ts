import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GroupScheduleInput } from './schedule.dto';

export class CreateGroupDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  roomId?: string;
  @IsInt()
  @Min(1)
  capacity: number;

  @ValidateNested()
  @Type(() => GroupScheduleInput)
  schedule: GroupScheduleInput; // majburiy: dars vaqti
}
