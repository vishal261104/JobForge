/**
 * Unit Tests — Zod Validation Schemas  (Stage 10)
 */

import { describe, it, expect } from 'vitest';
import { JobType, JobPriority, JobStatus } from '../../src/types';
import {
  createJobSchema,
  listJobsSchema,
  updatePrioritySchema,
  rescheduleJobSchema,
} from '../../src/api/validators/job.validator';

// ── createJobSchema ───────────────────────────────────────────

describe('createJobSchema', () => {
  const validBody = {
    type: JobType.SEND_EMAIL,
    payload: { to: 'alice@example.com', subject: 'Hi', body: 'Hello' },
  };

  it('passes with a valid email job payload', () => {
    const result = createJobSchema.safeParse({ body: validBody });
    expect(result.success).toBe(true);
  });

  it('applies default priority = MEDIUM (5)', () => {
    const result = createJobSchema.safeParse({ body: validBody });
    expect(result.success && result.data.body.priority).toBe(JobPriority.MEDIUM);
  });

  it('applies default maxAttempts = 3', () => {
    const result = createJobSchema.safeParse({ body: validBody });
    expect(result.success && result.data.body.maxAttempts).toBe(3);
  });

  it('rejects an invalid job type', () => {
    const result = createJobSchema.safeParse({ body: { ...validBody, type: 'INVALID_TYPE' } });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid priority (7 is not in enum)', () => {
    const result = createJobSchema.safeParse({ body: { ...validBody, priority: 7 } });
    expect(result.success).toBe(false);
  });

  it('rejects maxAttempts > 10', () => {
    const result = createJobSchema.safeParse({ body: { ...validBody, maxAttempts: 11 } });
    expect(result.success).toBe(false);
  });

  it('rejects maxAttempts < 1', () => {
    const result = createJobSchema.safeParse({ body: { ...validBody, maxAttempts: 0 } });
    expect(result.success).toBe(false);
  });

  it('accepts HIGH priority (1)', () => {
    const result = createJobSchema.safeParse({ body: { ...validBody, priority: JobPriority.HIGH } });
    expect(result.success).toBe(true);
  });

  it('transforms scheduledAt string to a Date object', () => {
    const futureTime = new Date(Date.now() + 60_000).toISOString();
    const result = createJobSchema.safeParse({ body: { ...validBody, scheduledAt: futureTime } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body.scheduledAt).toBeInstanceOf(Date);
    }
  });

  it('rejects a past scheduledAt', () => {
    const pastTime = new Date(Date.now() - 60_000).toISOString();
    const result = createJobSchema.safeParse({ body: { ...validBody, scheduledAt: pastTime } });
    expect(result.success).toBe(false);
  });

  it('rejects a non-ISO scheduledAt string', () => {
    const result = createJobSchema.safeParse({ body: { ...validBody, scheduledAt: 'tomorrow' } });
    expect(result.success).toBe(false);
  });

  it('accepts all valid JobType values', () => {
    for (const type of Object.values(JobType)) {
      const result = createJobSchema.safeParse({ body: { type, payload: {} } });
      expect(result.success, `Expected ${type} to be valid`).toBe(true);
    }
  });
});

// ── listJobsSchema ────────────────────────────────────────────

describe('listJobsSchema', () => {
  it('applies default pagination values', () => {
    const result = listJobsSchema.safeParse({ query: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.page).toBe(1);
      expect(result.data.query.limit).toBe(20);
      expect(result.data.query.sortBy).toBe('createdAt');
      expect(result.data.query.sortOrder).toBe('desc');
    }
  });

  it('clamps limit to 100 max', () => {
    const result = listJobsSchema.safeParse({ query: { limit: '9999' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.limit).toBe(100);
    }
  });

  it('clamps page to minimum 1', () => {
    const result = listJobsSchema.safeParse({ query: { page: '-5' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.page).toBe(1);
    }
  });

  it('accepts a valid status filter', () => {
    const result = listJobsSchema.safeParse({ query: { status: JobStatus.COMPLETED } });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status filter', () => {
    const result = listJobsSchema.safeParse({ query: { status: 'UNKNOWN' } });
    expect(result.success).toBe(false);
  });
});

// ── updatePrioritySchema ──────────────────────────────────────

describe('updatePrioritySchema', () => {
  const validUUID = 'b64c33a2-d70d-4f7e-8496-7ae3d7e0a571';

  it('passes with valid UUID and priority', () => {
    const result = updatePrioritySchema.safeParse({
      params: { id: validUUID },
      body:   { priority: JobPriority.HIGH },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID id', () => {
    const result = updatePrioritySchema.safeParse({
      params: { id: 'not-a-uuid' },
      body:   { priority: JobPriority.HIGH },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid priority (3)', () => {
    const result = updatePrioritySchema.safeParse({
      params: { id: validUUID },
      body:   { priority: 3 },
    });
    expect(result.success).toBe(false);
  });
});

// ── rescheduleJobSchema ───────────────────────────────────────

describe('rescheduleJobSchema', () => {
  const validUUID = 'b64c33a2-d70d-4f7e-8496-7ae3d7e0a571';

  it('passes with a future ISO datetime', () => {
    const futureTime = new Date(Date.now() + 60_000).toISOString();
    const result = rescheduleJobSchema.safeParse({
      params: { id: validUUID },
      body:   { scheduledAt: futureTime },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body.scheduledAt).toBeInstanceOf(Date);
    }
  });

  it('rejects a past datetime', () => {
    const pastTime = new Date(Date.now() - 1_000).toISOString();
    const result = rescheduleJobSchema.safeParse({
      params: { id: validUUID },
      body:   { scheduledAt: pastTime },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-date string', () => {
    const result = rescheduleJobSchema.safeParse({
      params: { id: validUUID },
      body:   { scheduledAt: 'next Monday' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing scheduledAt', () => {
    const result = rescheduleJobSchema.safeParse({
      params: { id: validUUID },
      body:   {},
    });
    expect(result.success).toBe(false);
  });
});
