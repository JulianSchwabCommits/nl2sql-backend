import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import type { Params } from 'nestjs-pino';

// Builds the nestjs-pino configuration shared by every microservice. Lives in
// @nl2sql/logger so all services emit identically-structured logs and the
// config can never drift between them.
//
// Why these choices:
//  - One JSON line per event in production (machine-parseable, ready for any log
//    aggregator); human-friendly pino-pretty only outside production.
//  - One structured line per HTTP request on completion (method/url/status/time)
//    with a stable x-request-id so a request can be correlated across services
//    and echoed back to the caller.
//  - Sensitive headers (auth / cookies / internal key) are never emitted in the
//    first place, and are additionally redacted as defense-in-depth.
//  - /health and /socket.io noise is dropped from automatic request logging so
//    the real signal (API calls, logins, chat) is not buried. The agent gateway
//    logs genuine WebSocket lifecycle/chat events explicitly instead.
export function buildLoggerOptions(service: string): Params {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      // service name is stamped on every line; pid/hostname are dropped as noise.
      base: { service },
      level: process.env.LOG_LEVEL ?? 'info',
      timestamp: pino.stdTimeFunctions.isoTime,

      // Reuse an inbound x-request-id (e.g. from an upstream proxy) or mint one,
      // and echo it on the response so callers/proxies can correlate.
      genReqId(req: IncomingMessage, res: ServerResponse) {
        const incoming = req.headers['x-request-id'];
        const id =
          (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },

      // 5xx -> error, 4xx -> warn, everything else -> info.
      customLogLevel(_req: IncomingMessage, res: ServerResponse, err?: Error) {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage(req: IncomingMessage, res: ServerResponse) {
        return `${req.method} ${req.url} ${res.statusCode}`;
      },
      customErrorMessage(req: IncomingMessage, res: ServerResponse, err: Error) {
        return `${req.method} ${req.url} ${res.statusCode} ${err.message}`;
      },

      // Keep request/response records compact and free of sensitive material;
      // the standard err serializer preserves message/stack/type for { err } logs.
      serializers: {
        err: pino.stdSerializers.err,
        req(req: any) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
            userAgent: req.headers?.['user-agent'],
          };
        },
        res(res: any) {
          return { statusCode: res.statusCode };
        },
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-internal-key"]',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },

      // Skip health checks and Socket.IO transport polling from the automatic
      // per-request logs.
      autoLogging: {
        ignore(req: IncomingMessage) {
          const url = req.url ?? '';
          return url.startsWith('/health') || url.startsWith('/socket.io');
        },
      },

      // Pretty, colourised single lines in dev; raw JSON in production.
      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
    },
  };
}
