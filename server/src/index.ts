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
import { ensureBootstrapAdmin } from './bootstrap';
import { assertSessionSecretIsSafe } from './session';

// Refuse to boot with an empty / known-default / too-short SESSION_SECRET.
// Forged session cookies would otherwise let anyone impersonate an admin.
try {
  assertSessionSecretIsSafe();
} catch (e) {
  console.error('FATAL:', (e as Error).message);
  process.exit(1);
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
app.use(express.json({ limit: '5mb' }));

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

// Create HTTP server and attach WebSocket
const server = http.createServer(app);
setupWebSocket(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`OTISAK server running on port ${PORT}`);
  console.log(`Client served from: ${clientDist}`);
  await ensureBootstrapAdmin();
});

export default app;
