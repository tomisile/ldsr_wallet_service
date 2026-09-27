import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { requireIdempotencyKey } from '../middleware/idempotency';
import { validateBody, validateParams } from '../middleware/validate';
import { creditSchema, userParamsSchema, walletParamsSchema } from '../validators/admin.schema';

const router = Router();

/*
 * Every route here is behind requireAdmin. Crediting a wallet creates money, and
 * a user able to call it on their own wallet could mint an unlimited balance, so
 * the privilege boundary is the whole point rather than a formality.
 */
router.post(
  '/wallets/:walletId/credit',
  authenticate,
  requireAdmin,
  requireIdempotencyKey,
  validateParams(walletParamsSchema),
  validateBody(creditSchema),
  adminController.creditWallet,
);

router.post(
  '/users/:userId/block',
  authenticate,
  requireAdmin,
  validateParams(userParamsSchema),
  adminController.blockUser,
);

router.post(
  '/users/:userId/unblock',
  authenticate,
  requireAdmin,
  validateParams(userParamsSchema),
  adminController.unblockUser,
);

export default router;
