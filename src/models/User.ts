import mongoose, { Document, Schema, Model, CallbackError } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole, UserTier } from '../types';

const SALT_ROUNDS = 12;

// ── Interface ─────────────────────────────────────────────────

export interface IUser extends Document {
  email: string;
  password: string;
  role: UserRole;
  tier: UserTier;
  stripeCustomerId?: string;
  stripeSessionId?: string;
  createdAt: Date;
  updatedAt: Date;

  /** Compares a plain-text candidate against the stored bcrypt hash */
  comparePassword(candidate: string): Promise<boolean>;
}

// ── Static Methods ────────────────────────────────────────────

interface IUserModel extends Model<IUser> {
  /** Finds a user by email (case-insensitive) */
  findByEmail(email: string): Promise<IUser | null>;
}

// ── Schema ────────────────────────────────────────────────────

const userSchema = new Schema<IUser, IUserModel>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      // Never return password in queries by default
      select: false,
    },

    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
    },

    tier: {
      type: String,
      enum: Object.values(UserTier),
      default: UserTier.FREE,
    },

    stripeCustomerId: {
      type: String,
      sparse: true,
    },

    stripeSessionId: {
      type: String,
      sparse: true,
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt automatically
    toJSON: {
      // Remove password and __v when converting to JSON
      transform(_doc, ret: Record<string, unknown>) {
        delete ret['password'];
        delete ret['__v'];
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret['password'];
        delete ret['__v'];
        return ret;
      },
    },
  }
);

// ── Indexes ───────────────────────────────────────────────────
// Note: email index is auto-created by unique:true in the schema field
userSchema.index({ role: 1 });
userSchema.index({ tier: 1 });


// ── Pre-save Hook: Hash Password ──────────────────────────────

userSchema.pre('save', async function (next) {
  // Only hash if password was modified (avoid double-hashing)
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err as CallbackError);
  }
});

// ── Instance Methods ──────────────────────────────────────────

userSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

// ── Static Methods ────────────────────────────────────────────

userSchema.statics.findByEmail = function (
  email: string
): Promise<IUser | null> {
  return this.findOne({ email: email.toLowerCase().trim() }).select('+password');
};

// ── Model ─────────────────────────────────────────────────────

const User = mongoose.model<IUser, IUserModel>('User', userSchema);

export default User;
