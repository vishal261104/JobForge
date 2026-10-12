/**
 * Integration Tests — Admin Routes
 *
 * Covers:
 *   GET    /api/v1/admin/stats
 *   GET    /api/v1/admin/metrics
 *   GET    /api/v1/admin/dead-letter-jobs
 *   GET    /api/v1/admin/dead-letter-jobs/stats
 *   GET    /api/v1/admin/dead-letter-jobs/:id
 *   POST   /api/v1/admin/dead-letter-jobs/:id/retry
 *   POST   /api/v1/admin/dead-letter-jobs/retry-all
 *   DELETE /api/v1/admin/dead-letter-jobs/:id
 *
 * MongoDB: real Atlas test DB (cleaned by setup.ts afterEach).
 * Redis / BullMQ: mocked via tests/setup.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../../src/app';
import { JobStatus, JobType, JobPriority, UserRole } from '../../src/types';

const app = createApp();

// ── Helpers ────────────────────────────────────────────────────

async function registerUser(email: string, password = 'Password123!') {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password });
  return res.body.data?.token as string;
}

async function makeAdmin(email: string): Promise<void> {
  const User = mongoose.model('User');
  await User.updateOne({ email }, { $set: { role: UserRole.ADMIN } });
}

async function registerAdmin(email: string): Promise<string> {
  await registerUser(email);
  await makeAdmin(email);
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Password123!' });
  return res.body.data?.token as string;
}

async function seedDeadJob(
  userId: mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {}
) {
  const Job = mongoose.model('Job');
  return Job.create({
    jobId:    uuidv4(),
    userId,
    type:     JobType.SEND_EMAIL,
    payload:  { to: 'a@b.com', subject: 'Hi', body: 'Test' },
    status:   JobStatus.DEAD,
    priority: JobPriority.MEDIUM,
    attempts: 3,
    maxAttempts: 3,
    error:    'Simulated permanent failure',
    errorHistory: [
      { attempt: 1, error: 'First failure',             failedAt: new Date() },
      { attempt: 2, error: 'Second failure',            failedAt: new Date() },
      { attempt: 3, error: 'Simulated permanent failure', failedAt: new Date() },
    ],
    ...overrides,
  });
}

async function getUserId(email: string): Promise<mongoose.Types.ObjectId> {
  const User = mongoose.model('User');
  const u = await User.findOne({ email });
  return u!._id as mongoose.Types.ObjectId;
}

// ── Authorization Guard ────────────────────────────────────────

describe('Admin route authorization', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/admin/stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular user', async () => {
    const token = await registerUser('regular-user@example.com');
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for a valid ADMIN token', async () => {
    const adminToken = await registerAdmin('admin-access@example.com');
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ── GET /api/v1/admin/stats ────────────────────────────────────

describe('GET /api/v1/admin/stats', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await registerAdmin('stats-admin@example.com');
  });

  it('returns 200 with the expected shape', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalUsers');
    expect(res.body.data).toHaveProperty('byStatus');
    expect(res.body.data).toHaveProperty('byType');
    expect(res.body.data).toHaveProperty('throughput');
  });

  it('includes last1h and last24h throughput windows', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.throughput).toHaveProperty('last1h');
    expect(res.body.data.throughput).toHaveProperty('last24h');
  });

  it('totalUsers is at least 1', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.totalUsers).toBeGreaterThanOrEqual(1);
  });
});

// ── GET /api/v1/admin/metrics ──────────────────────────────────

describe('GET /api/v1/admin/metrics', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await registerAdmin('metrics-admin@example.com');
  });

  it('returns 200 with queue, worker, throughput and backoff sections', async () => {
    const res = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('queue');
    expect(res.body.data).toHaveProperty('worker');
    expect(res.body.data).toHaveProperty('throughput');
    expect(res.body.data).toHaveProperty('backoffConfig');
  });

  it('queue.counts has the expected fields (from mock)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`);

    const { counts } = res.body.data.queue;
    expect(counts).toHaveProperty('waiting');
    expect(counts).toHaveProperty('active');
    expect(counts).toHaveProperty('delayed');
    expect(counts).toHaveProperty('failed');
  });

  it('worker.concurrency is a positive number', async () => {
    const res = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(typeof res.body.data.worker.concurrency).toBe('number');
    expect(res.body.data.worker.concurrency).toBeGreaterThan(0);
  });

  it('rateLimits exposes free and premium tiers', async () => {
    const res = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.rateLimits).toHaveProperty('free');
    expect(res.body.data.rateLimits).toHaveProperty('premium');
  });
});

// ── GET /api/v1/admin/dead-letter-jobs ────────────────────────

describe('GET /api/v1/admin/dead-letter-jobs', () => {
  let adminToken: string;
  let userId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    adminToken = await registerAdmin('dlq-list-admin@example.com');
    userId = await getUserId('dlq-list-admin@example.com');
  });

  it('returns 200 and empty array when no dead jobs exist', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dead-letter-jobs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns seeded dead jobs', async () => {
    await seedDeadJob(userId);
    await seedDeadJob(userId, { type: JobType.GENERATE_REPORT });

    const res = await request(app)
      .get('/api/v1/admin/dead-letter-jobs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by job type', async () => {
    await seedDeadJob(userId, { type: JobType.SEND_EMAIL });
    await seedDeadJob(userId, { type: JobType.PROCESS_IMAGE });

    const res = await request(app)
      .get(`/api/v1/admin/dead-letter-jobs?type=${JobType.SEND_EMAIL}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(
      res.body.data.every((j: { type: string }) => j.type === JobType.SEND_EMAIL)
    ).toBe(true);
  });

  it('returns pagination meta with page, limit, total, totalPages', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dead-letter-jobs?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.meta).toHaveProperty('page');
    expect(res.body.meta).toHaveProperty('limit');
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('totalPages');
  });
});

// ── GET /api/v1/admin/dead-letter-jobs/stats ──────────────────

describe('GET /api/v1/admin/dead-letter-jobs/stats', () => {
  let adminToken: string;
  let userId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    adminToken = await registerAdmin('dlq-stats-admin@example.com');
    userId = await getUserId('dlq-stats-admin@example.com');
  });

  it('returns the DLQ stats shape', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dead-letter-jobs/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalDead');
    expect(res.body.data).toHaveProperty('recentDead24h');
    expect(res.body.data).toHaveProperty('byType');
    expect(res.body.data).toHaveProperty('topErrors');
    expect(res.body.data).toHaveProperty('oldestJob');
  });

  it('totalDead reflects seeded jobs', async () => {
    await seedDeadJob(userId);
    await seedDeadJob(userId);

    const res = await request(app)
      .get('/api/v1/admin/dead-letter-jobs/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.totalDead).toBeGreaterThanOrEqual(2);
  });

  it('oldestJob is null when there are no dead jobs', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dead-letter-jobs/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.totalDead).toBe(0);
    expect(res.body.data.oldestJob).toBeNull();
  });
});

// ── GET /api/v1/admin/dead-letter-jobs/:id ────────────────────

describe('GET /api/v1/admin/dead-letter-jobs/:id', () => {
  let adminToken: string;
  let userId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    adminToken = await registerAdmin('dlq-get-admin@example.com');
    userId = await getUserId('dlq-get-admin@example.com');
  });

  it('returns the dead job by jobId', async () => {
    const job = await seedDeadJob(userId);

    const res = await request(app)
      .get(`/api/v1/admin/dead-letter-jobs/${job.jobId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.jobId).toBe(job.jobId);
    expect(res.body.data.status).toBe(JobStatus.DEAD);
  });

  it('returns 404 for a non-existent jobId', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dead-letter-jobs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('includes errorHistory in the response', async () => {
    const job = await seedDeadJob(userId);

    const res = await request(app)
      .get(`/api/v1/admin/dead-letter-jobs/${job.jobId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(Array.isArray(res.body.data.errorHistory)).toBe(true);
    expect(res.body.data.errorHistory.length).toBeGreaterThan(0);
  });
});

// ── POST /api/v1/admin/dead-letter-jobs/:id/retry ─────────────

describe('POST /api/v1/admin/dead-letter-jobs/:id/retry', () => {
  let adminToken: string;
  let userId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    adminToken = await registerAdmin('dlq-retry-admin@example.com');
    userId = await getUserId('dlq-retry-admin@example.com');
  });

  it('resets status to PENDING and clears attempts', async () => {
    const job = await seedDeadJob(userId);

    const res = await request(app)
      .post(`/api/v1/admin/dead-letter-jobs/${job.jobId}/retry`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(JobStatus.PENDING);
    expect(res.body.data.attempts).toBe(0);
  });

  it('clears the error field on retry', async () => {
    const job = await seedDeadJob(userId);

    const res = await request(app)
      .post(`/api/v1/admin/dead-letter-jobs/${job.jobId}/retry`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.error).toBeFalsy();
  });

  it('assigns the bullJobId returned by the mock queue', async () => {
    const job = await seedDeadJob(userId);

    const res = await request(app)
      .post(`/api/v1/admin/dead-letter-jobs/${job.jobId}/retry`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.bullJobId).toBe('bull-mock-id');
  });

  it('returns 404 for a non-existent job', async () => {
    const res = await request(app)
      .post('/api/v1/admin/dead-letter-jobs/00000000-0000-0000-0000-000000000000/retry')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

// ── POST /api/v1/admin/dead-letter-jobs/retry-all ─────────────

describe('POST /api/v1/admin/dead-letter-jobs/retry-all', () => {
  let adminToken: string;
  let userId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    adminToken = await registerAdmin('dlq-retry-all-admin@example.com');
    userId = await getUserId('dlq-retry-all-admin@example.com');
  });

  it('returns requeued=0 when there are no dead jobs', async () => {
    const res = await request(app)
      .post('/api/v1/admin/dead-letter-jobs/retry-all')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.requeued).toBe(0);
  });

  it('re-queues all dead jobs and returns the count', async () => {
    await seedDeadJob(userId);
    await seedDeadJob(userId);
    await seedDeadJob(userId);

    const res = await request(app)
      .post('/api/v1/admin/dead-letter-jobs/retry-all')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.requeued).toBe(3);
    expect(res.body.data.total).toBe(3);
  });

  it('filters by type when type is provided', async () => {
    await seedDeadJob(userId, { type: JobType.SEND_EMAIL });
    await seedDeadJob(userId, { type: JobType.SEND_EMAIL });
    await seedDeadJob(userId, { type: JobType.PROCESS_IMAGE });

    const res = await request(app)
      .post('/api/v1/admin/dead-letter-jobs/retry-all')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: JobType.SEND_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.data.requeued).toBe(2);
    expect(res.body.data.total).toBe(2);
  });
});

// ── DELETE /api/v1/admin/dead-letter-jobs/:id ─────────────────

describe('DELETE /api/v1/admin/dead-letter-jobs/:id', () => {
  let adminToken: string;
  let userId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    adminToken = await registerAdmin('dlq-purge-admin@example.com');
    userId = await getUserId('dlq-purge-admin@example.com');
  });

  it('permanently deletes a dead job and returns its jobId', async () => {
    const job = await seedDeadJob(userId);

    const deleteRes = await request(app)
      .delete(`/api/v1/admin/dead-letter-jobs/${job.jobId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.jobId).toBe(job.jobId);
  });

  it('the job is no longer retrievable after deletion', async () => {
    const job = await seedDeadJob(userId);

    await request(app)
      .delete(`/api/v1/admin/dead-letter-jobs/${job.jobId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const getRes = await request(app)
      .get(`/api/v1/admin/dead-letter-jobs/${job.jobId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(404);
  });

  it('returns 404 when purging a non-existent job', async () => {
    const res = await request(app)
      .delete('/api/v1/admin/dead-letter-jobs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
