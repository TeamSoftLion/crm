import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, AttendanceSheetStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TeacherAttendancePolicy {
  constructor(private readonly prisma: PrismaService) {}

  // Teacher bu guruhga biriktirilganmi?
  async ensureTeacherHasAccessToGroupOrThrow(params: {
    teacherUserId: string;
    groupId: string;
  }) {
    const { teacherUserId, groupId } = params;

    const teacherProfile = await this.prisma.teacherProfile.findUnique({
      where: { userId: teacherUserId },
      select: { id: true },
    });

    if (!teacherProfile) {
      throw new ForbiddenException('Siz o‘qituvchi emassiz');
    }

    const now = new Date();

    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: {
        teacherId: teacherProfile.id,
        groupId,
        isActive: true,
        fromDate: { lte: now },
        OR: [{ toDate: null }, { toDate: { gte: now } }],
      },
      include: {
        group: {
          include: { room: true },
        },
      },
    });

    if (!assignment) {
      throw new ForbiddenException('Siz bu guruhga biriktirilmagansiz');
    }

    return assignment.group;
  }

  // Sana bo‘yicha ACTIVE enrollment’lar
  async getActiveEnrollmentsForDate(params: { groupId: string; date: Date }) {
    const { groupId, date } = params;

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return this.prisma.enrollment.findMany({
      where: {
        groupId,
        status: 'ACTIVE',
        joinDate: { lte: end },
        OR: [{ leaveDate: null }, { leaveDate: { gte: start } }],
      },
      select: {
        studentId: true,
        student: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  // Sheet LOCKED bo‘lsa – o‘zgartirib bo‘lmaydi
  ensureSheetIsOpenOrThrow(sheet: { status: AttendanceSheetStatus }) {
    if (sheet.status !== AttendanceSheetStatus.OPEN) {
      throw new ForbiddenException('Yopilgan sahifani o‘zgartirib bo‘lmaydi');
    }
  }
}
