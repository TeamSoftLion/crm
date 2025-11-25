import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
const request = require('supertest');
import * as argon from 'argon2';
import { Role } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('Users e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const TEST_PHONE = '+998900001234';
  const TEST_PASSWORD = 'Test12345!';
  const NEW_PASSWORD = 'NewPass123!';
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.teachingAssignment.deleteMany();
    await prisma.attendanceRecord.deleteMany();
    await prisma.attendanceSheet.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.studentProfile.deleteMany();
    await prisma.teacherProfile.deleteMany();
    await prisma.managerProfile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.room.deleteMany();
    await prisma.group.deleteMany();

    const passwordHash = await argon.hash(TEST_PASSWORD);

    const user = await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'User',
        phone: TEST_PHONE,
        passwordHash,
        role: Role.TEACHER,
        isActive: true,
      },
    });

    userId = user.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        phone: TEST_PHONE,
        password: TEST_PASSWORD,
      })
      .expect(200);

    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });
  it('GET /users/me - should return current user', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: userId,
      phone: TEST_PHONE,
    });
  });
  it('PATCH /users/me/change-password - should change password', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        oldPassword: TEST_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);

    const oldLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        phone: TEST_PHONE,
        password: TEST_PASSWORD,
      });

    expect([400, 401]).toContain(oldLogin.status);

    const newLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        phone: TEST_PHONE,
        password: NEW_PASSWORD,
      })
      .expect(200);

    expect(newLogin.body).toHaveProperty('accessToken');
  });
});
