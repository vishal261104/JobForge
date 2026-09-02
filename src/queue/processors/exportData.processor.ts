import { Job } from 'bullmq';
import { QueueJobData } from '../queue';
import { ExportDataPayload } from '../../types';
import JobModel from '../../models/Job';
import { NonRetryableError } from '../../utils/retry';
import logger from '../../utils/logger';

/**
 * Simulates exporting entity data to a downloadable file.
 *
 * In production this would stream rows from a database, serialize to
 * the requested format, and upload the result to object storage.
 */
export async function exportDataProcessor(
  job: Job<QueueJobData>
): Promise<Record<string, unknown>> {
  const { jobId } = job.data;

  // Load the full job document from MongoDB to get the payload
  const jobDoc = await JobModel.findOne({ jobId });
  if (!jobDoc) throw new Error(`Job document not found in MongoDB: ${jobId}`);
  const payload = jobDoc.payload as unknown as ExportDataPayload;

  logger.info(
    { jobId, entity: payload.entity, format: payload.format },
    '📦  Exporting data...'
  );

  // ── Step 1: Validate (10%)
  await job.updateProgress(10);
  if (!payload.entity || !payload.format) {
    throw new NonRetryableError('Export payload missing required fields: entity, format');
  }

  // ── Step 2: Build query & stream rows (40%)
  await job.updateProgress(40);
  await simulateLatency(500, 1_200);

  // ── Step 3: Serialize to target format (75%)
  await job.updateProgress(75);
  await simulateLatency(600, 1_500);

  // ── Step 4: Upload to storage (100%)
  await job.updateProgress(100);

  const fileKey = `exports/${payload.entity}/${Date.now()}.${payload.format}`;
  const rowCount = Math.floor(Math.random() * 50_000) + 500;
  const result = {
    fileKey,
    entity: payload.entity,
    format: payload.format,
    rowsExported: rowCount,
    fileSizeBytes: rowCount * Math.floor(Math.random() * 200 + 50),
    downloadUrl: `https://storage.example.com/${fileKey}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(), // 7 days
    exportedAt: new Date().toISOString(),
  };

  logger.info({ jobId, fileKey, rowCount }, '✅  Data exported');
  return result;
}

function simulateLatency(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
