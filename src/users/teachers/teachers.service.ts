import {
  ConflictException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTeacherDto) {
    if (dto.monthlySalary == null && dto.percentShare == null) {
      throw new BadRequestException(
        'Provide either monthlySalary or percentShare',
      );
    }
    if (dto.monthlySalary != null && dto.percentShare != null) {
      throw new BadRequestException(
        'Choose only one: monthlySalary OR percentShare',
      );
    }

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
          role: Role.TEACHER,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
        },
      });

      await tx.teacherProfile.create({
        data: {
          userId: user.id,
          photoUrl: dto.photoUrl,
          monthlySalary: dto.monthlySalary ?? null,
          percentShare: dto.percentShare ?? null,
        },
      });

      return user;
    });
  }

  list() {
    return this.prisma.user.findMany({
      where: { role: Role.TEACHER, isActive: true },
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
