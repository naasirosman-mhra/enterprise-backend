import { Router } from 'express';
import { register, login, refresh, logout } from '../controllers/auth.controller.js';
import { registerValidator, loginValidator } from '../validators/auth.validators.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);

export default router;
