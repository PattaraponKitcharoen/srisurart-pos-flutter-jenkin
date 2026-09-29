import { expect, test } from '@playwright/test';
import { authHeaders, writeHeaders } from './session';

// "Create task" in the lab sheet → create a product, exactly once.
test('creates a product and a retried request does not create it twice', async ({ request }) => {
  const headers = writeHeaders();
  const data = { partNo: 'BRK-PAD-01', name: 'Brake pad (front)', nameTH: 'ผ้าเบรกหน้า', category: 'เบรก', price: '350.00', cost: '210.00' };

  const first = await request.post('/api/v1/products', { headers, data });
  expect(first.status()).toBe(201);
  const product = (await first.json()).data;
  expect(product).toMatchObject({ partNo: 'BRK-PAD-01', price: '350.00', stock: 0 });

  // Same Idempotency-Key = the client retrying after a timeout: same product back.
  const retry = await request.post('/api/v1/products', { headers, data });
  expect(retry.status()).toBe(201);
  expect((await retry.json()).data.id).toBe(product.id);

  const found = await request.get('/api/v1/products?search=brk-pad-01', { headers: authHeaders() });
  expect((await found.json()).data).toHaveLength(1);
});

test('rejects a product without a name', async ({ request }) => {
  const res = await request.post('/api/v1/products', { headers: writeHeaders(), data: { partNo: 'NO-NAME' } });
  expect(res.status()).toBe(400);
});
