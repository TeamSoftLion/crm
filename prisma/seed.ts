import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminPhone = '+998900001122';
  const exists = await prisma.user.findUnique({ where: { phone: adminPhone } });
  if (exists) {
    console.log('Admin already exists');
    return;
  }
  const passwordHash = await argon2.hash('Admin@12345');
  await prisma.user.create({
    data: {
      firstName: 'Super',
      lastName: 'Admin',
      phone: adminPhone,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log('Admin created. phone:', adminPhone, 'password: Admin@12345');
}

main().finally(() => prisma.$disconnect());
