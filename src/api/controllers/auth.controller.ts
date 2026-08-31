import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User';
import { signToken } from '../../utils/jwt';
import { sendSuccess, sendError } from '../../utils/apiResponse';

// ── Register ──────────────────────────────────────────────────

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  const existing = await User.findByEmail(email);
  if (existing) {
    sendError(res, 'An account with this email already exists', 409);
    return;
  }

  const user = await User.create({ email, password });

  const token = signToken({
    id: (user._id as mongoose.Types.ObjectId).toString(),
    email: user.email,
    role: user.role,
    tier: user.tier,
  });

  sendSuccess(
    res,
    {
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        tier: user.tier,
        createdAt: user.createdAt,
      },
      token,
    },
    'Account created successfully',
    201
  );
}

// ── Login ─────────────────────────────────────────────────────

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  // findByEmail explicitly selects +password (excluded by default in schema)
  const user = await User.findByEmail(email);
  if (!user) {
    sendError(res, 'Invalid email or password', 401);
    return;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    sendError(res, 'Invalid email or password', 401);
    return;
  }

  const token = signToken({
    id: (user._id as mongoose.Types.ObjectId).toString(),
    email: user.email,
    role: user.role,
    tier: user.tier,
  });

  sendSuccess(res, {
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      tier: user.tier,
    },
    token,
  }, 'Login successful');
}

// ── Get Current User ──────────────────────────────────────────

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.user!.id);
  if (!user) {
    sendError(res, 'User not found', 404);
    return;
  }
  sendSuccess(res, {
    id: user._id,
    email: user.email,
    role: user.role,
    tier: user.tier,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}
