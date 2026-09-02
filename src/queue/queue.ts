import { Queue, JobsOptions } from 'bullmq';
import { bullRedisConnection } from '../config/redis';
import { IJob } from '../models/Job';
import logger from '../utils/logger';

// ── Constants ─────────────────────────────────────────────────

export const QUEUE_NAME = 'jobforge';

// ── Data Shape ────────────────────────────────────────────────

/**
 * The data payload stored inside every BullMQ job.
 * Workers use `jobId` to look up the corresponding Mongoose document.
 */
export interface QueueJobData {
  /** Public-facing UUID — primary key for Mongoose Job lookups */
  jobId: string;
  /** MongoDB user ObjectId as a string */
  userId: string;
  /** JobType enum value */
  type: string;
}

// ── Queue Instance ────────────────────────────────────────────

/**
 * The single shared BullMQ Queue for the entire platform.
 * Uses the dedicated bullRedisConnection (maxRetriesPerRequest: null required by BullMQ).
 */
export const jobQueue = new Queue<QueueJobData>(QUEUE_NAME, {
  connection: bullRedisConnection,
  defaultJobOptions: {
    // Keep completed job records in Redis for debugging (up to 1 000)
    removeOnComplete: { count: 1_000, age: 60 * 60 * 24 }, // 24 hours
    // Keep failed job records longer for post-mortem analysis
    removeOnFail: { count: 5_000, age: 60 * 60 * 24 * 7 }, // 7 days
  },
});

jobQueue.on('error', (err) => {
  logger.error({ err }, '❌  BullMQ Queue error');
});

// ── Enqueue Helper ────────────────────────────────────────────

/**
 * Adds a Mongoose Job document to the BullMQ queue.
 *
 * Handles:
 *  - Priority mapping (HIGH=1, MEDIUM=5, LOW=10 → lower = higher priority)
 *  - Scheduled / delayed jobs via `scheduledAt`
 *  - Exponential backoff retry configuration
 *
 * @returns The BullMQ job ID (stored as `bullJobId` on the Mongoose doc)
 */
export async function enqueueJob(job: IJob): Promise<string> {
  const now = new Date();

  // Calculate delay for scheduled jobs
  const delay =
    job.scheduledAt && job.scheduledAt > now
      ? job.scheduledAt.getTime() - now.getTime()
      : 0;

  const opts: JobsOptions = {
    priority: job.priority as number, // 1=HIGH, 5=MEDIUM, 10=LOW
    attempts: job.maxAttempts,
    backoff: {
      type: 'exponential',
      delay: 1_000, // 1 s → 2 s → 4 s → 8 s …
    },
    ...(delay > 0 && { delay }),
    removeOnComplete: { count: 1_000, age: 60 * 60 * 24 },
    removeOnFail: { count: 5_000, age: 60 * 60 * 24 * 7 },
  };

  const data: QueueJobData = {
    jobId: job.jobId,
    userId: job.userId.toString(),
    type: job.type,
  };

  const bullJob = await jobQueue.add(job.type, data, opts);

  logger.info(
    {
      jobId: job.jobId,
      bullJobId: bullJob.id,
      type: job.type,
      priority: job.priority,
      maxAttempts: job.maxAttempts,
      delayMs: delay,
    },
    '📤  Job enqueued to BullMQ'
  );

  return bullJob.id!;
}
