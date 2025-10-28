import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: { name: string; capacity?: number }) {
    try {
      return await this.prisma.room.create({ data: dto });
    } catch (e: any) {
      if (e.code === 'P2002')
        throw new ConflictException('Room name already exists');
      throw e;
    }
  }

  listActive() {
    return this.prisma.room.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async update(
    id: string,
    dto: { name?: string; location?: string; capacity?: number },
  ) {
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Room not found');
    await this.prisma.room.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }
}
