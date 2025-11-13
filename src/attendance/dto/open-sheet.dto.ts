import { IsDateString, IsOptional, IsString } from 'class-validator';

export class OpenSheetDto {
  @IsString() groupId: string;
  @IsDateString() date: string; // "2025-11-12"
  @IsOptional() @IsString() teacherAssignId?: string; // xohlasang biriktirasan
  @IsOptional() @IsString() note?: string;
}
