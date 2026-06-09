import { Injectable, Logger } from "@nestjs/common";
import { OpenAIService } from "../openai/openai.service";
import { DatabaseService } from "../database/database.service";

export interface ChatMessage {
  role: "user" | "model" | "function";
  content: string;
  functionCall?: { name: string; args: Record<string, string> };
  functionResponse?: { name: string; response: unknown };
}

export interface QueryExecution {
  sql: string;
  operation: string;
  results?: Record<string, unknown>[];
  error?: string;
  rowCount?: number;
}

export interface AgentResponse {
  reply: string;
  queries: QueryExecution[];
  error?: string;
}

const MAX_ROWS = 25;
const MAX_TOOL_ITERATIONS = 10;

// Cost control: max messages per user per day
const MAX_REQUESTS_PER_DAY = 100;
// Max conversation history tokens sent to model (limit context size)
const MAX_HISTORY_MESSAGES = 10;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  // Simple in-memory rate limit (resets on restart)
  private readonly requestCounts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly openAIService: OpenAIService,
    private readonly db: DatabaseService,
  ) {}

  async handleMessage(
    message: string,
    history: ChatMessage[] = [],
    userId?: string,
  ): Promise<AgentResponse> {
    // Rate limiting
    if (userId) {
      const allowed = this.checkRateLimit(userId);
      if (!allowed) {
        return {
          reply: `Daily request limit reached (${MAX_REQUESTS_PER_DAY} requests/day). Please try again tomorrow.`,
          queries: [],
          error: "rate_limit",
        };
      }
    }

    // Trim history to control token usage
    const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

    const conversation: ChatMessage[] = [
      ...trimmedHistory,
      { role: "user", content: message },
    ];

    let iterations = 0;
    const queries: QueryExecution[] = [];

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await this.openAIService.chatWithTools(conversation);

      if (!response.functionCall) {
        return {
          reply: response.text || "No response from model",
          queries,
        };
      }

      const { name, args } = response.functionCall;
      this.logger.log(`Tool call: ${name}(${JSON.stringify(args)})`);

      conversation.push({
        role: "model",
        content: "",
        functionCall: { name, args },
      });

      let toolResult: unknown;

      try {
        switch (name) {
          case "get": {
            const sql = this.enforceLimitOnSelect(args.sql);
            const rows = await this.executeQuery(sql);
            const query: QueryExecution = {
              sql,
              operation: "SELECT",
              results: rows,
              rowCount: rows.length,
            };
            queries.push(query);
            toolResult = { success: true, rowCount: rows.length, rows };
            break;
          }
          case "create": {
            const sql = args.sql;
            const result = await this.executeWrite(sql, "INSERT");
            queries.push({
              sql,
              operation: "INSERT",
              rowCount: result.affectedRows,
              error: result.error,
            });
            toolResult = result;
            break;
          }
          case "update": {
            const sql = args.sql;
            const result = await this.executeWrite(sql, "UPDATE");
            queries.push({
              sql,
              operation: "UPDATE",
              rowCount: result.affectedRows,
              error: result.error,
            });
            toolResult = result;
            break;
          }
          case "delete": {
            const sql = args.sql;
            const result = await this.executeWrite(sql, "DELETE");
            queries.push({
              sql,
              operation: "DELETE",
              rowCount: result.affectedRows,
              error: result.error,
            });
            toolResult = result;
            break;
          }
          case "stop": {
            const finalMessage = args.message || "Done";
            return {
              reply: finalMessage,
              queries,
            };
          }
          default:
            toolResult = { error: `Unknown tool: ${name}` };
        }
      } catch (error: any) {
        this.logger.error(`Tool execution error: ${error.message}`);
        toolResult = { error: error.message };
        queries.push({
          sql: args.sql || "",
          operation: name.toUpperCase(),
          error: error.message,
        });
      }

      conversation.push({
        role: "function",
        content: JSON.stringify(toolResult),
        functionResponse: { name, response: toolResult },
      });
    }

    return {
      reply: "I reached the maximum number of steps. Here's what I found so far.",
      queries,
    };
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const record = this.requestCounts.get(userId);

    if (!record || now > record.resetAt) {
      this.requestCounts.set(userId, {
        count: 1,
        resetAt: now + 24 * 60 * 60 * 1000,
      });
      return true;
    }

    if (record.count >= MAX_REQUESTS_PER_DAY) {
      return false;
    }

    record.count++;
    return true;
  }
    }

    record.count++;
    return true;
  }

  private enforceLimitOnSelect(sql: string): string {
    const trimmed = sql.trim().replace(/;$/, "");
    if (!/\bLIMIT\b/i.test(trimmed)) {
      return `${trimmed} LIMIT ${MAX_ROWS}`;
    }
    const limitMatch = trimmed.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch && parseInt(limitMatch[1]) > MAX_ROWS) {
      return trimmed.replace(/\bLIMIT\s+\d+/i, `LIMIT ${MAX_ROWS}`);
    }
    return trimmed;
  }

  private async executeQuery(sql: string): Promise<Record<string, unknown>[]> {
    const rows = await this.db.$queryRawUnsafe<Record<string, unknown>[]>(sql);
    return rows;
  }

  private async executeWrite(
    sql: string,
    expectedType: "INSERT" | "UPDATE" | "DELETE",
  ): Promise<{ success: boolean; affectedRows?: number; error?: string }> {
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith(expectedType)) {
      return {
        success: false,
        error: `Expected ${expectedType} statement but got something else`,
      };
    }
    const result = await this.db.$executeRawUnsafe(sql);
    return { success: true, affectedRows: result };
  }
}
