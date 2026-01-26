import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetGroupMonthSheetsDto {
  // format: "2026-01"
  @IsString()
  month: string;

  // ixtiyoriy: faqat lesson filtri (agar lessonli sheetlar bo‘lsa)
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  lesson?: number;
}
