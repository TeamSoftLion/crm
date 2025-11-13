import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTeachingAssignmentDto } from './dto/create-teaching-assignment.dto';
import { UpdateTeachingAssignmentDto } from './dto/update-teaching-assignment.dto';
import { QueryTeachingAssignmentDto } from './dto/query-teaching-assignment.dto';
import {
  assertGroupExists,
  assertLeadUniqueInsideGroup,
  assertNoTeacherScheduleConflict,
  assertTeacherExists,
  resolveEffectiveSchedule,
} from './policies/ta.policies';
import { PrismaService } from 'prisma/prisma.service';
import { minutesToHhmm } from 'src/common/utils/time.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class TeachingAssignmentsService {
  constructor(private prisma: PrismaService) {}

  private toView(row: any) {
    const eff = row.inheritSchedule
      ? {
          daysPattern: row.group.daysPattern,
          startMinutes: row.group.startMinutes,
          endMinutes: row.group.endMinutes,
        }
      : {
          daysPattern: row.daysPatternOverride,
          startMinutes: row.startMinutesOverride,
          endMinutes: row.endMinutesOverride,
        };

    return {
      id: row.id,
      teacherId: row.teacherId,
      groupId: row.groupId,
      role: row.role,
      period: { fromDate: row.fromDate, toDate: row.toDate ?? null },
      schedule: {
        daysPattern: eff.daysPattern,
        startTime: minutesToHhmm(eff.startMinutes),
        endTime: minutesToHhmm(eff.endMinutes),
        inherit: row.inheritSchedule,
      },
      isActive: row.isActive,
      note: row.note ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(dto: CreateTeachingAssignmentDto) {
    try {
      await assertTeacherExists(this.prisma, dto.teacherId);
      await assertGroupExists(this.prisma, dto.groupId);

      const group = await this.prisma.group.findUnique({
        where: { id: dto.groupId },
        select: { daysPattern: true, startMinutes: true, endMinutes: true },
      });

      const eff = resolveEffectiveSchedule(dto.inheritSchedule, group!, {
        daysPatternOverride: dto.daysPatternOverride as any,
        startTimeOverride: dto.startTimeOverride,
        endTimeOverride: dto.endTimeOverride,
      });

      const from = new Date(dto.fromDate);
      const to = dto.toDate ? new Date(dto.toDate) : null;
      if (to && from > to)
        throw new BadRequestException('fromDate ≤ toDate bo‘lishi kerak');

      await assertNoTeacherScheduleConflict(
        this.prisma,
        dto.teacherId,
        eff as any,
        { from, to },
      );
      await assertLeadUniqueInsideGroup(
        this.prisma,
        dto.groupId,
        dto.role as any,
        eff as any,
        { from, to },
      );

      const created = await this.prisma.teachingAssignment.create({
        data: {
          teacherId: dto.teacherId,
          groupId: dto.groupId,
          fromDate: from,
          toDate: to ?? undefined,
          role: dto.role as any,
          inheritSchedule: dto.inheritSchedule,
          daysPatternOverride: dto.inheritSchedule
            ? undefined
            : (dto.daysPatternOverride as any),
          startMinutesOverride: dto.inheritSchedule
            ? undefined
            : eff.startMinutes,
          endMinutesOverride: dto.inheritSchedule ? undefined : eff.endMinutes,
          note: dto.note,
        },
        include: { group: true },
      });

      return this.toView(created);
    } catch (e: any) {
      // Prisma xatolarini odamga tushunarli qilib qaytaramiz
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2003') {
          // foreign key failed
          throw new BadRequestException(
            'teacherId yoki groupId noto‘g‘ri (FK xatosi)',
          );
        }
        if (e.code === 'P2025') {
          throw new NotFoundException('Yozuv topilmadi (P2025)');
        }
      }
      // vaqtinchalik debug uchun (keyin olib tashlashing mumkin)
      console.error('[TA create] error:', e);
      throw e; // Nest default filter 500 chiqaradi, lekin yuqorida ko‘p holatlarni ushladik
    }
  }

  async findAll(q: QueryTeachingAssignmentDto) {
    const {
      teacherId,
      groupId,
      role,
      isActive,
      from,
      to,
      page = 1,
      limit = 10,
    } = q;

    const where: any = {};
    if (teacherId) where.teacherId = teacherId;
    if (groupId) where.groupId = groupId;
    if (role) where.role = role;
    if (typeof isActive === 'boolean') where.isActive = isActive;

    if (from || to) {
      const fromD = from ? new Date(from) : new Date('1900-01-01');
      const toD = to ? new Date(to) : new Date(8640000000000000);
      where.AND = [
        { fromDate: { lte: toD } },
        { OR: [{ toDate: null }, { toDate: { gte: fromD } }] },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.teachingAssignment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { group: true },
      }),
      this.prisma.teachingAssignment.count({ where }),
    ]);

    return {
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      items: rows.map((r) => this.toView(r)),
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.teachingAssignment.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!row) throw new NotFoundException('TeachingAssignment topilmadi');
    return this.toView(row);
  }

  async update(id: string, dto: UpdateTeachingAssignmentDto) {
    const prev = await this.prisma.teachingAssignment.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!prev) throw new NotFoundException('TeachingAssignment topilmadi');

    const group = await this.prisma.group.findUnique({
      where: { id: prev.groupId },
      select: { daysPattern: true, startMinutes: true, endMinutes: true },
    });

    // period
    const from = dto.fromDate ? new Date(dto.fromDate) : prev.fromDate;
    const to =
      dto.toDate !== undefined
        ? dto.toDate
          ? new Date(dto.toDate)
          : null
        : (prev.toDate ?? null);
    if (to && from > to)
      throw new BadRequestException('fromDate ≤ toDate bo`lishi kerak');

    // schedule
    const inherit = dto.inheritSchedule ?? prev.inheritSchedule;
    const eff = resolveEffectiveSchedule(inherit, group!, {
      daysPatternOverride: (dto.daysPatternOverride ??
        prev.daysPatternOverride) as any,
      startTimeOverride:
        dto.startTimeOverride ??
        (prev.startMinutesOverride
          ? `${Math.floor(prev.startMinutesOverride / 60)}`.padStart(2, '0') +
            ':' +
            `${prev.startMinutesOverride % 60}`.padStart(2, '0')
          : undefined),
      endTimeOverride:
        dto.endTimeOverride ??
        (prev.endMinutesOverride
          ? `${Math.floor(prev.endMinutesOverride / 60)}`.padStart(2, '0') +
            ':' +
            `${prev.endMinutesOverride % 60}`.padStart(2, '0')
          : undefined),
    });

    // conflicts
    await assertNoTeacherScheduleConflict(
      this.prisma,
      prev.teacherId,
      eff as any,
      { from, to },
      prev.id,
    );
    await assertLeadUniqueInsideGroup(
      this.prisma,
      prev.groupId,
      (dto.role ?? prev.role) as any,
      eff as any,
      { from, to },
      prev.id,
    );

    const isActive = dto.isActive ?? prev.isActive;

    const updated = await this.prisma.teachingAssignment.update({
      where: { id },
      data: {
        fromDate: from,
        toDate: to ?? undefined,
        role: dto.role ?? prev.role,
        inheritSchedule: inherit,
        daysPatternOverride: inherit
          ? null
          : (dto.daysPatternOverride ?? prev.daysPatternOverride),
        startMinutesOverride: inherit ? null : eff.startMinutes,
        endMinutesOverride: inherit ? null : eff.endMinutes,
        note: dto.note ?? prev.note,
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
      include: { group: true },
    });

    return this.toView(updated);
  }

  async softDelete(id: string, reason?: string) {
    const prev = await this.prisma.teachingAssignment.findUnique({
      where: { id },
    });
    if (!prev) throw new NotFoundException('TeachingAssignment topilmadi');
    if (!prev.isActive) return this.findOne(id);

    const updated = await this.prisma.teachingAssignment.update({
      where: { id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivateReason: reason ?? null,
      },
      include: { group: true },
    });
    return this.toView(updated);
  }

  async restore(id: string) {
    const prev = await this.prisma.teachingAssignment.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!prev) throw new NotFoundException('TeachingAssignment topilmadi');

    // restore oldidan ham conflict check
    const group = await this.prisma.group.findUnique({
      where: { id: prev.groupId },
      select: { daysPattern: true, startMinutes: true, endMinutes: true },
    });
    const eff = prev.inheritSchedule
      ? {
          daysPattern: group!.daysPattern,
          startMinutes: group!.startMinutes,
          endMinutes: group!.endMinutes,
        }
      : {
          daysPattern: prev.daysPatternOverride!,
          startMinutes: prev.startMinutesOverride!,
          endMinutes: prev.endMinutesOverride!,
        };

    await assertNoTeacherScheduleConflict(
      this.prisma,
      prev.teacherId,
      eff as any,
      { from: prev.fromDate, to: prev.toDate ?? null },
      prev.id,
    );
    await assertLeadUniqueInsideGroup(
      this.prisma,
      prev.groupId,
      prev.role as any,
      eff as any,
      { from: prev.fromDate, to: prev.toDate ?? null },
      prev.id,
    );

    const updated = await this.prisma.teachingAssignment.update({
      where: { id },
      data: { isActive: true, deactivatedAt: null, deactivateReason: null },
      include: { group: true },
    });
    return this.toView(updated);
  }
}
