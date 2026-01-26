import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceStatus, AttendanceSheetStatus, Role } from '@prisma/client';
import { GetGroupSheetDto } from './dto/get-group-sheet.dto';
import { BulkUpdateAttendanceDto } from './dto/bulk-update-attendance.dto';
import { TeacherAttendancePolicy } from './policies/teacher-attendance.policy';
import { PrismaService } from '../../prisma/prisma.service';
import { GetGroupMonthSheetsDto } from './dto/get-group-month-sheets.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherPolicy: TeacherAttendancePolicy,
  ) {}

  private normalizeDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private monthRangeUtc(monthStr: string): {
    start: Date;
    endExclusive: Date;
    yyyy: number;
    mm: number;
  } {
    // "YYYY-MM"
    const [y, m] = monthStr.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) {
      throw new Error('month formati noto‘g‘ri. Masalan: 2026-01');
    }
    const start = new Date(Date.UTC(y, m - 1, 1));
    const endExclusive = new Date(Date.UTC(y, m, 1));
    return { start, endExclusive, yyyy: y, mm: m };
  }

  // ... sizning mavjud metodlaringiz
  async getOrCreateGroupSheetForTeacher(params: {
    teacherUserId: string;
    groupId: string;
    dto: GetGroupSheetDto;
  }) {
    const { teacherUserId, groupId, dto } = params;

    const group = await this.teacherPolicy.ensureTeacherHasAccessToGroupOrThrow(
      {
        teacherUserId,
        groupId,
      },
    );

    const date = this.normalizeDate(dto.date);
    const lesson = dto.lesson ? Number(dto.lesson) : null;

    let sheet = await this.prisma.attendanceSheet.findFirst({
      where: {
        groupId,
        date,
        lesson: lesson ?? undefined,
      },
      include: {
        records: {
          include: {
            student: {
              include: { user: true },
            },
          },
        },
        group: { include: { room: true } },
      },
    });

    if (!sheet) {
      sheet = await this.prisma.attendanceSheet.create({
        data: {
          groupId,
          date,
          lesson,
          status: AttendanceSheetStatus.OPEN,
          createdById: teacherUserId,
        },
        include: {
          records: {
            include: {
              student: { include: { user: true } },
            },
          },
          group: { include: { room: true } },
        },
      });
    }

    const enrollments = await this.teacherPolicy.getActiveEnrollmentsForDate({
      groupId,
      date,
    });

    const existingStudentIds = new Set(sheet.records.map((r) => r.studentId));
    const missing = enrollments.filter(
      (e) => !existingStudentIds.has(e.studentId),
    );

    if (missing.length > 0) {
      await this.prisma.attendanceRecord.createMany({
        data: missing.map((e) => ({
          sheetId: sheet!.id,
          studentId: e.studentId,
          status: AttendanceStatus.UNKNOWN,
        })),
      });

      sheet = await this.prisma.attendanceSheet.findUnique({
        where: { id: sheet.id },
        include: {
          records: {
            include: {
              student: { include: { user: true } },
            },
          },
          group: { include: { room: true } },
        },
      });
    }

    return {
      sheetId: sheet!.id,
      group: {
        id: group.id,
        name: group.name,
        daysPattern: group.daysPattern,
        startMinutes: group.startMinutes,
        endMinutes: group.endMinutes,
        room: group.room
          ? {
              id: group.room.id,
              name: group.room.name,
              capacity: group.room.capacity,
            }
          : null,
      },
      date: sheet!.date.toISOString().slice(0, 10),
      lesson: sheet!.lesson,
      status: sheet!.status,
      students: sheet!.records.map((r) => ({
        studentId: r.studentId,
        fullName: `${r.student.user.firstName} ${r.student.user.lastName}`,
        status: r.status,
        comment: r.comment,
      })),
    };
  }

  async bulkUpdateSheetForTeacher(params: {
    teacherUserId: string;
    sheetId: string;
    dto: BulkUpdateAttendanceDto;
  }) {
    const { teacherUserId, sheetId, dto } = params;

    const sheet = await this.prisma.attendanceSheet.findUnique({
      where: { id: sheetId },
    });

    if (!sheet) {
      throw new NotFoundException('Attendance sahifasi topilmadi');
    }

    await this.teacherPolicy.ensureTeacherHasAccessToGroupOrThrow({
      teacherUserId,
      groupId: sheet.groupId,
    });

    this.teacherPolicy.ensureSheetIsOpenOrThrow(sheet);

    const items = dto.items ?? [];
    if (items.length === 0) return { success: true };

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.attendanceRecord.upsert({
          where: {
            sheetId_studentId: {
              sheetId,
              studentId: item.studentId,
            },
          },
          create: {
            sheetId,
            studentId: item.studentId,
            status: item.status ?? AttendanceStatus.UNKNOWN,
            comment: item.comment ?? null,
            updatedById: teacherUserId,
          },
          update: {
            status: item.status ?? AttendanceStatus.UNKNOWN,
            comment: item.comment ?? null,
            updatedById: teacherUserId,
          },
        }),
      ),
    );

    return { success: true };
  }

  async getGroupMonthSheets(params: {
    requesterUserId: string;
    requesterRole: Role;
    groupId: string;
    dto: GetGroupMonthSheetsDto;
  }) {
    const { requesterUserId, requesterRole, groupId, dto } = params;

    // 1) Group mavjudligini tekshirish (ham teacher, ham admin uchun kerak)
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { room: true },
    });
    if (!group) throw new NotFoundException('Group topilmadi');

    // 2) Access control:
    // - ADMIN bo‘lsa ruxsat
    // - TEACHER bo‘lsa policy orqali groupga access borligini tekshiramiz
    if (requesterRole === Role.TEACHER) {
      await this.teacherPolicy.ensureTeacherHasAccessToGroupOrThrow({
        teacherUserId: requesterUserId,
        groupId,
      });
    } else if (requesterRole !== Role.ADMIN) {
      throw new ForbiddenException('Ruxsat yo‘q');
    }

    // 3) month range
    const { start, endExclusive } = this.monthRangeUtc(dto.month);

    // 4) oy bo‘yicha sheetlarni olish
    const whereSheet: any = {
      groupId,
      date: { gte: start, lt: endExclusive },
    };
    if (dto.lesson !== undefined) whereSheet.lesson = dto.lesson;

    const sheets = await this.prisma.attendanceSheet.findMany({
      where: whereSheet,
      orderBy: [{ date: 'asc' }, { lesson: 'asc' }],
      include: {
        records: {
          include: {
            student: { include: { user: true } },
          },
        },
      },
    });

    // 5) response: oyda nechta dars bo‘lgan bo‘lsa — sheets.length shuni bildiradi
    return {
      group: {
        id: group.id,
        name: group.name,
        daysPattern: group.daysPattern,
        startMinutes: group.startMinutes,
        endMinutes: group.endMinutes,
        room: group.room
          ? {
              id: group.room.id,
              name: group.room.name,
              capacity: group.room.capacity,
            }
          : null,
      },
      month: dto.month,
      totalLessons: sheets.length,
      sheets: sheets.map((s) => ({
        sheetId: s.id,
        date: s.date.toISOString().slice(0, 10),
        lesson: s.lesson,
        status: s.status,
        students: s.records.map((r) => ({
          studentId: r.studentId,
          fullName: `${r.student.user.firstName} ${r.student.user.lastName}`,
          status: r.status,
          comment: r.comment,
        })),
      })),
    };
  }
}
