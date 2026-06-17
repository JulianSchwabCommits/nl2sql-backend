import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { DataClientService } from '../data-client/data-client.service';
import agentConfig from '../config/agent.config';
import { AgentMessage } from '../types';

function buildTools(maxRows: number) {
  return [
  {
    type: 'function',
    function: {
      name: 'get',
      description: `Execute a SELECT SQL query on the PostgreSQL database and return the results. Maximum ${maxRows} rows are returned.`,
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'A valid PostgreSQL SELECT query',
          },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create',
      description:
        'Execute an INSERT SQL query on the PostgreSQL database to create new records.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'A valid PostgreSQL INSERT query',
          },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update',
      description:
        'Execute an UPDATE SQL query on the PostgreSQL database to modify existing records.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'A valid PostgreSQL UPDATE query',
          },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete',
      description:
        'Execute a DELETE SQL query on the PostgreSQL database to remove records.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'A valid PostgreSQL DELETE query',
          },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop',
      description:
        'Stop the tool loop and return a final message to the user. Use this when you have the answer ready or need to communicate something without executing more queries.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description:
              'The final response message to show to the user. Include the SQL query you used and a summary of the results.',
          },
        },
        required: ['message'],
      },
    },
  },
  ];
}

export interface ChatToolResponse {
  text?: string;
  functionCall?: { name: string; args: Record<string, any> };
}

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly tools: ReturnType<typeof buildTools>;
  private systemPrompt: string | null = null;

  constructor(
    private readonly dataClient: DataClientService,
    @Inject(agentConfig.KEY)
    private readonly cfg: ConfigType<typeof agentConfig>,
  ) {
    this.baseUrl = cfg.openaiBaseUrl;
    this.model = cfg.openaiModel;
    this.tools = buildTools(cfg.maxRows);
  }

  // The schema is fetched from the database service once and cached into the
  // prompt template's {schema} placeholder.
  async getSystemPrompt(): Promise<string> {
    if (this.systemPrompt) {
      return this.systemPrompt;
    }
    try {
      const templatePath = path.join(
        process.cwd(),
        'data',
        'system-prompt.txt',
      );
      const template = fs.readFileSync(templatePath, 'utf-8');
      const schema = await this.dataClient.getSchema();
      this.systemPrompt = template.replace('{schema}', schema);
      this.logger.log('System prompt loaded with database schema');
    } catch (error: any) {
      this.logger.error(`Failed to load system prompt: ${error.message}`);
      return 'You are a helpful SQL assistant.';
    }
    return this.systemPrompt;
  }

  async chatWithTools(messages: AgentMessage[]): Promise<ChatToolResponse> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'OPENAI_API_KEY is not configured on the server',
      );
    }
    const systemPrompt = await this.getSystemPrompt();
    const openaiMessages = this.buildMessages(messages, systemPrompt);
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: openaiMessages,
          tools: this.tools,
          tool_choice: 'auto',
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
      const data: any = await response.json();
      if (data.error) {
        this.logger.error(`OpenAI API error: ${JSON.stringify(data.error)}`);
        throw new InternalServerErrorException(
          data.error.message || 'LLM service error',
        );
      }
      const choice = data.choices?.[0];
      if (!choice?.message) {
        this.logger.warn(`Empty OpenAI response: ${JSON.stringify(data)}`);
        throw new InternalServerErrorException(
          'LLM returned an empty response',
        );
      }
      const msg = choice.message;
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const toolCall = msg.tool_calls[0];
        const args = JSON.parse(toolCall.function.arguments || '{}');
        return {
          functionCall: {
            name: toolCall.function.name,
            args,
          },
        };
      }
      return { text: msg.content || '' };
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

  // Translates the agent's internal message log into OpenAI chat-completions
  // format (system + user/assistant/tool turns).
  private buildMessages(
    messages: AgentMessage[],
    systemPrompt: string,
  ): any[] {
    const result: any[] = [{ role: 'system', content: systemPrompt }];
    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'model') {
        if (msg.functionCall) {
          result.push({
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: `call_${Date.now()}`,
                type: 'function',
                function: {
                  name: msg.functionCall.name,
                  arguments: JSON.stringify(msg.functionCall.args),
                },
              },
            ],
          });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      } else if (msg.role === 'function') {
        result.push({
          role: 'tool',
          tool_call_id: `call_${Date.now()}`,
          content: msg.content,
        });
      }
    }
    return result;
  }
}
