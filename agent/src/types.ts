export interface FunctionCall {
  name: string;
  args: Record<string, any>;
}

export interface AgentMessage {
  role: 'user' | 'model' | 'function';
  content: string;
  functionCall?: FunctionCall;
  functionResponse?: { name: string; response: any };
}

export interface QueryRecord {
  sql: string;
  operation: string;
  results?: any[];
  rowCount?: number;
  error?: string;
}

export interface AgentResult {
  reply: string;
  queries: QueryRecord[];
  error?: string;
}

export interface ToolCallRecord {
  tool: string;
  args?: Record<string, any>;
  result?: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  queries?: QueryRecord[];
  toolCalls?: ToolCallRecord[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
}

export interface ChatExchange {
  prompt: string;
  reply: string;
  timestamp: string;
}

export interface CoreUser {
  id: number;
  email: string;
  approved: boolean;
  role: 'USER' | 'ADMIN';
}

export interface JwtPayload {
  sub: number;
  email?: string;
  role?: string;
}
