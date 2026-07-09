import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthDatabaseService } from '../auth-database';
import { CryptoService } from '../crypto';
import { UpsertLlmSettingsDto } from './dto';

@Injectable()
export class LlmSettingsService {
  constructor(
    private readonly db: AuthDatabaseService,
    private readonly crypto: CryptoService,
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
    };
  }
}
