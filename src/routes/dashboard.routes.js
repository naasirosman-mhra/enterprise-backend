import { Router } from 'express';
import { getStats } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.get('/stats', getStats);

export default router;
