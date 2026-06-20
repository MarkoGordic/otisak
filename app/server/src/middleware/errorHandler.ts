import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AppError, ConflictError, ValidationError } from '../lib/errors';
import { reportError } from '../lib/reportError';

// Map any thrown value into a typed AppError so the response is consistent.
// Known framework/Postgres failures get a friendlier status than a blanket 500.
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = err as { code?: string; type?: string; status?: number } | null;
  // express.json() rejects a malformed body with a SyntaxError. That is a
  // client mistake (400), not a server fault, so it should not log as a 5xx.
  if (e?.type === 'entity.parse.failed' || (err instanceof SyntaxError && e?.status === 400)) {
    return new ValidationError('Invalid JSON body');
  }
  if (e?.code === '23505') {
    return new ConflictError('Resource already exists', 'DUPLICATE');
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  // Default: 500, code INTERNAL, not exposed to the client.
  return new AppError(message);
}

// Centralized Express error handler. MUST be registered last and keep all four
// parameters so Express treats it as error-handling middleware. Assigns an
// error id, records the error through the reportError sink, and returns a safe
// JSON body the client can correlate by requestId/errorId.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const appErr = toAppError(err);
  const errorId = randomUUID();

  reportError(appErr, {
    errorId,
    requestId: req.id,
    userId: req.user?.id,
    route: `${req.method} ${req.originalUrl}`,
    statusCode: appErr.statusCode,
    source: 'http',
  });

  // If the response already started streaming, hand back to Express' default
  // handler which will close the connection.
  if (res.headersSent) {
    _next(err);
    return;
  }

  const body: Record<string, unknown> = {
    error: appErr.expose ? appErr.message : 'Internal server error',
    code: appErr.code,
    requestId: req.id,
    errorId,
  };
  if (appErr.expose && appErr.details !== undefined) {
    body.details = appErr.details;
  }
  res.status(appErr.statusCode).json(body);
}
