import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'data/prisma-auth/schema.prisma',
  migrations: {
    path: 'data/prisma-auth/migrations',
  },
  datasource: {
    url: process.env['AUTH_DATABASE_URL'],
  },
});
