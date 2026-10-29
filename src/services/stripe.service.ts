/**
 * ─────────────────────────────────────────────────────────────
 *  JobForge — Stripe Payment Gateway Service
 *
 *  Handles Stripe Checkout Session generation and Webhook verification
 *  to securely upgrade users to the PREMIUM tier ($0.50 minimum charge).
 * ─────────────────────────────────────────────────────────────
 */

import Stripe from 'stripe';
import env from '../config/env';
import User from '../models/User';
import { UserTier } from '../types';
import { publishJobEvent } from '../utils/eventBus';
import logger from '../utils/logger';

// Initialize Stripe SDK if key is provided
export const stripeClient: Stripe | null = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY)
  : null;

/**
 * Checks if a live Stripe secret key is configured.
 */
export function isStripeConfigured(): boolean {
  return stripeClient !== null && !env.STRIPE_SECRET_KEY?.includes('your_stripe');
}

export interface CheckoutResult {
  sessionId: string;
  checkoutUrl: string | null;
  amountCents: number;
  currency: string;
  isLive: boolean;
}

/**
 * Creates a Stripe Checkout Session for $0.50 USD to upgrade user to PREMIUM.
 */
export async function createPremiumCheckoutSession(
  userId: string,
  userEmail: string,
  customSuccessUrl?: string,
  customCancelUrl?: string
): Promise<CheckoutResult> {
  const amountCents = env.STRIPE_PRICE_CENTS || 50; // $0.50 USD
  const currency = env.STRIPE_CURRENCY || 'usd';

  const defaultSuccessUrl = `${env.APP_URL}/api/v1/billing/success?session_id={CHECKOUT_SESSION_ID}`;
  const defaultCancelUrl = `${env.APP_URL}/api/v1/billing/cancel`;

  if (isStripeConfigured() && stripeClient) {
    // ── Live / Test Stripe Checkout Session ──────────────────
    const session = await stripeClient.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: 'JobForge Premium Tier Upgrade',
              description:
                'Upgrade your account rate limit to 10,000 jobs/hour (Sliding-window Redis bucket: ~167 jobs/minute).',
            },
            unit_amount: amountCents, // 50 cents = $0.50
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: customSuccessUrl || defaultSuccessUrl,
      cancel_url: customCancelUrl || defaultCancelUrl,
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: {
        userId,
        targetTier: UserTier.PREMIUM,
      },
    });

    logger.info({ userId, sessionId: session.id }, '💳  Stripe Checkout Session created');

    return {
      sessionId: session.id,
      checkoutUrl: session.url,
      amountCents,
      currency,
      isLive: true,
    };
  }

  // ── Development / Simulation Mode ──────────────────────────
  // Returned when STRIPE_SECRET_KEY is not yet set in .env
  const mockSessionId = `sim_session_${Date.now()}_${userId.slice(-6)}`;
  logger.info({ userId, mockSessionId }, '💳  Simulated Stripe Checkout Session created (no live key)');

  return {
    sessionId: mockSessionId,
    checkoutUrl: `${env.APP_URL}/api/v1/billing/success?session_id=${mockSessionId}&simulated=true`,
    amountCents,
    currency,
    isLive: false,
  };
}

/**
 * Validates Stripe webhook signature against raw request body buffer.
 */
export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  if (!stripeClient || !env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe client or STRIPE_WEBHOOK_SECRET is not configured');
  }

  return stripeClient.webhooks.constructEvent(
    rawBody,
    signature,
    env.STRIPE_WEBHOOK_SECRET
  );
}

/**
 * Processes completed Stripe payment and promotes user to UserTier.PREMIUM.
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session | { id: string; client_reference_id?: string; customer?: string; metadata?: Record<string, string>; amount_total?: number }
): Promise<boolean> {
  const userId = session.metadata?.userId || session.client_reference_id;

  if (!userId) {
    logger.error({ session }, '❌  Checkout completed but no userId found in metadata');
    return false;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        tier: UserTier.PREMIUM,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : undefined,
        stripeSessionId: session.id,
      },
    },
    { new: true }
  );

  if (!user) {
    logger.error({ userId }, '❌  User not found during checkout tier upgrade');
    return false;
  }

  logger.info({ userId: user._id, email: user.email, tier: user.tier }, '🌟  User upgraded to PREMIUM tier via Stripe');

  // Broadcast real-time tier upgrade event to user's SSE stream
  await publishJobEvent({
    jobId: `billing-${session.id}`,
    userId: user._id.toString(),
    type: 'TIER_UPGRADED',
    status: 'COMPLETED',
    result: {
      tier: UserTier.PREMIUM,
      amountPaidCents: session.amount_total ?? env.STRIPE_PRICE_CENTS,
      upgradedAt: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });

  return true;
}
