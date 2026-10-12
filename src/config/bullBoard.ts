import { Application } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { jobQueue } from '../queue/queue';
import logger from '../utils/logger';

/**
 * Mounts the official Bull Board UI at /admin/queues.
 * Provides a web dashboard for inspecting BullMQ queues, active/failed/completed jobs,
 * retrying jobs, and monitoring worker progress directly from the browser.
 */
export function mountBullBoard(app: Application): void {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(jobQueue)],
    serverAdapter,
  });

  app.use('/admin/queues', serverAdapter.getRouter());
  logger.info('📊  Bull Board UI mounted at /admin/queues');
}
