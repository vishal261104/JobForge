/**
 * ─────────────────────────────────────────────────────────────
 *  QueueForge — Shared TypeScript Types & Enums
 * ─────────────────────────────────────────────────────────────
 */

// ── Job Types ─────────────────────────────────────────────────

export enum JobType {
  SEND_EMAIL = 'SEND_EMAIL',
  GENERATE_REPORT = 'GENERATE_REPORT',
  PROCESS_IMAGE = 'PROCESS_IMAGE',
  EXPORT_DATA = 'EXPORT_DATA',
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
}

// ── Job Statuses ──────────────────────────────────────────────

export enum JobStatus {
  /** Waiting for a future scheduledAt time */
  SCHEDULED = 'SCHEDULED',
  /** In queue, ready for a worker to pick up */
  PENDING = 'PENDING',
  /** A worker is actively running this job */
  PROCESSING = 'PROCESSING',
  /** Job finished successfully */
  COMPLETED = 'COMPLETED',
  /** Job failed but will be retried */
  FAILED = 'FAILED',
  /** Max retries exhausted — moved to dead-letter queue */
  DEAD = 'DEAD',
  /** Manually cancelled by user or admin */
  CANCELLED = 'CANCELLED',
}

// ── Job Priorities ────────────────────────────────────────────
// Lower number = higher BullMQ priority

export enum JobPriority {
  HIGH = 1,
  MEDIUM = 5,
  LOW = 10,
}

// ── User Roles & Tiers ────────────────────────────────────────

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum UserTier {
  FREE = 'free',
  PREMIUM = 'premium',
}

// ── Payload Shapes ────────────────────────────────────────────

export interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export interface GenerateReportPayload {
  reportType: string;
  filters?: Record<string, unknown>;
  format: 'pdf' | 'csv' | 'xlsx';
}

export interface ProcessImagePayload {
  imageUrl: string;
  operations: Array<'resize' | 'compress' | 'convert' | 'watermark'>;
  outputFormat?: 'jpeg' | 'png' | 'webp';
}

export interface ExportDataPayload {
  entity: string;
  filters?: Record<string, unknown>;
  format: 'csv' | 'json' | 'xlsx';
}

export interface SendNotificationPayload {
  userId: string;
  channel: 'push' | 'sms' | 'in-app';
  title: string;
  message: string;
}

export type JobPayload =
  | SendEmailPayload
  | GenerateReportPayload
  | ProcessImagePayload
  | ExportDataPayload
  | SendNotificationPayload
  | Record<string, unknown>;

// ── Error History Entry ───────────────────────────────────────

export interface JobErrorEntry {
  attempt: number;
  error: string;
  failedAt: Date;
}

// ── Express Auth Extensions ───────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  tier: UserTier;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// ── API Response Shapes ───────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// ── Pagination ────────────────────────────────────────────────

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
