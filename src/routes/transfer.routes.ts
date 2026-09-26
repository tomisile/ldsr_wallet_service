import { Router } from 'express';
import * as transferController from '../controllers/transfer.controller';
import { authenticate } from '../middleware/authenticate';
import { requireIdempotencyKey } from '../middleware/idempotency';
import { validateBody } from '../middleware/validate';
import { transferSchema } from '../validators/transfer.schema';

const router = Router();

router.post(
  '/transfers',
  authenticate,
  requireIdempotencyKey,
  validateBody(transferSchema),
  transferController.createTransfer,
);

export default router;
