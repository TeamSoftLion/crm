import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OpenSheetDto } from './dto/open-sheet.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { QuerySheetDto } from './dto/query-sheet.dto';
import { AttendanceStatus, SheetStatus } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import {
  dateOnlyUTC,
  ensureDateMatchesGroupPattern,
} from './utils/schedule.util';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  private toView(sheet: any) {
    return {
      id: sheet.id,
      groupId: sheet.groupId,
      date: sheet.date,
      startTime: this.minToHHMM(sheet.startMinutes),
      endTime: this.minToHHMM(sheet.endMinutes),
      status: sheet.status,
      teacherAssignId: sheet.teacherAssignId ?? null,
      note: sheet.note ?? null,
      students:
        sheet.attendance?.map((a) => ({
          studentId: a.studentId,
          status: a.status,
          note: a.note ?? null,
        })) ?? [],
    };
  }

  private minToHHMM(m: number) {
    const h = Math.floor(m / 60)
      .toString()
      .padStart(2, '0');
    const mm = (m % 60).toString().padStart(2, '0');
    return `${h}:${mm}`;
  }

  async openSheet(dto: OpenSheetDto) {
    const group = await this.prisma.group.findUnique({
      where: { id: dto.groupId },
      select: {
        id: true,
        daysPattern: true,
        startMinutes: true,
        endMinutes: true,
        isActive: true,
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    if (!group.isActive) throw new BadRequestException('Guruh arxivda');

    const date = dateOnlyUTC(new Date(dto.date));
    if (!ensureDateMatchesGroupPattern(date, group.daysPattern)) {
      throw new BadRequestException('Bu sana guruh jadvaliga to‘g‘ri kelmaydi');
    }

    const sheet = await this.prisma.attendanceSheet.upsert({
      where: { groupId_date: { groupId: group.id, date } },
      create: {
        groupId: group.id,
        date,
        startMinutes: group.startMinutes,
        endMinutes: group.endMinutes,
        teacherAssignId: dto.teacherAssignId,
        note: dto.note,
      },
      update: {},
      include: { attendance: true },
    });

    const activeEnrolls = await this.prisma.enrollment.findMany({
      where: {
        groupId: group.id,
        status: 'ACTIVE',
        joinDate: { lte: date },
        OR: [{ leaveDate: null }, { leaveDate: { gte: date } }],
      },
      select: { studentId: true },
    });

    const existing = new Set(sheet.attendance.map((a) => a.studentId));
    const toCreate = activeEnrolls.filter((e) => !existing.has(e.studentId));

    if (toCreate.length) {
      await this.prisma.attendance.createMany({
        data: toCreate.map((e) => ({
          sheetId: sheet.id,
          studentId: e.studentId,
          status: AttendanceStatus.ABSENT,
        })),
        skipDuplicates: true,
      });
    }

    const fresh = await this.prisma.attendanceSheet.findUnique({
      where: { groupId_date: { groupId: group.id, date } },
      include: { attendance: true },
    });

    return this.toView(fresh);
  }

  async mark(sheetId: string, dto: MarkAttendanceDto, currentUserId: string) {
    const sheet = await this.prisma.attendanceSheet.findUnique({
      where: { id: sheetId },
      select: { id: true, status: true },
    });
    if (!sheet) throw new NotFoundException('Varaq topilmadi');
    if (sheet.status === 'LOCKED')
      throw new BadRequestException('Varaq allaqachon yopilgan');

    await this.prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        await tx.attendance.upsert({
          where: {
            sheetId_studentId: { sheetId: sheetId, studentId: it.studentId },
          },
          create: {
            sheetId,
            studentId: it.studentId,
            status: it.status as AttendanceStatus,
            markedBy: currentUserId,
            markedAt: new Date(),
            note: it.note,
          },
          update: {
            status: it.status as AttendanceStatus,
            markedBy: currentUserId,
            markedAt: new Date(),
            note: it.note,
          },
        });
      }

      if (dto.lock) {
        await tx.attendanceSheet.update({
          where: { id: sheetId },
          data: { status: 'LOCKED' },
        });
      }
    });

    const fresh = await this.prisma.attendanceSheet.findUnique({
      where: { id: sheetId },
      include: { attendance: true },
    });
    return this.toView(fresh);
  }

  async getSheet(sheetId: string) {
    const sheet = await this.prisma.attendanceSheet.findUnique({
      where: { id: sheetId },
      include: {
        attendance: { include: { student: { include: { user: true } } } },
      },
    });
    if (!sheet) throw new NotFoundException('Varaq topilmadi');

    return {
      ...this.toView(sheet),
      students: sheet.attendance.map((a) => ({
        studentId: a.studentId,
        fullName: `${a.student.user.firstName} ${a.student.user.lastName}`,
        phone: a.student.user.phone,
        status: a.status,
        note: a.note ?? null,
      })),
    };
  }

  async listSheets(q: QuerySheetDto) {
    const where: any = { groupId: q.groupId };
    if (q.from || q.to) {
      where.date = {
        gte: q.from ? dateOnlyUTC(new Date(q.from)) : undefined,
        lte: q.to ? dateOnlyUTC(new Date(q.to)) : undefined,
      };
    }
    const rows = await this.prisma.attendanceSheet.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { attendance: true },
    });

    return rows.map((s) => ({
      id: s.id,
      date: s.date,
      status: s.status,
      present: s.attendance.filter((x) => x.status === 'PRESENT').length,
      absent: s.attendance.filter((x) => x.status === 'ABSENT').length,
      late: s.attendance.filter((x) => x.status === 'LATE').length,
      excused: s.attendance.filter((x) => x.status === 'EXCUSED').length,
    }));
  }
}
