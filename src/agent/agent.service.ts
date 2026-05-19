import { Injectable } from "@nestjs/common";
import { GeminiService } from "../gemini/gemini.service";

@Injectable()
export class AgentService {
  constructor(private readonly geminiService: GeminiService) {}

  async handleMessage(message: string): Promise<string> {
    return this.geminiService.chat(message);
  }
}
