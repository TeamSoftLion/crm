// src/attendance/attendance.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, AttendanceSheetStatus } from '@prisma/client';
import { GetGroupSheetDto } from './dto/get-group-sheet.dto';
import { BulkUpdateAttendanceDto } from './dto/bulk-update-attendance.dto';
import { TeacherAttendancePolicy } from './policies/teacher-attendance.policy';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherPolicy: TeacherAttendancePolicy,
  ) {}

  private normalizeDate(dateStr: string): Date {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return d;
  }

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
              include: {
                user: true,
              },
            },
          },
        },
        group: {
          include: {
            room: true,
          },
        },
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
              student: {
                include: {
                  user: true,
                },
              },
            },
          },
          group: {
            include: {
              room: true,
            },
          },
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
              student: {
                include: {
                  user: true,
                },
              },
            },
          },
          group: {
            include: {
              room: true,
            },
          },
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
    if (items.length === 0) {
      return { success: true };
    }

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
}
