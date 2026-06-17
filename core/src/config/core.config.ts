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

export const MIN_PASSWORD_LENGTH = 8;

export default registerAs('core', () => ({
  bcryptRounds: requireInt('BCRYPT_ROUNDS'),
  accessTokenTtlSec: requireInt('ACCESS_TOKEN_TTL_SEC'),
  refreshTokenTtlSec: requireInt('REFRESH_TOKEN_TTL_SEC'),
  adminTokenTtlSec: requireInt('ADMIN_TOKEN_TTL_SEC'),
  throttleShortTtlMs: requireInt('THROTTLE_SHORT_TTL_MS'),
  throttleShortLimit: requireInt('THROTTLE_SHORT_LIMIT'),
  throttleLongTtlMs: requireInt('THROTTLE_LONG_TTL_MS'),
  throttleLongLimit: requireInt('THROTTLE_LONG_LIMIT'),
}));
