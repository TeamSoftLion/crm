import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateRoomDto) {
    const exists = await this.prisma.room.findUnique({
      where: { name: dto.name.trim() },
    });
    if (exists)
      throw new ConflictException('Bu nomdagi hona allaqachon mavjud');

    if (dto.capacity < 1)
      throw new BadRequestException('Hona sig`imi 1 dan katta bo`lishi kerak');

    return this.prisma.room.create({
      data: {
        name: dto.name.trim(),
        capacity: dto.capacity,
      },
    });
  }

  async getAll() {
    return await this.prisma.room.findMany({
      select: {
        name: true,
        capacity: true,
      },
    });
  }

  async getOne(id: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Hona topilmadi');
    return room;
  }

  async update(id: string, dto: UpdateRoomDto) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Hona topilmadi');

    if (dto.name) {
      const exists = await this.prisma.room.findUnique({
        where: { name: dto.name.trim() },
      });
      if (exists && exists.id !== id)
        throw new ConflictException('Bu nom band');
    }

    if (dto.capacity !== undefined && dto.capacity < 1) {
      throw new BadRequestException('Hona sig`imi 1 dan katta bo`lishi kerak');
    }

    return this.prisma.room.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        capacity: dto.capacity ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async remove(id: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Hona topilmadi');

    return this.prisma.room.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
