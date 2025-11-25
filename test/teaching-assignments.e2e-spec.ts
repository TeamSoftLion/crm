// test/teaching-assignments.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const request = require('supertest');

describe('TeachingAssignments e2e', () => {
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

  let teacherProfileId: string;
  let groupId: string;
  let teachingAssignmentId: string;

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

    const teacherProfile = await prisma.teacherProfile.create({
      data: {
        userId: teacherUser.id,
        photoUrl: null,
        monthlySalary: null,
        percentShare: null,
      },
    });
    teacherProfileId = teacherProfile.id;

    const room = await prisma.room.create({
      data: {
        name: 'room-1',
        capacity: 20,
      },
    });

    const group = await prisma.group.create({
      data: {
        name: 'Guruh-TA',
        capacity: 10,
        daysPattern: 'ODD',
        startMinutes: 9 * 60,
        endMinutes: 10 * 60,
        monthlyFee: 300000,
        roomId: room.id,
      },
    });
    groupId = group.id;

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

  it('POST /teaching-assignments - ADMIN should create TA', async () => {
    const res = await request(app.getHttpServer())
      .post('/teaching-assignments')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        teacherId: teacherProfileId,
        groupId,
        role: 'LEAD',
        fromDate: '2024-09-01',
        toDate: null,
        inheritSchedule: true,
        note: 'Main teacher',
      })
      .expect((response) => {
        const status = response.status;
        if (status !== 201 && status !== 200) {
          throw new Error(`Expected 200 or 201, got ${status}`);
        }
      });

    expect(res.body).toMatchObject({
      teacherId: teacherProfileId,
      groupId,
      role: 'LEAD',
      isActive: true,
      note: 'Main teacher',
      period: {
        fromDate: '2024-09-01T00:00:00.000Z',
        toDate: null,
      },
      schedule: {
        inherit: true,
        daysPattern: 'ODD',
        startTime: '09:00',
        endTime: '10:00',
      },
    });

    teachingAssignmentId = res.body.id;
    expect(teachingAssignmentId).toBeDefined();
  });

  it('POST /teaching-assignments - TEACHER should be forbidden', async () => {
    await request(app.getHttpServer())
      .post('/teaching-assignments')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .send({
        teacherId: teacherProfileId,
        groupId,
        role: 'LEAD',
        fromDate: '2024-09-01',
        inheritSchedule: true,
      })
      .expect(403);
  });

  it('GET /teaching-assignments - ADMIN should see created TA in list', async () => {
    const res = await request(app.getHttpServer())
      .get('/teaching-assignments')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('meta');
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);

    const ta = res.body.items.find(
      (x: any) => String(x.id) === String(teachingAssignmentId),
    );

    expect(ta).toBeDefined();
    expect(ta.teacherId).toBe(teacherProfileId);
    expect(ta.groupId).toBe(groupId);
    expect(ta.role).toBe('LEAD');
    expect(ta.isActive).toBe(true);
  });

  it('GET /teaching-assignments/:id - MANAGER should get TA by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/teaching-assignments/${teachingAssignmentId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    expect(res.body.id).toBe(teachingAssignmentId);
    expect(res.body.teacherId).toBe(teacherProfileId);
    expect(res.body.groupId).toBe(groupId);
    expect(res.body.role).toBe('LEAD');
    expect(res.body.isActive).toBe(true);
  });

  it('PATCH /teaching-assignments/:id - MANAGER should update TA note', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/teaching-assignments/${teachingAssignmentId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .send({
        note: 'Updated note',
        fromDate: '2024-09-01',
        toDate: null,
      })
      .expect(200);

    expect(res.body.id).toBe(teachingAssignmentId);
    expect(res.body.note).toBe('Updated note');
    expect(res.body.isActive).toBe(true);
    expect(res.body.schedule.inherit).toBe(true);
  });

  it('DELETE /teaching-assignments/:id - MANAGER should soft delete TA', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/teaching-assignments/${teachingAssignmentId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .query({ reason: 'No longer needed' })
      .expect(200);

    expect(res.body.id).toBe(teachingAssignmentId);
    expect(res.body.isActive).toBe(false);

    const ta = await prisma.teachingAssignment.findUnique({
      where: { id: teachingAssignmentId },
    });

    expect(ta).not.toBeNull();
    expect(ta!.isActive).toBe(false);
    expect(ta!.deactivateReason ?? ta!.deactivateReason).not.toBeUndefined();
  });

  it('POST /teaching-assignments/:id/restore - ADMIN should restore TA', async () => {
    const res = await request(app.getHttpServer())
      .post(`/teaching-assignments/${teachingAssignmentId}/restore`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(201);

    if (![200, 201].includes(res.status)) {
      throw new Error(`Expected 200 or 201, got ${res.status}`);
    }

    expect(res.body.id).toBe(teachingAssignmentId);
    expect(res.body.isActive).toBe(true);

    const ta = await prisma.teachingAssignment.findUnique({
      where: { id: teachingAssignmentId },
    });

    expect(ta).not.toBeNull();
    expect(ta!.isActive).toBe(true);
  });
});
