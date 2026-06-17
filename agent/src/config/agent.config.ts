import { registerAs } from '@nestjs/config';


export const requireInt = (name: string): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid environment variable ${name}: expected a positive number, got "${raw}"`,
    );
  }
  return parsed;
};

export const requireStr = (name: string): string => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return raw;
};

export default registerAs('agent', () => ({
  maxRows: requireInt('AGENT_MAX_ROWS'),
  maxToolIterations: requireInt('AGENT_MAX_TOOL_ITERATIONS'),
  maxRequestsPerDay: requireInt('AGENT_MAX_REQUESTS_PER_DAY'),
  rateLimitWindowMs: requireInt('AGENT_RATE_LIMIT_WINDOW_MS'),
  maxHistoryMessages: requireInt('AGENT_MAX_HISTORY_MESSAGES'),
  historyFetchLimit: requireInt('DEFAULT_HISTORY_LIMIT'),
  openaiModel: requireStr('OPENAI_MODEL'),
  openaiBaseUrl: requireStr('OPENAI_BASE_URL'),
}));
