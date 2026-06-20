import { Request, Response, NextFunction, RequestHandler } from 'express';

// Wraps an async route handler so a rejected promise is forwarded to the
// centralized error middleware via next(err), instead of becoming an unhandled
// rejection. Lets handlers `throw new ValidationError(...)` and rely on one
// place to translate the error into an HTTP response.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
