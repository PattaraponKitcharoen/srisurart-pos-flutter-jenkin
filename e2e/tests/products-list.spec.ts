import { expect, test } from '@playwright/test';
import { authHeaders, writeHeaders } from './session';

// "List tasks" in the lab sheet → list a shop's catalogue.
test('lists the new shop\'s seeded categories and its products', async ({ request }) => {
  const categories = await request.get('/api/v1/categories', { headers: authHeaders() });
  expect(categories.status()).toBe(200);
  const names = ((await categories.json()).data as { name: string }[]).map((c) => c.name);
  expect(names).toEqual(['เครื่องยนต์', 'ไฟฟ้า', 'น้ำมัน', 'เบรก', 'ตัวถัง']);

  for (const partNo of ['LIST-001', 'LIST-002']) {
    const created = await request.post('/api/v1/products', {
      headers: writeHeaders(),
      data: { partNo, name: `List item ${partNo}`, category: 'เบรก', price: '120.00' },
    });
    expect(created.status()).toBe(201);
  }

  const list = await request.get('/api/v1/products?search=list-00', { headers: authHeaders() });
  expect(list.status()).toBe(200);
  const body = await list.json();
  expect(body.status).toBe('success');
  expect((body.data as { partNo: string }[]).map((p) => p.partNo).sort()).toEqual(['LIST-001', 'LIST-002']);
  expect(body.meta).toBeDefined();
});

test('refuses the catalogue without a token', async ({ request }) => {
  expect((await request.get('/api/v1/products')).status()).toBe(401);
});
