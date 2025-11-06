import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { DayOfWeek } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService) {}

  private toMinutes(t: string) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  private buildDays(
    mode: 'ODD' | 'EVEN' | 'CUSTOM',
    days?: DayOfWeek[],
  ): DayOfWeek[] {
    if (mode === 'ODD') return [DayOfWeek.MON, DayOfWeek.WED, DayOfWeek.FRI];
    if (mode === 'EVEN') return [DayOfWeek.TUE, DayOfWeek.THU, DayOfWeek.SAT];
    if (!days || days.length === 0) {
      throw new BadRequestException('For CUSTOM schedule, "days" is required');
    }
    return days;
  }

  async create(dto: CreateGroupDto) {
    const s = this.toMinutes(dto.schedule.startTime);
    const e = this.toMinutes(dto.schedule.endTime);
    if (s >= e)
      throw new BadRequestException('startTime must be before endTime');

    if (dto.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: dto.roomId },
      });
      if (!room || !room.isActive) {
        throw new NotFoundException('Room not found or inactive');
      }
    }

    const days = this.buildDays(dto.schedule.mode, dto.schedule.days);

    try {
      console.log('CREATE GROUP DTO →', JSON.stringify(dto));
      return await this.prisma.$transaction(async (tx) => {
        const group = await tx.group.create({
          data: {
            name: dto.name,
            roomId: dto.roomId ?? null,
            capacity: dto.capacity,
          },
          include: {
            room: { select: { id: true, name: true } },
          },
        });

        if (days.length) {
          await tx.groupSchedule.createMany({
            data: days.map((d) => ({
              groupId: group.id,
              day: d,
              startTime: dto.schedule.startTime,
              endTime: dto.schedule.endTime,
            })),
            skipDuplicates: true,
          });
        }

        const full = await tx.group.findUnique({
          where: { id: group.id },
          include: {
            room: { select: { id: true, name: true } },
            schedule: {
              select: { day: true, startTime: true, endTime: true },
              orderBy: { day: 'asc' },
            },
            _count: { select: { students: true } },
          },
        });
        const current = full!._count.students;
        const remaining = Math.max((full!.capacity ?? 0) - current, 0);
        const isFull = current >= (full!.capacity ?? 0);

        const { _count, ...rest } = full!;
        return {
          ...rest,
          stats: { capacity: rest.capacity, current, remaining, isFull },
        };
      });
    } catch (e: any) {
      console.error('❌ Group create error (raw):', e); // to‘liq obyekt
      console.error('❌ message:', e?.message);
      console.error('❌ code:', e?.code); // P2002, P2003, ...
      console.error('❌ meta:', e?.meta);
      throw new InternalServerErrorException(
        e?.message || 'Group create failed',
      );
      console.error('Group create error:', e);
      throw new InternalServerErrorException(
        e.message ?? 'Group create failed',
      );
    }
  }

  list() {
    return this.prisma.group.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { id: true, name: true } },
        schedule: { select: { day: true, startTime: true, endTime: true } },
      },
    });
  }
  async update(id: string, dto: UpdateGroupDto) {
    if (dto.schedule?.startTime && dto.schedule?.endTime) {
      const s = this.toMinutes(dto.schedule.startTime);
      const e = this.toMinutes(dto.schedule.endTime);
      if (s >= e)
        throw new BadRequestException('startTime must be before endTime');
    }

    if (dto.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: dto.roomId },
      });
      if (!room || !room.isActive) {
        throw new NotFoundException('Room not found or inactive');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.group.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          roomId: dto.roomId === null ? null : (dto.roomId ?? undefined),
          capacity: dto.capacity ?? undefined,
        },
      });

      if (dto.schedule) {
        const days = this.buildDays(dto.schedule.mode, dto.schedule.days);
        await tx.groupSchedule.deleteMany({ where: { groupId: id } });

        if (days.length) {
          await tx.groupSchedule.createMany({
            data: days.map((d) => ({
              groupId: id,
              day: d,
              startTime: dto.schedule!.startTime,
              endTime: dto.schedule!.endTime,
            })),
            skipDuplicates: true,
          });
        }
      }

      const full = await tx.group.findUnique({
        where: { id },
        include: {
          room: { select: { id: true, name: true } },
          schedule: {
            select: { day: true, startTime: true, endTime: true },
            orderBy: { day: 'asc' },
          },
          _count: { select: { students: true } },
        },
      });
      if (!full) throw new NotFoundException('Group not found');

      const current = full._count.students;
      const remaining = Math.max((full.capacity ?? 0) - current, 0);
      const isFull = current >= (full.capacity ?? 0);
      const { _count, ...rest } = full;
      return {
        ...rest,
        stats: { capacity: rest.capacity, current, remaining, isFull },
      };
    });
  }

  async replaceSchedule(
    groupId: string,
    payload: {
      mode: 'ODD' | 'EVEN' | 'CUSTOM';
      startTime: string;
      endTime: string;
      days?: DayOfWeek[];
    },
  ) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId, isActive: true },
    });
    if (!group) throw new NotFoundException('Group not found');

    const s = this.toMinutes(payload.startTime);
    const e = this.toMinutes(payload.endTime);
    if (s >= e)
      throw new BadRequestException('startTime must be before endTime');

    const days = this.buildDays(payload.mode, payload.days);

    return this.prisma.$transaction(async (tx) => {
      await tx.groupSchedule.deleteMany({ where: { groupId } });
      if (days.length) {
        await tx.groupSchedule.createMany({
          data: days.map((day) => ({
            groupId,
            day,
            startTime: payload.startTime,
            endTime: payload.endTime,
          })),
        });
      }
      return tx.group.findUnique({
        where: { id: groupId },
        include: {
          schedule: { select: { day: true, startTime: true, endTime: true } },
        },
      });
    });
  }
  async remove(id: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.studentProfile.updateMany({
        where: { groupId: id },
        data: { groupId: null },
      });
      await tx.group.update({
        where: { id },
        data: { isActive: false },
      });
    });
    return { success: true };
  }
}
