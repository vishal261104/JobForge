/**
 * Integration Tests — Auth Routes  (Stage 10)
 *
 * Uses supertest against the real Express app.
 * MongoDB: real Atlas (test DB — cleaned between tests by setup.ts)
 * Redis/BullMQ: mocked via tests/setup.ts
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

// ── POST /api/v1/auth/register ────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  const validUser = { email: 'testuser@example.com', password: 'Password123!' };

  it('returns 201 and a JWT token on success', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe(validUser.email);
  });

  it('returns the user role as "user" by default', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser);

    expect(res.body.data.user.role).toBe('user');
    expect(res.body.data.user.tier).toBe('free');
  });

  it('returns 409 when the email is already registered', async () => {
    // First registration
    await request(app).post('/api/v1/auth/register').send(validUser);
    // Duplicate
    const res = await request(app).post('/api/v1/auth/register').send(validUser);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/email|account|already/i);
  });

  it('returns 422 for an invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'Password123!' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when password is too short', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'short@example.com', password: 'abc' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ password: 'Password123!' });

    expect(res.status).toBe(422);
  });

  it('does not expose password hash in response', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('$2b$'); // bcrypt hash prefix
    expect(res.body.data?.user).not.toHaveProperty('password');
  });
});

// ── POST /api/v1/auth/login ───────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  const creds = { email: 'logintest@example.com', password: 'LoginPass123!' };

  it('returns 200 and a JWT token with correct credentials', async () => {
    // Ensure user exists
    await request(app).post('/api/v1/auth/register').send(creds);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send(creds);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
  });

  it('returns 401 with incorrect password', async () => {
    await request(app).post('/api/v1/auth/register').send(creds);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ ...creds, password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for a non-existent email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.com', password: 'Password123!' });

    expect(res.status).toBe(401);
  });

  it('returns 422 when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'Password123!' });

    expect(res.status).toBe(422);
  });
});

// ── GET /api/v1/auth/me ───────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  it('returns the current user with a valid token', async () => {
    const creds = { email: 'me@example.com', password: 'Password123!' };
    const reg = await request(app).post('/api/v1/auth/register').send(creds);
    const token = reg.body.data.token;

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(creds.email);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a tampered token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.TAMPERED.SIGNATURE');

    expect(res.status).toBe(401);
  });
});
