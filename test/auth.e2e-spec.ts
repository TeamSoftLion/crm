import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
const request = require('supertest');
import { AppModule } from '../src/app.module';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

describe('Auth e2e (login)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const TEST_PHONE = '+998900001122';
  const TEST_PASSWORD = 'Admin12345!';
  let teacherUserId: string;

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

    const passwordHash = await argon2.hash(TEST_PASSWORD);

    const user = await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'Teacher',
        phone: TEST_PHONE,
        passwordHash,
        role: Role.TEACHER,
        isActive: true,
      },
    });

    teacherUserId = user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login - success', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        phone: TEST_PHONE,
        password: TEST_PASSWORD,
      })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.phone).toBe(TEST_PHONE);
    expect(res.body.user.role).toBe('TEACHER');
  });

  it('POST /auth/login - wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        phone: TEST_PHONE,
        password: 'WrongPassword!',
      })
      .expect(401);
  });
});
