import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ManagersService } from './managers.service';
import { CreateManagerDto } from './dto/create-manager.dto';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { UpdateManagerDto } from './dto/update-manager.dto';

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
  @Patch(':userId')
  @Roles(Role.ADMIN)
  update(@Param('userId') userId: string, @Body() dto: UpdateManagerDto) {
    return this.service.update(userId, dto);
  }

  @Delete(':userId')
  @Roles(Role.ADMIN)
  remove(@Param('userId') userId: string) {
    return this.service.remove(userId);
  }
}
