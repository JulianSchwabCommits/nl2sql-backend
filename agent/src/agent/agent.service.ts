import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { OpenAIService } from '../openai/openai.service';
import { DataClientService } from '../data-client/data-client.service';
import agentConfig from '../config/agent.config';
import { AgentMessage, AgentResult, QueryRecord } from '../types';

interface WriteResult {
  success: boolean;
  affectedRows?: number;
  error?: string;
}


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
      return await this.executeAgentLoop(
        message,
        history,
        abortController.signal,
      );
    } finally {
      this.activeRequests.delete(requestKey);
    }
  }

  // main loop: ask the model -> run the tool it picks -> feed the result back
  // repeat until the model calls "stop" or we hit a guardrail.
  private async executeAgentLoop(
    message: string,
    history: AgentMessage[],
    signal: AbortSignal,
  ): Promise<AgentResult> {
    const trimmedHistory = history.slice(-this.cfg.maxHistoryMessages);
    const conversation: AgentMessage[] = [
      ...trimmedHistory,
      { role: 'user', content: message },
    ];

    let iterations = 0;
    const queries: QueryRecord[] = [];

    while (iterations < this.cfg.maxToolIterations) {
      iterations++;

      if (signal.aborted) {
        return { reply: 'Request was cancelled.', queries, error: 'cancelled' };
      }

      const response = await this.openAIService.chatWithTools(conversation);

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

      conversation.push({
        role: 'model',
        content: '',
        functionCall: { name, args },
      });

      let toolResult: Record<string, any>;
      try {
        switch (name) {
          case 'get': {
            const sql = this.enforceLimitOnSelect(args.sql);
            const rows = await this.dataClient.executeRead(sql);
            queries.push({
              sql,
              operation: 'SELECT',
              results: rows,
              rowCount: rows.length,
            });
            toolResult = { success: true, rowCount: rows.length, rows };
            break;
          }
          case 'create': {
            const sql = args.sql;
            const result = await this.executeWrite(sql, 'INSERT');
            queries.push({
              sql,
              operation: 'INSERT',
              rowCount: result.affectedRows,
              error: result.error,
            });
            toolResult = result;
            break;
          }
          case 'update': {
            const sql = args.sql;
            const result = await this.executeWrite(sql, 'UPDATE');
            queries.push({
              sql,
              operation: 'UPDATE',
              rowCount: result.affectedRows,
              error: result.error,
            });
            toolResult = result;
            break;
          }
          case 'delete': {
            const sql = args.sql;
            const result = await this.executeWrite(sql, 'DELETE');
            queries.push({
              sql,
              operation: 'DELETE',
              rowCount: result.affectedRows,
              error: result.error,
            });
            toolResult = result;
            break;
          }
          case 'stop': {
            const finalMessage = args.message || 'Done';
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

  private async checkRateLimit(userId: string): Promise<boolean> {
    try {
      const { allowed } = await this.dataClient.checkRateLimit(
        userId,
        this.cfg.maxRequestsPerDay,
        this.cfg.rateLimitWindowMs,
      );
      return allowed;
    } catch (error: any) {
      this.logger.warn(
        `Rate limit check unavailable, allowing request: ${error.message}`,
      );
      return true;
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
    expectedType: 'INSERT' | 'UPDATE' | 'DELETE',
  ): Promise<WriteResult> {
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith(expectedType)) {
      return {
        success: false,
        error: `Expected ${expectedType} statement but got something else`,
      };
    }
    const affectedRows = await this.dataClient.executeWrite(sql);
    return { success: true, affectedRows };
  }
}
