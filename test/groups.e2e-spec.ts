// test/groups.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const request = require('supertest');

describe('Groups e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ADMIN_PHONE = '+998900000001';
  const MANAGER_PHONE = '+998900000002';
  const TEACHER_PHONE = '+998900000003';
  const PASSWORD = 'Admin12345!';

  let adminAccessToken: string;
  let managerAccessToken: string;
  let teacherAccessToken: string;

  let roomId: string;
  let createdGroupId: string;

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

    const room = await prisma.room.create({
      data: {
        name: 'room-1',
        capacity: 20,
      },
    });
    roomId = room.id;

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

  it('POST /groups - ADMIN should create group', async () => {
    const res = await request(app.getHttpServer())
      .post('/groups')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        name: 'Guruh 1',
        capacity: 10,
        daysPattern: 'ODD',
        startTime: '09:00',
        endTime: '10:30',
        monthlyFee: 300000,
        roomId,
      })
      .expect((response) => {
        const status = response.status;
        if (status !== 201 && status !== 200) {
          throw new Error(`Expected 200 or 201, got ${status}`);
        }
      });

    expect(res.body).toMatchObject({
      name: 'Guruh 1',
      capacity: 10,
      daysPattern: 'ODD',
      startTime: '09:00',
      endTime: '10:30',
      monthlyFee: 300000,
      isActive: true,
      roomId,
    });

    createdGroupId = res.body.id;
    expect(createdGroupId).toBeDefined();
  });

  it('POST /groups - TEACHER should be forbidden', async () => {
    await request(app.getHttpServer())
      .post('/groups')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .send({
        name: 'Guruh 2',
        capacity: 5,
        daysPattern: 'ODD',
        startTime: '11:00',
        endTime: '12:00',
        monthlyFee: 200000,
        roomId,
      })
      .expect(403);
  });

  it('GET /groups - MANAGER should see created group in list', async () => {
    const res = await request(app.getHttpServer())
      .get('/groups')
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('meta');
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);

    const group = res.body.items.find(
      (g: any) => String(g.id) === String(createdGroupId),
    );

    expect(group).toBeDefined();
    expect(group.name).toBe('Guruh 1');
    expect(group.capacity).toBe(10);
    expect(group.isActive).toBe(true);
    expect(group.startTime).toBe('09:00');
    expect(group.endTime).toBe('10:30');
  });

  it('GET /groups/:id - MANAGER should get group by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/groups/${createdGroupId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: createdGroupId,
      name: 'Guruh 1',
      capacity: 10,
      daysPattern: 'ODD',
      startTime: '09:00',
      endTime: '10:30',
      monthlyFee: 300000,
      isActive: true,
      roomId,
    });
  });

  it('GET /groups/:id/students - TEACHER should get empty students list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/groups/${createdGroupId}/students`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('group');
    expect(res.body.group.id).toBe(createdGroupId);
    expect(res.body).toHaveProperty('students');
    expect(Array.isArray(res.body.students)).toBe(true);
    expect(res.body.students.length).toBe(0);
  });

  it('GET /groups/:id/stats - MANAGER should get stats', async () => {
    const res = await request(app.getHttpServer())
      .get(`/groups/${createdGroupId}/stats`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      group: {
        id: createdGroupId,
        name: 'Guruh 1',
        capacity: 10,
        isActive: true,
      },
      activeEnrollments: 0,
      remaining: 10,
      isFull: false,
    });
  });

  it('PATCH /groups/:id - MANAGER should update group', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/groups/${createdGroupId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .send({
        name: 'Guruh 1-updated',
        capacity: 15,
        startTime: '10:00',
        endTime: '11:30',
      })
      .expect(200);

    expect(res.body).toMatchObject({
      id: createdGroupId,
      name: 'Guruh 1-updated',
      capacity: 15,
      startTime: '10:00',
      endTime: '11:30',
      isActive: true,
      roomId,
    });
  });

  it('DELETE /groups/:id - MANAGER should soft delete group', async () => {
    await request(app.getHttpServer())
      .delete(`/groups/${createdGroupId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect((response) => {
        const status = response.status;
        if (![200, 204].includes(status)) {
          throw new Error(`Expected 200 or 204, got ${status}`);
        }
      });

    const g = await prisma.group.findUnique({
      where: { id: createdGroupId },
    });

    expect(g).not.toBeNull();
    expect(g!.isActive).toBe(false);
  });
});
