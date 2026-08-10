import { Global, Module } from '@nestjs/common';
import { DynamicConnectionService } from './dynamic-connection.service';
import { SshTunnelService } from './ssh-tunnel.service';

@Global()
@Module({
  providers: [DynamicConnectionService, SshTunnelService],
  exports: [DynamicConnectionService, SshTunnelService],
})
export class DatabaseModule {}
