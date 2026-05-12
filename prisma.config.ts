import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'data/prisma/schema.prisma',
  migrations: {
    path: 'data/prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
