import { Global, Module } from '@nestjs/common';
import { CoreClientService } from './core-client.service';

@Global()
@Module({
  providers: [CoreClientService],
  exports: [CoreClientService],
})
export class CoreClientModule {}
