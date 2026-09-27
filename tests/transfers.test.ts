import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/config/knex';
import { sumOfAllBalances } from '../src/services/ledger.service';
import { ensureSystemWallet, resetDatabase } from './helpers/db';
import {
  balanceOf,
  createAdmin,
  fundWallet,
  registerAccount,
  TestAccount,
} from './helpers/factories';

const app = createApp();

const NAIRA = 100; // minor units per naira

let alice: TestAccount;
let bob: TestAccount;
let adminId: string;

beforeAll(async () => {
  await db.migrate.latest();
  await ensureSystemWallet();
});

beforeEach(async () => {
  await resetDatabase();
  await ensureSystemWallet();
  adminId = await createAdmin();
  alice = await registerAccount(app, 'alice@test.local');
  bob = await registerAccount(app, 'bob@test.local');
});

afterAll(async () => {
  await db.destroy();
});

function transfer(account: TestAccount, body: object, idempotencyKey = randomUUID()) {
  return request(app)
    .post('/transfers')
    .set('Authorization', `Bearer ${account.token}`)
    .set('Idempotency-Key', idempotencyKey)
    .send(body);
}

describe('POST /transfers', () => {
  it('moves funds and reports both balances', async () => {
    await fundWallet(alice.walletId, 1000 * NAIRA, adminId);

    const response = await transfer(alice, { toWalletId: bob.walletId, amount: 250 * NAIRA });

    expect(response.status).toBe(201);
    expect(response.body.data.amount).toBe(25000);
    expect(response.body.data.amountFormatted).toBe('250.00');
    expect(response.body.data.from.balanceAfter).toBe(750 * NAIRA);
    expect(response.body.data.to.balanceAfter).toBe(250 * NAIRA);
    expect(response.body.data.replayed).toBe(false);

    expect(await balanceOf(alice.walletId)).toBe(750 * NAIRA);
    expect(await balanceOf(bob.walletId)).toBe(250 * NAIRA);
  });

  it('writes exactly two ledger entries that net to zero', async () => {
    await fundWallet(alice.walletId, 1000 * NAIRA, adminId);
    const response = await transfer(alice, { toWalletId: bob.walletId, amount: 250 * NAIRA });

    const transaction = await db('transactions')
      .where({ reference: response.body.data.reference })
      .first();
    const entries = await db('ledger_entries').where({ transaction_id: transaction.id });

    expect(entries).toHaveLength(2);
    expect(entries.filter((e) => e.direction === 'DEBIT')).toHaveLength(1);
    expect(entries.filter((e) => e.direction === 'CREDIT')).toHaveLength(1);
    expect(Number(entries[0].amount)).toBe(Number(entries[1].amount));
  });

  it('refuses a transfer larger than the balance', async () => {
    await fundWallet(alice.walletId, 100 * NAIRA, adminId);

    const response = await transfer(alice, { toWalletId: bob.walletId, amount: 101 * NAIRA });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('InsufficientFunds');
    expect(await balanceOf(alice.walletId)).toBe(100 * NAIRA);
    expect(await balanceOf(bob.walletId)).toBe(0);
  });

  it('refuses a transfer from an empty wallet', async () => {
    const response = await transfer(alice, { toWalletId: bob.walletId, amount: 1 });

    expect(response.status).toBe(422);
  });

  it('refuses a transfer to the caller own wallet', async () => {
    await fundWallet(alice.walletId, 100 * NAIRA, adminId);

    const response = await transfer(alice, { toWalletId: alice.walletId, amount: 1 * NAIRA });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('SelfTransfer');
  });

  it('refuses an unknown destination wallet', async () => {
    await fundWallet(alice.walletId, 100 * NAIRA, adminId);

    const response = await transfer(alice, { toWalletId: randomUUID(), amount: 1 * NAIRA });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('WalletNotFound');
  });

  it('does not expose the SYSTEM wallet as a destination', async () => {
    await fundWallet(alice.walletId, 100 * NAIRA, adminId);
    const system = await db('wallets').where({ type: 'SYSTEM' }).first();

    const response = await transfer(alice, { toWalletId: system.id, amount: 1 * NAIRA });

    expect(response.status).toBe(404);
  });

  it('rejects a non integer amount rather than rounding it', async () => {
    await fundWallet(alice.walletId, 100 * NAIRA, adminId);

    const response = await transfer(alice, { toWalletId: bob.walletId, amount: 10.5 });

    expect(response.status).toBe(400);
  });

  it('requires authentication', async () => {
    const response = await request(app)
      .post('/transfers')
      .set('Idempotency-Key', randomUUID())
      .send({ toWalletId: bob.walletId, amount: 100 });

    expect(response.status).toBe(401);
  });

  it('requires an idempotency key', async () => {
    await fundWallet(alice.walletId, 100 * NAIRA, adminId);

    const response = await request(app)
      .post('/transfers')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ toWalletId: bob.walletId, amount: 1 * NAIRA });

    expect(response.status).toBe(400);
  });

  it('refuses a transfer from a blocked account', async () => {
    await fundWallet(alice.walletId, 100 * NAIRA, adminId);
    await db('users').where({ id: alice.userId }).update({ status: 'BLOCKED' });

    const response = await transfer(alice, { toWalletId: bob.walletId, amount: 1 * NAIRA });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AccountBlocked');
  });

  it('refuses a transfer to a blocked account', async () => {
    await fundWallet(alice.walletId, 100 * NAIRA, adminId);
    await db('users').where({ id: bob.userId }).update({ status: 'BLOCKED' });

    const response = await transfer(alice, { toWalletId: bob.walletId, amount: 1 * NAIRA });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('RecipientBlocked');
  });
});

describe('idempotency', () => {
  it('replays a repeated key without moving money twice', async () => {
    await fundWallet(alice.walletId, 1000 * NAIRA, adminId);
    const key = randomUUID();
    const body = { toWalletId: bob.walletId, amount: 250 * NAIRA };

    const first = await transfer(alice, body, key);
    const second = await transfer(alice, body, key);

    expect(first.status).toBe(201);
    expect(first.body.data.replayed).toBe(false);
    expect(second.status).toBe(200);
    expect(second.body.data.replayed).toBe(true);
    expect(second.body.data.reference).toBe(first.body.data.reference);

    expect(await balanceOf(alice.walletId)).toBe(750 * NAIRA);
    expect(await balanceOf(bob.walletId)).toBe(250 * NAIRA);
    expect(await db('transactions').where({ type: 'TRANSFER' })).toHaveLength(1);
  });

  it('collapses ten concurrent duplicates into a single movement', async () => {
    await fundWallet(alice.walletId, 1000 * NAIRA, adminId);
    const key = randomUUID();
    const body = { toWalletId: bob.walletId, amount: 100 * NAIRA };

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => transfer(alice, body, key)),
    );

    const created = responses.filter((r) => r.status === 201);
    const replayed = responses.filter((r) => r.status === 200);

    expect(created).toHaveLength(1);
    expect(replayed).toHaveLength(9);
    expect(await balanceOf(alice.walletId)).toBe(900 * NAIRA);
    expect(await balanceOf(bob.walletId)).toBe(100 * NAIRA);
    expect(await db('transactions').where({ type: 'TRANSFER' })).toHaveLength(1);
  });

  it('rejects a reused key carrying a different payload', async () => {
    await fundWallet(alice.walletId, 1000 * NAIRA, adminId);
    const key = randomUUID();

    await transfer(alice, { toWalletId: bob.walletId, amount: 100 * NAIRA }, key);
    const second = await transfer(alice, { toWalletId: bob.walletId, amount: 500 * NAIRA }, key);

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('IdempotencyKeyConflict');
    expect(await balanceOf(bob.walletId)).toBe(100 * NAIRA);
  });

  it('releases the key when the request failed, so a retry can succeed', async () => {
    const key = randomUUID();
    const body = { toWalletId: bob.walletId, amount: 100 * NAIRA };

    const failed = await transfer(alice, body, key);
    expect(failed.status).toBe(422);

    await fundWallet(alice.walletId, 1000 * NAIRA, adminId);
    const retried = await transfer(alice, body, key);

    expect(retried.status).toBe(201);
    expect(await balanceOf(bob.walletId)).toBe(100 * NAIRA);
  });
});

describe('concurrency', () => {
  it('keeps balances exact under twenty parallel transfers', async () => {
    await fundWallet(alice.walletId, 1000 * NAIRA, adminId);

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        transfer(alice, { toWalletId: bob.walletId, amount: 100 * NAIRA }),
      ),
    );

    const succeeded = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status === 422);

    expect(succeeded).toHaveLength(10);
    expect(rejected).toHaveLength(10);

    expect(await balanceOf(alice.walletId)).toBe(0);
    expect(await balanceOf(bob.walletId)).toBe(1000 * NAIRA);

    const entries = await db('ledger_entries');
    expect(entries).toHaveLength(22);
  });

  it('never lets a wallet go negative under contention', async () => {
    await fundWallet(alice.walletId, 500 * NAIRA, adminId);

    await Promise.all(
      Array.from({ length: 30 }, () =>
        transfer(alice, { toWalletId: bob.walletId, amount: 100 * NAIRA }),
      ),
    );

    const balances = await db('wallets').whereNot({ type: 'SYSTEM' }).select('balance');
    balances.forEach(({ balance }) => expect(Number(balance)).toBeGreaterThanOrEqual(0));
  });

  it('survives transfers in both directions at once without deadlocking', async () => {
    await fundWallet(alice.walletId, 500 * NAIRA, adminId);
    await fundWallet(bob.walletId, 500 * NAIRA, adminId);

    const responses = await Promise.all([
      ...Array.from({ length: 10 }, () =>
        transfer(alice, { toWalletId: bob.walletId, amount: 10 * NAIRA }),
      ),
      ...Array.from({ length: 10 }, () =>
        transfer(bob, { toWalletId: alice.walletId, amount: 10 * NAIRA }),
      ),
    ]);

    responses.forEach((r) => expect([201, 200, 422]).toContain(r.status));
    expect(responses.filter((r) => r.status >= 500)).toHaveLength(0);

    expect(await balanceOf(alice.walletId)).toBe(500 * NAIRA);
    expect(await balanceOf(bob.walletId)).toBe(500 * NAIRA);
  });

  it('holds the zero sum invariant after heavy concurrent activity', async () => {
    await fundWallet(alice.walletId, 1000 * NAIRA, adminId);

    await Promise.all(
      Array.from({ length: 25 }, () =>
        transfer(alice, { toWalletId: bob.walletId, amount: 50 * NAIRA }),
      ),
    );

    expect(await sumOfAllBalances()).toBe(0);
  });
});
