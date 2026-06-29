import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { DatabaseClientService } from './database-client.service';

@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService, DatabaseClientService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
