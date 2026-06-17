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

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables must be set');
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);

  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existing) {
    // Re-seeding is idempotent: reset the password to ADMIN_PASSWORD and ensure
    // the account stays an approved ADMIN. Updating the password here matters —
    // otherwise a re-seed would silently keep the old (possibly unknown) password.
    await prisma.user.update({
      where: { email: adminEmail },
      data: { password: adminPassword, role: 'ADMIN', approved: true },
    });
    console.log(`Updated existing user ${adminEmail}: password reset + ADMIN role`);
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
    console.log(`Created admin user: ${adminEmail}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
