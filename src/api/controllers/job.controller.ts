import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import Job from '../../models/Job';
import { JobStatus, JobPriority } from '../../types';
import { sendSuccess, sendError } from '../../utils/apiResponse';

// ── Create Job ────────────────────────────────────────────────

export async function createJob(req: Request, res: Response): Promise<void> {
  const { type, payload, priority, maxAttempts, scheduledAt } = req.body as {
    type: string;
    payload: Record<string, unknown>;
    priority?: number;
    maxAttempts?: number;
    scheduledAt?: Date;
  };

  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const isScheduled = scheduledAt && new Date(scheduledAt) > new Date();

  const job = await Job.create({
    jobId: uuidv4(),
    userId,
    type,
    payload,
    priority: priority ?? JobPriority.MEDIUM,
    maxAttempts: maxAttempts ?? 3,
    scheduledAt: scheduledAt ?? null,
    status: isScheduled ? JobStatus.SCHEDULED : JobStatus.PENDING,
    attempts: 0,
    errorHistory: [],
  });

  sendSuccess(res, job, 'Job created successfully', 201);
}

// ── List Jobs ─────────────────────────────────────────────────

export async function listJobs(req: Request, res: Response): Promise<void> {
  const { status, type, page, limit, sortBy, sortOrder } = req.query as {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  };

  const userId = new mongoose.Types.ObjectId(req.user!.id);

  const filter: Record<string, unknown> = { userId };
  if (status) filter.status = status;
  if (type) filter.type = type;

  const pageNum = Number(page) || 1;
  const limitNum = Math.min(Number(limit) || 20, 100);
  const skip = (pageNum - 1) * limitNum;
  const sort: Record<string, 1 | -1> = {
    [String(sortBy || 'createdAt')]: sortOrder === 'asc' ? 1 : -1,
  };

  const [jobs, total] = await Promise.all([
    Job.find(filter).sort(sort).skip(skip).limit(limitNum),
    Job.countDocuments(filter),
  ]);

  sendSuccess(res, jobs, undefined, 200, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
}

// ── Get Job ───────────────────────────────────────────────────

export async function getJob(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = new mongoose.Types.ObjectId(req.user!.id);

  const job = await Job.findOne({ jobId: id, userId });
  if (!job) {
    sendError(res, 'Job not found', 404);
    return;
  }

  sendSuccess(res, job);
}

// ── Cancel Job ────────────────────────────────────────────────

export async function cancelJob(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = new mongoose.Types.ObjectId(req.user!.id);

  const job = await Job.findOne({ jobId: id, userId });
  if (!job) {
    sendError(res, 'Job not found', 404);
    return;
  }

  const cancellable: JobStatus[] = [JobStatus.PENDING, JobStatus.SCHEDULED];
  if (!cancellable.includes(job.status)) {
    sendError(
      res,
      `Cannot cancel a job with status "${job.status}". Only PENDING or SCHEDULED jobs can be cancelled.`,
      422
    );
    return;
  }

  job.status = JobStatus.CANCELLED;
  await job.save();

  sendSuccess(res, job, 'Job cancelled successfully');
}

// ── Retry Job ─────────────────────────────────────────────────

export async function retryJob(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = new mongoose.Types.ObjectId(req.user!.id);

  const job = await Job.findOne({ jobId: id, userId });
  if (!job) {
    sendError(res, 'Job not found', 404);
    return;
  }

  const retryable: JobStatus[] = [JobStatus.FAILED, JobStatus.DEAD, JobStatus.CANCELLED];
  if (!retryable.includes(job.status)) {
    sendError(
      res,
      `Cannot retry a job with status "${job.status}". Only FAILED, DEAD, or CANCELLED jobs can be retried.`,
      422
    );
    return;
  }

  // If it was in the dead-letter queue, reset the attempt counter so it gets fresh retries
  if (job.status === JobStatus.DEAD) {
    job.attempts = 0;
  }

  job.status = JobStatus.PENDING;
  job.error = undefined;
  await job.save();

  sendSuccess(res, job, 'Job re-queued for processing');
}
