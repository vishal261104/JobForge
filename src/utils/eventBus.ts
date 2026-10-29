/**
 * ─────────────────────────────────────────────────────────────
 *  JobForge — Real-Time Pub/Sub Event Bus
 *
 *  Enables real-time streaming updates (SSE/WebSockets) between
 *  worker consumer processes and HTTP clients across distributed
 *  nodes using Redis Pub/Sub channels.
 * ─────────────────────────────────────────────────────────────
 */

import { redisClient, createRedisSubscriber } from '../config/redis';
import { JobStatus } from '../types';
import logger from './logger';

export interface JobEventPayload {
  jobId: string;
  userId?: string;
  type: string;
  status: JobStatus | string;
  progress?: number;
  result?: Record<string, unknown> | null;
  error?: string | null;
  attempts?: number;
  nextRetryAt?: Date | string | null;
  timestamp: string;
}

export const JOB_CHANNEL_PREFIX = 'job:events:';
export const USER_CHANNEL_PREFIX = 'user:events:';

/**
 * Publishes a job event to both the job-specific channel and
 * the submitting user's private channel.
 */
export async function publishJobEvent(event: JobEventPayload): Promise<void> {
  const payload = JSON.stringify({
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  });

  try {
    // 1. Broadcast on the single job channel
    await redisClient.publish(`${JOB_CHANNEL_PREFIX}${event.jobId}`, payload);

    // 2. Broadcast on the user's channel if userId is provided
    if (event.userId) {
      await redisClient.publish(`${USER_CHANNEL_PREFIX}${event.userId}`, payload);
    }
  } catch (err) {
    logger.warn({ err, jobId: event.jobId }, '⚠️  Failed to publish job event to Redis');
  }
}

/**
 * Subscribes to real-time events for a specific job.
 * Returns an unsubscribe cleanup function.
 */
export async function subscribeToJob(
  jobId: string,
  onEvent: (event: JobEventPayload) => void
): Promise<() => Promise<void>> {
  const subscriber = createRedisSubscriber(`sub-job-${jobId.slice(0, 8)}`);
  const channel = `${JOB_CHANNEL_PREFIX}${jobId}`;

  await subscriber.subscribe(channel);

  subscriber.on('message', (chan: string, message: string) => {
    if (chan === channel) {
      try {
        const parsed = JSON.parse(message) as JobEventPayload;
        onEvent(parsed);
      } catch (err) {
        logger.error({ err, message }, '❌  Failed to parse job event message');
      }
    }
  });

  return async () => {
    try {
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    } catch {
      // ignore cleanup errors on socket close
    }
  };
}

/**
 * Subscribes to real-time events for all jobs belonging to a user.
 * Returns an unsubscribe cleanup function.
 */
export async function subscribeToUser(
  userId: string,
  onEvent: (event: JobEventPayload) => void
): Promise<() => Promise<void>> {
  const subscriber = createRedisSubscriber(`sub-user-${userId.slice(0, 8)}`);
  const channel = `${USER_CHANNEL_PREFIX}${userId}`;

  await subscriber.subscribe(channel);

  subscriber.on('message', (chan: string, message: string) => {
    if (chan === channel) {
      try {
        const parsed = JSON.parse(message) as JobEventPayload;
        onEvent(parsed);
      } catch (err) {
        logger.error({ err, message }, '❌  Failed to parse user job event message');
      }
    }
  });

  return async () => {
    try {
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    } catch {
      // ignore cleanup errors on socket close
    }
  };
}
