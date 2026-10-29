import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createCheckout,
  handleWebhook,
  getBillingConfig,
  billingSuccess,
  billingCancel,
  simulateCheckoutSuccess,
} from '../controllers/billing.controller';

const router = Router();

// GET   /api/v1/billing/config                    — public price and tier specs ($0.50 USD)
router.get('/config', asyncHandler(getBillingConfig));

// GET   /api/v1/billing/success                   — redirect page after successful Stripe checkout
router.get('/success', asyncHandler(billingSuccess));

// GET   /api/v1/billing/cancel                    — redirect page after cancelled checkout
router.get('/cancel', asyncHandler(billingCancel));

// POST  /api/v1/billing/webhook                   — incoming Stripe webhooks (raw signature verification)
router.post('/webhook', asyncHandler(handleWebhook));

// ── Authenticated Billing Endpoints ───────────────────────────

router.use(authenticate);

// POST  /api/v1/billing/checkout                  — initiates Stripe Checkout Session for $0.50
router.post('/checkout', asyncHandler(createCheckout));

// POST  /api/v1/billing/simulate-checkout-success — dev/test helper to simulate payment upgrade
router.post('/simulate-checkout-success', asyncHandler(simulateCheckoutSuccess));

export default router;
