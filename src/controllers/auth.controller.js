import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma.js';
import cloudinary from '../utils/cloudinary.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/tokens.js';

function formatErrors(result) {
  return result.array().map((e) => ({ field: e.path, message: e.msg }));
}

function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function register(req, res) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: formatErrors(result) });
  }

  const { email, password, firstName, lastName } = req.body;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already in use', errors: [] });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName },
    });

    const tokenPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: { user: safeUser(user), accessToken, refreshToken },
      errors: [],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

export async function login(req, res) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: formatErrors(result) });
  }

  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password', errors: [] });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password', errors: [] });
    }

    const tokenPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { user: safeUser(user), accessToken, refreshToken },
      errors: [],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

export async function refresh(req, res) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'Refresh token is required', errors: [] });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found', errors: [] });
    }

    const tokenPayload = { userId: user.id, email: user.email, role: user.role };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    return res.status(200).json({
      success: true,
      message: 'Tokens refreshed',
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
      errors: [],
    });
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token', errors: [] });
  }
}

export async function logout(req, res) {
  return res.status(200).json({ success: true, message: 'Logged out successfully', errors: [] });
}

export async function getProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found', errors: [] });
    return res.status(200).json({ success: true, message: 'Profile retrieved', data: { user: safeUser(user) }, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

export async function updateProfile(req, res) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: formatErrors(result) });
  }

  const { firstName, lastName, email } = req.body;

  try {
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== req.user.userId) {
        return res.status(409).json({ success: false, message: 'Email already in use', errors: [] });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(email && { email }),
      },
    });

    return res.status(200).json({ success: true, message: 'Profile updated', data: { user: safeUser(user) }, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

export async function uploadProfileImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded', errors: [] });
  }

  try {
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'inventory-app/profiles', resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { profileImageUrl: uploadResult.secure_url },
    });

    return res.status(200).json({ success: true, message: 'Profile image updated', data: { user: safeUser(user) }, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Image upload failed', errors: [] });
  }
}

export async function forgotPassword(req, res) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: formatErrors(result) });
  }

  // Always return the same response to prevent email enumeration
  const generic = { success: true, message: 'If that email is registered, a reset link has been sent.', data: {}, errors: [] };

  const { email } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(200).json(generic);

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail(email, resetLink);

    return res.status(200).json(generic);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

export async function resetPassword(req, res) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: formatErrors(result) });
  }

  const { token, newPassword } = req.body;

  try {
    const record = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!record || record.used || record.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired.', errors: [] });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);

    return res.status(200).json({ success: true, message: 'Password reset successful.', data: {}, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}
