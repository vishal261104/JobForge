/**
 * ─────────────────────────────────────────────────────────────
 *  Vitest Global Test Setup  (Stage 10)
 *
 *  Loaded via vitest.config.ts → setupFiles: ['./tests/setup.ts']
 *
 *  Responsibilities:
 *   1. Load environment variables from .env
 *   2. Mock infrastructure (Redis, BullMQ) so unit & integration
 *      tests can run without running containers
 *   3. Connect / disconnect real MongoDB for integration tests
 * ─────────────────────────────────────────────────────────────
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';

// Load .env before anything else
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Ensure test mode
process.env.NODE_ENV = 'test';

// Override DB to use isolated test database (safe with Atlas ?appName= params)
if (process.env.MONGODB_URI) {
  // Handles both:
  //   mongodb+srv://user:pass@host/dbname
  //   mongodb+srv://user:pass@host/dbname?appName=Cluster0
  process.env.MONGODB_URI = process.env.MONGODB_URI.replace(
    /\/([^/?]+)(?=\?|$)/,
    '/jobforge-test'
  );
}

// ── Mock Redis ─────────────────────────────────────────────────
// Prevents tests from needing a live Redis server

vi.mock('../src/config/redis', () => {
  const redisMock = {
    incr:        vi.fn().mockResolvedValue(1),
    expire:      vi.fn().mockResolvedValue(1),
    ping:        vi.fn().mockResolvedValue('PONG'),
    quit:        vi.fn().mockResolvedValue('OK'),
    publish:     vi.fn().mockResolvedValue(1),
    subscribe:   vi.fn().mockResolvedValue(1),
    unsubscribe: vi.fn().mockResolvedValue(1),
    duplicate:   vi.fn(),
    on:          vi.fn(),
    status:      'ready',
  };
  redisMock.duplicate.mockReturnValue(redisMock);

  return {
    redisClient:            redisMock,
    bullRedisConnection:    { ...redisMock, maxRetriesPerRequest: null },
    createRedisSubscriber:  vi.fn(() => redisMock),
    disconnectRedis:        vi.fn().mockResolvedValue(undefined),
  };
});

// ── Mock BullMQ Queue ──────────────────────────────────────────
// Prevents tests from needing Redis; enqueueJob returns a fake ID

vi.mock('../src/queue/queue', () => ({
  QUEUE_NAME: 'jobforge-test',
  jobQueue: {
    add:          vi.fn().mockResolvedValue({ id: 'bull-mock-id' }),
    getJob:       vi.fn().mockResolvedValue(null),
    getJobCounts: vi.fn().mockResolvedValue({
      waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1, paused: 0,
    }),
    isPaused: vi.fn().mockResolvedValue(false),
    name: 'jobforge-test',
    metaValues: { version: 'bullmq-5.4.2' },
    on:   vi.fn(),
  },
  enqueueJob: vi.fn().mockResolvedValue('bull-mock-id'),
}));

// ── MongoDB lifecycle ──────────────────────────────────────────

import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db';

beforeAll(async () => {
  await connectDB();
}, 30_000);

afterEach(async () => {
  // Wipe all collections between tests for full isolation
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await disconnectDB();
});
