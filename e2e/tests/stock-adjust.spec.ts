import { expect, test } from '@playwright/test';
import { authHeaders, writeHeaders } from './session';

// "Mark task done" in the lab sheet → a state change on an existing record: receive stock.
test('receives stock into a product and records it', async ({ request }) => {
  const created = await request.post('/api/v1/products', {
    headers: writeHeaders(),
    data: { partNo: 'OIL-10W40', name: 'Engine oil 10W-40', category: 'น้ำมัน', price: '280.00' },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.id as string;

  const received = await request.post(`/api/v1/products/${id}/adjust-stock`, {
    headers: writeHeaders(),
    data: { delta: 12, type: 'adjustment-in', note: 'e2e: received' },
  });
  expect(received.status()).toBe(201);
  expect((await received.json()).data.stockAfter).toBe(12);

  const sold = await request.post(`/api/v1/products/${id}/adjust-stock`, {
    headers: writeHeaders(),
    data: { delta: -5, type: 'adjustment-out' },
  });
  expect((await sold.json()).data.stockAfter).toBe(7);

  const read = await request.get(`/api/v1/products/${id}`, { headers: authHeaders() });
  expect((await read.json()).data.stock).toBe(7);
});

test('refuses an adjustment whose type contradicts its sign', async ({ request }) => {
  const created = await request.post('/api/v1/products', {
    headers: writeHeaders(),
    data: { partNo: 'SPARK-01', name: 'Spark plug', category: 'เครื่องยนต์' },
  });
  const id = (await created.json()).data.id as string;
  const res = await request.post(`/api/v1/products/${id}/adjust-stock`, {
    headers: writeHeaders(),
    data: { delta: -1, type: 'adjustment-in' },
  });
  expect(res.status()).toBe(400);
});
