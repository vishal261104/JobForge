import { Job } from 'bullmq';
import { QueueJobData } from '../queue';
import { sendEmailProcessor } from './sendEmail.processor';
import { generateReportProcessor } from './generateReport.processor';
import { processImageProcessor } from './processImage.processor';
import { exportDataProcessor } from './exportData.processor';
import { sendNotificationProcessor } from './sendNotification.processor';
import JobModel from '../../models/Job';
import { JobType } from '../../types';
import logger from '../../utils/logger';

// ── Processor Registry ────────────────────────────────────────

type ProcessorFn = (job: Job<QueueJobData>) => Promise<Record<string, unknown>>;

const processorRegistry: Record<string, ProcessorFn> = {
  [JobType.SEND_EMAIL]: sendEmailProcessor,
  [JobType.GENERATE_REPORT]: generateReportProcessor,
  [JobType.PROCESS_IMAGE]: processImageProcessor,
  [JobType.EXPORT_DATA]: exportDataProcessor,
  [JobType.SEND_NOTIFICATION]: sendNotificationProcessor,
};

// ── Dispatcher ────────────────────────────────────────────────

/**
 * Routes a BullMQ job to the appropriate type-specific processor.
 * This is the single entry point used by the BullMQ Worker.
 *
 * Supports interactive testing overrides:
 *  - payload.simulateError: true (triggers retries and DLQ quarantine)
 *  - payload.simulateDelayMs: 8000 (slows down execution so real-time SSE progress is easily observed)
 */
export async function dispatch(job: Job<QueueJobData>): Promise<Record<string, unknown>> {
  const { jobId, type } = job.data;

  const processor = processorRegistry[type];

  if (!processor) {
    const msg = `Unknown job type: "${type}"`;
    logger.error({ jobId, type }, `❌  ${msg}`);
    throw new Error(msg);
  }

  logger.info({ jobId, type, attempt: job.attemptsMade + 1 }, `⚙️   Processing job`);

  // Check MongoDB payload for interactive test simulation hooks
  const jobDoc = await JobModel.findOne({ jobId });
  const payload = (jobDoc?.payload || {}) as Record<string, any>;

  // 1. Simulation: Error / DLQ Trigger
  if (payload.simulateError) {
    const failUntil = typeof payload.failAttempts === 'number' ? payload.failAttempts : 999;
    if (job.attemptsMade < failUntil) {
      throw new Error(
        payload.errorMessage ||
          `Simulated 3rd-party service outage on attempt ${job.attemptsMade + 1}`
      );
    }
  }

  // 2. Simulation: Visible Slowdown (for watching live progress bar)
  if (payload.simulateDelayMs && typeof payload.simulateDelayMs === 'number') {
    const totalMs = Math.min(payload.simulateDelayMs, 30_000);
    const steps = [15, 30, 50, 70, 85, 100];
    const stepTime = totalMs / steps.length;
    for (const pct of steps) {
      await job.updateProgress(pct);
      await new Promise((r) => setTimeout(r, stepTime));
    }
    return {
      simulated: true,
      durationMs: totalMs,
      completedAt: new Date().toISOString(),
    };
  }

  return processor(job);
}
