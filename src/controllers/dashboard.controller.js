import prisma from '../utils/prisma.js';

export async function getStats(req, res) {
  try {
    const [totalItems, totalCategories, outOfStock, lowStockItems] = await Promise.all([
      prisma.inventoryItem.count(),
      prisma.category.count(),
      prisma.inventoryItem.count({ where: { quantity: 0 } }),
      // Field-to-field comparison requires raw SQL
      prisma.$queryRaw`
        SELECT
          i.id,
          i.name,
          i.sku,
          i.quantity,
          i."lowStockThreshold",
          c.name AS "categoryName"
        FROM "InventoryItem" i
        LEFT JOIN "Category" c ON i."categoryId" = c.id
        WHERE i.quantity > 0 AND i.quantity <= i."lowStockThreshold"
        ORDER BY i.quantity ASC
        LIMIT 10
      `,
    ]);

    return res.status(200).json({
      success: true,
      message: 'Stats retrieved',
      data: {
        totalItems,
        totalCategories,
        outOfStockCount: outOfStock,
        lowStockCount: lowStockItems.length,
        lowStockItems,
      },
      errors: [],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}
