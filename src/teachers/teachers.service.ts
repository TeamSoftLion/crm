import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { QueryTeacherDto } from './dto/query-teacher.dto';
import {
  assertPaySchemeXor,
  assertPercentRange,
  assertPhoneUniqueIfProvided,
  ensureCreateVariantValid,
  normalizePhone,
} from './policies/teacher.policies';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { dateOnlyUTC } from 'src/attendance/utils/schedule.util';

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  private toDecimal = (v?: string | number | null) =>
    v === undefined
      ? undefined
      : v === null
        ? null
        : new Prisma.Decimal(v as any);

  private toView(row: any) {
    return {
      id: row.id,
      userId: row.user.id,
      fullName: `${row.user.firstName} ${row.user.lastName}`,
      phone: row.user.phone,
      isActive: row.user.isActive,
      photoUrl: row.photoUrl ?? null,
      monthlySalary: row.monthlySalary?.toString() ?? null,
      percentShare: row.percentShare?.toString() ?? null,
      createdAt: row.user.createdAt,
    };
  }

  async create(dto: CreateTeacherDto) {
    ensureCreateVariantValid(dto);
    assertPercentRange(dto.percentShare);
    assertPaySchemeXor(dto, { requireOne: true });

    const phone = normalizePhone(dto.phone);
    await assertPhoneUniqueIfProvided(this.prisma, phone);
    const passwordHash = await argon2.hash(dto.password!);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: dto.firstName!,
          lastName: dto.lastName!,
          phone: phone!,
          passwordHash,
          role: Role.TEACHER,
          isActive: true,
        },
      });

      const tp = await tx.teacherProfile.create({
        data: {
          userId: user.id,
          photoUrl: dto.photoUrl,
          monthlySalary: dto.monthlySalary
            ? this.toDecimal(dto.monthlySalary)
            : null,
          percentShare: dto.percentShare
            ? this.toDecimal(dto.percentShare)
            : null,
        },
        include: { user: true },
      });

      return tp;
    });

    return this.toView(created);
  }

  async findAll(q: QueryTeacherDto) {
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
      this.prisma.teacherProfile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { user: { createdAt: 'desc' } },
        include: { user: true },
      }),
      this.prisma.teacherProfile.count({ where }),
    ]);

    return {
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      items: rows.map((r) => this.toView(r)),
    };
  }

  async findMyGroups(currentUserId: string) {
    const today = dateOnlyUTC(new Date());

    const tas = await this.prisma.teachingAssignment.findMany({
      where: {
        teacher: { userId: currentUserId },
        isActive: true,
        fromDate: { lte: today },
        OR: [{ toDate: null }, { toDate: { gte: today } }],
        group: { isActive: true },
      },
      include: {
        group: {
          include: {
            room: true,
          },
        },
      },
      orderBy: { fromDate: 'asc' },
    });

    const seen = new Set<string>();
    const result: any[] = [];

    for (const ta of tas) {
      if (seen.has(ta.groupId)) continue;
      seen.add(ta.groupId);

      const g = ta.group;

      result.push({
        groupId: g.id,
        groupName: g.name,
        daysPattern: g.daysPattern,
        startTime: this.minToHHMM(g.startMinutes),
        endTime: this.minToHHMM(g.endMinutes),
        room: g.room
          ? {
              id: g.room.id,
              name: g.room.name,
              capacity: g.room.capacity,
            }
          : null,
        assignmentId: ta.id,
        role: ta.role,
      });
    }

    return result;
  }

  private minToHHMM(m: number) {
    const h = Math.floor(m / 60)
      .toString()
      .padStart(2, '0');
    const mm = (m % 60).toString().padStart(2, '0');
    return `${h}:${mm}`;
  }
  async findOne(id: string) {
    const row = await this.prisma.teacherProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!row) throw new NotFoundException('Teacher topilmadi');
    return this.toView(row);
  }

  async update(id: string, dto: UpdateTeacherDto) {
    const prev = await this.prisma.teacherProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!prev) throw new NotFoundException('Teacher topilmadi');

    assertPercentRange(dto.percentShare);
    assertPaySchemeXor(dto, { requireOne: false });

    const userData: any = {};
    if (dto.firstName) userData.firstName = dto.firstName.trim();
    if (dto.lastName) userData.lastName = dto.lastName.trim();
    if (dto.phone) {
      const phone = normalizePhone(dto.phone);
      await assertPhoneUniqueIfProvided(this.prisma, phone, prev.userId);
      userData.phone = phone;
    }
    if (dto.password)
      userData.passwordHash = await bcrypt.hash(dto.password, 10);
    if (typeof dto.isActive === 'boolean') userData.isActive = dto.isActive;

    const tpData: any = {};
    if (dto.photoUrl !== undefined) tpData.photoUrl = dto.photoUrl;

    if (dto.monthlySalary !== undefined) {
      tpData.monthlySalary =
        dto.monthlySalary === null ? null : this.toDecimal(dto.monthlySalary);
      tpData.percentShare = null;
    }
    if (dto.percentShare !== undefined) {
      tpData.percentShare =
        dto.percentShare === null ? null : this.toDecimal(dto.percentShare);
      tpData.monthlySalary = null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length) {
        await tx.user.update({ where: { id: prev.userId }, data: userData });
      }
      if (Object.keys(tpData).length) {
        await tx.teacherProfile.update({ where: { id }, data: tpData });
      }
      return tx.teacherProfile.findUnique({
        where: { id },
        include: { user: true },
      });
    });

    return this.toView(updated!);
  }

  // Soft-deactivate: user.isActive=false
  async remove(id: string) {
    const prev = await this.prisma.teacherProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!prev) throw new NotFoundException('Teacher topilmadi');

    const updatedUser = await this.prisma.user.update({
      where: { id: prev.userId },
      data: { isActive: false },
    });

    return this.toView({ ...prev, user: updatedUser });
  }

  // Restore
  async restore(id: string) {
    const prev = await this.prisma.teacherProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!prev) throw new NotFoundException('Teacher topilmadi');

    const updatedUser = await this.prisma.user.update({
      where: { id: prev.userId },
      data: { isActive: true },
    });

    return this.toView({ ...prev, user: updatedUser });
  }
}
