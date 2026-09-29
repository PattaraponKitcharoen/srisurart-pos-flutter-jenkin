// Lab 07 — prints the srisurart-app Secret with fresh random values: never the public
// dev-only placeholders from server/.env.example, so ALLOW_DEV_SECRETS stays unset here.
// usage: node deploy/k8s/make-secret.mjs | kubectl apply -f -
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const pw = () => randomBytes(18).toString('base64url');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const postgres = pw();
const posApp = pw();
const redis = pw();
const data = {
  POSTGRES_PASSWORD: postgres,
  POS_APP_PASSWORD: posApp,
  REDIS_PASSWORD: redis,
  DATABASE_URL: `postgres://pos_app:${posApp}@postgres:5432/pos`,
  MIGRATE_DATABASE_URL: `postgres://postgres:${postgres}@postgres:5432/pos`,
  REDIS_CACHE_URL: `redis://:${redis}@redis-cache:6379`,
  REDIS_QUEUE_URL: `redis://:${redis}@redis-queue:6379`,
  JWT_PLATFORM_SECRET: randomBytes(32).toString('hex'),
  JWT_PRIVATE_KEY: privateKey,
  JWT_PUBLIC_KEYS: publicKey,
};
const b64 = (s) => Buffer.from(s).toString('base64');
console.log(JSON.stringify({
  apiVersion: 'v1',
  kind: 'Secret',
  metadata: { name: 'srisurart-app', namespace: 'srisurart' },
  type: 'Opaque',
  data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, b64(v)])),
}));
