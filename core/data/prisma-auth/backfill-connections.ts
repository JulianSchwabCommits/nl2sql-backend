import { PrismaClient } from '.prisma/auth-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createCipheriv, randomBytes } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.AUTH_DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  const encryptionKey = process.env.DB_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error('DB_ENCRYPTION_KEY is required');
  
  const host = process.env.DEFAULT_DATABASE_HOST;
  const port = parseInt(process.env.DEFAULT_DATABASE_PORT || '5432', 10);
  const database = process.env.DEFAULT_DATABASE_DB;
  const username = process.env.DEFAULT_DATABASE_USERNAME;
  const password = process.env.DEFAULT_DATABASE_PASSWORD;
  const ssl = process.env.DEFAULT_DATABASE_SSL === 'true';
  const name = process.env.DEFAULT_DATABASE_NAME || 'Food Database (Demo)';

  if (!host || !database || !username || !password) {
    throw new Error('DEFAULT_DATABASE_* env vars are required');
  }

  const approvedUsers = await prisma.user.findMany({
    where: { approved: true },
    select: { id: true, email: true },
  });

  let created = 0;
  for (const user of approvedUsers) {
    const existing = await prisma.databaseConnection.findFirst({
      where: { userId: user.id, name },
    });
    if (existing) {
      console.log(`Skipping ${user.email} - already has demo connection`);
      continue;
    }

    await prisma.databaseConnection.create({
      data: {
        userId: user.id,
        name,
        host,
        port,
        database,
        username,
        password: encrypt(password, encryptionKey),
        ssl,
      },
    });
    created++;
    console.log(`Created demo connection for ${user.email}`);
  }

  console.log(`Done. Created ${created} connections for ${approvedUsers.length} approved users.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
