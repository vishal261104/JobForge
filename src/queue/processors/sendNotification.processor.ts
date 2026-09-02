import { Job } from 'bullmq';
import { QueueJobData } from '../queue';
import { SendNotificationPayload } from '../../types';
import JobModel from '../../models/Job';
import logger from '../../utils/logger';

// Channel → simulated latency profile (ms)
const CHANNEL_LATENCY: Record<string, [number, number]> = {
  push: [100, 400],
  sms: [300, 900],
  'in-app': [50, 200],
};

/**
 * Simulates delivering a notification over a given channel
 * (push, sms, in-app).
 *
 * In production this would call FCM/APNs for push, Twilio for SMS,
 * or write to a database/WebSocket for in-app.
 */
export async function sendNotificationProcessor(
  job: Job<QueueJobData>
): Promise<Record<string, unknown>> {
  const { jobId } = job.data;

  // Load the full job document from MongoDB to get the payload
  const jobDoc = await JobModel.findOne({ jobId });
  if (!jobDoc) throw new Error(`Job document not found in MongoDB: ${jobId}`);
  const payload = jobDoc.payload as unknown as SendNotificationPayload;

  logger.info(
    { jobId, channel: payload.channel, userId: payload.userId },
    '🔔  Sending notification...'
  );

  // ── Step 1: Validate (10%)
  await job.updateProgress(10);
  if (!payload.userId || !payload.channel || !payload.title || !payload.message) {
    throw new Error(
      'Notification payload missing required fields: userId, channel, title, message'
    );
  }

  // ── Step 2: Resolve user device / contact (40%)
  await job.updateProgress(40);
  await simulateLatency(100, 300);

  // ── Step 3: Deliver via channel (90%)
  await job.updateProgress(90);
  const [min, max] = CHANNEL_LATENCY[payload.channel] ?? [200, 600];
  await simulateLatency(min, max);

  // ── Step 4: Record delivery receipt (100%)
  await job.updateProgress(100);

  const notificationId = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = {
    notificationId,
    channel: payload.channel,
    recipientUserId: payload.userId,
    title: payload.title,
    deliveryStatus: 'delivered',
    deliveredAt: new Date().toISOString(),
  };

  logger.info(
    { jobId, notificationId, channel: payload.channel },
    '✅  Notification delivered'
  );
  return result;
}

function simulateLatency(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
