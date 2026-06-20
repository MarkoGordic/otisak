import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { childLogger } from '../lib/logger';
import { runWithRequestContext } from '../lib/requestContext';

// First middleware in the chain. Stamps every request with a server-generated
// id, exposes it on `req.id`, returns it as the `X-Request-Id` response header
// (so a client can quote it when reporting a failure), and binds a child logger
// + AsyncLocalStorage context so all downstream logs are correlated.
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  req.id = requestId;
  req.log = childLogger({ requestId });
  res.setHeader('X-Request-Id', requestId);
  runWithRequestContext({ requestId }, () => next());
}
