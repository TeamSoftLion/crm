// test/students.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const request = require('supertest');

describe('Students e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ADMIN_PHONE = '+998900000001';
  const MANAGER_PHONE = '+998900000002';
  const TEACHER_PHONE = '+998900000003';
  const PASSWORD = 'Admin12345!';

  let adminAccessToken: string;
  let managerAccessToken: string;
  let teacherAccessToken: string;

  let createdStudentId: string;
  let createdStudentUserId: string;

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
    await prisma.group.deleteMany();
    await prisma.room.deleteMany();
    await prisma.studentProfile.deleteMany();
    await prisma.teacherProfile.deleteMany();
    await prisma.managerProfile.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await argon2.hash(PASSWORD);

    await prisma.user.create({
      data: {
        firstName: 'Admin',
        lastName: 'User',
        phone: ADMIN_PHONE,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        firstName: 'Manager',
        lastName: 'User',
        phone: MANAGER_PHONE,
        passwordHash,
        role: Role.MANAGER,
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        firstName: 'Teacher',
        lastName: 'User',
        phone: TEACHER_PHONE,
        passwordHash,
        role: Role.TEACHER,
        isActive: true,
      },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: ADMIN_PHONE, password: PASSWORD })
      .expect(200);

    adminAccessToken = adminLogin.body.accessToken;

    const managerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: MANAGER_PHONE, password: PASSWORD })
      .expect(200);

    managerAccessToken = managerLogin.body.accessToken;

    const teacherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: TEACHER_PHONE, password: PASSWORD })
      .expect(200);

    teacherAccessToken = teacherLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /students - ADMIN should create student', async () => {
    const res = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        firstName: 'Ali',
        lastName: 'Valiyev',
        phone: '+998901234567',
        password: 'Student123!',
        dateOfBirth: '2005-01-15',
        startDate: '2024-09-01',
      })
      .expect((response) => {
        const status = response.status;
        if (status !== 201 && status !== 200) {
          throw new Error(`Expected 200 or 201, got ${status}`);
        }
      });

    expect(res.body).toMatchObject({
      fullName: 'Ali Valiyev',
      phone: '+998901234567',
      isActive: true,
      dateOfBirth: '2005-01-15T00:00:00.000Z',
      startDate: '2024-09-01T00:00:00.000Z',
    });

    createdStudentId = res.body.id;
    createdStudentUserId = res.body.userId;

    expect(createdStudentId).toBeDefined();
    expect(createdStudentUserId).toBeDefined();
  });

  it('POST /students - TEACHER should be forbidden', async () => {
    await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .send({
        firstName: 'Test',
        lastName: 'Student',
        phone: '+998909999999',
        password: 'Student123!',
      })
      .expect(403);
  });

  it('GET /students - ADMIN should see created student in list', async () => {
    const res = await request(app.getHttpServer())
      .get('/students')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('meta');
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);

    const student = res.body.items.find(
      (s: any) => String(s.id) === String(createdStudentId),
    );

    expect(student).toBeDefined();
    expect(student.fullName).toBe('Ali Valiyev');
    expect(student.phone).toBe('+998901234567');
    expect(student.isActive).toBe(true);
  });

  it('GET /students/:id - ADMIN should get student by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: createdStudentId,
      userId: createdStudentUserId,
      fullName: 'Ali Valiyev',
      phone: '+998901234567',
      isActive: true,
    });
  });

  it('PATCH /students/:id - ADMIN should update student', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        firstName: 'Aliakbar',
        lastName: 'Valiyev',
        phone: '+998908888888',
        dateOfBirth: '2004-02-02',
      })
      .expect(200);

    expect(res.body.fullName).toBe('Aliakbar Valiyev');
    expect(res.body.phone).toBe('+998908888888');
    expect(res.body.isActive).toBe(true);
    expect(res.body.id).toBe(createdStudentId);
  });

  it('DELETE /students/:id - MANAGER should soft deactivate student', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    expect(res.body.id).toBe(createdStudentId);
    expect(res.body.isActive).toBe(false);

    const user = await prisma.user.findUnique({
      where: { id: createdStudentUserId },
    });

    expect(user).not.toBeNull();
    expect(user!.isActive).toBe(false);
  });

  it('PATCH /students/:id/restore - ADMIN should restore student', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/students/${createdStudentId}/restore`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(res.body.id).toBe(createdStudentId);
    expect(res.body.isActive).toBe(true);

    const user = await prisma.user.findUnique({
      where: { id: createdStudentUserId },
    });

    expect(user).not.toBeNull();
    expect(user!.isActive).toBe(true);
  });

  it('GET /students - TEACHER should be forbidden', async () => {
    await request(app.getHttpServer())
      .get('/students')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .expect(403);
  });
});
