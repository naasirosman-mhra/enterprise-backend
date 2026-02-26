import { validationResult } from 'express-validator';
import prisma from '../utils/prisma.js';

function formatErrors(result) {
  return result.array().map((e) => ({ field: e.path, message: e.msg }));
}

const ALLOWED_SORT_FIELDS = ['name', 'sku', 'quantity', 'createdAt', 'updatedAt'];

// GET /api/inventory
export async function listItems(req, res) {
  const {
    page = '1',
    limit = '20',
    categoryId,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const take = Math.min(parseInt(limit, 10) || 20, 100);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;
  const orderField = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
  const order = sortOrder === 'asc' ? 'asc' : 'desc';

  const where = {};
  if (categoryId) where.categoryId = categoryId;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }

  try {
    const [items, totalCount] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        skip,
        take,
        orderBy: { [orderField]: order },
        include: {
          category: { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Items retrieved',
      data: { items, totalCount, page: parseInt(page, 10), limit: take },
      errors: [],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

// GET /api/inventory/:id
export async function getItem(req, res) {
  try {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found', errors: [] });
    }

    return res.status(200).json({ success: true, message: 'Item retrieved', data: { item }, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

// POST /api/inventory
export async function createItem(req, res) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: formatErrors(result) });
  }

  const { name, description, sku, quantity = 0, lowStockThreshold = 10, categoryId } = req.body;

  try {
    // Check SKU uniqueness
    const existing = await prisma.inventoryItem.findUnique({ where: { sku } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'SKU already exists', errors: [{ field: 'sku', message: 'SKU already in use' }] });
    }

    // Check category exists
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(422).json({ success: false, message: 'Validation failed', errors: [{ field: 'categoryId', message: 'Category not found' }] });
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name,
        description,
        sku,
        quantity: parseInt(quantity, 10),
        lowStockThreshold: parseInt(lowStockThreshold, 10),
        categoryId,
        createdById: req.user.userId,
      },
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return res.status(201).json({ success: true, message: 'Item created', data: { item }, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

// PUT /api/inventory/:id
export async function updateItem(req, res) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: formatErrors(result) });
  }

  const { name, description, sku, quantity, lowStockThreshold, categoryId, changeReason } = req.body;

  try {
    const existing = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Item not found', errors: [] });
    }

    // Check SKU uniqueness if changing
    if (sku && sku !== existing.sku) {
      const skuTaken = await prisma.inventoryItem.findUnique({ where: { sku } });
      if (skuTaken) {
        return res.status(409).json({ success: false, message: 'SKU already exists', errors: [{ field: 'sku', message: 'SKU already in use' }] });
      }
    }

    // Check category if changing
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return res.status(422).json({ success: false, message: 'Validation failed', errors: [{ field: 'categoryId', message: 'Category not found' }] });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (sku !== undefined) updateData.sku = sku;
    if (lowStockThreshold !== undefined) updateData.lowStockThreshold = parseInt(lowStockThreshold, 10);
    if (categoryId !== undefined) updateData.categoryId = categoryId;

    const quantityChanged = quantity !== undefined && parseInt(quantity, 10) !== existing.quantity;
    if (quantityChanged) updateData.quantity = parseInt(quantity, 10);

    const [item] = await prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          category: { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (quantityChanged) {
        await tx.stockAuditLog.create({
          data: {
            itemId: req.params.id,
            userId: req.user.userId,
            previousQuantity: existing.quantity,
            newQuantity: parseInt(quantity, 10),
            changeReason: changeReason || null,
          },
        });
      }

      return [updated];
    });

    return res.status(200).json({ success: true, message: 'Item updated', data: { item }, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}

// DELETE /api/inventory/:id
export async function deleteItem(req, res) {
  try {
    const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found', errors: [] });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isCreator = item.createdById === req.user.userId;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ success: false, message: 'You are not authorised to delete this item', errors: [] });
    }

    await prisma.inventoryItem.delete({ where: { id: req.params.id } });

    return res.status(200).json({ success: true, message: 'Item deleted', errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}
