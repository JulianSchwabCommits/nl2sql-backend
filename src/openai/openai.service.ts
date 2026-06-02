import {
  Injectable,
  Logger,
} from "@nestjs/common";

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseUrl = "https://api.openai.com/v1/chat/completions";

  async chat(message: string, systemPrompt?: string): Promise<string> {
    const messages: { role: string; content: string }[] = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: message });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "No response";
  }
}
