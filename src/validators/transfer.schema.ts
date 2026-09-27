import { z } from 'zod';
import { MAX_AMOUNT_MINOR_UNITS } from '../utils/money';
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
