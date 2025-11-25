// test/rooms.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';

const request = require('supertest');

describe('Rooms e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ADMIN_PHONE = '+998900000001';
  const MANAGER_PHONE = '+998900000002';
  const PASSWORD = 'Admin12345!';

  let adminAccessToken: string;
  let managerAccessToken: string;
  let createdRoomId: string;

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
    await prisma.studentProfile.deleteMany();
    await prisma.teacherProfile.deleteMany();
    await prisma.managerProfile.deleteMany();
    await prisma.group.deleteMany();
    await prisma.room.deleteMany();
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

  it('POST /rooms - ADMIN should create rooms', async () => {
    const res = await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        name: 'ds-1',
        capacity: 12,
      })
      .expect((response) => {
        const status = response.status;
        if (status !== 200 && status !== 201) {
          throw new Error(`Expected 200 or 201, got ${status}`);
        }
      });

    expect(res.body).toMatchObject({
      name: 'ds-1',
      capacity: 12,
      isActive: true,
    });

    createdRoomId = res.body.id;
    expect(createdRoomId).toBeDefined();
  });

  it('POST /rooms - MANAGER should be forbidden', async () => {
    await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .send({
        name: 'ds-2',
        capacity: 10,
      })
      .expect(403);
  });

  it('GET /rooms - MANAGER should get list (includes created room)', async () => {
    const res = await request(app.getHttpServer())
      .get('/rooms')
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    const rooms = res.body as any[];

    expect(Array.isArray(rooms)).toBe(true);
    expect(rooms.length).toBeGreaterThanOrEqual(1);

    const room = rooms.find((r: any) => String(r.id) === String(createdRoomId));

    expect(room).toBeDefined();
    expect(room.name).toBe('ds-1');
    expect(room.capacity).toBe(12);
    expect(room.isActive).toBe(true);
  });

  it('PATCH /rooms/:id - MANAGER should update room', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/rooms/${createdRoomId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .send({
        name: 'ds-1-updated',
        capacity: 15,
      })
      .expect(200);

    expect(res.body).toMatchObject({
      id: createdRoomId,
      name: 'ds-1-updated',
      capacity: 15,
      isActive: true,
    });
  });

  it('DELETE /rooms/:id - MANAGER should soft delete room', async () => {
    await request(app.getHttpServer())
      .delete(`/rooms/${createdRoomId}`)
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect((response) => {
        const status = response.status;
        if (![200, 204].includes(status)) {
          throw new Error(`Expected 200 or 204, got ${status}`);
        }
      });

    const room = await prisma.room.findUnique({
      where: { id: createdRoomId },
    });

    expect(room).not.toBeNull();
    expect(room!.isActive).toBe(false);
  });
});
