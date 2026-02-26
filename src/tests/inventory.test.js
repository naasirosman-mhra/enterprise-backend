import request from 'supertest';
import app from '../app.js';
import prisma from '../utils/prisma.js';
import { cleanDb, createTestUser, createTestCategory } from './helpers.js';

// Shared state set up once per describe block
let userToken, adminToken, userId, adminId, categoryId;

beforeEach(async () => {
  await cleanDb();

  const userResult = await createTestUser({ role: 'USER' });
  const adminResult = await createTestUser({ role: 'ADMIN' });

  userToken = userResult.accessToken;
  userId = userResult.user.id;
  adminToken = adminResult.accessToken;
  adminId = adminResult.user.id;

  const category = await createTestCategory(userId);
  categoryId = category.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function itemPayload(overrides = {}) {
  return {
    name: overrides.name ?? 'Test Item',
    sku: overrides.sku ?? `SKU-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    quantity: overrides.quantity ?? 10,
    lowStockThreshold: overrides.lowStockThreshold ?? 5,
    categoryId: overrides.categoryId ?? categoryId,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /api/inventory
// ---------------------------------------------------------------------------
describe('POST /api/inventory', () => {
  it('returns 201 when creating an item with valid data', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ name: 'Laptop Stand', sku: 'LS-001' }));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.item.name).toBe('Laptop Stand');
    expect(res.body.data.item.sku).toBe('LS-001');
  });

  it('returns 409 for a duplicate SKU', async () => {
    const payload = itemPayload({ sku: 'DUPE-001' });
    await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(payload);

    const res = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...payload, name: 'Another Item' });

    expect(res.status).toBe(409);
    expect(res.body.errors[0].field).toBe('sku');
  });

  it('returns 422 for a negative quantity', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ quantity: -1 }));

    expect(res.status).toBe(422);
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .send(itemPayload());

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/inventory/:id
// ---------------------------------------------------------------------------
describe('PUT /api/inventory/:id', () => {
  it('returns 200 and creates an audit log entry when quantity changes', async () => {
    const create = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'AUDIT-SKU', quantity: 10 }));
    const itemId = create.body.data.item.id;

    const res = await request(app)
      .put(`/api/inventory/${itemId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ quantity: 25, changeReason: 'Received shipment' });

    expect(res.status).toBe(200);
    expect(res.body.data.item.quantity).toBe(25);

    // Confirm audit log was created
    const log = await prisma.stockAuditLog.findFirst({ where: { itemId } });
    expect(log).not.toBeNull();
    expect(log.previousQuantity).toBe(10);
    expect(log.newQuantity).toBe(25);
    expect(log.changeReason).toBe('Received shipment');
  });

  it('returns 422 for a negative quantity on update', async () => {
    const create = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'NEG-SKU' }));
    const itemId = create.body.data.item.id;

    const res = await request(app)
      .put(`/api/inventory/${itemId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ quantity: -5 });

    expect(res.status).toBe(422);
  });

  it('does NOT create an audit log when quantity is unchanged', async () => {
    const create = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'NO-AUDIT', quantity: 10 }));
    const itemId = create.body.data.item.id;

    await request(app)
      .put(`/api/inventory/${itemId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Updated Name', quantity: 10 }); // same qty

    const count = await prisma.stockAuditLog.count({ where: { itemId } });
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/inventory/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/inventory/:id', () => {
  it('returns 200 when the creator deletes their own item', async () => {
    const create = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'DEL-OWN' }));
    const itemId = create.body.data.item.id;

    const res = await request(app)
      .delete(`/api/inventory/${itemId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 403 when a non-creator non-admin tries to delete', async () => {
    const create = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'DEL-FORBID' }));
    const itemId = create.body.data.item.id;

    // Create a different user
    const { accessToken: otherToken } = await createTestUser({ role: 'USER' });

    const res = await request(app)
      .delete(`/api/inventory/${itemId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 200 when an admin deletes any item', async () => {
    const create = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'DEL-ADMIN' }));
    const itemId = create.body.data.item.id;

    const res = await request(app)
      .delete(`/api/inventory/${itemId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/inventory — list, pagination, filter, search
// ---------------------------------------------------------------------------
describe('GET /api/inventory', () => {
  it('returns paginated results with correct page size', async () => {
    // Create 5 items
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${userToken}`)
        .send(itemPayload({ sku: `PAGE-${i}`, name: `Item ${i}` }));
    }

    const res = await request(app)
      .get('/api/inventory?page=1&limit=3')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(3);
    expect(res.body.data.totalCount).toBe(5);
    expect(res.body.data.page).toBe(1);
  });

  it('returns only items matching the categoryId filter', async () => {
    const otherCat = await createTestCategory(userId, { name: 'Other Category' });

    await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'CAT-MATCH', categoryId }));

    await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'CAT-OTHER', categoryId: otherCat.id }));

    const res = await request(app)
      .get(`/api/inventory?categoryId=${categoryId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].sku).toBe('CAT-MATCH');
  });

  it('returns only items matching the search term', async () => {
    await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'SRCH-1', name: 'Ergonomic Chair' }));

    await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'SRCH-2', name: 'Standing Desk' }));

    const res = await request(app)
      .get('/api/inventory?search=ergonomic')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].name).toBe('Ergonomic Chair');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/categories/:id — with linked items
// ---------------------------------------------------------------------------
describe('DELETE /api/categories/:id', () => {
  it('returns 400 when the category has linked inventory items', async () => {
    await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'LINKED-ITEM' }));

    const res = await request(app)
      .delete(`/api/categories/${categoryId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/stats
// ---------------------------------------------------------------------------
describe('GET /api/dashboard/stats', () => {
  it('returns correct counts for totalItems, totalCategories and outOfStockCount', async () => {
    // Create a second category
    await createTestCategory(userId, { name: 'Electronics' });

    // Item in stock
    await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'STAT-1', quantity: 5 }));

    // Out-of-stock item
    await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${userToken}`)
      .send(itemPayload({ sku: 'STAT-2', quantity: 0 }));

    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalItems).toBe(2);
    expect(res.body.data.totalCategories).toBe(2); // original + Electronics
    expect(res.body.data.outOfStockCount).toBe(1);
  });
});
