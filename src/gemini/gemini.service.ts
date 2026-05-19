import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey = process.env.GEMINI_API_KEY;
  private readonly baseUrl =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

  async chat(message: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }],
      }),
    });

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response";
  }
}
