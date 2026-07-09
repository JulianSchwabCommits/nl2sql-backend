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

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
}

export interface ConversationListResponse {
  conversations: ConversationMeta[];
  total: number;
  hasMore: boolean;
}

export interface ConnectionCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

export interface ConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  ssl: boolean;
}

export interface LlmSettings {
  provider: string;
  model: string;
  apiKey: string;
}

@Injectable()
export class DataClientService {
  private readonly logger = new Logger(DataClientService.name);
  private readonly baseUrl: string;
  private readonly coreUrl: string;
  private readonly internalKey: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(agentConfig.KEY)
    private readonly cfg: ConfigType<typeof agentConfig>,
  ) {
    this.baseUrl = this.config
      .getOrThrow<string>('DATABASE_SERVICE_URL')
      .replace(/\/$/, '');
    this.coreUrl = this.config
      .getOrThrow<string>('CORE_SERVICE_URL')
      .replace(/\/$/, '');
    this.internalKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');
  }

  async listUserConnections(userId: number): Promise<ConnectionInfo[]> {
    return this.request('GET', `/internal/connections/user/${userId}`, undefined, this.coreUrl);
  }

  async getConnectionCredentials(connectionId: string): Promise<ConnectionCredentials & { id: string; name: string }> {
    return this.request('GET', `/internal/connections/${connectionId}/credentials`, undefined, this.coreUrl);
  }

  async getUserLlmSettings(userId: number): Promise<LlmSettings | null> {
    return this.request('GET', `/internal/llm-settings/user/${userId}`, undefined, this.coreUrl);
  }

  async getSchemaForConnection(credentials: ConnectionCredentials): Promise<string> {
    const data = await this.request<{ schema: string }>(
      'POST',
      '/internal/schema',
      { credentials },
    );
    return data.schema;
  }

  async executeReadWithCredentials(sql: string, credentials: ConnectionCredentials): Promise<any[]> {
    const data = await this.request<{ rows: any[]; rowCount: number }>(
      'POST',
      '/internal/query/read',
      { sql, credentials },
    );
    return data.rows;
  }

  async executeWriteWithCredentials(sql: string, credentials: ConnectionCredentials): Promise<number> {
    const data = await this.request<{ affectedRows: number }>(
      'POST',
      '/internal/query/write',
      { sql, credentials },
    );
    return data.affectedRows;
  }

  async checkRateLimit(
    userId: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; count: number; limit: number }> {
    return this.request('POST', '/internal/rate-limit', {
      userId,
      limit,
      windowMs,
    });
  }

  getAllConversations(userId: number): Promise<Conversation[]> {
    return this.request('GET', `/internal/conversations/${userId}`);
  }

  getConversationsMeta(
    userId: number,
    offset = 0,
    limit = 15,
  ): Promise<ConversationListResponse> {
    return this.request(
      'GET',
      `/internal/conversations/${userId}/meta?offset=${offset}&limit=${limit}`,
    );
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
    baseUrlOverride?: string,
  ): Promise<T> {
    const base = baseUrlOverride || this.baseUrl;
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': this.internalKey,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error: any) {
      this.logger.error(`service unreachable (${base}): ${error.message}`);
      throw new InternalServerErrorException(
        'Data layer is currently unavailable',
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.error(
        `${method} ${base}${path} -> ${response.status}: ${text}`,
      );
      throw new InternalServerErrorException(
        `Service returned status ${response.status}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
