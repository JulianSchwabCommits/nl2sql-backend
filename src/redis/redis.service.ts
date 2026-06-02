import { Injectable, Inject } from "@nestjs/common";
import Redis from "ioredis";

const MAX_HISTORY = 100;
const CONTEXT_WINDOW = 10;

export interface ChatExchange {
  prompt: string;
  reply: string;
  timestamp: string;
}

@Injectable()
export class RedisService {
  constructor(@Inject("REDIS_CLIENT") private readonly client: Redis) {}

  async saveExchange(userId: number, prompt: string, reply: string) {
    const key = `chat:history:${userId}`;
    const entry = JSON.stringify({ prompt, reply, timestamp: new Date().toISOString() });
    await this.client.lpush(key, entry);
    await this.client.ltrim(key, 0, MAX_HISTORY - 1);
  }

  async getHistory(userId: number): Promise<ChatExchange[]> {
    const key = `chat:history:${userId}`;
    const entries = await this.client.lrange(key, 0, CONTEXT_WINDOW - 1);
    return entries.map((e: string) => JSON.parse(e) as ChatExchange).reverse();
  }
}
