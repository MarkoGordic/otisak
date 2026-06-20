import { Request, Response, NextFunction } from 'express';

// Structured access log: one line per completed request, emitted through the
// request-scoped logger so it carries the requestId (and userId once auth has
// run). Replaces morgan, so the access line and application logs share one
// structured format. The health check is skipped so polling does not drown
// real traffic.
export function accessLog(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/api/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    req.log.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
        userId: req.user?.id,
      },
      'request',
    );
  });
  next();
}
