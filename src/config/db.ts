import mongoose from 'mongoose';
import logger from '../utils/logger';
import env from './env';

// ── Connection State ──────────────────────────────────────────

let isConnected = false;

// ── Connection Options ────────────────────────────────────────

const connectionOptions: mongoose.ConnectOptions = {
  // Keep the connection alive
  serverSelectionTimeoutMS: 10_000, // Fail after 10s if no server found
  socketTimeoutMS: 45_000,          // Close sockets after 45s inactivity
  maxPoolSize: 10,                   // Max 10 concurrent connections
  minPoolSize: 2,                    // Keep at least 2 connections alive
};

// ── Event Listeners ───────────────────────────────────────────

mongoose.connection.on('connected', () => {
  isConnected = true;
  logger.info({ db: mongoose.connection.name }, '✅  MongoDB connected');
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('⚠️   MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  logger.info('🔄  MongoDB reconnected');
});

mongoose.connection.on('error', (err: Error) => {
  logger.error({ err }, '❌  MongoDB connection error');
});

// ── Connect ───────────────────────────────────────────────────

/**
 * Connects to MongoDB. Safe to call multiple times — subsequent calls
 * are no-ops when already connected.
 */
export async function connectDB(): Promise<void> {
  if (isConnected) {
    logger.debug('MongoDB already connected — skipping');
    return;
  }

  const maskedUri = env.MONGODB_URI.replace(
    /mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/,
    'mongodb$1://$2:***@'
  );

  logger.info({ uri: maskedUri }, '🔌  Connecting to MongoDB...');

  try {
    await mongoose.connect(env.MONGODB_URI, connectionOptions);
  } catch (err) {
    logger.fatal({ err }, '💥  Failed to connect to MongoDB');
    process.exit(1);
  }
}

// ── Disconnect ────────────────────────────────────────────────

/**
 * Gracefully closes the MongoDB connection. Called during shutdown.
 */
export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;
  await mongoose.connection.close();
  logger.info('🔌  MongoDB connection closed');
}

export { isConnected };
