import { validationResult } from 'express-validator';
import prisma from '../utils/prisma.js';

function formatErrors(result) {
  return result.array().map((e) => ({ field: e.path, message: e.msg }));
}

export async function listCategories(req, res) {
  const { search } = req.query;
  const where = search
    ? { name: { contains: search, mode: 'insensitive' } }
    : {};
  try {
    const categories = await prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { inventoryItems: true } },
      },
    });
    return res.status(200).json({ success: true, message: 'Categories retrieved', data: { categories }, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

export async function getCategory(req, res) {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { inventoryItems: true } },
        inventoryItems: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, sku: true, quantity: true, lowStockThreshold: true },
        },
      },
    });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found', errors: [] });
    return res.status(200).json({ success: true, message: 'Category retrieved', data: { category }, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

export async function createCategory(req, res) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: formatErrors(result) });
  }
  const { name, description } = req.body;
  try {
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) return res.status(409).json({ success: false, message: 'Category name already exists', errors: [{ field: 'name', message: 'Name already in use' }] });

    const category = await prisma.category.create({
      data: { name, description, createdById: req.user.userId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { inventoryItems: true } },
      },
    });
    return res.status(201).json({ success: true, message: 'Category created', data: { category }, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

export async function updateCategory(req, res) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: formatErrors(result) });
  }
  const { name, description } = req.body;
  try {
    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Category not found', errors: [] });

    const isAdmin = req.user.role === 'ADMIN';
    const isCreator = existing.createdById === req.user.userId;
    if (!isAdmin && !isCreator) return res.status(403).json({ success: false, message: 'Not authorised to update this category', errors: [] });

    if (name && name !== existing.name) {
      const nameTaken = await prisma.category.findUnique({ where: { name } });
      if (nameTaken) return res.status(409).json({ success: false, message: 'Category name already exists', errors: [{ field: 'name', message: 'Name already in use' }] });
    }

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(description !== undefined && { description }) },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { inventoryItems: true } },
      },
    });
    return res.status(200).json({ success: true, message: 'Category updated', data: { category }, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

export async function deleteCategory(req, res) {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { inventoryItems: true } } },
    });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found', errors: [] });

    if (category._count.inventoryItems > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete — this category has ${category._count.inventoryItems} linked item${category._count.inventoryItems === 1 ? '' : 's'}. Reassign or delete them first.`,
        errors: [],
      });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isCreator = category.createdById === req.user.userId;
    if (!isAdmin && !isCreator) return res.status(403).json({ success: false, message: 'Not authorised to delete this category', errors: [] });

    await prisma.category.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Category deleted', errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}
