import { Module } from '@nestjs/common';
import { LlmSettingsController } from './llm-settings.controller';
import { LlmSettingsService } from './llm-settings.service';
import { AppDefaultsModule } from '../app-defaults';

@Module({
  imports: [AppDefaultsModule],
  controllers: [LlmSettingsController],
  providers: [LlmSettingsService],
  exports: [LlmSettingsService],
})
export class LlmSettingsModule {}
