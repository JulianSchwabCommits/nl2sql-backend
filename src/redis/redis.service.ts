import { Injectable, Inject, Logger } from "@nestjs/common";
import Redis from "ioredis";

const MAX_MESSAGES_PER_CONVERSATION = 200;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
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

  constructor(@Inject("REDIS_CLIENT") private readonly client: Redis) {}

  // --- Conversation-based storage ---

  private conversationKey(userId: number, conversationId: string): string {
    return `user:${userId}:conversation:${conversationId}`;
  }

  private conversationListKey(userId: number): string {
    return `user:${userId}:conversations`;
  }

  async createConversation(userId: number, conversationId: string, title: string): Promise<Conversation> {
    const conversation: Conversation = {
      id: conversationId,
      title,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    // Store conversation metadata
    await this.client.hset(
      this.conversationKey(userId, conversationId),
      "meta",
      JSON.stringify({ id: conversation.id, title: conversation.title, createdAt: conversation.createdAt }),
    );
    // Add to user's conversation list (sorted set by creation time)
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

  async addMessage(userId: number, conversationId: string, message: ChatMessage): Promise<void> {
    const key = this.conversationKey(userId, conversationId);
    await this.client.rpush(`${key}:messages`, JSON.stringify(message));
    // Trim to max
    await this.client.ltrim(`${key}:messages`, -MAX_MESSAGES_PER_CONVERSATION, -1);
    this.logger.log(
      `Redis WRITE addMessage user=${userId} conversation=${conversationId} role=${message.role} messageId=${message.id}`,
    );
  }

  async updateConversationTitle(userId: number, conversationId: string, title: string): Promise<void> {
    const key = this.conversationKey(userId, conversationId);
    const metaRaw = await this.client.hget(key, "meta");
    if (!metaRaw) return;
    const meta = JSON.parse(metaRaw);
    meta.title = title;
    await this.client.hset(key, "meta", JSON.stringify(meta));
    this.logger.log(
      `Redis WRITE updateConversationTitle user=${userId} conversation=${conversationId} title="${title}"`,
    );
  }

  async getConversation(userId: number, conversationId: string): Promise<Conversation | null> {
    const key = this.conversationKey(userId, conversationId);
    const metaRaw = await this.client.hget(key, "meta");
    if (!metaRaw) return null;
    const meta = JSON.parse(metaRaw);
    const messagesRaw = await this.client.lrange(`${key}:messages`, 0, -1);
    const messages = messagesRaw.map((m: string) => JSON.parse(m) as ChatMessage);
    return { ...meta, messages };
  }

  async getAllConversations(userId: number): Promise<Conversation[]> {
    // Get all conversation IDs (newest first)
    const ids = await this.client.zrevrange(this.conversationListKey(userId), 0, -1);
    const conversations: Conversation[] = [];
    for (const id of ids) {
      const conv = await this.getConversation(userId, id);
      if (conv) conversations.push(conv);
    }
    return conversations;
  }

  async deleteConversation(userId: number, conversationId: string): Promise<void> {
    const key = this.conversationKey(userId, conversationId);
    await this.client.del(key, `${key}:messages`);
    await this.client.zrem(this.conversationListKey(userId), conversationId);
    this.logger.log(
      `Redis DELETE deleteConversation user=${userId} conversation=${conversationId}`,
    );
  }

  // --- Context helper for OpenAI (last N messages from a conversation) ---

  async getConversationHistory(userId: number, conversationId: string, limit = 10): Promise<ChatExchange[]> {
    const key = `${this.conversationKey(userId, conversationId)}:messages`;
    const messagesRaw = await this.client.lrange(key, -limit * 2, -1);
    const messages = messagesRaw.map((m: string) => JSON.parse(m) as ChatMessage);

    // Convert pairs to ChatExchange for backwards compat with OpenAI service
    const exchanges: ChatExchange[] = [];
    for (let i = 0; i < messages.length - 1; i += 2) {
      if (messages[i].role === "user" && messages[i + 1]?.role === "assistant") {
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
