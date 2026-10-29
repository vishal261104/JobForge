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
import {
  streamJobEvents,
  streamUserJobs,
  renderLiveDemo,
} from '../controllers/jobStream.controller';

const router = Router();

// HTML Live Demo can be viewed in browser with ?token=...
router.get('/:id/live', asyncHandler(renderLiveDemo));

// All remaining job routes require a valid JWT
router.use(authenticate);

// GET    /api/v1/jobs/events                — stream all real-time events for authenticated user
router.get('/events', asyncHandler(streamUserJobs));

// POST   /api/v1/jobs  — submit a new job (rate limited per user tier)
router.post('/', jobRateLimiter, validate(createJobSchema), asyncHandler(createJob));

// GET    /api/v1/jobs                       — list your jobs (paginated + filterable)
router.get('/', validate(listJobsSchema), asyncHandler(listJobs));

// GET    /api/v1/jobs/:id/events            — stream real-time events (SSE) for a specific job
router.get('/:id/events', asyncHandler(streamJobEvents));

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
