/**
 * Unit Tests — Retry Utilities  (Stage 10)
 */

import { describe, it, expect } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { NonRetryableError, computeNextRetryAt } from '../../src/utils/retry';

// ── NonRetryableError ─────────────────────────────────────────

describe('NonRetryableError', () => {
  it('is an instance of Error', () => {
    const err = new NonRetryableError('bad payload');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of UnrecoverableError (BullMQ will skip retries)', () => {
    const err = new NonRetryableError('bad payload');
    expect(err).toBeInstanceOf(UnrecoverableError);
  });

  it('preserves the message', () => {
    const msg = 'Email payload missing required fields: to, subject';
    expect(new NonRetryableError(msg).message).toBe(msg);
  });

  it('has the correct name', () => {
    expect(new NonRetryableError('x').name).toBe('NonRetryableError');
  });
});

// ── computeNextRetryAt ────────────────────────────────────────

describe('computeNextRetryAt — exponential backoff', () => {
  const BASE = 1_000; // 1 second

  it('attempt 1 → delay = 1 000 ms', () => {
    const before = Date.now();
    const result = computeNextRetryAt(1, BASE, 'exponential');
    const after  = Date.now();
    // Should be approximately BASE ms from now
    expect(result.getTime()).toBeGreaterThanOrEqual(before + BASE);
    expect(result.getTime()).toBeLessThanOrEqual(after + BASE + 50); // 50ms grace
  });

  it('attempt 2 → delay = 2 000 ms', () => {
    const before = Date.now();
    const result = computeNextRetryAt(2, BASE, 'exponential');
    const delay  = result.getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(2_000);
    expect(delay).toBeLessThanOrEqual(2_100);
  });

  it('attempt 3 → delay = 4 000 ms', () => {
    const before = Date.now();
    const result = computeNextRetryAt(3, BASE, 'exponential');
    const delay  = result.getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(4_000);
    expect(delay).toBeLessThanOrEqual(4_100);
  });

  it('attempt 4 → delay = 8 000 ms', () => {
    const before = Date.now();
    const result = computeNextRetryAt(4, BASE, 'exponential');
    const delay  = result.getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(8_000);
    expect(delay).toBeLessThanOrEqual(8_100);
  });

  it('returns a Date object', () => {
    expect(computeNextRetryAt(1, BASE)).toBeInstanceOf(Date);
  });

  it('date is always in the future', () => {
    const result = computeNextRetryAt(1, BASE);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('computeNextRetryAt — fixed backoff', () => {
  const BASE = 5_000;

  it('always applies the same delay regardless of attempt', () => {
    const before = Date.now();
    const r1 = computeNextRetryAt(1, BASE, 'fixed');
    const r2 = computeNextRetryAt(3, BASE, 'fixed');
    const r5 = computeNextRetryAt(5, BASE, 'fixed');

    // All should be approximately BASE ms from now
    for (const r of [r1, r2, r5]) {
      const delay = r.getTime() - before;
      expect(delay).toBeGreaterThanOrEqual(5_000);
      expect(delay).toBeLessThanOrEqual(5_200);
    }
  });
});
