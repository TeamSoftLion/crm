import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QuerySheetDto {
  @IsString() groupId: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
