import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerOptions } from '@nl2sql/logger';
import coreConfig from './config/core.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthDatabaseModule } from './auth-database';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin';
import { InternalModule } from './internal/internal.module';


const REQUIRED_ENV = [
  'AUTH_DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'INTERNAL_API_KEY',
];

@Module({
  imports: [
    LoggerModule.forRoot(buildLoggerOptions('core')),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [coreConfig],
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
    ThrottlerModule.forRootAsync({
      inject: [coreConfig.KEY],
      useFactory: (cfg: ConfigType<typeof coreConfig>) => [
        {
          name: 'short',
          ttl: cfg.throttleShortTtlMs,
          limit: cfg.throttleShortLimit,
        },
        {
          name: 'long',
          ttl: cfg.throttleLongTtlMs,
          limit: cfg.throttleLongLimit,
        },
      ],
    }),
    AuthDatabaseModule,
    AuthModule,
    AdminModule,
    InternalModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
