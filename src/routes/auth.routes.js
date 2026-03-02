import { Router } from 'express';
import {
  register, login, refresh, logout,
  getProfile, updateProfile, uploadProfileImage,
  forgotPassword, resetPassword,
} from '../controllers/auth.controller.js';
import {
  registerValidator, loginValidator, updateProfileValidator,
  forgotPasswordValidator, resetPasswordValidator,
} from '../validators/auth.validators.js';
import { authenticate } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', authLimiter, registerValidator, register);
router.post('/login', authLimiter, loginValidator, login);
router.post('/refresh', authLimiter, refresh);
router.post('/logout', authenticate, logout);

router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfileValidator, updateProfile);
router.post('/profile/image', authenticate, upload.single('image'), uploadProfileImage);

router.post('/forgot-password', authLimiter, forgotPasswordValidator, forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidator, resetPassword);

export default router;
