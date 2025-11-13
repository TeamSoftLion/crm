import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export async function assertGroupCapacityLTEToRoom(
  prisma: PrismaClient,
  roomId: string,
  capacity: number,
) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { capacity: true },
  });
  if (!room) throw new BadRequestException('Xona topilmadi');
  if (capacity > room.capacity) {
    throw new BadRequestException(
      `Guruh sig'imi xona sig'imidan oshmasligi kerak (max ${room.capacity})`,
    );
  }
}
