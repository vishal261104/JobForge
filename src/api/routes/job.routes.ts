import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { createJobSchema, listJobsSchema } from '../validators/job.validator';
import {
  createJob,
  listJobs,
  getJob,
  cancelJob,
  retryJob,
} from '../controllers/job.controller';

const router = Router();

// All job routes require a valid JWT
router.use(authenticate);

// POST   /api/v1/jobs          — submit a new job
router.post('/', validate(createJobSchema), asyncHandler(createJob));

// GET    /api/v1/jobs          — list your jobs (paginated + filterable)
router.get('/', validate(listJobsSchema), asyncHandler(listJobs));

// GET    /api/v1/jobs/:id      — get a specific job's status
router.get('/:id', asyncHandler(getJob));

// POST   /api/v1/jobs/:id/cancel  — cancel a PENDING or SCHEDULED job
router.post('/:id/cancel', asyncHandler(cancelJob));

// POST   /api/v1/jobs/:id/retry   — retry a FAILED, DEAD, or CANCELLED job
router.post('/:id/retry', asyncHandler(retryJob));

export default router;
