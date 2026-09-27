import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { requireIdempotencyKey } from '../middleware/idempotency';
import { validateBody, validateParams } from '../middleware/validate';
import { creditSchema, userParamsSchema, walletParamsSchema } from '../validators/admin.schema';

const router = Router();
router.post(
  '/wallets/:walletId/credit',
  authenticate,
  requireAdmin,
  requireIdempotencyKey,
  validateParams(walletParamsSchema),
  validateBody(creditSchema),
  adminController.creditWallet,
);
// Declared before the parameterised routes below. Express matches in declaration
// order, so a literal segment registered after /users/:userId/... can be captured
// as a parameter by it.
router.get('/users/blacklisted', authenticate, requireAdmin, adminController.listBlacklistedUsers);

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
