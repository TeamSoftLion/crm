import {
  IsInt,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsInt()
  @IsPositive()
  @Min(1)
  capacity: number;
}
