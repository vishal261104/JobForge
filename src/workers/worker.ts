/**
 * ─────────────────────────────────────────────────────────────
 *  QueueForge — Worker Process Entry Point (Stage 4)
 *
 *  Run with:
 *    npm run worker         (production)
 *    npm run worker:dev     (hot-reload dev)
 *
 *  This process:
 *   1. Connects to MongoDB
 *   2. Registers a BullMQ Worker on the 'jobforge' queue
 *   3. Dispatches jobs to per-type processor functions
 *   4. Keeps MongoDB Job documents in sync with BullMQ state
 *   5. Gracefully shuts down on SIGTERM / SIGINT
 * ─────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import { Worker, Job as BullJob, UnrecoverableError } from 'bullmq';
import { bullRedisConnection } from '../config/redis';
import { connectDB, disconnectDB } from '../config/db';
import { disconnectRedis } from '../config/redis';
import { QUEUE_NAME, QueueJobData } from '../queue/queue';
import { dispatch } from '../queue/processors';
import Job from '../models/Job';
import { JobStatus } from '../types';
import { computeNextRetryAt } from '../utils/retry';
import env from '../config/env';
import logger from '../utils/logger';

// ── Bootstrap ─────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info('⚙️   Starting QueueForge Worker process...');

  // 1. Connect to MongoDB so we can update Job documents
  await connectDB();

  // 2. Create the BullMQ Worker
  const worker = new Worker<QueueJobData, Record<string, unknown>>(
    QUEUE_NAME,
    dispatch,            // processor dispatcher
    {
      connection: bullRedisConnection,
      concurrency: env.WORKER_CONCURRENCY,
      // Stalled job timeout: if a job hasn't sent a heartbeat in 30 s,
      // BullMQ considers it stalled and re-queues it.
      stalledInterval: 30_000,
      maxStalledCount: 2,
    }
  );

  logger.info(
    { concurrency: env.WORKER_CONCURRENCY, queue: QUEUE_NAME },
    '✅  Worker registered and listening for jobs'
  );

  // ── Event: Job is being processed ───────────────────────────

  worker.on('active', async (bullJob: BullJob<QueueJobData>) => {
    const { jobId } = bullJob.data;
    logger.info(
      { jobId, bullJobId: bullJob.id, attempt: bullJob.attemptsMade + 1 },
      '🔄  Job activated — setting status to PROCESSING'
    );

    try {
      await Job.findOneAndUpdate(
        { jobId },
        {
          $set: { status: JobStatus.PROCESSING, bullJobId: bullJob.id },
          $inc: { attempts: 1 },
        }
      );
    } catch (err) {
      logger.error({ err, jobId }, '⚠️  Failed to update job status to PROCESSING');
    }
  });

  // ── Event: Job completed successfully ────────────────────────

  worker.on('completed', async (bullJob: BullJob<QueueJobData>, result: Record<string, unknown>) => {
    const { jobId } = bullJob.data;
    logger.info({ jobId, bullJobId: bullJob.id }, '✅  Job completed');

    try {
      await Job.findOneAndUpdate(
        { jobId },
        {
          $set: {
            status: JobStatus.COMPLETED,
            result,
            completedAt: new Date(),
            error: null,
            nextRetryAt: null, // clear any previous retry timestamp
          },
        }
      );
    } catch (err) {
      logger.error({ err, jobId }, '⚠️  Failed to update job status to COMPLETED');
    }
  });

  // ── Event: Job failed (one attempt) ──────────────────────────

  worker.on('failed', async (bullJob: BullJob<QueueJobData> | undefined, error: Error) => {
    if (!bullJob) return;

    const { jobId } = bullJob.data;
    const attemptsUsed = bullJob.attemptsMade;
    const maxAttempts  = bullJob.opts?.attempts ?? 1;

    // UnrecoverableError (including NonRetryableError) bypasses all retries —
    // BullMQ marks them as permanently failed regardless of remaining attempts.
    const isUnrecoverable = error instanceof UnrecoverableError;
    const hasRetriesLeft  = !isUnrecoverable && attemptsUsed < maxAttempts;
    const newStatus       = hasRetriesLeft ? JobStatus.FAILED : JobStatus.DEAD;

    // Compute when BullMQ will fire the next retry so API consumers can display it
    const nextRetryAt = hasRetriesLeft
      ? computeNextRetryAt(attemptsUsed, env.BACKOFF_BASE_DELAY, env.BACKOFF_TYPE)
      : null;

    logger.warn(
      {
        jobId,
        bullJobId: bullJob.id,
        attemptsUsed,
        maxAttempts,
        isUnrecoverable,
        willRetry: hasRetriesLeft,
        nextRetryAt,
        error: error.message,
      },
      `❌  Job failed → ${newStatus}`
    );

    try {
      await Job.findOneAndUpdate(
        { jobId },
        {
          $set: {
            status: newStatus,
            error: error.message,
            nextRetryAt,
          },
          $push: {
            errorHistory: {
              attempt: attemptsUsed,
              error: error.message,
              failedAt: new Date(),
            },
          },
        }
      );
    } catch (dbErr) {
      logger.error({ dbErr, jobId }, `⚠️  Failed to update job status to ${newStatus}`);
    }
  });

  // ── Event: Stalled job detected ──────────────────────────────

  worker.on('stalled', (bullJobId: string) => {
    logger.warn({ bullJobId }, '⚠️  Job stalled — BullMQ will re-queue it');
  });

  // ── Event: Worker-level error ─────────────────────────────────

  worker.on('error', (err: Error) => {
    logger.error({ err }, '❌  Worker encountered an error');
  });

  // ── Graceful Shutdown ─────────────────────────────────────────

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, '⏳  Worker shutting down gracefully...');

    try {
      // Close the worker — finishes the current job before stopping
      await worker.close();
      logger.info('🔌  BullMQ Worker closed');

      await disconnectDB();
      await disconnectRedis();

      logger.info('👋  Worker shutdown complete. Goodbye!');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, '💥  Error during worker shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, '💥  Unhandled promise rejection in worker');
    shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err: Error) => {
    logger.fatal({ err }, '💥  Uncaught exception in worker');
    shutdown('uncaughtException');
  });
}

// ── Run ───────────────────────────────────────────────────────

bootstrap().catch((err) => {
  logger.fatal({ err }, '💥  Failed to start worker process');
  process.exit(1);
});
