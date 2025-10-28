import {
  IsDateString,
  IsOptional,
  IsPhoneNumber,
  IsString,
} from 'class-validator';

export class CreateStudentDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsPhoneNumber('UZ') phone: string;
  @IsString() password: string;

  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() groupId?: string; // istasak darhol biriktiramiz
}
