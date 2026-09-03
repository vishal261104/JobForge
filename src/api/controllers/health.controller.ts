/**
 * ─────────────────────────────────────────────────────────────
 *  Stage 9 — Deep Health Check Controller
 *
 *  GET /health
 *
 *  Checks all critical system components:
 *   1. MongoDB — connectivity + latency
 *   2. Redis   — ping + latency
 *   3. BullMQ  — live job counts (requires Redis UP)
 *
 *  Response codes:
 *   200  healthy   — all components UP
 *   200  degraded  — some components DEGRADED (non-blocking)
 *   503  unhealthy — at least one critical component DOWN
 * ─────────────────────────────────────────────────────────────
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { redisClient } from '../../config/redis';
import { jobQueue } from '../../queue/queue';

// ── Types ─────────────────────────────────────────────────────

type ComponentStatus = 'UP' | 'DEGRADED' | 'DOWN';

interface ComponentHealth {
  status: ComponentStatus;
  latencyMs?: number;
  details?: Record<string, unknown>;
  error?: string;
}

interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  components: {
    mongodb: ComponentHealth;
    redis: ComponentHealth;
    queue: ComponentHealth;
  };
}

// ── Component Checkers ────────────────────────────────────────

async function checkMongoDB(): Promise<ComponentHealth> {
  const t0 = Date.now();
  try {
    const readyState = mongoose.connection.readyState;
    const STATE_LABELS: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
      99: 'uninitialized',
    };

    if (readyState !== 1) {
      return {
        status: 'DOWN',
        details: { state: STATE_LABELS[readyState] ?? 'unknown' },
        error: `MongoDB is in "${STATE_LABELS[readyState]}" state`,
      };
    }

    // Actual admin ping — catches issues where connection appears open but DB is unreachable
    await mongoose.connection.db?.admin().ping();

    return {
      status: 'UP',
      latencyMs: Date.now() - t0,
      details: {
        state: 'connected',
        host: mongoose.connection.host,
        database: mongoose.connection.name,
      },
    };
  } catch (err) {
    return {
      status: 'DOWN',
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : 'MongoDB ping failed',
    };
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  const t0 = Date.now();
  try {
    const response = await Promise.race<unknown>([
      redisClient.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis ping timed out after 3 000 ms')), 3_000)
      ),
    ]);

    const latencyMs = Date.now() - t0;

    if (response !== 'PONG') {
      return {
        status: 'DEGRADED',
        latencyMs,
        details: { response },
        error: `Unexpected ping response: ${response}`,
      };
    }

    return {
      status: 'UP',
      latencyMs,
      details: { response },
    };
  } catch (err) {
    return {
      status: 'DOWN',
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : 'Redis ping failed',
    };
  }
}

async function checkQueue(): Promise<ComponentHealth> {
  const t0 = Date.now();
  try {
    const [counts, isPaused] = await Promise.all([
      jobQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
      jobQueue.isPaused(),
    ]);

    const latencyMs = Date.now() - t0;

    // Flag as degraded if backlog is unusually large (> 1 000 waiting) or worker is paused
    const backlogWarning = counts.waiting > 1_000;
    const status: ComponentStatus = backlogWarning || isPaused ? 'DEGRADED' : 'UP';

    return {
      status,
      latencyMs,
      details: {
        queueName: jobQueue.name,
        isPaused,
        counts: {
          waiting:   counts.waiting,
          active:    counts.active,
          delayed:   counts.delayed,
          paused:    counts.paused,
          completed: counts.completed,
          failed:    counts.failed,
        },
        ...(backlogWarning && { warning: `High backlog: ${counts.waiting} waiting jobs` }),
      },
    };
  } catch (err) {
    return {
      status: 'DOWN',
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : 'Queue health check failed',
    };
  }
}

// ── Controller ────────────────────────────────────────────────

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  // Run all checks concurrently
  const [mongodb, redis, queue] = await Promise.all([
    checkMongoDB(),
    checkRedis(),
    checkQueue(),
  ]);

  const components = { mongodb, redis, queue };

  const statuses = Object.values(components).map((c) => c.status);
  const overallStatus: HealthReport['status'] =
    statuses.every((s) => s === 'UP')
      ? 'healthy'
      : statuses.some((s) => s === 'DOWN')
      ? 'unhealthy'
      : 'degraded';

  const httpCode = overallStatus === 'unhealthy' ? 503 : 200;

  const report: HealthReport = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    version: process.env.npm_package_version ?? '1.0.0',
    components,
  };

  res.status(httpCode).json({
    success: overallStatus !== 'unhealthy',
    data: report,
  });
}
