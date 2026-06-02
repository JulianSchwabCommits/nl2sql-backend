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

// OpenAI function calling tool definitions
const TOOLS = [
  {
    type: "function" as const,
    function: {
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
  },
  {
    type: "function" as const,
    function: {
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
  },
  {
    type: "function" as const,
    function: {
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
  },
  {
    type: "function" as const,
    function: {
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
  },
  {
    type: "function" as const,
    function: {
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
  },
];

interface OpenAIResponse {
  text?: string;
  functionCall?: { name: string; args: Record<string, string> };
}

@Injectable()
export class OpenAIService implements OnModuleInit {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseUrl = "https://api.openai.com/v1/chat/completions";
  private readonly model = "gpt-4o-mini";
  private systemPrompt: string = "";

  constructor(private readonly schemaLoader: SchemaLoaderService) {}

  onModuleInit() {
    if (!this.apiKey) {
      this.logger.warn("OPENAI_API_KEY is not set — LLM calls will fail");
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

  async chatWithTools(messages: ChatMessage[]): Promise<OpenAIResponse> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        "OPENAI_API_KEY is not configured on the server",
      );
    }

    const openaiMessages = this.buildMessages(messages);

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: openaiMessages,
          tools: TOOLS,
          tool_choice: "auto",
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `OpenAI API error (${response.status}): ${errorBody}`,
        );
        throw new InternalServerErrorException(
          `LLM service returned status ${response.status}`,
        );
      }

      const data = await response.json();

      if (data.error) {
        this.logger.error(`OpenAI API error: ${JSON.stringify(data.error)}`);
        throw new InternalServerErrorException(
          data.error.message || "LLM service error",
        );
      }

      const choice = data.choices?.[0];
      if (!choice?.message) {
        this.logger.warn(`Empty OpenAI response: ${JSON.stringify(data)}`);
        throw new InternalServerErrorException(
          "LLM returned an empty response",
        );
      }

      const msg = choice.message;

      // Check if model wants to call a tool
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const toolCall = msg.tool_calls[0];
        const args = JSON.parse(toolCall.function.arguments || "{}");
        return {
          functionCall: {
            name: toolCall.function.name,
            args,
          },
        };
      }

      // Otherwise return text content
      return { text: msg.content || "" };
    } catch (error: any) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`OpenAI fetch error: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to reach LLM service: ${error.message}`,
      );
    }
  }

  // Simple chat for backwards compatibility
  async chat(message: string, systemPrompt?: string): Promise<string> {
    if (systemPrompt) {
      this.systemPrompt = systemPrompt;
    }
    const result = await this.chatWithTools([
      { role: "user", content: message },
    ]);
    return result.text || "No response";
  }

  private buildMessages(messages: ChatMessage[]): any[] {
    const result: any[] = [{ role: "system", content: this.systemPrompt }];

    for (const msg of messages) {
      if (msg.role === "user") {
        result.push({ role: "user", content: msg.content });
      } else if (msg.role === "model") {
        if (msg.functionCall) {
          result.push({
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: `call_${Date.now()}`,
                type: "function",
                function: {
                  name: msg.functionCall.name,
                  arguments: JSON.stringify(msg.functionCall.args),
                },
              },
            ],
          });
        } else {
          result.push({ role: "assistant", content: msg.content });
        }
      } else if (msg.role === "function") {
        result.push({
          role: "tool",
          tool_call_id: `call_${Date.now()}`,
          content: msg.content,
        });
      }
    }

    return result;
  }
}
