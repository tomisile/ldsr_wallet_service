import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/config/knex';
import bcrypt from 'bcryptjs';
import { sumOfAllBalances } from '../src/services/ledger.service';
import { ensureSystemWallet, resetDatabase } from './helpers/db';
import { balanceOf, registerAccount, TestAccount } from './helpers/factories';

const app = createApp();

const NAIRA = 100;
const ADMIN_PASSWORD = 'an admin test password';

let admin: { id: string; token: string };
let alice: TestAccount;

async function createAdminAndLogIn() {
  const email = `admin-${randomUUID()}@test.local`;
  const [row] = await db('users')
    .insert({
      email,
      password_hash: await bcrypt.hash(ADMIN_PASSWORD, 4),
      first_name: 'Test',
      last_name: 'Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    })
    .returning(['id']);
  await db('wallets').insert({ user_id: row.id, type: 'USER', balance: 0 });

  const response = await request(app)
    .post('/auth/login')
    .send({ email, password: ADMIN_PASSWORD })
    .expect(200);

  return { id: row.id as string, token: response.body.data.token as string };
}

beforeAll(async () => {
  await db.migrate.latest();
  await ensureSystemWallet();
});

beforeEach(async () => {
  await resetDatabase();
  await ensureSystemWallet();
  admin = await createAdminAndLogIn();
  alice = await registerAccount(app, 'alice@test.local');
});

afterAll(async () => {
  await db.destroy();
});

function credit(token: string, walletId: string, amount: number, key = randomUUID()) {
  return request(app)
    .post(`/wallets/${walletId}/credit`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send({ amount });
}

describe('POST /wallets/:walletId/credit', () => {
  it('credits a wallet and drives the system wallet negative', async () => {
    const response = await credit(admin.token, alice.walletId, 500 * NAIRA);

    expect(response.status).toBe(201);
    expect(response.body.data.type).toBe('CREDIT');
    expect(response.body.data.to.balanceAfter).toBe(500 * NAIRA);
    expect(await balanceOf(alice.walletId)).toBe(500 * NAIRA);

    const system = await db('wallets').where({ type: 'SYSTEM' }).first();
    expect(Number(system.balance)).toBe(-500 * NAIRA);
  });

  it('keeps the ledger balanced, so all balances still sum to zero', async () => {
    await credit(admin.token, alice.walletId, 500 * NAIRA);

    expect(await sumOfAllBalances()).toBe(0);
  });

  it('writes a debit and a credit for the funding movement', async () => {
    const response = await credit(admin.token, alice.walletId, 500 * NAIRA);
    const transaction = await db('transactions')
      .where({ reference: response.body.data.reference })
      .first();
    const entries = await db('ledger_entries').where({ transaction_id: transaction.id });

    expect(entries).toHaveLength(2);
  });

  it('refuses a caller who is not an administrator', async () => {
    const response = await credit(alice.token, alice.walletId, 1000 * NAIRA);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
    expect(await balanceOf(alice.walletId)).toBe(0);
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await request(app)
      .post(`/wallets/${alice.walletId}/credit`)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: 100 });

    expect(response.status).toBe(401);
  });

  it('requires an idempotency key', async () => {
    const response = await request(app)
      .post(`/wallets/${alice.walletId}/credit`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ amount: 100 });

    expect(response.status).toBe(400);
  });

  it('replays a repeated key rather than crediting twice', async () => {
    const key = randomUUID();

    const first = await credit(admin.token, alice.walletId, 500 * NAIRA, key);
    const second = await credit(admin.token, alice.walletId, 500 * NAIRA, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.replayed).toBe(true);
    expect(await balanceOf(alice.walletId)).toBe(500 * NAIRA);
  });

  it('rejects an unknown wallet', async () => {
    const response = await credit(admin.token, randomUUID(), 100 * NAIRA);

    expect(response.status).toBe(404);
  });

  it('will not credit the system wallet', async () => {
    const system = await db('wallets').where({ type: 'SYSTEM' }).first();

    const response = await credit(admin.token, system.id, 100 * NAIRA);

    expect(response.status).toBe(404);
  });

  it('rejects a malformed wallet id as a bad request', async () => {
    const response = await credit(admin.token, 'not-a-uuid', 100 * NAIRA);

    expect(response.status).toBe(400);
  });

  it('rejects a zero or negative amount', async () => {
    expect((await credit(admin.token, alice.walletId, 0)).status).toBe(400);
    expect((await credit(admin.token, alice.walletId, -100)).status).toBe(400);
  });
});

describe('POST /users/:userId/block and /unblock', () => {
  function act(action: 'block' | 'unblock', token: string, userId: string) {
    return request(app)
      .post(`/users/${userId}/${action}`)
      .set('Authorization', `Bearer ${token}`)
      .send();
  }

  it('blocks an account and prevents it logging in', async () => {
    const response = await act('block', admin.token, alice.userId);

    expect(response.status).toBe(200);
    expect(response.body.data.user.status).toBe('BLOCKED');

    const login = await request(app)
      .post('/auth/login')
      .send({ email: alice.email, password: 'a valid test password' });

    expect(login.status).toBe(403);
    expect(login.body.error).toBe('AccountBlocked');
  });

  it('prevents a blocked account from sending funds', async () => {
    await credit(admin.token, alice.walletId, 500 * NAIRA);
    const bob = await registerAccount(app, 'bob@test.local');
    await act('block', admin.token, alice.userId);

    const transfer = await request(app)
      .post('/transfers')
      .set('Authorization', `Bearer ${alice.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ toWalletId: bob.walletId, amount: 100 * NAIRA });

    expect(transfer.status).toBe(403);
    expect(await balanceOf(alice.walletId)).toBe(500 * NAIRA);
  });

  it('unblocks an account and restores access', async () => {
    await act('block', admin.token, alice.userId);
    const response = await act('unblock', admin.token, alice.userId);

    expect(response.status).toBe(200);
    expect(response.body.data.user.status).toBe('ACTIVE');

    const login = await request(app)
      .post('/auth/login')
      .send({ email: alice.email, password: 'a valid test password' });

    expect(login.status).toBe(200);
  });

  it('is idempotent when blocking an already blocked account', async () => {
    await act('block', admin.token, alice.userId);
    const second = await act('block', admin.token, alice.userId);

    expect(second.status).toBe(200);
    expect(second.body.data.user.status).toBe('BLOCKED');
  });

  it('refuses a caller who is not an administrator', async () => {
    const bob = await registerAccount(app, 'bob@test.local');

    const response = await act('block', alice.token, bob.userId);

    expect(response.status).toBe(403);
    const unchanged = await db('users').where({ id: bob.userId }).first();
    expect(unchanged.status).toBe('ACTIVE');
  });

  it('will not let an administrator block their own account', async () => {
    const response = await act('block', admin.token, admin.id);

    expect(response.status).toBe(403);
  });

  it('reports an unknown user as not found', async () => {
    const response = await act('block', admin.token, randomUUID());

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('UserNotFound');
  });

  it('does not destroy the balance of a blocked account', async () => {
    await credit(admin.token, alice.walletId, 500 * NAIRA);
    await act('block', admin.token, alice.userId);

    expect(await balanceOf(alice.walletId)).toBe(500 * NAIRA);
    expect(await sumOfAllBalances()).toBe(0);
  });
});

describe('GET /wallets/me', () => {
  it('reports the caller own balance', async () => {
    await credit(admin.token, alice.walletId, 1234 * NAIRA + 56);

    const response = await request(app)
      .get('/wallets/me')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(alice.walletId);
    expect(response.body.data.balance).toBe(123456);
    expect(response.body.data.balanceFormatted).toBe('1,234.56');
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/wallets/me')).status).toBe(401);
  });
});
