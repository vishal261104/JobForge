import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { jobRateLimiter } from '../middlewares/rateLimit.middleware';
import {
  createJobSchema,
  listJobsSchema,
  updatePrioritySchema,
  rescheduleJobSchema,
} from '../validators/job.validator';
import {
  createJob,
  listJobs,
  getJob,
  cancelJob,
  retryJob,
  updateJobPriority,
  rescheduleJob,
} from '../controllers/job.controller';

const router = Router();

// All job routes require a valid JWT
router.use(authenticate);

// POST   /api/v1/jobs  — submit a new job (rate limited per user tier)
router.post('/', jobRateLimiter, validate(createJobSchema), asyncHandler(createJob));

// GET    /api/v1/jobs                       — list your jobs (paginated + filterable)
router.get('/', validate(listJobsSchema), asyncHandler(listJobs));

// GET    /api/v1/jobs/:id                   — get a specific job's status
router.get('/:id', asyncHandler(getJob));

// POST   /api/v1/jobs/:id/cancel            — cancel a PENDING or SCHEDULED job
router.post('/:id/cancel', asyncHandler(cancelJob));

// POST   /api/v1/jobs/:id/retry             — retry a FAILED, DEAD, or CANCELLED job
router.post('/:id/retry', asyncHandler(retryJob));

// PATCH  /api/v1/jobs/:id/priority          — update priority (PENDING/SCHEDULED only)
router.patch('/:id/priority', validate(updatePrioritySchema), asyncHandler(updateJobPriority));

// PATCH  /api/v1/jobs/:id/schedule          — reschedule a job to a new future time
router.patch('/:id/schedule', validate(rescheduleJobSchema), asyncHandler(rescheduleJob));

export default router;
