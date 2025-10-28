import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ManagersService } from './managers.service';
import { CreateManagerDto } from './dto/create-manager.dto';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorator/roles.decorator';

@Controller('managers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagersController {
  constructor(private service: ManagersService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateManagerDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  list() {
    return this.service.list();
  }
}
