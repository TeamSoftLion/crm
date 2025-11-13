import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { QueryGroupDto } from './dto/query-group.dto';
import { assertActiveNameUnique } from './policies/name-unique.policy';
import { assertGroupCapacityLTEToRoom } from './policies/capacity-vs-room.policy';
import { assertNoRoomScheduleConflict } from './policies/schedule-conflict.policy';
import { PrismaService } from 'prisma/prisma.service';
import { hhmmToMinutes, minutesToHhmm } from 'src/common/utils/time.util';
import { EnrollmentStatus } from '@prisma/client';

@Injectable()
export class GroupsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateGroupDto) {
    if (dto.monthlyFee < 0)
      throw new BadRequestException('monthlyFee manfiy bo‘lolmaydi');

    const startMinutes = hhmmToMinutes(dto.startTime);
    const endMinutes = hhmmToMinutes(dto.endTime);
    if (startMinutes >= endMinutes)
      throw new BadRequestException('startTime < endTime bo‘lishi kerak');

    await assertActiveNameUnique(this.prisma, dto.name);

    if (dto.roomId) {
      await assertGroupCapacityLTEToRoom(this.prisma, dto.roomId, dto.capacity);
      await assertNoRoomScheduleConflict(this.prisma, {
        roomId: dto.roomId,
        daysPattern: dto.daysPattern as any,
        startMinutes,
        endMinutes,
      });
    }

    const created = await this.prisma.group.create({
      data: {
        name: dto.name.trim(),
        capacity: dto.capacity,
        daysPattern: dto.daysPattern as any,
        startMinutes,
        endMinutes,
        monthlyFee: dto.monthlyFee,
        roomId: dto.roomId ?? null,
      },
    });

    return this.toView(created);
  }

  async findAll(q: QueryGroupDto) {
    const { search, daysPattern, isActive, roomId, page = 1, limit = 10 } = q;

    const where: any = {};
    if (typeof isActive === 'boolean') where.isActive = isActive;
    if (daysPattern) where.daysPattern = daysPattern;
    if (roomId) where.roomId = roomId;
    if (search?.trim()) {
      where.OR = [{ name: { contains: search.trim(), mode: 'insensitive' } }];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.group.count({ where }),
    ]);

    return {
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      items: items.map((g) => this.toView(g)),
    };
  }

  async findOne(id: string) {
    const g = await this.prisma.group.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('Guruh topilmadi');
    return this.toView(g);
  }
  async getStats(id: string) {
    const [group, activeCount] = await this.prisma.$transaction([
      this.prisma.group.findUnique({
        where: { id },
        select: { id: true, name: true, capacity: true, isActive: true },
      }),
      this.prisma.enrollment.count({
        where: { groupId: id, status: 'ACTIVE' as EnrollmentStatus },
      }),
    ]);

    if (!group) throw new NotFoundException('Guruh topilmadi');

    const remaining = Math.max(group.capacity - activeCount, 0);
    const isFull = activeCount >= group.capacity;

    return {
      group: {
        id: group.id,
        name: group.name,
        isActive: group.isActive,
        capacity: group.capacity,
      },
      activeEnrollments: activeCount,
      remaining,
      isFull,
    };
  }

  async update(id: string, dto: UpdateGroupDto) {
    const prev = await this.prisma.group.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('Guruh topilmadi');

    if (dto.name) {
      await assertActiveNameUnique(this.prisma, dto.name, id);
    }

    let startMinutes = prev.startMinutes;
    let endMinutes = prev.endMinutes;

    if (dto.startTime) startMinutes = hhmmToMinutes(dto.startTime);
    if (dto.endTime) endMinutes = hhmmToMinutes(dto.endTime);
    if (startMinutes >= endMinutes)
      throw new BadRequestException('startTime < endTime bo‘lishi kerak');

    const capacity = dto.capacity ?? prev.capacity;
    const roomId = dto.roomId ?? prev.roomId ?? undefined;
    const daysPattern = (dto.daysPattern ?? prev.daysPattern) as any;

    if (roomId) {
      await assertGroupCapacityLTEToRoom(this.prisma, roomId, capacity);
      await assertNoRoomScheduleConflict(this.prisma, {
        roomId,
        daysPattern,
        startMinutes,
        endMinutes,
        excludeId: id,
      });
    }

    const isActive = dto.isActive ?? prev.isActive;

    const updated = await this.prisma.group.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        capacity: dto.capacity,
        daysPattern: dto.daysPattern as any,
        startMinutes,
        endMinutes,
        monthlyFee: dto.monthlyFee,
        roomId: dto.roomId ?? (dto.roomId === null ? null : undefined),
        isActive,
        deactivatedAt:
          prev.isActive && isActive === false
            ? new Date()
            : isActive && prev.deactivatedAt
              ? null
              : undefined,
        deactivateReason:
          prev.isActive && isActive === false
            ? (dto.deactivateReason ?? null)
            : undefined,
      },
    });

    return this.toView(updated);
  }

  async softDelete(id: string, reason?: string) {
    const g = await this.prisma.group.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('Guruh topilmadi');
    if (!g.isActive) return this.toView(g);

    const updated = await this.prisma.group.update({
      where: { id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivateReason: reason ?? null,
      },
    });
    return this.toView(updated);
  }

  private toView(g: any) {
    return {
      id: g.id,
      name: g.name,
      capacity: g.capacity,
      daysPattern: g.daysPattern,
      startTime: minutesToHhmm(g.startMinutes),
      endTime: minutesToHhmm(g.endMinutes),
      monthlyFee: g.monthlyFee,
      isActive: g.isActive,
      roomId: g.roomId,
      deactivatedAt: g.deactivatedAt,
      deactivateReason: g.deactivateReason,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }
}
