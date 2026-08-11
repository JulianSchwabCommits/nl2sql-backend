import {
  Controller,
  Get,
  Put,
  Post,
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

  @Get('system-prompt')
  async getSystemPrompt(@Req() req: Request) {
    const userId = req['user'].sub;
    return this.llmSettings.getSystemPrompt(userId);
  }

  @Put('system-prompt')
  async updateSystemPrompt(
    @Req() req: Request,
    @Body('systemPrompt') systemPrompt: string,
  ) {
    const userId = req['user'].sub;
    return this.llmSettings.updateSystemPrompt(userId, systemPrompt);
  }

  @Post('system-prompt/reset')
  async resetSystemPrompt(@Req() req: Request) {
    const userId = req['user'].sub;
    return this.llmSettings.resetSystemPrompt(userId);
  }

  @Get('models')
  async getModels(@Req() req: Request) {
    const userId = req['user'].sub;
    return this.llmSettings.getModels(userId);
  }
}
