import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AuthDatabaseService } from '../auth-database';
import { CryptoService } from '../crypto';
import { AppDefaultsService, APP_DEFAULT_KEYS } from '../app-defaults';
import { UpsertLlmSettingsDto } from './dto';

@Injectable()
export class LlmSettingsService {
  private static readonly FALLBACK_PROMPT =
    'You are an expert SQL assistant. Help users write and understand SQL queries.';

  constructor(
    private readonly db: AuthDatabaseService,
    private readonly crypto: CryptoService,
    private readonly appDefaults: AppDefaultsService,
  ) {}

  async getForUser(userId: number) {
    const settings = await this.db.llmSettings.findUnique({
      where: { userId },
      select: {
        id: true,
        provider: true,
        model: true,
        apiKey: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!settings) return null;

    return {
      id: settings.id,
      provider: settings.provider,
      model: settings.model,
      hasApiKey: !!settings.apiKey,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  async upsert(userId: number, dto: UpsertLlmSettingsDto) {
    const existing = await this.db.llmSettings.findUnique({
      where: { userId },
    });

    // If no existing settings and no apiKey provided, reject
    if (!existing && !dto.apiKey) {
      throw new NotFoundException('API key is required for initial setup');
    }

    const updateData: { provider: string; model: string; apiKey?: string } = {
      provider: dto.provider,
      model: dto.model,
    };

    // Only update the key if a new one was provided
    if (dto.apiKey) {
      updateData.apiKey = this.crypto.encrypt(dto.apiKey);
    }

    const settings = await this.db.llmSettings.upsert({
      where: { userId },
      create: {
        userId,
        provider: dto.provider,
        model: dto.model,
        apiKey: updateData.apiKey ?? '',
      },
      update: updateData,
      select: {
        id: true,
        provider: true,
        model: true,
        apiKey: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      id: settings.id,
      provider: settings.provider,
      model: settings.model,
      hasApiKey: !!settings.apiKey,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  async delete(userId: number) {
    const existing = await this.db.llmSettings.findUnique({
      where: { userId },
    });
    if (!existing) throw new NotFoundException('LLM settings not found');
    await this.db.llmSettings.delete({ where: { userId } });
  }

  async getDecryptedForUser(userId: number) {
    const settings = await this.db.llmSettings.findUnique({
      where: { userId },
    });
    if (!settings) return null;

    return {
      provider: settings.provider,
      model: settings.model,
      apiKey: this.crypto.decrypt(settings.apiKey),
      systemPrompt: settings.systemPrompt ?? await this.getDefaultPrompt(),
    };
  }

  private async getDefaultPrompt(): Promise<string> {
    return (
      (await this.appDefaults.get(APP_DEFAULT_KEYS.SYSTEM_PROMPT)) ??
      LlmSettingsService.FALLBACK_PROMPT
    );
  }

  async getDefaultSystemPrompt(): Promise<string> {
    return this.getDefaultPrompt();
  }

  async getSystemPrompt(userId: number) {
    const settings = await this.db.llmSettings.findUnique({
      where: { userId },
      select: { systemPrompt: true, useDefaultPrompt: true },
    });
    const defaultPrompt = await this.getDefaultPrompt();
    return {
      systemPrompt: settings?.systemPrompt ?? defaultPrompt,
      isCustom: !!settings?.systemPrompt,
      isDefault: settings?.useDefaultPrompt ?? true,
    };
  }

  async updateSystemPrompt(userId: number, systemPrompt: string) {
    const existing = await this.db.llmSettings.findUnique({
      where: { userId },
    });
    if (!existing) {
      throw new NotFoundException(
        'LLM settings not found. Please configure your API key first.',
      );
    }
    await this.db.llmSettings.update({
      where: { userId },
      data: { systemPrompt, useDefaultPrompt: false },
    });
    return { systemPrompt, isCustom: true, isDefault: false };
  }

  async resetSystemPrompt(userId: number) {
    const existing = await this.db.llmSettings.findUnique({
      where: { userId },
    });
    if (!existing) {
      throw new NotFoundException('LLM settings not found');
    }
    await this.db.llmSettings.update({
      where: { userId },
      data: { systemPrompt: null, useDefaultPrompt: true },
    });
    return { systemPrompt: await this.getDefaultPrompt(), isCustom: false, isDefault: true };
  }

  async getModels(userId: number) {
    const settings = await this.db.llmSettings.findUnique({
      where: { userId },
    });
    if (!settings?.apiKey) {
      throw new BadRequestException(
        'API key not configured. Please add your API key first.',
      );
    }

    const apiKey = this.crypto.decrypt(settings.apiKey);

    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new BadRequestException(
        error?.error?.message ?? 'Failed to fetch models from OpenAI',
      );
    }

    const data = await response.json();
    const models = (data.data ?? [])
      .filter((m: { id: string }) => m.id.startsWith('gpt-'))
      .map((m: { id: string }) => ({ id: m.id, name: m.id }))
      .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));

    return models;
  }
}
