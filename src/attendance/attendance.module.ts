import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TeacherAttendancePolicy } from './policies/teacher-attendance.policy';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, PrismaService, TeacherAttendancePolicy],
})
export class AttendanceModule {}
