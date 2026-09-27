import { Router } from 'express';
import * as walletController from '../controllers/wallet.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.get('/wallets/me', authenticate, walletController.getOwnWallet);

export default router;
