import { registerAs } from '@nestjs/config';

const requireInt = (name: string): number => {
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

export default registerAs('database', () => ({
  maxMessagesPerConversation: requireInt('MAX_MESSAGES_PER_CONVERSATION'),
  defaultHistoryLimit: requireInt('DEFAULT_HISTORY_LIMIT'),
  redisRetryStepMs: requireInt('REDIS_RETRY_STEP_MS'),
  redisRetryMaxMs: requireInt('REDIS_RETRY_MAX_MS'),
}));
