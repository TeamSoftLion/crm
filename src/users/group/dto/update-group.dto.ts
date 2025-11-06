import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GroupScheduleInput } from './schedule.dto';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  roomId?: string | null;
  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => GroupScheduleInput)
  schedule?: GroupScheduleInput;
}
