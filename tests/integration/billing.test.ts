import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import User from '../../src/models/User';
import { UserRole, UserTier } from '../../src/types';
import { signToken } from '../../src/utils/jwt';

const app = createApp();

describe('Billing & Stripe Payment Gateway', () => {
  let regularToken: string;
  let testUserId: string;

  beforeEach(async () => {
    const user = await User.create({
      email: `billing_test_${Date.now()}@example.com`,
      password: 'Password123!',
      role: UserRole.USER,
      tier: UserTier.FREE,
    });

    testUserId = user._id.toString();

    regularToken = signToken({
      id: testUserId,
      email: user.email,
      role: user.role,
      tier: user.tier,
    });
  });

  // ── GET /api/v1/billing/config ──────────────────────────────

  describe('GET /api/v1/billing/config', () => {
    it('returns 200 with public billing price and tier details ($0.50 USD)', async () => {
      const res = await request(app).get('/api/v1/billing/config');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.price).toBe('0.50');
      expect(res.body.data.currency).toBe('USD');
      expect(res.body.data.tier).toBe('PREMIUM');
      expect(Array.isArray(res.body.data.features)).toBe(true);
    });
  });

  // ── POST /api/v1/billing/checkout ───────────────────────────

  describe('POST /api/v1/billing/checkout', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).post('/api/v1/billing/checkout');
      expect(res.status).toBe(401);
    });

    it('creates a checkout session with $0.50 USD amount for authenticated user', async () => {
      const res = await request(app)
        .post('/api/v1/billing/checkout')
        .set('Authorization', `Bearer ${regularToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('sessionId');
      expect(res.body.data).toHaveProperty('checkoutUrl');
      expect(res.body.data.amount).toBe('0.50');
      expect(res.body.data.currency).toBe('USD');
    });
  });

  // ── POST /api/v1/billing/simulate-checkout-success ──────────

  describe('POST /api/v1/billing/simulate-checkout-success', () => {
    it('upgrades user tier to PREMIUM and sets stripeSessionId in DB', async () => {
      // 1. Verify user starts as FREE
      const beforeUser = await User.findById(testUserId);
      expect(beforeUser?.tier).toBe(UserTier.FREE);

      // 2. Trigger checkout simulation
      const res = await request(app)
        .post('/api/v1/billing/simulate-checkout-success')
        .set('Authorization', `Bearer ${regularToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tier).toBe('premium');
      expect(res.body.data.upgraded).toBe(true);

      // 3. Verify user in database is now PREMIUM
      const afterUser = await User.findById(testUserId);
      expect(afterUser?.tier).toBe(UserTier.PREMIUM);
      expect(afterUser?.stripeSessionId).toBeDefined();
    });
  });

  // ── POST /api/v1/billing/webhook ────────────────────────────

  describe('POST /api/v1/billing/webhook', () => {
    it('processes checkout.session.completed webhook and promotes user to PREMIUM', async () => {
      const webhookPayload = {
        id: `evt_test_${Date.now()}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: `cs_test_${Date.now()}`,
            client_reference_id: testUserId,
            customer: 'cus_test_12345',
            amount_total: 50,
            metadata: {
              userId: testUserId,
              targetTier: 'premium',
            },
          },
        },
      };

      const res = await request(app)
        .post('/api/v1/billing/webhook')
        .send(webhookPayload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);

      // Verify user was upgraded in DB
      const user = await User.findById(testUserId);
      expect(user?.tier).toBe(UserTier.PREMIUM);
      expect(user?.stripeCustomerId).toBe('cus_test_12345');
    });
  });

  // ── GET /api/v1/billing/success and cancel ───────────────────

  describe('GET /api/v1/billing/success and /cancel', () => {
    it('returns HTML success page with 200 OK', async () => {
      const res = await request(app).get('/api/v1/billing/success?session_id=cs_test_abc');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Payment Successful');
      expect(res.text).toContain('PREMIUM TIER ACTIVATED');
    });

    it('returns cancellation status message with 200 OK', async () => {
      const res = await request(app).get('/api/v1/billing/cancel');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('cancelled');
    });
  });
});
