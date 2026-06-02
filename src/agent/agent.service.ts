import { Injectable } from "@nestjs/common";
import { OpenAIService } from "../openai/openai.service";
import { ChatExchange } from "../redis/redis.service";

@Injectable()
export class AgentService {
  constructor(private readonly openAIService: OpenAIService) {}

  async handleMessage(message: string, history: ChatExchange[] = []): Promise<string> {
    return this.openAIService.chat(message, history);
  }
}
