import mongoose, { Document, Schema, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { JobType, JobStatus, JobPriority, JobPayload, JobErrorEntry } from '../types';

// ── Interface ─────────────────────────────────────────────────

export interface IJob extends Document {
  /** Public-facing UUID (not MongoDB _id) */
  jobId: string;

  /** Reference to the submitting user */
  userId: mongoose.Types.ObjectId;

  /** The category of work this job performs */
  type: JobType;

  /** Arbitrary data the worker needs to process the job */
  payload: JobPayload;

  /** Processing priority — lower number = higher priority in BullMQ */
  priority: JobPriority;

  /** Current lifecycle status */
  status: JobStatus;

  /** How many times this job has been attempted */
  attempts: number;

  /** Maximum allowed attempts before moving to dead-letter queue */
  maxAttempts: number;

  /** When this job was created */
  createdAt: Date;

  /** If set, the job will not start before this time */
  scheduledAt?: Date;

  /** When the job finished successfully */
  completedAt?: Date;

  /** The most recent error message (for failed/dead jobs) */
  error?: string;

  /** The result payload returned by a successful worker */
  result?: Record<string, unknown>;

  /** Full history of every failure, for debugging */
  errorHistory: JobErrorEntry[];

  /** BullMQ internal job ID (for cross-referencing the queue) */
  bullJobId?: string;

  updatedAt: Date;
}

// ── Static Methods ────────────────────────────────────────────

interface IJobModel extends Model<IJob> {
  /** Find all non-terminal jobs for a given user */
  findActiveByUser(userId: string): Promise<IJob[]>;

  /** Find all dead-letter jobs (admins only) */
  findDeadJobs(): Promise<IJob[]>;
}

// ── Sub-schema: Error History Entry ──────────────────────────

const errorHistorySchema = new Schema<JobErrorEntry>(
  {
    attempt: { type: Number, required: true },
    error: { type: String, required: true },
    failedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false } // no separate _id for subdocuments
);

// ── Main Schema ───────────────────────────────────────────────

const jobSchema = new Schema<IJob, IJobModel>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      default: uuidv4,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(JobType),
      required: [true, 'Job type is required'],
    },

    payload: {
      type: Schema.Types.Mixed,
      required: [true, 'Payload is required'],
    },

    priority: {
      type: Number,
      enum: Object.values(JobPriority).filter((v) => typeof v === 'number'),
      default: JobPriority.MEDIUM,
    },

    status: {
      type: String,
      enum: Object.values(JobStatus),
      default: JobStatus.PENDING,
      index: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
      max: 10,
    },

    scheduledAt: {
      type: Date,
      default: null,
      index: true,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    error: {
      type: String,
      default: null,
    },

    result: {
      type: Schema.Types.Mixed,
      default: null,
    },

    errorHistory: {
      type: [errorHistorySchema],
      default: [],
    },

    bullJobId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true, // createdAt + updatedAt
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret['__v'];
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

// ── Compound Indexes ──────────────────────────────────────────

// For listing a user's jobs filtered by status
jobSchema.index({ userId: 1, status: 1 });

// For workers polling for highest-priority pending jobs
jobSchema.index({ status: 1, priority: 1, scheduledAt: 1 });

// For the dead-letter queue admin view
jobSchema.index({ status: 1, updatedAt: -1 });

// For scheduled job promotion (cron-like check)
jobSchema.index({ status: 1, scheduledAt: 1 });

// ── Pre-save Hook: Scheduled Status ──────────────────────────

jobSchema.pre('save', function (next) {
  // If a future scheduledAt is set and status is still PENDING, mark as SCHEDULED
  if (
    this.isNew &&
    this.scheduledAt &&
    this.scheduledAt > new Date() &&
    this.status === JobStatus.PENDING
  ) {
    this.status = JobStatus.SCHEDULED;
  }
  next();
});

// ── Static Methods ────────────────────────────────────────────

jobSchema.statics.findActiveByUser = function (
  userId: string
): Promise<IJob[]> {
  return this.find({
    userId,
    status: {
      $nin: [JobStatus.COMPLETED, JobStatus.DEAD, JobStatus.CANCELLED],
    },
  }).sort({ createdAt: -1 });
};

jobSchema.statics.findDeadJobs = function (): Promise<IJob[]> {
  return this.find({ status: JobStatus.DEAD })
    .populate('userId', 'email role')
    .sort({ updatedAt: -1 });
};

// ── Model ─────────────────────────────────────────────────────

const Job = mongoose.model<IJob, IJobModel>('Job', jobSchema);

export default Job;
