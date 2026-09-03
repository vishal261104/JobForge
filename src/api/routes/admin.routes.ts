import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { UserRole } from '../../types';
import {
  listDeadLetterJobs,
  getDeadLetterJob,
  retryDeadLetterJob,
  purgeDeadLetterJob,
  getDLQStats,
  retryAllDeadLetterJobs,
  getJobStats,
  getQueueMetrics,
} from '../controllers/admin.controller';

const router = Router();

// All admin routes require a valid JWT AND the ADMIN role
router.use(authenticate, authorize(UserRole.ADMIN));

// ── Platform Stats & Metrics ──────────────────────────────────

// GET  /api/v1/admin/stats
router.get('/stats', asyncHandler(getJobStats));

// GET  /api/v1/admin/metrics  — live BullMQ counts + throughput
router.get('/metrics', asyncHandler(getQueueMetrics));

// ── Dead-Letter Queue ─────────────────────────────────────────

// GET  /api/v1/admin/dead-letter-jobs/stats
// NOTE: must be registered BEFORE /:id to avoid 'stats' being matched as an id
router.get('/dead-letter-jobs/stats', asyncHandler(getDLQStats));

// GET  /api/v1/admin/dead-letter-jobs
router.get('/dead-letter-jobs', asyncHandler(listDeadLetterJobs));

// GET  /api/v1/admin/dead-letter-jobs/:id
router.get('/dead-letter-jobs/:id', asyncHandler(getDeadLetterJob));

// POST /api/v1/admin/dead-letter-jobs/retry-all
router.post('/dead-letter-jobs/retry-all', asyncHandler(retryAllDeadLetterJobs));

// POST /api/v1/admin/dead-letter-jobs/:id/retry
router.post('/dead-letter-jobs/:id/retry', asyncHandler(retryDeadLetterJob));

// DELETE /api/v1/admin/dead-letter-jobs/:id
router.delete('/dead-letter-jobs/:id', asyncHandler(purgeDeadLetterJob));

export default router;
