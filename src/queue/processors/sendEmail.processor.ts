import { Job } from 'bullmq';
import { QueueJobData } from '../queue';
import { SendEmailPayload } from '../../types';
import JobModel from '../../models/Job';
import { NonRetryableError } from '../../utils/retry';
import logger from '../../utils/logger';

/**
 * Simulates sending a transactional email.
 *
 * In production this would integrate with a provider such as
 * SendGrid, AWS SES, Resend, or Postmark.
 */
export async function sendEmailProcessor(
  job: Job<QueueJobData>
): Promise<Record<string, unknown>> {
  const { jobId } = job.data;

  // Load the full job document from MongoDB to get the payload
  const jobDoc = await JobModel.findOne({ jobId });
  if (!jobDoc) throw new Error(`Job document not found in MongoDB: ${jobId}`);
  const payload = jobDoc.payload as unknown as SendEmailPayload;

  logger.info({ jobId, to: payload.to }, '📧  Sending email...');

  // ── Step 1: Validate required fields (10%)
  await job.updateProgress({ percent: 10, step: 'Validating email recipient and content' });
  await job.log('Step 1/4: Validating email payload (10%)');
  if (!payload.to || !payload.subject) {
    throw new NonRetryableError('Email payload missing required fields: to, subject');
  }

  // ── Step 2: Build the message (30%)
  await job.updateProgress({ percent: 30, step: 'Building MIME message and headers' });
  await job.log('Step 2/4: Assembling email message (30%)');
  await simulateLatency(300, 800);

  // ── Step 3: Connect to mail provider (60%)
  await job.updateProgress({ percent: 60, step: 'Connecting to SMTP relay provider' });
  await job.log('Step 3/4: Transmitting via SMTP relay (60%)');
  await simulateLatency(500, 1_200);

  // ── Step 4: Deliver & get delivery receipt (100%)
  await job.updateProgress({ percent: 100, step: 'Delivered successfully' });
  await job.log('Step 4/4: Delivery acknowledged (100%)');

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = {
    messageId,
    to: payload.to,
    subject: payload.subject,
    deliveredAt: new Date().toISOString(),
    provider: 'simulated-smtp',
  };

  logger.info({ jobId, messageId, to: payload.to }, '✅  Email delivered');
  return result;
}

// ── Helpers ───────────────────────────────────────────────────

function simulateLatency(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
