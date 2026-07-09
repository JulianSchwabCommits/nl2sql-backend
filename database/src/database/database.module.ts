import { Global, Module } from '@nestjs/common';
import { DynamicConnectionService } from './dynamic-connection.service';

@Global()
@Module({
  providers: [DynamicConnectionService],
  exports: [DynamicConnectionService],
})
export class DatabaseModule {}
