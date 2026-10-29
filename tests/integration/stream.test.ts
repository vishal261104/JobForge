import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import User from '../../src/models/User';
import Job from '../../src/models/Job';
import { UserRole, UserTier, JobType, JobPriority, JobStatus } from '../../src/types';
import { signToken } from '../../src/utils/jwt';
import { v4 as uuidv4 } from 'uuid';

const app = createApp();

describe('Real-Time Job Event Streaming (SSE)', () => {
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;
  let sampleJobId: string;

  beforeEach(async () => {
    // Seed User 1
    const user1 = await User.create({
      email: `stream_user1_${Date.now()}@example.com`,
      password: 'Password123!',
      role: UserRole.USER,
      tier: UserTier.FREE,
    });
    user1Id = user1._id.toString();
    user1Token = signToken({
      id: user1Id,
      email: user1.email,
      role: user1.role,
      tier: user1.tier,
    });

    // Seed User 2
    const user2 = await User.create({
      email: `stream_user2_${Date.now()}@example.com`,
      password: 'Password123!',
      role: UserRole.USER,
      tier: UserTier.FREE,
    });
    user2Id = user2._id.toString();
    user2Token = signToken({
      id: user2Id,
      email: user2.email,
      role: user2.role,
      tier: user2.tier,
    });

    // Seed a Job for User 1
    sampleJobId = uuidv4();
    await Job.create({
      jobId: sampleJobId,
      userId: user1._id,
      type: JobType.SEND_EMAIL,
      payload: { to: 'stream@test.com', subject: 'Stream Test' },
      priority: JobPriority.HIGH,
      status: JobStatus.COMPLETED,
      attempts: 1,
      maxAttempts: 3,
      result: { delivered: true },
      errorHistory: [],
    });
  });

  // ── Auth & Access Control ───────────────────────────────────

  describe('GET /api/v1/jobs/:id/events (Access Control)', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get(`/api/v1/jobs/${sampleJobId}/events`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for a non-existent jobId', async () => {
      const nonExistentId = uuidv4();
      const res = await request(app)
        .get(`/api/v1/jobs/${nonExistentId}/events`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when User 2 tries to stream User 1 job', async () => {
      const res = await request(app)
        .get(`/api/v1/jobs/${sampleJobId}/events`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── SSE Stream Output ───────────────────────────────────────

  describe('GET /api/v1/jobs/:id/events (Stream Output)', () => {
    it('returns 200 with text/event-stream content-type and initial event', async () => {
      const res = await request(app)
        .get(`/api/v1/jobs/${sampleJobId}/events`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: initial');
      expect(res.text).toContain(sampleJobId);
      expect(res.text).toContain('COMPLETED');
    });

    it('authenticates via ?token= query parameter (native EventSource support)', async () => {
      const res = await request(app).get(
        `/api/v1/jobs/${sampleJobId}/events?token=${user1Token}`
      );

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: initial');
    });
  });

  // ── Global User Stream ──────────────────────────────────────

  describe('GET /api/v1/jobs/events (User Stream)', () => {
    it('connects to user event stream with text/event-stream', async () => {
      const res = await request(app)
        .get('/api/v1/jobs/events?once=true')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: connected');
      expect(res.text).toContain(user1Id);
    });
  });

  // ── Live HTML Progress Viewer ───────────────────────────────

  describe('GET /api/v1/jobs/:id/live (HTML Live Demo)', () => {
    it('returns HTML page with 200 OK and job UUID embedded', async () => {
      const res = await request(app).get(`/api/v1/jobs/${sampleJobId}/live?token=${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('JobForge — Real-Time Job Progress');
      expect(res.text).toContain(sampleJobId);
      expect(res.text).toContain('EventSource');
    });
  });
});
