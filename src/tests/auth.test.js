import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import prisma from '../utils/prisma.js';
import { cleanDb, createTestUser } from './helpers.js';

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
describe('POST /api/auth/register', () => {
  it('returns 201 with tokens for valid registration data', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'alice@example.com',
        password: 'Password1',
        firstName: 'Alice',
        lastName: 'Smith',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe('alice@example.com');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('returns 409 when email is already registered', async () => {
    await createTestUser({ email: 'dup@example.com' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'dup@example.com',
        password: 'Password1',
        firstName: 'Bob',
        lastName: 'Jones',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when password has no uppercase letter', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'new@example.com',
        password: 'password1',
        firstName: 'New',
        lastName: 'User',
      });

    expect(res.status).toBe(422);
    expect(res.body.errors.some((e) => e.field === 'password')).toBe(true);
  });

  it('returns 422 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'short@example.com',
        password: 'Pw1',
        firstName: 'Short',
        lastName: 'Pass',
      });

    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
  it('returns 200 with tokens for correct credentials', async () => {
    await createTestUser({ email: 'login@example.com', password: 'Password1' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'Password1' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('returns 401 for wrong password', async () => {
    await createTestUser({ email: 'wrong@example.com', password: 'Password1' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@example.com', password: 'WrongPass9' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password1' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Protected routes — token checks
// ---------------------------------------------------------------------------
describe('Protected route access', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/inventory');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired access token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'fake-id', email: 'fake@test.com', role: 'USER' },
      process.env.JWT_SECRET,
      { expiresIn: 0 }
    );

    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    const badToken = jwt.sign(
      { userId: 'fake-id', email: 'fake@test.com', role: 'USER' },
      'totally-wrong-secret'
    );

    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${badToken}`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
describe('POST /api/auth/refresh', () => {
  it('returns a new token pair for a valid refresh token', async () => {
    const { refreshToken } = await createTestUser();

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    // Confirm the access token is a valid JWT (three dot-separated parts)
    expect(res.body.data.accessToken.split('.').length).toBe(3);
  });

  it('returns 401 for an invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not-a-valid-token' });

    expect(res.status).toBe(401);
  });
});
