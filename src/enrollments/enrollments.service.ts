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

  // 1. Yangi talabani guruhga qo'shish
  async create(dto: CreateEnrollmentDto) {
    await assertStudentExists(this.prisma, dto.studentId);
    await assertGroupActive(this.prisma, dto.groupId);
    await assertNoDuplicateActive(this.prisma, dto.studentId, dto.groupId);
    await assertGroupHasFreeSeat(this.prisma, dto.groupId);

    const joinDate = dto.joinDate ? new Date(dto.joinDate) : new Date();

    return await this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.create({
        data: {
          studentId: dto.studentId,
          groupId: dto.groupId,
          joinDate,
          status: 'ACTIVE',
        },
      });

      await this.financeService.createInitialTuitionChargeForEnrollment({
        studentId: enrollment.studentId,
        groupId: enrollment.groupId,
        joinDate: enrollment.joinDate,
      });

      return enrollment;
    });
  }

  // src/enrollments/enrollments.service.ts

  // src/enrollments/enrollments.service.ts

  async transfer(dto: {
    studentId: string;
    oldGroupId: string;
    newGroupId: string;
    transferDate: string;
  }) {
    const transferDate = new Date(dto.transferDate);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Eski enrollmentni yopish
      const oldEnrollment = await tx.enrollment.findFirst({
        where: {
          studentId: dto.studentId,
          groupId: dto.oldGroupId,
          status: 'ACTIVE',
        },
      });
      if (!oldEnrollment)
        throw new NotFoundException('Eski enrollment topilmadi');

      await tx.enrollment.update({
        where: { id: oldEnrollment.id },
        data: { status: 'LEFT', leaveDate: transferDate },
      });

      // 2. Yangi enrollment yaratish
      const newEnrollment = await tx.enrollment.create({
        data: {
          studentId: dto.studentId,
          groupId: dto.newGroupId,
          joinDate: transferDate,
          status: 'ACTIVE',
        },
      });

      // 3. Yangi qarzni yaratish (Metodimiz endi o'zi tozalashni amalga oshiradi)
      await this.financeService.createInitialTuitionChargeForEnrollment({
        studentId: dto.studentId,
        groupId: dto.newGroupId,
        joinDate: transferDate,
        tx, // Tranzaksiyani uzatamiz
      });

      return newEnrollment;
    });
  }
  // 3. Ro'yxatni olish
  async findAll(q: QueryEnrollmentDto) {
    const { studentId, groupId, status, from, to, page = 1, limit = 10 } = q;
    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (groupId) where.groupId = groupId;
    if (status) where.status = status;
    if (from || to) {
      where.joinDate = {};
      if (from) where.joinDate.gte = new Date(from);
      if (to) where.joinDate.lte = new Date(to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { include: { user: true } },
          group: true,
        },
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return {
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      items: items.map((e) => ({
        id: e.id,
        status: e.status,
        joinDate: e.joinDate,
        group: { id: e.group.id, name: e.group.name },
        student: {
          id: e.student.id,
          fullName: `${e.student.user.firstName} ${e.student.user.lastName}`,
          phone: e.student.user.phone,
        },
      })),
    };
  }

  // 4. ✅ YANGI: Bitta enrollmentni olish
  async findOne(id: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      include: {
        student: { include: { user: true } },
        group: true,
      },
    });

    if (!enrollment) throw new NotFoundException('Enrollment topilmadi');

    return {
      id: enrollment.id,
      status: enrollment.status,
      joinDate: enrollment.joinDate,
      leaveDate: enrollment.leaveDate,
      group: { id: enrollment.group.id, name: enrollment.group.name },
      student: {
        id: enrollment.student.id,
        fullName: `${enrollment.student.user.firstName} ${enrollment.student.user.lastName}`,
        phone: enrollment.student.user.phone,
      },
    };
  }

  // 5. Update (Status boshqaruvi)
  async update(id: string, dto: UpdateEnrollmentDto) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
    });
    if (!enrollment) throw new NotFoundException('Enrollment topilmadi');

    const status = dto.status ?? enrollment.status;
    let leaveDate = enrollment.leaveDate;

    if (status === 'LEFT') {
      leaveDate = dto.leaveDate ? new Date(dto.leaveDate) : new Date();
    } else if (['ACTIVE', 'PAUSED'].includes(status)) {
      leaveDate = null;
    }

    return this.prisma.enrollment.update({
      where: { id },
      data: { status, leaveDate },
    });
  }

  // 6. ✅ YANGI: Enrollmentni o'chirish
  async remove(id: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
    });
    if (!enrollment) throw new NotFoundException('Enrollment topilmadi');

    return this.prisma.enrollment.delete({
      where: { id },
    });
  }
}
