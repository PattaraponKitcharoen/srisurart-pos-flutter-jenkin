import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Written by provision.setup.ts, read by every spec. */
export const SESSION_FILE = '.auth/session.json';

export interface Session {
  accessToken: string;
  tenantCode: string;
}

export function session(): Session {
  return JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as Session;
}

export function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${session().accessToken}` };
}

/** Writes on this API are idempotent by contract: the header is mandatory. */
export function writeHeaders(): Record<string, string> {
  return { ...authHeaders(), 'Idempotency-Key': randomUUID() };
}
