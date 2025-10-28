import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorator/roles.decorator';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(private service: StudentsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateStudentDto) {
    return this.service.create(dto);
  }

  @Post(':userId/assign-group/:groupId')
  @Roles(Role.ADMIN, Role.MANAGER)
  assignGroup(
    @Param('userId') userId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.service.assignToGroup(userId, groupId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TEACHER)
  list() {
    return this.service.list();
  }
}
