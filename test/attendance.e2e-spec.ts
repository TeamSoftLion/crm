// test/attendance.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { Role, AttendanceStatus, AttendanceSheetStatus } from '@prisma/client';

const request = require('supertest');

describe('Attendance e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ADMIN_PHONE = '+998900000001';
  const MANAGER_PHONE = '+998900000002';
  const TEACHER_PHONE = '+998900000003';

  const ADMIN_PASSWORD = 'Admin12345!';
  const MANAGER_PASSWORD = 'Admin12345!';
  const TEACHER_PASSWORD = 'Teacher123!';

  let adminAccessToken: string;
  let managerAccessToken: string;
  let teacherAccessToken: string;

  let teacherUserId: string;
  let teacherProfileId: string;
  let groupId: string;
  let student1ProfileId: string;
  let student2ProfileId: string;

  let sheetId: string;

  const LESSON_DATE = '2024-09-01';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.attendanceRecord.deleteMany();
    await prisma.attendanceSheet.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.teachingAssignment.deleteMany();
    await prisma.group.deleteMany();
    await prisma.room.deleteMany();
    await prisma.studentProfile.deleteMany();
    await prisma.teacherProfile.deleteMany();
    await prisma.managerProfile.deleteMany();
    await prisma.user.deleteMany();

    const adminHash = await argon2.hash(ADMIN_PASSWORD);
    await prisma.user.create({
      data: {
        firstName: 'Admin',
        lastName: 'User',
        phone: ADMIN_PHONE,
        passwordHash: adminHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });

    const managerHash = await argon2.hash(MANAGER_PASSWORD);
    await prisma.user.create({
      data: {
        firstName: 'Manager',
        lastName: 'User',
        phone: MANAGER_PHONE,
        passwordHash: managerHash,
        role: Role.MANAGER,
        isActive: true,
      },
    });

    const teacherHash = await argon2.hash(TEACHER_PASSWORD);
    const teacherUser = await prisma.user.create({
      data: {
        firstName: 'Teacher',
        lastName: 'One',
        phone: TEACHER_PHONE,
        passwordHash: teacherHash,
        role: Role.TEACHER,
        isActive: true,
      },
    });
    teacherUserId = teacherUser.id;

    const teacherProfile = await prisma.teacherProfile.create({
      data: {
        userId: teacherUser.id,
        photoUrl: null,
        monthlySalary: null,
        percentShare: null,
      },
    });
    teacherProfileId = teacherProfile.id;

    const s1User = await prisma.user.create({
      data: {
        firstName: 'Ali',
        lastName: 'Valiyev',
        phone: '+998901111111',
        passwordHash: await argon2.hash('Student1!'),
        role: Role.STUDENT,
        isActive: true,
      },
    });
    const s1Profile = await prisma.studentProfile.create({
      data: {
        userId: s1User.id,
        dateOfBirth: new Date('2005-01-15'),
        startDate: new Date('2024-09-01'),
      },
    });
    student1ProfileId = s1Profile.id;

    const s2User = await prisma.user.create({
      data: {
        firstName: 'Hasan',
        lastName: 'Karimov',
        phone: '+998902222222',
        passwordHash: await argon2.hash('Student2!'),
        role: Role.STUDENT,
        isActive: true,
      },
    });
    const s2Profile = await prisma.studentProfile.create({
      data: {
        userId: s2User.id,
        dateOfBirth: new Date('2006-03-10'),
        startDate: new Date('2024-09-01'),
      },
    });
    student2ProfileId = s2Profile.id;

    const room = await prisma.room.create({
      data: {
        name: 'room-att',
        capacity: 20,
      },
    });

    const group = await prisma.group.create({
      data: {
        name: 'Guruh-Attendance',
        capacity: 10,
        daysPattern: 'ODD',
        startMinutes: 9 * 60,
        endMinutes: 10 * 60,
        monthlyFee: 300000,
        roomId: room.id,
      },
    });
    groupId = group.id;

    await prisma.teachingAssignment.create({
      data: {
        teacherId: teacherProfileId,
        groupId,
        role: 'LEAD', // enumingga mos
        fromDate: new Date('2024-01-01'),
        toDate: null,
        inheritSchedule: true,
        isActive: true,
      },
    });

    await prisma.enrollment.create({
      data: {
        studentId: student1ProfileId,
        groupId,
        joinDate: new Date('2024-08-15'),
        status: 'ACTIVE',
      },
    });

    await prisma.enrollment.create({
      data: {
        studentId: student2ProfileId,
        groupId,
        joinDate: new Date('2024-08-20'),
        status: 'ACTIVE',
      },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD })
      .expect(200);
    adminAccessToken = adminLogin.body.accessToken;

    const managerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: MANAGER_PHONE, password: MANAGER_PASSWORD })
      .expect(200);
    managerAccessToken = managerLogin.body.accessToken;

    const teacherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: TEACHER_PHONE, password: TEACHER_PASSWORD })
      .expect(200);
    teacherAccessToken = teacherLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /teacher/attendance/group/:groupId - TEACHER should create sheet with students', async () => {
    const res = await request(app.getHttpServer())
      .get(`/teacher/attendance/group/${groupId}`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .query({ date: LESSON_DATE })
      .expect(200);

    sheetId = res.body.sheetId;
    expect(sheetId).toBeDefined();
    expect(res.body.sheetId).toBeDefined();
    expect(res.body.group.id).toBe(groupId);
    const expectedDate = new Date(LESSON_DATE);
    expectedDate.setHours(0, 0, 0, 0);
    const expectedStr = expectedDate.toISOString().slice(0, 10);

    expect(res.body.date).toBe(expectedStr);
    expect(res.body.status).toBe(AttendanceSheetStatus.OPEN);

    expect(Array.isArray(res.body.students)).toBe(true);
    expect(res.body.students.length).toBe(2);

    const s1 = res.body.students.find(
      (s: any) => s.studentId === student1ProfileId,
    );
    const s2 = res.body.students.find(
      (s: any) => s.studentId === student2ProfileId,
    );

    expect(s1.fullName).toBe('Ali Valiyev');
    expect(s2.fullName).toBe('Hasan Karimov');

    expect(s1.status).toBe(AttendanceStatus.UNKNOWN);
    expect(s2.status).toBe(AttendanceStatus.UNKNOWN);
  });

  it('GET /teacher/attendance/group/:groupId - TEACHER should reuse existing sheet', async () => {
    const res = await request(app.getHttpServer())
      .get(`/teacher/attendance/group/${groupId}`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .query({ date: LESSON_DATE })
      .expect(200);

    expect(res.body.sheetId).toBe(sheetId);
    expect(res.body.students.length).toBe(2);
  });

  it('GET /teacher/attendance/group/:groupId - MANAGER should be forbidden', async () => {
    await request(app.getHttpServer())
      .get(`/teacher/attendance/group/${groupId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .query({ date: LESSON_DATE })
      .expect(403);
  });

  it('PATCH /teacher/attendance/sheet/:sheetId - TEACHER should update statuses', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/teacher/attendance/sheet/${sheetId}`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .send({
        items: [
          {
            studentId: student1ProfileId,
            status: 'PRESENT',
            comment: 'OK',
          },
          {
            studentId: student2ProfileId,
            status: 'ABSENT',
            comment: 'Late',
          },
        ],
      })
      .expect(200);

    expect(res.body).toEqual({ success: true });

    const r1 = await prisma.attendanceRecord.findUnique({
      where: {
        sheetId_studentId: {
          sheetId,
          studentId: student1ProfileId,
        },
      },
    });

    const r2 = await prisma.attendanceRecord.findUnique({
      where: {
        sheetId_studentId: {
          sheetId,
          studentId: student2ProfileId,
        },
      },
    });

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();

    expect(r1!.status).toBe('PRESENT');
    expect(r1!.comment).toBe('OK');

    expect(r2!.status).toBe('ABSENT');
    expect(r2!.comment).toBe('Late');
  });

  it('PATCH /teacher/attendance/sheet/:sheetId - TEACHER should not update CLOSED sheet', async () => {
    await prisma.attendanceSheet.update({
      where: { id: sheetId },
      data: { status: AttendanceSheetStatus.LOCKED },
    });

    await request(app.getHttpServer())
      .patch(`/teacher/attendance/sheet/${sheetId}`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .send({
        items: [
          {
            studentId: student1ProfileId,
            status: 'ABSENT',
            comment: 'Try change after closed',
          },
        ],
      })
      .expect(403);
  });

  it('PATCH /teacher/attendance/sheet/:sheetId - MANAGER should be forbidden', async () => {
    await request(app.getHttpServer())
      .patch(`/teacher/attendance/sheet/${sheetId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .send({
        items: [
          {
            studentId: student1ProfileId,
            status: 'PRESENT',
          },
        ],
      })
      .expect(403);
  });
});
