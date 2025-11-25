import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { QueryEnrollmentDto } from './dto/query-enrollment.dto';
import {
  assertGroupActive,
  assertGroupHasFreeSeat,
  assertNoDuplicateActive,
  assertStudentExists,
} from './policies/enrollment.policies';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  // CREATE: studentni guruhga qo'shish
  async create(dto: CreateEnrollmentDto) {
    await assertStudentExists(this.prisma, dto.studentId);
    await assertGroupActive(this.prisma, dto.groupId);
    await assertNoDuplicateActive(this.prisma, dto.studentId, dto.groupId);
    await assertGroupHasFreeSeat(this.prisma, dto.groupId);

    const joinDate = dto.joinDate ? new Date(dto.joinDate) : new Date();

    // Yaratish (transactionda)
    const created = await this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.create({
        data: {
          studentId: dto.studentId,
          groupId: dto.groupId,
          joinDate,
          status: 'ACTIVE',
        },
      });
      return enrollment;
    });

    return created;
  }

  // LIST
  async findAll(q: QueryEnrollmentDto) {
    const { studentId, groupId, status, from, to, page = 1, limit = 10 } = q;

    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (groupId) where.groupId = groupId;
    if (status) where.status = status;
    if (from)
      where.joinDate = { ...(where.joinDate ?? {}), gte: new Date(from) };
    if (to) where.joinDate = { ...(where.joinDate ?? {}), lte: new Date(to) };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              user: {
                select: { firstName: true, lastName: true, phone: true },
              },
              dateOfBirth: true,
            },
          },
          group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.enrollment.count({ where }),
    ]);
    const student = items.map((e) => ({
      id: e.id,
      status: e.status,
      joinDate: e.joinDate,
      leaveDate: e.leaveDate,
      group: e.group,
      student: {
        id: e.student.id,
        fullName: `${e.student.user.firstName} ${e.student.user.lastName}`,
        phone: e.student.user.phone,
      },
    }));

    return {
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      items,
      student,
    };
  }

  // GET ONE
  async findOne(id: string) {
    const e = await this.prisma.enrollment.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            user: {
              select: { firstName: true, lastName: true, phone: true },
            },
            dateOfBirth: true,
          },
        },
        group: { select: { id: true, name: true } },
      },
    });
    if (!e) throw new NotFoundException('Enrollment topilmadi');
    return e;
  }

  // UPDATE: status/leaveDate
  async update(id: string, dto: UpdateEnrollmentDto) {
    const prev = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('Enrollment topilmadi');

    // LEFT bo'layotgan bo'lsa leaveDate talab qilamiz (yoki avtomatik now)
    let leaveDate = dto.leaveDate ? new Date(dto.leaveDate) : prev.leaveDate;
    if (dto.status === 'LEFT' && !leaveDate) {
      leaveDate = new Date();
    }
    if (dto.status === 'ACTIVE' && prev.status !== 'ACTIVE') {
      await assertGroupActive(this.prisma, prev.groupId);
      await assertNoDuplicateActive(this.prisma, prev.studentId, prev.groupId);
      await assertGroupHasFreeSeat(this.prisma, prev.groupId);
    }

    const updated = await this.prisma.enrollment.update({
      where: { id },
      data: {
        status: dto.status ?? prev.status,
        leaveDate,
      },
    });

    return updated;
  }

  async remove(id: string) {
    const e = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Enrollment topilmadi');
    return this.update(id, {
      status: 'LEFT',
      leaveDate: new Date().toISOString(),
    });
  }
}
