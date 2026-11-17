import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import apiRouter from './api/routes';
import { globalRateLimiter } from './api/middlewares/rateLimit.middleware';
import { healthCheck } from './api/controllers/health.controller';
import { mountSwagger } from './config/swagger';
import { mountBullBoard } from './config/bullBoard';
import { mountDLQDashboard } from './config/dlqDashboard';
import { ApiResponse } from './types';
import logger from './utils/logger';

// ── App Factory ───────────────────────────────────────────────

export function createApp(): Application {
  const app = express();

  // ── Security Middleware ──────────────────────────────────────
  // CSP disabled so Swagger UI and Bull Board UI dashboards render styles/scripts
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin:
        process.env.NODE_ENV === 'production'
          ? process.env.ALLOWED_ORIGINS?.split(',') ?? []
          : '*',
      credentials: true,
    })
  );

  // ── Global IP Rate Limiter (Stage 8) ─────────────────────────
  // Applied before routes — protects unauthenticated endpoints too.
  app.use(globalRateLimiter);

  // ── Body Parsing ─────────────────────────────────────────────
  // Captures rawBody buffer for cryptographic Stripe webhook signature verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: Request, _res: Response, buf: Buffer) => {
        (req as any).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Root Landing Portal ──────────────────────────────────────
  app.get('/', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JobForge — Background Job Processing Platform</title>
  <style>
    :root {
      --bg: #0b1120;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; max-width: 640px; width: 100%; padding: 40px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; }
    h1 { font-size: 28px; font-weight: 800; color: var(--accent); margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; }
    p { color: var(--muted); font-size: 15px; line-height: 1.6; margin-bottom: 32px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; text-align: left; }
    @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
    .link-card { background: #0f172a; border: 1px solid var(--border); border-radius: 10px; padding: 18px; text-decoration: none; color: var(--text); transition: all 0.2s; display: block; }
    .link-card:hover { border-color: var(--accent); transform: translateY(-2px); background: #131d33; }
    .title { font-size: 15px; font-weight: 700; color: var(--accent); margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
    .desc { font-size: 12px; color: var(--muted); line-height: 1.4; }
    .badge { display: inline-block; margin-top: 24px; font-size: 12px; color: #4ade80; background: #10b98115; border: 1px solid #10b98140; padding: 4px 12px; border-radius: 999px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🚀 JobForge Platform</h1>
    <p>A production-grade distributed background job processing system built with TypeScript, Node.js, Express, BullMQ, Redis, and MongoDB.</p>
    
    <div class="grid">
      <a href="/api-docs" class="link-card">
        <div class="title">📖 Swagger API Docs</div>
        <div class="desc">Interactive REST API explorer with "Try it out" buttons for all endpoints.</div>
      </a>
      <a href="/admin/dlq" class="link-card">
        <div class="title">🛠️ DLQ Dashboard</div>
        <div class="desc">Admin UI to inspect error logs, retry dead jobs, bulk-retry, and purge poison pills.</div>
      </a>
      <a href="/admin/queues" class="link-card">
        <div class="title">📊 Bull Board UI</div>
        <div class="desc">Real-time queue monitoring (Active, Waiting, Completed, Failed, Delayed).</div>
      </a>
      <a href="/health" class="link-card">
        <div class="title">❤️ System Health</div>
        <div class="desc">Deep connectivity and latency check for MongoDB, Redis, and BullMQ.</div>
      </a>
    </div>

    <div class="badge">● System Online & Deployed</div>
  </div>
</body>
</html>`);
  });

  // ── Health Check (Stage 9) ──────────────────────────────────────
  // Deep check: MongoDB + Redis + BullMQ. Returns 503 when unhealthy.
  app.get('/health', healthCheck);

  // ── API Routes ─────────────────────────────────────────────
  app.use('/api/v1', apiRouter);

  // ── Swagger UI (Stage 11) ────────────────────────────────────
  mountSwagger(app);

  // ── Bull Board UI (Stage 13) ─────────────────────────────────
  mountBullBoard(app);

  // ── DLQ Remediation Dashboard ────────────────────────────────
  mountDLQDashboard(app);

  // ── 404 Handler ──────────────────────────────────────────────
  app.use((req: Request, res: Response) => {
    const response: ApiResponse = {
      success: false,
      error: `Route ${req.method} ${req.originalUrl} not found`,
    };
    res.status(404).json(response);
  });

  // ── Global Error Handler ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const isDev = process.env.NODE_ENV !== 'production';
    logger.error({ err }, 'Unhandled error');
    const response: ApiResponse = {
      success: false,
      error: err.message ?? 'Internal server error',
      ...(isDev && { data: { stack: err.stack } }),
    };
    res.status(500).json(response);
  });

  return app;
}
