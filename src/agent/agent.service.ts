import { Injectable } from "@nestjs/common";
import { OpenAIService } from "../openai/openai.service";

@Injectable()
export class AgentService {
  constructor(private readonly openAIService: OpenAIService) {}

  async handleMessage(message: string): Promise<string> {
    return this.openAIService.chat(message);
  }
}
