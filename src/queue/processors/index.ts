import { Job } from 'bullmq';
import { QueueJobData } from '../queue';
import { sendEmailProcessor } from './sendEmail.processor';
import { generateReportProcessor } from './generateReport.processor';
import { processImageProcessor } from './processImage.processor';
import { exportDataProcessor } from './exportData.processor';
import { sendNotificationProcessor } from './sendNotification.processor';
import { JobType } from '../../types';
import logger from '../../utils/logger';

// ── Processor Registry ────────────────────────────────────────

type ProcessorFn = (job: Job<QueueJobData>) => Promise<Record<string, unknown>>;

const processorRegistry: Record<string, ProcessorFn> = {
  [JobType.SEND_EMAIL]: sendEmailProcessor,
  [JobType.GENERATE_REPORT]: generateReportProcessor,
  [JobType.PROCESS_IMAGE]: processImageProcessor,
  [JobType.EXPORT_DATA]: exportDataProcessor,
  [JobType.SEND_NOTIFICATION]: sendNotificationProcessor,
};

// ── Dispatcher ────────────────────────────────────────────────

/**
 * Routes a BullMQ job to the appropriate type-specific processor.
 * This is the single entry point used by the BullMQ Worker.
 */
export async function dispatch(job: Job<QueueJobData>): Promise<Record<string, unknown>> {
  const { jobId, type } = job.data;

  const processor = processorRegistry[type];

  if (!processor) {
    const msg = `Unknown job type: "${type}"`;
    logger.error({ jobId, type }, `❌  ${msg}`);
    throw new Error(msg);
  }

  logger.info({ jobId, type, attempt: job.attemptsMade + 1 }, `⚙️   Processing job`);

  return processor(job);
}
