import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { disconnectRedis } from './config/redis';
import logger from './utils/logger';
import env from './config/env';

// ── Bootstrap ─────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info('🚀  Starting QueueForge API server...');

  // 1. Connect to MongoDB
  await connectDB();

  // 2. Create Express application
  const app = createApp();

  // 3. Start HTTP server
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `✅  QueueForge API listening on http://localhost:${env.PORT}`
    );
  });

  // ── Graceful Shutdown ─────────────────────────────────────────

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, '⏳  Received shutdown signal — shutting down gracefully...');

    // Stop accepting new connections
    server.close(async () => {
      logger.info('🔌  HTTP server closed');

      try {
        await disconnectDB();
        await disconnectRedis();
        logger.info('👋  QueueForge shutdown complete. Goodbye!');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, '💥  Error during shutdown');
        process.exit(1);
      }
    });

    // Force shutdown after 15s if graceful close hangs
    setTimeout(() => {
      logger.error('⏰  Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 15_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, '💥  Unhandled promise rejection');
    shutdown('unhandledRejection');
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err: Error) => {
    logger.fatal({ err }, '💥  Uncaught exception');
    shutdown('uncaughtException');
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, '💥  Failed to start server');
  process.exit(1);
});
