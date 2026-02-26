import prisma from '../utils/prisma.js';

export async function listAuditLogs(req, res) {
  const { page = '1', limit = '10', itemId } = req.query;
  const take = Math.min(parseInt(limit, 10) || 10, 50);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const where = itemId ? { itemId } : {};

  try {
    const [logs, totalCount] = await Promise.all([
      prisma.stockAuditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          item: { select: { id: true, name: true, sku: true } },
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.stockAuditLog.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Audit logs retrieved',
      data: { logs, totalCount, page: parseInt(page, 10), limit: take },
      errors: [],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
  }
}
