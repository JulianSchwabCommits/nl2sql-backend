import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { SchemaLoaderService } from "../utils/schema-loader.service";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey = process.env.GEMINI_API_KEY;
  private readonly baseUrl =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
  private systemPrompt: string = "";

  constructor(private readonly schemaLoader: SchemaLoaderService) {}

  onModuleInit() {
    if (!this.apiKey) {
      this.logger.warn(
        "GEMINI_API_KEY is not set — LLM calls will fail",
      );
    }

    // Load system prompt template and inject schema
    try {
      const templatePath = path.join(
        process.cwd(),
        "data",
        "system-prompt.txt",
      );
      const template = fs.readFileSync(templatePath, "utf-8");
      const schema = this.schemaLoader.getSchema();
      this.systemPrompt = template.replace("{schema}", schema);
      this.logger.log("System prompt loaded with database schema");
    } catch (error: any) {
      this.logger.error(`Failed to load system prompt: ${error.message}`);
      this.systemPrompt = "You are a helpful SQL assistant.";
    }
  }

  async chat(message: string): Promise<string> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        "GEMINI_API_KEY is not configured on the server",
      );
    }

    try {
      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: this.systemPrompt }],
          },
          contents: [{ role: "user", parts: [{ text: message }] }],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Gemini API error (${response.status}): ${errorBody}`,
        );
        throw new InternalServerErrorException(
          `LLM service returned status ${response.status}`,
        );
      }

      const data = await response.json();

      if (data.error) {
        this.logger.error(`Gemini API error: ${JSON.stringify(data.error)}`);
        throw new InternalServerErrorException(
          data.error.message || "LLM service error",
        );
      }

      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        this.logger.warn(`Empty Gemini response: ${JSON.stringify(data)}`);
        throw new InternalServerErrorException(
          "LLM returned an empty response",
        );
      }

      return text;
    } catch (error: any) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Gemini fetch error: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to reach LLM service: ${error.message}`,
      );
    }
  }
}
