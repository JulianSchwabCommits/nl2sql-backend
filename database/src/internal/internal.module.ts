import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { SchemaLoaderService } from '../schema/schema-loader.service';
import { QueryController } from './query.controller';
import { ConversationsController } from './conversations.controller';


@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [QueryController, ConversationsController],
  providers: [SchemaLoaderService],
})
export class InternalModule {}
