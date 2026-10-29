import IORedis from 'ioredis';
import logger from '../utils/logger';
import env from './env';

// ── Redis Client Factory ──────────────────────────────────────

function createRedisClient(label: string): IORedis {
  const client = new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    ...(env.REDIS_TLS && { tls: {} }),

    // Retry strategy: exponential backoff up to 30s
    retryStrategy(times: number) {
      if (times > 10) {
        logger.error({ label }, '❌  Redis gave up reconnecting after 10 attempts');
        return null; // stop retrying
      }
      const delay = Math.min(times * 500, 30_000);
      logger.warn({ label, attempt: times, delayMs: delay }, '🔄  Redis reconnecting...');
      return delay;
    },

    // Prevent crashing if Redis is temporarily unavailable at startup
    lazyConnect: false,

    // Connection name visible in Redis CLIENT LIST
    connectionName: `jobforge-${label}`,

    // BullMQ requires this to be true for blocking commands
    enableReadyCheck: false,

    // BullMQ requires maxRetriesPerRequest to be null
    maxRetriesPerRequest: null,
  });

  client.on('connect', () => logger.info({ label }, '✅  Redis connected'));
  client.on('ready', () => logger.debug({ label }, '🟢  Redis ready'));
  client.on('close', () => logger.warn({ label }, '🔴  Redis connection closed'));
  client.on('reconnecting', () => logger.warn({ label }, '🔄  Redis reconnecting'));
  client.on('error', (err: Error) => logger.error({ label, err }, '❌  Redis error'));

  return client;
}

// ── Shared Clients ────────────────────────────────────────────

/**
 * Primary Redis client for general use (rate limiting, caching, etc.)
 */
export const redisClient = createRedisClient('primary');

/**
 * Dedicated Redis connection for BullMQ.
 * BullMQ requires its own connection and maxRetriesPerRequest: null.
 */
export const bullRedisConnection = createRedisClient('bullmq');

/**
 * Creates an isolated Redis subscriber connection for Pub/Sub events.
 */
export function createRedisSubscriber(label = 'subscriber'): IORedis {
  return createRedisClient(label);
}

// ── Graceful Shutdown ─────────────────────────────────────────

export async function disconnectRedis(): Promise<void> {
  await Promise.all([
    redisClient.quit(),
    bullRedisConnection.quit(),
  ]);
  logger.info('🔌  Redis connections closed');
}
