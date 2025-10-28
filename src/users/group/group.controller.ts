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
import { UpdateGroupDto } from './dto/update-group.dto';
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

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateGroupDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(Role.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Post(':groupId/assign-room/:roomId')
  @Roles(Role.ADMIN, Role.MANAGER)
  assignRoom(
    @Param('groupId') groupId: string,
    @Param('roomId') roomId: string,
  ) {
    return this.service.assignRoom(groupId, roomId);
  }

  @Post(':groupId/unassign-room')
  @Roles(Role.ADMIN, Role.MANAGER)
  unassignRoom(@Param('groupId') groupId: string) {
    return this.service.unassignRoom(groupId);
  }
}
