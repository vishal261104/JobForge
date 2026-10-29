import { Request, Response } from 'express';
import {
  createPremiumCheckoutSession,
  constructWebhookEvent,
  handleCheckoutCompleted,
  isStripeConfigured,
} from '../../services/stripe.service';
import User from '../../models/User';
import env from '../../config/env';
import { sendSuccess, sendError } from '../../utils/apiResponse';
import logger from '../../utils/logger';

// ── Create Checkout Session ───────────────────────────────────

export async function createCheckout(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const userEmail = req.user!.email;

  const { successUrl, cancelUrl } = req.body as {
    successUrl?: string;
    cancelUrl?: string;
  };

  try {
    const session = await createPremiumCheckoutSession(
      userId,
      userEmail,
      successUrl,
      cancelUrl
    );

    sendSuccess(
      res,
      {
        checkoutUrl: session.checkoutUrl,
        sessionId: session.sessionId,
        amount: (session.amountCents / 100).toFixed(2),
        currency: session.currency.toUpperCase(),
        isLiveStripe: session.isLive,
      },
      session.isLive
        ? 'Stripe Checkout Session created successfully'
        : 'Stripe simulated session created (add STRIPE_SECRET_KEY to .env for live mode)',
      200
    );
  } catch (err: any) {
    logger.error({ err, userId }, '❌  Failed to create Stripe Checkout Session');
    sendError(res, err.message || 'Failed to create checkout session', 500);
  }
}

// ── Stripe Webhook Handler ────────────────────────────────────

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['stripe-signature'] as string | undefined;

  let event: any;

  // Verify signature if secret is configured
  if (isStripeConfigured() && env.STRIPE_WEBHOOK_SECRET) {
    if (!signature) {
      logger.warn('⚠️  Stripe webhook received without stripe-signature header');
      res.status(400).send('Missing stripe-signature header');
      return;
    }

    try {
      const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
      event = constructWebhookEvent(rawBody, signature);
    } catch (err: any) {
      logger.error({ err: err.message }, '❌  Stripe webhook signature verification failed');
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }
  } else {
    // In dev or test mock mode without webhook secret
    event = req.body;
  }

  logger.info({ type: event.type }, '📩  Stripe webhook received');

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await handleCheckoutCompleted(session);
      break;
    }

    default:
      logger.debug({ type: event.type }, 'ℹ️  Unhandled Stripe event type');
  }

  res.status(200).json({ received: true });
}

// ── Public Billing Config ─────────────────────────────────────

export async function getBillingConfig(req: Request, res: Response): Promise<void> {
  const priceCents = env.STRIPE_PRICE_CENTS || 50;

  sendSuccess(res, {
    tier: 'PREMIUM',
    price: (priceCents / 100).toFixed(2),
    currency: (env.STRIPE_CURRENCY || 'usd').toUpperCase(),
    features: [
      '10,000 jobs per hour quota (~167 jobs/minute ceiling)',
      'High-priority queue access',
      'Real-time Server-Sent Events (SSE) streaming',
      'Full Dead-Letter Queue (DLQ) audit access',
    ],
    isLiveStripeConfigured: isStripeConfigured(),
  });
}

// ── Payment Success Redirect ──────────────────────────────────

export async function billingSuccess(req: Request, res: Response): Promise<void> {
  const sessionId = req.query.session_id as string | undefined;
  const isSimulated = req.query.simulated === 'true';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payment Successful — JobForge</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border-radius: 12px; padding: 40px; text-align: center; max-width: 480px; border: 1px solid #334155; }
    .check { font-size: 48px; margin-bottom: 16px; }
    h1 { color: #4ade80; margin: 0 0 12px; font-size: 24px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    .badge { background: #22c55e20; color: #4ade80; border: 1px solid #22c55e; padding: 4px 12px; border-radius: 9999px; font-weight: 600; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">🎉</div>
    <h1>Payment Successful!</h1>
    <span class="badge">PREMIUM TIER ACTIVATED</span>
    <p>Thank you for upgrading! Your account now has access to 10,000 jobs/hour throughput ceiling and real-time streaming updates.</p>
    <div style="font-size: 12px; color: #64748b;">Session ID: ${sessionId || 'N/A'}</div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

// ── Payment Cancel Redirect ───────────────────────────────────

export async function billingCancel(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, { status: 'cancelled' }, 'Checkout was cancelled. No charges were made.');
}

// ── Dev / Test Simulation Helper ──────────────────────────────

export async function simulateCheckoutSuccess(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;

  const mockSession = {
    id: `sim_session_${Date.now()}`,
    client_reference_id: userId,
    customer: `cus_sim_${Date.now()}`,
    metadata: { userId },
    amount_total: env.STRIPE_PRICE_CENTS || 50,
  };

  const upgraded = await handleCheckoutCompleted(mockSession);

  if (upgraded) {
    sendSuccess(
      res,
      { tier: 'premium', upgraded: true },
      'Account successfully upgraded to PREMIUM tier via simulation mode'
    );
  } else {
    sendError(res, 'Failed to upgrade user in simulation mode', 500);
  }
}
