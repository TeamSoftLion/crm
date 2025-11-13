import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import {
  assertNoStudentProfileYet,
  assertPhoneUniqueIfProvided,
  assertUserExists,
  normalizePhone,
} from './policies/student.policies';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  private toView(row: any) {
    return {
      id: row.id,
      userId: row.user.id,
      fullName: `${row.user.firstName} ${row.user.lastName}`,
      phone: row.user.phone,
      isActive: row.user.isActive,
      dateOfBirth: row.dateOfBirth,
      startDate: row.startDate,
      createdAt: row.user.createdAt,
    };
  }

  async create(dto: CreateStudentDto) {
    const dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    const startDate = dto.startDate ? new Date(dto.startDate) : null;

    const phone = normalizePhone(dto.phone);
    await assertPhoneUniqueIfProvided(this.prisma, phone);

    const passwordHash = await bcrypt.hash(dto.password!, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: dto.firstName!,
          lastName: dto.lastName!,
          phone: phone!,
          passwordHash,
          role: Role.STUDENT,
          isActive: true,
        },
      });

      const sp = await tx.studentProfile.create({
        data: {
          userId: user.id,
          dateOfBirth: dateOfBirth ?? undefined,
          startDate: startDate ?? undefined,
        },
        include: { user: true },
      });

      return sp;
    });

    return this.toView(created);
  }

  async findAll(q: QueryStudentDto) {
    const { search, isActive, page = 1, limit = 10 } = q;
    const where: any = {
      user: {
        ...(isActive !== undefined
          ? { isActive: String(isActive) === 'true' }
          : {}),
      },
    };

    if (search?.trim()) {
      const s = search.trim();
      where.user = {
        ...(where.user ?? {}),
        OR: [
          { firstName: { contains: s, mode: 'insensitive' } },
          { lastName: { contains: s, mode: 'insensitive' } },
          { phone: { contains: s, mode: 'insensitive' } },
        ],
      };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.studentProfile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { user: { createdAt: 'desc' } },
        include: { user: true },
      }),
      this.prisma.studentProfile.count({ where }),
    ]);

    return {
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      items: rows.map((r) => this.toView(r)),
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!row) throw new NotFoundException('Student topilmadi');
    return this.toView(row);
  }

  async update(id: string, dto: UpdateStudentDto) {
    const prev = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!prev) throw new NotFoundException('Student topilmadi');

    const userData: any = {};
    if (dto.firstName) userData.firstName = dto.firstName.trim();
    if (dto.lastName) userData.lastName = dto.lastName.trim();
    if (dto.phone) {
      const phone = normalizePhone(dto.phone);
      await assertPhoneUniqueIfProvided(this.prisma, phone, prev.userId);
      userData.phone = phone;
    }
    if (dto.password) {
      userData.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (typeof dto.isActive === 'boolean') {
      userData.isActive = dto.isActive;
    }

    const spData: any = {};
    if (dto.dateOfBirth) spData.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.startDate) spData.startDate = new Date(dto.startDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length) {
        await tx.user.update({ where: { id: prev.userId }, data: userData });
      }
      if (Object.keys(spData).length) {
        await tx.studentProfile.update({ where: { id }, data: spData });
      }
      return tx.studentProfile.findUnique({
        where: { id },
        include: { user: true },
      });
    });

    return this.toView(updated);
  }

  // Soft-deactivate: user.isActive=false
  async remove(id: string) {
    const prev = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!prev) throw new NotFoundException('Student topilmadi');

    const updatedUser = await this.prisma.user.update({
      where: { id: prev.userId },
      data: { isActive: false },
    });

    return {
      id: prev.id,
      userId: updatedUser.id,
      fullName: `${updatedUser.firstName} ${updatedUser.lastName}`,
      phone: updatedUser.phone,
      isActive: updatedUser.isActive,
      dateOfBirth: prev.dateOfBirth,
      startDate: prev.startDate,
      createdAt: updatedUser.createdAt,
    };
  }

  async restore(id: string) {
    const prev = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!prev) throw new NotFoundException('Student topilmadi');

    const updatedUser = await this.prisma.user.update({
      where: { id: prev.userId },
      data: { isActive: true },
    });

    return this.toView({ ...prev, user: updatedUser });
  }
}
