import prisma from '../utils/prisma.js';

export async function listAuditLogs(req, res) {
  const { page = '1', limit = '20', itemId, userId, fromDate, toDate } = req.query;
  const take = Math.min(parseInt(limit, 10) || 20, 100);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const where = {};

  // Regular users can only see their own logs
  if (req.user.role !== 'ADMIN') {
    where.userId = req.user.userId;
  } else if (userId) {
    where.userId = userId;
  }

  if (itemId) where.itemId = itemId;

  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

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
