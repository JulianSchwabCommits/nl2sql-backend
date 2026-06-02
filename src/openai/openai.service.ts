import {
  Injectable,
  Logger,
} from "@nestjs/common";

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseUrl = "https://api.openai.com/v1/chat/completions";

  async chat(message: string): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: message }],
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "No response";
  }
}
