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

export async function assertPhoneUniqueIfProvided(
  prisma: PrismaClient,
  phone?: string,
  excludeUserId?: string,
) {
  if (!phone) return;
  const found = await prisma.user.findUnique({ where: { phone } });
  if (found && found.id !== excludeUserId)
    throw new ConflictException('Bu telefon raqam band');
}
export function assertPaySchemeXor(
  dto: { monthlySalary?: string | null; percentShare?: string | null },
  opts: { requireOne: boolean } = { requireOne: true },
) {
  const hasSalary =
    dto.monthlySalary !== undefined &&
    dto.monthlySalary !== null &&
    `${dto.monthlySalary}` !== '';
  const hasPercent =
    dto.percentShare !== undefined &&
    dto.percentShare !== null &&
    `${dto.percentShare}` !== '';

  if (hasSalary && hasPercent) {
    throw new BadRequestException(
      'Yoki monthlySalary, yoki percentShare — ikkalasi birga bo`lishi mumkin emas.',
    );
  }
  if (opts.requireOne && !hasSalary && !hasPercent) {
    throw new BadRequestException(
      'To`lov sxemasini tanlang: monthlySalary yoki percentShare dan bittasi shart.',
    );
  }
}

export function normalizePhone(phone?: string) {
  if (!phone) return phone;
  return phone.replace(/\s+/g, '');
}

export function ensureCreateVariantValid(dto: any) {
  const hasUserId = !!dto.userId;
  const hasNewUser = dto.firstName && dto.lastName && dto.phone && dto.password;
  if (!hasUserId && !hasNewUser) {
    throw new BadRequestException(
      'Yaratish uchun userId yoki (firstName, lastName, phone, password) kerak',
    );
  }
}

export function assertPercentRange(percent?: string) {
  if (!percent) return;
  const val = parseFloat(percent);
  if (isNaN(val) || val < 0 || val > 100) {
    throw new BadRequestException(
      'percentShare 0..100 oralig`ida bo`lishi kerak',
    );
  }
}
