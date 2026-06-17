import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Food (main) database. The schema/migrations live inside this service because
// the database-service is the sole owner of the Food Postgres instance.
export default defineConfig({
  schema: 'data/prisma/schema.prisma',
  migrations: {
    path: 'data/prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
