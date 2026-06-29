import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { InternalConnectionsController } from './internal-connections.controller';
import { ConnectionsModule } from '../connections';

@Module({
  imports: [ConnectionsModule],
  controllers: [InternalController, InternalConnectionsController],
})
export class InternalModule {}
