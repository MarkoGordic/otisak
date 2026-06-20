import pino, { type Logger } from 'pino';

// Structured application logger (pino). One line per event, JSON in production
// (Docker/journald captures stdout) and a human-friendly pretty stream in dev.
// Secrets are redacted so credentials never reach the logs.
const isProd = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

export const logger: Logger = pino({
  level,
  redact: {
    paths: [
      'password',
      'password_hash',
      'current_password',
      'new_password',
      'authorization',
      'req.headers.cookie',
      '*.password',
      '*.password_hash',
    ],
    censor: '[redacted]',
  },
  // pino-pretty runs in a worker thread, only in dev. Production stays raw JSON.
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export type { Logger };

// Child logger bound to per-request fields (e.g. requestId) so every line of a
// request is correlated without repeating the binding at each call site.
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
