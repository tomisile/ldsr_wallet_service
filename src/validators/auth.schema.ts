import { z } from 'zod';

/**
 * Email is lowercased and trimmed here so that uniqueness, blacklist lookups
 * and logins all agree on what counts as the same address.
 */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(255)
  .email('Must be a valid email address');

export const registerSchema = z
  .object({
    email,
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
