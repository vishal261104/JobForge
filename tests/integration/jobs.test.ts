/**
 * Integration Tests — Job Routes  (Stage 10)
 *
 * Uses supertest against the real Express app.
 * MongoDB: real Atlas (test DB — cleaned between tests by setup.ts)
 * Redis/BullMQ: mocked via tests/setup.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { JobType, JobPriority, JobStatus } from '../../src/types';

const app = createApp();

// ── Helpers ───────────────────────────────────────────────────

async function createUserAndToken(email = 'jobs@example.com', password = 'Password123!') {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password });
  return res.body.data?.token as string;
}

const basePayload = {
  type:    JobType.SEND_EMAIL,
  payload: { to: 'alice@example.com', subject: 'Hello', body: 'World' },
};

// ── POST /api/v1/jobs ─────────────────────────────────────────

describe('POST /api/v1/jobs', () => {
  let token: string;
  beforeEach(async () => { token = await createUserAndToken(); });

  it('returns 201 and the created job', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('jobId');
    expect(res.body.data.type).toBe(JobType.SEND_EMAIL);
    expect(res.body.data.status).toBe(JobStatus.PENDING);
  });

  it('uses MEDIUM priority by default', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    expect(res.body.data.priority).toBe(JobPriority.MEDIUM);
  });

  it('accepts a HIGH priority override', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, priority: JobPriority.HIGH });

    expect(res.body.data.priority).toBe(JobPriority.HIGH);
  });

  it('returns SCHEDULED status when scheduledAt is a future datetime', async () => {
    const futureTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, scheduledAt: futureTime });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe(JobStatus.SCHEDULED);
  });

  it('rejects a past scheduledAt with 422', async () => {
    const pastTime = new Date(Date.now() - 60_000).toISOString();
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, scheduledAt: pastTime });

    expect(res.status).toBe(422);
  });

  it('returns 401 without a Bearer token', async () => {
    const res = await request(app).post('/api/v1/jobs').send(basePayload);
    expect(res.status).toBe(401);
  });

  it('returns 422 for an invalid job type', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, type: 'INVALID' });

    expect(res.status).toBe(422);
  });

  it('stores the bullJobId returned by the mock queue', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    expect(res.body.data.bullJobId).toBe('bull-mock-id');
  });

  it('sets X-RateLimit-* response headers', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    expect(res.headers).toHaveProperty('x-ratelimit-limit');
    expect(res.headers).toHaveProperty('x-ratelimit-remaining');
    expect(res.headers).toHaveProperty('x-ratelimit-reset');
  });
});

// ── GET /api/v1/jobs ──────────────────────────────────────────

describe('GET /api/v1/jobs', () => {
  let token: string;
  beforeEach(async () => { token = await createUserAndToken('list@example.com'); });

  it('returns 200 and an empty array when no jobs exist', async () => {
    const res = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns created jobs in the list', async () => {
    await request(app).post('/api/v1/jobs').set('Authorization', `Bearer ${token}`).send(basePayload);
    await request(app).post('/api/v1/jobs').set('Authorization', `Bearer ${token}`).send({
      type: JobType.GENERATE_REPORT,
      payload: { reportType: 'sales', format: 'pdf' },
    });

    const res = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by status', async () => {
    await request(app).post('/api/v1/jobs').set('Authorization', `Bearer ${token}`).send(basePayload);

    const res = await request(app)
      .get('/api/v1/jobs?status=PENDING')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((j: { status: string }) => j.status === 'PENDING')).toBe(true);
  });

  it('returns pagination metadata', async () => {
    const res = await request(app)
      .get('/api/v1/jobs?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.meta).toHaveProperty('page');
    expect(res.body.meta).toHaveProperty('limit');
    expect(res.body.meta).toHaveProperty('total');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/jobs');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/jobs/:id ──────────────────────────────────────

describe('GET /api/v1/jobs/:id', () => {
  let token: string;
  beforeEach(async () => { token = await createUserAndToken('getjob@example.com'); });

  it('returns the job by jobId', async () => {
    const createRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    const jobId = createRes.body.data.jobId;

    const getRes = await request(app)
      .get(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.jobId).toBe(jobId);
    expect(getRes.body.data.type).toBe(JobType.SEND_EMAIL);
  });

  it('returns 404 for a non-existent jobId', async () => {
    const res = await request(app)
      .get('/api/v1/jobs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ── POST /api/v1/jobs/:id/cancel ─────────────────────────────

describe('POST /api/v1/jobs/:id/cancel', () => {
  let token: string;
  beforeEach(async () => { token = await createUserAndToken('cancel@example.com'); });

  it('cancels a PENDING job', async () => {
    const createRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    const jobId = createRes.body.data.jobId;

    const cancelRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe(JobStatus.CANCELLED);
  });

  it('returns 404 for a non-existent job', async () => {
    const res = await request(app)
      .post('/api/v1/jobs/00000000-0000-0000-0000-000000000000/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/v1/jobs/:id/priority ──────────────────────────

describe('PATCH /api/v1/jobs/:id/priority', () => {
  let token: string;
  beforeEach(async () => { token = await createUserAndToken('priority@example.com'); });

  it('updates priority from MEDIUM to HIGH', async () => {
    const createRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    const jobId = createRes.body.data.jobId;

    const patchRes = await request(app)
      .patch(`/api/v1/jobs/${jobId}/priority`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: JobPriority.HIGH });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.priority).toBe(JobPriority.HIGH);
  });

  it('returns 422 for an invalid priority', async () => {
    const createRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    const jobId = createRes.body.data.jobId;

    const res = await request(app)
      .patch(`/api/v1/jobs/${jobId}/priority`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 99 });

    expect(res.status).toBe(422);
  });
});

// ── Health Check ──────────────────────────────────────────────

describe('GET /health', () => {
  it('returns a health report with component statuses', async () => {
    const res = await request(app).get('/health');

    // Redis is mocked to return PONG, MongoDB is connected — should be healthy or degraded
    expect([200, 503]).toContain(res.status);
    expect(res.body.data).toHaveProperty('status');
    expect(res.body.data).toHaveProperty('components');
    expect(res.body.data.components).toHaveProperty('mongodb');
    expect(res.body.data.components).toHaveProperty('redis');
    expect(res.body.data.components).toHaveProperty('queue');
  });

  it('always returns uptimeSeconds as a number', async () => {
    const res = await request(app).get('/health');
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
    expect(res.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
