/**
 * Unit Tests — JWT Utilities  (Stage 10)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { signToken, verifyToken } from '../../src/utils/jwt';
import { UserRole, UserTier } from '../../src/types';
import type { AuthenticatedUser } from '../../src/types';

const mockUser: AuthenticatedUser = {
  id:    '64e3b8f000000000deadbeef',
  email: 'alice@example.com',
  role:  UserRole.USER,
  tier:  UserTier.FREE,
};

describe('signToken', () => {
  it('returns a non-empty string', () => {
    const token = signToken(mockUser);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('produces a token with 3 JWT segments', () => {
    const token = signToken(mockUser);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('embeds the correct user fields', () => {
    const token = signToken(mockUser);
    const decoded = verifyToken(token);
    expect(decoded.id).toBe(mockUser.id);
    expect(decoded.email).toBe(mockUser.email);
    expect(decoded.role).toBe(mockUser.role);
    expect(decoded.tier).toBe(mockUser.tier);
  });
});

describe('verifyToken', () => {
  it('decodes a valid token successfully', () => {
    const token = signToken(mockUser);
    const decoded = verifyToken(token);
    expect(decoded).toMatchObject({ id: mockUser.id, email: mockUser.email });
  });

  it('throws on a tampered token', () => {
    const token = signToken(mockUser);
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(() => verifyToken(tampered)).toThrow();
  });

  it('throws on a completely invalid string', () => {
    expect(() => verifyToken('not.a.token')).toThrow();
  });

  it('throws on an empty string', () => {
    expect(() => verifyToken('')).toThrow();
  });

  it('produces different tokens for different users', () => {
    const adminUser: AuthenticatedUser = { ...mockUser, role: UserRole.ADMIN, id: 'admin-id-111' };
    expect(signToken(mockUser)).not.toBe(signToken(adminUser));
  });
});

describe('admin user token', () => {
  it('preserves the admin role through sign → verify', () => {
    const admin: AuthenticatedUser = { ...mockUser, role: UserRole.ADMIN, tier: UserTier.PREMIUM };
    const token   = signToken(admin);
    const decoded = verifyToken(token);
    expect(decoded.role).toBe(UserRole.ADMIN);
    expect(decoded.tier).toBe(UserTier.PREMIUM);
  });
});
