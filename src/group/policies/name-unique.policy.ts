import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export async function assertActiveNameUnique(
  prisma: PrismaClient,
  name: string,
  excludeId?: string,
) {
  const found = await prisma.group.findFirst({
    where: { name: name.trim(), isActive: true },
    select: { id: true },
  });
  if (found && found.id !== excludeId) {
    throw new ConflictException('Bu nomdagi faol guruh allaqachon mavjud');
  }
}
