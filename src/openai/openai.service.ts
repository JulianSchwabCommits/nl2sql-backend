import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ChatExchange } from "../redis/redis.service";

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseUrl = "https://api.openai.com/v1/chat/completions";

  async chat(message: string, history: ChatExchange[] = []): Promise<string> {
    if (!this.apiKey) {
      throw new InternalServerErrorException("OPENAI_API_KEY is not configured on the server");
    }

    const messages = [
      ...history.flatMap((ex) => [
        { role: "user", content: ex.prompt },
        { role: "assistant", content: ex.reply },
      ]),
      { role: "user", content: message },
    ];

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: "gpt-4o-mini", messages }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`OpenAI API error (${response.status}): ${errorBody}`);
        throw new InternalServerErrorException(`LLM service returned status ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? "No response";
    } catch (error: any) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(`OpenAI fetch error: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to reach LLM service: ${error.message}`);
    }
  }
}
