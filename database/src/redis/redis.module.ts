import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import databaseConfig from '../config/database.config';
import { RedisService } from './redis.service';

function redisFactory(
  config: ConfigService,
  cfg: ConfigType<typeof databaseConfig>,
): Redis {
  const logger = new Logger('RedisClient');
  const client = new Redis(config.getOrThrow<string>('REDIS_URL'), {

    retryStrategy: (times) =>
      Math.min(times * cfg.redisRetryStepMs, cfg.redisRetryMaxMs),
  });

  let down = false;
  client.on('error', (err) => {
    if (!down) {
      down = true;
      logger.warn(`Redis unavailable: ${err.message} (retrying in background)`);
    }
  });
  client.on('ready', () => {
    down = false;
    logger.log('Redis connection ready');
  });
  return client;
}

@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: redisFactory,
      inject: [ConfigService, databaseConfig.KEY],
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
