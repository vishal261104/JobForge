import { Job } from 'bullmq';
import { QueueJobData } from '../queue';
import { ProcessImagePayload } from '../../types';
import JobModel from '../../models/Job';
import logger from '../../utils/logger';

/**
 * Simulates image processing (resize, compress, convert, watermark).
 *
 * In production this would use Sharp or an image-processing service
 * and upload the result to object storage.
 */
export async function processImageProcessor(
  job: Job<QueueJobData>
): Promise<Record<string, unknown>> {
  const { jobId } = job.data;

  // Load the full job document from MongoDB to get the payload
  const jobDoc = await JobModel.findOne({ jobId });
  if (!jobDoc) throw new Error(`Job document not found in MongoDB: ${jobId}`);
  const payload = jobDoc.payload as unknown as ProcessImagePayload;

  logger.info(
    { jobId, imageUrl: payload.imageUrl, operations: payload.operations },
    '🖼️   Processing image...'
  );

  // ── Step 1: Validate (10%)
  await job.updateProgress(10);
  if (!payload.imageUrl || !payload.operations?.length) {
    throw new Error('Image payload missing required fields: imageUrl, operations');
  }

  // ── Step 2: Download source image (30%)
  await job.updateProgress(30);
  await simulateLatency(400, 1_000);

  // ── Step 3: Apply operations sequentially (30% → 85%)
  const progressPerOp = Math.floor(55 / payload.operations.length);
  let progress = 30;
  for (const op of payload.operations) {
    progress += progressPerOp;
    await job.updateProgress(Math.min(progress, 85));
    logger.debug({ jobId, op }, `🔧  Applying operation: ${op}`);
    await simulateLatency(200, 600);
  }

  // ── Step 4: Upload output image (100%)
  await job.updateProgress(100);

  const ext = payload.outputFormat ?? 'jpeg';
  const outputKey = `images/processed/${Date.now()}.${ext}`;
  const result = {
    outputKey,
    outputFormat: ext,
    operations: payload.operations,
    originalUrl: payload.imageUrl,
    processedUrl: `https://cdn.example.com/${outputKey}`,
    dimensionsOutput: { width: 1920, height: 1080 },
    fileSizeBytes: Math.floor(Math.random() * 2_000_000) + 50_000,
    processedAt: new Date().toISOString(),
  };

  logger.info({ jobId, outputKey }, '✅  Image processed');
  return result;
}

function simulateLatency(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
