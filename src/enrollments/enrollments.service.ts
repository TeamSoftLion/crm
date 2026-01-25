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
import { FinanceService } from 'src/finance/finance.service';

@Injectable()
export class EnrollmentsService {
  constructor(
    private prisma: PrismaService,
    private readonly financeService: FinanceService,
  ) {}

  // CREATE: studentni guruhga qo'shish
  async create(dto: CreateEnrollmentDto) {
    await assertStudentExists(this.prisma, dto.studentId);
    await assertGroupActive(this.prisma, dto.groupId);
    await assertNoDuplicateActive(this.prisma, dto.studentId, dto.groupId);
    await assertGroupHasFreeSeat(this.prisma, dto.groupId);

    const joinDate = dto.joinDate ? new Date(dto.joinDate) : new Date();

    // Yaratish (transactionda)
    const enrollment = await this.prisma.enrollment.create({
      data: {
        studentId: dto.studentId,
        groupId: dto.groupId,
        joinDate,
        status: 'ACTIVE',
      },
    });

    // 🔥 YANGI CHAQRUV: Enroll ID emas, student + group + joinDate
    await this.financeService.createInitialTuitionChargeForEnrollment({
      studentId: enrollment.studentId,
      groupId: enrollment.groupId,
      joinDate: enrollment.joinDate,
    });

    return enrollment;
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

  async update(id: string, dto: UpdateEnrollmentDto) {
    const prev = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!prev) throw new NotFoundException('Enrollment topilmadi');

    const status = dto.status ?? prev.status;

    let leaveDate: Date | null = prev.leaveDate;

    // ✅ DTO leaveDate kelsa parse qilamiz
    if (dto.leaveDate) {
      const parsed = new Date(dto.leaveDate);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException("leaveDate noto'g'ri formatda");
      }
      leaveDate = parsed;
    }

    // ✅ LEFT bo'lsa leaveDate majbur
    if (status === 'LEFT' && !leaveDate) {
      leaveDate = new Date();
    }

    // ✅ ACTIVE yoki PAUSED bo'lsa leaveDate bo'lmaydi
    if (status === 'ACTIVE' || status === 'PAUSED') {
      leaveDate = null;
    }

    const updated = await this.prisma.enrollment.update({
      where: { id },
      data: {
        status,
        leaveDate,
      },
    });

    return updated;
  }

  async remove(id: string) {
    const e = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Enrollment topilmadi');

    // ✅ leaveDate yubormasak ham bo‘ladi (update o‘zi now qo‘yadi)
    return this.update(id, {
      status: 'LEFT',
    });
  }
}
