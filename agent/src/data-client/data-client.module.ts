import { Global, Module } from '@nestjs/common';
import { DataClientService } from './data-client.service';

@Global()
@Module({
  providers: [DataClientService],
  exports: [DataClientService],
})
export class DataClientModule {}
