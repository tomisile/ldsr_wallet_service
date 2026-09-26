import { z } from 'zod';
import { MAX_AMOUNT_MINOR_UNITS } from '../utils/money';

/**
 * Amounts are integer minor units (kobo). A non-integer is rejected rather than
 * rounded, because silently rounding somebody's money is worse than refusing the
 * request.
 *
 * There is no `fromWalletId`: the source is derived from the authenticated
 * caller, so it cannot be supplied.
 */
export const transferSchema = z
  .object({
    toWalletId: z.string().uuid('Must be a wallet id'),
    amount: z
      .number()
      .int('Amount must be an integer number of kobo')
      .positive('Amount must be greater than zero')
      .max(MAX_AMOUNT_MINOR_UNITS, 'Amount exceeds the permitted maximum'),
  })
  .strict();

export type TransferInput = z.infer<typeof transferSchema>;
