import { UnrecoverableError } from 'bullmq';

// Re-export so processors import from one place
export { UnrecoverableError };

/**
 * Throw this inside any processor for errors that should NOT be retried.
 *
 * Examples:
 *  - Missing required payload fields (validation — fixing them requires a new job)
 *  - Permanent upstream API rejections (e.g. invalid email address format)
 *  - Schema mismatches
 *
 * BullMQ will catch this, skip all remaining retry attempts, and immediately
 * move the job to the failed state with maxAttempts exhausted, which our
 * worker's 'failed' event will then mark as DEAD in MongoDB.
 *
 * @example
 *   if (!payload.to) throw new NonRetryableError('Email payload missing: to');
 */
export class NonRetryableError extends UnrecoverableError {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

/**
 * Computes the next retry timestamp based on exponential backoff.
 *
 * Formula: baseDelay * 2^(attemptsMade - 1)
 *   attempt 1 →  1 000 ms
 *   attempt 2 →  2 000 ms
 *   attempt 3 →  4 000 ms
 *   attempt 4 →  8 000 ms
 *   ...
 */
export function computeNextRetryAt(
  attemptsMade: number,
  baseDelay: number,
  type: 'exponential' | 'fixed' = 'exponential'
): Date {
  const delayMs =
    type === 'exponential'
      ? baseDelay * Math.pow(2, attemptsMade - 1)
      : baseDelay;

  return new Date(Date.now() + delayMs);
}
