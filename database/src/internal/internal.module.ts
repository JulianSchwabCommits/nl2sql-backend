import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { QueryController } from './query.controller';
import { ConversationsController } from './conversations.controller';
import { RateLimitController } from './rate-limit.controller';


@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [QueryController, ConversationsController, RateLimitController],
})
export class InternalModule {}
