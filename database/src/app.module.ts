import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerOptions } from '@nl2sql/logger';
import { AppController } from './app.controller';
import databaseConfig from './config/database.config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { InternalModule } from './internal/internal.module';


const REQUIRED_ENV = ['DATABASE_URL', 'REDIS_URL', 'INTERNAL_API_KEY'];

@Module({
  imports: [
    LoggerModule.forRoot(buildLoggerOptions('database')),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      validate: (config: Record<string, unknown>) => {
        const missing = REQUIRED_ENV.filter((key) => !config[key]);
        if (missing.length > 0) {
          throw new Error(
            `Missing required environment variables: ${missing.join(', ')}`,
          );
        }
        return config;
      },
    }),
    DatabaseModule,
    RedisModule,
    InternalModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
