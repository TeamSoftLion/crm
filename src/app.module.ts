import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from './users/user.module';
import { TeachersModule } from './teachers/teachers.module';
import { ManagersModule } from './manager/managers.module';
import { RoomsModule } from './room/rooms.module';
import { GroupModule } from './group/group.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { StudentsModule } from './students/students.module';
import { TeachingAssignmentsModule } from './teaching-assignments/teaching-assignments.module';
import { AttendanceModule } from './attendance/attendance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    HealthModule,
    TeachersModule,
    StudentsModule,
    ManagersModule,
    RoomsModule,
    GroupModule,
    EnrollmentsModule,
    TeachingAssignmentsModule,
    AttendanceModule,
  ],
})
export class AppModule {}
