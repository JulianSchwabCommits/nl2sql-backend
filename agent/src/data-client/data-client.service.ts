import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import agentConfig from '../config/agent.config';
import {
  ChatExchange,
  ChatMessage,
  Conversation,
} from '../types';

@Injectable()
export class DataClientService {
  private readonly logger = new Logger(DataClientService.name);
  private readonly baseUrl: string;
  private readonly internalKey: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(agentConfig.KEY)
    private readonly cfg: ConfigType<typeof agentConfig>,
  ) {
    this.baseUrl = this.config
      .getOrThrow<string>('DATABASE_SERVICE_URL')
      .replace(/\/$/, '');
    this.internalKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');
  }


  async getSchema(): Promise<string> {
    const data = await this.request<{ schema: string }>(
      'GET',
      '/internal/schema',
    );
    return data.schema;
  }

  async executeRead(sql: string): Promise<any[]> {
    const data = await this.request<{ rows: any[]; rowCount: number }>(
      'POST',
      '/internal/query/read',
      { sql },
    );
    return data.rows;
  }

  async executeWrite(sql: string): Promise<number> {
    const data = await this.request<{ affectedRows: number }>(
      'POST',
      '/internal/query/write',
      { sql },
    );
    return data.affectedRows;
  }

  getAllConversations(userId: number): Promise<Conversation[]> {
    return this.request('GET', `/internal/conversations/${userId}`);
  }

  getConversation(
    userId: number,
    conversationId: string,
  ): Promise<Conversation | null> {
    return this.request(
      'GET',
      `/internal/conversations/${userId}/${conversationId}`,
    );
  }

  getConversationHistory(
    userId: number,
    conversationId: string,
    limit?: number,
  ): Promise<ChatExchange[]> {
    const effectiveLimit = limit ?? this.cfg.historyFetchLimit;
    return this.request(
      'GET',
      `/internal/conversations/${userId}/${conversationId}/history?limit=${effectiveLimit}`,
    );
  }

  createConversation(
    userId: number,
    conversationId: string,
    title: string,
  ): Promise<Conversation> {
    return this.request('POST', `/internal/conversations/${userId}`, {
      conversationId,
      title,
    });
  }

  async addMessage(
    userId: number,
    conversationId: string,
    message: ChatMessage,
  ): Promise<void> {
    await this.request(
      'POST',
      `/internal/conversations/${userId}/${conversationId}/messages`,
      { message },
    );
  }

  async updateConversationTitle(
    userId: number,
    conversationId: string,
    title: string,
  ): Promise<void> {
    await this.request(
      'PATCH',
      `/internal/conversations/${userId}/${conversationId}/title`,
      { title },
    );
  }

  async deleteConversation(
    userId: number,
    conversationId: string,
  ): Promise<void> {
    await this.request(
      'DELETE',
      `/internal/conversations/${userId}/${conversationId}`,
    );
  }

  private async request<T = any>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': this.internalKey,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error: any) {
      this.logger.error(`database-service unreachable: ${error.message}`);
      throw new InternalServerErrorException(
        'Data layer is currently unavailable',
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.error(
        `database-service ${method} ${path} -> ${response.status}: ${text}`,
      );
      throw new InternalServerErrorException(
        `Data layer returned status ${response.status}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
