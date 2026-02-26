import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma.js';
import { generateAccessToken, generateRefreshToken } from '../utils/tokens.js';

/**
 * Delete all rows in the correct FK order so constraints don't fire.
 */
export async function cleanDb() {
  await prisma.passwordResetToken.deleteMany();
  await prisma.stockAuditLog.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Create a user and return their record plus a valid token pair.
 */
export async function createTestUser(overrides = {}) {
  const email = overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const plainPassword = overrides.password ?? 'Password1';
  const passwordHash = await bcrypt.hash(plainPassword, 4); // low rounds for speed

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'User',
      role: overrides.role ?? 'USER',
    },
  });

  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return { user, accessToken, refreshToken, plainPassword };
}

/**
 * Create a category owned by the given userId.
 */
export async function createTestCategory(createdById, overrides = {}) {
  return prisma.category.create({
    data: {
      name: overrides.name ?? `Cat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      description: overrides.description ?? null,
      createdById,
    },
  });
}
