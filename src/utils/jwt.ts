import jwt from 'jsonwebtoken';
import env from '../config/env';
import { AuthenticatedUser } from '../types';

/**
 * Signs a JWT token containing the user's identity.
 */
export function signToken(payload: AuthenticatedUser): string {
  return jwt.sign(
    {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tier: payload.tier,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );
}

/**
 * Verifies a JWT token and returns the decoded payload.
 * Throws JsonWebTokenError if invalid or expired.
 */
export function verifyToken(token: string): AuthenticatedUser {
  return jwt.verify(token, env.JWT_SECRET) as AuthenticatedUser;
}
