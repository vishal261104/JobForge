import { Job } from 'bullmq';
import { QueueJobData } from '../queue';
import { GenerateReportPayload } from '../../types';
import JobModel from '../../models/Job';
import { NonRetryableError } from '../../utils/retry';
import logger from '../../utils/logger';

/**
 * Simulates generating a business report (PDF / CSV / XLSX).
 *
 * In production this would query a database, aggregate data,
 * and upload the output to object storage (S3, GCS, etc.).
 */
export async function generateReportProcessor(
  job: Job<QueueJobData>
): Promise<Record<string, unknown>> {
  const { jobId } = job.data;

  // Load the full job document from MongoDB to get the payload
  const jobDoc = await JobModel.findOne({ jobId });
  if (!jobDoc) throw new Error(`Job document not found in MongoDB: ${jobId}`);
  const payload = jobDoc.payload as unknown as GenerateReportPayload;

  logger.info(
    { jobId, reportType: payload.reportType, format: payload.format },
    '📊  Generating report...'
  );

  // ── Step 1: Validate parameters (10%)
  await job.updateProgress(10);
  if (!payload.reportType || !payload.format) {
    throw new NonRetryableError('Report payload missing required fields: reportType, format');
  }

  // ── Step 2: Query data sources (35%)
  await job.updateProgress(35);
  await simulateLatency(600, 1_500);

  // ── Step 3: Aggregate & transform data (65%)
  await job.updateProgress(65);
  await simulateLatency(800, 2_000);

  // ── Step 4: Render document (90%)
  await job.updateProgress(90);
  await simulateLatency(400, 1_000);

  // ── Step 5: Upload to storage (100%)
  await job.updateProgress(100);

  const fileKey = `reports/${payload.reportType}/${Date.now()}.${payload.format}`;
  const result = {
    fileKey,
    format: payload.format,
    reportType: payload.reportType,
    rowsProcessed: Math.floor(Math.random() * 10_000) + 100,
    fileSizeBytes: Math.floor(Math.random() * 5_000_000) + 50_000,
    downloadUrl: `https://storage.example.com/${fileKey}`,
    generatedAt: new Date().toISOString(),
  };

  logger.info({ jobId, fileKey, format: payload.format }, '✅  Report generated');
  return result;
}

function simulateLatency(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
