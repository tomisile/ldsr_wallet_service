import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { loginSchema, registerSchema } from '../validators/auth.schema';

const router = Router();

router.post('/auth/register', validateBody(registerSchema), authController.register);
router.post('/auth/login', validateBody(loginSchema), authController.login);
router.get('/auth/me', authenticate, authController.me);

export default router;
