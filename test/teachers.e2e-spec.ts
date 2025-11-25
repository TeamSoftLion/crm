// test/teachers.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const request = require('supertest');

describe('Teachers e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ADMIN_PHONE = '+998900000001';
  const MANAGER_PHONE = '+998900000002';
  const PASSWORD = 'Admin12345!';

  const TEACHER_PHONE = '+998901234567';
  const TEACHER_PASSWORD = 'Teacher123!';

  let adminAccessToken: string;
  let managerAccessToken: string;
  let teacherAccessToken: string;

  let createdTeacherId: string;
  let createdTeacherUserId: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /teachers - ADMIN should create teacher', async () => {
    const res = await request(app.getHttpServer())
      .post('/teachers')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        firstName: 'Olim',
        lastName: 'Qodirov',
        phone: TEACHER_PHONE,
        password: TEACHER_PASSWORD,
        photoUrl: 'https://example.com/photo.jpg',
        monthlySalary: 3000000,
      })
      .expect((response) => {
        const status = response.status;
        if (status !== 201 && status !== 200) {
          throw new Error(`Expected 200 or 201, got ${status}`);
        }
      });

    expect(res.body).toMatchObject({
      fullName: 'Olim Qodirov',
      phone: TEACHER_PHONE,
      isActive: true,
      photoUrl: 'https://example.com/photo.jpg',
      monthlySalary: '3000000',
      percentShare: null,
    });

    createdTeacherId = res.body.id;
    createdTeacherUserId = res.body.userId;

    expect(createdTeacherId).toBeDefined();
    expect(createdTeacherUserId).toBeDefined();
  });

  it('AUTH - TEACHER should be able to login', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: TEACHER_PHONE, password: TEACHER_PASSWORD })
      .expect(200);

    teacherAccessToken = loginRes.body.accessToken;
    expect(teacherAccessToken).toBeDefined();
  });

  it('POST /teachers - TEACHER should be forbidden', async () => {
    await request(app.getHttpServer())
      .post('/teachers')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .send({
        firstName: 'Fake',
        lastName: 'Teacher',
        phone: '+998909999999',
        password: 'SomePass123!',
        monthlySalary: 1000000,
      })
      .expect(403);
  });

  it('GET /teachers - ADMIN should see created teacher in list', async () => {
    const res = await request(app.getHttpServer())
      .get('/teachers')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('meta');
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);

    const teacher = res.body.items.find(
      (t: any) => String(t.id) === String(createdTeacherId),
    );

    expect(teacher).toBeDefined();
    expect(teacher.fullName).toBe('Olim Qodirov');
    expect(teacher.phone).toBe(TEACHER_PHONE);
    expect(teacher.isActive).toBe(true);
    expect(teacher.monthlySalary).toBe('3000000');
  });

  it('GET /teachers - TEACHER should be forbidden', async () => {
    await request(app.getHttpServer())
      .get('/teachers')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .expect(403);
  });

  it('GET /teachers/:id - MANAGER should get teacher by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/teachers/${createdTeacherId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: createdTeacherId,
      userId: createdTeacherUserId,
      fullName: 'Olim Qodirov',
      phone: TEACHER_PHONE,
      isActive: true,
      monthlySalary: '3000000',
      percentShare: null,
    });
  });

  it('GET /teachers/my-groups - TEACHER should get empty list when no assignments', async () => {
    const res = await request(app.getHttpServer())
      .get('/teachers/my-groups')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('PATCH /teachers/:id - MANAGER should update teacher (change pay scheme)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/teachers/${createdTeacherId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .send({
        firstName: 'Olimjon',
        percentShare: 40,
        monthlySalary: null,
      })
      .expect(200);

    expect(res.body.id).toBe(createdTeacherId);
    expect(res.body.fullName).toBe('Olimjon Qodirov');
    expect(res.body.monthlySalary).toBeNull();
    expect(res.body.percentShare).toBe('40');
    expect(res.body.isActive).toBe(true);
  });

  it('DELETE /teachers/:id - MANAGER should soft deactivate teacher', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/teachers/${createdTeacherId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    expect(res.body.id).toBe(createdTeacherId);
    expect(res.body.isActive).toBe(false);

    const user = await prisma.user.findUnique({
      where: { id: createdTeacherUserId },
    });

    expect(user).not.toBeNull();
    expect(user!.isActive).toBe(false);
  });

  it('PATCH /teachers/:id/restore - ADMIN should restore teacher', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/teachers/${createdTeacherId}/restore`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(res.body.id).toBe(createdTeacherId);
    expect(res.body.isActive).toBe(true);

    const user = await prisma.user.findUnique({
      where: { id: createdTeacherUserId },
    });

    expect(user).not.toBeNull();
    expect(user!.isActive).toBe(true);
  });
});
