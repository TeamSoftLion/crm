import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  name: string;

  @IsInt()
  @IsPositive()
  @Min(1)
  capacity: number;

  @IsEnum(['ODD', 'EVEN'] as const)
  daysPattern: 'ODD' | 'EVEN';

  @Matches(/^\d{2}:\d{2}$/)
  startTime: string;

  @Matches(/^\d{2}:\d{2}$/)
  endTime: string;

  @IsInt()
  @Min(0)
  monthlyFee: number;

  @IsOptional()
  @IsString()
  roomId?: string;
}
