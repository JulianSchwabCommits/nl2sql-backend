import { PrismaClient } from '.prisma/auth-client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.AUTH_DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  const adminEmail = 'jla.schwab@gmail.com';
  const adminPassword = await bcrypt.hash('admin12345', 10);

  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existing) {
    // Update existing user to admin
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: 'ADMIN', approved: true },
    });
    console.log(`Updated existing user ${adminEmail} to ADMIN role`);
  } else {
    // Create admin user
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: adminPassword,
        name: 'Admin',
        role: 'ADMIN',
        approved: true,
      },
    });
    console.log(`Created admin user: ${adminEmail} (password: admin12345)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
