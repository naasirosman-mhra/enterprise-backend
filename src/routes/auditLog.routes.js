import { Router } from 'express';
import { listAuditLogs } from '../controllers/auditLog.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.get('/', listAuditLogs);

export default router;
