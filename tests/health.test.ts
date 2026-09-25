import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/config/knex';

const app = createApp();

afterAll(async () => {
  await db.destroy();
});

describe('GET /health', () => {
  it('reports the service and its database as healthy', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, db: 'connected' });
  });
});

describe('unknown routes', () => {
  it('returns 404 with a structured error body', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NotFound');
  });
});
