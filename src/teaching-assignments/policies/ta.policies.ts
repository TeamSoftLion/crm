import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DaysPattern, PrismaClient, TeacherRole } from '@prisma/client';
import {
  FAR_FUTURE,
  hhmmToMinutes,
  timeOverlaps,
  dateRangesOverlap,
  safeToDate,
} from '../helpers/date-time.helpers';

export async function assertTeacherExists(
  prisma: PrismaClient,
  teacherId: string,
) {
  const t = await prisma.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { id: true },
  });
  if (!t) throw new NotFoundException('Teacher topilmadi');
}

export async function assertGroupExists(prisma: PrismaClient, groupId: string) {
  const g = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, isActive: true },
  });
  if (!g) throw new NotFoundException('Guruh topilmadi');
  if (!g.isActive)
    throw new BadRequestException('Guruh arxivda (isActive=false)');
}

export function resolveEffectiveSchedule(
  inheritSchedule: boolean,
  group: { daysPattern: DaysPattern; startMinutes: number; endMinutes: number },
  override?: {
    daysPatternOverride?: DaysPattern;
    startTimeOverride?: string;
    endTimeOverride?: string;
  },
): { daysPattern: DaysPattern; startMinutes: number; endMinutes: number } {
  if (inheritSchedule) {
    return {
      daysPattern: group.daysPattern,
      startMinutes: group.startMinutes,
      endMinutes: group.endMinutes,
    };
  }

  if (
    !override?.daysPatternOverride ||
    !override?.startTimeOverride ||
    !override?.endTimeOverride
  ) {
    throw new BadRequestException(
      'inheritSchedule=false bo`lsa, daysPatternOverride, startTimeOverride va endTimeOverride majburiy',
    );
  }

  const startMinutes = hhmmToMinutes(override.startTimeOverride);
  const endMinutes = hhmmToMinutes(override.endTimeOverride);
  if (startMinutes >= endMinutes)
    throw new BadRequestException(
      'startTimeOverride < endTimeOverride bo`lishi kerak',
    );

  return {
    daysPattern: override.daysPatternOverride,
    startMinutes,
    endMinutes,
  };
}

export async function assertNoTeacherScheduleConflict(
  prisma: PrismaClient,
  teacherId: string,
  eff: { daysPattern: DaysPattern; startMinutes: number; endMinutes: number },
  period: { from: Date; to: Date | null },
  excludeId?: string,
) {
  const candidates = await prisma.teachingAssignment.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      teacherId,
      isActive: true,
      AND: [
        { fromDate: { lte: period.to ?? FAR_FUTURE } },
        { OR: [{ toDate: null }, { toDate: { gte: period.from } }] },
      ],
    },
    include: {
      group: {
        select: { daysPattern: true, startMinutes: true, endMinutes: true },
      },
    },
  });

  const hit = candidates.find((c) => {
    const cEff = c.inheritSchedule
      ? {
          daysPattern: c.group.daysPattern,
          startMinutes: c.group.startMinutes,
          endMinutes: c.group.endMinutes,
        }
      : {
          daysPattern: c.daysPatternOverride!,
          startMinutes: c.startMinutesOverride!,
          endMinutes: c.endMinutesOverride!,
        };

    return (
      cEff.daysPattern === eff.daysPattern &&
      timeOverlaps(
        eff.startMinutes,
        eff.endMinutes,
        cEff.startMinutes,
        cEff.endMinutes,
      ) &&
      dateRangesOverlap(
        period.from,
        period.to ?? null,
        c.fromDate,
        c.toDate ?? null,
      )
    );
  });

  if (hit) {
    throw new ConflictException('O`qituvchi jadvali bilan to`qnashuv mavjud');
  }
}

export async function assertLeadUniqueInsideGroup(
  prisma: PrismaClient,
  groupId: string,
  role: TeacherRole,
  eff: { daysPattern: DaysPattern; startMinutes: number; endMinutes: number },
  period: { from: Date; to: Date | null },
  excludeId?: string,
) {
  if (role !== 'LEAD') return;

  const candidates = await prisma.teachingAssignment.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      groupId,
      isActive: true,
      role: 'LEAD',
      AND: [
        { fromDate: { lte: period.to ?? FAR_FUTURE } },
        { OR: [{ toDate: null }, { toDate: { gte: period.from } }] },
      ],
    },
    include: {
      group: {
        select: { daysPattern: true, startMinutes: true, endMinutes: true },
      },
    },
  });

  const hit = candidates.find((c) => {
    const cEff = c.inheritSchedule
      ? {
          daysPattern: c.group.daysPattern,
          startMinutes: c.group.startMinutes,
          endMinutes: c.group.endMinutes,
        }
      : {
          daysPattern: c.daysPatternOverride!,
          startMinutes: c.startMinutesOverride!,
          endMinutes: c.endMinutesOverride!,
        };

    return (
      cEff.daysPattern === eff.daysPattern &&
      timeOverlaps(
        eff.startMinutes,
        eff.endMinutes,
        cEff.startMinutes,
        cEff.endMinutes,
      ) &&
      dateRangesOverlap(
        period.from,
        period.to ?? null,
        c.fromDate,
        c.toDate ?? null,
      )
    );
  });

  if (hit) {
    throw new ConflictException('Bu guruhda shu vaqtda LEAD allaqachon mavjud');
  }
}

export function validateAndNormalizePeriod(
  fromDate: string | Date,
  toDate?: string | Date | null,
) {
  const from = safeToDate(fromDate)!;
  const to = safeToDate(toDate ?? null);
  if (to && from > to)
    throw new BadRequestException('fromDate ≤ toDate bo`lishi kerak');
  return { from, to };
}
