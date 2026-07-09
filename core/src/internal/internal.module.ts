import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { InternalConnectionsController } from './internal-connections.controller';
import { InternalLlmSettingsController } from './internal-llm-settings.controller';
import { ConnectionsModule } from '../connections';
import { LlmSettingsModule } from '../llm-settings';

@Module({
  imports: [ConnectionsModule, LlmSettingsModule],
  controllers: [InternalController, InternalConnectionsController, InternalLlmSettingsController],
})
export class InternalModule {}
