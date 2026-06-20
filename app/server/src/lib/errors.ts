// Typed error hierarchy. Throwing one of these from a route handler lets the
// centralized error middleware (middleware/errorHandler.ts) pick the right HTTP
// status, a machine-readable code, and decide whether the message is safe to
// show the client - instead of every handler hand-rolling a generic 500.

export interface AppErrorOptions {
  statusCode?: number;
  code?: string;
  // expose=true means `message` is safe to send to the client (validation,
  // auth, conflicts). 500s default to expose=false so internals never leak.
  expose?: boolean;
  details?: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor(message: string, opts: AppErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = opts.statusCode ?? 500;
    this.code = opts.code ?? 'INTERNAL';
    this.expose = opts.expose ?? false;
    this.details = opts.details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR', expose: true, details });
  }
}

export class AuthError extends AppError {
  constructor(message = 'Not authenticated') {
    super(message, { statusCode: 401, code: 'UNAUTHENTICATED', expose: true });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, { statusCode: 403, code: 'FORBIDDEN', expose: true });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND', expose: true });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'CONFLICT') {
    super(message, { statusCode: 409, code, expose: true });
  }
}
