import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { DynamicConnectionService } from './dynamic-connection.service';

@Global()
@Module({
  providers: [DatabaseService, DynamicConnectionService],
  exports: [DatabaseService, DynamicConnectionService],
})
export class DatabaseModule {}
