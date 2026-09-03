import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import apiRouter from './api/routes';
import { globalRateLimiter } from './api/middlewares/rateLimit.middleware';
import { healthCheck } from './api/controllers/health.controller';
import { mountSwagger } from './config/swagger';
import { ApiResponse } from './types';
import logger from './utils/logger';

// ── App Factory ───────────────────────────────────────────────

export function createApp(): Application {
  const app = express();

  // ── Security Middleware ──────────────────────────────────────
  app.use(helmet());
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
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Health Check (Stage 9) ──────────────────────────────────────
  // Deep check: MongoDB + Redis + BullMQ. Returns 503 when unhealthy.
  app.get('/health', healthCheck);

  // ── API Routes ─────────────────────────────────────────────
  app.use('/api/v1', apiRouter);

  // ── Swagger UI (Stage 11) ────────────────────────────────────
  mountSwagger(app);

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
