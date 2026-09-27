import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/config/knex';
import { ensureSystemWallet, resetDatabase } from './helpers/db';
import { setBlacklistService, TableBlacklistService } from '../src/services/blacklist.service';

const app = createApp();

const validUser = {
  email: 'Ada@Example.COM ',
  password: 'correct horse battery',
  firstName: 'Ada',
  lastName: 'Lovelace',
};

beforeAll(async () => {
  await db.migrate.latest();
  await ensureSystemWallet();
  setBlacklistService(new TableBlacklistService());
});

beforeEach(resetDatabase);

afterAll(async () => {
  await db.destroy();
});

describe('POST /auth/register', () => {
  it('creates the account and its wallet, and returns a token', async () => {
    const response = await request(app).post('/auth/register').send(validUser);

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe('ada@example.com');
    expect(response.body.data.wallet.balance).toBe(0);
    expect(typeof response.body.data.token).toBe('string');
  });

  it('never returns the password hash', async () => {
    const response = await request(app).post('/auth/register').send(validUser);

    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(response.body.data.user).not.toHaveProperty('password_hash');
  });

  it('creates exactly one wallet for the new account', async () => {
    await request(app).post('/auth/register').send(validUser);

    const wallets = await db('wallets').where({ type: 'USER' });
    expect(wallets).toHaveLength(1);
  });

  it('rejects a duplicate email regardless of casing', async () => {
    await request(app).post('/auth/register').send(validUser);
    const response = await request(app)
      .post('/auth/register')
      .send({ ...validUser, email: 'ADA@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('EmailAlreadyRegistered');
  });

  it('refuses to onboard a blacklisted identity', async () => {
    await db('blacklist').insert({ identifier: 'ada@example.com', reason: 'test fixture' });

    const response = await request(app).post('/auth/register').send(validUser);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('BlacklistedUser');
    expect(await db('users').count('* as count').first()).toMatchObject({ count: 0 });
  });

  it('rejects a short password with field level detail', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ ...validUser, password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
    expect(response.body.details[0].field).toBe('password');
  });

  it('rejects unknown fields rather than ignoring them', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ ...validUser, role: 'ADMIN' });

    expect(response.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/auth/register').send(validUser);
  });

  it('returns a token for correct credentials', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: validUser.password });

    expect(response.status).toBe(200);
    expect(typeof response.body.data.token).toBe('string');
  });

  it('gives the same error for a wrong password as for an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: 'not the password' });

    const unknownEmail = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'not the password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('refuses a blocked account', async () => {
    await db('users').where({ email: 'ada@example.com' }).update({ status: 'BLOCKED' });

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: validUser.password });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AccountBlocked');
  });
});

describe('GET /auth/me', () => {
  it('rejects a request with no token', async () => {
    const response = await request(app).get('/auth/me');

    expect(response.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const response = await request(app).get('/auth/me').set('Authorization', 'Bearer nonsense');

    expect(response.status).toBe(401);
  });

  it('identifies the caller for a valid token', async () => {
    const registered = await request(app).post('/auth/register').send(validUser);

    const response = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${registered.body.data.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('ada@example.com');
    expect(response.body.data.user.role).toBe('USER');
  });
});

describe('request correlation', () => {
  it('echoes a request id on every response', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });
});
