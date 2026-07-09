import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { LlmSettingsService } from './llm-settings.service';
import { UpsertLlmSettingsDto } from './dto';

@Controller('auth/llm-settings')
export class LlmSettingsController {
  constructor(private readonly llmSettings: LlmSettingsService) {}

  @Get()
  async get(@Req() req: Request) {
    const userId = req['user'].sub;
    return this.llmSettings.getForUser(userId);
  }

  @Put()
  async upsert(@Req() req: Request, @Body() dto: UpsertLlmSettingsDto) {
    const userId = req['user'].sub;
    return this.llmSettings.upsert(userId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: Request) {
    const userId = req['user'].sub;
    await this.llmSettings.delete(userId);
  }
}
