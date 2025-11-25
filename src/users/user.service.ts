import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  setRefreshToken(userId: string, hash: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
      select: { id: true },
    });
  }

  toPublic(u: any) {
    if (!u) return null;
    const { passwordHash, refreshTokenHash, ...rest } = u;
    return rest;
  }

  async changePassword(userId: string, oldPass: string, newPass: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const ok = await argon2.verify(user.passwordHash, oldPass);
    if (!ok) throw new ForbiddenException('Old password is incorrect');
    if (oldPass === newPass)
      throw new ForbiddenException('New password must be different');

    const newHash = await argon2.hash(newPass);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, refreshTokenHash: null }, // revoke refresh
    });

    return { success: true };
  }
}
