import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { CreateStudentDto } from './dto/create-student.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateStudentDto) {
    const exists = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (exists) throw new ConflictException('Phone already used');

    const passwordHash = await argon2.hash(dto.password);

    return this.prisma.$transaction(async (tx) => {
      if (dto.groupId) {
        const g = await tx.group.findUnique({
          where: { id: dto.groupId, isActive: true },
        });
        if (!g) throw new NotFoundException('Group not found or inactive');
      }

      const user = await tx.user.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          passwordHash,
          role: Role.STUDENT,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
        },
      });

      await tx.studentProfile.create({
        data: {
          userId: user.id,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          groupId: dto.groupId ?? null,
        },
      });

      return user;
    });
  }

  async assignToGroup(studentUserId: string, groupId: string) {
    const [student, group] = await Promise.all([
      this.prisma.studentProfile.findUnique({
        where: { userId: studentUserId },
      }),
      this.prisma.group.findUnique({ where: { id: groupId, isActive: true } }),
    ]);
    if (!student) throw new NotFoundException('Student profile not found');
    if (!group) throw new NotFoundException('Group not found or inactive');

    return this.prisma.studentProfile.update({
      where: { userId: studentUserId },
      data: { groupId },
      select: { userId: true, groupId: true },
    });
  }

  list() {
    return this.prisma.user.findMany({
      where: { role: Role.STUDENT, isActive: true },
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
