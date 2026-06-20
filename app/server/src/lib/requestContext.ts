import { AsyncLocalStorage } from 'async_hooks';

// Per-request context carried implicitly across async boundaries. Lets deep
// code (e.g. the db layer) attach the current requestId to a log line without
// threading it through every function signature.
export interface RequestContext {
  requestId: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
