import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma, Role } from '@prisma/client';
import { CreateManagerDto } from './dto/create-manager.dto';
import { PrismaService } from 'prisma/prisma.service';
import { UpdateManagerDto } from './dto/update-manager.dto';

@Injectable()
export class ManagersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateManagerDto) {
    const exists = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (exists) throw new ConflictException('Phone already used');

    const passwordHash = await argon2.hash(dto.password);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          passwordHash,
          role: Role.MANAGER,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
        },
      });

      await tx.managerProfile.create({
        data: {
          userId: user.id,
          photoUrl: dto.photoUrl,
          monthlySalary: dto.monthlySalary,
        },
        select: {
          photoUrl: true,
          monthlySalary: true,
        },
      });

      return user;
    });
  }

  list() {
    return this.prisma.user.findMany({
      where: { role: Role.MANAGER, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async update(userId: string, dto: UpdateManagerDto) {
    if (dto.phone) {
      const exists = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });
      if (exists && exists.id !== userId)
        throw new ConflictException('Phone already used');
    }

    const manager = await this.prisma.user.findUnique({
      where: { id: userId, role: Role.MANAGER },
      select: { id: true },
    });
    if (!manager) throw new NotFoundException('Manager not found');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const dataUser: any = {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      };
      if (dto.password) dataUser.passwordHash = await argon2.hash(dto.password);

      await tx.user.update({ where: { id: userId }, data: dataUser });

      await tx.managerProfile.update({
        where: { userId },
        data: {
          photoUrl: dto.photoUrl,
          monthlySalary: dto.monthlySalary,
        },
      });

      return tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
        },
      });
    });
  }

  async remove(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId, role: Role.MANAGER },
    });
    if (!u) throw new NotFoundException('Manager not found');
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }
}
