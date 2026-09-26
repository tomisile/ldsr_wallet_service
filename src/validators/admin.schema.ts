import { z } from 'zod';
import { MAX_AMOUNT_MINOR_UNITS } from '../utils/money';

export const creditSchema = z
  .object({
    amount: z
      .number()
      .int('Amount must be an integer number of kobo')
      .positive('Amount must be greater than zero')
      .max(MAX_AMOUNT_MINOR_UNITS, 'Amount exceeds the permitted maximum'),
  })
  .strict();

export const walletParamsSchema = z.object({
  walletId: z.string().uuid('Must be a wallet id'),
});

export const userParamsSchema = z.object({
  userId: z.string().uuid('Must be a user id'),
});

export type CreditInput = z.infer<typeof creditSchema>;
