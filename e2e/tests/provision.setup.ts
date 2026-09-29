import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { SESSION_FILE, type Session } from './session';

// The real onboarding path, not a fixture: platform admin creates a shop, the owner signs
// in with the one-time temporary password and must replace it before getting a session.
setup('provision a fresh shop and sign its owner in', async ({ request }) => {
  await expect
    .poll(async () => (await request.get('/health/ready')).status(), { timeout: 60_000 })
    .toBe(200);

  const admin = await request.post('/api/v1/platform/auth/token', {
    data: { username: 'e2e-admin', password: process.env.E2E_PLATFORM_PASSWORD },
  });
  expect(admin.status()).toBe(200);
  const adminToken = (await admin.json()).data.token as string;

  const tenantCode = `e2e${Date.now().toString(36)}`;
  const ownerUsername = `owner_${tenantCode}`;
  const tenant = await request.post('/api/v1/platform/tenants', {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      code: tenantCode,
      shopName: 'ร้านทดสอบ E2E',
      ownerUsername,
      ownerDisplayName: 'เจ้าของ E2E',
    },
  });
  expect(tenant.status()).toBe(201);
  const { tempPassword } = (await tenant.json()).data;

  const login = await request.post('/api/v1/auth/token', {
    data: { username: ownerUsername, password: tempPassword },
  });
  expect(login.status()).toBe(200);
  const first = (await login.json()).data;
  expect(first.passwordChangeRequired).toBe(true);
  expect(first.accessToken).toBeUndefined();

  const changed = await request.post('/api/v1/auth/change-password', {
    headers: { Authorization: `Bearer ${first.passwordChangeToken}` },
    data: { newPassword: `e2e owner passphrase ${tenantCode}` },
  });
  expect(changed.status()).toBe(200);

  const saved: Session = { accessToken: (await changed.json()).data.accessToken, tenantCode };
  expect(saved.accessToken).toBeTruthy();
  mkdirSync(dirname(SESSION_FILE), { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(saved));
});
