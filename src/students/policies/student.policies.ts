import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';

export async function assertUserExists(prisma: PrismaClient, userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!u) throw new NotFoundException('User topilmadi');
}

export async function assertNoStudentProfileYet(
  prisma: PrismaClient,
  userId: string,
) {
  const sp = await prisma.studentProfile.findUnique({ where: { userId } });
  if (sp)
    throw new ConflictException(
      'Bu user uchun StudentProfile allaqachon yaratilgan',
    );
}

export async function assertPhoneUniqueIfProvided(
  prisma: PrismaClient,
  phone?: string,
  excludeUserId?: string,
) {
  if (!phone) return;
  const found = await prisma.user.findUnique({ where: { phone } });
  if (found && found.id !== excludeUserId) {
    throw new ConflictException(
      'Bu telefon raqam boshqa foydalanuvchida mavjud',
    );
  }
}

export function normalizePhone(phone?: string) {
  if (!phone) return phone;
  return phone.replace(/\s+/g, '');
}
