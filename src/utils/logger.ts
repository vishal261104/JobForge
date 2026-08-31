import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Structured logger powered by Pino.
 * - Development: pretty-prints with colors and timestamps
 * - Production:  outputs newline-delimited JSON for log aggregators
 */
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
      },
    },
  }),
  ...(!isDev && {
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
});

export default logger;
