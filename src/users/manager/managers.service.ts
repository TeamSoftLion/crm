import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { CreateManagerDto } from './dto/create-manager.dto';
import { PrismaService } from 'prisma/prisma.service';

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
}
