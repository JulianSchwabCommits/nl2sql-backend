import { Module } from '@nestjs/common';
import { LlmSettingsController } from './llm-settings.controller';
import { LlmSettingsService } from './llm-settings.service';

@Module({
  controllers: [LlmSettingsController],
  providers: [LlmSettingsService],
  exports: [LlmSettingsService],
})
export class LlmSettingsModule {}
