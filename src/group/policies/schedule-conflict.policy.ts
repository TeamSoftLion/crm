import { ConflictException } from '@nestjs/common';
import { PrismaClient, DaysPattern } from '@prisma/client';
import { overlaps } from 'src/common/utils/time.util';

export async function assertNoRoomScheduleConflict(
  prisma: PrismaClient,
  args: {
    roomId?: string;
    daysPattern: DaysPattern;
    startMinutes: number;
    endMinutes: number;
    excludeId?: string;
  },
) {
  const { roomId, daysPattern, startMinutes, endMinutes, excludeId } = args;

  if (!roomId) return;

  const conflicts = await prisma.group.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      isActive: true,
      roomId,
      daysPattern,
    },
    select: { id: true, startMinutes: true, endMinutes: true, name: true },
  });

  const hit = conflicts.find((c) =>
    overlaps(startMinutes, endMinutes, c.startMinutes, c.endMinutes),
  );
  if (hit) {
    throw new ConflictException(`Jadval to‘qnashuvi: xona band (${hit.name})`);
  }
}
