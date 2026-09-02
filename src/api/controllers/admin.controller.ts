import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Job from '../../models/Job';
import { JobStatus, JobType } from '../../types';
import { sendSuccess, sendError } from '../../utils/apiResponse';
import { enqueueJob } from '../../queue/queue';
import logger from '../../utils/logger';

// ── List Dead-Letter Jobs ────────────────────────────────────

/**
 * GET /api/v1/admin/dead-letter-jobs
 * Returns all DEAD jobs across all users, newest first.
 * Uses the pre-built Job.findDeadJobs() static that populates userId→email.
 */
export async function listDeadLetterJobs(req: Request, res: Response): Promise<void> {
  const { type, page, limit } = req.query as {
    type?: string;
    page?: string;
    limit?: string;
  };

  const pageNum  = Math.max(1, parseInt(page  ?? '1',  10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
  const skip     = (pageNum - 1) * limitNum;

  const filter: Record<string, unknown> = { status: JobStatus.DEAD };
  if (type && Object.values(JobType).includes(type as JobType)) {
    filter.type = type;
  }

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .populate('userId', 'email role tier')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Job.countDocuments(filter),
  ]);

  sendSuccess(res, jobs, undefined, 200, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
}

// ── Get Single Dead-Letter Job ───────────────────────────────

/**
 * GET /api/v1/admin/dead-letter-jobs/:id
 * Returns a specific DEAD job (by jobId UUID) with full error history.
 */
export async function getDeadLetterJob(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const job = await Job.findOne({ jobId: id, status: JobStatus.DEAD })
    .populate('userId', 'email role tier');

  if (!job) {
    sendError(res, 'Dead-letter job not found', 404);
    return;
  }

  sendSuccess(res, job);
}

// ── Retry Dead-Letter Job ────────────────────────────────────

/**
 * POST /api/v1/admin/dead-letter-jobs/:id/retry
 * Admin-level retry for a DEAD job: resets all attempt counters,
 * clears error history, and re-enqueues in BullMQ.
 */
export async function retryDeadLetterJob(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const job = await Job.findOne({ jobId: id, status: JobStatus.DEAD });
  if (!job) {
    sendError(res, 'Dead-letter job not found', 404);
    return;
  }

  // Full reset — wipe the slate clean
  job.status      = JobStatus.PENDING;
  job.attempts    = 0;
  job.error       = undefined;
  job.nextRetryAt = undefined;
  job.result      = undefined;
  // Keep errorHistory for audit purposes — don't clear it
  await job.save();

  // Re-enqueue in BullMQ with full retry budget
  try {
    const bullJobId = await enqueueJob(job);
    job.bullJobId = bullJobId;
    await job.save();
  } catch (queueErr) {
    logger.error(
      { err: queueErr, jobId: id },
      '⚠️  DLQ job reset to PENDING but BullMQ re-enqueue failed'
    );
  }

  logger.info(
    { jobId: id, adminId: req.user!.id },
    '♻️   Admin retried dead-letter job'
  );
  sendSuccess(res, job, 'Dead-letter job re-queued for processing');
}

// ── Purge Dead-Letter Job ────────────────────────────────────

/**
 * DELETE /api/v1/admin/dead-letter-jobs/:id
 * Permanently deletes a DEAD job from MongoDB.
 * Use when you've inspected the job and determined it's unrecoverable.
 */
export async function purgeDeadLetterJob(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const job = await Job.findOneAndDelete({ jobId: id, status: JobStatus.DEAD });
  if (!job) {
    sendError(res, 'Dead-letter job not found', 404);
    return;
  }

  logger.warn(
    { jobId: id, type: job.type, adminId: req.user!.id },
    '🗑️   Admin purged dead-letter job'
  );
  sendSuccess(res, { jobId: id }, 'Dead-letter job permanently deleted');
}

// ── DLQ Stats ────────────────────────────────────────────────

/**
 * GET /api/v1/admin/dead-letter-jobs/stats
 * Returns aggregate stats about the dead-letter queue:
 *   - total dead jobs
 *   - breakdown by job type
 *   - breakdown by most common error
 *   - oldest dead job timestamp
 */
export async function getDLQStats(req: Request, res: Response): Promise<void> {
  const [
    totalDead,
    byType,
    byError,
    oldest,
  ] = await Promise.all([
    // Total count
    Job.countDocuments({ status: JobStatus.DEAD }),

    // Breakdown by job type
    Job.aggregate([
      { $match: { status: JobStatus.DEAD } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // Top 10 most common error messages
    Job.aggregate([
      { $match: { status: JobStatus.DEAD, error: { $ne: null } } },
      { $group: { _id: '$error', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),

    // Oldest dead job
    Job.findOne({ status: JobStatus.DEAD })
      .sort({ updatedAt: 1 })
      .select('jobId type updatedAt'),
  ]);

  // Count jobs created in the last 24 hours
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = await Job.countDocuments({
    status: JobStatus.DEAD,
    updatedAt: { $gte: since24h },
  });

  sendSuccess(res, {
    totalDead,
    recentDead24h: recentCount,
    byType: byType.map((b: { _id: string; count: number }) => ({
      type: b._id,
      count: b.count,
    })),
    topErrors: byError.map((e: { _id: string; count: number }) => ({
      error: e._id,
      count: e.count,
    })),
    oldestJob: oldest
      ? { jobId: (oldest as unknown as { jobId: string }).jobId, type: (oldest as unknown as { type: string }).type, updatedAt: (oldest as unknown as { updatedAt: Date }).updatedAt }
      : null,
  });
}

// ── Bulk Retry ───────────────────────────────────────────────

/**
 * POST /api/v1/admin/dead-letter-jobs/retry-all
 * Retries ALL dead jobs of a given type (or all types if no type specified).
 * Returns count of jobs re-queued.
 */
export async function retryAllDeadLetterJobs(req: Request, res: Response): Promise<void> {
  const { type } = req.body as { type?: string };

  const filter: Record<string, unknown> = { status: JobStatus.DEAD };
  if (type && Object.values(JobType).includes(type as JobType)) {
    filter.type = type;
  }

  const deadJobs = await Job.find(filter);

  if (deadJobs.length === 0) {
    sendSuccess(res, { requeued: 0 }, 'No dead-letter jobs found matching the filter');
    return;
  }

  let requeued = 0;
  let failed   = 0;

  for (const job of deadJobs) {
    try {
      job.status      = JobStatus.PENDING;
      job.attempts    = 0;
      job.error       = undefined;
      job.nextRetryAt = undefined;
      await job.save();

      const bullJobId = await enqueueJob(job);
      job.bullJobId = bullJobId;
      await job.save();

      requeued++;
    } catch (err) {
      failed++;
      logger.error({ err, jobId: job.jobId }, '⚠️  Failed to re-queue DLQ job during bulk retry');
    }
  }

  logger.info(
    { requeued, failed, filter, adminId: req.user!.id },
    '♻️   Admin bulk-retried dead-letter jobs'
  );

  sendSuccess(
    res,
    { requeued, failed, total: deadJobs.length },
    `Bulk retry complete: ${requeued} re-queued, ${failed} failed`
  );
}

// ── Global Job Stats (bonus admin endpoint) ──────────────────

/**
 * GET /api/v1/admin/stats
 * High-level platform stats: jobs by status, throughput, etc.
 */
export async function getJobStats(req: Request, res: Response): Promise<void> {
  const [byStatus, byType, totalUsers] = await Promise.all([
    Job.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Job.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', JobStatus.COMPLETED] }, 1, 0] } } } },
      { $sort: { count: -1 } },
    ]),
    mongoose.model('User').countDocuments(),
  ]);

  const since1h  = new Date(Date.now() - 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [throughput1h, throughput24h] = await Promise.all([
    Job.countDocuments({ status: JobStatus.COMPLETED, completedAt: { $gte: since1h } }),
    Job.countDocuments({ status: JobStatus.COMPLETED, completedAt: { $gte: since24h } }),
  ]);

  sendSuccess(res, {
    totalUsers,
    byStatus: byStatus.map((s: { _id: string; count: number }) => ({ status: s._id, count: s.count })),
    byType: byType.map((t: { _id: string; count: number; completed: number }) => ({
      type: t._id,
      total: t.count,
      completed: t.completed,
      successRate: t.count > 0 ? Math.round((t.completed / t.count) * 100) + '%' : '0%',
    })),
    throughput: {
      last1h: throughput1h,
      last24h: throughput24h,
    },
  });
}
