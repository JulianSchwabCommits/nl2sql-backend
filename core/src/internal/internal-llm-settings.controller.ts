import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public, InternalGuard } from '@nl2sql/auth';
import { LlmSettingsService } from '../llm-settings';

@SkipThrottle()
@Public()
@UseGuards(InternalGuard)
@Controller('internal/llm-settings')
export class InternalLlmSettingsController {
  constructor(private readonly llmSettings: LlmSettingsService) {}

  @Get('user/:userId')
  async getForUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.llmSettings.getDecryptedForUser(userId);
  }
}
