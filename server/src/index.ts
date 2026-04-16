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

const app = express();

// Middleware
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
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

// SPA fallback - serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Create HTTP server and attach WebSocket
const server = http.createServer(app);
setupWebSocket(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`OTISAK server running on port ${PORT}`);
  console.log(`Client served from: ${clientDist}`);
});

export default app;
