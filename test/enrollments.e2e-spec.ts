// test/enrollments.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const request = require('supertest');

describe('Enrollments e2e', () => {
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

  let student1ProfileId: string;
  let student2ProfileId: string;
  let groupId: string;

  let enrollment1Id: string;
  let enrollment2Id: string;

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
    await prisma.user.create({
      data: {
        firstName: 'Teacher',
        lastName: 'User',
        phone: TEACHER_PHONE,
        passwordHash: teacherHash,
        role: Role.TEACHER,
        isActive: true,
      },
    });

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
        name: 'room-enroll',
        capacity: 20,
      },
    });

    const group = await prisma.group.create({
      data: {
        name: 'Guruh-Enrollment',
        capacity: 5,
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

  it('POST /enrollments - ADMIN should create enrollment', async () => {
    const res = await request(app.getHttpServer())
      .post('/enrollments')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        studentId: student1ProfileId,
        groupId,
        joinDate: '2024-09-01',
      })
      .expect((response) => {
        const status = response.status;
        if (status !== 201 && status !== 200) {
          throw new Error(`Expected 200 or 201, got ${status}`);
        }
      });

    expect(res.body.studentId).toBe(student1ProfileId);
    expect(res.body.groupId).toBe(groupId);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.joinDate).toBe('2024-09-01T00:00:00.000Z');

    enrollment1Id = res.body.id;
    expect(enrollment1Id).toBeDefined();
  });

  it('POST /enrollments - TEACHER should be forbidden', async () => {
    await request(app.getHttpServer())
      .post('/enrollments')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .send({
        studentId: student1ProfileId,
        groupId,
        joinDate: '2024-09-02',
      })
      .expect(403);
  });

  it('POST /enrollments - MANAGER should create second enrollment', async () => {
    const res = await request(app.getHttpServer())
      .post('/enrollments')
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .send({
        studentId: student2ProfileId,
        groupId,
        joinDate: '2024-09-02',
      })
      .expect((response) => {
        const status = response.status;
        if (status !== 201 && status !== 200) {
          throw new Error(`Expected 200 or 201, got ${status}`);
        }
      });

    expect(res.body.studentId).toBe(student2ProfileId);
    expect(res.body.groupId).toBe(groupId);
    expect(res.body.status).toBe('ACTIVE');

    enrollment2Id = res.body.id;
    expect(enrollment2Id).toBeDefined();
  });

  it('GET /enrollments - ADMIN should see enrollments list', async () => {
    const res = await request(app.getHttpServer())
      .get('/enrollments')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    const body = res.body;

    expect(body).toHaveProperty('meta');
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(2);

    const e1 = body.items.find(
      (e: any) => String(e.studentId) === String(student1ProfileId),
    );
    const e2 = body.items.find(
      (e: any) => String(e.studentId) === String(student2ProfileId),
    );

    expect(e1).toBeDefined();
    expect(e2).toBeDefined();

    expect(e1.group.id).toBe(groupId);
    expect(e2.group.id).toBe(groupId);

    const e1FullName = `${e1.student.user.firstName} ${e1.student.user.lastName}`;
    const e2FullName = `${e2.student.user.firstName} ${e2.student.user.lastName}`;

    expect(e1FullName).toBe('Ali Valiyev');
    expect(e2FullName).toBe('Hasan Karimov');
  });
  it('GET /enrollments/:id - MANAGER should get by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/enrollments/${enrollment1Id}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    expect(res.body.id).toBe(enrollment1Id);
    expect(res.body.studentId).toBe(student1ProfileId);
    expect(res.body.group.id).toBe(groupId);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('PATCH /enrollments/:id - MANAGER should mark enrollment as LEFT', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/enrollments/${enrollment1Id}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .send({
        status: 'LEFT',
        leaveDate: '2024-12-01',
      })
      .expect(200);

    expect(res.body.id).toBe(enrollment1Id);
    expect(res.body.status).toBe('LEFT');
    expect(res.body.leaveDate).toBe('2024-12-01T00:00:00.000Z');
  });

  it('DELETE /enrollments/:id - MANAGER should soft delete (LEFT) enrollment', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/enrollments/${enrollment2Id}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    expect(res.body.id).toBe(enrollment2Id);
    expect(res.body.status).toBe('LEFT');
    expect(res.body.leaveDate).toBeDefined();

    const dbEnrollment = await prisma.enrollment.findUnique({
      where: { id: enrollment2Id },
    });

    expect(dbEnrollment).not.toBeNull();
    expect(dbEnrollment!.status).toBe('LEFT');
    expect(dbEnrollment!.leaveDate).not.toBeNull();
  });

  it('GET /enrollments - TEACHER should be forbidden', async () => {
    await request(app.getHttpServer())
      .get('/enrollments')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .expect(403);
  });
});
