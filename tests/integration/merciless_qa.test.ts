/**
 * ─────────────────────────────────────────────────────────────
 *  Merciless QA & Penetration Test Suite
 *
 *  Ruthlessly probes:
 *   - Stripe Payment Gateway & Webhook Tampering
 *   - Tier Promotion & Rate-Limit Escalation Verification
 *   - IDOR & Access Control Vulnerabilities
 *   - Client Polling & Real-Time SSE Streams
 *   - Malformed, Garbage & Adversarial Inputs
 * ─────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../../src/app';
import User from '../../src/models/User';
import Job from '../../src/models/Job';
import { UserRole, UserTier, JobType, JobPriority, JobStatus } from '../../src/types';
import { signToken } from '../../src/utils/jwt';
import { handleCheckoutCompleted } from '../../src/services/stripe.service';

const app = createApp();

describe('🔥 MERCILESS QA SUITE: Stripe Payment & Real-Time Polling/Streaming', () => {
  let victimUser: any;
  let victimToken: string;
  let attackerUser: any;
  let attackerToken: string;

  beforeEach(async () => {
    // 1. Victim User (FREE tier)
    victimUser = await User.create({
      email: `victim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
      password: 'Password123!',
      role: UserRole.USER,
      tier: UserTier.FREE,
    });
    victimToken = signToken({
      id: victimUser._id.toString(),
      email: victimUser.email,
      role: victimUser.role,
      tier: victimUser.tier,
    });

    // 2. Attacker User (FREE tier)
    attackerUser = await User.create({
      email: `attacker_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
      password: 'Password123!',
      role: UserRole.USER,
      tier: UserTier.FREE,
    });
    attackerToken = signToken({
      id: attackerUser._id.toString(),
      email: attackerUser.email,
      role: attackerUser.role,
      tier: attackerUser.tier,
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 1. PAYMENT GATEWAY: ADVERSARIAL & SECURITY TESTS
  // ═════════════════════════════════════════════════════════════

  describe('💳 [PAYMENT GATEWAY] Security & Edge Cases', () => {
    it('CRITICAL: Blocks unauthenticated checkout requests with 401', async () => {
      const res = await request(app).post('/api/v1/billing/checkout').send();
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('CRITICAL: Rejects forged / corrupted JWT tokens on checkout', async () => {
      const res = await request(app)
        .post('/api/v1/billing/checkout')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.corrupted.payload')
        .send();
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid|expired/i);
    });

    it('RUTHLESS: Public billing config must strictly guarantee $0.50 USD pricing', async () => {
      const res = await request(app).get('/api/v1/billing/config');
      expect(res.status).toBe(200);
      expect(res.body.data.price).toBe('0.50');
      expect(res.body.data.currency).toBe('USD');
      expect(res.body.data.tier).toBe('PREMIUM');
      expect(res.body.data.features.length).toBeGreaterThan(0);
    });

    it('RUTHLESS: Webhook gracefully rejects phantom users without crashing', async () => {
      const fakeObjectId = new mongoose.Types.ObjectId().toString();
      const upgraded = await handleCheckoutCompleted({
        id: 'cs_fake_session',
        client_reference_id: fakeObjectId,
        customer: 'cus_fake',
        metadata: { userId: fakeObjectId },
        amount_total: 50,
      });
      expect(upgraded).toBe(false);
    });

    it('RUTHLESS: Webhook handles missing userId metadata without throwing uncaught exceptions', async () => {
      const upgraded = await handleCheckoutCompleted({
        id: 'cs_empty_session',
        amount_total: 50,
      });
      expect(upgraded).toBe(false);
    });

    it('RUTHLESS: Idempotency check — Duplicate webhooks do not corrupt user tier or crash', async () => {
      const sessionPayload = {
        id: `cs_idem_${Date.now()}`,
        client_reference_id: victimUser._id.toString(),
        customer: 'cus_idem_123',
        metadata: { userId: victimUser._id.toString() },
        amount_total: 50,
      };

      // First webhook delivery
      const firstUpgrade = await handleCheckoutCompleted(sessionPayload);
      expect(firstUpgrade).toBe(true);

      const userAfterFirst = await User.findById(victimUser._id);
      expect(userAfterFirst?.tier).toBe(UserTier.PREMIUM);
      expect(userAfterFirst?.stripeSessionId).toBe(sessionPayload.id);

      // Second identical webhook delivery (replay attack / network retry)
      const secondUpgrade = await handleCheckoutCompleted(sessionPayload);
      expect(secondUpgrade).toBe(true);

      const userAfterSecond = await User.findById(victimUser._id);
      expect(userAfterSecond?.tier).toBe(UserTier.PREMIUM);
    });

    it('INTEGRATION: Complete Checkout Promotion increases job rate limit to 10,000/hr', async () => {
      // 1. Before upgrade: User is FREE tier (100 jobs/hr header)
      const preCheck = await request(app)
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${victimToken}`)
        .send({
          type: JobType.SEND_EMAIL,
          payload: { to: 'pre@test.com', subject: 'Pre upgrade' },
        });

      expect(preCheck.status).toBe(201);
      expect(preCheck.headers['x-ratelimit-limit']).toBe('100');

      // 2. User pays $0.50 and completes checkout simulation
      const checkoutRes = await request(app)
        .post('/api/v1/billing/simulate-checkout-success')
        .set('Authorization', `Bearer ${victimToken}`)
        .send();

      expect(checkoutRes.status).toBe(200);
      expect(checkoutRes.body.data.tier).toBe('premium');

      // 3. User logs in with fresh credentials to receive updated PREMIUM JWT
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: victimUser.email, password: 'Password123!' });

      expect(loginRes.status).toBe(200);
      const premiumToken = loginRes.body.data.token;
      expect(loginRes.body.data.user.tier).toBe(UserTier.PREMIUM);

      // 4. Submit job with new Premium token — verify rate-limit header is 10,000!
      const postCheck = await request(app)
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${premiumToken}`)
        .send({
          type: JobType.SEND_EMAIL,
          payload: { to: 'post@test.com', subject: 'Post upgrade' },
        });

      expect(postCheck.status).toBe(201);
      expect(postCheck.headers['x-ratelimit-limit']).toBe('10000');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 2. CLIENT POLLING: GET /api/v1/jobs/:id
  // ═════════════════════════════════════════════════════════════

  describe('🔍 [CLIENT POLLING] GET /api/v1/jobs/:id', () => {
    let victimJobId: string;

    beforeEach(async () => {
      victimJobId = uuidv4();
      await Job.create({
        jobId: victimJobId,
        userId: victimUser._id,
        type: JobType.GENERATE_REPORT,
        payload: { reportId: 'R-999' },
        priority: JobPriority.HIGH,
        status: JobStatus.PROCESSING,
        attempts: 1,
        maxAttempts: 3,
        errorHistory: [],
      });
    });

    it('POLICE: Returns 401 when polling without a token', async () => {
      const res = await request(app).get(`/api/v1/jobs/${victimJobId}`);
      expect(res.status).toBe(401);
    });

    it('POLICE: Returns 404 when polling non-existent UUID', async () => {
      const ghostId = uuidv4();
      const res = await request(app)
        .get(`/api/v1/jobs/${ghostId}`)
        .set('Authorization', `Bearer ${victimToken}`);
      expect(res.status).toBe(404);
    });

    it('SECURITY (IDOR): Attacker cannot poll victim job document (returns 404)', async () => {
      const res = await request(app)
        .get(`/api/v1/jobs/${victimJobId}`)
        .set('Authorization', `Bearer ${attackerToken}`);

      // Even though the job exists in the DB, it must return 404 to hide its existence from unauthorized users
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('CORRECTNESS: Legitimate owner polls and receives full job state and timestamps', async () => {
      const res = await request(app)
        .get(`/api/v1/jobs/${victimJobId}`)
        .set('Authorization', `Bearer ${victimToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBe(victimJobId);
      expect(res.body.data.status).toBe('PROCESSING');
      expect(res.body.data.type).toBe('GENERATE_REPORT');
      expect(res.body.data.priority).toBe(1);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 3. REAL-TIME EVENT STREAMING: SSE ENDPOINTS
  // ═════════════════════════════════════════════════════════════

  describe('⚡ [REAL-TIME STREAMING] Server-Sent Events', () => {
    let completedJobId: string;

    beforeEach(async () => {
      completedJobId = uuidv4();
      await Job.create({
        jobId: completedJobId,
        userId: victimUser._id,
        type: JobType.PROCESS_IMAGE,
        payload: { width: 800, height: 600 },
        priority: JobPriority.MEDIUM,
        status: JobStatus.COMPLETED,
        attempts: 1,
        maxAttempts: 3,
        result: { outputUrl: 'https://s3.amazonaws.com/test/img.png' },
        errorHistory: [],
      });
    });

    it('SECURITY: Blocks unauthenticated connection to SSE stream', async () => {
      const res = await request(app).get(`/api/v1/jobs/${completedJobId}/events`);
      expect(res.status).toBe(401);
    });

    it('SECURITY (IDOR): Forbids Attacker from tapping into Victim SSE stream (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/jobs/${completedJobId}/events`)
        .set('Authorization', `Bearer ${attackerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not your job/i);
    });

    it('SSE PROTOCOL: Streams initial snapshot and terminal event with text/event-stream headers', async () => {
      const res = await request(app)
        .get(`/api/v1/jobs/${completedJobId}/events`)
        .set('Authorization', `Bearer ${victimToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toContain('no-cache');
      expect(res.headers['connection']).toBe('keep-alive');

      // Verify event chunks
      expect(res.text).toContain('event: initial');
      expect(res.text).toContain('event: terminal');
      expect(res.text).toContain('COMPLETED');
      expect(res.text).toContain('https://s3.amazonaws.com/test/img.png');
    });

    it('BROWSER COMPATIBILITY: Authenticates SSE via ?token= query parameter', async () => {
      const res = await request(app).get(
        `/api/v1/jobs/${completedJobId}/events?token=${victimToken}`
      );

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: initial');
      expect(res.text).toContain(completedJobId);
    });

    it('USER MULTIPLEXING: /api/v1/jobs/events connects to private user channel', async () => {
      const res = await request(app)
        .get('/api/v1/jobs/events?once=true')
        .set('Authorization', `Bearer ${victimToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: connected');
      expect(res.text).toContain(victimUser._id.toString());
    });

    it('HTML DEMO VIEWER: /api/v1/jobs/:id/live serves valid responsive HTML with SSE client', async () => {
      const res = await request(app).get(
        `/api/v1/jobs/${completedJobId}/live?token=${victimToken}`
      );

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('JobForge — Real-Time Job Progress');
      expect(res.text).toContain('progress-bar-fill');
      expect(res.text).toContain(completedJobId);
      expect(res.text).toContain('EventSource');
    });
  });
});
