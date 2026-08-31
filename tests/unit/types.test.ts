import { describe, it, expect } from 'vitest';
import { JobType, JobStatus, JobPriority, UserRole, UserTier } from '../../src/types';

describe('JobType enum', () => {
  it('should have all required job types', () => {
    expect(JobType.SEND_EMAIL).toBe('SEND_EMAIL');
    expect(JobType.GENERATE_REPORT).toBe('GENERATE_REPORT');
    expect(JobType.PROCESS_IMAGE).toBe('PROCESS_IMAGE');
    expect(JobType.EXPORT_DATA).toBe('EXPORT_DATA');
    expect(JobType.SEND_NOTIFICATION).toBe('SEND_NOTIFICATION');
  });
});

describe('JobStatus enum', () => {
  it('should have all lifecycle statuses', () => {
    expect(JobStatus.SCHEDULED).toBe('SCHEDULED');
    expect(JobStatus.PENDING).toBe('PENDING');
    expect(JobStatus.PROCESSING).toBe('PROCESSING');
    expect(JobStatus.COMPLETED).toBe('COMPLETED');
    expect(JobStatus.FAILED).toBe('FAILED');
    expect(JobStatus.DEAD).toBe('DEAD');
    expect(JobStatus.CANCELLED).toBe('CANCELLED');
  });
});

describe('JobPriority enum', () => {
  it('should have numeric priority values (lower = higher priority)', () => {
    expect(JobPriority.HIGH).toBe(1);
    expect(JobPriority.MEDIUM).toBe(5);
    expect(JobPriority.LOW).toBe(10);
    expect(JobPriority.HIGH).toBeLessThan(JobPriority.MEDIUM);
    expect(JobPriority.MEDIUM).toBeLessThan(JobPriority.LOW);
  });
});

describe('UserRole enum', () => {
  it('should have user and admin roles', () => {
    expect(UserRole.USER).toBe('user');
    expect(UserRole.ADMIN).toBe('admin');
  });
});

describe('UserTier enum', () => {
  it('should have free and premium tiers', () => {
    expect(UserTier.FREE).toBe('free');
    expect(UserTier.PREMIUM).toBe('premium');
  });
});
