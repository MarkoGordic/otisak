import express from 'express';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import subjectRoutes from './routes/subjects';
import examsRoutes from './routes/exams';
import examRoutes from './routes/exam';
import practiceRoutes from './routes/practice';
import questionsRoutes from './routes/questions';
import historyRoutes from './routes/history';
import { setupWebSocket } from './ws/events';
import { startLiveStatsAggregator } from './ws/liveStatsAggregator';
import { startExamExpiryWatcher } from './jobs/examExpiryWatcher';
import { ensureBootstrapAdmin } from './bootstrap';
import { runMigrations } from './db/migrations';
import { closePool } from './db/client';
import { assertSessionSecretIsSafe } from './session';

// Refuse to boot with an empty / known-default / too-short SESSION_SECRET.
// Forged session cookies would otherwise let anyone impersonate an admin.
try {
  assertSessionSecretIsSafe();
} catch (e) {
  console.error('FATAL:', (e as Error).message);
  process.exit(1);
}

// Process-level safety nets. Unhandled rejections / uncaught exceptions
// are almost always programmer bugs, not recoverable runtime conditions.
// We log and fail fast: a supervisor (Docker, systemd) restarts the
// process. Surviving in a half-broken state is worse — it can mean
// in-flight DB transactions never finalise.
process.on('unhandledRejection', (reason) => {
  console.error('FATAL: unhandled promise rejection', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('FATAL: uncaught exception', err);
  process.exit(1);
});

// Optional env vars: must be non-empty if explicitly set. Required vars
// (DATABASE_URL, SESSION_SECRET) are validated where they're consumed.
function assertEnv(): void {
  const optionalKeys = ['PORT', 'CLIENT_DIST_PATH', 'CLIENT_URL'] as const;
  for (const key of optionalKeys) {
    const v = process.env[key];
    if (v !== undefined && v.trim() === '') {
      throw new Error(`${key} is set but empty`);
    }
  }
}

const app = express();

// Middleware
app.use(cookieParser());
// CORS: deployments run on local networks where the server IP varies. Echoing
// the request origin (with credentials enabled) is the only way to keep both
// the bundled SPA at the same host AND remote LAN access from any device
// working without CLIENT_URL having to be reconfigured every time.
app.use(cors({
  origin: (origin, cb) => cb(null, origin || true),
  credentials: true,
}));
// 1 MB is plenty for every legitimate request: the biggest payload is the CSV
// import (one row per student, ~80 bytes; even 1000 students fits in <100 KB).
// A smaller cap reduces blast radius from a malicious or runaway client.
app.use(express.json({ limit: '1mb' }));

// API Routes (all under /api)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/otisak/subjects', subjectRoutes);
app.use('/api/otisak/exams', examsRoutes);
app.use('/api/otisak/exams/:examId', examRoutes);
app.use('/api/otisak/practice', practiceRoutes);
app.use('/api/otisak/questions', questionsRoutes);
app.use('/api/otisak/history', historyRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve static client files in production
const clientDist = process.env.CLIENT_DIST_PATH || path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// Unknown /api/* routes must be a JSON 404, not the SPA. Without this the
// SPA fallback below would happily return index.html (HTML 200) for typo'd
// API paths, which masks bugs and confuses programmatic clients.
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

async function start(): Promise<void> {
  assertEnv();

  // Schema migrations: idempotent ALTER + backfill on every boot. MUST run
  // before we open the port so we never serve traffic against an
  // un-migrated DB (which would surface as cryptic SQL errors at runtime).
  await runMigrations();
  await ensureBootstrapAdmin();

  const server = http.createServer(app);
  const wss = setupWebSocket(server);

  // Background aggregator: every 5s, recompute live exam stats for monitored exams.
  // Admin RoomPage polls /live-stats and gets the cached result.
  startLiveStatsAggregator();

  // Background watcher: every 30s, find active exams whose timer has expired and
  // force-finish them server-side. Without this, students who closed their tab or
  // dropped offline would leave attempts open forever after the deadline.
  startExamExpiryWatcher();

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`OTISAK server running on port ${PORT}`);
    console.log(`Client served from: ${clientDist}`);
  });

  // Graceful shutdown. SIGTERM is what Docker / orchestrators send on
  // redeploy. We stop accepting new HTTP requests, close every WS
  // connection (heartbeat interval is cleared by wss.on('close')), drain
  // the DB pool so in-flight queries can finish, then exit. The unref'd
  // fallback timeout guarantees we don't hang forever if some socket
  // refuses to close.
  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; shutting down gracefully`);
    server.close((err) => {
      if (err) console.error('HTTP server close error:', err);
    });
    wss.close((err) => {
      if (err) console.error('WS server close error:', err);
    });
    try {
      await closePool();
    } catch (err) {
      console.error('DB pool close error:', err);
    }
    // 2 s grace; if any handle survives, force exit so the supervisor
    // can restart us cleanly rather than running half-dead.
    setTimeout(() => process.exit(0), 2000).unref();
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('FATAL: startup failed', err);
  process.exit(1);
});

export default app;
