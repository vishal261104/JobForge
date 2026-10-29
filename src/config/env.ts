import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env file before validation
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ── Environment Schema ────────────────────────────────────────

const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.string().default('3000').transform(Number),

  // MongoDB
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .refine(
      (val) => val.startsWith('mongodb://') || val.startsWith('mongodb+srv://'),
      { message: 'MONGODB_URI must be a valid MongoDB connection string' }
    ),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Rate Limiting
  RATE_LIMIT_FREE: z.string().default('100').transform(Number),
  RATE_LIMIT_PREMIUM: z.string().default('10000').transform(Number),

  // Worker
  WORKER_CONCURRENCY: z.string().default('5').transform(Number),

  // Retry / Backoff (Stage 5)
  /** Base delay in ms for the first retry. Subsequent retries use exponential backoff: delay * 2^attempt */
  BACKOFF_BASE_DELAY: z.string().default('1000').transform(Number),
  BACKOFF_TYPE: z.enum(['exponential', 'fixed']).default('exponential'),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // Stripe & Billing
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_CENTS: z.string().default('50').transform(Number), // $0.50 USD minimum
  STRIPE_CURRENCY: z.string().default('usd'),
  APP_URL: z.string().default('http://localhost:3000'),
});

// ── Validate & Export ─────────────────────────────────────────

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('\n❌  Invalid environment variables:\n');
  parseResult.error.issues.forEach((issue) => {
    console.error(`  • ${issue.path.join('.')} — ${issue.message}`);
  });
  console.error('\nPlease check your .env file against .env.example\n');
  process.exit(1);
}

const env = parseResult.data;

export default env;
export type Env = typeof env;
