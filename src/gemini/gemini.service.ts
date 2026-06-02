import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { SchemaLoaderService } from "../utils/schema-loader.service";
import { ChatMessage } from "../agent/agent.service";
import * as fs from "fs";
import * as path from "path";

// Gemini function calling tool definitions
const TOOLS = [
  {
    function_declarations: [
      {
        name: "get",
        description:
          "Execute a SELECT SQL query on the PostgreSQL database and return the results. Maximum 25 rows are returned.",
        parameters: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "A valid PostgreSQL SELECT query",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "create",
        description:
          "Execute an INSERT SQL query on the PostgreSQL database to create new records.",
        parameters: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "A valid PostgreSQL INSERT query",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "update",
        description:
          "Execute an UPDATE SQL query on the PostgreSQL database to modify existing records.",
        parameters: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "A valid PostgreSQL UPDATE query",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "delete",
        description:
          "Execute a DELETE SQL query on the PostgreSQL database to remove records.",
        parameters: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "A valid PostgreSQL DELETE query",
            },
          },
          required: ["sql"],
        },
      },
      {
        name: "stop",
        description:
          "Stop the tool loop and return a final message to the user. Use this when you have the answer ready or need to communicate something without executing more queries.",
        parameters: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description:
                "The final response message to show to the user. Include the SQL query you used and a summary of the results.",
            },
          },
          required: ["message"],
        },
      },
    ],
  },
];

interface GeminiResponse {
  text?: string;
  functionCall?: { name: string; args: Record<string, string> };
}

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
      this.logger.warn("GEMINI_API_KEY is not set — LLM calls will fail");
    }

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

  async chatWithTools(messages: ChatMessage[]): Promise<GeminiResponse> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        "GEMINI_API_KEY is not configured on the server",
      );
    }

    // Convert our message format to Gemini's format
    const contents = this.buildContents(messages);

    try {
      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: this.systemPrompt }],
          },
          contents,
          tools: TOOLS,
          tool_config: {
            function_calling_config: {
              mode: "AUTO",
            },
          },
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

      const candidate = data.candidates?.[0];
      if (!candidate?.content?.parts?.length) {
        this.logger.warn(`Empty Gemini response: ${JSON.stringify(data)}`);
        throw new InternalServerErrorException(
          "LLM returned an empty response",
        );
      }

      // Check if model wants to call a function
      const parts = candidate.content.parts;
      const functionCallPart = parts.find((p: any) => p.functionCall);

      if (functionCallPart) {
        return {
          functionCall: {
            name: functionCallPart.functionCall.name,
            args: functionCallPart.functionCall.args || {},
          },
        };
      }

      // Otherwise return text
      const textPart = parts.find((p: any) => p.text);
      return { text: textPart?.text || "" };
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

  // Keep the simple chat method for backwards compatibility
  async chat(message: string): Promise<string> {
    const result = await this.chatWithTools([
      { role: "user", content: message },
    ]);
    return result.text || "No response";
  }

  private buildContents(messages: ChatMessage[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "model") {
        if (msg.functionCall) {
          contents.push({
            role: "model",
            parts: [
              {
                functionCall: {
                  name: msg.functionCall.name,
                  args: msg.functionCall.args,
                },
              },
            ],
          });
        } else {
          contents.push({
            role: "model",
            parts: [{ text: msg.content }],
          });
        }
      } else if (msg.role === "function") {
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.functionResponse?.name || "unknown",
                response: JSON.parse(msg.content),
              },
            },
          ],
        });
      }
    }

    return contents;
  }
}
