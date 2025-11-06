import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GroupService } from './group.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorator/roles.decorator';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GroupController {
  constructor(private service: GroupService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateGroupDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TEACHER)
  list() {
    return this.service.list();
  }

  @Patch(':id/schedule')
  @Roles(Role.ADMIN, Role.MANAGER)
  replaceSchedule(
    @Param('id') id: string,
    @Body()
    body: {
      mode: 'ODD' | 'EVEN' | 'CUSTOM';
      startTime: string;
      endTime: string;
      days?: any[];
    },
  ) {
    return this.service.replaceSchedule(id, body as any);
  }
}
