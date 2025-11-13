import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsInt, Min } from 'class-validator';

export class QueryGroupDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['ODD', 'EVEN'] as const)
  daysPattern?: 'ODD' | 'EVEN';

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  roomId?: string;

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
