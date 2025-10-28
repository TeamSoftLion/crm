import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService) {}

  async create(dto: { name: string; roomId?: string }) {
    if (dto.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: dto.roomId, isActive: true },
      });
      if (!room) throw new NotFoundException('Room not found or inactive');
    }
    return this.prisma.group.create({
      data: { name: dto.name, roomId: dto.roomId ?? null },
      include: { room: true },
    });
  }

  list() {
    return this.prisma.group.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { room: true },
    });
  }

  async update(id: string, dto: { name?: string; roomId?: string | null }) {
    if (dto.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: dto.roomId, isActive: true },
      });
      if (!room) throw new NotFoundException('Room not found or inactive');
    }
    return this.prisma.group.update({
      where: { id },
      data: {
        name: dto.name,
        roomId: dto.roomId === undefined ? undefined : dto.roomId,
      },
      include: { room: true },
    });
  }

  async deactivate(id: string) {
    const exists = await this.prisma.group.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Group not found');
    await this.prisma.group.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }
  async assignRoom(groupId: string, roomId: string) {
    const [group, room] = await Promise.all([
      this.prisma.group.findUnique({ where: { id: groupId, isActive: true } }),
      this.prisma.room.findUnique({ where: { id: roomId, isActive: true } }),
    ]);
    if (!group) throw new NotFoundException('Group not found or inactive');
    if (!room) throw new NotFoundException('Room not found or inactive');

    return this.prisma.group.update({
      where: { id: groupId },
      data: { roomId },
      include: { room: true },
    });
  }

  async unassignRoom(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Group not found');
    return this.prisma.group.update({
      where: { id: groupId },
      data: { roomId: null },
    });
  }
}
