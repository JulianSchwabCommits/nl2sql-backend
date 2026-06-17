import { Injectable, Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import databaseConfig from '../config/database.config';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
}

export interface ChatExchange {
  prompt: string;
  reply: string;
  timestamp: string;
}

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly client: Redis,
    @Inject(databaseConfig.KEY)
    private readonly cfg: ConfigType<typeof databaseConfig>,
  ) {}


  private conversationKey(userId: number, conversationId: string): string {
    return `user:${userId}:conversation:${conversationId}`;
  }

  private conversationListKey(userId: number): string {
    return `user:${userId}:conversations`;
  }

  private rateLimitKey(userId: string): string {
    return `ratelimit:agent:user:${userId}`;
  }

  async checkRateLimit(
    userId: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; count: number; limit: number }> {
    const script = `
      local current = tonumber(redis.call('GET', KEYS[1]) or '0')
      if current >= tonumber(ARGV[1]) then
        return -1
      end
      current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[2])
      end
      return current
    `;
    const result = (await this.client.eval(
      script,
      1,
      this.rateLimitKey(userId),
      limit,
      windowMs,
    )) as number;

    if (result === -1) {
      return { allowed: false, count: limit, limit };
    }
    return { allowed: true, count: result, limit };
  }

  async createConversation(
    userId: number,
    conversationId: string,
    title: string,
  ): Promise<Conversation> {
    const conversation: Conversation = {
      id: conversationId,
      title,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    await this.client.hset(
      this.conversationKey(userId, conversationId),
      'meta',
      JSON.stringify({
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt,
      }),
    );
    await this.client.zadd(
      this.conversationListKey(userId),
      Date.now(),
      conversationId,
    );
    this.logger.log(
      `Redis WRITE createConversation user=${userId} conversation=${conversationId} title="${title}"`,
    );
    return conversation;
  }

  async addMessage(
    userId: number,
    conversationId: string,
    message: ChatMessage,
  ): Promise<void> {
    const key = this.conversationKey(userId, conversationId);
    await this.client.rpush(`${key}:messages`, JSON.stringify(message));
    await this.client.ltrim(
      `${key}:messages`,
      -this.cfg.maxMessagesPerConversation,
      -1,
    );
    this.logger.log(
      `Redis WRITE addMessage user=${userId} conversation=${conversationId} role=${message.role} messageId=${message.id}`,
    );
  }

  async updateConversationTitle(
    userId: number,
    conversationId: string,
    title: string,
  ): Promise<void> {
    const key = this.conversationKey(userId, conversationId);
    const metaRaw = await this.client.hget(key, 'meta');
    if (!metaRaw) return;
    const meta = JSON.parse(metaRaw);
    meta.title = title;
    await this.client.hset(key, 'meta', JSON.stringify(meta));
    this.logger.log(
      `Redis WRITE updateConversationTitle user=${userId} conversation=${conversationId} title="${title}"`,
    );
  }

  async getConversation(
    userId: number,
    conversationId: string,
  ): Promise<Conversation | null> {
    const key = this.conversationKey(userId, conversationId);
    const metaRaw = await this.client.hget(key, 'meta');
    if (!metaRaw) return null;
    const meta = JSON.parse(metaRaw);
    const messagesRaw = await this.client.lrange(`${key}:messages`, 0, -1);
    const messages = messagesRaw.map((m: string) => JSON.parse(m) as ChatMessage);
    return { ...meta, messages };
  }

  async getAllConversations(userId: number): Promise<Conversation[]> {
    const ids = await this.client.zrevrange(
      this.conversationListKey(userId),
      0,
      -1,
    );
    const conversations: Conversation[] = [];
    for (const id of ids) {
      const conv = await this.getConversation(userId, id);
      if (conv) conversations.push(conv);
    }
    return conversations;
  }

  async deleteConversation(
    userId: number,
    conversationId: string,
  ): Promise<void> {
    const key = this.conversationKey(userId, conversationId);
    await this.client.del(key, `${key}:messages`);
    await this.client.zrem(this.conversationListKey(userId), conversationId);
    this.logger.log(
      `Redis DELETE deleteConversation user=${userId} conversation=${conversationId}`,
    );
  }


  async getConversationHistory(
    userId: number,
    conversationId: string,
    limit?: number,
  ): Promise<ChatExchange[]> {
    const effectiveLimit = limit ?? this.cfg.defaultHistoryLimit;
    const key = `${this.conversationKey(userId, conversationId)}:messages`;
    const messagesRaw = await this.client.lrange(key, -effectiveLimit * 2, -1);
    const messages = messagesRaw.map((m: string) => JSON.parse(m) as ChatMessage);

    const exchanges: ChatExchange[] = [];
    for (let i = 0; i < messages.length - 1; i += 2) {
      if (
        messages[i].role === 'user' &&
        messages[i + 1]?.role === 'assistant'
      ) {
        exchanges.push({
          prompt: messages[i].content,
          reply: messages[i + 1].content,
          timestamp: messages[i].timestamp,
        });
      }
    }
    return exchanges;
  }
}
