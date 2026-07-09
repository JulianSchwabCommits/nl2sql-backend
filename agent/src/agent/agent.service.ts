import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { OpenAIService, LlmRequestConfig } from '../openai/openai.service';
import { DataClientService, ConnectionCredentials } from '../data-client/data-client.service';
import agentConfig from '../config/agent.config';
import { AgentMessage, AgentResult, QueryRecord } from '../types';

interface WriteResult {
  success: boolean;
  affectedRows?: number;
  error?: string;
}

export interface ToolCallEvent {
  tool: string;
  args?: Record<string, any>;
  status: 'started' | 'completed';
  result?: Record<string, any>;
}

export type OnToolCall = (event: ToolCallEvent) => void;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly activeRequests = new Map<string, AbortController>();

  constructor(
    private readonly openAIService: OpenAIService,
    private readonly dataClient: DataClientService,
    @Inject(agentConfig.KEY)
    private readonly cfg: ConfigType<typeof agentConfig>,
  ) {}

  cancelRequest(clientId: string): boolean {
    const controller = this.activeRequests.get(clientId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(clientId);
      this.logger.log(`Cancelled active request for client: ${clientId}`);
      return true;
    }
    return false;
  }

  async handleMessage(
    message: string,
    history: AgentMessage[] = [],
    userId?: string,
    clientId?: string,
    onToolCall?: OnToolCall,
  ): Promise<AgentResult> {
    if (userId) {
      const limit = await this.checkRateLimit(userId);
      if (limit === 'over_quota') {
        return {
          reply: `Daily request limit reached (${this.cfg.maxRequestsPerDay} requests/day). Please try again tomorrow.`,
          queries: [],
          error: 'rate_limit',
        };
      }
      if (limit === 'unavailable') {
        return {
          reply:
            'Unable to verify your request limit right now. Please try again shortly.',
          queries: [],
          error: 'rate_limit_unavailable',
        };
      }
    }

    const abortController = new AbortController();
    const requestKey = clientId || userId || 'anonymous';
    this.activeRequests.set(requestKey, abortController);

    try {
      if (!userId) {
        throw new Error("No userid");
      }
      return await this.executeAgentLoop(
        message,
        history,
        abortController.signal,
        parseInt(userId, 10),
        onToolCall,
      );
    } finally {
      this.activeRequests.delete(requestKey);
    }
  }

  private async executeAgentLoop(
    message: string,
    history: AgentMessage[],
    signal: AbortSignal,
    userId: number,
    onToolCall?: OnToolCall,
  ): Promise<AgentResult> {
    const llmSettings = await this.dataClient.getUserLlmSettings(userId);
    if (!llmSettings || !llmSettings.apiKey) {
      return {
        reply: 'Please configure your LLM API key in Settings before using the chat.',
        queries: [],
        error: 'no_llm_settings',
      };
    }

    const llmConfig: LlmRequestConfig = {
      apiKey: llmSettings.apiKey,
      model: llmSettings.model,
      provider: llmSettings.provider,
    };

    const trimmedHistory = history.slice(-this.cfg.maxHistoryMessages);
    const conversation: AgentMessage[] = [
      ...trimmedHistory,
      { role: 'user', content: message },
    ];

    let iterations = 0;
    const queries: QueryRecord[] = [];
    const credentialsCache = new Map<string, ConnectionCredentials>();

    while (iterations < this.cfg.maxToolIterations) {
      iterations++;

      if (signal.aborted) {
        return { reply: 'Request was cancelled.', queries, error: 'cancelled' };
      }

      const response = await this.openAIService.chatWithTools(conversation, llmConfig);

      if (signal.aborted) {
        return { reply: 'Request was cancelled.', queries, error: 'cancelled' };
      }

      if (!response.functionCall) {
        return {
          reply: response.text || 'No response from model',
          queries,
        };
      }

      const { name, args } = response.functionCall;
      this.logger.log(`Tool call: ${name}(${JSON.stringify(args)})`);

      onToolCall?.({ tool: name, args, status: 'started' });

      conversation.push({
        role: 'model',
        content: '',
        functionCall: { name, args },
      });

      let toolResult: Record<string, any>;
      try {
        switch (name) {
          case 'list_databases': {
            const connections = await this.dataClient.listUserConnections(userId);
            toolResult = {
              databases: connections.map((c) => ({
                id: c.id,
                name: c.name,
                host: c.host,
                database: c.database,
              })),
            };
            break;
          }
          case 'get_database_schema': {
            const credentials = await this.resolveCredentials(args.connectionId, credentialsCache);
            const schema = await this.dataClient.getSchemaForConnection(credentials);
            toolResult = { schema };
            break;
          }
          case 'read_query': {
            const credentials = await this.resolveCredentials(args.connectionId, credentialsCache);
            const sql = this.enforceLimitOnSelect(args.sql);
            const rows = await this.dataClient.executeReadWithCredentials(sql, credentials);
            queries.push({
              sql,
              operation: 'SELECT',
              results: rows,
              rowCount: rows.length,
            });
            toolResult = { success: true, rowCount: rows.length, rows };
            break;
          }
          case 'write_query': {
            const credentials = await this.resolveCredentials(args.connectionId, credentialsCache);
            const sql = args.sql;
            const operation = args.operation || 'INSERT';
            const result = await this.executeWrite(sql, operation, credentials);
            queries.push({
              sql,
              operation,
              rowCount: result.affectedRows,
              error: result.error,
            });
            toolResult = result;
            break;
          }
          case 'stop': {
            const finalMessage = args.message || 'Done';
            onToolCall?.({ tool: name, args, status: 'completed' });
            return { reply: finalMessage, queries };
          }
          default:
            toolResult = { error: `Unknown tool: ${name}` };
        }
      } catch (error: any) {
        this.logger.error(`Tool execution error: ${error.message}`);
        toolResult = { error: error.message };
        queries.push({
          sql: args.sql || '',
          operation: name.toUpperCase(),
          error: error.message,
        });
      }

      onToolCall?.({ tool: name, args, status: 'completed', result: toolResult });

      conversation.push({
        role: 'function',
        content: JSON.stringify(toolResult),
        functionResponse: { name, response: toolResult },
      });
    }

    return {
      reply:
        "I reached the maximum number of steps. Here's what I found so far.",
      queries,
    };
  }

  private async resolveCredentials(
    connectionId: string,
    cache: Map<string, ConnectionCredentials>,
  ): Promise<ConnectionCredentials> {
    if (cache.has(connectionId)) {
      return cache.get(connectionId)!;
    }
    const data = await this.dataClient.getConnectionCredentials(connectionId);
    const credentials: ConnectionCredentials = {
      host: data.host,
      port: data.port,
      database: data.database,
      username: data.username,
      password: data.password,
      ssl: data.ssl,
    };
    cache.set(connectionId, credentials);
    return credentials;
  }

  private async checkRateLimit(
    userId: string,
  ): Promise<'ok' | 'over_quota' | 'unavailable'> {
    try {
      const { allowed } = await this.dataClient.checkRateLimit(
        userId,
        this.cfg.maxRequestsPerDay,
        this.cfg.rateLimitWindowMs,
      );
      return allowed ? 'ok' : 'over_quota';
    } catch (error: any) {
      this.logger.error(
        `Rate limit check failed, denying request: ${error.message}`,
      );
      return 'unavailable';
    }
  }

  private enforceLimitOnSelect(sql: string): string {
    const maxRows = this.cfg.maxRows;
    const trimmed = sql.trim().replace(/;$/, '');
    if (!/\bLIMIT\b/i.test(trimmed)) {
      return `${trimmed} LIMIT ${maxRows}`;
    }
    const limitMatch = trimmed.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch && parseInt(limitMatch[1]) > maxRows) {
      return trimmed.replace(/\bLIMIT\s+\d+/i, `LIMIT ${maxRows}`);
    }
    return trimmed;
  }

  private async executeWrite(
    sql: string,
    expectedType: string,
    credentials: ConnectionCredentials,
  ): Promise<WriteResult> {
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith(expectedType)) {
      return {
        success: false,
        error: `Expected ${expectedType} statement but got something else`,
      };
    }
    const affectedRows = await this.dataClient.executeWriteWithCredentials(sql, credentials);
    return { success: true, affectedRows };
  }
}
