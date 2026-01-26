import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { GetGroupSheetDto } from './dto/get-group-sheet.dto';
import { BulkUpdateAttendanceDto } from './dto/bulk-update-attendance.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { Role } from '@prisma/client';
import { GetUser } from 'src/auth/decorator/get-user.decorator';
import { GetGroupMonthSheetsDto } from './dto/get-group-month-sheets.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // mavjud endpoint (teacher-only)
  @Roles(Role.TEACHER)
  @Get('teacher/attendance/group/:groupId')
  async getGroupSheet(
    @GetUser('sub') userId: string,
    @Param('groupId') groupId: string,
    @Query() query: GetGroupSheetDto,
  ) {
    return this.attendanceService.getOrCreateGroupSheetForTeacher({
      teacherUserId: userId,
      groupId,
      dto: query,
    });
  }

  // mavjud endpoint (teacher-only)
  @Roles(Role.TEACHER)
  @Patch('teacher/attendance/sheet/:sheetId')
  async updateSheet(
    @GetUser('sub') userId: string,
    @Param('sheetId') sheetId: string,
    @Body() body: BulkUpdateAttendanceDto,
  ) {
    return this.attendanceService.bulkUpdateSheetForTeacher({
      teacherUserId: userId,
      sheetId,
      dto: body,
    });
  }

  // YANGI: oy bo‘yicha barcha jadval (teacher + admin)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('attendance/group/:groupId/month')
  async getAllSheetsForMonth(
    @GetUser('sub') userId: string,
    @GetUser('role') role: Role,
    @Param('groupId') groupId: string,
    @Query() query: GetGroupMonthSheetsDto,
  ) {
    return this.attendanceService.getGroupMonthSheets({
      requesterUserId: userId,
      requesterRole: role,
      groupId,
      dto: query,
    });
  }
}
