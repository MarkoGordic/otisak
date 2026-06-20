import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { insertErrorLog } from '../db/error-log';

// Client error ingestion: the SPA POSTs runtime errors / failed requests here
// so server and client failures live in one place (app_error_log) and can be
// joined by request_id. Rate limited and length capped so it cannot be used to
// flood the table. Intentionally unauthenticated: a crashing client may have no
// valid session, and we still want the report.
const router = Router();

const limiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function clamp(v: unknown, max: number): string | undefined {
  return typeof v === 'string' ? v.slice(0, max) : undefined;
}

router.post('/', limiter, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  try {
    await insertErrorLog({
      errorId: randomUUID(),
      requestId: clamp(b.requestId, 200),
      source: 'client',
      statusCode: typeof b.status === 'number' ? b.status : undefined,
      code: clamp(b.code, 100),
      name: clamp(b.name, 200),
      message: clamp(b.message, 2000),
      stack: clamp(b.stack, 8000),
      route: clamp(b.url, 500),
      userId: req.user?.id,
      context: { ua: clamp(b.ua, 500), origin: clamp(b.source, 100) },
    });
  } catch {
    // Never fail a beacon: best effort only.
  }
  res.status(204).end();
});

export default router;
