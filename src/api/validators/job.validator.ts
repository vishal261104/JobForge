import { z } from 'zod';
import { JobType, JobPriority, JobStatus } from '../../types';

// ── Create Job ────────────────────────────────────────────────

export const createJobSchema = z.object({
  body: z.object({
    type: z.nativeEnum(JobType, {
      errorMap: () => ({
        message: `type must be one of: ${Object.values(JobType).join(', ')}`,
      }),
    }),
    payload: z.record(z.unknown()).default({}),
    priority: z
      .nativeEnum(JobPriority, {
        errorMap: () => ({ message: 'priority must be 1 (HIGH), 5 (MEDIUM), or 10 (LOW)' }),
      })
      .optional()
      .default(JobPriority.MEDIUM),
    maxAttempts: z.number().int().min(1).max(10).optional().default(3),
    scheduledAt: z
      .string()
      .datetime({ message: 'scheduledAt must be a valid ISO 8601 datetime string' })
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
  }),
});

// ── List Jobs Query ───────────────────────────────────────────

export const listJobsSchema = z.object({
  query: z.object({
    status: z.nativeEnum(JobStatus).optional(),
    type: z.nativeEnum(JobType).optional(),
    page: z
      .string()
      .optional()
      .default('1')
      .transform((v) => Math.max(1, parseInt(v, 10))),
    limit: z
      .string()
      .optional()
      .default('20')
      .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10)))),
    sortBy: z
      .enum(['createdAt', 'updatedAt', 'priority', 'status', 'scheduledAt'])
      .optional()
      .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
});

export type CreateJobInput = z.infer<typeof createJobSchema>['body'];
export type ListJobsQuery = z.infer<typeof listJobsSchema>['query'];
