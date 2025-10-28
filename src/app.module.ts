import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from 'prisma/prisma.module';
import { UsersModule } from './users/user.module';
import { TeachersModule } from './users/teachers/teachers.module';
import { StudentsModule } from './users/students/students.module';
import { ManagersModule } from './users/manager/managers.module';
import { RoomsModule } from './users/room/rooms.module';
import { GroupModule } from './users/group/group.module';

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
  ],
})
export class AppModule {}
