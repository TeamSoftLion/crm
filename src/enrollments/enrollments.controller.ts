import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { QueryEnrollmentDto } from './dto/query-enrollment.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { Role } from '@prisma/client';

@Controller('enrollments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  /**
   * Yangi talabani guruhga qo'shish
   */
  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateEnrollmentDto) {
    return this.enrollmentsService.create(dto);
  }

  /**
   * ✅ YANGI ENDPOINT: Talabani guruhdan guruhga ko'chirish
   * POST /enrollments/transfer
   */
  @Post('transfer')
  @Roles(Role.ADMIN, Role.MANAGER)
  transfer(
    @Body()
    dto: {
      studentId: string;
      oldGroupId: string;
      newGroupId: string;
      transferDate: string;
    },
  ) {
    return this.enrollmentsService.transfer(dto);
  }

  /**
   * Barcha enrollmentlarni olish (Filtrlar bilan)
   */
  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  findAll(@Query() q: QueryEnrollmentDto) {
    return this.enrollmentsService.findAll(q);
  }

  /**
   * Bitta enrollment haqida to'liq ma'lumot
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  findOne(@Param('id') id: string) {
    return this.enrollmentsService.findOne(id);
  }

  /**
   * Enrollment statusini yangilash (ACTIVE, LEFT, PAUSED)
   */
  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateEnrollmentDto) {
    return this.enrollmentsService.update(id, dto);
  }

  /**
   * Enrollmentni o'chirish
   */
  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.enrollmentsService.remove(id);
  }
}
